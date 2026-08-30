import { describe, expect, it } from "vitest";

import { LONGUEUR_CLE, chiffrer, dechiffrer } from "./chiffrement.js";
import { Coffre, NOM_DU_SCEAU } from "./coffre.js";
import { DepotEnMemoire } from "./depot.js";
import { ErreurDeCoffre, RAISONS_DE_COFFRE, estErreurDeCoffre } from "./erreurs.js";
import { JournalEnMemoire } from "./evenements.js";
import {
  depuisDeverrouillageManuel,
  depuisEnvironnement,
  VARIABLES_DE_CLE,
} from "./source-de-cle.js";

/**
 * LA GARDE QUI COMPTE LE PLUS DANS CE MODULE.
 *
 * § 15, première règle : « une erreur ne fuit JAMAIS un secret ni une donnée
 * personnelle ». Le coffre est le seul module du socle qui manipule exactement
 * ce qu'il ne doit pas dire — et le seul dont un message d'erreur bavard
 * annulerait tout le chiffrement.
 *
 * La garde balaie une BATTERIE d'échecs provoqués, plus tous les détails
 * d'événements d'un scénario complet, et cherche dans chaque texte le clair et
 * le matériau de clé sous leurs trois encodages. Elle annonce combien de textes
 * elle a lus — un balayage qui n'aurait rien lu serait vert.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Le scanner
// ─────────────────────────────────────────────────────────────────────────────

const CLAIR = "correcthorsebatterystaple-42-JETON-ZOHO-NE-JAMAIS-DIRE";
const OCTETS_DE_CLE = Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, 0x5a));

/**
 * Ce qui ne doit apparaître nulle part. Les TROIS encodages, parce qu'un
 * message construit à partir d'un tampon peut sortir en hexadécimal (`toString`
 * d'un `Buffer` journalisé), en base64 (une sérialisation JSON), ou en UTF-8
 * (une concaténation naïve).
 */
function matieresInterdites(): readonly string[] {
  const cle = Buffer.from(OCTETS_DE_CLE);
  const clair = Buffer.from(CLAIR, "utf8");
  return [
    CLAIR,
    clair.toString("base64"),
    clair.toString("hex"),
    cle.toString("base64"),
    cle.toString("hex"),
  ];
}

/** Les matières trouvées dans ce texte. Fonction PURE, donc testable à blanc. */
function fuitesDans(texte: string, matieres: readonly string[]): readonly string[] {
  return matieres.filter((matiere) => matiere.length > 0 && texte.includes(matiere));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le scanner mord
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/erreurs — le scanner de fuites", () => {
  it("rougit sur un témoin fabriqué qui cite le clair", () => {
    const temoin = `Impossible de déchiffrer la valeur « ${CLAIR} ».`;
    expect(fuitesDans(temoin, matieresInterdites())).toContain(CLAIR);
  });

  it("rougit sur un témoin fabriqué qui cite la clé en hexadécimal", () => {
    const hex = Buffer.from(OCTETS_DE_CLE).toString("hex");
    const temoin = `Clé courante : ${hex}`;
    expect(fuitesDans(temoin, matieresInterdites())).toContain(hex);
  });

  it("ne rougit pas sur un texte innocent — sinon la garde serait rouge partout", () => {
    const innocent =
      "Le secret « zoho.refresh_token » version 2 ne s'ouvre pas avec la clé « k-2026-08 ».";
    expect(fuitesDans(innocent, matieresInterdites())).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — la batterie d'échecs provoqués
// ─────────────────────────────────────────────────────────────────────────────

/** Provoque un échec et rend son message, ou `null` si rien n'a levé. */
async function messageDeLEchec(appel: () => unknown): Promise<string | null> {
  try {
    await appel();
    return null;
  } catch (erreur) {
    return erreur instanceof Error ? erreur.message : String(erreur);
  }
}

describe("core/vault/erreurs — aucune sortie en erreur ne fuit le secret", () => {
  it("balaie la batterie, et n'y trouve aucune matière interdite", async () => {
    const depot = new DepotEnMemoire();
    const journal = new JournalEnMemoire();
    const source = depuisDeverrouillageManuel();
    source.poser(Buffer.from(OCTETS_DE_CLE).toString("base64"), "k-temoin");

    const coffre = await Coffre.ouvrir({ depot, source, journal, plafondBootstrap: 1 });
    await coffre.provisionner();
    await coffre.ecrire("zoho.refresh_token", 1, Buffer.from(CLAIR, "utf8"));
    await coffre.compterUnAmorcage("zoho.refresh_token", 1);

    const enveloppe = chiffrer({
      keyId: "k-temoin",
      cle: OCTETS_DE_CLE,
      nom: "zoho.refresh_token",
      version: 1,
      clair: Buffer.from(CLAIR, "utf8"),
    });

    const echecs: ReadonlyArray<readonly [string, () => unknown]> = [
      [
        "mauvaise clé",
        () =>
          dechiffrer({
            cle: Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, 0x77)),
            nom: "zoho.refresh_token",
            version: 1,
            enveloppe,
          }),
      ],
      [
        "mauvais AAD",
        () => dechiffrer({ cle: OCTETS_DE_CLE, nom: "autre.nom", version: 1, enveloppe }),
      ],
      [
        "clé de mauvaise longueur",
        () =>
          chiffrer({
            keyId: "k",
            cle: OCTETS_DE_CLE.slice(0, 16),
            nom: "n",
            version: 1,
            clair: Buffer.from(CLAIR, "utf8"),
          }),
      ],
      ["nom réservé en écriture", () => coffre.ecrire(NOM_DU_SCEAU, 1, Buffer.from(CLAIR))],
      ["nom réservé en lecture", () => coffre.lire(NOM_DU_SCEAU)],
      ["secret introuvable", () => coffre.lire("jamais.ecrit")],
      ["plafond d'amorçage", () => coffre.compterUnAmorcage("zoho.refresh_token", 1)],
      ["geste interdit", () => coffre.provisionner()],
      [
        "clé mal encodée à la source",
        () => depuisEnvironnement({ [VARIABLES_DE_CLE.cle]: CLAIR }).fournir(),
      ],
      [
        "coffre verrouillé",
        async () => {
          coffre.verrouiller();
          try {
            return await coffre.lire("zoho.refresh_token");
          } finally {
            await coffre.deverrouiller();
          }
        },
      ],
    ];

    const matieres = matieresInterdites();
    const textes: string[] = [];

    for (const [libelle, provoquer] of echecs) {
      const message = await messageDeLEchec(provoquer);
      expect(message, `« ${libelle} » n'a pas levé`).not.toBeNull();
      if (message !== null) {
        textes.push(message);
        expect(fuitesDans(message, matieres), libelle).toEqual([]);
      }
    }

    // Les détails d'événements passent par le même tamis : ils partent en
    // alerte Telegram (§ 24), donc hors de la machine.
    for (const evenement of journal.tous) {
      textes.push(evenement.detail);
      expect(fuitesDans(evenement.detail, matieres), evenement.nom).toEqual([]);
    }

    console.info(
      `[garde fuite] ${String(textes.length)} textes balayés ` +
        `(${String(echecs.length)} messages d'erreur + ${String(journal.tous.length)} détails ` +
        `d'événements), contre ${String(matieres.length)} matières interdites`,
    );

    // Planchers-témoins : dix échecs provoqués, au moins quatre événements, et
    // cinq encodages cherchés. Un balayage qui n'aurait rien lu serait vert.
    expect(echecs.length).toBe(10);
    expect(textes.length).toBeGreaterThanOrEqual(14);
    expect(matieres.length).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — l'union des raisons est fermée et exploitable
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/erreurs — les raisons", () => {
  it("n'a ni doublon ni valeur mal formée", () => {
    const vues = new Set<string>();
    const anomalies: string[] = [];

    for (const raison of RAISONS_DE_COFFRE) {
      if (vues.has(raison)) {
        anomalies.push(`« ${raison} » en double`);
      }
      if (raison.trim() !== raison || raison.length === 0) {
        anomalies.push(`« ${raison} » mal formée`);
      }
      vues.add(raison);
    }

    console.info(`[garde raisons] ${String(RAISONS_DE_COFFRE.length)} raisons mesurées`);

    expect(anomalies).toEqual([]);
    expect(RAISONS_DE_COFFRE.length).toBe(12);
  });

  it("se reconnaît dans un `catch`, où le type est inconnu", () => {
    const erreur: unknown = new ErreurDeCoffre("coffre_verrouille", "message");
    expect(estErreurDeCoffre(erreur)).toBe(true);
    expect(estErreurDeCoffre(new Error("autre"))).toBe(false);
    expect(estErreurDeCoffre(null)).toBe(false);
  });

  it("porte le détail dans un champ, pas seulement dans le texte", () => {
    // Un appelant qui devrait faire `message.includes("verrouillé")` aurait une
    // garde qui casse à la première reformulation du message.
    const erreur = new ErreurDeCoffre("keyid_inconnu", "peu importe", {
      nom: "zoho.refresh_token",
      version: 2,
      keyId: "k-2026-05",
    });

    expect(erreur.raison).toBe("keyid_inconnu");
    expect(erreur.detail.keyId).toBe("k-2026-05");
    expect(erreur.name).toBe("ErreurDeCoffre");
  });
});

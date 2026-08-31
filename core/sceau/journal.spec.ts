import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { calculerSelfHash, messageDeLigne, verifierChaine } from "../audit/index.js";
import {
  CLE_DE_TEMOIN,
  SCELLEUR_TEMOIN,
  construireJournal,
  contenuTemoin,
} from "../audit/fixtures.js";
import type { LigneAudit } from "../audit/index.js";
import { JournalMemoire } from "../audit/memoire.js";
import { Journal } from "../audit/journal.js";
import { HorlogeFigee } from "../audit/fixtures.js";

import {
  DOMAINE_SCEAU_JOURNAL,
  ErreurCleSceauJournal,
  LONGUEUR_MINIMALE_CLE,
  LONGUEUR_SCEAU,
  creerScelleurJournal,
  messageDuSceau,
  scelleurDepuisCoffre,
} from "./journal.js";

/**
 * Gardes de l'ADR 0002, seconde moitié : LA CHAÎNE EST SCELLÉE.
 *
 * ═══ CE QUE CES GARDES DOIVENT PROUVER ═══
 *
 * Le lot 1 a mesuré le défaut : « tout compte disposant d'UPDATE/DELETE peut
 * retirer une tranche PUIS RECALCULER toute la chaîne ; `verifierChaine` rend
 * alors `valide = true` sur un journal amputé ». La garde décisive n'est donc
 * pas « le HMAC est bien un HMAC » — c'est **l'attaque reproduite** : on ampute
 * un journal, on recalcule la chaîne SANS la clé, et on vérifie que la
 * vérification refuse. Le même témoin, joué AVEC la clé, réussit — sans quoi on
 * ne saurait pas si le rouge vient du scellement ou de l'amputation.
 */

/** Une clé de la bonne longueur, différente de celle des témoins. */
const CLE_DE_LATTAQUANT = "cle-de-lattaquant-qui-ne-vaut-rien-du-tout";

/** Le SHA-256 nu d'avant l'ADR 0002 — ce que l'attaquant sait recalculer. */
function selfHashNaguere(prevHash: string | null, ligne: LigneAudit): string {
  return createHash("sha256").update(messageDeLigne(prevHash, ligne), "utf8").digest("hex");
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — pas de clé, pas de chaîne : FAIL-LOUD
// ─────────────────────────────────────────────────────────────────────────────

describe("core/sceau — aucun repli, jamais", () => {
  it("refuse une clé absente, vide, ou faite d'espaces", () => {
    const temoins: ReadonlyArray<readonly [string, string | null | undefined]> = [
      ["absente", undefined],
      ["nulle", null],
      ["vide", ""],
      ["espaces", "     "],
    ];

    let mesures = 0;
    for (const [nom, valeur] of temoins) {
      expect(() => creerScelleurJournal(valeur), nom).toThrow(ErreurCleSceauJournal);
      mesures += 1;
    }

    console.info(`[garde clé absente] ${String(mesures)} témoins éprouvés`);
    expect(mesures).toBe(4);
  });

  it("refuse une clé trop courte, et DIT la longueur attendue", () => {
    // Une clé de repli connue produirait des empreintes valides mais PUBLIQUES :
    // quiconque lit ce dépôt — il est public — pourrait alors forger la chaîne.
    const courte = "a".repeat(LONGUEUR_MINIMALE_CLE - 1);
    expect(() => creerScelleurJournal(courte)).toThrow(ErreurCleSceauJournal);
    expect(() => creerScelleurJournal(courte)).toThrow(new RegExp(String(LONGUEUR_MINIMALE_CLE)));
    // Et la longueur minimale, elle, passe : la borne est bien à cet endroit.
    expect(() => creerScelleurJournal("a".repeat(LONGUEUR_MINIMALE_CLE))).not.toThrow();
  });

  it("lève AUSSI quand le coffre ne rend rien — le port ne rattrape pas", async () => {
    await expect(
      scelleurDepuisCoffre({ lireCleSceauJournal: () => Promise.resolve(null) }),
    ).rejects.toBeInstanceOf(ErreurCleSceauJournal);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — le sceau dépend de la clé, et il le prouve
// ─────────────────────────────────────────────────────────────────────────────

describe("core/sceau — deux clés, deux chaînes", () => {
  it("rend une empreinte de la bonne forme, et la même pour la même entrée", () => {
    const sceau = SCELLEUR_TEMOIN.sceller("message-témoin");
    expect(sceau).toHaveLength(LONGUEUR_SCEAU);
    expect(sceau).toMatch(/^[0-9a-f]+$/);
    expect(SCELLEUR_TEMOIN.sceller("message-témoin")).toBe(sceau);
  });

  it("rend une empreinte DIFFÉRENTE sous une autre clé — le HMAC dépend d'elle", () => {
    // Le témoin qui prouve que la clé entre réellement dans le calcul. Sans
    // lui, un scellement qui ignorerait sa clé passerait tous les autres tests.
    const autre = creerScelleurJournal(CLE_DE_LATTAQUANT);
    expect(autre.sceller("message-témoin")).not.toBe(SCELLEUR_TEMOIN.sceller("message-témoin"));
  });

  it("n'est PAS le SHA nu du message — c'est tout l'objet de l'ADR 0002", () => {
    const message = "message-témoin";
    const nu = createHash("sha256").update(message, "utf8").digest("hex");
    expect(SCELLEUR_TEMOIN.sceller(message)).not.toBe(nu);
  });

  it("sépare son domaine, et le message scellé ne porte aucun secret", () => {
    const message = messageDuSceau("charge").toString("utf8");
    console.info(`[garde domaine] message cadré de ${String(message.length)} caractères`);
    expect(message).toContain(DOMAINE_SCEAU_JOURNAL);
    expect(message).not.toContain(CLE_DE_TEMOIN);
  });

  it("cadre les morceaux : deux découpages différents ne se confondent pas", () => {
    // Sans préfixe de longueur, `"ab" + "c"` et `"a" + "bc"` produiraient le
    // même message. La séparation de domaine ne tiendrait alors que par la
    // promesse qu'aucun message ne contient le séparateur.
    expect(messageDuSceau("ab").toString("utf8")).not.toBe(messageDuSceau("a b").toString("utf8"));
    expect(SCELLEUR_TEMOIN.sceller("ab")).not.toBe(SCELLEUR_TEMOIN.sceller("a b"));
  });

  it("compare à temps constant, et refuse deux longueurs différentes", () => {
    const sceau = SCELLEUR_TEMOIN.sceller("x");
    expect(SCELLEUR_TEMOIN.correspond(sceau, sceau)).toBe(true);
    expect(SCELLEUR_TEMOIN.correspond(sceau, sceau.slice(0, -1))).toBe(false);
    expect(SCELLEUR_TEMOIN.correspond(sceau, `${sceau.slice(0, -1)}0`)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — L'ATTAQUE DU LOT 1, REJOUÉE
// ─────────────────────────────────────────────────────────────────────────────

describe("ADR 0002 — un attaquant qui obtient l'écriture ne peut plus recalculer", () => {
  /**
   * Ampute un journal de ses `retirees` premières lignes, PUIS rechaîne le
   * reste — exactement le geste que le lot 1 a mesuré comme indétectable.
   *
   * @param sceller ce dont l'attaquant dispose pour recalculer.
   */
  function amputerEtRecalculer(
    lignes: readonly LigneAudit[],
    retirees: number,
    sceller: (prevHash: string | null, ligne: LigneAudit) => string,
  ): readonly LigneAudit[] {
    const restantes = lignes.slice(retirees);
    const refaites: LigneAudit[] = [];
    let prevHash: string | null = null;
    for (const ligne of restantes) {
      const rechainee: LigneAudit = { ...ligne, prevHash, selfHash: "" };
      const selfHash = sceller(prevHash, rechainee);
      refaites.push({ ...rechainee, selfHash });
      prevHash = selfHash;
    }
    return refaites;
  }

  it("LE TÉMOIN NÉGATIF — avec la clé, le rechaînage passerait (donc le rouge vient bien du sceau)", async () => {
    const store = await construireJournal(6);
    const lignes = store.toutes();

    // L'attaquant IMAGINAIRE qui posséderait la clé : son journal amputé se
    // vérifie. Sans ce témoin, le rouge du test suivant pourrait venir de
    // l'amputation elle-même, et non de l'absence de clé — on mesurerait la
    // mauvaise chose.
    const avecCle = amputerEtRecalculer(lignes, 3, (prev, ligne) =>
      calculerSelfHash(SCELLEUR_TEMOIN, prev, ligne),
    );
    const rapport = verifierChaine(SCELLEUR_TEMOIN, avecCle);

    console.info(
      `[témoin négatif] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `valide : ${String(rapport.valide)}`,
    );

    expect(rapport.lignesVerifiees).toBe(3);
    expect(rapport.valide).toBe(true);
  });

  it("REFUSE le journal amputé puis recalculé au SHA NU — le défaut du lot 1", async () => {
    const store = await construireJournal(6);
    const lignes = store.toutes();

    // C'est le geste EXACT du rapport : « retirer une tranche PUIS recalculer
    // toute la chaîne ». Avant l'ADR 0002, un SHA nu suffisait, et
    // `verifierChaine` rendait `valide = true`.
    const falsifie = amputerEtRecalculer(lignes, 3, selfHashNaguere);
    const rapport = verifierChaine(SCELLEUR_TEMOIN, falsifie);

    console.info(
      `[attaque SHA nu] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `${String(rapport.anomalies.length)} anomalie(s) : ` +
        rapport.anomalies.map((a) => a.genre).join(", "),
    );

    expect(rapport.lignesVerifiees).toBe(3);
    expect(rapport.valide).toBe(false);
    expect(rapport.anomalies.map((a) => a.genre)).toContain("empreinte-recalculée");
  });

  it("REFUSE le journal amputé puis recalculé avec une AUTRE clé", async () => {
    const store = await construireJournal(6);
    const attaquant = creerScelleurJournal(CLE_DE_LATTAQUANT);

    const falsifie = amputerEtRecalculer(store.toutes(), 3, (prev, ligne) =>
      calculerSelfHash(attaquant, prev, ligne),
    );
    const rapport = verifierChaine(SCELLEUR_TEMOIN, falsifie);

    console.info(
      `[attaque autre clé] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `valide : ${String(rapport.valide)}`,
    );

    expect(rapport.valide).toBe(false);
  });

  it("REFUSE un journal entier scellé avec une autre clé — jusqu'à la première ligne", async () => {
    // Le cas du journal reconstruit de zéro par un attaquant qui aurait
    // l'écriture mais pas la clé.
    const store = new JournalMemoire();
    const attaquant = creerScelleurJournal(CLE_DE_LATTAQUANT);
    const journalHostile = new Journal(attaquant, store, new HorlogeFigee());
    for (let rang = 0; rang < 4; rang += 1) {
      await journalHostile.journaliser(contenuTemoin(rang));
    }

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(
      `[journal hostile] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );

    // Plancher-témoin : la vérification a bien REGARDÉ quatre lignes. Un
    // rapport rouge sur zéro ligne vérifiée ne prouverait rien.
    expect(rapport.lignesVerifiees).toBe(4);
    expect(rapport.valide).toBe(false);
    expect(rapport.anomalies.filter((a) => a.genre === "empreinte-recalculée")).toHaveLength(4);
  });

  it("laisse VALIDE un journal scellé avec la bonne clé — la garde n'est pas rouge par principe", async () => {
    const store = await construireJournal(5);
    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(`[journal sain] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s)`);

    expect(rapport.lignesVerifiees).toBe(5);
    expect(rapport.valide).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { EFFECTS, type Effect } from "../types.js";
import { estEffetExterieur } from "../policy/effet.js";
import { creerCalculArgHash, type CoffreArgHash } from "./arg-hash.js";
import { DepotIdempotenceEnMemoire } from "./memoire.js";
import {
  FORME_CLE_IDEMPOTENCE,
  MODES_IDEMPOTENCE,
  STATUTS_IDEMPOTENCE,
  cloturer,
  empreinteDeCleDIdempotence,
  formeAttendueDeCle,
  formeDeCleValide,
  issueDeReservation,
  reserver,
  type DepotIdempotence,
  type LigneIdempotence,
  type ModeIdempotence,
} from "./idempotency.js";

/**
 * Gardes de `core/limits/` — l'idempotence (§ 11 étape 13, § 12).
 */

const MAINTENANT = new Date("2026-08-30T14:03:25.000Z");
const TTL_MS = 24 * 3_600_000;

const CLE_DE_TEST = "cle-de-test-0123456789abcdef0123456789ab";

const coffre: CoffreArgHash = {
  lireCleArgHash(): Promise<string> {
    return Promise.resolve(CLE_DE_TEST);
  },
};

/** On n'emploie que `correspond` : la comparaison à temps constant, la vraie. */
const calcul = creerCalculArgHash(coffre);

/** La clé QUE LE CLIENT CHOISIT. Elle n'est jamais ce que le dépôt conserve. */
const CLE_CLIENT = "cle-client-1";

/**
 * CE QUE `ops_idempotency.key` PORTE — l'EMPREINTE, jamais la clé (ADR 0020).
 *
 * ⚠️ CETTE LIGNE EST UNE PREUVE DE COUTURE, PAS UNE COMMODITÉ DE FIXTURE. Les
 *    gardes ci-dessous pré-posent des lignes que `reserver()` doit RETROUVER.
 *    Tant que le dépôt était indexé par la chaîne d'origine, `key: CLE_CLIENT`
 *    suffisait ; il ne suffit plus, et six gardes l'ont dit en rougissant. Une
 *    fixture qui aurait recopié un SHA-256 écrit à la main ne l'aurait pas dit :
 *    elle aurait cessé de mesurer le chemin du socle.
 */
const EMPREINTE_CLIENT = empreinteDeCleDIdempotence(CLE_CLIENT);

function ligne(
  partiel: Partial<LigneIdempotence> & { readonly argHash: string },
): LigneIdempotence {
  return {
    tool: "zoho.mail.send",
    key: EMPREINTE_CLIENT,
    status: "done",
    resultRef: "ref-du-resultat",
    completedAt: MAINTENANT,
    expiresAt: new Date(MAINTENANT.getTime() + TTL_MS),
    ...partiel,
  };
}

function demande(
  depot: DepotIdempotence,
  argHash: string,
  mode: ModeIdempotence = "key",
  key: string | null = CLE_CLIENT,
): Parameters<typeof reserver>[0] {
  return {
    depot,
    calcul,
    tool: "zoho.mail.send",
    mode,
    key,
    argHash,
    ttlMs: TTL_MS,
    maintenant: MAINTENANT,
  };
}

const ARG_A = "a".repeat(64);
const ARG_B = "b".repeat(64);

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le vocabulaire est DÉRIVÉ du schéma, pas recopié
// ─────────────────────────────────────────────────────────────────────────────

/** Extrait les valeurs d'une énumération d'un `schema.prisma`. */
function extraireEnum(source: string, nom: string): readonly string[] {
  const entete = `enum ${nom} {`;
  const debut = source.indexOf(entete);
  if (debut < 0) return [];
  const fin = source.indexOf("\n}", debut);
  if (fin < 0) return [];
  return source
    .slice(debut + entete.length, fin)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("/") && !l.startsWith("@"))
    .map((l) => l.split(/\s+/)[0] ?? "")
    .filter((v) => v.length > 0);
}

/** Extrait le corps d'un modèle d'un `schema.prisma`. */
function extraireModele(source: string, nom: string): string {
  const entete = `model ${nom} {`;
  const debut = source.indexOf(entete);
  if (debut < 0) return "";
  const fin = source.indexOf("\n}", debut);
  if (fin < 0) return "";
  return source.slice(debut + entete.length, fin);
}

describe("core/limits — le vocabulaire vient du schéma", () => {
  const chemin = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));
  // Lecture NON protégée : si le fichier a déménagé, la garde doit tomber
  // bruyamment plutôt que mesurer zéro élément en restant verte.
  const schema = readFileSync(chemin, "utf8");

  it("rougit sur un témoin fabriqué à qui il manque une valeur", () => {
    const temoin = "enum IdempotencyStatus {\n  in_flight\n  done\n}\n";
    const valeurs = extraireEnum(temoin, "IdempotencyStatus");
    expect(valeurs).toEqual(["in_flight", "done"]);
    expect(valeurs).not.toEqual([...STATUTS_IDEMPOTENCE]);
  });

  it("rougit sur un témoin fabriqué dont l'énumération n'existe pas", () => {
    expect(extraireEnum("model X {\n  a Int\n}", "IdempotencyStatus")).toEqual([]);
  });

  it("dérive les trois statuts du `schema.prisma` réel, et ils correspondent", () => {
    const valeurs = extraireEnum(schema, "IdempotencyStatus");

    console.info(
      `[garde statuts] ${String(valeurs.length)} valeurs dérivées de ${chemin.split(/[\\/]/).slice(-2).join("/")}`,
    );

    // Plancher-témoin : trois statuts au § 12. Zéro valeur dérivée voudrait
    // dire que l'extraction ne regarde plus rien.
    expect(valeurs).toHaveLength(3);
    expect(valeurs).toEqual([...STATUTS_IDEMPOTENCE]);
  });

  it("vérifie que `ops_idempotency` a bien (tool, key) POUR CLÉ PRIMAIRE", () => {
    const modele = extraireModele(schema, "OpsIdempotency");
    console.info(`[garde clé primaire] ${String(modele.split("\n").length)} lignes de modèle lues`);
    expect(modele.length).toBeGreaterThan(0);
    expect(modele).toMatch(/@@id\(\[tool,\s*key\]\)/);
  });

  it("vérifie que `ops_quota` porte son DÉNOMINATEUR et son seuil d'alerte", () => {
    // § 12 : « un compteur sans dénominateur ne peut ni refuser ni alerter à
    // 80 % ». Si l'une des deux colonnes disparaissait du schéma, tout ce
    // module continuerait de compiler et ne refuserait plus jamais rien.
    const modele = extraireModele(schema, "OpsQuota");
    const temoinSansSeuil = "model OpsQuota {\n  count Int\n  limit Int\n}";

    const colonnes: ReadonlyArray<readonly [string, RegExp]> = [
      ["limit", /^\s*limit\s+Int/m],
      ["warnAt", /^\s*warnAt\s+Int/m],
      ["count", /^\s*count\s+Int/m],
    ];

    let mesures = 0;
    for (const [nom, motif] of colonnes) {
      expect(modele, nom).toMatch(motif);
      mesures += 1;
    }

    console.info(`[garde dénominateur en base] ${String(mesures)} colonnes mesurées`);
    expect(mesures).toBe(3);
    // Le témoin prouve que la garde sait dire NON.
    expect(temoinSansSeuil).not.toMatch(/^\s*warnAt\s+Int/m);
    expect(modele).toMatch(/@@unique\(\[window,\s*tool,\s*principal\]\)/);
  });

  it("énumère les trois modes d'idempotence du § 09", () => {
    console.info(`[garde modes] ${String(MODES_IDEMPOTENCE.length)} modes mesurés`);
    expect([...MODES_IDEMPOTENCE]).toEqual(["key", "non-rejouable", "n/a"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — c'est l'INSERTION qui verrouille
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — étape 13, l'insertion verrouille", () => {
  it("tente l'insertion AVANT toute lecture", async () => {
    // § 11 : « (tool, key) INSÉRÉ en in_flight, argHash comparé ». Une lecture
    // préalable suivie d'une insertion laisse deux appels concurrents s'insérer
    // tous deux : la clé primaire en refuse un, mais seulement si on la laisse
    // trancher.
    const depot = new DepotIdempotenceEnMemoire();
    const verdict = await reserver(demande(depot, ARG_A));

    console.info(`[garde ordre] appels au dépôt : ${depot.appels.join(" → ")}`);

    expect(depot.appels[0]).toBe("insererSiAbsente");
    expect(verdict.type).toBe("reservee");
  });

  it("ne touche PAS au dépôt quand l'outil ne déduplique pas (`n/a`)", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    const verdict = await reserver(demande(depot, ARG_A, "n/a"));

    console.info(`[garde n/a] ${String(depot.appels.length)} appel(s) au dépôt mesuré(s)`);

    expect(verdict.type).toBe("sans-objet");
    expect(depot.appels).toEqual([]);
  });

  it("exige la clé dans l'EN-TÊTE de l'appel, jamais dans `input`", async () => {
    // ⚠️ CE TÉMOIN A ÉTÉ SCINDÉ — ADR 0020. Il éprouvait trois « formes
    //    d'absence » (`null`, `""`, `"   "`) sous un seul refus. La borne de
    //    forme en a fait deux familles qui ne se réparent PAS du même geste :
    //    une clé ABSENTE se répare en en fournissant une, une clé MAL FORMÉE en
    //    en changeant. Les confondre ferait dire au message d'erreur une chose
    //    et à l'appelant une autre — c'est la seconde règle du § 15.
    const depot = new DepotIdempotenceEnMemoire();
    let mesures = 0;
    for (const cle of [null, ""]) {
      const verdict = await reserver(demande(depot, ARG_A, "key", cle));
      expect(verdict.type).toBe("refus");
      if (verdict.type !== "refus") throw new Error("inatteignable");
      expect(verdict.code).toBe("invalid_input");
      expect(verdict.detail).toContain("AppelEntrant.idempotencyKey");
      mesures += 1;
    }

    console.info(`[garde clé absente] ${String(mesures)} forme(s) d'absence mesurée(s)`);
    expect(mesures).toBe(2);
    expect(depot.appels).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 bis — LA FORME DE LA CLÉ EST FERMÉE (ADR 0020, garde G3)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — la forme de la clé d'idempotence est FERMÉE", () => {
  /**
   * ⚠️ AUCUN SECRET RÉEL, ET CHAQUE TÉMOIN ISOLE UNE SEULE RÈGLE. Un témoin qui
   *    serait à la fois trop long ET accentué ne dirait pas laquelle des deux
   *    bornes a mordu : on n'en apprendrait rien le jour où l'une tomberait.
   */
  const ADMISES: readonly { readonly libelle: string; readonly cle: string }[] = [
    { libelle: "UUID v4", cle: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" },
    { libelle: "ULID", cle: "01ARZ3NDEKTSV4RRFFQ69G5FAV" },
    {
      libelle: "Message-Id sans chevrons",
      cle: "CAF-1a2b3c.4d5e@exemple.invalid".replace("@", ":"),
    },
    { libelle: "identifiant de commande", cle: "cmd_2026-08-31.000142" },
    { libelle: "au plancher exact", cle: "a".repeat(FORME_CLE_IDEMPOTENCE.longueurMin) },
    { libelle: "au plafond exact", cle: "b".repeat(FORME_CLE_IDEMPOTENCE.longueurMax) },
  ];

  const REFUSEES: readonly { readonly libelle: string; readonly cle: string }[] = [
    { libelle: "une phrase (espaces)", cle: "Le rendez-vous du 12 est reporte" },
    { libelle: "un accent", cle: "cle-reportee-a-mardi-prochain-é" },
    { libelle: "un retour à la ligne", cle: "cle-1\ncle-2-injectee-ici" },
    { libelle: "sous le plancher", cle: "a".repeat(FORME_CLE_IDEMPOTENCE.longueurMin - 1) },
    { libelle: "au-delà du plafond", cle: "b".repeat(FORME_CLE_IDEMPOTENCE.longueurMax + 1) },
    { libelle: "une ponctuation de phrase", cle: "cle,valeur;autre" },
  ];

  it("admet ce qu'un identifiant emploie, refuse ce qu'une phrase emploie", () => {
    let eprouvees = 0;
    const admisesRefusees: string[] = [];
    const refuseesAdmises: string[] = [];

    for (const temoin of ADMISES) {
      eprouvees += 1;
      if (!formeDeCleValide(temoin.cle)) admisesRefusees.push(temoin.libelle);
    }
    for (const temoin of REFUSEES) {
      eprouvees += 1;
      if (formeDeCleValide(temoin.cle)) refuseesAdmises.push(temoin.libelle);
    }

    console.info(
      `[garde forme de clé] ${String(eprouvees)} clé(s)-témoin(s) éprouvée(s) — ` +
        `${String(ADMISES.length)} attendue(s) admise(s), ` +
        `${String(REFUSEES.length)} attendue(s) refusée(s) · ` +
        `${String(admisesRefusees.length + refuseesAdmises.length)} désaccord(s) : ` +
        `${[...admisesRefusees, ...refuseesAdmises].join(", ") || "aucun"} · ` +
        `bornes : ${String(FORME_CLE_IDEMPOTENCE.longueurMin)}..` +
        `${String(FORME_CLE_IDEMPOTENCE.longueurMax)}`,
    );

    // PLANCHER-TÉMOIN : deux tableaux vides passeraient sans rien mesurer.
    expect(eprouvees).toBe(ADMISES.length + REFUSEES.length);
    expect(ADMISES.length).toBeGreaterThan(0);
    expect(REFUSEES.length).toBeGreaterThan(0);

    expect(admisesRefusees, "aucun identifiant licite n'est refusé").toEqual([]);
    expect(refuseesAdmises, "aucune prose ne passe la borne").toEqual([]);
  });

  it("refuse AVANT le tri par mode — un outil `n/a` n'est pas une porte ouverte", async () => {
    // ⚠️ L'ORDRE EST LA DÉCISION. Placée après le tri, la borne laisserait un
    //    outil qui ne déduplique pas accepter n'importe quelle chaîne. Cette
    //    garde éprouve LES DEUX modes sur la MÊME clé : sans l'ordre, le premier
    //    rendrait « sans-objet ».
    let modesEprouves = 0;
    const passesEnSilence: string[] = [];

    for (const mode of MODES_IDEMPOTENCE) {
      const depot = new DepotIdempotenceEnMemoire();
      const verdict = await reserver(demande(depot, ARG_A, mode, "cle avec une phrase dedans"));
      modesEprouves += 1;
      if (verdict.type !== "refus") passesEnSilence.push(mode);
    }

    console.info(
      `[garde forme avant le tri] ${String(modesEprouves)} mode(s) d'idempotence éprouvé(s) ` +
        `(dérivés de MODES_IDEMPOTENCE) · ` +
        `${String(passesEnSilence.length)} passé(s) en silence : ` +
        `${passesEnSilence.join(", ") || "aucun"}`,
    );

    expect(modesEprouves).toBe(MODES_IDEMPOTENCE.length);
    expect(modesEprouves).toBeGreaterThan(1);
    expect(passesEnSilence, "aucun mode ne laisse passer une clé mal formée").toEqual([]);
  });

  it("ne RECOPIE JAMAIS la clé refusée dans son message", async () => {
    // ⚠️ LE REFUS SERAIT DEVENU LE CANAL. Une clé refusée PARCE QU'ELLE PORTE DE
    //    LA PROSE est exactement celle qu'un message d'erreur ne doit pas
    //    relayer : le § 15 exige qu'une erreur dise quoi faire ensuite, jamais
    //    qu'elle répète ce qu'on lui a donné.
    const PROSE = "Le rendez-vous du 12 est reporte, dossier chez le notaire";
    const depot = new DepotIdempotenceEnMemoire();
    const verdict = await reserver(demande(depot, ARG_A, "key", PROSE));
    if (verdict.type !== "refus") throw new Error("inatteignable");

    const fragments = PROSE.split(" ").filter((mot) => mot.length >= 5);
    let fragmentsCherches = 0;
    let fragmentsTrouves = 0;
    for (const fragment of fragments) {
      fragmentsCherches += 1;
      if (verdict.detail.includes(fragment)) fragmentsTrouves += 1;
    }

    console.info(
      `[garde refus sans écho] ${String(fragmentsCherches)} fragment(s) de la clé cherché(s) ` +
        `dans le message · ${String(fragmentsTrouves)} retrouvé(s) · ` +
        `${String(verdict.detail.length)} caractère(s) de message · code ${verdict.code}`,
    );

    // PLANCHER-TÉMOIN : sans fragments, « zéro retrouvé » ne dirait rien.
    expect(fragmentsCherches).toBeGreaterThan(3);
    expect(verdict.code).toBe("invalid_input");
    expect(fragmentsTrouves, "§ 15 — le refus ne relaie pas ce qu'on lui a donné").toBe(0);
    expect(verdict.detail, "et il dit la forme attendue").toContain(formeAttendueDeCle());
    expect(depot.appels, "rien n'a atteint le dépôt").toEqual([]);
  });

  it("écrit l'EMPREINTE au dépôt, jamais la clé — et l'empreinte est celle du socle", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    const verdict = await reserver(demande(depot, ARG_A, "key", CLE_CLIENT));
    if (verdict.type !== "reservee") throw new Error("inatteignable");

    const attendue = empreinteDeCleDIdempotence(CLE_CLIENT);

    console.info(
      `[garde empreinte au dépôt] clé écrite : ${verdict.ligne.key.slice(0, 12)}… ` +
        `(${String(verdict.ligne.key.length)} caractère(s)) · ` +
        `égale à la clé choisie : ${String(verdict.ligne.key === CLE_CLIENT)} · ` +
        `égale à l'empreinte du socle : ${String(verdict.ligne.key === attendue)}`,
    );

    expect(verdict.ligne.key).not.toBe(CLE_CLIENT);
    expect(verdict.ligne.key).toBe(attendue);
    expect(verdict.ligne.key).toMatch(/^[0-9a-f]{64}$/);
    // `null` n'est pas une chaîne vide : l'absence se distingue de l'empreinte.
    expect(empreinteDeCleDIdempotence(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 ter — `issueDeReservation` est une TOTALITÉ (ADR 0021, garde G2)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — l'issue d'une réservation se dérive du CLIQUET", () => {
  /**
   * ⚠️ LE PRODUIT EST DÉRIVÉ D'`EFFECTS`, JAMAIS ÉCRIT `2 × 2 × 4`. Ajouter un
   *    effet au § 09 fait monter le compte annoncé le jour même — et ne pas le
   *    classer dans le `switch` de `issueDeReservation` est une erreur de
   *    COMPILATION, pas un faux vert.
   *
   * ⚠️ ET L'ATTENDU N'EST PAS UNE SECONDE TABLE. Il se recalcule par la règle en
   *    prose de l'ADR 0021, en APPELANT `estEffetExterieur` — la même totalité
   *    que la fonction mesurée. Une table de vingt-quatre lignes écrite à la main
   *    serait une seconde dérivation du même fait, et deux dérivations d'un même
   *    fait finissent par se contredire.
   */
  function attenduParLaRegle(faits: {
    readonly effetExterieurSurvenu: boolean;
    readonly terminaisonRendue: boolean;
    readonly effetDeclare: Effect;
  }): "done" | "failed" {
    if (faits.effetExterieurSurvenu) return "done";
    if (faits.terminaisonRendue) return "done";
    return estEffetExterieur(faits.effetDeclare) ? "done" : "failed";
  }

  it("répond sur TOUT le produit `EFFECTS` × cliquet × terminaison, sans désaccord", () => {
    let combinaisons = 0;
    let fermeesEnDone = 0;
    let reprenablesEnFailed = 0;
    const desaccords: string[] = [];

    for (const effetDeclare of EFFECTS) {
      for (const effetExterieurSurvenu of [false, true]) {
        for (const terminaisonRendue of [false, true]) {
          const faits = { effetExterieurSurvenu, terminaisonRendue, effetDeclare };
          const obtenu = issueDeReservation(faits);
          const attendu = attenduParLaRegle(faits);
          combinaisons += 1;
          if (obtenu === "done") fermeesEnDone += 1;
          else reprenablesEnFailed += 1;
          if (obtenu !== attendu) {
            desaccords.push(
              `${effetDeclare}/cliquet=${String(effetExterieurSurvenu)}/` +
                `rendue=${String(terminaisonRendue)} : ${obtenu} ≠ ${attendu}`,
            );
          }
        }
      }
    }

    console.info(
      `[garde issue · totalité] ${String(combinaisons)} combinaison(s) confrontée(s) ` +
        `(dérivées d'EFFECTS : ${String(EFFECTS.length)} × 2 × 2) · ` +
        `${String(fermeesEnDone)} fermée(s) en « done », ` +
        `${String(reprenablesEnFailed)} reprenable(s) en « failed » · ` +
        `${String(desaccords.length)} désaccord(s) : ${desaccords.join(" | ") || "aucun"}`,
    );

    expect(combinaisons).toBe(EFFECTS.length * 4);
    expect(desaccords).toEqual([]);
    // PLANCHERS-TÉMOINS : une fonction qui rendrait toujours le même mot
    // passerait la confrontation ci-dessus si l'attendu suivait la même panne.
    expect(fermeesEnDone, "au moins une combinaison FERME la clé").toBeGreaterThan(0);
    expect(reprenablesEnFailed, "et au moins une la laisse reprenable").toBeGreaterThan(0);
  });

  it("FERME la clé quand le cliquet est levé, quel que soit l'effet déclaré", () => {
    // LE DÉFAUT, EN UNE LIGNE : un envoi PARTI dont l'aval lève. Le cliquet est
    // levé, l'étape 14 n'a PAS rendu. L'ancienne dérivation rendait « failed ».
    let effetsEprouves = 0;
    const reprenables: string[] = [];
    for (const effetDeclare of EFFECTS) {
      effetsEprouves += 1;
      const issue = issueDeReservation({
        effetExterieurSurvenu: true,
        terminaisonRendue: false,
        effetDeclare,
      });
      if (issue !== "done") reprenables.push(effetDeclare);
    }

    console.info(
      `[garde cliquet levé] ${String(effetsEprouves)} effet(s) éprouvé(s) · ` +
        `${String(reprenables.length)} laissant la clé REPRENABLE : ` +
        `${reprenables.join(", ") || "aucun"}`,
    );

    expect(effetsEprouves).toBe(EFFECTS.length);
    expect(effetsEprouves).toBeGreaterThan(1);
    expect(reprenables, "quelque chose est sorti : rejouer produirait un SECOND effet").toEqual([]);
  });

  it("se replie FERMÉ sur une levée, et seulement pour un effet EXTÉRIEUR", () => {
    // La troisième branche, celle qui solde la « conséquence acceptée n° 1 » de
    // l'ADR 0017. Le partage n'est pas écrit ici : il est DEMANDÉ à
    // `estEffetExterieur`, la totalité du § 20.
    let effetsEprouves = 0;
    let fermes = 0;
    let reprenables = 0;
    const desaccords: string[] = [];

    for (const effetDeclare of EFFECTS) {
      effetsEprouves += 1;
      const issue = issueDeReservation({
        effetExterieurSurvenu: false,
        terminaisonRendue: false,
        effetDeclare,
      });
      if (issue === "done") fermes += 1;
      else reprenables += 1;
      if ((issue === "done") !== estEffetExterieur(effetDeclare)) {
        desaccords.push(`${effetDeclare} : ${issue}`);
      }
    }

    console.info(
      `[garde fail-closed sur levée] ${String(effetsEprouves)} effet(s) éprouvé(s) · ` +
        `${String(fermes)} fermé(s) en « done », ${String(reprenables)} repris en « failed » · ` +
        `${String(desaccords.length)} désaccord(s) avec estEffetExterieur : ` +
        `${desaccords.join(", ") || "aucun"}`,
    );

    expect(effetsEprouves).toBe(EFFECTS.length);
    expect(fermes, "au moins un effet est extérieur").toBeGreaterThan(0);
    expect(reprenables, "et au moins un ne l'est pas : la reprise reste possible").toBeGreaterThan(
      0,
    );
    expect(desaccords, "le partage est CELUI du § 20, jamais un second").toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — LA règle : même clé, autre argument ⇒ invalid_input
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — une clé réutilisée avec un autre argument", () => {
  it("rend `invalid_input` QUEL QUE SOIT le statut de la ligne existante", async () => {
    // Le piège que cette garde isole : brancher sur le statut AVANT de comparer
    // l'argHash. Avec cet ordre inversé, un statut `done` servirait le résultat
    // de l'autre appel — « pas l'autre résultat en silence » (§ 12).
    // Les statuts sont DÉRIVÉS de `STATUTS_IDEMPOTENCE` : en ajouter un le fait
    // mesurer ici.
    let mesures = 0;
    for (const statut of STATUTS_IDEMPOTENCE) {
      const depot = new DepotIdempotenceEnMemoire();
      depot.poser(ligne({ argHash: ARG_A, status: statut }));

      const verdict = await reserver(demande(depot, ARG_B));

      expect(verdict.type, statut).toBe("refus");
      if (verdict.type !== "refus") throw new Error("inatteignable");
      expect(verdict.code, statut).toBe("invalid_input");
      expect(verdict.detail, statut).toContain("ARGUMENT DIFFÉRENT");
      mesures += 1;
    }

    console.info(`[garde argHash] ${String(mesures)} statuts mesurés`);
    expect(mesures).toBe(3);
    expect(mesures).toBe(STATUTS_IDEMPOTENCE.length);
  });

  it("sert le résultat mémorisé quand l'argument est LE MÊME", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "done", resultRef: "ref-42" }));

    const verdict = await reserver(demande(depot, ARG_A));

    expect(verdict.type).toBe("rejeu");
    if (verdict.type !== "rejeu") throw new Error("inatteignable");
    expect(verdict.resultRef).toBe("ref-42");
  });

  it("laisse la clé LIBRE une fois le TTL passé, même pour un autre argument", async () => {
    // La borne de la règle : « même clé, autre argument = invalid_input » ne
    // vaut que DANS la fenêtre du TTL. Au-delà, la ligne est morte.
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(
      ligne({
        argHash: ARG_A,
        status: "done",
        expiresAt: new Date(MAINTENANT.getTime() - 1),
      }),
    );

    const verdict = await reserver(demande(depot, ARG_B));

    console.info(`[garde TTL] appels au dépôt : ${depot.appels.join(" → ")}`);
    expect(verdict.type).toBe("reservee");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — ce que dit chaque statut, à argument identique
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — le statut décide, une fois l'argument reconnu", () => {
  it("rend `conflict` sur un appel identique EN COURS", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "in_flight", completedAt: null, resultRef: null }));

    const verdict = await reserver(demande(depot, ARG_A));

    expect(verdict.type).toBe("refus");
    if (verdict.type !== "refus") throw new Error("inatteignable");
    expect(verdict.code).toBe("conflict");
  });

  it("REPREND une réservation `failed` — un échec ne doit pas condamner la clé", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "failed", resultRef: null }));

    const verdict = await reserver(demande(depot, ARG_A));

    expect(verdict.type).toBe("reservee");
    expect(depot.appels).toContain("reprendreSiEchouee");
  });

  it("refuse de re-servir un outil `non-rejouable` déjà exécuté", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "done", resultRef: "ref-42" }));

    const verdict = await reserver(demande(depot, ARG_A, "non-rejouable"));

    expect(verdict.type).toBe("refus");
    if (verdict.type !== "refus") throw new Error("inatteignable");
    expect(verdict.code).toBe("conflict");
    expect(verdict.detail).toContain("non rejouable");
  });

  it("clôt la réservation, et le rejeu suivant sert alors le résultat", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    const premiere = await reserver(demande(depot, ARG_A));
    expect(premiere.type).toBe("reservee");

    const close = await cloturer({
      depot,
      reservation: premiere,
      issue: "done",
      resultRef: "ref-99",
      maintenant: MAINTENANT,
    });
    expect(close).toBe(true);

    const seconde = await reserver(demande(depot, ARG_A));
    expect(seconde.type).toBe("rejeu");
    if (seconde.type !== "rejeu") throw new Error("inatteignable");
    expect(seconde.resultRef).toBe("ref-99");
  });

  it("ne clôt rien quand rien n'a été réservé", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    const close = await cloturer({
      depot,
      reservation: { type: "sans-objet" },
      issue: "done",
      resultRef: null,
      maintenant: MAINTENANT,
    });
    expect(close).toBe(false);
    expect(depot.appels).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  APPEL_STEPS,
  DATA_CLASSES,
  ERROR_CODES,
  EFFECTS,
  OPS_SCOPES,
  POLICY_LEVELS,
  etapeParNumero,
  lePlusStrict,
  marqueLaSession,
  type EtapeAppel,
} from "./types.js";

/**
 * Gardes de la Fondation sur `core/types.ts`.
 *
 * ═══ LE MOTIF QUE LES SIX CONSTRUCTEURS DOIVENT COPIER ═══
 *
 * Une garde qui ne peut pas échouer n'existe pas. Ici, chaque garde :
 *
 *  (a) est une FONCTION PURE appliquée d'abord à un TÉMOIN FABRIQUÉ défectueux
 *      — on prouve qu'elle rougit — PUIS à la vraie donnée ;
 *  (b) ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS, et échoue sous un
 *      plancher-témoin. Une garde qui compte zéro élément est verte pour la
 *      pire des raisons.
 *
 * Sans (a), on ne sait pas si le vert vient de la conformité ou de l'aveuglement.
 * Sans (b), un fichier déplacé rend la garde muette sans un mot.
 */

/** Ce que renvoie une garde : le verdict ET le nombre d'éléments mesurés. */
interface Verdict {
  readonly mesures: number;
  readonly anomalies: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la numérotation des étapes est contiguë et sans doublon
// ─────────────────────────────────────────────────────────────────────────────

/**
 * § 11 — `ops_audit.stepDenied` porte LE NUMÉRO de l'étape qui a refusé. Un
 * trou ou un doublon dans la numérotation rend cette colonne indéchiffrable :
 * on ne saurait plus quelle étape le socle a refusée.
 *
 * ⚠️ LE PREMIER NUMÉRO N'EST PLUS ÉCRIT ICI, IL EST LU. L'étape 0 (« coffre »,
 *    § 23) a été ajoutée au lot 1b devant les quatorze du § 11 : une garde qui
 *    exigeait `index + 1` aurait alors rougi pour la mauvaise raison — non pas
 *    parce que la numérotation est trouée, mais parce qu'elle commence ailleurs.
 *    Ce qui doit être garanti est la CONTIGUÏTÉ, pas le point de départ ; c'est
 *    elle, et elle seule, qui rend `stepDenied` lisible. Le point de départ est
 *    donc dérivé de la première entrée.
 */
function verifierNumerotation(etapes: readonly EtapeAppel[]): Verdict {
  const anomalies: string[] = [];
  const numerosVus = new Set<number>();
  const clesVues = new Set<string>();
  const premier = etapes[0]?.numero ?? 0;

  etapes.forEach((etape, index) => {
    const attendu = premier + index;
    if (etape.numero !== attendu) {
      anomalies.push(`position ${String(index)} porte le numéro ${String(etape.numero)}`);
    }
    if (numerosVus.has(etape.numero)) {
      anomalies.push(`numéro ${String(etape.numero)} en double`);
    }
    if (clesVues.has(etape.cle)) {
      anomalies.push(`clé « ${etape.cle} » en double`);
    }
    numerosVus.add(etape.numero);
    clesVues.add(etape.cle);
  });

  return { mesures: etapes.length, anomalies };
}

describe("core/types — la chaîne d'appel du § 11", () => {
  it("rougit sur un témoin fabriqué dont la numérotation a un trou", () => {
    const temoin: readonly EtapeAppel[] = [
      { numero: 1, cle: "a", libelle: "a", refus: null, statutHttp: 403, httpSeul: true },
      // Trou volontaire : 3 au lieu de 2.
      { numero: 3, cle: "b", libelle: "b", refus: null, statutHttp: 401, httpSeul: true },
    ];

    const verdict = verifierNumerotation(temoin);

    expect(verdict.mesures).toBe(2);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("rougit sur un témoin fabriqué dont deux étapes partagent une clé", () => {
    const temoin: readonly EtapeAppel[] = [
      { numero: 1, cle: "quota", libelle: "a", refus: null, statutHttp: null, httpSeul: false },
      { numero: 2, cle: "quota", libelle: "b", refus: null, statutHttp: null, httpSeul: false },
    ];

    expect(verifierNumerotation(temoin).anomalies).not.toHaveLength(0);
  });

  it("compte les quatorze étapes du § 11 PLUS l'étape 0, sans trou ni doublon", () => {
    const verdict = verifierNumerotation(APPEL_STEPS);

    console.info(`[garde numérotation] ${String(verdict.mesures)} étapes mesurées`);

    // Plancher-témoin : le § 11 en nomme quatorze, et le lot 1b y a ajouté
    // l'étape 0 du § 23. Zéro étape mesurée serait vert sans rien regarder.
    expect(verdict.mesures).toBe(15);
    expect(verdict.anomalies).toEqual([]);
    // Le point de départ est vérifié ICI, une fois — pas dans la fonction, qui
    // ne doit garantir que la contiguïté.
    expect(APPEL_STEPS[0]?.numero).toBe(0);
    expect(APPEL_STEPS[APPEL_STEPS.length - 1]?.numero).toBe(14);
  });

  it("fait de l'étape 0 le refus « coffre verrouillé » du § 23, AVANT tout le reste", () => {
    // ÉCART DU CDC, tranché au lot 1b (ADR 0005) : le § 23 exige que tout appel
    // d'outil soit refusé coffre verrouillé, et ce refus n'est aucune des
    // quatorze étapes — il les PRÉCÈDE. Sans numéro, `ops_audit.stepDenied`
    // reste nul et la ligne devient indiscernable d'une exception.
    const coffre = APPEL_STEPS.find((etape) => etape.cle === "coffre");

    expect(coffre).toBeDefined();
    expect(coffre?.numero).toBe(0);
    // Elle précède TOUTES les autres — dérivé, pas recopié.
    const autres = APPEL_STEPS.filter((etape) => etape.cle !== "coffre");
    console.info(`[garde étape 0] ${String(autres.length)} étapes confrontées à l'étape 0`);
    expect(autres.length).toBe(14);
    expect(autres.every((etape) => etape.numero > (coffre?.numero ?? -1))).toBe(true);
    // Son code est celui que `core/vault` rend déjà, et il est du § 15 élargi.
    expect(coffre?.refus).toBe("vault_locked");
    expect(ERROR_CODES).toContain(coffre?.refus);
    // Elle s'applique à TOUS les transports : un coffre fermé l'est en stdio.
    expect(coffre?.httpSeul).toBe(false);
  });

  it("retrouve chaque étape par son numéro, et aucune hors de 0..14", () => {
    let retrouvees = 0;
    for (const etape of APPEL_STEPS) {
      expect(etapeParNumero(etape.numero)).toBe(etape);
      retrouvees += 1;
    }

    console.info(`[garde etapeParNumero] ${String(retrouvees)} étapes retrouvées`);

    expect(retrouvees).toBe(APPEL_STEPS.length);
    // ⚠️ `0` est désormais une étape RÉELLE : la borne basse est -1.
    expect(etapeParNumero(-1)).toBeUndefined();
    expect(etapeParNumero(15)).toBeUndefined();
  });

  it("place le schéma AVANT le quota — sinon un appel malformé brûle du quota", () => {
    // § 11, deuxième règle sous le tableau : « le schéma avant le quota. Un
    // appel malformé ne consomme rien. L'ordre inverse produit une boucle :
    // le quota brûle, le 429 dit quand réessayer, le modèle attend et rejoue
    // le même appel invalide. » La v5 avait ces deux étapes dans le mauvais
    // ordre — c'est exactement ce que cette garde interdit de refaire.
    const schema = APPEL_STEPS.find((etape) => etape.cle === "schema");
    const quota = APPEL_STEPS.find((etape) => etape.cle === "quota");

    expect(schema).toBeDefined();
    expect(quota).toBeDefined();
    expect(schema?.numero).toBeLessThan(quota?.numero ?? -1);
  });

  it("n'attribue à une étape qu'un code d'erreur du § 15 — liste DÉRIVÉE", () => {
    // Aucune liste écrite à la main : l'ensemble de référence est `ERROR_CODES`
    // lui-même. Ajouter une étape portant un code inventé fait rougir ceci.
    const connus = new Set<string>(ERROR_CODES);
    const portantUnCode = APPEL_STEPS.filter((etape) => etape.refus !== null);
    const inconnus = portantUnCode.filter((etape) => !connus.has(etape.refus as string));

    console.info(
      `[garde codes d'étape] ${String(portantUnCode.length)} étapes porteuses d'un code, ` +
        `sur ${String(APPEL_STEPS.length)} mesurées`,
    );

    // Plancher-témoin : le § 11 en nomme neuf, et l'étape 0 du § 23 en porte
    // une dixième. Si ce compte tombe à zéro, la garde ne regarde plus rien.
    expect(portantUnCode.length).toBeGreaterThanOrEqual(10);
    expect(inconnus.map((etape) => etape.cle)).toEqual([]);
  });

  it("réserve « HTTP seul » aux quatre premières étapes du § 11", () => {
    const httpSeul = APPEL_STEPS.filter((etape) => etape.httpSeul);

    console.info(`[garde transport] ${String(httpSeul.length)} étapes « HTTP seul » mesurées`);

    expect(httpSeul.map((etape) => etape.numero)).toEqual([1, 2, 3, 4]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — les énumérations fermées n'ont ni doublon ni trou
// ─────────────────────────────────────────────────────────────────────────────

function verifierEnumeration(valeurs: readonly string[]): Verdict {
  const anomalies: string[] = [];
  const vues = new Set<string>();
  for (const valeur of valeurs) {
    if (vues.has(valeur)) {
      anomalies.push(`valeur « ${valeur} » en double`);
    }
    if (valeur.trim() !== valeur || valeur.length === 0) {
      anomalies.push(`valeur « ${valeur} » mal formée`);
    }
    vues.add(valeur);
  }
  return { mesures: valeurs.length, anomalies };
}

describe("core/types — les énumérations fermées", () => {
  it("rougit sur un témoin fabriqué portant un doublon", () => {
    const verdict = verifierEnumeration(["read", "send", "read"]);
    expect(verdict.mesures).toBe(3);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("mesure les cinq énumérations du socle, et aucune n'est vide", () => {
    // Dérivé : chaque entrée porte son plancher-témoin, tiré du § du CDC qui
    // l'énumère. Un plancher à 0 laisserait passer une énumération vidée.
    const attendus: ReadonlyArray<readonly [string, readonly string[], number]> = [
      ["EFFECTS (§ 09)", EFFECTS, 4],
      ["DATA_CLASSES (§ 09)", DATA_CLASSES, 4],
      ["POLICY_LEVELS (§ 20)", POLICY_LEVELS, 3],
      ["OPS_SCOPES (§ 19.2)", OPS_SCOPES, 5],
      // 13 au § 15, PLUS `vault_locked` — écart du § 23 tranché au lot 1b
      // (ADR 0005) — PLUS `scope_insufficient`, écart du § 11 / § 15 tranché au
      // lot 1c. Le plancher porte le compte réel, pas celui du tableau du CDC :
      // c'est ici, dans l'ADR et dans `ops/codes-hors-tableau.ts` — qui refuse
      // désormais tout code ajouté SANS motif écrit — que l'écart se lit.
      ["ERROR_CODES (§ 15 + vault_locked + scope_insufficient)", ERROR_CODES, 15],
    ];

    let total = 0;
    for (const [nom, valeurs, plancher] of attendus) {
      const verdict = verifierEnumeration(valeurs);
      console.info(`[garde énumération] ${nom} : ${String(verdict.mesures)} valeurs mesurées`);
      expect(verdict.anomalies, nom).toEqual([]);
      expect(verdict.mesures, nom).toBe(plancher);
      total += verdict.mesures;
    }

    console.info(`[garde énumération] ${String(total)} valeurs mesurées au total`);
    expect(total).toBe(31);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — « le niveau appliqué est le PLUS STRICT » (§ 12, règle 1)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/types — la politique se calcule, elle ne se lit pas", () => {
  it("choisit toujours le plus strict, sur les neuf paires possibles", () => {
    // Neuf paires, pas une liste écrite à la main : le produit cartésien de
    // POLICY_LEVELS par lui-même. Ajouter un niveau élargit la mesure sans
    // qu'aucune liste ne soit à retoucher.
    let paires = 0;
    for (const a of POLICY_LEVELS) {
      for (const b of POLICY_LEVELS) {
        const choisi = lePlusStrict(a, b);
        const rangA = POLICY_LEVELS.indexOf(a);
        const rangB = POLICY_LEVELS.indexOf(b);
        expect(POLICY_LEVELS.indexOf(choisi)).toBe(Math.min(rangA, rangB));
        paires += 1;
      }
    }

    console.info(`[garde politique] ${String(paires)} paires de niveaux mesurées`);
    expect(paires).toBe(POLICY_LEVELS.length ** 2);
    expect(paires).toBeGreaterThanOrEqual(9);
  });

  it("fait de « brouillon » le niveau de repli — fail-closed du § 20", () => {
    expect(POLICY_LEVELS[0]).toBe("brouillon");
    expect(lePlusStrict("libre", "brouillon")).toBe("brouillon");
    expect(lePlusStrict("confirmé", "libre")).toBe("confirmé");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — marquage de provenance (§ 20, cinquième règle)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/types — quelles classes marquent la session", () => {
  it("marque « personal » et « sensitive », et elles seules", () => {
    const marquantes = DATA_CLASSES.filter(marqueLaSession);

    console.info(`[garde provenance] ${String(DATA_CLASSES.length)} classes mesurées`);

    expect(DATA_CLASSES.length).toBe(4);
    expect(marquantes).toEqual(["personal", "sensitive"]);
  });
});

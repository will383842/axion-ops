/**
 * `core/audit/marge-des-gardes.spec.ts` — **LE CONTRÔLE DE MARGE, ÉPROUVÉ SUR
 * DES TÉMOINS FABRIQUÉS. ADR 0040, § 3.**
 *
 * ═══ POURQUOI CETTE GARDE VIT ICI ═══
 *
 * Ce qu'elle éprouve — `plafond-de-test.config.ts` — est à la RACINE, sous le
 * motif `*.config.ts` qui le sort du périmètre livré. Or `vitest.config.ts`
 * n'inclut que `core/`, `adapters/`, `console/`, `voice/` et `ops/` : une garde
 * posée à côté de son sujet ne serait **jamais exécutée**. Elle est donc sous
 * `core/audit/`, le pôle de ce qui MESURE et ATTESTE, et l'écart de localisation
 * est écrit ici plutôt que sous-entendu.
 *
 * ⚠️ **UN CONTRÔLE QUI NE SAIT PAS DIRE NON SERAIT VERT POUR LA MÊME RAISON QUE
 *    LA MARGE QU'IL SURVEILLE.** Les témoins sont donc FABRIQUÉS, jamais
 *    attendus : un rapport porté à 60 % du plafond doit faire rougir, un rapport
 *    à 49 % doit passer, et un rapport VIDE doit annoncer son zéro. Les trois,
 *    sans quoi la garde serait satisfaite par une fonction qui refuse tout, par
 *    une fonction qui n'accepte rien, ou par une fonction qui ne regarde rien.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PART_MAXIMALE_DU_PLAFOND,
  PLAFOND_DE_TEST_MS,
  PLUS_LONGS_ANNONCES,
  alerteDeDepassement,
  annonceDeMarge,
  seuilDAlerteMs,
  verdictDeMarge,
} from "../../plafond-de-test.config.js";
import type { DureeMesuree } from "../../plafond-de-test.config.js";

/** Une durée FABRIQUÉE, exprimée en part du plafond — jamais en millisecondes recopiées. */
function aLaPart(nom: string, part: number): DureeMesuree {
  return { nom, dureeMs: PLAFOND_DE_TEST_MS * part };
}

describe("ADR 0040 — le contrôle de marge ANNONCE son dénominateur et sait dire non", () => {
  it("rougit sur un témoin FABRIQUÉ porté à 60 % du plafond", () => {
    const mesures: readonly DureeMesuree[] = [
      aLaPart("une garde qui balaie le dépôt", 0.6),
      aLaPart("une garde ordinaire", 0.05),
      aLaPart("un test unitaire", 0.001),
    ];
    const verdict = verdictDeMarge(mesures);

    console.info(annonceDeMarge(verdict, "témoin à 60 %"));

    expect(verdict.testsMesures).toBe(mesures.length);
    expect(verdict.depassements).toHaveLength(1);
    expect(verdict.depassements[0]?.nom).toBe("une garde qui balaie le dépôt");
    // La marge annoncée est celle du PIRE cas, pas une moyenne : une moyenne
    // noierait la garde coûteuse dans les 1 400 tests qui ne coûtent rien.
    expect(Math.round(verdict.marge * 100)).toBe(60);
  });

  it("TÉMOIN INVERSE — un témoin à 49 % passe, sinon la garde refuserait tout", () => {
    const mesures: readonly DureeMesuree[] = [aLaPart("juste sous le seuil", 0.49)];
    const verdict = verdictDeMarge(mesures);

    console.info(annonceDeMarge(verdict, "témoin à 49 %"));

    expect(verdict.testsMesures).toBe(1);
    expect(verdict.depassements).toEqual([]);
  });

  it("ANNONCE son zéro quand rien n'a été mesuré — un contrôle vacuous le DIT", () => {
    const verdict = verdictDeMarge([]);

    console.info(annonceDeMarge(verdict, "témoin vide"));

    expect(verdict.testsMesures).toBe(0);
    expect(verdict.marge).toBe(0);
    expect(verdict.plusLongs).toEqual([]);
    // Et l'annonce porte le dénominateur : c'est ce qui distingue « rien à
    // signaler » de « rien regardé ».
    expect(annonceDeMarge(verdict, "témoin vide")).toContain("0 test(s) mesuré(s)");
  });

  it("LIT le plafond au lieu de le recopier — changer le plafond change la marge", () => {
    // La MÊME durée, jugée sous deux plafonds. Si le seuil était recopié quelque
    // part, l'un des deux verdicts resterait juste par accident.
    const duree: DureeMesuree = { nom: "une garde de 9 s", dureeMs: 9_000 };
    const sousLePlafondPose = verdictDeMarge([duree], PLAFOND_DE_TEST_MS);
    const sousUnPlafondDe10s = verdictDeMarge([duree], 10_000);

    console.info(
      `[ADR 0040 · lecture du plafond] 1 durée confrontée à 2 plafonds · ` +
        `${String(PLAFOND_DE_TEST_MS)} ms → ${String(sousLePlafondPose.depassements.length)} ` +
        `dépassement(s), marge ${String(Math.round(sousLePlafondPose.marge * 100))} % · ` +
        `10000 ms → ${String(sousUnPlafondDe10s.depassements.length)} dépassement(s), ` +
        `marge ${String(Math.round(sousUnPlafondDe10s.marge * 100))} %`,
    );

    expect(sousLePlafondPose.depassements).toEqual([]);
    expect(sousUnPlafondDe10s.depassements).toHaveLength(1);
    expect(sousUnPlafondDe10s.seuilMs).toBe(5_000);
  });

  it("porte les deux nombres de l'ADR, et le seuil en est DÉRIVÉ", () => {
    console.info(
      `[ADR 0040 · réglage] plafond ${String(PLAFOND_DE_TEST_MS)} ms · ` +
        `part ${String(PART_MAXIMALE_DU_PLAFOND)} · seuil ${String(seuilDAlerteMs())} ms · ` +
        `${String(PLUS_LONGS_ANNONCES)} durée(s) nommée(s) par verdict`,
    );

    // La part est STRICTEMENT sous 1 : à 100 %, l'alerte et la falaise seraient
    // le même instant, et le signal arriverait quand il est trop tard.
    expect(PART_MAXIMALE_DU_PLAFOND).toBeGreaterThan(0);
    expect(PART_MAXIMALE_DU_PLAFOND).toBeLessThan(1);
    expect(seuilDAlerteMs()).toBe(PLAFOND_DE_TEST_MS * PART_MAXIMALE_DU_PLAFOND);
    // Et le plafond laisse de la place au pire cas MESURÉ de l'arbre du lot
    // (10 738 ms) : un plafond sous cette valeur ferait rougir une garde juste.
    expect(PLAFOND_DE_TEST_MS).toBeGreaterThan(10_738);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'ARMEMENT — CE QUI FAIT RÉELLEMENT ROUGIR UN TEST, ET IL N'ÉTAIT GARDÉ PAR
//  RIEN
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **LE DÉFAUT QUE CES TROIS TÉMOINS FERMENT A ÉTÉ MESURÉ, PAS SUPPOSÉ.**
 *    `marge-des-gardes.config.ts` écrivait le seuil une SECONDE fois, sous la
 *    forme `if (dureeMs > seuilMs)`, et c'était CETTE écriture-là — la non
 *    gardée — qui faisait rougir les tests du dépôt. La mutation qui la neutralise
 *    (`> PLAFOND_DE_TEST_MS`, une condition qui ne peut plus jamais tirer puisque
 *    vitest tue le test AU plafond avant l'`afterEach`) a survécu à la suite
 *    complète : `Tests 1489 passed | 31 expected fail (1520)`, zéro fichier rouge.
 *
 * ⚠️ **DEUX D'ENTRE EUX ÉPROUVENT LA FONCTION, LE TROISIÈME ÉPROUVE QUE
 *    L'ARMEMENT S'EN SERT.** Sans le troisième, l'armement pourrait reprendre sa
 *    propre comparaison demain sans que rien ne rougisse — c'est exactement le
 *    mode d'échec d'origine.
 */
describe("ADR 0040 · § 3 — l'ARMEMENT dérive du même verdict, et il n'écrit plus le seuil", () => {
  it("rougit sur une durée FABRIQUÉE à 60 % du plafond, et le message porte les nombres", () => {
    const alerte = alerteDeDepassement(aLaPart("une garde qui balaie le dépôt", 0.6));

    expect(alerte).not.toBeNull();
    // Le message NOMME le test fautif, sa durée et le seuil : un rapport qui
    // nommerait un fichier laisserait à chercher lequel de ses tests coûte.
    expect(alerte).toContain("une garde qui balaie le dépôt");
    expect(alerte).toContain(String(Math.round(seuilDAlerteMs())));
    expect(alerte).toContain(String(PLAFOND_DE_TEST_MS));
  });

  it("TÉMOIN INVERSE — une durée à 49 % ne lève rien, sinon l'armement refuserait tout", () => {
    expect(alerteDeDepassement(aLaPart("juste sous le seuil", 0.49))).toBeNull();
    // Et il LIT le plafond : la même durée sous un plafond deux fois plus bas
    // franchit le seuil. Une valeur recopiée resterait juste jusqu'au jour où
    // le plafond change.
    expect(
      alerteDeDepassement(aLaPart("juste sous le seuil", 0.49), PLAFOND_DE_TEST_MS / 2),
    ).not.toBeNull();
  });

  it("LIT le fichier d'amorce et ANNONCE ses comptes : 1 appel au verdict, 0 comparaison propre", () => {
    const chemin = fileURLToPath(new URL("../../marge-des-gardes.config.ts", import.meta.url));
    const source = readFileSync(chemin, "utf8");

    // ⚠️ **LA PROSE EST RETIRÉE AVANT LA MESURE, ET C'EST INDISPENSABLE.** Le
    //    fichier d'amorce EXPLIQUE le défaut fermé en citant la comparaison
    //    qu'il n'écrit plus ; un motif appliqué au texte brut compterait ce
    //    commentaire pour du code, et la garde rougirait sur une explication.
    const code = source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");

    // ⚠️ **LE MOTIF EST CE QU'UNE SECONDE ÉCRITURE DU SEUIL RESSEMBLERAIT** : une
    //    durée comparée à un nombre, quel que soit le nom qu'on lui donne. Il est
    //    volontairement LARGE — un motif qui ne chercherait que `> seuilMs`
    //    laisserait passer `>= seuilMs`, `> plafondMs`, `> SEUIL`.
    const comparaisons = code.match(/\bdureeMs\s*[<>]=?/gu) ?? [];
    const appels = code.match(/\balerteDeDepassement\s*\(/gu) ?? [];

    console.info(
      `[ADR 0040 · armement] ${String(source.split("\n").length)} ligne(s) lue(s) dans ` +
        `« marge-des-gardes.config.ts » · ${String(source.length - code.length)} caractère(s) ` +
        `de prose retiré(s) · ${String(appels.length)} appel(s) à ` +
        `\`alerteDeDepassement\` · ${String(comparaisons.length)} comparaison(s) propre(s) ` +
        `de \`dureeMs\` [${comparaisons.join(", ") || "aucune"}]`,
    );

    // L'instrument a vu quelque chose : sans ceci, un chemin faux rendrait une
    // chaîne vide, zéro comparaison, et cette garde serait verte en ne lisant rien.
    expect(source.length).toBeGreaterThan(1_000);
    expect(code).toContain("afterEach");
    // L'armement DÉRIVE : il appelle le verdict, et n'écrit aucune comparaison.
    expect(appels).toHaveLength(1);
    expect(comparaisons).toEqual([]);
  });
});

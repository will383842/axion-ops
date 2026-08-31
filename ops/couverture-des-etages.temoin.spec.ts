import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { verifierLaCouvertureDesEtages } from "./demarrage.js";
import { CLES_DES_ETAGES, ETAGES_DU_DEMARRAGE } from "./demarrage/etages.js";
import {
  DECIDEURS_NON_APPELES_DIRECTEMENT,
  ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR,
} from "./main.js";

/**
 * **ADR 0023 — LA RACINE, CONFRONTÉE À L'ÉCHELLE.**
 *
 * L'ADR 0023 exige quatre choses de cette garde, et elles sont ici dans l'ordre :
 *
 *  1. **chaque étage a un exécutant** — un étage déclaré et sauté est le
 *     contournement exact qu'elle ferme ;
 *  2. **l'ordre est respecté** — un étage déplacé est une anomalie même si tous
 *     sont présents : c'est l'ordre qui porte la sûreté ;
 *  3. **elle annonce ses comptes** — étages confrontés, symboles cherchés,
 *     appels trouvés. Une garde qui lirait une racine vide serait verte sans un
 *     mot, et c'est le premier test ci-dessous qui l'en empêche ;
 *  4. **elle a un témoin fabriqué** — une racine à laquelle on retire un appel
 *     doit produire exactement une anomalie, nommant l'étage.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** C'est une lecture de TEXTE, pas
 *    d'AST : elle répond à « quel fichier écrit ce nom », pas à « quel chemin
 *    d'exécution l'atteint ». Un appel derrière un drapeau jamais vrai lui
 *    échapperait. Même borne que `verifierLeCablageDuDemarrage`, qui l'écrit
 *    déjà pour `demarrerPolitique`.
 */

const CHEMIN_DE_LA_RACINE = fileURLToPath(new URL("./main.ts", import.meta.url));

function racineReelle(): string {
  return readFileSync(CHEMIN_DE_LA_RACINE, "utf8");
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LA RACINE RÉELLE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0023 · ① la racine de composition, confrontée à l'échelle", () => {
  it("annonce ses comptes, étage par étage, et ne trouve AUCUNE anomalie", () => {
    const source = racineReelle();
    const couverture = verifierLaCouvertureDesEtages(
      source,
      ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR,
    );

    for (const cle of CLES_DES_ETAGES) {
      const decideurs = couverture.decideurs.filter((decideur) => decideur.cle === cle);
      console.info(
        `[① · étage ${String(ETAGES_DU_DEMARRAGE[cle].rang)}] ${cle} → ` +
          decideurs
            .map((decideur) => `${decideur.symbole} : ${decideur.appele ? "APPELÉ" : "absent"}`)
            .join(" · "),
      );
    }

    console.info(
      `[① · totaux] ${String(couverture.octetsLus)} octet(s) de racine lus · ` +
        `${String(couverture.etagesConfrontes)} étage(s) confronté(s) · ` +
        `${String(couverture.symbolesCherches)} symbole(s) cherché(s) · ` +
        `${String(couverture.appelsTrouves)} appel(s) trouvé(s) · ` +
        `ordre lu : [${couverture.ordreLu.join(" > ")}] · ` +
        `${String(couverture.etagesSansExecutant.length)} étage(s) sans exécutant ` +
        `[${couverture.etagesSansExecutant.join(", ") || "aucun"}] · ` +
        `${String(couverture.symbolesSansAppel.length)} symbole(s) sans appel direct ` +
        `[${couverture.symbolesSansAppel.join(", ") || "aucun"}] · ` +
        `${String(couverture.anomalies.length)} anomalie(s)`,
    );

    // ── LES PLANCHERS : la garde a RÉELLEMENT lu quelque chose ───────────────
    // Sans eux, une racine vide — ou un chemin de fichier devenu faux — rendrait
    // « zéro anomalie » et cette garde serait verte en ne mesurant rien.
    expect(couverture.octetsLus).toBeGreaterThan(5000);
    expect(couverture.etagesConfrontes).toBe(CLES_DES_ETAGES.length);
    expect(couverture.symbolesCherches).toBeGreaterThanOrEqual(CLES_DES_ETAGES.length);
    expect(couverture.appelsTrouves).toBeGreaterThanOrEqual(5);

    expect(couverture.anomalies).toEqual([]);
  });

  it("appelle les étages dans l'ORDRE de l'échelle — mesuré sur les positions", () => {
    const couverture = verifierLaCouvertureDesEtages(
      racineReelle(),
      ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR,
    );
    const attendu = CLES_DES_ETAGES.filter((cle) => couverture.ordreLu.includes(cle));

    console.info(
      `[① · ordre] ${String(couverture.ordreLu.length)} étage(s) appelé(s) sur ` +
        `${String(CLES_DES_ETAGES.length)} · lu : [${couverture.ordreLu.join(" > ")}] · ` +
        `attendu : [${attendu.join(" > ")}]`,
    );

    // Plancher : au moins la moitié des étages sont réellement appelés, sans
    // quoi « l'ordre est respecté » porterait sur deux éléments.
    expect(couverture.ordreLu.length).toBeGreaterThanOrEqual(4);
    expect(couverture.ordreLu).toEqual(attendu);
    // Le verrou AVANT tout : c'est le rang qui porte la sûreté du § 20.
    expect(couverture.ordreLu[0]).toBe("verrou");
  });

  /**
   * **LE CLIQUET, DATÉ — 2026-08-31.**
   *
   * ⚠️ Il rougit dans les DEUX sens. Un étage de plus sans exécutant est un
   *    contournement qu'on aurait béni ; un étage de la liste qui gagne son
   *    exécutant est une liste qui n'a pas été vidée, et une liste qu'on ne vide
   *    pas finit par tout couvrir.
   */
  it("tient le CLIQUET des étages dont le décideur n'est PAS ENCORE ÉCRIT", () => {
    const couverture = verifierLaCouvertureDesEtages(
      racineReelle(),
      ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR,
    );
    const nouveaux = couverture.etagesSansExecutant.filter(
      (cle) => !ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR.includes(cle),
    );
    const pourvus = ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR.filter(
      (cle) => !couverture.etagesSansExecutant.includes(cle),
    );

    console.info(
      `[① · cliquet étages] ${String(ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR.length)} étage(s) ` +
        `annoncé(s) en attente [${ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR.join(", ")}] · ` +
        `${String(couverture.etagesSansExecutant.length)} mesuré(s) sans exécutant ` +
        `[${couverture.etagesSansExecutant.join(", ") || "aucun"}] · ` +
        `${String(nouveaux.length)} NOUVEAU(x) [${nouveaux.join(", ") || "aucun"}] · ` +
        `${String(pourvus.length)} désormais pourvu(s) [${pourvus.join(", ") || "aucun"}]`,
    );

    expect(nouveaux).toEqual([]);
    expect(pourvus).toEqual([]);
  });

  /**
   * **LE SECOND CLIQUET — LES SYMBOLES, ET NON LES ÉTAGES.**
   *
   * L'ADR 0023 écrit « pour chaque symbole de `decideurs`, la racine doit
   * contenir un appel ». Cette exigence-là n'est pas tenable en l'état, et le
   * motif est écrit à côté de chaque nom dans
   * {@link DECIDEURS_NON_APPELES_DIRECTEMENT} : deux décideurs d'un même étage
   * peuvent être l'un l'appelant de l'autre, et un troisième nom n'a aucun
   * référent dans le dépôt. La liste est donc ANNONCÉE et gardée par un cliquet
   * plutôt que transformée en anomalie — un symbole de plus ne peut pas s'y
   * ajouter en silence.
   */
  it("tient le CLIQUET des décideurs que la racine n'appelle PAS directement", () => {
    const couverture = verifierLaCouvertureDesEtages(
      racineReelle(),
      ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR,
    );
    const nouveaux = couverture.symbolesSansAppel.filter(
      (symbole) => !DECIDEURS_NON_APPELES_DIRECTEMENT.includes(symbole),
    );
    const desormaisAppeles = DECIDEURS_NON_APPELES_DIRECTEMENT.filter(
      (symbole) => !couverture.symbolesSansAppel.includes(symbole),
    );

    console.info(
      `[① · cliquet symboles] ${String(couverture.symbolesCherches)} symbole(s) cherché(s) · ` +
        `${String(couverture.appelsTrouves)} appelé(s) directement · ` +
        `${String(couverture.symbolesSansAppel.length)} non appelé(s) ` +
        `[${couverture.symbolesSansAppel.join(", ") || "aucun"}] · ` +
        `${String(DECIDEURS_NON_APPELES_DIRECTEMENT.length)} annoncé(s) d'avance · ` +
        `${String(nouveaux.length)} NOUVEAU(x) [${nouveaux.join(", ") || "aucun"}] · ` +
        `${String(desormaisAppeles.length)} désormais appelé(s) ` +
        `[${desormaisAppeles.join(", ") || "aucun"}]`,
    );

    // Plancher : la majorité des décideurs SONT appelés. Un cliquet qui
    // couvrirait tous les symboles ne garderait plus rien.
    expect(couverture.appelsTrouves).toBeGreaterThan(couverture.symbolesSansAppel.length);
    expect(nouveaux).toEqual([]);
    expect(desormaisAppeles).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LES TÉMOINS FABRIQUÉS — LA GARDE SAIT-ELLE DIRE NON ?
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une racine FABRIQUÉE qui appelle les décideurs de chaque étage, dans l'ordre.
 *
 * ⚠️ ELLE EST DÉRIVÉE DE L'ÉCHELLE, PAS ÉCRITE. Une racine témoin recopiée à la
 *    main serait une seconde source de vérité, et le jour où un huitième étage
 *    atterrirait, le témoin resterait vert sur une racine incomplète.
 */
function racineFabriquee(retire: readonly string[] = []): string {
  const lignes = CLES_DES_ETAGES.flatMap((cle) =>
    ETAGES_DU_DEMARRAGE[cle].decideurs
      .filter((symbole) => !retire.includes(symbole))
      .map((symbole) => `  ${symbole}();`),
  );
  return `export function racine() {\n${lignes.join("\n")}\n}\n`;
}

describe("ADR 0023 · ② la garde sait-elle dire NON ?", () => {
  it("TÉMOIN DE CAPACITÉ — une racine complète et ordonnée ne produit AUCUNE anomalie", () => {
    const couverture = verifierLaCouvertureDesEtages(racineFabriquee());

    console.info(
      `[② · capacité] ${String(couverture.octetsLus)} octet(s) fabriqués · ` +
        `${String(couverture.symbolesCherches)} symbole(s) cherché(s) · ` +
        `${String(couverture.appelsTrouves)} appel(s) trouvé(s) · ` +
        `${String(couverture.anomalies.length)} anomalie(s)`,
    );

    // ⚠️ SANS CE TÉMOIN, LES TROIS SUIVANTS SERAIENT VERTS POUR RIEN. Une garde
    //    qui trouverait une anomalie sur TOUTE racine serait « rouge partout »,
    //    ce qui ressemble en tout point à une garde qui mord.
    expect(couverture.appelsTrouves).toBe(couverture.symbolesCherches);
    expect(couverture.etagesSansExecutant).toEqual([]);
    expect(couverture.anomalies).toEqual([]);
  });

  it("SAIT DIRE NON — un étage dont TOUS les décideurs sont retirés fait UNE anomalie", () => {
    const cible = "politique";
    const couverture = verifierLaCouvertureDesEtages(
      racineFabriquee(ETAGES_DU_DEMARRAGE[cible].decideurs),
    );

    console.info(
      `[② · étage retiré] étage visé : « ${cible} » · ` +
        `${String(ETAGES_DU_DEMARRAGE[cible].decideurs.length)} décideur(s) retiré(s) · ` +
        `${String(couverture.appelsTrouves)} appel(s) restant(s) sur ` +
        `${String(couverture.symbolesCherches)} · ` +
        `${String(couverture.anomalies.length)} anomalie(s) : ${couverture.anomalies.join(" | ")}`,
    );

    expect(couverture.etagesSansExecutant).toEqual([cible]);
    // EXACTEMENT UNE anomalie, et elle NOMME l'étage — l'ADR 0023 l'exige.
    expect(couverture.anomalies.length).toBe(1);
    expect(couverture.anomalies[0]).toContain(cible);
    expect(couverture.anomalies[0]).toContain("déclaré et sauté");
  });

  it("SAIT DIRE NON — deux étages appelés dans le DÉSORDRE font une anomalie d'ordre", () => {
    // La racine appelle tous les décideurs, mais l'étage 4 avant l'étage 2.
    const desordonnee = [
      "export function racine() {",
      ...ETAGES_DU_DEMARRAGE.verrou.decideurs.map((s) => `  ${s}();`),
      ...ETAGES_DU_DEMARRAGE.politique.decideurs.map((s) => `  ${s}();`),
      ...ETAGES_DU_DEMARRAGE.coffre.decideurs.map((s) => `  ${s}();`),
      ...ETAGES_DU_DEMARRAGE.authentification.decideurs.map((s) => `  ${s}();`),
      ...ETAGES_DU_DEMARRAGE.registre.decideurs.map((s) => `  ${s}();`),
      ...ETAGES_DU_DEMARRAGE.transports.decideurs.map((s) => `  ${s}();`),
      ...ETAGES_DU_DEMARRAGE.veille.decideurs.map((s) => `  ${s}();`),
      "}",
    ].join("\n");
    const couverture = verifierLaCouvertureDesEtages(desordonnee);

    console.info(
      `[② · désordre] ordre lu : [${couverture.ordreLu.join(" > ")}] · ` +
        `${String(couverture.etagesSansExecutant.length)} étage(s) sans exécutant · ` +
        `${String(couverture.anomalies.length)} anomalie(s) : ${couverture.anomalies.join(" | ")}`,
    );

    // Tous les étages ont un exécutant — l'anomalie est l'ORDRE, et rien d'autre.
    expect(couverture.etagesSansExecutant).toEqual([]);
    expect(couverture.anomalies.length).toBe(1);
    expect(couverture.anomalies[0]).toContain("l'ordre EST la décision");
  });

  it("SAIT DIRE NON — un décideur NOMMÉ EN PROSE n'est pas un appel", () => {
    const cible = "politique";
    const enProse = [
      "export function racine() {",
      ...ETAGES_DU_DEMARRAGE[cible].decideurs.map(
        (symbole) => `  // on devrait appeler ${symbole}() ici, un jour`,
      ),
      `  /* et ${ETAGES_DU_DEMARRAGE[cible].decideurs.join("(), ")}() dans un bloc aussi */`,
      "}",
    ].join("\n");
    const couverture = verifierLaCouvertureDesEtages(enProse);
    const appelsSurLaCible = couverture.decideurs.filter(
      (decideur) => decideur.cle === cible && decideur.appele,
    ).length;

    console.info(
      `[② · prose] ${String(enProse.length)} octet(s) fabriqués · ` +
        `${String(ETAGES_DU_DEMARRAGE[cible].decideurs.length)} décideur(s) cités en commentaire ` +
        `(ligne ET bloc) · ${String(appelsSurLaCible)} compté(s) comme APPEL`,
    );

    // ⚠️ CE DÉFAUT A ÉTÉ MESURÉ AU LOT 1c : deux modules nommaient
    //    `cumulerChampsDeGouvernance()` dans un bloc JSDoc, parenthèses
    //    comprises, et la couture passait pour faite.
    expect(appelsSurLaCible).toBe(0);
    expect(couverture.etagesSansExecutant).toContain(cible);
  });

  it("SAIT DIRE NON — un décideur seulement IMPORTÉ n'est pas un appel", () => {
    const cible = "veille";
    const importeSeul = [
      `import { ${ETAGES_DU_DEMARRAGE[cible].decideurs.join(", ")} } from "./ailleurs.js";`,
      "export function racine() {",
      ...CLES_DES_ETAGES.filter((cle) => cle !== cible).flatMap((cle) =>
        ETAGES_DU_DEMARRAGE[cle].decideurs.map((symbole) => `  ${symbole}();`),
      ),
      "}",
    ].join("\n");
    const couverture = verifierLaCouvertureDesEtages(importeSeul);

    console.info(
      `[② · import seul] étage visé : « ${cible} » · ` +
        `${String(couverture.appelsTrouves)} appel(s) sur ` +
        `${String(couverture.symbolesCherches)} symbole(s) · ` +
        `étages sans exécutant : [${couverture.etagesSansExecutant.join(", ")}]`,
    );

    // Un ré-export ou un import n'est pas un appelant : la décision n'en est pas
    // plus branchée. C'est la règle de `sansLiaisons`, importée du registre des
    // coutures plutôt que réécrite ici.
    expect(couverture.etagesSansExecutant).toEqual([cible]);
  });
});

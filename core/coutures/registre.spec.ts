import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CritereDeProduction, FichierSoumis } from "./contrat.js";
import { REGISTRE_DES_COUTURES } from "./registre.js";
import {
  symbolesHorsAscii,
  trousDeNumerotation,
  verifierLaCouvertureDesAdr,
  verifierLesAssertions,
  verifierLesCoutures,
} from "./verifier.js";

/**
 * **G1 ET G2 DE L'ADR 0019 — LE REGISTRE CONFRONTÉ AU DÉPÔT RÉEL.**
 *
 * ═══ CE QUE CE FICHIER GARDE ═══
 *
 * L'épreuve du lot 1c a mesuré un mode de défaillance que rien ne surveillait :
 * **une décision écrite, testée, documentée — et non cousue au chemin de
 * production.** Quatre ADR sur cinq étaient dans cet état. Les tests passaient
 * parce qu'ils éprouvaient la FONCTION, jamais son BRANCHEMENT.
 *
 * `core/coutures/registre.ts` répond en DONNÉE : une entrée par décision, qui
 * dit quel symbole la porte et ce qu'on doit mesurer aujourd'hui. Ce fichier-ci
 * est la moitié qui manquait — **la dérivation qui contredit la donnée** :
 *
 *  · **G1** confronte chaque entrée au graphe d'appels des modules de
 *    PRODUCTION, et rougit dans les DEUX sens ;
 *  · **G2** confronte le registre au contenu de `docs/adr/`, si bien qu'un ADR
 *    neuf ne peut pas atterrir sans que quelqu'un dise qui porte sa décision.
 *
 * ⚠️ **CE FICHIER NE PORTE AUCUNE LISTE DE SYMBOLES.** Il lit le registre. Une
 *    garde qui énumérerait elle-même ce qu'elle surveille serait une seconde
 *    source de vérité, et c'est la seconde qui ne suit jamais.
 *
 * ⚠️ **IL N'ANNONCE JAMAIS UNE COULEUR.** Combien de fichiers soumis, combien
 *    retenus comme production, combien de symboles confrontés, et pour CHACUN
 *    combien d'appelants — avec leurs noms. La règle de ce dépôt est de lire le
 *    NOMBRE D'ÉLÉMENTS MESURÉS, jamais le vert.
 *
 * ⚠️ **CE QU'IL NE PROUVE PAS.** Un appelant est ici une FORME ÉCRITE trouvée
 *    dans un source dont on a retiré les commentaires et les ré-exports. Un
 *    appel passé par un alias, par une table de dispatch ou par une injection de
 *    dépendance lui échappe — la mesure est donc un PLANCHER d'appelants, jamais
 *    un plafond. Les entrées dont la vraie mesure est ailleurs le disent par
 *    `mesureeAilleurs`, et ce fichier compte ces délégations au lieu de les
 *    croire.
 *
 * ⚠️ **ET IL NE PROUVE PAS QUE LE SOCLE TOURNE.** Le dépôt n'a pas de racine de
 *    composition : `core/transport/` est un lot à venir. Beaucoup de points
 *    d'entrée légitimes ont donc zéro appelant, et l'état `à-coudre` dit
 *    exactement cela. Une garde qui exigerait un appelant pour tous serait rouge
 *    en permanence, pour une raison étrangère à la règle gardée — et elle serait
 *    désactivée dans la semaine.
 */

const RACINE = new URL("../../", import.meta.url);

/** Les racines du programme TypeScript, telles que `vitest.config.ts` les liste. */
const DOSSIERS_DU_PROGRAMME = ["core", "adapters", "console", "voice", "ops"] as const;

function parcourir(relatif: string, acc: FichierSoumis[]): void {
  let entrees;
  try {
    entrees = readdirSync(fileURLToPath(new URL(relatif, RACINE)), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entree of entrees) {
    const chemin = `${relatif}${entree.name}`;
    if (entree.isDirectory()) parcourir(`${chemin}/`, acc);
    else if (entree.name.endsWith(".ts")) {
      acc.push({ chemin, source: readFileSync(fileURLToPath(new URL(chemin, RACINE)), "utf8") });
    }
  }
}

/**
 * ⚠️ **LE BALAYAGE EST MÉMOÏSÉ, ET C'EST LE REMÈDE QUE L'ADR 0040 NOMME.**
 *
 * Ces trois fonctions lisaient le disque et rescannaient 273 fichiers À CHAQUE
 * TEST. Mesuré : sur une machine calme, 2,5 s par test ; sur une machine
 * chargée — deux suites concurrentes —, **15 531 ms**, au-delà du seuil
 * d'alerte de 15 000 ms. La suite complète cessait alors d'être reproductible :
 * cinq exécutions vertes, puis une rouge, sur un arbre inchangé.
 *
 * L'ADR 0040 écrit le remède mot pour mot — « rendre la garde MOINS CHÈRE —
 * mémoïser le balayage du dépôt, lire les sources une fois pour tous les tests
 * d'un fichier —, jamais de remonter le plafond ». C'est ce qui est fait ici.
 *
 * ⚠️ **CE QUE LA MÉMOÏSATION NE CHANGE PAS.** Le registre de modules d'un worker
 *    vitest est isolé PAR FICHIER de test : le cache naît et meurt avec ce
 *    fichier-ci, et aucune garde d'un autre fichier ne lit ce qu'il a retenu.
 *    Chaque test reçoit exactement le même rapport qu'avant, et continue
 *    d'ANNONCER ses comptes — le nombre d'éléments mesurés, jamais la couleur.
 */
let memoireDuProgramme: FichierSoumis[] | null = null;

/** Tous les `.ts` du programme, gardes comprises. Le tri des livrés vient après. */
function programme(): FichierSoumis[] {
  if (memoireDuProgramme !== null) return memoireDuProgramme;
  const acc: FichierSoumis[] = [];
  for (const dossier of DOSSIERS_DU_PROGRAMME) parcourir(`${dossier}/`, acc);
  memoireDuProgramme = acc;
  return acc;
}

/** Les fichiers de `docs/adr/`, tels quels. */
function adrSurDisque(): FichierSoumis[] {
  return readdirSync(fileURLToPath(new URL("docs/adr/", RACINE)))
    .filter((nom) => nom.endsWith(".md"))
    .sort()
    .map((nom) => ({
      chemin: `docs/adr/${nom}`,
      source: readFileSync(fileURLToPath(new URL(`docs/adr/${nom}`, RACINE)), "utf8"),
    }));
}

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, (caractere) => `\\${caractere}`);
}

/**
 * CE QUE `pnpm build` ÉMET — **DÉRIVÉ de l'`exclude` de `tsconfig.build.json`,
 * jamais réécrit ici.**
 *
 * C'est le bon critère : ce qui rend une décision non cousue dangereuse est
 * qu'elle n'atteint pas ce qui TOURNE. Un fichier que le build n'émet pas
 * n'exécute rien en service.
 *
 * ⚠️ `motifsLus` EST LE PLANCHER DE TOUTE CETTE GARDE. À zéro motif lu, tout
 *    passerait pour livré : les `.spec.ts` deviendraient des modules de
 *    production, chaque `à-coudre` gagnerait des appelants de test, et la mesure
 *    entière changerait de sens sans un mot.
 */
let memoireDuCritere: CritereDeProduction | null = null;

function critereDeLivraison(): CritereDeProduction {
  if (memoireDuCritere !== null) return memoireDuCritere;
  const brut = readFileSync(fileURLToPath(new URL("tsconfig.build.json", RACINE)), "utf8");
  // `tsconfig.build.json` porte des commentaires de ligne : `JSON.parse` les refuse.
  const lu = JSON.parse(brut.replace(/^\s*\/\/[^\n]*$/gm, "")) as { exclude?: readonly string[] };
  const motifs = lu.exclude ?? [];

  const estExclu = (chemin: string): boolean =>
    motifs.some((motif) => {
      if (!motif.includes("*")) return chemin === motif || chemin.startsWith(`${motif}/`);
      const forme = new RegExp(
        `^${echapper(motif)
          .replace(/\\\*\\\*\//g, "(?:.*/)?")
          .replace(/\\\*/g, "[^/]*")}$`,
      );
      const base = chemin.slice(chemin.lastIndexOf("/") + 1);
      return forme.test(chemin) || forme.test(base);
    });

  memoireDuCritere = { estLivre: (chemin) => !estExclu(chemin), motifsLus: motifs.length };
  return memoireDuCritere;
}

/**
 * LE RAPPORT SUR LE REGISTRE RÉEL, calculé UNE FOIS pour les quatre tests qui
 * le lisent. Les témoins FABRIQUÉS appellent `verifierLesCoutures` directement :
 * eux ne passent jamais par ici, sans quoi la mémoire les confondrait.
 */
let memoireDuRapport: ReturnType<typeof verifierLesCoutures> | null = null;

function rapportDuRegistreReel(): ReturnType<typeof verifierLesCoutures> {
  memoireDuRapport ??= verifierLesCoutures(
    programme(),
    REGISTRE_DES_COUTURES,
    critereDeLivraison(),
  );
  return memoireDuRapport;
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — CHAQUE ENTRÉE, CONFRONTÉE AU GRAPHE D'APPELS
// ═════════════════════════════════════════════════════════════════════════════

describe("G1 — le registre des coutures confronté au graphe d'appels", () => {
  it("annonce, symbole par symbole, combien d'appelants de PRODUCTION et lesquels", () => {
    const critere = critereDeLivraison();
    const rapport = rapportDuRegistreReel();

    for (const verdict of rapport.verdicts) {
      const entree = verdict.entree;
      if (entree.etat !== "cousue" && entree.etat !== "à-coudre") continue;
      console.info(
        `[G1] ADR ${entree.adr} · ${entree.etat} · ${entree.genre} · ${entree.symbole} → ` +
          `${String(verdict.appelants.length)} appelant(s) ` +
          `[${verdict.appelants.join(", ") || "aucun"}] · ` +
          `${String(verdict.citationsEnProse.length)} citation(s) en prose` +
          `${verdict.defini ? "" : " · ⚠️ NON DÉFINI dans le module déclaré"}`,
      );
    }

    console.info(
      `[G1 · totaux] ${String(rapport.fichiersSoumis)} fichier(s) soumis · ` +
        `${String(rapport.modulesDeProduction)} module(s) de PRODUCTION balayé(s) · ` +
        `${String(critere.motifsLus)} motif(s) d'exclusion lu(s) dans tsconfig.build.json · ` +
        `${String(REGISTRE_DES_COUTURES.length)} entrée(s) au registre · ` +
        `${String(rapport.symbolesConfrontes)} symbole(s) confronté(s) · ` +
        `états ${JSON.stringify(rapport.parEtat)} · genres ${JSON.stringify(rapport.parGenre)} · ` +
        `${String(rapport.mesuresDeleguees)} mesure(s) déléguée(s) · ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );

    // ── LES QUATRE PLANCHERS QUE L'ADR 0019 PRESCRIT ────────────────────────
    // Sans eux, un dossier déplacé ou un `exclude` vidé rendrait cette garde
    // verte en ne lisant rien — le vert le plus coûteux qui soit.
    expect(critere.motifsLus).toBeGreaterThanOrEqual(2);
    expect(rapport.modulesDeProduction).toBeGreaterThanOrEqual(60);
    expect(rapport.symbolesConfrontes).toBeGreaterThanOrEqual(20);
    expect(rapport.mesuresDeleguees).toBeGreaterThanOrEqual(2);
    // Et le critère TRIE réellement : si tout passait pour livré, ce compte
    // vaudrait le nombre total de fichiers soumis.
    expect(rapport.modulesDeProduction).toBeLessThan(rapport.fichiersSoumis);
  });

  it("ne trouve AUCUN désaccord entre la prose du registre et le graphe d'appels", () => {
    const rapport = rapportDuRegistreReel();

    console.info(
      `[G1 · désaccords] ${String(rapport.symbolesConfrontes)} symbole(s) confronté(s) · ` +
        `${String(rapport.anomalies.length)} anomalie(s) : ` +
        `${rapport.anomalies.join(" | ") || "aucune"}`,
    );

    // Plancher : la confrontation a réellement eu lieu.
    expect(rapport.symbolesConfrontes).toBeGreaterThanOrEqual(20);
    expect(rapport.anomalies).toEqual([]);
  });

  it("mesure la PROPORTION de décisions réellement cousues, et la nomme", () => {
    const rapport = rapportDuRegistreReel();
    const avecAppelant = rapport.verdicts.filter((verdict) => verdict.appelants.length > 0);
    const adrAvecAppelant = new Set(avecAppelant.map((verdict) => verdict.entree.adr));
    const adrInscrits = new Set(REGISTRE_DES_COUTURES.map((entree) => entree.adr));

    console.info(
      `[G1 · la mesure du lot] ${String(adrInscrits.size)} ADR inscrit(s) au registre · ` +
        `${String(adrAvecAppelant.size)} porte(nt) au moins UNE décision appelée par un module ` +
        `de production [${[...adrAvecAppelant].sort().join(", ")}] · ` +
        `${String(avecAppelant.length)} symbole(s) cousu(s) sur ` +
        `${String(rapport.symbolesConfrontes)} confronté(s)`,
    );

    // ⚠️ CE N'EST PAS UN SEUIL DE QUALITÉ, C'EST UN CLIQUET. Le socle n'a pas de
    //    racine de composition : beaucoup de décisions ne PEUVENT pas avoir
    //    d'appelant aujourd'hui, et l'exiger fabriquerait un rouge permanent.
    //    Ce plancher dit seulement que la couture mesurée au lot 1d ne se défait
    //    pas en silence.
    expect(avecAppelant.length).toBeGreaterThanOrEqual(15);
    expect(adrAvecAppelant.size).toBeGreaterThanOrEqual(8);
  });

  /**
   * LE CLIQUET DES SYMBOLES NON ÉCRITS — mesuré le 2026-08-31.
   *
   * ⚠️ **L'ÉTAT `à-coudre` NE SAIT PAS DIRE « JAMAIS ÉCRIT ».** Il n'exige que
   *    « zéro appelant », condition qu'un symbole inexistant remplit sans effort
   *    et pour toujours. Le registre ne distinguerait donc pas « écrit mais non
   *    branché » de « jamais écrit », alors que c'est la distinction qu'il
   *    existe pour porter. Cette liste NOMME les symboles annoncés d'avance ; en
   *    ajouter un pour obtenir du vert reviendrait à bénir l'oubli.
   */
  const NON_ECRITS_LE_2026_08_31 = ["estLigneDIntention"] as const;

  it("tient le CLIQUET des symboles inscrits mais JAMAIS ÉCRITS", () => {
    const rapport = rapportDuRegistreReel();
    const introuvables = rapport.verdicts
      .filter((verdict) => !verdict.defini)
      .map((verdict) => verdict.entree)
      .filter(
        (entree): entree is Extract<typeof entree, { symbole: string }> =>
          entree.etat === "cousue" || entree.etat === "à-coudre",
      );
    const nouveaux = introuvables
      .map((entree) => entree.symbole)
      .filter((symbole) => !(NON_ECRITS_LE_2026_08_31 as readonly string[]).includes(symbole));
    const ecrits = NON_ECRITS_LE_2026_08_31.filter(
      (symbole) => !introuvables.some((entree) => entree.symbole === symbole),
    );

    console.info(
      `[G1 · cliquet] ${String(rapport.symbolesConfrontes)} symbole(s) confronté(s) · ` +
        `${String(rapport.symbolesConfrontes - introuvables.length)} DÉFINI(s) sur le disque · ` +
        `${String(introuvables.length)} annoncé(s) d'avance ` +
        `[${introuvables.map((e) => `${e.symbole} (ADR ${e.adr})`).join(", ") || "aucun"}] · ` +
        `${String(nouveaux.length)} NOUVEAU(x) [${nouveaux.join(", ") || "aucun"}] · ` +
        `${String(ecrits.length)} désormais écrit(s) [${ecrits.join(", ") || "aucun"}]`,
    );

    // Plancher : la reconnaissance des définitions RÉPOND. Si elle ne
    // reconnaissait plus aucune forme, tout serait « non défini » et cette
    // annonce ne serait que du bruit.
    expect(rapport.symbolesConfrontes - introuvables.length).toBeGreaterThanOrEqual(15);
    // Un symbole annoncé d'avance de plus est une décision qu'on a inscrite sans
    // l'écrire : légitime, mais jamais en silence.
    expect(nouveaux).toEqual([]);
  });

  it("annonce la borne ASCII de ses propres formes, au lieu de seulement l'écrire", () => {
    const horsAscii = symbolesHorsAscii(REGISTRE_DES_COUTURES);

    console.info(
      `[G1 · borne] \\b est ASCII en JavaScript · ` +
        `${String(horsAscii.length)} symbole(s) du registre hors [A-Za-z0-9_$] ` +
        `[${horsAscii.join(", ") || "aucun"}]`,
    );

    // Le jour où un symbole accentué serait inscrit, la forme cesserait de
    // mordre EN SILENCE. Cette garde le dit à voix haute plutôt que de le laisser
    // dans un commentaire que personne ne relit.
    expect(horsAscii).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — CHAQUE ADR DE `docs/adr/` EST INSCRIT AU REGISTRE
// ═════════════════════════════════════════════════════════════════════════════

describe("G2 — la couverture des ADR", () => {
  it("lit le DOSSIER, jamais le registre, et annonce l'écart dans les deux sens", () => {
    const fichiers = adrSurDisque();
    const rapport = verifierLaCouvertureDesAdr(fichiers, REGISTRE_DES_COUTURES);

    console.info(
      `[G2] ${String(rapport.adrTrouves)} ADR trouvé(s) dans docs/adr/ · ` +
        `${String(rapport.adrCouverts)} couvert(s) par le registre · ` +
        `${String(rapport.statutsLus)} statut(s) lu(s) dont ` +
        `${String(rapport.adrAcceptes)} accepté(s) · ` +
        `${String(rapport.adrSansEntree.length)} sans entrée ` +
        `[${rapport.adrSansEntree.join(", ") || "aucun"}] · ` +
        `${String(rapport.entreesFantomes.length)} entrée(s) fantôme(s) ` +
        `[${rapport.entreesFantomes.join(", ") || "aucune"}]`,
    );

    // Planchers de l'ADR 0019. `statutsLus` est celui qui compte le plus : si le
    // format d'en-tête changeait, il s'effondrerait, et la garde le DIT au lieu
    // de devenir muette.
    expect(rapport.adrTrouves).toBeGreaterThanOrEqual(14);
    expect(rapport.statutsLus).toBe(rapport.adrTrouves);
    expect(rapport.adrAcceptes).toBeGreaterThanOrEqual(10);
    expect(rapport.anomalies).toEqual([]);
  });

  it("compte les TROUS de numérotation, que la couverture ne peut pas voir", () => {
    const trous = trousDeNumerotation(adrSurDisque());

    console.info(
      `[G2 · trous] ${String(trous.length)} numéro(s) manquant(s) entre le premier et le ` +
        `dernier ADR : ${trous.join(", ") || "aucun"} — voir docs/adr/README.md`,
    );

    // ⚠️ CE N'EST PAS UNE FAUTE, C'EST UNE BORNE DE LA GARDE G2. Dériver
    //    l'ensemble des ADR du CONTENU du dossier est le bon choix, et il rend
    //    par construction un trou de numérotation invisible : un ADR écrit puis
    //    perdu ne laisse aucune trace. Le compte est donc ANNONCÉ, et
    //    `docs/adr/README.md` dit ce qu'il en est de la plage 0006-0009.
    expect(trous).toEqual(["0006", "0007", "0008", "0009"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G4 — L'ASSERTION : QUEL TEST ROUGIT SI LA DÉCISION SE DÉFAIT ? (ADR 0041)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ CE QUE G1 NE VOYAIT PAS, ET QUI EST PASSÉ DEUX FOIS ═══
 *
 * G1 mesure **les appelants de production d'un symbole**. G4 mesure **si un
 * test rougit quand la décision se défait**. Les deux faits se séparent
 * exactement là où personne ne regarde : quand une décision NEUVE porte sur un
 * symbole DÉJÀ COUSU — ajouter un champ à `PortsDuService`, poser un refus dans
 * le bloc de l'étape 7. Le symbole garde ses appelants, l'entrée reste
 * `cousue`, G1 reste verte, et la décision n'existe nulle part.
 *
 * Deux ADR marqués « Statut : acceptée » sont passés au travers dans le même
 * lot : l'ADR 0036 (le plafond de 40 à l'étape 7) et l'ADR 0037 (les décisions
 * 2 et 3 sur `PortsDuService`).
 *
 * ⚠️ **`sansAssertion` N'EST PAS UNE FAUTE PAR ENTRÉE, C'EST LE CHIFFRE DU
 *    DOSSIER.** Le registre porte 90 décisions écrites avant que ce second fait
 *    existe ; en exiger une assertion aujourd'hui fabriquerait un rouge
 *    permanent, et une garde rouge en permanence est une garde qu'on désactive.
 *    Le cliquet interdit seulement que le compte MONTE : une décision neuve ne
 *    peut plus entrer sans qu'on ait répondu à la question.
 */
describe("G4 — l'assertion : quel test rougit si la décision se défait ?", () => {
  /**
   * LE CLIQUET DES DÉCISIONS SANS ASSERTION — mesuré le 2026-09-01.
   *
   * ⚠️ IL NE SE REMONTE PAS POUR OBTENIR DU VERT. Le faire monter d'un cran est
   *    la façon exacte dont une décision entre au registre sans que rien ne la
   *    voie — le défaut que l'ADR 0041 ferme.
   */
  const SANS_ASSERTION_LE_2026_09_01 = 88;

  /**
   * **LE CLIQUET D'IDENTITÉ — ce qu'un TOTAL ne peut pas porter.**
   *
   * ⚠️ **UNE SOMME SE COMPENSE, ET L'ÉPREUVE DU LOT 4 L'A FAIT SUR CE
   *    REGISTRE-CI.** Inscrire une décision neuve que rien ne voit (+1) et
   *    poser une assertion sur une entrée ancienne qui n'en avait pas (−1)
   *    laisse `sansAssertion` à 88, les anomalies à zéro et
   *    `cousuesNonAtterries` immobile. Le cliquet du dessus était donc
   *    satisfait par le geste même qu'il existe pour interdire — le défaut
   *    central du lot rentrait par la porte que le lot avait posée.
   *
   * ⚠️ **AUCUN CORRECTIF NE PEUT SAUVER LE TOTAL, ET C'EST POURQUOI ON EN
   *    CHANGE.** `sansAssertion` vaut `entrées − avecAssertion` : c'est une
   *    soustraction, elle est incapable de distinguer un échange d'un ajout.
   *    La liste, elle, nomme QUI entre et QUI sort. Les deux mesures
   *    cohabitent : le total reste annoncé, la liste porte la règle.
   *
   * ⚠️ **OUI, CETTE GARDE PORTE UNE LISTE — ET C'EST LE SEUL CAS OÙ CE DÉPÔT
   *    L'ADMET.** Une garde qui porte sa liste est d'ordinaire une garde qui
   *    ne dérive rien ; un CLIQUET est l'exception exacte, parce que sa liste
   *    n'est pas la règle mais un ÉTAT DATÉ dont on interdit l'aggravation.
   *    Elle est produite par la garde elle-même — `sansAssertionNommees`,
   *    recopiée telle quelle — jamais écrite à la main, et le test
   *    ci-dessous annonce l'écart dans les DEUX sens : ce qui entre fait
   *    rougir, ce qui sort se retire d'ici avec la décision qui l'a fermé.
   */
  const SANS_ASSERTION_NOMMEES_LE_2026_09_01: readonly string[] = [
    "BORNE_DE_FERMETURE (ADR 0035)",
    "CHAMPS_COUVERTS (ADR 0002)",
    "CHEMINS_SERVIS_PAR_L_EMETTEUR (ADR 0028)",
    "CLES_DE_PARAMETRES_DE_TOOLS_CALL (ADR 0032)",
    "CODE_COFFRE_VERROUILLE (ADR 0005)",
    "CleDeContrainteDAudience (ADR 0026)",
    "ComptesDIntention (ADR 0022)",
    "ConnexionDeVerrou (ADR 0024)",
    "DepotDeJetons (ADR 0027)",
    "ETAPE_COFFRE (ADR 0005)",
    "EntreeDePolitiqueDAcces (ADR 0028)",
    "EtageDeDemarrage (ADR 0023)",
    "FabriqueDeNoyau (ADR 0039)",
    "IssueDeRefus (ADR 0023)",
    "JOURNAL_AMONT_NON_ARME (ADR 0037)",
    "L'ARMEMENT n'écrit plus le seuil : le crochet qui fait rougir un test DÉRIVE sa décision du même verdict que la fonction pure, et une garde le vérifie. (ADR 0040)",
    "La route `/api/mcp` dans Axion-IA, et les gardes qu'elle rencontre. (ADR 0012)",
    "Le plafond de durée d'un test est POSÉ (30 000 ms, crochets compris) et sa marge se SURVEILLE : alerte dès qu'un test dépasse la moitié du plafond. (ADR 0040)",
    "Le poste vocal est un démon pilote (voie B). (ADR 0010)",
    "Les données derrière les huit écrans de la console. (ADR 0013)",
    "Les lectures sans session, agrégateur par agrégateur. (ADR 0011)",
    "MOITIÉ « TABLE » — `ops_token` gagne `grantId` et `sessionId`, avec leur migration ET leur lecteur dans le même geste. (ADR 0027)",
    "MOITIÉ « TABLE » — `ops_tool` porte enfin `governanceFields`, le dernier tronçon d'une propagation qui existait partout ailleurs. (ADR 0016)",
    "MesureDeCapacite (ADR 0035)",
    "NOMS_RESERVES_HORS_CONTEXTE (ADR 0020)",
    "NoyauUnique (ADR 0025)",
    "Octroi (ADR 0001)",
    "PrincipalEmis (ADR 0029)",
    "REGISTRE_DES_COUTURES (ADR 0019)",
    "STATUT_DES_CANAUX_DE_CONTEXTE (ADR 0020)",
    "STATUT_DES_CANAUX_D_APPEL (ADR 0031)",
    "STATUT_DES_CANAUX_D_IDENTITE (ADR 0031)",
    "SessionId (ADR 0014)",
    "Une étape rend le code de sa CAUSE quand elle en connaît un ; l'ancrage `APPEL_STEPS[n].refus` n'en est que le DÉFAUT. `stepDenied`, lui, vient toujours de l'ancrage. (ADR 0030)",
    "ValeursFrappeesParLeTransport (ADR 0001)",
    "ValeursServiesAuClient (ADR 0037)",
    "VerdictDHote (ADR 0025)",
    "VerdictDeScopes (ADR 0027)",
    "VerrouPostgres (ADR 0024)",
    "VersLeJournal (ADR 0031)",
    "admettreUnPrincipal (ADR 0029)",
    "analyserArgumentsDuSchema (ADR 0015)",
    "analyserFermeture (ADR 0003)",
    "appelsDOutilsAcceptes (ADR 0034)",
    "arbitrerLeDemarrage (ADR 0023)",
    "avecJournal (ADR 0017)",
    "bornerIdentifiantDuJournal (ADR 0029)",
    "brancherSurLesFlux (ADR 0032)",
    "calculerSelfHash (ADR 0002)",
    "chercherChampsDAutorisation (ADR 0003)",
    "choisirImplementationDuVerrou (ADR 0024)",
    "codeDuRefusAmont (ADR 0030)",
    "composerLeNoyau (ADR 0039)",
    "confronterLesEtapesExercees (ADR 0032)",
    "creerCalculEmpreinteDeJeton (ADR 0027)",
    "creerDecoupeur (ADR 0032)",
    "creerEmetteurDeJetons (ADR 0027)",
    "creerFabriqueSessionId (ADR 0014)",
    "cumulerChampsDeGouvernance (ADR 0016)",
    "deciderDemarrageMonoInstance (ADR 0018)",
    "empreinteDeCleDIdempotence (ADR 0020)",
    "estEffetExterieur (ADR 0017)",
    "estLigneDIntention (ADR 0022)",
    "executerHarnais (ADR 0036)",
    "exigerLaCouvertureAmont (ADR 0025)",
    "franchirLAmont (ADR 0025)",
    "issueDeReservation (ADR 0021)",
    "monterLeService (ADR 0034)",
    "orchestrerAppel (ADR 0039)",
    "patternReferme (ADR 0035)",
    "relireDepuisLeSocle (ADR 0014)",
    "relireLaSanteMonoInstance (ADR 0018)",
    "requisDuSchema (ADR 0036)",
    "resserrer (ADR 0038)",
    "resultatRefuse (ADR 0032)",
    "sansProse (ADR 0040)",
    "statutHealthcheckPourVerrou (ADR 0018)",
    "verdictDeScopesDemandes (ADR 0027)",
    "verifierAucuneFuite (ADR 0033)",
    "verifierChaine (ADR 0002)",
    "verifierEnumerationProfils (ADR 0004)",
    "verifierFormeDuSceau (ADR 0004)",
    "verifierLAudience (ADR 0026)",
    "verifierLaConfigurationDAuthentification (ADR 0027)",
    "verifierLaCouvertureDesEtages (ADR 0023)",
    "verifierLaFormeDeLAudience (ADR 0026)",
    "verifierLaFormeDuPrincipal (ADR 0029)",
    "verifierLesCoutures (ADR 0019)",
  ];

  it("annonce, entrée par entrée, si un test la voit — et rend le CHIFFRE du dossier", () => {
    const rapport = verifierLesAssertions(programme(), REGISTRE_DES_COUTURES);

    for (const verdict of rapport.verdicts) {
      const assertion = verdict.entree.assertion;
      if (assertion === null) continue;
      console.info(
        `[G4] ADR ${verdict.entree.adr} · ${assertion.fichier} · « ${assertion.nom} » → ` +
          `fichier ${verdict.fichierTrouve ? "trouvé" : "ABSENT"} · ` +
          `test ${verdict.testTrouve ? "trouvé" : "ABSENT"}` +
          `${verdict.enDette ? " · it.fails (DETTE nommée)" : ""} · ` +
          `${String(verdict.octetsDuCorps)} caractère(s) de corps isolé(s) · ` +
          `${String(verdict.assertionsDansLeCorps)} expect( dont ` +
          `${String(verdict.expectsFalsifiables)} FALSIFIABLE(s) · ` +
          `suite suspendue : ${verdict.suspendu ? "OUI" : "non"} · ` +
          `${String(verdict.nomsAttendus)} nom(s) exigé(s), ` +
          `${String(verdict.nomsAbsents.length)} absent(s) ` +
          `[${verdict.nomsAbsents.join(", ") || "aucun"}]` +
          `${
            verdict.nomsEnLitteralSeul.length > 0
              ? ` · ${String(verdict.nomsEnLitteralSeul.length)} en LITTÉRAL seul ` +
                `[${verdict.nomsEnLitteralSeul.join(", ")}]`
              : ""
          }`,
      );
    }

    console.info(
      `[G4 · totaux] ${String(rapport.entreesConfrontees)} entrée(s) confrontée(s) · ` +
        `${String(rapport.avecAssertion)} avec assertion · ` +
        `${String(rapport.sansAssertion)} SANS assertion · ` +
        `${String(rapport.enDette)} en dette (it.fails) · ` +
        `répartition ${JSON.stringify(rapport.parAssertion)} · ` +
        `${String(rapport.nomsExiges)} nom(s) exigé(s) dont ` +
        `${String(rapport.nomsEnLitteralSeul)} en LITTÉRAL seul · ` +
        `${String(rapport.assertionsPartagees.length)} assertion(s) PARTAGÉE(s) · ` +
        `${String(rapport.fichiersDAssertionDistincts)} fichier(s) de garde ouvert(s) · ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );

    console.info(
      `[G4 · LA MESURE QUI MANQUAIT] ${String(rapport.adrConfrontes)} ADR inscrit(s) au ` +
        `registre · ${String(rapport.adrConfrontes - rapport.adrSansAucuneAssertion.length)} ` +
        `porte(nt) AU MOINS UNE décision qu'un test voit · ` +
        `${String(rapport.adrSansAucuneAssertion.length)} n'en porte(nt) AUCUNE ` +
        `[${rapport.adrSansAucuneAssertion.join(", ") || "aucun"}]`,
    );

    // ── LES PLANCHERS, sans lesquels G4 serait verte en ne lisant rien ────────
    expect(rapport.entreesConfrontees).toBe(REGISTRE_DES_COUTURES.length);
    expect(rapport.entreesConfrontees).toBeGreaterThanOrEqual(60);
    expect(rapport.avecAssertion).toBeGreaterThanOrEqual(5);
    // Les assertions ont réellement fait OUVRIR des fichiers de garde distincts.
    expect(rapport.fichiersDAssertionDistincts).toBeGreaterThanOrEqual(2);
    // ⚠️ LE CLIQUET. Il ne se remonte pas ; il descend quand on pose une assertion.
    expect(rapport.sansAssertion).toBeLessThanOrEqual(SANS_ASSERTION_LE_2026_09_01);
  });

  /**
   * ⚠️ **LE CLIQUET QUE LE TOTAL NE POUVAIT PAS TENIR.** Voir
   *    {@link SANS_ASSERTION_NOMMEES_LE_2026_09_01} : une décision neuve que rien
   *    ne voit ENTRE dans cette liste, même si une autre en sort le même jour.
   *    C'est le seul mécanisme du dépôt qui oblige une décision NEUVE à être vue
   *    par un test, et il ne se compense pas.
   *
   * ⚠️ **LES SORTANTES NE FONT PAS ROUGIR, ET C'EST VOULU.** Une entrée qui
   *    quitte cette liste est une décision qu'un test voit désormais : c'est
   *    exactement le mouvement qu'on veut encourager. Elle est ANNONCÉE pour que
   *    la mise à jour de la liste soit un geste conscient, jamais un nettoyage.
   */
  it("tient le CLIQUET D'IDENTITÉ des décisions sans assertion, que le total ne peut pas porter", () => {
    const rapport = verifierLesAssertions(programme(), REGISTRE_DES_COUTURES);
    const entrantes = rapport.sansAssertionNommees.filter(
      (identite) => !SANS_ASSERTION_NOMMEES_LE_2026_09_01.includes(identite),
    );
    const sortantes = SANS_ASSERTION_NOMMEES_LE_2026_09_01.filter(
      (identite) => !rapport.sansAssertionNommees.includes(identite),
    );

    console.info(
      `[G4 · cliquet d'identité] ${String(rapport.sansAssertionNommees.length)} identité(s) ` +
        `sans assertion aujourd'hui · ` +
        `${String(SANS_ASSERTION_NOMMEES_LE_2026_09_01.length)} figée(s) le 2026-09-01 · ` +
        `${String(entrantes.length)} ENTRANTE(s) [${entrantes.join(", ") || "aucune"}] · ` +
        `${String(sortantes.length)} sortante(s) — une décision qu'un test voit désormais ` +
        `[${sortantes.join(", ") || "aucune"}]`,
    );

    console.info(
      `[G4 · partage] ${String(rapport.assertionsPartagees.length)} assertion(s) désignée(s) ` +
        `par PLUSIEURS entrées [${rapport.assertionsPartagees.join(" | ") || "aucune"}] · ` +
        `${String(rapport.nomsExiges)} nom(s) exigé(s) au total, ` +
        `${String(rapport.nomsEnLitteralSeul)} ne vivant QUE dans un littéral — ` +
        "part que G4 ne sait pas distinguer d'une mesure, et qu'elle annonce donc",
    );

    // Plancher : la liste figée n'est pas vide, sans quoi « aucune entrante » ne
    // voudrait rien dire — tout serait entrant, ou rien ne serait mesuré.
    expect(SANS_ASSERTION_NOMMEES_LE_2026_09_01.length).toBeGreaterThanOrEqual(60);
    expect(rapport.sansAssertionNommees.length).toBe(rapport.sansAssertion);
    // ⚠️ LA RÈGLE : une décision de plus que rien ne voit doit se voir ICI.
    expect(entrantes).toEqual([]);
  });

  it("ne trouve AUCUNE assertion menteuse — chaque test nommé existe et parle de sa décision", () => {
    const rapport = verifierLesAssertions(programme(), REGISTRE_DES_COUTURES);

    console.info(
      `[G4 · désaccords] ${String(rapport.avecAssertion)} assertion(s) confrontée(s) au ` +
        `disque · ${String(rapport.anomalies.length)} anomalie(s) : ` +
        `${rapport.anomalies.join(" | ") || "aucune"}`,
    );

    // Plancher : la confrontation a réellement eu lieu. Sans lui, un registre
    // dont toutes les assertions seraient `null` rendrait ce test vert.
    expect(rapport.avecAssertion).toBeGreaterThanOrEqual(5);
    expect(rapport.anomalies).toEqual([]);
  });

  /**
   * ⚠️ **ET G4 SE SURVEILLE ELLE-MÊME.** Le rapport du lot 3 écrivait, du
   *    mécanisme des coutures, « ET JE SUIS LOGÉ À LA MÊME ENSEIGNE » : il
   *    mesurait tout le monde et rien de lui-même. Ce test-ci l'interdit — la
   *    garde des assertions est une décision, elle porte son entrée au registre,
   *    et cette entrée porte une assertion comme les autres.
   */
  it("porte SA PROPRE entrée au registre, et cette entrée porte une assertion", () => {
    const siennes = REGISTRE_DES_COUTURES.filter(
      (entree) =>
        entree.etat !== "à-nommer" &&
        entree.etat !== "hors-code" &&
        entree.module === "core/coutures/verifier.ts" &&
        entree.symbole === "verifierLesAssertions",
    );

    console.info(
      `[G4 · auto-inscription] ${String(siennes.length)} entrée(s) du registre nomme(nt) ` +
        `verifierLesAssertions · ` +
        `${String(siennes.filter((entree) => entree.assertion !== null).length)} porte(nt) ` +
        "une assertion",
    );

    expect(siennes).toHaveLength(1);
    expect(siennes[0]?.assertion).not.toBeNull();
    expect(siennes[0]?.assertion?.fichier).toBe("core/coutures/couture.temoin.spec.ts");
  });
  /**
   * LE CLIQUET DU DÉFAUT CENTRAL — mesuré le 2026-09-01.
   *
   * ⚠️ **CES ENTRÉES DISENT DEUX VÉRITÉS À LA FOIS, ET C'EST TOUT LE SUJET DU
   *    LOT 4.** Le symbole A des appelants de production — l'entrée est `cousue`
   *    à bon droit, G1 est verte à bon droit — **et la décision n'a pas
   *    atterri**. C'est exactement l'état dans lequel l'ADR 0037 a passé un lot
   *    entier : `PortsDuService` importé par `ops/index.ts`, entrée verte, et ni
   *    `journalDesRefus` ni `delaiDeReprise` nulle part dans `ops/`.
   *
   * ⚠️ **LA LISTE EST ÉCRITE, PAS SEULEMENT COMPTÉE.** Un nombre seul se
   *    contemple ; des noms se corrigent. Chacun de ces symboles attend un
   *    correcteur, et l'`it.fails` qui le garde rougira le jour où la décision
   *    atterrit — forçant à retirer le `.fails` et à basculer l'entrée.
   */
  const COUSUES_NON_ATTERRIES_LE_2026_09_01: readonly string[] = [];

  /**
   * ⚠️ **CE CLIQUET A DESCENDU DE TROIS À ZÉRO, ET C'EST LA SEULE FAÇON DONT IL
   *    DOIT BOUGER.** Les deux `PortsDuService (ADR 0037)` en sont sortis parce
   *    que les décisions 2 et 3 ont ATTERRI au lot 4 : la fente existe,
   *    `monterLeService` la transmet à `creerTransportHttp`, et les deux
   *    assertions du registre ne pointent plus vers des `it.fails` mais vers
   *    deux gardes vivantes de `ops/service.spec.ts`, § ③, partant d'un service
   *    RÉELLEMENT MONTÉ. `verifierAucuneFuite (ADR 0044)` en est sorti pour la
   *    même raison, et elle est transcrite : le filet vit désormais dans
   *    `core/transport/anti-fuite.ts`, les DEUX transports l'appellent, et la
   *    garde d'équivalence exécutée contre l'état d'AVANT rendait
   *    `4 failed | 2 passed` — les quatre échecs nommant tous « → stdio ».
   *    Les retirer d'ici sans que la décision ait atterri aurait été exactement
   *    le geste que ce cliquet interdit.
   *
   * ⚠️ **UNE LISTE VIDE N'EST PAS UNE GARDE DÉSARMÉE.** Le contrôle qui compte
   *    est `nouvelles` : toute entrée `cousue` dont l'assertion redeviendrait un
   *    `it.fails` y apparaîtrait, et la ligne du bas la ferait rougir. Le zéro
   *    d'aujourd'hui est un état mesuré, pas une exemption.
   */

  it("NOMME les décisions déclarées cousues dont aucun code ne porte encore la règle", () => {
    const rapport = verifierLesAssertions(programme(), REGISTRE_DES_COUTURES);
    const nouvelles = rapport.cousuesNonAtterries.filter(
      (nom) => !COUSUES_NON_ATTERRIES_LE_2026_09_01.includes(nom),
    );

    console.info(
      `[G4 · défaut central] ${String(rapport.cousuesNonAtterries.length)} entrée(s) COUSUE(s) ` +
        `dont l'assertion est en DETTE [${rapport.cousuesNonAtterries.join(", ") || "aucune"}] · ` +
        `${String(nouvelles.length)} NOUVELLE(s) [${nouvelles.join(", ") || "aucune"}]`,
    );

    // Plancher : le rapport a bien été calculé sur le registre entier.
    expect(rapport.entreesConfrontees).toBe(REGISTRE_DES_COUTURES.length);
    // ⚠️ UNE DE PLUS EST UNE DÉCISION ACCEPTÉE QU'ON VIENT DE LAISSER EN L'AIR.
    //    Légitime le temps d'un lot — jamais en silence.
    expect(nouvelles).toEqual([]);
    expect(rapport.cousuesNonAtterries).toEqual(COUSUES_NON_ATTERRIES_LE_2026_09_01);
  });
});

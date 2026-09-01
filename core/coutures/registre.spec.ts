import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { CritereDeProduction, FichierSoumis } from "./contrat.js";
import { REGISTRE_DES_COUTURES } from "./registre.js";
import {
  symbolesHorsAscii,
  trousDeNumerotation,
  verifierLaCouvertureDesAdr,
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

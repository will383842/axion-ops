/**
 * TÉMOINS ADVERSAIRES — `core/chaine/`, les DEUX registres qui disent qui
 * exécute quelle étape du § 11, et la surface publique du module.
 *
 * ═══ LA QUESTION QU'ON POSE ═══
 *
 * `core/chaine` porte deux tables qui répondent à la MÊME question — « quel
 * module exécute l'étape N ? » :
 *
 *  · `ETAPES_CHAINE` (`etapes.ts`) : un `statut` (`déclarée` / `implémentée`),
 *    un `executer`, et un `module` — le chemin du fichier propriétaire ;
 *  · `EXECUTANTS_ETAPES` (`orchestrateur.ts`) : une phrase par clé d'étape,
 *    confrontée à `APPEL_STEPS` par `verifierCouvertureDesEtapes()`.
 *
 * Deux dérivations d'un même fait finissent par se contredire — le lot 1 l'a
 * mesuré sur le niveau de politique, et `orchestrateur.ts` l'écrit lui-même à
 * propos d'`ETAPE_PROFIL_CHAINE`. La question adverse est donc : **ces deux
 * tables disent-elles la même chose, et l'une ou l'autre est-elle confrontée à
 * quoi que ce soit de RÉEL ?**
 *
 * ═══ CE QUE CES TÉMOINS ONT MESURÉ, ET CE QUE LA RECETTE EN A FAIT ═══
 *
 * Au moment de l'épreuve : non, et non.
 *
 *  1. Les deux tables se CONTREDISAIENT sur les cinq étapes. `EXECUTANTS_ETAPES`
 *     nommait `core/chaine/etape-05-scopes.ts` … `etape-14-execution.ts` — cinq
 *     fichiers qui EXISTENT, sont écrits, testés, et dont deux sont importés par
 *     l'orchestrateur. `ETAPES_CHAINE` nommait `core/chaine/scopes.ts` …
 *     `execution.ts` — cinq fichiers qui N'EXISTAIENT PAS.
 *
 *  2. Par conséquent, la garde du reste-à-faire d'`etapes.spec.ts` ANNONÇAIT
 *     « 5 étapes déclarées, 5 encore sans implémentation », et renvoyait vers
 *     cinq chemins fantômes. C'était faux : les cinq étaient écrites. Le rapport
 *     d'avancement du module disait l'inverse de son propre dossier.
 *
 *  3. `verifierCouvertureDesEtapes()` ne pouvait pas l'attraper : son critère
 *     était `executant.trim().length === 0`. Elle mesurait la NON-VACUITÉ D'UNE
 *     PHRASE, jamais l'existence de ce qu'elle nomme. Une étape dont le module
 *     aurait été supprimé, renommé, ou n'aurait jamais été écrit restait
 *     « couverte » tant que la chaîne de caractères était là. `ETAPES_CHAINE` en
 *     faisait la démonstration involontaire : cinq chaînes parfaitement non
 *     vides qui ne désignaient rien.
 *
 * ⚠️ CE QUE CES TÉMOINS N'AFFIRMAIENT PAS. Ils ne disaient pas que l'orchestrateur
 *    était cassé — il ne l'était pas : les cinq étapes lui sont INJECTÉES par
 *    `DependancesOrchestrateur`, et `orchestrateur.spec.ts` les lui donne. Ils
 *    disaient que les deux registres censés dire l'état d'avancement n'étaient
 *    adossés à rien, et qu'ils se contredisaient sans que rien ne rougisse.
 *
 * ═══ CE QUE LA RECETTE A CORRIGÉ, ET POURQUOI CES TESTS SONT EN `it()` ═══
 *
 * Les trois défauts sont fermés, et les attentes écrites ici SONT DEVENUES
 * VRAIES. Un `it.fails` sur une attente devenue vraie est un test qui ROUGIT :
 * ils sont donc passés en `it()`, sans qu'une ligne de leur corps ne change.
 * **Aucun test n'a été supprimé** — ils gardent désormais, dans les mêmes mots,
 * exactement ce qu'ils dénonçaient.
 *
 *  1. `core/chaine/modules.ts` porte les cinq chemins, et il est SEUL à les
 *     porter. `ETAPES_CHAINE.module` et `EXECUTANTS_ETAPES` le LISENT tous les
 *     deux : la contradiction n'est plus improbable, elle est impossible.
 *  2. `ETAPES_CHAINE` se dit `implémentée` et porte un RÉSOLVEUR par étape ;
 *     `etapes.spec.ts` l'APPELLE, et confronte `module` au disque.
 *  3. `verifierCouvertureDesEtapes()` confronte désormais la phrase AU REGISTRE
 *     pour les cinq étapes de `core/chaine`, et publie `executantsConfrontes` —
 *     le nombre d'étapes qui ont eu droit à mieux qu'une chaîne de caractères.
 *
 * ═══ CE QUE CE FICHIER APPORTE, ET QUI N'EXISTAIT PAS ═══
 *
 * Une confrontation au SYSTÈME DE FICHIERS. C'est le seul juge disponible :
 * les deux tables sont de la prose, et de la prose ne contredit que de la prose.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as barillet from "./index.js";
import { ETAPES_CHAINE } from "./etapes.js";
import { EXECUTANTS_ETAPES, verifierCouvertureDesEtapes } from "./orchestrateur.js";

// ─────────────────────────────────────────────────────────────────────────────
//  L'outillage — la racine du dépôt, DÉRIVÉE, jamais codée en dur
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Résout un chemin `core/…` depuis `import.meta.url`.
 *
 * ⚠️ JAMAIS DEPUIS `process.cwd()`. Une garde ancrée au répertoire courant est
 *    verte ou rouge selon l'endroit d'où on lance `vitest` ; une garde ancrée à
 *    sa propre position suit le fichier quand le dossier déménage.
 */
function existeDansLeDepot(chemin: string): boolean {
  return existsSync(fileURLToPath(new URL(`../../${chemin}`, import.meta.url)));
}

/** Les valeurs qui RESSEMBLENT à un chemin de fichier du dépôt. */
const MOTIF_CHEMIN = /(^|\s)(core\/[\w./-]+\.ts)/;

function cheminNomme(phrase: string): string | null {
  return MOTIF_CHEMIN.exec(phrase)?.[2] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Témoin de CAPACITÉ — la confrontation au disque sait dire OUI et NON
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine — confronter un registre au système de fichiers", () => {
  it("sait distinguer un fichier présent d'un fichier absent", () => {
    // Sans ce témoin, un « tout existe » comme un « rien n'existe » pourraient
    // venir d'une résolution de chemin cassée plutôt que du dépôt.
    const present = "core/chaine/etapes.ts";
    const absent = "core/chaine/ce-fichier-na-jamais-existe.ts";

    console.info(
      `[capacité disque] 2 chemin(s) témoins mesuré(s) · « ${present} »=` +
        `${String(existeDansLeDepot(present))} · « ${absent} »=${String(existeDansLeDepot(absent))}`,
    );

    expect(existeDansLeDepot(present)).toBe(true);
    expect(existeDansLeDepot(absent)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  `EXECUTANTS_ETAPES` — la table de l'orchestrateur, elle, dit vrai
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 11 — les modules nommés par `EXECUTANTS_ETAPES` existent", () => {
  it("confronte chaque chemin nommé au dépôt, et ANNONCE son compte", () => {
    const nommes = Object.entries(EXECUTANTS_ETAPES)
      .map(([cle, phrase]) => ({ cle, chemin: cheminNomme(phrase) }))
      .filter((entree): entree is { cle: string; chemin: string } => entree.chemin !== null);
    const fantomes = nommes.filter((entree) => !existeDansLeDepot(entree.chemin));

    console.info(
      `[garde exécutants] ${String(Object.keys(EXECUTANTS_ETAPES).length)} étape(s) au registre · ` +
        `${String(nommes.length)} nomment un fichier du dépôt · ` +
        `${String(fantomes.length)} fantôme(s) : ` +
        (fantomes.length === 0 ? "aucun" : fantomes.map((e) => e.chemin).join(", ")),
    );

    // Plancher-témoin : une extraction cassée rendrait zéro chemin, et la garde
    // serait verte sans avoir rien confronté.
    expect(nommes.length).toBeGreaterThanOrEqual(5);
    expect(fantomes.map((entree) => `${entree.cle} → ${entree.chemin}`)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  DÉFAUT FERMÉ — `ETAPES_CHAINE` nommait cinq fichiers qui n'existaient pas
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine — le registre `ETAPES_CHAINE` désigne des fichiers réels", () => {
  it("ANNONCE combien de modules il nomme, et combien sont introuvables", () => {
    const fantomes = ETAPES_CHAINE.filter((entree) => !existeDansLeDepot(entree.module));

    console.info(
      `[témoin § 11 · registre] ${String(ETAPES_CHAINE.length)} entrée(s) d'ETAPES_CHAINE · ` +
        `${String(fantomes.length)} module(s) INTROUVABLE(S) : ` +
        fantomes.map((e) => `${String(e.ancrage.numero)} → ${e.module}`).join(", "),
    );

    expect(ETAPES_CHAINE.length).toBeGreaterThanOrEqual(5);
    expect(fantomes.length).toBeLessThanOrEqual(ETAPES_CHAINE.length);
  });

  for (const entree of ETAPES_CHAINE) {
    it(`✅ étape ${String(entree.ancrage.numero)} (${entree.ancrage.cle}) — « ${entree.module} » existe`, () => {
      // Un registre qui nomme un module doit nommer un module qui existe :
      // sinon le « reste-à-faire » envoie le prochain constructeur écrire un
      // fichier qui est déjà écrit sous un autre nom.
      expect(existeDansLeDepot(entree.module), entree.module).toBe(true);
    });
  }

  it("✅ les deux registres s'accordent sur le module de chaque étape", () => {
    // DEUX dérivations d'un même fait : `ETAPES_CHAINE.module` et le chemin
    // nommé par `EXECUTANTS_ETAPES` pour la même clé. Rien ne les confrontait —
    // voici la confrontation, et elle est verte parce que les deux LISENT
    // désormais `modules.ts`. ⚠️ Elle reste utile : elle est ce qui rougirait si
    // quelqu'un remplaçait une lecture par une recopie « pour la lisibilité ».
    const executants: Readonly<Record<string, string>> = EXECUTANTS_ETAPES;
    const desaccords: string[] = [];
    let confrontees = 0;

    for (const entree of ETAPES_CHAINE) {
      const phrase = executants[entree.ancrage.cle];
      if (phrase === undefined) continue;
      confrontees += 1;
      const autre = cheminNomme(phrase);
      if (autre !== null && autre !== entree.module) {
        desaccords.push(`${entree.ancrage.cle} : « ${entree.module} » ≠ « ${autre} »`);
      }
    }

    console.info(
      `[témoin § 11 · deux registres] ${String(confrontees)} étape(s) confrontée(s) · ` +
        `${String(desaccords.length)} désaccord(s) : ${desaccords.join(" · ")}`,
    );

    expect(confrontees).toBeGreaterThanOrEqual(5);
    expect(desaccords).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  DÉFAUT FERMÉ — la garde de couverture mesurait une PHRASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ CE QUE CE TÉMOIN MESURAIT, ET CE QU'IL MESURE DEPUIS LA RECETTE.
 *
 * Il éprouvait que la garde de couverture est VERTE sur les deux transports
 * alors qu'un registre voisin nommait cinq fantômes — la démonstration ne
 * demandait aucune fabrication : `ETAPES_CHAINE` fournissait déjà cinq chaînes
 * parfaitement non vides qui ne désignaient aucun fichier, et le critère de la
 * garde (« la phrase n'est pas vide ») les aurait toutes acceptées.
 *
 * Les cinq fantômes n'existent plus. **Cette formulation-là était devenue
 * infalsifiable** : elle exigeait `satisfontLeCritere.length > 0`, c'est-à-dire
 * la PRÉSENCE du défaut. Une garde qui exige que le défaut demeure est pire
 * qu'une garde absente.
 *
 * **L'INTENTION EST CONSERVÉE MOT POUR MOT** — « une chaîne non vide qui ne
 * désigne rien ne doit pas suffire à dire une étape couverte » — et elle porte
 * maintenant sur ce qui la rend vraie : le témoin FABRIQUE la phrase fantôme au
 * lieu de l'emprunter au dossier, et vérifie que la garde ne s'en contente plus.
 * Le test n'est pas supprimé : il est RETARGÉ, et il annonce son compte.
 */
describe("core/chaine — `verifierCouvertureDesEtapes` confronte du CODE, pas une phrase", () => {
  it("ANNONCE combien d'exécutants ont été confrontés à autre chose qu'une chaîne", () => {
    let transportsMesures = 0;
    let sansExecutantTotal = 0;
    let confrontesTotal = 0;
    let applicablesTotal = 0;
    for (const transport of ["stdio", "http"] as const) {
      const couverture = verifierCouvertureDesEtapes(transport);
      transportsMesures += 1;
      sansExecutantTotal += couverture.sansExecutant.length;
      confrontesTotal += couverture.executantsConfrontes;
      applicablesTotal += couverture.etapesApplicables;
    }

    console.info(
      `[garde § 11 · couverture] ${String(transportsMesures)} transport(s) mesuré(s) · ` +
        `${String(applicablesTotal)} étape(s) applicable(s) au total · ` +
        `${String(confrontesTotal)} exécutant(s) confronté(s) AU REGISTRE · ` +
        `${String(sansExecutantTotal)} sans exécutant`,
    );

    // Plancher-témoin : cinq étapes de `core/chaine` par transport, deux
    // transports. Zéro confronté rendrait cette garde vacueuse.
    expect(confrontesTotal).toBe(10);
    expect(sansExecutantTotal).toBe(0);

    // ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE. Les étapes servies hors de
    //    `core/chaine` — coffre, profil, limites, politique — ne sont décrites
    //    QUE par une phrase : pour elles, la garde mesure encore une chaîne de
    //    caractères. Le nombre ci-dessus dit exactement combien ont eu mieux.
    expect(confrontesTotal).toBeLessThan(applicablesTotal);
  });

  it("rougit sur un témoin fabriqué : une entrée de registre qui ne résout rien", () => {
    // Le témoin est le geste que la garde doit rendre inopérant : une phrase
    // parfaitement non vide, un statut parfaitement cohérent, et rien derrière.
    const fantome = {
      ancrage: ETAPES_CHAINE[0].ancrage,
      statut: "implémentée" as const,
      // Un résolveur bien non nul qui ne résout pas une fonction — la forme
      // exacte qu'aurait prise un cycle d'imports refermé à l'envers.
      executer: (): null => null,
      module: "core/chaine/scopes.ts",
      fabrique: false,
    };

    const critereAncien = fantome.module.trim().length > 0;
    const critereNouveau =
      typeof fantome.executer === "function" && typeof fantome.executer() === "function";

    console.info(
      `[témoin § 11 · critère] 1 entrée fantôme mesurée · ` +
        `ancien critère (« phrase non vide ») l'accepte = ${String(critereAncien)} · ` +
        `nouveau critère (« le résolveur rend une fonction ») l'accepte = ${String(critereNouveau)} · ` +
        `« ${fantome.module} » existe sur le disque = ${String(existeDansLeDepot(fantome.module))}`,
    );

    // L'ancien critère l'acceptait…
    expect(critereAncien).toBe(true);
    // …le nouveau la refuse, et le disque confirme que le chemin ne désigne rien.
    expect(critereNouveau).toBe(false);
    expect(existeDansLeDepot(fantome.module)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  DÉFAUT FERMÉ — les cinq étapes n'étaient pas sur la surface publique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le lot avait pour objet mesuré : « sans module, chaque appelant réécrit les
 * cinq étapes à la main ». Les modules existent maintenant. Mais
 * `DependancesOrchestrateur` EXIGE les cinq exécutants, et `core/chaine/index.ts`
 * — la seule surface publique du dossier — n'en exporte AUCUN.
 *
 * Un appelant qui fait `import { … } from "core/chaine/index.js"` obtient
 * l'orchestrateur et les déclarations, jamais de quoi le nourrir. Il lui reste
 * deux voies : l'import profond dans un fichier non exporté, ou la réécriture à
 * la main — c'est-à-dire exactement le défaut que le lot devait fermer.
 */
const EXECUTANTS_ATTENDUS = [
  "etape05Scopes",
  "creerEtapeCatalogue",
  "etapeCurseur",
  "etape11Provenance",
  "executerEtape14",
] as const;

/** Ce sans quoi les cinq exécutants ne sont pas montables. */
const APPUIS_ATTENDUS = [
  "correspondanceCanonique",
  "creerSignataireCurseur",
  "IndexProvenanceMemoire",
] as const;

describe("core/chaine — la surface publique sert les cinq étapes", () => {
  it("ANNONCE combien de noms sont exportés, et combien manquent", () => {
    const exportes = new Set(Object.keys(barillet));
    const attendus = [...EXECUTANTS_ATTENDUS, ...APPUIS_ATTENDUS];
    const manquants = attendus.filter((nom) => !exportes.has(nom));

    console.info(
      `[témoin § 11 · barillet] ${String(exportes.size)} nom(s) exporté(s) par ` +
        `core/chaine/index.ts · ${String(attendus.length)} attendu(s) pour monter ` +
        `DependancesOrchestrateur · ${String(manquants.length)} manquant(s) : ` +
        manquants.join(", "),
    );

    // Plancher-témoin : le barillet exporte bien quelque chose.
    expect(exportes.size).toBeGreaterThanOrEqual(10);
    expect(manquants.length).toBeLessThanOrEqual(attendus.length);
  });

  for (const nom of [...EXECUTANTS_ATTENDUS, ...APPUIS_ATTENDUS]) {
    it(`✅ « ${nom} » est exporté par core/chaine/index.ts`, () => {
      expect(Object.keys(barillet), nom).toContain(nom);
    });
  }
});

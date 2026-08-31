import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { APPEL_STEPS, ERROR_CODES } from "../types.js";
import type { AppelStep } from "../types.js";
import { ETAPE_COFFRE } from "../vault/index.js";
import { ETAPE_REFUS_PROFIL } from "../profiles/index.js";
import { ETAPE_POLITIQUE } from "../policy/index.js";
import { ETAPES_LIMITES } from "../limits/index.js";

import {
  ETAPES_CHAINE,
  ETAPES_REVENDIQUEES,
  ETAPE_CATALOGUE,
  ETAPE_CURSEUR,
  ETAPE_EXECUTION,
  ETAPE_PROVENANCE,
  ETAPE_SCOPES,
  ErreurAncrageEtape,
  PALIERS_COMPACTION,
  STATUTS_ETAPE,
  ancrerEtape,
  autorise,
  etapesNonImplementees,
  refuse,
} from "./etapes.js";
import type { AncrageEtape, EntreeChaine } from "./etapes.js";
import { CHEMINS_ETAPES_CHAINE } from "./modules.js";
import { ErreurOrchestrateurNonImplemente, orchestrerAppel } from "./orchestrateur.js";
import type { AppelEntrant, DependancesOrchestrateur, IdentiteAppelante } from "./orchestrateur.js";

/**
 * Gardes de `core/chaine`.
 *
 * Ce module ne CALCULE presque rien : il déclare. Ce qu'il y a donc à garder
 * n'est pas un résultat, c'est une PROPRIÉTÉ STRUCTURELLE — que rien n'y soit
 * écrit à la main de ce qui doit être dérivé, et que le reste-à-faire ne puisse
 * pas mentir sur lui-même.
 *
 * Chaque garde (a) rougit d'abord sur un TÉMOIN FABRIQUÉ, et (b) ANNONCE
 * combien d'éléments elle a mesurés, sous un plancher-témoin.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — l'ancrage DÉRIVE, il ne recopie pas
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine — le numéro et le code d'une étape sont DÉRIVÉS du § 11", () => {
  it("rougit sur un témoin fabriqué : une clé que `APPEL_STEPS` ne porte pas", () => {
    // Le témoin est le geste qu'on veut rendre impossible : ancrer une étape à
    // un nom inventé. Sans cette levée, `ancrerEtape` rendrait `undefined` et
    // l'étape inscrirait un `stepDenied` nul — un refus muet dans `ops_audit`.
    expect(() => ancrerEtape("curseur-signe" as never)).toThrow(ErreurAncrageEtape);
    // Le message NOMME les clés connues (§ 15, deuxième règle).
    expect(() => ancrerEtape("curseur-signe" as never)).toThrow(/curseur/);
  });

  it("donne à chaque étape de ce module le numéro ET le code du § 11", () => {
    const anomalies: string[] = [];
    let mesurees = 0;

    for (const entree of ETAPES_CHAINE) {
      mesurees += 1;
      const ancrage: AncrageEtape = entree.ancrage;
      const officielle = APPEL_STEPS.find((etape) => etape.cle === ancrage.cle);
      if (officielle === undefined) {
        anomalies.push(`« ${ancrage.cle} » n'est pas une clé d'APPEL_STEPS`);
        continue;
      }
      if (ancrage.numero !== officielle.numero) {
        anomalies.push(
          `« ${ancrage.cle} » : numéro ${String(ancrage.numero)} ≠ ${String(officielle.numero)}`,
        );
      }
      if (ancrage.code !== officielle.refus) {
        anomalies.push(
          `« ${ancrage.cle} » : code ${String(ancrage.code)} ≠ ${String(officielle.refus)}`,
        );
      }
      if (ancrage.code !== null && !(ERROR_CODES as readonly string[]).includes(ancrage.code)) {
        anomalies.push(`« ${ancrage.cle} » : code hors du § 15`);
      }
    }

    console.info(`[garde ancrage] ${String(mesurees)} étapes de core/chaine mesurées`);

    // Plancher-témoin : les cinq étapes orphelines du lot 1. Zéro mesurée
    // laisserait cette garde verte sur un module vidé.
    expect(mesurees).toBe(5);
    expect(anomalies).toEqual([]);
  });

  it("laisse VISIBLE le trou du § 15 sur l'étape 5, au lieu de le boucher", () => {
    // Le § 11 donne un 403 nu à l'étape 5, et le § 15 n'énumère AUCUN code pour
    // un scope insuffisant. Un code voisin — `policy_denied`, `unauthenticated` —
    // mentirait sur la cause. La garde fixe l'écart pour qu'il ne se referme pas
    // par accident : le jour où le CDC nomme ce code, elle rougit et on la met
    // à jour en connaissance de cause.
    expect(ETAPE_SCOPES.code).toBeNull();
    expect(ETAPE_SCOPES.statutHttp).toBe(403);
    // Les quatre autres, elles, portent un code du § 15.
    const avecCode = [ETAPE_CATALOGUE, ETAPE_CURSEUR, ETAPE_PROVENANCE, ETAPE_EXECUTION];
    console.info(`[garde codes] ${String(avecCode.length)} étapes porteuses d'un code mesurées`);
    expect(avecCode.length).toBe(4);
    for (const ancrage of avecCode) {
      expect(ancrage.code, ancrage.cle).not.toBeNull();
      expect(ERROR_CODES, ancrage.cle).toContain(ancrage.code);
    }
  });

  it("fabrique un verdict en LISANT l'ancrage — jamais un numéro à la main", () => {
    const verdictRefus = refuse(ETAPE_CURSEUR, "repartir de la première page");
    const verdictOk = autorise(ETAPE_CURSEUR, { reprise: false });

    expect(verdictRefus.etape).toBe(ETAPE_CURSEUR.numero);
    expect(verdictRefus.code).toBe(ETAPE_CURSEUR.code);
    expect(verdictOk.etape).toBe(ETAPE_CURSEUR.numero);
    // Témoin : le code d'un refus SUIT l'ancrage. Passer l'ancrage d'une autre
    // étape change le code, ce qui prouve qu'il n'est pas figé dans `refuse`.
    expect(refuse(ETAPE_PROVENANCE, "m").code).toBe(ETAPE_PROVENANCE.code);
    expect(refuse(ETAPE_PROVENANCE, "m").code).not.toBe(ETAPE_CURSEUR.code);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — le reste-à-faire ne peut pas mentir sur lui-même
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La cohérence entre `statut` et `executer`. C'est la seule chose qui empêche
 * `core/chaine` de revendiquer cinq étapes sans en exécuter aucune — c'est-à-dire
 * d'être une garde verte parce qu'elle ne mesure rien.
 */
function incoherences(entrees: readonly EntreeChaine[]): readonly string[] {
  const anomalies: string[] = [];
  for (const entree of entrees) {
    if (!(STATUTS_ETAPE as readonly string[]).includes(entree.statut)) {
      anomalies.push(`« ${entree.ancrage.cle} » : statut « ${String(entree.statut)} » inconnu`);
      continue;
    }
    if (entree.statut === "implémentée" && entree.executer === null) {
      anomalies.push(
        `« ${entree.ancrage.cle} » se dit implémentée et ne porte aucune fonction : ` +
          "la garde de propriété du § 11 verdirait sur une étape qui ne s'exécute pas",
      );
    }
    if (entree.statut === "déclarée" && entree.executer !== null) {
      anomalies.push(
        `« ${entree.ancrage.cle} » se dit déclarée et porte pourtant une fonction : ` +
          "le reste-à-faire annonce plus de travail qu'il n'en reste",
      );
    }
    // ⚠️ ON APPELLE LE RÉSOLVEUR. Sans cet appel, la seule chose mesurée serait
    //    « le champ n'est pas nul » — or un résolveur est une fonction fléchée,
    //    donc jamais nul : la garde serait verte quoi qu'il arrive. Ce qu'on veut
    //    savoir, c'est si la liaison qu'il ferme sur elle est bien initialisée, et
    //    seul l'appel le dit. C'est aussi la seule chose qui rougirait si le cycle
    //    d'imports d'`etapes.ts` se refermait un jour dans le mauvais ordre.
    if (entree.statut === "implémentée" && entree.executer !== null) {
      let resolu: unknown;
      try {
        // `executer` est typé `unknown` À DESSEIN dans `EntreeChaine` — c'est ce
        // qui empêche un transtypage à chaque lecture. Le rétrécir ICI, dans la
        // garde, est le seul endroit où il faut le faire, et il est protégé par
        // le `typeof` juste avant.
        const resolveur = entree.executer as () => unknown;
        resolu = typeof entree.executer === "function" ? resolveur() : undefined;
      } catch (erreur: unknown) {
        anomalies.push(
          `« ${entree.ancrage.cle} » : le résolveur LÈVE (${String(erreur)}) — ` +
            "symptôme d'un cycle d'imports refermé dans le mauvais ordre",
        );
        continue;
      }
      if (typeof resolu !== "function") {
        anomalies.push(
          `« ${entree.ancrage.cle} » : le résolveur ne rend pas une fonction mais ` +
            `« ${typeof resolu} » — le registre annonce une étape qui ne s'exécute pas`,
        );
      }
    }
  }
  return anomalies;
}

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

describe("core/chaine — déclaré n'est pas implémenté, et le registre ne peut pas le cacher", () => {
  it("rougit sur un témoin fabriqué qui se dit implémenté sans fonction", () => {
    const temoin: readonly EntreeChaine[] = [
      {
        ancrage: ETAPE_CURSEUR,
        statut: "implémentée",
        executer: null,
        module: "témoin",
        fabrique: false,
      },
    ];
    expect(incoherences(temoin)).not.toHaveLength(0);
  });

  it("rougit sur un témoin fabriqué qui se dit déclaré et porte une fonction", () => {
    const temoin: readonly EntreeChaine[] = [
      {
        ancrage: ETAPE_CURSEUR,
        statut: "déclarée",
        executer: (): null => null,
        module: "témoin",
        fabrique: false,
      },
    ];
    expect(incoherences(temoin)).not.toHaveLength(0);
  });

  it("rougit sur un témoin fabriqué dont le RÉSOLVEUR ne rend pas une fonction", () => {
    // Le témoin le plus important des trois : c'est la forme exacte qu'aurait
    // prise le registre si le cycle d'imports s'était refermé dans le mauvais
    // ordre — un résolveur bien présent, bien non nul, qui ne résout rien.
    const temoin: readonly EntreeChaine[] = [
      {
        ancrage: ETAPE_CURSEUR,
        statut: "implémentée",
        executer: (): null => null,
        module: "témoin",
        fabrique: false,
      },
    ];
    expect(incoherences(temoin)).not.toHaveLength(0);
    expect(incoherences(temoin).join(" ")).toMatch(/résolveur/);
  });

  it("rougit sur un témoin fabriqué dont le RÉSOLVEUR lève", () => {
    const temoin: readonly EntreeChaine[] = [
      {
        ancrage: ETAPE_CURSEUR,
        statut: "implémentée",
        executer: (): never => {
          throw new ReferenceError("Cannot access 'etapeCurseur' before initialization");
        },
        module: "témoin",
        fabrique: false,
      },
    ];
    expect(incoherences(temoin).join(" ")).toMatch(/LÈVE/);
  });

  it("tient le registre réel cohérent, et ANNONCE ce qui reste à écrire", () => {
    const restantes = etapesNonImplementees();

    console.info(
      `[garde reste-à-faire] ${String(ETAPES_CHAINE.length)} étapes déclarées, ` +
        `${String(restantes.length)} encore sans implémentation : ` +
        restantes
          .map((e) => `${String(e.ancrage.numero)} (${e.ancrage.cle} → ${e.module})`)
          .join(", "),
    );

    expect(incoherences(ETAPES_CHAINE)).toEqual([]);
    // Plancher-témoin : le registre mesure bien cinq entrées.
    expect(ETAPES_CHAINE.length).toBe(5);
    // ⚠️ CE N'EST PAS UNE ATTENTE SUR LE NOMBRE RESTANT. Le jour où une étape
    //    est implémentée, ce compte baisse et la garde reste verte — c'est
    //    voulu : elle garde la COHÉRENCE, pas l'avancement. L'avancement se lit
    //    dans la ligne ci-dessus, qui est le rapport.
    expect(restantes.length).toBeLessThanOrEqual(ETAPES_CHAINE.length);
  });

  // ───────────────────────────────────────────────────────────────────────────
  //  Le champ `module` désigne-t-il quelque chose ?
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * ⚠️ LA GARDE QUI MANQUAIT, ET CE QU'ELLE A LAISSÉ PASSER.
   *
   * Pendant tout le lot, `ETAPES_CHAINE` a nommé cinq fichiers qui n'existaient
   * pas — `core/chaine/scopes.ts`, `catalogue.ts`, `curseur.ts`,
   * `provenance.ts`, `execution.ts` — pendant que les cinq vrais existaient sous
   * d'autres noms. La garde de cohérence statut/`executer` restait VERTE :
   * « déclarée » + `null` est parfaitement cohérent. Un reste-à-faire qui ment
   * de cette façon-là n'était attrapé par rien, et il aurait envoyé le
   * constructeur suivant écrire un fichier déjà écrit.
   *
   * La prose ne contredit que la prose. Le seul juge disponible est le SYSTÈME
   * DE FICHIERS, et le voici.
   */
  it("rougit sur un témoin fabriqué : un chemin de module qui ne désigne rien", () => {
    // Sans ce témoin, un « tout existe » pourrait venir d'une résolution de
    // chemin cassée qui rendrait `true` pour n'importe quoi.
    expect(existeDansLeDepot("core/chaine/etapes.ts")).toBe(true);
    expect(existeDansLeDepot("core/chaine/scopes.ts")).toBe(false);
    expect(existeDansLeDepot("core/chaine/ce-fichier-na-jamais-existe.ts")).toBe(false);
  });

  it("confronte le `module` de chaque entrée AU DISQUE, et annonce son compte", () => {
    let confrontes = 0;
    const fantomes: string[] = [];
    for (const entree of ETAPES_CHAINE) {
      confrontes += 1;
      if (!existeDansLeDepot(entree.module)) {
        fantomes.push(`${String(entree.ancrage.numero)} → ${entree.module}`);
      }
    }

    console.info(
      `[garde modules] ${String(confrontes)} chemin(s) de module confronté(s) au dépôt · ` +
        `${String(fantomes.length)} fantôme(s) : ` +
        (fantomes.length === 0 ? "aucun" : fantomes.join(", ")),
    );

    // Plancher-témoin : une boucle qui ne tournerait pas rendrait zéro confronté
    // et zéro fantôme — verte pour n'avoir rien regardé.
    expect(confrontes).toBe(5);
    expect(fantomes).toEqual([]);
  });

  it("ne laisse `module` prendre sa valeur QUE dans `modules.ts`", () => {
    // La confrontation au disque dit qu'un chemin existe. Elle ne dit pas que
    // les DEUX registres nomment le même. C'est `modules.ts` qui le garantit —
    // structurellement, puisque les deux le lisent — et cette garde vérifie que
    // la lecture n'a pas été remplacée par une recopie.
    const chemins = new Set(CHEMINS_ETAPES_CHAINE);
    const horsTable = ETAPES_CHAINE.filter((entree) => !chemins.has(entree.module));

    console.info(
      `[garde source unique] ${String(ETAPES_CHAINE.length)} entrée(s) mesurée(s) · ` +
        `${String(chemins.size)} chemin(s) dans modules.ts · ` +
        `${String(horsTable.length)} entrée(s) hors table`,
    );

    expect(chemins.size).toBe(5);
    expect(horsTable.map((entree) => entree.ancrage.cle)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — plus AUCUNE étape du § 11 n'est orpheline
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 11 — chaque étape applicable au JSON-RPC a un module propriétaire", () => {
  /** Ce que chaque module revendique. Aucune liste écrite : que des imports. */
  function revendications(): ReadonlySet<AppelStep> {
    return new Set<AppelStep>([
      ETAPE_COFFRE, // core/vault      — étape 0 (§ 23)
      ETAPE_REFUS_PROFIL, // core/profiles   — étape 7
      ETAPE_POLITIQUE, // core/policy     — étape 10
      ...ETAPES_LIMITES, // core/limits     — étapes 8, 12, 13
      ...ETAPES_REVENDIQUEES, // core/chaine     — étapes 5, 6, 9, 11, 14
    ]);
  }

  it("rougit sur un témoin fabriqué : un module qui cesse de revendiquer son étape", () => {
    // Le témoin retire `core/chaine` de la liste. Sans lui, on ne saurait pas
    // si le vert vient de la couverture ou de l'aveuglement du calcul.
    const amputee = new Set<AppelStep>([ETAPE_COFFRE, ETAPE_REFUS_PROFIL, ETAPE_POLITIQUE]);
    // Pas d'annotation `EtapeAppel[]` : elle élargirait `numero` en `number` et
    // le `Set<AppelStep>` cesserait de fermer quoi que ce soit.
    const applicables = APPEL_STEPS.filter((etape) => !etape.httpSeul);
    const orphelines = applicables.filter((etape) => !amputee.has(etape.numero));
    expect(orphelines.length).toBeGreaterThan(0);
  });

  it("ne laisse AUCUNE étape orpheline, et dit combien elle en a confrontées", () => {
    const revendiquees = revendications();
    // Pas d'annotation `EtapeAppel[]` : elle élargirait `numero` en `number` et
    // le `Set<AppelStep>` cesserait de fermer quoi que ce soit.
    const applicables = APPEL_STEPS.filter((etape) => !etape.httpSeul);
    const orphelines = applicables.filter((etape) => !revendiquees.has(etape.numero));

    console.info(
      `[garde propriété] ${String(applicables.length)} étapes applicables au JSON-RPC, ` +
        `${String(revendiquees.size)} revendiquées par un module, ` +
        `${String(orphelines.length)} orpheline(s)`,
    );

    // Plancher-témoin : le § 11 en compte dix applicables au JSON-RPC, plus
    // l'étape 0 du § 23. Un `APPEL_STEPS` vidé rendrait cette garde vacueuse.
    expect(applicables.length).toBeGreaterThanOrEqual(11);
    expect(revendiquees.size).toBeGreaterThanOrEqual(11);
    expect(orphelines.map((etape) => `${String(etape.numero)} (${etape.cle})`)).toEqual([]);

    // ⚠️ CE QUE CETTE GARDE PROUVE, ET CE QU'ELLE NE PROUVE PAS. Elle prouve
    //    qu'aucune étape n'est sans PROPRIÉTAIRE — donc que plus aucun appelant
    //    n'a de raison d'écrire un numéro d'étape à la main. Elle ne prouve
    //    RIEN sur l'exécution : cinq de ces étapes ne sont que déclarées, et
    //    c'est la garde 2 qui le mesure. Les deux ensemble disent la vérité ;
    //    celle-ci seule dirait trop.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — un câblage incomplet LÈVE, il ne rend rien
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ CE QUE CETTE GARDE MESURAIT, ET CE QU'ELLE MESURE DEPUIS QUE
 *    L'ORCHESTRATEUR A UN CORPS.
 *
 * Elle éprouvait qu'`orchestrerAppel` LÈVE parce qu'elle n'avait PAS DE CORPS.
 * Le corps existe désormais (`core/chaine/orchestrateur.ts`) : cette
 * formulation-là était devenue fausse, et une garde fausse est pire qu'une
 * garde absente.
 *
 * **L'INTENTION EST CONSERVÉE MOT POUR MOT** — « une ossature qui rendrait
 * “autorisé” servirait un appel qu'aucune garde n'a examiné ; une ossature qui
 * rendrait “refusé” écrirait dans `ops_audit` un refus que personne n'a
 * prononcé, et la métrique du § 24 compterait des refus imaginaires » — et elle
 * porte maintenant sur ce qui la rend vraie : un CÂBLAGE INCOMPLET. Un objet de
 * dépendances vide n'a pas de transport, donc aucune étape ne peut être dite
 * exécutée par qui que ce soit.
 *
 * Le test n'est pas supprimé : il est RETARGÉ, et il annonce son compte.
 */
describe("core/chaine — un orchestrateur mal câblé lève, et il le dit", () => {
  it("lève au lieu de rendre un verdict — ni autorisé, ni refusé", async () => {
    const identite = {} as IdentiteAppelante;
    const appel = {} as AppelEntrant;
    // Aucun transport, aucun port : le socle ne sait de PERSONNE qu'il exécute
    // une étape. Fail-closed.
    const dependances = {} as DependancesOrchestrateur;

    let levee: ErreurOrchestrateurNonImplemente | null = null;
    try {
      await orchestrerAppel(identite, appel, dependances);
    } catch (erreur: unknown) {
      levee = erreur instanceof ErreurOrchestrateurNonImplemente ? erreur : null;
    }

    console.info(
      `[garde câblage] ${String(levee?.etapesMesurees ?? 0)} étape(s) confrontée(s) · ` +
        `${String(levee?.etapesManquantes.length ?? 0)} sans exécutant annoncée(s)`,
    );

    expect(levee).not.toBeNull();
    // Les deux nombres sont DÉRIVÉS d'`APPEL_STEPS`, jamais écrits : sur un
    // transport inconnu, AUCUNE étape n'a d'exécutant connu.
    expect(levee?.etapesMesurees).toBe(APPEL_STEPS.length);
    expect(levee?.etapesManquantes).toEqual(APPEL_STEPS.map((etape) => etape.numero));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — la cascade du § 13.3 a quatre paliers, et ils sont ORDONNÉS
// ─────────────────────────────────────────────────────────────────────────────

describe("core/chaine — la cascade de compaction du § 13.3", () => {
  it("porte quatre paliers de seuils strictement croissants", () => {
    // L'ordre EST la cascade : on ne passe au palier suivant que si le
    // précédent n'a pas suffi. Deux seuils inversés produiraient une charge
    // agrégée là où un simple raccourcissement suffisait, sans qu'aucune
    // réponse ne le dise.
    let precedent = 0;
    let mesures = 0;
    for (const palier of PALIERS_COMPACTION) {
      expect(palier.seuilMax, palier.cle).toBeGreaterThan(precedent);
      precedent = palier.seuilMax;
      mesures += 1;
    }

    console.info(`[garde cascade] ${String(mesures)} paliers mesurés`);

    expect(mesures).toBe(4);
    // Le dernier palier n'a pas de borne haute : au-delà de 300 %, c'est
    // l'agrégat ou `result_too_large`, jamais un cinquième palier implicite.
    expect(PALIERS_COMPACTION[PALIERS_COMPACTION.length - 1]?.seuilMax).toBe(
      Number.POSITIVE_INFINITY,
    );
    // Les seuils du § 13.3, confrontés au document : 100 %, 150 %, 300 %.
    expect(PALIERS_COMPACTION.map((palier) => palier.seuilMax).slice(0, 3)).toEqual([1, 1.5, 3]);
  });
});

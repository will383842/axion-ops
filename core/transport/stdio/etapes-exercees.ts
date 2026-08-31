/**
 * `core/transport/stdio/etapes-exercees.ts` — **LE TRANSPORT NE CONTOURNE
 * AUCUNE ÉTAPE, ET ON LE MESURE DE DEUX FAÇONS QUI NE SE RECOUVRENT PAS.**
 *
 * ═══ LE DÉFAUT QUE CE FICHIER EXISTE POUR RENDRE VISIBLE ═══
 *
 * L'ADR 0025 pose trois interdits de CONSTRUCTION. Deux tiennent tout seuls :
 * un transport ne peut pas fabriquer une identité (le type marqué de
 * `SessionId`), et une étape sans exécutant fait refuser le démarrage. Le
 * troisième — « un transport n'importe aucun module d'étape » — ne tient par
 * aucun type : rien, en TypeScript, n'empêche `serveur.ts` d'importer
 * `etape-05-scopes.js` et de décider des scopes à côté du noyau.
 *
 * Ce qui le tient est donc une garde, et une garde ne vaut que si elle rougit.
 * Ce fichier en porte le CORPS, en fonctions **pures de ce qu'on leur donne** —
 * jamais de lecture de disque, jamais de lecture d'un registre : c'est ce qui
 * rend le témoin possible. Le témoin fabrique un transport qui importe un module
 * d'étape, et un jeu de traces où une étape manque, et exige une anomalie sur
 * chacun. Une garde qu'on ne peut pas mutiler est une garde dont personne ne
 * sait ce qu'elle mesure.
 *
 * ═══ DEUX MESURES, ET CE QUE CHACUNE NE VOIT PAS ═══
 *
 *  · **{@link confronterLesImports}** lit le graphe d'imports du transport et le
 *    confronte à un ensemble interdit **DÉRIVÉ d'`EXECUTANTS_ETAPES`**. Elle voit
 *    un module d'étape appelé depuis le transport. Elle **ne voit pas** un
 *    transport qui appelle bien le noyau mais lui ment sur ce qu'il a établi
 *    (ADR 0029), ni une étape rejouée à la main sans import — par une copie de
 *    son corps ;
 *  · **{@link confronterLesEtapesExercees}** confronte les étapes réellement
 *    FRANCHIES par des appels réels à celles que la colonne du § 11 attribue au
 *    transport. Elle voit une étape que la chaîne n'atteint jamais — donc une
 *    garde qui ne mord sur rien. Elle **ne voit pas** un import ; et elle ne dit
 *    rien tant qu'on ne lui donne pas de traces, ce que son compte d'appels
 *    mesurés annonce.
 *
 * Aucune des deux ne subsume l'autre, et c'est pourquoi il y en a deux.
 *
 * ⚠️ **LA BORNE DES DEUX, ÉCRITE AVEC ELLES.** L'ensemble interdit porte sur les
 *    imports **DIRECTS** du transport. `orchestrateur.ts` importe les cinq
 *    modules d'étape — c'est son métier —, et le transport l'importe : les cinq
 *    sont donc atteints TRANSITIVEMENT. Ce n'est pas un contournement, c'est le
 *    noyau. Ce que la garde refuse est le chemin qui COURT-CIRCUITE le noyau,
 *    et un chemin transitif par le noyau n'en est pas un.
 */

import { APPEL_STEPS } from "../../types.js";
import type { AppelStep } from "../../types.js";
import { EXECUTANTS_ETAPES, colonneDuTransport } from "../../chaine/orchestrateur.js";
import type { Transport } from "../../chaine/orchestrateur.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENSEMBLE INTERDIT — DÉRIVÉ, JAMAIS ÉCRIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le motif qui extrait un chemin de module d'une phrase d'`EXECUTANTS_ETAPES`.
 *
 * ⚠️ **LA TABLE EST DE LA PROSE, ET LA DÉRIVATION L'ASSUME.** `EXECUTANTS_ETAPES`
 *    mêle des chemins (`core/chaine/etape-05-scopes.ts`, lus dans
 *    `MODULES_ETAPES_CHAINE`), des noms de dossier (`core/vault`, `core/limits`)
 *    et des phrases sans module du tout (« transport HTTP — hors
 *    orchestrateur »). Extraire est donc faillible ; c'est pour cela que
 *    {@link modulesInterditsAuTransport} ANNONCE combien d'entrées elle a lues et
 *    combien n'ont livré aucun module. Un extracteur qui cesserait de mordre
 *    ferait tomber le premier compte à zéro, et le plancher-témoin le dirait.
 */
const MOTIF_DE_MODULE = /^(core\/[a-z0-9-]+(?:\/[a-z0-9.-]+\.ts)?)/;

/** Ce que la dérivation de l'ensemble interdit rend. Des noms ET des nombres. */
export interface EnsembleInterdit {
  /** Les préfixes de module qu'un transport ne doit pas importer directement. */
  readonly modules: readonly string[];
  /** Entrées d'`EXECUTANTS_ETAPES` parcourues. Un zéro est le pire des verts. */
  readonly entreesLues: number;
  /**
   * Entrées dont la phrase ne nomme AUCUN module de ce dépôt — les quatre étapes
   * « HTTP seul », qui renvoient au transport lui-même. Elles sont COMPTÉES
   * plutôt qu'écartées en silence : leur nombre est une propriété du § 11, et
   * s'il changeait sans que personne ne l'ait décidé, ce compte le dirait.
   */
  readonly entreesSansModule: number;
}

/**
 * L'ensemble des modules qu'un transport ne peut pas importer directement,
 * **dérivé d'`EXECUTANTS_ETAPES`**.
 *
 * ⚠️ **`core/chaine/orchestrateur.ts` N'EN FAIT PAS PARTIE, ET C'EST LE POINT.**
 *    C'est le noyau : le transport DOIT l'atteindre. Ce que l'ensemble refuse
 *    est chacun des propriétaires d'étape — les cinq modules de `core/chaine`,
 *    et les quatre dossiers (`core/vault`, `core/profiles`, `core/limits`,
 *    `core/policy`) qui portent les autres. Une liste écrite à la main aurait
 *    divergé au premier module d'étape ajouté, et la divergence aurait été
 *    muette.
 *
 * ⚠️ **`core/chaine/etapes.ts` N'Y EST PAS NON PLUS, ET C'EST UNE BORNE.** Il
 *    DÉCLARE les cinq étapes sans en exécuter aucune, si bien qu'aucune entrée
 *    ne le nomme et que la dérivation ne peut pas l'atteindre. Un transport qui
 *    l'importerait pour un TYPE ne contournerait rien ; s'il en importait une
 *    VALEUR, cette garde-ci ne le verrait pas. C'est la seconde mesure —
 *    {@link confronterLesEtapesExercees} — qui reste alors la seule à parler.
 */
export function modulesInterditsAuTransport(): EnsembleInterdit {
  const modules = new Set<string>();
  let entreesLues = 0;
  let entreesSansModule = 0;

  for (const phrase of Object.values(EXECUTANTS_ETAPES)) {
    entreesLues += 1;
    const trouve = MOTIF_DE_MODULE.exec(phrase);
    if (trouve === null) {
      entreesSansModule += 1;
      continue;
    }
    const module = trouve[1];
    if (module === undefined) {
      entreesSansModule += 1;
      continue;
    }
    modules.add(module);
  }

  return { modules: [...modules].sort(), entreesLues, entreesSansModule };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA PREMIÈRE MESURE — LE GRAPHE D'IMPORTS
// ═════════════════════════════════════════════════════════════════════════════

/** Un fichier soumis à la garde — son chemin depuis la racine, et son source BRUT. */
export interface FichierDuTransport {
  readonly chemin: string;
  readonly source: string;
}

/** Ce que la garde d'imports rend. */
export interface RapportDImports {
  readonly fichiersLus: number;
  /** Clauses d'import lues, toutes destinations confondues. */
  readonly importsLus: number;
  /** Imports résolus vers un module de ce dépôt. Les paquets tiers n'en sont pas. */
  readonly importsInternes: number;
  readonly modulesInterditsConfrontes: number;
  /** Une ligne par infraction : le fichier, et le module d'étape qu'il atteint. */
  readonly infractions: readonly string[];
}

/** Toutes les formes d'import qui portent un spécificateur, y compris `export … from`. */
const MOTIF_IMPORT = /(?:^|\n)\s*(?:import|export)\b[^\n;]*?from\s*["']([^"']+)["']/g;
const MOTIF_IMPORT_NU = /(?:^|\n)\s*import\s*["']([^"']+)["']/g;

/** Retire les commentaires — un import CITÉ en prose n'est pas un import. */
function sansProse(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
}

/**
 * Résout un spécificateur relatif en chemin depuis la racine du dépôt.
 *
 * ⚠️ **L'EXTENSION EST NORMALISÉE, ET SANS ELLE LA GARDE NE MORDRAIT JAMAIS.**
 *    `verbatimModuleSyntax` + `nodenext` obligent à écrire `./etape-05-scopes.js`
 *    pour atteindre `etape-05-scopes.ts`. Une confrontation à l'ensemble interdit
 *    — qui, lui, porte des `.ts`, parce qu'il est dérivé de `MODULES_ETAPES_CHAINE` —
 *    ne trouverait donc **rien**, jamais, et resterait verte pour cette seule
 *    raison. C'est le genre de faux vert que ce dépôt compte.
 */
export function resoudreDepuisLaRacine(
  cheminDuFichier: string,
  specificateur: string,
): string | null {
  if (!specificateur.startsWith(".")) return null;
  const segments = cheminDuFichier.split("/");
  segments.pop();
  for (const morceau of specificateur.split("/")) {
    if (morceau === "." || morceau === "") continue;
    if (morceau === "..") {
      segments.pop();
      continue;
    }
    segments.push(morceau);
  }
  return segments.join("/").replace(/\.(?:js|ts)$/, "");
}

/**
 * Confronte le graphe d'imports de fichiers DONNÉS à un ensemble interdit DONNÉ.
 *
 * Pure des deux côtés : c'est ce qui permet au témoin de lui remettre un fichier
 * FABRIQUÉ qui importe `etape-14-execution.js`, et d'exiger exactement une
 * infraction qui le NOMME.
 */
export function confronterLesImports(
  fichiers: readonly FichierDuTransport[],
  interdits: readonly string[],
): RapportDImports {
  const prefixes = interdits.map((module) => module.replace(/\.(?:js|ts)$/, ""));
  const infractions: string[] = [];
  let importsLus = 0;
  let importsInternes = 0;

  for (const fichier of fichiers) {
    const nu = sansProse(fichier.source);
    const specificateurs: string[] = [];
    for (const motif of [MOTIF_IMPORT, MOTIF_IMPORT_NU]) {
      motif.lastIndex = 0;
      let trouve = motif.exec(nu);
      while (trouve !== null) {
        const specificateur = trouve[1];
        if (specificateur !== undefined) specificateurs.push(specificateur);
        trouve = motif.exec(nu);
      }
    }

    for (const specificateur of specificateurs) {
      importsLus += 1;
      const cible = resoudreDepuisLaRacine(fichier.chemin, specificateur);
      if (cible === null) continue;
      importsInternes += 1;
      for (const prefixe of prefixes) {
        // Égalité de module, ou appartenance au dossier : `core/limits` doit
        // attraper `core/limits/quota`, et `core/limitsbis` ne doit pas l'être.
        if (cible === prefixe || cible.startsWith(`${prefixe}/`)) {
          infractions.push(
            `${fichier.chemin} importe ${cible} — module d'étape du § 11 : le transport ` +
              "refait la chaîne à côté du noyau (ADR 0025, interdit n° 2)",
          );
        }
      }
    }
  }

  return {
    fichiersLus: fichiers.length,
    importsLus,
    importsInternes,
    modulesInterditsConfrontes: prefixes.length,
    infractions,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA SECONDE MESURE — LES ÉTAPES RÉELLEMENT FRANCHIES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'un appel a laissé derrière lui, du point de vue des étapes. C'est la
 * projection de `TraceOrchestration` dont cette garde a besoin, et rien de plus :
 * la déclarer ici plutôt que d'importer la trace entière évite d'exiger du témoin
 * qu'il fabrique quinze champs pour en éprouver deux.
 */
export interface TraceDEtapes {
  readonly etapesFranchies: readonly AppelStep[];
  readonly etapeRefusante: AppelStep | null;
  /** Ce que le TRANSPORT a établi avant le noyau. Vide en stdio. */
  readonly etapesAmont: readonly AppelStep[];
}

/**
 * Les étapes qu'une trace a fait toucher — amont, franchies, et celle qui a
 * refusé. **Une seule dérivation de ce fait, et le serveur l'emploie aussi.**
 *
 * ⚠️ **L'ÉTAPE REFUSANTE COMPTE COMME EXERCÉE, ET C'EST LA MOITIÉ DE LA
 *    MESURE.** Une étape ne se montre vivante qu'en refusant ; ne compter que
 *    les franchies rendrait l'épreuve impossible à satisfaire — un appel qui
 *    franchit tout ne refuse nulle part, et un appel refusé à l'étape 5 ne
 *    franchit rien au-delà.
 */
export function etapesDUneTrace(trace: TraceDEtapes): readonly AppelStep[] {
  const vues: AppelStep[] = [...trace.etapesAmont, ...trace.etapesFranchies];
  if (trace.etapeRefusante !== null) vues.push(trace.etapeRefusante);
  return vues;
}

/** Le verdict de la couverture réelle. Des NOMBRES et des noms. */
export interface RapportDEtapesExercees {
  readonly transport: Transport;
  /** Appels confrontés. **Zéro appel ⇒ la garde est ROUGE : le compte le dit.** */
  readonly appelsMesures: number;
  /** Ce que la colonne du § 11 attribue à ce transport. */
  readonly applicables: number;
  /** Combien d'étapes applicables ont été franchies ou ont refusé au moins une fois. */
  readonly exercees: number;
  /** Les étapes applicables qu'aucun appel n'a jamais atteintes. */
  readonly jamaisExercees: readonly AppelStep[];
  /**
   * Les étapes exercées que la colonne dit NON applicables à ce transport.
   *
   * ⚠️ **C'EST LE SENS QU'ON OUBLIE, ET C'EST LE PLUS GRAVE DES DEUX.** Une
   *    étape manquante est une garde qui ne mord pas ; une étape en TROP est une
   *    garde qui a été rejouée là où elle n'a pas lieu d'être — un `Host` validé
   *    en stdio, par exemple, où il n'y a pas d'hôte à valider et où la valeur
   *    confrontée ne pourrait venir que de l'appelant.
   */
  readonly horsColonne: readonly AppelStep[];
  readonly anomalies: readonly string[];
}

/**
 * Confronte les étapes RÉELLEMENT exercées à la colonne du § 11.
 *
 * ⚠️ **ELLE NE PEUT PAS ÊTRE VERTE POUR RIEN, ET C'EST TENU DEUX FOIS.** Sans
 *    étape exercée, `jamaisExercees` vaut la colonne entière et la garde est
 *    rouge d'emblée ; et `appelsMesures` à zéro est une anomalie À PART ENTIÈRE,
 *    parce qu'une liste d'étapes fabriquée à la main pourrait satisfaire la
 *    première condition sans qu'un seul appel ait traversé le socle. Le vert ne
 *    s'obtient qu'en exerçant CHAQUE étape applicable par des appels RÉELS, ce
 *    qui est précisément l'épreuve.
 */
export function confronterLesEtapesExercees(
  transport: Transport,
  etapesExercees: Iterable<AppelStep>,
  appelsMesures: number,
): RapportDEtapesExercees {
  const colonne = colonneDuTransport(transport);
  const applicables = new Set<AppelStep>(colonne.etapesApplicables);
  const nonApplicables = new Set<AppelStep>(colonne.etapesNonApplicables);

  const vues = new Set<AppelStep>(etapesExercees);

  const jamaisExercees = [...applicables].filter((etape) => !vues.has(etape)).sort((a, b) => a - b);
  const horsColonne = [...vues].filter((etape) => nonApplicables.has(etape)).sort((a, b) => a - b);

  const anomalies: string[] = [];
  for (const etape of jamaisExercees) {
    const libelle = APPEL_STEPS.find((candidate) => candidate.numero === etape)?.libelle ?? "?";
    anomalies.push(
      `étape ${String(etape)} (« ${libelle} ») applicable au transport « ${transport} » et ` +
        "JAMAIS exercée : la chaîne servie est plus courte d'une garde que celle du § 11",
    );
  }
  for (const etape of horsColonne) {
    const libelle = APPEL_STEPS.find((candidate) => candidate.numero === etape)?.libelle ?? "?";
    anomalies.push(
      `étape ${String(etape)} (« ${libelle} ») exercée alors que la colonne du § 11 ne ` +
        `l'applique PAS au transport « ${transport} » — une garde rejouée hors de son lieu`,
    );
  }

  if (appelsMesures === 0) {
    anomalies.push(
      `aucun appel mesuré sur le transport « ${transport} » : cette garde ne peut rien dire, ` +
        "et un verdict rendu sur zéro appel serait vert pour la pire des raisons",
    );
  }

  return {
    transport,
    appelsMesures,
    applicables: applicables.size,
    exercees: [...vues].filter((etape) => applicables.has(etape)).length,
    jamaisExercees,
    horsColonne,
    anomalies,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE CONTRÔLE DE MONTAGE — ce que le transport DÉCLARE prendre en charge
// ═════════════════════════════════════════════════════════════════════════════

/** Lève au MONTAGE : le transport prend en charge des étapes que sa colonne ne lui donne pas. */
export class ErreurDeColonneDuTransport extends Error {
  constructor(
    readonly transport: Transport,
    readonly enTrop: readonly AppelStep[],
    readonly manquantes: readonly AppelStep[],
  ) {
    super(
      `Le transport « ${transport} » déclare une prise en charge d'étapes qui s'écarte de la ` +
        `colonne du § 11 : ${String(enTrop.length)} en trop (${enTrop.join(", ") || "aucune"}), ` +
        `${String(manquantes.length)} manquante(s) (${manquantes.join(", ") || "aucune"}). ` +
        "Le socle ne démarre pas : servir un appel dans cet état, c'est servir une chaîne " +
        "dont personne ne sait où elle décide.",
    );
    this.name = "ErreurDeColonneDuTransport";
  }
}

/**
 * Confronte, AU MONTAGE, ce que le transport déclare établir lui-même à ce que
 * la colonne du § 11 lui attribue en amont.
 *
 * ⚠️ **CE CONTRÔLE PARAÎT TAUTOLOGIQUE EN stdio, ET IL NE L'EST PAS.** La
 *    colonne rend `etapesAmont: []` pour stdio, et le transport déclare `[]` :
 *    les deux valent le vide, et on peut croire que rien n'est mesuré. Ce qui est
 *    mesuré est le jour où l'un des deux cesse d'être vide — un contrôle de
 *    `Host` ajouté au démon stdio et honnêtement déclaré, ou une étape que le
 *    § 11 rendrait un jour « stdio seul ». La confrontation rougit alors AVANT le
 *    premier appel, plutôt qu'au premier audit.
 */
export function verifierLaColonneDuTransport(
  transport: Transport,
  priseEnCharge: readonly AppelStep[],
): void {
  const amont = new Set<AppelStep>(colonneDuTransport(transport).etapesAmont);
  const declarees = new Set<AppelStep>(priseEnCharge);
  const enTrop = [...declarees].filter((etape) => !amont.has(etape)).sort((a, b) => a - b);
  const manquantes = [...amont].filter((etape) => !declarees.has(etape)).sort((a, b) => a - b);
  if (enTrop.length > 0 || manquantes.length > 0) {
    throw new ErreurDeColonneDuTransport(transport, enTrop, manquantes);
  }
}

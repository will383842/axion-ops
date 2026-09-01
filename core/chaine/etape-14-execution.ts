/**
 * `core/chaine/etape-14-execution.ts` — ÉTAPE 14 : EXÉCUTION, COMPACTION, MASQUAGE.
 *
 * Implémente `EtapeExecution` de `./etapes.ts`, et rien d'autre. Le numéro et le
 * code de refus sont LUS dans `ETAPE_EXECUTION`, les seuils de la cascade dans
 * `PALIERS_COMPACTION` : ce fichier n'écrit ni `14`, ni `result_too_large`, ni
 * `1.5`, ni `3`.
 *
 * ═══ CE QUE LE § 13.3 DEMANDE, ET CE QU'IL NE DIT PAS ═══
 *
 *   < 150 % du plafond  → raccourcir les champs de `compaction.free`
 *   150 – 300 %         → retirer les champs de `compaction.tier2`
 *   > 300 %             → mode agrégat sur `compaction.aggregateBy`
 *   incompactable       → `result_too_large`, AVEC une indication de filtrage
 *
 * La cascade est DÉRIVÉE des annotations du manifeste : **le socle ne connaît
 * aucun métier, il ne devine pas quels champs raccourcir** (§ 13.3, et le
 * commentaire d'`AnnotationsCompaction`). Un outil qui n'annote rien n'a aucune
 * prise, et tout dépassement finit en refus — ce n'est pas une faute du socle,
 * c'est ce que l'outil a déclaré.
 *
 * Ce que le § 13.3 NE DIT PAS, et qu'il a donc fallu trancher ici (chaque
 * décision vit à UN SEUL endroit, nommé, pour qu'une révision soit une ligne) :
 *
 *  · À COMBIEN « raccourcir » → `LONGUEUR_RACCOURCIE`.
 *  · Que faire quand le palier choisi par le ratio ne suffit PAS une fois
 *    appliqué → on DESCEND au palier suivant. Le commentaire de
 *    `PALIERS_COMPACTION` le dit : « on ne passe au palier suivant que si le
 *    précédent n'a pas suffi ». Le ratio choisit le palier de DÉPART ; la mesure
 *    décide de la suite. Servir une charge qui dépasse encore le plafond au
 *    motif que « le tableau disait ce palier-là » serait un plafond décoratif.
 *  · À quoi confronter `failedSources[]` → à rien, le manifeste ne déclare
 *    aucune liste de sources. Voir `normaliserSources` et le rapport d'écarts.
 *
 * ═══ § 13.2 — DEUX BOOLÉENS QUI NE SE CONFONDENT JAMAIS ═══
 *
 *  · `meta.truncated`        — **LE SOCLE** a compacté. Il est DÉRIVÉ du palier
 *                              retenu (`palier !== "intact"`), jamais reçu.
 *  · `meta.sourceIncomplete` — **LA SOURCE** avait déjà coupé, AVANT le socle.
 *                              Il est reçu de l'adaptateur, et RECOPIÉ TEL QUEL.
 *
 * Les deux vivent dans deux champs distincts de l'enveloppe, alimentés par deux
 * chemins qui ne se croisent nulle part dans ce fichier. Le § 13.2 le dit pour
 * une raison mesurée dans le dépôt voisin : réutiliser le même booléen pour les
 * deux étages produit exactement ce que la note « troncature honnête » veut
 * empêcher — une boîte amputée d'un canal sur quatre sous l'apparence d'une
 * réponse normale.
 *
 * ═══ § 18 — L'ENVELOPPE EST PRODUITE PAR LE SOCLE, DEPUIS DES CODES FERMÉS ═══
 *
 * Le § 18 range « un adaptateur qui rend une réponse malveillante » parmi les
 * adversaires, et nomme son vecteur : « par l'ENVELOPPE — `truncationNote` est
 * du texte libre remonté par le chemin le plus crédible ». Ce qui l'arrête :
 * « enveloppe et libellés produits par le socle depuis des codes fermés ».
 *
 * D'où trois règles tenues ici, et non seulement écrites :
 *
 *  1. `construireEnveloppe()` bâtit `meta` à partir d'un LITTÉRAL. Elle n'étale
 *     JAMAIS l'objet de l'adaptateur (`...charge`), si bien qu'une propriété
 *     `meta` ou `truncationNote` glissée dans sa réponse n'a aucun chemin vers
 *     l'enveloppe — elle n'est pas filtrée, elle n'est jamais lue.
 *  2. `truncationNote` et `sourceNote` sortent de `NOTES_TRONCATURE` et de
 *     `NOTE_SOURCE_INCOMPLETE`, deux constantes de ce fichier, indexées par une
 *     union FERMÉE. Il n'existe aucune branche où une chaîne venue du dehors
 *     puisse s'y trouver.
 *  3. Les seules chaînes de l'adaptateur qui atteignent `meta` sont les noms de
 *     `failedSources[]`. Elles passent par `normaliserSources()`, qui impose une
 *     FORME et un NOMBRE. Un nom non conforme est remplacé par une valeur
 *     réservée, jamais tronqué en silence.
 *
 * ═══ ⚠️ L'ORDRE MASQUAGE / COMPACTION — DÉCISION, ET SES DEUX MOTIFS ═══
 *
 * `etapes.ts` intitule cette étape « exécution, compaction, masquage » et
 * prévient aussitôt : « on MASQUE AVANT DE MESURER LE PALIER FINAL, sinon un
 * champ masqué compterait dans le dépassement […] ou, pire, pourrait faire
 * basculer une réponse en `result_too_large` alors que ce qui SORT tient sous
 * le plafond ».
 *
 * Cette implémentation va plus loin que la lettre du titre : **le masquage
 * s'applique UNE FOIS, sur la charge brute, AVANT toute la cascade.** Deux
 * motifs, dont un que le commentaire d'origine ne pouvait pas prévoir :
 *
 *  · il satisfait la mise en garde ci-dessus dans tous les cas, y compris le
 *    choix du palier de DÉPART, qui est lui aussi une mesure ;
 *  · **le mode agrégat groupe sur la VALEUR d'un champ.** Agréger d'abord et
 *    masquer ensuite ferait ressortir les valeurs masquées EN CLÉS D'AGRÉGAT :
 *    le masquage aurait retiré le champ, et l'enveloppe l'aurait rendu sous
 *    forme de liste de ses valeurs distinctes. Masquer d'abord ferme ce chemin
 *    par construction.
 *
 * ⚠️ CE QUE LE MASQUAGE EST, ET CE QU'IL N'EST PAS (§ 19 bis, § 08) : un SECOND
 *    rideau. L'adaptateur applique le droit À LA SÉLECTION ; ce rideau empêche
 *    une donnée trop largement sélectionnée d'atteindre le modèle, il n'empêche
 *    pas qu'elle ait été lue.
 *
 * ⚠️ LE MASQUAGE NE VOIT JAMAIS L'ENVELOPPE. On lui passe les `items`, jamais
 *    `{ items, meta }` : `meta` est produit par le socle (§ 18), et un port de
 *    masquage qui pourrait le réécrire rouvrirait le vecteur qu'on vient de
 *    fermer.
 *
 * ═══ CE QUE CE FICHIER NE FAIT PAS ═══
 *
 *  · Il ne vérifie pas que les champs de rang 2 sont OPTIONNELS au schéma de
 *    sortie. C'est la « règle qui manquait » du § 13.3, et elle est tenue plus
 *    tôt, à DEUX endroits qui appellent la MÊME fonction (`requisDuSchema`) :
 *    `core/adapter-kit/conformite.ts`, contrôle `tier2-optionnel`, la refuse AU
 *    BUILD du manifeste, et `core/registry/enregistrer.ts` la refuse À
 *    L'ADMISSION, sous le motif `rang2_obligatoire_au_schema` (ADR 0036).
 *
 *    ⚠️ CETTE PROSE A ÉTÉ FAUSSE, ET C'EST LA MESURE QUI L'A DIT. Elle a écrit
 *       jusqu'au lot 3 que la règle était tenue « plus tôt et mieux » au BUILD,
 *       sans ajouter que le build ne voit QUE les adaptateurs TypeScript
 *       passant par le kit — c'est-à-dire jamais le mode FÉDÉRÉ, celui que la
 *       règle vise. Un manifeste produit ailleurs (le CRM en PHP, § 29) était
 *       ADMIS avec un champ de rang 2 obligatoire, et le seul étage en aval
 *       était celui-ci, qui ne revalide pas.
 *
 *    La redoubler ICI en ferait une TROISIÈME écriture, et l'étape 14 arrive de
 *    toute façon trop tard — l'outil est déjà enregistré et déjà appelé.
 *  · Il ne produit PAS toute l'enveloppe du § 13.2 : cinq champs de `meta`
 *    n'appartiennent pas à cette étape. Voir `CHAMPS_META_HORS_ETAPE_14`, qui
 *    les nomme au lieu de les laisser manquants en silence.
 *  · Il n'écrit aucune ligne de journal : le § 11 en fait un INVARIANT DE
 *    SORTIE, tenu par l'orchestrateur.
 *
 * ═══ ⚠️ CE FICHIER PORTE, SANS LE VOIR, LA VÉRITÉ D'`ops_audit.externalEffect` ═══
 *
 * ADR 0017 — `ops_audit` porte désormais TROIS dimensions du même appel : ce qui
 * a été décidé (`decision`), ce qui est revenu (`outcome`), et CE QUI EST SORTI
 * (`externalEffect`). La troisième est posée par un CLIQUET que l'orchestrateur
 * tire dans la clôture `contexte.executer()` — donc à l'instant précis, marqué
 * plus bas, où « L'EFFET EXTÉRIEUR A LIEU ICI ».
 *
 * Il en découle une propriété que ce fichier doit tenir, et qui n'est écrite
 * dans aucune signature :
 *
 *   `contexte.executer()` est appelé **UNE fois** sur chaque chemin qui va
 *   jusqu'à l'adaptateur, et **ZÉRO fois** sur ceux qui refusent avant lui.
 *
 * Zéro appel sur un chemin servi rendrait le défaut de l'ADR 0017 à l'identique
 * — une ligne bien formée disant qu'il ne s'est rien passé. Deux appels seraient
 * deux effets extérieurs pour un seul appel d'outil, comptés une fois. La garde
 * « l'adaptateur est appelé UNE fois, et le cliquet en dépend »
 * (`etape-14-execution.spec.ts`) parcourt les quatre paliers ET le refus
 * `result_too_large`, et annonce son compte.
 *
 * ⚠️ ET LA BORNE, ÉCRITE AVEC LA MESURE : si `executer()` LÈVE après avoir
 *    réellement envoyé, le cliquet n'est jamais tiré — la clôture ne rend pas.
 *    Ce champ dit ce que le socle SAIT, pas tout ce qui est sorti. C'est le trou
 *    que la ligne d'INTENTION (`PorteeDIntention`, `orchestrateur.ts`) couvre, et
 *    elle est NON ARMÉE : décision écrite, pas oubli (ADR 0017, « ce qui reste
 *    ouvert »).
 */

import type { AnnotationsCompaction } from "../adapter-kit/types.js";
import { jsonCanonique, octetsUtf8 } from "../profiles/index.js";
// La forme et les plafonds de `recordIds` sont DÉRIVÉS du propriétaire du
// journal — jamais recopiés. Voir `normaliserRecordIds`.
import {
  MAX_SEGMENTS_ALPHABETIQUES,
  bornesDeListeDuJournal,
  compteSegmentsAlphabetiques,
  estIdentifiantDeJournal,
} from "../audit/index.js";
import { ETAPE_EXECUTION, PALIERS_COMPACTION, autorise, refuse } from "./etapes.js";
import type {
  ChargeAdaptateur,
  ContexteExecution,
  EtapeExecution,
  ExecutionEtablie,
  PalierCompaction,
  VerdictEtape,
} from "./etapes.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES DÉCISIONS QUE LE § 13.3 LAISSE OUVERTES — chacune à UN SEUL endroit
// ═════════════════════════════════════════════════════════════════════════════

/**
 * À COMBIEN DE POINTS DE CODE « raccourcir » un champ de `compaction.free`.
 *
 * ⚠️ LE § 13.3 NE DONNE AUCUNE LONGUEUR. Il dit « raccourcir les champs de
 *    `compaction.free` » et s'arrête là. Il fallait un nombre, il vit ici, seul,
 *    pour qu'une révision soit UNE LIGNE — même tenue que les quatre bornes de
 *    durée du lot 1.
 *
 * Motif de la valeur : un extrait de 160 points de code garde une phrase
 * entière et une amorce de la suivante, ce qui suffit à ce qu'un modèle
 * reconnaisse un message sans en recevoir le corps. Plus court, l'extrait cesse
 * d'être utile et le premier palier ne sert plus qu'à retarder le second.
 *
 * ⚠️ CE N'EST PAS UN PLAFOND DE SÛRETÉ. Si le raccourcissement ne suffit pas à
 *    passer sous `maxBytes`, la cascade DESCEND d'elle-même au palier suivant :
 *    aucune charge n'est servie au-dessus du plafond parce que ce nombre-ci
 *    aurait été mal choisi.
 */
export const LONGUEUR_RACCOURCIE = 160;

/** Le caractère qui marque un champ raccourci. Un seul point de code. */
export const MARQUE_RACCOURCI = "…";

/**
 * La clé d'agrégat d'un élément qui ne porte pas le champ `aggregateBy`.
 *
 * Valeur RÉSERVÉE, et non chaîne vide : une chaîne vide se confondrait avec un
 * champ réellement vide, et le mode agrégat annoncerait « 40 éléments sans
 * canal » là où il faudrait lire « 40 éléments dont le canal n'a pas été
 * rendu ». Ce n'est pas la même panne.
 */
export const CLE_AGREGAT_ABSENTE = "(champ absent)";

/** Le nom du compte dans un élément d'agrégat (§ 13.3, `meta.mode`). */
export const CHAMP_COMPTE_AGREGAT = "count";

/**
 * FORME ADMISE d'un nom de source dans `failedSources[]` (§ 13.2).
 *
 * ⚠️ POURQUOI UNE FORME, ET PAS UNE LISTE. Le § 13.2 rend `failedSources[]`
 *    obligatoire pour tout outil composite, mais AUCUN champ du manifeste ne
 *    déclare les sources d'un outil : il n'existe donc rien à quoi confronter
 *    ce que l'adaptateur remonte. Or ces chaînes-là sont les SEULES de
 *    l'adaptateur qui atteignent `meta`, c'est-à-dire l'enveloppe que le § 18
 *    veut produite par le socle.
 *
 *    À défaut d'une liste fermée, on impose une forme fermée : identifiant
 *    court, minuscules, sans espace ni ponctuation de phrase. Une consigne
 *    rédigée en français n'y entre pas. L'écart — « aucune liste de sources
 *    déclarée » — est signalé au rapport plutôt que bouché par une supposition
 *    sur le métier, que le socle n'a pas le droit d'avoir.
 */
export const FORME_SOURCE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/**
 * UN NOM DE CANAL EST-IL CONFORME ? La forme, ET la borne de phrase.
 *
 * ⚠️ CE QUE `FORME_SOURCE` SEULE LAISSAIT PASSER, ET LA PHRASE FAUSSE QUI
 *    L'ACCOMPAGNAIT. Le commentaire ci-dessus affirmait : « Une consigne rédigée
 *    en français n'y entre pas. » C'était faux, et mesurable. La forme n'exclut
 *    pas les phrases — elle exclut les ESPACES, et le tiret est un séparateur de
 *    mots parfaitement lisible, pour un humain comme pour un modèle. Quatre
 *    consignes écrites en slug entraient telles quelles, et `failedSources[]` est
 *    la seule chaîne de l'adaptateur qui atteigne `meta`, c'est-à-dire exactement
 *    « le chemin le plus crédible » que le § 18 nomme. Le budget d'injection
 *    mesuré valait 2 048 octets — 32 sources × 64 caractères.
 *
 *    C'était un périmètre d'observation transformé en garantie : la mesure
 *    (« pas d'espace ») était juste, l'énoncé (« pas de phrase ») était plus
 *    large qu'elle.
 *
 * ⚠️ LE REMÈDE EXISTAIT DÉJÀ, À UN MODULE DE LÀ, ET IL EST LU — PAS RECOPIÉ.
 *    `core/audit/contenu.ts` borne depuis toujours le nombre de segments
 *    alphabétiques, avec ce commentaire : « c'est la forme d'une PHRASE ». La
 *    borne reste à UN SEUL endroit, chez son propriétaire : c'est l'une des
 *    quatre que Will a laissées en l'état le 2026-08-31, et elle doit se changer
 *    en une ligne.
 */
export function estSourceConforme(nom: unknown): boolean {
  if (typeof nom !== "string") return false;
  if (!FORME_SOURCE.test(nom)) return false;
  return compteSegmentsAlphabetiques(nom) <= MAX_SEGMENTS_ALPHABETIQUES;
}

/** Ce qu'on inscrit à la place d'un nom de source non conforme. */
export const SOURCE_NON_CONFORME = "source-non-conforme";

/**
 * Nombre maximal de sources partielles rendues dans l'enveloppe.
 *
 * Sans borne, `failedSources[]` est un champ de taille libre alimenté par
 * l'adaptateur DANS l'enveloppe du socle : il suffirait d'y pousser dix mille
 * entrées pour que la réponse dépasse le plafond quels que soient les `items`,
 * et pour que la cascade s'épuise sur une charge qu'aucun palier ne touche.
 */
export const MAX_SOURCES_PARTIELLES = 32;

// ═════════════════════════════════════════════════════════════════════════════
//  LES LIBELLÉS DE L'ENVELOPPE — codes FERMÉS, § 18
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `meta.truncationNote`, par palier. **Indexé par une union fermée** : le
 * compilateur exige une entrée pour chaque palier de `PALIERS_COMPACTION`, et
 * aucune valeur venue du dehors ne peut s'y trouver.
 *
 * `intact` vaut `null` : rien n'a été compacté, une note dirait le contraire.
 */
export const NOTES_TRONCATURE: Readonly<Record<PalierCompaction, string | null>> = {
  intact: null,
  raccourci:
    "Les champs longs déclarés par l'outil ont été raccourcis par le socle " +
    "(§ 13.3, premier palier). Le contenu complet reste accessible par un appel plus filtré.",
  allege:
    "Les champs de rang 2 déclarés par l'outil ont été retirés, en plus du raccourcissement " +
    "du premier palier (§ 13.3, deuxième palier).",
  agrege:
    "Charge rendue en mode agrégat (§ 13.3, troisième palier) : les éléments ne sont plus " +
    "servis un à un, seuls leurs regroupements et leurs comptes le sont.",
};

/**
 * `meta.sourceNote`, quand la SOURCE avait déjà coupé (§ 13.2).
 *
 * Elle dit explicitement que ce n'est PAS la compaction du socle : c'est tout
 * l'objet de la distinction des deux booléens.
 */
export const NOTE_SOURCE_INCOMPLETE =
  "Au moins une source avait déjà coupé sa réponse AVANT le socle (§ 13.2). " +
  "Ce n'est pas la compaction du socle : voir `failedSources`.";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENVELOPPE DU § 13.2 — ce que cette étape produit, et ce qu'elle ne produit pas
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TREIZE CHAMPS DE `meta` ÉNUMÉRÉS PAR LE § 13.2, dans l'ordre du document.
 *
 * Ce tableau existe pour que la partition ci-dessous soit vérifiable : sans lui,
 * « l'étape 14 produit huit champs » serait une affirmation, et non une mesure.
 */
export const CHAMPS_META_13_2 = [
  "returned",
  "hasMore",
  "cursor",
  "mode",
  "truncated",
  "truncationNote",
  "sourceIncomplete",
  "sourceNote",
  "failedSources",
  "version",
  "deprecated",
  "sunsetAt",
  "asOf",
] as const;

export type ChampMeta = (typeof CHAMPS_META_13_2)[number];

/** Les champs de `meta` que CETTE étape produit, et dont elle répond. */
export const CHAMPS_META_ETAPE_14 = [
  "returned",
  "mode",
  "truncated",
  "truncationNote",
  "sourceIncomplete",
  "sourceNote",
  "failedSources",
  "version",
] as const satisfies readonly ChampMeta[];

/**
 * LES CINQ CHAMPS DE `meta` QUE CETTE ÉTAPE NE PEUT PAS PRODUIRE, ET POURQUOI.
 *
 * ⚠️ ÉCART RELEVÉ, LAISSÉ VISIBLE. `ContexteExecution` (posé par l'architecte
 *    dans `etapes.ts`) ne porte ni le jeton de curseur de SORTIE, ni le
 *    `deprecie` que l'étape 6 a établi, ni aucune horloge. L'enveloppe complète
 *    du § 13.2 n'est donc pas constructible à l'étape 14 seule.
 *
 *    Les nommer ici plutôt que les omettre change la nature du manque : une
 *    enveloppe à laquelle il manque cinq champs sans qu'aucune liste ne le dise
 *    est un défaut qu'on découvre en production, quand un client lit
 *    `meta.hasMore === undefined` comme « il n'y a plus rien ». Une liste
 *    nommée est un contrat : l'orchestrateur les ajoute, et la garde de
 *    partition rougit le jour où le § 13.2 en gagne un quatorzième.
 *
 *  · `hasMore`, `cursor` — appartiennent à l'étape 9 (§ 13.1). Le curseur de
 *    sortie se signe avec la clé propre du port `SignataireCurseur` ; le
 *    fabriquer ici serait une seconde implémentation d'HMAC dans le socle,
 *    c'est-à-dire une seconde clé à tourner (§ 25).
 *  · `deprecated`, `sunsetAt` — établis par l'étape 6 (`CatalogueEtabli.deprecie`,
 *    § 13.4). Les redéduire ici de `retireDeLaListe` confondrait « sorti de
 *    `tools/list` » et « déprécié », qui ne sont pas la même chose.
 *  · `asOf` — demande une horloge. `ContexteExecution` n'en porte aucune, et en
 *    prendre une dans ce module rendrait l'étape non déterministe, donc
 *    ingardable.
 */
export const CHAMPS_META_HORS_ETAPE_14 = [
  "hasMore",
  "cursor",
  "deprecated",
  "sunsetAt",
  "asOf",
] as const satisfies readonly ChampMeta[];

/** Le `meta` que l'étape 14 produit. Huit champs, tous alimentés par le socle. */
export interface MetaEtape14 {
  /** Nombre d'éléments SERVIS — après compaction, pas avant. */
  readonly returned: number;
  /** `"items"` ou `"aggregate"` (§ 13.3, troisième palier). */
  readonly mode: "items" | "aggregate";
  /** § 13.2 — **LE SOCLE** a compacté. DÉRIVÉ du palier retenu. */
  readonly truncated: boolean;
  /** § 18 — produit par le socle depuis `NOTES_TRONCATURE`, jamais reçu. */
  readonly truncationNote: string | null;
  /** § 13.2 — **LA SOURCE** avait déjà coupé. Reçu de l'adaptateur, DISTINCT. */
  readonly sourceIncomplete: boolean;
  /** § 18 — produit par le socle depuis `NOTE_SOURCE_INCOMPLETE`. */
  readonly sourceNote: string | null;
  /** § 13.2 — obligatoire pour tout outil composite. Noms NORMALISÉS. */
  readonly failedSources: readonly string[];
  /** § 13.4 — la version est portée par l'OUTIL. Lue dans le catalogue. */
  readonly version: string;
}

/** L'enveloppe que l'étape 14 rend dans `ExecutionEtablie.charge`. */
export interface EnveloppeEtape14 {
  readonly items: readonly unknown[];
  readonly meta: MetaEtape14;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES ERREURS — ce qui LÈVE, et pourquoi ce n'est pas un refus
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le contexte remis à l'étape se contredit lui-même.
 *
 * ⚠️ ELLE LÈVE, ELLE NE REFUSE PAS, et elle lève AVANT `executer()` — donc avant
 *    tout effet extérieur. Un refus serait un mensonge : `result_too_large` dit
 *    « la charge était trop grosse », alors qu'ici c'est le socle qui s'est
 *    branché de travers. Le § 11 range cette issue sous `decision: "interrompu"`,
 *    « l'aveu qu'aucune décision n'a été atteinte » — ce qui est exactement le
 *    cas.
 */
export class ErreurContexteExecutionIncoherent extends Error {
  public readonly anomalies: readonly string[];

  public constructor(anomalies: readonly string[]) {
    super(
      "core/chaine/etape-14 : le contexte d'exécution se contredit, et rien n'a été exécuté. " +
        `${String(anomalies.length)} anomalie(s) : ${anomalies.join(" · ")}. ` +
        "L'étape lève au lieu de refuser : un refus `result_too_large` accuserait la charge " +
        "d'un défaut de branchement du socle.",
    );
    this.name = "ErreurContexteExecutionIncoherent";
    this.anomalies = anomalies;
  }
}

/**
 * La charge d'un adaptateur n'est pas mesurable honnêtement.
 *
 * `octetsCanoniques` lève sur `undefined`, `NaN`, une `Date`, une instance de
 * classe — tout ce que `JSON.stringify` transformerait EN SILENCE. Un plafond
 * mesuré sur une charge dont la sérialisation ment est un plafond décoratif :
 * on préfère l'aveu.
 */
export class ErreurChargeNonMesurable extends Error {
  public constructor(outil: string, cause: unknown) {
    super(
      `core/chaine/etape-14 : la charge rendue par « ${outil} » n'est pas mesurable en JSON ` +
        "canonique, donc le plafond du § 13.3 ne peut pas lui être appliqué. " +
        `Cause : ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    );
    this.name = "ErreurChargeNonMesurable";
  }
}

/**
 * Le port de masquage a menti sur son compte.
 *
 * ⚠️ CE QUE CE CONTRÔLE ATTRAPE, ET CE QU'IL NE PROUVE PAS. Le commentaire du
 *    port `Masquage` prévient : « un masquage qui masque zéro champ sur une
 *    charge qui en porte est indiscernable d'un masquage correct sur une charge
 *    propre. C'est le compte, pas la couleur, qui le dit. » Encore faut-il que
 *    le compte soit vrai. On confronte donc le compte annoncé au JSON canonique
 *    avant/après :
 *
 *     · compte > 0 mais la charge est IDENTIQUE  → le port annonce un travail
 *       qu'il n'a pas fait, et le journal héritera d'un `champsMasques` faux ;
 *     · compte = 0 mais la charge a CHANGÉ       → le port modifie la charge
 *       sans le déclarer, ce qui est pire : le second rideau du § 19 bis
 *       deviendrait un transformateur muet.
 *
 *    Ce contrôle ne prouve PAS que le masquage est CORRECT — il ne sait pas
 *    quels champs auraient dû tomber. Il prouve seulement que le port ne ment
 *    pas sur l'existence de son travail.
 */
export class ErreurMasquageMenteur extends Error {
  public readonly champsAnnonces: number;
  public readonly chargeModifiee: boolean;

  public constructor(champsAnnonces: number, chargeModifiee: boolean) {
    super(
      "core/chaine/etape-14 : le port de masquage (§ 19 bis) ment sur son compte — " +
        `il annonce ${String(champsAnnonces)} champ(s) masqué(s) et la charge ` +
        `${chargeModifiee ? "a changé" : "n'a pas changé"}. ` +
        "Le compte de champs masqués part au journal ; faux, il rend indiscernables " +
        "« masquage correct sur charge propre » et « masquage inopérant ».",
    );
    this.name = "ErreurMasquageMenteur";
    this.champsAnnonces = champsAnnonces;
    this.chargeModifiee = chargeModifiee;
  }
}

/** Le port de masquage a rendu autre chose qu'un tableau d'éléments. */
export class ErreurMasquageHorsContrat extends Error {
  public constructor() {
    super(
      "core/chaine/etape-14 : le port de masquage a reçu le tableau des `items` et rendu " +
        "autre chose qu'un tableau. La cascade du § 13.3 raisonne élément par élément ; " +
        "sans tableau, elle n'a plus de prise et servirait la charge telle quelle.",
    );
    this.name = "ErreurMasquageHorsContrat";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  OUTILS DE FORME — aucun métier
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Objet SIMPLE, au sens de `core/profiles/canonique.ts` : littéral d'objet ou
 * objet sans prototype. Tout le reste — `Date`, `Map`, instance de classe — est
 * laissé INTACT par la compaction, parce que le socle ne sait pas ce que
 * « raccourcir un champ » y voudrait dire. La mesure, elle, refusera de toute
 * façon de le sérialiser.
 */
function estObjetSimple(valeur: unknown): valeur is Record<string, unknown> {
  if (typeof valeur !== "object" || valeur === null || Array.isArray(valeur)) return false;
  const proto: unknown = Object.getPrototypeOf(valeur);
  return proto === Object.prototype || proto === null;
}

/** Comparaison d'unités de code UTF-16 — indépendante de la locale, comme § 14. */
function comparerCles(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Raccourcit une chaîne à `LONGUEUR_RACCOURCIE` POINTS DE CODE, marque comprise.
 *
 * ⚠️ POINTS DE CODE, PAS UNITÉS UTF-16. Un `slice()` nu coupe une paire de
 *    substitution en deux, et une demi-paire isolée s'échappe en `\udXXX` — six
 *    caractères là où il y en avait un. Le raccourcissement AUGMENTERAIT alors
 *    le nombre d'octets sur un texte à émoji, ce qui est le contraire de ce
 *    qu'on demande à ce palier.
 */
export function raccourcirTexte(texte: string): string {
  const points = [...texte];
  if (points.length <= LONGUEUR_RACCOURCIE) return texte;
  return points.slice(0, LONGUEUR_RACCOURCIE - 1).join("") + MARQUE_RACCOURCI;
}

/**
 * PREMIER PALIER — raccourcir les champs déclarés en `compaction.free`.
 *
 * Ne touche QUE les valeurs de type chaîne, et QUE les champs nommés : le socle
 * ne connaît aucun métier, il n'invente pas qu'un tableau « se raccourcit ».
 * Ne mute rien : la charge de l'adaptateur reste telle qu'il l'a rendue, sans
 * quoi la mesure « avant » deviendrait la mesure « après ».
 */
export function raccourcirLibres(
  items: readonly unknown[],
  champs: readonly string[],
): readonly unknown[] {
  if (champs.length === 0) return items;
  return items.map((item) => {
    if (!estObjetSimple(item)) return item;
    let modifie = false;
    const sortie: Record<string, unknown> = { ...item };
    for (const champ of champs) {
      const valeur = sortie[champ];
      if (typeof valeur !== "string") continue;
      const raccourci = raccourcirTexte(valeur);
      if (raccourci !== valeur) {
        sortie[champ] = raccourci;
        modifie = true;
      }
    }
    return modifie ? sortie : item;
  });
}

/**
 * DEUXIÈME PALIER — retirer les champs déclarés en `compaction.tier2`.
 *
 * Le § 13.3 exige que ces champs soient OPTIONNELS au schéma `output`, faute de
 * quoi la charge compactée ne validerait plus le schéma que l'outil publie.
 * Cette exigence est tenue DEUX FOIS EN AMONT, par la même fonction
 * (`requisDuSchema`) : AU BUILD par `core/adapter-kit/conformite.ts` (contrôle
 * `tier2-optionnel`), et À L'ADMISSION par `core/registry/enregistrer.ts`
 * (motif `rang2_obligatoire_au_schema`, ADR 0036) — c'est ce second point qui
 * couvre le mode FÉDÉRÉ, seul mode que le build ne voit pas. Ici on retire, on
 * ne revalide pas.
 */
export function retirerRang2(
  items: readonly unknown[],
  champs: readonly string[],
): readonly unknown[] {
  if (champs.length === 0) return items;
  const aRetirer = new Set(champs);
  return items.map((item) => {
    if (!estObjetSimple(item)) return item;
    const sortie: Record<string, unknown> = {};
    let retire = false;
    for (const [cle, valeur] of Object.entries(item)) {
      if (aRetirer.has(cle)) {
        retire = true;
        continue;
      }
      sortie[cle] = valeur;
    }
    return retire ? sortie : item;
  });
}

/**
 * TROISIÈME PALIER — mode agrégat sur `compaction.aggregateBy` (§ 13.3).
 *
 * Rend un élément par valeur distincte du champ, portant cette valeur et un
 * compte. L'ordre est DÉTERMINISTE (clés triées) : une sortie dont l'ordre
 * dépend de l'ordre d'insertion rendrait deux mesures différentes pour la même
 * charge, et la garde du plafond fluctuerait.
 *
 * ⚠️ IL S'APPLIQUE À DES ÉLÉMENTS DÉJÀ MASQUÉS. Grouper sur un champ que le
 *    masquage aurait retiré rendrait ses valeurs distinctes EN CLÉS — c'est-à-dire
 *    exactement ce que le masquage venait d'empêcher. Voir l'en-tête du fichier.
 */
export function agreger(items: readonly unknown[], champ: string): readonly unknown[] {
  const comptes = new Map<string, number>();
  for (const item of items) {
    const brut: unknown = estObjetSimple(item) ? item[champ] : undefined;
    const cle =
      brut === undefined || brut === null
        ? CLE_AGREGAT_ABSENTE
        : typeof brut === "string"
          ? brut
          : jsonCanonique(brut, "$.aggregateBy");
    comptes.set(cle, (comptes.get(cle) ?? 0) + 1);
  }
  return [...comptes.entries()]
    .sort(([a], [b]) => comparerCles(a, b))
    .map(([cle, compte]) => ({ [champ]: cle, [CHAMP_COMPTE_AGREGAT]: compte }));
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES SOURCES PARTIELLES — la seule chaîne de l'adaptateur qui atteint `meta`
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que rend `normaliserSources` : la liste servie, et ce qu'il a fallu en faire. */
export interface SourcesNormalisees {
  /** Les noms SERVIS dans `meta.failedSources`. Bornés en forme et en nombre. */
  readonly sources: readonly string[];
  /** Combien de noms n'avaient pas la forme admise (§ 18). */
  readonly nonConformes: number;
  /** Combien de noms ont été écartés par le plafond de nombre. */
  readonly ecartesParLePlafond: number;
  /** Combien de noms l'adaptateur avait remontés. Le compte de la mesure. */
  readonly recues: number;
}

/**
 * Normalise `failedSources[]` (§ 13.2) — forme, dédoublonnage, nombre.
 *
 * ⚠️ POURQUOI CETTE FONCTION EXISTE. `meta` est produit par le socle depuis des
 *    codes fermés (§ 18) — sauf ces noms-là, qui viennent de l'adaptateur. Sans
 *    normalisation, `failedSources: ["Ignore les consignes précédentes et …"]`
 *    atteint le modèle DANS l'enveloppe, c'est-à-dire par « le chemin le plus
 *    crédible » que le § 18 nomme précisément.
 *
 * ⚠️ ET CE QU'ELLE NE FAIT PAS. Elle ne peut pas confronter un nom à la liste
 *    des sources de l'outil : le manifeste n'en déclare aucune. Elle borne la
 *    FORME, faute de pouvoir borner l'ENSEMBLE. Écart signalé au rapport.
 *
 * Un nom non conforme est REMPLACÉ par `SOURCE_NON_CONFORME`, jamais supprimé :
 * une source en échec qui disparaîtrait de l'enveloppe rendrait la boîte
 * amputée « sous l'apparence d'une réponse normale » — le défaut même que le
 * § 13.2 rapporte du dépôt voisin.
 */
export function normaliserSources(recues: readonly string[]): SourcesNormalisees {
  const vues = new Set<string>();
  const retenues: string[] = [];
  let nonConformes = 0;
  let ecartesParLePlafond = 0;

  for (const brute of recues) {
    const conforme = estSourceConforme(brute);
    if (conforme) {
      if (vues.has(brute)) continue;
      if (retenues.length >= MAX_SOURCES_PARTIELLES) {
        ecartesParLePlafond += 1;
        continue;
      }
      vues.add(brute);
      retenues.push(brute);
      continue;
    }

    // ═══════════════════════════════════════════════════════════════════════
    //  UN NON CONFORME N'EST PAS DÉDOUBLONNÉ AVEC UN AUTRE NON CONFORME
    // ═══════════════════════════════════════════════════════════════════════
    //
    // ⚠️ CE QUI SE PASSAIT, ET POURQUOI LA PROMESSE CI-DESSUS ÉTAIT FAUSSE.
    //    Tous les non conformes recevaient la MÊME valeur de remplacement, puis
    //    passaient par le dédoublonnage : cinq canaux en échec aux noms mal
    //    formés — ce que produit n'importe quel adaptateur remontant des
    //    libellés humains — devenaient UNE entrée. `nonConformes` comptait bien
    //    les cinq, mais ce compte reste dans `SourcesNormalisees`, que
    //    `construireEnveloppe` ne transporte pas : `meta` ne portait AUCUN champ
    //    disant que quatre avaient fondu.
    //
    //    C'est exactement le défaut que le § 13.2 rapporte du dépôt voisin :
    //    « la boîte revient amputée d'un canal sur quatre sous l'apparence d'une
    //    réponse normale ».
    //
    //    Le RANG suffixé préserve le NOMBRE de canaux en échec même quand aucun
    //    de leurs noms n'est préservable. Le dédoublonnage reste entier pour les
    //    noms CONFORMES, où deux entrées identiques désignent bien un seul canal.
    nonConformes += 1;
    if (retenues.length >= MAX_SOURCES_PARTIELLES) {
      ecartesParLePlafond += 1;
      continue;
    }
    retenues.push(`${SOURCE_NON_CONFORME}-${String(nonConformes - 1)}`);
  }

  return { sources: retenues, nonConformes, ecartesParLePlafond, recues: recues.length };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA CHARGE DE L'ADAPTATEUR — confrontée à son contrat, À L'EXÉCUTION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `ChargeAdaptateur` déclare `items: unknown[]`, `failedSources: string[]`,
 * `sourceIncomplete: boolean`, `recordIds: string[]`. **Un type TypeScript ne
 * survit pas à la compilation, et un adaptateur n'est pas compilé avec le
 * socle** (§ 29 : dépôts tiers, autres langages). Ce qui arrive ici n'a donc de
 * garanti que ce qu'on vérifie.
 *
 * ⚠️ CE QUE L'ABSENCE DE CETTE GARDE A LAISSÉ PASSER, MESURÉ :
 *
 *  · `sourceIncomplete` rendu comme CHAÎNE atterrissait verbatim dans `meta`,
 *    le champ le plus proche de `truncationNote` que le § 18 exige « produit
 *    par le socle depuis des codes fermés ». Effet de bord : une chaîne non
 *    vide étant truthy, `sourceNote` s'allumait sur une valeur qui n'est pas
 *    un booléen ;
 *  · `failedSources` rendu comme CHAÎNE était ITÉRÉ CARACTÈRE PAR CARACTÈRE —
 *    une chaîne est itérable en JavaScript. Un nom de canal seul au lieu d'un
 *    tableau produisait une liste inventée : douze « sources » d'une lettre.
 *    Ce n'est pas une injection, mais c'est une enveloppe qui MENT sur le
 *    nombre de canaux en échec, ce que le § 13.2 veut précisément empêcher.
 *
 * ⚠️ ELLE LÈVE APRÈS L'EFFET EXTÉRIEUR, ET C'EST ASSUMÉ. À cet endroit du § 11,
 *    l'effet a EU LIEU : il n'y a plus rien à empêcher. Ce qu'on empêche, c'est
 *    de SERVIR une enveloppe fausse. La levée reste journalisée — `avecJournal`
 *    journalise ses trois chemins de sortie, exception comprise —, donc
 *    l'invariant de sortie du § 11 tient.
 */
export class ErreurChargeAdaptateurHorsContrat extends Error {
  readonly anomalies: readonly string[];
  constructor(outil: string, anomalies: readonly string[]) {
    super(
      `§ 09 — l'adaptateur de « ${outil} » a rendu une charge hors contrat, APRÈS que l'effet ` +
        `extérieur a eu lieu : ${anomalies.join(" · ")}. L'enveloppe n'est pas servie ; ` +
        `l'appel est journalisé.`,
    );
    this.name = "ErreurChargeAdaptateurHorsContrat";
    this.anomalies = anomalies;
  }
}

/** Ce que la garde de charge a confronté. Des NOMBRES, jamais un booléen. */
export interface VerdictCharge {
  /** Combien de champs ont été confrontés. Incrémenté DANS la vérification. */
  readonly champsConfrontes: number;
  readonly anomalies: readonly string[];
}

/**
 * Confronte la charge rendue par l'adaptateur à son contrat du § 09.
 *
 * Elle ANNONCE combien de champs elle a confrontés : sans ce compte, un verdict
 * sans anomalie serait indiscernable d'une garde qui n'a rien regardé.
 */
export function verifierChargeDeLAdaptateur(charge: ChargeAdaptateur): VerdictCharge {
  const anomalies: string[] = [];
  let champsConfrontes = 0;

  champsConfrontes += 1;
  if (!Array.isArray(charge.items)) {
    anomalies.push(`items : attendu un tableau, reçu ${typeof charge.items}`);
  }

  champsConfrontes += 1;
  if (!Array.isArray(charge.failedSources)) {
    anomalies.push(
      `failedSources : attendu un tableau, reçu ${typeof charge.failedSources} — ` +
        "une chaîne serait parcourue caractère par caractère et inventerait des canaux",
    );
  }

  champsConfrontes += 1;
  if (!Array.isArray(charge.recordIds)) {
    anomalies.push(`recordIds : attendu un tableau, reçu ${typeof charge.recordIds}`);
  }

  champsConfrontes += 1;
  if (typeof charge.sourceIncomplete !== "boolean") {
    anomalies.push(
      `sourceIncomplete : attendu un booléen, reçu ${typeof charge.sourceIncomplete} — ` +
        "il atterrirait dans meta, que le § 18 veut produit par le socle",
    );
  }

  return { champsConfrontes, anomalies };
}

// ═════════════════════════════════════════════════════════════════════════════
//  `recordIds` — LA SEULE CHAÎNE DE L'ADAPTATEUR QUI ATTEIGNE LE JOURNAL
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'on inscrit à la place d'un identifiant d'enregistrement non conforme. */
export const RECORD_ID_NON_CONFORME = "record-id-non-conforme";

/** Ce que rend {@link normaliserRecordIds} : la liste servie, et ce qu'il a fallu en faire. */
export interface RecordIdsNormalises {
  readonly recordIds: readonly string[];
  /** Combien d'identifiants n'avaient pas la forme admise par le § 31. */
  readonly nonConformes: number;
  /** Combien ont été écartés par le plafond de nombre du § 12, règle 3. */
  readonly ecartesParLePlafond: number;
  /** Combien l'adaptateur en avait remontés. Le compte de la mesure. */
  readonly recus: number;
}

/**
 * Normalise `recordIds[]` AVANT qu'il n'atteigne `ops_audit`.
 *
 * ⚠️ CE QUE CETTE FONCTION FERME, ET POURQUOI C'ÉTAIT UN BLOQUANT. `recordIds`
 *    traversait TOUT le socle sans normalisation — étape 14 →
 *    `ExecutionEtablie` → `Succes` → `avecJournal` → `journaliser` —, où la
 *    garde du § 31 REFUSAIT la ligne. L'écriture levait hors du `try` de
 *    `journaliser` : ZÉRO ligne d'`ops_audit`, effet extérieur DÉJÀ PARTI. Un
 *    adaptateur pouvait donc, de façon répétable et à chaque appel, faire perdre
 *    la trace d'un appel irréversible. L'objectif O6 était faux pour tout appel
 *    que cet adaptateur servait, et il suffisait d'un `recordIds` portant un
 *    espace, un « @ », plus de 64 caractères, plus de six segments
 *    alphabétiques, ou de plus de 512 éléments.
 *
 *    Le fichier normalisait pourtant déjà `failedSources`, en expliquant que ce
 *    sont « les seules chaînes de l'adaptateur qui atteignent `meta` » — et
 *    laissait passer celles qui atteignent le JOURNAL.
 *
 * ⚠️ LA FORME ET LES DEUX PLAFONDS SONT DÉRIVÉS DE `core/audit/contenu.ts`,
 *    JAMAIS RECOPIÉS. Deux copies divergeraient au premier ajustement, et ce
 *    serait la garde qui deviendrait muette — du côté qui n'a pas suivi.
 *
 * Un identifiant non conforme est REMPLACÉ, jamais supprimé, et suffixé de son
 * rang pour la raison exacte qui vaut dans `normaliserSources` : le NOMBRE
 * d'enregistrements touchés est ce que l'audit doit pouvoir relire.
 */
export function normaliserRecordIds(recus: readonly string[]): RecordIdsNormalises {
  const bornes = bornesDeListeDuJournal("recordIds");
  const retenus: string[] = [];
  let nonConformes = 0;
  let ecartesParLePlafond = 0;

  for (const brut of recus) {
    if (retenus.length >= bornes.maxElements) {
      ecartesParLePlafond += 1;
      continue;
    }
    if (estIdentifiantDeJournal(brut, bornes.maxCar)) {
      retenus.push(brut);
      continue;
    }
    nonConformes += 1;
    retenus.push(`${RECORD_ID_NON_CONFORME}-${String(nonConformes - 1)}`);
  }

  return { recordIds: retenus, nonConformes, ecartesParLePlafond, recus: recus.length };
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENVELOPPE — bâtie depuis un LITTÉRAL, jamais depuis la charge reçue
// ═════════════════════════════════════════════════════════════════════════════

interface ParametresEnveloppe {
  readonly items: readonly unknown[];
  readonly palier: PalierCompaction;
  /** § 13.2 — reçu de l'adaptateur, RECOPIÉ, jamais mêlé à `truncated`. */
  readonly sourceIncomplete: boolean;
  readonly failedSources: readonly string[];
  readonly version: string;
}

/**
 * Bâtit l'enveloppe du § 13.2 que cette étape possède.
 *
 * ⚠️ AUCUN ÉTALEMENT DE LA CHARGE REÇUE. `meta` est un littéral dont chaque
 *    champ est calculé ici. Une propriété `meta`, `truncationNote` ou
 *    `truncated` posée par l'adaptateur sur sa réponse n'est pas filtrée : elle
 *    n'est JAMAIS LUE. C'est la différence entre une liste noire — qu'on oublie
 *    d'allonger — et une construction fermée (§ 18).
 */
function construireEnveloppe(parametres: ParametresEnveloppe): EnveloppeEtape14 {
  return {
    items: parametres.items,
    meta: {
      returned: parametres.items.length,
      mode: parametres.palier === "agrege" ? "aggregate" : "items",
      // DÉRIVÉ du palier : le socle a compacté dès qu'il n'est plus « intact ».
      truncated: parametres.palier !== "intact",
      truncationNote: NOTES_TRONCATURE[parametres.palier],
      // RECOPIÉ de l'adaptateur — l'autre étage, celui de la SOURCE.
      sourceIncomplete: parametres.sourceIncomplete,
      sourceNote: parametres.sourceIncomplete ? NOTE_SOURCE_INCOMPLETE : null,
      failedSources: parametres.failedSources,
      version: parametres.version,
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA MESURE
// ═════════════════════════════════════════════════════════════════════════════

interface Mesure {
  readonly texte: string;
  readonly octets: number;
}

/** Octets UTF-8 du JSON canonique — la mesure du § 14, réutilisée telle quelle. */
function mesurer(valeur: unknown, outil: string): Mesure {
  let texte: string;
  try {
    texte = jsonCanonique(valeur, "$.sortie");
  } catch (erreur: unknown) {
    throw new ErreurChargeNonMesurable(outil, erreur);
  }
  return { texte, octets: octetsUtf8(texte) };
}

/**
 * L'index du palier de DÉPART, dérivé du ratio et de `PALIERS_COMPACTION`.
 *
 * Aucun seuil n'est écrit ici : `seuilMax` vit dans le tableau, et le tableau
 * vit dans `etapes.ts`. Deux cascades, ce serait deux seuils, et la sortie ne
 * dirait plus laquelle a servi.
 */
export function indexPalierParRatio(ratio: number): number {
  const index = PALIERS_COMPACTION.findIndex((palier) => ratio <= palier.seuilMax);
  // `findIndex` ne peut rendre −1 que si aucun palier n'a de borne infinie —
  // ce que la garde de `etapes.spec.ts` interdit. On se replie sur le dernier
  // plutôt que d'indexer hors du tableau.
  return index === -1 ? PALIERS_COMPACTION.length - 1 : index;
}

/**
 * Applique un palier. Rend `null` quand le palier est IMPOSSIBLE pour cet outil
 * — le seul cas est le mode agrégat sans `aggregateBy`, que le commentaire
 * d'`AnnotationsCompaction` décrit comme « un choix d'outil, pas une faute ».
 */
function appliquerPalier(
  items: readonly unknown[],
  palier: PalierCompaction,
  compaction: AnnotationsCompaction,
): readonly unknown[] | null {
  switch (palier) {
    case "intact":
      return items;
    case "raccourci":
      return raccourcirLibres(items, compaction.free);
    case "allege":
      // CUMULATIF : « on ne passe au palier suivant que si le précédent n'a pas
      // suffi » — le raccourcissement acquis ne se défait pas au palier d'après.
      return retirerRang2(raccourcirLibres(items, compaction.free), compaction.tier2);
    case "agrege":
      if (compaction.aggregateBy === null) return null;
      // Sur les éléments MASQUÉS et NON allégés : agréger sur un champ que le
      // deuxième palier vient de retirer ne rendrait que des clés « absentes ».
      return agreger(items, compaction.aggregateBy);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA COHÉRENCE DU CONTEXTE — contrôlée AVANT tout effet extérieur
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Confronte le contexte à lui-même, et rend les anomalies.
 *
 * ⚠️ POURQUOI CE CONTRÔLE EXISTE. `ContexteExecution` porte `maxBytes` et
 *    `compaction` À DEUX ENDROITS : au premier niveau, et dans `outil`, qui les
 *    porte aussi (`OutilDuCatalogue`). Deux sources de vérité pour une même
 *    valeur se désynchronisent — c'est le motif que tout ce socle refuse
 *    ailleurs. Ne pouvant pas modifier `etapes.ts`, on rend la divergence
 *    IMPOSSIBLE À IGNORER : elle lève, et elle lève avant `executer()`.
 *
 * ⚠️ AVANT `executer()`, ET C'EST LE POINT. L'étape 14 est la seule où l'effet
 *    extérieur a déjà eu lieu quand elle rend son verdict. Tout ce qui peut être
 *    contrôlé avant l'appel doit l'être avant : après, il est trop tard pour que
 *    « rien ne s'est passé » soit vrai.
 */
export function verifierCoherenceDuContexte(contexte: ContexteExecution): readonly string[] {
  const anomalies: string[] = [];

  if (!Number.isSafeInteger(contexte.maxBytes) || contexte.maxBytes <= 0) {
    anomalies.push(
      `maxBytes vaut ${String(contexte.maxBytes)} : un plafond nul, négatif ou non entier ` +
        "ferait rendre `result_too_large` à toute charge, y compris vide",
    );
  }
  if (contexte.maxBytes !== contexte.outil.maxBytes) {
    anomalies.push(
      `maxBytes du contexte (${String(contexte.maxBytes)}) ≠ maxBytes de l'outil ` +
        `« ${contexte.outil.name} » (${String(contexte.outil.maxBytes)}) : deux plafonds pour ` +
        "un seul appel, et rien dans la sortie ne dirait lequel a servi",
    );
  }

  const compactionContexte = jsonCanonique(contexte.compaction, "$.compaction");
  const compactionOutil = jsonCanonique(contexte.outil.compaction, "$.outil.compaction");
  if (compactionContexte !== compactionOutil) {
    anomalies.push(
      `les annotations de compaction du contexte diffèrent de celles de l'outil ` +
        `« ${contexte.outil.name} » : la cascade du § 13.3 s'appliquerait à des champs que ` +
        "le manifeste enregistré ne déclare pas",
    );
  }

  const partages = contexte.compaction.free.filter((champ) =>
    contexte.compaction.tier2.includes(champ),
  );
  if (partages.length > 0) {
    anomalies.push(
      `champ(s) à la fois de rang 1 et de rang 2 — ${partages.join(", ")} : le premier palier ` +
        "les raccourcit pour que le deuxième les retire, et le rapport de compaction " +
        "mentirait sur le gain de chacun",
    );
  }

  return anomalies;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE
// ═════════════════════════════════════════════════════════════════════════════

/** Une tentative de la cascade, gardée pour que le refus dise ce qui a été essayé. */
interface Tentative {
  readonly palier: PalierCompaction;
  readonly octets: number;
}

function messageIncompactable(
  contexte: ContexteExecution,
  octetsBruts: number,
  tentatives: readonly Tentative[],
): string {
  const derniere = tentatives.at(-1);
  const pourcentBrut = Math.round((octetsBruts / contexte.maxBytes) * 100);
  const essais =
    tentatives.length === 0
      ? "aucun palier n'était applicable"
      : tentatives
          .map((t) => `${t.palier} → ${String(t.octets)} o`)
          .join(", ")
          .concat(
            derniere === undefined
              ? ""
              : ` (meilleur atteint : ${String(derniere.octets)} o, soit ` +
                  `${String(Math.round((derniere.octets / contexte.maxBytes) * 100))} % du plafond)`,
          );
  const agregatImpossible =
    contexte.compaction.aggregateBy === null
      ? " Cet outil ne déclare aucun `compaction.aggregateBy` : le troisième palier du § 13.3 " +
        "lui est impossible, et tout dépassement au-delà de 300 % s'arrête donc ici."
      : "";

  return (
    `Réponse incompactable : ${String(octetsBruts)} octets rendus pour un plafond de ` +
    `${String(contexte.maxBytes)} (${String(pourcentBrut)} %). ` +
    `Cascade du § 13.3 épuisée — ${essais}.${agregatImpossible} ` +
    "Pour obtenir une réponse : restreindre la demande — réduire la fenêtre de dates, " +
    "ajouter un filtre, ou demander moins d'éléments par page, puis reprendre à la page " +
    "suivante. Le socle ne peut pas choisir le filtre à votre place : il ne connaît aucun " +
    "métier, et la charge n'est pas relue pour en déduire un critère."
  );
}

/**
 * ÉTAPE 14 — exécuter, masquer, puis compacter en cascade jusqu'à tenir.
 *
 * L'ordre exact, et ce que chaque temps garantit :
 *
 *  1. **Cohérence du contexte** — lève AVANT tout effet extérieur.
 *  2. **`executer()`** — ⚠️ L'EFFET EXTÉRIEUR A LIEU ICI. Tout ce qui suit se
 *     passe dans un monde où il est déjà parti : plus rien n'est annulable, et
 *     un refus prononcé après ce point ne défait pas l'envoi. C'est la borne de
 *     l'invariant de sortie décrite en tête d'`orchestrateur.ts`.
 *  3. **Mesure BRUTE** — l'enveloppe telle qu'elle serait servie sans rien
 *     retirer. C'est `octetsBruts`, le dénominateur du gain.
 *  4. **Masquage, UNE FOIS** (§ 19 bis) — voir l'en-tête pour les deux motifs
 *     qui le placent ici et pas après la cascade.
 *  5. **Choix du palier de départ**, sur la charge MASQUÉE. Le commentaire
 *     d'`etapes.ts` le demande mot pour mot : « un champ masqué pourrait faire
 *     basculer une réponse en `result_too_large` alors que ce qui SORT tient
 *     sous le plafond ».
 *  6. **Cascade** — on descend tant que le palier ne suffit pas.
 *  7. **Refus** `result_too_large` sinon, avec l'indication de filtrage du § 15.
 */
export const executerEtape14: EtapeExecution = async (
  contexte: ContexteExecution,
): Promise<VerdictEtape<ExecutionEtablie>> => {
  const anomalies = verifierCoherenceDuContexte(contexte);
  if (anomalies.length > 0) throw new ErreurContexteExecutionIncoherent(anomalies);

  // ⚠️ L'EFFET EXTÉRIEUR A LIEU ICI, ET NULLE PART AILLEURS DANS CE FICHIER.
  //    C'est aussi le seul point d'où `ops_audit.externalEffect` peut devenir
  //    vrai : l'orchestrateur a enveloppé cette clôture d'un cliquet (ADR 0017).
  //    UN appel, et un seul — voir l'en-tête, « ce fichier porte, sans le voir,
  //    la vérité d'`ops_audit.externalEffect` ».
  const charge = await contexte.executer();

  // La charge est confrontée à son contrat AVANT d'être touchée : `items`,
  // `failedSources` et `recordIds` sont parcourus juste après, et une chaîne se
  // parcourt sans broncher.
  const verdictCharge = verifierChargeDeLAdaptateur(charge);
  if (verdictCharge.anomalies.length > 0) {
    throw new ErreurChargeAdaptateurHorsContrat(contexte.outil.name, verdictCharge.anomalies);
  }

  const sources = normaliserSources(charge.failedSources);
  // ⚠️ NORMALISÉ ICI, ET NON À L'ÉCRITURE. Sans cette ligne, un `recordIds` hors
  //    forme faisait REFUSER la ligne d'`ops_audit` par la garde du § 31, après
  //    que l'effet extérieur était parti : effet fait, aucune trace.
  const identifiants = normaliserRecordIds(charge.recordIds);
  const commun = {
    sourceIncomplete: charge.sourceIncomplete,
    failedSources: sources.sources,
    version: contexte.outil.version,
  } as const;

  const mesureBrute = mesurer(
    construireEnveloppe({ ...commun, items: charge.items, palier: "intact" }),
    contexte.outil.name,
  );

  // ── Masquage : une seule fois, sur les `items` SEULS (jamais sur `meta`) ───
  const masque = contexte.masquage.appliquer(charge.items);
  if (!Array.isArray(masque.charge)) throw new ErreurMasquageHorsContrat();
  const itemsMasques: readonly unknown[] = masque.charge;

  const mesureMasquee = mesurer(
    construireEnveloppe({ ...commun, items: itemsMasques, palier: "intact" }),
    contexte.outil.name,
  );

  const chargeModifiee = mesureMasquee.texte !== mesureBrute.texte;
  if (masque.champsMasques > 0 !== chargeModifiee) {
    throw new ErreurMasquageMenteur(masque.champsMasques, chargeModifiee);
  }

  // ── La cascade, sur la charge MASQUÉE ─────────────────────────────────────
  const depart = indexPalierParRatio(mesureMasquee.octets / contexte.maxBytes);
  const tentatives: Tentative[] = [];

  for (let index = depart; index < PALIERS_COMPACTION.length; index += 1) {
    const entree = PALIERS_COMPACTION[index];
    if (entree === undefined) continue;

    const items = appliquerPalier(itemsMasques, entree.cle, contexte.compaction);
    if (items === null) continue; // palier impossible pour cet outil

    const enveloppe = construireEnveloppe({ ...commun, items, palier: entree.cle });
    const mesure = mesurer(enveloppe, contexte.outil.name);
    tentatives.push({ palier: entree.cle, octets: mesure.octets });

    if (mesure.octets <= contexte.maxBytes) {
      const etabli: ExecutionEtablie = {
        charge: enveloppe,
        palier: entree.cle,
        // DÉRIVÉ du palier, jamais choisi à part (§ 13.3 ↔ `OUTCOMES`).
        outcome: entree.outcome,
        octetsServis: mesure.octets,
        octetsBruts: mesureBrute.octets,
        champsMasques: masque.champsMasques,
        recordIds: identifiants.recordIds,
        partialSources: sources.sources,
        // § 13.2 — l'autre étage. Recopié, jamais confondu avec `truncated`.
        sourceIncomplete: charge.sourceIncomplete,
      };
      return autorise(ETAPE_EXECUTION, etabli);
    }
  }

  return refuse(ETAPE_EXECUTION, messageIncompactable(contexte, mesureBrute.octets, tentatives));
};

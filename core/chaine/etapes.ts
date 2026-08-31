/**
 * `core/chaine/etapes.ts` — LES CINQ ÉTAPES SANS PROPRIÉTAIRE, DÉCLARÉES.
 *
 * ═══ CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ═══
 *
 * Il DÉCLARE. Il n'exécute rien, il n'implémente aucune étape, et c'est
 * délibéré : cinq constructeurs travailleront en parallèle contre ces
 * interfaces, et chacun d'eux doit trouver ici la forme exacte de son verdict
 * plutôt que l'inventer.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * À la fin du lot 1, cinq des étapes du § 11 applicables au transport JSON-RPC
 * n'avaient AUCUN module propriétaire :
 *
 *   · 5  — scopes suffisants pour l'`effect` déclaré      (§ 11, § 19.2)
 *   · 6  — l'outil existe et il est activé                (§ 11, § 14 corr. 3)
 *   · 9  — curseur : signature HMAC et `filtersHash`      (§ 11, § 13.1)
 *   · 11 — provenance                                      (§ 11, § 20)
 *   · 14 — exécution, compaction en cascade, masquage      (§ 11, § 13.3)
 *
 * Conséquence MESURÉE par l'agent d'intégration, et non supposée : sans module,
 * chaque appelant les réécrit à la main. Deux d'entre elles (5 et 11) sont des
 * gardes de SÉCURITÉ, une (9) empêche une fenêtre de pagination silencieusement
 * fausse. La main qui les réécrit n'est gardée par rien, et deux appelants
 * écriront deux règles différentes sans que rien ne les confronte.
 *
 * ═══ LES QUATRE RÈGLES QUE TOUTE ÉTAPE DE CE FICHIER TIENT ═══
 *
 *  1. **LE NUMÉRO EST DÉRIVÉ, JAMAIS ÉCRIT.** Chaque étape s'ancre à
 *     `APPEL_STEPS` PAR SA CLÉ, via `ancrerEtape()`. Le § 11 prévient lui-même
 *     que la v5 avait « deux étapes dans le mauvais ordre » : un numéro écrit à
 *     la main ferait inscrire un `stepDenied` périmé dans `ops_audit`, sans
 *     qu'aucun type ne bronche. C'est déjà le motif d'`ETAPE_POLITIQUE`
 *     (`core/policy`) et d'`ETAPE_REFUS_PROFIL` (`core/profiles`).
 *
 *  2. **LE CODE AUSSI EST DÉRIVÉ.** `AncrageEtape.code` vaut ce que la table
 *     du § 11 associe à l'étape — y compris `null`. L'étape 5 est précisément
 *     dans ce cas : le § 11 lui donne un 403 nu, et le § 15 N'ÉNUMÈRE AUCUN
 *     CODE pour un scope insuffisant. Le trou reste VISIBLE plutôt que bouché
 *     par un code voisin qui mentirait sur la cause (voir README, « Écarts »).
 *
 *  3. **UN VERDICT, JAMAIS UN BOOLÉEN.** `refuse` porte le numéro, le code et
 *     un message qui dit ce qu'il faut faire ensuite (§ 15, deuxième règle).
 *     `autorise` porte ce que l'étape a ÉTABLI — le scope exigé, la définition
 *     relue, le curseur décodé — pour que l'étape suivante n'ait pas à le
 *     recalculer, donc à le recalculer différemment.
 *
 *  4. **AUCUN SECRET, AUCUN HMAC ICI.** Le curseur du § 13.1 est signé par un
 *     HMAC à clé propre, inscrite à la liste de rotation du § 25. Ce fichier en
 *     déclare le PORT (`SignataireCurseur`) et code contre lui. Une seconde
 *     implémentation d'HMAC dans le socle serait une seconde clé, donc une
 *     seconde échéance de rotation — c'est exactement ce que `core/audit`
 *     refuse déjà pour l'`argHash`, avec une garde qui rougit sur `createHmac`.
 *
 * ═══ CE QUI RESTE À FAIRE, ET COMMENT ON LE SAIT ═══
 *
 * `ETAPES_CHAINE`, à la fin de ce fichier, porte pour chaque étape un `statut`
 * — `déclarée` ou `implémentée` — et l'`executer` correspondant. Les deux ne
 * peuvent pas se contredire : `etapes.spec.ts` rougit sur une entrée qui se
 * dit implémentée sans fonction, ou déclarée avec une. Le jour où un
 * constructeur livre l'étape 9, il doit basculer son statut, et la garde le
 * lui rappelle.
 */

import { APPEL_STEPS } from "../types.js";
import type {
  AppelStep,
  AppelStepKey,
  DataClass,
  Effect,
  ErrorCode,
  OpsScope,
  PolicyLevel,
} from "../types.js";
import type { AnnotationsCompaction, Pagination } from "../adapter-kit/types.js";
import type { DefinitionOutil, ProfileName } from "../profiles/index.js";
import type { Outcome } from "../audit/index.js";
import { MODULES_ETAPES_CHAINE } from "./modules.js";
// ⚠️ CES CINQ IMPORTS REFERMENT UN CYCLE, ET C'EST POURQUOI `executer` EST UN
//    RÉSOLVEUR. Les cinq modules d'étape importent ce fichier-ci ; ce fichier-ci
//    les importe en retour, pour que le registre cesse de mentir sur son propre
//    dossier. Si `executer` portait la fonction DIRECTEMENT, l'initialisation
//    d'`ETAPES_CHAINE` lirait une liaison encore en zone morte dès qu'un module
//    d'étape est le point d'entrée — son propre `.spec.ts`, par exemple — et
//    lèverait un `ReferenceError` selon l'ordre de chargement. Une fonction
//    fléchée ne LIT la liaison qu'au moment où on l'appelle, donc après que tout
//    est chargé. `etapes.spec.ts` APPELLE les cinq résolveurs : si le cycle se
//    referme mal un jour, c'est là que ça rougit, pas en production.
import { etape05Scopes } from "./etape-05-scopes.js";
import { creerEtapeCatalogue } from "./etape-06-outil.js";
import { etapeCurseur } from "./etape-09-curseur.js";
import { etape11Provenance } from "./etape-11-provenance.js";
import { executerEtape14 } from "./etape-14-execution.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ANCRAGE — la seule dérivation de numéro et de code de tout ce module
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'une étape sait d'elle-même, entièrement LU dans `APPEL_STEPS`.
 *
 * Aucun des trois champs n'est saisi. C'est le point : renuméroter le § 11, ou
 * lui ajouter une étape — ce qui est arrivé une fois, avec l'étape 0 du § 23 —
 * met à jour les cinq étapes de ce fichier sans qu'une ligne soit à retoucher.
 */
export interface AncrageEtape<K extends AppelStepKey = AppelStepKey> {
  /** La clé de l'étape dans `APPEL_STEPS`. C'est la SEULE valeur écrite. */
  readonly cle: K;
  /** Le numéro écrit dans `ops_audit.stepDenied` (§ 11). */
  readonly numero: AppelStep;
  /**
   * Le code du § 15 rendu au refus, ou `null` quand le § 11 ne nomme qu'un
   * statut HTTP nu. `null` N'EST PAS UN OUBLI — voir la règle 2 de l'en-tête.
   */
  readonly code: ErrorCode | null;
  /** Le libellé du § 11, pour que les messages n'aient pas à le reformuler. */
  readonly libelle: string;
  /** Le statut HTTP nommé par le § 11, ou `null`. */
  readonly statutHttp: number | null;
}

/** Levée quand une étape s'ancre à une clé que `APPEL_STEPS` ne porte pas. */
export class ErreurAncrageEtape extends Error {
  public readonly cle: string;

  public constructor(cle: string) {
    super(
      `core/chaine : aucune étape de clé « ${cle} » dans APPEL_STEPS (§ 11). ` +
        "L'étape ne sait plus quel numéro inscrire dans `ops_audit.stepDenied`, et un " +
        "refus sans numéro est un refus muet : la métrique du § 24 n'aurait plus de " +
        `source. Clés connues : ${APPEL_STEPS.map((etape) => etape.cle).join(", ")}.`,
    );
    this.name = "ErreurAncrageEtape";
    this.cle = cle;
  }
}

/**
 * Ancre une étape à `APPEL_STEPS` par sa clé.
 *
 * ⚠️ ELLE LÈVE, elle ne rend pas `null`. Une étape qui ne trouve pas son
 *    ancrage au chargement du module doit faire échouer le démarrage : rendue
 *    silencieuse, elle inscrirait un `stepDenied` nul et le refus deviendrait
 *    indiscernable d'une exception dans `ops_audit`.
 */
export function ancrerEtape<K extends AppelStepKey>(cle: K): AncrageEtape<K> {
  const etape = APPEL_STEPS.find((candidate) => candidate.cle === cle);
  if (etape === undefined) throw new ErreurAncrageEtape(cle);
  return {
    cle,
    numero: etape.numero,
    code: etape.refus,
    libelle: etape.libelle,
    statutHttp: etape.statutHttp,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT — la forme commune aux cinq étapes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'une étape rend quand elle LAISSE PASSER.
 *
 * Elle porte `etabli` : ce que l'étape a établi et que la suivante consommera.
 * Sans ce champ, l'étape suivante recalculerait — c'est-à-dire recalculerait
 * DIFFÉREMMENT, et le socle aurait deux vérités sur le même fait. C'est le
 * défaut exact que le lot 1 a mesuré sur le niveau de politique, où deux
 * dérivations d'un même fait se contredisaient.
 */
export interface EtapeAutorise<T> {
  readonly issue: "autorise";
  /** DÉRIVÉ de `APPEL_STEPS`. Sert au journal et à la trace de progression. */
  readonly etape: AppelStep;
  readonly etabli: T;
}

/**
 * Ce qu'une étape rend quand elle REFUSE.
 *
 * `code` peut valoir `null`, et c'est un fait du CDC, pas un oubli : le § 11
 * range quatre étapes « HTTP seul » et l'étape 5 parmi celles auxquelles le
 * § 15 n'attribue aucun code JSON-RPC.
 */
export interface EtapeRefuse {
  readonly issue: "refuse";
  /** DÉRIVÉ de `APPEL_STEPS`. C'est le `ops_audit.stepDenied` de la ligne. */
  readonly etape: AppelStep;
  /** DÉRIVÉ de `APPEL_STEPS`. `null` quand le § 15 n'en nomme aucun. */
  readonly code: ErrorCode | null;
  /**
   * Ce qu'il faut faire ensuite (§ 15, deuxième règle).
   *
   * ⚠️ IL NE PORTE JAMAIS : un secret, une donnée personnelle, un jeton de
   *    confirmation (§ 20 : « jamais dans la réponse d'erreur »), ni une trace
   *    de pile (§ 15, `internal`).
   */
  readonly message: string;
}

/** Le verdict d'une étape. Union FERMÉE : un `switch` exhaustif la couvre. */
export type VerdictEtape<T> = EtapeAutorise<T> | EtapeRefuse;

/**
 * Fabrique un verdict d'autorisation, en LISANT le numéro dans l'ancrage.
 *
 * Elle existe pour qu'un implémenteur ne puisse pas écrire le numéro à la main :
 * la seule façon de produire un verdict est de passer l'ancrage.
 */
export function autorise<T>(ancrage: AncrageEtape, etabli: T): EtapeAutorise<T> {
  return { issue: "autorise", etape: ancrage.numero, etabli };
}

/** Fabrique un verdict de refus, numéro ET code LUS dans l'ancrage. */
export function refuse(ancrage: AncrageEtape, message: string): EtapeRefuse {
  return { issue: "refuse", etape: ancrage.numero, code: ancrage.code, message };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 5 — LES SCOPES SUFFISENT-ILS POUR L'`effect` DÉCLARÉ ? (§ 11, § 19.2)
// ═════════════════════════════════════════════════════════════════════════════

/** L'ancrage de l'étape 5, dérivé de `APPEL_STEPS`. */
export const ETAPE_SCOPES = ancrerEtape("scopes");

/**
 * LA CORRESPONDANCE `effect` → SCOPE EXIGÉ (§ 19.2).
 *
 * Déclarée comme un PORT, et non écrite ici, pour deux raisons :
 *
 *  · elle doit être TOTALE sur `EFFECTS`, et cette totalité se prouve par un
 *    `switch` exhaustif dans le module qui la porte — un `Record` littéral
 *    écrit ici se contenterait d'une clé de plus au premier `effect` ajouté ;
 *  · le § 19.2 y range une contradiction que le lot 1 a déjà relevée :
 *    `destructive` y figure à la fois comme un SCOPE et comme un `Effect`. Le
 *    § 09 énumère `ctx.scopes` en cinq valeurs, sans lui. La forme retenue
 *    dans `core/types.ts` est celle du § 09 : `destructive` est un `Effect`,
 *    et le § 19.2 le dit « assujetti à `ops:send` ». C'est une DÉCISION, elle
 *    doit vivre dans un module nommé, avec sa garde de totalité.
 */
export type CorrespondanceScopes = (effet: Effect) => OpsScope;

/**
 * Ce que l'étape 5 reçoit.
 *
 * ⚠️ `effect` VIENT D'`ops_tool`, JAMAIS DE L'APPELANT. C'est le corollaire que
 *    le lot 1 a signalé comme non couvert : « rien ne force l'`effect` à être
 *    lu dans `ops_tool` plutôt que reçu de l'appelant ». Ici il est lu dans la
 *    définition que l'étape 6 a RELUE — d'où l'ordre de la chaîne, et d'où le
 *    fait que ce contexte porte l'outil et non un `effect` nu.
 *
 * ⚠️ Le § 19.2 pose que ce contrôle est le PREMIER des deux : « le scope
 *    autorise EN PRINCIPE ; la politique et l'état console autorisent EN FAIT ».
 *    L'étape 5 ne remplace donc jamais l'étape 10, et l'étape 10 ne dispense
 *    jamais de l'étape 5. Le § 27 note d'ailleurs que pour Zoho l'étage
 *    « scope » ne sépare pas `write-draft` de `send` : le double contrôle n'y a
 *    qu'un seul étage réel, et c'est la politique qui porte l'autre.
 */
export interface ContexteScopes {
  /** § 19.2 — ce que le jeton autorise EN PRINCIPE. */
  readonly scopes: readonly OpsScope[];
  /** L'`effect` ÉPINGLÉ dans `ops_tool` (§ 20, règle d'épinglage). */
  readonly effectEpingle: Effect;
  /** Le nom complet de l'outil, pour que le message le nomme. */
  readonly outil: string;
  readonly correspondance: CorrespondanceScopes;
}

/** Ce que l'étape 5 établit quand elle laisse passer. */
export interface ScopesEtablis {
  /** Le scope qui a été EXIGÉ. Rendu pour que le journal puisse le montrer. */
  readonly scopeExige: OpsScope;
  /**
   * Vrai pour un `effect` que le § 19.2 assujettit à une confirmation
   * SYSTÉMATIQUE, à tous les niveaux, `libre` compris — aujourd'hui
   * `destructive`. L'étape 10 le lit ; elle ne le redéduit pas.
   */
  readonly confirmationSystematique: boolean;
}

/**
 * ÉTAPE 5 — les scopes du jeton couvrent-ils l'`effect` épinglé de l'outil ?
 *
 * Refuse avec le code `ETAPE_SCOPES.code`, qui vaut `scope_insufficient` depuis
 * la Recette du lot 1c : le § 11 lui donne un 403, le § 15 ne nommait aucun
 * code, et l'écart est tenu par `ops/codes-hors-tableau.ts`. Le message, lui,
 * doit dire quel scope manquait — sans jamais énumérer ceux que le jeton porte,
 * qui sont une information sur le porteur.
 */
export type EtapeScopes = (contexte: ContexteScopes) => VerdictEtape<ScopesEtablis>;

// ═════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 6 — L'OUTIL EXISTE ET IL EST ACTIVÉ (§ 11, § 14 correction 3)
// ═════════════════════════════════════════════════════════════════════════════

/** L'ancrage de l'étape 6, dérivé de `APPEL_STEPS`. */
export const ETAPE_CATALOGUE = ancrerEtape("outil-active");

/**
 * Un outil TEL QU'`ops_tool` LE PORTE.
 *
 * Il ÉTEND `DefinitionOutil` de `core/profiles` — il ne le recopie pas. C'est
 * ce qui permet à `estServi()` (§ 14, correction 3) de s'appliquer directement
 * au résultat de l'étape 6 à l'étape 7, sans conversion : une conversion serait
 * l'endroit où les deux formes commenceraient à diverger.
 *
 * Les quatre champs ajoutés sont ceux qu'`ops_tool` porte et que le budget
 * n'utilise pas — mais dont les étapes 5, 10, 11 et le journal ont besoin.
 */
export interface OutilDuCatalogue extends DefinitionOutil {
  readonly adapterId: string;
  /** § 12 — sans elle, « la version qui a servi » n'est journalisée nulle part. */
  readonly adapterVersion: string;
  /** § 20, épinglage — c'est CETTE valeur qui fait foi, pas celle reçue. */
  readonly effect: Effect;
  /** § 20 — `personal` et `sensitive` MARQUENT la session (étape 11). */
  readonly dataClass: DataClass;
  /** § 13.1 — le régime de pagination déclaré, que l'étape 9 interroge. */
  readonly pagination: Pagination;
  /** § 13.3 — les annotations que l'étape 14 applique. */
  readonly compaction: AnnotationsCompaction;
  /** § 13.3 — le plafond de sortie de cet outil, en octets. */
  readonly maxBytes: number;
  /**
   * § 09/§ 12 — les champs porteurs d'identifiants, DÉCLARÉS par l'outil.
   *
   * ⚠️ **ILS N'EXONÈRENT PLUS RIEN À L'ÉTAPE 11 — ADR 0015.** Ce champ sert au
   *    § 12 (`recordIds`, leur purge à la même échéance qu'`argHash`), pas au
   *    § 20 : ce qui referme un champ d'entrée est le SCHÉMA, et lui seul. Voir
   *    `core/adapter-kit/types.ts`, `idFields`.
   *
   * 🔧 **À RETIRER DE `ContexteProvenance` PAR LE CONSTRUCTEUR ②**, avec le
   *    paramètre `idFields` d'`analyserArgumentsDuSchema()` : tant que la
   *    signature l'accepte, un appelant peut le renseigner et rouvrir le trou.
   */
  readonly idFields: readonly string[];
  /**
   * 🔧 **CHAMP À AJOUTER PAR LE CONSTRUCTEUR ③ — ADR 0016.**
   * `governanceFields: readonly string[]`, propagé depuis `ops_tool`, cumulé
   * PAR UNION avec la reconnaissance par nom de `FAMILLES_GOUVERNANCE`. Une
   * déclaration ne peut qu'AJOUTER des champs surveillés. Voir
   * `core/adapter-kit/types.ts`, `ChampsDeGouvernanceDeclares`.
   */
}

/**
 * LE PORT DE LECTURE DU CATALOGUE — `ops_tool`, § 12.
 *
 * `core/chaine` ne connaît ni Prisma ni SQL, pour la même raison que
 * `core/audit` : l'étape doit pouvoir être éprouvée sur un double en mémoire.
 *
 * ⚠️ CE PORT NE MET RIEN EN CACHE, ET C'EST UNE EXIGENCE, PAS UN DÉTAIL. Le
 *    § 14, correction 3, dit que `ops_tool.enabled` bascule EN CONSOLE, SANS
 *    redéploiement : « la valeur mesurée en CI n'est jamais celle qui est
 *    servie ». Un cache de processus servirait l'ancienne valeur jusqu'au
 *    prochain redémarrage — c'est-à-dire qu'une désactivation d'urgence en
 *    console ne désactiverait rien. Si un cache devient nécessaire pour tenir
 *    le § 26, il porte une invalidation explicite, et cette phrase-ci doit être
 *    réécrite avec la mesure qui la justifie.
 */
export interface CatalogueOutils {
  /**
   * Relit un outil par son NOM COMPLET (préfixe dérivé compris, § 09).
   *
   * Rend `null` quand aucun outil ne porte ce nom : c'est à l'étape, pas au
   * port, de décider que c'est un refus.
   */
  relire(nomComplet: string): Promise<OutilDuCatalogue | null>;
}

/** Ce que l'étape 6 reçoit. */
export interface ContexteCatalogue {
  readonly nomComplet: string;
  readonly catalogue: CatalogueOutils;
  /**
   * L'instant de l'appel. Il sert à `retireDeLaListe`, que le § 13.4 dérive de
   * `ops_tool.retiredAt` — « une version dépréciée SORT de `tools/list` dès la
   * publication de v2 et reste APPELABLE six mois ».
   *
   * ⚠️ RETIRÉ DE LA LISTE ≠ DÉSACTIVÉ. L'étape 6 ne refuse PAS un outil retiré
   *    de la liste : il ne s'affiche plus, il répond encore. Confondre les deux
   *    couperait six mois de compatibilité d'un coup, en silence.
   */
  readonly maintenant: Date;
}

/** Ce que l'étape 6 établit : la définition RELUE, qui fait foi pour la suite. */
export interface CatalogueEtabli {
  readonly outil: OutilDuCatalogue;
  /** § 13.2 — `deprecated` du contrat de sortie, dérivé de `retireDeLaListe`. */
  readonly deprecie: boolean;
}

/**
 * ÉTAPE 6 — l'outil existe-t-il, et est-il activé ?
 *
 * `ops_tool.enabled` FAIT FOI (§ 14, correction 3). Le refus rend
 * `tool_disabled`, dont le § 15 exige que le message dise « qu'il existe, et
 * où l'activer » — donc DEUX messages distincts, puisqu'un outil inexistant ne
 * s'active nulle part. Les confondre enverrait un exploitant chercher un
 * interrupteur qui n'existe pas.
 */
export type EtapeCatalogue = (
  contexte: ContexteCatalogue,
) => Promise<VerdictEtape<CatalogueEtabli>>;

// ═════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 9 — LE CURSEUR : SIGNATURE ET `filtersHash` (§ 11, § 13.1)
// ═════════════════════════════════════════════════════════════════════════════

/** L'ancrage de l'étape 9, dérivé de `APPEL_STEPS`. */
export const ETAPE_CURSEUR = ancrerEtape("curseur");

/**
 * LA CHARGE D'UN CURSEUR KEYSET (§ 13.1), telle qu'elle est signée.
 *
 * Les trois champs sont ceux que le § 13.1 nomme : « HMAC sur
 * `{ lastId, lastSortValue, filtersHash }`, clé propre inscrite à la liste de
 * rotation du § 25 ».
 */
export interface ChargeCurseur {
  readonly lastId: string;
  /** La valeur de tri de la dernière ligne rendue. Sérialisée, jamais typée. */
  readonly lastSortValue: string;
  /**
   * L'empreinte des FILTRES de la requête qui a produit ce curseur.
   *
   * ⚠️ C'EST LUI, ET LUI SEUL, QUI EMPÊCHE LA FENÊTRE SILENCIEUSEMENT FAUSSE.
   *    Un curseur réutilisé avec d'autres filtres rendrait une page cohérente
   *    en apparence et fausse en fait — et rien, ni dans la réponse ni dans le
   *    journal, ne le dirait. Le § 13.1 en fait un refus (`cursor_invalid`), et
   *    le § 15 exige que le message dise « qu'il faut repartir de la première
   *    page ».
   */
  readonly filtersHash: string;
}

/**
 * LE PORT DE SIGNATURE DU CURSEUR — HMAC, clé propre, § 13.1 et § 25.
 *
 * ⚠️ CLÉ PROPRE, ET PAS CELLE DE L'`argHash`. Les deux sont des HMAC du socle,
 *    et c'est précisément pourquoi il faut les séparer : l'`argHash` est écrit
 *    dans `ops_audit` à chaque appel et le § 31 le PURGE à échéance, tandis
 *    qu'un curseur signé circule chez le client. Une clé commune ferait qu'une
 *    rotation motivée par l'un casserait l'autre, et qu'une fuite de l'un
 *    donnerait l'autre. Le § 25 tient la liste des clés à tourner ; celle-ci y
 *    entre à part.
 *
 * ⚠️ AUCUN REPLI DE DÉVELOPPEMENT. Une clé de secours connue permettrait de
 *    forger un curseur, donc de lire une fenêtre qu'aucun filtre ne borne. Le
 *    port échoue bruyamment si la clé manque — même règle que
 *    `core/limits/arg-hash.ts`.
 */
export interface SignataireCurseur {
  /** Signe une charge et rend le jeton opaque servi dans `meta.cursor`. */
  signer(charge: ChargeCurseur): Promise<string>;
  /**
   * Vérifie et décode un jeton.
   *
   * Rend `null` sur une signature invalide — SANS dire laquelle des deux
   * causes : une signature fausse et un jeton tronqué doivent être
   * indiscernables, sans quoi la réponse devient un oracle de forge.
   */
  verifier(jeton: string): Promise<ChargeCurseur | null>;
}

/** Ce que l'étape 9 reçoit. */
export interface ContexteCurseur {
  /** Le régime déclaré par l'outil (§ 13.1). */
  readonly pagination: Pagination;
  /** Le jeton reçu dans l'appel, ou `null` pour une première page. */
  readonly jetonRecu: string | null;
  /**
   * L'empreinte des filtres de CET appel, calculée sur l'entrée VALIDÉE.
   *
   * ⚠️ SUR L'ENTRÉE VALIDÉE, ET PAS SUR LA CHARGE BRUTE. L'étape 8 précède
   *    l'étape 9 dans le § 11 ; dès qu'un schéma porte un `.default()` ou une
   *    coercition, les deux empreintes diffèrent, et le curseur serait refusé
   *    au deuxième appel d'une pagination parfaitement licite. C'est la même
   *    leçon que le journal a apprise sur l'`argHash`.
   */
  readonly filtersHashCourant: string;
  readonly signataire: SignataireCurseur;
}

/** Ce que l'étape 9 établit. */
export interface CurseurEtabli {
  /** `null` sur une première page : il n'y a rien à reprendre. */
  readonly charge: ChargeCurseur | null;
  /** Vrai quand l'appel reprend une fenêtre, faux quand il l'ouvre. */
  readonly reprise: boolean;
}

/**
 * ÉTAPE 9 — le curseur est-il authentique, et porte-t-il les MÊMES filtres ?
 *
 * Trois refus possibles, tous en `cursor_invalid` (§ 15) et tous avec le même
 * conseil — repartir de la première page :
 *
 *  · un jeton dont la signature ne vérifie pas ;
 *  · un jeton dont le `filtersHash` diffère de celui de l'appel ;
 *  · un jeton fourni à un outil qui déclare `pagination: "none"` — le § 13.1
 *    note que `getAgendaFenetre` n'a « ni limit ni curseur ». Accepter un
 *    curseur là où l'outil n'en produit aucun, c'est accepter un jeton forgé
 *    ailleurs sans avoir de quoi le confronter.
 */
export type EtapeCurseur = (contexte: ContexteCurseur) => Promise<VerdictEtape<CurseurEtabli>>;

// ═════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 11 — LA PROVENANCE (§ 11, § 20 cinquième règle)
// ═════════════════════════════════════════════════════════════════════════════

/** L'ancrage de l'étape 11, dérivé de `APPEL_STEPS`. */
export const ETAPE_PROVENANCE = ancrerEtape("provenance");

/**
 * LE PORT DE L'INDEX DE PROVENANCE — § 20, mise en œuvre.
 *
 * Le § 20 le décrit mot pour mot : « un index EN MÉMOIRE, borné en durée et en
 * taille, tient les empreintes des extraits marqués. C'est une exception
 * motivée au § 31 (“aucun cache de contenu sur disque”) : jamais persistée, et
 * le healthcheck expose le nombre d'extraits indexés — SIGNAL POSITIF, pour
 * qu'une garde à zéro élément se voie. »
 *
 * ⚠️ D'où `taille()`, qui n'est pas un confort d'exploitation : c'est la seule
 *    chose qui distingue « aucune session marquée » de « l'index ne fonctionne
 *    plus ». Sans elle, un index cassé rendrait `domainesMarquants()` vide, la
 *    garde du § 20 laisserait tout passer, et rien ne le dirait.
 *
 * ⚠️ JAMAIS SUR DISQUE, JAMAIS DANS `ops_audit`. Ce que cet index porte est
 *    dérivé d'un contenu lu ; le § 31 interdit qu'un extrait entre au journal.
 */
export interface IndexProvenance {
  /**
   * Marque la session : un résultat de `dataClass` `personal` ou `sensitive`
   * vient d'en sortir. `marqueLaSession()` de `core/types.ts` décide QUELLES
   * classes marquent — cette décision ne se recopie pas ici.
   */
  marquer(sessionId: string, adapterId: string, empreintes: readonly string[]): void;

  /** Les domaines (`adapterId`) qui ont marqué cette session. */
  domainesMarquants(sessionId: string): readonly string[];

  /**
   * Le nombre d'extraits indexés, TOUTES SESSIONS CONFONDUES. Signal positif
   * du healthcheck (§ 20). Il ne porte aucune donnée, seulement un compte.
   */
  taille(): number;
}

/**
 * Ce que l'étape 11 reçoit.
 *
 * ⚠️ CE QUE LE § 20 A CORRIGÉ, ET QU'IL NE FAUT PAS RÉINTRODUIRE. L'ancienne
 *    règle disait : « le socle refuse tout appel d'outil dont les arguments
 *    proviennent VERBATIM d'un contenu lu dans le même tour ». Elle n'était pas
 *    implémentable — le socle n'a aucune notion de « tour » —, elle aurait
 *    interdit `reply` et `forward`, et une simple reformulation la contournait.
 *    Le socle raisonne donc sur la PROVENANCE, jamais sur la forme : ce
 *    contexte ne porte AUCUN texte à comparer.
 *
 * ⚠️ **TOUT CE CONTEXTE S'ANCRE SUR `sessionId`, ET C'EST LE VERROU N° 1 DU
 *    § 20 — ADR 0014.** Un appelant qui renouvelle sa session entre la lecture
 *    et l'appel suivant annule cette étape en entier : l'index reste peuplé, la
 *    marque reste vivante, elle est simplement cherchée au mauvais endroit, et
 *    aucun compte ne bouge. Le `sessionId` est donc ÉTABLI PAR LE SOCLE et
 *    jamais accepté d'un appelant — voir `core/identite/session.ts`.
 *
 * 🔧 **TYPE À RESSERRER PAR LE CONSTRUCTEUR ① :** `sessionId: SessionId`, le
 *    type marqué de `core/identite/`. Tant qu'il est une `string`, la règle
 *    ci-dessus est une consigne, pas une propriété.
 */
export interface ContexteProvenance {
  readonly sessionId: string;
  /** Le domaine de l'appel COURANT. La règle porte sur « un AUTRE domaine ». */
  readonly adapterId: string;
  /**
   * Vrai si l'appel porte au moins un ARGUMENT LIBRE — un champ de texte que
   * l'appelant remplit, par opposition à un identifiant ou une énumération.
   *
   * ⚠️ CE BOOLÉEN N'EST PAS DEVINÉ PAR LE SOCLE. Il se dérive du JSON Schema
   *    d'entrée de l'outil, qui est fermé (§ 09) : un champ `string` sans
   *    `enum`, `format` ni `pattern` est libre ; un champ déclaré dans
   *    `idFields` ne l'est pas. Le calcul appartient à l'implémenteur de
   *    l'étape, avec sa garde de totalité — mais il porte sur le SCHÉMA, jamais
   *    sur la valeur, sinon on retombe sur la règle « verbatim » que le § 20 a
   *    retirée.
   */
  readonly porteUnArgumentLibre: boolean;
  /**
   * Vrai si l'appel porte un ARGUMENT DE GOUVERNANCE : niveau de politique,
   * TTL, bascule d'outil, destinataire d'un envoi, créneau posé.
   *
   * § 20 : ceux-là « ne peuvent JAMAIS provenir d'un contenu lu ». Ils ne sont
   * donc pas confirmables — ils sont refusés, session marquée, quel que soit le
   * niveau de politique. C'est la seule branche de cette étape qu'aucune
   * confirmation humaine ne rattrape.
   *
   * ⚠️ **CE BOOLÉEN EST DÉRIVÉ DE DEUX SOURCES CUMULÉES — ADR 0016.** La
   *    reconnaissance PAR LE NOM (`FAMILLES_GOUVERNANCE`) laissait échapper
   *    9 noms sur 20 confrontés, et un motif ne prouve que l'absence de la forme
   *    écrite. L'outil DÉCLARE donc ses champs de gouvernance
   *    (`governanceFields`, § 09), et le socle prend l'UNION des deux. La
   *    déclaration ne peut qu'AJOUTER : elle ne retire jamais un champ que le
   *    nom avait retenu.
   */
  readonly porteUnArgumentDeGouvernance: boolean;
  /** § 12, règle 1 — le niveau CALCULÉ à l'appel (étape 10, déjà passée). */
  readonly niveau: PolicyLevel;
  readonly index: IndexProvenance;
}

/** Ce que l'étape 11 établit. */
export interface ProvenanceEtablie {
  /** Les domaines qui avaient marqué la session. Vide = session propre. */
  readonly domainesMarquants: readonly string[];
  /**
   * § 20 — « est REFUSÉ ou CONFIRMÉ ». Quand l'appel passe mais que la session
   * est marquée par un autre domaine, l'étape laisse passer EN EXIGEANT une
   * confirmation humaine — jamais en la fabriquant.
   *
   * ⚠️ Ni l'élicitation MCP, ni une réponse produite par le démon vocal ne
   *    comptent comme confirmation humaine (§ 20). Sans cette clause, la voie B
   *    du § 30 contourne le niveau `confirmé` par construction.
   */
  readonly confirmationExigee: boolean;
  /** Le nombre d'extraits que l'index portait au moment du contrôle (§ 20). */
  readonly extraitsIndexes: number;
}

/**
 * ÉTAPE 11 — un argument libre part-il vers un AUTRE domaine, session marquée ?
 *
 * Refuse en `provenance_denied`, dont le § 15 exige que le message dise « quel
 * domaine a marqué la session » — le DOMAINE, jamais l'extrait ni son contenu.
 */
export type EtapeProvenance = (contexte: ContexteProvenance) => VerdictEtape<ProvenanceEtablie>;

// ═════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 14 — EXÉCUTION, COMPACTION EN CASCADE, MASQUAGE (§ 11, § 13.3)
// ═════════════════════════════════════════════════════════════════════════════

/** L'ancrage de l'étape 14, dérivé de `APPEL_STEPS`. */
export const ETAPE_EXECUTION = ancrerEtape("execution");

/**
 * LES QUATRE PALIERS DE LA CASCADE DU § 13.3, DANS L'ORDRE.
 *
 * L'ordre est SIGNIFIANT et c'est de lui que la cascade dérive ses seuils : on
 * ne passe au palier suivant que si le précédent n'a pas suffi. Le tableau
 * porte les seuils pour qu'ils vivent à UN SEUL endroit — les recopier dans
 * l'implémentation ferait deux cascades, et la sortie ne dirait plus laquelle
 * a servi.
 */
export const PALIERS_COMPACTION = [
  {
    cle: "intact",
    /** Sous le plafond : rien n'est retiré. */
    seuilMax: 1,
    outcome: "ok",
  },
  {
    cle: "raccourci",
    /** < 150 % du plafond : raccourcir les champs de `compaction.free`. */
    seuilMax: 1.5,
    outcome: "compacté",
  },
  {
    cle: "allege",
    /** 150–300 % : retirer les champs de `compaction.tier2`. */
    seuilMax: 3,
    outcome: "compacté",
  },
  {
    cle: "agrege",
    /** > 300 % : mode agrégat sur `compaction.aggregateBy`. */
    seuilMax: Number.POSITIVE_INFINITY,
    outcome: "agrégé",
  },
] as const satisfies ReadonlyArray<{
  readonly cle: string;
  readonly seuilMax: number;
  readonly outcome: Outcome;
}>;

export type PalierCompaction = (typeof PALIERS_COMPACTION)[number]["cle"];

/**
 * LE MASQUAGE — § 19 bis.
 *
 * Le socle traduit SCOPE SOCLE → RÔLE CONSOLE → DRAPEAUX et transmet le
 * résultat dans `ctx.habilitations`. Le § 08 ajoute que l'adaptateur « applique
 * le droit À LA SÉLECTION, pas après ».
 *
 * ⚠️ CE PORT N'EST DONC PAS LA PARADE PRINCIPALE, ET IL FAUT L'ÉCRIRE : le
 *    masquage de l'étape 14 est un SECOND rideau, appliqué à ce que
 *    l'adaptateur a déjà rendu. Un adaptateur qui aurait sélectionné trop large
 *    a déjà lu la donnée ; le masquage l'empêche d'atteindre le modèle, il ne
 *    l'empêche pas d'avoir été lue. La décision W-6 (§ 19 bis) porte sur la
 *    sélection, pas sur ce rideau.
 */
export interface Masquage {
  /**
   * Rend la charge privée des champs que les habilitations ne couvrent pas, ET
   * le nombre de champs effectivement masqués.
   *
   * ⚠️ LE COMPTE N'EST PAS DÉCORATIF : un masquage qui masque zéro champ sur
   *    une charge qui en porte est indiscernable d'un masquage correct sur une
   *    charge propre. C'est le compte, pas la couleur, qui le dit.
   */
  appliquer(charge: unknown): { readonly charge: unknown; readonly champsMasques: number };
}

/** Ce que l'étape 14 reçoit. */
export interface ContexteExecution {
  readonly outil: OutilDuCatalogue;
  /**
   * L'appel de l'adaptateur, DÉJÀ construit par l'orchestrateur.
   *
   * ⚠️ Il rend la charge BRUTE. La compaction et le masquage ne sont pas de son
   *    ressort : le socle ne délègue jamais à l'adaptateur la décision de ce
   *    qui sort. Il peut en revanche déclarer des sources partielles — c'est le
   *    § 13.2, et c'est ce que porte `partialSources`.
   */
  readonly executer: () => Promise<ChargeAdaptateur>;
  readonly masquage: Masquage;
  /** § 09 — le plafond de sortie DÉCLARÉ par l'outil, en octets. */
  readonly maxBytes: number;
  readonly compaction: AnnotationsCompaction;
}

/** Ce qu'un adaptateur rend, avant toute compaction et tout masquage. */
export interface ChargeAdaptateur {
  readonly items: readonly unknown[];
  /**
   * § 13.2 — les canaux d'un outil composite qui ont ÉCHOUÉ (`failedSources`)
   * ou qui avaient DÉJÀ coupé avant le socle (`sourceIncomplete`).
   *
   * ⚠️ Les deux ne se confondent pas : `truncated` dit que LE SOCLE a compacté,
   *    `sourceIncomplete` que LA SOURCE avait déjà coupé. Réutiliser le même
   *    booléen pour les deux étages produit exactement ce que la note
   *    « troncature honnête » veut empêcher — et c'est un défaut mesuré dans le
   *    dépôt voisin, pas une hypothèse.
   */
  readonly failedSources: readonly string[];
  readonly sourceIncomplete: boolean;
  /** § 09, `idFields` — DÉCLARÉS par l'outil, jamais devinés par le socle. */
  readonly recordIds: readonly string[];
}

/** Ce que l'étape 14 établit — la charge SERVIE, et ce qu'il a fallu en faire. */
export interface ExecutionEtablie {
  readonly charge: unknown;
  /** Le palier de la cascade qui a suffi (§ 13.3). */
  readonly palier: PalierCompaction;
  /** `ops_audit.outcome` — DÉRIVÉ du palier, jamais choisi à part. */
  readonly outcome: Outcome;
  /** Octets UTF-8 de la charge SERVIE, après compaction et masquage. */
  readonly octetsServis: number;
  /** Octets UTF-8 de la charge BRUTE. Le rapport des deux dit le gain réel. */
  readonly octetsBruts: number;
  readonly champsMasques: number;
  readonly recordIds: readonly string[];
  readonly partialSources: readonly string[];
  /** § 13.2 — `meta.sourceIncomplete`, DISTINCT de `meta.truncated`. */
  readonly sourceIncomplete: boolean;
}

/**
 * ÉTAPE 14 — exécuter, puis compacter en cascade, puis masquer.
 *
 * ⚠️ L'ORDRE DES DEUX DERNIERS N'EST PAS LIBRE : on MASQUE AVANT DE MESURER LE
 *    PALIER FINAL, sinon un champ masqué compterait dans le dépassement et la
 *    cascade retirerait un champ de plus que nécessaire — ou, pire, un champ
 *    masqué pourrait faire basculer une réponse en `result_too_large` alors que
 *    ce qui SORT tient sous le plafond.
 *
 * ⚠️ CETTE ÉTAPE EST LA SEULE OÙ L'EFFET EXTÉRIEUR A DÉJÀ EU LIEU quand elle
 *    rend son verdict. C'est là que l'invariant de sortie du § 11 est le plus
 *    fragile — voir `orchestrateur.ts`, « la borne de l'invariant ».
 *
 * Refuse en `result_too_large` quand même l'agrégat ne suffit pas, ou quand
 * l'outil n'a pas d'`aggregateBy` et que le troisième palier est donc
 * impossible. Le § 15 exige que le message dise COMMENT FILTRER.
 */
export type EtapeExecution = (
  contexte: ContexteExecution,
) => Promise<VerdictEtape<ExecutionEtablie>>;

// ═════════════════════════════════════════════════════════════════════════════
//  LE REGISTRE — ce qui est déclaré, ce qui est implémenté, et la différence
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'état d'une étape de ce module.
 *
 * ⚠️ POURQUOI CE CHAMP EXISTE. Déclarer une interface ne fait pas tourner une
 *    garde. Sans ce statut, `core/chaine` revendiquerait les cinq étapes auprès
 *    de la garde de propriété du § 11 — qui deviendrait verte — alors qu'aucune
 *    ne s'exécute. Ce serait le motif exact que ce chantier interdit : une
 *    garde verte parce qu'elle ne mesure rien.
 *
 * Le statut et l'`executer` ne peuvent pas se contredire : `etapes.spec.ts`
 * rougit sur une entrée qui se dit `implémentée` sans fonction, comme sur une
 * entrée `déclarée` qui en porte une.
 */
export const STATUTS_ETAPE = ["déclarée", "implémentée"] as const;

export type StatutEtape = (typeof STATUTS_ETAPE)[number];

/** Une entrée du registre des étapes de `core/chaine`. */
export interface EntreeChaine {
  readonly ancrage: AncrageEtape;
  readonly statut: StatutEtape;
  /**
   * `null` tant que l'étape n'est que déclarée.
   *
   * ⚠️ `unknown` À DESSEIN, ET NON LE TYPE PRÉCIS DE L'ÉTAPE. Ce registre sert
   *    aux gardes, qui vérifient la COHÉRENCE statut/fonction ; c'est
   *    l'orchestrateur, lui, qui reçoit chaque étape sous son type exact. Un
   *    registre typé sur une union des cinq signatures obligerait à un
   *    transtypage à chaque lecture, c'est-à-dire à l'endroit précis où la
   *    garde cesserait de garder.
   */
  readonly executer: unknown;
  /**
   * Le module qui PORTE l'implémentation, pour que le reste-à-faire se lise.
   *
   * ⚠️ LU DANS `modules.ts`, JAMAIS ÉCRIT ICI. Ce champ a nommé pendant tout le
   *    lot cinq fichiers qui n'existaient pas, pendant qu'`EXECUTANTS_ETAPES`
   *    en nommait cinq autres qui existaient. Deux dérivations d'un même fait
   *    se contredisaient, et rien ne les confrontait : le reste-à-faire
   *    renvoyait vers des chemins fantômes. Les deux tables LISENT désormais la
   *    même feuille, et `etapes.spec.ts` confronte chaque chemin AU DISQUE —
   *    une chaîne non vide qui ne désigne aucun fichier ne suffit plus.
   */
  readonly module: string;
  /**
   * L'étape est-elle servie par une FABRIQUE plutôt que par une fonction nue ?
   *
   * ⚠️ CE CHAMP N'EST PAS COSMÉTIQUE. `creerEtapeCatalogue(dependances)` rend
   *    une `EtapeCatalogue` ; elle n'en EST pas une. Un appelant qui prendrait
   *    la valeur rendue par le résolveur pour une étape la passerait à
   *    `DependancesOrchestrateur` et obtiendrait un verdict fabriqué à partir de
   *    rien. Le registre le DIT plutôt que de laisser la signature le trahir au
   *    premier appel.
   */
  readonly fabrique: boolean;
}

/**
 * LES CINQ ÉTAPES QUE `core/chaine` REVENDIQUE.
 *
 * C'est cette constante que la garde de propriété du § 11 lit
 * (`core/__tests__/integration.spec.ts`), au même titre qu'`ETAPE_POLITIQUE`
 * pour `core/policy` et `ETAPES_LIMITES` pour `core/limits`.
 *
 * ⚠️ `executer` EST UN RÉSOLVEUR, PAS L'ÉTAPE. Voir la note du bloc d'imports :
 *    les cinq modules d'étape importent ce fichier, donc ce fichier ne peut pas
 *    LIRE leurs liaisons au moment où il s'initialise. La fonction fléchée
 *    reporte la lecture à l'appel. `etapes.spec.ts` appelle les cinq et vérifie
 *    que chacune rend bien une fonction : sans cet appel, le résolveur serait
 *    non nul quoi qu'il arrive, et la garde de cohérence deviendrait une garde
 *    qui ne regarde rien.
 */
export const ETAPES_CHAINE = [
  {
    ancrage: ETAPE_SCOPES,
    statut: "implémentée",
    executer: () => etape05Scopes,
    module: MODULES_ETAPES_CHAINE.scopes,
    fabrique: false,
  },
  {
    ancrage: ETAPE_CATALOGUE,
    statut: "implémentée",
    // ⚠️ UNE FABRIQUE : `creerEtapeCatalogue(dependances)` rend l'étape. D'où
    //    `fabrique: true` — le registre ne laisse pas croire au contraire.
    executer: () => creerEtapeCatalogue,
    module: MODULES_ETAPES_CHAINE["outil-active"],
    fabrique: true,
  },
  {
    ancrage: ETAPE_CURSEUR,
    statut: "implémentée",
    executer: () => etapeCurseur,
    module: MODULES_ETAPES_CHAINE.curseur,
    fabrique: false,
  },
  {
    ancrage: ETAPE_PROVENANCE,
    statut: "implémentée",
    executer: () => etape11Provenance,
    module: MODULES_ETAPES_CHAINE.provenance,
    fabrique: false,
  },
  {
    ancrage: ETAPE_EXECUTION,
    statut: "implémentée",
    executer: () => executerEtape14,
    module: MODULES_ETAPES_CHAINE.execution,
    fabrique: false,
  },
] as const satisfies readonly EntreeChaine[];

/** Les numéros que `core/chaine` revendique — DÉRIVÉS, jamais listés. */
export const ETAPES_REVENDIQUEES: readonly AppelStep[] = ETAPES_CHAINE.map(
  (entree) => entree.ancrage.numero,
);

/**
 * Les étapes de ce module qui ne sont ENCORE QUE DÉCLARÉES.
 *
 * C'est le reste-à-faire, calculé et non écrit. Il valait cinq pendant tout le
 * lot 1 ; il vaut ZÉRO depuis que les cinq modules ont atterri — la chaîne du
 * § 11 a désormais un propriétaire pour chacune de ses étapes.
 *
 * ⚠️ CE COMPTE NE PROUVE RIEN À LUI SEUL, et c'est écrit ici pour qu'on ne le
 *    lise pas comme une garantie : il dit ce que le registre DÉCLARE. Ce qui
 *    l'adosse à quelque chose de réel, c'est la garde d'`etapes.spec.ts`, qui
 *    confronte `module` au disque et APPELLE `executer`.
 */
export function etapesNonImplementees(): readonly EntreeChaine[] {
  // L'élargissement est délibéré : `ETAPES_CHAINE` est `as const`, donc le
  // compilateur sait que les cinq statuts valent aujourd'hui « implémentée » et
  // refuserait la comparaison. Le jour où une SIXIÈME étape arrive « déclarée »,
  // ce filtre doit encore savoir la trouver.
  const registre: readonly EntreeChaine[] = ETAPES_CHAINE;
  return registre.filter((entree) => entree.statut === "déclarée");
}

/** Le type des profils, ré-exporté pour que l'orchestrateur n'ouvre pas la sienne. */
export type { ProfileName };

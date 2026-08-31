/**
 * axion-ops — les types partagés du socle, ET EUX SEULS.
 *
 * Ce fichier est posé par la Fondation et lu par les six constructeurs. Il ne
 * contient AUCUN métier, AUCUNE logique, AUCUN accès aux données : uniquement
 * le vocabulaire commun du cahier des charges v6.
 *
 * Règle de tenue de ce fichier : n'y ajouter un type que s'il est employé par
 * DEUX modules de `core/` au moins. Un type qui ne sert qu'à `core/policy/`
 * vit dans `core/policy/`.
 *
 * Sources : § 09 (contrat d'adaptateur), § 11 (chaîne d'appel),
 *           § 15 (codes d'erreur), § 19 (identité), § 20 (garde-fous).
 */

/**
 * ⚠️ L'UNIQUE IMPORT DE CE FICHIER, ET IL EST DE TYPE — ADR 0014.
 *
 * La règle de tenue ci-dessus tient encore : ce module ne dépend d'AUCUNE
 * valeur, il n'exécute rien au chargement, et `core/identite/session.ts`
 * n'importe lui-même que `node:crypto`. Aucun cycle n'est possible.
 *
 * Un import DE TYPE plutôt que de valeur, et ce n'est pas un détail de style :
 * la garde G2 de l'ADR 0014 refuse à tout module livré hors de
 * `core/identite/` d'importer une VALEUR d'ici — le droit de FRAPPER une
 * session. Nommer le type n'est pas ce droit-là, et la garde fait la
 * différence.
 */
import type { SessionId } from "./identite/session.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Effect — § 09
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que l'outil FAIT. Déclaré par l'outil, ÉPINGLÉ dans `ops_tool`, et
 * SANS VALEUR PAR DÉFAUT PERMISSIVE (§ 09, harnais, contrôle 1).
 *
 * § 20, épinglage : tout écart entre la valeur épinglée et la valeur reçue
 * DÉSACTIVE l'outil et alerte, au lieu de mettre à jour en silence. Un `effect`
 * basculé de `send` à `read` n'est ni un champ ajouté ni un champ disparu —
 * sans cette règle il n'apparaît nulle part.
 *
 * § 20, « ce qui compte comme effet extérieur » — le test : quelqu'un d'autre
 * que moi peut-il s'en apercevoir ? Poser un événement dans l'agenda ferme le
 * créneau Calendly correspondant en ~11 secondes : c'est un `send`.
 */
export const EFFECTS = ["read", "write-draft", "send", "destructive"] as const;

export type Effect = (typeof EFFECTS)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  DataClass — § 09
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que l'outil TOUCHE.
 *
 * § 20, cinquième règle : tout résultat d'un appel dont le `dataClass` est
 * `personal` ou `sensitive` MARQUE LA SESSION. Un appel ultérieur, dans la même
 * session, vers un adaptateur d'un AUTRE DOMAINE et portant un argument libre,
 * est refusé ou confirmé (étape 11).
 *
 * § 20, étiquetage : tout ce qui revient d'un adaptateur est donnée étiquetée,
 * ENVELOPPE COMPRISE, quel que soit son `dataClass` — l'étiquetage se décide
 * côté socle, JAMAIS sur déclaration.
 *
 * L'ordre du tableau est SIGNIFIANT : croissant en sensibilité. C'est de lui
 * que `ops_adapter.maxDataClass` tire sa comparaison — dériver, ne pas recopier.
 */
export const DATA_CLASSES = ["none", "internal", "personal", "sensitive"] as const;

export type DataClass = (typeof DATA_CLASSES)[number];

/** Rang de sensibilité, dérivé de l'ordre de `DATA_CLASSES`. */
export function rangDataClass(classe: DataClass): number {
  return DATA_CLASSES.indexOf(classe);
}

/** Les deux classes qui marquent la session de provenance (§ 20, étape 11). */
export function marqueLaSession(classe: DataClass): boolean {
  return rangDataClass(classe) >= rangDataClass("personal");
}

// ═════════════════════════════════════════════════════════════════════════════
//  AdapterMode — § 08 et § 09
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Où vit l'adaptateur. La règle, en une phrase (§ 08) : *l'adaptateur vit chez
 * son produit quand le produit est à toi ; il vit dans le socle quand le
 * produit est un tiers.*
 *
 * · `hébergé` — l'adaptateur vit dans le processus du socle. Le socle injecte
 *   les secrets déjà déchiffrés. Seul cas en v1 : Zoho Mail.
 * · `fédéré`  — LE SOCLE N'ÉMET JAMAIS UN SECRET DÉCHIFFRÉ HORS DE SON
 *   PROCESSUS. L'adaptateur détient ses identifiants par les moyens de son
 *   produit et déclare `secrets: []`. Assertion au registre :
 *   `mode === "fédéré" && secrets.length > 0` ⇒ enregistrement REFUSÉ.
 *
 * Ce n'est pas une correction de style : « le socle injecte les secrets déjà
 * déchiffrés » appliqué à un adaptateur fédéré déverse des secrets en clair
 * vers un autre processus — et, dans le cas du CRM, vers un dépôt PUBLIC.
 */
export const ADAPTER_MODES = ["hébergé", "fédéré"] as const;

export type AdapterMode = (typeof ADAPTER_MODES)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  PolicyLevel — § 20
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le niveau de garde-fou.
 *
 * · `brouillon` — lecture et écriture réversible, aucun effet extérieur. DÉFAUT,
 *   et niveau de repli en cas de panne, corruption ou redémarrage (fail-closed,
 *   avec une ligne d'historique `setBy: "boot"`).
 * · `confirmé`  — effets extérieurs avec JETON DE CONFIRMATION À USAGE UNIQUE,
 *   de courte durée, LIÉ À L'`argHash` DE L'APPEL EXACT, délivré sur le canal
 *   du desserrage et JAMAIS DANS LA RÉPONSE D'ERREUR. Ni l'élicitation MCP ni
 *   une réponse produite par le démon vocal ne comptent comme confirmation
 *   humaine.
 * · `libre`     — effets extérieurs sans confirmation PAR APPEL, dans les
 *   limites de débit. TOUJOURS AVEC UNE DURÉE. `libre` dispense de la
 *   confirmation par appel, JAMAIS de la relecture d'un brouillon : le geste
 *   humain reste.
 *
 * L'ordre du tableau est SIGNIFIANT : du plus strict au plus permissif. § 12,
 * règle 1 — le niveau appliqué est LE PLUS STRICT parmi les lignes non expirées
 * dont le `scope` couvre l'outil appelé. Ce calcul dérive de cet ordre.
 *
 * Asymétrie (§ 20, protection 1) : RESSERRER est toujours libre — outil MCP
 * `ops.policy.tighten`, sans scope particulier. DESSERRER n'est jamais libre —
 * aucun outil MCP, une route dédiée du socle sous `ops:policy`, second facteur
 * TOTP, TTL obligatoire.
 */
export const POLICY_LEVELS = ["brouillon", "confirmé", "libre"] as const;

export type PolicyLevel = (typeof POLICY_LEVELS)[number];

/** Rang de permissivité, dérivé de l'ordre de `POLICY_LEVELS`. */
export function rangPolicyLevel(niveau: PolicyLevel): number {
  return POLICY_LEVELS.indexOf(niveau);
}

/**
 * Le plus strict de deux niveaux (§ 12, règle 1). C'est l'opération qu'applique
 * `core/policy` sur toutes les lignes non expirées dont le scope couvre l'outil.
 */
export function lePlusStrict(a: PolicyLevel, b: PolicyLevel): PolicyLevel {
  return rangPolicyLevel(a) <= rangPolicyLevel(b) ? a : b;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Scopes — § 19.2
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les scopes portés par un jeton, tels que `ctx.scopes` les reçoit (§ 09).
 *
 * DOUBLE CONTRÔLE : le scope autorise EN PRINCIPE ; la politique et l'état
 * console autorisent EN FAIT.
 *
 * ⚠️ `ops:policy` — LE JETON DU CONNECTEUR NE LE PORTE JAMAIS. C'est lui qui
 *    sépare « resserrer, toujours libre » de « desserrer, jamais libre ».
 *
 * ⚠️ Le § 19.2 range une sixième ligne, `destructive`, dans son tableau des
 *    scopes, en la décrivant comme « assujettie à `ops:send` ET à une
 *    confirmation systématique, à tous les niveaux, `libre` compris ». Le § 09,
 *    lui, énumère `ctx.scopes` en CINQ valeurs, sans elle. Les deux ne peuvent
 *    être vraies ensemble : `destructive` est traité ici comme un `Effect` — ce
 *    qu'il est déjà dans `EFFECTS` — et non comme un scope. Voir README,
 *    « Écarts relevés ».
 */
export const OPS_SCOPES = ["ops:read", "ops:draft", "ops:send", "ops:admin", "ops:policy"] as const;

export type OpsScope = (typeof OPS_SCOPES)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  Habilitations — § 19 bis
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le pont d'identité : le socle traduit SCOPE SOCLE → RÔLE CONSOLE → DRAPEAUX,
 * et transmet le résultat dans `ctx.habilitations`.
 *
 * ⚠️ RÈGLE — un handler qui lit une habilitation dans `input` EST UN DÉFAUT. Le
 *    schéma d'entrée est `.strict()`, pour qu'un champ d'autorisation glissé
 *    dans la charge utile soit un REFUS VISIBLE et non un silence.
 *
 * L'adaptateur n'invente jamais un droit : il le REÇOIT dans `ctx` et
 * l'applique À LA SÉLECTION, pas après (§ 08).
 *
 * Un drapeau nouveau s'ajoute ICI, jamais dans un `input`.
 */
export interface Habilitations {
  /**
   * § 19 bis — la décision de Will du 2026-08-27 :
   * `ROLES_APPELS = [super_admin, admin, editor]`
   * (`axionia/src/features/admin-calendly/acces.ts:91`) exclut NOMMÉMENT
   * `secretaire` et `responsable_qualite`.
   *
   * DÉFAUT en l'absence de réponse à la décision W-6 : le rôle le plus faible,
   * donc `false`, et coordonnées masquées.
   */
  readonly peutVoirAppels: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
//  ToolContext — § 09
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `ctx` — le contexte d'autorisation. LE SEUL CHEMIN par lequel une décision de
 * droit atteint la couche service.
 *
 * Le paramètre `TProfile` reste ouvert (`string`) ici À DESSEIN : l'énumération
 * FERMÉE des profils appartient à `core/profiles/` (§ 14, « la seule garde du
 * budget qui ne dépende d'aucun adaptateur pour exister »). La Fondation ne
 * l'écrit pas — elle ne peut pas la dériver, et la recopier créerait une
 * seconde source de vérité. Le module `core/profiles/` resserre le type en
 * ré-exportant `ToolContext<ProfileName>` ; les adaptateurs n'emploient QUE
 * cette forme resserrée, si bien qu'un profil inconnu devient une erreur de
 * COMPILATION.
 */
export interface ToolContext<TProfile extends string = string> {
  /** Qui appelle. */
  readonly principal: string;

  /**
   * Session de PILOTAGE — elle porte le marquage de provenance du § 20, et
   * c'est elle qu'on retrouve dans `ops_audit.sessionId`.
   *
   * § 11 : ce n'est PAS une session d'authentification. Le socle n'en tient
   * aucune — le jeton porte les droits. C'est un état de pilotage.
   *
   * ⚠️ **ELLE EST ÉTABLIE PAR LE SOCLE ET N'EST JAMAIS ACCEPTÉE DU CLIENT —
   *    ADR 0014.** C'est le verrou n° 1 du § 20 : la garde d'exfiltration s'ancre
   *    tout entière sur cette clé, et un appelant qui la renouvelle entre la
   *    lecture et l'appel suivant l'annule sans qu'aucun compte ne bouge.
   *
   *    Ce verrou a deux moitiés, et une seule tenait à la fin du lot 1b :
   *
   *     · `input` — TENUE, et par DÉRIVATION : le contrôle 7 du § 09
   *       (`core/adapter-kit/autorisation.ts`) lit les propriétés de ce type-ci
   *       dans le SOURCE de ce fichier et refuse tout schéma d'entrée qui en
   *       redéclare une. `sessionId` en fait partie depuis toujours ;
   *     · le TRANSPORT — ouverte, et c'est ce que l'ADR 0014 ferme.
   *
   * ✅ **TYPE RESSERRÉ — ADR 0014, LOT 1d.** {@link SessionId}, le type marqué de
   *    `core/identite/session.ts`. La Fondation ne pouvait pas le poser tant que
   *    la fabrique n'existait pas ; elle existe. La moitié TRANSPORT du verrou
   *    se ferme ici : un `ctx` fabriqué à partir d'une chaîne venue du réseau
   *    **ne compile plus**.
   *
   * ⚠️ CE RESSERREMENT NE CHANGE RIEN AU CONTRÔLE 7 DU § 09, ET IL FALLAIT LE
   *    VÉRIFIER. `clesDAutorisationDepuisSource()` dérive les noms interdits des
   *    NOMS DE PROPRIÉTÉ lus dans le source de ce fichier — son motif s'arrête au
   *    `:`, il ne lit jamais le type. `sessionId` reste donc refusé dans tout
   *    schéma d'entrée, et le plancher-témoin de la dérivation le dirait s'il
   *    cessait de l'être.
   */
  readonly sessionId: SessionId;

  /** § 19.2 — ce que le jeton autorise EN PRINCIPE. */
  readonly scopes: readonly OpsScope[];

  /**
   * § 12, règle 1 — CALCULÉ À L'APPEL (étape 10), jamais lu dans un champ brut.
   * Le TTL est évalué PARESSEUSEMENT ici, pas par une tâche de fond.
   */
  readonly policyLevel: PolicyLevel;

  /** Profil actif, lu dans `ops_runtime` (étape 7). */
  readonly profile: TProfile;

  /**
   * § 20 — l'EMPREINTE de la clé d'idempotence. **JAMAIS LA CLÉ — ADR 0020.**
   *
   * `null` quand l'outil déclare `idempotency: "n/a"`, ou quand l'appel n'en
   * porte aucune. Sinon soixante-quatre caractères hexadécimaux minuscules,
   * calculés par `empreinteDeCleDIdempotence` (`core/limits/idempotency.ts`).
   *
   * ⚠️ **CE CHAMP A PORTÉ LA CLÉ BRUTE, ET C'ÉTAIT UN CANAL.** L'anti-exfiltration
   *    du § 20 (étape 11) dérive « cet appel porte-t-il un argument libre ? » du
   *    SEUL `inputSchema`. La clé d'idempotence, elle, est une chaîne choisie
   *    librement par l'appelant qui voyage HORS d'`input` — c'est même le point du
   *    § 20 — et elle atteignait l'adaptateur telle quelle. Un appel vers un outil
   *    dont le schéma ne déclare aucun champ libre traversait donc l'étape 11 avec
   *    `porteUnArgumentLibre: false` en remettant une chaîne arbitraire à
   *    l'adaptateur. La garde était exacte sur son périmètre, et son périmètre
   *    n'était pas celui qu'on croyait.
   *
   * ⚠️ **POURQUOI UNE EMPREINTE ET NON UN RETRAIT PUR.** Un adaptateur qui relaie
   *    vers une API tierce portant sa propre idempotence a besoin d'un jeton
   *    STABLE par appel — et les outils concernés sont précisément les `send`.
   *    L'empreinte sert ce besoin à l'identique et REFERME le canal : l'appelant
   *    choisit le préimage, jamais le condensat.
   *
   * ⚠️ **ET LE NOM EST LUI-MÊME UNE GARDE.** Un champ nommé `idempotencyKey` qui
   *    ne porterait plus la clé serait un mensonge de type, et il survivrait à
   *    toutes les relectures. `idempotencyRef` dit ce qu'il contient, et le
   *    compilateur casse chez tout appelant qui croyait tenir la clé.
   *
   * ⚠️ **LE NOM RETIRÉ NE SORT PAS DE LA GARDE :** voir
   *    {@link NOMS_RESERVES_HORS_CONTEXTE}. Sans lui, ce retrait aurait ROUVERT
   *    un canal en en fermant un autre, et en silence.
   */
  readonly idempotencyRef: string | null;

  /**
   * Identifiant de corrélation. C'est lui, et lui seul, que rend `internal`
   * (§ 15) — jamais une trace de pile.
   *
   * 🔴 **IL EST FRAPPÉ PAR LE SOCLE, JAMAIS RECOPIÉ D'UNE VALEUR REÇUE —
   *    ADR 0020.** Ni un en-tête client, ni l'`id` d'une enveloppe JSON-RPC. Un
   *    identifiant de corrélation recopié est deux choses à la fois : une chaîne
   *    libre de plusieurs dizaines d'octets choisie par l'appelant — donc le même
   *    canal que celui qu'`idempotencyRef` vient de fermer — et un identifiant
   *    qui cesse d'être unique dès que le client en réutilise un.
   *
   *    C'est le motif exact de l'ADR 0014 appliqué au SECOND identifiant du `ctx`.
   *    La règle est posée AVANT que `core/transport/` existe : c'est le moment le
   *    moins cher de la vie du projet, et le seul où elle ne coûte aucune
   *    migration. Sa COUTURE appartient au transport, et le registre des coutures
   *    (ADR 0019) la surveille sous l'ADR 0001.
   */
  readonly requestId: string;

  /**
   * Échéance au-delà de laquelle le handler doit abandonner.
   *
   * 🔴 **ELLE EST CALCULÉE PAR LE SOCLE — ADR 0020.** `maintenant()` plus un
   *    budget borné par l'outil, jamais un horodatage reçu recopié tel quel. Un
   *    `Date` recopié est une valeur de plusieurs dizaines de bits choisie par
   *    l'appelant, et elle atteint l'adaptateur. Même remarque que pour
   *    `requestId` : la règle est posée avant le transport, sa couture y
   *    appartient, et le registre des coutures la surveille.
   */
  readonly deadline: Date;

  /** § 19 bis — calculé PAR LE SOCLE. Un handler ne le reconstitue jamais. */
  readonly habilitations: Habilitations;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Les noms que `ToolContext` ne porte PLUS — ADR 0020
// ═════════════════════════════════════════════════════════════════════════════

/**
 * NOMS QU'UN SCHÉMA D'ENTRÉE NE PEUT PAS PORTER, ET QUE `ToolContext` NE PORTE
 * PLUS. **ADR 0020, et ce tableau est OBLIGATOIRE avec le retrait.**
 *
 * ═══ LE PIÈGE QU'IL REFERME, ET IL N'EN EXISTE AUCUNE TRACE AILLEURS ═══
 *
 * Le contrôle 7 du § 09 (`core/adapter-kit/autorisation.ts`) DÉRIVE sa liste de
 * noms interdits des propriétés de {@link ToolContext}, lues dans le SOURCE de ce
 * fichier. C'est ce qui interdit à un schéma d'entrée de déclarer un champ
 * `idempotencyKey` — la règle que le § 20 énonce en toutes lettres, « la clé
 * voyage dans `ctx`, JAMAIS dans `input` ».
 *
 * **Retirer la propriété retire donc le nom de la liste, EN SILENCE.** La
 * décision qui ferme un canal en aurait ouvert un autre, et aucune garde
 * n'aurait bronché : le contrôle serait resté vert, simplement plus étroit d'un
 * nom. C'est le mode de défaillance le plus coûteux qu'on connaisse ici — une
 * garde qui rétrécit sans changer de couleur.
 *
 * ⚠️ **UN NOM N'EN SORT JAMAIS PARCE QU'IL A DISPARU DU TYPE.** C'est
 *    exactement l'inverse : il y ENTRE le jour où il quitte `ToolContext`. Ce
 *    tableau ne se vide pas, il s'allonge.
 *
 * ⚠️ **CE QU'IL NE PROUVE PAS.** Il compare des NOMS. Un champ d'entrée nommé
 *    autrement transporte la même chose et passe — c'est la borne déjà écrite du
 *    contrôle 7, et elle vaut ici mot pour mot.
 */
export const NOMS_RESERVES_HORS_CONTEXTE = ["idempotencyKey"] as const;

/** Un nom que `ToolContext` a porté et ne porte plus. */
export type NomReserveHorsContexte = (typeof NOMS_RESERVES_HORS_CONTEXTE)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  L'INVENTAIRE DES CANAUX DU `ctx` — ADR 0020
// ═════════════════════════════════════════════════════════════════════════════

/**
 * SOUS QUEL RÉGIME UN CHAMP DU `ctx` ATTEINT L'ADAPTATEUR.
 *
 * ═══ LA MÉTHODE D'ABORD, PARCE QU'ELLE VAUT PLUS QUE LA LISTE ═══
 *
 * Ce qui atteint un adaptateur est DÉRIVABLE, sans inspection et sans reste :
 * `AppelAdaptateur` a exactement deux paramètres — le `ctx` et l'entrée
 * VALIDÉE. L'entrée validée est le périmètre que le § 20 voit déjà (étape 11,
 * `porteUnArgumentLibre`). **L'inventaire des canaux INVISIBLES est donc,
 * exactement, les propriétés de {@link ToolContext}.**
 *
 * Le défaut d'`idempotencyKey` n'a pas été trouvé en inspectant du code : il a
 * été trouvé en fermant cette liste. C'est pour qu'elle reste fermée que le
 * régime de chaque champ est ÉCRIT.
 */
export const REGIMES_DE_CANAL = [
  /** Le TYPE ferme le canal : type marqué, union fermée, booléen calculé. */
  "fermé-par-construction",
  /** Le champ porte une chaîne, mais c'est LE SOCLE qui l'écrit, pas l'appelant. */
  "fermé-par-le-socle",
  /** La règle est posée ; sa COUTURE appartient à `core/transport/`, qui n'existe pas. */
  "à-fermer-au-transport",
  /** Canal RÉEL, non refermé, écart assumé et daté. */
  "ouvert-signalé",
] as const;

export type RegimeDeCanal = (typeof REGIMES_DE_CANAL)[number];

/** Le régime d'un champ, et le MOTIF qui le justifie. Le motif est obligatoire. */
export interface StatutDeCanal {
  readonly regime: RegimeDeCanal;
  /** Pourquoi. Une garde refuse un motif vide : un régime sans motif est une opinion. */
  readonly motif: string;
}

/**
 * LE RÉGIME DE CHACUN DES CHAMPS DU `ctx` — ADR 0020.
 *
 * ⚠️ **C'EST `keyof ToolContext` QUI FAIT LA TOTALITÉ, PAS CETTE LISTE.** Ajouter
 *    un champ à {@link ToolContext} sans le classer ici est une **erreur de
 *    compilation** ; en classer un qui n'existe pas aussi. Un tableau écrit à la
 *    main aurait vieilli en silence — c'est précisément ce qui est arrivé au
 *    canal `idempotencyKey`, resté hors de tout inventaire pendant trois lots.
 *
 * ⚠️ **ET LA GARDE CONFRONTE CE TYPE AU SOURCE.** `core/types.canaux.temoin.spec.ts`
 *    relit les propriétés dans le SOURCE de ce fichier — la même lecture que le
 *    contrôle 7 du § 09 — et vérifie deux choses : que les deux dérivations
 *    voient les mêmes champs, et qu'aucun champ déclaré `fermé-par-construction`
 *    ne porte en réalité une chaîne libre. Une seule des deux ne suffirait pas :
 *    le type dit la TOTALITÉ, le source dit le TYPE RÉEL de chaque champ.
 */
export const STATUT_DES_CANAUX_DE_CONTEXTE: Readonly<Record<keyof ToolContext, StatutDeCanal>> = {
  principal: {
    regime: "ouvert-signalé",
    motif:
      "Sa forme n'est bornée par rien, parce que rien ne l'émet : l'émetteur de jetons est " +
      "l'ADR 0001, et `core/auth/` n'existe pas. Un principal est une valeur d'annuaire et " +
      "non une chaîne libre, mais cela n'est écrit nulle part et aucune garde ne le tient. " +
      "À trancher AVEC l'émetteur, pas avant : une borne posée ici serait devinée.",
  },
  sessionId: {
    regime: "fermé-par-construction",
    motif:
      "`SessionId` est un type MARQUÉ (ADR 0014) : une chaîne venue du réseau ne compile pas " +
      "à cette place. Le socle la frappe, il ne l'accepte jamais du client.",
  },
  scopes: {
    regime: "fermé-par-construction",
    motif: "`readonly OpsScope[]` — énumération FERMÉE du § 19.2. Aucun texte ne s'y encode.",
  },
  policyLevel: {
    regime: "fermé-par-construction",
    motif:
      "`PolicyLevel` — trois valeurs, et c'est le socle qui les CALCULE à l'étape 10 (§ 12, " +
      "règle 1). Un niveau hors énumération replie sur le plus strict.",
  },
  profile: {
    regime: "fermé-par-construction",
    motif:
      "Resserré en `ProfileName` par `core/profiles/` — énumération fermée, lue dans " +
      "`ops_runtime` à l'étape 7. Le paramètre reste ouvert ICI pour que la Fondation ne " +
      "recopie pas une liste qu'elle ne peut pas dériver ; les adaptateurs n'emploient que " +
      "la forme resserrée.",
  },
  idempotencyRef: {
    regime: "fermé-par-le-socle",
    motif:
      "Le champ porte bien une chaîne, mais c'est un CONDENSAT SHA-256 que le socle calcule : " +
      "l'appelant choisit le préimage, jamais le condensat. Aucun extrait marqué ne survit à " +
      "un SHA-256. C'était le seul canal ouvert du `ctx`, et l'ADR 0020 le referme.",
  },
  requestId: {
    regime: "à-fermer-au-transport",
    motif:
      "FRAPPÉ par le socle, jamais recopié d'un en-tête client ni de l'`id` d'une enveloppe " +
      "JSON-RPC. La règle est posée ; les étapes 1 à 4 (« HTTP seul ») se passent dans " +
      "`core/transport/`, qui n'existe pas. Le registre des coutures la surveille sous " +
      "l'ADR 0001 : c'est là qu'elle devra être cousue.",
  },
  deadline: {
    regime: "à-fermer-au-transport",
    motif:
      "CALCULÉE par le socle — `maintenant()` plus un budget borné par l'outil —, jamais un " +
      "horodatage reçu recopié tel quel : un `Date` recopié est une valeur de plusieurs " +
      "dizaines de bits choisie par l'appelant. Même borne que `requestId` : le transport " +
      "n'existe pas, la couture y appartient.",
  },
  habilitations: {
    regime: "fermé-par-construction",
    motif:
      "Un objet de booléens CALCULÉS par le socle (§ 19 bis). Un drapeau nouveau s'ajoute " +
      "dans `Habilitations`, jamais dans un `input` — et le contrôle 7 en dérive aussi ses " +
      "noms interdits.",
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  ErrorCode — § 15
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Union FERMÉE des codes d'erreur. Trois règles les gouvernent (§ 15) :
 *
 *  1. Une erreur ne fuit JAMAIS un secret ni une donnée personnelle.
 *  2. Elle dit TOUJOURS ce qu'il faut faire ensuite.
 *  3. Un refus de politique est une RÉPONSE NORMALE — mais N refus portant un
 *     `effect` autre que `read` dans une fenêtre courte pour le même principal
 *     est la signature d'une injection à demi réussie, et cela, ça ALERTE
 *     (§ 24).
 */
export const ERROR_CODES = [
  /** Jeton absent, expiré, révoqué, mauvaise audience. Dit comment se
   *  ré-authentifier. */
  "unauthenticated",
  /** Désactivé dans la console. Dit qu'il existe, et où l'activer. */
  "tool_disabled",
  /** Étape 7 — absent du profil actif. Dit le profil courant, et lequel
   *  l'expose. */
  "tool_not_in_profile",
  /** La politique refuse cet `effect`. Dit le niveau courant et ce qu'il
   *  faudrait. */
  "policy_denied",
  /** Effet extérieur en niveau `confirmé`. Dit la cible exacte — ET JAMAIS LE
   *  JETON DE CONFIRMATION (§ 20). */
  "confirmation_required",
  /** Étape 11 — argument dérivé d'une lecture marquée. Dit quel domaine a
   *  marqué la session. */
  "provenance_denied",
  /** Schéma non respecté, OU clé d'idempotence réutilisée avec un `argHash`
   *  différent. Dit le champ fautif et la valeur attendue. */
  "invalid_input",
  /** Signature ou `filtersHash` incohérent. Dit qu'il faut repartir de la
   *  première page — un curseur réutilisé avec d'autres filtres rendrait une
   *  fenêtre SILENCIEUSEMENT FAUSSE. */
  "cursor_invalid",
  /** Débit ou quota dépassé. Dit quand réessayer. */
  "rate_limited",
  /** Incompactable (§ 13.3). Dit comment filtrer. */
  "result_too_large",
  /** Adaptateur ou API tierce injoignable. Dit lequel, et si c'est
   *  transitoire. */
  "upstream_unavailable",
  /** Écriture concurrente. Dit que l'état a changé depuis la lecture. */
  "conflict",
  /** Le reste. Dit un identifiant de corrélation, JAMAIS UNE TRACE DE PILE. */
  "internal",
  /**
   * ⚠️ AJOUTÉ HORS DU TABLEAU DU § 15 — ÉCART DU CDC, TRANCHÉ AU LOT 1b.
   *
   * Le § 23 exige que « tout appel d'outil soit REFUSÉ » quand le coffre est
   * verrouillé, et le § 32 en fait un critère de recette du lot 1. Le tableau
   * du § 15, lui, n'énumère que treize codes et n'en donne aucun pour ce cas.
   * Les deux ne peuvent pas être vrais ensemble.
   *
   * Les trois issues possibles, et pourquoi c'est celle-ci :
   *
   *  1. rendre `internal` — mentirait sur la cause, et le § 15 exige que le
   *     message dise ce qu'il faut faire ensuite. « Déverrouille le coffre »
   *     n'est pas ce que promet `internal`, qui ne rend qu'un identifiant de
   *     corrélation ;
   *  2. rendre `upstream_unavailable` — mentirait autrement : l'adaptateur est
   *     parfaitement joignable, c'est LE SOCLE qui refuse ;
   *  3. nommer le code manquant.
   *
   * `core/vault/erreurs.ts` portait déjà `CODE_COFFRE_VERROUILLE` HORS de cette
   * union, en écrivant : « la Recette l'y ajoutera, et cette constante
   * deviendra alors un simple alias typé ». C'est fait ; elle en est un, et le
   * compilateur tient désormais les deux ensemble.
   *
   * Le message dit : quel ÉTAT (absent ≠ verrouillé — ils ne se réparent pas du
   * même geste) et où déverrouiller. Voir ADR 0005 et README, « Écarts relevés ».
   */
  "vault_locked",
  /**
   * ⚠️ AJOUTÉ HORS DU TABLEAU DU § 15 — DEUXIÈME ÉCART DU MÊME GENRE.
   *
   * Le § 11 donne à l'étape 5 (« scopes suffisants pour l'`effect` déclaré »)
   * un `403`, et le § 15 N'ÉNUMÈRE AUCUN CODE pour un scope insuffisant. Le
   * refus existe donc, mais il n'a pas de nom.
   *
   * ═══ POURQUOI CE TROU COÛTE, ET À QUI ═══
   *
   * `core/chaine/etape-05-scopes.ts` refuse pour TROIS causes de nature très
   * différente — un jeton qui porte un scope qu'il ne devrait jamais porter,
   * une correspondance effet → scope mal câblée dans le socle, un scope
   * simplement absent — et les trois sortaient avec `code: null` jusqu'à la
   * Recette du lot 1c. Seul le texte du message les séparait.
   *
   * Or le § 15, troisième règle, veut qu'on puisse compter « N refus portant un
   * `effect` autre que `read` dans une fenêtre courte pour le même principal »,
   * parce que c'est la signature d'une injection à demi réussie (§ 24). Un
   * comptage qui ne peut pas isoler les refus de scope ne distingue pas une
   * ATTAQUE d'un SOCLE MAL CÂBLÉ — et ces deux-là appellent des gestes opposés :
   * l'un fait révoquer un jeton, l'autre fait corriger une table.
   *
   * ═══ POURQUOI AUCUN VOISIN NE CONVIENT ═══
   *
   *  1. `unauthenticated` — mentirait sur l'issue : le jeton est parfaitement
   *     valide, signé, non révoqué, de la bonne audience. Le message ferait se
   *     ré-authentifier, ce qui ne change rien et fait tourner en rond ;
   *  2. `policy_denied` — mentirait sur la couche : la politique n'a pas
   *     refusé, elle n'a même pas été consultée — elle est à l'étape 10. Le
   *     message parlerait d'un niveau de garde-fou à desserrer, alors qu'aucun
   *     desserrage n'ouvrirait cet appel-là ;
   *  3. `tool_disabled` — mentirait deux fois : l'outil est actif, et l'écran
   *     Outils n'y peut rien.
   *
   * Même geste qu'au lot 1b pour `vault_locked` (ADR 0005) : nommer le code
   * manquant plutôt qu'emprunter celui du voisin.
   *
   * ⚠️ IL EST DÉCLARÉ ICI, ET IL EST BRANCHÉ DEPUIS LA RECETTE DU LOT 1c.
   *    `APPEL_STEPS` porte `refus: "scope_insufficient"` sur l'étape 5, et
   *    `core/chaine/etape-05-scopes.ts` le rend sur ses TROIS refus — sans une
   *    ligne à retoucher, parce que `refuse()` LIT le code dans l'ancrage. Le
   *    statut HTTP reste le `403` du § 11 : le code JSON-RPC le nomme, il ne le
   *    remplace pas. L'`it.fails` d'`ops/codes-hors-tableau.spec.ts` a basculé
   *    en `it()` du même geste. Voir README, « Écarts relevés ».
   */
  "scope_insufficient",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  AppelStep — § 11
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une étape de la chaîne d'appel, telle qu'elle est décrite au § 11.
 *
 * `refus` porte le code d'erreur rendu quand l'étape refuse, ou `null` pour les
 * quatre étapes « HTTP seul » du § 11 (403, 401, 401, 401), qui refusent au
 * niveau du transport et n'ont donc pas de code JSON-RPC.
 *
 * ⚠️ « `refus === null` » ET « `httpSeul` » NE SONT PLUS LE MÊME ENSEMBLE, ET
 *    NE L'ONT JAMAIS ÉTÉ PAR CONSTRUCTION. Depuis que la Recette du lot 1c a
 *    branché `scope_insufficient`, les étapes SANS code sont exactement les
 *    quatre « HTTP seul » — mais c'est une coïncidence de valeurs, pas une
 *    règle : dériver l'un de l'autre ferait qu'une future étape sans code
 *    passerait pour une étape de transport. Chacun se lit dans sa colonne.
 */
export interface EtapeAppel {
  readonly numero: number;
  readonly cle: string;
  readonly libelle: string;
  /**
   * Le code du § 15 rendu quand l'étape refuse, ou `null` quand le § 11 ne
   * nomme qu'un statut HTTP nu.
   *
   * ⚠️ L'ÉTAPE 5 A ÉTÉ LE TROU DU § 15, ET ELLE NE L'EST PLUS. Le § 11 lui
   *    donne un `403` et le § 15 n'énumère aucun code : le lot 1c a NOMMÉ le
   *    code manquant (`scope_insufficient`, avec ses trois voisins écartés et
   *    ce que chacun aurait menti), et la Recette du même lot l'a BRANCHÉ
   *    ci-dessous. L'écart au CDC reste un écart — il est tenu par
   *    `ops/codes-hors-tableau.ts`, qui refuse tout code ajouté sans motif
   *    écrit.
   *
   * ⚠️ LE TABLEAU ET L'ÉTAPE CHANGENT ENSEMBLE, JAMAIS L'UN SANS L'AUTRE. Un
   *    code écrit ici que l'étape ne rend pas fait chercher une métrique qui
   *    restera vide ; une étape qui rend un code absent d'ici fabrique un
   *    refus que le § 24 ne sait pas classer. C'est `refuse()` de
   *    `core/chaine/etapes.ts` qui tient les deux : il LIT le code dans
   *    l'ancrage, et aucune étape n'a le droit de l'écrire à la main.
   */
  readonly refus: ErrorCode | null;
  /** Statut HTTP nommé par le § 11, ou `null` quand l'étape n'en nomme aucun. */
  readonly statutHttp: number | null;
  /** Vrai pour les quatre étapes dont le § 11 dit « HTTP seul » : elles ne
   *  s'appliquent pas au transport stdio. */
  readonly httpSeul: boolean;
}

/**
 * LES QUATORZE ÉTAPES DU § 11, DANS L'ORDRE, PRÉCÉDÉES DE L'ÉTAPE 0. La v5 en
 * présentait onze comme exhaustives ; il en manquait trois, et deux étaient
 * dans le mauvais ordre.
 *
 * ═══ POURQUOI UNE ÉTAPE 0 — ÉCART DU CDC, TRANCHÉ AU LOT 1b ═══
 *
 * Le § 23 exige que « tout appel d'outil soit refusé » coffre verrouillé. Ce
 * refus N'EST AUCUNE des quatorze étapes : il les PRÉCÈDE TOUTES. L'outil
 * existe (étape 6), il est au profil actif (étape 7), les scopes suffisent
 * (étape 5) — c'est le socle qui ne peut rien déchiffrer.
 *
 * Or le § 11 pose que toute terminaison, refus compris, écrit une ligne
 * d'`ops_audit` portant LE NUMÉRO de l'étape qui a refusé. Un refus sans numéro
 * n'a rien à inscrire dans `stepDenied` : la colonne reste nulle, et la ligne
 * devient indiscernable d'une exception (`decision: "interrompu"`). La
 * métrique du § 24 perd alors, sans un mot, la totalité des appels refusés
 * pendant qu'un coffre attendait sa clé — c'est-à-dire, d'après le § 23,
 * APRÈS CHAQUE DÉPLOIEMENT.
 *
 * D'où le numéro ZÉRO, et pas quinze : il dit l'ORDRE réel. Un quinzième rang
 * ferait croire à un contrôle tardif, et casserait la lecture
 * « `stepDenied` croissant = on est allé plus loin dans la chaîne » dont
 * `core/audit/journal.ts` se sert déjà (« `stepDenied < 8` ⇒ empreinte brute »).
 *
 * ⚠️ CONSÉQUENCE À CONNAÎTRE : `AppelStep` vaut désormais `0 | 1 | … | 14`, et
 *    ZÉRO EST UNE VALEUR LÉGITIME. Tout code qui testerait `if (stepDenied)`
 *    plutôt que `if (stepDenied !== null)` effacerait ce refus-là. Aucun n'existe
 *    au moment où cette étape est ajoutée — vérifié — mais c'est le piège que
 *    ce numéro apporte, et il est écrit ici pour qu'il ne soit pas découvert
 *    plus tard dans une métrique creuse. Voir ADR 0005.
 *
 * DEUX RÈGLES SOUS CE TABLEAU (§ 11) :
 *
 *  · LE JOURNAL N'EST PAS UNE ÉTAPE — C'EST UN INVARIANT DE SORTIE. Toute
 *    terminaison, Y COMPRIS CHAQUE REFUS, écrit une ligne d'`ops_audit` portant
 *    le NUMÉRO de l'étape qui a refusé (`stepDenied`). Sans cela l'objectif O6
 *    est faux dès le premier jour, et la métrique « refus de politique » du
 *    § 24 n'a aucune source.
 *
 *  · LE SCHÉMA AVANT LE QUOTA. Un appel malformé ne consomme rien. L'ordre
 *    inverse produit une boucle : le quota brûle, le 429 dit « quand
 *    réessayer », le modèle attend et rejoue le même appel invalide.
 *
 * ⚠️ Une COLONNE PAR TRANSPORT accompagne ce tableau dans le code : quelles
 *    étapes s'appliquent en stdio, quel `principal` s'y inscrit, quels scopes y
 *    valent par défaut. `httpSeul` en est l'amorce ; `core/transport/` la
 *    complète. La v5 rendait stdio obligatoire au lot 1 SANS lui donner ni
 *    identité, ni principal.
 */
export const APPEL_STEPS = [
  {
    numero: 0,
    cle: "coffre",
    libelle: "Coffre ouvert — sinon TOUT appel d'outil est refusé (§ 23)",
    refus: "vault_locked",
    // Aucun statut HTTP : le § 23 fait rendre 200 au healthcheck coffre
    // verrouillé, précisément pour que le déploiement ne rougisse pas. Le refus
    // vit dans la réponse JSON-RPC, pas dans le statut.
    statutHttp: null,
    // S'applique à TOUS les transports : un coffre fermé l'est aussi en stdio.
    httpSeul: false,
  },
  {
    numero: 1,
    cle: "host",
    libelle: "Origine / Host autorisé",
    refus: null,
    statutHttp: 403,
    httpSeul: true,
  },
  {
    numero: 2,
    cle: "jeton",
    libelle: "Jeton valide — signature, iss (401 + WWW-Authenticate)",
    refus: null,
    statutHttp: 401,
    httpSeul: true,
  },
  {
    numero: 3,
    cle: "audience",
    libelle: "Audience correcte (RFC 8707)",
    refus: null,
    statutHttp: 401,
    httpSeul: true,
  },
  {
    numero: 4,
    cle: "revocation",
    libelle: "jti non révoqué (ops_token)",
    refus: null,
    statutHttp: 401,
    httpSeul: true,
  },
  {
    numero: 5,
    cle: "scopes",
    libelle: "Scopes suffisants pour l'effect déclaré",
    // ⚠️ ÉCART ASSUMÉ AU § 15, BRANCHÉ PAR LA RECETTE DU LOT 1c. Le § 15
    //    n'énumère aucun code pour un scope insuffisant ; le § 24 en exige un,
    //    sans quoi les trois causes de refus de l'étape 5 se comptent avec les
    //    refus de politique. Le motif, les voisins écartés et l'ADR vivent dans
    //    `ops/codes-hors-tableau.ts` — un code ajouté sans motif écrit y rougit.
    refus: "scope_insufficient",
    // Le `403` du § 11 NE BOUGE PAS : le code JSON-RPC nomme la cause, il ne
    // remplace pas le statut. L'étape reste applicable à tous les transports.
    statutHttp: 403,
    httpSeul: false,
  },
  {
    numero: 6,
    cle: "outil-active",
    libelle: "Outil existe et activé",
    refus: "tool_disabled",
    statutHttp: null,
    httpSeul: false,
  },
  {
    numero: 7,
    cle: "profil",
    libelle: "Outil présent dans le profil actif",
    refus: "tool_not_in_profile",
    statutHttp: null,
    httpSeul: false,
  },
  {
    numero: 8,
    cle: "schema",
    libelle: "Schéma d'entrée valide — NE DÉCOMPTE AUCUN QUOTA",
    refus: "invalid_input",
    statutHttp: null,
    httpSeul: false,
  },
  {
    numero: 9,
    cle: "curseur",
    libelle: "Curseur : signature et filtersHash",
    refus: "cursor_invalid",
    statutHttp: null,
    httpSeul: false,
  },
  {
    numero: 10,
    cle: "politique",
    libelle: "Politique autorise cet effect",
    refus: "policy_denied",
    statutHttp: null,
    httpSeul: false,
  },
  {
    numero: 11,
    cle: "provenance",
    libelle: "Provenance : aucun argument libre dérivé d'une lecture marquée",
    refus: "provenance_denied",
    statutHttp: null,
    httpSeul: false,
  },
  {
    numero: 12,
    cle: "quota",
    libelle: "Débit et quota",
    refus: "rate_limited",
    statutHttp: 429,
    httpSeul: false,
  },
  {
    numero: 13,
    cle: "idempotence",
    libelle: "Idempotence : (tool, key) inséré en in_flight, argHash comparé",
    refus: "conflict",
    statutHttp: null,
    httpSeul: false,
  },
  {
    numero: 14,
    cle: "execution",
    libelle: "Exécution, puis compaction et masquage",
    refus: "result_too_large",
    statutHttp: null,
    httpSeul: false,
  },
] as const satisfies readonly EtapeAppel[];

/**
 * Le numéro d'étape, en union fermée `0 | 1 | … | 14`, DÉRIVÉ de `APPEL_STEPS`.
 * C'est le type de `ops_audit.stepDenied`. Ajouter une étape au tableau élargit
 * le type sans qu'aucune liste ne soit à retoucher.
 *
 * ⚠️ `0` EN FAIT PARTIE (étape « coffre », § 23) : `if (stepDenied)` effacerait
 *    ce refus-là. Le test qui convient est `stepDenied !== null`.
 */
export type AppelStep = (typeof APPEL_STEPS)[number]["numero"];

/** La clé d'étape, en union fermée, dérivée du même tableau. */
export type AppelStepKey = (typeof APPEL_STEPS)[number]["cle"];

/** L'étape portant ce numéro, ou `undefined` si le numéro n'en désigne aucune. */
export function etapeParNumero(numero: number): EtapeAppel | undefined {
  return APPEL_STEPS.find((etape) => etape.numero === numero);
}

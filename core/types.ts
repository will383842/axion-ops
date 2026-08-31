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
   */
  readonly sessionId: string;

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
   * § 20 — la clé d'idempotence voyage ICI, JAMAIS DANS `input`.
   * `null` quand l'outil déclare `idempotency: "n/a"`.
   */
  readonly idempotencyKey: string | null;

  /** Identifiant de corrélation. C'est lui, et lui seul, que rend `internal`
   *  (§ 15) — jamais une trace de pile. */
  readonly requestId: string;

  /** Échéance au-delà de laquelle le handler doit abandonner. */
  readonly deadline: Date;

  /** § 19 bis — calculé PAR LE SOCLE. Un handler ne le reconstitue jamais. */
  readonly habilitations: Habilitations;
}

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
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  AppelStep — § 11
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une étape de la chaîne d'appel, telle qu'elle est décrite au § 11.
 *
 * `refus` porte le code d'erreur rendu quand l'étape refuse, ou `null` pour les
 * quatre étapes qui refusent au niveau HTTP seul (403, 401, 401, 401) et n'ont
 * donc pas de code JSON-RPC.
 */
export interface EtapeAppel {
  readonly numero: number;
  readonly cle: string;
  readonly libelle: string;
  /**
   * Le code du § 15 rendu quand l'étape refuse, ou `null` quand le § 11 ne
   * nomme qu'un statut HTTP nu.
   *
   * ⚠️ L'étape 5 (« scopes suffisants ») est dans ce cas : le § 11 lui donne un
   *    403, et le § 15 N'ÉNUMÈRE AUCUN CODE pour un scope insuffisant. C'est un
   *    trou du CDC, pas une omission de la Fondation — voir README, « Écarts
   *    relevés ». Il est laissé VISIBLE ici plutôt que bouché par un code
   *    voisin qui mentirait sur la cause.
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
    refus: null,
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

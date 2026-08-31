/**
 * `core/audit` — le vocabulaire du journal chaîné (§ 12, table `ops_audit`).
 *
 * `prisma/schema.prisma` déclare `decision String` et `outcome String` avec la
 * note « Vocabulaire fixé par core/audit ». C'est ici qu'il est fixé, en
 * énumérations FERMÉES, pour que ni la console ni les métriques du § 24 n'aient
 * à deviner les valeurs possibles.
 *
 * Rien de métier n'entre ici : le socle ne connaît aucun métier (§ 01).
 */

import type { AppelStep, Effect, ErrorCode, PolicyLevel } from "../types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Decision — l'issue de la chaîne d'autorisation (§ 11)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que la chaîne d'appel a DÉCIDÉ.
 *
 * · `autorisé`  — les quatorze étapes ont été franchies, le handler a tourné.
 * · `refusé`    — une étape a refusé ; `stepDenied` porte SON NUMÉRO (§ 11,
 *                 « le journal n'est pas une étape, c'est un invariant de
 *                 sortie »). Sans cette valeur, la métrique « refus de
 *                 politique » du § 24 n'a aucune source.
 * · `interrompu` — l'appel s'est terminé sur une EXCEPTION. Ce n'est pas une
 *                 décision : c'est l'aveu qu'aucune décision n'a été atteinte.
 *                 Le confondre avec `autorisé` ferait passer une panne pour un
 *                 succès, et avec `refusé` ferait passer une panne pour une
 *                 mesure de sécurité — deux mensonges dans la même colonne.
 */
export const DECISIONS = ["autorisé", "refusé", "interrompu"] as const;

export type Decision = (typeof DECISIONS)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  Outcome — ce qui est SORTI (§ 13.3)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'état de la charge rendue. Les trois premières valeurs sont DÉRIVÉES de la
 * cascade de compaction du § 13.3, ligne à ligne :
 *
 *  · `ok`            — sous le plafond, rien n'a été retiré.
 *  · `compacté`      — < 150 % : champs de `compaction.free` raccourcis ;
 *                      150–300 % : champs de `compaction.tier2` retirés.
 *                      C'est `meta.truncated = true` — LE SOCLE a compacté.
 *  · `agrégé`        — > 300 % : mode agrégat sur `compaction.aggregateBy`.
 *                      C'est `meta.mode = "aggregate"`.
 *  · `erreur`        — incompactable (`result_too_large`), amont injoignable,
 *                      ou exception. Le code exact vit dans la réponse, pas ici.
 *  · `non-exécuté`   — l'appel a été refusé AVANT l'étape 14 : rien n'a tourné.
 *                      C'est l'`outcome` de tout refus des étapes 1 à 13.
 *
 * ⚠️ `meta.sourceIncomplete` n'est PAS un `outcome` : la source avait déjà coupé
 *    avant le socle (§ 13.2). Il se lit dans `partialSources`. Réutiliser le
 *    même mot pour les deux étages produit exactement ce que la note
 *    « troncature honnête » veut empêcher.
 *
 * ⚠️ **`non-exécuté` A UNE BORNE ÉCRITE, ET `avecJournal` LA VIOLAIT — ADR 0017.**
 *    Sa définition ci-dessus dit « refusé AVANT l'étape 14 : rien n'a tourné ».
 *    Or `issue()` dérive le triplet du seul GENRE de la terminaison, si bien
 *    qu'un refus PRONONCÉ PAR l'étape 14 — `result_too_large`, qui se prononce
 *    sur ce qui SORT — sort lui aussi en `non-exécuté`. Un `send` PARTI est donc
 *    rangé parmi les appels qui n'ont rien fait.
 *
 *    Le vocabulaire, lui, était déjà juste : `erreur` nomme explicitement
 *    « incompactable (`result_too_large`) ». **Aucune valeur n'est ajoutée ici** ;
 *    c'est la dérivation qui est corrigée, dans `core/audit/journal.ts`. Une
 *    valeur de plus aurait rompu l'empreinte chaînée pour un mot qui existait
 *    déjà.
 *
 * ⚠️ **ET `outcome` NE DIT PAS SI UN EFFET EST SORTI.** Il décrit CE QUI REVIENT
 *    — la charge servie, et ce qu'il a fallu en faire. Le fait « un effet
 *    extérieur a eu lieu » est une dimension ORTHOGONALE : voir
 *    {@link PorteurDEffetExterieur} et l'ADR 0017. Les loger dans le même mot
 *    serait la faute que le § 13.2 dénonce déjà pour `truncated` /
 *    `sourceIncomplete` : deux étages sous un seul mot.
 */
export const OUTCOMES = ["ok", "compacté", "agrégé", "erreur", "non-exécuté"] as const;

export type Outcome = (typeof OUTCOMES)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  L'effet extérieur — § 20, objectif O6, ADR 0017
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **UN EFFET OBSERVABLE DE L'EXTÉRIEUR A-T-IL EU LIEU ?**
 *
 * ✅ **FUSIONNÉE AU LOT 1d.** {@link ContenuLigne} l'ÉTEND, `CHAMPS_COUVERTS`
 *    (`canonique.ts`) la porte, et `ops_audit` (`prisma/schema.prisma`) déclare
 *    la colonne. Les trois vont ENSEMBLE, et elles ont atterri ensemble : un
 *    champ absent de `CHAMPS_COUVERTS` n'entre pas dans l'empreinte, donc se
 *    modifie après coup sans casser la chaîne — et `derivation.spec.ts` rougit
 *    s'il apparaît au schéma sans être ni couvert ni exclu.
 *
 * ═══ POURQUOI UNE COLONNE, ET POURQUOI MAINTENANT ═══
 *
 * Le § 20 donne le test : « quelqu'un d'autre que moi peut-il s'en apercevoir ? ».
 * L'objectif O6 veut qu'une revue conduite sur `ops_audit` retrouve TOUS les
 * effets extérieurs. Elle les cherche aujourd'hui par
 * `decision = "autorisé" ET effect ∈ {send, destructive}`, et elle en manque
 * deux familles :
 *
 *  · le refus de l'étape 14 APRÈS le départ de l'effet — mesuré au lot 1b ;
 *  · l'exception levée APRÈS le retour de l'adaptateur — compaction, masquage,
 *    clôture d'idempotence : `decision: "interrompu"`, et l'envoi est parti.
 *
 * Une valeur d'`outcome` de plus n'aurait couvert que la première. Un champ à
 * part couvre les deux, et il répond à la question qu'on pose vraiment.
 *
 * ⚠️ **IL NE SE DÉDUIT JAMAIS D'`effect`.** Un `send` refusé à l'étape 10 n'a
 *    rien envoyé. La valeur est posée par la SEULE étape 14, à partir du fait que
 *    l'adaptateur a répondu, croisé avec `estEffetExterieur()` de
 *    `core/policy/effet.ts` — dérivé, jamais recopié.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** Un adaptateur qui LÈVE après avoir
 *    envoyé est indiscernable d'un adaptateur qui lève avant : l'étape 14 ne voit
 *    pas la différence, et ce champ vaudra `false` alors qu'un effet est parti.
 *    C'est exactement le trou que la LIGNE D'INTENTION (`PorteeDIntention`,
 *    `orchestrateur.ts`) couvre — ce champ dit ce que le socle SAIT, l'intention
 *    dit ce qu'il a TENTÉ. Les deux ne se remplacent pas.
 */
export interface PorteurDEffetExterieur {
  readonly externalEffect: boolean;
}

/**
 * La valeur d'une ligne dont aucun effet extérieur n'est sorti — donc de toutes
 * celles que l'étape 14 n'a pas atteintes.
 *
 * C'est une CONSTANTE NOMMÉE plutôt qu'un `false` littéral, pour le motif exact
 * d'{@link ARG_HASH_NON_VALIDE} : un booléen nu chez plusieurs appelants est
 * autant d'occasions de se tromper de sens, et personne ne le verrait.
 */
export const EFFET_EXTERIEUR_NON_SURVENU = false;

// ═════════════════════════════════════════════════════════════════════════════
//  Les constantes du journal
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le nom d'outil que porte une LIGNE DE CLÔTURE de purge (§ 31, règle
 * d'ancrage). C'est lui, et lui seul, qui distingue une clôture d'une ligne
 * d'appel — voir `cloture.ts`.
 */
export const OUTIL_CLOTURE = "ops.audit.purge";

/** Le `principal` inscrit par une opération du socle lui-même. */
export const PRINCIPAL_SYSTEME = "system";

/**
 * ⚠️ CONTRADICTION DU CDC, RENDUE VISIBLE PLUTÔT QUE BOUCHÉE EN SILENCE.
 *
 * Le § 11 exige qu'une ligne soit écrite pour TOUTE terminaison, refus compris —
 * y compris l'étape 1 (Host non autorisé), qui refuse AVANT tout traitement,
 * donc avant que le corps JSON-RPC n'ait été lu. À cet instant, ni le nom
 * d'outil, ni sa version, ni l'`effect`, ni les arguments n'existent.
 *
 * Or `ops_audit` (§ 12) déclare `tool`, `toolVersion`, `adapterVersion`,
 * `effect`, `policyLevel` et `argHash` NON NULS. Les deux exigences ne peuvent
 * pas être vraies ensemble : il faut soit des colonnes nullables, soit des
 * valeurs réservées.
 *
 * On prend la seconde voie, avec des valeurs RÉSERVÉES ET NOMMÉES, pour que
 * chaque appelant n'invente pas les siennes — quatre inventions différentes
 * rendraient la métrique du § 24 illisible. Écart signalé au rapport.
 */
export const OUTIL_INCONNU = "ops.non-identifié";

/** Version réservée d'un appel non identifié. */
export const VERSION_INCONNUE = "0";

/**
 * Longueur d'une empreinte SHA-256 en hexadécimal. Toute empreinte du journal
 * — `prevHash`, `selfHash`, `argHash` — porte cette forme, et le contrôle de
 * contenu du § 31 s'en sert pour refuser qu'un extrait de corps se glisse dans
 * une colonne d'empreinte.
 */
export const LONGUEUR_EMPREINTE = 64;

/** Une empreinte hexadécimale de 64 caractères, minuscules. */
export const FORME_EMPREINTE = /^[0-9a-f]{64}$/;

/**
 * `argHash` réservé : les arguments N'ONT PAS ÉTÉ LUS.
 *
 * Ce n'est pas l'empreinte de rien — c'est une valeur convenue, de la bonne
 * forme, qu'aucun HMAC ne produira jamais en pratique. La distinguer d'une vraie
 * empreinte importe : sans elle, un refus d'étape 1 ressemblerait à un appel
 * dont les arguments étaient vides.
 */
export const ARG_HASH_NON_LU = "0".repeat(LONGUEUR_EMPREINTE);

/**
 * `argHashValidated` d'une ligne dont les arguments n'ont pas été VALIDÉS —
 * refus antérieur à l'étape 8, ou arguments jamais lus.
 *
 * C'est une CONSTANTE NOMMÉE plutôt qu'un `false` littéral : un booléen nu dans
 * six appelants est six occasions de se tromper de sens, et personne ne le
 * verrait. `journal.ts` part de cette valeur et n'en sort que par l'affineur.
 */
export const ARG_HASH_NON_VALIDE = false;

// ═════════════════════════════════════════════════════════════════════════════
//  La ligne du journal
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le CONTENU d'une ligne : tout ce que le socle décide d'écrire, et rien de ce
 * que la base ou le chaînage y ajoutent.
 *
 * C'est exactement l'ensemble des champs COUVERTS par l'empreinte
 * (`canonique.ts`). Les trois champs exclus — `seq`, `prevHash`, `selfHash` —
 * vivent dans `LigneAudit`, avec le motif de leur exclusion.
 *
 * § 31 — CE QUI N'ENTRE JAMAIS : aucun corps, aucun extrait, aucune donnée
 * personnelle. `contenu.ts` en fait une garde qui s'exécute À L'ÉCRITURE, et
 * un manquement y est une écriture REFUSÉE, pas un avertissement.
 *
 * ⚠️ UN DIX-SEPTIÈME CHAMP ARRIVE PAR L'`extends` — `externalEffect`, ADR 0017.
 *    Il est hérité plutôt qu'écrit ici pour que sa PROSE vive à un seul endroit,
 *    avec le motif de la colonne et sa borne. Le lire ailleurs qu'à
 *    {@link PorteurDEffetExterieur} ferait deux vérités pour un seul fait.
 */
export interface ContenuLigne extends PorteurDEffetExterieur {
  /** L'horodatage. ⚠️ IL NE SERT JAMAIS À ORDONNER (§ 12) — voir `seq`. */
  readonly at: Date;

  readonly principal: string;

  /**
   * Session de PILOTAGE (§ 11) — pas d'authentification. C'est elle que le § 20
   * marque quand un résultat `personal`/`sensitive` traverse le socle.
   *
   * ⚠️ **ÉTABLIE PAR LE SOCLE, JAMAIS ACCEPTÉE D'UN APPELANT — ADR 0014.** Un
   *    `sessionId` choisi par qui appelle rendrait cette colonne inutilisable
   *    pour deux usages à la fois : le marquage du § 20, et le regroupement des
   *    appels d'une même session au § 24.
   *
   * 🔧 **TYPE À RESSERRER PAR LE CONSTRUCTEUR ① :** `SessionId`, le type marqué
   *    de `core/identite/`.
   */
  readonly sessionId: string;

  readonly tool: string;

  /** § 13.4 — la version est portée par l'OUTIL, pas par l'adaptateur. */
  readonly toolVersion: string;

  /** § 12 — sans elle, « la version qui a servi » n'est journalisée nulle part. */
  readonly adapterVersion: string;

  readonly effect: Effect;

  /** § 12, règle 1 — le niveau CALCULÉ à l'appel, jamais un champ brut relu. */
  readonly policyLevel: PolicyLevel;

  readonly decision: Decision;

  /**
   * § 11 — LE NUMÉRO de l'étape qui a refusé, `null` si aucune. C'est la seule
   * source de la métrique « refus de politique » du § 24.
   */
  readonly stepDenied: AppelStep | null;

  /**
   * § 12, règle 2 — HMAC-SHA-256, clé du coffre, séparation de domaine PAR
   * OUTIL. JAMAIS UN SHA NU. `core/audit` NE LE CALCULE PAS : il le reçoit de
   * `core/limits` (port `ArgHasher`, voir `ports.ts`) et se contente d'en
   * vérifier la FORME. Une garde de `derivation.spec.ts` échoue si ce module
   * se met un jour à calculer un HMAC lui-même.
   */
  readonly argHash: string;

  /**
   * L'`argHash` ci-dessus porte-t-il l'empreinte de la valeur VALIDÉE ?
   *
   * ═══ LES DEUX POPULATIONS D'UNE MÊME COLONNE ═══
   *
   * Le § 11 veut une ligne pour TOUTE terminaison, refus compris. Un refus
   * ANTÉRIEUR à l'étape 8 n'a que la charge BRUTE à empreindre ; toutes les
   * autres lignes portent l'empreinte de la valeur VALIDÉE — la seule à
   * laquelle le jeton de confirmation du § 20 se lie. Les deux DIFFÈRENT dès
   * qu'un schéma porte un `.default()`, une coercition ou une transformation,
   * c'est-à-dire dans le cas le plus banal.
   *
   * Tant que rien ne les distinguait, deux lectures du journal étaient
   * également défendables et une seule était juste. Le lot 1 s'en remettait à
   * `stepDenied < 8` — une INFÉRENCE, pas une donnée : elle est fausse pour une
   * terminaison par exception (`stepDenied` est alors nul), et elle
   * s'effondrerait si l'ordre des étapes du § 11 changeait.
   *
   * ⚠️ TROIS ÉTATS, PAS DEUX, ET LE TROISIÈME SE LIT AILLEURS. `false` couvre
   *    l'empreinte BRUTE **et** le cas « arguments jamais lus » — un refus
   *    d'étape 1, où le corps JSON-RPC n'a pas même été ouvert. Ces deux-là se
   *    séparent par la VALEUR : `ARG_HASH_NON_LU` est une constante convenue
   *    qu'aucun HMAC ne produira. Un troisième champ n'aurait rien ajouté.
   *
   * ⚠️ IL ENTRE DANS L'EMPREINTE CHAÎNÉE (`CHAMPS_COUVERTS`). C'est pour cela
   *    qu'il est posé maintenant : aucune base ne tourne, aucune ligne
   *    n'existe. Après le premier chaînage réel, l'ajouter aurait exigé une
   *    clôture de rupture et deux régimes de vérification dans le même journal.
   */
  readonly argHashValidated: boolean;

  /**
   * § 12, règle 3 — CE N'EST PAS ANONYME, c'est de la PSEUDONYMISATION. Sur le
   * canal appels un identifiant mène à `cancelUrl`/`rescheduleUrl`, des
   * URL-capacités. Purgés à la MÊME ÉCHÉANCE que `argHash` (§ 31).
   * Le socle ne les devine pas : l'outil les déclare (`idFields`, § 09).
   */
  readonly recordIds: readonly string[];

  /**
   * § 13.2 — les sources d'un outil composite qui ont échoué (`failedSources`)
   * ou qui avaient DÉJÀ coupé avant le socle (`sourceIncomplete`). Sans cet
   * emplacement, la boîte revient amputée d'un canal sur quatre sous
   * l'apparence d'une réponse normale.
   */
  readonly partialSources: readonly string[];

  readonly durationMs: number;

  readonly outcome: Outcome;
}

/**
 * Une ligne telle qu'elle est LUE : le contenu, plus les trois champs que le
 * chaînage et la base ajoutent.
 */
export interface LigneAudit extends ContenuLigne {
  /**
   * § 12 — ORDRE TOTAL, et clé primaire : rien ne s'insère « entre ».
   * ORDONNER PAR `seq`, JAMAIS PAR `at` : deux horodatages peuvent être égaux
   * ou reculer, et une horloge qui recule réordonne un journal trié sur `at`
   * sans qu'aucune empreinte ne change.
   */
  readonly seq: bigint;

  /** `selfHash` de la ligne précédente. `null` sur la toute première ligne. */
  readonly prevHash: string | null;

  /** Empreinte de CETTE ligne, chaînage compris. UNIQUE en base. */
  readonly selfHash: string;
}

/** Une ligne prête à insérer : le chaînage est calculé, `seq` ne l'est pas. */
export interface LigneAAjouter extends ContenuLigne {
  readonly prevHash: string | null;
  readonly selfHash: string;
}

/** Ce que rend une écriture. */
export interface LigneEcrite {
  readonly seq: bigint;
  readonly selfHash: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le refus des codes d'étape
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une terminaison par REFUS : l'étape qui a refusé, et le code du § 15 qu'elle
 * rend — `null` pour les quatre étapes que le § 11 refuse « au niveau HTTP
 * seul », qui n'ont aucun code JSON-RPC.
 */
export interface Refus {
  readonly genre: "refus";
  readonly etape: AppelStep;
  readonly code: ErrorCode | null;
}

/** Une terminaison par SUCCÈS : l'étape 14 a rendu une charge. */
export interface Succes<T> {
  readonly genre: "succès";
  readonly valeur: T;
  /** `ok`, `compacté` ou `agrégé` — la cascade du § 13.3. */
  readonly outcome: Outcome;
  /** § 09, `idFields` — déclarés par l'outil, jamais devinés par le socle. */
  readonly recordIds: readonly string[];
  /** § 13.2 — `failedSources` et `sourceIncomplete`. */
  readonly partialSources: readonly string[];
}

/**
 * TOUTE issue d'un appel. L'union est FERMÉE à dessein : c'est elle qui rend
 * l'invariant de sortie du § 11 démontrable — `journal.spec.ts` énumère les
 * quinze terminaisons possibles (quatorze refus + le succès), DÉRIVÉES de
 * `APPEL_STEPS`, et vérifie qu'aucune ne sort sans ligne.
 */
export type Terminaison<T> = Refus | Succes<T>;

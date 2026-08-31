/**
 * axion-ops — étape 13 de la chaîne d'appel : l'idempotence.
 *
 * ── La règle qui commande tout le fichier ─────────────────────────────────
 * § 12, `ops_idempotency` : « une clé réutilisée avec un payload DIFFÉRENT
 * doit rendre `invalid_input`, PAS L'AUTRE RÉSULTAT EN SILENCE. »
 *
 * C'est la raison d'être de la colonne `argHash` dans cette table. Sans cette
 * comparaison, un client qui recycle une clé — une clé constante par session,
 * un compteur remis à zéro au redémarrage — recevrait la réponse d'un AUTRE
 * appel, présentée comme la sienne. Sur un outil d'écriture, il croirait avoir
 * envoyé un message qu'il n'a pas écrit.
 *
 * ── L'ordre des vérifications est un contrat ──────────────────────────────
 *   1. la ligne est-elle PÉRIMÉE ? au-delà du TTL la clé est libre, et un
 *      argument différent y est légitime ;
 *   2. l'`argHash` correspond-il ? → sinon `invalid_input`, AVANT de regarder
 *      le statut. Inverser 2 et 3 sert le résultat mémorisé d'un autre appel
 *      dès que le statut est `done`, ce que la règle interdit nommément ;
 *   3. seulement alors, le statut décide : rejeu servi, conflit, ou reprise.
 *
 * ── C'est l'insertion qui verrouille ──────────────────────────────────────
 * § 11, étape 13 : « `(tool, key)` INSÉRÉ en `in_flight`, `argHash` comparé ».
 * On tente donc l'insertion D'ABORD ; la lecture ne vient qu'en cas de
 * collision. Une lecture préalable suivie d'une insertion laisse deux appels
 * concurrents s'insérer tous deux — la clé primaire `(tool, key)` en refuse un,
 * mais seulement si on la laisse trancher.
 */

import type { CalculArgHash } from "./arg-hash.js";
import { IDEMPOTENCIES, type Idempotency } from "../adapter-kit/types.js";
import { TTL_IDEMPOTENCE_MAX_MS } from "./config.js";
import type { Effect } from "../types.js";
// ⚠️ DEUX IMPORTS QUI SONT DES DÉCISIONS, PAS DES COMMODITÉS.
//
//  · `sha256Hex` — l'ADR 0020 interdit nommément une SECONDE implémentation de
//    l'empreinte. Celle du journal fait foi ; on l'APPELLE.
//  · `estEffetExterieur` — l'ADR 0021 interdit nommément de recopier sa liste.
//    C'est sa TOTALITÉ (`switch` exhaustif chez le propriétaire du § 20) qui
//    décide si un effet se voit de l'extérieur, jamais un tableau écrit ici.
//
// Aucun des deux modules n'importe `core/limits` : la feuille reste une feuille.
import { sha256Hex } from "../audit/canonique.js";
import { estEffetExterieur } from "../policy/effet.js";

/**
 * § 09 — ce que l'outil DÉCLARE dans son manifeste.
 *
 * · `key`           — rejouable : une clé identique avec le même argument rend
 *   le résultat mémorisé au lieu de refaire l'effet.
 * · `non-rejouable` — la clé est exigée et VERROUILLE, mais un second appel
 *   n'est jamais re-servi : il rend `conflict`.
 * · `n/a`           — l'outil n'a pas d'effet à dédupliquer (une lecture).
 *
 * ⚠️ `non-rejouable` n'est DÉFINI nulle part dans le CDC : le § 09 l'énumère,
 *    aucune section ne dit ce qu'il fait. L'interprétation ci-dessus est celle
 *    de ce module, et elle est signalée en écart. Elle a été choisie parce
 *    qu'elle est la seule qui, en cas d'erreur d'interprétation, échoue du
 *    côté sûr : refuser un rejeu légitime est visible, servir un rejeu qui ne
 *    devait pas l'être ne l'est pas.
 */
/**
 * ⚠️ UNE SEULE DÉCLARATION, RÉEXPORTÉE — PAS UNE SECONDE LISTE.
 *
 * Ces trois valeurs étaient auparavant écrites une deuxième fois ici, mot pour
 * mot, à côté de `IDEMPOTENCIES` dans `core/adapter-kit/types.ts`. Deux listes
 * pour un seul fait : elles s'accordaient, et rien ne les tenait. Le jour où
 * l'une aurait bougé, un manifeste aurait déclaré un mode que `core/limits` ne
 * connaît pas, SANS erreur de compilation — `ModeIdempotence` et `Idempotency`
 * étant deux unions distinctes, la valeur aurait traversé par une simple
 * assignation de chaîne.
 *
 * Le manifeste est la source : c'est l'adaptateur qui DÉCLARE son mode (§ 09),
 * ce module ne fait que l'appliquer.
 */
export const MODES_IDEMPOTENCE = IDEMPOTENCIES;

export type ModeIdempotence = Idempotency;

/**
 * Les trois statuts de `ops_idempotency.status`.
 *
 * ⚠️ Ce tableau reproduit l'énumération Prisma `IdempotencyStatus`. C'est une
 *    seconde source de vérité — inévitable ici : `prisma/schema.prisma`
 *    appartient à la Fondation, le client généré n'est pas garanti présent, et
 *    l'importer coupleraient ce module à la couche de données qu'il est
 *    justement censé ignorer. La garde `idempotency.spec.ts` DÉRIVE
 *    l'énumération du fichier `schema.prisma` lui-même et échoue si les deux
 *    divergent : la duplication existe, elle n'est pas silencieuse.
 */
export const STATUTS_IDEMPOTENCE = ["in_flight", "done", "failed"] as const;

export type StatutIdempotence = (typeof STATUTS_IDEMPOTENCE)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  LA FORME DE LA CLÉ — ADR 0020, seconde voie
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA FORME FERMÉE D'UNE CLÉ D'IDEMPOTENCE. **UNE SEULE CONSTANTE, ADR 0020.**
 *
 * Un UUID, un ULID, un `Message-Id`, un identifiant de commande passent. Une
 * phrase, un espace, un retour à la ligne, un accent, un extrait de courriel lu
 * trois appels plus tôt ne passent pas.
 *
 * ⚠️ **CE QU'ELLE FAIT, ET CE QU'ELLE NE FAIT PAS.** Une forme fermée réduit un
 *    DÉBIT ; elle ne supprime pas un canal. Cent vingt-huit caractères d'un
 *    alphabet de soixante-cinq laissent encore passer de quoi encoder une
 *    centaine d'octets. C'est pourquoi elle ne remplace PAS le retrait de la clé
 *    du `ctx` (`ToolContext.idempotencyRef`), et pourquoi l'ADR 0020 retient les
 *    deux voies ENSEMBLE : la première supprime le canal vers l'extérieur, la
 *    seconde ferme la forme de ce qui reste à l'intérieur.
 *
 * ⚠️ **LE PLANCHER EST BAS, ET C'EST DÉLIBÉRÉ.** La garde utile est le PLAFOND
 *    et l'alphabet. Le plancher existe parce que `(tool, key)` est une clé
 *    primaire PARTAGÉE par tous les principals (§ 12) : une clé d'un ou deux
 *    caractères n'individualise aucun appel, et deux clients qui numérotent
 *    chacun les leurs se collisionnent au premier essai — le second recevant un
 *    `conflict` sur un appel parfaitement légitime. Quatre caractères, refusés
 *    d'un motif ÉCRIT plutôt que par une comparaison à zéro perdue dans le code.
 */
export const FORME_CLE_IDEMPOTENCE = {
  longueurMin: 4,
  longueurMax: 128,
  /** Lettres, chiffres, et les quatre ponctuations d'un identifiant. */
  alphabet: /^[A-Za-z0-9._:-]+$/,
} as const;

/**
 * La forme attendue, EN PROSE — dérivée de la constante, jamais réécrite.
 *
 * Le § 15 exige qu'une erreur dise ce qu'il faut faire ensuite. Il n'exige pas
 * qu'elle répète ce qu'on lui a donné : ce message ne contient PAS la clé.
 */
export function formeAttendueDeCle(): string {
  return (
    `de ${String(FORME_CLE_IDEMPOTENCE.longueurMin)} à ` +
    `${String(FORME_CLE_IDEMPOTENCE.longueurMax)} caractères, pris parmi les lettres, les ` +
    "chiffres et « - », « _ », « . », « : » — un UUID, un ULID ou un identifiant de commande " +
    "conviennent. Ni espace, ni accent, ni ponctuation de phrase"
  );
}

/** La clé respecte-t-elle la forme fermée ? Fonction PURE, sans effet. */
export function formeDeCleValide(cle: string): boolean {
  if (cle.length < FORME_CLE_IDEMPOTENCE.longueurMin) return false;
  if (cle.length > FORME_CLE_IDEMPOTENCE.longueurMax) return false;
  return FORME_CLE_IDEMPOTENCE.alphabet.test(cle);
}

/**
 * L'EMPREINTE D'UNE CLÉ D'IDEMPOTENCE — **ADR 0020.**
 *
 * Soixante-quatre caractères hexadécimaux minuscules, ou `null`. C'est elle, et
 * jamais la clé, qui atteint deux destinations :
 *
 *  · `ToolContext.idempotencyRef` — ce que l'adaptateur reçoit ;
 *  · `ops_idempotency.key` — ce que le socle CONSERVE jusqu'au TTL.
 *
 * ⚠️ **L'IMPLÉMENTATION EST EMPRUNTÉE, PAS RÉÉCRITE.** `sha256Hex` vit chez le
 *    journal (`core/audit/canonique.ts`) et fait foi. Une seconde implémentation
 *    de « SHA-256 hexadécimal » finirait par diverger de la première sur un
 *    détail d'encodage, et deux empreintes différentes d'une même clé
 *    dédoubleraient la réservation qu'elles servent à unifier.
 *
 * ⚠️ **CE QU'ELLE COÛTE, ÉCRIT AVEC ELLE.** `ops_idempotency` n'est plus lisible
 *    « à l'œil » par clé : l'exploitant qui cherche une réservation part de
 *    l'outil et de la fenêtre, pas de la chaîne. C'est le prix de ne plus
 *    conserver douze heures durant un texte que le socle n'a pas écrit (§ 31).
 */
export function empreinteDeCleDIdempotence(key: string): string;
export function empreinteDeCleDIdempotence(key: string | null): string | null;
export function empreinteDeCleDIdempotence(key: string | null): string | null {
  if (key === null) return null;
  return sha256Hex(key);
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ISSUE D'UNE RÉSERVATION — ADR 0021
// ═════════════════════════════════════════════════════════════════════════════

/** Le compilateur ne doit jamais laisser passer un `Effect` non traité. */
function jamais(valeur: never): never {
  throw new Error(`effet non traité : ${JSON.stringify(valeur)}`);
}

/** Les FAITS dont l'issue d'une réservation se dérive. Aucun n'est un genre de terminaison. */
export interface FaitsDeCloture {
  /**
   * LE CLIQUET DE L'ADR 0017, **LU**. Jamais le genre de la terminaison.
   *
   * Il vaut `true` dès que l'adaptateur a rendu sur un outil dont l'`effect` est
   * extérieur — c'est-à-dire dès que quelque chose est SORTI.
   */
  readonly effetExterieurSurvenu: boolean;
  /** L'étape 14 a-t-elle RENDU — succès ou refus — plutôt que levé ? */
  readonly terminaisonRendue: boolean;
  /** L'`effect` ÉPINGLÉ de l'outil (`ops_tool`, § 20, règle d'épinglage). */
  readonly effetDeclare: Effect;
}

/**
 * L'ISSUE D'UNE RÉSERVATION D'IDEMPOTENCE — **fonction PURE, ADR 0021.**
 *
 * ═══ LE DÉFAUT QU'ELLE FERME, ET IL EST STRUCTUREL ═══
 *
 * L'orchestrateur appliquait la bonne règle sur une branche et pas sur sa
 * voisine : le refus de l'étape 14 fermait la clé en `done` — « l'effet a déjà eu
 * lieu » —, et l'EXCEPTION la fermait en `failed`. Or `failed` est le seul statut
 * que `reserver()` reprend (`reprendreSiEchouee`). Tout ce qui suit le retour de
 * l'adaptateur — vérification de contrat, masquage, cascade de compaction,
 * marquage de provenance, clôture — se passe dans un monde où l'effet est DÉJÀ
 * PARTI : une exception levée là laissait la clé rejouable.
 *
 * **En une phrase : un courrier parti pouvait repartir.**
 *
 * La cause n'était pas la règle, elle était de forme : UNE variable à trois
 * valeurs servait DEUX questions, et le point d'usage l'écrasait en deux
 * (`issueDeLEffet === "done" ? "done" : "failed"`). « interrompu » et « failed »
 * devenaient le même mot à l'endroit exact où la distinction comptait. Une
 * variable qu'on écrase à l'usage est une décision qu'on ne prend pas.
 *
 * ═══ LES TROIS BRANCHES, ET LEUR TOTALITÉ ═══
 *
 *  1. le cliquet est LEVÉ → `done`. Quelque chose est sorti ; rejouer produirait
 *     un SECOND effet.
 *  2. l'étape 14 a RENDU (succès ou refus) → `done`. Le handler a rendu la main :
 *     ce qu'il a fait est fait, réversible ou non.
 *  3. elle a LEVÉ → l'`effect` ÉPINGLÉ décide. Extérieur : `done`, **fail-closed**,
 *     l'adaptateur a pu envoyer avant de lever. `read` ou `write-draft` :
 *     `failed`, rien n'est sorti et la reprise est le comportement utile.
 *
 * ═══ POURQUOI LA TROISIÈME BRANCHE NE CONTREDIT PAS L'ADR 0017 ═══
 *
 * L'ADR 0017 exclut nommément de « déduire `externalEffect` d'`effect === send` ».
 * Cette branche regarde pourtant l'`effect` épinglé, et la distinction porte
 * tout : `ops_audit.externalEffect` est un **FAIT** que le journal atteste — on
 * n'infère jamais un fait qu'on n'a pas observé, et il reste donc `false` ici ;
 * l'issue d'idempotence est une **POLITIQUE** de reprise — on se replie toujours
 * du côté qui ne double pas un effet. Le journal continue de dire honnêtement ce
 * que le socle A VU ; l'idempotence cesse d'en tirer la conclusion dangereuse.
 *
 * C'est ce qui solde la « conséquence acceptée n° 1 » de l'ADR 0017.
 *
 * ⚠️ **ÉCART ASSUMÉ, ÉCRIT AVEC LA DÉCISION.** Une panne survenue ENTRE la
 *    réservation et l'appel de l'adaptateur, sur un outil `send`, ferme la clé en
 *    `done` alors que rien n'est parti : l'appelant doit employer une clé neuve.
 *    Le remède serait un second cliquet « l'adaptateur a été atteint » ; l'ADR
 *    0021 le refuse, parce qu'il ajouterait à `AffineursDAppel` un membre qui ne
 *    mute aucune colonne de la ligne. C'est le sens sûr.
 *
 * ⚠️ **LE `switch` EST EXHAUSTIF ET IL N'A PAS DE LISTE.** Ajouter un effet au
 *    § 09 sans le classer est une erreur de COMPILATION. Et ce qu'il classe, il
 *    ne le décide pas lui-même : il APPELLE `estEffetExterieur`, dont la totalité
 *    vit chez le propriétaire du § 20. Une seconde liste ici aurait laissé
 *    `destructive` dehors le jour où quelqu'un n'aurait relu qu'une des deux.
 *
 * ═══ BORNE D'ÉPROUVABILITÉ — LA PREMIÈRE BRANCHE NE DÉCIDE AUJOURD'HUI DE RIEN ═══
 *
 * ⚠️ **CE N'EST PAS UN DÉFAUT, ET C'EST ÉCRIT ICI POUR QUE PERSONNE NE LA
 *    « SIMPLIFIE ».** La branche du cliquet (`effetExterieurSurvenu`) est la
 *    bonne, et elle n'est décisive dans AUCUN cas atteignable :
 *
 *     · le cliquet n'est levé que sous `estEffetExterieur(outil.effect)` ;
 *     · or la troisième branche rend déjà `done` sous exactement cette condition.
 *
 *    Mesuré au lot 1d : « 4 couple(s) ATTEIGNABLE(s) confronté(s) · 4 écarté(s) ·
 *    0 cas où la LECTURE du cliquet change l'issue », avec son témoin de capacité
 *    apparié — « 16 cellule(s) parcourue(s) sur 4 effet(s) · 2 issue(s)
 *    DISTINCTE(s) » —, sans lequel « 0 cas » se lirait « cette table ne mesure
 *    rien ».
 *
 * ⚠️ **CE QUI A RÉELLEMENT REFERMÉ LE DÉFAUT DU LOT 1c EST `terminaisonRendue`**,
 *    la deuxième branche, posée juste après le retour de l'étape 14. C'est elle
 *    qui empêche qu'un courrier parti reparte quand la panne est POSTÉRIEURE au
 *    retour de l'adaptateur. Attribuer ce mérite au cliquet ferait déplacer le
 *    mauvais garde-fou le jour où quelqu'un voudrait en retirer un.
 *
 * ⚠️ **LA PREMIÈRE BRANCHE EST UNE PROVISION, ET LE JOUR OÙ ELLE SERVIRA EST
 *    NOMMABLE** : celui où la troisième cessera d'être aussi franchement
 *    fail-closed — si l'on distinguait, par exemple, un `send` dont on SAIT que
 *    l'adaptateur n'a pas été atteint. Ce jour-là, la lecture du cliquet sera la
 *    seule à savoir que quelque chose EST sorti.
 *
 *    **Et ce jour-là, écrire D'ABORD le témoin de bout en bout qui distingue les
 *    deux branches — il n'en existe AUCUN.** Les mutations M3 et M6 du lot 1d ne
 *    font rougir aucun test de l'épreuve ; la seule garde du dépôt qui rougit sur
 *    M3 appelle cette fonction PURE avec un couple que la chaîne ne produit pas.
 *    Affiner la troisième branche sans ce témoin, ce serait rendre décisive une
 *    branche que rien n'éprouve.
 */
export function issueDeReservation(
  faits: FaitsDeCloture,
): Extract<StatutIdempotence, "done" | "failed"> {
  // ⚠️ BRANCHE 1 — voir la borne d'éprouvabilité en tête : elle couvre
  //    aujourd'hui le même ensemble que la branche 3, et c'est `terminaisonRendue`
  //    (branche 2) qui referme le défaut du lot 1c. Ne pas la retirer : elle est
  //    la provision du jour où la branche 3 cessera d'être fail-closed.
  if (faits.effetExterieurSurvenu) return "done";
  if (faits.terminaisonRendue) return "done";

  switch (faits.effetDeclare) {
    case "read":
    case "write-draft":
    case "send":
    case "destructive":
      return estEffetExterieur(faits.effetDeclare) ? "done" : "failed";
    default:
      return jamais(faits.effetDeclare);
  }
}

/** Une ligne d'`ops_idempotency`. */
export interface LigneIdempotence {
  readonly tool: string;
  /**
   * § 12 — **L'EMPREINTE de la clé, jamais la clé (ADR 0020).**
   *
   * `reserver()` la calcule par {@link empreinteDeCleDIdempotence} ; une couche
   * de données qui lirait cette table par la chaîne d'origine ne trouverait
   * rien, et c'est le point.
   */
  readonly key: string;
  readonly status: StatutIdempotence;
  readonly argHash: string;
  /** Renvoi vers le résultat conservé — JAMAIS le résultat lui-même (§ 31). */
  readonly resultRef: string | null;
  readonly completedAt: Date | null;
  /** Le « TTL chiffré » du § 12, matérialisé. Au-delà, la clé est libre. */
  readonly expiresAt: Date;
}

/**
 * CE QUE `core/limits/` ATTEND DE LA COUCHE DE DONNÉES.
 *
 * Interface déclarée ici, implémentée ailleurs (Prisma sur `ops_idempotency`).
 */
export interface DepotIdempotence {
  /**
   * INSERTION CONDITIONNELLE ATOMIQUE.
   *
   * @returns `true` si la ligne a été insérée, `false` si `(tool, key)`
   *          existait déjà.
   *
   * 🔴 CONTRAT — une seule instruction, du genre `INSERT … ON CONFLICT
   *    (tool, key) DO NOTHING`. Un `findUnique` suivi d'un `create` laisse
   *    passer deux appels concurrents, et le second lèvera au lieu de rendre
   *    `false` — un `conflict` transformé en `internal`.
   */
  insererSiAbsente(ligne: LigneIdempotence): Promise<boolean>;

  lire(tool: string, key: string): Promise<LigneIdempotence | null>;

  /**
   * Remplace une ligne PÉRIMÉE par une nouvelle réservation, atomiquement.
   *
   * @returns `false` si la ligne n'était finalement plus périmée, ou plus là —
   *          auquel cas un autre appel a gagné la course.
   *
   * 🔴 CONTRAT — la condition `expiresAt <= maintenant` doit être DANS
   *    l'instruction d'écriture, pas évaluée avant elle.
   */
  remplacerSiPerimee(ligne: LigneIdempotence, maintenant: Date): Promise<boolean>;

  /**
   * Repasse en `in_flight` une ligne `failed`, atomiquement.
   *
   * @returns `false` si la ligne n'était plus `failed`.
   *
   * 🔴 CONTRAT — condition `status = 'failed'` DANS l'écriture.
   */
  reprendreSiEchouee(ligne: LigneIdempotence): Promise<boolean>;

  /** Clôt une réservation. */
  cloturer(params: {
    readonly tool: string;
    readonly key: string;
    readonly status: Extract<StatutIdempotence, "done" | "failed">;
    readonly resultRef: string | null;
    readonly completedAt: Date;
  }): Promise<void>;
}

/** Le verdict de l'étape 13. */
export type ResultatIdempotence =
  | {
      /** L'outil ne déduplique pas : rien n'a été réservé, l'appel continue. */
      readonly type: "sans-objet";
    }
  | {
      /** La réservation est posée : l'appel peut s'exécuter. */
      readonly type: "reservee";
      readonly ligne: LigneIdempotence;
    }
  | {
      /** Appel identique déjà terminé : on sert le résultat mémorisé. */
      readonly type: "rejeu";
      readonly resultRef: string | null;
      readonly completedAt: Date | null;
    }
  | {
      readonly type: "refus";
      readonly code: "invalid_input" | "conflict";
      /** § 15 — le message dit le champ fautif et ce qu'il faut faire ensuite. */
      readonly detail: string;
    };

/** Ce qu'il faut pour poser une réservation. */
export interface DemandeReservation {
  readonly depot: DepotIdempotence;
  readonly calcul: Pick<CalculArgHash, "correspond">;
  readonly tool: string;
  readonly mode: ModeIdempotence;
  /**
   * § 20 — LA CLÉ BRUTE, telle que l'ENVELOPPE de l'appel l'a portée
   * (`AppelEntrant.idempotencyKey`), JAMAIS `input`.
   *
   * C'est structurel ici : ce module ne reçoit jamais `input`, seulement son
   * empreinte. Une clé glissée dans la charge utile ne peut donc pas atteindre
   * cette fonction — et le schéma d'entrée étant `.strict()`, elle est refusée
   * à l'étape 8 comme champ inconnu.
   *
   * ⚠️ **ELLE NE VOYAGE PLUS DANS `ctx` — ADR 0020.** `ToolContext` porte
   *    désormais `idempotencyRef`, l'EMPREINTE. C'est le dernier endroit du socle
   *    où la chaîne d'origine existe : `reserver()` la confronte à la forme
   *    fermée, en calcule l'empreinte, et c'est l'empreinte qui est écrite dans
   *    `ops_idempotency.key`.
   */
  readonly key: string | null;
  readonly argHash: string;
  readonly ttlMs: number;
  readonly maintenant: Date;
}

function nouvelleLigne(demande: DemandeReservation, key: string): LigneIdempotence {
  return {
    tool: demande.tool,
    key,
    status: "in_flight",
    argHash: demande.argHash,
    resultRef: null,
    completedAt: null,
    expiresAt: new Date(demande.maintenant.getTime() + demande.ttlMs),
  };
}

/**
 * ÉTAPE 13 — pose la réservation, sert le rejeu, ou refuse.
 *
 * @throws jamais : tout refus est rendu, pour que l'invariant de journal du
 *         § 11 (« toute terminaison écrit une ligne ») ait un objet à écrire.
 */
export async function reserver(demande: DemandeReservation): Promise<ResultatIdempotence> {
  // ───────────────────────────────────────────────────────────────────────────
  //  LA FORME DE LA CLÉ — AVANT LE TRI PAR MODE. ADR 0020.
  // ───────────────────────────────────────────────────────────────────────────
  //
  // ⚠️ L'ORDRE EST LA DÉCISION, PAS UN DÉTAIL. Placée APRÈS le tri, la borne de
  //    forme laisserait un outil `idempotency: "n/a"` accepter n'importe quelle
  //    chaîne — et un outil `n/a` resterait une porte ouverte vers ce module. Ce
  //    qui est ignoré doit d'abord avoir été jugé.
  //
  // ⚠️ LE REFUS NE RECOPIE PAS LA CLÉ. Le § 15 exige qu'une erreur dise ce qu'il
  //    faut faire ensuite ; il n'exige pas qu'elle répète ce qu'on lui a donné.
  //    Une clé refusée PARCE QU'ELLE PORTE DE LA PROSE est exactement celle qu'un
  //    message d'erreur ne doit pas relayer : le refus serait devenu le canal.
  //
  // Une clé VIDE n'est pas une clé mal formée : c'est une clé absente, et elle a
  // son propre refus plus bas, qui dit où la mettre.
  if (demande.key !== null && demande.key.length > 0 && !formeDeCleValide(demande.key)) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `La clé d'idempotence présentée pour « ${demande.tool} » n'a pas la forme attendue : ` +
        `${formeAttendueDeCle()}. La clé reçue n'est pas répétée ici — la présenter de nouveau ` +
        "dans un message la ferait ressortir du socle. Employer un identifiant.",
    };
  }

  if (demande.mode === "n/a") {
    // Une clé fournie à un outil qui ne déduplique pas est IGNORÉE, pas
    // refusée : le § 09 ne l'interdit pas, et refuser casserait un client qui
    // envoie une clé sur tous ses appels par prudence.
    //
    // ⚠️ IGNORÉE, MAIS PAS INEXAMINÉE : sa FORME vient d'être confrontée
    //    ci-dessus. C'est la seule lecture du § 31 qui tienne — le socle ne
    //    conserve, et ne relaie, aucun texte qu'il n'a pas écrit.
    return { type: "sans-objet" };
  }

  // ⚠️ LA DURÉE SE BORNE AVANT DE SERVIR À CALCULER UNE DATE. Un `ttlMs` non
  //    fini produirait une `Invalid Date`, dont le `getTime()` vaut `NaN` : la
  //    comparaison de péremption serait TOUJOURS fausse et la clé resterait
  //    verrouillée pour toujours, en silence. Toutes les autres durées du socle
  //    portent une borne haute explicite (`TTL_CONFIRMATION_MAX_MS`,
  //    `TTL_DESSERRAGE_MAX_MS`) ; celle-ci en porte une aussi.
  if (!Number.isFinite(demande.ttlMs) || demande.ttlMs <= 0) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `Durée de réservation illisible pour « ${demande.tool} » : ${String(demande.ttlMs)} ms. ` +
        "Une durée non finie ou nulle écrirait une date d'expiration que rien " +
        "ne pourrait comparer, et la clé d'idempotence ne se libérerait jamais.",
    };
  }
  if (demande.ttlMs > TTL_IDEMPOTENCE_MAX_MS) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `Durée de réservation ${String(demande.ttlMs)} ms au-delà de la borne haute ` +
        `${String(TTL_IDEMPOTENCE_MAX_MS)} ms pour « ${demande.tool} ». ` +
        "Une réservation qu'aucune péremption ne rattrape est un verrou définitif.",
    };
  }

  const cleFournie = demande.key ?? "";
  if (cleFournie.length === 0) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `L'outil « ${demande.tool} » exige une clé d'idempotence. ` +
        "Elle voyage dans l'EN-TÊTE de l'appel (`AppelEntrant.idempotencyKey`), JAMAIS dans " +
        "`input` : le schéma d'entrée est fermé et refuserait le champ. Le socle n'en remet " +
        "que l'empreinte à l'adaptateur (`ctx.idempotencyRef`).",
    };
  }

  // ═══ C'EST ICI QUE LA CHAÎNE D'ORIGINE S'ARRÊTE — ADR 0020 ═════════════════
  //
  // ⚠️ TOUT CE QUI SUIT NE CONNAÎT QUE L'EMPREINTE : la ligne insérée, la
  //    lecture en cas de collision, la clôture. `ops_idempotency.key` cesse donc
  //    de conserver, jusqu'au TTL, un texte que le socle n'a pas écrit.
  //
  //    ⚠️ CONSÉQUENCE ÉCRITE AVEC LA DÉCISION : une couche de données qui
  //       chercherait une réservation par la chaîne d'origine ne trouverait rien,
  //       et ne le dirait pas. On part de l'outil et de la fenêtre.
  const key = empreinteDeCleDIdempotence(cleFournie);

  const ligne = nouvelleLigne(demande, key);

  if (await demande.depot.insererSiAbsente(ligne)) {
    return { type: "reservee", ligne };
  }

  const existante = await demande.depot.lire(demande.tool, key);

  if (existante === null) {
    // La ligne a disparu entre l'insertion refusée et la lecture : purge du TTL
    // concurrente. Une SEULE nouvelle tentative — pas de boucle, un dépôt qui
    // refuserait sans cesse ferait tourner l'appel indéfiniment.
    if (await demande.depot.insererSiAbsente(ligne)) {
      return { type: "reservee", ligne };
    }
    return {
      type: "refus",
      code: "conflict",
      detail:
        "La réservation d'idempotence a changé sous l'appel (purge concurrente). " +
        "L'état a changé depuis la lecture : relire, puis rejouer avec la même clé.",
    };
  }

  // 1 · Périmée ? Au-delà du TTL, la clé est LIBRE — y compris pour un autre
  //     argument. C'est la borne de la règle « même clé, autre argument =
  //     invalid_input » : elle ne vaut que dans la fenêtre du TTL.
  if (existante.expiresAt.getTime() <= demande.maintenant.getTime()) {
    if (await demande.depot.remplacerSiPerimee(ligne, demande.maintenant)) {
      return { type: "reservee", ligne };
    }
    return {
      type: "refus",
      code: "conflict",
      detail:
        "Une autre requête a repris cette clé d'idempotence au même instant. " +
        "L'état a changé depuis la lecture : réessayer.",
    };
  }

  // 2 · L'argument correspond-il ? AVANT le statut, toujours.
  if (!demande.calcul.correspond(existante.argHash, demande.argHash)) {
    return {
      type: "refus",
      code: "invalid_input",
      // ⚠️ LA CLÉ N'EST PLUS RECOPIÉE ICI (ADR 0020). Elle l'était, et le socle
      //    n'en tient d'ailleurs plus que l'empreinte : réciter soixante-quatre
      //    caractères hexadécimaux n'aiderait personne, et réciter la chaîne
      //    d'origine rouvrirait par le message d'erreur le canal que cet ADR
      //    ferme. L'appelant sait quelle clé il vient d'employer.
      detail:
        `Cette clé d'idempotence a déjà servi sur « ${demande.tool} » ` +
        "avec un ARGUMENT DIFFÉRENT. Le socle refuse plutôt que de servir en " +
        "silence le résultat de l'autre appel. Attendu : le même argument, ou " +
        "une clé neuve.",
    };
  }

  // 3 · Même argument : le statut décide.
  switch (existante.status) {
    case "done":
      if (demande.mode === "non-rejouable") {
        return {
          type: "refus",
          code: "conflict",
          detail:
            `L'outil « ${demande.tool} » est déclaré non rejouable : son effet a ` +
            "déjà eu lieu sous cette clé et ne sera pas re-servi. Employer une " +
            "clé neuve pour un nouvel effet.",
        };
      }
      return {
        type: "rejeu",
        resultRef: existante.resultRef,
        completedAt: existante.completedAt,
      };

    case "in_flight":
      return {
        type: "refus",
        code: "conflict",
        detail:
          "Un appel identique est EN COURS sous cette clé. L'état change en ce " +
          "moment : attendre son issue, puis rejouer la même clé pour en obtenir " +
          "le résultat.",
      };

    case "failed":
      if (await demande.depot.reprendreSiEchouee(ligne)) {
        return { type: "reservee", ligne };
      }
      return {
        type: "refus",
        code: "conflict",
        detail:
          "La réservation a changé d'état pendant la reprise. L'état a changé " +
          "depuis la lecture : relire, puis rejouer.",
      };
  }
}

/**
 * Clôt une réservation posée par {@link reserver}.
 *
 * Appelée par l'orchestrateur APRÈS l'exécution (étape 14), en succès comme en
 * échec. Une réservation laissée en `in_flight` bloque la clé jusqu'au TTL :
 * c'est le comportement voulu en cas de panne du processus, pas en cas d'échec
 * connu.
 */
export async function cloturer(params: {
  readonly depot: DepotIdempotence;
  readonly reservation: ResultatIdempotence;
  readonly issue: "done" | "failed";
  readonly resultRef: string | null;
  readonly maintenant: Date;
}): Promise<boolean> {
  if (params.reservation.type !== "reservee") return false;
  await params.depot.cloturer({
    tool: params.reservation.ligne.tool,
    key: params.reservation.ligne.key,
    status: params.issue,
    resultRef: params.resultRef,
    completedAt: params.maintenant,
  });
  return true;
}

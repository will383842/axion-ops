/**
 * `core/audit` — LE JOURNAL CHAÎNÉ ET ANCRÉ DU SOCLE (§ 12, § 31).
 *
 * Le chaînage était annoncé deux fois dans la v5 sans une seule colonne pour le
 * porter. Il en a trois désormais — `seq` (ordre total), `prevHash`, `selfHash`
 * (unique) — et ce module est ce qui les fait vivre.
 *
 * ═══ CE QUE CE MODULE GARANTIT ═══
 *
 *  1. AUCUNE TERMINAISON SANS LIGNE. Le journal n'est pas une étape de la chaîne
 *     d'appel, c'est un INVARIANT DE SORTIE (§ 11) : `avecJournal` écrit une
 *     ligne pour chacun des trois chemins de sortie possibles — succès, refus
 *     avec le numéro de l'étape qui a refusé, exception.
 *  2. UNE MODIFICATION APRÈS COUP SE VOIT. `verifierChaine` recalcule chaque
 *     empreinte et rend LE NOMBRE DE LIGNES VÉRIFIÉES, jamais un booléen seul.
 *  3. UNE TRONCATURE DE TÊTE SE VOIT AUSSI — c'est le défaut du modèle voisin
 *     (`audit-log.ts:122`, `let prev = entries[0]!.prevHash`) qu'on ne recopie
 *     pas. Un journal qui commence sur un chaînon non nul est en défaut, sauf
 *     si une ligne de clôture de purge atteste ce qui manque (§ 31).
 *  4. AUCUN CORPS, AUCUN EXTRAIT, AUCUNE DONNÉE PERSONNELLE n'entre. La garde de
 *     forme du § 31 tourne À L'ÉCRITURE, et un manquement REFUSE l'écriture.
 *
 * ═══ CE QUE CE MODULE NE FAIT PAS ═══
 *
 *  · Il ne calcule AUCUN `argHash` : c'est un HMAC clé, il appartient à
 *    `core/limits` (§ 12, règle 2), et une seconde implémentation serait une
 *    seconde clé à tourner. Port `ArgHasher`, dans `ports.ts`.
 *  · Il ne connaît ni Prisma, ni SQL : port `JournalStore`.
 *  · Il ne supprime rien : `preparerPurge` prépare la clôture, la transaction
 *    de suppression appartient à la couche base de données.
 */

export {
  CHAMPS_COUVERTS,
  CHAMPS_EXCLUS,
  ErreurCanonique,
  calculerSelfHash,
  canonicalStringify,
  champsCouverts,
  sha256Hex,
} from "./canonique.js";
export type { ChampCouvert, ChampExclu, JsonValeur } from "./canonique.js";

export {
  CHAMPS_CHARGE_CLOTURE,
  VERSION_CLOTURE,
  construireCloture,
  decoderCharge,
  encoderCharge,
  estLigneDeCloture,
} from "./cloture.js";
export type { ChargeCloture } from "./cloture.js";

export { ErreurContenuJournal, verifierAucunContenu } from "./contenu.js";
export type { VerdictContenu } from "./contenu.js";

export {
  ErreurJournalIndisponible,
  Journal,
  avecJournal,
  enteteAvantIdentification,
} from "./journal.js";
export type { AppelJournalise, EnteteAppel } from "./journal.js";

export { JournalMemoire } from "./memoire.js";

export { HORLOGE_SYSTEME } from "./ports.js";
export type { ArgHasher, Horloge, JournalStore } from "./ports.js";

export {
  ErreurPurge,
  RETENTION_EN_LIGNE_MOIS,
  cumulAncrageTete,
  dateLimiteRetention,
  preparerPurge,
} from "./purge.js";
export type { DemandePurge, PurgePreparee } from "./purge.js";

export { GENRES_ANOMALIE, verifierChaine } from "./verification.js";
export type {
  AnomalieChaine,
  GenreAnomalie,
  OptionsVerification,
  RapportVerification,
} from "./verification.js";

export {
  ARG_HASH_NON_LU,
  DECISIONS,
  FORME_EMPREINTE,
  LONGUEUR_EMPREINTE,
  OUTCOMES,
  OUTIL_CLOTURE,
  OUTIL_INCONNU,
  PRINCIPAL_SYSTEME,
  VERSION_INCONNUE,
} from "./vocabulaire.js";
export type {
  ContenuLigne,
  Decision,
  LigneAAjouter,
  LigneAudit,
  LigneEcrite,
  Outcome,
  Refus,
  Succes,
  Terminaison,
} from "./vocabulaire.js";

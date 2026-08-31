/**
 * axion-ops — `core/limits/` : débit, quotas, idempotence, empreinte des
 * arguments. §§ 11 (étapes 8, 12, 13), 12 et 26 du cahier des charges v6.
 *
 * ── Le point d'entrée ─────────────────────────────────────────────────────
 * `appliquerLimites` porte l'ORDRE des trois étapes et n'en laisse pas le
 * choix à l'appelant. Les fonctions de plus bas niveau (`consommer`,
 * `reserver`) restent exportées pour les gardes et pour la console, mais un
 * appel MCP passe par `appliquerLimites`.
 *
 * ── Les deux interfaces à implémenter ailleurs ────────────────────────────
 * `DepotQuota` et `DepotIdempotence` sont DÉCLARÉS ici et implémentés par la
 * couche de données. Leurs contrats d'atomicité sont écrits dans leurs
 * commentaires : ce sont eux qui font la différence entre un plafond et une
 * suggestion.
 *
 * ── Ce qui manque encore ──────────────────────────────────────────────────
 * `CoffreArgHash` attend `core/vault/`. Tant qu'il n'existe pas, aucune
 * empreinte ne se calcule — et c'est voulu : `ErreurCleArgHash` est bruyante.
 */

export { canoniser, ErreurCanonisation } from "./canonical.js";

export {
  creerCalculArgHash,
  messageArgHash,
  DOMAINE_ARG_HASH,
  LONGUEUR_ARG_HASH,
  LONGUEUR_MINIMALE_CLE,
  ErreurCleArgHash,
  ErreurOutilSansNom,
  type CalculArgHash,
  type CoffreArgHash,
} from "./arg-hash.js";

export {
  CLES_LIMITES,
  DIX_SECONDES_MS,
  EFFETS_ECRITURE,
  ErreurConfigurationQuota,
  LIMITES_DE_DEPART,
  RATIO_ALERTE,
  TOUT_OUTIL,
  UNE_HEURE_MS,
  estLecture,
  fenetreCanonique,
  resoudreCompteurs,
  sApplique,
  validerDenominateur,
  warnAtParDefaut,
  type CleLimite,
  type DemandeResolution,
  type Fenetre,
  type LimiteDeDepart,
  type PlanCompteur,
  type PorteeCompteur,
  type PortantSurEffets,
} from "./config.js";

export {
  consommer,
  rendreCompteurs,
  retryAfterSecondes,
  type CompteurMesure,
  type DemandeConsommation,
  type DemandeIncrement,
  type DepotQuota,
  type EtatCompteur,
  type ResultatQuota,
} from "./quota.js";

export {
  cloturer,
  reserver,
  MODES_IDEMPOTENCE,
  STATUTS_IDEMPOTENCE,
  // ── ADR 0020 — la clé n'atteint plus l'adaptateur, et sa forme est fermée ──
  empreinteDeCleDIdempotence,
  formeAttendueDeCle,
  formeDeCleValide,
  FORME_CLE_IDEMPOTENCE,
  // ── ADR 0021 — l'issue se DÉRIVE du cliquet, jamais du genre de la fin ────
  issueDeReservation,
  type DemandeReservation,
  type DepotIdempotence,
  type FaitsDeCloture,
  type LigneIdempotence,
  type ModeIdempotence,
  type ResultatIdempotence,
  type StatutIdempotence,
} from "./idempotency.js";

/**
 * LES DEUX DOUBLES EN MÉMOIRE des ports ci-dessus.
 *
 * Exportés comme `core/vault` (`DepotEnMemoire`), `core/policy`
 * (`DepotPolitiqueMemoire`) et `core/audit` (`JournalMemoire`) exportent les
 * leurs. Le lot 1 en avait laissé QUATRE copies, écrites à la main dans quatre
 * fichiers de gardes et déjà divergentes entre elles. Voir `memoire.ts`.
 */
export { DepotIdempotenceEnMemoire, DepotQuotaEnMemoire } from "./memoire.js";

export {
  appliquerLimites,
  cloturerLimites,
  ETAPES_LIMITES,
  type ParametresLimites,
  type ResultatLimites,
  type RefusIntercalaire,
  type ResultatValidation,
} from "./limites.js";

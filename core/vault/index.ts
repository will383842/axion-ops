/**
 * core/vault/ — LE COFFRE À TROIS ÉTATS. Surface publique du module.
 *
 * Ce que les autres modules du socle ont le droit de savoir du coffre :
 *
 *  · `Coffre`               — l'objet, sa machine à états, lire/écrire/tourner.
 *  · `decisionDeDemarrage`  — ce que l'état décide au démarrage (§ 23).
 *  · `SourceDeCle`          — d'où vient la clé, W-4 non tranchée (§ 16).
 *  · `DepotDeSecrets`       — où dorment les lignes (`ops_secret`, § 12).
 *  · `JournalDuCoffre`      — la couture vers `core/audit/` (§ 24).
 *  · `ErreurDeCoffre`       — les refus, en union fermée (§ 15).
 *
 * Ce qu'ils n'ont PAS le droit de savoir : le matériau de clé. Aucune fonction
 * exportée ici ne rend un `Uint8Array` de clé, et `Coffre` n'expose son
 * trousseau sous aucune forme — `sante()` ne rend que des `keyId`, qui sont
 * publics par construction (§ 12 : ils voyagent en clair dans `ops_secret`).
 */

export {
  ALGORITHME,
  LONGUEUR_CLE,
  LONGUEUR_IV,
  LONGUEUR_TAG,
  SEPARATEUR_AAD,
  chiffrer,
  construireAad,
  dechiffrer,
  effacerOctets,
  egalesEnTempsConstant,
  motifCleInvalide,
  motifNomInvalide,
  motifVersionInvalide,
} from "./chiffrement.js";
export type {
  DemandeDeChiffrement,
  DemandeDeDechiffrement,
  EnveloppeChiffree,
} from "./chiffrement.js";

export {
  Coffre,
  NOM_CLE_ARG_HASH,
  NOM_DU_SCEAU,
  VERSION_CLE_ARG_HASH,
  VERSION_DU_SCEAU,
} from "./coffre.js";
export type {
  CompteurDAmorcage,
  OptionsDuCoffre,
  ResultatDeRotation,
  SanteDuCoffre,
} from "./coffre.js";

export {
  COMMANDE_DE_PROVISION,
  ROUTES_DU_SOCLE,
  ROUTES_SANS_COFFRE,
  decisionDeDemarrage,
  decisionsPourTousLesEtats,
} from "./demarrage.js";
export type { DecisionDeDemarrage, RouteDuSocle } from "./demarrage.js";

export { DepotEnMemoire, DepotPrisma, EXEMPLAIRE_DE_LIGNE, colonnesTouchees } from "./depot.js";
export type {
  ClientPrismaDuCoffre,
  DelegueOpsSecret,
  DepotDeSecrets,
  EnregistrementSecret,
} from "./depot.js";

export {
  CODE_COFFRE_VERROUILLE,
  ErreurDeCoffre,
  RAISONS_DE_COFFRE,
  estErreurDeCoffre,
} from "./erreurs.js";
export type { RaisonDeCoffre, RefusDeCoffre } from "./erreurs.js";

export {
  ETATS_COFFRE,
  GESTES_COFFRE,
  TRANSITIONS_COFFRE,
  appliquerGeste,
  gestesPermis,
  rangEtatCoffre,
} from "./etat.js";
export type { EtatCoffre, GesteCoffre, ResultatTransition, TransitionCoffre } from "./etat.js";

export { EVENEMENTS_DU_COFFRE, JOURNAL_MUET, JournalEnMemoire } from "./evenements.js";
export type { EvenementDuCoffre, JournalDuCoffre, NomEvenementDuCoffre } from "./evenements.js";

export {
  VARIABLES_DE_CLE,
  clonerTrousseau,
  cleDuTrousseau,
  depuisDeverrouillageManuel,
  depuisEnvironnement,
  effacerTrousseau,
  empreinteDeCle,
  keyIdsDuTrousseau,
} from "./source-de-cle.js";
export type { CleDeCoffre, SourceDeCle, SourceDeCleManuelle, Trousseau } from "./source-de-cle.js";

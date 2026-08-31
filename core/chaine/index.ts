/**
 * `core/chaine/` — LA CHAÎNE D'APPEL DU § 11 : ses cinq étapes propres, et
 * l'ORCHESTRATEUR qui en fixe l'ORDRE.
 *
 * Ce qu'il apporte, et qui n'existait pas à la fin du lot 1 :
 *
 *  · un NUMÉRO et un CODE d'étape DÉRIVÉS d'`APPEL_STEPS` pour chacune des cinq
 *    étapes orphelines — plus aucun `5` ni `"cursor_invalid"` écrit à la main
 *    chez un appelant ;
 *  · un ORDRE qui appartient à quelqu'un — étape 0, puis 5 à 14 —, avec les deux
 *    règles du § 11 qui ne portent sur aucune étape en particulier ;
 *  · un INVARIANT DE SORTIE tenu par le TYPE DE RETOUR, sa BORNE écrite avec
 *    lui, et le MÉCANISME proposé pour la lever (`PorteeDIntention`) ;
 *  · une COLONNE PAR TRANSPORT : quelles étapes s'appliquent en stdio, quel
 *    principal s'y inscrit, quels scopes y valent par défaut — ce que la v5
 *    n'avait jamais donné au transport qui sert de parade au null-route.
 */

export { CHEMINS_ETAPES_CHAINE, MODULES_ETAPES_CHAINE } from "./modules.js";
export type { CleEtapeChaine } from "./modules.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES CINQ EXÉCUTANTS, ET LES APPUIS SANS LESQUELS ILS NE SE MONTENT PAS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ POURQUOI CE BLOC EST LA PARTIE LA PLUS IMPORTANTE DU BARILLET.
 *
 * Le défaut MESURÉ qui a motivé ce lot était : « sans module propriétaire,
 * chaque appelant réécrit les étapes à la main », dont DEUX gardes de sécurité
 * (5 et 11). Les modules ont atterri — et le barillet n'en exportait AUCUN. Un
 * appelant qui importait `core/chaine` obtenait l'orchestrateur et les
 * déclarations, jamais de quoi le NOURRIR : `DependancesOrchestrateur` exige les
 * cinq exécutants. Il lui restait l'import profond dans un fichier non exporté,
 * ou la réécriture à la main — c'est-à-dire le défaut d'origine, intact.
 *
 * Ce qui suit est exactement ce qu'il faut pour monter
 * `DependancesOrchestrateur` sans ouvrir un seul fichier du dossier.
 */
export {
  PORTE_PAR_LE_JETON_DAPPEL,
  SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL,
  SCOPE_EXIGE_PAR_EFFET,
  correspondanceCanonique,
  effetsCouvertsPar,
  etape05Scopes,
} from "./etape-05-scopes.js";

export {
  CAUSES_INCIDENT,
  CHAMPS_EPINGLES,
  confronterEpinglage,
  creerEtapeCatalogue,
} from "./etape-06-outil.js";

export {
  CHAMPS_CHARGE,
  DOMAINE_CURSEUR,
  ErreurCleCurseur,
  ErreurFiltersHashAbsent,
  LONGUEUR_SIGNATURE_CURSEUR,
  SEPARATEUR_JETON,
  TAILLE_MAX_JETON,
  creerSignataireCurseur,
  etapeCurseur,
} from "./etape-09-curseur.js";
export type { CoffreCurseur } from "./etape-09-curseur.js";

export {
  DOMAINE_INDETERMINE,
  FAMILLES_GOUVERNANCE,
  IndexProvenanceMemoire,
  PLAFOND_EXTRAITS,
  PLAFOND_SESSIONS,
  TTL_MARQUAGE_MS,
  analyserArgumentsDuSchema,
  empreinteExtrait,
  etape11Provenance,
  familleDeGouvernance,
  marquerResultat,
} from "./etape-11-provenance.js";

export {
  CHAMPS_META_13_2,
  CHAMPS_META_ETAPE_14,
  CHAMPS_META_HORS_ETAPE_14,
  ErreurChargeNonMesurable,
  ErreurContexteExecutionIncoherent,
  ErreurMasquageHorsContrat,
  ErreurMasquageMenteur,
  LONGUEUR_RACCOURCIE,
  MAX_SOURCES_PARTIELLES,
  SOURCE_NON_CONFORME,
  executerEtape14,
} from "./etape-14-execution.js";

export {
  ETAPES_CHAINE,
  ETAPES_REVENDIQUEES,
  ETAPE_CATALOGUE,
  ETAPE_CURSEUR,
  ETAPE_EXECUTION,
  ETAPE_PROVENANCE,
  ETAPE_SCOPES,
  ErreurAncrageEtape,
  PALIERS_COMPACTION,
  STATUTS_ETAPE,
  ancrerEtape,
  autorise,
  etapesNonImplementees,
  refuse,
} from "./etapes.js";

export type {
  AncrageEtape,
  CatalogueEtabli,
  CatalogueOutils,
  ChargeAdaptateur,
  ChargeCurseur,
  ContexteCatalogue,
  ContexteCurseur,
  ContexteExecution,
  ContexteProvenance,
  ContexteScopes,
  CorrespondanceScopes,
  CurseurEtabli,
  EntreeChaine,
  EtapeAutorise,
  EtapeCatalogue,
  EtapeCurseur,
  EtapeExecution,
  EtapeProvenance,
  EtapeRefuse,
  EtapeScopes,
  ExecutionEtablie,
  IndexProvenance,
  Masquage,
  OutilDuCatalogue,
  PalierCompaction,
  ProvenanceEtablie,
  ScopesEtablis,
  SignataireCurseur,
  StatutEtape,
  VerdictEtape,
} from "./etapes.js";

export {
  ErreurChaineIncoherente,
  ErreurCodeIntercalaireAbsent,
  ErreurOrchestrateurNonImplemente,
  ETAPE_COFFRE_CHAINE,
  ETAPE_IDEMPOTENCE_CHAINE,
  ETAPE_PROFIL_CHAINE,
  ETAPE_PROVENANCE_CHAINE,
  ETAPE_QUOTA_CHAINE,
  ETAPE_SCHEMA_CHAINE,
  EXECUTANTS_ETAPES,
  INTENTION_NON_ARMEE,
  PRINCIPAL_STDIO,
  SCOPES_PAR_DEFAUT_STDIO,
  TRANSPORTS,
  colonneDuTransport,
  empreintesParDefaut,
  identiteStdio,
  memoiserPourCetAppel,
  orchestrerAppel,
  verifierCouvertureDesEtapes,
} from "./orchestrateur.js";

export type {
  AppelAdaptateur,
  AppelEntrant,
  CatalogueMemoise,
  ChargeServie,
  ColonneTransport,
  ConstruireContexteOutil,
  ConstruireEntete,
  CorpsDeChaine,
  CouvertureEtapes,
  DependancesOrchestrateur,
  EtatDePilotage,
  EtatDePolitique,
  EtatDuCoffre,
  IdentiteAppelante,
  PorteeDIntention,
  RefusDetaille,
  ReglagesDeLOutil,
  ResultatAppel,
  TraceOrchestration,
  Transport,
  VerificationConfirmation,
} from "./orchestrateur.js";

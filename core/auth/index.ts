/**
 * `core/auth/index.ts` — LA FAÇADE DE L'ÉMETTEUR.
 *
 * ⚠️ **UN RÉ-EXPORT N'EST PAS UN APPELANT**, et la garde de couture de l'ADR 0019
 *    le sait : `sansLiaisons()` retire les clauses `export … from` avant de
 *    chercher un appel. Ce fichier ne coud donc rien — il range.
 */

export type {
  ConfigurationDAuthentification,
  Octroi,
  PrincipalEmis,
  VerdictDeScopes,
} from "./contrat.js";

export {
  CHEMIN_DE_LA_RESSOURCE_MCP,
  COMPARAISON_DE_L_AUDIENCE,
  CONTRAINTES_DE_L_AUDIENCE,
  VARIABLE_DE_L_AUDIENCE,
} from "./ressource.js";
export type { CleDeContrainteDAudience } from "./ressource.js";

export {
  CAUSES_DE_REFUS_DAUDIENCE,
  HOTES_DE_BOUCLAGE,
  autoriteDe,
  cheminDe,
  comparerLAudienceDuJeton,
  verifierLaFormeDeLAudience,
} from "./audience.js";
export type {
  CauseDeRefusDAudience,
  VerdictDAudiencePresentee,
  VerdictDeFormeDAudience,
} from "./audience.js";

export {
  DOMAINE_TOKEN_HASH,
  ErreurCleEmpreinteDeJeton,
  ErreurJetonSansValeur,
  LONGUEUR_MINIMALE_CLE_TOKEN_HASH,
  LONGUEUR_TOKEN_HASH,
  cadrerPourEmpreinte,
  creerCalculEmpreinteDeJeton,
  messageEmpreinteDeJeton,
} from "./empreinte.js";
export type { CalculEmpreinteDeJeton, CoffreEmpreinteDeJeton } from "./empreinte.js";

export { GENRES_DE_JETON } from "./depot.js";
export type {
  DemandeDAutorisation,
  DepotDeDemandes,
  DepotDeJetons,
  GenreDeJeton,
  LigneOpsToken,
} from "./depot.js";

export {
  ErreurCodeDejaDepose,
  ErreurJetonDejaPresent,
  MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS,
  creerDepotDeDemandesEnMemoire,
  creerDepotDeJetonsEnMemoire,
} from "./memoire.js";

export {
  BORNES_DU_JOURNAL,
  CAUSES_DE_REFUS_DE_PRINCIPAL,
  ErreurPrincipalRefuse,
  admettreUnPrincipal,
  verdictDUnPrincipal,
} from "./principal.js";
export type {
  BornesDIdentifiantDuJournal,
  CauseDeRefusDePrincipal,
  VerdictDePrincipal,
} from "./principal.js";

export {
  ErreurScopeNonEmissible,
  SCOPES_EMISSIBLES,
  estEmissible,
  verdictDeScopesDemandes,
} from "./scopes.js";
export type { VerdictDeScopesDemandes } from "./scopes.js";

export {
  CAUSES_DE_REFUS_PKCE,
  FORME_DU_VERIFICATEUR,
  LONGUEUR_MAXIMALE_VERIFICATEUR,
  LONGUEUR_MINIMALE_VERIFICATEUR,
  METHODES_DE_DEFI_ADMISES,
  METHODES_DE_DEFI_REFUSEES,
  defiAttendu,
  methodeAdmise,
  verdictDeLaMethodeDeDefi,
  verifierLeDefi,
} from "./pkce.js";
export type { CauseDeRefusPkce, MethodeDeDefi, VerdictDePkce } from "./pkce.js";

export {
  DUREES_DE_L_EMETTEUR,
  DUREE_DU_CODE_DAUTORISATION_MS,
  DUREE_DU_JETON_DACCES_MS,
  DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS,
  EXPIRES_IN_DU_JETON_DACCES,
} from "./durees.js";

export {
  REGLAGES_DAUTHENTIFICATION,
  reglagePresent,
  verifierLaConfigurationDAuthentification,
} from "./configuration.js";
export type { ConfigurationDAuthentificationMesuree, ExigenceDeReglage } from "./configuration.js";

export {
  APPELANTS_DE_L_EMETTEUR,
  CHEMINS_DE_L_EMETTEUR_SANS_COFFRE,
  CHEMINS_SERVIS_PAR_L_EMETTEUR,
  CHEMIN_AUTORISATION,
  CHEMIN_DECOUVERTE_DE_LA_RESSOURCE,
  CHEMIN_DECOUVERTE_DE_L_EMETTEUR,
  CHEMIN_JETON,
  CHEMIN_REVOCATION,
  FAMILLES_DE_ROUTES_DE_L_EMETTEUR,
  metadonneesDeLEmetteur,
  metadonneesDeLaRessource,
} from "./routes.js";
export type {
  AppeleParDeLEmetteur,
  FamilleDeRoutesDeLEmetteur,
  OrigineDeLEmetteur,
} from "./routes.js";

export {
  CAUSES_DE_REFUS_A_L_ETAPE_4,
  CAUSES_DE_REFUS_DOCTROI,
  ErreurAudienceDeMontage,
  ErreurDOctroi,
  ErreurJetonDejaRevele,
  FRAPPEURS_PAR_INJECTION,
  OCTETS_DUN_JETON,
  creerEmetteurDeJetons,
} from "./octroi.js";
export type {
  AutorisationPreparee,
  CauseDeRefusALEtape4,
  CauseDeRefusDOctroi,
  DemandeDeConsentement,
  DependancesDeLEmetteur,
  EmetteurDeJetons,
  FabriqueDOctroi,
  JetonEmis,
  ResultatDePremierOctroi,
  ResultatDeRafraichissement,
  VerdictDeLEtape4,
} from "./octroi.js";

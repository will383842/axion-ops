/**
 * `core/transport/stdio/index.ts` — la surface publique du transport stdio.
 *
 * ⚠️ **UN RÉ-EXPORT N'EST PAS UN APPELANT.** `core/coutures/verifier.ts` retire
 *    les clauses `export … from` avant de compter, et c'est la bonne règle : ce
 *    fichier ne coud rien, il nomme. Ce qui coud est `serveur.ts`, et le registre
 *    des coutures le dit entrée par entrée.
 */

export {
  CARACTERES_MAX_PAR_LIGNE,
  CLES_DE_REBUT,
  ErreurDeSerialisationStdio,
  analyserUneLigne,
  creerDecoupeur,
  serialiser,
} from "./cadrage.js";
export type {
  Cadre,
  CleDeRebut,
  Decoupeur,
  MesuresDuCadrage,
  MessageRecu,
  Rebut,
} from "./cadrage.js";

export {
  CLES_DE_PARAMETRES_DE_TOOLS_CALL,
  CODES_ENVELOPPE,
  METHODES_SERVIES,
  VERSION_JSONRPC,
  clesRefuseesDeToolsCall,
  lireEnveloppe,
  reponseDErreur,
  reponseDeSucces,
  resultatRefuse,
} from "./protocole.js";
export type {
  CleDeParametreDeToolsCall,
  CodeEnveloppe,
  EnveloppeFautive,
  EnveloppeLue,
  IdJsonRpc,
  MethodeServie,
  NotificationLue,
  Reponse,
  ReponseErreur,
  ReponseSucces,
  RequeteLue,
  ResultatDOutilRefuse,
} from "./protocole.js";

export {
  ErreurDeColonneDuTransport,
  confronterLesEtapesExercees,
  confronterLesImports,
  etapesDUneTrace,
  modulesInterditsAuTransport,
  resoudreDepuisLaRacine,
  verifierLaColonneDuTransport,
} from "./etapes-exercees.js";
export type {
  EnsembleInterdit,
  FichierDuTransport,
  RapportDEtapesExercees,
  RapportDImports,
  TraceDEtapes,
} from "./etapes-exercees.js";

export {
  BUDGET_MAX_MS,
  BUDGET_PAR_DEFAUT_MS,
  ETAPES_PRISES_EN_CHARGE_PAR_STDIO,
  ErreurDeMontageStdio,
  TRANSPORT_STDIO,
  brancherSurLesFlux,
  creerServeurStdio,
  ecrireSurLeFlux,
} from "./serveur.js";
export type {
  AttacheAuxFlux,
  CatalogueServiEnStdio,
  DescripteurOutilServi,
  FluxDEntreeStdio,
  FluxDeSortieStdio,
  MesuresDuServeurStdio,
  PortsDuServeurStdio,
  ServeurStdio,
} from "./serveur.js";

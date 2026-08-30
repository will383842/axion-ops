/**
 * `core/adapter-kit/` — la DSL d'écriture d'un adaptateur, et son harnais.
 *
 * Ce module vit dans le socle mais s'exécute chez l'ADAPTATEUR. Il ne connaît
 * aucun métier : il produit un manifeste JSON et vérifie neuf contrôles.
 *
 * Ce qu'il ne fait PAS, et ne doit jamais faire :
 *  · appeler un `handler` — le socle appelle un endpoint JSON-RPC ;
 *  · lire un secret, ni en déclarer la valeur ;
 *  · fixer `trustTier` ou `maxDataClass` — ils sont posés par `core/registry/`.
 */

export {
  canoniser,
  empreinteCanonique,
  empreinteSha256,
  octetsCanoniques,
  octetsUtf8,
} from "./json.js";
export { MOTIF_EMPREINTE, versValeurJson } from "./json.js";
export type { ObjetJson, ValeurJson } from "./json.js";

export { IDEMPOTENCIES, PAGINATIONS, definirOutil } from "./types.js";
export type {
  AnnotationsCompaction,
  DefinitionAdaptateur,
  DefinitionOutil,
  Idempotency,
  Pagination,
  ReferenceSecret,
  SpecOutil,
} from "./types.js";

export {
  ErreurManifeste,
  VERSION_MANIFESTE,
  analyserDefinition,
  construireManifeste,
  empreinteDuManifeste,
  nomComplet,
  prefixeDe,
  proprietesDuSchema,
  requisDuSchema,
  texteDuManifeste,
} from "./manifest.js";
export type { AnalyseDefinition, Manifeste, ManifesteOutil } from "./manifest.js";

export { creerAdapterKit } from "./kit.js";
export type { AdaptateurEcrit, AdapterKit } from "./kit.js";

export { verifierEnumerationProfils } from "./profils.js";
export type { ContratProfils } from "./profils.js";

export {
  clesDAutorisationDepuisSource,
  lireClesDAutorisation,
  proprietesDInterface,
  sansCommentaires,
} from "./autorisation.js";
export type { ClesDAutorisation } from "./autorisation.js";

export { MOTIFS_ACCES_SECRET, executerHarnais, formaterRapport } from "./conformite.js";
export type {
  EntreeHarnais,
  FichierAdaptateur,
  FixtureExecutee,
  RapportHarnais,
  ResultatControle,
  SondeRoute,
} from "./conformite.js";

export { anomaliesCompletes, estVert } from "./verdict.js";
export type { Verdict } from "./verdict.js";

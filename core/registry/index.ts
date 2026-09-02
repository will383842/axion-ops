/**
 * `core/registry/` — `ops_adapter`, `ops_tool`, `adapters.lock.json`.
 *
 * Le registre est la frontière de confiance du socle : d'un côté un manifeste
 * venu d'un autre dépôt, de l'autre un verrou versionné ici. `trustTier` et
 * `maxDataClass` sont posés de CE côté-ci, et le manifeste qui prétendrait les
 * porter est refusé.
 */

export { AUTH_MODES, ENTREE_VERROU_TEMOIN, MOTIFS_REFUS, VERSION_VERROU } from "./types.js";
export type {
  AuthMode,
  EntreeVerrou,
  GardeAnnoncee,
  LigneOpsAdapter,
  LigneOpsTool,
  MotifRefus,
  Refus,
  ResultatEnregistrement,
  VerrouAdaptateurs,
} from "./types.js";

export {
  clesDuManifeste,
  clesReserveesAuSocle,
  empreinteDuManifesteProduit,
  empreinteDuManifesteRecu,
  entreePourId,
  lireVerrou,
  verifierCouvertureDuVerrou,
} from "./lock.js";
export type { LectureVerrou } from "./lock.js";

export { clesDePremierNiveau, lireManifesteRecu } from "./manifeste-recu.js";
export type { LectureManifeste } from "./manifeste-recu.js";

export { enregistrerAdaptateur } from "./enregistrer.js";
export type { EntreeEnregistrement } from "./enregistrer.js";

export {
  COLONNES_POSSEDEES_PAR_LA_CONSOLE,
  DepotDuRegistreEnMemoire,
  DepotDuRegistrePrisma,
  ErreurDeDepotDuRegistre,
  EXEMPLAIRE_D_ADAPTATEUR,
  EXEMPLAIRE_D_OUTIL,
  colonnesDAdaptateurTouchees,
  colonnesDOutilTouchees,
  versEnregistrementOutil,
} from "./depot.js";
export type {
  ClientPrismaDuRegistre,
  DelegueOpsAdapter,
  DelegueOpsTool,
  DepotDuRegistre,
  EnregistrementAdaptateur,
  EnregistrementOutil,
  LigneOutilPersistee,
  ResultatEcritureDuRegistre,
} from "./depot.js";

export { construireLeCatalogue, indexerLeManifeste } from "./catalogue.js";
export type { DesaccordDeCatalogue, ManifesteIndexe, ResultatDeCatalogue } from "./catalogue.js";

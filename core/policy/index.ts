/**
 * core/policy — LES GARDE-FOUS DU SOCLE (§ 20).
 *
 * Ce module ne connaît AUCUN métier. Il répond à quatre questions, et à elles
 * seules :
 *
 *  · Quel niveau s'applique à cet outil, MAINTENANT ?           `niveau.ts`
 *  · Cet effet passe-t-il à ce niveau ?                         `effet.ts`
 *  · Cette confirmation vaut-elle pour CET appel exact ?        `confirmation.ts`
 *  · Ce changement de politique est-il libre, ou non ?          `desserrage.ts`
 *
 * ÉTAGES DE LA CHAÎNE D'APPEL SERVIS : l'étape 10 seule. L'étape 11
 * (provenance) et l'étape 12 (quota) appartiennent à d'autres dossiers, même si
 * le § 20 les décrit dans la même section.
 */

export {
  analyserReference,
  analyserScope,
  GENRES_SCOPE,
  nomQualifie,
  referenceDepuisNom,
  scopeCouvre,
  scopeDomine,
  scopesCouvrants,
  specificite,
  type AnalyseScope,
  type GenreScope,
  type ReferenceOutil,
} from "./scope.js";

export {
  anomaliesSemantiques,
  anomaliesStructurelles,
  CANAL_DEMARRAGE,
  ligneDeDemarrage,
  ligneEnVigueur,
  SET_BY_DEMARRAGE,
  type AnomalieLigne,
  type LignePolitique,
} from "./ligne.js";

export {
  demarrerPolitique,
  SCOPE_DEMARRAGE,
  verifierLeCablageDuDemarrage,
  type CablageDuDemarrage,
  type ResultatDemarrage,
} from "./demarrage.js";

export {
  lignesResiduelles,
  niveauApplique,
  NIVEAU_DE_REPLI,
  plancherDuScope,
  RAISONS_NIVEAU,
  type NiveauApplique,
  type PlancherScope,
  type RaisonNiveau,
} from "./niveau.js";

export {
  deciderEtape10,
  effetsExterieurs,
  estEffetExterieur,
  ETAPE_POLITIQUE,
  ETATS_CONFIRMATION,
  exigeConfirmationSystematique,
  type CiblePublique,
  type DecisionPolitique,
  type DemandeEtape10,
  type EtatConfirmation,
} from "./effet.js";

export {
  canalDelivreUneConfirmation,
  canauxDeConfirmation,
  CANAUX,
  DepotJetonsConfirmationMemoire,
  emettreConfirmation,
  empreinteJeton,
  MOTIFS_REFUS_CONFIRMATION,
  TTL_CONFIRMATION_DEFAUT_MS,
  TTL_CONFIRMATION_MAX_MS,
  verifierEtConsommer,
  type AppelAConfirmer,
  type Canal,
  type DemandeConfirmation,
  type DependancesConfirmation,
  type DepotJetonsConfirmation,
  type JetonConfirmationConserve,
  type MotifRefusConfirmation,
  type ResultatEmission,
  type ResultatVerification,
} from "./confirmation.js";

export {
  CHIFFRES_TOTP,
  codeTotp,
  decoderBase32,
  DERIVE_TOTP_PAS,
  DepotPasTotpMemoire,
  MOTIFS_REFUS_FACTEUR,
  pasTotp,
  PERIODE_TOTP_S,
  SecondFacteurTotp,
  type DemandeSecondFacteur,
  type DepotPasTotp,
  type FournisseurSecretTotp,
  type MotifRefusFacteur,
  type ResultatSecondFacteur,
  type SecondFacteur,
} from "./second-facteur.js";

export { DepotPolitiqueMemoire, type DepotPolitique } from "./depot.js";

export {
  classerChangement,
  desserrer,
  GENRES_CHANGEMENT,
  MOTIFS_REFUS_CHANGEMENT,
  niveauPourEcran,
  resserrer,
  SCOPE_DESSERRAGE,
  TTL_DESSERRAGE_MAX_MS,
  type ClassementChangement,
  type ContexteDesserrage,
  type DemandeChangement,
  type DependancesDesserrage,
  type GenreChangement,
  type MotifRefusChangement,
  type ResultatChangement,
} from "./desserrage.js";

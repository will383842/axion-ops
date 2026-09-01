/**
 * voice/etats — LA MACHINE À ÉTATS DU DÉMON VOCAL (§ 18, § 20, § 30, ADR 0010).
 *
 * Logique PURE. Aucun micro, aucun modèle, aucune synthèse, aucun `Date.now()`.
 * Trois fichiers, trois responsabilités :
 *
 *  · `vocabulaire.ts` — les sept états, les quinze gestes, et les DEUX
 *    obligations (second facteur, fenêtre déverrouillée) CALCULÉES à partir de
 *    la nature et de l'effet de chaque geste.
 *  · `fenetre.ts`     — la fenêtre déverrouillée, sur un temps INJECTÉ. C'est
 *    ici que se ferme le trou entre « le délai est écoulé » et « la minuterie
 *    a battu ».
 *  · `machine.ts`     — la table des 54 transitions, la décision, et
 *    l'avancement (état d'après + instant d'activité d'après).
 *
 * Ce que ce module NE fait pas, et qui reste au démon du lot 8 : capturer le
 * micro, détecter la parole, transcrire, appeler `interrupt()`, jouer la
 * synthèse, journaliser. Il lui dit seulement ce qui est permis, et pourquoi.
 */

export {
  EFFETS_SUR_LA_SURFACE,
  ETATS_ENGAGES,
  ETATS_OUVERTS,
  ETATS_VOCAUX,
  ETAT_AU_REPOS,
  ETAT_LE_PLUS_FERME,
  GESTES_QUI_ELARGISSENT,
  GESTES_VOCAUX,
  NATURES_GESTE,
  NOMS_GESTES,
  PROVENANCES_FACTEUR,
  PROVENANCE_PROBANTE,
  decrireGeste,
  exigeFenetreDeverrouillee,
  exigeSecondFacteur,
  facteurProbant,
  fenetreOuverte,
  rangEffet,
  rangEtatVocal,
  type DescriptionGeste,
  type EffetSurLaSurface,
  type EtatVocal,
  type GesteVocal,
  type NatureGeste,
  type ProvenanceFacteur,
} from "./vocabulaire.js";

export {
  DELAI_INACTIVITE_NON_ARBITRE_MS,
  MOTIFS_ECHEANCE,
  MOTIF_FENETRE_VIVANTE,
  evaluerEcheance,
  fenetreDeverrouillee,
  instantDEcheance,
  verrouillageDu,
  type Echeance,
  type HorlogeVocale,
  type MotifEcheance,
} from "./fenetre.js";

export {
  MACHINE_VOCALE,
  MOTIFS_REFUS_VOCAL,
  TRANSITIONS_VOCALES,
  appliquerGesteVocal,
  avancer,
  decider,
  etatsSources,
  gestesInscrits,
  gestesPraticables,
  renouvelleLActivite,
  rouvreLaFenetre,
  type Avancement,
  type ContexteVocal,
  type DecisionVocale,
  type MachineVocale,
  type MotifRefusVocal,
  type TransitionVocale,
} from "./machine.js";

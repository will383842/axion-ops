/**
 * `core/instance/` — COMBIEN DE SOCLES TOURNENT, ET COMMENT ON LE SAIT.
 *
 * Un seul sujet : le socle est **mono-instance en v1**, et cette phrase ne vaut
 * que si une garde la tient. Voir **ADR 0018**.
 *
 * ⚠️ SI LE SOCLE PASSE UN JOUR À DEUX INSTANCES, LE § 20 EST À ROUVRIR AVANT.
 *    L'index de provenance est local au processus : deux instances appliqueraient
 *    la garde d'exfiltration une fois sur deux. La borne est écrite ici, dans
 *    `verrou.ts`, dans le README et dans l'ADR 0018 — quatre endroits, parce que
 *    celui qui ajoutera un réplica ne lira pas forcément les trois autres.
 */

export {
  DOMAINE_DU_VERROU,
  ETATS_DU_VERROU,
  ETATS_SANS_EXCLUSIVITE,
  FORME_INSTANCE_ID,
  OCTETS_INSTANCE_ID,
  STATUT_HEALTHCHECK_VERROU_ABSENT,
  STATUT_HEALTHCHECK_VERROU_TENU,
  deciderDemarrageMonoInstance,
  decisionsPourTousLesEtatsDuVerrou,
  frapperInstance,
  statutHealthcheckPourVerrou,
} from "./verrou.js";

export type {
  DecisionDeDemarrageMonoInstance,
  EtatDuVerrou,
  InstanceDuSocle,
  ResultatAcquisition,
  SanteMonoInstance,
  VerrouDInstance,
} from "./verrou.js";

/**
 * LA COUTURE — le module qui APPELLE l'arbitre. Sans lui, la décision de l'ADR
 * 0018 resterait une fonction que personne n'invoque, c'est-à-dire une
 * intention : c'est le mode de défaillance que l'épreuve du lot 1c a mesuré sur
 * quatre ADR sur cinq.
 */
export {
  REPLI_MAGASIN_INJOIGNABLE,
  demarrerLeSocleMonoInstance,
  relireLaSanteMonoInstance,
} from "./demarrage.js";
export type { DemarrageMonoInstance, LectureDeProvenance } from "./demarrage.js";

/**
 * Le double en mémoire du port, et le témoin qui fait rougir la garde G1 de
 * l'ADR 0018. Ils vivent dans un fichier ORDINAIRE, comme `core/audit/memoire.ts`
 * et `core/limits/memoire.ts` : un double exporté depuis un `.spec.ts` ne
 * franchirait pas la frontière du paquet.
 */
export { MagasinDeVerrousEnMemoire, VerrouEnMemoire, VerrouReentrantTemoin } from "./memoire.js";
export type { OptionsVerrouEnMemoire } from "./memoire.js";

/**
 * L'ADAPTATION POSTGRES — la moitié que l'ADR 0018 demandait et que le lot 1d
 * avait laissée ouverte en nommant sa cause : « le verrou consultatif de session
 * attend `core/transport/` ». Voir **ADR 0024**.
 *
 * ⚠️ ELLE N'OUVRE AUCUNE CONNEXION ELLE-MÊME. La session DÉDIÉE lui est donnée
 *    par un port, et c'est ce qui permet d'éprouver ses trois propriétés — hors
 *    du pool, même session à la relecture, aucune reconnexion — sans base et
 *    sans réseau.
 */
export {
  APPLICATION_NAME_DU_VERROU,
  BITS_RETENUS_DE_LA_CLE,
  HOTE_SANS_MAGASIN_PARTAGE,
  REQUETES_DU_VERROU,
  VerrouPostgres,
  choisirImplementationDuVerrou,
  cleDuVerrouPostgres,
} from "./postgres.js";
export type {
  ChoixDuVerrou,
  CleDuVerrou,
  LigneDuMagasin,
  OptionsVerrouPostgres,
  OuvertureDeSessionDediee,
  RequeteDuVerrou,
  SessionDeVerrou,
} from "./postgres.js";

/**
 * `core/transport/http/index.ts` — **LA FAÇADE DU TRANSPORT STREAMABLE HTTP.**
 *
 * ⚠️ **UN RÉ-EXPORT N'EST PAS UN APPELANT.** `core/coutures/verifier.ts` retire
 *    les clauses `export … from` avant de compter les coutures, et il a raison :
 *    ce fichier ne branche rien, il nomme. Les coutures de ce dossier se
 *    mesurent dans `transport.ts` et `amont.ts`, qui APPELLENT.
 *
 * ⚠️ **CE QUE CE DOSSIER N'EXPOSE PAS, ET POURQUOI.** Aucune fonction ne monte
 *    un transport « prêt à l'emploi » avec des réglages devinés.
 *    {@link creerTransportHttp} exige la liste blanche d'hôtes, l'audience et le
 *    budget d'appel, et refuse chacun quand il est vide ou absurde. Poser des
 *    défauts ferait démarrer un socle qui n'aurait gardé personne — c'est le
 *    mode de défaillance que l'ADR 0025 nomme pour la liste blanche, et il vaut
 *    pour les trois.
 */

export {
  ErreurListeBlancheVide,
  SEPARATEUR_DES_HOTES,
  VARIABLE_DES_HOTES_ADMIS,
  listeBlancheDHotes,
  verifierLHote,
} from "./hote.js";

export {
  MOTIFS_DE_REFUS_DAUDIENCE,
  verifierLAudience,
  type MotifDeRefusDAudience,
  type VerdictDAudience,
} from "./audience.js";

export {
  EN_TETE_AUTORISATION,
  SCHEMA_PORTEUR,
  porteurDeLAutorisation,
  type RegistreDesJetons,
  type RevendicationsDuJeton,
  type VerificateurDeJeton,
} from "./jeton.js";

export {
  PRINCIPAL_REFUS_EN_AMONT,
  TEMOIN_DE_CAPACITE,
  verifierLaFormeDuPrincipal,
  type VerdictDeFormeDuPrincipal,
} from "./principal.js";

export {
  ErreurCouvertureAmont,
  EXECUTANTS_AMONT_HTTP,
  exigerLaCouvertureAmont,
  verifierLAmontEtabli,
  verifierLaCouvertureAmont,
  type CouvertureAmont,
} from "./couverture.js";

export {
  ETAPES_DUES_AU_TRANSPORT,
  ETAPE_AUDIENCE,
  ETAPE_HOTE,
  ETAPE_JETON,
  ETAPE_REVOCATION,
  JOURNAL_AMONT_NON_ARME,
  MOTIFS_DE_DEFI,
  franchirLAmont,
  type DefiDAuthentification,
  type DependancesAmont,
  type EnTetesAmont,
  type JournalDesRefusEnAmont,
  type MotifDeDefi,
  type RefusEnAmont,
  type ReglagesAmont,
  type ResultatAmont,
  type TraceAmont,
} from "./amont.js";

export { codeDuRefusAmont, type CleDEtapeAmont } from "./codes.js";

export {
  CLES_META_DU_SOCLE,
  CODES_JSON_RPC,
  METHODE_APPEL_OUTIL,
  PREFIXE_META_SOCLE,
  VERSION_JSON_RPC,
  lireLEnveloppe,
  type IdJsonRpc,
  type LectureDEnveloppe,
} from "./enveloppe.js";

export {
  DELAI_DE_REPRISE_NON_DECLARE,
  LONGUEUR_MINIMALE_CONFRONTEE,
  REALM_DU_SOCLE,
  STATUT_CHEMIN_INCONNU,
  STATUT_ENVELOPPE_INVALIDE,
  STATUT_ERREUR_INTERNE,
  STATUT_METHODE_INCONNUE,
  STATUT_SUCCES,
  defiWwwAuthenticate,
  statutDuRefus,
  valeurRetryAfter,
  verifierAucuneFuite,
  type LectureDuDelaiDeReprise,
  type ReponseHttp,
  type ValeurSensible,
  type VerdictDeFuite,
} from "./reponse.js";

export {
  CHEMIN_MCP,
  CODE_JSON_RPC_REFUS_DU_SOCLE,
  ErreurReglageDuTransport,
  METHODE_MCP,
  creerTransportHttp,
  type DependancesTransportHttp,
  type PontDIdentite,
  type ReglagesTransportHttp,
  type RequeteHttp,
  type TraceDeTraitement,
  type TraitementHttp,
  type TransportHttp,
} from "./transport.js";

export {
  ADRESSE_DE_BOUCLE_LOCALE,
  ErreurCorpsTropGrand,
  creerServeurHttp,
  type ReglagesServeurHttp,
  type ServeurHttp,
} from "./serveur.js";

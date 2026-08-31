/**
 * `core/auth/durees.ts` — **UNE HEURE, TRENTE JOURS, ET CE QUE CES DEUX NOMBRES
 * DÉCIDENT AILLEURS.**
 *
 * § 19.1, mot pour mot : « access token **1 h**, refresh **30 j rotatif** ».
 *
 * ═══ POURQUOI UN FICHIER POUR DEUX CONSTANTES ═══
 *
 * Parce qu'elles ne sont pas des réglages. Elles sont lues par une décision qui
 * vit ailleurs, et un chiffre écrit deux fois est un chiffre qui divergera :
 *
 * ⚠️ **`core/identite/session.ts` DÉRIVE DE LA PREMIÈRE.** Son en-tête écrit
 *    que la session ne peut pas suivre le `jti` : « le § 19.1 donne au jeton
 *    d'accès une heure et au rafraîchissement 30 jours rotatifs — un `jti` change
 *    donc au moins toutes les heures, alors que le marquage de provenance vit
 *    `TTL_MARQUAGE_MS` = quatre heures. Une session dérivée du `jti` s'effacerait
 *    trois fois par TTL. » **Allonger la durée d'accès au-delà de
 *    `TTL_MARQUAGE_MS` ne casserait rien de visible et retirerait au § 20 son
 *    argument** : la garde de `core/auth/durees.spec.ts` mesure ce rapport et
 *    rougit si l'ordre s'inverse.
 *
 * ⚠️ **LA SECONDE BORNE LE COÛT D'UN JETON VOLÉ.** Trente jours rotatifs, avec
 *    détection de rejeu : chaque usage émet un refresh neuf et révoque l'ancien,
 *    et un ancien qui se représente révoque toute la chaîne. C'est la moitié qui
 *    rend les trente jours acceptables ; sans elle, ils seraient trente jours
 *    d'accès à qui a copié le jeton une fois.
 */

/** Une seconde, en millisecondes. Écrite une fois pour que les calculs se lisent. */
const SECONDE_MS = 1_000;
const MINUTE_MS = 60 * SECONDE_MS;
const HEURE_MS = 60 * MINUTE_MS;
const JOUR_MS = 24 * HEURE_MS;

/** § 19.1 — le jeton d'accès vit UNE HEURE. */
export const DUREE_DU_JETON_DACCES_MS = 1 * HEURE_MS;

/** § 19.1 — le jeton de rafraîchissement vit TRENTE JOURS, et il tourne. */
export const DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS = 30 * JOUR_MS;

/**
 * Un code d'autorisation vit SOIXANTE SECONDES.
 *
 * ⚠️ **LA RFC 6749 (§ 4.1.2) RECOMMANDE « au plus dix minutes ». SOIXANTE
 *    SECONDES EST PLUS COURT, ET C'EST DÉLIBÉRÉ.** Un code d'autorisation est
 *    échangé par un programme, dans la seconde qui suit la redirection : dix
 *    minutes ne servent qu'à un humain qui ferait l'échange à la main. Chaque
 *    minute de plus est une minute pendant laquelle un code intercepté reste
 *    échangeable — et le magasin des demandes en vol vit dans le processus
 *    (`DepotDeDemandes`), où une durée courte borne aussi ce qui s'y accumule.
 */
export const DUREE_DU_CODE_DAUTORISATION_MS = 60 * SECONDE_MS;

/**
 * La durée du jeton d'accès, en SECONDES — la forme qu'`expires_in` exige dans
 * la réponse de `/auth/token` (RFC 6749, § 5.1). **Dérivée, jamais réécrite.**
 */
export const EXPIRES_IN_DU_JETON_DACCES = DUREE_DU_JETON_DACCES_MS / SECONDE_MS;

/**
 * Les trois durées, réunies pour être PARCOURUES par les gardes.
 *
 * ⚠️ Une garde qui nommerait les trois constantes une à une serait muette le
 *    jour où une quatrième s'ajoute. Elle parcourt cette table, et elle ANNONCE
 *    combien de durées elle a lues.
 */
export const DUREES_DE_L_EMETTEUR = [
  { cle: "accès", ms: DUREE_DU_JETON_DACCES_MS, source: "§ 19.1" },
  { cle: "rafraîchissement", ms: DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS, source: "§ 19.1" },
  { cle: "code d'autorisation", ms: DUREE_DU_CODE_DAUTORISATION_MS, source: "RFC 6749 § 4.1.2" },
] as const;

/**
 * `core/identite/` — CE QUE LE SOCLE ÉTABLIT LUI-MÊME SUR UN APPELANT.
 *
 * Un seul sujet en v1 : la SESSION DE PILOTAGE du § 11, sur laquelle toute la
 * garde d'exfiltration du § 20 s'ancre. Voir **ADR 0014**.
 *
 * ⚠️ CE DOSSIER NE CONTIENT AUCUNE AUTHENTIFICATION. Le § 11 est explicite :
 *    « aucune session d'authentification serveur — le jeton porte les droits ».
 *    Ce qui vit ici est un état de PILOTAGE, et le nom du dossier ne doit pas
 *    faire croire autre chose. Les jetons, l'audience et la révocation
 *    appartiennent au transport et à `ops_token`.
 */

export {
  APPELANTS_DE_LA_RELECTURE,
  CLE_ETAPE_SOURCE_DE_SESSION,
  ErreurSessionIdNonSouverain,
  FORME_SESSION_ID,
  FRAPPEURS_DE_SESSION,
  OCTETS_SESSION_ID,
  creerFabriqueSessionId,
} from "./session.js";

export type { FabriqueSessionId, SessionId } from "./session.js";

/**
 * ⚠️ LA FABRIQUE DES TÉMOINS N'EST PAS RÉ-EXPORTÉE ICI, ET C'EST VOULU.
 *
 * `core/identite/fixtures.ts` s'importe par son chemin, en toutes lettres. Un
 * double de test qui arriverait par le même barillet que la fabrique de
 * production serait une ligne d'import indiscernable de l'autre — et la garde
 * G2 de l'ADR 0014, qui lit le graphe d'imports, ne saurait plus dire lequel des
 * deux un module a demandé.
 */

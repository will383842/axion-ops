/**
 * `core/epreuve/outils.ts` — l'outillage COMMUN des épreuves.
 *
 * Rien ici ne fabrique de secret réel ni ne sort de la machine : les épreuves
 * exercent le socle, elles ne l'exploitent pas.
 */

import { creerCalculArgHash, type CalculArgHash } from "../limits/arg-hash.js";

/**
 * Clé HMAC d'épreuve. AUCUN SECRET RÉEL — une chaîne fabriquée pour ce
 * dossier, assez longue pour franchir la longueur minimale exigée par
 * `core/limits/arg-hash.ts`.
 */
const CLE_D_EPREUVE = "cle-hmac-d-epreuve-non-secrete-0123456789abcdef";

/**
 * Le VRAI calcul d'`argHash` du socle, relié à un coffre d'épreuve.
 *
 * On emploie l'implémentation réelle plutôt qu'un doublon : une épreuve qui
 * réécrirait `correspond()` à sa façon mesurerait son propre code, pas celui
 * du socle — et la comparaison à temps constant, qui est justement ce qui
 * garde le jeton de confirmation, ne serait plus exercée du tout.
 */
export const correspondance: CalculArgHash = creerCalculArgHash({
  lireCleArgHash: () => Promise.resolve(CLE_D_EPREUVE),
});

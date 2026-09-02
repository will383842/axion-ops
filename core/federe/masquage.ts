/**
 * `core/federe/masquage.ts` — LE SECOND RIDEAU, ET POURQUOI IL EST VIDE ICI.
 *
 * ⚠️ **CE FICHIER NE MASQUE RIEN, ET C'EST UNE DÉCISION — PAS UN OUBLI.** Il
 *    existe pour que cette décision porte un nom, un compte et une raison, au
 *    lieu d'être un `champsMasques: 0` anonyme que personne ne saurait relire.
 *
 * ═══ CE QUE LE PORT EST, D'APRÈS SON PROPRE CONTRAT ═══
 *
 * `Masquage` (`core/chaine/etapes.ts`) le dit lui-même : « ce port n'est donc
 * PAS la parade principale […] le masquage de l'étape 14 est un SECOND rideau,
 * appliqué à ce que l'adaptateur a déjà rendu. Un adaptateur qui aurait
 * sélectionné trop large a déjà lu la donnée ; le masquage l'empêche
 * d'atteindre le modèle, il ne l'empêche pas d'avoir été lue. »
 *
 * ═══ POURQUOI LE SOCLE NE PEUT PAS LE TENIR EN MODE FÉDÉRÉ ═══
 *
 * Masquer suppose de savoir QUELS champs sont sensibles. Le socle ne connaît
 * aucun métier : c'est sa règle fondatrice. Le manifeste ne déclare pas de
 * champs à masquer — il déclare `idFields` (des identifiants) et `compaction`
 * (ce qui se raccourcit), qui ne disent rien de la sensibilité. Fabriquer ici
 * une liste de noms plausibles (`email`, `telephone`, `nom`…) produirait un
 * rideau qui laisse passer `courriel`, `mobile` ou `patronyme` **tout en
 * annonçant qu'il masque** : le pire des deux mondes, une garde qui rassure
 * sans garder.
 *
 * ═══ QUI MASQUE, ALORS ═══
 *
 * L'adaptateur, qui connaît ses données et son produit. C'est ce que fait celui
 * d'Axion-IA : sans l'habilitation voulue, le nom, l'adresse et jusqu'à la
 * présence d'un CV ne sortent pas de sa couche de lecture — ils ne sont même
 * pas déchiffrés. La sélection est gardée à la source, ce que le § 19 bis
 * appelle la vraie parade.
 *
 * ═══ L'ÉCART QUI RESTE, ÉCRIT PLUTÔT QUE MASQUÉ ═══
 *
 * En mode fédéré, le socle n'a donc **aucun** second rideau. Si l'adaptateur se
 * trompe, rien ne rattrape en aval. Ce que le socle garde, lui : le journal ne
 * porte aucun contenu, l'étape 11 empêche une lecture de ressortir vers un
 * autre domaine, et le plafond d'octets borne ce qui traverse.
 *
 * Pour combler l'écart, il faudrait que le manifeste déclare la sensibilité
 * champ par champ, et que le socle applique cette déclaration selon
 * `ctx.habilitations`. C'est une extension du contrat d'adaptateur (§ 09), donc
 * une décision de commanditaire — pas quelque chose à improviser ici.
 */

import type { Habilitations } from "../types.js";
import type { Masquage, OutilDuCatalogue } from "../chaine/etapes.js";

/**
 * Le compte que ce masquage rend, toujours. Nommé pour qu'une recherche sur
 * « pourquoi zéro » tombe sur ce fichier plutôt que sur un littéral perdu.
 */
export const AUCUN_CHAMP_MASQUE = 0;

/**
 * Le masquage du mode fédéré : il rend la charge INTACTE, et l'assume.
 *
 * Il ne prend ni habilitations ni outil dans son corps — il les reçoit pour
 * satisfaire la signature du port, et le fait de ne PAS s'en servir est
 * précisément ce que ce fichier documente.
 */
export function masquageDelegueALAdaptateur(
  _habilitations: Habilitations,
  _outil: OutilDuCatalogue,
): Masquage {
  return {
    appliquer(charge: unknown): { readonly charge: unknown; readonly champsMasques: number } {
      return { charge, champsMasques: AUCUN_CHAMP_MASQUE };
    },
  };
}

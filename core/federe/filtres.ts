/**
 * `core/federe/filtres.ts` — L'EMPREINTE DES FILTRES (§ 13.1).
 *
 * Le curseur keyset porte `{ lastId, lastSortValue, filtersHash }`, et
 * l'étape 9 refuse un curseur **authentique mais rejoué avec d'autres
 * filtres** : sans cette empreinte, une page 2 demandée avec un filtre changé
 * rendrait une fenêtre silencieusement fausse. Ce fichier calcule l'empreinte
 * que l'étape 9 compare.
 *
 * ═══ POURQUOI UN HMAC, ET PAS UN SHA NU ═══
 *
 * Le curseur voyage jusqu'au client : son `filtersHash` aussi. Un condensat nu
 * de filtres se retrouve par force brute en quelques secondes — l'espace des
 * filtres plausibles est minuscule (quelques statuts, quelques dates). On
 * apprendrait donc ce que quelqu'un a cherché en lisant son curseur. C'est le
 * raisonnement déjà écrit pour `argHash` (`core/limits/arg-hash.ts`), et il
 * vaut mot pour mot ici.
 *
 * ═══ POURQUOI UN DOMAINE PROPRE ═══
 *
 * `DOMAINE_FILTERS_HASH` est distinct de `DOMAINE_ARG_HASH`. Deux usages qui
 * partageraient un domaine permettraient de rejouer l'empreinte de l'un comme
 * celle de l'autre. La séparation de domaine coûte une chaîne ; l'oublier coûte
 * une confusion qu'aucun test ne voit.
 *
 * ⚠️ LA CLÉ EST CELLE DU CURSEUR, pas celle de l'argHash. Le § 13.1 exige une
 *    « clé propre inscrite à la liste de rotation du § 25 » : c'est celle-là.
 *    Elle est relue à CHAQUE appel — un cache servirait l'ancienne clé après une
 *    rotation, et une rotation qui ne tourne pas n'en est pas une.
 */

import { createHmac } from "node:crypto";

import type { CoffreCurseur } from "../chaine/etape-09-curseur.js";
import type { OutilDuCatalogue } from "../chaine/etapes.js";
import { canoniser } from "../adapter-kit/json.js";
import { versValeurJson } from "../adapter-kit/json.js";

/** Le domaine de séparation. Le suffixe `/v1` permet d'en changer sans mélange. */
export const DOMAINE_FILTERS_HASH = "axion-ops/filtersHash/v1";

/** En deçà, la clé n'est pas une clé — même plancher que l'argHash. */
export const LONGUEUR_MINIMALE_CLE = 32;

/** La clé du curseur est absente, vide, ou trop courte pour en être une. */
export class ErreurCleFiltres extends Error {
  public constructor(motif: string) {
    super(
      `Clé d'empreinte des filtres inutilisable (${motif}). Le socle refuse de calculer : ` +
        "une empreinte sans clé se retrouve par force brute, et le curseur dirait alors " +
        "à qui le lit ce que son porteur a cherché. Provisionner la clé du curseur.",
    );
    this.name = "ErreurCleFiltres";
  }
}

/**
 * Cadre les parties avant de les concaténer : chaque partie est préfixée de sa
 * longueur. Sans ce cadrage, `("ab", "c")` et `("a", "bc")` produiraient le
 * même message, donc la même empreinte — une collision fabriquée à la main.
 */
function cadrer(parties: readonly string[]): Buffer {
  const morceaux: Buffer[] = [];
  for (const partie of parties) {
    const octets = Buffer.from(partie, "utf8");
    morceaux.push(Buffer.from(`${String(octets.byteLength)}:`, "utf8"), octets);
  }
  return Buffer.concat(morceaux);
}

/**
 * Le message dont on prend l'empreinte. Exporté pour être confronté en test :
 * il ne contient AUCUN secret, seulement ce qui est déjà connu de l'appelant.
 */
export function messageFiltersHash(nomComplet: string, valide: unknown): Buffer {
  if (nomComplet.trim().length === 0) {
    throw new ErreurCleFiltres("nom d'outil vide — l'empreinte ne serait liée à rien");
  }
  // `canoniser` trie les clés et refuse `undefined` : deux entrées équivalentes
  // rendues dans un autre ordre doivent donner la MÊME empreinte, sinon la
  // page 2 serait refusée pour une raison qui n'est pas un changement de filtre.
  return cadrer([DOMAINE_FILTERS_HASH, nomComplet, canoniser(versValeurJson(valide, nomComplet))]);
}

export interface CalculFiltersHash {
  readonly calculer: (outil: OutilDuCatalogue, valide: unknown) => Promise<string>;
}

/** Relie le calcul à la clé du curseur. */
export function creerCalculFiltersHash(coffre: CoffreCurseur): CalculFiltersHash {
  return {
    async calculer(outil, valide) {
      const nomComplet = `${outil.adapterId}.${outil.name}`;
      // Le message est construit AVANT la lecture de la clé : un nom vide ou une
      // charge non canonisable doivent lever pour ce qu'ils sont, pas pour un
      // défaut de configuration.
      const message = messageFiltersHash(nomComplet, valide);

      const brute = await coffre.lireCleCurseur();
      // Test de VÉRACITÉ, pas `??` : une variable déclarée mais VIDE n'est pas
      // nullish, et servirait de clé.
      const cle = typeof brute === "string" ? brute.trim() : "";
      if (cle.length === 0) throw new ErreurCleFiltres("absente ou vide");
      if (cle.length < LONGUEUR_MINIMALE_CLE) {
        throw new ErreurCleFiltres(
          `${String(cle.length)} caractères pour un plancher de ${String(LONGUEUR_MINIMALE_CLE)}`,
        );
      }

      return createHmac("sha256", cle).update(message).digest("hex");
    },
  };
}

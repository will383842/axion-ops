/**
 * axion-ops — forme canonique d'une charge utile, avant empreinte.
 *
 * ── Pourquoi ce fichier existe ────────────────────────────────────────────
 * `argHash` sert à DEUX choses qui exigent toutes deux le déterminisme :
 *
 *  · § 12, étape 13 — comparer l'argument d'un rejeu à celui de l'appel
 *    d'origine. Si `{"a":1,"b":2}` et `{"b":2,"a":1}` produisaient deux
 *    empreintes, un client qui sérialise ses clés dans un autre ordre verrait
 *    son rejeu légitime refusé en `invalid_input`.
 *  · § 20 — lier un jeton de confirmation à L'APPEL EXACT. Si deux charges
 *    différentes pouvaient produire la même empreinte, le jeton délivré pour
 *    « supprimer le message 12 » vaudrait pour « supprimer le message 99 ».
 *
 * D'où la règle : une seule écriture possible par valeur, et AUCUNE valeur
 * silencieusement transformée.
 *
 * ── Ce qui est refusé, et pourquoi bruyamment ─────────────────────────────
 * `JSON.stringify` écrit `null` pour `NaN`, pour `Infinity` et pour une
 * fonction placée dans un tableau ; il OMET une fonction placée dans un objet.
 * Deux charges différentes y deviennent la même chaîne — exactement la
 * collision contre laquelle les deux usages ci-dessus protègent. Ici, chacun
 * de ces cas lève, avec le CHEMIN du champ fautif : le § 15 exige qu'une
 * erreur dise le champ en cause.
 *
 * L'entrée légitime vient d'un JSON-RPC déjà analysé : elle ne contient que
 * `null`, booléens, nombres finis, chaînes, tableaux et objets simples. Tout
 * le reste est un défaut d'appelant, pas un cas à absorber.
 */

/** Le chemin de la racine dans les messages d'erreur. */
const RACINE = "$";

/** Une valeur que la canonisation refuse de transformer en silence. */
export class ErreurCanonisation extends Error {
  /** Chemin du champ fautif, ex. `$.filtres[2].depuis`. */
  readonly chemin: string;

  constructor(chemin: string, motif: string) {
    super(`Canonisation impossible en « ${chemin} » : ${motif}.`);
    this.name = "ErreurCanonisation";
    this.chemin = chemin;
  }
}

/**
 * Rend la forme canonique d'une valeur JSON : clés d'objet TRIÉES, aucun
 * espace, aucune valeur silencieusement remplacée.
 *
 * 🔴 L'ordre de tri est un CONTRAT : il doit être identique partout et pour
 *    toujours. Un tri qui changerait (par locale, par exemple) rendrait
 *    incomparables toutes les empreintes déjà écrites au journal. On emploie
 *    donc le tri par défaut de `Array.prototype.sort`, qui compare les unités
 *    de code UTF-16 et ne dépend d'aucune locale.
 *
 * @throws {ErreurCanonisation} sur toute valeur non représentable en JSON.
 */
export function canoniser(valeur: unknown): string {
  return ecrire(valeur, RACINE, new Set<object>());
}

function ecrire(valeur: unknown, chemin: string, ancetres: Set<object>): string {
  if (valeur === null) return "null";

  switch (typeof valeur) {
    case "boolean":
      return valeur ? "true" : "false";

    case "number":
      // `NaN` et `±Infinity` deviendraient `null` : deux charges différentes,
      // une seule empreinte.
      if (!Number.isFinite(valeur)) {
        throw new ErreurCanonisation(chemin, `nombre non fini (${String(valeur)})`);
      }
      return JSON.stringify(valeur);

    case "string":
      return JSON.stringify(valeur);

    case "object":
      break;

    case "undefined":
      throw new ErreurCanonisation(chemin, "`undefined` n'est pas une valeur JSON");

    default:
      throw new ErreurCanonisation(chemin, `type « ${typeof valeur} » non représentable en JSON`);
  }

  const objet: object = valeur;

  if (ancetres.has(objet)) {
    throw new ErreurCanonisation(chemin, "cycle de références");
  }
  ancetres.add(objet);

  try {
    if (Array.isArray(objet)) {
      const morceaux = objet.map((element: unknown, index: number) => {
        const cheminElement = `${chemin}[${String(index)}]`;
        // `JSON.stringify([undefined])` rend `[null]` : un trou devient une
        // valeur. Ici c'est un refus.
        if (element === undefined) {
          throw new ErreurCanonisation(cheminElement, "`undefined` dans un tableau");
        }
        return ecrire(element, cheminElement, ancetres);
      });
      return `[${morceaux.join(",")}]`;
    }

    const prototype: unknown = Object.getPrototypeOf(objet);
    if (prototype !== Object.prototype && prototype !== null) {
      // `Date`, `Map`, `Set`, une instance de classe : `JSON.stringify` les
      // écrirait par `toJSON` ou les viderait en `{}`. Les deux sont des
      // transformations silencieuses.
      throw new ErreurCanonisation(
        chemin,
        "objet non simple (une instance de classe, une Date, une Map…) — seuls les objets JSON sont canonisables",
      );
    }

    const dictionnaire = objet as Record<string, unknown>;
    const cles = Object.keys(dictionnaire).sort();
    const morceaux: string[] = [];

    for (const cle of cles) {
      const sousValeur = dictionnaire[cle];
      // `JSON.stringify` omet une propriété `undefined` : on fait de même,
      // c'est la seule omission tolérée, et elle est celle de JSON lui-même.
      if (sousValeur === undefined) continue;
      morceaux.push(`${JSON.stringify(cle)}:${ecrire(sousValeur, `${chemin}.${cle}`, ancetres)}`);
    }

    return `{${morceaux.join(",")}}`;
  } finally {
    ancetres.delete(objet);
  }
}

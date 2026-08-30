/**
 * axion-ops — `core/profiles/canonique.ts`
 *
 * LA MESURE. Rien d'autre.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * § 14, correction 1 : « la garde bloquante porte sur les OCTETS ».
 * `@anthropic-ai/sdk` ne calcule rien en local — `messages.js:113` implémente
 * `countTokens` par un `POST /v1/messages/count_tokens`, un appel HTTP, avec clé
 * et quota. AUCUN TOKENIZER N'EST INSTALLÉ, et ce chantier n'émet aucun appel
 * réseau sortant. Le plafond appliqué est donc en OCTETS UTF-8 du JSON
 * CANONIQUE ; la cible en tokens est calibrée une fois, hors CI, par la mesure
 * M5 et un ADR daté nommant le modèle.
 *
 * ═══ CE QUE « CANONIQUE » VEUT DIRE ICI ═══
 *
 * Une même définition d'outil doit rendre LE MÊME NOMBRE D'OCTETS quels que
 * soient l'ordre d'insertion des clés et le chemin par lequel elle est arrivée
 * (JSON parsé, littéral TypeScript, ligne Postgres). Sans cela, la mesure
 * fluctue sans que rien n'ait changé, et une garde qui fluctue n'est plus une
 * garde : on finit par la desserrer pour qu'elle cesse de crier.
 *
 * Trois règles, et elles suffisent :
 *
 *  1. Les clés d'objet sont triées, par unité de code UTF-16 (l'ordre de
 *     RFC 8785 / JCS), récursivement. Comparaison EXPLICITE, jamais
 *     `localeCompare` : une comparaison sensible à la locale ferait dépendre le
 *     nombre d'octets de la machine qui mesure.
 *  2. L'ORDRE DES TABLEAUX EST CONSERVÉ. Un tableau est une donnée, pas un sac :
 *     `["read", "send"]` et `["send", "read"]` ne sont pas la même déclaration.
 *  3. Aucun blanc de mise en forme.
 *
 * ═══ FAIL-LOUD, PAS FAIL-SILENT ═══
 *
 * `JSON.stringify` ment sur trois cas, EN SILENCE :
 *
 *  · `NaN` et `Infinity` sortent en `null` ;
 *  · une propriété `undefined` disparaît de l'objet ;
 *  · un objet porteur d'un `toJSON` (une `Date`, par exemple) sort sous une
 *    forme que ce fichier ne saurait pas reproduire.
 *
 * Chacun de ces trois cas produit un NOMBRE D'OCTETS QUI N'EST PAS CELUI DE LA
 * DONNÉE — c'est-à-dire une garde verte pour une mauvaise raison. Ils lèvent
 * donc une erreur, avec le CHEMIN de la valeur fautive.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  Erreur dédiée
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une valeur qu'on ne peut pas mesurer honnêtement. Porte le chemin de la
 * valeur fautive : sans lui, « valeur non sérialisable » sur un manifeste de
 * quarante outils n'aide personne.
 */
export class ErreurValeurNonCanonique extends Error {
  public readonly chemin: string;

  public constructor(chemin: string, motif: string) {
    super(`JSON canonique impossible en ${chemin} : ${motif}`);
    this.name = "ErreurValeurNonCanonique";
    this.chemin = chemin;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Sérialisation canonique
// ═════════════════════════════════════════════════════════════════════════════

/** Vrai tableau, en gardant `unknown` — `Array.isArray` seul rendrait `any[]`. */
function estTableau(valeur: unknown): valeur is readonly unknown[] {
  return Array.isArray(valeur);
}

/**
 * Objet SIMPLE : littéral d'objet ou objet sans prototype. Tout le reste —
 * `Date`, `Map`, instance de classe, objet porteur d'un `toJSON` — est refusé,
 * parce que sa forme sérialisée ne serait pas celle que ce fichier mesure.
 */
function estObjetSimple(valeur: object): boolean {
  const proto: unknown = Object.getPrototypeOf(valeur);
  return proto === Object.prototype || proto === null;
}

/** Ordre des clés : unités de code UTF-16, indépendant de la locale. */
function comparerCles(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function serialiser(valeur: unknown, chemin: string): string {
  if (valeur === null) {
    return "null";
  }

  if (valeur === undefined) {
    throw new ErreurValeurNonCanonique(
      chemin,
      "`undefined` — JSON.stringify le ferait disparaître en silence, et le compte d'octets mentirait",
    );
  }

  if (typeof valeur === "string") {
    // `JSON.stringify` d'une chaîne échappe correctement, y compris les
    // demi-paires isolées (ES2019, « well-formed stringify ») : la sortie est
    // toujours encodable en UTF-8.
    return JSON.stringify(valeur);
  }

  if (typeof valeur === "boolean") {
    return valeur ? "true" : "false";
  }

  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) {
      throw new ErreurValeurNonCanonique(
        chemin,
        `nombre non fini (${String(valeur)}) — JSON.stringify le rendrait « null » en silence`,
      );
    }
    return JSON.stringify(valeur);
  }

  if (typeof valeur === "bigint") {
    throw new ErreurValeurNonCanonique(chemin, "`bigint` — JSON ne le représente pas");
  }

  if (typeof valeur === "function" || typeof valeur === "symbol") {
    throw new ErreurValeurNonCanonique(
      chemin,
      `\`${typeof valeur}\` — une définition d'outil SERVIE ne franchit qu'un fil JSON-RPC (§ 09)`,
    );
  }

  if (estTableau(valeur)) {
    // Règle 2 : l'ordre d'un tableau est une donnée. On ne le trie pas.
    const elements = valeur.map((element, index) =>
      serialiser(element, `${chemin}[${String(index)}]`),
    );
    return `[${elements.join(",")}]`;
  }

  // Seul `object` reste possible ici.
  if (!estObjetSimple(valeur)) {
    throw new ErreurValeurNonCanonique(
      chemin,
      "objet non simple (Date, Map, instance de classe, porteur d'un `toJSON`…) — " +
        "sa forme sérialisée ne serait pas celle que ce fichier mesure",
    );
  }

  const entrees = Object.entries(valeur as Record<string, unknown>).sort(([a], [b]) =>
    comparerCles(a, b),
  );

  const paires = entrees.map(([cle, sousValeur]) => {
    // Une propriété `undefined` disparaît chez `JSON.stringify` : ici elle crie.
    const rendu = serialiser(sousValeur, `${chemin}.${cle}`);
    return `${JSON.stringify(cle)}:${rendu}`;
  });

  return `{${paires.join(",")}}`;
}

/**
 * Le JSON CANONIQUE d'une valeur : clés triées récursivement, ordre des
 * tableaux conservé, aucun blanc. Lève `ErreurValeurNonCanonique` sur toute
 * valeur que `JSON.stringify` transformerait en silence.
 *
 * @param racine nom du chemin racine dans les messages d'erreur.
 */
export function jsonCanonique(valeur: unknown, racine = "$"): string {
  return serialiser(valeur, racine);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Mesure en octets
// ═════════════════════════════════════════════════════════════════════════════

const ENCODEUR = new TextEncoder();

/**
 * Longueur en OCTETS UTF-8 — pas en unités de code UTF-16.
 *
 * `"é".length` vaut 1 et `"🙂".length` vaut 2 : `String.length` compte des
 * unités UTF-16, et sous-estime donc systématiquement le poids réel d'un texte
 * accentué. Toutes les descriptions d'outils de ce socle sont en français.
 */
export function octetsUtf8(texte: string): number {
  return ENCODEUR.encode(texte).length;
}

/** Le nombre d'octets UTF-8 du JSON canonique d'une valeur. La mesure du § 14. */
export function octetsCanoniques(valeur: unknown, racine = "$"): number {
  return octetsUtf8(jsonCanonique(valeur, racine));
}

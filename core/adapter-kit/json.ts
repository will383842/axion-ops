/**
 * JSON canonique et empreinte — la base de l'épinglage par SHA (§ 09).
 *
 * ═══ POURQUOI UN JSON « CANONIQUE » ═══
 *
 * Le socle refuse un adaptateur dont le manifeste ne correspond pas au SHA
 * épinglé dans `adapters.lock.json`. Ce refus n'a de valeur que si DEUX
 * exécutions du même adaptateur produisent OCTET POUR OCTET le même texte.
 *
 * `JSON.stringify` ne le garantit pas : il conserve l'ordre d'insertion des
 * clés. Deux constructions du même objet par des chemins différents (un
 * `{...spread}` ici, une affectation là) donnent le même objet et deux textes
 * différents — donc deux SHA différents, donc un refus d'admission qui ne
 * signale AUCUN vrai écart. Une garde qui rougit au hasard finit désarmée.
 *
 * Règles appliquées ici :
 *  · clés d'objet triées par ordre de point de code (`Array.prototype.sort`) ;
 *  · aucun espace ;
 *  · l'ordre des tableaux est SIGNIFIANT et préservé — `profiles` et `tools`
 *    portent leur ordre de déclaration ;
 *  · un nombre non fini ou une valeur `undefined` LÈVE, au lieu de produire
 *    silencieusement `null` comme le fait `JSON.stringify`.
 *
 * Le dernier point compte : `JSON.stringify({ a: NaN })` rend `{"a":null}`.
 * Un `maxBytes` calculé de travers deviendrait `null` sans un mot, et le
 * contrôle 4 du harnais comparerait une sortie à rien.
 */

import { createHash } from "node:crypto";

/** Une valeur représentable en JSON, et rien d'autre. */
export type ValeurJson =
  null | boolean | number | string | readonly ValeurJson[] | { readonly [cle: string]: ValeurJson };

/** Un objet JSON. Forme la plus courante dans ce module. */
export type ObjetJson = { readonly [cle: string]: ValeurJson };

/**
 * Sérialise en JSON canonique.
 *
 * @throws si la valeur porte un nombre non fini, une valeur `undefined`, une
 *         fonction ou un symbole — c'est-à-dire tout ce que `JSON.stringify`
 *         escamoterait en silence.
 */
export function canoniser(valeur: ValeurJson): string {
  if (valeur === null) return "null";

  switch (typeof valeur) {
    case "boolean":
      return valeur ? "true" : "false";
    case "number":
      if (!Number.isFinite(valeur)) {
        throw new Error(
          `JSON canonique : nombre non fini (${String(valeur)}). ` +
            "`JSON.stringify` l'écrirait `null` sans un mot.",
        );
      }
      return JSON.stringify(valeur);
    case "string":
      return JSON.stringify(valeur);
    default:
      break;
  }

  if (Array.isArray(valeur)) {
    return `[${valeur.map(canoniser).join(",")}]`;
  }

  const objet: ObjetJson = valeur as ObjetJson;
  const morceaux: string[] = [];
  for (const cle of Object.keys(objet).sort()) {
    const sousValeur = objet[cle];
    if (sousValeur === undefined) {
      throw new Error(
        `JSON canonique : la clé « ${cle} » porte \`undefined\`. ` +
          "`JSON.stringify` la ferait DISPARAÎTRE du texte, donc du SHA.",
      );
    }
    morceaux.push(`${JSON.stringify(cle)}:${canoniser(sousValeur)}`);
  }
  return `{${morceaux.join(",")}}`;
}

/** Taille en OCTETS UTF-8 — l'unité du budget du § 14, jamais des caractères. */
export function octetsUtf8(texte: string): number {
  return Buffer.byteLength(texte, "utf8");
}

/**
 * Taille en octets UTF-8 du JSON canonique d'une valeur.
 *
 * C'est la mesure du champ `bytes` d'`ops_tool` et du plafond `maxBytes`.
 * § 14, correction 1 : la garde porte sur les OCTETS et non sur les tokens —
 * `@anthropic-ai/sdk` ne calcule rien en local, son `countTokens` est un appel
 * HTTP avec clé et quota, et ce chantier n'émet aucun appel réseau.
 */
export function octetsCanoniques(valeur: ValeurJson): number {
  return octetsUtf8(canoniser(valeur));
}

/** Empreinte SHA-256 d'un texte, préfixée par son algorithme. */
export function empreinteSha256(texte: string): string {
  return `sha256:${createHash("sha256").update(texte, "utf8").digest("hex")}`;
}

/** Forme attendue d'une empreinte : `sha256:` suivi de 64 chiffres hexadécimaux. */
export const MOTIF_EMPREINTE = /^sha256:[0-9a-f]{64}$/;

/** Empreinte du JSON canonique d'une valeur. C'est le `manifestSha` du § 12. */
export function empreinteCanonique(valeur: ValeurJson): string {
  return empreinteSha256(canoniser(valeur));
}

/**
 * Convertit une valeur inconnue en `ValeurJson`, ou lève.
 *
 * Employée à DEUX frontières de méfiance :
 *  · la sortie de `z.toJSONSchema()`, dont le type déclaré n'est pas le nôtre ;
 *  · un manifeste reçu d'un autre dépôt — potentiellement PUBLIC — au registre.
 *
 * Le trajet passe par `JSON.parse(JSON.stringify(...))` NON par commodité, mais
 * pour que tout ce qui ne franchit pas un fil JSON soit éliminé ici plutôt que
 * de ressortir en `undefined` au milieu d'un SHA.
 */
export function versValeurJson(valeur: unknown, ou = "valeur"): ValeurJson {
  // ⚠️ DEUX LECTURES D'UN MÊME DOCUMENT NE DOIVENT JAMAIS DIVERGER.
  //
  // `JSON.stringify` honore un `toJSON()` trouvé N'IMPORTE OÙ SUR LA CHAÎNE DE
  // PROTOTYPES. Les autres lectures du registre — `lireManifesteRecu` (Zod
  // `.strict()`) et `clesDePremierNiveau` (`Object.keys`) — ne voient, elles,
  // que les propriétés PROPRES. Un document dont le prototype porte un
  // `toJSON()` rendant un manifeste BÉNIN, et dont les propriétés propres
  // portent le manifeste HOSTILE, était donc épinglé sous une empreinte qui ne
  // le couvrait pas : le refus n° 1 du § 09 — « le manifeste servi n'est pas
  // celui qu'un humain a relu » — mis hors service, et c'est le seul refus qui
  // protège de tous les autres (outil ajouté, `effect` basculé, `dataClass`
  // élargi).
  //
  // ⚠️ BORNE ÉCRITE AVEC LA MESURE : ce chemin n'était atteignable que si le
  //    manifeste arrivait en objet JavaScript VIVANT — adaptateur hébergé,
  //    pont en-processus, test. Un manifeste venu du fil JSON-RPC est
  //    `JSON.parse`é, donc sans prototype, et cette porte-là était déjà
  //    fermée. Ce qui est établi SANS borne, c'est que deux lectures du même
  //    document coexistaient et pouvaient diverger. On les réconcilie ICI, à
  //    la frontière, une seule fois.
  if (valeur !== null && typeof valeur === "object") {
    const prototype: unknown = Object.getPrototypeOf(valeur);
    if (prototype !== null && prototype !== Object.prototype && !Array.isArray(valeur)) {
      throw new Error(
        `${ou} : l'objet ne descend pas d'Object.prototype. Un prototype étranger peut ` +
          "porter un `toJSON()` que la sérialisation honore et que la validation de forme " +
          "ne voit pas : les deux lectures désigneraient alors des documents différents. " +
          "Présenter un objet simple, ou le faire transiter par `JSON.parse`.",
      );
    }
    if (typeof (valeur as { toJSON?: unknown }).toJSON === "function") {
      throw new Error(
        `${ou} : l'objet porte un toJSON(). La sérialisation l'honorerait, la validation ` +
          "de forme l'ignorerait, et l'empreinte ne couvrirait pas le document réellement lu.",
      );
    }
  }

  let texte: string;
  try {
    texte = JSON.stringify(valeur);
  } catch (erreur) {
    throw new Error(`${ou} : non sérialisable en JSON (cycle, BigInt, ou autre).`, {
      cause: erreur,
    });
  }
  if (texte === undefined) {
    throw new Error(`${ou} : ne produit aucun JSON (\`undefined\`, fonction ou symbole).`);
  }
  return JSON.parse(texte) as ValeurJson;
}

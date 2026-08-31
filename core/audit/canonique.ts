/**
 * `core/audit/canonique.ts` — la sérialisation canonique et l'empreinte.
 *
 * Modèle repris de `axionia/src/lib/knowledge/audit-log.ts` :
 *
 *     selfHash = SHA-256( prevHash ‖ "|" ‖ canonicalStringify(champs couverts) )
 *
 * DEUX ÉCARTS DÉLIBÉRÉS AVEC LE MODÈLE VOISIN, chacun motivé :
 *
 *  1. LES CHAMPS COUVERTS SONT NOMMÉS, ET LEUR LISTE EST GARDÉE. Le voisin
 *     nomme quatre champs dans un objet littéral ; ajouter une colonne sans
 *     l'ajouter à cet objet la laisse hors empreinte, en silence. Ici la liste
 *     est une constante, elle type l'objet, et `derivation.spec.ts` la confronte
 *     aux champs réellement déclarés dans `prisma/schema.prisma`.
 *
 *  2. `canonicalStringify` ÉCHOUE BRUYAMMENT sur ce qu'il ne sait pas
 *     sérialiser. Le voisin fait `JSON.stringify(obj)` sur les non-objets : un
 *     `undefined` en ressort littéralement `undefined`, chaîne non-JSON qui
 *     hache pourtant sans broncher. Un champ passé à `undefined` par erreur
 *     produirait alors une empreinte stable et fausse.
 */

import { createHash } from "node:crypto";

import type { ScelleurJournal } from "./ports.js";
import type { ContenuLigne } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Les champs couverts par l'empreinte
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES SEIZE CHAMPS COUVERTS, DANS L'ORDRE DÉCLARÉ PAR `ops_audit`.
 *
 * L'ordre n'a aucune incidence sur l'empreinte — `canonicalStringify` trie les
 * clés — mais il rend la confrontation au schéma lisible.
 *
 * ⚠️ Ce n'est PAS une liste de confort : un champ absent d'ici n'est pas
 *    couvert, donc il se modifie après coup sans casser la chaîne. La garde de
 *    `derivation.spec.ts` lit `prisma/schema.prisma` et échoue si un champ y
 *    apparaît qui ne soit ni couvert ici ni explicitement exclu ci-dessous.
 */
export const CHAMPS_COUVERTS = [
  "at",
  "principal",
  "sessionId",
  "tool",
  "toolVersion",
  "adapterVersion",
  "effect",
  "policyLevel",
  "decision",
  "stepDenied",
  "argHash",
  "argHashValidated",
  "recordIds",
  "partialSources",
  "durationMs",
  "outcome",
] as const satisfies ReadonlyArray<keyof ContenuLigne>;

export type ChampCouvert = (typeof CHAMPS_COUVERTS)[number];

/**
 * LES TROIS CHAMPS EXCLUS, chacun avec le motif de son exclusion. Une exclusion
 * sans motif est une porte ouverte ; la garde de `derivation.spec.ts` exige que
 * tout champ du schéma soit dans l'une des deux listes.
 *
 *  · `seq`      — attribué par la base À L'INSERTION, donc APRÈS le calcul de
 *                 l'empreinte. Le couvrir obligerait à réserver le numéro
 *                 d'avance. L'ordre reste pourtant infalsifiable : il est porté
 *                 par le chaînage `prevHash`, qui, lui, est couvert par le
 *                 préfixe de l'empreinte.
 *  · `prevHash` — ce n'est pas un champ couvert, c'est le PRÉFIXE de
 *                 l'empreinte. Il entre dans le calcul avant le canonique.
 *  · `selfHash` — c'est le résultat. Se couvrir soi-même n'a pas de sens.
 */
export const CHAMPS_EXCLUS = ["seq", "prevHash", "selfHash"] as const;

export type ChampExclu = (typeof CHAMPS_EXCLUS)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  Sérialisation canonique
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'un canonique sait sérialiser. Tout le reste échoue bruyamment. */
export type JsonValeur =
  string | number | boolean | null | readonly JsonValeur[] | { readonly [cle: string]: JsonValeur };

/** Levée quand une valeur n'est pas sérialisable canoniquement. */
export class ErreurCanonique extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurCanonique";
  }
}

/**
 * Sérialise en JSON canonique : clés TRIÉES, aucun espace, ordre des tableaux
 * préservé.
 *
 * Le tri emploie une comparaison par POINTS DE CODE (`<`), pas
 * `String.localeCompare` comme le voisin : `localeCompare` dépend de l'ICU
 * embarquée dans le Node qui tourne. Deux nœuds, deux tris, deux empreintes
 * pour la même ligne — et une chaîne qui casse à la migration, sans qu'une
 * seule donnée ait bougé.
 */
export function canonicalStringify(valeur: JsonValeur): string {
  if (valeur === null) return "null";
  if (typeof valeur === "string") return JSON.stringify(valeur);
  if (typeof valeur === "boolean") return valeur ? "true" : "false";
  if (typeof valeur === "number") {
    if (!Number.isFinite(valeur)) {
      throw new ErreurCanonique(`nombre non fini dans le canonique : ${String(valeur)}`);
    }
    return JSON.stringify(valeur);
  }
  if (Array.isArray(valeur)) {
    return `[${valeur.map(canonicalStringify).join(",")}]`;
  }
  if (typeof valeur === "object") {
    const entrees = Object.entries(valeur).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const corps = entrees
      .map(([cle, val]) => `${JSON.stringify(cle)}:${canonicalStringify(val)}`)
      .join(",");
    return `{${corps}}`;
  }

  // `undefined`, `bigint`, `symbol`, `function` : le voisin les laissait
  // produire une chaîne non-JSON qui se hachait quand même.
  throw new ErreurCanonique(`type non sérialisable dans le canonique : ${typeof valeur}`);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Empreinte
// ═════════════════════════════════════════════════════════════════════════════

/** SHA-256 hexadécimal minuscule d'une chaîne UTF-8. */
export function sha256Hex(entree: string): string {
  return createHash("sha256").update(entree, "utf8").digest("hex");
}

/**
 * Normalise une valeur de ligne en valeur canonique.
 *
 * Une `Date` devient son ISO-8601 en UTC : deux `Date` égales à la milliseconde
 * près donnent la même chaîne, et le fuseau du processus n'entre pas dans
 * l'empreinte.
 */
function normaliser(valeur: ContenuLigne[ChampCouvert]): JsonValeur {
  if (valeur instanceof Date) {
    const ms = valeur.getTime();
    if (!Number.isFinite(ms)) {
      throw new ErreurCanonique("horodatage invalide dans le canonique");
    }
    return valeur.toISOString();
  }
  // Après le cas `Date`, le seul type-objet restant dans l'union est
  // `readonly string[]` — `recordIds` et `partialSources`. Le narrowing se fait
  // donc sur l'union déclarée, pas sur `Array.isArray`, qui élargirait à `any[]`
  // et rendrait la copie non typée.
  if (typeof valeur === "object" && valeur !== null) return [...valeur];
  return valeur;
}

/**
 * Le sous-ensemble COUVERT d'une ligne, sous forme canonique.
 *
 * Construit PAR PARCOURS de `CHAMPS_COUVERTS` — jamais par un objet littéral
 * recopié à la main : c'est ce parcours qui garantit qu'ajouter un champ à la
 * liste l'ajoute effectivement à l'empreinte.
 */
export function champsCouverts(ligne: ContenuLigne): Record<ChampCouvert, JsonValeur> {
  const couverts: Partial<Record<ChampCouvert, JsonValeur>> = {};
  for (const champ of CHAMPS_COUVERTS) {
    couverts[champ] = normaliser(ligne[champ]);
  }
  return couverts as Record<ChampCouvert, JsonValeur>;
}

/**
 * LE MESSAGE d'une ligne — chaînage compris, AVANT scellement.
 *
 * Le séparateur `|` entre le préfixe et le canonique n'est pas décoratif : sans
 * lui, `prevHash` étant de longueur fixe, la concaténation resterait certes non
 * ambiguë — mais la moindre évolution de format (préfixe tronqué, empreinte
 * d'un autre algorithme) rouvrirait la porte à deux couples différents donnant
 * la même chaîne. Le voisin le pose déjà ; on le garde.
 *
 * ⚠️ IL EST EXPOSÉ À DESSEIN, ET IL NE CONTIENT AUCUN SECRET. C'est ce qui
 *    permet à une garde d'inspecter ce qui est scellé sans connaître la clé —
 *    et de prouver, par exemple, qu'un champ modifié change bien le message.
 */
export function messageDeLigne(prevHash: string | null, ligne: ContenuLigne): string {
  return `${prevHash ?? ""}|${canonicalStringify(champsCouverts(ligne))}`;
}

/**
 * L'empreinte d'une ligne, chaînage compris — SCELLÉE (ADR 0002).
 *
 * ═══ CE QUI A CHANGÉ AU LOT 1b, ET POURQUOI MAINTENANT ═══
 *
 * C'était un SHA-256 NU. Un chaînage par SHA nu ne rend une réécriture visible
 * qu'à la condition que l'attaquant ne puisse pas RECALCULER la chaîne — et
 * n'importe qui peut recalculer un SHA nu. Retirer une tranche puis recalculer
 * chaque empreinte donnait un journal amputé sur lequel `verifierChaine`
 * rendait `valide = true`.
 *
 * Le changement modifie TOUTES les empreintes du journal. Il ne pouvait donc se
 * faire qu'AVANT le premier chaînage réel : aucune base ne tourne, aucune ligne
 * n'existe. Après, il aurait fallu une clôture de rupture et deux régimes de
 * vérification cohabitant dans le même journal.
 *
 * ⚠️ LE SCELLEUR EST LE PREMIER PARAMÈTRE, ET IL EST OBLIGATOIRE. Un paramètre
 *    optionnel avec un repli — une clé par défaut, un SHA nu quand la clé
 *    manque — annulerait toute la protection pour quiconque oublierait de le
 *    passer, et personne ne le verrait. Le compilateur le réclame partout.
 */
export function calculerSelfHash(
  scelleur: ScelleurJournal,
  prevHash: string | null,
  ligne: ContenuLigne,
): string {
  return scelleur.sceller(messageDeLigne(prevHash, ligne));
}

/**
 * `core/adapter-kit/colonne-de-gouvernance.temoin.spec.ts` — LE DERNIER TRONÇON
 * DE LA PROPAGATION DE L'ADR 0016, ET CE QUI RESTE À POSER À CÔTÉ.
 *
 * ═══ LE DÉFAUT, TEL QUE LE LOT 1d L'AVAIT MESURÉ ═══
 *
 * `governanceFields` voyageait du manifeste jusqu'à l'étape 11 **par le TYPE** :
 * `ChampsDeGouvernanceDeclares` (`types.ts`) → manifeste → `OutilDuCatalogue`
 * (`core/chaine/etapes.ts`) → orchestrateur → `cumulerChampsDeGouvernance()`.
 * La couture était complète sur tout le chemin qui EXISTE, et la garde G1 le
 * confirmait — « ADR 0016 · cousue · `cumulerChampsDeGouvernance` → 1 appelant ».
 *
 * **L'écart n'était pas entre deux modules, il était entre le code et la TABLE.**
 * `grep governanceFields prisma/schema.prisma` ne rendait rien. Tant qu'aucune
 * implémentation de `CatalogueOutils` ne lit Prisma — le port n'a aujourd'hui
 * que des doubles en mémoire — personne ne s'en apercevait ; au premier
 * catalogue réel, la déclaration serait arrivée VIDE à l'étape 11, et le § 20
 * n'aurait plus surveillé que ce que le filet au nom retient. Une déclaration
 * perdue en silence sur la seule branche qu'aucune confirmation ne rattrape.
 *
 * ═══ CE QUE CETTE GARDE MESURE, ET POURQUOI ELLE VIT ICI ═══
 *
 * `governanceFields` est ÉCRIT dans le kit : c'est ici qu'un auteur d'adaptateur
 * le déclare. Une garde qui vérifie que ce qu'on laisse déclarer a un endroit où
 * atterrir appartient donc au kit, pas à la chaîne.
 *
 * Elle confronte **deux sources lues sur le disque** — les propriétés
 * d'`OutilDuCatalogue` et de `DefinitionOutil` d'un côté, les colonnes de
 * `model OpsTool` de l'autre — et elle ne prétend PAS que la confrontation soit
 * vide : elle tient un **cliquet daté** de ce qui manque encore.
 *
 * ⚠️ **LE CLIQUET EST CE QUI DISTINGUE UNE DETTE D'UN OUBLI.** Quatre propriétés
 *    n'ont toujours pas de colonne, et ce n'est pas une découverte de relecture :
 *    c'est la mesure de ce test. Elles sont NOMMÉES ci-dessous. Un CINQUIÈME
 *    manque fait rougir immédiatement ; et le jour où l'une des quatre atterrit,
 *    ce test rougit AUSSI — un cliquet qu'on ne resserre pas se périme, et
 *    personne ne le voit se périmer.
 *
 * ⚠️ **CE QU'ELLE NE PROUVE PAS.** Elle lit des NOMS dans deux sources ; elle ne
 *    dit rien du TYPE de la colonne, ni de l'existence d'une migration, ni du
 *    fait qu'un lecteur Prisma remplisse le champ. Une colonne posée sans
 *    lecteur reste une seconde source de vérité — c'est le motif pour lequel le
 *    lot 1d avait refusé de poser celle-ci seule, et il reste vrai pour les
 *    quatre autres.
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUN IDENTIFIANT D'INFRASTRUCTURE.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// ⚠️ ON EMPRUNTE LE LECTEUR DU CONTRÔLE 7, ON N'EN ÉCRIT PAS UN SECOND.
//    `proprietesDInterface` est la lecture des NOMS dont le § 09 dérive ses
//    interdits. En réécrire une ici ferait mesurer à ce fichier son propre code.
import { proprietesDInterface } from "./autorisation.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX SOURCES, LUES SUR LE DISQUE
// ═════════════════════════════════════════════════════════════════════════════

function lire(chemin: string): string {
  return readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), "utf8");
}

const SOURCE_ETAPES = lire("../chaine/etapes.ts");
const SOURCE_BUDGET = lire("../profiles/budget.ts");
const SOURCE_SCHEMA = lire("../../prisma/schema.prisma");

/**
 * LES COLONNES D'UN `model` PRISMA, lues dans le schéma.
 *
 * ⚠️ LA BORNE EST ÉCRITE AVEC LA MESURE : ce n'est pas un analyseur Prisma. Le
 *    motif retient une ligne indentée de deux espaces dont le premier mot est un
 *    identifiant suivi d'un type ; les commentaires `///` sont retirés d'abord,
 *    sans quoi une prose française y serait lue comme une colonne. Un faux rouge
 *    se corrige en une minute ; c'est le faux vert qu'on refuse, et le témoin
 *    négatif ci-dessous le tient.
 */
function colonnesDuModele(schema: string, modele: string): readonly string[] {
  const debut = schema.indexOf(`model ${modele} {`);
  if (debut === -1) return [];
  const fin = schema.indexOf("\n}", debut);
  if (fin === -1) return [];
  const corps = schema.slice(debut, fin).replace(/\/\/\/[^\n]*/gu, "");
  return [...corps.matchAll(/^ {2}([A-Za-z_][\w]*)\s+[A-Za-z[]/gmu)]
    .map((trouve) => trouve[1])
    .filter((nom): nom is string => nom !== undefined);
}

/**
 * CE QU'UN CATALOGUE RÉEL DEVRA REMPLIR : les propriétés d'`OutilDuCatalogue`,
 * union celles de `DefinitionOutil` dont il HÉRITE.
 *
 * ⚠️ L'HÉRITAGE EST LU, PAS SUPPOSÉ. `OutilDuCatalogue extends DefinitionOutil`
 *    et n'en redéclare aucune propriété : ne lire que la première rendrait huit
 *    champs invisibles, et la confrontation serait verte en ne regardant qu'un
 *    tiers du sujet.
 */
function proprietesDuCatalogue(): readonly string[] {
  return [
    ...proprietesDInterface(SOURCE_ETAPES, "OutilDuCatalogue"),
    ...proprietesDInterface(SOURCE_BUDGET, "DefinitionOutil"),
  ].filter((nom, index, toutes) => toutes.indexOf(nom) === index);
}

/**
 * LES PROPRIÉTÉS QUI NE SONT PAS DES COLONNES, ET LE MOTIF DE CHACUNE.
 *
 * ⚠️ CETTE TABLE EST ÉCRITE, ET C'EST DÉLIBÉRÉ — mais elle porte un MOTIF par
 *    entrée, jamais un nom nu. Une propriété qui y entrerait sans motif serait
 *    exactement le geste que ce fichier existe pour empêcher : faire taire la
 *    confrontation au lieu de la satisfaire.
 */
const DERIVEES_JAMAIS_COLONNES: Readonly<Record<string, string>> = {
  retireDeLaListe:
    "§ 13.4 — DÉRIVÉE de `retiredAt` (`retiredAt !== null && retiredAt <= maintenant`), " +
    "jamais l'inverse. Une colonne booléenne en plus de la date ferait deux vérités.",
  adapterVersion:
    "§ 12 — elle vit sur `model OpsAdapter` (`version`) et arrive par la relation. La " +
    "porter aussi sur `ops_tool` ferait diverger la version de l'adaptateur d'avec " +
    "elle-même au premier déploiement partiel.",
};

/** Ce qui MANQUE encore, daté — et qui ne doit ni grandir ni se périmer. */
const SANS_COLONNE_AU_2026_08_31: readonly string[] = [
  "pagination",
  "compaction",
  "maxBytes",
  "idFields",
];

// ═════════════════════════════════════════════════════════════════════════════
//  LES TÉMOINS
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0016 — la déclaration de gouvernance a enfin une colonne où atterrir", () => {
  it("SAIT LIRE : les trois sources sont lues sur le disque, et un nom inventé ne rend rien", () => {
    const colonnes = colonnesDuModele(SOURCE_SCHEMA, "OpsTool");
    const proprietes = proprietesDuCatalogue();
    const inexistant = colonnesDuModele(SOURCE_SCHEMA, "ModeleQuiNExistePas");

    console.log(
      `[ADR 0016 · lecture] ${String(SOURCE_SCHEMA.length)} octet(s) de schéma · ` +
        `${String(colonnes.length)} colonne(s) d'\`ops_tool\` : ${colonnes.join(", ")} · ` +
        `${String(proprietes.length)} propriété(s) de catalogue · ` +
        `témoin négatif : ${String(inexistant.length)}`,
    );

    expect(SOURCE_SCHEMA.length, "le schéma a bien été lu").toBeGreaterThan(10_000);
    expect(colonnes.length, "plancher-témoin : le modèle porte des colonnes").toBeGreaterThan(10);
    expect(proprietes.length, "et le catalogue des propriétés").toBeGreaterThan(10);
    // Sans ce témoin négatif, la fonction pourrait rendre n'importe quoi et
    // toutes les gardes de ce fichier seraient vertes en ne regardant rien.
    expect(inexistant, "un modèle inexistant ne rend aucune colonne").toEqual([]);
    // Et le lecteur ne confond pas la PROSE des commentaires `///` avec une
    // colonne : `governanceFields` en porte vingt lignes.
    expect(colonnes, "aucune prose lue comme colonne").not.toContain("Le");
  });

  it("ATTESTE la colonne `governanceFields` sur `ops_tool` — le dernier tronçon", () => {
    const colonnes = colonnesDuModele(SOURCE_SCHEMA, "OpsTool");
    const declaree = proprietesDuCatalogue().includes("governanceFields");

    console.log(
      `[ADR 0016 · dernier tronçon] déclarée par le catalogue : ${String(declaree)} · ` +
        `portée par \`ops_tool\` : ${String(colonnes.includes("governanceFields"))}`,
    );

    // Les DEUX moitiés : une colonne posée sur un champ que personne ne déclare
    // serait aussi fausse que l'inverse, et se lirait « tout va bien ».
    expect(declaree, "`OutilDuCatalogue` la déclare").toBe(true);
    expect(colonnes, "`model OpsTool` la porte").toContain("governanceFields");
  });

  it("tient le CLIQUET DATÉ des propriétés SANS colonne — et annonce les trois comptes", () => {
    const colonnes = new Set(colonnesDuModele(SOURCE_SCHEMA, "OpsTool"));
    const derivees: string[] = [];
    const portees: string[] = [];
    const sansColonne: string[] = [];

    for (const propriete of proprietesDuCatalogue()) {
      if (colonnes.has(propriete)) portees.push(propriete);
      else if (propriete in DERIVEES_JAMAIS_COLONNES) derivees.push(propriete);
      else sansColonne.push(propriete);
    }

    const nouvelles = sansColonne.filter((nom) => !SANS_COLONNE_AU_2026_08_31.includes(nom));
    const atterries = SANS_COLONNE_AU_2026_08_31.filter((nom) => !sansColonne.includes(nom));

    console.log(
      `[ADR 0016 · cliquet] ${String(portees.length + derivees.length + sansColonne.length)} ` +
        `propriété(s) confrontée(s) · ${String(portees.length)} PORTÉE(s) par une colonne · ` +
        `${String(derivees.length)} DÉRIVÉE(s) avec motif : ${derivees.join(", ")} · ` +
        `${String(sansColonne.length)} SANS colonne : ${sansColonne.join(", ")} · ` +
        `${String(nouvelles.length)} NOUVELLE(s) : ${nouvelles.join(", ") || "aucune"} · ` +
        `${String(atterries.length)} atterrie(s) depuis le 2026-08-31 : ` +
        `${atterries.join(", ") || "aucune"}`,
    );

    // Planchers : ni la confrontation ni le cliquet ne mesurent sur du vide.
    expect(portees.length, "des propriétés ONT bien leur colonne").toBeGreaterThanOrEqual(8);
    expect(SANS_COLONNE_AU_2026_08_31.length, "le cliquet porte bien sa liste").toBe(4);
    // Chaque dérivée porte un MOTIF non vide : un nom nu ferait taire la garde.
    expect(
      derivees.filter((nom) => (DERIVEES_JAMAIS_COLONNES[nom] ?? "").trim() === ""),
      "une dérivée sans motif est un nom qu'on a fait taire",
    ).toEqual([]);

    // L'ATTENTE : le manque ne GRANDIT pas en silence.
    expect(nouvelles, "une cinquième propriété sans colonne ne s'ajoute pas sans un mot").toEqual(
      [],
    );
    // ⚠️ ET L'AUTRE SENS : quand l'une des quatre atterrit — avec sa migration ET
    //    son lecteur, faute de quoi elle serait une seconde source de vérité —,
    //    ce test rougit et il FAUT revenir resserrer le cliquet ici.
    expect(atterries, "le cliquet se resserre quand une colonne atterrit").toEqual([]);
  });

  it("SAIT DIRE NON — sur un schéma fabriqué où la colonne a été retirée", () => {
    // Sans ce témoin, « la colonne est là » ne se distinguerait pas d'un lecteur
    // qui trouverait n'importe quel nom dans n'importe quel texte.
    const fabrique = [
      "model OpsTool {",
      "  id String @id",
      "  /// governanceFields String[] — commenté, donc absent",
      "  profiles String[]",
      "}",
    ].join("\n");

    const colonnes = colonnesDuModele(fabrique, "OpsTool");

    console.log(
      `[ADR 0016 · témoin] ${String(colonnes.length)} colonne(s) lue(s) au schéma fabriqué : ` +
        `${colonnes.join(", ")} · \`governanceFields\` vu : ` +
        `${String(colonnes.includes("governanceFields"))}`,
    );

    expect(colonnes, "les vraies colonnes sont lues").toEqual(["id", "profiles"]);
    // LE POINT : une occurrence en COMMENTAIRE ne compte pas pour une colonne.
    // C'est la forme exacte qu'aurait prise une colonne « posée » sans l'être.
    expect(colonnes, "une colonne commentée n'est pas une colonne").not.toContain(
      "governanceFields",
    );
  });
});

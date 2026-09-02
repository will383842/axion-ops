import { describe, expect, it } from "vitest";

import {
  fichiersLivresDuDepot,
  lireDuDepot,
} from "../../../core/epreuve/perimetre-de-production.js";
import { sansProse } from "../../../core/coutures/verifier.js";

/**
 * **ÉPREUVE — « UN AMORÇAGE AUTOMATIQUE EST IMPOSSIBLE » EST-IL UNE MESURE, OU
 * UNE PHRASE ?**
 *
 * ═══ CE QUE `mandat.ts` PROMET, ET CE QUE CE FICHIER MESURE ═══
 *
 * `mandat.ts` ferme le déclenchement automatique par quatre verrous. Trois se
 * mesurent chez lui, sur des intentions fabriquées. Le quatrième ne se mesure
 * QUE d'ici : **aucun module de production, hors de ce dossier, n'atteint le
 * geste d'amorçage.** Un `import` glissé dans `ops/main.ts` un soir de panne
 * rendrait les trois autres verrous discutables — il suffirait de leur trouver
 * un contournement — alors qu'un chemin d'appel INEXISTANT ne se contourne pas.
 *
 * ═══ CE QUI EST INTERDIT, ET CE QUI NE L'EST PAS — LA DISTINCTION EST LE FOND ═══
 *
 * ⚠️ **CE N'EST PAS LE DOSSIER QUI EST FERMÉ, C'EST LE GESTE.** Une première
 *    écriture de cette garde interdisait tout import du dossier, et elle a
 *    trouvé un « coupable » : `ops/zoho-mail/sondes/commun.ts`, qui importe
 *    la TABLE DES SCOPES d'`autorisation.ts`. C'est exactement ce qu'il faut
 *    faire — le § 27 exige une seule écriture des scopes, et un voisin qui les
 *    retaperait serait le vrai défaut. Interdire cet import aurait poussé à
 *    recopier la liste, c'est-à-dire à fabriquer le mal qu'on prétend éviter.
 *
 * Sont donc gardés **les symboles qui peuvent, à eux seuls, lancer un
 * amorçage** — et les fichiers sont **DÉRIVÉS de ces symboles**, jamais listés.
 * Un `amorcer()` déplacé demain dans un autre fichier reste gardé ; un fichier
 * renommé ne rend pas la garde muette.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** Un import est ici une **FORME
 *    ÉCRITE**. Un `await import(variable)` composé à l'exécution lui échappe.
 *    Elle les compte et les ANNONCE : un chiffre non nul demande une relecture
 *    humaine, il ne rend pas la garde rouge — la faire rougir sur toute
 *    interpolation la rendrait rouge en permanence pour une raison étrangère à
 *    la règle gardée.
 */

/** Le dossier gardé. */
const DOSSIER_DU_BOOTSTRAP = "ops/zoho-mail/bootstrap/";

/**
 * **LES SYMBOLES QUI LANCENT UN AMORÇAGE.** C'est la seule liste de ce fichier,
 * et elle est courte par construction :
 *
 *  · `amorcer` — le geste lui-même ;
 *  · `executerLAmorcage` — le programme, qui l'appelle ;
 *  · `demanderUnMandat` — **la seule porte** par laquelle un mandat naît. Le
 *    garder ferme le contournement le plus tentant : obtenir un mandat ailleurs,
 *    puis appeler `amorcer` avec.
 *
 * Ce qui n'y est PAS, et pour cause : la table des scopes, la lecture d'une
 * réponse de jetons, l'interprétation d'un rappel, les noms de secrets. Aucun
 * ne fait rien tout seul, et les partager est le contraire d'un défaut.
 */
const SYMBOLES_DU_GESTE = ["amorcer", "executerLAmorcage", "demanderUnMandat"] as const;

/** Les modules du dossier gardé. */
function modulesDuBootstrap(chemins: readonly string[]): readonly string[] {
  return chemins.filter((chemin) => chemin.startsWith(DOSSIER_DU_BOOTSTRAP));
}

/** Le fichier exporte-t-il ce symbole ? Lecture de TEXTE, commentaires retirés. */
function exporte(source: string, symbole: string): boolean {
  const code = sansProse(source);
  return new RegExp(
    `\\bexport\\s+(?:async\\s+)?(?:function|const|class)\\s+${symbole}\\b`,
    "u",
  ).test(code);
}

/** Une clause d'import trouvée dans un source : ses liaisons et son spécifieur. */
interface ImportEcrit {
  readonly liaisons: readonly string[];
  readonly specifieur: string;
}

/** Les imports écrits dans un source, commentaires retirés. */
function importsEcrits(source: string): readonly ImportEcrit[] {
  const code = sansProse(source);
  const trouves: ImportEcrit[] = [];

  for (const trouve of code.matchAll(
    /\b(?:import|export)\s+(?:type\s+)?(\{[^}]*\}|[^;{]*?)\s*from\s*["']([^"']+)["']/gu,
  )) {
    const brut = trouve[1] ?? "";
    const specifieur = trouve[2];
    if (specifieur === undefined) continue;
    const liaisons = [...brut.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/gu)].map((m) => m[0]);
    trouves.push({ liaisons, specifieur });
  }
  for (const trouve of code.matchAll(/\b(?:import|require)\s*\(\s*["']([^"']+)["']\s*\)/gu)) {
    const specifieur = trouve[1];
    if (specifieur !== undefined) trouves.push({ liaisons: [], specifieur });
  }
  return trouves;
}

/** Un import dont le spécifieur est composé à l'exécution. Compté, jamais cru. */
function importsComposes(source: string): number {
  return (sansProse(source).match(/\bimport\s*\(\s*[^"')]/gu) ?? []).length;
}

/**
 * Le chemin qu'un `import` relatif désigne, ramené à la racine du dépôt.
 * Rend `null` pour un paquet (`vitest`, `node:http`…).
 */
function cibleDepuisLaRacine(depuis: string, specifieur: string): string | null {
  if (!specifieur.startsWith(".")) return null;
  const dossier = depuis.slice(0, depuis.lastIndexOf("/") + 1);
  const resolu = new URL(specifieur, `file:///${dossier}`).pathname.replace(/^\//u, "");
  // Les imports écrits en `.js` désignent le `.ts` d'à côté (`nodenext`).
  return resolu.endsWith(".js") ? `${resolu.slice(0, -3)}.ts` : resolu;
}

/** Les fichiers qui portent les symboles du geste. DÉRIVÉS, jamais listés. */
function porteursDuGeste(modules: readonly string[]): ReadonlyMap<string, readonly string[]> {
  const porteurs = new Map<string, string[]>();
  for (const symbole of SYMBOLES_DU_GESTE) {
    porteurs.set(
      symbole,
      modules.filter((chemin) => exporte(lireDuDepot(chemin), symbole)),
    );
  }
  return porteurs;
}

describe("épreuve — le geste d'amorçage n'a AUCUN appelant hors de son dossier", () => {
  it("balaie tout le code de production et n'y trouve aucun chemin vers le GESTE", () => {
    const livres = fichiersLivresDuDepot();
    const duBootstrap = modulesDuBootstrap(livres);
    const porteurs = porteursDuGeste(duBootstrap);
    const fichiersDuGeste = new Set([...porteurs.values()].flat());
    const symbolesGardes = new Set<string>(SYMBOLES_DU_GESTE);
    const ailleurs = livres.filter((chemin) => !chemin.startsWith(DOSSIER_DU_BOOTSTRAP));

    const fautifs: { chemin: string; motif: string }[] = [];
    let importsLus = 0;
    let composes = 0;
    let versLeDossier = 0;

    for (const chemin of ailleurs) {
      const source = lireDuDepot(chemin);
      composes += importsComposes(source);
      for (const clause of importsEcrits(source)) {
        importsLus += 1;
        const cible = cibleDepuisLaRacine(chemin, clause.specifieur);
        if (cible !== null && cible.startsWith(DOSSIER_DU_BOOTSTRAP)) versLeDossier += 1;
        if (cible !== null && fichiersDuGeste.has(cible)) {
          fautifs.push({ chemin, motif: `importe le porteur « ${cible} »` });
          continue;
        }
        const liaisonFautive = clause.liaisons.find((liaison) => symbolesGardes.has(liaison));
        if (liaisonFautive !== undefined) {
          fautifs.push({
            chemin,
            motif: `importe le symbole « ${liaisonFautive} » depuis « ${clause.specifieur} »`,
          });
        }
      }
    }

    console.info(
      `[geste-hors-dossier] ${String(livres.length)} module(s) de production · ` +
        `${String(duBootstrap.length)} sous « ${DOSSIER_DU_BOOTSTRAP} » · ` +
        `${String(SYMBOLES_DU_GESTE.length)} symbole(s) du geste gardé(s) ` +
        `[${[...porteurs].map(([s, f]) => `${s} → ${f.join("|") || "AUCUN PORTEUR"}`).join(" · ")}] · ` +
        `${String(fichiersDuGeste.size)} fichier(s) porteur(s) · ` +
        `${String(ailleurs.length)} module(s) balayé(s) ailleurs · ` +
        `${String(importsLus)} import(s) lu(s) · ` +
        `${String(versLeDossier)} import(s) vers le dossier (LÉGITIMES tant qu'ils ne visent ` +
        "pas un porteur : la table des scopes du § 27 a une seule écriture, et ses voisins " +
        "doivent l'importer) · " +
        `${String(composes)} import(s) composé(s) à l'exécution (NON confrontables, comptés) · ` +
        `${String(fautifs.length)} chemin(s) vers le geste ` +
        `[${fautifs.map((f) => `${f.chemin} ${f.motif}`).join(", ") || "aucun"}]`,
    );

    // ── LES PLANCHERS, sans lesquels cette garde serait verte en ne lisant rien
    expect(livres.length).toBeGreaterThanOrEqual(100);
    expect(duBootstrap.length).toBeGreaterThanOrEqual(5);
    expect(ailleurs.length).toBeGreaterThanOrEqual(80);
    expect(importsLus).toBeGreaterThanOrEqual(100);

    // ⚠️ CHAQUE SYMBOLE DU GESTE A EXACTEMENT UN PORTEUR. Sans cette assertion,
    //    un symbole renommé rendrait `fichiersDuGeste` vide, et la garde
    //    deviendrait verte en ne gardant plus rien.
    for (const [symbole, fichiers] of porteurs) {
      expect(fichiers, `porteur(s) du symbole « ${symbole} »`).toHaveLength(1);
    }

    // ── LA RÈGLE
    expect(fautifs).toEqual([]);
  });

  it("SAIT rougir : un module de production fabriqué qui appelle le geste est trouvé", () => {
    // Les témoins sont FABRIQUÉS EN MÉMOIRE, jamais écrits sur le disque : une
    // garde qui mutilerait le dépôt pour se prouver laisserait un jour ses dégâts.
    const fichiersDuGeste = new Set(["ops/zoho-mail/bootstrap/amorcage.ts"]);
    const symbolesGardes = new Set<string>(SYMBOLES_DU_GESTE);

    const temoins: readonly {
      readonly nom: string;
      readonly chemin: string;
      readonly source: string;
    }[] = [
      {
        nom: "repli qui importe le porteur",
        chemin: "ops/repli-en-cas-de-panne.ts",
        source:
          'import { amorcer } from "../ops/zoho-mail/bootstrap/amorcage.js";\n' +
          "export const repli = amorcer;\n",
      },
      {
        nom: "repli qui passe par un ré-export",
        chemin: "ops/repli-detourne.ts",
        source: 'import { demanderUnMandat } from "../core/registry/index.js";\n',
      },
    ];

    let detectes = 0;
    for (const temoin of temoins) {
      const trouve = importsEcrits(temoin.source).some((clause) => {
        const cible = cibleDepuisLaRacine(temoin.chemin, clause.specifieur);
        return (
          (cible !== null && fichiersDuGeste.has(cible)) ||
          clause.liaisons.some((liaison) => symbolesGardes.has(liaison))
        );
      });
      expect(trouve, `témoin « ${temoin.nom} »`).toBe(true);
      detectes += 1;
    }

    // TÉMOIN DE CONTRASTE — celui-ci NE doit PAS être signalé : c'est l'usage
    // légitime que la première écriture de cette garde condamnait à tort.
    const voisinLegitime = {
      chemin: "ops/zoho-mail/sondes/commun.ts",
      source: 'import { SCOPES_DU_CDC } from "../bootstrap/autorisation.js";\n',
    };
    const signale = importsEcrits(voisinLegitime.source).some((clause) => {
      const cible = cibleDepuisLaRacine(voisinLegitime.chemin, clause.specifieur);
      return (
        (cible !== null && fichiersDuGeste.has(cible)) ||
        clause.liaisons.some((liaison) => symbolesGardes.has(liaison))
      );
    });

    console.info(
      `[témoin] ${String(detectes)} module(s) fautif(s) fabriqué(s), ${String(detectes)} ` +
        `détecté(s) · 1 voisin légitime (import de la table des scopes) → signalé : ` +
        `${String(signale)}`,
    );
    expect(detectes).toBe(temoins.length);
    expect(signale).toBe(false);
  });

  it("SAIT rougir : un import écrit dans un COMMENTAIRE n'est pas compté", () => {
    // Sans `sansProse`, ce fichier-ci — qui documente le défaut qu'il garde —
    // serait son propre coupable, et la garde serait rouge pour toujours.
    const source =
      '// import { amorcer } from "../ops/zoho-mail/bootstrap/amorcage.js";\n' +
      '/* import { demanderUnMandat } from "./mandat.js"; */\n' +
      'import { z } from "zod";\n';
    const lus = importsEcrits(source);
    console.info(
      `[prose] ${String(lus.length)} import(s) retenu(s) hors commentaires ` +
        `[${lus.map((l) => l.specifieur).join(", ")}]`,
    );
    expect(lus.map((l) => l.specifieur)).toEqual(["zod"]);
  });
});

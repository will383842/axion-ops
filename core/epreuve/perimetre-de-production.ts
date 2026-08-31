/**
 * `core/epreuve/perimetre-de-production.ts` — **« CE FICHIER EST-IL LIVRÉ ? »,
 * UNE SEULE FOIS POUR TOUT LE DÉPÔT.**
 *
 * ═══ POURQUOI CE MODULE EXISTE ═══
 *
 * Cinq gardes au moins posaient la même question et y répondaient chacune à sa
 * façon : la garde des coutures (ADR 0019), G2 et G3 de l'identité (ADR 0014),
 * les épreuves du lot 2, et la garde de l'appelant unique du cliquet (ADR 0017 +
 * 0021). Cette dernière DÉRIVAIT sa racine de `core/types.ts` — donc `core/`, et
 * `core/` seul — tout en s'intitulant « dans tout le code de production ».
 *
 * Le lot 2 a rendu l'écart coûteux plutôt que théorique : il fait de `ops/` la
 * couche qui SÉQUENCE le socle, et la porte de sept à douze modules livrés, dont
 * la racine de composition. **Aucun n'était regardé.** Un appel au signal d'effet
 * extérieur logé dans `ops/main.ts` n'aurait été vu par personne, et le
 * plancher-témoin de la garde (« plus de cinquante fichiers lus ») était franchi
 * sans peine par un périmètre amputé.
 *
 * ⚠️ **DEUX DÉRIVATIONS D'UN MÊME FAIT FINISSENT PAR SE CONTREDIRE.** Ce module
 *    est la seule ; les gardes l'appellent, et les épreuves qui les mesurent
 *    l'appellent aussi. Une épreuve qui recopierait le périmètre mesurerait sa
 *    propre recopie — ce qui est exactement le défaut que ce fichier ferme.
 *
 * ⚠️ **CE FICHIER N'EST PAS LIVRÉ.** Il vit sous `core/epreuve/`, que
 *    `tsconfig.build.json` exclut. Un module de production qui l'importerait
 *    ferait rougir la garde des coutures — c'est voulu : le périmètre du build
 *    est une question de GARDE, pas de service.
 *
 * ⚠️ **AUCUN SECRET, AUCUN RÉSEAU.** Ce module lit des fichiers du dépôt.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** La racine du dépôt, DÉRIVÉE d'`import.meta.url`. Jamais un chemin en dur. */
export const RACINE_DU_DEPOT = new URL("../../", import.meta.url);

/** Les dossiers de sources du dépôt. Un dossier absent n'est pas une panne. */
export const DOSSIERS_DE_SOURCES = ["core", "ops", "adapters", "console", "voice"] as const;

export function lireDuDepot(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(relatif, RACINE_DU_DEPOT)), "utf8");
}

/**
 * LES MOTIFS D'EXCLUSION, **LUS DANS `tsconfig.build.json`.**
 *
 * ⚠️ Une liste recopiée ici resterait juste jusqu'au jour où le build en ajoute
 *    un — et ce jour-là, les gardes compteraient pour « de production » un
 *    dossier que personne ne livre.
 */
export function motifsDExclusionDuBuild(): readonly string[] {
  const bloc = /"exclude"\s*:\s*\[([^\]]*)\]/u.exec(lireDuDepot("tsconfig.build.json"));
  return bloc === null ? [] : [...(bloc[1] ?? "").matchAll(/"([^"]+)"/gu)].map((t) => t[1] ?? "");
}

/**
 * `pnpm build` ÉMET-IL CE FICHIER ?
 *
 * ⚠️ **LE `*` D'UN MOTIF EST TRAITÉ, PAS IGNORÉ.** Sans cette règle,
 *    `**\/*.spec.ts` se réduirait à « le chemin finit-il par `*.spec.ts` » —
 *    faux pour tous les fichiers du monde — et TOUTES les gardes du dépôt
 *    compteraient pour du code de production.
 *
 * ⚠️ **ET `**\/fixtures.ts` NE COMMENCE PAS PAR `*` UNE FOIS SON PRÉFIXE
 *    RETIRÉ.** Sans la branche qui suit, les fabriques de témoins seraient
 *    comptées pour du code livré — cinq fichiers, mesurés.
 */
export function estLivreParLeBuild(chemin: string, motifs: readonly string[]): boolean {
  if (!chemin.endsWith(".ts")) return false;
  for (const motif of motifs) {
    const nu = motif.startsWith("**/") ? motif.slice(3) : motif;
    if (nu.startsWith("*")) {
      const suffixe = nu.slice(1);
      if (chemin.endsWith(suffixe) && (motif.startsWith("**/") || !chemin.includes("/"))) {
        return false;
      }
      continue;
    }
    if (motif.startsWith("**/")) {
      if (chemin === nu || chemin.endsWith(`/${nu}`)) return false;
      continue;
    }
    if (chemin === motif || chemin.startsWith(`${motif}/`)) return false;
  }
  return true;
}

/** Tous les `.ts` des dossiers de sources, chemin relatif au dépôt. */
export function tousLesFichiersTs(): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (relatif: string): void => {
    let entrees;
    try {
      entrees = readdirSync(fileURLToPath(new URL(relatif, RACINE_DU_DEPOT)), {
        withFileTypes: true,
      });
    } catch {
      return; // Un dossier absent n'est pas une panne : les planchers le diront.
    }
    for (const entree of entrees) {
      const chemin = `${relatif}${entree.name}`;
      if (entree.isDirectory()) parcourir(`${chemin}/`);
      else if (entree.name.endsWith(".ts")) trouves.push(chemin);
    }
  };
  for (const dossier of DOSSIERS_DE_SOURCES) parcourir(`${dossier}/`);
  return trouves;
}

/** Les modules que `pnpm build` émet. C'est LE périmètre « de production ». */
export function fichiersLivresDuDepot(): readonly string[] {
  const motifs = motifsDExclusionDuBuild();
  return tousLesFichiersTs().filter((chemin) => estLivreParLeBuild(chemin, motifs));
}

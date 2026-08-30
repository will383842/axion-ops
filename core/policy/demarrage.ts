/**
 * core/policy/demarrage.ts — LA PROTECTION 4 DU § 20, CÂBLÉE.
 *
 * § 20, protection 4, mot pour mot : « panne, corruption ou REDÉMARRAGE →
 * niveau le plus strict, avec une ligne d'historique `setBy: "boot"`. JAMAIS LE
 * DERNIER NIVEAU CONNU. »
 *
 * POURQUOI CE FICHIER EXISTE. `ligneDeDemarrage()` produisait la bonne ligne
 * depuis le premier jour, et le calcul de `niveauApplique()` la respectait —
 * mais AUCUN code de production ne l'appelait. Une protection dont la fonction
 * existe et que personne n'exécute est une protection qui n'existe pas : le
 * socle qui redémarrait pendant un desserrage de douze heures REPRENAIT au
 * dernier niveau connu, c'est-à-dire exactement ce que le § 20 interdit.
 *
 * ⚠️ CE MODULE NE DÉCIDE DE RIEN. Il écrit une ligne, et il annonce ce qu'elle
 *    a changé. C'est l'ENTRÉE DU CONTENEUR qui doit l'appeler — avant que
 *    `/api/mcp` ne serve son premier appel. Tant qu'aucun orchestrateur de
 *    démarrage n'existe (lot 1), `verifierLeCablageDuDemarrage()` ci-dessous
 *    permet à une garde de mesurer si le raccordement a été fait.
 */

import type { PolicyLevel } from "../types.js";
import type { DepotPolitique } from "./depot.js";
import { ligneDeDemarrage, type LignePolitique } from "./ligne.js";
import { plancherDuScope } from "./niveau.js";

/** Le scope d'une ligne de démarrage : tout. Un repli partiel n'est pas un repli. */
export const SCOPE_DEMARRAGE = "*";

export interface ResultatDemarrage {
  /** La ligne réellement écrite. */
  readonly ligne: LignePolitique;
  /** Le plancher AVANT — ce que le socle aurait servi sans cette ligne. */
  readonly niveauAvant: PolicyLevel;
  /** Le plancher APRÈS. Le plus strict, toujours. */
  readonly niveauApres: PolicyLevel;
  /**
   * Les lignes qui étaient EN VIGUEUR au moment du démarrage et que la ligne
   * `boot` recouvre. Elles ne sont pas supprimées — l'historique du § 20 les
   * garde — mais elles ne décident plus rien tant que la ligne `boot` tient.
   *
   * L'écran doit les montrer : « un desserrage de 12 h était en cours, le socle
   * a redémarré, il est refermé » se lit ici et nulle part ailleurs.
   */
  readonly recouvertes: readonly LignePolitique[];
  /** Combien de lignes ont été examinées. Une garde qui compte zéro est verte
   *  pour la pire des raisons. */
  readonly mesures: number;
}

/**
 * À APPELER AU DÉMARRAGE DU SOCLE, avant de servir le premier appel.
 *
 * Écrit la ligne `setBy: "boot"` du § 20 et rend ce qu'elle a refermé.
 *
 * ⚠️ AUCUNE SUPERSESSION. On ne marque pas `supersededAt` sur les desserrages
 *    en cours : le § 20 veut que le redémarrage REFERME, pas qu'il EFFACE. La
 *    ligne `boot` est `brouillon` sur `*`, et « le plus strict gagne » (§ 12,
 *    règle 1) suffit à la faire l'emporter. Les lignes recouvertes restent
 *    lisibles à l'historique, et un opérateur qui veut vraiment rouvrir repasse
 *    par `desserrer` — second facteur, `ops:policy`, durée bornée.
 */
export async function demarrerPolitique(
  depot: DepotPolitique,
  maintenant: Date,
  motif: string,
  id?: string,
): Promise<ResultatDemarrage> {
  const avant = await depot.lignes();
  const plancherAvant = plancherDuScope(avant, SCOPE_DEMARRAGE, maintenant);

  const ligne =
    id === undefined
      ? ligneDeDemarrage(maintenant, motif)
      : ligneDeDemarrage(maintenant, motif, id);

  // L'état d'APRÈS est DÉRIVÉ, pas relu : une relecture postérieure à
  // l'écriture rouvrirait la fenêtre où la base tombe entre les deux, et le
  // socle annoncerait une panne sur une ligne pourtant committée. Même motif
  // que dans `desserrage.ts`.
  const simulation = [...avant, ligne];
  const plancherApres = plancherDuScope(simulation, SCOPE_DEMARRAGE, maintenant);

  await depot.ajouter(ligne, [], maintenant);

  return {
    ligne,
    niveauAvant: plancherAvant.niveau,
    niveauApres: plancherApres.niveau,
    recouvertes: plancherAvant.dominantes,
    mesures: avant.length,
  };
}

/**
 * LA GARDE DU RACCORDEMENT — dérivée, jamais recopiée.
 *
 * Rend les fichiers de PRODUCTION (hors `*.spec.ts`) qui appellent
 * `demarrerPolitique`. Une garde qui compare ce nombre à zéro rougit tant que
 * l'entrée du conteneur n'a pas été câblée — et elle ANNONCE combien de
 * fichiers elle a lus, pour ne pas être verte sur un balayage vide.
 *
 * ⚠️ BORNE ÉCRITE AVEC LA MESURE : c'est une lecture de TEXTE, pas d'AST. Elle
 *    répond à « quel fichier écrit ce nom », pas à « quel chemin d'exécution
 *    l'atteint réellement ». Un appel derrière un drapeau jamais vrai lui
 *    échapperait.
 */
export interface CablageDuDemarrage {
  readonly fichiersLus: number;
  readonly appelantsDeProduction: readonly string[];
}

export function verifierLeCablageDuDemarrage(
  fichiers: ReadonlyMap<string, string>,
  nomDuPointDEntree = "demarrerPolitique",
): CablageDuDemarrage {
  const appelants: string[] = [];
  for (const [chemin, source] of fichiers) {
    if (chemin.endsWith(".spec.ts")) continue;
    // Le fichier qui DÉCLARE la fonction ne compte pas comme appelant.
    if (chemin.endsWith("demarrage.ts")) continue;
    if (source.includes(`${nomDuPointDEntree}(`)) {
      appelants.push(chemin);
    }
  }
  return { fichiersLus: fichiers.size, appelantsDeProduction: appelants };
}

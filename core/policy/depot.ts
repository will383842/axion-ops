/**
 * core/policy/depot.ts — OÙ VIVENT LES LIGNES DE POLITIQUE.
 *
 * Ce module ne parle pas à PostgreSQL : il DÉCLARE le contrat que la couche
 * d'accès aux données devra tenir, et fournit une implémentation en mémoire
 * pour les gardes. Les six constructeurs travaillent en parallèle — coder
 * contre l'interface, jamais réimplémenter le voisin.
 */

import type { LignePolitique } from "./ligne.js";

/**
 * Le contrat.
 *
 * ⚠️ `ajouter` porte les DEUX écritures dans le MÊME appel — la nouvelle ligne
 *    et le marquage `supersededAt` des lignes qu'elle remplace. Les séparer
 *    ouvrirait une fenêtre pendant laquelle deux lignes contradictoires sont en
 *    vigueur : le calcul rendrait alors le PLUS STRICT des deux, donc un
 *    desserrage sans effet, puis l'effet arriverait « tout seul » quelques
 *    millisecondes plus tard. L'implémentation persistante DOIT être
 *    transactionnelle.
 */
export interface DepotPolitique {
  /** TOUTES les lignes, y compris expirées et remplacées : le TTL s'évalue au
   *  calcul (§ 20, protection 3), jamais à la lecture. */
  lignes(): Promise<readonly LignePolitique[]>;
  ajouter(ligne: LignePolitique, supersederIds: readonly string[], maintenant: Date): Promise<void>;
}

/** Dépôt en mémoire — gardes et amorçage local. Aucune persistance, à dessein. */
export class DepotPolitiqueMemoire implements DepotPolitique {
  private readonly parId = new Map<string, LignePolitique>();

  constructor(initiales: readonly LignePolitique[] = []) {
    for (const ligne of initiales) {
      this.parId.set(ligne.id, ligne);
    }
  }

  lignes(): Promise<readonly LignePolitique[]> {
    return Promise.resolve([...this.parId.values()]);
  }

  ajouter(
    ligne: LignePolitique,
    supersederIds: readonly string[],
    maintenant: Date,
  ): Promise<void> {
    for (const id of supersederIds) {
      const cible = this.parId.get(id);
      if (cible !== undefined && cible.supersededAt === null) {
        this.parId.set(id, { ...cible, supersededAt: maintenant });
      }
    }
    this.parId.set(ligne.id, ligne);
    return Promise.resolve();
  }
}

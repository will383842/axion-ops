/**
 * `core/audit/memoire.ts` — UN `JournalStore` EN MÉMOIRE.
 *
 * ⚠️ CE N'EST PAS UN STORE DE PRODUCTION. Il n'a ni durabilité, ni section
 *    critique répartie, et il vit dans le tas du processus : le § 31 interdit
 *    par ailleurs tout cache de contenu sur disque, ce qui ne l'autorise pas
 *    pour autant à tenir le journal.
 *
 * Il existe pour deux raisons, et deux seulement :
 *
 *  · les gardes de ce module doivent pouvoir FABRIQUER un journal, le mutiler,
 *    et vérifier que la vérification rougit. Un test qui ne peut pas mutiler ne
 *    prouve rien ;
 *  · `core/audit` ne doit connaître ni Prisma ni SQL — la vérification doit
 *    tourner aussi bien sur une archive hors ligne (§ 31, 12 mois archivés) que
 *    sur la base vivante.
 *
 * Il tient la section critique du port par une file d'attente à un seul jeton :
 * `dernierSelfHash` puis `ajouter` ne peuvent pas s'entrelacer. C'est la
 * PROPRIÉTÉ que l'implémentation Prisma devra reproduire, par verrou consultatif
 * ou transaction sérialisable.
 */

import type { JournalStore } from "./ports.js";
import type { LigneAAjouter, LigneAudit, LigneEcrite } from "./vocabulaire.js";

export class JournalMemoire implements JournalStore {
  #lignes: LigneAudit[] = [];
  #prochaineSeq: bigint;

  constructor(premiereSeq = 1n) {
    this.#prochaineSeq = premiereSeq;
  }

  dernierSelfHash(): Promise<string | null> {
    const derniere = this.#lignes[this.#lignes.length - 1];
    return Promise.resolve(derniere?.selfHash ?? null);
  }

  ajouter(ligne: LigneAAjouter): Promise<LigneEcrite> {
    // `selfHash` est UNIQUE en base (§ 12) : le double ici aussi, sans quoi le
    // double en mémoire passerait et le double en production échouerait.
    if (this.#lignes.some((existante) => existante.selfHash === ligne.selfHash)) {
      return Promise.reject(new Error("selfHash déjà présent : contrainte d'unicité violée"));
    }
    const seq = this.#prochaineSeq;
    this.#prochaineSeq += 1n;
    this.#lignes.push({ ...ligne, seq });
    return Promise.resolve({ seq, selfHash: ligne.selfHash });
  }

  lireDepuis(seqDepuis: bigint, limite: number): Promise<readonly LigneAudit[]> {
    // ORDONNÉ PAR `seq`, jamais par `at` (§ 12). Le tri est explicite plutôt
    // qu'implicite dans l'ordre d'insertion : c'est le contrat du port.
    const tranche = this.#lignes
      .filter((ligne) => ligne.seq >= seqDepuis)
      .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0))
      .slice(0, limite);
    return Promise.resolve(tranche);
  }

  /** Toutes les lignes, ordonnées par `seq`. Pour les gardes. */
  toutes(): readonly LigneAudit[] {
    return [...this.#lignes].sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0));
  }

  /** Retire les lignes dont le `seq` est dans l'intervalle, bornes incluses. */
  supprimerIntervalle(seqDepuis: bigint, seqJusqua: bigint): number {
    const avant = this.#lignes.length;
    this.#lignes = this.#lignes.filter((ligne) => ligne.seq < seqDepuis || ligne.seq > seqJusqua);
    return avant - this.#lignes.length;
  }
}

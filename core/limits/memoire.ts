/**
 * `core/limits/memoire.ts` — LES DEUX DOUBLES EN MÉMOIRE DES PORTS DE `core/limits`.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * `DepotQuota` et `DepotIdempotence` sont DÉCLARÉS par ce module et implémentés
 * par la couche de données. Les gardes, elles, ont besoin d'une prise : elles
 * doivent pouvoir faire échouer une compensation, relire l'ordre des appels
 * reçus, ou poser une ligne périmée à la main.
 *
 * Jusqu'ici chaque fichier de garde recopiait la sienne. QUATRE COPIES, mesurées
 * au lot 1 : `limits/quota.spec.ts`, `limits/idempotency.spec.ts`,
 * `limits/limites.spec.ts` et `__tests__/integration.spec.ts`. Ce n'est pas une
 * question d'élégance — les quatre ne se comportaient déjà PAS pareil
 * (`remplacerSiPerimee` rendait `false` sur ligne absente dans trois d'entre
 * elles, et lançait une lecture de plus dans la quatrième), si bien qu'une même
 * règle du § 11 était éprouvée contre quatre contrats légèrement différents.
 * Un double qui dérive du contrat qu'il est censé tenir rend une garde verte
 * pour la mauvaise raison.
 *
 * Les trois autres modules du socle posent déjà leur double dans un fichier
 * ORDINAIRE, pas dans un `.spec.ts` : `core/vault/depot.ts` (`DepotEnMemoire`),
 * `core/policy/depot.ts` (`DepotPolitiqueMemoire`), `core/audit/memoire.ts`
 * (`JournalMemoire`). Celui-ci suit le même motif, et pour la même raison : un
 * double vivant dans un fichier de test n'est importable que par un autre test,
 * et `pnpm build` (`tsconfig.build.json`) exclut les `.spec.ts` — un double
 * exporté depuis un test ne franchirait donc pas la frontière du paquet.
 *
 * ⚠️ CE NE SONT PAS DES IMPLÉMENTATIONS DE PRODUCTION, et l'écart n'est pas
 *    cosmétique : le contrat d'atomicité de `DepotQuota.incrementerSiSousLePlafond`
 *    — « l'incrément et sa condition sont INDISSOCIABLES » — est ici tenu par le
 *    fait qu'aucun de ces appels n'est réellement concurrent, pas par un verrou.
 *    C'est la différence entre un plafond et une suggestion, et elle appartient
 *    à l'implémentation persistante.
 */

import type { DepotIdempotence, LigneIdempotence, StatutIdempotence } from "./idempotency.js";
import type { DemandeIncrement, DepotQuota, EtatCompteur } from "./quota.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le quota
// ═════════════════════════════════════════════════════════════════════════════

/** La clé d'un compteur : la fenêtre, l'outil, le principal (§ 12, `ops_quota`). */
type CleCompteur = Pick<DemandeIncrement, "window" | "tool" | "principal">;

/**
 * Un `DepotQuota` en mémoire, INSPECTABLE.
 *
 * Tout ce qu'il expose au-delà du contrat sert à une garde précise, et rien
 * n'est là « au cas où » :
 *
 *  · `compteurs`, `valeur()`, `totalConsomme` — lire ce qui a été consommé sans
 *    passer par le module mesuré ;
 *  · `increments` / `decrements` — l'ORDRE des écritures, seul moyen de prouver
 *    qu'une compensation a bien suivi le refus qu'elle compense ;
 *  · `compensationCassee` — le chemin d'anomalie du § 26 : une compensation qui
 *    échoue laisse un compteur surévalué, et le socle doit le DIRE plutôt que
 *    de l'avaler.
 */
export class DepotQuotaEnMemoire implements DepotQuota {
  readonly compteurs = new Map<string, number>();

  /** Les clés incrémentées, DANS L'ORDRE. */
  readonly increments: string[] = [];

  /** Les clés décrémentées, DANS L'ORDRE. */
  readonly decrements: string[] = [];

  /**
   * Fait ÉCHOUER la compensation. C'est un chemin de panne à part entière :
   * `consommer` doit alors rendre une anomalie, jamais un succès silencieux.
   */
  compensationCassee = false;

  private static cle(demande: CleCompteur): string {
    return `${demande.window}::${demande.tool}::${demande.principal}`;
  }

  /** La valeur d'un compteur, lue SANS passer par le module mesuré. */
  valeur(demande: CleCompteur): number {
    return this.compteurs.get(DepotQuotaEnMemoire.cle(demande)) ?? 0;
  }

  /** Nombre TOTAL d'unités consommées, toutes fenêtres confondues. */
  get totalConsomme(): number {
    let total = 0;
    for (const valeur of this.compteurs.values()) total += valeur;
    return total;
  }

  incrementerSiSousLePlafond(demande: DemandeIncrement): Promise<EtatCompteur> {
    const cle = DepotQuotaEnMemoire.cle(demande);
    const courant = this.compteurs.get(cle) ?? 0;
    const accepte = courant + 1 <= demande.limit;
    if (accepte) {
      this.compteurs.set(cle, courant + 1);
      this.increments.push(cle);
    }
    return Promise.resolve({
      accepte,
      count: accepte ? courant + 1 : courant,
      limit: demande.limit,
      warnAt: demande.warnAt,
      resetAt: demande.resetAt,
    });
  }

  decrementer(demande: CleCompteur): Promise<void> {
    if (this.compensationCassee) {
      return Promise.reject(new Error("compensation indisponible (témoin)"));
    }
    const cle = DepotQuotaEnMemoire.cle(demande);
    // `Math.max(0, …)` : un compteur ne descend pas sous zéro. Une compensation
    // de trop est un défaut, mais un compteur négatif rendrait ensuite le
    // plafond inopérant — le défaut se paierait deux fois.
    this.compteurs.set(cle, Math.max(0, (this.compteurs.get(cle) ?? 0) - 1));
    this.decrements.push(cle);
    return Promise.resolve();
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'idempotence
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un `DepotIdempotence` en mémoire, qui JOURNALISE L'ORDRE DES APPELS REÇUS.
 *
 * `appels` n'est pas un confort de débogage : le § 11, étape 13, exige que
 * `(tool, key)` soit INSÉRÉ en `in_flight` puis que `argHash` soit comparé —
 * « c'est l'insertion qui verrouille, pas une lecture préalable ». La seule
 * façon de prouver cet ordre depuis l'extérieur est de le voir, et c'est ce que
 * `appels` rend visible : un `lire` avant le premier `insererSiAbsente` est le
 * défaut lui-même.
 */
export class DepotIdempotenceEnMemoire implements DepotIdempotence {
  readonly lignes = new Map<string, LigneIdempotence>();

  /** Les méthodes appelées, DANS L'ORDRE. Voir ci-dessus. */
  readonly appels: string[] = [];

  private static cle(tool: string, key: string): string {
    return `${tool}::${key}`;
  }

  /** Pose une ligne SANS passer par le contrat — pour fabriquer un état de départ. */
  poser(ligne: LigneIdempotence): void {
    this.lignes.set(DepotIdempotenceEnMemoire.cle(ligne.tool, ligne.key), ligne);
  }

  insererSiAbsente(ligne: LigneIdempotence): Promise<boolean> {
    this.appels.push("insererSiAbsente");
    const cle = DepotIdempotenceEnMemoire.cle(ligne.tool, ligne.key);
    if (this.lignes.has(cle)) return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  lire(tool: string, key: string): Promise<LigneIdempotence | null> {
    this.appels.push("lire");
    return Promise.resolve(this.lignes.get(DepotIdempotenceEnMemoire.cle(tool, key)) ?? null);
  }

  remplacerSiPerimee(ligne: LigneIdempotence, maintenant: Date): Promise<boolean> {
    this.appels.push("remplacerSiPerimee");
    const cle = DepotIdempotenceEnMemoire.cle(ligne.tool, ligne.key);
    const existante = this.lignes.get(cle);
    // Ligne absente ⇒ `false`, PAS une insertion : c'est `insererSiAbsente` qui
    // crée, et lui seul. Une reprise qui créerait au passage ferait disparaître
    // la distinction entre « première fois » et « rejeu après expiration ».
    if (existante === undefined) return Promise.resolve(false);
    if (existante.expiresAt.getTime() > maintenant.getTime()) return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  reprendreSiEchouee(ligne: LigneIdempotence): Promise<boolean> {
    this.appels.push("reprendreSiEchouee");
    const cle = DepotIdempotenceEnMemoire.cle(ligne.tool, ligne.key);
    const existante = this.lignes.get(cle);
    if (existante === undefined || existante.status !== "failed") return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  cloturer(params: {
    readonly tool: string;
    readonly key: string;
    readonly status: Extract<StatutIdempotence, "done" | "failed">;
    readonly resultRef: string | null;
    readonly completedAt: Date;
  }): Promise<void> {
    this.appels.push("cloturer");
    const cle = DepotIdempotenceEnMemoire.cle(params.tool, params.key);
    const existante = this.lignes.get(cle);
    // Clôturer une ligne ABSENTE ne crée rien : une clôture sans réservation
    // serait une ligne `done` que personne n'a jamais posée en `in_flight`.
    if (existante !== undefined) {
      this.lignes.set(cle, {
        ...existante,
        status: params.status,
        resultRef: params.resultRef,
        completedAt: params.completedAt,
      });
    }
    return Promise.resolve();
  }
}

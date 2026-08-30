/**
 * axion-ops — étape 12 de la chaîne d'appel : débit et quota.
 *
 * ── Les deux règles que ce fichier porte ──────────────────────────────────
 *  · § 12 — « incrément ATOMIQUE ET CONDITIONNEL » : `count + 1 <= limit` DANS
 *    LA MÊME INSTRUCTION. Lire puis écrire laisse deux appels concurrents
 *    passer tous deux le plafond — et un plafond franchissable à deux n'est
 *    pas un plafond.
 *  · § 12 — « un compteur SANS DÉNOMINATEUR ne peut ni refuser ni alerter à
 *    80 % ». Le dénominateur voyage donc dans la demande d'incrément, il n'est
 *    pas relu ailleurs.
 *
 * ── Ce que ce fichier ne fait PAS ─────────────────────────────────────────
 * Il ne parle à aucune base. Le SQL vit derrière {@link DepotQuota}, dont
 * l'implémentation Prisma appartient à un autre dossier. L'interface est
 * DÉCLARÉE ici, et la condition atomique est écrite dans son contrat pour que
 * l'implémentation ne puisse pas la manquer par distraction.
 */

import type { Effect } from "../types.js";
import { resoudreCompteurs, type CleLimite, type PlanCompteur } from "./config.js";

/** Une demande d'incrément, dénominateur compris. */
export interface DemandeIncrement {
  readonly window: string;
  readonly tool: string;
  readonly principal: string;
  readonly limit: number;
  readonly warnAt: number;
  readonly resetAt: Date;
}

/** L'état du compteur après une tentative d'incrément. */
export interface EtatCompteur {
  /** L'incrément a-t-il eu lieu ? */
  readonly accepte: boolean;
  /**
   * La valeur du compteur : APRÈS l'incrément s'il a eu lieu, la valeur
   * courante sinon. C'est elle qu'on affiche — « 61 / 60 » ne veut rien dire.
   */
  readonly count: number;
  readonly limit: number;
  readonly warnAt: number;
  readonly resetAt: Date;
}

/**
 * CE QUE `core/limits/` ATTEND DE LA COUCHE DE DONNÉES.
 *
 * Interface déclarée ici, implémentée ailleurs (Prisma sur `ops_quota`). Ce
 * module ne réimplémente pas la persistance ; il code contre ce contrat.
 */
export interface DepotQuota {
  /**
   * Incrémente le compteur `(window, tool, principal)` SI ET SEULEMENT SI
   * `count + 1 <= limit`, en UNE SEULE instruction atomique.
   *
   * 🔴 CONTRAT D'IMPLÉMENTATION — deux pièges, tous deux déjà rencontrés :
   *
   *  1. Un `SELECT` suivi d'un `UPDATE` n'est PAS atomique. La forme attendue
   *     est une écriture unique qui porte sa condition, du genre
   *     `INSERT … ON CONFLICT (window, tool, principal) DO UPDATE
   *      SET count = ops_quota.count + 1 WHERE ops_quota.count < EXCLUDED.limit
   *      RETURNING count`, dont l'absence de ligne rendue signifie « refusé ».
   *  2. La ligne doit être CRÉÉE avec `limit`, `warnAt` et `resetAt` de la
   *     demande — un `upsert` qui ne les écrit qu'à la création laisse une
   *     ligne au dénominateur périmé après un changement en console, et le
   *     compteur refuse alors sur l'ancien plafond sans que rien ne le dise.
   */
  incrementerSiSousLePlafond(demande: DemandeIncrement): Promise<EtatCompteur>;

  /**
   * Retire une unité d'un compteur déjà incrémenté — COMPENSATION.
   *
   * Employé quand un compteur ultérieur refuse : les précédents ont déjà
   * consommé une unité pour un appel qui n'aura pas lieu. Sans compensation,
   * un appelant bloqué par la rafale brûlerait tout de même son quota horaire
   * en le réessayant, et se retrouverait puni deux fois d'un seul appel.
   *
   * 🔴 CONTRAT — décrément conditionnel `count > 0`, jamais en dessous de zéro.
   */
  decrementer(cle: Pick<DemandeIncrement, "window" | "tool" | "principal">): Promise<void>;
}

/** Un compteur mesuré : son identité, son dénominateur, sa valeur. */
export interface CompteurMesure {
  readonly cle: CleLimite;
  readonly libelle: string;
  readonly window: string;
  readonly tool: string;
  readonly principal: string;
  readonly count: number;
  readonly limit: number;
  readonly warnAt: number;
  readonly resetAt: Date;
}

/** Le verdict de l'étape 12. */
export type ResultatQuota =
  | {
      readonly accepte: true;
      /** Tous les compteurs incrémentés, dans l'ordre d'évaluation. */
      readonly compteurs: readonly CompteurMesure[];
      /** Ceux qui ont atteint ou franchi leur seuil d'alerte (§ 12, « 80 % »). */
      readonly alertes: readonly CompteurMesure[];
    }
  | {
      readonly accepte: false;
      readonly code: "rate_limited";
      /** Le compteur qui a mordu — celui que le message doit nommer. */
      readonly compteur: CompteurMesure;
      /** § 15 — « dit quand réessayer ». C'est la valeur de `Retry-After`. */
      readonly retryAfterSecondes: number;
      /** Nombre de compteurs déjà incrémentés qui ont été rendus. */
      readonly compensations: number;
      /**
       * Compensations qui ont ÉCHOUÉ. Non vide = des unités fantômes restent
       * décomptées ; c'est un incident à journaliser, pas à taire.
       */
      readonly anomalies: readonly string[];
    };

/** Ce qu'il faut pour consommer le quota d'un appel. */
export interface DemandeConsommation {
  readonly depot: DepotQuota;
  readonly tool: string;
  readonly effect: Effect;
  readonly principal: string;
  readonly limiteOutil: number | null;
  readonly warnAtOutil: number | null;
  readonly maintenant: Date;
}

function mesurer(plan: PlanCompteur, etat: EtatCompteur): CompteurMesure {
  return {
    cle: plan.cle,
    libelle: plan.libelle,
    window: plan.window,
    tool: plan.tool,
    principal: plan.principal,
    count: etat.count,
    limit: etat.limit,
    warnAt: etat.warnAt,
    resetAt: etat.resetAt,
  };
}

/** Secondes à attendre avant que la fenêtre se rouvre, au moins une. */
export function retryAfterSecondes(resetAt: Date, maintenant: Date): number {
  const restant = resetAt.getTime() - maintenant.getTime();
  return Math.max(1, Math.ceil(restant / 1000));
}

/**
 * ÉTAPE 12 — incrémente tous les compteurs applicables, ou n'en laisse aucun
 * incrémenté.
 *
 * ⚠️ LIMITE CONNUE : les incréments ne partagent PAS une transaction. Le socle
 *    compense à la main les compteurs déjà passés quand un suivant refuse, et
 *    rend le nombre de compensations effectuées ainsi que celles qui ont
 *    échoué. C'est plus honnête qu'une transaction implicite qui n'existe pas,
 *    mais moins sûr qu'une vraie : l'implémentation Prisma DEVRAIT envelopper
 *    l'ensemble dans un `$transaction`, ce qui rendrait la compensation morte
 *    plutôt que fausse. Signalé à la Recette (README, écarts).
 */
export async function consommer(demande: DemandeConsommation): Promise<ResultatQuota> {
  const plans = resoudreCompteurs({
    tool: demande.tool,
    effect: demande.effect,
    principal: demande.principal,
    limiteOutil: demande.limiteOutil,
    warnAtOutil: demande.warnAtOutil,
    maintenant: demande.maintenant,
  });

  const incrementes: CompteurMesure[] = [];

  for (const plan of plans) {
    const etat = await demande.depot.incrementerSiSousLePlafond({
      window: plan.window,
      tool: plan.tool,
      principal: plan.principal,
      limit: plan.limit,
      warnAt: plan.warnAt,
      resetAt: plan.resetAt,
    });

    if (etat.accepte) {
      incrementes.push(mesurer(plan, etat));
      continue;
    }

    // Refus : on rend les unités déjà prises, en ordre inverse.
    const anomalies: string[] = [];
    let compensations = 0;
    for (const dejaPris of [...incrementes].reverse()) {
      try {
        await demande.depot.decrementer({
          window: dejaPris.window,
          tool: dejaPris.tool,
          principal: dejaPris.principal,
        });
        compensations += 1;
      } catch (_erreur) {
        // On n'interrompt PAS : un échec de compensation ne doit pas masquer
        // le 429, qui est la réponse juste. Il est rapporté, pas tu.
        anomalies.push(
          `compensation impossible sur le compteur « ${dejaPris.cle} » (${dejaPris.window})`,
        );
      }
    }

    return {
      accepte: false,
      code: "rate_limited",
      compteur: mesurer(plan, etat),
      retryAfterSecondes: retryAfterSecondes(etat.resetAt, demande.maintenant),
      compensations,
      anomalies,
    };
  }

  return {
    accepte: true,
    compteurs: incrementes,
    alertes: incrementes.filter((c) => c.count >= c.warnAt),
  };
}

/**
 * Rend les unités consommées par un appel qui n'aura finalement pas lieu.
 *
 * Employé par `appliquerLimites` quand l'étape 13 refuse : voir le commentaire
 * qui l'accompagne, c'est une DÉCISION du constructeur, pas une règle du CDC.
 *
 * @returns les anomalies rencontrées — vide si tout a été rendu.
 */
export async function rendreCompteurs(
  depot: DepotQuota,
  compteurs: readonly CompteurMesure[],
): Promise<readonly string[]> {
  const anomalies: string[] = [];
  for (const compteur of [...compteurs].reverse()) {
    try {
      await depot.decrementer({
        window: compteur.window,
        tool: compteur.tool,
        principal: compteur.principal,
      });
    } catch (_erreur) {
      anomalies.push(
        `compensation impossible sur le compteur « ${compteur.cle} » (${compteur.window})`,
      );
    }
  }
  return anomalies;
}

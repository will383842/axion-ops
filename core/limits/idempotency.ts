/**
 * axion-ops — étape 13 de la chaîne d'appel : l'idempotence.
 *
 * ── La règle qui commande tout le fichier ─────────────────────────────────
 * § 12, `ops_idempotency` : « une clé réutilisée avec un payload DIFFÉRENT
 * doit rendre `invalid_input`, PAS L'AUTRE RÉSULTAT EN SILENCE. »
 *
 * C'est la raison d'être de la colonne `argHash` dans cette table. Sans cette
 * comparaison, un client qui recycle une clé — une clé constante par session,
 * un compteur remis à zéro au redémarrage — recevrait la réponse d'un AUTRE
 * appel, présentée comme la sienne. Sur un outil d'écriture, il croirait avoir
 * envoyé un message qu'il n'a pas écrit.
 *
 * ── L'ordre des vérifications est un contrat ──────────────────────────────
 *   1. la ligne est-elle PÉRIMÉE ? au-delà du TTL la clé est libre, et un
 *      argument différent y est légitime ;
 *   2. l'`argHash` correspond-il ? → sinon `invalid_input`, AVANT de regarder
 *      le statut. Inverser 2 et 3 sert le résultat mémorisé d'un autre appel
 *      dès que le statut est `done`, ce que la règle interdit nommément ;
 *   3. seulement alors, le statut décide : rejeu servi, conflit, ou reprise.
 *
 * ── C'est l'insertion qui verrouille ──────────────────────────────────────
 * § 11, étape 13 : « `(tool, key)` INSÉRÉ en `in_flight`, `argHash` comparé ».
 * On tente donc l'insertion D'ABORD ; la lecture ne vient qu'en cas de
 * collision. Une lecture préalable suivie d'une insertion laisse deux appels
 * concurrents s'insérer tous deux — la clé primaire `(tool, key)` en refuse un,
 * mais seulement si on la laisse trancher.
 */

import type { CalculArgHash } from "./arg-hash.js";
import { IDEMPOTENCIES, type Idempotency } from "../adapter-kit/types.js";
import { TTL_IDEMPOTENCE_MAX_MS } from "./config.js";

/**
 * § 09 — ce que l'outil DÉCLARE dans son manifeste.
 *
 * · `key`           — rejouable : une clé identique avec le même argument rend
 *   le résultat mémorisé au lieu de refaire l'effet.
 * · `non-rejouable` — la clé est exigée et VERROUILLE, mais un second appel
 *   n'est jamais re-servi : il rend `conflict`.
 * · `n/a`           — l'outil n'a pas d'effet à dédupliquer (une lecture).
 *
 * ⚠️ `non-rejouable` n'est DÉFINI nulle part dans le CDC : le § 09 l'énumère,
 *    aucune section ne dit ce qu'il fait. L'interprétation ci-dessus est celle
 *    de ce module, et elle est signalée en écart. Elle a été choisie parce
 *    qu'elle est la seule qui, en cas d'erreur d'interprétation, échoue du
 *    côté sûr : refuser un rejeu légitime est visible, servir un rejeu qui ne
 *    devait pas l'être ne l'est pas.
 */
/**
 * ⚠️ UNE SEULE DÉCLARATION, RÉEXPORTÉE — PAS UNE SECONDE LISTE.
 *
 * Ces trois valeurs étaient auparavant écrites une deuxième fois ici, mot pour
 * mot, à côté de `IDEMPOTENCIES` dans `core/adapter-kit/types.ts`. Deux listes
 * pour un seul fait : elles s'accordaient, et rien ne les tenait. Le jour où
 * l'une aurait bougé, un manifeste aurait déclaré un mode que `core/limits` ne
 * connaît pas, SANS erreur de compilation — `ModeIdempotence` et `Idempotency`
 * étant deux unions distinctes, la valeur aurait traversé par une simple
 * assignation de chaîne.
 *
 * Le manifeste est la source : c'est l'adaptateur qui DÉCLARE son mode (§ 09),
 * ce module ne fait que l'appliquer.
 */
export const MODES_IDEMPOTENCE = IDEMPOTENCIES;

export type ModeIdempotence = Idempotency;

/**
 * Les trois statuts de `ops_idempotency.status`.
 *
 * ⚠️ Ce tableau reproduit l'énumération Prisma `IdempotencyStatus`. C'est une
 *    seconde source de vérité — inévitable ici : `prisma/schema.prisma`
 *    appartient à la Fondation, le client généré n'est pas garanti présent, et
 *    l'importer coupleraient ce module à la couche de données qu'il est
 *    justement censé ignorer. La garde `idempotency.spec.ts` DÉRIVE
 *    l'énumération du fichier `schema.prisma` lui-même et échoue si les deux
 *    divergent : la duplication existe, elle n'est pas silencieuse.
 */
export const STATUTS_IDEMPOTENCE = ["in_flight", "done", "failed"] as const;

export type StatutIdempotence = (typeof STATUTS_IDEMPOTENCE)[number];

/** Une ligne d'`ops_idempotency`. */
export interface LigneIdempotence {
  readonly tool: string;
  readonly key: string;
  readonly status: StatutIdempotence;
  readonly argHash: string;
  /** Renvoi vers le résultat conservé — JAMAIS le résultat lui-même (§ 31). */
  readonly resultRef: string | null;
  readonly completedAt: Date | null;
  /** Le « TTL chiffré » du § 12, matérialisé. Au-delà, la clé est libre. */
  readonly expiresAt: Date;
}

/**
 * CE QUE `core/limits/` ATTEND DE LA COUCHE DE DONNÉES.
 *
 * Interface déclarée ici, implémentée ailleurs (Prisma sur `ops_idempotency`).
 */
export interface DepotIdempotence {
  /**
   * INSERTION CONDITIONNELLE ATOMIQUE.
   *
   * @returns `true` si la ligne a été insérée, `false` si `(tool, key)`
   *          existait déjà.
   *
   * 🔴 CONTRAT — une seule instruction, du genre `INSERT … ON CONFLICT
   *    (tool, key) DO NOTHING`. Un `findUnique` suivi d'un `create` laisse
   *    passer deux appels concurrents, et le second lèvera au lieu de rendre
   *    `false` — un `conflict` transformé en `internal`.
   */
  insererSiAbsente(ligne: LigneIdempotence): Promise<boolean>;

  lire(tool: string, key: string): Promise<LigneIdempotence | null>;

  /**
   * Remplace une ligne PÉRIMÉE par une nouvelle réservation, atomiquement.
   *
   * @returns `false` si la ligne n'était finalement plus périmée, ou plus là —
   *          auquel cas un autre appel a gagné la course.
   *
   * 🔴 CONTRAT — la condition `expiresAt <= maintenant` doit être DANS
   *    l'instruction d'écriture, pas évaluée avant elle.
   */
  remplacerSiPerimee(ligne: LigneIdempotence, maintenant: Date): Promise<boolean>;

  /**
   * Repasse en `in_flight` une ligne `failed`, atomiquement.
   *
   * @returns `false` si la ligne n'était plus `failed`.
   *
   * 🔴 CONTRAT — condition `status = 'failed'` DANS l'écriture.
   */
  reprendreSiEchouee(ligne: LigneIdempotence): Promise<boolean>;

  /** Clôt une réservation. */
  cloturer(params: {
    readonly tool: string;
    readonly key: string;
    readonly status: Extract<StatutIdempotence, "done" | "failed">;
    readonly resultRef: string | null;
    readonly completedAt: Date;
  }): Promise<void>;
}

/** Le verdict de l'étape 13. */
export type ResultatIdempotence =
  | {
      /** L'outil ne déduplique pas : rien n'a été réservé, l'appel continue. */
      readonly type: "sans-objet";
    }
  | {
      /** La réservation est posée : l'appel peut s'exécuter. */
      readonly type: "reservee";
      readonly ligne: LigneIdempotence;
    }
  | {
      /** Appel identique déjà terminé : on sert le résultat mémorisé. */
      readonly type: "rejeu";
      readonly resultRef: string | null;
      readonly completedAt: Date | null;
    }
  | {
      readonly type: "refus";
      readonly code: "invalid_input" | "conflict";
      /** § 15 — le message dit le champ fautif et ce qu'il faut faire ensuite. */
      readonly detail: string;
    };

/** Ce qu'il faut pour poser une réservation. */
export interface DemandeReservation {
  readonly depot: DepotIdempotence;
  readonly calcul: Pick<CalculArgHash, "correspond">;
  readonly tool: string;
  readonly mode: ModeIdempotence;
  /**
   * § 20 — LA CLÉ VOYAGE DANS `ctx.idempotencyKey`, JAMAIS DANS `input`.
   *
   * C'est structurel ici : ce module ne reçoit jamais `input`, seulement son
   * empreinte. Une clé glissée dans la charge utile ne peut donc pas atteindre
   * cette fonction — et le schéma d'entrée étant `.strict()`, elle est refusée
   * à l'étape 8 comme champ inconnu.
   */
  readonly key: string | null;
  readonly argHash: string;
  readonly ttlMs: number;
  readonly maintenant: Date;
}

function nouvelleLigne(demande: DemandeReservation, key: string): LigneIdempotence {
  return {
    tool: demande.tool,
    key,
    status: "in_flight",
    argHash: demande.argHash,
    resultRef: null,
    completedAt: null,
    expiresAt: new Date(demande.maintenant.getTime() + demande.ttlMs),
  };
}

/**
 * ÉTAPE 13 — pose la réservation, sert le rejeu, ou refuse.
 *
 * @throws jamais : tout refus est rendu, pour que l'invariant de journal du
 *         § 11 (« toute terminaison écrit une ligne ») ait un objet à écrire.
 */
export async function reserver(demande: DemandeReservation): Promise<ResultatIdempotence> {
  if (demande.mode === "n/a") {
    // Une clé fournie à un outil qui ne déduplique pas est IGNORÉE, pas
    // refusée : le § 09 ne l'interdit pas, et refuser casserait un client qui
    // envoie une clé sur tous ses appels par prudence.
    return { type: "sans-objet" };
  }

  // ⚠️ LA DURÉE SE BORNE AVANT DE SERVIR À CALCULER UNE DATE. Un `ttlMs` non
  //    fini produirait une `Invalid Date`, dont le `getTime()` vaut `NaN` : la
  //    comparaison de péremption serait TOUJOURS fausse et la clé resterait
  //    verrouillée pour toujours, en silence. Toutes les autres durées du socle
  //    portent une borne haute explicite (`TTL_CONFIRMATION_MAX_MS`,
  //    `TTL_DESSERRAGE_MAX_MS`) ; celle-ci en porte une aussi.
  if (!Number.isFinite(demande.ttlMs) || demande.ttlMs <= 0) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `Durée de réservation illisible pour « ${demande.tool} » : ${String(demande.ttlMs)} ms. ` +
        "Une durée non finie ou nulle écrirait une date d'expiration que rien " +
        "ne pourrait comparer, et la clé d'idempotence ne se libérerait jamais.",
    };
  }
  if (demande.ttlMs > TTL_IDEMPOTENCE_MAX_MS) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `Durée de réservation ${String(demande.ttlMs)} ms au-delà de la borne haute ` +
        `${String(TTL_IDEMPOTENCE_MAX_MS)} ms pour « ${demande.tool} ». ` +
        "Une réservation qu'aucune péremption ne rattrape est un verrou définitif.",
    };
  }

  const key = demande.key?.trim() ?? "";
  if (key.length === 0) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `L'outil « ${demande.tool} » exige une clé d'idempotence. ` +
        "Elle voyage dans `ctx.idempotencyKey` (en-tête de l'appel), JAMAIS dans " +
        "`input` : le schéma d'entrée est fermé et refuserait le champ.",
    };
  }

  const ligne = nouvelleLigne(demande, key);

  if (await demande.depot.insererSiAbsente(ligne)) {
    return { type: "reservee", ligne };
  }

  const existante = await demande.depot.lire(demande.tool, key);

  if (existante === null) {
    // La ligne a disparu entre l'insertion refusée et la lecture : purge du TTL
    // concurrente. Une SEULE nouvelle tentative — pas de boucle, un dépôt qui
    // refuserait sans cesse ferait tourner l'appel indéfiniment.
    if (await demande.depot.insererSiAbsente(ligne)) {
      return { type: "reservee", ligne };
    }
    return {
      type: "refus",
      code: "conflict",
      detail:
        "La réservation d'idempotence a changé sous l'appel (purge concurrente). " +
        "L'état a changé depuis la lecture : relire, puis rejouer avec la même clé.",
    };
  }

  // 1 · Périmée ? Au-delà du TTL, la clé est LIBRE — y compris pour un autre
  //     argument. C'est la borne de la règle « même clé, autre argument =
  //     invalid_input » : elle ne vaut que dans la fenêtre du TTL.
  if (existante.expiresAt.getTime() <= demande.maintenant.getTime()) {
    if (await demande.depot.remplacerSiPerimee(ligne, demande.maintenant)) {
      return { type: "reservee", ligne };
    }
    return {
      type: "refus",
      code: "conflict",
      detail:
        "Une autre requête a repris cette clé d'idempotence au même instant. " +
        "L'état a changé depuis la lecture : réessayer.",
    };
  }

  // 2 · L'argument correspond-il ? AVANT le statut, toujours.
  if (!demande.calcul.correspond(existante.argHash, demande.argHash)) {
    return {
      type: "refus",
      code: "invalid_input",
      detail:
        `La clé d'idempotence « ${key} » a déjà servi sur « ${demande.tool} » ` +
        "avec un ARGUMENT DIFFÉRENT. Le socle refuse plutôt que de servir en " +
        "silence le résultat de l'autre appel. Attendu : le même argument, ou " +
        "une clé neuve.",
    };
  }

  // 3 · Même argument : le statut décide.
  switch (existante.status) {
    case "done":
      if (demande.mode === "non-rejouable") {
        return {
          type: "refus",
          code: "conflict",
          detail:
            `L'outil « ${demande.tool} » est déclaré non rejouable : son effet a ` +
            "déjà eu lieu sous cette clé et ne sera pas re-servi. Employer une " +
            "clé neuve pour un nouvel effet.",
        };
      }
      return {
        type: "rejeu",
        resultRef: existante.resultRef,
        completedAt: existante.completedAt,
      };

    case "in_flight":
      return {
        type: "refus",
        code: "conflict",
        detail:
          "Un appel identique est EN COURS sous cette clé. L'état change en ce " +
          "moment : attendre son issue, puis rejouer la même clé pour en obtenir " +
          "le résultat.",
      };

    case "failed":
      if (await demande.depot.reprendreSiEchouee(ligne)) {
        return { type: "reservee", ligne };
      }
      return {
        type: "refus",
        code: "conflict",
        detail:
          "La réservation a changé d'état pendant la reprise. L'état a changé " +
          "depuis la lecture : relire, puis rejouer.",
      };
  }
}

/**
 * Clôt une réservation posée par {@link reserver}.
 *
 * Appelée par l'orchestrateur APRÈS l'exécution (étape 14), en succès comme en
 * échec. Une réservation laissée en `in_flight` bloque la clé jusqu'au TTL :
 * c'est le comportement voulu en cas de panne du processus, pas en cas d'échec
 * connu.
 */
export async function cloturer(params: {
  readonly depot: DepotIdempotence;
  readonly reservation: ResultatIdempotence;
  readonly issue: "done" | "failed";
  readonly resultRef: string | null;
  readonly maintenant: Date;
}): Promise<boolean> {
  if (params.reservation.type !== "reservee") return false;
  await params.depot.cloturer({
    tool: params.reservation.ligne.tool,
    key: params.reservation.ligne.key,
    status: params.issue,
    resultRef: params.resultRef,
    completedAt: params.maintenant,
  });
  return true;
}

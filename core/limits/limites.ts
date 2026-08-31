/**
 * axion-ops — l'ORDRE des étapes 8, 12 et 13, rendu structurel.
 *
 * ── La règle du § 11, mot pour mot ────────────────────────────────────────
 * « LE SCHÉMA AVANT LE QUOTA. Un appel malformé ne consomme rien. L'ordre
 *   inverse produit une boucle : le quota brûle, le 429 dit “quand réessayer”,
 *   le modèle attend et rejoue le même appel invalide. »
 *
 * ── Pourquoi cette fonction existe ────────────────────────────────────────
 * L'ordre est ici la seule chose qui protège du défaut, et un ordre n'est
 * qu'une CONVENTION tant qu'il vit dans trois appels successifs qu'un
 * refactoring peut réordonner sans qu'aucun type ne bronche. La v5 du cahier
 * des charges avait précisément ces deux étapes dans le mauvais ordre.
 *
 * D'où le choix : `appliquerLimites` ne reçoit PAS un input déjà validé, elle
 * reçoit le VALIDATEUR et l'exécute elle-même, en premier. Le dépôt de quota
 * n'est atteignable qu'après le `return` du refus. Inverser l'ordre demande
 * alors de réécrire la fonction, pas de déplacer une ligne — et la garde
 * `limites.spec.ts` mesure le compteur avant et après.
 *
 * ── Ce que la fonction rend ───────────────────────────────────────────────
 * Toujours un résultat, jamais une exception pour un refus : le § 11 fait du
 * journal un INVARIANT DE SORTIE — « toute terminaison, y compris chaque
 * refus, écrit une ligne portant le numéro de l'étape qui a refusé ». Chaque
 * membre de l'union porte donc son `etape`, qui est le `stepDenied` à écrire.
 */

import type { AppelStep, Effect, ErrorCode } from "../types.js";
import type { CalculArgHash } from "./arg-hash.js";
import {
  cloturer,
  reserver,
  type DepotIdempotence,
  type ModeIdempotence,
  type ResultatIdempotence,
} from "./idempotency.js";
import { consommer, rendreCompteurs, type CompteurMesure, type DepotQuota } from "./quota.js";

/** Ce que rend l'étape 8. Union fermée : pas de booléen à interpréter. */
export type ResultatValidation<T> =
  | { readonly ok: true; readonly valeur: T }
  | {
      readonly ok: false;
      /** § 15 — « dit le champ fautif ». */
      readonly champ: string;
      /** § 15 — « et la valeur attendue ». */
      readonly attendu: string;
    };

/** Tout ce dont l'étage limites a besoin pour un appel. */
export interface ParametresLimites<T> {
  readonly tool: string;
  readonly effect: Effect;
  /** § 09 — déclaré par l'outil dans son manifeste. */
  readonly modeIdempotence: ModeIdempotence;
  readonly principal: string;
  /**
   * § 20 — LA CLÉ BRUTE, venue de l'EN-TÊTE de l'appel, JAMAIS d'`input`.
   *
   * ⚠️ **ELLE NE VIENT PLUS DE `ctx` — ADR 0020.** `ToolContext` ne porte plus la
   *    clé mais son empreinte (`idempotencyRef`) : cet étage-ci est, avec
   *    l'orchestrateur qui le nourrit, l'un des deux derniers endroits du socle
   *    où la chaîne d'origine existe. `reserver()` en confronte la FORME, puis
   *    n'écrit que l'empreinte dans `ops_idempotency`.
   */
  readonly idempotencyKey: string | null;
  /** La charge utile BRUTE, non encore validée. */
  readonly input: unknown;
  /** ÉTAPE 8 — exécutée AVANT tout décompte. */
  readonly validerEntree: (input: unknown) => ResultatValidation<T>;
  readonly calcul: CalculArgHash;
  readonly depotQuota: DepotQuota;
  readonly depotIdempotence: DepotIdempotence;
  /** `ops_tool.limit`, ou `null` pour la limite de départ du § 26. */
  readonly limiteOutil: number | null;
  /** `ops_tool.warnAt`, ou `null` pour 80 % du dénominateur retenu. */
  readonly warnAtOutil: number | null;
  readonly ttlIdempotenceMs: number;
  readonly maintenant: Date;
  /**
   * LA COUTURE DU § 11 — les étapes 9, 10 et 11 s'exécutent ICI.
   *
   * ⚠️ POURQUOI CE CROCHET EXISTE, ET POURQUOI IL EST OBLIGATOIRE DE S'EN
   *    SERVIR. Cette fonction porte les étapes 8, 12 et 13. Le § 11 place
   *    ENTRE elles les étapes 9 (curseur signé), 10 (politique) et 11
   *    (provenance). Sans couture, la seule composition que la signature rende
   *    naturelle — appeler `appliquerLimites`, PUIS `deciderEtape10` — consomme
   *    le quota d'un appel que la politique va refuser. C'est mot pour mot la
   *    boucle que le § 11 décrit pour l'étape 8 : « le quota brûle, le 429 dit
   *    quand réessayer, le modèle attend et rejoue ». Le module qui a rendu
   *    l'ordre structurel rendait impossible l'ordre complet.
   *
   *    Le crochet reçoit la valeur VALIDÉE et son `argHash` — donc l'appelant
   *    n'a PAS à rejouer l'étape 8 pour obtenir l'empreinte dont l'étape 10 a
   *    besoin. Le schéma n'est plus évalué qu'une fois par appel.
   *
   *    Un retour non nul court-circuite AVANT tout incrément de quota et avant
   *    toute réservation.
   *
   * ⚠️ CE CHAMP EST OBLIGATOIRE, ET C'EST LA GARDE. Facultatif, il laissait la
   *    composition naïve compiler sans un mot — et une garde qu'on peut ne pas
   *    appeler n'existe pas. Obligatoire, le compilateur exige de chaque
   *    appelant qu'il DISE ce qui se passe entre le schéma et le quota. Un
   *    appel qui n'a réellement rien à y faire écrit `() => null` : une
   *    décision de trois caractères, écrite noir sur blanc, plutôt qu'un oubli
   *    muet.
   */
  readonly entreSchemaEtQuota: (
    valide: T,
    argHash: string,
  ) => Promise<RefusIntercalaire | null> | RefusIntercalaire | null;
}

/**
 * Un refus prononcé par les étapes 9, 10 ou 11 — celles qui vivent dans la
 * couture. `etape` est le `stepDenied` du § 11, et il est resserré sur les
 * trois seules valeurs possibles : un crochet qui rendrait 8, 12 ou 13
 * usurperait le refus d'une étape que ce module porte lui-même.
 */
export interface RefusIntercalaire {
  readonly etape: 9 | 10 | 11;
  readonly code: ErrorCode;
  readonly detail?: string;
}

/**
 * Le verdict de l'étage limites. `etape` est le `stepDenied` du § 11 pour un
 * refus, et l'étape atteinte pour un succès.
 */
export type ResultatLimites<T> =
  | {
      readonly etape: 8;
      readonly ok: false;
      readonly code: "invalid_input";
      readonly champ: string;
      readonly attendu: string;
      /** Toujours `false` — c'est la règle même du § 11. */
      readonly quotaConsomme: false;
    }
  | {
      readonly etape: 9 | 10 | 11;
      readonly ok: false;
      readonly code: ErrorCode;
      readonly detail?: string;
      /** L'empreinte de la valeur VALIDÉE — celle à laquelle le § 20 lie son
       *  jeton de confirmation, et celle que le journal doit inscrire. */
      readonly argHash: string;
      /** Toujours `false` : la couture s'exécute AVANT l'étape 12. */
      readonly quotaConsomme: false;
    }
  | {
      readonly etape: 12;
      readonly ok: false;
      readonly code: "rate_limited";
      readonly compteur: CompteurMesure;
      readonly retryAfterSecondes: number;
      readonly argHash: string;
      readonly anomalies: readonly string[];
    }
  | {
      readonly etape: 13;
      readonly ok: false;
      readonly code: "invalid_input" | "conflict";
      readonly detail: string;
      readonly argHash: string;
      /** Les unités de quota ont-elles été rendues ? Voir la note ci-dessous. */
      readonly quotaRendu: boolean;
      readonly anomalies: readonly string[];
    }
  | {
      readonly etape: 13;
      readonly ok: true;
      readonly rejeu: true;
      readonly resultRef: string | null;
      readonly argHash: string;
      readonly compteurs: readonly CompteurMesure[];
      readonly alertes: readonly CompteurMesure[];
    }
  | {
      readonly etape: 14;
      readonly ok: true;
      readonly rejeu: false;
      readonly entree: T;
      readonly argHash: string;
      readonly reservation: ResultatIdempotence;
      readonly compteurs: readonly CompteurMesure[];
      readonly alertes: readonly CompteurMesure[];
    };

/** Les numéros d'étape que cet étage peut inscrire dans `stepDenied`. */
export const ETAPES_LIMITES: readonly AppelStep[] = [8, 12, 13];

/**
 * ÉTAPES 8 → 12 → 13, dans cet ordre et pas un autre.
 *
 * ⚠️ DÉCISION DU CONSTRUCTEUR, signalée en écart : quand l'étape 13 refuse en
 *    `invalid_input` (clé réutilisée avec un autre argument), les unités de
 *    quota prises à l'étape 12 sont RENDUES. Le § 11 n'énonce l'exemption que
 *    pour l'étape 8 ; mais le MOTIF qu'il en donne — « le quota brûle, le 429
 *    dit quand réessayer, le modèle attend et rejoue le même appel invalide » —
 *    vaut mot pour mot ici : un client dont la clé est mal gérée rejouera, et
 *    brûlera son quota horaire sur des appels dont aucun n'a d'effet. Un
 *    `conflict`, lui, N'EST PAS rendu : il désigne un appel légitime arrivé
 *    trop tôt, qui a bien occupé le socle.
 */
export async function appliquerLimites<T>(
  parametres: ParametresLimites<T>,
): Promise<ResultatLimites<T>> {
  // ───────────────────────────────────────────────────────────────────────
  //  ÉTAPE 8 — le schéma. AUCUN dépôt n'est touché avant ce `return`.
  // ───────────────────────────────────────────────────────────────────────
  const validation = parametres.validerEntree(parametres.input);
  if (!validation.ok) {
    return {
      etape: 8,
      ok: false,
      code: "invalid_input",
      champ: validation.champ,
      attendu: validation.attendu,
      quotaConsomme: false,
    };
  }

  // L'empreinte porte sur la valeur VALIDÉE, pas sur la charge brute : c'est
  // elle que le handler recevra, et c'est donc elle que le jeton de
  // confirmation du § 20 doit lier. Le schéma étant fermé (`.strict()`), la
  // validation n'ôte rien — elle ne fait que garantir la forme.
  const argHash = await parametres.calcul.calculer(parametres.tool, validation.valeur);

  // ───────────────────────────────────────────────────────────────────────
  //  ÉTAPES 9, 10 et 11 — LA COUTURE, avant que rien ne soit décompté.
  // ───────────────────────────────────────────────────────────────────────
  const intercalaire = await parametres.entreSchemaEtQuota(validation.valeur, argHash);
  if (intercalaire !== null) {
    return {
      etape: intercalaire.etape,
      ok: false,
      code: intercalaire.code,
      ...(intercalaire.detail === undefined ? {} : { detail: intercalaire.detail }),
      argHash,
      quotaConsomme: false,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  //  ÉTAPE 12 — débit et quota.
  // ───────────────────────────────────────────────────────────────────────
  const quota = await consommer({
    depot: parametres.depotQuota,
    tool: parametres.tool,
    effect: parametres.effect,
    principal: parametres.principal,
    limiteOutil: parametres.limiteOutil,
    warnAtOutil: parametres.warnAtOutil,
    maintenant: parametres.maintenant,
  });

  if (!quota.accepte) {
    return {
      etape: 12,
      ok: false,
      code: "rate_limited",
      compteur: quota.compteur,
      retryAfterSecondes: quota.retryAfterSecondes,
      argHash,
      anomalies: quota.anomalies,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  //  ÉTAPE 13 — idempotence.
  // ───────────────────────────────────────────────────────────────────────
  const reservation = await reserver({
    depot: parametres.depotIdempotence,
    calcul: parametres.calcul,
    tool: parametres.tool,
    mode: parametres.modeIdempotence,
    key: parametres.idempotencyKey,
    argHash,
    ttlMs: parametres.ttlIdempotenceMs,
    maintenant: parametres.maintenant,
  });

  if (reservation.type === "refus") {
    const rendre = reservation.code === "invalid_input";
    const anomalies = rendre ? await rendreCompteurs(parametres.depotQuota, quota.compteurs) : [];
    return {
      etape: 13,
      ok: false,
      code: reservation.code,
      detail: reservation.detail,
      argHash,
      quotaRendu: rendre,
      anomalies,
    };
  }

  if (reservation.type === "rejeu") {
    return {
      etape: 13,
      ok: true,
      rejeu: true,
      resultRef: reservation.resultRef,
      argHash,
      compteurs: quota.compteurs,
      alertes: quota.alertes,
    };
  }

  return {
    etape: 14,
    ok: true,
    rejeu: false,
    entree: validation.valeur,
    argHash,
    reservation,
    compteurs: quota.compteurs,
    alertes: quota.alertes,
  };
}

/**
 * Clôt la réservation posée par un appel accepté.
 *
 * À appeler par l'orchestrateur après l'exécution (étape 14), en succès comme
 * en échec. Sans objet quand rien n'a été réservé.
 */
export async function cloturerLimites<T>(params: {
  readonly depotIdempotence: DepotIdempotence;
  readonly resultat: ResultatLimites<T>;
  readonly issue: "done" | "failed";
  readonly resultRef: string | null;
  readonly maintenant: Date;
}): Promise<boolean> {
  const { resultat } = params;
  if (!resultat.ok || resultat.etape !== 14) return false;
  return cloturer({
    depot: params.depotIdempotence,
    reservation: resultat.reservation,
    issue: params.issue,
    resultRef: params.resultRef,
    maintenant: params.maintenant,
  });
}

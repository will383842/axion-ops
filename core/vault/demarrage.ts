/**
 * core/vault/demarrage.ts — CE QUE L'ÉTAT DU COFFRE DÉCIDE AU DÉMARRAGE.
 *
 * § 23, le défaut bloquant n°12 du CDC, corrigé :
 *
 *   « absent → le conteneur ne démarre pas. verrouillé → il démarre, le
 *     healthcheck rend 200 avec `vaultLocked: true`, la console et le
 *     déverrouillage répondent, tout appel d'outil est refusé. ouvert →
 *     nominal. »
 *
 * Et § 32, critère de recette du lot 1, mot pour mot :
 *
 *   « le socle refuse de démarrer sans authentification et sans coffre · avec
 *     un coffre verrouillé, le healthcheck rend 200 + vaultLocked, console et
 *     déverrouillage répondent, tout outil est refusé »
 *
 * Cette fonction est PURE : elle ne lit ni base, ni environnement. C'est ce qui
 * permet de la couvrir sur les trois états sans monter un socle, et c'est ce
 * qui empêche la décision d'être prise à deux endroits — l'entrée du conteneur
 * n'a rien à recalculer, elle applique.
 */

import type { EtatCoffre } from "./etat.js";
import { ETATS_COFFRE } from "./etat.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Ce qui est servi, ou non
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les quatre familles de routes, du point de vue du coffre.
 *
 * § 21 : « la console, le healthcheck et la route de déverrouillage sont servis
 * SANS le coffre, et le matériel d'authentification de la console n'y entre
 * jamais. » C'est ce qui rend le deuxième état utile : sans ces trois routes,
 * un coffre verrouillé serait un socle mort qu'il faudrait rouvrir depuis un
 * terminal — ce que la v5 imposait, et ce que le § 21 corrige (« la v5
 * permettait de fermer depuis un téléphone et imposait un terminal pour
 * rouvrir »).
 */
export const ROUTES_DU_SOCLE = ["healthcheck", "console", "déverrouillage", "outils"] as const;

export type RouteDuSocle = (typeof ROUTES_DU_SOCLE)[number];

/** Les trois routes qui vivent SANS le coffre. Dérivé : tout sauf `outils`. */
export const ROUTES_SANS_COFFRE: readonly RouteDuSocle[] = ROUTES_DU_SOCLE.filter(
  (route) => route !== "outils",
);

// ═════════════════════════════════════════════════════════════════════════════
//  La commande que nomme le message
// ═════════════════════════════════════════════════════════════════════════════

/**
 * § 25, tableau des incidents : « Le socle refuse de démarrer → Coffre absent.
 * LE MESSAGE NOMME LA COMMANDE. Ne jamais contourner en désactivant
 * l'authentification. »
 *
 * ⚠️ Ce script n'existe PAS encore : `ops/` appartient à un autre constructeur
 *    et `package.json` est posé par la Fondation, que ce module ne touche pas.
 *    Le nom est donc une PROMESSE, portée en écart. Un message qui nomme une
 *    commande inexistante est pire qu'un message vague : il envoie chercher au
 *    mauvais endroit.
 */
export const COMMANDE_DE_PROVISION = "pnpm ops:vault:init";

// ═════════════════════════════════════════════════════════════════════════════
//  La décision
// ═════════════════════════════════════════════════════════════════════════════

export interface DecisionDeDemarrage {
  readonly etat: EtatCoffre;
  /** Le conteneur démarre-t-il ? Un seul état répond non. */
  readonly demarre: boolean;
  /** § 23 — le drapeau du healthcheck. DÉRIVÉ de l'état, jamais stocké. */
  readonly vaultLocked: boolean;
  /** Le code que rend `/healthz`. `null` quand le processus ne vit pas. */
  readonly statutHealthcheck: number | null;
  readonly routesServies: readonly RouteDuSocle[];
  /** § 23 — « tout appel d'outil est refusé ». */
  readonly appelsDOutilsAcceptes: boolean;
  /** Ce qu'il faut faire ensuite (§ 15, deuxième règle). */
  readonly message: string;
}

/**
 * Ce que le socle fait de cet état, au démarrage.
 *
 * Trois lignes, et une seule qui refuse. La tentation à laquelle ce fichier
 * existe pour résister : traiter `verrouillé` comme `absent` « parce que dans
 * les deux cas on ne peut rien déchiffrer ». C'est vrai, et c'est exactement le
 * raccourci que le § 23 nomme comme le défaut qui « rend rouge chaque
 * déploiement » — puisque le repli de W-4 fait démarrer verrouillé À CHAQUE
 * DÉPLOIEMENT.
 */
export function decisionDeDemarrage(etat: EtatCoffre): DecisionDeDemarrage {
  if (etat === "absent") {
    return {
      etat,
      demarre: false,
      // Fail-closed jusque dans le drapeau : un coffre absent n'est pas
      // « déverrouillé ».
      vaultLocked: true,
      statutHealthcheck: null,
      routesServies: [],
      appelsDOutilsAcceptes: false,
      message:
        `Coffre absent : aucun sceau en base. Le socle ne démarre pas. ` +
        `Créer le coffre avec « ${COMMANDE_DE_PROVISION} », après avoir SÉQUESTRÉ la clé ` +
        `hors machine (§ 25). Ne jamais contourner en désactivant l'authentification.`,
    };
  }

  if (etat === "verrouillé") {
    return {
      etat,
      demarre: true,
      vaultLocked: true,
      // 200, et non 503 : le déploiement ne doit PAS rougir parce que le coffre
      // attend une clé. C'est le cœur du défaut bloquant n°12.
      statutHealthcheck: 200,
      routesServies: ROUTES_SANS_COFFRE,
      appelsDOutilsAcceptes: false,
      message:
        "Coffre verrouillé : le socle est démarré et sert la console, le healthcheck et le " +
        "déverrouillage. Tout appel d'outil est refusé. Déverrouiller depuis la console — " +
        "l'écran Déverrouillage répond aussi depuis un téléphone.",
    };
  }

  return {
    etat,
    demarre: true,
    vaultLocked: false,
    statutHealthcheck: 200,
    routesServies: ROUTES_DU_SOCLE,
    appelsDOutilsAcceptes: true,
    message: "Coffre ouvert : nominal.",
  };
}

/**
 * La décision pour chacun des trois états. DÉRIVÉ de `ETATS_COFFRE` : ajouter
 * un état élargit cette liste sans qu'aucune énumération ne soit à retoucher —
 * et fait rougir les gardes qui comptent, ce qui est le but.
 */
export function decisionsPourTousLesEtats(): readonly DecisionDeDemarrage[] {
  return ETATS_COFFRE.map(decisionDeDemarrage);
}

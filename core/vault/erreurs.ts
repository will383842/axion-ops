/**
 * core/vault/erreurs.ts — les refus du coffre, en union FERMÉE.
 *
 * § 15, trois règles : une erreur ne fuit JAMAIS un secret ni une donnée
 * personnelle · elle dit TOUJOURS ce qu'il faut faire ensuite · un refus de
 * politique est une réponse normale.
 *
 * La première règle est ici la plus dure à tenir, parce que le module manipule
 * exactement ce qu'il ne doit pas dire. D'où la forme retenue : le message est
 * construit à partir du `nom` et de la `version` du secret — jamais de son
 * contenu, jamais du matériau de clé. `erreurs.spec.ts` porte la garde qui
 * balaie une batterie d'échecs provoqués et vérifie qu'aucun message, ni aucun
 * détail d'événement, ne contient le clair ni la clé.
 */

import { APPEL_STEPS } from "../types.js";
import type { AppelStep, ErrorCode } from "../types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Les raisons
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Pourquoi le coffre a refusé. Union fermée : un `switch` exhaustif au-dessus
 * ne peut pas oublier un cas, et un cas nouveau devient une erreur de
 * COMPILATION chez l'appelant.
 */
export const RAISONS_DE_COFFRE = [
  /** Aucun sceau en base : il n'y a pas de coffre. Le socle ne démarre pas. */
  "coffre_absent",
  /** Le coffre existe, aucun trousseau ne l'ouvre pour l'instant. */
  "coffre_verrouille",
  /** La source de clé n'a rien fourni. */
  "cle_absente",
  /** Longueur, encodage, ou format de clé hors contrat. */
  "cle_invalide",
  /** La ligne porte un `keyId` qu'aucune clé du trousseau ne nomme. C'est le
   *  cas qu'une rotation interrompue produit — et que `keyId` rend
   *  rattrapable : le message NOMME le `keyId` manquant. */
  "keyid_inconnu",
  /** AES-GCM a rejeté le déchiffrement : mauvaise clé, mauvais AAD, ou
   *  ciphertext altéré. Les trois sont indiscernables PAR CONSTRUCTION — c'est
   *  la propriété du mode authentifié, pas une imprécision du message. */
  "dechiffrement_impossible",
  /** Nom de secret vide, ou porteur du séparateur d'AAD. */
  "nom_invalide",
  /** Version non entière, ou négative. */
  "version_invalide",
  /** Le nom demandé est celui du sceau, réservé au coffre lui-même. */
  "nom_reserve",
  /** Aucune ligne pour ce `name` (ou pour ce couple `name, version`). */
  "secret_introuvable",
  /** Le geste demandé n'est pas dans la table des transitions. */
  "transition_interdite",
  /** `bootstrapCount` atteindrait le plafond configuré. § 27 : « un plafond
   *  qu'on ne compte pas est un mur qu'on découvre en le percutant. » */
  "plafond_bootstrap",
] as const;

export type RaisonDeCoffre = (typeof RAISONS_DE_COFFRE)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  L'erreur
// ═════════════════════════════════════════════════════════════════════════════

export interface DetailErreurDeCoffre {
  /** Nom du secret concerné, quand il y en a un. Un nom N'EST PAS un secret. */
  readonly nom?: string;
  readonly version?: number;
  /** `keyId` concerné. Un identifiant de clé n'est pas la clé. */
  readonly keyId?: string;
}

/**
 * Toute sortie en erreur du coffre passe par ici. La classe porte la `raison`
 * en union fermée pour que l'appelant décide sur elle, et non sur le texte du
 * message — un `message.includes("verrouillé")` serait une garde qui casse à la
 * première reformulation.
 */
export class ErreurDeCoffre extends Error {
  public readonly raison: RaisonDeCoffre;
  public readonly detail: DetailErreurDeCoffre;

  public constructor(raison: RaisonDeCoffre, message: string, detail: DetailErreurDeCoffre = {}) {
    super(message);
    this.name = "ErreurDeCoffre";
    this.raison = raison;
    this.detail = detail;
  }
}

/** Vrai si l'erreur vient du coffre. Sert aux `catch`, où le type est inconnu. */
export function estErreurDeCoffre(erreur: unknown): erreur is ErreurDeCoffre {
  return erreur instanceof ErreurDeCoffre;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le code rendu au client quand le coffre est fermé
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ ÉCART DU CDC — REFERMÉ AU LOT 1b (ADR 0005).
 *
 * Le § 23 exige que TOUT APPEL D'OUTIL SOIT REFUSÉ quand le coffre est
 * verrouillé, et le plan d'implémentation réclamait nommément un code
 * `vault_locked`. Le tableau du § 15 n'en énumérait que treize, et celui-ci
 * n'en faisait pas partie : les deux ne pouvaient pas être vrais ensemble.
 *
 * Ce fichier portait donc la constante HORS de l'union, en écrivant : « la
 * Recette l'y ajoutera, et cette constante deviendra alors un simple alias
 * typé ». C'est fait — `ERROR_CODES` porte désormais `vault_locked`, avec le
 * motif de l'écart écrit sur place.
 *
 * ⚠️ POURQUOI `satisfies` ET NON UNE ANNOTATION `: ErrorCode`. Les deux
 *    vérifient l'appartenance à l'union à la COMPILATION — c'est le point : le
 *    jour où le code serait renommé dans `core/types.ts`, la divergence
 *    deviendrait une erreur de compilation au lieu d'un silence. Mais une
 *    annotation ÉLARGIRAIT le type de la constante à l'union entière, et
 *    `CodeCoffreVerrouille` cesserait de désigner un code précis : `RefusDeCoffre`
 *    accepterait alors `internal` ou `conflict` sans broncher. `satisfies`
 *    contrôle sans élargir.
 */
export const CODE_COFFRE_VERROUILLE = "vault_locked" satisfies ErrorCode;

export type CodeCoffreVerrouille = typeof CODE_COFFRE_VERROUILLE;

// ═════════════════════════════════════════════════════════════════════════════
//  L'étape que ce refus porte dans `ops_audit.stepDenied`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ÉTAPE 0 — DÉRIVÉE d'`APPEL_STEPS`, jamais écrite en dur.
 *
 * Ce refus n'est aucune des quatorze étapes du § 11 : il les PRÉCÈDE TOUTES.
 * Un coffre fermé ne rend pas un outil « désactivé » (étape 6) ni « hors
 * profil » (étape 7) — l'outil existe, il est au profil, et c'est le socle qui
 * ne peut rien déchiffrer.
 *
 * Jusqu'au lot 1b il n'avait AUCUN numéro : `ops_audit.stepDenied` restait nul,
 * et la ligne devenait indiscernable d'une exception (`decision: "interrompu"`).
 * La métrique du § 24 perdait donc, sans un mot, tous les appels refusés
 * pendant qu'un coffre attendait sa clé — c'est-à-dire, d'après le § 23, après
 * chaque déploiement. `APPEL_STEPS` porte désormais l'étape 0 ; c'est d'elle
 * que ce module tire son numéro (ADR 0005).
 */
export const ETAPE_COFFRE: AppelStep = etapeDuCoffre();

function etapeDuCoffre(): AppelStep {
  const etape = APPEL_STEPS.find((candidate) => candidate.cle === "coffre");
  if (etape === undefined) {
    throw new Error(
      "core/vault/erreurs : aucune étape de clé « coffre » dans APPEL_STEPS (§ 11 + § 23). " +
        "Le refus « coffre verrouillé » ne sait plus quel numéro inscrire dans " +
        "`ops_audit.stepDenied` — corriger core/types.ts.",
    );
  }
  // ⚠️ CE CONTRÔLE EST VIDE POUR LE COMPILATEUR, ET PLEIN AU RUNTIME. `APPEL_STEPS`
  //    étant figé par `as const`, TypeScript sait déjà que cette étape porte
  //    `vault_locked` : il resserre l'intérieur du `if` à `never`, et un
  //    littéral de gabarit n'y a plus rien à formater. Le contrôle vaut
  //    néanmoins — la table peut arriver d'un module compilé séparément, ou
  //    d'une archive — d'où le MESSAGE FORMÉ AVANT la comparaison, sur des
  //    valeurs qu'aucun resserrement n'a encore touchées.
  const codeDeLEtape: ErrorCode | null = etape.refus;
  const desaccord =
    `core/vault/erreurs : l'étape « coffre » porte le code « ${String(codeDeLEtape)} » ` +
    `au lieu de « ${String(CODE_COFFRE_VERROUILLE)} ». Deux sources de vérité pour un même ` +
    "refus : le journal et la réponse ne diraient plus la même chose.";
  if (codeDeLEtape !== CODE_COFFRE_VERROUILLE) {
    throw new Error(desaccord);
  }
  return etape.numero;
}

/**
 * Ce que le socle rend à un appel d'outil quand le coffre n'est pas ouvert.
 */
export interface RefusDeCoffre {
  readonly code: CodeCoffreVerrouille;
  /** Le numéro écrit dans `ops_audit.stepDenied` — DÉRIVÉ, jamais littéral. */
  readonly etape: AppelStep;
  /** L'état exact, pas un booléen — `absent` et `verrouillé` ne se réparent pas
   *  du même geste. */
  readonly etat: "absent" | "verrouillé";
  /** Ce qu'il faut faire ensuite (§ 15, deuxième règle). */
  readonly message: string;
}

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
 * ⚠️ ÉCART ASSUMÉ ET VISIBLE — le code `vault_locked` n'est PAS dans le § 15.
 *
 * Le plan d'implémentation le réclame explicitement (« Ajouter :
 * `tool_not_in_profile`, `cursor_invalid`, `result_too_large`,
 * `provenance_denied`, `vault_locked` »), et le § 23 exige que TOUT APPEL
 * D'OUTIL SOIT REFUSÉ quand le coffre est verrouillé. Mais le tableau du § 15,
 * qui est la source de `ERROR_CODES` dans `core/types.ts`, n'énumère que treize
 * codes et celui-ci n'en fait pas partie.
 *
 * Les deux ne peuvent être vrais ensemble. Trois issues étaient possibles :
 *
 *  1. rendre `internal` — mentirait sur la cause, et le § 15 exige que le
 *     message dise ce qu'il faut faire ensuite ; « déverrouille le coffre »
 *     n'est pas ce que dit `internal` ;
 *  2. rendre `upstream_unavailable` — mentirait encore : l'adaptateur est
 *     joignable, c'est le socle qui refuse ;
 *  3. nommer le code manquant ICI, hors de `core/types.ts` (qui appartient à la
 *     Fondation), et le porter en écart.
 *
 * C'est la troisième. `core/vault/` ne modifie pas `ERROR_CODES` : la Recette
 * l'y ajoutera, et cette constante deviendra alors un simple alias typé.
 */
export const CODE_COFFRE_VERROUILLE = "vault_locked";

export type CodeCoffreVerrouille = typeof CODE_COFFRE_VERROUILLE;

/**
 * Ce que le socle rend à un appel d'outil quand le coffre n'est pas ouvert.
 *
 * ⚠️ Ce refus N'EST PAS UNE DES QUATORZE ÉTAPES du § 11 : il les précède
 * TOUTES. Un coffre fermé ne rend pas un outil « désactivé » (étape 6) ni « hors
 * profil » (étape 7) — l'outil existe et il est au profil, c'est le socle qui
 * ne peut rien déchiffrer. Le `stepDenied` d'`ops_audit` n'a donc pas de numéro
 * à porter ici ; voir écart.
 */
export interface RefusDeCoffre {
  readonly code: CodeCoffreVerrouille;
  /** L'état exact, pas un booléen — `absent` et `verrouillé` ne se réparent pas
   *  du même geste. */
  readonly etat: "absent" | "verrouillé";
  /** Ce qu'il faut faire ensuite (§ 15, deuxième règle). */
  readonly message: string;
}

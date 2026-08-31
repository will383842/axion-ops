/**
 * `core/auth/depot.ts` — **`ops_token`, VUE DEPUIS L'ÉMETTEUR.**
 *
 * ═══ CE QUE CE FICHIER DÉCLARE, ET CE QU'IL NE DÉCIDE PAS ═══
 *
 * Il porte le PORT du stockage des jetons : ce que l'émetteur écrit, ce que
 * l'étape 4 relit, et rien d'autre. L'implémentation Prisma appartient au lot
 * qui montera la base ; `core/auth/memoire.ts` en donne le double, seul moyen
 * d'éprouver l'émetteur sans base — et seul moyen de DÉMARRER EN LOCAL, qui est
 * le critère de recette de ce lot.
 *
 * ═══ DEUX COLONNES QUI MANQUAIENT, ET LEUR LECTEUR ═══
 *
 * `LigneOpsTokenRelue` (`core/chaine/identite.ts`) exige un `sessionId` depuis le
 * lot 1c, et l'ADR 0014 décide qu'il **suit l'octroi, pas le `jti`**. Or
 * `model OpsToken` n'en portait **aucun** : ce lot est le premier qui pouvait le
 * constater, parce qu'il est le premier à écrire l'émetteur. Deux colonnes
 * atterrissent avec lui (ADR 0027, point 4) :
 *
 *  · **`grantId`** — l'identifiant de la chaîne de rafraîchissement, donc d'un
 *    consentement humain. Il ne tourne jamais. C'est lui qui rend « révoque
 *    toute la chaîne » exécutable, et « la session suit l'octroi » vérifiable ;
 *  · **`sessionId`** — frappée UNE FOIS par octroi, propagée à tout jeton qui en
 *    descend.
 *
 * ⚠️ **ELLES ATTERRISSENT AVEC LEUR LECTEUR, DANS LE MÊME GESTE.** Poser une
 *    colonne sans lecteur fabriquerait une seconde source de vérité — c'est le
 *    motif pour lequel le lot 1d a refusé de poser `governanceFields` seul.
 *
 * ═══ POURQUOI `sessionId` EST ICI UNE `string`, ET NON UNE `SessionId` ═══
 *
 * ⚠️ **CE N'EST PAS UN RELÂCHEMENT, C'EST LA SÉPARATION DES POUVOIRS DE L'ADR
 *    0014.** La COLONNE est du texte. La traversée « texte → `SessionId` » est
 *    `FabriqueSessionId.relireDepuisLeSocle()`, et `APPELANTS_DE_LA_RELECTURE`
 *    ne nomme que `core/transport/http.ts` et `core/transport/stdio.ts` —
 *    l'émetteur n'en fait pas partie, et ne doit pas en faire partie : relire est
 *    le geste de l'étape 4.
 *
 *    L'émetteur, lui, **frappe** à l'octroi et **propage** au rafraîchissement.
 *    Propager une chaîne d'une ligne à l'autre ne demande aucun pouvoir : c'est
 *    précisément ce qui rend le rafraîchissement incapable d'ouvrir une session
 *    neuve, même par mégarde. Un `sessionId` typé ici aurait obligé l'émetteur à
 *    reconvertir la colonne à chaque rafraîchissement, donc à demander le
 *    pouvoir de relire, donc à s'ajouter à une liste qui doit rester courte.
 */

import type { OpsScope } from "../types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE GENRE D'UN JETON
// ═════════════════════════════════════════════════════════════════════════════

/**
 * § 19.1 — deux durées de vie dans une seule table, donc deux genres.
 *
 * ⚠️ CETTE TOTALITÉ EST LUE PAR LA SÉPARATION DE DOMAINE DE L'EMPREINTE
 *    (`core/auth/empreinte.ts`) : un troisième genre ajouté ici change les
 *    empreintes de ce genre-là et d'aucun autre. C'est voulu — un genre est une
 *    population de jetons, pas une étiquette.
 */
export const GENRES_DE_JETON = ["access", "refresh"] as const;

export type GenreDeJeton = (typeof GENRES_DE_JETON)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  LA LIGNE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE LIGNE D'`ops_token`, telle que l'émetteur l'écrit et que l'étape 4 la relit.
 *
 * ⚠️ **AUCUN CHAMP NE PORTE LE JETON EN CLAIR, ET AUCUN NE LE PEUT.** Le § 19.1
 *    l'écrit : « seule une EMPREINTE est conservée ; le jeton ne s'affiche en
 *    clair qu'une fois ». Ce type est la moitié qui rend la phrase vérifiable —
 *    `core/auth/octroi.spec.ts` balaie la ligne écrite champ par champ et exige
 *    qu'aucun ne contienne la chaîne remise à l'appelant.
 */
export interface LigneOpsToken {
  /** `jti` de la RFC 7519. Clé primaire : c'est ce que le jeton présente. */
  readonly jti: string;

  /**
   * HMAC-SHA-256 clé par le coffre (ADR 0027, point 7), avec séparation de
   * domaine par genre. **JAMAIS le jeton, jamais un SHA salé.**
   */
  readonly tokenHash: string;

  /**
   * À qui le jeton a été délivré. **Borné À LA SOURCE** : l'émetteur n'écrit
   * ici que ce qu'`admettreUnPrincipal()` a admis (ADR 0029, point 1).
   */
  readonly principal: string;

  readonly kind: GenreDeJeton;

  /** § 19.2 — et l'émetteur refuse d'y écrire `ops:policy`. */
  readonly scopes: readonly OpsScope[];

  /** RFC 8707. L'étape 3 la compare par égalité EXACTE (ADR 0026). */
  readonly audience: string;

  /**
   * ⚠️ **COLONNE NEUVE (ADR 0027).** La chaîne de rafraîchissement, c'est-à-dire
   *    un consentement humain. Elle NE TOURNE JAMAIS : c'est elle qui rend
   *    « révoquer toute la chaîne » exécutable.
   */
  readonly grantId: string;

  /**
   * ⚠️ **COLONNE NEUVE (ADR 0027).** La session de pilotage, frappée À L'OCTROI
   *    et propagée. Du TEXTE ici — voir l'en-tête du fichier.
   */
  readonly sessionId: string;

  readonly issuedAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE PORT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE L'ÉMETTEUR ATTEND DU STOCKAGE.
 *
 * ⚠️ **`revoquerLaChaine` N'EST PAS UNE COMMODITÉ, C'EST LA MOITIÉ EXÉCUTABLE
 *    D'UNE DÉCISION.** L'ADR 0027 tranche qu'un refresh déjà révoqué qui se
 *    représente révoque TOUTE la chaîne d'octroi : on ne peut pas distinguer un
 *    rejeu client d'un attaquant intercalé. Sans une opération qui porte le
 *    `grantId`, la décision se serait écrite en boucle chez l'appelant — et une
 *    boucle qui s'arrête à mi-chemin sur une erreur laisse une chaîne à demi
 *    révoquée, c'est-à-dire un jeton volé encore valide.
 */
export interface DepotDeJetons {
  /**
   * Écrit une ligne. **Refuse un `jti` ou un `tokenHash` déjà présents** — les
   * deux sont uniques au schéma, et un dépôt qui écraserait en silence
   * remplacerait un jeton vivant par un autre.
   */
  inserer(ligne: LigneOpsToken): Promise<void>;

  /** La ligne portant cette empreinte, ou `null`. C'est la lecture de l'étape 4. */
  parEmpreinte(tokenHash: string): Promise<LigneOpsToken | null>;

  /** La ligne portant ce `jti`, ou `null`. */
  parJti(jti: string): Promise<LigneOpsToken | null>;

  /**
   * Marque ce `jti` révoqué. Rend `false` si la ligne n'existe pas.
   *
   * ⚠️ **UNE RÉVOCATION NE SE RÉÉCRIT PAS.** Une seconde révocation laisse la
   *    date d'origine : `revokedAt` dit QUAND la capacité a cessé, et l'écraser
   *    effacerait la seule trace de l'instant qui compte pour une revue.
   */
  revoquer(jti: string, quand: Date): Promise<boolean>;

  /** Révoque tous les jetons non révoqués de cette chaîne. Rend le COMPTE. */
  revoquerLaChaine(grantId: string, quand: Date): Promise<number>;

  /** § 12 — `lastUsedAt`. Sans lui, « ce jeton sert-il encore ? » n'a pas de source. */
  marquerUsage(jti: string, quand: Date): Promise<void>;

  /**
   * Les lignes vivantes de cette chaîne, pour l'écran Santé du § 22 et pour les
   * gardes. **Un dépôt qui ne sait pas se compter ne se surveille pas.**
   */
  listerLaChaine(grantId: string): Promise<readonly LigneOpsToken[]>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA DEMANDE D'AUTORISATION EN COURS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE DEMANDE D'AUTORISATION EN ATTENTE — ce qui vit entre `/auth/authorize` et
 * `/auth/token`.
 *
 * ⚠️ **AUCUNE TABLE NE LA PORTE, ET C'EST UN ÉCART ASSUMÉ, PAS UN OUBLI.** Le
 *    § 12 énumère DIX tables et n'en donne aucune aux codes d'autorisation ;
 *    l'ADR 0027 n'en crée aucune non plus. En ajouter une serait une décision de
 *    schéma que personne n'a prise. Le code vit donc dans le processus, ce que
 *    l'ADR 0018 (socle MONO-INSTANCE en v1) rend licite : il n'y a qu'un
 *    processus, et il n'y en a qu'un parce que l'étage 1 du démarrage refuse le
 *    second.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** Un redémarrage perd les demandes en
 *    vol. Le coût est un utilisateur qui recommence son consentement dans la
 *    minute qui suit un redémarrage ; le coût de l'autre choix serait une
 *    onzième table posée sans décision. Le jour où le socle cessera d'être
 *    mono-instance, ce port devra trouver un magasin partagé — c'est écrit ici
 *    pour que la question se pose à ce moment-là, et pas après.
 */
export interface DemandeDAutorisation {
  /** Le code d'autorisation, à usage UNIQUE. */
  readonly code: string;
  readonly principal: string;
  readonly scopesDemandes: readonly OpsScope[];
  readonly audience: string;
  /** RFC 7636 — `code_challenge`, méthode `S256` obligatoire. */
  readonly defi: string;
  readonly expiresAt: Date;
}

/** Le magasin des demandes en vol. */
export interface DepotDeDemandes {
  /** Refuse un code déjà présent. */
  deposer(demande: DemandeDAutorisation): Promise<void>;

  /**
   * Retire ET rend la demande, en UN geste.
   *
   * ⚠️ **CONSOMMER, PAS LIRE.** Un code d'autorisation est à usage unique
   *    (RFC 6749, § 10.5). Une lecture suivie d'une suppression laisse une
   *    fenêtre où deux échanges concurrents obtiennent tous deux le code et
   *    reçoivent tous deux un jeton — et le second est celui de l'attaquant.
   */
  consommer(code: string): Promise<DemandeDAutorisation | null>;

  /** Combien de demandes sont en vol. Un magasin qui ne se compte pas ne se voit pas. */
  enVol(): Promise<number>;
}

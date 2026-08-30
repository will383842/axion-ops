/**
 * core/policy/confirmation.ts — LE JETON DE CONFIRMATION À USAGE UNIQUE.
 *
 * § 20, précision 1 : « La confirmation était auto-satisfiable. Un second appel
 * portant un drapeau est indiscernable d'un premier. La confirmation est un
 * JETON À USAGE UNIQUE, de courte durée, LIÉ À L'`argHash` DE L'APPEL EXACT,
 * délivré sur le canal du desserrage et JAMAIS DANS LA RÉPONSE D'ERREUR. Et :
 * ni l'élicitation MCP, ni une réponse produite par le démon vocal ne comptent
 * comme confirmation humaine — sans cette clause, la voie B du § 30 contourne le
 * niveau `confirmé` par construction. »
 *
 * Ce fichier tient les quatre propriétés : usage unique, courte durée, liaison
 * à l'`argHash`, canal humain — et il ne rend jamais le jeton dans un refus.
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// ═════════════════════════════════════════════════════════════════════════════
//  Les canaux
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Par où un ordre peut arriver. C'est la valeur d'`ops_policy.channel`, que le
 * § 12 exige « sans lui, la protection second facteur est INAUDITABLE ».
 */
export const CANAUX = [
  /** La session de console du § 21 — un humain devant un écran. */
  "console",
  /** `POST /api/mcp`. Le modèle. */
  "mcp",
  /** Le démon vocal du § 30. */
  "voix",
  /** Le transport local du § 11. */
  "stdio",
  /** Le démarrage du socle — aucun humain, aucun ordre (§ 20, protection 4). */
  "boot",
] as const;

export type Canal = (typeof CANAUX)[number];

function jamaisCanal(valeur: never): never {
  throw new Error(`canal non traité : ${JSON.stringify(valeur)}`);
}

/**
 * Ce canal peut-il DÉLIVRER une confirmation humaine ?
 *
 * `switch` exhaustif : ajouter un canal sans le classer est une erreur de
 * COMPILATION. Une liste blanche écrite à la main laisserait un canal nouveau
 * tomber du bon côté par défaut — ici il ne tombe nulle part tant qu'on ne l'a
 * pas tranché.
 */
export function canalDelivreUneConfirmation(canal: Canal): boolean {
  switch (canal) {
    case "console":
      return true;
    case "mcp":
      // § 20 : le desserrage n'est PAS un outil MCP, et la confirmation est
      // délivrée « sur le canal du desserrage ». Une confirmation qui transite
      // par /api/mcp est signée par celui-là même qu'elle doit contrôler.
      return false;
    case "voix":
      // § 20, explicitement : « ni l'élicitation MCP, ni une réponse produite
      // par le démon vocal ne comptent comme confirmation humaine ». Sans cette
      // ligne, la voie B du § 30 contourne le niveau `confirmé` PAR
      // CONSTRUCTION — le modèle se confirmerait lui-même en parlant.
      return false;
    case "stdio":
      // Transport local sans identité ni principal établis (§ 11, dernière
      // ligne). Tant que le lot 1 ne lui en donne pas, il ne confirme rien.
      return false;
    case "boot":
      return false;
    default:
      return jamaisCanal(canal);
  }
}

/** Les canaux qui délivrent une confirmation, DÉRIVÉS de `CANAUX`. */
export function canauxDeConfirmation(): readonly Canal[] {
  return CANAUX.filter(canalDelivreUneConfirmation);
}

// ═════════════════════════════════════════════════════════════════════════════
//  La borne haute de durée
// ═════════════════════════════════════════════════════════════════════════════

/**
 * « De courte durée » — cinq minutes.
 *
 * Une BORNE HAUTE, pas seulement un défaut : sans elle, un appelant demanderait
 * un TTL d'un an et la confirmation redeviendrait un drapeau permanent, c'est-à-
 * dire exactement le défaut que le § 20 corrige.
 */
export const TTL_CONFIRMATION_MAX_MS = 5 * 60 * 1000;

/** Défaut employé quand l'appelant ne demande rien. */
export const TTL_CONFIRMATION_DEFAUT_MS = 2 * 60 * 1000;

// ═════════════════════════════════════════════════════════════════════════════
//  Le jeton, tel qu'il est CONSERVÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que le dépôt garde. JAMAIS la valeur en clair : seulement une empreinte
 * HMAC-SHA-256 clé par un sel du coffre — le motif du § 12, règle 2 (« un
 * SHA-256 nu se casse en quelques secondes ; un HMAC clé rend l'index inutilisable
 * pour qui obtiendrait un dump sans le secret »), et celui d'`ops_token`
 * (« empreinte SHA-256 SALÉE »).
 */
export interface JetonConfirmationConserve {
  readonly jti: string;
  readonly empreinte: string;
  /** Nom qualifié de l'outil visé. */
  readonly tool: string;
  /** L'`argHash` de l'appel EXACT. C'est lui qui rend le jeton non réutilisable
   *  pour une autre cible. */
  readonly argHash: string;
  readonly principal: string;
  readonly canal: Canal;
  readonly emisA: Date;
  readonly expireA: Date;
  readonly consommeA: Date | null;
}

/**
 * L'INTERFACE du dépôt. Ce module ne choisit pas où les jetons vivent — il
 * exige seulement que `consommer` soit ATOMIQUE.
 *
 * ⚠️ ÉCART RELEVÉ — AUCUNE DES DIX TABLES DU § 12 NE PORTE CE JETON.
 *    `ops_token` (`jti`, empreinte salée, `scopes`, `audience`, `issuedAt`,
 *    `expiresAt`, `revokedAt`, `lastUsedAt`) s'en approche mais n'a NI `argHash`
 *    NI `tool` : sans eux, la liaison à l'appel exact — la propriété qui fait
 *    toute la valeur du jeton — n'a pas d'endroit où être écrite. Voir DEPS.md.
 *    L'implémentation en mémoire ci-dessous est le défaut de la v1, et elle est
 *    défendable : durée de vie en minutes, et un redémarrage les efface — ce qui
 *    va dans le sens du fail-closed du § 20, jamais contre.
 */
export interface DepotJetonsConfirmation {
  enregistrer(jeton: JetonConfirmationConserve): Promise<void>;
  lire(jti: string): Promise<JetonConfirmationConserve | null>;
  /**
   * Marque le jeton consommé SI ET SEULEMENT SI il ne l'était pas déjà.
   * Rend `true` au seul gagnant. C'est l'usage unique, et il ne peut pas être
   * garanti par une lecture suivie d'une écriture.
   */
  consommer(jti: string, maintenant: Date): Promise<boolean>;
  /** Combien de jetons le dépôt tient — un signal POSITIF, pour qu'un dépôt
   *  vide se voie au lieu de rendre toute garde verte. */
  taille(): Promise<number>;
}

/** Dépôt en mémoire. Suffisant pour la v1 (voir l'écart ci-dessus) et pour les tests. */
export class DepotJetonsConfirmationMemoire implements DepotJetonsConfirmation {
  private readonly jetons = new Map<string, JetonConfirmationConserve>();

  enregistrer(jeton: JetonConfirmationConserve): Promise<void> {
    this.jetons.set(jeton.jti, jeton);
    return Promise.resolve();
  }

  lire(jti: string): Promise<JetonConfirmationConserve | null> {
    return Promise.resolve(this.jetons.get(jti) ?? null);
  }

  consommer(jti: string, maintenant: Date): Promise<boolean> {
    const jeton = this.jetons.get(jti);
    if (jeton === undefined || jeton.consommeA !== null) {
      return Promise.resolve(false);
    }
    this.jetons.set(jti, { ...jeton, consommeA: maintenant });
    return Promise.resolve(true);
  }

  taille(): Promise<number> {
    return Promise.resolve(this.jetons.size);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Empreinte
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Sépare la valeur en clair `<jti>.<secret>`.
 * Aucune exception, aucun message : un jeton mal formé n'apprend rien à qui le
 * présente.
 */
function separer(valeur: string): { jti: string; secret: string } | null {
  const separateur = valeur.indexOf(".");
  if (separateur <= 0 || separateur === valeur.length - 1) return null;
  return { jti: valeur.slice(0, separateur), secret: valeur.slice(separateur + 1) };
}

/**
 * L'empreinte conservée. HMAC-SHA-256, clé = sel du coffre, séparation de
 * domaine par le `jti`.
 *
 * FAIL-LOUD si le sel manque : c'est la règle du § 12, règle 2, et elle vaut ici
 * pour la même raison — un sel vide ferait un HMAC sans secret, donc une
 * empreinte reconstructible depuis un dump.
 */
export function empreinteJeton(sel: string, jti: string, secret: string): string {
  if (sel.length === 0) {
    throw new Error(
      "core/policy : sel d'empreinte absent. Le socle ne fabrique pas de jeton de confirmation sans clé — un HMAC sans secret n'en est pas un.",
    );
  }
  return createHmac("sha256", sel).update(`confirmation|${jti}|${secret}`).digest("hex");
}

function egaliteConstante(a: string, b: string): boolean {
  const ta = Buffer.from(a, "utf8");
  const tb = Buffer.from(b, "utf8");
  if (ta.length !== tb.length) return false;
  return timingSafeEqual(ta, tb);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Émission
// ═════════════════════════════════════════════════════════════════════════════

export interface DemandeConfirmation {
  readonly tool: string;
  readonly argHash: string;
  readonly principal: string;
  readonly canal: Canal;
  readonly maintenant: Date;
  readonly ttlMs?: number;
}

export type ResultatEmission =
  | {
      readonly emis: true;
      /** ⚠️ LA SEULE ET UNIQUE FOIS où la valeur existe en clair. Elle part sur
       *  le canal du desserrage, jamais dans une réponse d'appel d'outil. */
      readonly valeur: string;
      readonly jeton: JetonConfirmationConserve;
    }
  | { readonly emis: false; readonly motif: string };

export interface DependancesConfirmation {
  readonly depot: DepotJetonsConfirmation;
  /** Sel d'empreinte, issu du coffre (`core/vault`). */
  readonly sel: string;
  /** Injecté pour que les tests soient déterministes. */
  readonly alea?: (octets: number) => Buffer;
}

/**
 * Émet un jeton de confirmation.
 *
 * Trois refus, tous fail-closed : canal non humain, TTL nul ou négatif, TTL
 * au-delà de la borne haute.
 */
export async function emettreConfirmation(
  demande: DemandeConfirmation,
  deps: DependancesConfirmation,
): Promise<ResultatEmission> {
  if (!canalDelivreUneConfirmation(demande.canal)) {
    return {
      emis: false,
      motif:
        `Le canal « ${demande.canal} » ne délivre pas de confirmation humaine (§ 20). ` +
        `Canaux admis : ${canauxDeConfirmation().join(", ")}.`,
    };
  }

  const ttlMs = demande.ttlMs ?? TTL_CONFIRMATION_DEFAUT_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    return { emis: false, motif: "Durée de confirmation nulle ou négative — refusée." };
  }
  if (ttlMs > TTL_CONFIRMATION_MAX_MS) {
    return {
      emis: false,
      motif:
        `Durée demandée ${String(ttlMs)} ms au-delà de la borne haute ` +
        `${String(TTL_CONFIRMATION_MAX_MS)} ms : une confirmation « de courte durée » ` +
        `qui dure redevient le drapeau permanent que le § 20 corrige.`,
    };
  }
  if (demande.argHash.length === 0 || demande.tool.length === 0) {
    return { emis: false, motif: "Un jeton de confirmation sans outil ni argHash ne lie rien." };
  }

  const alea = deps.alea ?? randomBytes;
  const jti = alea(12).toString("base64url");
  const secret = alea(32).toString("base64url");

  const jeton: JetonConfirmationConserve = {
    jti,
    empreinte: empreinteJeton(deps.sel, jti, secret),
    tool: demande.tool,
    argHash: demande.argHash,
    principal: demande.principal,
    canal: demande.canal,
    emisA: demande.maintenant,
    expireA: new Date(demande.maintenant.getTime() + ttlMs),
    consommeA: null,
  };

  await deps.depot.enregistrer(jeton);

  return { emis: true, valeur: `${jti}.${secret}`, jeton };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Vérification et consommation
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Pourquoi une confirmation n'a pas été retenue. Le journal en a besoin ; la
 * RÉPONSE, elle, ne rend que « invalide » — un attaquant n'apprend pas ici
 * lequel des sept motifs il a déclenché.
 */
export const MOTIFS_REFUS_CONFIRMATION = [
  "format",
  "inconnu",
  "empreinte",
  "expire",
  "deja-consomme",
  "outil-different",
  "arghash-different",
  "principal-different",
] as const;

export type MotifRefusConfirmation = (typeof MOTIFS_REFUS_CONFIRMATION)[number];

export type ResultatVerification =
  | { readonly valide: true; readonly jti: string }
  | { readonly valide: false; readonly motif: MotifRefusConfirmation };

export interface AppelAConfirmer {
  readonly presente: string;
  readonly tool: string;
  readonly argHash: string;
  readonly principal: string;
  readonly maintenant: Date;
}

/**
 * Vérifie PUIS consomme.
 *
 * L'ORDRE COMPTE. Consommer avant de vérifier la liaison brûlerait un jeton
 * légitime sur un appel qui ne lui correspond pas — un déni de service à un
 * appel de distance. Vérifier sans consommer atomiquement rendrait le rejeu
 * possible entre les deux. D'où : lecture, contrôle de liaison, puis
 * `consommer()` en compare-et-échange, dont l'échec vaut « déjà consommé ».
 */
export async function verifierEtConsommer(
  appel: AppelAConfirmer,
  deps: DependancesConfirmation,
): Promise<ResultatVerification> {
  const parts = separer(appel.presente);
  if (parts === null) {
    return { valide: false, motif: "format" };
  }

  const jeton = await deps.depot.lire(parts.jti);
  if (jeton === null) {
    return { valide: false, motif: "inconnu" };
  }

  const attendue = empreinteJeton(deps.sel, parts.jti, parts.secret);
  if (!egaliteConstante(attendue, jeton.empreinte)) {
    return { valide: false, motif: "empreinte" };
  }

  if (jeton.consommeA !== null) {
    return { valide: false, motif: "deja-consomme" };
  }
  if (jeton.expireA.getTime() <= appel.maintenant.getTime()) {
    return { valide: false, motif: "expire" };
  }
  if (jeton.tool !== appel.tool) {
    return { valide: false, motif: "outil-different" };
  }
  if (!egaliteConstante(jeton.argHash, appel.argHash)) {
    // LE CŒUR DE LA RÈGLE : le jeton vaut pour l'appel EXACT, pas pour l'outil.
    //
    // Comparaison À TEMPS CONSTANT, et non `!==` : `core/limits/arg-hash.ts`
    // expose `correspond()` en écrivant mot pour mot pourquoi — « une
    // comparaison `===` sur un `argHash` fuit, par son temps de retour, le
    // nombre de caractères de tête devinés — de quoi construire une empreinte
    // cible caractère par caractère QUAND CETTE COMPARAISON GARDE UN JETON DE
    // CONFIRMATION (§ 20) ». C'est exactement cette comparaison-ci ; elle était
    // la seule du socle à ne pas suivre sa propre règle.
    return { valide: false, motif: "arghash-different" };
  }
  if (jeton.principal !== appel.principal) {
    return { valide: false, motif: "principal-different" };
  }

  const gagne = await deps.depot.consommer(parts.jti, appel.maintenant);
  if (!gagne) {
    return { valide: false, motif: "deja-consomme" };
  }

  return { valide: true, jti: parts.jti };
}

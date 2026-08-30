/**
 * core/policy/second-facteur.ts — LE SECOND FACTEUR DU DESSERRAGE.
 *
 * § 20, protection 2 : « Critère qualifiant : UN CANAL QUE LE SOCLE NE PEUT NI
 * LIRE NI ÉCRIRE — donc jamais une boîte que le socle lit, jamais un transit par
 * `/api/mcp`. Déjà outillé chez toi : `otplib` 13.4.1, `src/lib/auth-2fa.ts`,
 * écran `/2fa/setup`. »
 *
 * ═══ POURQUOI UNE IMPLÉMENTATION `node:crypto` ET NON `otplib` ═══
 *
 * Le dépôt voisin `axionia` porte bien `otplib` 13.4.1 et
 * `src/lib/auth-2fa.ts` (lu : API fonctionnelle v13, `verifySync`, tolérance
 * ±30 s). Mais `axion-ops` est un dépôt NEUF : `otplib` n'y est pas installé, et
 * la consigne de chantier interdit de toucher à `package.json`. Le module est
 * donc écrit contre l'INTERFACE `SecondFacteur` ci-dessous, avec une
 * implémentation TOTP RFC 6238 en `node:crypto` — trente lignes, aucune
 * dépendance, aucun appel réseau. Si la Recette préfère `otplib`, elle
 * substitue une autre implémentation de la MÊME interface sans toucher à un
 * seul appelant. Voir `DEPS.md`.
 *
 * ═══ CE QUE CE FICHIER AJOUTE AU MOTIF VOISIN ═══
 *
 * `auth-2fa.ts` ne garde pas contre le REJEU : un code TOTP reste valable
 * pendant toute sa fenêtre de 30 s (90 s avec la tolérance), donc il peut servir
 * DEUX FOIS. Pour une connexion, c'est un risque accepté. Pour un DESSERRAGE de
 * politique, c'est un second desserrage gratuit à qui a vu le code une fois.
 * D'où `DepotPasTotp` : un pas déjà consommé par ce principal ne l'est jamais
 * deux fois.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

// ═════════════════════════════════════════════════════════════════════════════
//  L'interface — c'est ELLE que le desserrage connaît
// ═════════════════════════════════════════════════════════════════════════════

/** Pourquoi un second facteur n'a pas été retenu. Le journal en a besoin. */
export const MOTIFS_REFUS_FACTEUR = [
  "format",
  "pas-de-second-facteur",
  "code-faux",
  "rejeu",
] as const;

export type MotifRefusFacteur = (typeof MOTIFS_REFUS_FACTEUR)[number];

export type ResultatSecondFacteur =
  | { readonly valide: true; readonly pas: number }
  | { readonly valide: false; readonly motif: MotifRefusFacteur };

export interface DemandeSecondFacteur {
  readonly principal: string;
  readonly code: string;
  readonly maintenant: Date;
}

/**
 * Le contrat. `core/policy/desserrage.ts` ne connaît QUE ceci : il ne sait pas
 * que c'est du TOTP, et il ne doit pas le savoir.
 */
export interface SecondFacteur {
  verifier(demande: DemandeSecondFacteur): Promise<ResultatSecondFacteur>;
}

/**
 * D'où vient le secret TOTP du principal.
 *
 * ⚠️ AUCUN SECRET RÉEL N'EXISTE DANS CE MODULE. Le secret vit dans
 *    `ops_secret`, chiffré, et c'est `core/vault/` — dossier d'un autre
 *    constructeur — qui le déchiffre. On DÉCLARE l'interface, on ne la
 *    réimplémente pas.
 */
export interface FournisseurSecretTotp {
  /** Le secret base32 du principal, ou `null` s'il n'en a pas. */
  secretPour(principal: string): Promise<string | null>;
}

/**
 * L'anti-rejeu. `enregistrerPas` rend `false` si ce pas — ou un pas postérieur —
 * a déjà servi : compare-et-échange, jamais lecture-puis-écriture.
 */
export interface DepotPasTotp {
  dernierPas(principal: string): Promise<number | null>;
  enregistrerPas(principal: string, pas: number): Promise<boolean>;
  /** Nombre de principaux suivis — signal positif d'un dépôt qui n'est pas vide
   *  pour la mauvaise raison. */
  taille(): Promise<number>;
}

export class DepotPasTotpMemoire implements DepotPasTotp {
  private readonly pas = new Map<string, number>();

  dernierPas(principal: string): Promise<number | null> {
    return Promise.resolve(this.pas.get(principal) ?? null);
  }

  enregistrerPas(principal: string, pas: number): Promise<boolean> {
    const dernier = this.pas.get(principal);
    if (dernier !== undefined && pas <= dernier) {
      return Promise.resolve(false);
    }
    this.pas.set(principal, pas);
    return Promise.resolve(true);
  }

  taille(): Promise<number> {
    return Promise.resolve(this.pas.size);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  TOTP — RFC 6238, sur `node:crypto`
// ═════════════════════════════════════════════════════════════════════════════

/** Période RFC 6238, en secondes. Celle de tous les authentificateurs grand public. */
export const PERIODE_TOTP_S = 30;

/** Nombre de chiffres. Six, comme `auth-2fa.ts` du dépôt voisin. */
export const CHIFFRES_TOTP = 6;

/**
 * Dérive acceptée, EN PAS. `1` = ±30 s, exactement la tolérance du dépôt voisin
 * (`EPOCH_TOLERANCE = 30`).
 *
 * BORNE HAUTE assumée : chaque pas de tolérance supplémentaire allonge d'autant
 * la fenêtre pendant laquelle un code vu par-dessus une épaule reste utilisable.
 */
export const DERIVE_TOTP_PAS = 1;

const ALPHABET_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Décode un secret base32 (RFC 4648). Rend `null` sur un caractère hors
 * alphabet — un secret mal formé ne doit jamais être « à peu près » décodé.
 */
export function decoderBase32(secret: string): Buffer | null {
  const propre = secret.replace(/=+$/u, "").replace(/\s+/gu, "").toUpperCase();
  if (propre.length === 0) return null;

  let tampon = 0;
  let bits = 0;
  const octets: number[] = [];

  for (const caractere of propre) {
    const valeur = ALPHABET_BASE32.indexOf(caractere);
    if (valeur < 0) return null;
    tampon = (tampon << 5) | valeur;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      octets.push((tampon >> bits) & 0xff);
    }
  }

  return Buffer.from(octets);
}

/** Le pas courant — `floor(epoch / période)`. C'est lui que l'anti-rejeu retient. */
export function pasTotp(maintenant: Date, periodeS = PERIODE_TOTP_S): number {
  return Math.floor(maintenant.getTime() / 1000 / periodeS);
}

/**
 * Le code d'un pas donné. HMAC-SHA-1 sur le compteur 8 octets big-endian, puis
 * troncature dynamique — RFC 4226 § 5.3.
 *
 * SHA-1 n'est pas un choix de confort : c'est ce que produisent Google
 * Authenticator, Authy, 1Password et Bitwarden. En changer rendrait le socle
 * incompatible avec l'application déjà appairée dans `/2fa/setup`.
 */
export function codeTotp(secret: Buffer, pas: number, chiffres = CHIFFRES_TOTP): string {
  const compteur = Buffer.alloc(8);
  compteur.writeBigUInt64BE(BigInt(pas));

  const empreinte = createHmac("sha1", secret).update(compteur).digest();
  const decalage = (empreinte[empreinte.length - 1] ?? 0) & 0x0f;
  const tronque =
    (((empreinte[decalage] ?? 0) & 0x7f) << 24) |
    (((empreinte[decalage + 1] ?? 0) & 0xff) << 16) |
    (((empreinte[decalage + 2] ?? 0) & 0xff) << 8) |
    ((empreinte[decalage + 3] ?? 0) & 0xff);

  return String(tronque % 10 ** chiffres).padStart(chiffres, "0");
}

function egaliteConstante(a: string, b: string): boolean {
  const ta = Buffer.from(a, "utf8");
  const tb = Buffer.from(b, "utf8");
  if (ta.length !== tb.length) return false;
  return timingSafeEqual(ta, tb);
}

export interface DependancesTotp {
  readonly secrets: FournisseurSecretTotp;
  readonly pas: DepotPasTotp;
  readonly derive?: number;
}

/**
 * L'implémentation TOTP du second facteur.
 *
 * Fail-closed à chaque branche : format douteux, principal sans secret, secret
 * indécodable, code faux, pas déjà consommé — tout mène à `valide: false`.
 * Aucune branche ne rend `true` par défaut.
 */
export class SecondFacteurTotp implements SecondFacteur {
  constructor(private readonly deps: DependancesTotp) {}

  async verifier(demande: DemandeSecondFacteur): Promise<ResultatSecondFacteur> {
    const attenduChiffres = new RegExp(`^\\d{${String(CHIFFRES_TOTP)}}$`, "u");
    if (!attenduChiffres.test(demande.code)) {
      return { valide: false, motif: "format" };
    }

    const secretBase32 = await this.deps.secrets.secretPour(demande.principal);
    if (secretBase32 === null || secretBase32.length === 0) {
      // Un principal sans second facteur ne desserre pas : « pas de mode
      // dégradé » (§ 19, règle absolue), appliqué ici.
      return { valide: false, motif: "pas-de-second-facteur" };
    }

    const secret = decoderBase32(secretBase32);
    if (secret === null || secret.length === 0) {
      return { valide: false, motif: "pas-de-second-facteur" };
    }

    const derive = this.deps.derive ?? DERIVE_TOTP_PAS;
    const courant = pasTotp(demande.maintenant);

    let trouve: number | null = null;
    for (let ecart = -derive; ecart <= derive; ecart += 1) {
      if (egaliteConstante(codeTotp(secret, courant + ecart), demande.code)) {
        trouve = courant + ecart;
        break;
      }
    }

    if (trouve === null) {
      return { valide: false, motif: "code-faux" };
    }

    const accepte = await this.deps.pas.enregistrerPas(demande.principal, trouve);
    if (!accepte) {
      // Le code était bon — et il avait déjà servi. Pour un desserrage, c'est un
      // refus, pas un détail.
      return { valide: false, motif: "rejeu" };
    }

    return { valide: true, pas: trouve };
  }
}

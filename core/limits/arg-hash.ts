/**
 * axion-ops — `argHash` : l'empreinte d'un argument d'appel.
 *
 * ── La règle du § 12, règle 2, mot pour mot ───────────────────────────────
 * « `argHash` est un HMAC, pas un SHA nu. HMAC-SHA-256, clé issue du coffre,
 *   séparation de domaine par outil, fail-loud si la clé manque. »
 *
 * ── Pourquoi un HMAC ──────────────────────────────────────────────────────
 * Motif déjà en service dans le dépôt voisin
 * (`axionia/src/lib/security/email-hash.ts`) : « un SHA-256 nu d'adresse
 * e-mail se casse en quelques secondes ; un HMAC clé rend l'index inutilisable
 * pour qui obtiendrait un dump sans le secret ».
 *
 * Ici l'enjeu est le même en pire : `ops_audit.argHash` est écrit à CHAQUE
 * appel, y compris pour les refus. L'espace des arguments plausibles d'un
 * outil est PETIT — un identifiant de message, une adresse, une date. Un
 * SHA-256 nu du journal se retourne par force brute en quelques minutes, et
 * le journal cesse d'être une empreinte pour redevenir la donnée. Le § 31
 * range précisément `argHash` parmi ce qui est purgé à échéance : une valeur
 * réversible ne se purge pas, elle a déjà fui.
 *
 * ── Pourquoi la séparation de domaine PAR OUTIL ───────────────────────────
 * Sans elle, `zoho.mail.delete {"id":"42"}` et `zoho.mail.read {"id":"42"}`
 * portent la même empreinte. Deux conséquences :
 *  · le journal ne distingue plus la lecture de la suppression ;
 *  · le jeton de confirmation du § 20, « lié à l'`argHash` de l'appel exact »,
 *    délivré pour une lecture, vaudrait pour la suppression. Le garde-fou le
 *    plus fort du socle tomberait par une propriété de hachage.
 *
 * ── Pourquoi AUCUN repli de développement ─────────────────────────────────
 * `email-hash.ts` tolère une clé de développement parce qu'un index de
 * recherche cassé en local n'est qu'une gêne. Ici, une clé de repli produirait
 * des empreintes valides mais PUBLIQUES : quiconque lit ce fichier peut alors
 * forger l'`argHash` auquel un jeton de confirmation est lié. La clé manquante
 * lève, en développement comme en production. C'est le sens de « fail-loud ».
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { canoniser } from "./canonical.js";

/**
 * Sépare cet usage de la clé de tout autre usage, et PORTE SA VERSION : le
 * jour où le cadrage change, les empreintes changent avec lui plutôt que de se
 * mélanger en silence aux anciennes.
 */
export const DOMAINE_ARG_HASH = "axion-ops/argHash/v1";

/**
 * En deçà, la clé n'est pas une clé. 32 caractères est le plancher retenu
 * (256 bits d'entropie si la clé est aléatoire) ; c'est ce que doit produire
 * la génération du coffre.
 */
export const LONGUEUR_MINIMALE_CLE = 32;

/** Longueur d'un `argHash` : SHA-256 en hexadécimal. */
export const LONGUEUR_ARG_HASH = 64;

/** La clé du coffre est absente, vide, ou trop courte pour en être une. */
export class ErreurCleArgHash extends Error {
  constructor(motif: string) {
    super(
      `Clé d'argHash inutilisable (${motif}). ` +
        "Le socle refuse de calculer une empreinte : un SHA nu, ou une empreinte " +
        "calculée avec une clé de repli connue, laisserait forger le jeton de " +
        "confirmation du § 20. Renseigner le secret « argHash » du coffre.",
    );
    this.name = "ErreurCleArgHash";
  }
}

/** L'appel ne porte pas de nom d'outil exploitable. */
export class ErreurOutilSansNom extends Error {
  constructor() {
    super(
      "Calcul d'argHash demandé sans nom d'outil : la séparation de domaine " +
        "par outil du § 12 disparaîtrait, et un jeton de confirmation délivré " +
        "pour une lecture vaudrait pour une suppression.",
    );
    this.name = "ErreurOutilSansNom";
  }
}

/**
 * CE QUE `core/limits/` ATTEND DU COFFRE — interface DÉCLARÉE ICI, implémentée
 * par `core/vault/` (dossier d'un autre constructeur). Ce module ne
 * réimplémente pas le coffre ; il code contre ce contrat.
 *
 * La lecture est asynchrone parce que le déchiffrement du coffre l'est
 * (`ops_secret` : AES-GCM, AAD = `name‖version`).
 *
 * Elle rend `null` quand le secret n'existe pas — c'est au calcul, pas au
 * coffre, de décider que c'est fatal.
 */
export interface CoffreArgHash {
  /**
   * Rend la clé HMAC en clair, ou `null` si le secret n'est pas configuré.
   *
   * ⚠️ Rendre une chaîne VIDE plutôt que `null` est un cas réel : une variable
   *    d'environnement déclarée sans valeur dans Coolify n'est pas nullish.
   *    Le calcul teste donc la VÉRACITÉ, jamais seulement la nullité.
   */
  lireCleArgHash(): Promise<string | null | undefined>;
}

/** Le calculateur d'empreintes, une fois relié au coffre. */
export interface CalculArgHash {
  /**
   * Empreinte de `input` pour l'outil `tool`.
   *
   * @throws {ErreurCleArgHash} si la clé manque, est vide ou est trop courte.
   * @throws {ErreurOutilSansNom} si `tool` est vide.
   * @throws {ErreurCanonisation} si `input` n'est pas une valeur JSON.
   */
  calculer(tool: string, input: unknown): Promise<string>;

  /**
   * Compare deux empreintes À TEMPS CONSTANT.
   *
   * Une comparaison `===` sur un `argHash` fuit, par son temps de retour, le
   * nombre de caractères de tête devinés — de quoi construire une empreinte
   * cible caractère par caractère quand cette comparaison garde un jeton de
   * confirmation (§ 20).
   */
  correspond(a: string, b: string): boolean;
}

/**
 * Cadrage NON AMBIGU des morceaux du message. Chaque morceau est précédé de sa
 * longueur en octets.
 *
 * Pourquoi pas une simple concaténation avec un séparateur : `tool = "a"` +
 * `":"` + `"b:c"` et `tool = "a:b"` + `":"` + `"c"` produisent la MÊME chaîne.
 * La séparation de domaine ne tiendrait alors que par la promesse qu'aucun nom
 * d'outil ne contient le séparateur — une promesse qu'aucun code ne vérifie.
 * Le préfixe de longueur la rend structurelle.
 */
function cadrer(parties: readonly string[]): Buffer {
  const morceaux: Buffer[] = [];
  for (const partie of parties) {
    const octets = Buffer.from(partie, "utf8");
    morceaux.push(Buffer.from(`${String(octets.byteLength)}:`, "utf8"), octets);
  }
  return Buffer.concat(morceaux);
}

/**
 * Le message HMACé, exposé pour que les gardes puissent l'inspecter sans
 * connaître la clé. Il ne contient AUCUN secret.
 */
export function messageArgHash(tool: string, input: unknown): Buffer {
  if (tool.trim().length === 0) throw new ErreurOutilSansNom();
  return cadrer([DOMAINE_ARG_HASH, tool, canoniser(input)]);
}

/** Relie le calcul au coffre. */
export function creerCalculArgHash(coffre: CoffreArgHash): CalculArgHash {
  return {
    async calculer(tool: string, input: unknown): Promise<string> {
      // Le message est construit AVANT la lecture de la clé : un nom d'outil
      // vide ou une charge non canonisable doivent lever pour ce qu'ils sont,
      // pas pour un défaut de configuration.
      const message = messageArgHash(tool, input);

      // La clé est relue à CHAQUE appel, jamais mémorisée : le § 25 la range
      // dans la liste de rotation, et un cache de processus servirait l'ancienne
      // clé jusqu'au prochain redémarrage — une rotation qui ne tourne pas.
      const brute = await coffre.lireCleArgHash();

      // Test de VÉRACITÉ, pas `??` : une variable déclarée mais VIDE n'est pas
      // nullish (leçon de `email-hash.ts`, en-tête).
      const cle = typeof brute === "string" ? brute.trim() : "";
      if (cle.length === 0) throw new ErreurCleArgHash("absente ou vide");
      if (cle.length < LONGUEUR_MINIMALE_CLE) {
        throw new ErreurCleArgHash(
          `${String(cle.length)} caractères, minimum ${String(LONGUEUR_MINIMALE_CLE)}`,
        );
      }

      return createHmac("sha256", cle).update(message).digest("hex");
    },

    correspond(a: string, b: string): boolean {
      const ba = Buffer.from(a, "utf8");
      const bb = Buffer.from(b, "utf8");
      // `timingSafeEqual` lève sur des longueurs différentes — ce qui fuirait
      // la longueur. On tranche AVANT, et la longueur d'un argHash est fixe
      // de toute façon.
      if (ba.byteLength !== bb.byteLength) return false;
      return timingSafeEqual(ba, bb);
    },
  };
}

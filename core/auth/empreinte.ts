/**
 * `core/auth/empreinte.ts` — **`ops_token.tokenHash` EST UN HMAC CLÉ PAR LE
 * COFFRE, JAMAIS UN SHA SALÉ.**
 *
 * ═══ CE QUE L'ADR 0027 A TRANCHÉ, ET CONTRE QUOI ═══
 *
 * Le § 12 écrit « empreinte SHA-256 **salée** ». **Un sel par ligne ne protège
 * pas un extrait de base : il vit dans la même ligne que l'empreinte.** Qui
 * obtient la table obtient le sel avec elle, et un jeton est une chaîne d'un
 * espace connu — la même situation que l'`argHash`, en pire : ici, retrouver la
 * valeur, c'est retrouver LE JETON.
 *
 * La règle 2 du même § 12 avait déjà tranché le cas jumeau : « HMAC-SHA-256, clé
 * issue du coffre, séparation de domaine, **fail-loud si la clé manque** ».
 * `tokenHash` suit la même règle (ADR 0027, point 7).
 *
 * ═══ CE MODULE DÉRIVE DE `core/limits/arg-hash.ts`, IL NE LE RECOPIE PAS ═══
 *
 * Trois choses lui sont EMPRUNTÉES, pas réécrites :
 *
 *  · le plancher de longueur de clé ({@link LONGUEUR_MINIMALE_CLE}) ;
 *  · la longueur d'une empreinte ({@link LONGUEUR_ARG_HASH}) — c'est le même
 *    SHA-256 en hexadécimal, et deux constantes vaudraient deux vérités ;
 *  · le CADRAGE non ambigu des morceaux du message, préfixés par leur longueur.
 *
 * ⚠️ **LE CADRAGE EST LA SEULE CHOSE QUE CE MODULE RÉÉCRIT, PARCE QU'ELLE N'EST
 *    PAS EXPORTÉE LÀ-BAS — ET LA DIVERGENCE EST MESURÉE, PAS PROMISE.**
 *    `core/auth/empreinte.spec.ts` confronte {@link cadrerPourEmpreinte} à
 *    `messageArgHash()` sur des morceaux identiques et exige des octets
 *    IDENTIQUES. Le jour où `core/limits/` change sa façon de cadrer, ce test
 *    rougit ici — c'est-à-dire à l'endroit qui a copié, et non à l'endroit qui a
 *    changé. Une phrase « même discipline » n'aurait rien tenu du tout.
 *
 * ═══ POURQUOI UNE SÉPARATION DE DOMAINE PAR **GENRE** DE JETON ═══
 *
 * Sans elle, un jeton d'accès et un jeton de rafraîchissement portant la même
 * chaîne produisent la même empreinte. Deux conséquences, et la seconde est la
 * grave :
 *
 *  · `ops_token.tokenHash` est UNIQUE : deux lignes se heurteraient ;
 *  · la détection de rejeu de l'ADR 0027 cherche un **refresh** révoqué. Une
 *    empreinte qui ne distingue pas le genre ferait qu'un jeton d'accès révoqué,
 *    représenté au rafraîchissement, déclencherait la révocation de toute la
 *    chaîne d'octroi. La protection se retournerait en déni de service.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { LONGUEUR_ARG_HASH, LONGUEUR_MINIMALE_CLE } from "../limits/arg-hash.js";
import type { GenreDeJeton } from "./depot.js";

/**
 * Sépare cet usage de la clé de tout autre, et PORTE SA VERSION : le jour où le
 * cadrage change, les empreintes changent avec lui plutôt que de se mélanger en
 * silence aux anciennes.
 */
export const DOMAINE_TOKEN_HASH = "axion-ops/tokenHash/v1";

/**
 * La longueur d'un `tokenHash`, DÉRIVÉE de celle de l'`argHash` : c'est le même
 * SHA-256 rendu en hexadécimal. Deux constantes vaudraient deux vérités, et
 * c'est la seconde qui ne suivrait pas.
 */
export const LONGUEUR_TOKEN_HASH = LONGUEUR_ARG_HASH;

/**
 * Le plancher de la clé, DÉRIVÉ lui aussi. 32 caractères, soit 256 bits si la
 * clé est aléatoire.
 */
export const LONGUEUR_MINIMALE_CLE_TOKEN_HASH = LONGUEUR_MINIMALE_CLE;

/**
 * La clé du coffre est absente, vide, ou trop courte pour en être une.
 *
 * ⚠️ **AUCUN REPLI DE DÉVELOPPEMENT, POUR UNE RAISON PLUS FORTE QUE CELLE DE
 *    L'`argHash`.** Une clé de repli connue rendrait les empreintes FORGEABLES :
 *    qui lit ce dépôt public pourrait alors calculer l'empreinte d'un jeton
 *    qu'il choisit, l'insérer s'il obtient l'écriture, et se donner un jeton
 *    valide. La clé manquante lève, en développement comme en production.
 */
export class ErreurCleEmpreinteDeJeton extends Error {
  public constructor(motif: string) {
    super(
      `Clé d'empreinte de jeton inutilisable (${motif}). ` +
        "Le socle refuse d'émettre ou de relire un jeton : un SHA nu, ou une empreinte " +
        "calculée avec une clé de repli connue, laisserait forger un jeton valide. " +
        "Renseigner le secret d'empreinte des jetons dans le coffre, puis redémarrer.",
    );
    this.name = "ErreurCleEmpreinteDeJeton";
  }
}

/**
 * CE QUE `core/auth/` ATTEND DU COFFRE — interface DÉCLARÉE ICI, implémentée par
 * `core/vault/` (dossier d'un autre constructeur).
 *
 * ⚠️ **CE MODULE NE CONNAÎT PAS LE NOM DU SECRET, ET C'EST LE MOTIF ÉCRIT DANS
 *    `core/vault/coffre.ts` :** « c'est le coffre qui répond à *sous quel nom, en
 *    quelle version* ; s'il le connaissait aussi, deux endroits décideraient de
 *    la même chose et le jour d'une rotation l'un des deux serait oublié ».
 *    `core/limits/arg-hash.ts` déclare `CoffreArgHash` exactement de la même
 *    façon ; ce port en est le jumeau, pas une variante.
 *
 * ⚠️ **CONSÉQUENCE ASSUMÉE (ADR 0027, point 7) : SOUS COFFRE VERROUILLÉ,
 *    `/auth/token` NE RÉPOND PAS.** C'est cohérent avec le § 23 — la console et
 *    le déverrouillage répondent, tout appel d'outil est refusé — et l'émission
 *    ne sert que `/api/mcp`, qui refuse tout de toute façon (étape 0,
 *    `vault_locked`). Le matériel d'authentification de la CONSOLE, lui, n'entre
 *    jamais dans le coffre (§ 21) : c'est ce qui permet de se connecter POUR
 *    déverrouiller.
 */
export interface CoffreEmpreinteDeJeton {
  /**
   * Rend la clé HMAC en clair, ou `null`/`undefined` si le secret n'est pas
   * configuré.
   *
   * ⚠️ Rendre une chaîne VIDE plutôt que `null` est un cas réel : une variable
   *    déclarée sans valeur n'est pas nullish. Le calcul teste donc la VÉRACITÉ,
   *    jamais seulement la nullité.
   */
  lireCleEmpreinteDeJeton(): Promise<string | null | undefined>;
}

/**
 * Cadrage NON AMBIGU des morceaux du message. Chaque morceau est précédé de sa
 * longueur en octets.
 *
 * Pourquoi pas une concaténation avec un séparateur : `genre = "a"` + `":"` +
 * `"b:c"` et `genre = "a:b"` + `":"` + `"c"` produisent la MÊME chaîne. La
 * séparation de domaine ne tiendrait alors que par la promesse qu'aucune valeur
 * ne contient le séparateur — une promesse qu'aucun code ne vérifie. Le préfixe
 * de longueur la rend structurelle.
 *
 * ⚠️ EXPORTÉE POUR ÊTRE CONFRONTÉE. Voir l'en-tête : c'est le test qui tient
 *    l'accord avec `core/limits/`, pas un commentaire.
 */
export function cadrerPourEmpreinte(parties: readonly string[]): Buffer {
  const morceaux: Buffer[] = [];
  for (const partie of parties) {
    const octets = Buffer.from(partie, "utf8");
    morceaux.push(Buffer.from(`${String(octets.byteLength)}:`, "utf8"), octets);
  }
  return Buffer.concat(morceaux);
}

/** Le jeton présenté est vide — rien à empreindre. */
export class ErreurJetonSansValeur extends Error {
  public constructor() {
    super(
      "Empreinte de jeton demandée sur une valeur vide. Une empreinte de chaîne vide est " +
        "une empreinte CONSTANTE : toutes les lignes qui la porteraient se heurteraient sur " +
        "l'unicité de `ops_token.tokenHash`, et un jeton vide vaudrait pour toutes.",
    );
    this.name = "ErreurJetonSansValeur";
  }
}

/**
 * Le message HMACé, exposé pour que les gardes puissent l'inspecter sans
 * connaître la clé. **Il porte le jeton en clair** — il ne sort donc jamais de
 * ce processus, et aucun appelant ne doit le journaliser.
 */
export function messageEmpreinteDeJeton(genre: GenreDeJeton, jetonEnClair: string): Buffer {
  if (jetonEnClair.length === 0) throw new ErreurJetonSansValeur();
  return cadrerPourEmpreinte([DOMAINE_TOKEN_HASH, genre, jetonEnClair]);
}

/** Le calculateur d'empreintes, une fois relié au coffre. */
export interface CalculEmpreinteDeJeton {
  /**
   * Empreinte du jeton, pour ce genre.
   *
   * @throws {ErreurCleEmpreinteDeJeton} si la clé manque, est vide ou trop courte.
   * @throws {ErreurJetonSansValeur} si le jeton est vide.
   */
  calculer(genre: GenreDeJeton, jetonEnClair: string): Promise<string>;

  /**
   * Compare deux empreintes À TEMPS CONSTANT.
   *
   * Une comparaison `===` fuit, par son temps de retour, le nombre de caractères
   * de tête devinés — de quoi construire une empreinte cible caractère par
   * caractère quand cette comparaison garde l'accès à un jeton.
   */
  correspond(a: string, b: string): boolean;
}

/**
 * Relie le calcul au coffre.
 *
 * ⚠️ **LA CLÉ EST RELUE À CHAQUE APPEL, JAMAIS MÉMORISÉE.** Le § 25 la range
 *    dans la liste de rotation, et un cache de processus servirait l'ancienne
 *    clé jusqu'au prochain redémarrage — une rotation qui ne tourne pas. C'est
 *    le choix déjà fait par `creerCalculArgHash`, et pour la même raison.
 */
export function creerCalculEmpreinteDeJeton(
  coffre: CoffreEmpreinteDeJeton,
): CalculEmpreinteDeJeton {
  return {
    async calculer(genre: GenreDeJeton, jetonEnClair: string): Promise<string> {
      // Le message est construit AVANT la lecture de la clé : un jeton vide doit
      // lever pour ce qu'il est, pas pour un défaut de configuration.
      const message = messageEmpreinteDeJeton(genre, jetonEnClair);

      const brute = await coffre.lireCleEmpreinteDeJeton();

      // Test de VÉRACITÉ, pas `??` : une variable déclarée mais VIDE n'est pas
      // nullish. C'est le mode de défaillance mesuré dans `ops/secrets.ts`.
      const cle = typeof brute === "string" ? brute.trim() : "";
      if (cle.length === 0) throw new ErreurCleEmpreinteDeJeton("absente ou vide");
      if (cle.length < LONGUEUR_MINIMALE_CLE_TOKEN_HASH) {
        throw new ErreurCleEmpreinteDeJeton(
          `${String(cle.length)} caractères, minimum ${String(LONGUEUR_MINIMALE_CLE_TOKEN_HASH)}`,
        );
      }

      return createHmac("sha256", cle).update(message).digest("hex");
    },

    correspond(a: string, b: string): boolean {
      const ba = Buffer.from(a, "utf8");
      const bb = Buffer.from(b, "utf8");
      // `timingSafeEqual` lève sur des longueurs différentes — ce qui fuirait la
      // longueur. On tranche AVANT ; la longueur d'une empreinte est fixe de
      // toute façon.
      if (ba.byteLength !== bb.byteLength) return false;
      return timingSafeEqual(ba, bb);
    },
  };
}

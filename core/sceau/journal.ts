/**
 * `core/sceau/journal.ts` — LE SCELLEMENT DE LA CHAÎNE D'`ops_audit`.
 *
 * ADR 0002, seconde moitié. La première est le rôle PostgreSQL en ajout seul
 * (`prisma/sql/0001-ops-audit-append-only.sql`) ; celle-ci est la défense en
 * profondeur qui tient MÊME SI cette première moitié tombe.
 *
 * ═══ LE DÉFAUT, EN UNE PHRASE ═══
 *
 * Le `selfHash` d'`ops_audit` était un SHA-256 NU. Un chaînage par SHA nu rend
 * une réécriture visible à condition que l'attaquant ne puisse pas RECALCULER
 * la chaîne — or n'importe qui peut recalculer un SHA nu. Retirer une tranche
 * puis recalculer chaque empreinte à partir de la précédente donnait un journal
 * amputé sur lequel `verifierChaine` rendait `valide = true`.
 *
 * Avec un HMAC, recalculer exige LA CLÉ. Un attaquant qui obtient l'écriture en
 * base ne l'a pas ; un attaquant qui obtient le processus du socle l'a, mais
 * n'a ni `UPDATE` ni `DELETE` (première moitié de l'ADR). Il faut les deux,
 * séparément.
 *
 * ═══ POURQUOI CE FICHIER N'EST PAS DANS `core/audit/` ═══
 *
 * `core/audit/derivation.spec.ts` porte une garde qui échoue si un fichier de
 * ce dossier appelle `createHmac`, et son motif est bon : `argHash` est un HMAC
 * fourni par `core/limits`, et une seconde implémentation là-bas serait une
 * seconde clé pour le même usage. Ce module-ci est un usage DIFFÉRENT, avec une
 * clé différente — mais le mettre dans `core/audit/` obligerait soit à
 * désarmer cette garde, soit à lui écrire une exception à la main,
 * c'est-à-dire un trou. Il vit donc à côté, `core/audit` en déclare le PORT
 * (`ScelleurJournal`, dans `ports.ts`) et code contre lui.
 *
 * ═══ ⚠️ CETTE CLÉ NE SE « TOURNE » PAS COMME LES AUTRES ═══
 *
 * Le § 25 tient une liste de clés à faire tourner. Celle-ci y entre avec une
 * réserve qui n'a pas d'équivalent :
 *
 *   **une rotation de cette clé rend INVÉRIFIABLE tout le journal scellé avec
 *   l'ancienne.**
 *
 * Ce n'est pas un défaut de conception, c'est la propriété même qu'on cherche :
 * si l'ancienne clé suffisait à valider les anciennes lignes, il suffirait de
 * la garder pour recalculer la chaîne. Trois conséquences, toutes à tenir :
 *
 *  1. l'ANCIENNE clé se GARDE — hors ligne, séquestrée (§ 25) — tant que le
 *     journal qu'elle a scellé est conservé. Le § 31 archive douze mois ;
 *  2. la version de clé doit pouvoir être lue par ligne, sinon on ne sait pas
 *     avec quelle clé vérifier quoi. Aujourd'hui, `ops_audit` ne porte AUCUNE
 *     colonne de version de clé. **Écart assumé, écrit avec sa borne** : tant
 *     qu'il n'y a eu qu'une clé, la question ne se pose pas ; à la première
 *     rotation, elle se pose ENTIÈREMENT, et une colonne de plus changerait
 *     l'empreinte chaînée. Voir ADR 0002, « ce qui reste ouvert » ;
 *  3. la clé est donc LUE UNE FOIS, à la composition, et non à chaque appel —
 *     à l'inverse de celle de l'`argHash`, dont la relecture systématique est
 *     ce qui rend sa rotation effective. Ici une relecture ne servirait à rien,
 *     puisqu'un changement de clé casse la chaîne plutôt que de la continuer.
 *
 * ═══ AUCUN REPLI ═══
 *
 * Une clé de secours connue permettrait de forger la chaîne entière : ce module
 * échoue bruyamment si elle manque, est vide, ou est trop courte. Même règle
 * que `core/limits/arg-hash.ts`, et pour un enjeu plus grand encore.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { ScelleurJournal } from "../audit/ports.js";

/**
 * Sépare cet usage de tout autre usage de clé du socle, ET PORTE SA VERSION.
 *
 * Sans séparation de domaine, une clé partagée avec l'`argHash` ferait qu'une
 * empreinte d'arguments et une empreinte de ligne se confondraient — et le
 * § 31 purge l'`argHash` alors que le chaînage, lui, doit survivre.
 */
export const DOMAINE_SCEAU_JOURNAL = "axion-ops/ops_audit/selfHash/v1";

/**
 * En deçà, la clé n'est pas une clé. 32 caractères — 256 bits si la clé est
 * aléatoire. Même plancher que `core/limits/arg-hash.ts`, et pour le même
 * motif : c'est ce que la génération du coffre doit produire.
 */
export const LONGUEUR_MINIMALE_CLE = 32;

/** Longueur d'un sceau : SHA-256 en hexadécimal. */
export const LONGUEUR_SCEAU = 64;

/** La clé du coffre est absente, vide, ou trop courte pour en être une. */
export class ErreurCleSceauJournal extends Error {
  public constructor(motif: string) {
    super(
      `Clé de scellement du journal inutilisable (${motif}). ` +
        "Le socle refuse de chaîner : un SHA nu, ou une empreinte calculée avec une clé " +
        "de repli connue, laisserait retirer une tranche d'`ops_audit` PUIS recalculer " +
        "toute la chaîne — et `verifierChaine` rendrait alors « valide » sur un journal " +
        "amputé. Renseigner le secret de scellement du coffre (§ 25).",
    );
    this.name = "ErreurCleSceauJournal";
  }
}

/**
 * CE QUE `core/sceau/` ATTEND DU COFFRE — interface DÉCLARÉE ICI, implémentée
 * par `core/vault/`.
 *
 * Elle rend `null` quand le secret n'existe pas : c'est au scellement, et non
 * au coffre, de décider que l'absence est fatale.
 *
 * ⚠️ Elle peut rendre une chaîne VIDE plutôt que `null` — une variable
 *    d'environnement déclarée sans valeur n'est pas nullish. Le contrôle porte
 *    donc sur la VÉRACITÉ, jamais seulement sur la nullité.
 */
export interface CoffreSceauJournal {
  lireCleSceauJournal(): Promise<string | null | undefined>;
}

/**
 * Cadrage NON AMBIGU des morceaux du message : chaque morceau est précédé de sa
 * longueur en octets.
 *
 * Pourquoi pas une concaténation avec un séparateur : `prevHash` a beau être de
 * longueur fixe aujourd'hui, une évolution de format — préfixe tronqué,
 * empreinte d'un autre algorithme — rouvrirait la porte à deux couples
 * différents produisant la même chaîne. Le préfixe de longueur le rend
 * structurel. Même motif que `core/limits/arg-hash.ts`.
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
 * Le message scellé, exposé pour que les gardes puissent l'inspecter SANS
 * connaître la clé. Il ne contient aucun secret.
 */
export function messageDuSceau(message: string): Buffer {
  return cadrer([DOMAINE_SCEAU_JOURNAL, message]);
}

/**
 * Construit un scelleur à partir d'une clé DÉJÀ LUE.
 *
 * ⚠️ SYNCHRONE, ET C'EST UNE DÉCISION. `verifierChaine` parcourt des tranches
 *    de journal ligne à ligne ; un scellement asynchrone en ferait une fonction
 *    asynchrone, et la vérification d'une archive de douze mois (§ 31)
 *    deviendrait une chaîne de promesses par ligne. La clé est donc lue UNE
 *    FOIS, à la composition — voir `scelleurDepuisCoffre` — ce que la nature de
 *    cette clé autorise, et que celle de l'`argHash` n'autoriserait pas.
 *
 * @throws {ErreurCleSceauJournal} si la clé manque, est vide, ou est trop courte.
 */
export function creerScelleurJournal(cleBrute: string | null | undefined): ScelleurJournal {
  // Test de VÉRACITÉ, pas `??` : une variable déclarée mais VIDE n'est pas
  // nullish, et une clé vide produirait un HMAC parfaitement stable et public.
  const cle = typeof cleBrute === "string" ? cleBrute.trim() : "";
  if (cle.length === 0) throw new ErreurCleSceauJournal("absente ou vide");
  if (cle.length < LONGUEUR_MINIMALE_CLE) {
    throw new ErreurCleSceauJournal(
      `${String(cle.length)} caractères, minimum ${String(LONGUEUR_MINIMALE_CLE)}`,
    );
  }

  return {
    sceller(message: string): string {
      return createHmac("sha256", cle).update(messageDuSceau(message)).digest("hex");
    },

    correspond(a: string, b: string): boolean {
      const ba = Buffer.from(a, "utf8");
      const bb = Buffer.from(b, "utf8");
      // `timingSafeEqual` lève sur des longueurs différentes, ce qui fuirait la
      // longueur. On tranche AVANT ; celle d'un sceau est fixe de toute façon.
      if (ba.byteLength !== bb.byteLength) return false;
      return timingSafeEqual(ba, bb);
    },
  };
}

/**
 * Lit la clé dans le coffre, UNE FOIS, et rend le scelleur.
 *
 * C'est le point de composition : il n'y en a qu'un, et il est asynchrone
 * parce que le déchiffrement du coffre l'est. Tout le reste du socle reçoit un
 * `ScelleurJournal` déjà construit.
 *
 * @throws {ErreurCleSceauJournal} si le coffre ne rend aucune clé exploitable.
 */
export async function scelleurDepuisCoffre(coffre: CoffreSceauJournal): Promise<ScelleurJournal> {
  return creerScelleurJournal(await coffre.lireCleSceauJournal());
}

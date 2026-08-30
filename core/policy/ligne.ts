/**
 * core/policy/ligne.ts — une ligne d'`ops_policy`, et ce qui la rend LISIBLE.
 *
 * § 12 : aucune ligne n'est jamais supprimée. Un desserrage remplacé est marqué
 * `supersededAt` — sans cette colonne, l'écran montre un desserrage périmé comme
 * courant.
 *
 * § 20, protection 4 : panne, corruption ou redémarrage → niveau le plus
 * strict, avec une ligne d'historique `setBy: "boot"`. JAMAIS le dernier niveau
 * connu.
 */

import { POLICY_LEVELS, type PolicyLevel } from "../types.js";
import { analyserScope } from "./scope.js";

/**
 * Le miroir exact du modèle `OpsPolicy` de `prisma/schema.prisma`.
 *
 * ⚠️ `schema.spec.ts` DÉRIVE la liste des champs scalaires du schéma Prisma
 *    lui-même et vérifie que chacun figure ici. Un champ ajouté au schéma et
 *    oublié ici fait rougir cette garde ; sans elle, le calcul du niveau
 *    tournerait sur une vue partielle de la table sans qu'un mot le dise.
 */
export interface LignePolitique {
  readonly id: string;
  readonly level: PolicyLevel;
  /** `*` | `<adapterId>.*` | `<adapterId>.<tool>` — grammaire du § 12. */
  readonly scope: string;
  /** Par quel canal le changement est arrivé. Sans lui, le second facteur est
   *  INAUDITABLE (§ 12). */
  readonly channel: string;
  /** § 20 — `libre` porte TOUJOURS une durée. `null` n'est licite que pour un
   *  resserrage, qui n'expire pas. */
  readonly expiresAt: Date | null;
  /** Remplacée par une ligne postérieure. Historique, jamais suppression. */
  readonly supersededAt: Date | null;
  readonly setBy: string;
  readonly setAt: Date;
  readonly reason: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Lisibilité
// ═════════════════════════════════════════════════════════════════════════════

/** Une anomalie de lecture : l'identifiant fautif, et ce qui cloche. */
export interface AnomalieLigne {
  readonly id: string;
  readonly motif: string;
}

function estUneDate(valeur: unknown): valeur is Date {
  return valeur instanceof Date && Number.isFinite(valeur.getTime());
}

/**
 * Contrôle STRUCTUREL : les champs qui décident si la ligne est encore en
 * vigueur sont-ils seulement lisibles ?
 *
 * Il est séparé du contrôle SÉMANTIQUE parce qu'on ne peut pas savoir si une
 * ligne est expirée avant d'avoir pu lire sa date d'expiration. Une ligne dont
 * les dates sont illisibles est INCLASSABLE : elle empoisonne le calcul, et
 * c'est voulu — l'ignorer reviendrait à retirer un plancher.
 */
export function anomaliesStructurelles(ligne: LignePolitique): readonly AnomalieLigne[] {
  const anomalies: AnomalieLigne[] = [];
  const id = ligne.id.length > 0 ? ligne.id : "(sans identifiant)";

  if (ligne.id.length === 0) {
    anomalies.push({ id, motif: "identifiant vide" });
  }
  if (!estUneDate(ligne.setAt)) {
    anomalies.push({ id, motif: "`setAt` n'est pas une date lisible" });
  }
  if (ligne.expiresAt !== null && !estUneDate(ligne.expiresAt)) {
    anomalies.push({ id, motif: "`expiresAt` n'est ni nul ni une date lisible" });
  }
  if (ligne.supersededAt !== null && !estUneDate(ligne.supersededAt)) {
    anomalies.push({ id, motif: "`supersededAt` n'est ni nul ni une date lisible" });
  }

  return anomalies;
}

/**
 * Contrôle SÉMANTIQUE, appliqué aux seules lignes encore en vigueur : le niveau
 * est-il l'un des trois, le scope est-il dans la grammaire, et `libre`
 * porte-t-il bien la durée que le § 20 lui impose TOUJOURS ?
 */
export function anomaliesSemantiques(ligne: LignePolitique): readonly AnomalieLigne[] {
  const anomalies: AnomalieLigne[] = [];
  const id = ligne.id;

  // Liste DÉRIVÉE de `POLICY_LEVELS` : un niveau ajouté au socle est reconnu
  // ici sans qu'aucune liste soit à retoucher.
  if (!(POLICY_LEVELS as readonly string[]).includes(ligne.level)) {
    anomalies.push({ id, motif: `niveau « ${String(ligne.level)} » inconnu` });
  }

  const scope = analyserScope(ligne.scope);
  if (!scope.valide) {
    anomalies.push({ id, motif: scope.motif });
  }

  if (ligne.level === "libre" && ligne.expiresAt === null) {
    anomalies.push({
      id,
      motif: "`libre` sans `expiresAt` — le § 20 lui impose TOUJOURS une durée",
    });
  }

  if (ligne.channel.length === 0) {
    anomalies.push({ id, motif: "`channel` vide — le second facteur en devient inauditable" });
  }

  return anomalies;
}

/**
 * La ligne est-elle encore en vigueur À CET INSTANT ?
 *
 * § 20, protection 3 : le TTL est évalué PARESSEUSEMENT à l'appel, jamais par
 * une tâche de fond. C'est ici, et nulle part ailleurs, que l'heure entre dans
 * le calcul — et l'écran de console dérive du même appel.
 */
export function ligneEnVigueur(ligne: LignePolitique, maintenant: Date): boolean {
  if (ligne.supersededAt !== null) return false;
  if (ligne.expiresAt === null) return true;
  return ligne.expiresAt.getTime() > maintenant.getTime();
}

// ═════════════════════════════════════════════════════════════════════════════
//  Fail-closed : la ligne de démarrage
// ═════════════════════════════════════════════════════════════════════════════

/** `ops_policy.setBy` de la ligne écrite au démarrage. Le § 20 la nomme. */
export const SET_BY_DEMARRAGE = "boot";

/** `ops_policy.channel` de cette même ligne — elle n'est arrivée par aucun canal
 *  humain, et l'écrire évite de la confondre avec un resserrage volontaire. */
export const CANAL_DEMARRAGE = "boot";

/**
 * La ligne posée à chaque démarrage, et à chaque fois que la politique est
 * illisible ou corrompue.
 *
 * Elle porte le niveau LE PLUS STRICT — dérivé de la tête de `POLICY_LEVELS`,
 * jamais recopié —, le scope le plus large, et aucune expiration : un
 * resserrage n'expire pas.
 */
export function ligneDeDemarrage(
  maintenant: Date,
  motif: string,
  id = `boot-${String(maintenant.getTime())}`,
): LignePolitique {
  const leplusStrict: PolicyLevel = POLICY_LEVELS[0];
  return {
    id,
    level: leplusStrict,
    scope: "*",
    channel: CANAL_DEMARRAGE,
    expiresAt: null,
    supersededAt: null,
    setBy: SET_BY_DEMARRAGE,
    setAt: maintenant,
    reason: motif,
  };
}

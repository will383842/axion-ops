/**
 * `core/audit/cloture.ts` — LA LIGNE DE CLÔTURE DE PURGE (§ 31).
 *
 * « La purge scelle la tranche retirée par une ligne de clôture portant
 * l'empreinte de la dernière ligne conservée et le compte de lignes retirées.
 * Le vérificateur n'accepte un saut que s'il est ancré. »
 *
 * ⚠️ LE DÉFAUT MAISON À NE PAS RECOPIER — `axionia/src/lib/knowledge/audit-log.ts:122`
 *    fait `let prev = entries[0]!.prevHash`, c'est-à-dire qu'il ADOPTE le
 *    `prevHash` de la première ligne qu'on lui donne comme s'il était acquis.
 *    Conséquence : retirer les mille premières lignes d'un journal ne casse
 *    RIEN — le vérificateur repart de la 1001ᵉ et déclare la chaîne valide.
 *    Une troncature de tête est pourtant l'attaque la plus simple qui soit sur
 *    un journal : elle efface le début d'une intrusion.
 *
 * CE QU'ON FAIT À LA PLACE : la première ligne d'un journal intègre a
 * `prevHash === null`. Si elle porte une empreinte, c'est qu'il manque quelque
 * chose devant — et cela n'est acceptable QUE si une ligne de clôture atteste
 * la tranche manquante, en nommant l'empreinte de sa dernière ligne.
 *
 * ═══ OÙ VIT LA CHARGE DE CLÔTURE ═══
 *
 * `ops_audit` (§ 12) n'a AUCUNE colonne pour cette charge, et `prisma/schema.prisma`
 * est posé par la Fondation : ce module n'y touche pas. La charge est donc
 * encodée dans `partialSources` — seule colonne libre de type `String[]` qui ne
 * porte pas d'identifiant pseudonyme (`recordIds` en porte, § 12 règle 3, et
 * la mélanger avec autre chose casserait sa purge). L'encodage est explicite,
 * versionné, et lu par un seul décodeur : le jour où la Recette ajoutera une
 * colonne dédiée, `encoderCharge`/`decoderCharge` sont les deux seuls points à
 * reprendre. Écart signalé au rapport.
 */

import type { AppelStep } from "../types.js";
import type { ContenuLigne, LigneAudit } from "./vocabulaire.js";
import { FORME_EMPREINTE, OUTIL_CLOTURE, PRINCIPAL_SYSTEME } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  La charge
// ═════════════════════════════════════════════════════════════════════════════

/** Version de l'encodage. Un décodeur qui ne la reconnaît pas REFUSE l'ancre. */
export const VERSION_CLOTURE = "1";

/**
 * Ce qu'une ligne de clôture ATTESTE.
 *
 * Les cinq champs ne sont pas redondants : `empreinteAvantSaut` et
 * `empreinteDerniereRetiree` bornent le trou (c'est ce qui rend le saut
 * vérifiable), `lignesRetirees` le chiffre (c'est ce que le § 31 demande), et
 * `empreinteDerniereConservee` est la formulation littérale du § 31 —
 * l'empreinte de la dernière ligne conservée au moment de la purge. Cette
 * dernière est structurellement le `prevHash` de la ligne de clôture elle-même ;
 * la répéter dans la charge lui donne un travail : `verifierChaine` confronte
 * les deux, et une clôture fabriquée après coup, recopiée d'une autre purge,
 * ne peut pas satisfaire les deux à la fois.
 */
export interface ChargeCloture {
  /** `seq` de la première ligne retirée. */
  readonly seqDepuis: bigint;
  /** `seq` de la dernière ligne retirée. */
  readonly seqJusqua: bigint;
  /**
   * Lignes physiquement retirées par CETTE purge, clôtures antérieures
   * comprises.
   */
  readonly lignesRetirees: number;
  /**
   * Total attesté depuis l'origine du journal : les lignes retirées ici, PLUS
   * celles qu'attestaient les clôtures que cette purge a elle-même emportées.
   * Sans ce cumul, la deuxième purge efface le compte de la première et le
   * journal ne sait plus combien de lignes ont disparu en tout.
   */
  readonly lignesRetireesCumulees: number;
  /**
   * `selfHash` de la ligne qui PRÉCÈDE la tranche retirée, ou `null` si la
   * tranche commençait à l'origine du journal. C'est la borne gauche du trou.
   */
  readonly empreinteAvantSaut: string | null;
  /**
   * `selfHash` de la DERNIÈRE ligne retirée. C'est la borne droite : la
   * première ligne survivante doit porter exactement cette valeur en
   * `prevHash`. Sans elle, une troncature de tête reste indétectable.
   */
  readonly empreinteDerniereRetiree: string;
  /**
   * § 31, mot pour mot — l'empreinte de la dernière ligne conservée au moment
   * de la purge. C'est la pointe du journal juste avant que la clôture ne soit
   * ajoutée, donc le `prevHash` de la clôture elle-même.
   */
  readonly empreinteDerniereConservee: string | null;
}

/** Sentinelle d'un champ d'empreinte nul. Sans ambiguïté : l'hexadécimal ne la produit pas. */
const NUL = "-";

const CHAMPS_CHARGE = [
  "cloture",
  "seqDepuis",
  "seqJusqua",
  "lignesRetirees",
  "lignesRetireesCumulees",
  "empreinteAvantSaut",
  "empreinteDerniereRetiree",
  "empreinteDerniereConservee",
] as const;

// ═════════════════════════════════════════════════════════════════════════════
//  Encodage / décodage
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Encode la charge en une liste de `clé=valeur`, dans l'ordre de
 * `CHAMPS_CHARGE`. Aucun espace : la garde de contenu du § 31 refuse tout ce
 * qui en porte, et la clôture ne fait pas exception à sa propre règle.
 */
export function encoderCharge(charge: ChargeCloture): readonly string[] {
  return [
    `cloture=${VERSION_CLOTURE}`,
    `seqDepuis=${charge.seqDepuis.toString()}`,
    `seqJusqua=${charge.seqJusqua.toString()}`,
    `lignesRetirees=${String(charge.lignesRetirees)}`,
    `lignesRetireesCumulees=${String(charge.lignesRetireesCumulees)}`,
    `empreinteAvantSaut=${charge.empreinteAvantSaut ?? NUL}`,
    `empreinteDerniereRetiree=${charge.empreinteDerniereRetiree}`,
    `empreinteDerniereConservee=${charge.empreinteDerniereConservee ?? NUL}`,
  ];
}

function lireEmpreinte(valeur: string | undefined): string | null | undefined {
  if (valeur === undefined) return undefined;
  if (valeur === NUL) return null;
  return FORME_EMPREINTE.test(valeur) ? valeur : undefined;
}

function lireEntier(valeur: string | undefined): number | undefined {
  if (valeur === undefined || !/^\d+$/.test(valeur)) return undefined;
  const nombre = Number(valeur);
  return Number.isSafeInteger(nombre) ? nombre : undefined;
}

function lireSeq(valeur: string | undefined): bigint | undefined {
  if (valeur === undefined || !/^\d+$/.test(valeur)) return undefined;
  return BigInt(valeur);
}

/**
 * Décode la charge d'une ligne de clôture, ou rend `null` si elle est
 * illisible.
 *
 * `null` n'est PAS un détail : une clôture illisible n'ancre rien, donc le saut
 * qu'elle prétendait couvrir redevient une anomalie. C'est le sens fort de « le
 * vérificateur n'accepte un saut que s'il est ancré ».
 */
export function decoderCharge(partialSources: readonly string[]): ChargeCloture | null {
  const champs = new Map<string, string>();
  for (const entree of partialSources) {
    const separateur = entree.indexOf("=");
    if (separateur <= 0) continue;
    champs.set(entree.slice(0, separateur), entree.slice(separateur + 1));
  }

  if (champs.get("cloture") !== VERSION_CLOTURE) return null;

  const seqDepuis = lireSeq(champs.get("seqDepuis"));
  const seqJusqua = lireSeq(champs.get("seqJusqua"));
  const lignesRetirees = lireEntier(champs.get("lignesRetirees"));
  const lignesRetireesCumulees = lireEntier(champs.get("lignesRetireesCumulees"));
  const empreinteAvantSaut = lireEmpreinte(champs.get("empreinteAvantSaut"));
  const empreinteDerniereRetiree = lireEmpreinte(champs.get("empreinteDerniereRetiree"));
  const empreinteDerniereConservee = lireEmpreinte(champs.get("empreinteDerniereConservee"));

  if (
    seqDepuis === undefined ||
    seqJusqua === undefined ||
    lignesRetirees === undefined ||
    lignesRetireesCumulees === undefined ||
    empreinteAvantSaut === undefined ||
    empreinteDerniereRetiree === undefined ||
    empreinteDerniereConservee === undefined
  ) {
    return null;
  }

  // Une borne droite nulle n'ancre rien : sans elle, aucune ligne survivante ne
  // peut être rattachée au trou.
  if (empreinteDerniereRetiree === null) return null;
  if (seqJusqua < seqDepuis) return null;
  if (lignesRetirees <= 0) return null;
  if (lignesRetireesCumulees < lignesRetirees) return null;
  // Le § 31 fait porter à la clôture « le compte de lignes retirées ». Ce compte
  // est BORNÉ par la tranche qu'elle déclare : `seq` est un ordre total sans
  // réinsertion (§ 12), donc entre `seqDepuis` et `seqJusqua` il n'a jamais pu
  // tenir plus de `seqJusqua − seqDepuis + 1` lignes. Sans cette borne, le
  // nombre que le rapport publie n'est contredit par rien.
  if (BigInt(lignesRetirees) > seqJusqua - seqDepuis + 1n) return null;

  return {
    seqDepuis,
    seqJusqua,
    lignesRetirees,
    lignesRetireesCumulees,
    empreinteAvantSaut,
    empreinteDerniereRetiree,
    empreinteDerniereConservee,
  };
}

/** Les clés d'encodage, exposées pour les gardes. */
export const CHAMPS_CHARGE_CLOTURE = CHAMPS_CHARGE;

// ═════════════════════════════════════════════════════════════════════════════
//  Construction
// ═════════════════════════════════════════════════════════════════════════════

/** L'étape sous laquelle une clôture est inscrite : aucune — elle ne refuse rien. */
const AUCUNE_ETAPE: AppelStep | null = null;

/**
 * Fabrique le CONTENU d'une ligne de clôture. Le chaînage (`prevHash`,
 * `selfHash`, `seq`) est posé par `Journal.journaliser`, comme pour n'importe
 * quelle ligne : une clôture est une ligne ORDINAIRE de la chaîne, et c'est
 * précisément ce qui l'empêche d'être fabriquée à part.
 *
 * @param charge - ce que la clôture atteste.
 * @param argHash - l'empreinte HMAC de la charge, obtenue de `core/limits`
 *   (port `ArgHasher`). `core/audit` ne la calcule pas (§ 12, règle 2).
 * @param at - l'horodatage, fourni par l'appelant via son horloge.
 */
export function construireCloture(charge: ChargeCloture, argHash: string, at: Date): ContenuLigne {
  return {
    at,
    principal: PRINCIPAL_SYSTEME,
    // La session de pilotage d'une purge est la purge elle-même, identifiée par
    // la tranche qu'elle retire : deux purges ne peuvent pas la partager.
    sessionId: `purge-${charge.seqDepuis.toString()}-${charge.seqJusqua.toString()}`,
    tool: OUTIL_CLOTURE,
    toolVersion: VERSION_CLOTURE,
    adapterVersion: VERSION_CLOTURE,
    // Une purge détruit : le § 09 n'a pas d'autre mot pour ça, et l'écrire
    // `read` ferait disparaître les purges de toute revue des effets.
    effect: "destructive",
    // Le niveau de repli du § 20. Une purge n'est pas un appel d'outil : elle
    // ne desserre rien et ne s'autorise de rien.
    policyLevel: "brouillon",
    decision: "autorisé",
    stepDenied: AUCUNE_ETAPE,
    argHash,
    // § 12, règle 3 — une purge ne nomme personne.
    recordIds: [],
    partialSources: encoderCharge(charge),
    durationMs: 0,
    outcome: "ok",
  };
}

/**
 * Est-ce une ligne de clôture ?
 *
 * Le critère est le nom d'outil.
 *
 * ✅ CE NOM EST RÉSERVÉ AU SOCLE depuis le lot 1 (2026-08-30).
 *    `core/registry/enregistrer.ts` refuse tout outil qui le porte, sous le
 *    motif `nom_reserve_au_socle`, en IMPORTANT cette constante — pas en la
 *    retapant : deux copies divergeraient au premier renommage et la garde
 *    deviendrait muette sans que rien ne le signale.
 *
 *    Ce qu'il en coûtait AVANT cette réservation, et qui explique pourquoi
 *    elle existe : un adaptateur déclarant ce nom empoisonnait le journal — sa
 *    ligne d'appel ordinaire était lue comme une clôture illisible et rendait
 *    la vérification ROUGE en permanence. Fail-closed, donc pas un trou de
 *    sécurité, mais un déni de service sur la vérification, déclenchable par
 *    n'importe quel adaptateur.
 *
 * Le vérificateur ne s'en remet en revanche à aucune promesse : il exige aussi
 * que la charge se décode (`decoderCharge`), sans quoi la ligne n'ancre rien.
 */
export function estLigneDeCloture(ligne: Pick<LigneAudit, "tool">): boolean {
  return ligne.tool === OUTIL_CLOTURE;
}

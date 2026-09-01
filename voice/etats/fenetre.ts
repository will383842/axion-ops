/**
 * voice/etats/fenetre.ts — LA FENÊTRE DÉVERROUILLÉE, SUR UN TEMPS INJECTÉ.
 *
 * § 30 : « Le démon se verrouille après inactivité et redemande un facteur. Le
 * micro n'authentifie personne — § 18. »
 *
 * ═══ LE PIÈGE QUE CE FICHIER EXISTE POUR FERMER ═══
 *
 * Il y a DEUX faits distincts, et les confondre ouvre un trou :
 *
 *  · l'ÉTAT du démon — `verrouillé` ou non. C'est ce que la machine sait.
 *  · le TEMPS — le délai d'inactivité est-il écoulé ? C'est ce que l'horloge
 *    sait.
 *
 * Entre l'instant où le délai s'écoule et l'instant où la minuterie bat, le
 * démon est encore en `écoute` ou en `en-tour` alors que la fenêtre est
 * MORTE. Un desserrage décidé sur le seul état passerait dans cet intervalle —
 * et cet intervalle est exactement le moment où personne ne regarde. D'où la
 * règle : **la fenêtre est déverrouillée si et seulement si l'état l'est ET le
 * délai n'est pas écoulé.**
 *
 * ═══ AUCUN `Date.now()` ═══
 *
 * L'instant courant, l'instant de la dernière activité et le délai sont TROIS
 * PARAMÈTRES. Une machine qui lit l'heure elle-même ne se teste que par des
 * pauses, et une garde qui dort est une garde qu'on finit par retirer. Motif
 * déjà tenu par `core/policy/ligne.ts` (TTL évalué paresseusement, à l'appel)
 * et par le hub de planning d'Axion-IA.
 */

import { fenetreOuverte, type EtatVocal } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le délai — et ce qu'il n'est pas
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **CE CHIFFRE N'EST PAS ARBITRÉ, ET SON NOM LE DIT.**
 *
 * Le § 30 pose le verrouillage après inactivité ; il ne donne aucune durée, et
 * l'ADR 0010 non plus. Cinq minutes est un point de départ raisonnable, pas une
 * décision : c'est un arbitrage de Will (combien de temps une machine
 * déverrouillée reste-t-elle à portée de voix d'un tiers ?), et il attend.
 *
 * Personne ne doit lire cette constante depuis la machine : le délai est un
 * champ de `HorlogeVocale`, injecté à chaque décision. Elle n'existe que pour
 * donner un point de départ nommé à la configuration du démon.
 */
export const DELAI_INACTIVITE_NON_ARBITRE_MS = 5 * 60 * 1000;

// ═════════════════════════════════════════════════════════════════════════════
//  L'horloge
// ═════════════════════════════════════════════════════════════════════════════

export interface HorlogeVocale {
  /** L'instant de la décision, en millisecondes. INJECTÉ. */
  readonly instant: number;
  /** L'instant du dernier geste ayant renouvelé l'activité. INJECTÉ. */
  readonly derniereActivite: number;
  /** Le délai d'inactivité en vigueur, en millisecondes. INJECTÉ. */
  readonly delaiInactiviteMs: number;
}

/**
 * POURQUOI LA FENÊTRE EST MORTE, OU VIVANTE. Un booléen seul ne distinguerait
 * pas « le délai est passé » de « l'horloge est inexploitable » — et c'est la
 * seconde qui mérite une alerte.
 *
 * L'ordre est SIGNIFIANT : `sous-le-délai` en tête est le seul verdict qui
 * laisse la fenêtre ouverte ; tout le reste ferme.
 */
export const MOTIFS_ECHEANCE = [
  "sous-le-délai",
  "délai-écoulé",
  "délai-non-positif",
  "horloge-non-finie",
  "horloge-qui-recule",
] as const;

export type MotifEcheance = (typeof MOTIFS_ECHEANCE)[number];

/** Le seul verdict qui n'échoit pas, DÉRIVÉ de la tête du tableau. */
export const MOTIF_FENETRE_VIVANTE: MotifEcheance = MOTIFS_ECHEANCE[0];

export interface Echeance {
  readonly echue: boolean;
  readonly motif: MotifEcheance;
  /**
   * Millisecondes écoulées depuis la dernière activité, ou `null` quand
   * l'horloge est inexploitable. `null` plutôt que `0` : un zéro se lit comme
   * « on vient d'agir », c'est-à-dire l'inverse de ce qui s'est passé.
   */
  readonly ecouleMs: number | null;
  /** Millisecondes restantes avant échéance. Vaut `0` dès que la fenêtre est morte. */
  readonly resteMs: number;
}

/**
 * ÉVALUE L'ÉCHÉANCE. Fail-closed sur les quatre chemins qui ne sont pas « tout
 * va bien » — § 20, quatrième protection : « panne, corruption, redémarrage →
 * niveau le plus strict ».
 *
 * Les deux replis qui ne vont pas de soi :
 *
 *  · **délai non positif** → échue. Un délai à zéro ou négatif décrit une
 *    fenêtre qui n'existe pas ; le lire comme « jamais d'expiration » ferait
 *    d'une configuration vide une fenêtre éternelle. C'est le défaut « délai
 *    plus long que son budget = jamais d'expiration », dans l'autre sens.
 *  · **horloge qui recule** → échue. Un instant courant antérieur à la dernière
 *    activité n'arrive que par un réglage d'horloge, un fuseau, ou une valeur
 *    fabriquée. Aucune de ces trois raisons ne doit ROUVRIR une fenêtre : le
 *    calcul naïf `instant - derniereActivite` y rendrait un nombre négatif,
 *    donc « largement sous le délai », donc une fenêtre ouverte par une horloge
 *    qu'on ne contrôle pas.
 */
export function evaluerEcheance(horloge: HorlogeVocale): Echeance {
  const { instant, derniereActivite, delaiInactiviteMs } = horloge;

  if (
    !Number.isFinite(instant) ||
    !Number.isFinite(derniereActivite) ||
    !Number.isFinite(delaiInactiviteMs)
  ) {
    return { echue: true, motif: "horloge-non-finie", ecouleMs: null, resteMs: 0 };
  }

  if (delaiInactiviteMs <= 0) {
    return { echue: true, motif: "délai-non-positif", ecouleMs: null, resteMs: 0 };
  }

  if (instant < derniereActivite) {
    return { echue: true, motif: "horloge-qui-recule", ecouleMs: null, resteMs: 0 };
  }

  const ecouleMs = instant - derniereActivite;

  if (ecouleMs >= delaiInactiviteMs) {
    return { echue: true, motif: "délai-écoulé", ecouleMs, resteMs: 0 };
  }

  return {
    echue: false,
    motif: MOTIF_FENETRE_VIVANTE,
    ecouleMs,
    resteMs: delaiInactiviteMs - ecouleMs,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Les deux questions que la machine pose à l'horloge
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA FENÊTRE EST-ELLE RÉELLEMENT DÉVERROUILLÉE ? La conjonction des deux faits.
 * C'est la seule fonction qu'un geste élargissant a le droit de consulter.
 */
export function fenetreDeverrouillee(etat: EtatVocal, horloge: HorlogeVocale): boolean {
  return fenetreOuverte(etat) && !evaluerEcheance(horloge).echue;
}

/**
 * LE VERROUILLAGE EST-IL DÛ ? C'est ce que la boucle du démon consulte pour
 * savoir s'il faut appliquer le geste `expirer-inactivité`.
 *
 * Faux quand le démon est DÉJÀ verrouillé : on ne re-verrouille pas ce qui
 * l'est, et une minuterie qui rebat indéfiniment sur un démon fermé remplirait
 * le journal d'un événement qui ne dit rien.
 */
export function verrouillageDu(etat: EtatVocal, horloge: HorlogeVocale): boolean {
  return fenetreOuverte(etat) && evaluerEcheance(horloge).echue;
}

/**
 * L'instant auquel la fenêtre mourra si rien ne se passe, ou `null` quand
 * l'horloge est inexploitable. Sert l'affichage de la console — jamais la
 * décision, qui repasse toujours par `evaluerEcheance`, pour qu'il n'existe
 * qu'UN seul calcul (motif de `niveauPourEcran` dans `core/policy`).
 */
export function instantDEcheance(horloge: HorlogeVocale): number | null {
  if (!Number.isFinite(horloge.derniereActivite) || !Number.isFinite(horloge.delaiInactiviteMs)) {
    return null;
  }
  if (horloge.delaiInactiviteMs <= 0) {
    return null;
  }
  return horloge.derniereActivite + horloge.delaiInactiviteMs;
}

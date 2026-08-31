/**
 * `core/audit/intention.ts` — **LA FORME DE LA LIGNE D'INTENTION (ADR 0022).**
 *
 * ═══ LE DÉFAUT QUE CE FICHIER REFERME, ET POURQUOI IL NE LE REFERME PAS SEUL ═══
 *
 * Le mécanisme {@link PorteeDIntention} (`core/chaine/orchestrateur.ts`) est
 * câblé aux deux instants exacts — juste avant l'effet extérieur, et dès que
 * l'issue est connue. Mais **ce qu'`avantEffet` écrirait n'avait AUCUNE
 * FORME** : le vocabulaire fermé du § 12 n'a aucun mot pour une intention, et
 * `RapportVerification` n'en compte aucune.
 *
 * 🔴 **ARMER LE MÉCANISME AVANT DE LUI DONNER FORME ET COMPTEUR SERAIT LE PIRE
 *    DES TROIS ÉTATS.** Une ligne qu'on écrit sans savoir la compter est une
 *    ligne qu'on ne saura pas vérifier : le journal grossirait d'une écriture
 *    par appel exécuté, la promesse « une intention sans issue EST l'alarme »
 *    serait affichée, et rien ne saurait lever cette alarme. C'est exactement le
 *    motif du lot 1c — une décision écrite, non cousue, et une documentation qui
 *    donne l'apparence d'un périmètre couvert.
 *
 *    **La forme et le compteur atterrissent donc ENSEMBLE, ou ni l'un ni
 *    l'autre.** C'est la décision de l'ADR 0022, et c'est pourquoi ce fichier ne
 *    contient encore aucune valeur exécutable : `INTENTION_NON_ARMEE` reste
 *    câblée tant que le constructeur ④ n'a pas écrit les deux moitiés.
 *
 * ═══ LE MÉCANISME RETENU — CELUI D'`estLigneDeCloture`, ET RIEN D'AUTRE ═══
 *
 * `core/audit/cloture.ts` a déjà résolu ce problème une fois : distinguer une
 * ligne de socle d'une ligne d'appel **sans ajouter un mot au vocabulaire
 * fermé**. Trois pièces, et on les reprend telles quelles :
 *
 *  1. un **nom d'outil RÉSERVÉ** — `OUTIL_CLOTURE` pour la purge, il en faut un
 *     second pour l'intention ;
 *  2. un **prédicat** qui ne juge que ce nom (`estLigneDeCloture`) ;
 *  3. une **charge versionnée** encodée dans `partialSources`, la seule colonne
 *     libre de `ops_audit` qui ne porte pas d'identifiant pseudonyme.
 *
 * ⚠️ **AUCUNE VALEUR N'EST AJOUTÉE À `OUTCOMES` NI À `DECISIONS`.** C'est la
 *    leçon de l'ADR 0017 : le vocabulaire était juste, c'est la dérivation qui
 *    mentait. Ajouter un mot ici romprait le format pour une distinction que le
 *    nom d'outil porte déjà.
 *
 * ⚠️ **ET LE NOM RÉSERVÉ NE PEUT PAS ÊTRE UNE SECONDE COMPARAISON ÉCRITE À LA
 *    MAIN.** `core/registry/enregistrer.ts` refuse aujourd'hui `OUTIL_CLOTURE`
 *    par un `if` dédié. Un second `if` pour un second nom est le motif exact qui
 *    fabrique le troisième oubli : le refus doit itérer une liste
 *    `NOMS_RESERVES_AU_SOCLE` dérivée chez son propriétaire, et la garde
 *    d'admission doit ANNONCER combien de noms réservés elle a confrontés.
 *
 * ═══ CE QUE CE FICHIER NE CONTIENT PAS, ET POURQUOI ═══
 *
 * Il ne contient **aucune valeur exportée** — ni le nom réservé, ni le
 * prédicat, ni l'encodeur. Poser le nom réservé sans le refus qui l'accompagne
 * laisserait une demi-couture : une constante que le registre d'outils ne
 * refuserait pas, donc un nom qu'un adaptateur pourrait porter, donc une ligne
 * d'appel ordinaire lue comme une intention. Les deux moitiés du même geste.
 */

import type { AppelStep } from "../types.js";
import type { LigneAudit } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX INSTANTS D'UNE INTENTION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une intention s'écrit en DEUX lignes, et le vocabulaire les distingue.
 *
 * ⚠️ **POURQUOI DEUX LIGNES, ET NON UNE SEULE REFERMÉE PAR LA LIGNE D'APPEL.**
 *    Trois voies ont été pesées ; deux sont refusées, et les motifs comptent
 *    autant que le choix :
 *
 *  · **Muter la ligne d'ouverture** — impossible, et heureusement : le journal
 *    est en ajout seul et scellé (ADR 0002). Une clôture par mutation casserait
 *    l'empreinte chaînée de toutes les lignes suivantes.
 *  · **Laisser la ligne d'APPEL ordinaire servir de clôture**, en corrélant sur
 *    `(sessionId, argHash)`. Séduisant — zéro écriture de plus — et FAUX : deux
 *    appels identiques dans la même session portent le même couple, et un rejeu
 *    légitime ferait passer une intention ORPHELINE pour close. Une corrélation
 *    qui se trompe dans le sens rassurant est pire qu'aucune corrélation.
 *  · **Loger le renvoi dans le `partialSources` de la ligne d'appel** —
 *    refusé : ce champ porte alors les sources partielles RÉELLES de
 *    l'adaptateur (§ 13.2). Mêler une donnée de socle à une donnée d'adaptateur
 *    dans la même colonne est exactement ce que la ligne de clôture évite en
 *    n'ayant, elle, aucune source partielle à porter.
 *
 * Reste deux lignes, corrélées par le `seq` de l'ouverture — le seul
 * identifiant que le journal produise lui-même et que personne ne choisisse.
 *
 * ⚠️ LE COÛT EST ÉCRIT PLUTÔT QUE MINIMISÉ : **deux écritures de journal par
 *    appel exécuté**, en plus de la ligne d'appel. C'est précisément l'arbitrage
 *    que `INTENTION_NON_ARMEE` laisse à Will, et il ne se prend pas dans un
 *    commentaire.
 */
export const GENRES_DE_LIGNE_D_INTENTION = [
  /** Écrite JUSTE avant l'effet extérieur. Elle dit ce que le socle va TENTER. */
  "ouverture",
  /** Écrite dès l'issue connue. Elle renvoie au `seq` de son ouverture. */
  "clôture",
] as const;

/** Le genre d'une ligne d'intention. */
export type GenreDeLigneDIntention = (typeof GENRES_DE_LIGNE_D_INTENTION)[number];

/**
 * L'ISSUE D'UNE INTENTION.
 *
 * ⚠️ **CE N'EST PAS `Outcome`, ET CE N'EST PAS `Decision`.** Une intention
 *    répond à une troisième question : *le socle a-t-il su ce que sa tentative
 *    est devenue ?* Les trois valeurs ci-dessous sont celles que
 *    `PorteeDIntention.apresEffet` reçoit déjà — elles sont REPRISES, jamais
 *    réinventées, et le constructeur ④ doit les DÉRIVER de ce type-ci plutôt
 *    que de les retaper dans la signature du port.
 */
export const ISSUES_D_INTENTION = ["done", "failed", "interrompu"] as const;

/** L'issue inscrite par une ligne de clôture d'intention. */
export type IssueDIntention = (typeof ISSUES_D_INTENTION)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  LA CHARGE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UNE LIGNE D'OUVERTURE ATTESTE.
 *
 * ⚠️ **LE NOM DE L'OUTIL VOYAGE DANS LA CHARGE, ET C'EST UN COÛT ASSUMÉ.** La
 *    colonne `tool` de la ligne porte le nom RÉSERVÉ — c'est ce qui rend
 *    l'intention reconnaissable sans ajouter de mot au vocabulaire. Le vrai nom
 *    d'outil doit donc être ailleurs, et il est ici. Conséquence : un tableau de
 *    bord du § 24 qui grouperait par `tool` verrait toutes les intentions sous
 *    un seul nom. C'est écrit pour que ce ne soit pas découvert.
 *
 * ⚠️ `sessionId`, `principal` et `effect` ne sont PAS dans la charge : ce sont
 *    des colonnes de la ligne, et les recopier ici en ferait une seconde vérité.
 */
export interface ChargeIntentionOuverture {
  readonly genre: "ouverture";
  /** Le nom COMPLET de l'outil dont l'effet va être tenté. */
  readonly outil: string;
  /** L'empreinte de l'entrée VALIDÉE — celle à laquelle le § 20 lie la confirmation. */
  readonly argHash: string;
  /** L'étape à laquelle l'intention est posée. DÉRIVÉE d'`APPEL_STEPS`, jamais écrite. */
  readonly etape: AppelStep;
}

/** CE QU'UNE LIGNE DE CLÔTURE ATTESTE. */
export interface ChargeIntentionCloture {
  readonly genre: "clôture";
  /** Le `seq` de l'ouverture que cette ligne referme. */
  readonly seqOuverture: bigint;
  readonly issue: IssueDIntention;
  /**
   * Le cliquet d'effet extérieur (ADR 0017) tel qu'il était à la clôture.
   *
   * ⚠️ IL EST REPORTÉ ICI **EN PLUS** de la colonne `externalEffect` de la ligne,
   *    et ce n'est pas une redondance : la colonne dit ce que le socle SAIT de
   *    CETTE ligne-ci ; la charge dit ce qu'il savait de la TENTATIVE. C'est la
   *    borne n° 1 des « conséquences acceptées » de l'ADR 0017 — « un adaptateur
   *    qui envoie puis lève reste invisible » — et c'est la seule pièce du
   *    journal qui puisse la lever.
   */
  readonly effetExterieurSurvenu: boolean;
}

/** La charge d'une ligne d'intention. Union DISCRIMINÉE par `genre`. */
export type ChargeIntention = ChargeIntentionOuverture | ChargeIntentionCloture;

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX FONCTIONS À ÉCRIRE — LEURS FORMES, PAS LEURS CORPS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE PRÉDICAT — dérivé du seul nom d'outil, comme `estLigneDeCloture`.
 *
 * ⚠️ IL PREND UN `Pick<…, "tool">` ET NON UNE LIGNE ENTIÈRE, exactement comme
 *    son aîné : une garde qui exigerait la ligne complète ne pourrait pas être
 *    éprouvée sur un témoin fabriqué à la main.
 */
export type EstLigneDIntention = (ligne: Pick<LigneAudit, "tool">) => boolean;

/**
 * L'ENCODAGE — versionné, sans espace, lu par un décodeur unique.
 *
 * ⚠️ « SANS ESPACE » N'EST PAS UN STYLE : la garde de contenu du § 31
 *    (`core/audit/contenu.ts`) refuse tout ce qui en porte dans ces colonnes,
 *    pour qu'un extrait de corps ne puisse pas s'y glisser. La clôture de purge
 *    ne fait pas exception à sa propre règle, et l'intention non plus.
 */
export type EncoderChargeIntention = (charge: ChargeIntention) => readonly string[];

/** Le décodeur. Rend `null` sur une charge illisible — jamais une charge partielle. */
export type DecoderChargeIntention = (partialSources: readonly string[]) => ChargeIntention | null;

// ═════════════════════════════════════════════════════════════════════════════
//  LE COMPTEUR — L'AUTRE MOITIÉ, ET ELLE ATTERRIT EN MÊME TEMPS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE `RapportVerification` DOIT GAGNER (ADR 0022).
 *
 * Trois champs, et pas un de plus. Ils s'ajoutent aux douze existants, et le
 * constructeur ④ les y verse — ce type-ci n'est qu'une déclaration d'intention
 * d'écriture, pour que la forme soit relue avant d'être posée.
 *
 * 🔴 **UNE INTENTION OUVERTE NE REND PAS LE RAPPORT INVALIDE, ET C'EST LE POINT
 *    LE PLUS FACILE À RATER.** Au moment où l'on vérifie, un appel peut être en
 *    vol : son ouverture est écrite, sa clôture ne l'est pas encore. Faire
 *    tomber `valide` là-dessus rendrait la vérification ROUGE PAR CONSTRUCTION
 *    sur tout journal vivant — et une garde rouge en permanence est une garde
 *    qu'on désactive. {@link intentionsSansIssue} est donc un COMPTE que le § 24
 *    surveille avec un seuil et une fenêtre, jamais un verdict.
 *
 * ⚠️ EN REVANCHE, UNE CLÔTURE QUI RÉFÈRE UNE OUVERTURE INEXISTANTE **EST** UNE
 *    ANOMALIE DE CHAÎNE : c'est une ligne forgée, ou une purge qui a emporté
 *    l'ouverture sans ancre. `GENRES_ANOMALIE` gagne donc un genre — et un seul.
 */
export interface ComptesDIntention {
  /** Lignes d'OUVERTURE rencontrées dans la tranche. */
  readonly intentionsOuvertes: number;
  /** Lignes de CLÔTURE dont l'ouverture est présente dans la tranche. */
  readonly intentionsCloses: number;
  /**
   * Ouvertures sans clôture dans la tranche lue. **C'EST LE SIGNAL** — « un
   * effet est parti, et le socle n'a pas su dire ce qu'il est devenu ».
   *
   * ⚠️ BORNE ÉCRITE AVEC LE COMPTE : sur une tranche, la clôture peut vivre
   *    HORS tranche. Le chiffre n'est un signal que sur un journal lu en entier,
   *    exactement comme `ancresInutilisees`.
   */
  readonly intentionsSansIssue: number;
}

/**
 * Le genre d'anomalie que `GENRES_ANOMALIE` doit gagner — un seul.
 *
 * ⚠️ IL N'EST PAS EXPORTÉ COMME VALEUR : l'union `GENRES_ANOMALIE` est FERMÉE
 *    chez son propriétaire (`core/audit/verification.ts`) et la console en
 *    dérive son affichage. Poser ici une seconde source la ferait diverger au
 *    premier renommage. Le constructeur ④ ajoute le mot LÀ-BAS, et ce type-ci
 *    disparaît dans le même geste.
 */
export type GenreAnomalieDIntention = "intention-close-sans-ouverture";

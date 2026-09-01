/**
 * voice/etats/machine.ts — LA TABLE DES TRANSITIONS DU DÉMON VOCAL, ET LA
 * DÉCISION QUI EN DÉCOULE.
 *
 * Machine PURE : elle reçoit un état, un geste et un contexte, elle rend une
 * décision. Aucun micro, aucun modèle, aucune synthèse, aucun `Date.now()`.
 * Le démon du lot 8 branchera le matériel autour ; il ne réécrira pas ces
 * règles-là.
 *
 * ═══ LA TABLE EST UNE TABLE, PAS UNE CASCADE DE `if` ═══
 *
 * Motif de `core/vault/etat.ts` : ce qui n'est pas dans la table est REFUSÉ, et
 * les gardes dérivent la couverture des 105 paires (état × geste) sans qu'aucune
 * liste ne soit écrite à la main.
 *
 * ═══ ET LES LIGNES SONT ENGENDRÉES, PAS RECOPIÉES ═══
 *
 * Quarante-cinq des cinquante-quatre lignes disent la même chose de sept états
 * différents : « stop aboutit d'où qu'on parte », « verrouiller est
 * idempotent », « resserrer est libre d'où que ça vienne ». Les écrire une par
 * une, c'est se préparer à en oublier une le jour où un huitième état
 * apparaît — et un « stop » qui manque depuis UN état est exactement l'ordre
 * d'arrêt qui rate au pire moment. Elles sont donc ENGENDRÉES à partir de
 * `ETATS_VOCAUX`. Les neuf lignes restantes — le tour de parole — sont
 * écrites à la main, parce qu'elles n'ont pas de régularité à dériver : ce sont
 * elles, la forme du dialogue.
 */

import { fenetreDeverrouillee, type HorlogeVocale } from "./fenetre.js";
import {
  ETATS_ENGAGES,
  ETATS_OUVERTS,
  ETATS_VOCAUX,
  ETAT_AU_REPOS,
  ETAT_LE_PLUS_FERME,
  GESTES_VOCAUX,
  exigeFenetreDeverrouillee,
  exigeSecondFacteur,
  facteurProbant,
  fenetreOuverte,
  type DescriptionGeste,
  type EtatVocal,
  type GesteVocal,
  type ProvenanceFacteur,
} from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Une transition
// ═════════════════════════════════════════════════════════════════════════════

export interface TransitionVocale {
  readonly depuis: EtatVocal;
  readonly geste: GesteVocal;
  readonly vers: EtatVocal;
  /** Pourquoi cette transition existe. Lu par les gardes, par le journal, et par l'humain. */
  readonly motif: string;
}

/**
 * Engendre une ligne par état de `etats`. La destination et le motif sont des
 * FONCTIONS de l'état de départ : c'est ce qui permet à « stop » de rendre le
 * repos depuis un état ouvert et le verrou depuis un état fermé, sans qu'aucun
 * nom d'état soit écrit ici.
 */
function depuisChaqueEtat(
  geste: GesteVocal,
  etats: readonly EtatVocal[],
  vers: (depuis: EtatVocal) => EtatVocal,
  motif: (depuis: EtatVocal) => string,
): readonly TransitionVocale[] {
  return etats.map((depuis) => ({ depuis, geste, vers: vers(depuis), motif: motif(depuis) }));
}

/** L'identité : le geste ne déplace pas la conversation. */
const inchange = (depuis: EtatVocal): EtatVocal => depuis;

// ═════════════════════════════════════════════════════════════════════════════
//  Les lignes engendrées — ce qui vaut depuis TOUS les états
// ═════════════════════════════════════════════════════════════════════════════

/**
 * « STOP » ABOUTIT DEPUIS CHAQUE ÉTAT — § 30 et § 32.
 *
 * Depuis un état ouvert, il ramène au repos : la synthèse est coupée, le tour
 * rappelé, la file vidée. Depuis l'état fermé, il est IDEMPOTENT — dire « stop »
 * à un démon verrouillé ne doit pas rendre une erreur, sinon celui qui parle ne
 * sait pas si l'ordre est passé, et il le répète en criant.
 *
 * Aucun facteur, aucune fenêtre : `stop` RÉDUIT, et le § 20 le rend libre.
 */
const LIGNES_STOP = depuisChaqueEtat(
  "stop",
  ETATS_VOCAUX,
  (depuis) => (fenetreOuverte(depuis) ? ETAT_AU_REPOS : ETAT_LE_PLUS_FERME),
  (depuis) =>
    fenetreOuverte(depuis)
      ? `Coupe tout depuis « ${depuis} » et revient au repos, sans passer par le modèle.`
      : `Idempotent : « stop » adressé à un démon déjà fermé ne rend jamais une erreur.`,
);

/**
 * VERROUILLER, À LA DEMANDE, DEPUIS CHAQUE ÉTAT. Idempotent pour la même raison
 * que l'arrêt d'urgence du coffre (§ 25).
 */
const LIGNES_VERROUILLER = depuisChaqueEtat(
  "verrouiller",
  ETATS_VOCAUX,
  () => ETAT_LE_PLUS_FERME,
  (depuis) =>
    fenetreOuverte(depuis)
      ? `Referme la fenêtre depuis « ${depuis} » : le prochain élargissement redemandera un facteur.`
      : `Idempotent : refermer un démon déjà fermé n'est pas une erreur.`,
);

/**
 * LE VERROUILLAGE APRÈS INACTIVITÉ — § 18 et § 30. Le geste est le même effet
 * que `verrouiller`, et c'est un geste DISTINCT parce que le journal doit
 * distinguer « Will a fermé » de « l'horloge a fermé ». Un journal qui les
 * confond ne permet pas de répondre à la seule question qui compte après coup :
 * la fenêtre était-elle encore ouverte quand cela s'est produit ?
 *
 * Ce n'est pas la machine qui décide QUAND : `fenetre.ts:verrouillageDu` le
 * calcule sur l'horloge injectée, et la boucle du démon applique le geste.
 */
const LIGNES_EXPIRATION = depuisChaqueEtat(
  "expirer-inactivité",
  ETATS_VOCAUX,
  () => ETAT_LE_PLUS_FERME,
  (depuis) =>
    fenetreOuverte(depuis)
      ? `Le délai d'inactivité s'est écoulé pendant « ${depuis} » : la fenêtre se referme.`
      : `Idempotent : la minuterie qui rebat sur un démon déjà fermé ne change rien.`,
);

/**
 * RESSERRER EST TOUJOURS LIBRE — § 20, première protection, mot pour mot :
 * « exécuté immédiatement d'où que ça vienne ». Donc depuis les sept états,
 * verrouillé compris, et sans déplacer la conversation : réduire la surface
 * n'interrompt pas un tour.
 */
const LIGNES_BROUILLON_SEUL = depuisChaqueEtat(
  "brouillon-seul",
  ETATS_VOCAUX,
  inchange,
  (depuis) => `Resserrement libre depuis « ${depuis} » : il réduit, donc rien ne le retient.`,
);

/**
 * ANNULER — depuis les états ENGAGÉS seulement.
 *
 * C'est la différence avec « stop », et elle est voulue : il n'y a rien à
 * annuler au repos ni sous verrou, et un refus y est plus honnête qu'un succès
 * qui n'aurait rien fait. « Stop », lui, ne peut jamais échouer.
 */
const LIGNES_ANNULER = depuisChaqueEtat(
  "annuler",
  ETATS_ENGAGES,
  () => ETAT_AU_REPOS,
  (depuis) => `Abandonne ce qui est en cours depuis « ${depuis} » et revient au repos.`,
);

/**
 * LES DEUX GESTES QUI ÉLARGISSENT — § 18 : « aucun desserrage ni changement de
 * profil hors fenêtre déverrouillée ».
 *
 * Ils n'existent QUE depuis les états ouverts : la table elle-même refuse le
 * desserrage d'un démon verrouillé, avant même que la règle de fenêtre ait à
 * se prononcer. Deux barrières indépendantes, à dessein — la table interdit
 * l'état fermé, la règle de fenêtre interdit le délai écoulé, et c'est ce
 * second cas qui est le trou réel : entre l'écoulement et le battement de la
 * minuterie, l'état est encore ouvert.
 *
 * Ils ne déplacent pas la conversation : changer la politique n'interrompt pas
 * un tour en cours.
 */
const LIGNES_DESSERRER = depuisChaqueEtat(
  "desserrer",
  ETATS_OUVERTS,
  inchange,
  (depuis) =>
    `Desserrage demandé depuis « ${depuis} » : facteur probant hors bande ET fenêtre vivante.`,
);

const LIGNES_CHANGER_DE_PROFIL = depuisChaqueEtat(
  "changer-de-profil",
  ETATS_OUVERTS,
  inchange,
  (depuis) =>
    `Changement de profil depuis « ${depuis} » : il change la surface, donc même chemin qu'un desserrage.`,
);

// ═════════════════════════════════════════════════════════════════════════════
//  Les lignes écrites — la forme du tour de parole
// ═════════════════════════════════════════════════════════════════════════════

const LIGNES_TOUR_DE_PAROLE: readonly TransitionVocale[] = [
  {
    depuis: "verrouillé",
    geste: "déverrouiller",
    vers: "en-veille",
    motif:
      "Le facteur présenté hors bande rouvre la fenêtre. Seule transition qui " +
      "la rouvre — et c'est de cette unicité que les gardes dérivent " +
      "l'exemption de « déverrouiller » à la règle de fenêtre.",
  },
  {
    depuis: "en-veille",
    geste: "détecter-parole",
    vers: "écoute",
    motif: "La détection de parole a mordu alors que rien ne jouait : la capture s'ouvre.",
  },
  {
    depuis: "écoute",
    geste: "clore-la-capture",
    vers: "transcrit",
    motif: "Le silence est revenu : la capture se ferme, la transcription locale démarre.",
  },
  {
    depuis: "transcrit",
    geste: "router-vers-le-modèle",
    vers: "en-tour",
    motif:
      "La fourche du § 30, branche droite : ce n'était pas une commande hors " +
      "modèle, le texte part en tour de session.",
  },
  {
    depuis: "en-tour",
    geste: "répondre",
    vers: "parle",
    motif: "Le tour rend du texte : la synthèse locale démarre.",
  },
  {
    depuis: "parle",
    geste: "achever-la-parole",
    vers: "en-veille",
    motif: "La synthèse est allée au bout sans être coupée. Retour au repos.",
  },
  {
    depuis: "parle",
    geste: "interrompre",
    vers: "interrompu",
    motif:
      "L'EXIGENCE DU § 30 : la parole de l'utilisateur coupe la synthèse. " +
      "Un assistant vocal qu'on ne peut pas interrompre est insupportable " +
      "après dix minutes.",
  },
  {
    depuis: "en-tour",
    geste: "interrompre",
    vers: "interrompu",
    motif:
      "Interrompre AVANT le premier mot : le tour tourne encore, rien ne joue. " +
      "Sans cette ligne, l'utilisateur devrait attendre que le démon commence " +
      "à parler pour avoir le droit de le couper.",
  },
  {
    depuis: "interrompu",
    geste: "reprendre-l-écoute",
    vers: "écoute",
    motif:
      "Le calme est revenu : la capture rouvre sur la phrase qui a coupé. " +
      "Sans cet état intermédiaire, couper et écouter à nouveau seraient le " +
      "même instant, et le reçu de l'interruption n'aurait nulle part où être " +
      "attendu.",
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  La table
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TRANSITIONS PERMISES, ET ELLES SEULES. Ce qui n'y est pas est refusé.
 *
 * Trois refus méritent d'être nommés, parce que ce sont ceux qu'on écrirait
 * sans y penser :
 *
 *  · `verrouillé` × `desserrer` — absent, et c'est la moitié structurelle du
 *    § 18. Une seule ligne aurait suffi à ouvrir la porte que la section ferme.
 *  · `verrouillé` × `changer-de-profil` — le jumeau du précédent. Le § 20 le
 *    nomme séparément (« passe en mode dev suit le chemin du desserrage »)
 *    précisément parce qu'on l'oublie.
 *  · `en-veille` × `annuler` — absent à dessein : il n'y a rien à annuler au
 *    repos. C'est ce qui distingue `annuler` de `stop`, lequel ne peut jamais
 *    échouer.
 */
export const TRANSITIONS_VOCALES: readonly TransitionVocale[] = [
  ...LIGNES_TOUR_DE_PAROLE,
  ...LIGNES_STOP,
  ...LIGNES_VERROUILLER,
  ...LIGNES_EXPIRATION,
  ...LIGNES_BROUILLON_SEUL,
  ...LIGNES_ANNULER,
  ...LIGNES_DESSERRER,
  ...LIGNES_CHANGER_DE_PROFIL,
];

// ═════════════════════════════════════════════════════════════════════════════
//  La machine, injectable
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TROIS PIÈCES, RASSEMBLÉES ET INJECTABLES.
 *
 * `decider()` prend une machine en paramètre plutôt que de lire les constantes
 * du module. C'est ce qui rend les gardes réfutables : sans cela, un test qui
 * vérifie « stop aboutit depuis chaque état » sur une table engendrée par la
 * règle « stop depuis chaque état » ne pourrait PAS échouer, et une garde qui
 * ne peut pas échouer n'existe pas. Les gardes fabriquent donc des machines
 * mutilées — une ligne `stop` retirée, un geste dont l'effet est faussé — et
 * exigent qu'elles rougissent.
 */
export interface MachineVocale {
  readonly etats: readonly EtatVocal[];
  readonly gestes: readonly DescriptionGeste[];
  readonly transitions: readonly TransitionVocale[];
}

export const MACHINE_VOCALE: MachineVocale = {
  etats: ETATS_VOCAUX,
  gestes: GESTES_VOCAUX,
  transitions: TRANSITIONS_VOCALES,
};

// ═════════════════════════════════════════════════════════════════════════════
//  Le contexte d'une décision
// ═════════════════════════════════════════════════════════════════════════════

export interface ContexteVocal {
  /** Le temps, INJECTÉ. Voir `fenetre.ts`. */
  readonly horloge: HorlogeVocale;
  /**
   * D'où vient le second facteur, ou `null` s'il n'y en a pas.
   *
   * ⚠️ `"voix"` n'est JAMAIS probant — § 18 : « le micro n'authentifie
   * personne ». `"démon"` non plus — § 20 : une réponse produite par le démon
   * vocal ne compte pas comme confirmation humaine. Seul `"hors-bande"` prouve.
   */
  readonly facteur: ProvenanceFacteur | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  La décision
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES QUATRE REFUS, ET L'ORDRE DANS LEQUEL ILS SONT PRONONCÉS.
 *
 * L'ordre du tableau EST l'ordre d'évaluation, et une garde le vérifie sur
 * toutes les combinaisons qui violent plusieurs règles à la fois. Sans elle,
 * un remaniement de la cascade changerait le message rendu à l'utilisateur sans
 * que rien ne rougisse.
 *
 * Pourquoi la fenêtre passe AVANT le facteur : quand les deux manquent, dire
 * « la fenêtre est refermée » est actionnable — la manœuvre est de
 * déverrouiller, ce qui est justement présenter le facteur. Dire « facteur
 * absent » enverrait présenter un facteur à un geste qui l'aurait refusé de
 * toute façon.
 */
export const MOTIFS_REFUS_VOCAL = [
  "geste-hors-table",
  "hors-fenêtre-déverrouillée",
  "second-facteur-absent",
  "facteur-non-probant",
] as const;

export type MotifRefusVocal = (typeof MOTIFS_REFUS_VOCAL)[number];

export type DecisionVocale =
  | { readonly permise: true; readonly vers: EtatVocal; readonly motif: string }
  | {
      readonly permise: false;
      readonly reste: EtatVocal;
      readonly refus: MotifRefusVocal;
      readonly motif: string;
    };

/**
 * LE GESTE EST-IL PERMIS DEPUIS CET ÉTAT, DANS CE CONTEXTE ?
 *
 * Quatre questions, dans l'ordre de `MOTIFS_REFUS_VOCAL`, et aucune cinquième :
 *
 *  1. la table connaît-elle ce couple ? Sinon, refus — c'est le fail-closed.
 *  2. le geste exige-t-il la fenêtre, et la fenêtre est-elle vivante ? La
 *     fenêtre est vivante quand l'état l'est ET que le délai n'est pas écoulé :
 *     les deux, jamais l'un seul.
 *  3. le geste exige-t-il un facteur, et y en a-t-il un ?
 *  4. ce facteur prouve-t-il quelque chose ? La voix, non (§ 18) ; le démon
 *     lui-même, non (§ 20).
 *
 * Le motif de refus NOMME le geste et l'état : « ce n'est pas permis » sans
 * dire quoi n'apprend rien à qui lit une alerte à 2 h du matin.
 */
export function decider(
  machine: MachineVocale,
  etat: EtatVocal,
  geste: GesteVocal,
  contexte: ContexteVocal,
): DecisionVocale {
  const description = machine.gestes.find((candidat) => candidat.nom === geste);
  const transition = machine.transitions.find(
    (candidate) => candidate.depuis === etat && candidate.geste === geste,
  );

  if (description === undefined || transition === undefined) {
    return {
      permise: false,
      reste: etat,
      refus: "geste-hors-table",
      motif: `Geste « ${geste} » interdit depuis l'état « ${etat} ».`,
    };
  }

  if (exigeFenetreDeverrouillee(description) && !fenetreDeverrouillee(etat, contexte.horloge)) {
    return {
      permise: false,
      reste: etat,
      refus: "hors-fenêtre-déverrouillée",
      motif:
        `Geste « ${geste} » refusé depuis l'état « ${etat} » : il élargit la ` +
        `surface exposée, et la fenêtre déverrouillée est refermée.`,
    };
  }

  if (exigeSecondFacteur(description)) {
    if (contexte.facteur === null) {
      return {
        permise: false,
        reste: etat,
        refus: "second-facteur-absent",
        motif:
          `Geste « ${geste} » refusé depuis l'état « ${etat} » : il exige un ` +
          `second facteur, aucun n'est présenté.`,
      };
    }

    if (!facteurProbant(contexte.facteur)) {
      return {
        permise: false,
        reste: etat,
        refus: "facteur-non-probant",
        motif:
          `Geste « ${geste} » refusé depuis l'état « ${etat} » : le facteur ` +
          `présenté vient de « ${contexte.facteur} », qui ne prouve rien.`,
      };
    }
  }

  return { permise: true, vers: transition.vers, motif: transition.motif };
}

/** La décision sur la machine réelle. */
export function appliquerGesteVocal(
  etat: EtatVocal,
  geste: GesteVocal,
  contexte: ContexteVocal,
): DecisionVocale {
  return decider(MACHINE_VOCALE, etat, geste, contexte);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Avancer : l'état ET l'horloge d'activité
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE TRANSITION RENOUVELLE-T-ELLE L'ACTIVITÉ ? Dérivé : elle le fait si et
 * seulement si sa DESTINATION a la fenêtre ouverte.
 *
 * Ce que cette dérivation donne, sans qu'aucun nom de geste soit cité :
 *  · `expirer-inactivité` et `verrouiller` ne renouvellent rien — ils ferment.
 *  · un `stop` depuis un état ouvert renouvelle : quelqu'un vient de parler.
 *  · un `stop` adressé à un démon verrouillé ne renouvelle rien — parler à un
 *    démon fermé ne doit pas tenir sa fenêtre ouverte.
 */
export function renouvelleLActivite(transition: TransitionVocale): boolean {
  return fenetreOuverte(transition.vers);
}

export interface Avancement {
  readonly decision: DecisionVocale;
  readonly etat: EtatVocal;
  readonly derniereActivite: number;
}

/**
 * APPLIQUE LE GESTE ET REND CE QUE LE DÉMON DOIT RETENIR : l'état d'après, et
 * l'instant de dernière activité d'après.
 *
 * **Un geste REFUSÉ ne renouvelle jamais l'activité.** Sans cette règle, celui
 * qui répète « desserre » à un démon dont la fenêtre vient de mourir tiendrait
 * cette fenêtre ouverte par ses seules tentatives ratées — un compteur de
 * tentatives qui se recharge lui-même.
 */
export function avancer(etat: EtatVocal, geste: GesteVocal, contexte: ContexteVocal): Avancement {
  const decision = appliquerGesteVocal(etat, geste, contexte);

  if (!decision.permise) {
    return { decision, etat, derniereActivite: contexte.horloge.derniereActivite };
  }

  const transition = TRANSITIONS_VOCALES.find(
    (candidate) => candidate.depuis === etat && candidate.geste === geste,
  );

  const renouvelle = transition !== undefined && renouvelleLActivite(transition);

  return {
    decision,
    etat: decision.vers,
    derniereActivite: renouvelle ? contexte.horloge.instant : contexte.horloge.derniereActivite,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Lectures dérivées — pour la console et pour les gardes
// ═════════════════════════════════════════════════════════════════════════════

/** Les gestes que la TABLE admet depuis cet état. Ne dit rien du contexte. */
export function gestesInscrits(etat: EtatVocal): readonly GesteVocal[] {
  return TRANSITIONS_VOCALES.filter((transition) => transition.depuis === etat).map(
    (transition) => transition.geste,
  );
}

/**
 * Les gestes réellement praticables ICI ET MAINTENANT — table, fenêtre et
 * facteur compris. C'est ce qu'un écran doit afficher : montrer « desserrer »
 * comme disponible alors que la fenêtre est morte, c'est promettre ce que le
 * socle refusera.
 */
export function gestesPraticables(etat: EtatVocal, contexte: ContexteVocal): readonly GesteVocal[] {
  return gestesInscrits(etat).filter((geste) => appliquerGesteVocal(etat, geste, contexte).permise);
}

/** Les états depuis lesquels ce geste est inscrit dans la table. */
export function etatsSources(geste: GesteVocal): readonly EtatVocal[] {
  return TRANSITIONS_VOCALES.filter((transition) => transition.geste === geste).map(
    (transition) => transition.depuis,
  );
}

/**
 * Une transition ROUVRE-t-elle la fenêtre ? Dérivé de la table, jamais déclaré :
 * elle part d'un état fermé et arrive sur un état ouvert. Une garde vérifie
 * qu'il n'en existe qu'une, et que son geste est celui de nature « hors-bande ».
 */
export function rouvreLaFenetre(transition: TransitionVocale): boolean {
  return !fenetreOuverte(transition.depuis) && fenetreOuverte(transition.vers);
}

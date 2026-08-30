/**
 * core/vault/etat.ts — LA MACHINE À TROIS ÉTATS DU COFFRE.
 *
 * § 23, quatrième ajout du CDC v6 :
 *
 *   « absent → le conteneur ne démarre pas. verrouillé → il démarre, le
 *     healthcheck rend 200 avec `vaultLocked: true`, la console et le
 *     déverrouillage répondent, tout appel d'outil est refusé. ouvert →
 *     nominal. SANS LE DEUXIÈME ÉTAT, LE REPLI « DÉVERROUILLAGE AU DÉMARRAGE »
 *     REND ROUGE CHAQUE DÉPLOIEMENT. »
 *
 * D'où la règle de tenue de ce fichier : JAMAIS UN BOOLÉEN. Un `vaultLocked:
 * boolean` seul écrase `absent` et `verrouillé` l'un sur l'autre — et c'est
 * exactement la confusion qui a fait rougir chaque déploiement dans la v5. Le
 * booléen du healthcheck est DÉRIVÉ de l'état (`core/vault/demarrage.ts`), il
 * n'est jamais stocké.
 *
 * Les transitions sont une TABLE, pas une suite de `if`. Les gardes en dérivent
 * la couverture des neuf paires (état × geste) sans qu'aucune liste ne soit
 * écrite à la main.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  Les trois états
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ordre du tableau est SIGNIFIANT : du plus dégradé au nominal. `absent` en
 * tête, parce que c'est le seul état qui refuse le démarrage, et parce qu'un
 * repli doit toujours tomber vers le plus strict (§ 20, fail-closed).
 */
export const ETATS_COFFRE = ["absent", "verrouillé", "ouvert"] as const;

export type EtatCoffre = (typeof ETATS_COFFRE)[number];

/** Rang de disponibilité, dérivé de l'ordre de `ETATS_COFFRE`. */
export function rangEtatCoffre(etat: EtatCoffre): number {
  return ETATS_COFFRE.indexOf(etat);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Les trois gestes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'un humain — ou le démarrage — peut FAIRE au coffre.
 *
 * · `provisionner`  — créer le coffre : poser le sceau, sous une clé. Une seule
 *   fois dans la vie d'une base. C'est le geste que nomme le message de refus
 *   de démarrage (§ 25 : « le message nomme la commande »).
 * · `déverrouiller` — présenter un trousseau à un coffre qui existe. Servi SANS
 *   le coffre, depuis la console, depuis un téléphone (§ 21 : « la v5
 *   permettait de fermer depuis un téléphone et imposait un terminal pour
 *   rouvrir »).
 * · `verrouiller`   — refermer. C'est le geste de l'arrêt d'urgence (§ 25). Il
 *   ne doit JAMAIS échouer parce que le coffre serait déjà fermé : un bouton
 *   d'urgence qui rend une erreur est un bouton qu'on hésite à presser.
 */
export const GESTES_COFFRE = ["provisionner", "déverrouiller", "verrouiller"] as const;

export type GesteCoffre = (typeof GESTES_COFFRE)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  La table des transitions
// ═════════════════════════════════════════════════════════════════════════════

export interface TransitionCoffre {
  readonly depuis: EtatCoffre;
  readonly geste: GesteCoffre;
  readonly vers: EtatCoffre;
  /** Pourquoi cette transition existe. Lu par les gardes, et par l'humain. */
  readonly motif: string;
}

/**
 * LES QUATRE TRANSITIONS PERMISES, ET ELLES SEULES.
 *
 * Ce qui n'est pas dans cette table est REFUSÉ. Trois refus méritent leur nom,
 * parce que ce sont les trois erreurs qu'on écrit sans y penser :
 *
 *  · `absent` + `déverrouiller` — on ne rouvre pas ce qui n'existe pas. Le
 *    laisser passer transformerait « coffre absent » en « coffre vide et
 *    ouvert », c'est-à-dire en un socle qui démarre en croyant avoir un coffre.
 *  · `ouvert` + `provisionner` — provisionner écrit le sceau. Sur un coffre
 *    ouvert, cela remplacerait le sceau d'un coffre qui contient déjà des
 *    secrets : toutes les lignes deviendraient orphelines.
 *  · `absent` + `verrouiller` — rien à fermer. Ce refus est le seul des trois
 *    qui soit inoffensif ; il est là pour que la table reste exhaustive.
 *
 * `absent` N'EST LA DESTINATION D'AUCUNE TRANSITION : un coffre ne disparaît
 * pas en cours de route. Une garde le vérifie en dérivant la colonne `vers`.
 */
export const TRANSITIONS_COFFRE = [
  {
    depuis: "absent",
    geste: "provisionner",
    vers: "ouvert",
    motif: "Créer le coffre : poser le sceau sous la clé fournie par la source.",
  },
  {
    depuis: "verrouillé",
    geste: "déverrouiller",
    vers: "ouvert",
    motif: "Le trousseau présenté ouvre le sceau — c'est la preuve, pas la promesse.",
  },
  {
    depuis: "ouvert",
    geste: "verrouiller",
    vers: "verrouillé",
    motif: "Arrêt d'urgence, inactivité, ou rotation de clé interrompue.",
  },
  {
    depuis: "verrouillé",
    geste: "verrouiller",
    vers: "verrouillé",
    motif:
      "IDEMPOTENT À DESSEIN : l'arrêt d'urgence ne doit jamais rendre une erreur " +
      "parce que le coffre était déjà fermé.",
  },
] as const satisfies readonly TransitionCoffre[];

// ═════════════════════════════════════════════════════════════════════════════
//  Appliquer un geste
// ═════════════════════════════════════════════════════════════════════════════

export type ResultatTransition =
  | { readonly permise: true; readonly vers: EtatCoffre; readonly motif: string }
  | { readonly permise: false; readonly reste: EtatCoffre; readonly motif: string };

/**
 * Le geste est-il permis depuis cet état ? La réponse est LUE DANS LA TABLE,
 * jamais recalculée par une cascade de conditions : c'est ce qui permet aux
 * gardes de couvrir les neuf paires en dérivant les deux énumérations.
 */
export function appliquerGeste(etat: EtatCoffre, geste: GesteCoffre): ResultatTransition {
  const transition = TRANSITIONS_COFFRE.find((t) => t.depuis === etat && t.geste === geste);

  if (transition === undefined) {
    return {
      permise: false,
      reste: etat,
      motif: `Geste « ${geste} » interdit depuis l'état « ${etat} ».`,
    };
  }

  return { permise: true, vers: transition.vers, motif: transition.motif };
}

/** Les gestes permis depuis cet état. Dérivé de la table, jamais énuméré. */
export function gestesPermis(etat: EtatCoffre): readonly GesteCoffre[] {
  return TRANSITIONS_COFFRE.filter((t) => t.depuis === etat).map((t) => t.geste);
}

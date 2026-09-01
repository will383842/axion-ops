/**
 * `adapters/zoho-mail/bootstrap/mandat.ts` — **CE QUI REND UN AMORÇAGE
 * AUTOMATIQUE IMPOSSIBLE, ET NON SEULEMENT DÉCONSEILLÉ.**
 *
 * ═══ LE DANGER, ÉCRIT AVANT LE REMÈDE ═══
 *
 * Le § 27 rappelle que la régénération du jeton Zoho est **PLAFONNÉE EN NOMBRE
 * par client**. Zoho ne refuse pas l'amorçage de trop : il **invalide le plus
 * ancien des jetons de rafraîchissement** pour faire de la place. La forme que
 * prend l'incident est donc la pire qui soit — l'adaptateur qui marchait hier
 * rend 401, sans qu'aucun geste récent ne l'explique, et le journal ne porte
 * aucune erreur au moment où le dégât a eu lieu.
 *
 * La façon dont on arrive là est toujours la même : **un secours**. Le socle
 * démarre, l'adaptateur Zoho ne trouve pas son jeton, quelqu'un a écrit « alors
 * on relance l'amorçage » — et une boucle de redémarrage brûle le budget d'une
 * année en une nuit.
 *
 * ═══ POURQUOI UN COMMENTAIRE NE SUFFIT PAS ═══
 *
 * « Ne jamais appeler ceci automatiquement » est une phrase. Elle est vraie le
 * jour où on l'écrit et fausse le jour où quelqu'un cherche à faire redémarrer
 * la production à 2 h du matin. Ce fichier remplace la phrase par **trois
 * conditions du monde réel qu'un chemin de secours ne peut pas satisfaire**, et
 * par **un type que rien ne peut fabriquer depuis l'extérieur**.
 *
 * ═══ LES QUATRE VERROUS, ET CE QUE CHACUN INTERDIT EXACTEMENT ═══
 *
 *  1. **LE MANDAT EST UN JETON MARQUÉ, PAS UN BOOLÉEN.** `amorcer()` exige un
 *     `MandatDAmorcage`. Le symbole qui le marque n'est pas exporté : hors de ce
 *     module, **le type est inhabitable** — on ne peut pas écrire un littéral
 *     qui le satisfasse. Et à l'exécution, `estUnMandatDelivre()` confronte
 *     l'objet à un `WeakSet` privé : **un objet forgé qui aurait la bonne forme
 *     n'y est pas**. Un `as MandatDAmorcage` ne franchit donc pas le contrôle.
 *  2. **STDIN DOIT ÊTRE UN TERMINAL.** Un service relancé par systemd, un
 *     conteneur, un `exec` depuis un serveur HTTP, un travail de CI : aucun n'a
 *     de terminal sur son entrée standard. C'est la seule propriété qui
 *     distingue « un humain vient de taper la commande » de « un programme
 *     vient de décider ».
 *  3. **CE MODULE DOIT ÊTRE LE PROGRAMME LANCÉ.** Un socle qui échoue à démarrer
 *     est, par définition, le programme lancé — donc `ops/index.ts`. Il ne peut
 *     pas devenir celui-ci en cours de route.
 *  4. **UN ARGUMENT SENTINELLE DOIT ÊTRE PRÉSENT.** Il est porté par le script
 *     de `package.json`, pas tapé par Will. Il ne défend rien à lui seul ; il
 *     ferme le cas du binaire lancé à la main « pour voir ».
 *
 * ⚠️ **CE QUI EST IMPOSSIBLE, ET CE QUI EST SEULEMENT IMPROBABLE — LA BORNE.**
 *    Verrous 1 et 4 rendent un déclenchement **DANS LE PROCESSUS DU SOCLE**
 *    impossible : aucun chemin d'appel n'existe, et `declenchement-automatique.
 *    temoin.spec.ts` le mesure en confrontant TOUS les modules de production.
 *    Verrous 2 et 3 rendent un déclenchement **PAR UN AUTRE PROCESSUS** très
 *    difficile : un humain déterminé qui allouerait un pseudo-terminal y
 *    arriverait. Ce n'est pas la menace — la menace est la commodité écrite un
 *    soir de panne, et un pseudo-terminal n'est pas une commodité.
 *
 * ⚠️ **AUCUN SECRET, AUCUN RÉSEAU.** Ce module ne lit que quatre propriétés du
 *    monde, toutes remises en paramètre.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE MANDAT CONSTATE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'argument que le script de `package.json` pose. **Il n'est pas tapé par
 * Will** : sa part reste un clic.
 */
export const ARGUMENT_SENTINELLE = "--amorcage-explicite";

/**
 * Ce que le monde doit dire pour qu'un mandat soit délivré. **Aucune de ces
 * quatre valeurs n'est lue par ce module** : elles lui sont remises, ce qui
 * permet à la garde de fabriquer les quatre refus sans mutiler la machine.
 */
export interface IntentionConstatee {
  /** `process.argv.slice(2)`, tel quel. */
  readonly arguments: readonly string[];
  /** `process.stdin.isTTY === true`. Un humain est-il devant ? */
  readonly entreeEstUnTerminal: boolean;
  /** Ce module est-il LE programme lancé ? Dérivé, jamais déclaré. */
  readonly estLeProgrammeLance: boolean;
  /**
   * Le nom du programme que l'appelant croit exécuter. Il n'entre dans AUCUNE
   * décision : il n'existe que pour que le refus soit lisible.
   */
  readonly programme: string;
}

/** Les quatre façons dont un mandat est refusé, et elles sont NOMMÉES. */
export const REFUS_DE_MANDAT = [
  /** Verrou 3 — un autre programme est aux commandes. */
  "pas-le-programme-lance",
  /** Verrou 4 — l'argument du script de `package.json` manque. */
  "sentinelle-absente",
  /** Verrou 2 — personne n'est devant le terminal. */
  "aucun-terminal",
] as const;

export type RefusDeMandat = (typeof REFUS_DE_MANDAT)[number];

/** Le refus, avec ce qu'il faut faire — jamais un simple `false`. */
export interface MandatRefuse {
  readonly delivre: false;
  readonly refus: RefusDeMandat;
  readonly lignes: readonly string[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  VERROU 1 — UN TYPE QUE L'EXTÉRIEUR NE PEUT PAS HABITER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **CE SYMBOLE N'EST PAS EXPORTÉ, ET C'EST TOUT LE MÉCANISME.** Un
 *    `unique symbol` déclaré et gardé pour soi rend le type ci-dessous
 *    **inhabitable** hors de ce module : aucun littéral, aucun objet construit
 *    ailleurs ne peut porter cette propriété, parce que sa clé n'a pas de nom
 *    accessible. Le seul contournement restant est `as MandatDAmorcage`, et le
 *    `WeakSet` ci-dessous le ferme à l'exécution.
 */
declare const MARQUE_DU_MANDAT: unique symbol;

/**
 * **LE MANDAT.** Il ne porte aucune donnée utile : il n'est pas un message, il
 * est une **preuve d'origine**. Le rendre porteur d'options inviterait à le
 * construire pour ses options, et le mécanisme se viderait de lui-même.
 */
export interface MandatDAmorcage {
  readonly [MARQUE_DU_MANDAT]: "amorçage-zoho";
  /** Le programme qui l'a demandé. Pour le rapport, jamais pour une décision. */
  readonly programme: string;
}

/**
 * ⚠️ **LE REGISTRE DES MANDATS RÉELLEMENT DÉLIVRÉS.** Un `WeakSet` : il ne
 *    retient rien, il reconnaît. C'est lui qui distingue un mandat de ce module
 *    d'un objet auquel un `as` a donné le bon type — et sans lui, le verrou 1 ne
 *    tiendrait qu'à la compilation, c'est-à-dire pas du tout à l'exécution.
 */
const MANDATS_DELIVRES = new WeakSet<object>();

/**
 * **LE SEUL CONTRÔLE QUI VAILLE À L'EXÉCUTION.** `amorcer()` l'appelle, et
 * refuse tout objet qui n'y répond pas.
 */
export function estUnMandatDelivre(candidat: unknown): candidat is MandatDAmorcage {
  return typeof candidat === "object" && candidat !== null && MANDATS_DELIVRES.has(candidat);
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA DÉLIVRANCE — LA SEULE PORTE, ET ELLE EST GARDÉE PAR TROIS CONSTATS
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que rend la demande de mandat : un mandat, ou un refus qui s'explique. */
export type IssueDuMandat =
  { readonly delivre: true; readonly mandat: MandatDAmorcage } | MandatRefuse;

/**
 * **DÉLIVRE UN MANDAT, OU REFUSE EN DISANT POURQUOI.**
 *
 * ⚠️ **L'ORDRE DES TROIS CONSTATS EST LA DÉCISION.** Le programme d'abord, la
 *    sentinelle ensuite, le terminal en dernier. L'inverse dirait à un socle en
 *    train de tomber « il te manque un terminal » — c'est-à-dire l'invitation
 *    exacte à en allouer un. Le premier message doit dire « ce n'est pas à toi
 *    de faire ce geste », pas « voilà ce qui te manque pour le faire ».
 *
 * ⚠️ **AUCUNE OPTION `force`, AUCUN PARAMÈTRE `raison`.** Une porte dérobée
 *    prévue pour l'urgence est une porte utilisée pendant l'urgence. Le seul
 *    chemin est celui du haut.
 */
export function demanderUnMandat(intention: IntentionConstatee): IssueDuMandat {
  if (!intention.estLeProgrammeLance) {
    return {
      delivre: false,
      refus: "pas-le-programme-lance",
      lignes: [
        `REFUS : l'amorçage Zoho a été demandé depuis « ${intention.programme} », qui n'est ` +
          "pas le programme d'amorçage. **Ce geste n'est jamais un secours.**",
        "Zoho PLAFONNE le nombre de jetons de rafraîchissement par client (§ 27), et " +
          "l'amorçage de trop n'échoue pas : il INVALIDE le plus ancien. Un socle qui " +
          "réamorcerait à chaque démarrage raté perdrait l'accès sans un mot, et le 401 " +
          "arriverait des jours plus tard.",
        "Si un jeton manque au coffre, la réponse est de le DÉPOSER — pas d'en fabriquer " +
          "un nouveau. Voir `DEPS.md`, § « Du coffre local au coffre de production ».",
      ],
    };
  }

  if (!intention.arguments.includes(ARGUMENT_SENTINELLE)) {
    return {
      delivre: false,
      refus: "sentinelle-absente",
      lignes: [
        `REFUS : l'argument « ${ARGUMENT_SENTINELLE} » manque. Il est porté par le script ` +
          "déclaré dans `package.json` — voir `DEPS.md` pour la ligne exacte.",
        "Lancer le fichier directement contourne le script, donc l'argument, donc ce " +
          "contrôle : c'est précisément ce qu'il refuse.",
      ],
    };
  }

  if (!intention.entreeEstUnTerminal) {
    return {
      delivre: false,
      refus: "aucun-terminal",
      lignes: [
        "REFUS : l'entrée standard n'est pas un terminal. Un humain doit être devant — " +
          "l'amorçage se termine par un CLIC dans un navigateur, et personne ne clique " +
          "dans un conteneur.",
        "Si vous voyez ce refus dans un terminal : l'entrée a été redirigée (un `|`, un " +
          "`< fichier`, ou une exécution par un outil qui ferme stdin). Relancer sans " +
          "redirection.",
      ],
    };
  }

  // ⚠️ LE MANDAT NAÎT ICI ET NULLE PART AILLEURS, et il est inscrit au registre
  //    dans le même souffle. Une inscription faite par un appelant plus tard
  //    laisserait exister, entre les deux, un mandat que le contrôle refuse —
  //    et la première correction serait d'exporter le registre.
  const mandat = { programme: intention.programme } as unknown as MandatDAmorcage;
  MANDATS_DELIVRES.add(mandat);
  return { delivre: true, mandat };
}

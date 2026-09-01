/**
 * voice/etats/vocabulaire.ts — LES ÉTATS, LES GESTES, ET LES DEUX OBLIGATIONS
 * QUI EN DÉRIVENT.
 *
 * Ce fichier ne décide rien : il NOMME. La table des transitions vit dans
 * `machine.ts`, l'horloge dans `fenetre.ts`. Aucun matériel, aucun modèle,
 * aucun `Date.now()` — le temps est un paramètre partout (motif de
 * `core/vault/etat.ts` et du hub de planning d'Axion-IA : une machine qui lit
 * l'heure elle-même n'est pas testable).
 *
 * ═══ LES DEUX SECTIONS QUI COMMANDENT CE FICHIER ═══
 *
 * § 18, ligne « Quelqu'un à portée de voix d'une machine déverrouillée » :
 *
 *   « Le micro n'authentifie personne. → Verrouillage du démon après
 *     inactivité · aucun desserrage ni changement de profil hors fenêtre
 *     déverrouillée. »
 *
 * § 20, règle de tri des commandes hors modèle :
 *
 *   « Une commande hors modèle n'est admise sans facteur que si elle réduit
 *     strictement l'ensemble des outils exposés. Changer de profil change la
 *     surface exposée — donc facteur, TTL, ligne au journal. »
 *
 * D'où la règle de tenue de ce fichier : **AUCUNE LISTE DE GESTES PRIVILÉGIÉS
 * N'EST ÉCRITE À LA MAIN.** Chaque geste DÉCLARE deux propriétés — sa `nature`
 * et son `effet` sur la surface exposée — et les deux obligations (second
 * facteur, fenêtre déverrouillée) en sont CALCULÉES. Une liste écrite à la main
 * serait juste jusqu'au jour où un seizième geste s'ajoute sans y entrer : le
 * jumeau oublié, qui élargit la surface sans jamais rencontrer un facteur.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  Les sept états
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ORDRE DU TABLEAU EST SIGNIFIANT — du plus fermé au plus engagé, comme
 * `ETATS_COFFRE` dans `core/vault/etat.ts`.
 *
 * · `verrouillé`  — la fenêtre est close. Le démon entend peut-être, il
 *   n'obéit qu'aux gestes qui RÉDUISENT. C'est l'état d'après l'inactivité, et
 *   celui vers lequel tout repli tombe (§ 20, fail-closed).
 * · `en-veille`   — fenêtre ouverte, rien en cours. C'est l'état de REPOS : la
 *   destination de tout ce qui s'achève ou s'annule.
 * · `écoute`      — la capture est ouverte, la parole entre.
 * · `transcrit`   — la capture est close, la transcription locale tourne. C'est
 *   ici que la fourche du § 30 se joue : commande hors modèle, ou tour de
 *   modèle.
 * · `en-tour`     — une session Claude Code tient le tour (ADR 0010, voie B).
 * · `parle`       — la synthèse joue. C'est l'état que l'interruption vise.
 * · `interrompu`  — la synthèse a été coupée et le tour rappelé ; le démon
 *   attend que le calme revienne avant de rouvrir la capture. Ce n'est PAS un
 *   état de confort : sans lui, « couper » et « écouter à nouveau » seraient le
 *   même instant, et le reçu d'`interrupt()` n'aurait nulle part où être
 *   attendu (ADR 0010 § 3 : `still_queued`).
 */
export const ETATS_VOCAUX = [
  "verrouillé",
  "en-veille",
  "écoute",
  "transcrit",
  "en-tour",
  "parle",
  "interrompu",
] as const;

export type EtatVocal = (typeof ETATS_VOCAUX)[number];

/**
 * L'état le plus fermé, DÉRIVÉ de la tête du tableau — jamais écrit
 * « verrouillé » ailleurs qu'ici.
 */
export const ETAT_LE_PLUS_FERME: EtatVocal = ETATS_VOCAUX[0];

/** Rang d'engagement, dérivé de l'ordre de `ETATS_VOCAUX`. */
export function rangEtatVocal(etat: EtatVocal): number {
  return ETATS_VOCAUX.indexOf(etat);
}

/**
 * LA FENÊTRE EST-ELLE OUVERTE DANS CET ÉTAT ?
 *
 * ⚠️ Attention au piège, il est au cœur de ce module : ceci répond sur
 * l'**état**, pas sur le **temps**. Un démon peut être en `écoute` alors que le
 * délai d'inactivité est déjà écoulé et que la minuterie n'a pas encore battu.
 * La fenêtre réellement déverrouillée est la CONJONCTION des deux — voir
 * `fenetre.ts:fenetreDeverrouillee`. Décider un desserrage sur cette
 * fonction-ci seule laisserait passer tout ce qui arrive dans l'intervalle.
 */
export function fenetreOuverte(etat: EtatVocal): boolean {
  return etat !== ETAT_LE_PLUS_FERME;
}

/** Les états à fenêtre ouverte, DÉRIVÉS — jamais réénumérés. */
export const ETATS_OUVERTS: readonly EtatVocal[] = ETATS_VOCAUX.filter(fenetreOuverte);

/**
 * L'état de repos, DÉRIVÉ : le premier état ouvert dans l'ordre du tableau.
 *
 * C'est la destination de tout ce qui s'achève, s'annule ou s'arrête. Le
 * dériver plutôt que l'écrire fait que déplacer `en-veille` dans
 * `ETATS_VOCAUX` déplace aussi toutes les destinations qui en dépendent, au
 * lieu de laisser une table qui pointe vers l'ancien repos.
 */
export const ETAT_AU_REPOS: EtatVocal = ETATS_OUVERTS[0] ?? ETAT_LE_PLUS_FERME;

/**
 * Les états ENGAGÉS : ouverts, et autres que le repos. Ce sont ceux où il
 * existe quelque chose à annuler. Dérivés, eux aussi.
 */
export const ETATS_ENGAGES: readonly EtatVocal[] = ETATS_OUVERTS.filter(
  (etat) => etat !== ETAT_AU_REPOS,
);

// ═════════════════════════════════════════════════════════════════════════════
//  Ce qu'un geste FAIT à la surface exposée
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ORDRE EST SIGNIFIANT : du plus fermant au plus ouvrant. Le § 20 ne
 * distingue que deux camps — « réduit strictement » et le reste — mais un
 * troisième existe et il fallait le nommer : les gestes de conduite
 * (`clore-la-capture`, `répondre`…) ne touchent pas à la surface. Les
 * confondre avec « élargit » ferait demander un TOTP pour dire qu'une phrase
 * est finie ; les confondre avec « réduit » leur donnerait à tort la franchise
 * du § 20.
 */
export const EFFETS_SUR_LA_SURFACE = ["réduit", "neutre", "élargit"] as const;

export type EffetSurLaSurface = (typeof EFFETS_SUR_LA_SURFACE)[number];

/** Rang d'ouverture, dérivé de l'ordre de `EFFETS_SUR_LA_SURFACE`. */
export function rangEffet(effet: EffetSurLaSurface): number {
  return EFFETS_SUR_LA_SURFACE.indexOf(effet);
}

/**
 * D'OÙ VIENT LE GESTE. C'est ce qui décide s'il tombe sous la règle de tri du
 * § 20, laquelle ne parle QUE des commandes hors modèle.
 *
 * · `conduite`             — le démon avance sa propre mécanique : la capture
 *   se clôt, la transcription rend un texte, la synthèse s'achève, le délai
 *   expire. Personne ne demande rien. Exiger un facteur ici serait exiger un
 *   TOTP pour que le silence soit détecté.
 * · `commande-hors-modèle` — une intention reconnue par la grammaire fermée,
 *   HORS du modèle (ADR 0010 § 4 : 119 ms, confiance 0,892). C'est le camp que
 *   le § 20 trie.
 * · `hors-bande`           — l'acte arrive par un canal que le démon ne peut ni
 *   lire ni écrire (§ 20, critère qualifiant du second facteur). Le
 *   déverrouillage est le seul de cette nature, et c'est ce qui l'exempte de la
 *   règle de fenêtre : il EST ce qui rouvre la fenêtre. Cette exemption est
 *   portée par une PROPRIÉTÉ DÉCLARÉE, pas par un nom de geste mis à part.
 */
export const NATURES_GESTE = ["conduite", "commande-hors-modèle", "hors-bande"] as const;

export type NatureGeste = (typeof NATURES_GESTE)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  D'où vient le facteur — § 18 et § 20, tenus par le type
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ORDRE EST SIGNIFIANT : du moins probant au probant. **Seule la dernière
 * valeur compte comme second facteur**, et cette règle est DÉRIVÉE de la
 * queue du tableau.
 *
 * · `voix`      — § 18, mot pour mot : « le micro n'authentifie personne ». Une
 *   phrase prononcée n'est jamais un facteur, même parfaitement reconnue, même
 *   par la voix de Will : c'est précisément l'adversaire « quelqu'un à portée
 *   de voix d'une machine déverrouillée ».
 * · `démon`     — § 20 : « ni l'élicitation MCP, ni une réponse produite par le
 *   démon vocal ne comptent comme confirmation humaine — sans cette clause, la
 *   voie B du § 30 contourne le niveau confirmé par construction ». Le démon ne
 *   s'autorise pas lui-même.
 * · `hors-bande` — un canal que le socle ne peut ni lire ni écrire : le TOTP du
 *   § 20. C'est la seule provenance probante.
 *
 * Le type `ProvenanceFacteur | null` remplace un `facteurPresente: boolean` :
 * un booléen aurait rendu « Will a tapé son TOTP » et « le démon a dit oui »
 * indiscernables — la même confusion qu'un `vaultLocked: boolean` écrasant
 * `absent` et `verrouillé` (§ 23).
 */
export const PROVENANCES_FACTEUR = ["voix", "démon", "hors-bande"] as const;

export type ProvenanceFacteur = (typeof PROVENANCES_FACTEUR)[number];

/**
 * La seule provenance probante, DÉRIVÉE de la queue du tableau.
 *
 * Le repli `?? "hors-bande"` est INATTEIGNABLE — le tableau est un tuple non
 * vide — et n'est là que parce que `noUncheckedIndexedAccess` exige une réponse
 * pour un index calculé. Une garde de `vocabulaire.spec.ts` vérifie que cette
 * constante vaut bien la queue, pour qu'un réordonnancement du tableau rougisse
 * au lieu de déplacer silencieusement ce qui prouve.
 */
export const PROVENANCE_PROBANTE: ProvenanceFacteur =
  PROVENANCES_FACTEUR[PROVENANCES_FACTEUR.length - 1] ?? "hors-bande";

/** Ce facteur prouve-t-il quoi que ce soit ? Dérivé, jamais énuméré. */
export function facteurProbant(provenance: ProvenanceFacteur | null): boolean {
  return provenance === PROVENANCE_PROBANTE;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le catalogue des gestes
// ═════════════════════════════════════════════════════════════════════════════

export interface DescriptionGeste {
  /**
   * Typé `string` et non `GesteVocal` : c'est ce catalogue-ci qui FABRIQUE
   * `GesteVocal`, et c'est ce qui permet aux gardes de lui présenter un témoin
   * portant un nom inconnu.
   */
  readonly nom: string;
  readonly nature: NatureGeste;
  readonly effet: EffetSurLaSurface;
  /** Pourquoi ce geste existe, et ce qu'il coûte. Lu par l'humain et par les gardes. */
  readonly motif: string;
}

/**
 * LES QUINZE GESTES. Chacun DÉCLARE `nature` et `effet` ; rien d'autre ne décide
 * de ses obligations.
 *
 * Sur `stop` en particulier, et c'est la raison du § 30 : **il est admis depuis
 * TOUS les états**, sans facteur, fenêtre échue ou non. Un ordre d'arrêt qui
 * dépend de l'état courant est un ordre d'arrêt qui rate au pire moment — le
 * même raisonnement que l'arrêt d'urgence idempotent du coffre (§ 25 : « un
 * bouton d'urgence qui rend une erreur est un bouton qu'on hésite à presser »).
 */
export const GESTES_VOCAUX = [
  // ── Ce qui ferme ────────────────────────────────────────────────────────
  {
    nom: "stop",
    nature: "commande-hors-modèle",
    effet: "réduit",
    motif:
      "§ 30 et § 32 : « stop coupe sans passer par le modèle ». Coupe la " +
      "synthèse, rappelle le tour (ADR 0010 : interrupt() rendu en 2 ms, " +
      "cancel_queued: true), et vide la file. Admis depuis TOUS les états.",
  },
  {
    nom: "annuler",
    nature: "commande-hors-modèle",
    effet: "réduit",
    motif:
      "§ 30 : abandonne CE QUI EST EN COURS. Contrairement à « stop », il peut " +
      "être refusé — quand il n'y a rien à annuler. C'est la différence qui " +
      "justifie deux gestes plutôt qu'un.",
  },
  {
    nom: "brouillon-seul",
    nature: "commande-hors-modèle",
    effet: "réduit",
    motif:
      "§ 20 : « resserrer est toujours libre […] exécuté immédiatement d'où " +
      "que ça vienne ». Donc admis depuis tous les états, verrouillé compris, " +
      "et sans facteur. Ne déplace pas la conversation.",
  },
  {
    nom: "verrouiller",
    nature: "commande-hors-modèle",
    effet: "réduit",
    motif:
      "Referme la fenêtre à la demande. Idempotent à dessein : il ne doit " +
      "jamais échouer parce que le démon était déjà verrouillé.",
  },
  {
    nom: "expirer-inactivité",
    nature: "conduite",
    effet: "réduit",
    motif:
      "§ 18 et § 30 : « le démon se verrouille après inactivité et redemande " +
      "un facteur ». Personne ne le demande — c'est l'horloge INJECTÉE qui le " +
      "déclenche (fenetre.ts:verrouillageDu). D'où la nature « conduite ».",
  },

  // ── Ce qui ouvre ────────────────────────────────────────────────────────
  {
    nom: "déverrouiller",
    nature: "hors-bande",
    effet: "élargit",
    motif:
      "Présente le second facteur sur un canal que le socle ne peut ni lire " +
      "ni écrire (§ 20). Seul geste de nature « hors-bande », et c'est ce qui " +
      "l'exempte de la règle de fenêtre : il est ce qui la rouvre.",
  },
  {
    nom: "desserrer",
    nature: "commande-hors-modèle",
    effet: "élargit",
    motif:
      "§ 20, asymétrie : « desserrer n'est jamais libre ». Facteur probant ET " +
      "fenêtre déverrouillée. Ne déplace pas la conversation : une politique " +
      "qui change n'interrompt pas un tour.",
  },
  {
    nom: "changer-de-profil",
    nature: "commande-hors-modèle",
    effet: "élargit",
    motif:
      "§ 20 : « passe en mode dev suit le chemin du desserrage […] changer de " +
      "profil change la surface exposée — donc facteur, TTL, ligne au " +
      "journal ». Traité exactement comme un desserrage.",
  },

  // ── La conduite du tour de parole ───────────────────────────────────────
  {
    nom: "détecter-parole",
    nature: "conduite",
    effet: "neutre",
    motif:
      "La détection de parole a mordu alors que rien ne jouait : on ouvre la " +
      "capture. Le MÊME événement physique produit « interrompre » quand la " +
      "synthèse joue — un seul capteur, deux gestes, selon l'état.",
  },
  {
    nom: "clore-la-capture",
    nature: "conduite",
    effet: "neutre",
    motif: "Le silence est revenu : la capture se ferme et part en transcription locale.",
  },
  {
    nom: "router-vers-le-modèle",
    nature: "conduite",
    effet: "neutre",
    motif:
      "La fourche du § 30 : la transcription n'était pas une commande hors " +
      "modèle, elle part donc en tour de session (ADR 0010 : 1,1 à 1,5 s " +
      "jusqu'au premier mot sur une session déjà ouverte).",
  },
  {
    nom: "répondre",
    nature: "conduite",
    effet: "neutre",
    motif: "Le tour rend du texte : la synthèse locale démarre (ADR 0010 : 116 ms, hors ligne).",
  },
  {
    nom: "achever-la-parole",
    nature: "conduite",
    effet: "neutre",
    motif: "La synthèse est allée jusqu'au bout sans être coupée. Retour au repos.",
  },
  {
    nom: "interrompre",
    nature: "conduite",
    effet: "réduit",
    motif:
      "§ 30, exigence non négociable : « couper la synthèse en parlant ». " +
      "SpeakAsyncCancelAll côté sortie, interrupt() côté tour. Réduit, parce " +
      "qu'interrompre ne peut jamais rien ouvrir.",
  },
  {
    nom: "reprendre-l-écoute",
    nature: "conduite",
    effet: "neutre",
    motif:
      "Le calme est revenu après l'interruption : la capture rouvre, sur la " +
      "phrase qui a coupé.",
  },
] as const satisfies readonly DescriptionGeste[];

export type GesteVocal = (typeof GESTES_VOCAUX)[number]["nom"];

/** Les noms seuls, DÉRIVÉS du catalogue — le motif de `PROFILE_NAMES`. */
export const NOMS_GESTES: readonly GesteVocal[] = GESTES_VOCAUX.map((geste) => geste.nom);

/** La description d'un geste. Lève si le nom est inconnu : jamais un repli muet. */
export function decrireGeste(nom: GesteVocal): DescriptionGeste {
  const geste = GESTES_VOCAUX.find((candidat) => candidat.nom === nom);
  if (geste === undefined) {
    throw new Error(`Geste vocal inconnu : « ${nom} ».`);
  }
  return geste;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX OBLIGATIONS — calculées, jamais listées
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE GESTE EXIGE-T-IL UN SECOND FACTEUR ?
 *
 * § 20, mot pour mot : « une commande hors modèle n'est admise sans facteur que
 * si elle réduit strictement l'ensemble des outils exposés ». La contraposée,
 * telle quelle : tout ce qui n'est pas de la conduite du démon, et qui ne
 * réduit pas strictement, exige le facteur.
 *
 * Deux conséquences voulues, et qu'aucune liste n'aurait tenues seule :
 *  · un geste `neutre` de nature « commande-hors-modèle » exigerait le facteur.
 *    Il n'en existe aucun aujourd'hui ; s'il en naissait un, le défaut serait
 *    du bon côté.
 *  · `déverrouiller` l'exige — il n'est pas de la conduite, et il élargit.
 */
export function exigeSecondFacteur(geste: DescriptionGeste): boolean {
  return geste.nature !== "conduite" && geste.effet !== "réduit";
}

/**
 * CE GESTE EXIGE-T-IL QUE LA FENÊTRE SOIT DÉJÀ DÉVERROUILLÉE ?
 *
 * § 18, mot pour mot : « aucun desserrage ni changement de profil hors fenêtre
 * déverrouillée ». Ce sont les deux gestes qui ÉLARGISSENT en étant demandés —
 * donc : nature « commande-hors-modèle » ET effet « élargit ».
 *
 * `déverrouiller` en est exempt parce que sa nature est « hors-bande », pas
 * parce que son nom aurait été mis à part. C'est la différence entre une règle
 * et une exception : la règle survit à l'ajout d'un seizième geste.
 */
export function exigeFenetreDeverrouillee(geste: DescriptionGeste): boolean {
  return geste.nature === "commande-hors-modèle" && geste.effet === "élargit";
}

/**
 * Les gestes qui élargissent SUR DEMANDE — dérivés, et c'est la liste que le
 * § 18 vise. Exposée pour que la console et le journal la lisent d'une seule
 * source, jamais pour être recopiée.
 */
export const GESTES_QUI_ELARGISSENT: readonly GesteVocal[] = GESTES_VOCAUX.filter(
  exigeFenetreDeverrouillee,
).map((geste) => geste.nom);

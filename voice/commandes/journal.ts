/**
 * axion-ops — `voice/commandes/journal.ts`
 *
 * CE QUE `voice/commandes` ATTEND DU JOURNAL, ET NE FAIT PAS.
 *
 * § 18, tableau du modèle de menace, ligne « Le démon vocal lui-même » :
 *
 *   Adversaire : le démon vocal — il porte le jeton et conduit des sessions.
 *   Ce qui l'arrête : « JOURNALISATION DE CHAQUE COMMANDE HORS MODÈLE AU MÊME
 *   TITRE QU'UN APPEL D'OUTIL. »
 *
 * « Au même titre » n'est pas une figure de style : c'est la même table, le même
 * chaînage, la même purge. Une commande hors modèle qui atterrirait dans un
 * journal à part serait invisible à la revue du § 20 (objectif O6) et à
 * l'ancrage du § 31 — c'est-à-dire journalisée nulle part là où on la
 * chercherait.
 *
 * ═══ CE FICHIER DÉCLARE, IL N'IMPLÉMENTE PAS ═══
 *
 * Motif repris de `core/audit/ports.ts` : « déclare l'interface et code contre
 * elle — ne la réimplémente pas ». `voice/` n'a accès ni au coffre (donc pas à
 * la clé de l'`argHash`, § 12 règle 2), ni au frappeur de `SessionId`, ni au
 * scelleur du chaînage. Une seconde implémentation serait une seconde clé, donc
 * une seconde échéance de rotation — ce que le § 12 interdit.
 *
 * ═══ CE QUI EST DÉRIVÉ ICI, ET CE QUI NE PEUT PAS L'ÊTRE ═══
 *
 * `ChampsDerives` et `ChampsDuDemon` partitionnent `ContenuLigne` par
 * `Pick`/`Omit`. La conséquence est voulue : **si `core/audit` ajoute un champ à
 * `ContenuLigne`, ce fichier CESSE DE COMPILER** tant que personne n'a dit de
 * quel côté il tombe. Un champ nouveau ne peut donc pas se remplir tout seul
 * d'une valeur par défaut permissive dans les lignes du démon vocal.
 *
 * ═══ LA TRANSCRIPTION N'ENTRE PAS DANS LE JOURNAL ═══
 *
 * Aucun champ de ce fichier ne transporte le texte prononcé — ni brut, ni
 * normalisé. Ce qui est empreint, c'est la COMMANDE RECONNUE et la forme
 * canonique appariée (voir {@link argumentsAEmpreindre}) : le fait qui décide,
 * pas la parole qui l'a porté. Le § 31 refuse tout cache de contenu, et l'ADR
 * 0010 tranche que « le poste vocal ne transmet jamais d'audio à quiconque » ;
 * en journaliser la transcription reviendrait à conserver par écrit ce qu'on a
 * refusé de transmettre.
 */

import {
  ARG_HASH_NON_VALIDE,
  EFFET_EXTERIEUR_NON_SURVENU,
  VERSION_INCONNUE,
  type ContenuLigne,
  type Decision,
  type Outcome,
} from "../../core/audit/index.js";
import type { Effect } from "../../core/types.js";
import {
  GRAMMAIRE_VERSION,
  SCEAU_GRAMMAIRE,
  type NomCommande,
  type SceauGrammaire,
} from "./grammaire.js";
import type { RegimeDeReconnaissance } from "./reconnaissance.js";
import type { Tri } from "./tri.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le nom d'outil d'une commande hors modèle
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le préfixe des lignes de journal produites par le démon vocal.
 *
 * ⚠️ ÉCART SIGNALÉ, NON COMBLÉ PAR UNE SUPPOSITION. Le § 18 exige la
 *    journalisation « au même titre qu'un appel d'outil », donc sous un nom
 *    d'outil ; AUCUN § du cahier des charges ne donne ce nom. Le motif retenu
 *    est celui qui existe déjà dans le socle pour une ligne qui n'est pas un
 *    appel : `OUTIL_CLOTURE = "ops.audit.purge"`. D'où `ops.voix.<commande>`.
 *    À trancher avec Will si un autre nommage est attendu en console.
 */
export const PREFIXE_OUTIL_VOIX = "ops.voix.";

/** Le nom d'outil d'une commande, DÉRIVÉ de son nom. Jamais écrit à la main. */
export function nomAuJournal(commande: NomCommande): string {
  return `${PREFIXE_OUTIL_VOIX}${commande}`;
}

/**
 * ⚠️ L'`effect` D'UNE COMMANDE HORS MODÈLE — ÉCART DU § 09 / § 15, DIT ICI.
 *
 * `EFFECTS` (`read` | `write-draft` | `send` | `destructive`) décrit ce qu'un
 * OUTIL fait. Une commande hors modèle n'est pas un outil : elle ne lit rien
 * chez un tiers, n'écrit aucun brouillon, n'envoie rien. Aucune des quatre
 * valeurs n'est juste, et l'énumération est fermée — en ajouter une romprait
 * l'empreinte chaînée de `ops_audit` pour un mot qui ne sert qu'ici.
 *
 * `read` est retenu comme LA MOINS FAUSSE, sur le test du § 20 lui-même —
 * « quelqu'un d'autre que moi peut-il s'en apercevoir ? ». La réponse est NON
 * pour les cinq commandes de la grammaire : aucune n'envoie, ne publie, ne pose
 * de créneau ni ne change un statut visible du client. `externalEffect` vaut du
 * même coup {@link EFFET_EXTERIEUR_NON_SURVENU}, et cette valeur-là, elle, est
 * exacte.
 *
 * ⚠️ CE QUE CE CHOIX COÛTE, POUR QU'IL SE VOIE : une revue qui compterait les
 *    lignes `effect = "read"` y trouvera des changements de gouvernance. C'est
 *    pour cela que `tool` porte un préfixe qui les isole d'un `LIKE`.
 */
export const EFFET_DE_COMMANDE_HORS_MODELE: Effect = "read";

// ═════════════════════════════════════════════════════════════════════════════
//  Ce qui est empreint
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES « ARGUMENTS » D'UNE COMMANDE HORS MODÈLE — ce que le port `ArgHasher` de
 * `core/limits` doit empreindre pour produire l'`argHash` de la ligne.
 *
 * Ce n'est PAS la transcription. C'est ce qui a décidé : quelle commande, sous
 * quelle grammaire (sceau compris — le démon est un second programme, sa
 * grammaire peut différer de celle du socle), sur quelle forme et sous quel
 * régime de reconnaissance.
 *
 * Conséquence utile et voulue : deux « stop » prononcés différemment mais
 * appariés sur la même forme donnent le MÊME `argHash`. C'est bien ce qu'on veut
 * compter au § 24 — des ordres, pas des prononciations.
 */
export interface ArgumentsDeCommande {
  readonly commande: NomCommande;
  readonly grammaire: SceauGrammaire;
  readonly formeAppariee: string | null;
  readonly regime: RegimeDeReconnaissance | null;
}

/** Construit la valeur à empreindre. Le sceau est pris à la source. */
export function argumentsAEmpreindre(
  commande: NomCommande,
  formeAppariee: string | null,
  regime: RegimeDeReconnaissance | null,
): ArgumentsDeCommande {
  return { commande, grammaire: SCEAU_GRAMMAIRE, formeAppariee, regime };
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'issue d'une commande
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUI EST ARRIVÉ À LA COMMANDE. Trois valeurs, et pas une de plus :
 *
 *  · `exécutée`             — le démon l'a appliquée, immédiatement, sans facteur.
 *  · `remise-au-desserrage` — elle élargit : le démon ne l'a PAS appliquée et l'a
 *                             remise au chemin du § 20. Ce n'est pas une panne,
 *                             c'est le fonctionnement nominal — et c'est une
 *                             ligne du journal comme une autre, sans quoi une
 *                             tentative d'élargissement à la voix ne laisserait
 *                             aucune trace.
 *  · `interrompue`          — une exception. Aucune décision n'a été atteinte.
 */
export const ISSUES_DE_COMMANDE = ["exécutée", "remise-au-desserrage", "interrompue"] as const;

export type IssueDeCommande = (typeof ISSUES_DE_COMMANDE)[number];

function jamaisIssue(issue: never): never {
  throw new Error(
    `voice/commandes/journal : issue non traitée — ${JSON.stringify(issue)}. ` +
      "Une issue nouvelle doit être classée en `decision` ET en `outcome`.",
  );
}

/**
 * L'issue, traduite dans le vocabulaire FERMÉ de `core/audit`.
 *
 * `switch` exhaustif : une issue ajoutée sans être classée est une erreur de
 * COMPILATION. C'est le motif de `canalDelivreUneConfirmation()`, et il vaut
 * doublement ici — `decision` et `outcome` sont deux colonnes que le § 24 lit
 * séparément, et une issue nouvelle qui tomberait « par défaut » dans
 * `autorisé`/`ok` ferait passer une panne pour un succès.
 */
export function traduireIssue(issue: IssueDeCommande): {
  readonly decision: Decision;
  readonly outcome: Outcome;
} {
  switch (issue) {
    case "exécutée":
      return { decision: "autorisé", outcome: "ok" };
    case "remise-au-desserrage":
      // `refusé` : le démon a refusé de l'appliquer. `non-exécuté` : rien n'a
      // tourné — c'est la définition même du mot dans `core/audit`.
      return { decision: "refusé", outcome: "non-exécuté" };
    case "interrompue":
      return { decision: "interrompu", outcome: "erreur" };
    default:
      return jamaisIssue(issue);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  La partition de `ContenuLigne`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES CHAMPS QUE SEUL LE DÉMON PEUT REMPLIR — parce qu'ils viennent d'ailleurs :
 * l'horloge, l'identité établie par le socle, la clé du coffre.
 *
 * ⚠️ `sessionId` : {@link ContenuLigne} l'accepte marqué OU
 *    `SESSION_HORS_APPEL`. Une commande hors modèle prononcée pendant une
 *    session de pilotage porte la session ; prononcée hors session — au réveil,
 *    au verrouillage — elle porte la valeur réservée. Ce module ne tranche pas :
 *    il ne peut pas frapper de `SessionId`, et en inventer une serait exactement
 *    ce que l'ADR 0014 interdit.
 */
export type ChampsDuDemon = Pick<
  ContenuLigne,
  "at" | "principal" | "sessionId" | "argHash" | "durationMs" | "policyLevel"
>;

/**
 * LES CHAMPS QUE CE MODULE DÉRIVE. Complémentaire exact de {@link ChampsDuDemon}
 * — d'où `Omit`, et non une seconde liste qui divergerait au premier ajout.
 */
export type ChampsDerives = Omit<ContenuLigne, keyof ChampsDuDemon>;

/** L'évènement tel que le démon le constate. Aucune transcription n'y figure. */
export interface EvenementCommandeHorsModele {
  readonly commande: NomCommande;
  readonly issue: IssueDeCommande;
  /** Le verdict du § 20 qui a produit cette issue. Sert au message, pas au chaînage. */
  readonly tri: Pick<Tri, "axe" | "chemin" | "elargit" | "reduitStrictement" | "mesureAveugle">;
}

/**
 * PROJETTE UNE COMMANDE HORS MODÈLE SUR LA LIGNE DE JOURNAL.
 *
 * Ne journalise rien : rend les champs, pour que l'implémenteur du port n'ait
 * rien à deviner. Toute la valeur du fichier est là — un mapping deviné à quatre
 * endroits différents serait quatre mappings.
 */
export function projeterAuJournal(evenement: EvenementCommandeHorsModele): ChampsDerives {
  const { decision, outcome } = traduireIssue(evenement.issue);

  return {
    tool: nomAuJournal(evenement.commande),
    // § 13.4 — la version est portée par l'outil. Pour une commande hors modèle,
    // « la version qui a servi » est celle de la GRAMMAIRE qui l'a reconnue.
    toolVersion: GRAMMAIRE_VERSION,
    // Aucun adaptateur n'est intervenu. La valeur réservée du socle, plutôt
    // qu'une chaîne vide qui se lirait comme une donnée perdue.
    adapterVersion: VERSION_INCONNUE,
    effect: EFFET_DE_COMMANDE_HORS_MODELE,
    decision,
    // ⚠️ ÉCART SIGNALÉ. `stepDenied` porte LE NUMÉRO de l'étape du § 11 qui a
    //    refusé. Une commande hors modèle ne traverse AUCUNE des quatorze étapes
    //    — c'est sa définition même : elle ne passe pas par le modèle, donc pas
    //    par la chaîne d'appel. Lui prêter l'étape 7 (« absent du profil ») ou
    //    l'étape 10 (« la politique refuse ») nommerait une étape qui n'a pas
    //    tourné. `null` est ici la seule valeur vraie, et le champ le permet.
    stepDenied: null,
    // La grammaire fermée EST le schéma : ce qui est empreint est la commande
    // VALIDÉE, jamais une chaîne brute. Dérivé de la constante du socle plutôt
    // qu'écrit `true`, pour que le sens reste attaché au nom.
    argHashValidated: !ARG_HASH_NON_VALIDE,
    // Aucun identifiant d'enregistrement : une commande hors modèle ne touche
    // aucune fiche.
    recordIds: [],
    partialSources: [],
    outcome,
    externalEffect: EFFET_EXTERIEUR_NON_SURVENU,
  };
}

/** Assemble la ligne complète. Le démon fournit ce que lui seul connaît. */
export function ligneDeCommande(
  evenement: EvenementCommandeHorsModele,
  champsDuDemon: ChampsDuDemon,
): ContenuLigne {
  return { ...projeterAuJournal(evenement), ...champsDuDemon };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le port
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE JOURNAL DES COMMANDES HORS MODÈLE.
 *
 * FOURNI PAR : `core/audit` (via son `JournalStore` et son scelleur), branché au
 * lot 8. Tant qu'il ne l'est pas, `voice/commandes` compile, ses gardes tournent
 * sur un double, et rien n'est réimplémenté en double dans le socle.
 *
 * ⚠️ DEUX EXIGENCES QUE L'IMPLÉMENTATION DOIT TENIR, ET QU'AUCUN TYPE N'EXPRIME :
 *
 *  1. **La ligne est écrite MÊME QUAND LA COMMANDE N'EST PAS APPLIQUÉE.** Le
 *     § 18 vise l'adversaire « le démon vocal lui-même » : c'est la tentative
 *     qui l'intéresse, pas seulement le succès. Une implémentation qui ne
 *     journaliserait que les commandes exécutées laisserait les tentatives
 *     d'élargissement à la voix sans aucune trace — exactement ce qu'on
 *     surveille.
 *
 *  2. **L'écriture ne conditionne pas l'exécution d'un ARRÊT.** Le § 32 exige
 *     que « stop » coupe sans passer par le modèle ; un journal injoignable ne
 *     doit pas retenir la coupure. L'ordre est : couper d'abord, journaliser
 *     ensuite, et faire du bruit si l'écriture échoue. Pour les commandes qui
 *     élargissent, l'ordre est l'inverse — mais elles ne sont de toute façon pas
 *     applicables par la voix (voir `LA_VOIX_CONFIRME` dans `tri.ts`).
 */
export interface JournalDesCommandes {
  /**
   * Journalise une commande hors modèle, au même titre qu'un appel d'outil.
   *
   * @param ligne - la ligne complète, telle que {@link ligneDeCommande} la
   *   compose. Elle n'est pas encore chaînée : `prevHash`, `selfHash` et `seq`
   *   appartiennent à `core/audit`.
   */
  journaliser(ligne: ContenuLigne): Promise<void>;
}

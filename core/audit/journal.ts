/**
 * `core/audit/journal.ts` — L'INVARIANT DE SORTIE.
 *
 * § 11, sous le tableau des quatorze étapes :
 *
 *   « Le journal n'est PAS une étape — c'est un INVARIANT DE SORTIE. Toute
 *     terminaison, Y COMPRIS CHAQUE REFUS, écrit une ligne d'`ops_audit`
 *     portant le numéro de l'étape qui a refusé. Sans cela l'objectif O6 est
 *     faux dès le premier jour, et la métrique “refus de politique” du § 24 n'a
 *     aucune source. »
 *
 * ═══ POURQUOI UN HELPER, ET PAS UNE CONSIGNE ═══
 *
 * Une consigne « n'oubliez pas de journaliser » se tient quatorze fois sur
 * quinze. Le quinzième chemin — celui qu'on ajoute six mois plus tard, un refus
 * de plus dans un `switch` — sort sans ligne, et personne ne le voit : un
 * journal incomplet a exactement la même tête qu'un journal complet.
 *
 * `avecJournal` retourne le problème : le corps ne PEUT PAS sortir sans passer
 * par l'écriture, parce que c'est le helper qui rend la valeur, jamais le
 * corps. Les trois chemins de sortie d'une fonction JavaScript — retour normal,
 * exception, rejet de promesse — y aboutissent tous les trois, et
 * `journal.spec.ts` les énumère à partir de `APPEL_STEPS` plutôt que de les
 * lister à la main.
 *
 * ═══ FAIL-CLOSED ═══
 *
 * Si l'écriture du journal échoue, l'appel ÉCHOUE. Rendre le résultat en
 * avalant l'erreur de journalisation servirait un appel non tracé sous
 * l'apparence d'un appel normal — c'est-à-dire exactement le trou que O6
 * interdit. La panne de journal est une panne du socle.
 */

import {
  APPEL_STEPS,
  type AppelStep,
  type AppelStepKey,
  type Effect,
  type PolicyLevel,
} from "../types.js";
import { verifierAucunContenu, ErreurContenuJournal } from "./contenu.js";
import { calculerSelfHash } from "./canonique.js";
import type { Horloge, JournalStore, ScelleurJournal } from "./ports.js";
import { HORLOGE_SYSTEME } from "./ports.js";
import type { ContenuLigne, Decision, LigneEcrite, Outcome, Terminaison } from "./vocabulaire.js";
// ADR 0014 — import de TYPE : nommer `SessionId` n'est pas le droit d'en frapper
// une, et la garde G2 refuse l'import de VALEUR, pas celui du nom.
import type { SessionId } from "../identite/session.js";
import {
  ARG_HASH_NON_LU,
  ARG_HASH_NON_VALIDE,
  EFFET_EXTERIEUR_NON_SURVENU,
  OUTIL_INCONNU,
  VERSION_INCONNUE,
} from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Erreurs
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'écriture du journal a échoué. Elle NE SE RATTRAPE PAS : un appel qu'on ne
 * sait pas journaliser est un appel qui n'a pas eu lieu.
 */
export class ErreurJournalIndisponible extends Error {
  /**
   * La panne APPLICATIVE qui a précédé, quand il y en a une.
   *
   * ⚠️ POURQUOI UN CHAMP À PART, ET PAS `cause`. `cause` porte l'échec du
   * journal — c'est lui qui explique pourquoi cette erreur-ci existe. La panne
   * applicative, elle, est une SECONDE cause, antérieure et indépendante : le
   * corps de l'appel est tombé, PUIS le journal n'a pas pu l'écrire. Les
   * empiler dans une seule chaîne ferait croire à une causalité qui n'existe
   * pas. Les deux sont lisibles, aucune ne masque l'autre.
   */
  readonly panneApplicative: unknown;

  constructor(causeSousJacente: unknown, panneApplicative: unknown = undefined) {
    super("§ 11 — le journal est indisponible : l'appel ne peut pas être servi sans trace", {
      cause: causeSousJacente,
    });
    this.name = "ErreurJournalIndisponible";
    this.panneApplicative = panneApplicative;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le journal
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'écrivain du journal chaîné.
 *
 * Il ne fait que trois choses, et rien d'autre : refuser une ligne qui porte du
 * contenu (§ 31), chaîner, écrire.
 */
export class Journal {
  readonly #scelleur: ScelleurJournal;
  readonly #store: JournalStore;
  readonly #horloge: Horloge;

  /**
   * @param scelleur ADR 0002 — le scellement de la chaîne. PREMIER PARAMÈTRE et
   *   OBLIGATOIRE : un scelleur optionnel, avec un repli en SHA nu quand il
   *   manque, annulerait la protection pour quiconque oublierait de le passer,
   *   et personne ne le verrait. Fourni par `core/sceau`.
   */
  constructor(scelleur: ScelleurJournal, store: JournalStore, horloge: Horloge = HORLOGE_SYSTEME) {
    this.#scelleur = scelleur;
    this.#store = store;
    this.#horloge = horloge;
  }

  get horloge(): Horloge {
    return this.#horloge;
  }

  /** Le scelleur, pour que `verifierChaine` vérifie CE journal-ci. */
  get scelleur(): ScelleurJournal {
    return this.#scelleur;
  }

  /**
   * Écrit une ligne, chaînée à la précédente.
   *
   * ⚠️ La lecture du chaînon et l'écriture forment une SECTION CRITIQUE que le
   *    store doit tenir (voir `ports.ts`). Deux appels concurrents qui liraient
   *    le même `prevHash` produiraient deux lignes prétendant succéder à la même.
   *
   * @throws ErreurContenuJournal si la ligne porte autre chose que des formes
   *   admises (§ 31) — l'écriture est REFUSÉE, pas dégradée.
   * @throws ErreurJournalIndisponible si le store échoue.
   */
  async journaliser(contenu: ContenuLigne): Promise<LigneEcrite> {
    const verdict = verifierAucunContenu(contenu);
    if (verdict.anomalies.length > 0) {
      throw new ErreurContenuJournal(verdict.anomalies);
    }

    try {
      const prevHash = await this.#store.dernierSelfHash();
      const selfHash = calculerSelfHash(this.#scelleur, prevHash, contenu);
      return await this.#store.ajouter({ ...contenu, prevHash, selfHash });
    } catch (erreur: unknown) {
      throw new ErreurJournalIndisponible(erreur);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'en-tête d'appel
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que l'on sait d'un appel AVANT de le servir — donc ce qu'on saura encore
 * s'il est refusé à l'étape 1.
 *
 * `argHash` en fait partie : il vient de `core/limits` (port `ArgHasher`) et il
 * est calculé AVANT la chaîne, sans quoi un refus précoce n'aurait rien à
 * inscrire dans la colonne et le § 24 perdrait la moitié de sa matière.
 */
export interface EnteteAppel {
  readonly principal: string;
  /**
   * ✅ **TYPE RESSERRÉ — ADR 0014, LOT 1d.** Un en-tête d'appel décrit un APPEL :
   * il a donc toujours une session de pilotage, frappée par le socle. C'est la
   * ligne de CLÔTURE (`cloture.ts`) qui n'en a pas, et elle ne passe pas par ici —
   * elle porte `SESSION_HORS_APPEL`, l'autre membre de l'union de
   * `ContenuLigne.sessionId`.
   */
  readonly sessionId: SessionId;
  readonly tool: string;
  readonly toolVersion: string;
  readonly adapterVersion: string;
  readonly effect: Effect;
  readonly policyLevel: PolicyLevel;
  readonly argHash: string;
}

/**
 * L'en-tête d'un appel refusé AVANT d'avoir été identifié — étapes 1 à 4 du
 * § 11 (Host, jeton, audience, révocation), qui refusent au niveau HTTP, avant
 * même que le corps JSON-RPC n'ait été lu.
 *
 * Il n'existe alors NI nom d'outil, NI version, NI arguments. Le § 11 veut
 * pourtant une ligne, et `ops_audit` déclare ces colonnes non nulles : on emploie
 * donc les valeurs RÉSERVÉES du vocabulaire, une fois pour toutes, plutôt que de
 * laisser chaque appelant inventer les siennes.
 *
 * ⚠️ L'`effect` inscrit est `read`. Ce n'est pas une mesure, c'est le moins
 *    faux des choix disponibles : le § 09 n'a pas de valeur « inconnu », et
 *    inscrire `destructive` gonflerait la métrique d'effets du § 24 à chaque
 *    balayage de port. TOUTE mesure d'effets doit donc EXCLURE les lignes dont
 *    le `tool` vaut `OUTIL_INCONNU`. Écart signalé au rapport.
 */
export function enteteAvantIdentification(principal: string, sessionId: SessionId): EnteteAppel {
  return {
    principal,
    sessionId,
    tool: OUTIL_INCONNU,
    toolVersion: VERSION_INCONNUE,
    adapterVersion: VERSION_INCONNUE,
    effect: "read",
    // Le niveau de repli du § 20 : rien n'a été calculé, on n'affirme rien de plus.
    policyLevel: "brouillon",
    argHash: ARG_HASH_NON_LU,
  };
}

/**
 * Ce que le corps reçoit pour AFFINER l'en-tête une fois l'étape 8 passée.
 *
 * À appeler avec l'empreinte de la valeur VALIDÉE, dès qu'elle est connue —
 * c'est-à-dire celle à laquelle le jeton de confirmation du § 20 se lie. Sans
 * cet appel, la ligne inscrit l'empreinte de la charge BRUTE, qui diffère dès
 * qu'un schéma porte un `.default()`.
 */
export type AffineurDEntete = (argHashValide: string) => void;

/**
 * LE SIGNAL D'EFFET EXTÉRIEUR — ADR 0017, câblé au lot 1d.
 *
 * ⚠️ **C'EST UN CLIQUET, ET IL NE PREND AUCUN ARGUMENT.** Une fonction
 *    `(survenu: boolean) => void` pourrait REPASSER la ligne à `false` : un
 *    chemin de sortie écrit six mois plus tard effacerait le fait qu'un envoi
 *    est parti, et personne ne le verrait. Ici, ce qui est signalé ne se
 *    dé-signale pas — la seule direction possible est celle qui accuse.
 *
 * ⚠️ **UN SEUL APPELANT.** L'orchestrateur l'appelle juste après le retour de
 *    l'adaptateur, et seulement quand `estEffetExterieur(outil.effect)` est vrai.
 *    C'est le motif d'{@link AffineurDEntete} : « il n'existe qu'UN endroit où la
 *    valeur change ». Deux appelants seraient deux occasions de désaccord, et le
 *    compilateur n'en verrait aucune.
 */
export type SignalEffetExterieur = () => void;

/**
 * LA LECTURE DU CLIQUET — **ADR 0021.**
 *
 * ⚠️ **ELLE NE PEUT NI LEVER NI BAISSER LE CLIQUET.** C'est une fonction SANS
 *    ARGUMENT qui rend un booléen : le sens unique de l'ADR 0017 est intact, et
 *    {@link SignalEffetExterieur} garde son appelant unique.
 *
 * ⚠️ **POURQUOI LE LECTEUR VIT ICI, ET NULLE PART AILLEURS.** Le cliquet est une
 *    variable de la fermeture d'{@link avecJournal}. L'orchestrateur, qui a
 *    besoin de la réponse dans son `finally` pour décider de l'issue
 *    d'idempotence, n'a que le SIGNAL. Trois autres emplacements ont été pesés et
 *    écartés (ADR 0021) : une variable tenue EN PARALLÈLE dans l'orchestrateur —
 *    deux dérivations d'un même fait, qui finissent par se contredire ; un
 *    cliquet rendu mutable et lisible (`{ get, set }`) — un objet qui expose son
 *    état invite à l'écrire ; la lecture de `ligne.externalEffect` après coup —
 *    impossible, la ligne s'écrit APRÈS le `finally` qui a besoin de la réponse.
 */
export type LecteurEffetExterieur = () => boolean;

/**
 * CE QUE LE CORPS REÇOIT — ADR 0017, câblé au lot 1c ; **troisième membre au
 * lot 1d (ADR 0021).**
 *
 * C'est le paramètre UNIQUE de `corps` : `corps: (affineurs: AffineursDAppel)
 * => Promise<Terminaison<T>>`. Un objet plutôt qu'un second paramètre
 * positionnel, pour qu'un troisième affineur — il y en aura — n'oblige personne
 * à relire l'ordre des arguments. **C'était celui-là**, et la forme n'a pas eu à
 * être trouvée : elle était décidée.
 *
 * ⚠️ CE QUE CET OBJET N'EST PAS : un sac de réglages. C'est ce que le corps
 *    reçoit pour CONNAÎTRE et pour AFFINER la ligne qui sera écrite.
 *
 * ⚠️ **CETTE PHRASE A ÉTÉ RÉÉCRITE, ET LE MOTIF COMPTE.** Elle disait : « chacun
 *    de ses membres est un point de MUTATION de la ligne ». Elle est devenue
 *    fausse d'un tiers le jour où {@link LecteurEffetExterieur} est entré — il ne
 *    mute rien. Une phrase fausse sur un contrat est précisément ce qui fait
 *    supprimer la garde suivante ; on la réécrit plutôt que de la laisser.
 *
 *    La règle qu'elle portait, elle, tient toujours et vaut d'être dite à part :
 *    **pour chaque membre qui MUTE, il n'existe qu'UN endroit où la valeur
 *    change.** C'est vrai d'`affinerArgHash` et de `signalerEffetExterieur` ;
 *    `effetExterieurSurvenu` n'en mute aucune, et ne peut pas en muter.
 */
export interface AffineursDAppel {
  readonly affinerArgHash: AffineurDEntete;
  readonly signalerEffetExterieur: SignalEffetExterieur;
  /** ADR 0021 — la LECTURE du cliquet. Elle ne mute rien, et ne le peut pas. */
  readonly effetExterieurSurvenu: LecteurEffetExterieur;
}

/** Ce que `avecJournal` rend : la terminaison, ET la ligne qui l'atteste. */
export interface AppelJournalise<T> {
  readonly terminaison: Terminaison<T>;
  readonly ligne: LigneEcrite;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'invariant
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE NUMÉRO DE L'ÉTAPE D'EXÉCUTION — DÉRIVÉ, JAMAIS ÉCRIT `14`.
 *
 * `issue()` a besoin de savoir si l'étape qui refuse est celle où l'effet
 * extérieur a déjà eu lieu. Écrire `14` à la main rendrait la dérivation fausse
 * à la première étape insérée au § 11, et rien ne le dirait : le journal
 * continuerait d'écrire un triplet cohérent, simplement faux d'un rang.
 *
 * La clé est typée `AppelStepKey` — union FERMÉE : une clé renommée dans
 * `APPEL_STEPS` est une erreur de COMPILATION ici. Le `find` ne peut donc
 * échouer qu'au prix d'une incohérence interne au tableau, et il échoue alors
 * BRUYAMMENT, au chargement du module, plutôt que de laisser un `undefined`
 * rendre la comparaison éternellement fausse — c'est-à-dire de rendre le défaut
 * de l'ADR 0017 à l'identique, en silence.
 */
function numeroDEtape(cle: AppelStepKey): AppelStep {
  const etape = APPEL_STEPS.find((candidate) => candidate.cle === cle);
  if (etape === undefined) {
    throw new Error(`§ 11 — aucune étape ne porte la clé « ${cle} » dans APPEL_STEPS`);
  }
  return etape.numero;
}

/**
 * L'étape après laquelle plus rien n'est annulable : celle où l'adaptateur est
 * appelé. C'est la SEULE dont un refus arrive APRÈS l'effet extérieur.
 */
const ETAPE_DE_L_EXECUTION: AppelStep = numeroDEtape("execution");

/**
 * Le triplet écrit selon la terminaison. Dérivé, jamais choisi au cas par cas.
 *
 * ✅ **LE MENSONGE DE L'ADR 0017 EST REFERMÉ ICI.** La dérivation ne regardait
 *    que le GENRE de la terminaison : `refus` ⇒ `outcome: "non-exécuté"`. Or
 *    l'étape 14 est la seule dont le refus arrive APRÈS l'effet extérieur —
 *    `result_too_large` se prononce sur ce qui SORT, pas sur ce qui s'est passé.
 *    Un `send` PARTI dont la réponse dépassait le plafond était donc journalisé
 *    « refusé / non-exécuté » : la ligne existait, l'invariant tenait, elle était
 *    fausse, et une revue des effets extérieurs conduite sur `ops_audit` ne le
 *    voyait jamais.
 *
 * ⚠️ **AUCUNE VALEUR N'A ÉTÉ AJOUTÉE À `OUTCOMES`, ET C'EST LE POINT.** Le
 *    vocabulaire était déjà juste : il définit `erreur` comme « incompactable
 *    (`result_too_large`), amont injoignable, ou exception », et `non-exécuté`
 *    comme « refusé AVANT l'étape 14 : rien n'a tourné ». C'est cette fonction
 *    qui violait les deux définitions à la fois. Un mot de plus aurait rompu
 *    l'empreinte chaînée pour un mot qui existait.
 *
 * ⚠️ **ET CE TRIPLET NE DIT TOUJOURS PAS SI UN EFFET EST SORTI.** Il n'aurait
 *    pas pu : un refus d'étape 14 n'est qu'une des deux fuites de l'objectif O6.
 *    L'autre — une exception levée APRÈS le retour de l'adaptateur — sort en
 *    `decision: "interrompu"` / `outcome: "erreur"`, un couple parfaitement
 *    ordinaire qu'aucune valeur d'`outcome` ne distinguerait. C'est
 *    `externalEffect`, posé par le cliquet, qui répond à cette question-là, et
 *    il la pose sur TOUTES les lignes, `autorisé` compris.
 */
function issue(terminaison: Terminaison<unknown> | null): {
  decision: Decision;
  stepDenied: AppelStep | null;
  outcome: Outcome;
} {
  // `null` = le corps a levé une exception : aucune décision n'a été atteinte.
  if (terminaison === null) {
    return { decision: "interrompu", stepDenied: null, outcome: "erreur" };
  }
  if (terminaison.genre === "refus") {
    return {
      decision: "refusé",
      stepDenied: terminaison.etape,
      // La BORNE d'`OUTCOMES`, tenue : « refusé AVANT l'étape 14 : rien n'a
      // tourné ». Un refus PRONONCÉ PAR l'étape d'exécution n'est pas antérieur
      // à elle — l'adaptateur a répondu, et c'est sa réponse qu'on refuse.
      outcome: terminaison.etape === ETAPE_DE_L_EXECUTION ? "erreur" : "non-exécuté",
    };
  }
  return { decision: "autorisé", stepDenied: null, outcome: terminaison.outcome };
}

/**
 * Exécute `corps` et GARANTIT qu'exactement une ligne est écrite, quelle que
 * soit la façon dont il se termine.
 *
 * Trois chemins, une seule sortie :
 *
 *  · le corps rend un `Succes`  → `decision: "autorisé"`, `stepDenied: null` ;
 *  · le corps rend un `Refus`   → `decision: "refusé"`, `stepDenied` = LE NUMÉRO
 *                                 de l'étape (§ 11), `outcome: "non-exécuté"` —
 *                                 SAUF le refus de l'étape d'exécution, qui vaut
 *                                 `erreur` (ADR 0017, voir `issue`) ;
 *  · le corps LÈVE              → `decision: "interrompu"`, `outcome: "erreur"`,
 *                                 la ligne est écrite, PUIS l'exception repart.
 *
 * L'exception repart telle quelle : le socle ne transforme pas une panne en
 * refus. Un refus est une décision, une panne n'en est pas une, et les
 * confondre falsifierait la métrique du § 24 qui compte les refus.
 *
 * ⚠️ ET LES TROIS CHEMINS ÉCRIVENT LE MÊME `externalEffect` : il est lu par
 *    `ecrire()`, une fonction unique par laquelle passent le retour normal, le
 *    refus et l'exception. Ce n'est pas un détail d'écriture — c'est ce qui rend
 *    impossible qu'un chemin de sortie ajouté plus tard oublie de le reporter.
 */
export async function avecJournal<T>(
  journal: Journal,
  entete: EnteteAppel,
  corps: (affineurs: AffineursDAppel) => Promise<Terminaison<T>>,
): Promise<AppelJournalise<T>> {
  const debut = journal.horloge.maintenant();

  // ═══════════════════════════════════════════════════════════════════════════
  //  L'EN-TÊTE EST FIGÉ AVANT LA CHAÎNE, MAIS PAS DÉFINITIF
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // POURQUOI IL EST FIGÉ D'ABORD : un refus précoce — étape 5, 6, 7 — doit
  // pouvoir écrire sa ligne, et il n'a pas encore de valeur validée. L'`argHash`
  // de l'en-tête porte donc sur la charge BRUTE.
  //
  // POURQUOI IL DOIT POUVOIR ÊTRE AFFINÉ. `core/limits` calcule le sien sur la
  // valeur VALIDÉE — « c'est elle que le jeton de confirmation du § 20 doit
  // lier ». Dès qu'un schéma porte un `.default()`, une coercition ou une
  // transformation — la forme la plus banale d'un champ `limite` — les deux
  // empreintes DIFFÈRENT. Le § 12 fait de `ops_audit.argHash` le lien entre le
  // journal et l'appel ; le § 20 lie le jeton « à l'argHash de l'appel exact ».
  // Deux valeurs différentes cassaient les deux à la fois, en silence.
  //
  // La règle tenue : dès que l'étape 8 a réussi, c'est l'empreinte de la valeur
  // VALIDÉE qui fait foi, et c'est elle que la ligne inscrit. Les terminaisons
  // ANTÉRIEURES à l'étape 8 gardent l'empreinte brute — elles n'ont rien
  // d'autre.
  //
  // ✅ DETTE SOLDÉE AU LOT 1b. La colonne `ops_audit.argHash` porte DEUX
  //    populations — les empreintes brutes (terminaisons avant l'étape 8) et
  //    les empreintes validées (toutes les autres) — et plus rien ne les
  //    distinguait dans la ligne. `stepDenied < 8` servait d'indice ; ce
  //    n'était qu'une INFÉRENCE, fausse pour une terminaison par exception, où
  //    `stepDenied` est nul.
  //
  //    `ops_audit.argHashValidated` porte désormais le fait lui-même. Il ENTRE
  //    DANS L'EMPREINTE CHAÎNÉE, ce qui n'était possible qu'avant le premier
  //    chaînage réel : aucune base ne tourne, aucune ligne n'existe.
  //
  // ⚠️ LES DEUX VALEURS BOUGENT ENSEMBLE, ET C'EST L'AFFINEUR QUI LES BOUGE.
  //    Deux affectations séparées se seraient désynchronisées au premier
  //    chemin oublié — une empreinte validée annoncée brute, ou l'inverse, sans
  //    qu'aucune garde ne puisse le voir : les deux champs sont libres l'un de
  //    l'autre pour le compilateur. Ici, il n'existe qu'UN endroit où
  //    l'empreinte change, et il change le drapeau dans le même geste.
  let argHashCourant = entete.argHash;
  let argHashValideCourant: boolean = ARG_HASH_NON_VALIDE;

  const affinerArgHash: AffineurDEntete = (argHashValide: string): void => {
    argHashCourant = argHashValide;
    argHashValideCourant = true;
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  LE CLIQUET D'EFFET EXTÉRIEUR — ADR 0017
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Il part de `EFFET_EXTERIEUR_NON_SURVENU` et n'en sort que par un appel. Il
  // n'y a pas de chemin de retour, et c'est délibéré :
  //
  //  · UNE FONCTION `(survenu: boolean) => void` POURRAIT REDESCENDRE. Un chemin
  //    de sortie écrit six mois plus tard effacerait le fait qu'un envoi est
  //    parti, et personne ne le verrait — la ligne resterait bien formée. Ici, la
  //    seule direction possible est celle qui ACCUSE.
  //  · LE FAIT N'EST PAS PORTÉ PAR `Refus`. Il faudrait alors que chacun des
  //    quinze chemins de terminaison écrive « non » explicitement : quinze
  //    occasions de se tromper, contre une seule d'accuser. C'est le motif
  //    d'`ARG_HASH_NON_VALIDE`, appliqué au fait le plus grave du journal.
  let effetExterieurSurvenu: boolean = EFFET_EXTERIEUR_NON_SURVENU;

  const signalerEffetExterieur: SignalEffetExterieur = (): void => {
    effetExterieurSurvenu = true;
  };

  /**
   * ADR 0021 — LA MÊME VARIABLE, LUE. Pas une copie, pas un second état : la
   * fermeture qui porte le cliquet est aussi celle qui le rend lisible, et c'est
   * ce qui interdit à un lecteur et à un cliquet de se contredire.
   */
  const lireEffetExterieur: LecteurEffetExterieur = (): boolean => effetExterieurSurvenu;

  const affineurs: AffineursDAppel = {
    affinerArgHash,
    signalerEffetExterieur,
    effetExterieurSurvenu: lireEffetExterieur,
  };

  const ecrire = async (terminaison: Terminaison<T> | null): Promise<LigneEcrite> => {
    const fin = journal.horloge.maintenant();
    const { decision, stepDenied, outcome } = issue(terminaison);
    const succes = terminaison !== null && terminaison.genre === "succès" ? terminaison : null;

    return journal.journaliser({
      at: fin,
      principal: entete.principal,
      sessionId: entete.sessionId,
      tool: entete.tool,
      toolVersion: entete.toolVersion,
      adapterVersion: entete.adapterVersion,
      effect: entete.effect,
      policyLevel: entete.policyLevel,
      decision,
      stepDenied,
      argHash: argHashCourant,
      argHashValidated: argHashValideCourant,
      recordIds: succes?.recordIds ?? [],
      partialSources: succes?.partialSources ?? [],
      durationMs: Math.max(0, fin.getTime() - debut.getTime()),
      outcome,
      // ⚠️ LU, JAMAIS DÉDUIT. Ni de `decision`, ni d'`outcome`, ni d'`effect` :
      //    un `send` refusé à l'étape 10 n'a rien envoyé, et l'inverse — un
      //    envoi parti suivi d'une exception — sort en « interrompu / erreur »,
      //    couple que rien ne distingue d'une panne survenue avant l'appel.
      externalEffect: effetExterieurSurvenu,
    });
  };

  let terminaison: Terminaison<T>;
  try {
    terminaison = await corps(affineurs);
  } catch (erreur: unknown) {
    // La ligne s'écrit AVANT que l'exception ne reparte : une panne journalisée
    // reste une panne, une panne non journalisée est un trou dans O6.
    //
    // ⚠️ LE PIÈGE QUE CE `try` REFERME. Écrit nûment — `await ecrire(null);
    //    throw erreur;` — le `throw` n'est JAMAIS atteint quand le journal est
    //    lui aussi en panne : c'est l'échec d'écriture qui repart, et
    //    l'exception d'origine — la seule qui dise ce qui s'est réellement
    //    passé — disparaît sans laisser de trace. Aucune ligne n'ayant pu être
    //    écrite, la cause première ne subsiste alors NULLE PART. C'est le pire
    //    moment pour la perdre, puisque c'est celui où deux composants tombent
    //    ensemble.
    //
    //    LA RÈGLE TENUE ICI : l'appelant doit TOUJOURS pouvoir remonter à la
    //    panne applicative. L'indisponibilité du journal s'AJOUTE à elle, elle
    //    ne la remplace jamais.
    try {
      await ecrire(null);
    } catch (echecDuJournal: unknown) {
      throw new AggregateError(
        [erreur, echecDuJournal],
        "§ 11 — double panne : le corps de l'appel a levé, ET le journal n'a pas pu l'écrire. " +
          "La première erreur est la panne applicative, la seconde l'indisponibilité du journal.",
        // `cause` porte l'échec ATTRAPÉ ici, c'est-à-dire celui du journal. La
        // panne applicative n'en est pas la cause — elle lui est ANTÉRIEURE et
        // INDÉPENDANTE : elle voyage dans `errors[0]`, où rien ne la masque.
        { cause: echecDuJournal },
      );
    }
    throw erreur;
  }

  return { terminaison, ligne: await ecrire(terminaison) };
}

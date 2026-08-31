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

import type { AppelStep, Effect, PolicyLevel } from "../types.js";
import { verifierAucunContenu, ErreurContenuJournal } from "./contenu.js";
import { calculerSelfHash } from "./canonique.js";
import type { Horloge, JournalStore, ScelleurJournal } from "./ports.js";
import { HORLOGE_SYSTEME } from "./ports.js";
import type { ContenuLigne, Decision, LigneEcrite, Outcome, Terminaison } from "./vocabulaire.js";
import {
  ARG_HASH_NON_LU,
  ARG_HASH_NON_VALIDE,
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
  readonly sessionId: string;
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
export function enteteAvantIdentification(principal: string, sessionId: string): EnteteAppel {
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

/** Ce que `avecJournal` rend : la terminaison, ET la ligne qui l'atteste. */
export interface AppelJournalise<T> {
  readonly terminaison: Terminaison<T>;
  readonly ligne: LigneEcrite;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'invariant
// ═════════════════════════════════════════════════════════════════════════════

/** Le triplet écrit selon la terminaison. Dérivé, jamais choisi au cas par cas. */
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
    return { decision: "refusé", stepDenied: terminaison.etape, outcome: "non-exécuté" };
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
 *                                 de l'étape (§ 11), `outcome: "non-exécuté"` ;
 *  · le corps LÈVE              → `decision: "interrompu"`, `outcome: "erreur"`,
 *                                 la ligne est écrite, PUIS l'exception repart.
 *
 * L'exception repart telle quelle : le socle ne transforme pas une panne en
 * refus. Un refus est une décision, une panne n'en est pas une, et les
 * confondre falsifierait la métrique du § 24 qui compte les refus.
 */
export async function avecJournal<T>(
  journal: Journal,
  entete: EnteteAppel,
  corps: (affiner: AffineurDEntete) => Promise<Terminaison<T>>,
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

  const affiner: AffineurDEntete = (argHashValide: string): void => {
    argHashCourant = argHashValide;
    argHashValideCourant = true;
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
    });
  };

  let terminaison: Terminaison<T>;
  try {
    terminaison = await corps(affiner);
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

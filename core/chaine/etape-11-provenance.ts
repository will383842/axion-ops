/**
 * `core/chaine/etape-11-provenance.ts` — ÉTAPE 11 : LA PROVENANCE (§ 11, § 20).
 *
 * ═══ CE QUE CETTE ÉTAPE EMPÊCHE, EN UNE PHRASE ═══
 *
 * Qu'un contenu lu chez un domaine ressorte, par un argument d'appel, vers un
 * TIERS. C'est la garde d'exfiltration du socle.
 *
 * ═══ ⚠️ LE PIÈGE, ET POURQUOI LE § 20 A RÉÉCRIT SA CINQUIÈME RÈGLE ═══
 *
 * L'ancienne règle disait : « le socle refuse tout appel d'outil dont les
 * arguments proviennent VERBATIM d'un contenu lu dans le même tour ». Trois
 * défauts, tous mesurés par l'audit du § 20 :
 *
 *  1. elle n'était pas implémentable — le socle n'a aucune notion de « tour » ;
 *  2. elle aurait interdit `reply`, `forward` et toute réponse à un client, qui
 *     reprennent NÉCESSAIREMENT le contenu lu ;
 *  3. **une simple reformulation la contournait.** Un modèle qui résume, traduit
 *     ou paraphrase l'extrait produit un texte qui ne correspond à rien, et la
 *     garde de forme le laisse passer.
 *
 * D'où la règle actuelle, et la forme de ce fichier : **le socle raisonne sur la
 * PROVENANCE, jamais sur la forme.** `ContexteProvenance` ne porte AUCUN texte à
 * comparer — c'est structurel, pas une discipline. Ce qui est marqué, c'est la
 * SESSION ; ce qui est confronté, c'est le DOMAINE de l'appel suivant.
 *
 * La conséquence pratique, qui est le point du § 20 : une reformulation ne
 * contourne rien, puisque rien n'est comparé à un texte. `provenance.spec.ts`
 * le MESURE, avec un témoin négatif qui compte combien de variantes une garde de
 * forme aurait laissées passer.
 *
 * ═══ LES QUATRE BRANCHES, ET CE QUI LES SÉPARE ═══
 *
 * Ordre d'évaluation, du plus strict au plus permissif :
 *
 *  1. **ARGUMENT DE GOUVERNANCE, session marquée → REFUS, toujours.** § 20 :
 *     « les arguments de gouvernance — niveau de politique, TTL, bascule
 *     d'outil, destinataire d'un envoi, créneau posé — ne peuvent JAMAIS
 *     provenir d'un contenu lu. » *Jamais* n'a pas de niveau de politique, pas
 *     de confirmation, et — c'est la nuance que ce fichier tient — **pas de
 *     clause « autre domaine »** : un destinataire dicté par un courrier qu'on
 *     vient de lire est tout aussi dicté quand l'envoi part par le même
 *     adaptateur. C'est la seule branche qu'aucune confirmation ne rattrape.
 *  2. **AUCUN AUTRE DOMAINE MARQUANT → laisser passer.** Session propre, ou
 *     marquée par le domaine de l'appel courant. C'est cette branche qui garde
 *     `reply` et `forward` vivants : lire puis répondre chez le même adaptateur
 *     n'est pas une exfiltration.
 *  3. **AUCUN ARGUMENT LIBRE → laisser passer.** Un identifiant ou une
 *     énumération ne transporte pas de contenu. La règle porte sur « un appel
 *     […] portant un argument libre ».
 *  4. **ARGUMENT LIBRE VERS UN AUTRE DOMAINE, SESSION MARQUÉE → « refusé ou
 *     confirmé »** (§ 20). Lequel des deux se DÉRIVE du niveau, par un `switch`
 *     exhaustif :
 *       · `brouillon` — aucun jeton de confirmation n'existe à ce niveau : il
 *         n'y a rien à confirmer, donc c'est un REFUS ;
 *       · `confirmé`, `libre` — confirmation humaine EXIGÉE. `libre` n'en
 *         dispense pas : le § 20 dit qu'il dispense « de la confirmation par
 *         appel, JAMAIS de la relecture d'un brouillon — le geste humain reste ».
 *
 * ═══ ⚠️ CE QUE `confirmationExigee` VAUT AUJOURD'HUI — BORNE ÉCRITE AVEC LA MESURE
 *
 * La branche 4 rend `autorise` avec `confirmationExigee: true`. **Ce drapeau
 * n'est honoré par personne au moment où ce fichier est écrit** :
 * `orchestrerAppel()` lève, et aucun appelant ne lit le champ. Tant que
 * l'orchestrateur n'a pas de corps, la branche 4 est donc, EN FAIT, un laissez-
 * passer. La branche est écrite parce que le § 20 dit « refusé OU confirmé » et
 * que tout refuser interdirait à nouveau `reply` chez un autre domaine — mais
 * le trou est réel, il est nommé, et il est dans les écarts du rapport.
 *
 * ═══ L'INDEX — EXCEPTION MOTIVÉE AU § 31 ═══
 *
 * § 20, mise en œuvre, mot pour mot : « un index EN MÉMOIRE, borné en durée et
 * en taille, tient les empreintes des extraits marqués. C'est une exception
 * motivée au § 31 (“aucun cache de contenu sur disque”) : jamais persistée, et
 * le healthcheck expose LE NOMBRE D'EXTRAITS INDEXÉS — signal positif, pour
 * qu'une garde à zéro élément se voie. »
 *
 * D'où {@link IndexProvenanceMemoire} : borné en DURÉE ({@link TTL_MARQUAGE_MS}),
 * borné en TAILLE ({@link PLAFOND_EXTRAITS}, {@link PLAFOND_SESSIONS}), jamais
 * écrit sur disque, jamais versé dans `ops_audit`, et qui ANNONCE son état.
 *
 * ⚠️ **LA SATURATION EST LE VRAI SUJET DE CET INDEX.** Une borne se franchit, et
 *    la façon dont on la franchit décide si la garde survit :
 *
 *     · saturer les EMPREINTES ne coûte rien à la décision — les empreintes ne
 *       sont pas lues par l'étape, seul le DOMAINE l'est. On cesse donc d'en
 *       indexer, on garde la marque de domaine, et on COMPTE les refusées ;
 *     · saturer les SESSIONS, en revanche, ferait perdre une marque. Une marque
 *       perdue est une garde qui cesse de mordre EN SILENCE — le pire état
 *       possible. La session la plus ancienne est donc évincée, ET l'index passe
 *       en **provenance indéterminée** : `domainesMarquants()` rend
 *       {@link DOMAINE_INDETERMINE} pour TOUTE session, jusqu'à l'échéance de ce
 *       qui a été évincé. Le socle refuse alors au lieu de ne plus savoir.
 *
 *    L'indétermination est BORNÉE (elle expire) et VISIBLE ({@link etat}), pas
 *    définitive et muette.
 */

import { marqueLaSession } from "../types.js";
import type { DataClass, PolicyLevel } from "../types.js";
import { empreinteSha256 } from "../adapter-kit/json.js";
import type { ObjetJson, ValeurJson } from "../adapter-kit/json.js";
import { versValeurJson } from "../adapter-kit/json.js";
import { sousSchemas } from "../adapter-kit/fermeture.js";
// ADR 0014 — import de TYPE : nommer `SessionId` n'est pas le droit d'en
// frapper une, et la garde G2 refuse l'import de VALEUR, pas celui du nom.
import type { SessionId } from "../identite/session.js";
// ADR 0016 — l'UNION du filet au nom et de la déclaration de l'outil. Elle est
// IMPORTÉE, jamais réécrite en ligne : l'asymétrie « une déclaration ne peut
// qu'AJOUTER » vit dans cette opération et nulle part ailleurs, et une règle qui
// n'a pas de lieu n'a pas de garde. Écrite ici à la main, une refonte pourrait la
// remplacer par « la déclaration si elle existe, le filet sinon » — c'est-à-dire
// par un `idFields` sous un autre nom — sans qu'aucun test ne bouge.
// ⚠️ `estValeurLibre` EST IMPORTÉE, ET C'EST LA FIN D'UNE SECONDE SOURCE DE
//    VÉRITÉ. Ce module a porté jusqu'ici sa PROPRE écriture de « quels mots-clés
//    de JSON Schema referment l'ensemble des valeurs », avec ses copies privées
//    de `FORMATS_CONTRAIGNANTS`, `TEMOINS_DE_PROSE` et `patternReferme`. Deux
//    dérivations d'un même fait finissent par se contredire, et ici la
//    contradiction avait un prix nommé : l'admission dirait « ce champ est fermé,
//    votre `idFields` est effectif » pendant que le § 20 continuerait de le
//    surveiller — ou l'inverse, qui est pire.
//
//    La définition vit dans la COUCHE BASSE, et c'est le seul sens possible :
//    `core/chaine` importe déjà `core/adapter-kit` (`sousSchemas`, `json`), donc
//    porter la définition ici et l'importer là-bas serait un cycle.
import {
  FAMILLE_DECLAREE_PAR_L_OUTIL,
  cumulerChampsDeGouvernance,
  estValeurLibre,
} from "../adapter-kit/champs-declares.js";
import { ETAPE_PROVENANCE, autorise, refuse } from "./etapes.js";
import type {
  ContexteProvenance,
  EtapeProvenance,
  IndexProvenance,
  ProvenanceEtablie,
  VerdictEtape,
} from "./etapes.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES BORNES — chacune à UN SEUL endroit
// ═════════════════════════════════════════════════════════════════════════════

/**
 * DURÉE DE VIE D'UNE MARQUE DE SESSION.
 *
 * Le § 20 exige une borne « en durée » sans en donner la valeur. Quatre heures,
 * pour deux raisons qui tirent dans des sens opposés et qu'il faut écrire
 * ensemble :
 *
 *  · plus LONG est plus sûr — une marque qui expire pendant qu'une session de
 *    pilotage est encore vivante rouvre exactement le trou que l'étape ferme ;
 *  · plus COURT borne la mémoire, et le § 20 l'exige.
 *
 * Quatre heures dépasse largement une session de pilotage vocal réelle et reste
 * six fois sous les 24 h de `TTL_DESSERRAGE_MAX_MS` — la plus longue fenêtre
 * pendant laquelle le socle accepte de se souvenir d'une décision sans qu'un
 * humain la reconduise.
 *
 * ⚠️ CHAQUE MARQUE REPOUSSE L'ÉCHÉANCE DE SON DOMAINE. Une session qui continue
 *    de lire des données personnelles reste marquée aussi longtemps qu'elle lit.
 *
 * ⚠️ C'est une CINQUIÈME borne de durée, à revoir au lot 6 avec les quatre que
 *    Will a laissées en l'état le 2026-08-31. Elle est ici, et nulle part
 *    ailleurs, pour qu'un changement futur soit une ligne.
 */
export const TTL_MARQUAGE_MS = 4 * 60 * 60 * 1000;

/**
 * PLAFOND D'EMPREINTES INDEXÉES, TOUTES SESSIONS CONFONDUES.
 *
 * Le franchir ne dégrade PAS la décision : l'étape 11 ne lit aucune empreinte,
 * elle lit des domaines. Au-delà, on cesse d'indexer et on compte
 * (`empreintesRefusees`) — voir la note de saturation en tête de fichier.
 */
export const PLAFOND_EXTRAITS = 10_000;

/**
 * PLAFOND DE SESSIONS MARQUÉES SIMULTANÉMENT.
 *
 * Le franchir DÉGRADE la décision, puisqu'une marque est perdue. D'où
 * l'indétermination fail-closed. Le plafond est haut : une session de pilotage
 * par appareil et par jour, et le socle en sert un petit nombre.
 */
export const PLAFOND_SESSIONS = 512;

/**
 * LE DOMAINE SENTINELLE — « le socle ne sait plus quels domaines ont marqué
 * cette session ».
 *
 * Rendu par `domainesMarquants()` tant que l'index porte une éviction non
 * expirée. Comme il ne peut être égal à AUCUN `adapterId` réel, toute
 * comparaison « autre domaine » le retient : le socle refuse au lieu d'ignorer.
 *
 * ⚠️ NON-COLLISION — un `adapterId` est contraint par le registre à des
 *    minuscules, des chiffres et des tirets (`analyserDefinition`,
 *    `core/adapter-kit/manifest.ts`). Les astérisques et l'accent le rendent
 *    inatteignable. `provenance.spec.ts` le MESURE plutôt que de le supposer,
 *    avec le motif ci-dessous.
 */
export const DOMAINE_INDETERMINE = "*provenance-indéterminée*";

/**
 * ⚠️ SECONDE SOURCE DE VÉRITÉ, ASSUMÉE ET SIGNALÉE.
 *
 * `core/adapter-kit/manifest.ts` porte le même motif sous le nom `MOTIF_ID` et
 * NE L'EXPORTE PAS. Le recopier ici est le défaut que ce dépôt combat — il est
 * fait sciemment, pour une seule garde (la non-collision de la sentinelle), et
 * il est porté aux écarts : la réparation est d'exporter `MOTIF_ID` depuis
 * `core/adapter-kit`, ce qui n'est pas le périmètre de cette étape.
 */
export const MOTIF_ID_ADAPTATEUR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ═════════════════════════════════════════════════════════════════════════════
//  L'EMPREINTE D'UN EXTRAIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'empreinte d'un extrait marqué.
 *
 * ⚠️ UN HACHAGE, PAS UN HMAC, ET C'EST DÉLIBÉRÉ. Les HMAC du socle protègent ce
 *    qui CIRCULE ou ce qui est PERSISTÉ — l'`argHash` d'`ops_audit`, la
 *    signature d'un curseur servi au client. Cet index-ci ne quitte jamais le
 *    tas du processus : il n'y a ni fil ni disque où confronter un dictionnaire.
 *    Une clé de plus serait une échéance de rotation de plus au § 25, pour une
 *    surface qui n'existe pas.
 *
 * `empreinteSha256` est IMPORTÉE, jamais réécrite : `core/audit` fait déjà
 * rougir une garde sur une seconde implémentation de primitive dans le socle.
 */
export function empreinteExtrait(extrait: string): string {
  return empreinteSha256(extrait);
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'INDEX EN MÉMOIRE — § 20, exception motivée au § 31
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ÉTAT DE L'INDEX, tel que le healthcheck du § 22 (écran Santé, « nombre
 * d'extraits marqués en mémoire ») l'affiche.
 *
 * ⚠️ IL NE PORTE AUCUNE DONNÉE — QUE DES COMPTES. Ce que cet index tient est
 *    dérivé d'un contenu lu ; ni un `sessionId`, ni un extrait, ni une empreinte
 *    ne sort d'ici.
 */
export interface EtatIndexProvenance {
  /** § 20 — LE signal positif : combien d'extraits sont indexés. */
  readonly extraits: number;
  /** Combien de sessions portent au moins une marque non expirée. */
  readonly sessions: number;
  /** Empreintes qu'on a renoncé à indexer, plafond atteint. Marque intacte. */
  readonly empreintesRefusees: number;
  /** Sessions évincées par saturation. Chacune a produit une indétermination. */
  readonly sessionsEvincees: number;
  /** Vrai tant qu'une éviction non expirée rend la provenance indéterminée. */
  readonly indetermine: boolean;
  readonly plafondExtraits: number;
  readonly plafondSessions: number;
  readonly ttlMs: number;
}

/** Ce qu'une session marquée porte, en mémoire. */
interface MarquageSession {
  /** `adapterId` → échéance de la marque, en millisecondes epoch. */
  readonly domaines: Map<string, number>;
  /** empreinte → échéance, en millisecondes epoch. */
  readonly empreintes: Map<string, number>;
}

/** Ce qu'on peut régler à la construction. Tout a une valeur par défaut BORNÉE. */
export interface OptionsIndexProvenance {
  readonly ttlMs?: number;
  readonly plafondExtraits?: number;
  readonly plafondSessions?: number;
  /** Injectée pour que les gardes soient déterministes, jamais lue du système. */
  readonly maintenant?: () => Date;
}

/**
 * L'INDEX DE PROVENANCE, EN MÉMOIRE, BORNÉ EN DURÉE ET EN TAILLE.
 *
 * ⚠️ IL N'EST PAS UN DOUBLE DE TEST. C'est L'implémentation : le § 20 exige que
 *    cet index vive en mémoire et ne soit jamais persisté. Une implémentation
 *    « de production » sur disque ou en base serait une violation du § 31, pas
 *    un progrès.
 *
 * ⚠️ IL EST LOCAL AU PROCESSUS. Deux instances du socle derrière un répartiteur
 *    ne partagent pas leurs marques : une session servie tantôt par l'une,
 *    tantôt par l'autre, verrait sa garde s'appliquer une fois sur deux. Le § 23
 *    ne décrit qu'un conteneur en production, et le CDC ne nomme aucun magasin
 *    partagé pour cet index.
 *
 * ✅ **CE N'EST PLUS UN ÉCART, C'EST UNE BORNE DÉCIDÉE — ADR 0018.** Le socle est
 *    **mono-instance en v1**, et deux gardes le tiennent : un verrou exclusif
 *    pris au démarrage — une seconde instance NE DÉMARRE PAS — et un healthcheck
 *    qui rend 503 dès que ce verrou n'est plus tenu. Voir `core/instance/`.
 *
 * ⚠️ **SI LE SOCLE PASSE UN JOUR À DEUX INSTANCES, LE § 20 EST À ROUVRIR AVANT.**
 *    Pas après : le jour où un réplica est ajouté, cette garde-ci se vide en
 *    silence, et le seul signal serait un index qui reste petit pendant que le
 *    trafic monte — c'est-à-dire un signal que personne ne regarde.
 */
export class IndexProvenanceMemoire implements IndexProvenance {
  readonly #sessions = new Map<string, MarquageSession>();
  readonly #ttlMs: number;
  readonly #plafondExtraits: number;
  readonly #plafondSessions: number;
  readonly #maintenant: () => Date;

  #empreintesRefusees = 0;
  #sessionsEvincees = 0;
  /** Échéance de l'indétermination, en ms epoch. `null` = index intègre. */
  #indetermineJusqua: number | null = null;

  public constructor(options: OptionsIndexProvenance = {}) {
    this.#ttlMs = options.ttlMs ?? TTL_MARQUAGE_MS;
    this.#plafondExtraits = options.plafondExtraits ?? PLAFOND_EXTRAITS;
    this.#plafondSessions = options.plafondSessions ?? PLAFOND_SESSIONS;
    this.#maintenant = options.maintenant ?? ((): Date => new Date());

    // ⚠️ LES BORNES SE VALIDENT À LA CONSTRUCTION, PAS À L'USAGE. Un plafond nul
    //    ou une durée non finie ne se voient nulle part au runtime : l'index
    //    resterait vide, `domainesMarquants()` rendrait toujours `[]`, la garde
    //    du § 20 laisserait tout passer, et `taille()` afficherait zéro — c'est
    //    précisément le « signal positif » du § 20 qui devient un mensonge.
    if (!Number.isFinite(this.#ttlMs) || this.#ttlMs <= 0) {
      throw new RangeError(
        `Index de provenance : durée de marquage « ${String(this.#ttlMs)} » ms inutilisable. ` +
          "Une durée nulle ou non finie ferait expirer chaque marque à l'instant où elle est " +
          "posée, et l'étape 11 laisserait passer tous les appels sans qu'aucun compte ne bouge.",
      );
    }
    if (!Number.isInteger(this.#plafondExtraits) || this.#plafondExtraits < 1) {
      throw new RangeError(
        `Index de provenance : plafond d'extraits « ${String(this.#plafondExtraits)} » ` +
          "inutilisable — attendu un entier d'au moins 1.",
      );
    }
    if (!Number.isInteger(this.#plafondSessions) || this.#plafondSessions < 1) {
      throw new RangeError(
        `Index de provenance : plafond de sessions « ${String(this.#plafondSessions)} » ` +
          "inutilisable — attendu un entier d'au moins 1. À zéro, aucune session ne serait " +
          "jamais marquée et la garde du § 20 serait verte pour n'avoir rien retenu.",
      );
    }
  }

  /**
   * Marque la session : un résultat de `dataClass` `personal` ou `sensitive`
   * vient d'en sortir.
   *
   * ⚠️ ELLE NE DÉCIDE PAS QUELLES CLASSES MARQUENT. C'est `marqueLaSession()` de
   *    `core/types.ts` qui le décide, et {@link marquerResultat} qui l'applique.
   *    Recopier ce test ici ferait deux dérivations d'un même fait.
   */
  public marquer(sessionId: SessionId, adapterId: string, empreintes: readonly string[]): void {
    const maintenant = this.#maintenant().getTime();
    this.#purger(maintenant);

    const echeance = maintenant + this.#ttlMs;
    let session = this.#sessions.get(sessionId);

    if (session === undefined) {
      // La saturation de SESSIONS est la seule qui coûte une marque : elle
      // dégrade la provenance en « indéterminée » plutôt que d'oublier en
      // silence. Voir la note de saturation en tête de fichier.
      if (this.#sessions.size >= this.#plafondSessions) this.#evincerLaPlusAncienne(maintenant);
      session = { domaines: new Map<string, number>(), empreintes: new Map<string, number>() };
      this.#sessions.set(sessionId, session);
    }

    // La marque de DOMAINE passe toujours : c'est elle, et elle seule, que
    // l'étape 11 lit. La perdre pour une question de place serait perdre la
    // garde ; les empreintes, elles, sont sacrifiables.
    session.domaines.set(adapterId, echeance);

    for (const empreinte of empreintes) {
      if (session.empreintes.has(empreinte)) {
        session.empreintes.set(empreinte, echeance);
        continue;
      }
      if (this.#compterExtraits() >= this.#plafondExtraits) {
        this.#empreintesRefusees += 1;
        continue;
      }
      session.empreintes.set(empreinte, echeance);
    }
  }

  /**
   * Les domaines (`adapterId`) qui ont marqué cette session.
   *
   * Rend {@link DOMAINE_INDETERMINE} EN PLUS des domaines connus tant que
   * l'index porte une éviction non expirée : le socle ne sait plus, donc il ne
   * laisse pas passer.
   */
  public domainesMarquants(sessionId: SessionId): readonly string[] {
    const maintenant = this.#maintenant().getTime();
    this.#purger(maintenant);

    const connus = [...(this.#sessions.get(sessionId)?.domaines.keys() ?? [])];
    return this.#indetermineJusqua === null ? connus : [DOMAINE_INDETERMINE, ...connus];
  }

  /**
   * Le nombre d'extraits indexés, TOUTES SESSIONS CONFONDUES (§ 20).
   *
   * C'est LE signal positif du healthcheck : il distingue « aucune session
   * marquée » de « l'index ne fonctionne plus ». Les deux rendraient sinon la
   * même chose — rien.
   */
  public taille(): number {
    this.#purger(this.#maintenant().getTime());
    return this.#compterExtraits();
  }

  /** L'état complet, pour l'écran Santé du § 22. Que des comptes. */
  public etat(): EtatIndexProvenance {
    const maintenant = this.#maintenant().getTime();
    this.#purger(maintenant);
    return {
      extraits: this.#compterExtraits(),
      sessions: this.#sessions.size,
      empreintesRefusees: this.#empreintesRefusees,
      sessionsEvincees: this.#sessionsEvincees,
      indetermine: this.#indetermineJusqua !== null,
      plafondExtraits: this.#plafondExtraits,
      plafondSessions: this.#plafondSessions,
      ttlMs: this.#ttlMs,
    };
  }

  #compterExtraits(): number {
    let total = 0;
    for (const session of this.#sessions.values()) total += session.empreintes.size;
    return total;
  }

  /**
   * Retire tout ce qui a passé son échéance, et lève l'indétermination quand
   * l'éviction qui l'a causée aurait de toute façon expiré.
   *
   * ⚠️ L'INDÉTERMINATION EST BORNÉE, ET C'EST CE QUI LA REND ACCEPTABLE. Une
   *    dégradation qui ne se relève jamais devient un mur permanent, et un mur
   *    permanent se contourne — on désarme la garde. Celle-ci s'efface d'elle-
   *    même au plus tard une durée de marquage après la saturation.
   */
  #purger(maintenant: number): void {
    if (this.#indetermineJusqua !== null && this.#indetermineJusqua <= maintenant) {
      this.#indetermineJusqua = null;
    }
    for (const [sessionId, session] of this.#sessions) {
      for (const [domaine, echeance] of session.domaines) {
        if (echeance <= maintenant) session.domaines.delete(domaine);
      }
      for (const [empreinte, echeance] of session.empreintes) {
        if (echeance <= maintenant) session.empreintes.delete(empreinte);
      }
      if (session.domaines.size === 0 && session.empreintes.size === 0) {
        this.#sessions.delete(sessionId);
      }
    }
  }

  /** Évince la session dont la marque expire le plus tôt, et DÉGRADE l'index. */
  #evincerLaPlusAncienne(maintenant: number): void {
    let candidat: string | null = null;
    let echeanceCandidate = Number.POSITIVE_INFINITY;

    for (const [sessionId, session] of this.#sessions) {
      let derniere = 0;
      for (const echeance of session.domaines.values()) derniere = Math.max(derniere, echeance);
      for (const echeance of session.empreintes.values()) derniere = Math.max(derniere, echeance);
      if (derniere < echeanceCandidate) {
        echeanceCandidate = derniere;
        candidat = sessionId;
      }
    }

    if (candidat === null) return;
    this.#sessions.delete(candidat);
    this.#sessionsEvincees += 1;
    // L'indétermination court jusqu'à l'échéance de ce qui vient d'être perdu :
    // au-delà, la marque évincée aurait expiré de toute façon, et ne plus la
    // connaître ne change plus rien.
    const jusqua = Number.isFinite(echeanceCandidate)
      ? echeanceCandidate
      : maintenant + this.#ttlMs;
    this.#indetermineJusqua = Math.max(this.#indetermineJusqua ?? 0, jusqua);
  }
}

/**
 * MARQUE LA SESSION DEPUIS UN RÉSULTAT D'APPEL — le seul chemin recommandé.
 *
 * ⚠️ LE TEST « QUELLES CLASSES MARQUENT » EST DÉRIVÉ, jamais réécrit : il vient
 *    de `marqueLaSession()` (`core/types.ts`), qui le tire lui-même de l'ordre
 *    de `DATA_CLASSES`. Un appelant qui écrirait
 *    `if (dataClass === "personal" || dataClass === "sensitive")` produirait une
 *    seconde dérivation du même fait — et une classe ajoutée au § 09 au-dessus
 *    de `personal` ne marquerait alors plus rien, sans un mot.
 *
 * ⚠️ APPELÉE APRÈS L'ÉTAPE 14, sur le RÉSULTAT (`orchestrateur.ts`, règle 5) :
 *    c'est le résultat qui marque la session, pas la demande.
 *
 * @returns vrai si la session a été marquée, faux si la classe ne marque pas.
 */
export function marquerResultat(
  index: IndexProvenance,
  resultat: {
    // ADR 0014 — la MÊME monnaie que `IndexProvenance.marquer`. La poser ici en
    // `string` aurait rendu le resserrement de l'interface décoratif : c'est par
    // cette fonction que TOUTE marque de production entre dans l'index.
    readonly sessionId: SessionId;
    readonly adapterId: string;
    readonly dataClass: DataClass;
    readonly empreintes: readonly string[];
  },
): boolean {
  if (!marqueLaSession(resultat.dataClass)) return false;
  index.marquer(resultat.sessionId, resultat.adapterId, resultat.empreintes);
  return true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE 11
// ═════════════════════════════════════════════════════════════════════════════

/** Les domaines marquants qui ne sont PAS celui de l'appel courant. */
function autresDomaines(domaines: readonly string[], adapterId: string): readonly string[] {
  return domaines.filter((domaine) => domaine !== adapterId);
}

/**
 * « Refusé ou confirmé » (§ 20) — lequel des deux, DÉRIVÉ du niveau.
 *
 * `switch` exhaustif sur `PolicyLevel` : ajouter un niveau au § 20 devient une
 * erreur de compilation ici, et non un `else` permissif qui laisserait passer.
 */
function issueDuNiveau(niveau: PolicyLevel): "refus" | "confirmation" {
  switch (niveau) {
    case "brouillon":
      // Aucun jeton de confirmation n'existe à ce niveau : la branche
      // « confirmé » du § 20 n'a pas de mécanisme. Rendre `confirmationExigee`
      // ici produirait une exigence que rien ne peut satisfaire — c'est-à-dire
      // un laissez-passer déguisé en garde.
      return "refus";
    case "confirmé":
    case "libre":
      // `libre` NE DISPENSE PAS. § 20 : il dispense « de la confirmation par
      // appel, JAMAIS de la relecture d'un brouillon — le geste humain reste ».
      // L'en dispenser ferait évaporer la garde exactement au niveau où les
      // effets extérieurs partent sans confirmation.
      return "confirmation";
  }
}

/**
 * ÉTAPE 11 — un argument libre part-il vers un AUTRE domaine, session marquée ?
 *
 * Refuse en `provenance_denied`. Le § 15 exige que le message dise « quel
 * domaine a marqué la session » : il nomme LE DOMAINE, jamais l'extrait, jamais
 * son contenu, jamais une empreinte.
 *
 * Ne lève JAMAIS : tout refus est RENDU, pour que l'invariant de journal du
 * § 11 — « toute terminaison écrit une ligne portant le numéro de l'étape qui a
 * refusé » — ait un objet à écrire. Une levée sortirait par le chemin
 * « interrompu » et le refus deviendrait indiscernable d'une exception.
 */
export const etape11Provenance: EtapeProvenance = (
  contexte: ContexteProvenance,
): VerdictEtape<ProvenanceEtablie> => {
  const domainesMarquants = contexte.index.domainesMarquants(contexte.sessionId);
  const extraitsIndexes = contexte.index.taille();
  const autres = autresDomaines(domainesMarquants, contexte.adapterId);

  const etabli = (confirmationExigee: boolean): ProvenanceEtablie => ({
    domainesMarquants,
    confirmationExigee,
    extraitsIndexes,
  });

  // ── 1 · GOUVERNANCE — « JAMAIS », sans clause d'autre domaine ─────────────
  if (contexte.porteUnArgumentDeGouvernance && domainesMarquants.length > 0) {
    return refuse(
      ETAPE_PROVENANCE,
      `Argument de gouvernance refusé : la session a lu des données marquées chez ` +
        `${domainesMarquants.join(", ")}. Le § 20 pose qu'un niveau de politique, un TTL, ` +
        "une bascule d'outil, un destinataire d'envoi ou un créneau posé ne peuvent JAMAIS " +
        "provenir d'un contenu lu — aucune confirmation ne rattrape cette branche, et le " +
        "niveau de politique n'y change rien. Poser cette valeur depuis la console, ou " +
        "rejouer l'appel dans une session qui n'a lu aucune donnée personnelle.",
    );
  }

  // ── 2 · AUCUN AUTRE DOMAINE — `reply` et `forward` vivent ici ─────────────
  if (autres.length === 0) {
    return autorise(ETAPE_PROVENANCE, etabli(false));
  }

  // ── 3 · AUCUN ARGUMENT LIBRE — un identifiant ne transporte rien ──────────
  if (!contexte.porteUnArgumentLibre) {
    return autorise(ETAPE_PROVENANCE, etabli(false));
  }

  // ── 4 · ARGUMENT LIBRE VERS UN AUTRE DOMAINE — refusé ou confirmé ─────────
  if (issueDuNiveau(contexte.niveau) === "refus") {
    return refuse(
      ETAPE_PROVENANCE,
      `Provenance refusée : la session a lu des données marquées chez ${autres.join(", ")}, ` +
        `et cet appel porte un argument libre vers « ${contexte.adapterId} ». Le refus ne ` +
        "porte pas sur le TEXTE de l'argument — une reformulation ne le lèverait pas —, mais " +
        "sur la PROVENANCE de la session. Au niveau « brouillon » aucun jeton de confirmation " +
        "n'est délivré : reprendre l'appel dans une session qui n'a rien lu chez ce domaine, " +
        "ou desserrer la politique par le chemin du § 20 (route dédiée, second facteur).",
    );
  }

  return autorise(ETAPE_PROVENANCE, etabli(true));
};

// ═════════════════════════════════════════════════════════════════════════════
//  LA DÉRIVATION DES DEUX BOOLÉENS — sur le SCHÉMA, jamais sur la valeur
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES CINQ FAMILLES D'ARGUMENTS DE GOUVERNANCE DU § 20, NOMMÉES.
 *
 * Le § 20 les énumère en toutes lettres : « niveau de politique, TTL, bascule
 * d'outil, destinataire d'un envoi, créneau posé ». Elles sont ici avec leurs
 * motifs, NOMMÉES, pour que le rapport puisse dire LAQUELLE a mordu — et pour
 * qu'un ajout au § 20 se voie comme une entrée manquante, pas comme un `if` de
 * plus perdu dans une fonction.
 *
 * Les motifs sont donnés en FRANÇAIS ET EN ANGLAIS : un manifeste vient d'un
 * dépôt tiers, éventuellement écrit dans une autre langue (§ 29, le CRM en PHP).
 *
 * ⚠️ **BORNE ÉCRITE AVEC LA MESURE, ET ELLE EST LARGE.** Un motif ne prouve que
 *    l'absence de la FORME ÉCRITE. Un champ nommé `cible`, `param3` ou `x`
 *    portant un destinataire échappe aux cinq familles, et ce module ne fait pas
 *    mieux — comme `MOTIFS_ACCES_SECRET` de `core/adapter-kit/conformite.ts`,
 *    dont ce tableau reprend la forme. Ce que la dérivation répond, c'est « le
 *    schéma NOMME-T-IL un argument de gouvernance », pas « l'appel peut-il en
 *    porter un ». La couverture réelle se lit dans le compte annoncé par
 *    {@link AnalyseArguments.motifsAppliques} et dans la liste des champs
 *    confrontés — jamais dans la couleur d'une garde.
 *
 * 📏 **CE QUE CETTE BORNE COÛTE, MESURÉ AU LOT 1b : 9 noms sur 20 confrontés
 *    échappaient** — `emailTo`, `adresseDeReponse`, `envoyerA`, `validUntil`,
 *    `maxAge`, `dateDebut`, `scheduledFor`, `profil`, `toolset`. Sur la branche
 *    que le § 20 dit inconditionnelle.
 *
 * ✅ **LA PARADE EST DÉCIDÉE — ADR 0016 :** l'outil DÉCLARE ses champs de
 *    gouvernance dans son manifeste (`governanceFields`, § 09), et le socle prend
 *    l'UNION des deux sources. Ce tableau RESTE, en filet : une déclaration ne
 *    peut qu'AJOUTER des champs surveillés, jamais en retirer un que le nom avait
 *    retenu. C'est l'exact inverse d'`idFields` (ADR 0015), et la différence est
 *    la seule chose à retenir : on peut croire une déclaration qui resserre, on
 *    ne peut jamais croire une déclaration qui desserre.
 */
export const FAMILLES_GOUVERNANCE = [
  {
    nom: "niveau de politique",
    motifs: [/(^|[._-])(policy)?levels?([._-]|$)/i, /niveau/i, /politique|policy/i],
  },
  {
    nom: "TTL",
    motifs: [/(^|[._-])ttl([._-]|$)/i, /expir/i, /(duree|durée|duration)/i],
  },
  {
    nom: "bascule d'outil",
    motifs: [
      /^(enable|disable|toggle|activer|desactiver|désactiver)/i,
      /(^|[._-])enabled?$/i,
      /bascule/i,
    ],
  },
  {
    nom: "destinataire d'un envoi",
    motifs: [
      /^(to|cc|bcc)$/i,
      /(recipients?|destinataires?)/i,
      /(^|[._-])(mailto|sendto)([._-]|$)/i,
    ],
  },
  {
    nom: "créneau posé",
    motifs: [
      /(^|[._-])(slot|creneau|créneau)([._-]|$)/i,
      /^(start|end|debut|début|fin)([._-]?(at|time|date))?$/i,
      /(attendees?|invit(e|és?|ees?))/i,
    ],
  },
] as const satisfies ReadonlyArray<{
  readonly nom: string;
  readonly motifs: readonly RegExp[];
}>;

/** Le nombre total de motifs appliqués. DÉRIVÉ, jamais compté à la main. */
export const NOMBRE_MOTIFS_GOUVERNANCE = FAMILLES_GOUVERNANCE.reduce(
  (total, famille) => total + famille.motifs.length,
  0,
);

/** Un champ d'entrée retenu par la dérivation, avec le chemin qui y mène. */
export interface ChampDerive {
  readonly nom: string;
  readonly chemin: string;
  /** Pour un argument de gouvernance : la famille du § 20 qui l'a retenu. */
  readonly famille?: string;
}

/**
 * LE CHEMIN D'UN CHAMP DÉCLARÉ DE GOUVERNANCE QU'AUCUNE PROPRIÉTÉ NE PORTE.
 *
 * ⚠️ IL EST NOMMÉ PLUTÔT QUE VIDE. Une chaîne vide se lirait comme « à la
 *    racine » et se confondrait avec un chemin réel ; ce marqueur-ci ne se
 *    confond avec rien, et il se COMPTE
 *    ({@link AnalyseArguments.declaresIntrouvables}). Le cas est REFUSÉ à
 *    l'admission par la garde G3 de l'ADR 0016 — s'il arrive jusqu'ici, c'est
 *    qu'un outil est entré au catalogue par un autre chemin que le registre, ou
 *    que le parcours a buté sur sa borne de profondeur.
 */
export const CHEMIN_DECLARE_SANS_PROPRIETE = "*déclaré, aucune propriété de ce nom*";

/**
 * Ce que la dérivation rend. JAMAIS deux booléens nus : sans les comptes, une
 * dérivation qui n'aurait inspecté AUCUNE propriété rendrait `false, false` —
 * c'est-à-dire « appel inoffensif » — et l'étape 11 laisserait tout passer.
 */
export interface AnalyseArguments {
  readonly libres: readonly ChampDerive[];
  readonly gouvernance: readonly ChampDerive[];
  /** Combien de propriétés le parcours a réellement confrontées. */
  readonly proprietesInspectees: number;
  /** Combien de sous-schémas le parcours a visités (racine comprise). */
  readonly sousSchemasInspectes: number;
  /** Combien de motifs de gouvernance ont été appliqués à chaque nom. */
  readonly motifsAppliques: number;
  /**
   * Vrai quand le schéma n'a pas pu être lu du tout. FAIL-CLOSED : les deux
   * booléens valent alors `true`, et le compte le dit.
   */
  readonly schemaIllisible: boolean;
  /** Vrai si le parcours a buté sur la borne de profondeur. Fail-closed aussi. */
  readonly profondeurDepassee: boolean;
  readonly porteUnArgumentLibre: boolean;
  readonly porteUnArgumentDeGouvernance: boolean;

  // ── ADR 0016 · CE QUE CHACUNE DES DEUX SOURCES A APPORTÉ ───────────────────
  //
  // ⚠️ SANS CES QUATRE COMPTES, L'UNION NE SE MESURE PAS. `gouvernance` est une
  //    liste fusionnée : elle ne dit pas si le filet a mordu, si la déclaration
  //    a mordu, ni — surtout — si l'union a PERDU quelque chose en route. Une
  //    implémentation qui remplacerait l'union par la seule déclaration rendrait
  //    exactement la même forme de liste, en silence.

  /** Combien de noms DISTINCTS le filet `FAMILLES_GOUVERNANCE` a retenus. */
  readonly retenusParLeNom: number;
  /** Combien de noms DISTINCTS l'outil a déclarés de gouvernance. */
  readonly declaresParLOutil: number;
  /**
   * Les noms que SEULE la déclaration apporte — la mesure de ce qu'elle
   * resserre. Vide quand l'outil ne déclare rien, ou quand le filet retenait
   * déjà tout ce qu'il déclare.
   */
  readonly ajoutesParLaDeclaration: readonly string[];
  /**
   * Les noms que le filet avait retenus et que l'union NE PORTE PLUS.
   *
   * ⚠️ **IL DOIT TOUJOURS ÊTRE VIDE, ET C'EST POUR ÇA QU'IL EST RENDU.**
   *    L'invariant de l'ADR 0016 — « une déclaration ne peut qu'AJOUTER » — ne
   *    se prouve pas en le lisant dans le code : il se MESURE, appel par appel.
   *    Il est DÉRIVÉ de `cumulerChampsDeGouvernance()`, jamais recalculé ici :
   *    un second calcul serait une seconde vérité, et c'est la seconde qui ne
   *    suit jamais.
   */
  readonly perdusParLeCumul: readonly string[];
  /**
   * Les noms déclarés de gouvernance qu'AUCUNE propriété inspectée ne porte.
   *
   * ⚠️ CE N'EST PAS UN REFUS ICI — c'est l'admission qui refuse ce cas (ADR
   *    0016, garde G3, `analyserChampsDeclares()`). L'étape 11 le SURVEILLE
   *    quand même, fail-closed : un nom déclaré que le schéma ne porte pas
   *    signifie soit une faute de frappe (le registre l'aura refusée), soit un
   *    schéma qu'on n'a pas su parcourir entièrement. Dans les deux cas, laisser
   *    tomber la déclaration serait la seule issue qui DESSERRE.
   */
  readonly declaresIntrouvables: readonly string[];
}

/** La valeur vue comme objet JSON, ou `null`. */
function commeObjet(valeur: ValeurJson | undefined): ObjetJson | null {
  if (valeur === undefined || valeur === null || typeof valeur !== "object") return null;
  if (Array.isArray(valeur)) return null;
  return valeur as ObjetJson;
}

/**
 * ═══ LA SECONDE ÉCRITURE A DISPARU, ET C'EST LA DÉCISION ═══
 *
 * Ce module portait ici sa PROPRE réponse à « quels mots-clés de JSON Schema
 * referment l'ensemble des valeurs d'un champ » : une fonction `estTexteLibre()`,
 * et avec elle ses copies privées de `FORMATS_CONTRAIGNANTS`, `TEMOINS_DE_PROSE`,
 * `patternReferme()`, `typesDe()` et `estConteneurOuvert()`.
 *
 * `core/adapter-kit/champs-declares.ts` répondait à la MÊME question, pour
 * l'admission et pour le build. **Deux dérivations d'un même fait finissent par
 * se contredire**, et la contradiction n'aurait pas été bruyante : l'admission
 * aurait annoncé « votre `idFields` est effectif, ce champ est fermé » pendant
 * que le § 20 aurait continué de le surveiller — ou l'inverse, qui est pire,
 * l'admission déclarant « sans effet » un champ que le § 20 tient pour fermé.
 *
 * ⚠️ CE QUI A ÉTÉ MESURÉ AVANT DE FUSIONNER, ET NON SUPPOSÉ. Le corpus de
 *    `core/adapter-kit/champs-declares.temoin.spec.ts` a été porté de 24 à 51
 *    formes AVANT le remplacement, précisément sur les trois axes où il était
 *    aveugle — les sept `format` contraignants (quatre seulement étaient
 *    éprouvés), les trois témoins de prose (aucune forme ne les distinguait l'un
 *    de l'autre), et la borne de profondeur (jamais atteinte). Verdict :
 *    **51 formes confrontées, 0 désaccord.** Le remplacement ne change donc rien
 *    au comportement servi, et ce n'est pas une opinion.
 *
 * ⚠️ CE QUI TIENT LE REMPLACEMENT N'EST PAS CE PARAGRAPHE. Trois gardes le
 *    tiennent, et elles rougissent pour trois raisons différentes :
 *     · `champs-declares.temoin.spec.ts` confronte le kit à la porte publique de
 *       cette étape sur les 51 formes — une refonte qui réécrirait une seconde
 *       dérivation ici la ferait diverger sur au moins une d'entre elles ;
 *     · `core/epreuve/lot1c-la-couture-manquante.temoin.spec.ts` (G4) lit CE
 *       fichier et exige que les trois constantes n'y soient plus ÉCRITES, et que
 *       `estValeurLibre` y soit IMPORTÉE et APPELÉE ;
 *     · `etape-11-couverture.temoin.spec.ts` confronte le parcours au vocabulaire
 *       d'applicateurs de 2020-12.
 *
 * Le seul juge de « ce champ est-il libre » est désormais
 * {@link estValeurLibre}, importée de la couche basse.
 */

/**
 * Découpe un nom de propriété en segments séparés par des points, minuscules.
 *
 * ⚠️ POURQUOI, ET C'EST UN DÉFAUT MESURÉ, PAS UNE PRÉCAUTION. Les motifs
 *    ci-dessus s'ancrent à des séparateurs (`^`, `.`, `_`, `-`) — et le
 *    `camelCase` n'en porte AUCUN. `slotStart` ne contient donc ni `slot$` ni
 *    `slot.`, et la famille « créneau posé » le laissait passer, en silence,
 *    alors que `slot_start` et `slot` étaient retenus. Une garde qui mord sur
 *    trois graphies d'un même nom et pas sur la quatrième est pire qu'absente :
 *    elle donne l'apparence d'un périmètre couvert.
 *
 * Le découpage est appliqué EN PLUS du nom brut, jamais à sa place : certains
 * motifs (`sendto`) ne valent que sur la forme accolée.
 */
export function segmenterNom(nom: string): string {
  return nom
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1.$2")
    .replace(/[\s_-]+/g, ".")
    .toLowerCase();
}

/**
 * La famille de gouvernance qui retient ce nom, ou `null`.
 *
 * ⚠️ LE NOM EST NORMALISÉ EN NFC AVANT TOUT MOTIF, ET C'EST UN DÉFAUT MESURÉ.
 *    Les trois familles accentuées du § 20 — `créneau`, `durée`, `désactiver` —
 *    ne mordaient que sur la forme COMPOSÉE. Un nom de propriété reçu d'un dépôt
 *    tiers en forme DÉCOMPOSÉE (NFD), où « é » s'écrit « e » suivi d'un accent
 *    combinant, s'affiche à l'identique et ne se compare pas : `créneau`,
 *    `durée` et `désactiverOutil` échappaient aux cinq familles, en silence.
 *    La garde était donc plus faible que sa mesure — et la borne que ce module
 *    écrit lui-même (« un champ nommé `cible` ou `param3` échappe ») ne couvrait
 *    PAS ce cas : ici le champ porte exactement le nom attendu.
 *
 *    La forme NFC est ajoutée AUX graphies, jamais à leur place : normaliser
 *    seulement changerait la mesure au lieu de l'élargir.
 */
export function familleDeGouvernance(nom: string): string | null {
  const compose = nom.normalize("NFC");
  const graphies =
    compose === nom
      ? [nom, segmenterNom(nom)]
      : [nom, segmenterNom(nom), compose, segmenterNom(compose)];
  for (const famille of FAMILLES_GOUVERNANCE) {
    for (const motif of famille.motifs) {
      for (const graphie of graphies) {
        if (motif.test(graphie)) return famille.nom;
      }
    }
  }
  return null;
}

/**
 * DÉRIVE LES DEUX BOOLÉENS DE `ContexteProvenance` DEPUIS LE SCHÉMA D'ENTRÉE.
 *
 * ⚠️ SUR LE SCHÉMA, JAMAIS SUR LA VALEUR. C'est la consigne d'`etapes.ts`, et
 *    c'est le cœur du § 20 : dériver depuis la valeur, ce serait comparer des
 *    textes, c'est-à-dire revenir à la règle « verbatim » que le § 20 a retirée
 *    et qu'une reformulation contournait.
 *
 * ⚠️ ELLE NE LÈVE JAMAIS. Un schéma illisible — venu d'un dépôt tiers, cyclique,
 *    non sérialisable — rend `porteUnArgumentLibre` ET
 *    `porteUnArgumentDeGouvernance` à `true`, avec `schemaIllisible: true`. Un
 *    schéma qu'on ne sait pas lire est le cas où il faut refuser, pas celui où
 *    il faut supposer.
 *
 * ✅ **`idFields` NE DÉSARME PLUS RIEN — ADR 0015, COUSU AU LOT 1d.** Cette
 *    fonction a porté, jusqu'ici, un second paramètre `idFields` et un
 *    `if (identifiants.has(nom)) continue;` : déclarer `idFields: ["requete"]`
 *    sur un `{"type":"string"}` suffisait à retirer le champ de `libres`, donc à
 *    éteindre la garde d'exfiltration du § 20 **depuis un manifeste** — c'est-à-dire
 *    depuis un dépôt tiers, public à jamais dans le cas du CRM (§ 29). Or le § 20
 *    pose l'inverse mot pour mot : « l'étiquetage se décide côté socle, JAMAIS
 *    sur déclaration ».
 *
 *    Le paramètre a disparu, et le `continue` avec lui. Ce qui referme un champ
 *    est le SCHÉMA, et `estValeurLibre()` le sait déjà : un `enum`, un `const`, un
 *    `format` réellement contraignant, un `pattern` ancré qui REJETTE de la prose,
 *    un type non textuel. La déclaration ne pouvait qu'AFFAIBLIR cette
 *    dérivation ; elle ne pouvait rien lui apprendre.
 *
 * ⚠️ **IL N'A PAS ÉTÉ REMPLACÉ PAR UN PARAMÈTRE FACULTATIF, ET C'EST LE POINT.**
 *    Une signature qui accepte encore la liste laisse un appelant la renseigner :
 *    le trou se rouvrirait sans qu'aucune garde ne rougisse. Ce qui tient ce
 *    retrait n'est donc pas cette phrase, c'est l'ARITÉ — que
 *    `core/epreuve/verrous-du-paragraphe-20.temoin.spec.ts` annonce, et qui casse
 *    la compilation chez quiconque essaie de repasser la liste.
 *
 * ⚠️ **`idFields` GARDE SON RÔLE DU § 12, ET IL N'EST PAS ORPHELIN.** Il nomme les
 *    champs porteurs d'identifiants pour que `recordIds` soit purgé à la même
 *    échéance qu'`argHash` (§ 31), et l'admission le LIT déjà
 *    (`core/registry/enregistrer.ts`, `idFieldsSansEffet`) pour ANNONCER combien
 *    de déclarations désignent un champ que le schéma ne referme pas. Une
 *    déclaration ne peut plus RETIRER un champ de la surveillance ; elle peut
 *    encore le NOMMER.
 *
 * ═══ ADR 0016 — LE PARAMÈTRE `governanceFields`, ET POURQUOI IL EST EXIGÉ ═══
 *
 * `governanceFields` porte ce que l'outil DÉCLARE de gouvernance, et l'union
 * avec le filet au nom se fait par `cumulerChampsDeGouvernance()`. Le filet
 * RESTE et il passe EN PREMIER : un adaptateur qui ne déclare rien est couvert
 * exactement comme avant.
 *
 * ⚠️ **IL N'A PAS DE VALEUR PAR DÉFAUT, ET C'EST LE MÊME MOTIF QU'AU-DESSUS,
 *    RETOURNÉ.** Pour `idFields`, un paramètre facultatif laisserait un appelant
 *    RENSEIGNER la liste et desserrer. Pour `governanceFields`, un paramètre
 *    facultatif laisserait un appelant l'OMETTRE — et l'omission perd
 *    silencieusement la déclaration, c'est-à-dire reproduit à l'identique le
 *    défaut que l'ADR 0016 referme. Un paramètre SANS DÉFAUT force chaque
 *    appelant à DIRE ce qu'il transmet ; c'est la seule forme qu'une refonte
 *    ne peut pas défaire sans que le compilateur le voie.
 *
 * @param governanceFields § 09 / ADR 0016 — les champs que l'outil déclare de
 *        gouvernance. Ils ne peuvent qu'AJOUTER : `perdusParLeCumul` le MESURE.
 */
export function analyserArgumentsDuSchema(
  inputSchema: unknown,
  governanceFields: readonly string[],
): AnalyseArguments {
  let schema: ValeurJson;
  try {
    schema = versValeurJson(inputSchema, "schéma d'entrée");
  } catch {
    // Fail-closed, ET l'union est tout de même DÉRIVÉE : un schéma illisible n'a
    // retenu aucun nom par le filet, donc tout ce que l'outil déclare est un
    // ajout — et introuvable, puisque zéro propriété a été inspectée. Recopier
    // ces trois listes à la main ici en ferait une seconde vérité.
    const cumulAveugle = cumulerChampsDeGouvernance([], governanceFields);
    return {
      libres: [],
      gouvernance: [],
      proprietesInspectees: 0,
      sousSchemasInspectes: 0,
      motifsAppliques: NOMBRE_MOTIFS_GOUVERNANCE,
      schemaIllisible: true,
      profondeurDepassee: false,
      porteUnArgumentLibre: true,
      porteUnArgumentDeGouvernance: true,
      retenusParLeNom: cumulAveugle.retenusParLeNom,
      declaresParLOutil: cumulAveugle.declares,
      ajoutesParLaDeclaration: cumulAveugle.ajoutesParLaDeclaration,
      perdusParLeCumul: cumulAveugle.perdus,
      declaresIntrouvables: cumulAveugle.union,
    };
  }

  const libres: ChampDerive[] = [];
  /** Ce que le FILET a retenu, avec la famille du § 20 qui a mordu. */
  const retenusParLeFilet: ChampDerive[] = [];
  /**
   * Tous les chemins par nom de propriété. Il sert à donner un CHEMIN aux champs
   * que seule la déclaration apporte : sans lui, un champ déclaré entrerait dans
   * `gouvernance` sans qu'on puisse dire OÙ il vit dans le schéma, et le rapport
   * de l'étape 11 cesserait d'être lisible sur la moitié de ses entrées.
   */
  const cheminsParNom = new Map<string, string[]>();
  let proprietesInspectees = 0;

  // `sousSchemas` est IMPORTÉ de `core/adapter-kit/fermeture.ts`, jamais
  // réécrit : c'est le même parcours que la garde de fermeture et que le
  // contrôle 7. Un applicateur ajouté là-bas est vu ici le jour même — deux
  // parcours séparés divergeraient au premier mot-clé ajouté d'un seul côté, et
  // la divergence serait muette.
  const { trouves, profondeurDepassee } = sousSchemas(schema);

  for (const { chemin, schema: sous } of trouves) {
    const proprietes = commeObjet(sous["properties"]);
    if (proprietes === null) continue;
    for (const [nom, valeur] of Object.entries(proprietes)) {
      proprietesInspectees += 1;
      const cheminComplet = `${chemin}.properties.${nom}`;

      const chemins = cheminsParNom.get(nom);
      if (chemins === undefined) cheminsParNom.set(nom, [cheminComplet]);
      else chemins.push(cheminComplet);

      const famille = familleDeGouvernance(nom);
      if (famille !== null) retenusParLeFilet.push({ nom, chemin: cheminComplet, famille });

      // ADR 0015 — IL Y AVAIT ICI `if (identifiants.has(nom)) continue;`. Sa
      // disparition EST la décision : plus aucune déclaration d'adaptateur ne
      // retire un champ de la liste des arguments libres. Ce qui referme un
      // champ est ce que le schéma en DIT, et `estValeurLibre()` — IMPORTÉE de
      // `core/adapter-kit/champs-declares.ts`, jamais réécrite ici — en est le
      // seul juge. C'est LA MÊME fonction que l'admission et le build appellent :
      // il n'existe plus de second verdict à faire diverger de celui-ci.
      const sousSchema = commeObjet(valeur);
      // Un `true` JSON Schema (« tout est accepté ») n'est pas un objet : il est
      // maximalement permissif, donc libre.
      if (sousSchema === null || estValeurLibre(sousSchema)) {
        libres.push({ nom, chemin: cheminComplet });
      }
    }
  }

  // ── ADR 0016 · L'UNION DES DEUX SOURCES ───────────────────────────────────
  //
  // ⚠️ L'ORDRE DES ARGUMENTS EST LA RÈGLE, PAS UN DÉTAIL. Le filet passe en
  //    PREMIER : `cumulerChampsDeGouvernance()` déduplique en gardant la
  //    première occurrence, donc un nom retenu par les deux sources garde la
  //    famille du § 20 qui l'a nommé — et la mesure de couverture des cinq
  //    familles reste lisible, au lieu d'être diluée par ce que la déclaration
  //    apporte.
  const cumul = cumulerChampsDeGouvernance(
    retenusParLeFilet.map((champ) => champ.nom),
    governanceFields,
  );

  // La liste rendue est CONSTRUITE SUR L'UNION, jamais à côté d'elle : c'est ce
  // qui fait que débrancher `cumulerChampsDeGouvernance()` ne peut pas passer
  // inaperçu — la boucle n'aurait plus rien à parcourir.
  const parNom = new Map<string, ChampDerive[]>();
  for (const champ of retenusParLeFilet) {
    const deja = parNom.get(champ.nom);
    if (deja === undefined) parNom.set(champ.nom, [champ]);
    else deja.push(champ);
  }

  const gouvernance: ChampDerive[] = [];
  const declaresIntrouvables: string[] = [];
  for (const nom of cumul.union) {
    const duFilet = parNom.get(nom);
    if (duFilet !== undefined) {
      gouvernance.push(...duFilet);
      continue;
    }
    // Le nom n'entre dans l'union que par la DÉCLARATION : sa « famille » est la
    // SOURCE qui a mordu, pas un motif du § 20.
    const chemins = cheminsParNom.get(nom);
    if (chemins === undefined) {
      // Déclaré, mais aucune propriété inspectée ne le porte. On le surveille
      // quand même — voir `declaresIntrouvables` : la seule autre issue serait
      // de laisser tomber la déclaration, c'est-à-dire de DESSERRER.
      declaresIntrouvables.push(nom);
      gouvernance.push({
        nom,
        chemin: CHEMIN_DECLARE_SANS_PROPRIETE,
        famille: FAMILLE_DECLAREE_PAR_L_OUTIL,
      });
      continue;
    }
    for (const chemin of chemins) {
      gouvernance.push({ nom, chemin, famille: FAMILLE_DECLAREE_PAR_L_OUTIL });
    }
  }

  return {
    libres,
    gouvernance,
    proprietesInspectees,
    sousSchemasInspectes: trouves.length,
    motifsAppliques: NOMBRE_MOTIFS_GOUVERNANCE,
    schemaIllisible: false,
    profondeurDepassee,
    // Fail-closed sur la borne de profondeur : ce qu'on n'a pas parcouru peut
    // porter le champ libre qui compte.
    porteUnArgumentLibre: libres.length > 0 || profondeurDepassee,
    porteUnArgumentDeGouvernance: gouvernance.length > 0 || profondeurDepassee,
    retenusParLeNom: cumul.retenusParLeNom,
    declaresParLOutil: cumul.declares,
    ajoutesParLaDeclaration: cumul.ajoutesParLaDeclaration,
    // DÉRIVÉ du cumul, jamais recalculé : deux dérivations d'un même fait
    // finissent par se contredire, et c'est la plus rassurante qu'on croit.
    perdusParLeCumul: cumul.perdus,
    declaresIntrouvables,
  };
}

/**
 * `core/transport/contrat.ts` — **DEUX TRANSPORTS, UN SEUL NOYAU.**
 *
 * ═══ CE FICHIER NE CONTIENT AUCUNE IMPLÉMENTATION, ET C'EST DÉLIBÉRÉ ═══
 *
 * L'architecte du lot 2 pose les formes ; les constructeurs écrivent
 * `core/transport/http.ts` et `core/transport/stdio.ts` — deux noms **déjà
 * décidés** ailleurs (`APPELANTS_DE_LA_RELECTURE`, `core/identite/session.ts`),
 * et repris ici sans être réécrits.
 *
 * ⚠️ **AUCUNE VALEUR N'EST EXPORTÉE PAR CE FICHIER.** Rien ne peut donc être
 *    appelé par mégarde, et le registre des coutures ne compte ce module que
 *    pour les TYPES qu'il déclare. Même motif que `core/coutures/contrat.ts`.
 *
 * ═══ LA PROPRIÉTÉ QUE CE LOT EXISTE POUR TENIR ═══
 *
 * Le § 11 pose quatorze étapes et une colonne par transport. Le défaut à rendre
 * IMPOSSIBLE est celui d'un transport qui en contournerait une. Il ne se ferme
 * pas par une règle écrite — il se ferme par **trois interdits de construction**,
 * et l'ADR 0025 les détaille :
 *
 *  1. **Un transport ne peut pas fabriquer une identité.** `IdentiteAppelante`
 *     porte un `SessionId`, type marqué dont la marque est un `unique symbol`
 *     non exporté : seul `core/identite/` en frappe. Un transport passe donc par
 *     `identiteStdio` ou `identiteHttp`, ou il ne compile pas.
 *  2. **Un transport n'importe aucun module d'étape.** L'ensemble interdit est
 *     DÉRIVÉ d'`EXECUTANTS_ETAPES`, jamais listé : un transport qui importerait
 *     `etape-05-scopes.ts` ou `etape-14-execution.ts` refait la chaîne à côté du
 *     noyau, et c'est exactement le contournement recherché.
 *  3. **La couverture est vérifiée AU DÉMARRAGE, pas seulement en test.**
 *     `verifierCouvertureDesEtapes(transport)` est appelée à l'étage 6
 *     (`ops/demarrage/etages.ts`) : une étape sans exécutant fait refuser le
 *     démarrage, plutôt que de laisser traverser une chaîne trouée.
 *
 * ⚠️ **CE QUE CES TROIS INTERDITS NE COUVRENT PAS, ÉCRIT AVEC EUX.** Aucun ne
 *    voit un transport qui appellerait bien `orchestrerAppel` mais lui mentirait
 *    sur ce que les étapes 1 à 4 ont établi — un `principal` inventé, une
 *    `deadline` déjà passée. C'est l'objet de l'ADR 0029, pas de celui-ci.
 */

import type { AppelStep, ErrorCode } from "../types.js";
import type {
  ChargeServie,
  IdentiteAppelante,
  ResultatAppel,
  Transport,
} from "../chaine/orchestrateur.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE 1 — ANTI DNS-REBINDING, AVANT TOUT TRAITEMENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE VERDICT DE L'ÉTAPE 1, RENDU **AVANT** QUE LE CORPS SOIT LU.
 *
 * § 11 : « validation de l'en-tête `Host` contre une liste blanche, **avant tout
 * traitement** ». La borne est celle-là et pas une autre : avant l'analyse
 * syntaxique de l'enveloppe JSON-RPC, avant toute lecture de base, avant le
 * moindre journal. Un analyseur JSON est une surface d'attaque ; le sens de
 * l'étape 1 est qu'un hôte non autorisé ne l'atteigne jamais.
 *
 * ⚠️ **UNE LISTE BLANCHE VIDE EST UN REFUS DE DÉMARRER, PAS UN « TOUT
 *    AUTORISER ».** C'est le mode de défaillance classique de ce contrôle : la
 *    variable est mal orthographiée, la liste se résout à zéro entrée, la boucle
 *    ne trouve aucun refus à prononcer et la garde reste verte. L'étage 6 refuse
 *    donc le démarrage sur une liste vide.
 */
export interface VerdictDHote {
  /** L'en-tête reçu, tel quel. Jamais journalisé verbatim — voir ADR 0031. */
  readonly hoteRecu: string;
  /** Combien d'entrées de la liste blanche ont été RÉELLEMENT confrontées. */
  readonly entreesConfrontees: number;
  readonly autorise: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE NOYAU UNIQUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE SEUL CHEMIN PAR LEQUEL UN APPEL D'OUTIL ATTEINT LE SOCLE.**
 *
 * Les deux transports servent des enveloppes différentes — JSON-RPC sur
 * `POST /api/mcp` d'un côté, lignes sur l'entrée standard de l'autre — et
 * n'ont pas les mêmes étapes (quatre sont « HTTP seul »). Ils ne partagent pas
 * leur enveloppe ; ils partagent **tout ce qui décide**.
 *
 * ⚠️ CE TYPE N'EST PAS `orchestrerAppel` DÉGUISÉ. Il nomme ce qu'un transport a
 *    le droit d'appeler, et rien d'autre : l'identité lui est DONNÉE construite
 *    (interdit n° 1), et il ne lui rend qu'un {@link ResultatAppel} déjà
 *    journalisé. Un transport n'a donc aucune valeur à interpréter avant
 *    l'orchestrateur, ni aucune à compléter après lui.
 */
export type NoyauUnique = (identite: IdentiteAppelante, appel: unknown) => Promise<ResultatAppel>;

/**
 * **UN NOYAU PAR COLONNE — ADR 0039.**
 *
 * ═══ POURQUOI UNE FABRIQUE, ET NON UN NOYAU ═══
 *
 * `DependancesOrchestrateur` porte un champ `transport`, et c'est LUI qui fait
 * lire à l'orchestrateur la colonne du § 11 : quelles étapes sont applicables,
 * lesquelles sont établies EN AMONT, lesquelles ne s'appliquent pas du tout.
 *
 * Un noyau unique composé avec `transport: "stdio"` puis remis aux DEUX
 * transports servirait donc les appels HTTP en croyant que les quatre étapes
 * « HTTP seul » n'existent pas. Et rien ne le verrait :
 * `verifierCouvertureDesEtapes` boucle à l'étage 6 sur les NOMS de transports —
 * pas sur les noyaux montés.
 *
 * La racine de composition rend donc une fabrique, et le montage l'appelle **une
 * fois par transport monté**, avec le nom de la colonne qu'il monte.
 *
 * ⚠️ **CE N'EST PAS UNE CONTRADICTION AVEC L'ADR 0025** (« deux transports, un
 *    seul noyau »). Ce que cet ADR-là interdit est qu'un transport REFASSE la
 *    chaîne à côté ; les deux noyaux d'ici partagent tout ce qui décide —
 *    journal, dépôts, index de provenance, politique, les cinq étapes — et ne
 *    diffèrent QUE par leur colonne. Un seul CHEMIN, pas un seul objet.
 */
export type FabriqueDeNoyau = (transport: Transport) => NoyauUnique;

/**
 * **CE QU'UNE TERMINAISON SERVIE REMET AU CLIENT — DÉRIVÉ UNE FOIS, POUR LES
 * DEUX TRANSPORTS. ADR 0037.**
 *
 * ═══ LE DÉFAUT MESURÉ QUE CE TYPE EXISTE POUR FERMER ═══
 *
 * Le transport HTTP ne connaissait qu'un seul genre de terminaison servie
 * (`genre === "exécuté"`). Un REJEU — l'issue de l'étape 13 quand une clé
 * d'idempotence est rejouée — tombait dans la branche `null` : `structuredContent`
 * nul, ni genre, ni `resultRef`. Mesuré, même noyau double présenté aux deux :
 *
 *  · HTTP  → `genre` absent · `resultRef` absent · `structuredContent` nul ;
 *  · stdio → `genre: "rejeu"` · `resultRef: "…"` · `content: []`.
 *
 * Un client HTTP ne pouvait donc pas distinguer « ton appel a été REJOUÉ, voici
 * la référence du résultat d'origine » de « ton appel a été exécuté et n'a rien
 * rendu ». Le § 13 fait du `resultRef` le SEUL pointeur vers le résultat
 * d'origine.
 *
 * ⚠️ **UNE SEULE DÉRIVATION, DEUX EMBALLAGES.** Chaque transport emballe ces
 *    valeurs dans SON enveloppe — `_meta` sous le préfixe `ops/` en HTTP, les
 *    champs du `result` en stdio. Deux écritures de « qu'est-ce qu'un rejeu rend
 *    au client » finiraient par se contredire, et la contradiction serait
 *    exactement celle qu'on vient de mesurer, dans l'autre sens.
 *
 * ⚠️ **ELLE SE DÉRIVE PAR UN `switch` EXHAUSTIF SUR {@link ChargeServie}**, jamais
 *    par un test d'égalité. Une troisième branche ajoutée un jour à l'union ne
 *    pourra alors plus tomber en silence dans `null` : le compilateur le dira.
 *    C'est la seule partie de cette décision qui se tient toute seule après notre
 *    départ.
 */
export interface ValeursServiesAuClient {
  /** `"exécuté"` ou `"rejeu"` — DÉRIVÉ de `ChargeServie`, jamais réécrit. */
  readonly genre: ChargeServie["genre"];
  /** § 13 — la référence du résultat d'origine sur un rejeu, `null` sinon. */
  readonly resultRef: string | null;
  /** La charge de l'adaptateur sur une exécution, `null` sur un rejeu. */
  readonly charge: unknown;
}

/**
 * CE QU'UN TRANSPORT DOIT ÉTABLIR AVANT D'APPELER LE NOYAU.
 *
 * ⚠️ **LES QUATRE ÉTAPES « HTTP SEUL » NE SONT PAS OPTIONNELLES EN HTTP : ELLES
 *    SONT EN AMONT.** `colonneDuTransport("http")` les range dans `etapesAmont`
 *    et l'orchestrateur ne les mesure pas — il les reçoit établies. C'est
 *    précisément pourquoi ce type existe : sans lui, « en amont » se lirait
 *    « nulle part », et c'est ce que la v5 laissait arriver.
 */
export interface EtapesEtabliesEnAmont {
  readonly transport: Transport;
  /** Les numéros d'étape que ce transport a réellement exécutés. */
  readonly etapesExecutees: readonly AppelStep[];
  /**
   * Les numéros d'étape que la colonne du transport lui attribue en amont.
   * L'écart entre les deux est une ANOMALIE, jamais un défaut toléré.
   */
  readonly etapesDues: readonly AppelStep[];
  /**
   * Le refus prononcé en amont, ou `null`. Il porte un code ET le numéro de
   * l'étape qui a refusé : le § 11 exige que toute terminaison écrive une ligne
   * portant ce numéro, y compris les refus qui n'atteignent jamais le noyau.
   */
  readonly refusEnAmont: { readonly etape: AppelStep; readonly code: ErrorCode } | null;
}

/**
 * LES DEUX VALEURS DU `ctx` QUE **LE TRANSPORT** FRAPPE — et jamais l'appelant.
 *
 * ⚠️ **C'EST LA COUTURE QUE L'ADR 0001 ATTENDAIT DEPUIS `core/types.ts`.**
 *    `STATUT_DES_CANAUX_DE_CONTEXTE` classe `requestId` et `deadline`
 *    « à-fermer-au-transport » et porte déjà leur motif : la règle a été écrite
 *    AVANT que ce dossier existe, parce que c'était le seul moment où elle ne
 *    coûtait aucune migration. La voici à l'endroit où elle se tient.
 *
 *  · `requestId` est **frappé** par le socle, jamais recopié d'un en-tête client
 *    ni de l'`id` d'une enveloppe JSON-RPC. Un identifiant de corrélation choisi
 *    par l'appelant lui permet de faire converger deux appels dans la même
 *    ligne, ou d'en faire diverger un seul ;
 *  · `deadline` est **calculée** — un instant de référence plus un budget borné
 *    par l'outil —, jamais un horodatage reçu recopié tel quel. Un `Date`
 *    recopié est une valeur de plusieurs dizaines de bits choisie par
 *    l'appelant, et elle décide de la durée pendant laquelle le socle travaille.
 */
export interface ValeursFrappeesParLeTransport {
  /** Frappé ici. Jamais lu dans la requête. */
  readonly requestId: string;
  /** Calculée ici. Jamais recopiée d'une valeur reçue. */
  readonly deadline: Date;
  /** Le budget qui a servi au calcul, en millisecondes. Annoncé, pas supposé. */
  readonly budgetMs: number;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE `core/transport/http.ts` DOIT AU RESTE DU SOCLE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA RELECTURE DE L'ÉTAPE 4 — `jti` non révoqué, et la session qu'elle rapporte.
 *
 * ⚠️ **LA SESSION VIENT DE L'OCTROI, JAMAIS DU `jti` — ADR 0014.** Le jeton
 *    d'accès vit une heure ; une marque de provenance quatre. Une session
 *    dérivée du `jti` s'effacerait trois fois par TTL, sur un rafraîchissement
 *    que le client MCP conduit tout seul, et la garde du § 20 se désarmerait
 *    d'elle-même sans qu'aucun compte ne bouge.
 *
 * ⚠️ **ET LE TRANSPORT NE FRAPPE AUCUNE SESSION.** Il RELIT. C'est un écart
 *    mesuré du lot 2 : `FRAPPEURS_DE_SESSION` nomme aujourd'hui
 *    `core/transport/http.ts` et `core/transport/stdio.ts` alors que sa propre
 *    prose dit que frapper est « le geste du serveur d'autorisation à l'octroi,
 *    et celui du démon stdio à son démarrage ». Voir ADR 0025 : la liste cible
 *    est `core/chaine/identite.ts` et `core/auth/octroi.ts`.
 */
export interface RelectureDeJeton {
  /** Combien de lignes `ops_token` ont été confrontées. Jamais un booléen nu. */
  readonly lignesConfrontees: number;
  /** Le refus, ou `null`. `401` en HTTP — étape 4. */
  readonly refus: ErrorCode | null;
}

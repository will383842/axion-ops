/**
 * `core/chaine/identite.ts` — D'OÙ VIENT LA SESSION, PAR TRANSPORT (ADR 0014).
 *
 * ═══ CE QUE CE FICHIER EST, ET POURQUOI IL N'EST PAS DANS L'ORCHESTRATEUR ═══
 *
 * `core/identite/session.ts` dit ce qu'une session EST — un type marqué, une
 * forme, une fabrique. Il ne dit pas d'où elle vient, parce que ça dépend du
 * transport, et que le transport n'est pas son sujet. Ce fichier-ci est la
 * réponse à cette seule question, et il est SÉPARÉ de `orchestrateur.ts` pour
 * une raison qui se voit dans le graphe d'imports :
 *
 * **c'est le seul module livré de tout le socle qui FRAPPE une session.**
 *
 * Frapper, c'est ouvrir une session propre — donc, si on le fait au mauvais
 * rythme, refaire exactement le défaut mesuré au lot 1b. Ce pouvoir tient en
 * une ligne ; noyé dans les 1 900 lignes de l'orchestrateur, il aurait été
 * invisible à toute revue. Ici, il est le sujet du fichier, il est nommé dans
 * `FRAPPEURS_DE_SESSION`, et la garde G2 de l'ADR 0014 refuse qu'un quatrième
 * module s'y ajoute sans qu'on l'écrive.
 *
 * ═══ LES DEUX DÉRIVATIONS, ET CE QUI LES DISTINGUE ═══
 *
 * · **stdio** — {@link SESSION_DE_CETTE_EXECUTION}. UNE session par EXÉCUTION du
 *   démon, frappée au chargement de ce module, exactement comme `PRINCIPAL_STDIO`
 *   est une constante. Ni paramètre, ni variable d'environnement : un poste local
 *   qui choisirait sa session rejouerait le renouvellement depuis sa propre ligne
 *   de commande, et le § 20 ne verrait rien.
 *
 * · **HTTP** — {@link LigneOpsTokenRelue}, la ligne `ops_token` que l'étape 4
 *   relit DÉJÀ (« `jti` non révoqué »). Ce module ne la lit pas et ne la relit
 *   pas : il la REÇOIT, portant une session que le transport a déjà validée par
 *   `FabriqueSessionId.relireDepuisLeSocle()`. C'est délibéré —
 *   `APPELANTS_DE_LA_RELECTURE` ne nomme que `core/transport/http.ts` et
 *   `core/transport/stdio.ts`, et ce fichier n'est ni l'un ni l'autre.
 *
 * ═══ LA SESSION SUIT L'OCTROI, PAS LE `jti` — ET C'EST MESURÉ ═══
 *
 * Le § 19.1 donne au jeton d'accès **une heure**, `TTL_MARQUAGE_MS` donne à une
 * marque de provenance **quatre heures**. Une session dérivée du `jti`
 * s'effacerait trois fois par TTL de marque, sur un rafraîchissement que le
 * client MCP conduit tout seul. C'est pourquoi {@link LigneOpsTokenRelue} porte
 * un `jti` ET un `sessionId` : le premier tourne, le second ne tourne QU'À UN
 * NOUVEL OCTROI, qui coûte un geste humain.
 *
 * ⚠️ **CE QUE CE FICHIER NE PEUT PAS TENIR SEUL, ÉCRIT AVEC LA MESURE.** Que la
 *    colonne `ops_token.sessionId` porte bien la même valeur d'un jeton
 *    rafraîchi à l'autre est une propriété du SERVEUR D'AUTORISATION (§ 19.1),
 *    pas de ce module : il reçoit ce qu'on lui donne. Ce fichier rend cette
 *    propriété EXPRIMABLE et la garde G1 la mesure sur un serveur d'autorisation
 *    témoin ; le jour où `core/transport/` et l'émetteur atterrissent, c'est
 *    là-bas que la même garde devra se rejouer sur le vrai chemin.
 */

import { creerFabriqueSessionId } from "../identite/session.js";
import type { FabriqueSessionId, SessionId } from "../identite/session.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA FABRIQUE DE CE PROCESSUS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Montée UNE fois, au chargement du module. C'est la « racine de composition »
 * de l'ADR 0014 pour tout ce qui vit dans `core/chaine/`.
 *
 * ⚠️ ELLE N'EST PAS EXPORTÉE. Un module qui la recevrait recevrait le droit de
 *    frapper des sessions, et l'ADR 0014 exclut nommément « une fabrique
 *    injectée partout ». Ce qui sort d'ici est une session déjà frappée
 *    ({@link SESSION_DE_CETTE_EXECUTION}) ou rien.
 */
const FABRIQUE: FabriqueSessionId = creerFabriqueSessionId();

/**
 * LA SESSION DE PILOTAGE DU DÉMON stdio — **une par EXÉCUTION du processus**.
 *
 * Elle est frappée au chargement de ce module, c'est-à-dire au démarrage du
 * démon, et elle ne change plus. `identiteStdio()` la lit ; elle n'est pas un
 * paramètre.
 *
 * ⚠️ POURQUOI PAS UNE PAR APPEL. Chaque appel arriverait sur une session propre :
 *    l'index de provenance du § 20 serait peuplé par la lecture et interrogé
 *    ailleurs à l'appel suivant. L'étape 11 laisserait tout passer **en restant
 *    verte**, ce qui est le pire état possible d'une protection.
 *
 * ⚠️ POURQUOI PAS UNE PAR MACHINE, NI PAR UTILISATEUR. Une session qui survivrait
 *    au processus survivrait au `TTL_MARQUAGE_MS` de quatre heures qu'elle est
 *    censée borner, et un redémarrage cesserait d'être ce qu'il doit être : un
 *    geste qui repart d'un état propre.
 *
 * ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE : rien ici n'empêche un poste local de
 *    RELANCER le démon pour obtenir une session neuve. Ce n'est pas un
 *    contournement rattrapable par le socle — un processus local qui redémarre
 *    perd aussi tout ce qu'il avait lu. Ce que la constante ferme est le
 *    renouvellement SANS redémarrage, qui était gratuit et silencieux.
 */
export const SESSION_DE_CETTE_EXECUTION: SessionId = FABRIQUE.pourCetteExecutionDuDemon();

// ═════════════════════════════════════════════════════════════════════════════
//  LA LIGNE `ops_token`, TELLE QUE L'ÉTAPE 4 LA REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * INTERFACE DÉCLARÉE ICI, IMPLÉMENTÉE PAR `core/transport/http.ts` (lot suivant).
 *
 * ⚠️ ELLE NE DÉCRIT PAS LA TABLE `ops_token`, ET C'EST VOULU. Le § 12 lui donne
 *    d'autres colonnes ; les dessiner ici depuis `core/chaine/` serait décider à
 *    la place du lot qui écrira le transport et la migration. Elle ne porte que
 *    ce dont la chaîne d'appel a besoin, et le jour où la table est écrite, c'est
 *    elle qui devra satisfaire cette forme, pas l'inverse.
 *
 * ⚠️ `sessionId` Y EST DÉJÀ UNE {@link SessionId}, PAS UNE `string`. La colonne,
 *    elle, est du texte : c'est `relireDepuisLeSocle()` qui fait la traversée, et
 *    elle appartient au transport (`APPELANTS_DE_LA_RELECTURE`). Un transport qui
 *    remettrait ici la chaîne brute de la base **ne compilerait pas** — ce qui est
 *    le seul rappel qui tienne.
 */
export interface LigneOpsTokenRelue {
  /**
   * § 12 — l'identifiant du JETON D'ACCÈS, celui que l'étape 4 confronte à la
   * liste de révocation. Il tourne au moins toutes les heures (§ 19.1).
   */
  readonly jti: string;

  /**
   * § 19.1 — la session frappée **à l'octroi**, propagée à tout jeton né de la
   * même chaîne de rafraîchissement. Elle ne tourne pas avec le `jti` : c'est
   * toute la décision de l'ADR 0014.
   */
  readonly sessionId: SessionId;

  /** Le principal que le jeton porte. En HTTP il ne vient jamais d'ailleurs. */
  readonly principal: string;
}

/**
 * LA SESSION DE PILOTAGE D'UN APPEL HTTP — une projection, pas un calcul.
 *
 * ⚠️ CETTE FONCTION NE FAIT RIEN, ET C'EST LE RÉSULTAT RECHERCHÉ. Toute la
 *    décision de l'ADR 0014 tient dans le fait qu'il n'y a **rien à faire** :
 *    pas de dérivation depuis le `jti`, pas de repli quand la colonne est vide,
 *    pas de session frappée à la volée. Elle existe pour porter ce commentaire
 *    à l'endroit exact où quelqu'un aurait écrit `sessionId ?? frapper()`, et
 *    pour que le jour où une dérivation reviendrait, elle ait un seul endroit
 *    où s'écrire — donc un seul endroit où être vue.
 */
export function sessionDuJetonRelu(jeton: LigneOpsTokenRelue): SessionId {
  return jeton.sessionId;
}

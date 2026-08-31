/**
 * `core/identite/fixtures.ts` — LA FABRIQUE DE SESSIONS **NOMMÉE** DES TESTS.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * L'ADR 0014 resserre `IdentiteAppelante.sessionId` en `SessionId`, un type
 * marqué. Les doubles de test qui écrivaient `sessionId: "session-temoin"`
 * cessent donc de compiler — et c'est le but. Restait à décider ce qu'ils
 * écrivent à la place, et il n'y avait que deux réponses :
 *
 *  · une conversion forcée `"session-temoin" as unknown as SessionId`, **au cas
 *    par cas**, dans chaque fichier de test. C'est la réponse qui se donne toute
 *    seule, et c'est la mauvaise : une fois ce geste banal dans dix fichiers de
 *    test, il devient banal dans le onzième, qui ne sera pas un test. La garde
 *    G3 de l'ADR 0014 n'aurait plus rien à distinguer — elle compterait
 *    quarante occurrences légitimes et ne verrait pas la quarante-et-unième ;
 *  · **une fabrique nommée, une seule, ici.** Les tests l'appellent, G3 refuse
 *    la conversion forcée partout ailleurs, et une occurrence nouvelle redevient
 *    ce qu'elle doit être : une anomalie visible.
 *
 * ═══ ELLE FRAPPE DE L'ALÉA, ELLE NE DÉRIVE RIEN D'UNE GRAINE ═══
 *
 * ⚠️ **CE FICHIER EST LIVRÉ** — l'`exclude` de `tsconfig.build.json` ne retire que
 *    les fichiers de test (le motif y est écrit ; il ne peut pas être recopié
 *    dans un commentaire de bloc, où il le refermerait),
 *    et c'est déjà le cas de `core/audit/fixtures.ts` et de `core/epreuve/outils.ts`.
 *    Une fabrique qui dériverait la session d'une GRAINE (`sessionIdDeTemoin("a")`
 *    → SHA-256 de « a ») serait donc, en production, exactement ce que l'ADR 0014
 *    exclut nommément : « un identifiant séquentiel ou prévisible — une session
 *    devinable est une marque de provenance qu'on peut s'attribuer ».
 *
 *    Elle frappe donc le MÊME aléa que la fabrique de production, et les tests
 *    qui ont besoin de deux fois la même session gardent la valeur dans une
 *    constante. Ce fichier ne peut rien produire qu'un appelant puisse deviner.
 *
 * ⚠️ CE QUI LE GARDE MALGRÉ TOUT. Il est dans `core/identite/`, le seul dossier
 *    où frapper une session est le métier. La garde G2 de l'ADR 0014 refuse à
 *    tout module LIVRÉ **hors de ce dossier** d'importer une valeur d'ici, sauf
 *    s'il est nommé dans `FRAPPEURS_DE_SESSION` — trois entrées, dont deux qui
 *    n'existent pas encore.
 */

import { creerFabriqueSessionId } from "./session.js";
import type { SessionId } from "./session.js";

/**
 * La fabrique des témoins. Montée une fois, comme celle de la racine de
 * composition — un test qui en monterait une par appel mesurerait le coût du
 * montage plutôt que la règle qu'il éprouve.
 */
const FABRIQUE_DES_TEMOINS = creerFabriqueSessionId();

/**
 * UNE SESSION DE TÉMOIN, FRAPPÉE PAR LE SOCLE.
 *
 * ⚠️ DEUX APPELS RENDENT DEUX SESSIONS DIFFÉRENTES, et c'est ce qu'on veut : un
 *    test qui a besoin de « la même session deux fois » doit garder la valeur,
 *    parce que c'est exactement ce que le transport fera. Un test qui pourrait
 *    la RETROUVER depuis une graine éprouverait une session que le socle
 *    n'établit pas.
 */
export function sessionIdDeTemoin(): SessionId {
  return FABRIQUE_DES_TEMOINS.pourUnOctroi();
}

/**
 * Les huit premiers caractères d'une session, POUR UN JOURNAL DE TEST.
 *
 * ⚠️ ELLE N'EST PAS UNE TRONCATURE D'IDENTIFIANT. Rien dans le socle ne compare
 *    des sessions abrégées : un `console.log` qui recracherait 64 caractères
 *    d'hexadécimal rendrait ses comptes illisibles, c'est tout. Le jour où une
 *    comparaison s'appuierait là-dessus, deux sessions sur 2³² se confondraient.
 */
export function resumeDeSession(session: SessionId): string {
  return `${session.slice(0, 8)}…`;
}

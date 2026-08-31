/**
 * `core/auth/contrat.ts` — **L'ÉMETTEUR MINIMAL, ET LES DEUX RÔLES DU SOCLE.**
 *
 * ═══ CE FICHIER NE CONTIENT AUCUNE IMPLÉMENTATION, ET C'EST DÉLIBÉRÉ ═══
 *
 * L'ADR 0001 a tranché — option A, serveur d'autorisation minimal intégré, servi
 * sur `/auth/*`, sur un domaine distinct, séparé logiquement du resource server.
 * Elle nommait un dossier et une table, **aucune fonction** : le registre des
 * coutures portait donc l'entrée en `à-nommer`. Ce fichier est ce qui la périme.
 *
 * ⚠️ **AUCUNE VALEUR N'EST EXPORTÉE PAR CE FICHIER.** Les seules valeurs du lot
 *    vivent dans `core/auth/ressource.ts`, qui porte la forme de l'audience.
 *
 * ═══ LA SÉPARATION DES DEUX RÔLES, ET CE QUI LA TIENT ═══
 *
 * | Route      | Rôle                   | Ce qu'il fait                          |
 * | ---------- | ---------------------- | -------------------------------------- |
 * | `/auth/*`  | serveur d'autorisation | émet · porte la session de console      |
 * | `/api/mcp` | resource server        | valide · n'émet **jamais**              |
 *
 * La séparation n'est pas une convention de nommage : **les handlers d'émission
 * et les handlers de validation ne partagent aucune fonction de décision**, et
 * un jeton n'est jamais émis sur le chemin d'une requête `/api/mcp`.
 *
 * ⚠️ **JAMAIS DE PASS-THROUGH (§ 11).** Le jeton reçu n'est jamais transmis en
 *    aval. Ce n'est pas seulement une règle : `ToolContext` ne porte **aucun**
 *    champ de jeton, et sa totalité est tenue par le compilateur
 *    (`STATUT_DES_CANAUX_DE_CONTEXTE`). Un champ ajouté demain obligerait
 *    quelqu'un à le CLASSER — c'est ce qui rend l'interdit mécanique plutôt
 *    qu'intentionnel.
 */

import type { OpsScope } from "../types.js";
import type { SessionId } from "../identite/session.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'OCTROI — ce que `ops_token` ne sait pas encore porter
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **UN OCTROI**, c'est-à-dire la chaîne d'un consentement humain : un passage à
 * `/auth/authorize`, puis tous les jetons qui en descendent par rafraîchissement.
 *
 * ⚠️ **CE TYPE EXISTE PARCE QU'UNE COLONNE MANQUE, ET C'EST MESURÉ.** L'ADR 0014
 *    décide que la session de pilotage **suit l'octroi, pas le `jti`**, et
 *    `LigneOpsTokenRelue` (`core/chaine/identite.ts`) exige déjà un `sessionId`.
 *    Or `model OpsToken` (`prisma/schema.prisma`) n'en porte aucun : le lot 2
 *    est le premier qui puisse le constater, parce qu'il est le premier à écrire
 *    l'émetteur. Voir ADR 0027 — deux colonnes atterrissent avec lui,
 *    `grantId` et `sessionId`.
 *
 * ⚠️ **LA SESSION EST FRAPPÉE UNE FOIS PAR OCTROI, PAS PAR JETON.** C'est le
 *    seul geste de frappe du côté HTTP, et il appartient à l'émetteur — pas au
 *    transport, qui relit. Voir `FRAPPEURS_DE_SESSION` et l'écart relevé à
 *    l'ADR 0025.
 */
export interface Octroi {
  /** L'identifiant de la chaîne de rafraîchissement. Il ne tourne jamais. */
  readonly grantId: string;
  /** Frappée à l'octroi, propagée à tout jeton qui en descend. */
  readonly sessionId: SessionId;
  readonly principal: PrincipalEmis;
  readonly scopes: readonly OpsScope[];
}

/**
 * **UN PRINCIPAL QUE L'ÉMETTEUR A ACCEPTÉ D'ÉCRIRE.**
 *
 * ⚠️ **CE TYPE FERME LE DÉFAUT BLOQUANT DU LOT 1d, ET IL LE FERME À LA SOURCE.**
 *    L'en-tête de ligne d'audit pose `principal` verbatim ; la garde de contenu
 *    du § 31 (`verifierAucunContenu`) refuse alors la ligne, et l'écriture lève
 *    HORS du `try` de `journaliser` : **zéro ligne d'`ops_audit`**. Rien ne sort
 *    — la porte est fermée — mais la trace est perdue, et l'invariant du § 11
 *    tombe avec elle.
 *
 *    Le socle n'a que **deux sources** de principal : cet émetteur, et
 *    `PRINCIPAL_STDIO`, qui est une constante conforme par construction. Borner
 *    ici, c'est borner partout. Voir ADR 0029, qui dit aussi ce que fait le
 *    socle d'un principal malformé rencontré malgré tout — et pourquoi la
 *    réponse n'est PAS la même que pour `tool`.
 *
 * ⚠️ **LA FORME SE DÉRIVE DE `FORMES` (`core/audit/contenu.ts`), JAMAIS RÉÉCRITE
 *    ICI.** Une seconde expression écrite à la main serait la façon dont le
 *    troisième champ de la famille sera oublié de la même manière.
 */
export type PrincipalEmis = string & { readonly [MARQUE_PRINCIPAL_EMIS]: true };

/**
 * La marque. `declare const` : elle n'existe qu'à la compilation, et le symbole
 * n'est **pas exporté** — aucun module ne peut donc nommer la propriété, donc
 * aucun ne peut écrire un littéral assignable. Même motif que
 * `MARQUE_SESSION_DE_PILOTAGE` (`core/identite/session.ts`), et pour la même
 * raison : un interdit qui se vérifie à la compilation n'arrive jamais trop tard.
 */
declare const MARQUE_PRINCIPAL_EMIS: unique symbol;

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONFIGURATION — la règle la plus forte du document, et son test
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE L'ÉTAGE 3 DU DÉMARRAGE CONFRONTE.
 *
 * § 19, règle absolue : **le socle ne démarre pas si l'authentification n'est
 * pas configurée. Pas de mode dégradé, pas d'`AUTH_DISABLED`.** La v5 posait
 * cette phrase comme la plus forte du document et ne lui donnait aucun test,
 * quand le coffre en avait un.
 *
 * ⚠️ **`reglagesConfrontes` N'EST PAS DÉCORATIF.** Une vérification qui
 *    confronterait zéro réglage serait verte pour la pire des raisons — c'est le
 *    mode de défaillance qu'`ops/secrets.ts` documente déjà : « GitHub Actions
 *    substitue une chaîne vide à un secret inconnu ». Le compte est ce que les
 *    tests lisent, jamais la couleur.
 */
export interface ConfigurationDAuthentification {
  readonly reglagesConfrontes: number;
  /** Les NOMS des réglages absents. **Jamais une valeur.** */
  readonly manquants: readonly string[];
  /** Les messages, prêts pour la sortie d'erreur. Ils nomment le geste (§ 25). */
  readonly anomalies: readonly string[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE L'ÉMETTEUR REFUSE — et pourquoi ça ne se délègue pas à l'étape 5
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE VERDICT D'UNE DEMANDE DE SCOPES À L'OCTROI.
 *
 * ⚠️ **`ops:policy` N'EST JAMAIS PORTÉ PAR LE JETON DU CONNECTEUR (§ 19.2), ET
 *    C'EST L'ÉMETTEUR QUI LE REFUSE — pas l'étape 5.** La distinction est toute
 *    la décision : l'étape 5 refuse un APPEL, l'émetteur refuse que le jeton
 *    EXISTE. Un jeton qui porterait `ops:policy` et qu'aucun appel n'atteindrait
 *    resterait une capacité en circulation, révocable seulement si quelqu'un
 *    s'avise de la révoquer.
 *
 * ⚠️ **L'ENSEMBLE ÉMISSIBLE SE DÉRIVE DE `PORTE_PAR_LE_JETON_DAPPEL`, JAMAIS
 *    D'UNE SECONDE LISTE.** C'est la même totalité qui produit déjà
 *    `SCOPES_PAR_DEFAUT_STDIO` : basculer un scope dans cette table change les
 *    deux du même geste.
 */
export interface VerdictDeScopes {
  /** Combien de scopes demandés ont été confrontés. */
  readonly scopesConfrontes: number;
  readonly accordes: readonly OpsScope[];
  /** Les scopes refusés à l'octroi, avec le motif écrit. */
  readonly refuses: ReadonlyArray<{ readonly scope: OpsScope; readonly motif: string }>;
}

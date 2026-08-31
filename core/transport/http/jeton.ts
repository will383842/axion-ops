/**
 * `core/transport/http/jeton.ts` — **CE QUE LES ÉTAPES 2 ET 4 DEMANDENT AUX
 * AUTRES, ET LE PEU QU'ELLES FONT ELLES-MÊMES.**
 *
 * Le transport ne vérifie aucune signature et ne lit aucune table. Il ne peut
 * pas : l'émetteur (`core/auth/`, ADR 0001 et 0027) et le dépôt `ops_token`
 * (§ 12) appartiennent à d'autres périmètres, et les recopier ici fabriquerait
 * une seconde source de vérité sur la validité d'un jeton — la pire des choses
 * à dédoubler.
 *
 * Ce module porte donc **deux ports déclarés** et **un seul geste** : extraire
 * le porteur de l'en-tête `Authorization`.
 *
 * ═══ LA FRONTIÈRE, ÉCRITE AVEC SA CONSÉQUENCE ═══
 *
 * ⚠️ **LE TRANSPORT NE FRAPPE AUCUNE SESSION, ET IL N'EN RELIT AUCUNE NON PLUS.**
 *    `APPELANTS_DE_LA_RELECTURE` (`core/identite/session.ts`) nomme
 *    `core/transport/http.ts` comme l'appelant de
 *    `FabriqueSessionId.relireDepuisLeSocle()`. Ce lot ne tient pas cette moitié
 *    et le dit plutôt que de la simuler : {@link RegistreDesJetons} rend une
 *    {@link LigneOpsTokenRelue} dont le `sessionId` est **déjà** une `SessionId`,
 *    donc déjà passé par la fabrique. La traversée « colonne de base → session »
 *    appartient à l'implémentation du port, qui vit avec la migration
 *    d'`ops_token` (ADR 0027, moitié « table »).
 *
 *    Ce que le TYPE tient malgré tout, et ce n'est pas rien : une implémentation
 *    qui remettrait ici la chaîne brute de la base **ne compile pas**. C'est le
 *    seul rappel qui n'arrive jamais trop tard (ADR 0014).
 *
 * ⚠️ **AUCUN PASS-THROUGH (§ 11).** Le jeton reçu n'est jamais transmis en aval,
 *    et ce n'est pas qu'une règle écrite : {@link RevendicationsDuJeton} ne
 *    porte pas la chaîne du jeton, `ToolContext` ne porte aucun champ de jeton
 *    (`STATUT_DES_CANAUX_DE_CONTEXTE` le tient par le compilateur), et le
 *    porteur brut ne quitte jamais {@link porteurDeLAutorisation}.
 */

import type { OpsScope } from "../../types.js";
import type { LigneOpsTokenRelue } from "../../chaine/identite.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'EN-TÊTE — la seule chose que ce module lit lui-même
// ═════════════════════════════════════════════════════════════════════════════

/** RFC 6750. En minuscules : Node livre les en-têtes ainsi normalisés. */
export const EN_TETE_AUTORISATION = "authorization";

/** Le schéma d'authentification admis, et le seul. RFC 6750, § 2.1. */
export const SCHEMA_PORTEUR = "Bearer";

/**
 * EXTRAIT LE PORTEUR DE L'EN-TÊTE `Authorization`.
 *
 * Rend `null` pour tout ce qui n'est pas exactement `Bearer <jeton>` : en-tête
 * absent, schéma autre (`Basic`, `Negotiate`), schéma seul sans valeur.
 *
 * ⚠️ **LA DISTINCTION « ABSENT » / « PRÉSENT MAIS INVALIDE » NE SE FAIT PAS
 *    ICI, ET ELLE COMPTE.** La RFC 6750, § 3, veut qu'un défi
 *    `WWW-Authenticate` porte `error="invalid_token"` **seulement** quand une
 *    tentative a eu lieu : un client sans jeton doit recevoir un défi nu, sinon
 *    on lui dit que son jeton — qu'il n'a pas — est mauvais. C'est l'appelant
 *    qui tranche, en regardant si l'en-tête existait ; ce module rend
 *    séparément les deux faits.
 *
 * ⚠️ **LE SCHÉMA SE COMPARE SANS TENIR COMPTE DE LA CASSE (RFC 9110, § 11.1),
 *    LE JETON NON.** Un jeton est une valeur opaque : le normaliser reviendrait
 *    à en faire accorder deux qui diffèrent.
 */
export function porteurDeLAutorisation(entete: string | undefined): {
  readonly enTetePresent: boolean;
  readonly porteur: string | null;
} {
  if (entete === undefined || entete.trim().length === 0) {
    return { enTetePresent: false, porteur: null };
  }
  const separation = entete.indexOf(" ");
  if (separation < 0) {
    return { enTetePresent: true, porteur: null };
  }
  const schema = entete.slice(0, separation);
  const valeur = entete.slice(separation + 1).trim();
  if (schema.toLowerCase() !== SCHEMA_PORTEUR.toLowerCase() || valeur.length === 0) {
    return { enTetePresent: true, porteur: null };
  }
  return { enTetePresent: true, porteur: valeur };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 2 — signature et `iss`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UN JETON VALIDE PORTE, ET RIEN DE PLUS.
 *
 * ⚠️ **IL N'Y A PAS DE `sessionId` ICI, ET C'EST L'ADR 0014.** Le jeton d'accès
 *    vit une heure (§ 19.1), une marque de provenance quatre : une session
 *    portée par le jeton s'effacerait trois fois par TTL de marque, sur un
 *    rafraîchissement que le client MCP conduit tout seul. Elle vient de la
 *    LIGNE `ops_token`, à l'étape 4, parce qu'elle suit l'OCTROI.
 *
 * ⚠️ **IL N'Y A PAS DE `principal` ICI NON PLUS.** Même motif, autre décision :
 *    l'ADR 0029 borne le principal **à la source**, c'est-à-dire à l'émission,
 *    et la valeur qui fait foi est celle qu'`ops_token` a écrite — pas celle
 *    qu'une revendication de jeton prétend. Deux lectures du même « qui »
 *    finiraient par diverger, et c'est la clé d'ancrage d'`ops_quota` et
 *    d'`ops_runtime`.
 */
export interface RevendicationsDuJeton {
  /** § 12 — l'identifiant du jeton d'accès, celui que l'étape 4 confronte. */
  readonly jti: string;
  /**
   * RFC 8707 — la revendication `aud`, **BRUTE**. Typée `unknown` à dessein :
   * c'est l'étape 3 qui décide qu'une audience absente, multiple ou non
   * textuelle est refusée, et elle ne peut le décider que si la valeur lui
   * parvient sans avoir été « nettoyée » en chemin.
   */
  readonly audience: unknown;
  /** § 19.2 — ce que le jeton autorise EN PRINCIPE. L'étape 5 en décide EN FAIT. */
  readonly scopes: readonly OpsScope[];
}

/**
 * **ÉTAPE 2 — port déclaré, implémenté par l'émetteur (ADR 0001, ADR 0027).**
 *
 * Rend `null` pour un jeton dont la signature est fausse, dont l'`iss` n'est pas
 * l'émetteur attendu, ou qui est expiré. **Un seul `null` pour trois causes**,
 * et c'est délibéré : les distinguer dans la réponse dirait à un appelant non
 * authentifié laquelle de ses trois hypothèses est la bonne. Le § 15 veut qu'une
 * erreur dise ce qu'il faut faire ensuite — « se ré-authentifier » est la même
 * réponse dans les trois cas.
 *
 * ⚠️ **CE PORT NE DOIT JAMAIS LEVER POUR UN JETON INVALIDE.** Une exception ici
 *    remonterait en `internal` avec un identifiant de corrélation, c'est-à-dire
 *    qu'un jeton mal formé produirait un `500` là où le § 11 exige un `401`. Une
 *    exception reste le bon geste pour une panne de l'émetteur — clé absente,
 *    jeu de clés injoignable — et ce module ne la rattrape pas.
 */
export interface VerificateurDeJeton {
  verifier(porteur: string): Promise<RevendicationsDuJeton | null>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  ÉTAPE 4 — `jti` non révoqué
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **ÉTAPE 4 — port déclaré, implémenté avec la table `ops_token` (§ 12).**
 *
 * Rend `null` quand le `jti` est inconnu ou révoqué — encore une fois une seule
 * valeur pour deux causes, pour la même raison qu'à l'étape 2.
 *
 * ⚠️ **C'EST LA LECTURE QUI PORTE LA SESSION, ET ELLE EST DÉJÀ FAITE À CET
 *    INSTANT.** Le § 11 fait relire `ops_token` à l'étape 4 pour la révocation ;
 *    la session ne coûte donc aucune lecture de plus. C'est tout l'argument de
 *    l'ADR 0014 : la souveraineté du `sessionId` ne s'achète pas par un aller-
 *    retour supplémentaire, elle s'obtient en lisant la bonne colonne d'une
 *    ligne qu'on lit déjà.
 */
export interface RegistreDesJetons {
  relire(jti: string): Promise<LigneOpsTokenRelue | null>;
}

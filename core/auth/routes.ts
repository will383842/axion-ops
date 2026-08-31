/**
 * `core/auth/routes.ts` — **CE QUE L'ÉMETTEUR SERT, ET SOUS QUEL RÉGIME.**
 *
 * ═══ TROIS LECTEURS, ET AUCUN NE DOIT RÉÉCRIRE CETTE LISTE ═══
 *
 *  1. **La politique d'accès (ADR 0028).** `ops/acces/politique-de-chemins.ts`
 *     écrit noir sur blanc que sa garde « dérive des chemins que le socle SERT —
 *     lus dans `core/transport/` et `core/auth/` », et non de sa propre liste :
 *     « une garde qui se contenterait de relire `POLITIQUE_DE_CHEMINS` serait
 *     verte le jour où un chemin neuf est servi sans y être déclaré ». Ce fichier
 *     est la moitié `core/auth/` de cette source.
 *  2. **Le coffre (ADR 0027, point 7).** `ROUTES_SANS_COFFRE`
 *     (`core/vault/demarrage.ts`) vaut aujourd'hui « tout sauf `outils` » — une
 *     dérivation PAR EXCEPTION. L'ADR tranche que chaque famille de routes doit
 *     **déclarer si elle exige le coffre**, et que `ROUTES_SANS_COFFRE` se dérive
 *     de cette déclaration. {@link FAMILLES_DE_ROUTES_DE_L_EMETTEUR} porte la
 *     déclaration du côté émetteur.
 *  3. **La découverte.** Les deux documents `/.well-known/` doivent annoncer des
 *     chemins qui existent : les fabriquer à partir de cette table, plutôt que de
 *     les écrire, est ce qui empêche un client d'être envoyé sur une route morte.
 *
 * ═══ LA COUPURE QUI COMPTE, ET QUI N'EST PAS CELLE DU § 16 ═══
 *
 * Le § 16 écrit « `/console/` et **les routes d'authentification** derrière
 * Access ». Appliqué tel quel, ce serait le défaut bloquant n° 14 **une porte
 * plus loin** : `/auth/token` et `/auth/revoke` sont appelés par un PROGRAMME,
 * sans navigateur. La coupure passe donc à l'INTÉRIEUR des routes
 * d'authentification, entre ce qu'un humain atteint et ce qu'une machine
 * atteint — c'est l'écart assumé de l'ADR 0028, et {@link AppeleParDeLEmetteur}
 * le porte champ par champ plutôt qu'en prose.
 *
 * ⚠️ **CE FICHIER NE PROUVE PAS QUE LA PORTE EST POSÉE CHEZ CLOUDFLARE, ET NE
 *    PEUT PAS LE PROUVER.** Il ne fait aucun appel réseau — aucun module de ce
 *    dépôt n'en fait, par règle. Ce qu'une garde peut tenir est la cohérence
 *    entre ce que le code SERT et ce que la politique DÉCLARE. Lire cette table
 *    comme « le risque est couvert » serait raisonner sur une fausse sécurité.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  QUI APPELLE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **UN HUMAIN OU UNE MACHINE ?** Ce n'est pas une étiquette : c'est le champ
 * dont dépend le régime d'accès, et le défaut bloquant n° 14 est ce qui arrive
 * quand on ne le pose pas. Une page de connexion ne se franchit qu'avec un
 * navigateur ; un client MCP n'en a pas.
 */
export const APPELANTS_DE_L_EMETTEUR = ["humain", "machine"] as const;

export type AppeleParDeLEmetteur = (typeof APPELANTS_DE_L_EMETTEUR)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  LES FAMILLES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une famille de routes de l'émetteur, avec ce que chaque lecteur a besoin d'en
 * savoir.
 */
export interface FamilleDeRoutesDeLEmetteur {
  readonly cle: string;
  /** Les chemins EXACTS servis. Aucun joker — voir l'ADR 0028 sur le motif. */
  readonly chemins: readonly string[];
  readonly appelePar: AppeleParDeLEmetteur;
  /**
   * **CETTE FAMILLE EXIGE-T-ELLE LE COFFRE ?** (ADR 0027, point 7.)
   *
   * ⚠️ C'est une DÉCLARATION, pas une exception à une liste. `ROUTES_SANS_COFFRE`
   *    se dérive aujourd'hui par « tout sauf `outils` » ; l'ajout d'une famille
   *    ferait de cette exception une LISTE d'exceptions — la forme qui diverge.
   */
  readonly exigeLeCoffre: boolean;
  /**
   * **CETTE FAMILLE EXIGE-T-ELLE UNE AUTHENTIFICATION ?**
   *
   * ⚠️ `false` pour la découverte, et c'est un INVARIANT, pas un réglage :
   *    `/.well-known/oauth-protected-resource` est ce qui DIT au client où
   *    s'authentifier. Le mettre derrière une porte, c'est lui demander de savoir
   *    déjà ce qu'il vient apprendre.
   */
  readonly exigeUneAuthentification: boolean;
  readonly motif: string;
}

/** RFC 9728 — la découverte de la ressource protégée. */
export const CHEMIN_DECOUVERTE_DE_LA_RESSOURCE = "/.well-known/oauth-protected-resource";

/** RFC 8414 — la découverte du serveur d'autorisation. */
export const CHEMIN_DECOUVERTE_DE_L_EMETTEUR = "/.well-known/oauth-authorization-server";

/** RFC 6749 — le consentement. Un humain, un navigateur. */
export const CHEMIN_AUTORISATION = "/auth/authorize";

/** RFC 6749 — l'échange du code, puis les rafraîchissements. Une machine. */
export const CHEMIN_JETON = "/auth/token";

/** RFC 7009 — la révocation. Une machine. */
export const CHEMIN_REVOCATION = "/auth/revoke";

/**
 * LES FAMILLES DE ROUTES DE L'ÉMETTEUR.
 *
 * ⚠️ **`découverte` EST SÉPARÉE DES DEUX AUTRES, ET C'EST LA SÉPARATION QUI
 *    PORTE LA DÉCISION.** Elle est la seule des trois qui n'exige NI coffre NI
 *    authentification, parce qu'elle ne porte aucune capacité : seulement des
 *    adresses et des algorithmes, tous publics par définition. La ranger avec
 *    `/auth/token` — « ce sont toutes des routes d'authentification » — est
 *    exactement le raccourci qui produit le défaut bloquant n° 14.
 */
export const FAMILLES_DE_ROUTES_DE_L_EMETTEUR: readonly FamilleDeRoutesDeLEmetteur[] = [
  {
    cle: "découverte",
    chemins: [CHEMIN_DECOUVERTE_DE_LA_RESSOURCE, CHEMIN_DECOUVERTE_DE_L_EMETTEUR],
    appelePar: "machine",
    exigeLeCoffre: false,
    exigeUneAuthentification: false,
    motif:
      "RFC 8414 et RFC 9728 — c'est la découverte qui DIT au client où s'authentifier. Elle " +
      "doit répondre sans authentification par construction, et elle ne porte aucune " +
      "capacité. Elle n'a pas non plus besoin du coffre : rien n'y est chiffré ni signé.",
  },
  {
    cle: "consentement",
    chemins: [CHEMIN_AUTORISATION],
    appelePar: "humain",
    exigeLeCoffre: false,
    exigeUneAuthentification: true,
    motif:
      "La page où un humain s'identifie et consent. Un navigateur y est présent par " +
      "construction. Elle n'écrit aucune ligne d'`ops_token` — seulement une demande en vol —, " +
      "donc elle n'a pas besoin de la clé d'empreinte du coffre : c'est ce qui permet à un " +
      "consentement de COMMENCER pendant qu'on déverrouille.",
  },
  {
    cle: "émission",
    chemins: [CHEMIN_JETON, CHEMIN_REVOCATION],
    appelePar: "machine",
    exigeLeCoffre: true,
    exigeUneAuthentification: false,
    motif:
      "ADR 0027, point 7 — `tokenHash` est un HMAC clé PAR LE COFFRE. Sous coffre verrouillé, " +
      "ces deux routes ne répondent donc pas, et c'est cohérent avec le § 23 : l'émission ne " +
      "sert que `/api/mcp`, qui refuse tout de toute façon (étape 0, `vault_locked`). Elles " +
      "n'exigent pas de session : `/auth/token` est protégé par PKCE — le `code_verifier` " +
      "prouve que l'appelant est celui qui a commencé l'échange — et `/auth/revoke` par le " +
      "jeton présenté. Les mettre derrière une page de connexion rendrait l'échange impossible.",
  },
];

/**
 * **TOUS LES CHEMINS QUE `core/auth/` SERT.** DÉRIVÉ des familles, jamais écrit.
 *
 * C'est cette constante que la garde de cohérence de l'ADR 0028 lit : un chemin
 * servi qu'aucune entrée de `POLITIQUE_DE_CHEMINS` ne couvre est une anomalie, et
 * une entrée qui ne couvre aucun chemin servi en est une autre — une règle
 * Access posée devant rien est une règle qu'on croit active.
 */
export const CHEMINS_SERVIS_PAR_L_EMETTEUR: readonly string[] =
  FAMILLES_DE_ROUTES_DE_L_EMETTEUR.flatMap((famille) => famille.chemins);

/**
 * Les chemins de l'émetteur qui répondent SOUS COFFRE VERROUILLÉ. **Dérivé de la
 * déclaration, pas d'une exception.**
 */
export const CHEMINS_DE_L_EMETTEUR_SANS_COFFRE: readonly string[] =
  FAMILLES_DE_ROUTES_DE_L_EMETTEUR.filter((famille) => !famille.exigeLeCoffre).flatMap(
    (famille) => famille.chemins,
  );

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX DOCUMENTS DE DÉCOUVERTE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'il faut savoir pour fabriquer les deux documents. */
export interface OrigineDeLEmetteur {
  /** L'origine du SERVEUR D'AUTORISATION — `iss`. ADR 0001 : un domaine distinct. */
  readonly emetteur: string;
  /**
   * L'audience — l'URL absolue de la ressource MCP (ADR 0026).
   *
   * ⚠️ **CE N'EST PAS L'ÉMETTEUR, ET LES CONFONDRE REND L'ÉTAPE 3
   *    TAUTOLOGIQUE.** Deux valeurs, deux variables, jamais la même : tout jeton
   *    émis ici passerait, ce qui est exactement ce que l'indicateur de ressource
   *    existe pour empêcher.
   */
  readonly ressource: string;
}

/**
 * RFC 9728 — les métadonnées de la RESSOURCE protégée, servies sans
 * authentification.
 *
 * ⚠️ **`authorization_servers` EST CE QUI REND LE SOCLE DÉCOUVRABLE.** Un client
 *    MCP qui reçoit un `401` lit ce document pour savoir où aller ; s'il est
 *    derrière Access, il échoue AVANT d'avoir une page de connexion à franchir, et
 *    l'échec ne ressemble à rien de reconnaissable.
 */
export function metadonneesDeLaRessource(origine: OrigineDeLEmetteur): {
  readonly resource: string;
  readonly authorization_servers: readonly string[];
  readonly bearer_methods_supported: readonly string[];
} {
  return {
    resource: origine.ressource,
    authorization_servers: [origine.emetteur],
    // ⚠️ UNE SEULE MÉTHODE. Autoriser le jeton en paramètre de requête le ferait
    //    entrer dans les journaux d'accès de tout ce qui est sur le chemin.
    bearer_methods_supported: ["header"],
  };
}

/**
 * RFC 8414 — les métadonnées du SERVEUR D'AUTORISATION.
 *
 * ⚠️ **`code_challenge_methods_supported` NE PORTE QUE `S256`.** L'annoncer est
 *    ce qui empêche un client de tenter `plain` puis d'échouer sans comprendre :
 *    la RFC 6749 fait de l'absence de méthode un défaut à `plain`, et c'est le
 *    repli permissif que l'ADR 0027 refuse. Le document et le contrôle lisent la
 *    MÊME table (`core/auth/pkce.ts`) — jamais deux listes.
 */
export function metadonneesDeLEmetteur(
  origine: OrigineDeLEmetteur,
  methodesDeDefi: readonly string[],
  scopesEmissibles: readonly string[],
): {
  readonly issuer: string;
  readonly authorization_endpoint: string;
  readonly token_endpoint: string;
  readonly revocation_endpoint: string;
  readonly code_challenge_methods_supported: readonly string[];
  readonly grant_types_supported: readonly string[];
  readonly response_types_supported: readonly string[];
  readonly scopes_supported: readonly string[];
} {
  const base = origine.emetteur.replace(/\/+$/u, "");
  return {
    issuer: origine.emetteur,
    authorization_endpoint: `${base}${CHEMIN_AUTORISATION}`,
    token_endpoint: `${base}${CHEMIN_JETON}`,
    revocation_endpoint: `${base}${CHEMIN_REVOCATION}`,
    code_challenge_methods_supported: methodesDeDefi,
    grant_types_supported: ["authorization_code", "refresh_token"],
    response_types_supported: ["code"],
    // ⚠️ ANNONCER `ops:policy` SERAIT ANNONCER UNE CAPACITÉ QUE L'ÉMETTEUR
    //    REFUSE. La liste est celle des scopes ÉMISSIBLES, dérivée de
    //    `PORTE_PAR_LE_JETON_DAPPEL` — jamais `OPS_SCOPES` en entier.
    scopes_supported: scopesEmissibles,
  };
}

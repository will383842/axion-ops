/**
 * `core/auth/surfaces-claude.ts` — **CE QUE CLAUDE EXIGE POUR SE CONNECTER.**
 *
 * Toutes les valeurs de ce fichier viennent de la documentation d'Anthropic,
 * relevée le **2026-09-01**, et d'elle seule. Aucune n'est déduite, aucune n'est
 * recopiée du cahier des charges — c'est la leçon du scope Zoho inventé le matin
 * même : **une valeur qu'un tiers doit accepter se confronte à la documentation
 * du tiers, jamais à une spécification interne.**
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * Le § 30 du cahier laissait la voie vocale à trancher, avec un préalable :
 * « lire ce que le client et le SDK fournissent réellement, écrire le résultat
 * dans un ADR daté, trancher ». Ce fichier est la moitié « code » de ce
 * préalable ; l'ADR 0049 en est la moitié « décision ».
 *
 * ⚠️ **CE FICHIER N'IMPORTE RIEN, ET C'EST UNE CONTRAINTE.** C'est le motif de
 *    `core/chaine/modules.ts` : une table que plusieurs modules lisent ne doit
 *    dépendre de personne, sans quoi l'ordre de chargement décide de sa valeur.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LES URI DE RAPPEL — DEUX FAMILLES, ET ELLES NE SE COMPARENT PAS PAREIL
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **L'URI DE RAPPEL DES SURFACES HÉBERGÉES.** Une seule, fixe, partagée par
 * Claude.ai web, Claude Desktop, Claude mobile et Cowork — la documentation le
 * dit d'une phrase : « The same infrastructure backs Claude.ai, Claude Desktop,
 * Claude mobile, Claude Code, and Cowork. »
 *
 * ⚠️ **SANS ELLE, RIEN NE SE CONNECTE.** L'émetteur refusera le rappel après le
 *    consentement, et le message parlera d'une URI inconnue — au moment exact où
 *    l'utilisateur croit avoir fini.
 */
export const URI_DE_RAPPEL_DES_SURFACES_HEBERGEES = "https://claude.ai/api/mcp/auth_callback";

/**
 * **LES RAPPELS DE CLAUDE CODE, QUI SONT D'UNE AUTRE NATURE.** Claude Code est
 * un client natif : il écoute sur un **port éphémère** et déclare, dans son
 * Client ID Metadata Document, `http://localhost/callback` et
 * `http://127.0.0.1/callback` — **sans port**.
 *
 * ⚠️ **LE PORT DOIT ÊTRE IGNORÉ À LA COMPARAISON.** La RFC 8252 § 7.3 l'exige
 *    pour la forme littérale `127.0.0.1` ; la documentation d'Anthropic demande
 *    d'appliquer la même règle à `localhost`, bien que la RFC 8252 § 8.3 la
 *    déconseille. Une comparaison caractère par caractère échouerait à **chaque
 *    session**, avec un port différent à chaque fois — donc de façon
 *    parfaitement reproductible et parfaitement incompréhensible.
 */
export const RAPPELS_DECLARES_PAR_CLAUDE_CODE = [
  "http://localhost/callback",
  "http://127.0.0.1/callback",
] as const;

/** Le chemin qu'un rappel de boucle locale doit porter, port mis à part. */
const CHEMIN_DU_RAPPEL_LOCAL = "/callback";

/** Les hôtes de boucle locale acceptés pour un client natif. Liste CLOSE. */
const HOTES_LOCAUX_ACCEPTES = new Set(["localhost", "127.0.0.1"]);

/**
 * **UN RAPPEL DE CLIENT NATIF EST-IL ACCEPTABLE ?** Le port est ignoré ; tout le
 * reste est comparé strictement.
 *
 * Rend un MOTIF quand c'est refusé, jamais un simple `false` : un refus qui ne
 * dit pas lequel des quatre critères a manqué se paie en quart d'heure perdu.
 *
 * ⚠️ **`URL.hostname` EST LA SEULE COMPARAISON SÛRE.** Un test sur la chaîne
 *    brute accepterait `http://localhost.attaquant.test/callback`, dont l'hôte
 *    n'est pas `localhost` mais un sous-domaine d'un domaine tiers.
 */
export function motifDeRefusDUnRappelNatif(brut: string): string | null {
  let url: URL;
  try {
    url = new URL(brut);
  } catch {
    return "ce n'est pas une URL absolue";
  }
  if (url.protocol !== "http:") {
    return `le schéma est « ${url.protocol} » — un rappel de boucle locale est en http:`;
  }
  if (!HOTES_LOCAUX_ACCEPTES.has(url.hostname)) {
    return `l'hôte « ${url.hostname} » n'est pas une boucle locale acceptée`;
  }
  if (url.pathname !== CHEMIN_DU_RAPPEL_LOCAL) {
    return `le chemin est « ${url.pathname} », attendu « ${CHEMIN_DU_RAPPEL_LOCAL} »`;
  }
  if (url.search !== "" || url.hash !== "") {
    return "un rappel ne porte ni requête ni fragment";
  }
  // Le port n'est PAS examiné. C'est la règle, pas un oubli.
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA PORTÉE SANS LAQUELLE IL FAUT SE RECONNECTER SANS CESSE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **`offline_access` DOIT ÊTRE ANNONCÉE, SANS QUOI IL N'Y A PAS DE JETON DE
 * RAFRAÎCHISSEMENT.** La documentation : « Claude also appends `offline_access`
 * when your authorization server metadata lists it in `scopes_supported`, to
 * obtain a refresh token. »
 *
 * C'est une annonce qui CRÉE la capacité : Claude ne la demande que si elle
 * figure dans `scopes_supported`. Ne pas l'annoncer ne produit aucune erreur —
 * seulement une reconnexion à chaque expiration, que personne ne rattache à ce
 * fichier.
 */
export const PORTEE_DE_RAFRAICHISSEMENT = "offline_access";

/**
 * La méthode de défi PKCE, qui doit être **annoncée** dans les métadonnées sous
 * `code_challenge_methods_supported`. Claude envoie un `code_challenge` en S256
 * sur chaque autorisation, quelle que soit la voie d'enregistrement.
 */
export const METHODE_DE_DEFI_ANNONCEE = "S256";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENREGISTREMENT DU CLIENT — TROIS VOIES, ET UNE SEULE NOUS CONVIENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LES TROIS FAÇONS DONT CLAUDE PEUT OBTENIR UN `client_id`.** Une seule est
 * retenue (ADR 0049) ; les deux autres sont écrites pour que personne ne les
 * réintroduise en croyant combler un oubli.
 */
export const VOIES_D_ENREGISTREMENT = [
  {
    nom: "dcr",
    quoi: "Enregistrement dynamique — RFC 7591, endpoint `/register`",
    retenue: false,
    motif:
      "La documentation le déconseille pour un serveur à trafic soutenu : « DCR causes Claude " +
      "to register a new client on every fresh connection, which can result in very large " +
      "numbers of registered clients ». Un serveur à UN utilisateur n'a aucune raison de " +
      "porter un endpoint d'enregistrement public.",
  },
  {
    nom: "cimd",
    quoi: "Client ID Metadata Document — le `client_id` est une URL auto-hébergée",
    retenue: false,
    motif:
      "Exige d'annoncer À LA FOIS `client_id_metadata_document_supported: true` ET `none` dans " +
      "`token_endpoint_auth_methods_supported` — si l'un des deux manque, Claude retombe sur " +
      "DCR sans le dire. Deux annonces à tenir pour un bénéfice nul à notre échelle.",
  },
  {
    nom: "identifiants-statiques",
    quoi: "Un `client_id` pré-enregistré, saisi dans « Paramètres avancés » du connecteur",
    retenue: true,
    motif:
      "La documentation l'écrit pour le cas exact qui est le nôtre : « Supplying your own " +
      "pre-registered client ID (and secret, if your server requires one) as static client " +
      "credentials is a good option when you want a stable OAuth client per organization: it " +
      "avoids dynamic client registration entirely. » Aucun endpoint public en plus, aucun " +
      "client fantôme accumulé, et le secret reste optionnel.",
  },
] as const;

/** La voie retenue, DÉRIVÉE de la table. Jamais réécrite à la main. */
export function voieDEnregistrementRetenue(): (typeof VOIES_D_ENREGISTREMENT)[number] {
  const retenues = VOIES_D_ENREGISTREMENT.filter((voie) => voie.retenue);
  if (retenues.length !== 1) {
    throw new Error(
      `Exactement une voie d'enregistrement doit être retenue ; ${String(retenues.length)} le sont.`,
    );
  }
  return retenues[0]!;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE L'EXPLOITATION DOIT SAVOIR — ET QUI DÉCIDE LA POLITIQUE CLOUDFLARE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LA PLAGE DE SORTIE D'ANTHROPIC.** « Anthropic's outbound traffic to your
 * server originates from `160.79.104.0/21`. »
 *
 * ⚠️ **CE N'EST PAS QU'UNE INFORMATION : ELLE DÉCIDE LA POLITIQUE D'ACCÈS.** La
 *    documentation avertit que les requêtes de découverte partent de la MÊME
 *    plage que les appels MCP — « a WAF in front of your identity provider can
 *    break the flow even when your MCP server is reachable ». Un pare-feu posé
 *    devant l'émetteur casse la connexion en laissant croire que le problème est
 *    ailleurs, parce que le serveur MCP, lui, répond.
 */
export const PLAGE_DE_SORTIE_ANTHROPIC = "160.79.104.0/21";

/**
 * **LES CHEMINS QUI DOIVENT RESTER JOIGNABLES DEPUIS CETTE PLAGE.** Un seul
 * oublié suffit à casser la connexion, et le symptôme ne le désigne pas.
 */
export const CHEMINS_JOIGNABLES_PAR_ANTHROPIC = [
  { chemin: "/.well-known/oauth-protected-resource", pourquoi: "découverte de la ressource" },
  { chemin: "/.well-known/oauth-authorization-server", pourquoi: "découverte de l'émetteur" },
  { chemin: "/auth/token", pourquoi: "échange et rafraîchissement — serveur à serveur" },
  { chemin: "/api/mcp", pourquoi: "les appels d'outils eux-mêmes" },
] as const;

/**
 * `/auth/authorize` n'est PAS dans la liste ci-dessus, et c'est délibéré : c'est
 * le **navigateur de Will** qui s'y rend, pas Anthropic. Il peut donc vivre
 * derrière un portail d'accès — ce qui ajoute une authentification humaine
 * devant le consentement, et c'est souhaitable.
 */
export const CHEMIN_QUI_PEUT_RESTER_DERRIERE_UN_PORTAIL = "/auth/authorize";

/**
 * **LES DÉLAIS AU-DELÀ DESQUELS CLAUDE ABANDONNE.** « Claude waits up to 10
 * seconds […] and up to 30 seconds for refresh token requests. If no response
 * arrives within that window the flow is treated as a failure, even if your
 * server eventually completes the request. »
 *
 * ⚠️ Un endpoint qui répond en 9 s ne rougit nulle part et produit des échecs
 *    **intermittents** — la pire forme de panne. Le socle doit se donner une
 *    marge, pas viser le plafond.
 */
export const DELAIS_MAXIMAUX_DE_CLAUDE_MS = {
  decouverte: 10_000,
  enregistrement: 10_000,
  jeton: 10_000,
  rafraichissement: 30_000,
} as const;

/**
 * **LE TYPE DE CONTENU DU POINT DE JETON.** « Your `/token` endpoint must accept
 * `Content-Type: application/x-www-form-urlencoded` ». Le point
 * d'enregistrement, lui, parle `application/json` — **ne pas supposer que le
 * même analyseur convient aux deux.**
 */
export const TYPE_DE_CONTENU_DU_POINT_DE_JETON = "application/x-www-form-urlencoded";

/**
 * **LE CODE D'ERREUR QU'UN RAFRAÎCHISSEMENT REFUSÉ DOIT RENDRE.** RFC 6749 :
 * `invalid_grant`, et rien d'autre. « Return RFC 6749-compliant error codes
 * (`invalid_grant`, not `invalid_request` or a custom code) when a refresh token
 * is no longer valid ». Un code maison fait échouer le rattrapage de Claude au
 * lieu de déclencher une reconnexion propre.
 */
export const CODE_DE_REFUS_DE_RAFRAICHISSEMENT = "invalid_grant";

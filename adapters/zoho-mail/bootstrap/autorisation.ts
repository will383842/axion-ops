/**
 * `adapters/zoho-mail/bootstrap/autorisation.ts` — **L'URL SUR LAQUELLE WILL
 * CLIQUE, ET LA LISTE DE SCOPES QU'ON NE POURRA PLUS ÉLARGIR SANS TOUT
 * REFAIRE.**
 *
 * ═══ POURQUOI CE FICHIER EST LE PLUS COÛTEUX DU DOSSIER ═══
 *
 * Le § 27 pose la contrainte en une phrase : les scopes sont « énumérés **avant
 * le premier consentement** ». Ce n'est pas une préférence de style. Élargir un
 * scope après coup impose de redemander le consentement, donc de **rejouer
 * l'amorçage** — et le § 27 rappelle dans la même section que la régénération
 * du jeton Zoho est **PLAFONNÉE EN NOMBRE**. Une ligne oubliée ici se paie plus
 * tard sur un budget qui ne se recharge pas.
 *
 * Le § 27 mesure d'ailleurs que la v5 exigeait cette énumération et ne la
 * faisait pas : « `grep -c "ZohoMail\." rendait 0` ». Ce fichier est la réponse,
 * et il est la SEULE écriture de cette liste dans le dépôt.
 *
 * ═══ CE QUE CE FICHIER NE PROUVE PAS ═══
 *
 * ⚠️ **LES NOMS DE PARAMÈTRES ET DE SCOPES N'ONT PAS ÉTÉ CONFRONTÉS À LA
 *    DOCUMENTATION ZOHO DEPUIS CETTE MACHINE.** La règle du chantier interdit
 *    tout appel réseau sortant, et le dépôt ne porte aucune copie de cette
 *    documentation. Ce qui est écrit ici vient du § 27 pour les scopes, et de la
 *    forme OAuth 2.0 de Zoho pour les paramètres. **La mesure qui lève ce doute
 *    est nommée dans `DEPS.md`, § « Ce qui reste à vérifier ».** Elle coûte cinq
 *    minutes et elle doit être faite AVANT le premier consentement, pas après.
 *
 * ⚠️ **AUCUN IDENTIFIANT NE VIT DANS CE FICHIER.** Le `client_id` arrive en
 *    paramètre. L'URI de redirection de PRODUCTION arrive de l'environnement —
 *    ce dépôt est public, et un nom d'hôte d'exploitation n'y entre pas. Seule
 *    l'URI de boucle locale est écrite ici : elle ne désigne aucune machine.
 */

import { createHash, randomBytes } from "node:crypto";

// ═════════════════════════════════════════════════════════════════════════════
//  LA RÉGION — ELLE CHANGE L'HÔTE, DONC L'ENDPOINT, DONC TOUT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les suffixes de domaine des centres de données Zoho.
 *
 * ⚠️ **UN CLIENT OAUTH N'EST VALIDE QUE DANS SA RÉGION.** Un `client_id` créé
 *    sur `api-console.zoho.eu` et présenté à `accounts.zoho.com` est refusé —
 *    et le message de Zoho parle d'un client inconnu, pas d'une région. C'est un
 *    quart d'heure perdu pour qui ne sait pas que la liste existe.
 */
export const REGIONS_ZOHO = ["eu", "com", "in", "com.au", "jp", "ca", "sa"] as const;

export type RegionZoho = (typeof REGIONS_ZOHO)[number];

/**
 * La région du client de Will. § 27 : « Région UE : `accounts.zoho.eu`,
 * `mail.zoho.eu`, console `api-console.zoho.eu`. »
 */
export const REGION_DU_CLIENT: RegionZoho = "eu";

/** Rend `null` si la chaîne n'est pas une région connue. Aucun repli silencieux. */
export function regionDepuisLaChaine(brut: string | undefined): RegionZoho | null {
  if (brut === undefined) return null;
  return (REGIONS_ZOHO as readonly string[]).includes(brut) ? (brut as RegionZoho) : null;
}

/** L'hôte des comptes, DÉRIVÉ de la région. Jamais écrit trois fois. */
export function hoteDesComptes(region: RegionZoho): string {
  return `accounts.zoho.${region}`;
}

/** L'endpoint d'autorisation — celui que Will ouvre dans son navigateur. */
export function urlDAutorisation(region: RegionZoho): string {
  return `https://${hoteDesComptes(region)}/oauth/v2/auth`;
}

/** L'endpoint d'échange — celui que le programme appelle, jamais le navigateur. */
export function urlDesJetons(region: RegionZoho): string {
  return `https://${hoteDesComptes(region)}/oauth/v2/token`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES SCOPES — ÉNUMÉRÉS AVANT LE PREMIER CONSENTEMENT (§ 27)
// ═════════════════════════════════════════════════════════════════════════════

/** Un scope demandé, avec le motif qui le justifie et les outils qui le consomment. */
export interface ScopeDemande {
  /** Le nom exact, tel que Zoho l'attend dans le paramètre `scope`. */
  readonly nom: string;
  /** Pourquoi il est demandé. Une phrase, pour la revue de consentement. */
  readonly motif: string;
  /** Les outils du § 27 qui ne fonctionnent pas sans lui. */
  readonly outils: readonly string[];
  /** Est-il demandé au consentement ? Voir la note sur les pièces jointes. */
  readonly retenu: boolean;
}

/**
 * **LA TABLE DES SCOPES. UNE SEULE ÉCRITURE DANS LE DÉPÔT.**
 *
 * Les quatre lignes viennent du § 27, mot pour mot. La colonne `outils` est
 * dérivée du tableau des outils du même paragraphe : elle existe pour qu'une
 * revue puisse répondre à « pourquoi ce scope ? » sans relire le cahier.
 */
export const SCOPES_DU_CDC: readonly ScopeDemande[] = [
  {
    nom: "ZohoMail.accounts.READ",
    motif: "identités et alias d'expédition — tout `from` est validé contre cette liste",
    outils: ["zoho.mail.identities_list"],
    retenu: true,
  },
  {
    nom: "ZohoMail.messages.ALL",
    motif: "lire, créer un brouillon, envoyer, déplacer",
    outils: [
      "zoho.mail.search",
      "zoho.mail.read",
      "zoho.mail.triage",
      "zoho.mail.draft_create",
      "zoho.mail.send",
      "zoho.mail.reply",
      "zoho.mail.delete",
    ],
    retenu: true,
  },
  {
    nom: "ZohoMail.folders.READ",
    motif: "dossiers — le groupement du triage",
    outils: ["zoho.mail.triage"],
    retenu: true,
  },
  {
    nom: "ZohoMail.attachments.ALL",
    motif:
      "pièces jointes — § 27 : « si l'outil est retenu ». RETENU AU CONSENTEMENT, " +
      "PAS À L'USAGE : consentir sans implémenter l'outil ne coûte rien ; ne pas consentir " +
      "et en avoir besoin coûte un amorçage entier, pris sur un budget plafonné. " +
      "L'arbitrage du § 27 (« attachment_download écrit sur le disque et contredit le " +
      "§ 31 ») porte sur l'OUTIL, pas sur le scope, et il reste entier.",
    outils: ["zoho.mail.attachment_*"],
    retenu: true,
  },
];

/**
 * ⚠️ **ZOHO SÉPARE LES SCOPES PAR UNE VIRGULE, PAS PAR UNE ESPACE.** C'est un
 *    écart avec OAuth 2.0, où le séparateur est l'espace. Une liste séparée par
 *    des espaces est reçue par Zoho comme UN SEUL scope inconnu, et l'écran de
 *    consentement refuse — au moment exact où l'on croit avoir fini.
 */
export const SEPARATEUR_DE_SCOPES = ",";

/** Les scopes réellement demandés. DÉRIVÉ de la table, jamais réécrit à la main. */
export function scopesRetenus(table: readonly ScopeDemande[] = SCOPES_DU_CDC): readonly string[] {
  return table.filter((scope) => scope.retenu).map((scope) => scope.nom);
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES URI DE REDIRECTION — LE § 27 EN EXIGE DEUX, ET LA V5 ÉTAIT AU SINGULIER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'URI de boucle locale, celle de l'amorçage. **Elle est écrite ici parce
 * qu'elle ne désigne aucune machine** : `localhost` n'est un identifiant
 * d'infrastructure pour personne.
 *
 * ⚠️ **LE PORT DU SERVEUR DE RAPPEL EST DÉRIVÉ DE CETTE URI**, jamais posé à
 *    côté. Deux écritures du nombre 8787 divergeraient le jour où l'une des deux
 *    change, et le symptôme serait un navigateur qui tourne dans le vide pendant
 *    que le programme écoute ailleurs.
 */
export const URI_DE_REDIRECTION_LOCALE = "http://localhost:8787/auth/zoho/callback";

/**
 * ⚠️ **L'URI DE PRODUCTION N'EST PAS DANS CE DÉPÔT, ET C'EST UNE DÉCISION.**
 *    Elle porte un nom d'hôte d'exploitation ; ce dépôt est PUBLIC. Elle arrive
 *    par la variable ci-dessous, et le § 27 exige qu'elle ait été **déclarée à
 *    la console Zoho avant le premier consentement** — ce que Will a fait.
 */
export const VARIABLE_URI_DE_REDIRECTION = "ZOHO_REDIRECT_URI";

/** Le nom de la variable qui porte l'identifiant public du client OAuth. */
export const VARIABLE_CLIENT_ID = "ZOHO_CLIENT_ID";

/** Le nom de la variable qui porte le secret du client OAuth. Un NOM, jamais la valeur. */
export const VARIABLE_CLIENT_SECRET = "ZOHO_CLIENT_SECRET";

/** Le nom de la variable qui force une autre région que celle du § 27. */
export const VARIABLE_REGION = "ZOHO_REGION";

/** Ce qu'une URI de redirection doit satisfaire. Rend `null` si elle convient. */
export function motifDUriInvalide(brut: string): string | null {
  let analysee: URL;
  try {
    analysee = new URL(brut);
  } catch {
    return "ce n'est pas une URL absolue — Zoho compare l'URI CARACTÈRE PAR CARACTÈRE";
  }
  if (analysee.protocol !== "http:" && analysee.protocol !== "https:") {
    return `le schéma « ${analysee.protocol} » n'est pas admis : http (boucle locale) ou https`;
  }
  if (analysee.hash !== "") {
    return "un fragment (#…) ne voyage pas jusqu'au serveur et ne peut donc pas être comparé";
  }
  if (analysee.search !== "") {
    return "une chaîne de requête dans l'URI enregistrée se confond avec les paramètres du rappel";
  }
  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX PARAMÈTRES SANS LESQUELS TOUT L'ADAPTATEUR S'ÉCROULE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **`access_type=offline` ET `prompt=consent`.**
 *
 * ⚠️ Sans le premier, Zoho rend un `access_token` d'une heure et **aucun
 *    `refresh_token`**. L'adaptateur marcherait une heure, puis rendrait 401
 *    pour toujours — et la seule sortie serait un nouvel amorçage, pris sur le
 *    budget plafonné.
 *
 * ⚠️ Sans le second, Zoho **saute l'écran de consentement** quand une
 *    autorisation existe déjà pour ce couple (utilisateur, client) — et ne
 *    ré-émet alors **aucun** `refresh_token`. C'est le piège qui coûte le plus
 *    cher, parce qu'il ne se voit qu'à l'échange : la réponse est un HTTP 200
 *    sans `refresh_token`, et rien ne dit pourquoi. `jetons.ts` refuse cette
 *    réponse EN NOMMANT ces deux paramètres, pour cette raison exacte.
 */
export const ACCES_HORS_LIGNE = { cle: "access_type", valeur: "offline" } as const;

/** Voir la note ci-dessus. Le second des deux paramètres qui ne se négocient pas. */
export const CONSENTEMENT_FORCE = { cle: "prompt", valeur: "consent" } as const;

/**
 * Les paramètres que l'URL DOIT porter. **La garde dérive sa liste d'ici**, et
 * non d'une énumération recopiée dans un test : un paramètre retiré du code
 * serait alors retiré de la garde du même geste, et la garde resterait verte.
 * Ce qu'elle vérifie, c'est que chacun de ces noms **apparaît dans l'URL
 * construite** — la liste est la question, l'URL est la réponse.
 */
export const PARAMETRES_EXIGES = [
  "response_type",
  "client_id",
  "scope",
  "redirect_uri",
  ACCES_HORS_LIGNE.cle,
  CONSENTEMENT_FORCE.cle,
  "state",
] as const;

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAT ANTI-REJEU
// ═════════════════════════════════════════════════════════════════════════════

/** Longueur du `state`, en octets d'aléa. 32 octets = 256 bits. */
export const OCTETS_D_ETAT = 32;

/**
 * Fabrique un `state`. Il voyage en clair dans l'URL et revient dans le rappel :
 * il n'est pas un secret, il est un **témoin d'identité de la requête**. Sans
 * lui, n'importe quelle page ouverte dans le navigateur de Will pourrait viser
 * `http://localhost:8787/auth/zoho/callback` avec un `code` de son choix et
 * faire déposer dans le coffre un jeton d'une AUTRE boîte.
 */
export function fabriquerUnEtat(): string {
  return randomBytes(OCTETS_D_ETAT).toString("base64url");
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONSTRUCTION DE L'URL
// ═════════════════════════════════════════════════════════════════════════════

export interface DemandeDAutorisation {
  readonly region: RegionZoho;
  readonly clientId: string;
  readonly uriDeRedirection: string;
  readonly scopes: readonly string[];
  readonly etat: string;
}

/** Ce qu'un refus de construction dit. Des motifs, jamais un booléen. */
export class ErreurDAutorisation extends Error {
  public constructor(motif: string) {
    super(`URL d'autorisation Zoho impossible à construire : ${motif}`);
    this.name = "ErreurDAutorisation";
  }
}

/**
 * **CONSTRUIT L'URL SUR LAQUELLE WILL CLIQUE.** Fonction pure : aucun réseau,
 * aucune horloge, aucun `process`.
 *
 * ⚠️ **ELLE REFUSE PLUTÔT QUE DE PRODUIRE UNE URL BOITEUSE.** Une URL à laquelle
 *    il manque un scope est indiscernable d'une bonne jusqu'à l'écran de
 *    consentement ; à ce moment-là, Will a déjà cliqué, et le refus lui parle
 *    en anglais d'un `invalid_scope` qui ne nomme pas lequel.
 */
export function construireLUrlDAutorisation(demande: DemandeDAutorisation): string {
  if (demande.clientId.trim() === "") {
    throw new ErreurDAutorisation(
      `${VARIABLE_CLIENT_ID} est vide ou absente. Le client OAuth se crée sur ` +
        `« api-console.zoho.${demande.region} », en type « Server-based ».`,
    );
  }
  if (demande.etat.trim() === "") {
    throw new ErreurDAutorisation(
      "le `state` est vide : le rappel local ne pourrait plus distinguer la réponse de " +
        "Zoho d'une requête forgée par n'importe quelle page ouverte dans le navigateur.",
    );
  }
  if (demande.scopes.length === 0) {
    throw new ErreurDAutorisation(
      "aucun scope demandé. Le § 27 exige qu'ils soient ÉNUMÉRÉS AVANT le premier " +
        "consentement : les élargir ensuite impose de rejouer l'amorçage, et le nombre " +
        "d'amorçages est plafonné par Zoho.",
    );
  }
  const vus = new Set<string>();
  for (const scope of demande.scopes) {
    if (scope.trim() === "") {
      throw new ErreurDAutorisation("un scope vide fait refuser toute la demande par Zoho");
    }
    if (scope.includes(SEPARATEUR_DE_SCOPES)) {
      throw new ErreurDAutorisation(
        `le scope « ${scope} » contient le séparateur « ${SEPARATEUR_DE_SCOPES} » : ` +
          "Zoho le lirait comme deux scopes, dont au moins un inconnu.",
      );
    }
    if (vus.has(scope)) {
      throw new ErreurDAutorisation(`le scope « ${scope} » est demandé deux fois`);
    }
    vus.add(scope);
  }
  const motifUri = motifDUriInvalide(demande.uriDeRedirection);
  if (motifUri !== null) {
    throw new ErreurDAutorisation(`l'URI de redirection est refusée — ${motifUri}`);
  }

  const url = new URL(urlDAutorisation(demande.region));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", demande.clientId);
  url.searchParams.set("scope", demande.scopes.join(SEPARATEUR_DE_SCOPES));
  url.searchParams.set("redirect_uri", demande.uriDeRedirection);
  url.searchParams.set(ACCES_HORS_LIGNE.cle, ACCES_HORS_LIGNE.valeur);
  url.searchParams.set(CONSENTEMENT_FORCE.cle, CONSENTEMENT_FORCE.valeur);
  url.searchParams.set("state", demande.etat);
  return url.toString();
}

// ═════════════════════════════════════════════════════════════════════════════
//  DIRE UNE VALEUR SANS LA DIRE
// ═════════════════════════════════════════════════════════════════════════════

/** Longueur de l'empreinte affichée, en caractères hexadécimaux. */
export const LONGUEUR_D_EMPREINTE = 12;

/**
 * L'empreinte publique d'une valeur secrète — SHA-256 tronqué. **Elle ne
 * s'inverse pas**, et elle suffit à répondre à la seule question qu'on se pose
 * dans un rapport : « est-ce la même valeur qu'hier ? ».
 *
 * ⚠️ Une valeur VIDE rend une empreinte parfaitement valide, et la lire comme
 *    « le jeton est là » serait le pire des contresens. D'où le cas nommé.
 */
export function empreintePublique(valeur: string): string {
  if (valeur === "") return "vide";
  return createHash("sha256").update(valeur, "utf8").digest("hex").slice(0, LONGUEUR_D_EMPREINTE);
}

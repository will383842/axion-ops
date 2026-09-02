/**
 * `ops/zoho-mail/bootstrap/jetons.ts` — **L'ÉCHANGE `code` → JETONS, ET LA
 * LECTURE D'UNE RÉPONSE QUI MENT PAR SON CODE HTTP.**
 *
 * ═══ LE PIÈGE PRINCIPAL, ET IL N'EST PAS THÉORIQUE ═══
 *
 * ⚠️ **ZOHO REND SES ERREURS D'OAUTH AVEC UN HTTP 200.** Un code déjà consommé,
 *    une URI de redirection qui diffère d'un caractère, un client de la mauvaise
 *    région : la réponse est `200 OK`, corps `{"error":"invalid_code"}`. Un code
 *    d'échange écrit de la façon naturelle — `if (!reponse.ok) throw` — traverse
 *    ce cas sans un mot, puis échoue plus loin sur un `refresh_token`
 *    indéfini, et le message parle d'un champ manquant au lieu de la cause.
 *
 *    D'où `analyserLaReponseDeJetons()` : **le champ `error` est examiné AVANT
 *    le statut**, et le statut ne sert qu'à enrichir le message.
 *
 * ═══ LE SECOND PIÈGE — UNE RÉPONSE PARFAITE ET INUTILISABLE ═══
 *
 * ⚠️ **UNE RÉPONSE SANS `refresh_token` EST UN SUCCÈS APPARENT.** Elle porte un
 *    `access_token` valide une heure, et tout marche pendant une heure. La cause
 *    est presque toujours l'un des deux paramètres d'`autorisation.ts` —
 *    `access_type=offline` absent, ou `prompt=consent` absent alors qu'une
 *    autorisation existait déjà. Ce module **refuse** cette réponse et **nomme
 *    les deux paramètres**, parce que c'est la seule information qui manque au
 *    moment où l'on cherche.
 *
 * ═══ POURQUOI UN PORT PLUTÔT QU'UN `fetch` DIRECT ═══
 *
 * `EchangeurDeJetons` est une interface. Les gardes en montent une prise qui
 * rend des réponses fabriquées : **aucun test de ce dossier ne touche le
 * réseau**, et le cas « HTTP 200 + error » — impossible à provoquer contre le
 * vrai Zoho sans brûler un code — devient un test ordinaire.
 *
 * ⚠️ **AUCUNE VALEUR DE JETON NE SORT D'ICI PAR UN MESSAGE.** Les erreurs
 *    portent le code d'erreur de Zoho, jamais le corps ; le corps peut contenir
 *    un `access_token`, et un message d'erreur finit dans un ticket.
 */

import { empreintePublique, urlDesJetons } from "./autorisation.js";
import type { RegionZoho } from "./autorisation.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QU'ON DEMANDE, CE QU'ON REÇOIT
// ═════════════════════════════════════════════════════════════════════════════

/** Le corps de l'échange. `grant_type=authorization_code`, § OAuth 2.0. */
export interface DemandeDEchange {
  readonly region: RegionZoho;
  readonly clientId: string;
  readonly clientSecret: string;
  readonly uriDeRedirection: string;
  /** Le code à usage UNIQUE reçu par le rappel local. Durée de vie très courte. */
  readonly code: string;
}

/**
 * Les jetons, tels que ce dossier les manipule.
 *
 * ⚠️ **`accessToken` EST LÀ ET N'EST PAS DÉPOSÉ.** Il vit une heure ; le
 *    déposer au coffre y laisserait un secret périmé qu'un lecteur croirait
 *    valide. Seul le `refreshToken` est durable, et lui seul entre au coffre.
 */
export interface JetonsZoho {
  readonly refreshToken: string;
  readonly accessToken: string;
  /** Secondes de validité de l'`accessToken`, telles que Zoho les annonce. */
  readonly dureeDeVieSecondes: number | null;
  /**
   * Le domaine d'API que Zoho désigne pour ce compte. **L'adaptateur devra
   * l'utiliser tel quel** : le déduire de la région serait juste aujourd'hui et
   * faux le jour d'une migration de centre de données.
   */
  readonly domaineDApi: string | null;
  readonly typeDeJeton: string | null;
}

/** Les façons dont une réponse d'échange est refusée. Toutes NOMMÉES. */
export const REFUS_D_ECHANGE = [
  /** Le corps n'est pas un objet JSON. */
  "reponse-illisible",
  /** Zoho a nommé une erreur — quel que soit le code HTTP. */
  "erreur-annoncee-par-zoho",
  /** Statut HTTP d'échec, sans champ `error` exploitable. */
  "statut-http-en-echec",
  /** La réponse est un succès… sans le seul jeton qui compte. */
  "refresh-token-absent",
] as const;

export type RefusDEchange = (typeof REFUS_D_ECHANGE)[number];

export class ErreurDEchange extends Error {
  public readonly refus: RefusDEchange;
  /** Le code d'erreur de Zoho, quand il en donne un. JAMAIS le corps entier. */
  public readonly codeZoho: string | null;

  public constructor(refus: RefusDEchange, message: string, codeZoho: string | null = null) {
    super(message);
    this.name = "ErreurDEchange";
    this.refus = refus;
    this.codeZoho = codeZoho;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA LECTURE DE LA RÉPONSE — PURE, DONC ÉPROUVABLE SANS RÉSEAU
// ═════════════════════════════════════════════════════════════════════════════

/** Lit une chaîne d'un objet inconnu. Rend `null` sur tout ce qui n'en est pas une. */
function chaine(brut: Record<string, unknown>, cle: string): string | null {
  const valeur: unknown = brut[cle];
  return typeof valeur === "string" && valeur !== "" ? valeur : null;
}

/** Lit un nombre. Zoho rend `expires_in` tantôt en nombre, tantôt en chaîne. */
function nombre(brut: Record<string, unknown>, cle: string): number | null {
  const valeur: unknown = brut[cle];
  if (typeof valeur === "number" && Number.isFinite(valeur)) return valeur;
  if (typeof valeur === "string" && valeur.trim() !== "") {
    const converti = Number(valeur);
    return Number.isFinite(converti) ? converti : null;
  }
  return null;
}

/**
 * **LIT LA RÉPONSE DE ZOHO. LÈVE PLUTÔT QUE DE RENDRE UNE FORME BOITEUSE.**
 *
 * @param statut le code HTTP. Il ne décide PAS : voir la note d'en-tête.
 * @param brut le corps déjà décodé du JSON.
 */
export function analyserLaReponseDeJetons(statut: number, brut: unknown): JetonsZoho {
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) {
    throw new ErreurDEchange(
      "reponse-illisible",
      `L'échange a rendu un corps qui n'est pas un objet JSON (statut HTTP ${String(statut)}). ` +
        "Vérifier que l'endpoint visé est bien celui des jetons de la RÉGION du client " +
        "(§ 27 : région UE). Un endpoint d'une autre région rend une page HTML.",
    );
  }
  const objet = brut as Record<string, unknown>;

  // ── LE CHAMP `error` EST EXAMINÉ AVANT LE STATUT. Voir l'en-tête. ─────────
  const erreur = chaine(objet, "error");
  if (erreur !== null) {
    throw new ErreurDEchange(
      "erreur-annoncee-par-zoho",
      `Zoho refuse l'échange : « ${erreur} » (statut HTTP ${String(statut)} — Zoho rend ses ` +
        "erreurs d'OAuth avec un 200, le statut ne dit donc rien). Les trois causes qui " +
        "produisent ce refus, par fréquence : le code a DÉJÀ été échangé (ils sont à usage " +
        "unique et durent quelques minutes) · l'URI de redirection envoyée à l'échange " +
        "diffère d'un seul caractère de celle envoyée à l'autorisation · le client " +
        "appartient à une autre région que l'endpoint appelé.",
      erreur,
    );
  }

  if (statut < 200 || statut >= 300) {
    throw new ErreurDEchange(
      "statut-http-en-echec",
      `L'échange a rendu un statut HTTP ${String(statut)} sans champ « error » exploitable. ` +
        "Le corps n'est pas reproduit ici : il peut porter un jeton, et un message d'erreur " +
        "finit dans un ticket.",
    );
  }

  const refreshToken = chaine(objet, "refresh_token");
  if (refreshToken === null) {
    throw new ErreurDEchange(
      "refresh-token-absent",
      "L'échange a RÉUSSI et n'a rendu AUCUN « refresh_token ». C'est un succès apparent : " +
        "l'« access_token » reçu vivra une heure, puis l'adaptateur rendra 401 pour " +
        "toujours. Les deux causes, et il n'y en a guère d'autres : « access_type=offline » " +
        "manquait à l'URL d'autorisation · ou « prompt=consent » manquait ALORS QU'UNE " +
        "AUTORISATION EXISTAIT DÉJÀ pour ce couple (utilisateur, client) — Zoho saute alors " +
        "l'écran de consentement et ne ré-émet rien. Vérifier `autorisation.ts`, PUIS " +
        "recommencer : ce jeton-ci n'est pas récupérable.",
    );
  }

  const accessToken = chaine(objet, "access_token");
  if (accessToken === null) {
    throw new ErreurDEchange(
      "reponse-illisible",
      "L'échange a rendu un « refresh_token » sans « access_token ». Cette combinaison " +
        "n'est pas prévue par OAuth 2.0 : ne rien déposer au coffre, et relire la réponse.",
    );
  }

  return {
    refreshToken,
    accessToken,
    dureeDeVieSecondes: nombre(objet, "expires_in"),
    domaineDApi: chaine(objet, "api_domain"),
    typeDeJeton: chaine(objet, "token_type"),
  };
}

/**
 * Ce qu'un rapport a le droit de dire des jetons reçus. **Des longueurs, des
 * empreintes et des durées — jamais une valeur.**
 */
export function decrireLesJetons(jetons: JetonsZoho): string {
  return (
    `refresh_token : ${String(jetons.refreshToken.length)} caractère(s), empreinte publique ` +
    `${empreintePublique(jetons.refreshToken)} · access_token : ` +
    `${String(jetons.accessToken.length)} caractère(s) (NON déposé : il vit une heure) · ` +
    `expires_in : ${jetons.dureeDeVieSecondes === null ? "non annoncé" : `${String(jetons.dureeDeVieSecondes)} s`} · ` +
    `api_domain : ${jetons.domaineDApi ?? "non annoncé"} · ` +
    `token_type : ${jetons.typeDeJeton ?? "non annoncé"}`
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE PORT, ET SA PRISE RÉSEAU
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE SEUL POINT DE CE DOSSIER QUI SORT DE LA MACHINE.** Une interface, pour
 * que ce soit vrai : les gardes en montent une prise qui ne sort de rien.
 */
export interface EchangeurDeJetons {
  /** Le nom de la prise, tel que le rapport l'affiche. */
  readonly nom: string;
  echanger(demande: DemandeDEchange): Promise<JetonsZoho>;
}

/**
 * Ce que la prise réseau utilise pour parler. Passé en paramètre : c'est ce qui
 * permet d'éprouver la CONSTRUCTION de la requête — le corps, l'en-tête, la
 * méthode — sans qu'un octet quitte la machine.
 */
export type Emissaire = (
  url: string,
  options: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text: () => Promise<string> }>;

/** Le type de contenu exigé par l'endpoint de jetons. Un formulaire, pas du JSON. */
export const TYPE_DE_CONTENU = "application/x-www-form-urlencoded";

/**
 * Construit le corps de l'échange. **Fonction pure**, séparée de l'émission,
 * pour qu'une garde puisse lire chaque champ.
 *
 * ⚠️ **LE `client_secret` VOYAGE DANS LE CORPS, JAMAIS DANS L'URL.** Une URL
 *    entre dans les journaux d'accès de tout ce qu'elle traverse ; un corps de
 *    POST, non. Zoho accepte historiquement les deux ; ce dossier n'accepte que
 *    le second.
 */
export function corpsDeLEchange(demande: DemandeDEchange): URLSearchParams {
  const corps = new URLSearchParams();
  corps.set("grant_type", "authorization_code");
  corps.set("client_id", demande.clientId);
  corps.set("client_secret", demande.clientSecret);
  corps.set("redirect_uri", demande.uriDeRedirection);
  corps.set("code", demande.code);
  return corps;
}

/**
 * La prise réseau. **Elle n'est construite que par le point d'entrée**, et
 * jamais par un test.
 */
export function echangeurHttps(emettre: Emissaire): EchangeurDeJetons {
  return {
    nom: "https (fetch)",
    async echanger(demande: DemandeDEchange): Promise<JetonsZoho> {
      const reponse = await emettre(urlDesJetons(demande.region), {
        method: "POST",
        headers: {
          "content-type": TYPE_DE_CONTENU,
          accept: "application/json",
        },
        body: corpsDeLEchange(demande).toString(),
      });

      const texte = await reponse.text();
      let decode: unknown;
      try {
        decode = JSON.parse(texte) as unknown;
      } catch {
        // ⚠️ LE TEXTE N'EST PAS REPRODUIT. Une page d'erreur Zoho est inoffensive,
        //    mais rien ne garantit qu'un corps mal formé ne porte pas un jeton.
        throw new ErreurDEchange(
          "reponse-illisible",
          `L'échange a rendu un corps qui n'est pas du JSON (statut HTTP ` +
            `${String(reponse.status)}, ${String(texte.length)} caractère(s)). Le corps n'est ` +
            "pas reproduit. Vérifier l'endpoint et la région.",
        );
      }
      return analyserLaReponseDeJetons(reponse.status, decode);
    },
  };
}

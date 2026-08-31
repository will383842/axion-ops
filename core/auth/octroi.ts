/**
 * `core/auth/octroi.ts` — **L'ÉMETTEUR DE JETONS. LE BLOCAGE N° 1 DE L'AUDIT,
 * FERMÉ ICI.**
 *
 * ═══ CE QUE CE MODULE EST ═══
 *
 * Le serveur d'autorisation minimal de l'ADR 0001, option A : intégré, servi sur
 * `/auth/*`, séparé LOGIQUEMENT du resource server. Il émet, il fait tourner, il
 * révoque. **Il ne valide jamais un appel d'outil** — c'est l'affaire des étapes
 * 2 à 5, et les handlers d'émission et de validation ne partagent aucune
 * fonction de décision.
 *
 * ═══ LES CINQ GESTES, ET CE QUE CHACUN REFUSE ═══
 *
 *  1. {@link EmetteurDeJetons.preparerUneAutorisation} — le consentement. Refuse
 *     un principal que le journal n'accepterait pas, un scope non émissible, une
 *     méthode de défi autre que `S256`, une audience mal formée ou étrangère ;
 *  2. {@link EmetteurDeJetons.echangerLeCode} — PKCE. **Frappe la session**, une
 *     fois, ici et nulle part ailleurs ;
 *  3. {@link EmetteurDeJetons.rafraichir} — rotation. **Propage** la session,
 *     jamais n'en frappe une ; détecte le rejeu et révoque toute la chaîne ;
 *  4. {@link EmetteurDeJetons.revoquer} — RFC 7009 ;
 *  5. {@link EmetteurDeJetons.relirePourLEtape4} — ce que le transport
 *     appellera à l'étape 4. **Il relit, il ne décide pas de l'appel.**
 *
 * ═══ LA FRAPPE DE LA SESSION, ET LA LISTE QUI DOIT RESTER COURTE ═══
 *
 * ⚠️ **CE MODULE NE FRAPPE PAS UNE SESSION EN IMPORTANT `core/identite/` — IL
 *    REÇOIT LA FABRIQUE.** C'est la seule forme compatible avec la garde G2 de
 *    l'ADR 0014, qui refuse à tout module LIVRÉ hors de `core/identite/`
 *    d'importer une VALEUR de ce dossier s'il ne figure pas dans
 *    `FRAPPEURS_DE_SESSION`. Cette liste vit dans `core/identite/session.ts` —
 *    dossier d'un autre périmètre — et elle nomme aujourd'hui trois modules dont
 *    aucun n'est celui-ci.
 *
 *    ⚠️ **ET C'EST UN TROU DE LA GARDE G2, MESURÉ ICI, PAS UNE COMMODITÉ.** G2
 *       lit le graphe d'IMPORTS ; une fabrique INJECTÉE frappe sans importer, et
 *       lui échappe donc entièrement. `core/auth/emetteur.temoin.spec.ts` porte la
 *       garde jumelle qui manquait : elle balaie les modules LIVRÉS à la
 *       recherche d'un APPEL de `pourUnOctroi(`, annonce les comptes, et rougit
 *       sur tout appelant qui n'est ni dans `FRAPPEURS_DE_SESSION` ni dans
 *       {@link FRAPPEURS_PAR_INJECTION}.
 *
 * ═══ CE QUI N'EST PAS ICI, ET NE DOIT PAS Y VENIR ═══
 *
 * ⚠️ **JAMAIS DE PASS-THROUGH (§ 11).** Le jeton reçu n'est jamais transmis en
 *    aval, et ce n'est pas qu'une règle : `ToolContext` ne porte AUCUN champ de
 *    jeton, et sa totalité est tenue par le compilateur
 *    (`STATUT_DES_CANAUX_DE_CONTEXTE`). Rien, ici, ne construit un `ToolContext`.
 *
 * ⚠️ **AUCUNE VÉRIFICATION DE SESSION DE CONSOLE.** `preparerUneAutorisation`
 *    reçoit un principal DÉJÀ authentifié : l'authentification de l'humain est
 *    portée par la session de console et par Access (§ 21, ADR 0028), en amont.
 *    Ce module ne doit pas s'en mêler — un émetteur qui vérifierait lui aussi
 *    fabriquerait une seconde autorité, et c'est la seconde qui diverge.
 */

import { randomBytes } from "node:crypto";

import { APPEL_STEPS } from "../types.js";
import type { OpsScope } from "../types.js";
import type { FabriqueSessionId, SessionId } from "../identite/session.js";
import type { Octroi, PrincipalEmis } from "./contrat.js";
import { comparerLAudienceDuJeton, verifierLaFormeDeLAudience } from "./audience.js";
import type { CoffreEmpreinteDeJeton } from "./empreinte.js";
import { creerCalculEmpreinteDeJeton } from "./empreinte.js";
import { GENRES_DE_JETON } from "./depot.js";
import type { DepotDeDemandes, DepotDeJetons, GenreDeJeton, LigneOpsToken } from "./depot.js";
import {
  DUREE_DU_CODE_DAUTORISATION_MS,
  DUREE_DU_JETON_DACCES_MS,
  DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS,
} from "./durees.js";
import type { BornesDIdentifiantDuJournal } from "./principal.js";
import { admettreUnPrincipal } from "./principal.js";
import { verdictDeLaMethodeDeDefi, verifierLeDefi } from "./pkce.js";
import { ErreurScopeNonEmissible, verdictDeScopesDemandes } from "./scopes.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA LISTE JUMELLE DE `FRAPPEURS_DE_SESSION`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LES MODULES LIVRÉS QUI FRAPPENT UNE SESSION SANS IMPORTER LA FABRIQUE.**
 *
 * ⚠️ **CETTE LISTE NE DEVRAIT PAS EXISTER, ET SON EXISTENCE EST LE CONSTAT.**
 *    `FRAPPEURS_DE_SESSION` (`core/identite/session.ts`) est la liste de
 *    référence, et la garde G2 la tient par le graphe d'IMPORTS. Un module qui
 *    reçoit la fabrique en dépendance frappe sans importer : il n'apparaît dans
 *    aucun import, donc dans aucun verdict de G2, et la liste de référence reste
 *    verte en ne le voyant pas. C'est exactement la forme de défaut que le
 *    registre des coutures existe pour attraper — une décision vraie dans la
 *    prose et fausse dans le graphe.
 *
 *    Les deux listes doivent FUSIONNER le jour où `core/identite/session.ts`
 *    sera ouvert : `FRAPPEURS_DE_SESSION` gagnera `core/auth/octroi.ts`, et
 *    celle-ci disparaîtra. Elle est écrite ici, dans le seul périmètre qui
 *    pouvait la poser, avec sa garde — pas dans un commentaire.
 */
export const FRAPPEURS_PAR_INJECTION = ["core/auth/octroi.ts"] as const;

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE L'ÉMETTEUR REÇOIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le POUVOIR DE FRAPPER, réduit à sa plus petite surface.
 *
 * ⚠️ **`Pick<…, "pourUnOctroi">` N'EST PAS UNE COQUETTERIE DE TYPAGE.**
 *    `FabriqueSessionId` porte trois méthodes, et deux d'entre elles n'ont rien
 *    à faire ici : `pourCetteExecutionDuDemon()` ouvrirait une session de démon
 *    depuis l'émetteur, et `relireDepuisLeSocle()` est le geste du transport à
 *    l'étape 4 (`APPELANTS_DE_LA_RELECTURE` ne nomme pas ce module). Demander
 *    moins que l'interface entière est ce qui rend l'abus INCONSTRUCTIBLE plutôt
 *    qu'interdit — et c'est ce que la signature montre à une revue.
 */
export type FabriqueDOctroi = Pick<FabriqueSessionId, "pourUnOctroi">;

/** Ce dont l'émetteur a besoin. Tout est injecté ; rien n'est lu du monde. */
export interface DependancesDeLEmetteur {
  readonly depot: DepotDeJetons;
  readonly demandes: DepotDeDemandes;
  /** Le coffre. `/auth/token` ne répond pas sans lui (ADR 0027, point 7). */
  readonly coffre: CoffreEmpreinteDeJeton;
  readonly sessions: FabriqueDOctroi;
  /**
   * La borne de `ops_audit.principal`, dérivée de `FORMES` (ADR 0029).
   *
   * ⚠️ OPTIONNELLE, ET SON DÉFAUT EST LA VRAIE FONCTION SŒUR
   *    (`bornesDIdentifiantDuJournal`). La racine de composition n'a donc RIEN à
   *    câbler ici, et c'est voulu : un port obligatoire aurait laissé chaque
   *    montage libre d'y brancher un chiffre écrit à la main — exactement ce que
   *    l'ADR 0029 interdit. Il reste injectable pour que la garde puisse
   *    confronter la borne à une mesure indépendante.
   */
  readonly bornes?: BornesDIdentifiantDuJournal;
  /**
   * L'audience de CE socle — la valeur d'`OPS_RESOURCE_INDICATOR`.
   *
   * ⚠️ Elle est confrontée à sa FORME au montage : un émetteur monté sur une
   *    audience mal formée écrirait des colonnes `ops_token.audience` qui ne
   *    seront JAMAIS réécrites (ADR 0026, conséquences acceptées).
   */
  readonly audience: string;
  /** L'horloge. Injectée : un test de durée qui attend une heure n'est pas un test. */
  readonly maintenant: () => Date;
  /**
   * La source d'aléa des jetons et des codes. Injectable pour l'épreuve
   * SEULEMENT.
   *
   * ⚠️ **LE DÉFAUT EST `randomBytes`, ET L'ÉPREUVE NE DOIT JAMAIS ÊTRE LE
   *    CHEMIN ORDINAIRE.** Une source prévisible rend tous les jetons devinables ;
   *    c'est le seul paramètre de ce module dont un mauvais réglage ne se voit
   *    nulle part. Il porte donc son avertissement, et `octroi.spec.ts` mesure
   *    que le défaut produit des valeurs distinctes et de la bonne longueur.
   */
  readonly alea?: (octets: number) => string;
}

/** L'audience du montage est mal formée : l'émetteur ne se monte pas. */
export class ErreurAudienceDeMontage extends Error {
  public constructor(anomalies: readonly string[]) {
    super(
      "L'émetteur ne se monte pas : l'audience configurée n'a pas la forme exigée (ADR 0026). " +
        `${anomalies.join(" · ")} Corriger la variable, puis redémarrer — une audience mal ` +
        "formée s'écrirait dans `ops_token.audience`, qui n'est JAMAIS réécrite.",
    );
    this.name = "ErreurAudienceDeMontage";
  }
}

/**
 * Un refus d'octroi, avec sa cause NOMMÉE.
 *
 * ⚠️ **LA PROPRIÉTÉ S'APPELLE `causeDuRefus`, ET PAS `cause`.** `Error.cause`
 *    existe depuis ES2022 et porte l'erreur SOUS-JACENTE ; y ranger une chaîne de
 *    vocabulaire ferait que deux lecteurs — un journal d'exécution et le comptage
 *    du § 24 — liraient la même propriété en attendant deux choses.
 */
export class ErreurDOctroi extends Error {
  public readonly causeDuRefus: CauseDeRefusDOctroi;

  public constructor(cause: CauseDeRefusDOctroi, motif: string) {
    super(`Octroi refusé (${cause}) : ${motif}`);
    this.name = "ErreurDOctroi";
    this.causeDuRefus = cause;
  }
}

/**
 * Les causes de refus d'octroi, NOMMÉES SÉPARÉMENT pour être comptées
 * séparément (§ 24). « Code inconnu » est un client qui rejoue ; « défi
 * non concordant » est un client intercepté ; les deux appellent des gestes
 * opposés, et un compteur unique les confondrait.
 */
export const CAUSES_DE_REFUS_DOCTROI = [
  "code-inconnu-ou-consommé",
  "code-expiré",
  "pkce-refusé",
  "audience-refusée",
  "rafraîchissement-inconnu",
  "rafraîchissement-expiré",
  "rejeu-détecté",
] as const;

export type CauseDeRefusDOctroi = (typeof CAUSES_DE_REFUS_DOCTROI)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  LE JETON EN CLAIR — UNE SEULE FOIS
// ═════════════════════════════════════════════════════════════════════════════

/** Une seconde révélation du même jeton en clair a été demandée. */
export class ErreurJetonDejaRevele extends Error {
  public constructor(genre: GenreDeJeton) {
    super(
      `Le jeton « ${genre} » a déjà été révélé. § 19.1 — le jeton en clair ne s'affiche ` +
        "QU'UNE SEULE FOIS. Il n'est stocké nulle part : seule son empreinte l'est, et " +
        "l'empreinte ne le rend pas. Réémettre si la valeur a été perdue.",
    );
    this.name = "ErreurJetonDejaRevele";
  }
}

/**
 * **UN JETON ÉMIS, DONT LA VALEUR EN CLAIR NE SORT QU'UNE FOIS.**
 *
 * ⚠️ **« UNE SEULE FOIS » EST UN MÉCANISME, PAS UNE PROMESSE.** Rendre une
 *    propriété `jetonEnClair` aurait laissé la phrase du § 19.1 à la discipline
 *    de chaque appelant — et un appelant qui la relit deux fois ne se distingue
 *    d'un appelant correct par rien. {@link JetonEmis.reveler} vide la valeur en
 *    la rendant : le second appel LÈVE, et le premier appelant est le seul à
 *    l'avoir eue. C'est ce qui rend la règle éprouvable.
 */
export interface JetonEmis {
  readonly jti: string;
  readonly genre: GenreDeJeton;
  readonly expiresAt: Date;
  /** @throws {ErreurJetonDejaRevele} au second appel. */
  reveler(): string;
}

function jetonEmis(genre: GenreDeJeton, jti: string, expiresAt: Date, clair: string): JetonEmis {
  let restant: string | null = clair;
  return {
    jti,
    genre,
    expiresAt,
    reveler(): string {
      if (restant === null) throw new ErreurJetonDejaRevele(genre);
      const valeur = restant;
      restant = null;
      return valeur;
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE L'ÉMETTEUR REND
// ═════════════════════════════════════════════════════════════════════════════

/** Une demande d'autorisation acceptée, prête à être échangée. */
export interface AutorisationPreparee {
  readonly code: string;
  readonly expiresAt: Date;
  /** Les scopes retenus, tous émissibles. */
  readonly scopes: readonly OpsScope[];
}

/** Le résultat d'un PREMIER octroi — celui qui frappe la session. */
export interface ResultatDePremierOctroi {
  readonly octroi: Octroi;
  readonly acces: JetonEmis;
  readonly rafraichissement: JetonEmis;
}

/**
 * Le résultat d'un RAFRAÎCHISSEMENT.
 *
 * ⚠️ **IL NE PORTE PAS D'`Octroi`, ET C'EST LA DÉCISION.** `Octroi.sessionId` est
 *    une {@link SessionId} — un type que seule `relireDepuisLeSocle()` sait
 *    reconstruire depuis une colonne, et ce geste appartient au transport. Un
 *    rafraîchissement PROPAGE la colonne texte, il ne la retype pas : c'est ce
 *    qui rend mécaniquement impossible qu'il ouvre une session neuve.
 */
export interface ResultatDeRafraichissement {
  readonly grantId: string;
  /** La colonne `ops_token.sessionId`, INCHANGÉE. Du texte, comme en base. */
  readonly sessionIdColonne: string;
  readonly acces: JetonEmis;
  readonly rafraichissement: JetonEmis;
  /** Le `jti` du refresh qui vient d'être révoqué par la rotation. */
  readonly ancienRafraichissementRevoque: string;
}

/**
 * Les causes de refus de l'étape 4, nommées pour le § 24.
 *
 * ⚠️ **IL N'Y A PAS DE CAUSE « MAUVAIS GENRE », ET C'EST UNE MESURE, PAS UN
 *    OUBLI.** Une première écriture en portait une — « un jeton de
 *    rafraîchissement présenté à la ressource ». Elle s'est révélée
 *    INATTEIGNABLE : l'empreinte est séparée par genre
 *    (`core/auth/empreinte.ts`), donc un refresh présenté ici ne produit pas
 *    l'empreinte sous laquelle il a été écrit, et la lecture ne trouve
 *    simplement RIEN. Le refus est `jeton-inconnu`, et il est juste.
 *
 *    La cause a été RETIRÉE plutôt que gardée « au cas où » : une cause déclarée
 *    qu'aucun chemin ne produit est un compteur du § 24 qui ne se remplit jamais,
 *    c'est-à-dire une métrique qu'on croit surveiller. `core/auth/octroi.spec.ts`
 *    exige que les quatre restantes soient TOUTES atteintes, et un témoin propre
 *    mesure le cas du refresh présenté à la ressource.
 */
export const CAUSES_DE_REFUS_A_L_ETAPE_4 = [
  "jeton-inconnu",
  "jeton-révoqué",
  "jeton-expiré",
  "audience-étrangère",
] as const;

export type CauseDeRefusALEtape4 = (typeof CAUSES_DE_REFUS_A_L_ETAPE_4)[number];

/**
 * Le verdict que le transport lira à l'étape 4.
 *
 * ⚠️ **AUCUN `ErrorCode` N'EST RENDU, ET CE N'EST PAS UN OUBLI.** `APPEL_STEPS`
 *    range les étapes 2 à 4 en `httpSeul: true` avec `refus: null` : elles
 *    refusent au niveau du transport, avec un statut HTTP, et n'ont pas de code
 *    JSON-RPC. {@link VerdictDeLEtape4.statutHttp} est donc **DÉRIVÉ
 *    d'`APPEL_STEPS`**, jamais écrit — un `401` en dur ici serait une seconde
 *    source de vérité pour un chiffre qui vit déjà au § 11.
 *
 * ⚠️ **LA CAUSE, ELLE, EST RENDUE — ADR 0030.** Les cinq causes partagent le même
 *    statut et appellent des gestes très différents : un jeton expiré se
 *    rafraîchit, un jeton révoqué se réobtient par un consentement, une audience
 *    étrangère veut dire que le client parle au mauvais socle. Un compteur qui ne
 *    les sépare pas ne distingue pas une panne d'une attaque.
 */
export interface VerdictDeLEtape4 {
  readonly admis: boolean;
  readonly cause: CauseDeRefusALEtape4 | null;
  readonly statutHttp: number;
  readonly motif: string;
  /** La ligne relue, quand elle existe. `null` sinon. */
  readonly ligne: LigneOpsToken | null;
}

/**
 * Le statut de l'étape 4, DÉRIVÉ du § 11 — jamais écrit.
 *
 * ⚠️ **AUCUN REPLI. UN `?? 401` AURAIT RENDU LA DÉRIVATION VACUEUSE :** elle
 *    aurait donné la bonne valeur même en ne lisant plus rien, et le jour où la
 *    clé `revocation` change de nom, personne n'aurait su que le chiffre ne vient
 *    plus du § 11. La dérivation qui échoue est la seule qui prouve qu'elle a lu.
 */
const ETAPE_DE_REVOCATION = APPEL_STEPS.find((etape) => etape.cle === "revocation");
if (ETAPE_DE_REVOCATION === undefined) {
  throw new Error(
    "core/auth/octroi : aucune étape « revocation » dans APPEL_STEPS (§ 11). Le statut HTTP de " +
      "l'étape 4 se DÉRIVE de cette table ; l'écrire en dur en ferait une seconde vérité.",
  );
}
const STATUT_DE_L_ETAPE_4 = ETAPE_DE_REVOCATION.statutHttp;

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉMETTEUR
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que `/auth/authorize` reçoit d'un humain déjà authentifié. */
export interface DemandeDeConsentement {
  /** Le principal, tel que la session de console l'a établi. */
  readonly principal: string;
  readonly scopesDemandes: readonly string[];
  /** RFC 8707 — les indicateurs de ressource demandés. */
  readonly indicateursDeRessource: readonly string[];
  readonly defi: string;
  readonly methodeDeDefi: string | undefined;
}

export interface EmetteurDeJetons {
  preparerUneAutorisation(demande: DemandeDeConsentement): Promise<AutorisationPreparee>;
  echangerLeCode(code: string, verificateur: string): Promise<ResultatDePremierOctroi>;
  rafraichir(rafraichissementEnClair: string): Promise<ResultatDeRafraichissement>;
  /**
   * RFC 7009, avec `token_type_hint`. Rend `true` si une ligne a été trouvée —
   * la RFC veut un `200` de toute façon, pour ne pas faire du point d'entrée un
   * oracle d'existence de jetons.
   */
  revoquer(jetonEnClair: string, genre: GenreDeJeton): Promise<boolean>;
  /**
   * RFC 7009 **SANS** `token_type_hint` — le cas ordinaire, puisque l'indice est
   * OPTIONNEL dans la RFC.
   *
   * ⚠️ **CETTE MÉTHODE EXISTE PARCE QUE LA SÉPARATION DE DOMAINE PAR GENRE LA
   *    REND NÉCESSAIRE, ET C'EST UNE CONSÉQUENCE MESURÉE.** `tokenHash` est clé
   *    ET séparé par genre : chercher un jeton sous le mauvais genre ne rend
   *    RIEN. Un point d'entrée qui supposerait `access` répondrait donc `200` à
   *    la révocation d'un refresh **sans rien révoquer** — un client croirait
   *    avoir rendu son jeton, et le jeton vivrait trente jours de plus. Le
   *    silence de la RFC (« le serveur SHOULD étendre sa recherche aux autres
   *    types ») deviendrait ici une panne muette.
   *
   *    Elle essaie donc TOUS les genres et rend le COMPTE de lignes révoquées.
   *    Un compte, et non un booléen : c'est ce qui distingue « rien trouvé » de
   *    « trouvé et révoqué », sans que l'appelant HTTP ait à le dire au client.
   */
  revoquerSansIndice(jetonEnClair: string): Promise<number>;
  relirePourLEtape4(accesEnClair: string): Promise<VerdictDeLEtape4>;
}

/** Longueur en octets de l'aléa d'un jeton. 32 octets = 256 bits, comme une session. */
export const OCTETS_DUN_JETON = 32;

/**
 * MONTE L'ÉMETTEUR.
 *
 * @throws {ErreurAudienceDeMontage} si l'audience configurée n'a pas la forme.
 */
export function creerEmetteurDeJetons(deps: DependancesDeLEmetteur): EmetteurDeJetons {
  // ── Le montage confronte l'audience AVANT d'émettre quoi que ce soit ────────
  const forme = verifierLaFormeDeLAudience(deps.audience);
  if (!forme.conforme) throw new ErreurAudienceDeMontage(forme.anomalies);

  const empreintes = creerCalculEmpreinteDeJeton(deps.coffre);
  const alea = deps.alea ?? ((octets: number): string => randomBytes(octets).toString("base64url"));

  /** Écrit une ligne `ops_token` et rend le jeton, révélable une seule fois. */
  async function emettre(
    genre: GenreDeJeton,
    octroi: { grantId: string; sessionIdColonne: string; principal: string },
    scopes: readonly OpsScope[],
    dureeMs: number,
  ): Promise<JetonEmis> {
    const clair = alea(OCTETS_DUN_JETON);
    const debut = deps.maintenant();
    const ligne: LigneOpsToken = {
      jti: alea(16),
      // ⚠️ L'EMPREINTE EST CALCULÉE ICI, ET LE CLAIR NE VA NULLE PART AILLEURS.
      //    Il n'est ni journalisé, ni rendu par le dépôt, ni conservé après la
      //    révélation. C'est la seule façon de tenir « une seule fois ».
      tokenHash: await empreintes.calculer(genre, clair),
      principal: octroi.principal,
      kind: genre,
      scopes: [...scopes],
      audience: deps.audience,
      grantId: octroi.grantId,
      sessionId: octroi.sessionIdColonne,
      issuedAt: debut,
      expiresAt: new Date(debut.getTime() + dureeMs),
      revokedAt: null,
      lastUsedAt: null,
    };
    await deps.depot.inserer(ligne);
    return jetonEmis(genre, ligne.jti, ligne.expiresAt, clair);
  }

  /** Émet la PAIRE — accès et rafraîchissement — d'un même octroi. */
  async function emettreLaPaire(
    octroi: { grantId: string; sessionIdColonne: string; principal: string },
    scopes: readonly OpsScope[],
  ): Promise<{ acces: JetonEmis; rafraichissement: JetonEmis }> {
    return {
      acces: await emettre("access", octroi, scopes, DUREE_DU_JETON_DACCES_MS),
      rafraichissement: await emettre(
        "refresh",
        octroi,
        scopes,
        DUREE_DU_JETON_DE_RAFRAICHISSEMENT_MS,
      ),
    };
  }

  return {
    async preparerUneAutorisation(demande: DemandeDeConsentement): Promise<AutorisationPreparee> {
      // 1 · Le PRINCIPAL, borné À LA SOURCE (ADR 0029). Lève si le journal ne
      //     l'accepterait pas : un jeton qui porterait ce principal ferait
      //     perdre la LIGNE de chacun de ses appels.
      const principal: PrincipalEmis = admettreUnPrincipal(demande.principal, deps.bornes);

      // 2 · Les SCOPES. `ops:policy` est refusé ICI — l'étape 5 refuserait un
      //     appel, l'émetteur refuse que le jeton existe (§ 19.2, ADR 0027).
      const verdictScopes = verdictDeScopesDemandes(demande.scopesDemandes);
      if (verdictScopes.refuses.length > 0 || verdictScopes.inconnus.length > 0) {
        throw new ErreurScopeNonEmissible(verdictScopes);
      }

      // 3 · L'AUDIENCE demandée. Égalité EXACTE, un seul indicateur (ADR 0026).
      const verdictAudience = comparerLAudienceDuJeton(
        demande.indicateursDeRessource,
        deps.audience,
      );
      if (!verdictAudience.admise) {
        throw new ErreurDOctroi("audience-refusée", verdictAudience.motif);
      }

      // 4 · PKCE. La MÉTHODE se juge dès l'autorisation : accepter un défi
      //     `plain` ici pour le refuser à l'échange ferait perdre à l'humain son
      //     consentement pour une raison qu'il apprendrait trop tard. Le
      //     vérificateur, lui, n'existe pas encore — il vient à l'échange.
      const verdictMethode = verdictDeLaMethodeDeDefi(demande.methodeDeDefi);
      if (verdictMethode !== null) throw new ErreurDOctroi("pkce-refusé", verdictMethode.motif);

      const debut = deps.maintenant();
      const preparee: AutorisationPreparee = {
        code: alea(OCTETS_DUN_JETON),
        expiresAt: new Date(debut.getTime() + DUREE_DU_CODE_DAUTORISATION_MS),
        scopes: verdictScopes.accordes,
      };
      await deps.demandes.deposer({
        code: preparee.code,
        principal,
        scopesDemandes: preparee.scopes,
        audience: deps.audience,
        defi: demande.defi,
        expiresAt: preparee.expiresAt,
      });
      return preparee;
    },

    async echangerLeCode(code: string, verificateur: string): Promise<ResultatDePremierOctroi> {
      // ⚠️ CONSOMMER, PAS LIRE. Le code est retiré du magasin AVANT tout
      //    contrôle : un vérificateur faux ne doit pas laisser le code
      //    réessayable, sinon PKCE devient une énumération.
      const demande = await deps.demandes.consommer(code);
      if (demande === null) {
        throw new ErreurDOctroi(
          "code-inconnu-ou-consommé",
          "ce code d'autorisation n'existe pas ou a déjà servi. Recommencer à /auth/authorize.",
        );
      }

      const instant = deps.maintenant();
      if (demande.expiresAt.getTime() <= instant.getTime()) {
        throw new ErreurDOctroi(
          "code-expiré",
          "ce code d'autorisation a expiré. Recommencer à /auth/authorize.",
        );
      }

      const verdict = verifierLeDefi(verificateur, demande.defi, "S256");
      if (!verdict.admis) throw new ErreurDOctroi("pkce-refusé", verdict.motif);

      // ⚠️ **LA SEULE FRAPPE DE SESSION DE TOUT LE CÔTÉ HTTP.** Une par OCTROI,
      //    c'est-à-dire une par consentement humain — jamais une par jeton, et
      //    jamais au rafraîchissement.
      const sessionId: SessionId = deps.sessions.pourUnOctroi();
      const grantId = alea(16);

      // ⚠️ **LE PRINCIPAL EST RÉADMIS, PAS RETYPÉ.** Il a déjà été confronté à la
      //    préparation, et une conversion forcée aurait suffi. Elle aurait aussi
      //    ouvert un SECOND site de fabrication de `PrincipalEmis` hors de
      //    `core/auth/principal.ts` — c'est-à-dire retiré à la garde de texte le
      //    seul motif qu'elle sait chercher. Le coût est une confrontation de
      //    plus sur une chaîne courte ; le bénéfice est qu'il n'existe qu'UN
      //    chemin, et qu'une revue n'a qu'un endroit à lire.
      const principal: PrincipalEmis = admettreUnPrincipal(demande.principal, deps.bornes);

      const paire = await emettreLaPaire(
        { grantId, sessionIdColonne: sessionId, principal },
        demande.scopesDemandes,
      );

      return {
        octroi: {
          grantId,
          sessionId,
          principal,
          scopes: demande.scopesDemandes,
        },
        acces: paire.acces,
        rafraichissement: paire.rafraichissement,
      };
    },

    async rafraichir(rafraichissementEnClair: string): Promise<ResultatDeRafraichissement> {
      const empreinte = await empreintes.calculer("refresh", rafraichissementEnClair);
      const ligne = await deps.depot.parEmpreinte(empreinte);
      const instant = deps.maintenant();

      if (ligne === null || ligne.kind !== "refresh") {
        throw new ErreurDOctroi(
          "rafraîchissement-inconnu",
          "ce jeton de rafraîchissement est inconnu. Recommencer à /auth/authorize.",
        );
      }

      // ⚠️ **LE REJEU RÉVOQUE TOUTE LA CHAÎNE (ADR 0027, point 3).** Un refresh
      //    déjà révoqué qui se représente n'a que deux explications — le client
      //    rejoue, ou un attaquant s'est intercalé — et RIEN ne permet de les
      //    distinguer. Le coût de ce choix est un client à réauthentifier ; le
      //    coût de l'autre serait un jeton volé valide trente jours.
      if (ligne.revokedAt !== null) {
        const revoques = await deps.depot.revoquerLaChaine(ligne.grantId, instant);
        throw new ErreurDOctroi(
          "rejeu-détecté",
          `un jeton de rafraîchissement DÉJÀ RÉVOQUÉ a été présenté. Toute la chaîne d'octroi ` +
            `est révoquée (${String(revoques)} jeton(s) encore vivant(s) au moment du rejeu) : ` +
            "un rejeu de client et une interception ne se distinguent pas, et la lecture sûre " +
            "est la seconde. Repasser par /auth/authorize.",
        );
      }

      if (ligne.expiresAt.getTime() <= instant.getTime()) {
        throw new ErreurDOctroi(
          "rafraîchissement-expiré",
          "ce jeton de rafraîchissement a expiré (§ 19.1 — trente jours). Repasser par " +
            "/auth/authorize.",
        );
      }

      // Rotation : l'ancien est révoqué AVANT que le neuf existe. L'ordre
      // inverse laisserait, sur une panne entre les deux, DEUX refresh vivants
      // pour un octroi — c'est-à-dire la situation que la détection de rejeu
      // existe pour reconnaître, créée par le socle lui-même.
      await deps.depot.revoquer(ligne.jti, instant);
      await deps.depot.marquerUsage(ligne.jti, instant);

      const paire = await emettreLaPaire(
        {
          grantId: ligne.grantId,
          // ⚠️ **PROPAGÉE, JAMAIS REFRAPPÉE.** C'est toute la décision de l'ADR
          //    0014 : le `jti` tourne au moins toutes les heures, la session ne
          //    tourne qu'à un NOUVEL octroi, qui coûte un geste humain.
          sessionIdColonne: ligne.sessionId,
          principal: ligne.principal,
        },
        ligne.scopes,
      );

      return {
        grantId: ligne.grantId,
        sessionIdColonne: ligne.sessionId,
        acces: paire.acces,
        rafraichissement: paire.rafraichissement,
        ancienRafraichissementRevoque: ligne.jti,
      };
    },

    async revoquer(jetonEnClair: string, genre: GenreDeJeton): Promise<boolean> {
      const empreinte = await empreintes.calculer(genre, jetonEnClair);
      const ligne = await deps.depot.parEmpreinte(empreinte);
      if (ligne === null) return false;
      return deps.depot.revoquer(ligne.jti, deps.maintenant());
    },

    async revoquerSansIndice(jetonEnClair: string): Promise<number> {
      let revoques = 0;
      // ⚠️ LA BOUCLE PARCOURT `GENRES_DE_JETON`, JAMAIS DEUX APPELS ÉCRITS À LA
      //    MAIN. Un troisième genre ajouté demain serait sinon cherché par
      //    `relirePourLEtape4` et JAMAIS par la révocation — un jeton qu'on ne
      //    peut plus rendre, et rien pour le dire.
      for (const genre of GENRES_DE_JETON) {
        if (await this.revoquer(jetonEnClair, genre)) revoques += 1;
      }
      return revoques;
    },

    async relirePourLEtape4(accesEnClair: string): Promise<VerdictDeLEtape4> {
      const empreinte = await empreintes.calculer("access", accesEnClair);
      const ligne = await deps.depot.parEmpreinte(empreinte);
      const instant = deps.maintenant();

      const refus = (cause: CauseDeRefusALEtape4, motif: string): VerdictDeLEtape4 => ({
        admis: false,
        cause,
        statutHttp: STATUT_DE_L_ETAPE_4,
        motif,
        ligne,
      });

      if (ligne === null) {
        return refus(
          "jeton-inconnu",
          "aucun jeton ne porte cette empreinte. Se réauthentifier — voir " +
            "/.well-known/oauth-protected-resource.",
        );
      }
      if (ligne.revokedAt !== null) {
        return refus(
          "jeton-révoqué",
          "ce jeton a été révoqué. Repasser par /auth/authorize — un rafraîchissement ne " +
            "ressuscite pas une chaîne révoquée.",
        );
      }
      if (ligne.expiresAt.getTime() <= instant.getTime()) {
        return refus(
          "jeton-expiré",
          "ce jeton d'accès a expiré (§ 19.1 — une heure). Le rafraîchir à /auth/token.",
        );
      }

      // ⚠️ L'AUDIENCE EST RECONFRONTÉE À CHAQUE APPEL, ET NON AU SEUL OCTROI.
      //    Le domaine du socle peut changer après l'émission ; l'ADR 0026 veut
      //    alors que TOUS les jetons en circulation cessent de valoir, et c'est
      //    ici que cela se produit.
      const audience = comparerLAudienceDuJeton([ligne.audience], deps.audience);
      if (!audience.admise) return refus("audience-étrangère", audience.motif);

      await deps.depot.marquerUsage(ligne.jti, instant);
      return {
        admis: true,
        cause: null,
        statutHttp: STATUT_DE_L_ETAPE_4,
        motif: "jeton valide, non révoqué, dans son audience.",
        ligne,
      };
    },
  };
}

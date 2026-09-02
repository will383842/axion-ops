/**
 * `ops/zoho-mail/sondes/commun.ts` — **CE QUE LES CINQ SONDES PARTAGENT.**
 *
 * ═══ CE QUE CE DOSSIER EST, ET CE QU'IL N'EST PAS ═══
 *
 * Ces fichiers ne sont **pas des gardes** : ils ne tournent pas dans
 * `pnpm test`, ils ne rendent aucun invariant du dépôt, et ils sortent sur le
 * réseau. Ce sont les **quatre appels jetables de la mesure M2** du § 35, plus
 * la mesure qui tranche `zoho.mail.send`. Ils lèvent des incertitudes ; ils ne
 * protègent rien.
 *
 * ⚠️ **AUCUN D'EUX NE S'APPELLE `*.spec.ts`, ET C'EST LA SEULE CHOSE QUI LES
 *    TIENT HORS DE `pnpm test`.** `vitest.config.ts` inclut
 *    `adapters/**\/*.spec.ts`. Un fichier de ce dossier renommé en `.spec.ts`
 *    ferait sortir la chaîne d'intégration publique sur le réseau, avec un
 *    jeton, depuis un exécuteur GitHub. La convention de nom est donc un
 *    dispositif de sécurité, pas un rangement.
 *
 *    L'exception assumée est `commun.spec.ts` — il éprouve les fonctions
 *    **pures** de ce fichier-ci (caviardage, comparaison d'empreintes, refus
 *    d'un relais dans le dépôt) et n'ouvre aucune connexion. Sans lui,
 *    l'affirmation « les sondes n'affichent jamais un identifiant » serait une
 *    phrase, et le § 09 comme le § 20 la refuseraient à ce titre.
 *
 * ═══ TROIS EMPRUNTS QUI SONT DES DÉCISIONS, PAS DES COMMODITÉS ═══
 *
 *  1. **`sha256Hex` vient du journal.** L'ADR 0020 interdit nommément une
 *     seconde implémentation de l'empreinte. Et le motif est ici plus fort
 *     qu'ailleurs : la mesure ne vaut que si elle est prise avec **la fonction
 *     que l'adaptateur emploiera**. Une empreinte mesurée avec une autre
 *     fonction mesurerait un autre garde-fou que celui du § 27.
 *
 *  2. **Le filet anti-fuite vient de `core/transport/anti-fuite.ts`.**
 *     L'ADR 0044 pose « un seul filet, deux appelants — jamais deux écritures ».
 *     Ces sondes en sont le troisième appelant.
 *
 *  3. **`LONGUEUR_MINIMALE_CONFRONTEE` n'est pas recopiée.** Elle est importée.
 *     Une borne recopiée vieillit.
 *
 * ⚠️ **ÉCART SIGNALÉ — `SortieServie.transport` NE SAIT PAS NOMMER UNE SONDE.**
 *    Le type n'admet que `"http"` et `"stdio"`, les deux fils du § 11. Une sonde
 *    n'écrit sur ni l'un ni l'autre : elle écrit sur la **sortie standard du
 *    processus**. `"stdio"` est donc vrai au sens littéral et FAUX au sens du
 *    § 11. La valeur est passée telle quelle plutôt que de fabriquer un second
 *    filet, et l'écart est porté au rapport avec sa proposition — élargir
 *    `SortieServie.transport` à un canal NOMMÉ. Il n'est pas corrigé ici :
 *    `core/transport/` appartient à un autre chantier.
 *
 * ═══ CE QUE CE MODULE NE FAIT JAMAIS ═══
 *
 *  · il **n'écrit rien dans le dépôt** — {@link cheminDuRelais} refuse tout
 *    chemin situé sous la racine, et c'est une garde, pas une consigne ;
 *  · il **n'affiche aucun identifiant** — {@link ValeurSecrete} n'a qu'une seule
 *    porte de sortie, nommée pour qu'un `grep` la trouve, et les quatre voies de
 *    rendu de JavaScript (interpolation, `JSON.stringify`, `String()`,
 *    l'inspecteur de Node) rendent toutes le même caviardage ;
 *  · il **ne lit aucun fichier du dépôt** — les identifiants viennent de
 *    l'environnement, jamais d'un fichier suivi.
 */

import { isAbsolute, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { sha256Hex } from "../../../core/audit/canonique.js";
import {
  LONGUEUR_MINIMALE_CONFRONTEE,
  verifierAucuneFuite,
  type ValeurSensible,
} from "../../../core/transport/anti-fuite.js";
import {
  REGION_DU_CLIENT,
  SCOPES_DU_CDC,
  VARIABLE_CLIENT_ID,
  VARIABLE_CLIENT_SECRET,
  VARIABLE_REGION,
  hoteDesComptes,
  regionDepuisLaChaine,
  scopesRetenus,
  urlDesJetons,
  type RegionZoho,
} from "../bootstrap/autorisation.js";

// ═════════════════════════════════════════════════════════════════════════════
//  1 · LES HÔTES, ET POURQUOI LA SONDE ① EN ESSAIE DEUX
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA RÉGION, **LUE CHEZ LE VOISIN QUI LA POSSÈDE DÉJÀ.**
 *
 * ⚠️ **`ops/zoho-mail/bootstrap/autorisation.ts` EST LA SEULE ÉCRITURE DE
 *    CES FAITS DANS LE DÉPÔT, ET CE DOSSIER-CI NE LA REDOUBLE PAS.** Il porte
 *    les sept régions, l'hôte des comptes, l'URL d'échange de jetons, les noms
 *    des deux variables de client et la table des scopes du § 27. Les réécrire
 *    ici aurait fabriqué la panne que ce dépôt a mesurée quatre fois en un jour :
 *    deux dérivations d'un même fait finissent par se contredire, et c'est la
 *    seconde qui ne suit jamais.
 *
 * ⚠️ **LE RELEVÉ DIT LA RÉGION QU'IL A EMPLOYÉE.** `ZOHO_REGION` la force ;
 *    sinon c'est celle du § 27. Une sonde qui interrogerait `.com` pendant qu'on
 *    croit mesurer `.eu` rendrait un 401 qu'on lirait comme « le plan ne donne
 *    pas l'API » — et ce serait faux.
 */
export function regionEnVigueur(): RegionZoho {
  return regionDepuisLaChaine(process.env[VARIABLE_REGION]) ?? REGION_DU_CLIENT;
}

/**
 * L'HÔTE DE L'API DU COURRIER — **LE SEUL FAIT NEUF DE CE FICHIER.**
 *
 * Le voisin connaît `accounts.zoho.<région>`, parce que c'est là que se fait
 * l'autorisation. Il n'a jamais eu besoin de `mail.zoho.<région>`, parce qu'il
 * n'appelle pas l'API du courrier. Ce nom-ci est donc écrit ici, une fois — et
 * il est **dérivé du domaine du voisin**, pas retapé : le jour où la région
 * change, l'un suit l'autre.
 */
export function hoteDuCourrier(region: RegionZoho): string {
  const [, ...domaine] = hoteDesComptes(region).split(".");
  return `mail.${domaine.join(".")}`;
}

/**
 * LES DEUX CANDIDATS POUR `GET /api/accounts`, ET LE MOTIF DE LES ESSAYER TOUS
 * LES DEUX.
 *
 * ⚠️ **LE § 27 ÉCRIT `GET accounts.zoho.eu/api/accounts`, ET C'EST DOUTEUX.**
 *    Chez Zoho, `accounts.zoho.<région>` sert l'**autorisation** —
 *    `/oauth/v2/auth`, `/oauth/v2/token`, et c'est ce que le voisin `bootstrap/`
 *    en fait — tandis que l'API REST du courrier est servie par
 *    `mail.zoho.<région>/api/…`. Le § 27 lui-même dit pourquoi cette colonne
 *    existe : « son absence est précisément ce qui a laissé passer le défaut de
 *    `send` ». Une colonne ajoutée pour empêcher un endpoint inexistant d'y
 *    figurer mérite d'être **mesurée**, pas relue.
 *
 * ⚠️ **CE N'EST PAS UNE CORRECTION, C'EST UNE MESURE.** Le § 27 n'est pas
 *    réécrit sur une lecture de documentation : la sonde ① interroge les DEUX
 *    hôtes, relève les DEUX codes, et c'est le relevé qui tranche. Si les deux
 *    répondent, le relevé le dit aussi — et c'est alors le § 27 qui a raison.
 */
export function candidatsPourLesComptes(region: RegionZoho = regionEnVigueur()): readonly string[] {
  return [
    `https://${hoteDuCourrier(region)}/api/accounts`,
    `https://${hoteDesComptes(region)}/api/accounts`,
  ];
}

/** L'échange de jeton OAuth. DÉRIVÉ du voisin — jamais une seconde écriture. */
export function urlDuJeton(region: RegionZoho = regionEnVigueur()): string {
  return urlDesJetons(region);
}

/**
 * LA RACINE DE L'API, **DÉRIVÉE DE CE QUI A RÉPONDU** — jamais d'une supposition.
 *
 * Les sondes ② à ⑤ n'ont pas à rejouer le choix d'hôte : la sonde ① l'a mesuré
 * et l'a posé au relais. Si le relais ne le porte pas, la fonction lève au lieu
 * de deviner — une sonde qui interroge un hôte que rien n'a validé mesure autre
 * chose que ce qu'elle croit.
 */
export function racineApi(relais: Relais): string {
  const hote = relais.hoteQuiARepondu;
  if (hote === undefined) {
    throw new ErreurDeSonde(
      "le relais ne dit pas quel hôte a répondu à `GET /api/accounts`. Lancez la sonde ① " +
        "(`sonde-01-abonnement.ts`) : c'est elle qui tranche entre l'hôte du courrier et " +
        "celui des comptes, et ce choix n'est pas une supposition qu'une autre sonde " +
        "puisse faire.",
    );
  }
  return `${hote}/api`;
}

/** L'URL d'un chemin sous un compte. `/messages`, `/folders`, … */
export function urlDuCompte(relais: Relais, accountId: string, chemin: string): string {
  return `${racineApi(relais)}/accounts/${encodeURIComponent(accountId)}${chemin}`;
}

/**
 * LES SCOPES ATTENDUS — **DÉRIVÉS DE LA TABLE DU VOISIN, PAS RECOPIÉS.**
 *
 * Ils ne servent pas à l'appel : un jeton les porte déjà. Ils servent au message
 * d'aide — une sonde qui échoue sur un scope doit dire lequel manquait, sans
 * quoi l'opérateur relance la sonde au lieu de refaire le consentement. Et un
 * cinquième scope ajouté au § 27 entre ici sans qu'une ligne bouge.
 */
export const SCOPES_ATTENDUS: readonly string[] = scopesRetenus(SCOPES_DU_CDC);

// ═════════════════════════════════════════════════════════════════════════════
//  2 · UNE VALEUR QU'ON NE PEUT PAS AFFICHER PAR MÉGARDE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qui paraît à la place d'un secret, quelle que soit la voie de rendu. */
export const CAVIARDE = "«caviardé»";

/**
 * UN SECRET, ENFERMÉ — **ET LES QUATRE VOIES DE RENDU FERMÉES, PAS UNE.**
 *
 * ⚠️ **LA CONSIGNE « NE PAS AFFICHER LE SECRET » NE TIENT PAS.** Elle tient
 *    jusqu'au premier `${jeton}` écrit dans un message d'erreur un soir de
 *    diagnostic. Ce qui tient est un type dont **aucune** voie de rendu ne rend
 *    la valeur :
 *
 *  · l'interpolation `${x}` et `String(x)` passent par `toString()` ;
 *  · `JSON.stringify(x)` passe par `toJSON()` ;
 *  · `console.error(x)` et `util.inspect(x)` passent par le symbole
 *    `nodejs.util.inspect.custom` — c'est celle qu'on oublie, et c'est celle du
 *    diagnostic ;
 *  · le champ privé `#valeur` n'est atteignable par aucun parcours d'objet :
 *    ni `Object.keys`, ni `structuredClone`, ni un sérialiseur tiers.
 *
 * ⚠️ **`devoiler()` EST L'UNIQUE PORTE, ET SON NOM EST UN INSTRUMENT.** Un
 *    `grep -n "devoiler()"` énumère en une commande tous les endroits du dépôt
 *    où un secret redevient une chaîne. Une porte qui s'appellerait `valeur()`
 *    ou `get()` ne serait pas énumérable.
 */
export class ValeurSecrete {
  readonly #valeur: string;

  /** Le nom du réglage d'où la valeur vient. Il sort, elle non. */
  readonly nom: string;

  constructor(nom: string, valeur: string) {
    this.nom = nom;
    this.#valeur = valeur;
  }

  /** L'UNIQUE porte de sortie. Cherchez `devoiler()` pour les énumérer toutes. */
  devoiler(): string {
    return this.#valeur;
  }

  /** Combien de caractères — utile au diagnostic, inoffensif au relevé. */
  get longueur(): number {
    return this.#valeur.length;
  }

  toString(): string {
    return CAVIARDE;
  }

  toJSON(): string {
    return CAVIARDE;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return CAVIARDE;
  }
}

/**
 * LES ADRESSES SONT DES DONNÉES PERSONNELLES, ET UN RELEVÉ FINIT COLLÉ DANS UN
 * ADR.
 *
 * Le § 27 fait énumérer les identités d'expédition au runtime ; la sonde ① les
 * compte et les qualifie (validées ou non) **sans les nommer**. Deux caractères
 * de partie locale suffisent à distinguer deux alias l'un de l'autre pour qui
 * possède la boîte, et ne désignent personne pour qui ne la possède pas.
 *
 * ⚠️ **LE DOMAINE EST CONSERVÉ, ET C'EST DÉLIBÉRÉ.** Il porte l'information qui
 *    décide — un alias servi par un domaine étranger au compte est précisément
 *    ce qu'un `from` non validé produirait — et il n'identifie pas une personne.
 */
export function caviarderAdresse(adresse: string): string {
  const arobase = adresse.lastIndexOf("@");
  if (arobase <= 0) return CAVIARDE;
  const locale = adresse.slice(0, arobase);
  const domaine = adresse.slice(arobase + 1);
  const tete = locale.slice(0, 2);
  return `${tete}${"*".repeat(Math.max(1, locale.length - tete.length))}@${domaine}`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  3 · LES RÉGLAGES, LUS DANS L'ENVIRONNEMENT ET NULLE PART AILLEURS
// ═════════════════════════════════════════════════════════════════════════════

/** Le nom des réglages que ces sondes lisent. Ils ne sont JAMAIS écrits ici. */
export const REGLAGES = {
  /**
   * Émis par la console d'API. Présent dans le `.env` non suivi.
   *
   * ⚠️ LE NOM EST **IMPORTÉ** de `../bootstrap/autorisation.ts`, pas retapé. Les
   *    deux dossiers lisent la même variable ; deux chaînes littérales
   *    finiraient par diverger d'une lettre, et le second à diverger serait
   *    celui qu'on lance le moins souvent — celui-ci.
   */
  clientId: VARIABLE_CLIENT_ID,
  /** Émis par la console d'API. Présent dans le `.env` non suivi. */
  clientSecret: VARIABLE_CLIENT_SECRET,
  /**
   * ⚠️ **ÉCART SIGNALÉ, ET ASSUMÉ : LE JETON DE RAFRAÎCHISSEMENT VIT AU COFFRE,
   *    PAS ICI.** `ops/zoho-mail/bootstrap/` dépose le sien dans le coffre
   *    du socle, versionné et compté (`ops_secret.bootstrapCount`, § 27). Cette
   *    variable-ci est un SECOND chemin vers le même secret, et il est
   *    délibéré : M2 est une mesure d'une heure qui doit pouvoir tourner **avant
   *    que le socle, sa base et son coffre n'existent** — c'est le § 35 qui la
   *    place au lot 0b, avant le lot 1.
   *
   * ⚠️ **ELLE NE DOIT JAMAIS SERVIR EN PRODUCTION.** Sortir le jeton du coffre
   *    pour le poser dans un environnement annulerait ce que le coffre apporte.
   *    La voie recommandée reste `ZOHO_ACCESS_TOKEN` — une heure, aucun coffre
   *    engagé, aucun bootstrap consommé.
   *
   * ⚠️ **ABSENT DU `.env` AU 2026-09-01** — mesuré sur les NOMS de clés seuls,
   *    jamais sur les valeurs. Aucune des cinq sondes ne peut donc tourner en
   *    l'état.
   */
  refreshToken: "ZOHO_REFRESH_TOKEN",
  /** La voie courte : un jeton d'accès d'une heure, obtenu en « client seul ». */
  accessToken: "ZOHO_ACCESS_TOKEN",
  /** Relevé par la sonde ①. Évite de la relancer avant chacune des suivantes. */
  accountId: "ZOHO_ACCOUNT_ID",
  /** L'expéditeur de l'essai. Doit figurer parmi les identités de la sonde ①. */
  expediteur: "ZOHO_SONDE_FROM",
  /**
   * Le destinataire de l'essai.
   *
   * ⚠️ **IL DOIT ÊTRE UNE ADRESSE QUE L'OPÉRATEUR POSSÈDE.** Aucune sonde
   *    n'envoie de courrier sans l'option explicite du README, mais la question
   *    même que la sonde ⑤ pose est « `mode` a-t-il été ignoré ? ». Un réglage
   *    qui répond « oui » avec l'adresse d'un tiers dans le champ `to` est un
   *    effet extérieur au sens du § 20, causé par la mesure elle-même.
   */
  destinataire: "ZOHO_SONDE_TO",
  /** Où poser l'état partagé entre sondes. Hors du dépôt, toujours. */
  relais: "ZOHO_SONDE_RELAIS",
} as const;

/** Une erreur de sonde — un message pour l'opérateur, jamais une trace de pile. */
export class ErreurDeSonde extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ErreurDeSonde";
  }
}

/** Un réglage non secret, ou `null`. Les chaînes vides comptent pour absentes. */
export function lireReglage(nom: string): string | null {
  const brut = process.env[nom];
  if (brut === undefined) return null;
  const valeur = brut.trim();
  return valeur.length > 0 ? valeur : null;
}

/** Un réglage non secret, exigé. */
export function exigerReglage(nom: string): string {
  const valeur = lireReglage(nom);
  if (valeur === null) {
    throw new ErreurDeSonde(
      `le réglage \`${nom}\` est absent de l'environnement. Voyez ` +
        "`ops/zoho-mail/sondes/README.md`, § « Ce qu'il faut avoir avant de lancer ».",
    );
  }
  return valeur;
}

/** Un secret, enfermé dès la lecture. Il ne redevient une chaîne qu'au `devoiler()`. */
export function lireSecret(nom: string): ValeurSecrete | null {
  const valeur = lireReglage(nom);
  return valeur === null ? null : new ValeurSecrete(nom, valeur);
}

/** Un secret exigé. */
export function exigerSecret(nom: string): ValeurSecrete {
  return new ValeurSecrete(nom, exigerReglage(nom));
}

// ═════════════════════════════════════════════════════════════════════════════
//  4 · LE RELAIS — L'ÉTAT PARTAGÉ, ET IL NE PEUT PAS TOMBER DANS LE DÉPÔT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ÉTAT QU'UNE SONDE LÈGUE À LA SUIVANTE.
 *
 * ⚠️ **AUCUN CHAMP DE CE TYPE N'EST UN SECRET, ET C'EST VÉRIFIABLE PAR LECTURE.**
 *    Le relais porte des identifiants de ressources Zoho — compte, dossier,
 *    message, pièce jointe — et des empreintes. Ni jeton, ni adresse, ni corps
 *    de message. Un jeton d'accès y serait la faute exacte que ce dossier
 *    cherche à empêcher : un secret posé dans un fichier temporaire que personne
 *    n'efface.
 */
export interface Relais {
  /** L'hôte qui a réellement répondu à `GET /api/accounts`. Relevé par ①. */
  readonly hoteQuiARepondu?: string;
  readonly accountId?: string;
  /** L'identifiant du dossier `Drafts`, relevé par ② — ④ en a besoin. */
  readonly folderIdBrouillons?: string;
  /** Le brouillon SANS pièce jointe, créé par ②. */
  readonly brouillonSimple?: string;
  /** La pièce jointe téléversée par ③, telle qu'elle doit être re-postée. */
  readonly pieceJointe?: {
    readonly storeName: string;
    readonly attachmentPath: string;
    readonly attachmentName: string;
    /** L'empreinte du contenu fabriqué — ④ prouve que c'est le MÊME fichier. */
    readonly empreinteDuContenu: string;
    readonly octets: number;
  };
  /** Le brouillon AVEC pièce jointe, créé par ④. */
  readonly brouillonAvecPiece?: string;
  /** Le corps posté par ⑤, et son empreinte. Q2 les compare au relu. */
  readonly empreinteDuCorpsPoste?: string;
  /** L'empreinte du corps RELU juste après la création. Q3 et Q4 s'y réfèrent. */
  readonly empreinteRelueAT0?: string;
  /** Le brouillon de la sonde ⑤, celui que l'opérateur modifiera à la main. */
  readonly brouillonDeLEmpreinte?: string;
  /** L'horodatage ISO du dernier relevé écrit ici. */
  readonly dateDuDernierReleve?: string;
}

/** La racine du dépôt, DÉRIVÉE d'`import.meta.url` — jamais codée en dur. */
export function racineDuDepot(): string {
  return fileURLToPath(new URL("../../../", import.meta.url));
}

/**
 * OÙ POSER LE RELAIS — **ET LE REFUS EST LA GARDE, PAS LA CONSIGNE.**
 *
 * La consigne du lot est « n'écris rien dans le dépôt ». Une consigne ne
 * s'exécute pas. Ce qui s'exécute est ceci : le chemin est résolu, confronté à
 * la racine du dépôt, et un chemin qui tombe dedans **lève**. `ZOHO_SONDE_RELAIS`
 * pointé sur `./relais.json` un soir de fatigue ne peut donc pas déposer un
 * identifiant de compte dans un dépôt PUBLIC.
 *
 * ⚠️ **LA BORNE EST LA CASSE ET LES LIENS.** `path.relative` compare des
 *    chaînes ; sur un système de fichiers insensible à la casse il ne s'y trompe
 *    pas, mais un lien symbolique qui pointerait dans le dépôt depuis un chemin
 *    extérieur lui échapperait. Résoudre les liens exigerait que la cible
 *    existe, ce qui n'est pas le cas au premier lancement. La garde couvre le
 *    cas mesuré — un chemin relatif ou absolu écrit à la main — et pas celui-là.
 */
export function cheminDuRelais(): string {
  const demande = lireReglage(REGLAGES.relais);
  const cible = resolve(demande ?? resolve(tmpdir(), "axion-ops-sondes-zoho-relais.json"));
  const racine = racineDuDepot();
  const ecart = relative(racine, cible);
  const dehors = ecart.startsWith("..") || isAbsolute(ecart);
  if (!dehors) {
    throw new ErreurDeSonde(
      `le relais \`${cible}\` tombe SOUS LA RACINE DU DÉPÔT (${racine}). Ce dépôt est PUBLIC : ` +
        "aucune sonde n'y écrit. Posez `" +
        REGLAGES.relais +
        "` hors du dépôt, ou laissez-le vide pour le répertoire temporaire du système.",
    );
  }
  return cible;
}

/** Le relais tel qu'il est sur disque. Objet vide s'il n'existe pas encore. */
export function lireLeRelais(): Relais {
  const chemin = cheminDuRelais();
  if (!existsSync(chemin)) return {};
  const brut: unknown = JSON.parse(readFileSync(chemin, "utf8"));
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) return {};
  return brut;
}

/** Fusionne et réécrit le relais. Ne rend rien : la sonde lit ce qu'elle a écrit. */
export function ecrireLeRelais(ajout: Relais): string {
  const chemin = cheminDuRelais();
  const fusion: Relais = {
    ...lireLeRelais(),
    ...ajout,
    dateDuDernierReleve: new Date().toISOString(),
  };
  writeFileSync(chemin, `${JSON.stringify(fusion, null, 2)}\n`, "utf8");
  return chemin;
}

/** Un champ du relais, exigé — avec le nom de la sonde qui aurait dû le poser. */
export function exigerDuRelais<C extends keyof Relais>(
  relais: Relais,
  champ: C,
  sondeQuiLePose: string,
): NonNullable<Relais[C]> {
  const valeur = relais[champ];
  if (valeur === undefined) {
    throw new ErreurDeSonde(
      `le relais ne porte pas \`${String(champ)}\` : lancez d'abord ${sondeQuiLePose}. ` +
        `Relais lu : ${cheminDuRelais()}`,
    );
  }
  return valeur;
}

// ═════════════════════════════════════════════════════════════════════════════
//  5 · LE JETON D'ACCÈS
// ═════════════════════════════════════════════════════════════════════════════

/** Comment le jeton a été obtenu. Le relevé le dit : les deux voies ne valent pas pareil. */
export type VoieDuJeton = "jeton d'accès fourni" | "échange d'un refresh token";

/** Un jeton d'accès et la voie par laquelle il est arrivé. */
export interface JetonDAcces {
  readonly jeton: ValeurSecrete;
  readonly voie: VoieDuJeton;
  /** La durée de vie annoncée par Zoho, en secondes. `null` sur la voie courte. */
  readonly dureeDeVieSecondes: number | null;
}

/**
 * LE JETON D'ACCÈS, PAR L'UNE DES DEUX VOIES.
 *
 * ⚠️ **LA VOIE COURTE EST LA BONNE POUR M2, ET C'EST UN CHOIX MOTIVÉ.** Le § 27
 *    signale que le transfert du refresh token « n'était écrit nulle part » et
 *    que rejouer le bootstrap depuis la production est interdit deux fois. M2
 *    est une mesure d'une heure : elle ne doit **rien décider** de ce transfert,
 *    et surtout pas le consommer. Un jeton d'accès d'une heure obtenu en
 *    « client seul » depuis la console d'API mesure exactement la même chose et
 *    n'engage aucun des deux coffres.
 *
 * ⚠️ **CE QUE LA VOIE LONGUE CONSOMME.** `refresh_token` est plafonné par client
 *    chez Zoho — c'est l'incertitude M3, non levée. Chaque échange en crée un de
 *    plus si le consentement est rejoué. La sonde n'en crée jamais : elle
 *    échange un refresh token existant contre un accès, ce qui n'en consomme pas.
 */
export async function obtenirJetonDAcces(): Promise<JetonDAcces> {
  const direct = lireSecret(REGLAGES.accessToken);
  if (direct !== null) {
    return { jeton: direct, voie: "jeton d'accès fourni", dureeDeVieSecondes: null };
  }

  const refresh = lireSecret(REGLAGES.refreshToken);
  if (refresh === null) {
    throw new ErreurDeSonde(
      `ni \`${REGLAGES.accessToken}\` ni \`${REGLAGES.refreshToken}\` ne sont posés. ` +
        "Aucune sonde ne peut partir : le consentement OAuth du § 27 n'a pas eu lieu. " +
        "Le README donne la voie courte (« client seul », une heure, aucun coffre engagé).",
    );
  }

  const corps = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh.devoiler(),
    client_id: exigerSecret(REGLAGES.clientId).devoiler(),
    client_secret: exigerSecret(REGLAGES.clientSecret).devoiler(),
  });

  const reponse = await fetch(urlDuJeton(), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: corps.toString(),
  });
  const texte = await reponse.text();
  const charge = lireJson(texte);

  const acces = champTexte(charge, "access_token");
  if (reponse.status !== 200 || acces === null) {
    throw new ErreurDeSonde(
      `l'échange du refresh token a rendu HTTP ${String(reponse.status)} sans \`access_token\`. ` +
        `Zoho a répondu : ${extraitSansSecret(texte, 300)}`,
    );
  }
  const duree = champNombre(charge, "expires_in");
  return {
    jeton: new ValeurSecrete("access_token", acces),
    voie: "échange d'un refresh token",
    dureeDeVieSecondes: duree,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  6 · L'APPEL, ET CE QU'ON EN RETIENT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'une sonde retient d'un appel. Aucun en-tête d'autorisation n'y figure. */
export interface AppelObserve {
  readonly methode: string;
  /** L'URL, requête comprise. Elle ne porte jamais de jeton — voyez {@link appeler}. */
  readonly url: string;
  readonly code: number;
  /** Le code interne de l'enveloppe Zoho, quand il y en a un. */
  readonly codeZoho: number | null;
  /** Le `errorCode` de Zoho, quand il y en a un. C'est LUI qui tranche le plan. */
  readonly erreurZoho: string | null;
  readonly contentType: string | null;
  readonly octets: number;
  /** Le corps, BORNÉ. Le § 27 borne les corps lus à 8 000 caractères ; ici 2 000 suffisent. */
  readonly extrait: string;
  /**
   * LE CORPS **INTACT**, ET IL N'A QU'UN SEUL USAGE.
   *
   * ⚠️ **`extrait` NE PEUT PAS SERVIR À UNE EMPREINTE.** Il est passé au
   *    laminoir — espaces réduits, coupé à 2 000 caractères — parce qu'il est
   *    fait pour être LU. Comparer deux `extrait` répondrait « identiques » à
   *    deux corps qui diffèrent par un `\r\n`, c'est-à-dire précisément la
   *    différence que la sonde ⑤ cherche. Ce champ-ci est le texte tel qu'il est
   *    arrivé.
   *
   * ⚠️ **IL EST PLAFONNÉ, ET LE PLAFOND EST DIT.** Au-delà de
   *    {@link CORPS_INTEGRAL_MAX} octets, `corpsTronque` passe à vrai et TOUTE
   *    comparaison d'empreinte devient invalide — la sonde ⑤ le refuse alors au
   *    lieu de rendre un « les empreintes diffèrent » qui serait un artefact.
   */
  readonly corpsIntegral: string;
  /** Vrai quand le corps a dépassé le plafond. Une empreinte prise dessus ne vaut rien. */
  readonly corpsTronque: boolean;
  /** Le corps analysé, quand c'est du JSON. `null` sinon. */
  readonly charge: unknown;
  readonly dureeMs: number;
}

/**
 * CE QU'UNE SONDE SAIT ENVOYER — **DEUX FORMES, ET PAS UNE DE PLUS.**
 *
 * ⚠️ **CE N'EST PAS `BodyInit`, ET C'EST DÉLIBÉRÉ.** Le type global de la
 *    plate-forme admet les flux, les `ArrayBuffer` et les `URLSearchParams` :
 *    autant de formes dont ce dossier n'a aucun usage, et dont chacune se
 *    sérialise différemment. Les nommer toutes les deux ici rend le corps d'un
 *    appel LISIBLE au typage — une chaîne JSON, ou un formulaire multipart —
 *    et empêche qu'un flux se glisse dans un appel dont on croirait connaître
 *    les octets. La sonde ③ dépend de cette lisibilité : c'est elle qui compare
 *    les octets envoyés à la taille annoncée.
 */
export type CorpsSortant = string | FormData;

/** Le plafond d'extrait d'un relevé. Un relevé se lit dans un terminal. */
export const EXTRAIT_MAX = 2000;

/**
 * LE PLAFOND DU CORPS INTACT.
 *
 * 64 Kio : très au-dessus des messages d'épreuve de ce dossier (quelques
 * centaines d'octets) et très en dessous d'un corps qui mettrait la mémoire en
 * peine. Il n'est pas là pour couper — il est là pour que le jour où il coupe,
 * on l'apprenne au lieu de comparer deux moitiés.
 */
export const CORPS_INTEGRAL_MAX = 65536;

/**
 * L'APPEL SORTANT, ET LES TROIS CHOSES QU'IL GARANTIT.
 *
 *  1. **Le jeton voyage dans l'en-tête, jamais dans l'URL.** Une URL se
 *     journalise, se colle dans un ticket et paraît dans un message d'erreur.
 *  2. **L'`AppelObserve` rendu ne porte aucun en-tête de requête.** Ce qui n'est
 *     pas retenu ne peut pas être affiché.
 *  3. **Le corps est borné à la lecture**, pas à l'affichage : un corps de dix
 *     mégaoctets n'entre pas en mémoire pour être coupé ensuite.
 */
export async function appeler(
  jeton: ValeurSecrete,
  methode: string,
  url: string,
  options: { readonly corps?: CorpsSortant; readonly contentType?: string } = {},
): Promise<AppelObserve> {
  const entetes: Record<string, string> = {
    authorization: `Zoho-oauthtoken ${jeton.devoiler()}`,
    accept: "application/json",
  };
  if (options.contentType !== undefined) entetes["content-type"] = options.contentType;

  const debut = Date.now();
  const reponse = await fetch(url, {
    method: methode,
    headers: entetes,
    ...(options.corps === undefined ? {} : { body: options.corps }),
  });
  const texte = await reponse.text();
  const dureeMs = Date.now() - debut;

  const charge = lireJson(texte);
  const tronque = Buffer.byteLength(texte, "utf8") > CORPS_INTEGRAL_MAX;
  return {
    methode,
    url,
    code: reponse.status,
    codeZoho: codeDeLEnveloppe(charge),
    erreurZoho: erreurDeLEnveloppe(charge),
    contentType: reponse.headers.get("content-type"),
    octets: Buffer.byteLength(texte, "utf8"),
    extrait: extraitSansSecret(texte, EXTRAIT_MAX),
    corpsIntegral: tronque ? texte.slice(0, CORPS_INTEGRAL_MAX) : texte,
    corpsTronque: tronque,
    charge,
    dureeMs,
  };
}

/**
 * LE CORPS DU MESSAGE, TEL QUE ZOHO LE REND — **ET LA SOURCE EST DITE.**
 *
 * Zoho enveloppe la plupart de ses réponses dans `{ status, data }`. Le corps
 * d'un message arrive donc soit dans `data.content`, soit — selon l'endpoint —
 * comme corps brut. La différence n'est pas cosmétique : prendre l'empreinte de
 * l'enveloppe au lieu du contenu ferait varier l'empreinte avec un champ
 * d'enveloppe, et la sonde ⑤ conclurait « Zoho réécrit le corps » sur un
 * horodatage de réponse.
 */
export function corpsDuMessage(appel: AppelObserve): {
  readonly texte: string;
  readonly source: "data.content" | "corps brut";
} {
  const contenu = champTexte(donneesDeLEnveloppe(appel.charge), "content");
  if (contenu !== null) return { texte: contenu, source: "data.content" };
  return { texte: appel.corpsIntegral, source: "corps brut" };
}

/** Ce que rend un essai de plusieurs formes d'URL pour une même intention. */
export interface EssaiDeCandidats {
  /** Tous les appels tentés, dans l'ordre. Le relevé les imprime TOUS. */
  readonly tentatives: readonly AppelObserve[];
  /** Le premier qui a rendu 200, ou `null`. */
  readonly retenu: AppelObserve | null;
}

/**
 * ESSAIE PLUSIEURS FORMES D'URL POUR UNE MÊME INTENTION, ET RELÈVE TOUT.
 *
 * ⚠️ **C'EST LA FORME QUE PREND UNE INCERTITUDE QU'ON REFUSE DE COMBLER.** La
 *    documentation de Zoho donne pour plusieurs lectures deux chemins plausibles
 *    — sous le dossier, ou directement sous le compte. Choisir le « bon » sur
 *    ma lecture reproduirait exactement le défaut que le § 27 vient de corriger :
 *    `zoho.mail.send` avait été spécifié sur un endpoint qui n'existe pas, parce
 *    que personne n'avait relevé la colonne.
 *
 *    Ici, les deux sont appelés, les deux codes sont relevés, et **le relevé
 *    nomme celui qui a répondu**. Une supposition devient une mesure pour le
 *    prix d'un appel HTTP.
 *
 * ⚠️ **L'ARRÊT AU PREMIER 200 EST DÉLIBÉRÉ POUR LES ÉCRITURES.** Insister après
 *    un succès créerait un second brouillon, un second téléversement, un second
 *    effet. Les lectures peuvent tout essayer ; `arreterAuPremierSucces` le dit.
 */
export async function essayerLesCandidats(
  jeton: ValeurSecrete,
  methode: string,
  urls: readonly string[],
  options: {
    readonly corps?: CorpsSortant;
    readonly contentType?: string;
    readonly arreterAuPremierSucces?: boolean;
  } = {},
): Promise<EssaiDeCandidats> {
  const tentatives: AppelObserve[] = [];
  let retenu: AppelObserve | null = null;
  for (const url of urls) {
    const appel = await appeler(jeton, methode, url, {
      ...(options.corps === undefined ? {} : { corps: options.corps }),
      ...(options.contentType === undefined ? {} : { contentType: options.contentType }),
    });
    tentatives.push(appel);
    if (appel.code === 200 && retenu === null) {
      retenu = appel;
      if (options.arreterAuPremierSucces !== false) break;
    }
  }
  return { tentatives, retenu };
}

/** `JSON.parse` qui ne lève pas. Un corps non-JSON est une information, pas une panne. */
export function lireJson(texte: string): unknown {
  try {
    return JSON.parse(texte) as unknown;
  } catch {
    return null;
  }
}

/** Le `status.code` de l'enveloppe Zoho, quand elle en porte un. */
export function codeDeLEnveloppe(charge: unknown): number | null {
  const statut = champObjet(charge, "status");
  return champNombre(statut, "code");
}

/** Le `data.errorCode` de l'enveloppe Zoho. C'est lui qui nomme un plan insuffisant. */
export function erreurDeLEnveloppe(charge: unknown): string | null {
  const donnees = champObjet(charge, "data");
  const direct = champTexte(donnees, "errorCode");
  if (direct !== null) return direct;
  return champTexte(charge, "errorCode");
}

/** Le `data` d'une enveloppe Zoho, tel quel. */
export function donneesDeLEnveloppe(charge: unknown): unknown {
  if (charge === null || typeof charge !== "object") return null;
  return (charge as Record<string, unknown>)["data"] ?? null;
}

/** Un champ texte, ou `null`. Aucune valeur inconnue n'est passée à `String()`. */
export function champTexte(valeur: unknown, nom: string): string | null {
  if (valeur === null || typeof valeur !== "object") return null;
  const brut: unknown = (valeur as Record<string, unknown>)[nom];
  if (typeof brut === "string") return brut;
  // Zoho rend certains identifiants en nombre selon l'endpoint ; c'est mesuré,
  // pas supposé — le relevé imprime le type reçu quand il diffère.
  if (typeof brut === "number" && Number.isFinite(brut)) return String(brut);
  return null;
}

/** Un champ numérique, ou `null`. */
export function champNombre(valeur: unknown, nom: string): number | null {
  if (valeur === null || typeof valeur !== "object") return null;
  const brut: unknown = (valeur as Record<string, unknown>)[nom];
  return typeof brut === "number" && Number.isFinite(brut) ? brut : null;
}

/** Un champ objet, ou `null`. */
export function champObjet(valeur: unknown, nom: string): unknown {
  if (valeur === null || typeof valeur !== "object") return null;
  const brut: unknown = (valeur as Record<string, unknown>)[nom];
  return brut !== null && typeof brut === "object" ? brut : null;
}

/** Un tableau, ou la liste vide. */
export function tableau(valeur: unknown): readonly unknown[] {
  return Array.isArray(valeur) ? (valeur as readonly unknown[]) : [];
}

/**
 * UN EXTRAIT BORNÉ, ET LA TRONCATURE EST SIGNALÉE.
 *
 * Le § 27 exige la même chose de `zoho.mail.read` : « corps borné à 8 000 car.,
 * **troncature signalée** ». Un extrait coupé en silence se lit comme un corps
 * complet, et c'est ainsi qu'on conclut « le champ n'y était pas ».
 */
export function extraitSansSecret(texte: string, plafond: number): string {
  const propre = texte.replace(/\s+/gu, " ").trim();
  if (propre.length <= plafond) return propre;
  return `${propre.slice(0, plafond)} […tronqué, ${String(propre.length)} caractères au total]`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  7 · LES EMPREINTES — LE CŒUR DE LA SONDE ⑤
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA NORMALISATION, ET ELLE EST LA QUESTION, PAS LA RÉPONSE.
 *
 * ⚠️ **NORMALISER, C'EST AFFAIBLIR LA GARDE.** Le § 27 veut qu'un brouillon
 *    « modifié entre-temps » soit refusé. Toute normalisation crée une classe de
 *    modifications que l'empreinte ne verra plus : ici, les fins de ligne et
 *    l'espace de bord. C'est le prix à payer si — et seulement si — Zoho
 *    lui-même réécrit ces caractères au passage.
 *
 *    D'où la forme de la sonde ⑤ : elle compare **les deux** empreintes, brute
 *    et normalisée, et le relevé dit laquelle a suffi. Si la brute suffit, la
 *    normalisation ne doit PAS entrer dans l'adaptateur.
 */
export function normaliserCorps(texte: string): string {
  return texte.replace(/\r\n/gu, "\n").trim();
}

/** Le résultat d'une confrontation de deux corps. Des NOMBRES, jamais un booléen seul. */
export interface ComparaisonDeCorps {
  readonly identiques: boolean;
  readonly identiquesApresNormalisation: boolean;
  readonly octetsA: number;
  readonly octetsB: number;
  /** L'index du premier caractère qui diffère, ou `null` si les deux sont égaux. */
  readonly premierEcart: number | null;
  /** Ce qu'on lit de part et d'autre du premier écart. Borné, et sans secret. */
  readonly voisinageA: string;
  readonly voisinageB: string;
  readonly empreinteA: string;
  readonly empreinteB: string;
}

/** Le voisinage montré autour du premier écart. Assez pour voir, trop court pour fuir. */
export const VOISINAGE = 60;

/**
 * CONFRONTE DEUX CORPS, ET DIT **OÙ** ILS DIVERGENT.
 *
 * ⚠️ **« LES EMPREINTES DIFFÈRENT » NE DÉCIDE RIEN.** C'est le constat qui a
 *    fait écrire ce dossier : le § 27 remplace un endpoint inexistant par
 *    « relire-puis-envoyer », et si la relecture n'est pas l'identité, le
 *    remplacement ne marche pas non plus — mais pour une raison qu'un booléen ne
 *    dit pas. Un `\r\n` réécrit, un `<div>` ajouté par le rendu, un horodatage
 *    inséré : trois causes, trois conclusions opposées. La position et le
 *    voisinage du premier écart les séparent en une lecture.
 */
export function comparerLesCorps(a: string, b: string): ComparaisonDeCorps {
  const identiques = a === b;
  const na = normaliserCorps(a);
  const nb = normaliserCorps(b);

  let premierEcart: number | null = null;
  if (!identiques) {
    const commun = Math.min(a.length, b.length);
    let i = 0;
    while (i < commun && a[i] === b[i]) i += 1;
    premierEcart = i;
  }

  const debut = premierEcart === null ? 0 : Math.max(0, premierEcart - VOISINAGE / 2);
  return {
    identiques,
    identiquesApresNormalisation: na === nb,
    octetsA: Buffer.byteLength(a, "utf8"),
    octetsB: Buffer.byteLength(b, "utf8"),
    premierEcart,
    voisinageA: premierEcart === null ? "" : a.slice(debut, debut + VOISINAGE),
    voisinageB: premierEcart === null ? "" : b.slice(debut, debut + VOISINAGE),
    empreinteA: sha256Hex(a),
    empreinteB: sha256Hex(b),
  };
}

/** L'empreinte du socle, appliquée à un corps. C'est la fonction du journal, pas une autre. */
export function empreinteDuCorps(texte: string): string {
  return sha256Hex(texte);
}

// ═════════════════════════════════════════════════════════════════════════════
//  8 · LE RELEVÉ ÉCRIT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'une question de sonde a établi. `indécis` n'est PAS un échec. */
export type Verdict = "ÉTABLI" | "RÉFUTÉ" | "INDÉCIS";

/** Une question posée à Zoho, et ce que la réponse en a fait. */
export interface Question {
  /** La question, telle qu'un lecteur non technique la comprend. */
  readonly question: string;
  readonly verdict: Verdict;
  /** Ce que la réponse dit, en une ou deux phrases. */
  readonly constat: string;
  /** **CE QUE CE RÉSULTAT DÉCIDE.** Sans cette ligne, un relevé est une trace. */
  readonly decide: string;
  /** Les appels qui portent le constat. Le relevé imprime leur code et leur URL. */
  readonly appuis: readonly AppelObserve[];
}

/** Le relevé complet d'une sonde. */
export interface Releve {
  readonly sonde: string;
  readonly titre: string;
  /** L'horodatage du relevé, en ISO UTC. Un relevé sans date ne se rejoue pas. */
  readonly date: string;
  readonly questions: readonly Question[];
  /** Combien d'appels réseau la sonde a réellement faits. Zéro est une anomalie. */
  readonly appelsFaits: number;
  /** Sous ce plancher, le compte est lui-même une anomalie. */
  readonly plancherDAppels: number;
}

/** Le verdict d'ensemble, DÉRIVÉ des questions — jamais écrit à la main. */
export function verdictDEnsemble(releve: Releve): Verdict {
  if (releve.appelsFaits < releve.plancherDAppels) return "INDÉCIS";
  if (releve.questions.some((q) => q.verdict === "RÉFUTÉ")) return "RÉFUTÉ";
  if (releve.questions.some((q) => q.verdict === "INDÉCIS")) return "INDÉCIS";
  return releve.questions.length > 0 ? "ÉTABLI" : "INDÉCIS";
}

/** Le relevé, rendu en texte. Fonction PURE : c'est ce qui la rend éprouvable. */
export function rendreLeReleve(releve: Releve): string {
  const lignes: string[] = [];
  const barre = "═".repeat(78);
  lignes.push(barre);
  lignes.push(`  SONDE ${releve.sonde} — ${releve.titre}`);
  lignes.push(`  Relevé du ${releve.date} · ${String(releve.appelsFaits)} appel(s) réseau`);
  lignes.push(barre);

  if (releve.appelsFaits < releve.plancherDAppels) {
    lignes.push("");
    lignes.push(
      `  ⚠️ ${String(releve.appelsFaits)} appel(s) pour un plancher de ` +
        `${String(releve.plancherDAppels)} : cette sonde N'A PAS ASSEZ MESURÉ pour conclure. ` +
        "Un relevé qui ne compte pas ses appels est vert pour la pire des raisons.",
    );
  }

  for (const [rang, q] of releve.questions.entries()) {
    lignes.push("");
    lignes.push(`  ${String(rang + 1)}. ${q.question}`);
    lignes.push(`     VERDICT : ${q.verdict}`);
    lignes.push(`     CONSTAT : ${q.constat}`);
    lignes.push(`     DÉCIDE  : ${q.decide}`);
    for (const appui of q.appuis) {
      lignes.push(
        `       · ${appui.methode} ${appui.url} → HTTP ${String(appui.code)}` +
          `${appui.codeZoho === null ? "" : ` · status.code ${String(appui.codeZoho)}`}` +
          `${appui.erreurZoho === null ? "" : ` · errorCode ${appui.erreurZoho}`}` +
          ` · ${String(appui.octets)} o · ${String(appui.dureeMs)} ms`,
      );
      lignes.push(`         ${appui.extrait}`);
    }
  }

  lignes.push("");
  lignes.push(barre);
  lignes.push(`  VERDICT D'ENSEMBLE : ${verdictDEnsemble(releve)}`);
  lignes.push(barre);
  return `${lignes.join("\n")}\n`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  9 · LE DERNIER FILET
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES VALEURS QU'UN RELEVÉ NE DOIT JAMAIS CONTENIR.
 *
 * ⚠️ **CETTE LISTE SE DÉRIVE DE `REGLAGES`, ELLE N'EST PAS ÉCRITE.** Un sixième
 *    réglage secret ajouté à `REGLAGES` entre dans le filet sans qu'une ligne
 *    bouge ici. Une liste recopiée aurait vieilli au premier ajout — et c'est
 *    exactement au moment où l'on ajoute un secret qu'on a besoin du filet.
 */
export const NOMS_DES_SECRETS: readonly string[] = [
  REGLAGES.clientId,
  REGLAGES.clientSecret,
  REGLAGES.refreshToken,
  REGLAGES.accessToken,
];

/** Les valeurs sensibles présentes dans l'environnement, NOMMÉES. */
export function valeursSensiblesDeLEnvironnement(jeton?: ValeurSecrete): readonly ValeurSensible[] {
  const sensibles: ValeurSensible[] = [];
  for (const nom of NOMS_DES_SECRETS) {
    const valeur = lireReglage(nom);
    if (valeur !== null) sensibles.push({ nom, valeur });
  }
  if (jeton !== undefined) {
    sensibles.push({ nom: "jeton d'accès en cours", valeur: jeton.devoiler() });
  }
  return sensibles;
}

/**
 * ÉCRIT LE RELEVÉ SUR LA SORTIE STANDARD — **APRÈS LE FILET, JAMAIS AVANT.**
 *
 * ⚠️ **LE FILET EST CELUI DE L'ADR 0044, ET IL COMPTE.** `valeursConfrontees`
 *    dit combien de valeurs ont réellement été cherchées : un filet qui n'en
 *    confronte aucune est vert en ne regardant rien, et c'est la panne que
 *    l'ADR 0044 nomme. Ici, ZÉRO valeur confrontée fait **échouer l'écriture** —
 *    on ne sert pas un relevé qu'aucun filet n'a vu.
 *
 * ⚠️ **CE QUE LE FILET NE PEUT PAS FAIRE.** Il compare des chaînes. Un jeton
 *    ressorti tronqué, ré-encodé en base64 ou haché lui échappe entièrement —
 *    l'ADR 0044 l'écrit, et ce n'est pas moins vrai ici. C'est un **plancher**
 *    de détection ; la vraie protection est {@link ValeurSecrete}, qui empêche
 *    la valeur d'atteindre le texte.
 */
export function servirLeReleve(releve: Releve, jeton?: ValeurSecrete): void {
  const texte = rendreLeReleve(releve);
  const sensibles = valeursSensiblesDeLEnvironnement(jeton);

  // ⚠️ ÉCART ASSUMÉ ET SIGNALÉ : `SortieServie.transport` n'admet que les deux
  //    fils du § 11. Une sonde écrit sur la sortie standard du processus, qui
  //    n'est pas le fil JSON-RPC stdio du socle. `"stdio"` est donc LITTÉRALEMENT
  //    vrai et FAUX au sens du § 11. Fabriquer un second filet pour éviter ce
  //    mensonge de champ aurait refait le défaut que l'ADR 0044 vient de fermer.
  const verdict = verifierAucuneFuite({ transport: "stdio", texte }, sensibles);

  if (verdict.valeursConfrontees === 0) {
    throw new ErreurDeSonde(
      `le filet anti-fuite n'a confronté AUCUNE valeur (${String(verdict.valeursEcartees)} ` +
        `écartée(s) sous ${String(LONGUEUR_MINIMALE_CONFRONTEE)} caractères). Un relevé ` +
        "qu'aucun filet n'a vu n'est pas servi.",
    );
  }
  if (verdict.fuites.length > 0) {
    throw new ErreurDeSonde(
      `le relevé contient ${String(verdict.fuites.length)} valeur(s) sensible(s) : ` +
        `${verdict.fuites.join(", ")}. Il n'est PAS servi. C'est un défaut de la sonde, ` +
        "pas de l'environnement.",
    );
  }

  process.stdout.write(texte);
  process.stdout.write(
    `[filet] ${String(verdict.valeursConfrontees)} valeur(s) sensible(s) confrontée(s), ` +
      `${String(verdict.valeursEcartees)} écartée(s) sous ${String(LONGUEUR_MINIMALE_CONFRONTEE)} ` +
      "caractères, 0 retrouvée dans le relevé.\n",
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  10 · LE POINT D'ENTRÉE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * VRAI QUAND CE MODULE EST LE FICHIER LANCÉ.
 *
 * ⚠️ **IL ÉCHOUE DU CÔTÉ SÛR.** Sans `process.argv[1]` — un `import` depuis un
 *    autre module, une évaluation en mémoire — la réponse est `false`, et la
 *    sonde ne part pas. `ops/conformite-ci.ts` exécute au contraire son corps à
 *    l'import : c'est acceptable pour un contrôle local, et ce ne l'est pas pour
 *    un module qui ouvre une connexion sortante avec un jeton.
 */
export function estLePointDEntree(urlDuModule: string): boolean {
  const lance = process.argv[1];
  if (lance === undefined) return false;
  // ⚠️ **LA CASSE EST REPLIÉE SOUS WINDOWS, ET CE N'EST PAS UN DÉTAIL.** Le
  //    système de fichiers y est insensible à la casse : `adapters\…` tapé au
  //    clavier et le chemin réel désignent le même fichier, et `resolve` ne les
  //    réconcilie pas. Sans ce repli, la sonde se croirait importée, ne partirait
  //    pas — et n'écrirait AUCUN message pour le dire. Une sonde qui ne fait
  //    rien en silence est pire qu'une sonde qui échoue.
  const replier = (chemin: string): string =>
    process.platform === "win32" ? resolve(chemin).toLowerCase() : resolve(chemin);
  return replier(fileURLToPath(urlDuModule)) === replier(lance);
}

/** Une option de ligne de commande, à la forme `--nom=valeur`. */
export function lireOption(nom: string): string | null {
  const prefixe = `--${nom}=`;
  for (const argument of process.argv.slice(2)) {
    if (argument.startsWith(prefixe)) return argument.slice(prefixe.length);
  }
  return null;
}

/** Un drapeau de ligne de commande, à la forme `--nom`. */
export function drapeau(nom: string): boolean {
  return process.argv.slice(2).includes(`--${nom}`);
}

/**
 * LANCE UNE SONDE ET REND UN CODE DE SORTIE.
 *
 * ⚠️ **`RÉFUTÉ` SORT EN 0, ET C'EST LA DÉCISION LA PLUS IMPORTANTE DE CE
 *    FICHIER.** Une sonde qui réfute a **parfaitement fonctionné** : elle a
 *    mesuré, et la mesure dit non. Sortir en 1 ferait d'un résultat une panne,
 *    et la première réaction serait de relancer la sonde au lieu de lire le
 *    relevé. Seule une sonde **empêchée** — réglage absent, relais dans le
 *    dépôt, fuite détectée — sort en 1, parce qu'elle n'a rien mesuré du tout.
 */
export async function lancer(
  sonde: () => Promise<Releve>,
  jetonPourLeFilet?: () => ValeurSecrete | undefined,
): Promise<void> {
  try {
    const releve = await sonde();
    servirLeReleve(releve, jetonPourLeFilet?.());
    process.exitCode = 0;
  } catch (erreur: unknown) {
    const message = erreur instanceof Error ? erreur.message : "erreur inconnue";
    process.stderr.write(`[sonde EMPÊCHÉE] ${message}\n`);
    process.exitCode = 1;
  }
}

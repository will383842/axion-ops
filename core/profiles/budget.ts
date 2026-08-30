/**
 * axion-ops — `core/profiles/budget.ts`
 *
 * LE BUDGET D'OUTILS DU § 14, mesuré. Jamais un booléen.
 *
 * ═══ LES TROIS CORRECTIONS DU § 14, TENUES ICI ═══
 *
 * 1 · LA GARDE BLOQUANTE PORTE SUR LES OCTETS. Aucun tokenizer n'est installé
 *     et `countTokens` du SDK est un appel HTTP. Le plafond appliqué est en
 *     octets UTF-8 du JSON canonique ; la cible en tokens est calibrée UNE FOIS,
 *     HORS CI, par la mesure M5 et un ADR daté NOMMANT LE MODÈLE.
 *
 * 2 · LE PLAFOND DE 40 REÇOIT UN PLANCHER-TÉMOIN. « Le plafond de 40 ne pouvait
 *     pas rougir au régime décrit » : le § 28 liste neuf outils, le § 27 neuf
 *     aussi. Une garde qui mesure zéro outil est verte pour la pire des raisons.
 *     D'où `plancherOutilsExamines`, et `mesureAveugle` dans chaque verdict.
 *
 * 3 · MESURER LA LISTE SERVIE, PAS LA LISTE DÉCLARÉE. `ops_tool.enabled` bascule
 *     en console SANS REDÉPLOIEMENT : la valeur mesurée en CI n'est jamais celle
 *     qui est servie. Le plafond se refuse À L'ÉTAPE 7. D'où `estServi`, et le
 *     fait que ce module ne compte JAMAIS un outil désactivé ou sorti de la
 *     liste.
 *
 * ═══ CE QUE CE MODULE NE FAIT PAS ═══
 *
 * Il ne lit aucune base, n'ouvre aucun fichier, n'appelle personne. On lui donne
 * une liste de définitions ; il rend des NOMBRES et des messages. Le comptage
 * des manifestes lus — la garde du § 09, contrôle 9 — appartient au registre,
 * qui seul sait combien `adapters.lock.json` en annonce. Ce module lui fournit
 * de quoi ne pas mentir : `outilsExamines` et `mesureAveugle`.
 */

import { APPEL_STEPS, type AppelStep, type ErrorCode } from "../types.js";
import { octetsCanoniques } from "./canonique.js";
import { PLAFOND_PROFILS, PROFILES, PROFILE_NAMES, type ProfileName } from "./profiles.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'étape de refus — DÉRIVÉE, jamais recopiée
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'étape du § 11 à laquelle un dépassement de profil se refuse. On la DÉRIVE de
 * `APPEL_STEPS` par sa clé : écrire `7` et `"tool_not_in_profile"` à la main
 * créerait une seconde source de vérité, qui se tairait le jour où la chaîne
 * d'appel gagne une étape.
 */
function etapeDuProfil(): { readonly numero: AppelStep; readonly code: ErrorCode } {
  const etape = APPEL_STEPS.find((candidate) => candidate.cle === "profil");
  if (etape === undefined) {
    throw new Error(
      "core/profiles/budget : aucune étape de clé « profil » dans APPEL_STEPS (§ 11). " +
        "Le budget ne sait plus à quelle étape se refuser — corriger core/types.ts.",
    );
  }
  if (etape.refus === null) {
    throw new Error(
      `core/profiles/budget : l'étape ${String(etape.numero)} « profil » ne porte plus de code ` +
        "de refus (§ 15). Un refus sans code est un refus muet.",
    );
  }
  return { numero: etape.numero, code: etape.refus };
}

const ETAPE_PROFIL = etapeDuProfil();

/** Le numéro d'étape écrit dans `ops_audit.stepDenied` — dérivé du § 11. */
export const ETAPE_REFUS_PROFIL: AppelStep = ETAPE_PROFIL.numero;

/**
 * Le code rendu quand le profil refuse — dérivé du § 11.
 *
 * ⚠️ Il vaut `tool_not_in_profile`, dont le § 15 dit : « Étape 7 — absent du
 *    profil actif ». C'est EXACT pour un outil hors profil, et INEXACT pour un
 *    profil qui déborde son plafond : l'outil y est, c'est le profil qui est
 *    trop plein. Le § 15 n'énumère aucun code pour ce second cas. L'écart est
 *    laissé VISIBLE (voir le rapport de ce module) plutôt que bouché par un code
 *    voisin qui mentirait sur la cause ; en attendant, le MESSAGE distingue les
 *    deux, puisque c'est lui que l'appelant lit.
 */
export const CODE_REFUS_PROFIL: ErrorCode = ETAPE_PROFIL.code;

// ═════════════════════════════════════════════════════════════════════════════
//  Les plafonds
// ═════════════════════════════════════════════════════════════════════════════

/** § 14 — « ≤ 40 outils SERVIS par profil. Refusé à l'étape 7, pas seulement en CI. » */
export const PLAFOND_OUTILS_PAR_PROFIL = 40;

/** § 14 — le plafond ANNONCÉ, en tokens. Il n'est pas mesurable ici. */
export const PLAFOND_TOKENS_DEFINITIONS = 8_000;

/** § 14 — « viser 6,5k pour un plafond annoncé de 8k ». C'est la CIBLE. */
export const CIBLE_TOKENS_DEFINITIONS = 6_500;

/**
 * ⚠️ VALEUR PROVISOIRE, À REMPLACER PAR LA MESURE M5.
 *
 * Le § 14 fixe la cible en TOKENS et applique la garde en OCTETS, sans donner le
 * facteur de conversion : celui-ci est précisément l'objet de M5 — « un
 * `POST /v1/messages/count_tokens` sur le JSON canonique d'un profil, HORS CI,
 * consigné dans un ADR daté NOMMANT LE MODÈLE ». Cette mesure n'a pas eu lieu
 * (aucun appel réseau sortant sur ce chantier), et une garde sans seuil n'existe
 * pas. D'où une valeur provisoire, choisie FAIL-CLOSED :
 *
 *  · un ratio BAS rend le plafond en octets PLUS SEVÈRE ;
 *  · du JSON dense — accolades, guillemets, deux-points, identifiants courts —
 *    se découpe en tokens très courts ; 3 octets par token est déjà généreux
 *    pour la partie schéma, et serré pour la prose française des `description`.
 *
 * Le jour où M5 est faite, UNE SEULE LIGNE change ici, et l'ADR la date.
 */
export const RATIO_OCTETS_PAR_TOKEN_PROVISOIRE = 3;

/**
 * LE PLAFOND APPLIQUÉ, en octets UTF-8 du JSON canonique des définitions
 * SERVIES d'un profil : 6 500 × 3 = 19 500.
 *
 * ⚠️ CONSÉQUENCE À DIRE TOUT HAUT : rapporté aux 40 outils du premier plafond,
 *    cela laisse 487 octets par définition — nom, description, schéma d'entrée
 *    et schéma de sortie compris. Les deux plafonds du § 14 NE SONT PAS
 *    INDÉPENDANTS : à ce régime, c'est celui des octets qui mord le premier, et
 *    de loin. Ce n'est pas un choix de ce module, c'est l'arithmétique du § 14
 *    lui-même (8k tokens pour 40 outils = 200 tokens par définition).
 */
export const PLAFOND_OCTETS_DEFINITIONS =
  CIBLE_TOKENS_DEFINITIONS * RATIO_OCTETS_PAR_TOKEN_PROVISOIRE;

/**
 * Le plafond en octets pour un ratio donné. C'est ce point d'entrée que l'ADR de
 * M5 appellera, pour qu'aucun nombre ne soit à recalculer à la main.
 */
export function plafondOctetsDepuisRatio(
  ratioOctetsParToken: number,
  cibleTokens: number = CIBLE_TOKENS_DEFINITIONS,
): number {
  if (!Number.isFinite(ratioOctetsParToken) || ratioOctetsParToken <= 0) {
    throw new Error(
      `Ratio octets/token invalide : ${String(ratioOctetsParToken)}. ` +
        "M5 doit rendre un nombre fini strictement positif.",
    );
  }
  return Math.floor(cibleTokens * ratioOctetsParToken);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Ce qu'on mesure
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une définition d'outil, telle que `ops_tool` la porte (§ 12) et telle que
 * `tools/list` la sert.
 *
 * Aucun champ n'a de valeur par défaut permissive — § 09, harnais, contrôle 1.
 * `enabled` et `retireDeLaListe` sont OBLIGATOIRES : un défaut « exposé » ferait
 * entrer au budget un outil que personne n'a activé.
 */
export interface DefinitionOutil {
  /** Préfixé par l'id de l'adaptateur : `inbox.recent` sous `axionia` (§ 09). */
  readonly name: string;
  /** § 13.4 — la version est portée par l'OUTIL, pas par l'adaptateur. */
  readonly version: string;
  /** § 09 — obligatoire, journalisée, COMPTÉE AU BUDGET. */
  readonly description: string;
  /** JSON Schema draft 2020-12, FERMÉ (`additionalProperties: false`). */
  readonly inputSchema: unknown;
  /** JSON Schema de la forme NON compactée (§ 13.3). */
  readonly outputSchema: unknown;
  /** Typé sur l'énumération fermée : un profil inconnu ne compile pas. */
  readonly profiles: readonly ProfileName[];
  /** § 14, correction 3 — bascule de console, SANS redéploiement. */
  readonly enabled: boolean;
  /**
   * § 13.4 — « une version dépréciée SORT DE `tools/list` dès la publication de
   * v2 et reste appelable six mois. LE BUDGET COMPTE LES OUTILS EXPOSÉS. » Un
   * outil sorti de la liste ne pèse plus rien dans le contexte du modèle : il ne
   * compte pas.
   */
  readonly retireDeLaListe: boolean;
}

/**
 * LA PROJECTION SERVIE — ce qui, d'une définition, part réellement dans le
 * contexte du modèle, et donc ce qui se mesure.
 *
 * ⚠️ Le § 11 dit que « la révision courante de la spécification MCP doit être
 *    RELUE AU LOT 1 » et qu'aucun document du dossier ne fait autorité sur son
 *    numéro. Les champs exacts d'une entrée `tools/list` en dépendent —
 *    `outputSchema` notamment. La projection par défaut les inclut TOUS :
 *    surestimer le poids est fail-closed, le sous-estimer ne l'est pas. Elle est
 *    remplaçable par option, pour que la relecture de la spécification se règle
 *    en un seul endroit.
 */
export function projectionServieParDefaut(outil: DefinitionOutil): unknown {
  return {
    name: outil.name,
    description: outil.description,
    inputSchema: outil.inputSchema,
    outputSchema: outil.outputSchema,
  };
}

/** Options de mesure. Chaque valeur par défaut est le plafond du § 14. */
export interface OptionsBudget {
  readonly plafondOutils?: number;
  readonly plafondOctets?: number;
  /**
   * Plancher-témoin : sous ce nombre d'outils EXAMINÉS, le verdict est marqué
   * `mesureAveugle`. Vaut 1 par défaut — une mesure portant sur zéro outil est
   * une garde qui ne regarde rien, et il faut le DIRE pour l'admettre.
   */
  readonly plancherOutilsExamines?: number;
  readonly projection?: (outil: DefinitionOutil) => unknown;
}

/** Une règle enfreinte, avec le nombre mesuré ET le plafond. Jamais un booléen. */
export interface Anomalie {
  readonly regle: "outils" | "octets" | "profils" | "mesure-aveugle";
  readonly mesure: number;
  readonly plafond: number;
  /** Le message rendu à l'appelant : il DIT le nombre compté (§ 15). */
  readonly message: string;
}

/** Le poids d'une définition, outil par outil. Alimente `ops_tool.bytes`. */
export interface PoidsOutil {
  readonly name: string;
  readonly version: string;
  readonly octets: number;
}

/** Le verdict d'un profil. Tout y est un NOMBRE, pas un jugement. */
export interface VerdictBudget {
  readonly profil: ProfileName;
  /** Combien de définitions ont été SOUMISES à la mesure. */
  readonly outilsExamines: number;
  /** Combien, parmi elles, sont SERVIES dans ce profil. C'est le compte du § 14. */
  readonly outilsComptes: number;
  /** Octets UTF-8 du JSON canonique de la LISTE servie, séparateurs compris. */
  readonly octetsMesures: number;
  readonly plafondOutils: number;
  readonly plafondOctets: number;
  /** Vrai si un PLAFOND est dépassé. N'inclut pas `mesureAveugle`. */
  readonly depasse: boolean;
  /** Vrai si la mesure a porté sur moins d'outils que le plancher-témoin. */
  readonly mesureAveugle: boolean;
  /** Toutes les règles enfreintes, `mesure-aveugle` comprise. */
  readonly anomalies: readonly Anomalie[];
  /** Le poids par outil, décroissant : de quoi montrer le coupable à l'écran. */
  readonly poids: readonly PoidsOutil[];
  /** § 11 — le numéro écrit dans `ops_audit.stepDenied`. */
  readonly etapeDeRefus: AppelStep;
  /** § 15 — le code rendu à l'appelant. */
  readonly codeDeRefus: ErrorCode;
}

// ═════════════════════════════════════════════════════════════════════════════
//  La mesure
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un outil est SERVI dans un profil s'il y est rattaché, qu'il est activé en
 * console, et qu'il n'est pas sorti de `tools/list`. Les trois conditions, pas
 * une de moins : c'est la correction 3 du § 14.
 */
export function estServi(outil: DefinitionOutil, profil: ProfileName): boolean {
  return outil.enabled && !outil.retireDeLaListe && outil.profiles.includes(profil);
}

/** Les définitions servies dans ce profil, triées par nom — mesure déterministe. */
export function outilsServis(
  outils: readonly DefinitionOutil[],
  profil: ProfileName,
): readonly DefinitionOutil[] {
  return outils
    .filter((outil) => estServi(outil, profil))
    .slice()
    .sort((a, b) => {
      if (a.name !== b.name) return a.name < b.name ? -1 : 1;
      return a.version < b.version ? -1 : a.version > b.version ? 1 : 0;
    });
}

/**
 * Le poids en octets d'UNE définition servie. C'est cette valeur que
 * `ops_tool.bytes` stocke (§ 12).
 */
export function octetsDeLaDefinition(
  outil: DefinitionOutil,
  projection: (outil: DefinitionOutil) => unknown = projectionServieParDefaut,
): number {
  return octetsCanoniques(projection(outil), `$.${outil.name}`);
}

/**
 * MESURE UN PROFIL. Rend le verdict complet — le nombre d'outils comptés, le
 * nombre d'octets mesurés, les plafonds, et les messages qui DISENT ces nombres.
 *
 * Jamais un booléen : « le profil dépasse » sans le compte ne dit ni de combien,
 * ni sur quoi la mesure a porté, ni si elle a porté sur quoi que ce soit.
 */
export function mesurerBudgetProfil(
  profil: ProfileName,
  outils: readonly DefinitionOutil[],
  options: OptionsBudget = {},
): VerdictBudget {
  const plafondOutils = options.plafondOutils ?? PLAFOND_OUTILS_PAR_PROFIL;
  const plafondOctets = options.plafondOctets ?? PLAFOND_OCTETS_DEFINITIONS;
  const plancher = options.plancherOutilsExamines ?? 1;
  const projection = options.projection ?? projectionServieParDefaut;

  const servis = outilsServis(outils, profil);

  // Le JSON canonique de la LISTE, pas la somme des définitions : c'est la liste
  // qui part sur le fil, crochets et virgules compris.
  const octetsMesures = octetsCanoniques(
    servis.map((outil) => projection(outil)),
    `$.${profil}`,
  );

  const poids = servis
    .map((outil) => ({
      name: outil.name,
      version: outil.version,
      octets: octetsDeLaDefinition(outil, projection),
    }))
    .sort((a, b) => b.octets - a.octets);

  const anomalies: Anomalie[] = [];

  if (servis.length > plafondOutils) {
    anomalies.push({
      regle: "outils",
      mesure: servis.length,
      plafond: plafondOutils,
      message:
        `Profil « ${profil} » : ${String(servis.length)} outils SERVIS, plafond ${String(plafondOutils)} ` +
        `(${String(servis.length - plafondOutils)} de trop). ` +
        `Mesure faite sur ${String(outils.length)} définitions soumises. ` +
        "Retirer un outil du profil, ou le désactiver en console (§ 14).",
    });
  }

  if (octetsMesures > plafondOctets) {
    const plusLourd = poids[0];
    anomalies.push({
      regle: "octets",
      mesure: octetsMesures,
      plafond: plafondOctets,
      message:
        `Profil « ${profil} » : ${String(octetsMesures)} octets UTF-8 de définitions servies, ` +
        `plafond ${String(plafondOctets)} (${String(octetsMesures - plafondOctets)} de trop), ` +
        `sur ${String(servis.length)} outils. ` +
        (plusLourd === undefined
          ? ""
          : `Le plus lourd : « ${plusLourd.name} » à ${String(plusLourd.octets)} octets. `) +
        `Plafond dérivé de ${String(CIBLE_TOKENS_DEFINITIONS)} tokens × ` +
        `${String(RATIO_OCTETS_PAR_TOKEN_PROVISOIRE)} octets/token — RATIO PROVISOIRE, à fixer par M5.`,
    });
  }

  const mesureAveugle = outils.length < plancher;
  if (mesureAveugle) {
    anomalies.push({
      regle: "mesure-aveugle",
      mesure: outils.length,
      plafond: plancher,
      message:
        `Profil « ${profil} » : la mesure a porté sur ${String(outils.length)} définitions, ` +
        `plancher-témoin ${String(plancher)}. Une garde qui mesure zéro élément est VERTE POUR LA ` +
        "PIRE DES RAISONS (§ 14). Vérifier que les manifestes sont bien chargés.",
    });
  }

  return {
    profil,
    outilsExamines: outils.length,
    outilsComptes: servis.length,
    octetsMesures,
    plafondOutils,
    plafondOctets,
    depasse: anomalies.some((anomalie) => anomalie.regle !== "mesure-aveugle"),
    mesureAveugle,
    anomalies,
    poids,
    etapeDeRefus: ETAPE_REFUS_PROFIL,
    codeDeRefus: CODE_REFUS_PROFIL,
  };
}

/** Le verdict de TOUS les profils, plus la règle qui porte sur leur nombre. */
export interface VerdictGlobal {
  /** Combien de profils l'énumération porte — le compte de la garde. */
  readonly profilsMesures: number;
  /** Combien de définitions ont été soumises. */
  readonly outilsExamines: number;
  readonly verdicts: readonly VerdictBudget[];
  readonly depasse: boolean;
  readonly mesureAveugle: boolean;
  readonly anomalies: readonly Anomalie[];
}

/**
 * La règle du NOMBRE de profils, isolée pour qu'un TÉMOIN puisse la faire
 * rougir.
 *
 * ⚠️ Elle vivait en ligne dans `mesurerTousLesProfils()`, comparant la constante
 *    de module `PROFILES.length` à `PLAFOND_PROFILS`. Aucun appelant ne pouvait
 *    donc lui soumettre autre chose que les quatre profils réels : la règle
 *    était structurellement INFAILLIBLE, et le seul test qui la visait prouvait
 *    seulement qu'elle NE se déclenche PAS. Le témoin à sept profils du fichier
 *    `profiles.spec.ts` exerçait, lui, une RÉIMPLÉMENTATION écrite dans le test
 *    — il ne disait donc rien de ce code-ci.
 *
 * Le nombre est maintenant un PARAMÈTRE : `mesurerTousLesProfils()` lui passe
 * `PROFILES.length`, et une garde peut lui passer sept.
 *
 * @returns l'anomalie, ou `null` quand le nombre tient sous le plafond.
 */
export function verifierNombreDeProfils(
  nombreDeProfils: number,
  plafond: number = PLAFOND_PROFILS,
): Anomalie | null {
  if (nombreDeProfils <= plafond) return null;
  return {
    regle: "profils",
    mesure: nombreDeProfils,
    plafond,
    message:
      `L'énumération porte ${String(nombreDeProfils)} profils, plafond ${String(plafond)}. ` +
      "Chaque profil est une surface de plus à raisonner au § 20 et un jeu de définitions " +
      "de plus à tenir sous le budget du § 14.",
  };
}

/**
 * MESURE TOUS LES PROFILS. La liste des profils est DÉRIVÉE de l'énumération :
 * un profil ajouté est mesuré sans qu'aucune liste ne soit à retoucher.
 */
export function mesurerTousLesProfils(
  outils: readonly DefinitionOutil[],
  options: OptionsBudget = {},
): VerdictGlobal {
  const verdicts = PROFILE_NAMES.map((profil) => mesurerBudgetProfil(profil, outils, options));

  const anomalies: Anomalie[] = verdicts.flatMap((verdict) => verdict.anomalies);

  const anomalieDuNombre = verifierNombreDeProfils(PROFILES.length);
  if (anomalieDuNombre !== null) anomalies.push(anomalieDuNombre);

  return {
    profilsMesures: PROFILE_NAMES.length,
    outilsExamines: outils.length,
    verdicts,
    depasse: anomalies.some((anomalie) => anomalie.regle !== "mesure-aveugle"),
    mesureAveugle: verdicts.some((verdict) => verdict.mesureAveugle),
    anomalies,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  « Réduit strictement » — § 20, règle de tri des commandes hors modèle
// ═════════════════════════════════════════════════════════════════════════════

/**
 * § 20 : « une commande hors modèle n'est admise SANS FACTEUR que si elle RÉDUIT
 * STRICTEMENT l'ensemble des outils exposés ».
 *
 * Cette fonction répond à la question, sur les ensembles SERVIS — pas sur les
 * comptes. Deux profils de vingt outils chacun peuvent n'avoir aucun outil
 * commun : comparer les tailles laisserait passer un élargissement complet de la
 * surface sous couvert de « pas plus d'outils qu'avant ».
 *
 * Rend AUSSI les comptes et ce qui est GAGNÉ, parce que c'est ce gain qui décide
 * du facteur TOTP, et que le journal doit pouvoir le dire.
 */
export function reduitStrictement(
  depuis: ProfileName,
  vers: ProfileName,
  outils: readonly DefinitionOutil[],
): {
  readonly reduitStrictement: boolean;
  readonly avant: number;
  readonly apres: number;
  readonly gagnes: readonly string[];
  readonly perdus: readonly string[];
  readonly outilsExamines: number;
} {
  const avant = new Set(outilsServis(outils, depuis).map((outil) => outil.name));
  const apres = new Set(outilsServis(outils, vers).map((outil) => outil.name));

  const gagnes = [...apres].filter((nom) => !avant.has(nom)).sort();
  const perdus = [...avant].filter((nom) => !apres.has(nom)).sort();

  return {
    // Strict : aucun outil gagné, ET au moins un perdu. Un changement qui ne
    // retire rien n'a rien réduit — il ne se dispense donc pas du facteur.
    reduitStrictement: gagnes.length === 0 && perdus.length > 0,
    avant: avant.size,
    apres: apres.size,
    gagnes,
    perdus,
    outilsExamines: outils.length,
  };
}

/**
 * Le profil qui expose LE MOINS d'outils, à égalité départagée par l'ordre de
 * l'énumération.
 *
 * MOTIF : le § 20 donne un niveau de repli à la POLITIQUE (`brouillon`,
 * fail-closed) et n'en donne AUCUN au profil, alors qu'`ops_runtime.activeProfile`
 * est une colonne `String` libre qu'une corruption, une migration ou un
 * manifeste périmé peut rendre illisible. Plutôt que d'élire un profil de repli
 * à la main — ce que le CDC ne tranche pas — on le DÉRIVE de la surface
 * réellement servie, à l'instant où la question se pose.
 */
export function profilLeMoinsExposant(outils: readonly DefinitionOutil[]): {
  readonly profil: ProfileName;
  readonly outilsComptes: number;
  readonly outilsExamines: number;
} {
  let meilleur: { profil: ProfileName; outilsComptes: number } | undefined;

  for (const profil of PROFILE_NAMES) {
    const comptes = outilsServis(outils, profil).length;
    if (meilleur === undefined || comptes < meilleur.outilsComptes) {
      meilleur = { profil, outilsComptes: comptes };
    }
  }

  if (meilleur === undefined) {
    throw new Error(
      "core/profiles/budget : l'énumération des profils est VIDE. " +
        "Aucun profil de repli ne peut être dérivé — corriger core/profiles/profiles.ts.",
    );
  }

  return {
    profil: meilleur.profil,
    outilsComptes: meilleur.outilsComptes,
    outilsExamines: outils.length,
  };
}

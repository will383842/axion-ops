/**
 * core/policy/effet.ts — LE CATALOGUE DES EFFETS EXTÉRIEURS, et la décision de
 * l'étape 10.
 *
 * § 20, « ce qui compte comme effet extérieur ». LE TEST : *quelqu'un d'autre
 * que moi peut-il s'en apercevoir ?*
 *   · Envoyer ou transférer un courrier.
 *   · Poser un événement dans l'agenda — ça ferme le créneau Calendly
 *     correspondant en ~11 secondes, donc retire une réservation possible à un
 *     prospect.
 *   · Répondre à un message de la console : `message.repondre` est un `send`,
 *     pas un brouillon.
 *   · Publier un gabarit, changer un statut visible du client, déclencher une
 *     file d'envoi.
 */

import {
  APPEL_STEPS,
  EFFECTS,
  type AppelStep,
  type Effect,
  type ErrorCode,
  type PolicyLevel,
} from "../types.js";

/** Le compilateur ne doit jamais laisser passer un `Effect` non traité. */
function jamais(valeur: never): never {
  throw new Error(`effet non traité : ${JSON.stringify(valeur)}`);
}

/**
 * Cet effet est-il un EFFET EXTÉRIEUR au sens du § 20 ?
 *
 * ⚠️ POURQUOI UN `switch` EXHAUSTIF ET NON UNE DÉRIVATION PAR RANG.
 *    « Dériver, jamais recopier » interdit d'écrire `["send", "destructive"]`.
 *    Mais `EFFECTS` n'est pas déclaré ORDONNÉ dans `core/types.ts` — la
 *    Fondation le dit explicitement de `DATA_CLASSES` et de `POLICY_LEVELS`, et
 *    ne le dit PAS de `EFFECTS`. Dériver « extérieur = rang ≥ celui de send »
 *    s'appuierait donc sur un ordre que personne ne garantit : réordonner le
 *    tableau bougerait la frontière EN SILENCE.
 *    Un `switch` exhaustif est plus fort qu'une dérivation par rang : ajouter un
 *    effet à `EFFECTS` sans le classer ici est une ERREUR DE COMPILATION, pas
 *    une mauvaise réponse à l'exécution. C'est une TOTALITÉ, pas une liste.
 */
export function estEffetExterieur(effet: Effect): boolean {
  switch (effet) {
    case "read":
      // Lire ne se voit pas de l'extérieur. Mais lire du `personal` MARQUE la
      // session : c'est l'étape 11, pas celle-ci.
      return false;
    case "write-draft":
      // Écriture réversible. Le niveau `brouillon` l'autorise, et `libre` ne
      // dispense JAMAIS de la relecture humaine du brouillon (§ 20).
      return false;
    case "send":
      return true;
    case "destructive":
      return true;
    default:
      return jamais(effet);
  }
}

/**
 * Cet effet exige-t-il une confirmation À TOUS LES NIVEAUX, `libre` compris ?
 *
 * § 19.2, ligne `destructive` : « assujetti à `ops:send` ET à une confirmation
 * systématique, à tous les niveaux, `libre` compris ». C'est la seule exception
 * au tableau du § 20, et elle porte sur la seule famille d'opérations que la
 * relecture d'un brouillon ne rattrape pas.
 */
export function exigeConfirmationSystematique(effet: Effect): boolean {
  switch (effet) {
    case "read":
    case "write-draft":
    case "send":
      return false;
    case "destructive":
      return true;
    default:
      return jamais(effet);
  }
}

/** Les effets extérieurs, DÉRIVÉS de `EFFECTS` par la totalité ci-dessus. */
export function effetsExterieurs(): readonly Effect[] {
  return EFFECTS.filter(estEffetExterieur);
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'étape 10 de la chaîne d'appel
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'étape de politique — c'est elle qu'`ops_audit.stepDenied` porte.
 *
 * ⚠️ DÉRIVÉE DU TABLEAU DES ÉTAPES, PAS ÉCRITE EN DUR. Le § 11 prévient
 *    lui-même que la v5 avait « deux étapes dans le mauvais ordre » : le jour
 *    où l'on renumérote, un `10` écrit à la main ferait inscrire un
 *    `stepDenied` périmé dans `ops_audit`, sans qu'aucun type ne bronche.
 *    `core/profiles/budget.ts` dérive déjà le sien de la même façon ; les deux
 *    modules répondent maintenant par le même chemin.
 *
 * Le CODE de refus, lui, reste choisi par la décision (`policy_denied` ou
 * `confirmation_required`) : ce n'est pas la table des étapes qui tranche.
 */
export const ETAPE_POLITIQUE: AppelStep = etapeDeLaPolitique();

function etapeDeLaPolitique(): AppelStep {
  const etape = APPEL_STEPS.find((candidate) => candidate.cle === "politique");
  if (etape === undefined) {
    throw new Error(
      "core/policy/effet : aucune étape de clé « politique » dans APPEL_STEPS (§ 11). " +
        "La politique ne sait plus à quelle étape se refuser — corriger core/types.ts.",
    );
  }
  return etape.numero;
}

/**
 * L'état de la confirmation présentée avec l'appel.
 *
 * ⚠️ `absente` et `invalide` mènent au MÊME code (`confirmation_required`), mais
 *    ils ne mènent pas au même journal : un jeton invalide, c'est soit un rejeu,
 *    soit une cible changée entre l'émission et l'appel. Les confondre effacerait
 *    la signature d'une injection à demi réussie (§ 15, troisième règle).
 */
export const ETATS_CONFIRMATION = ["absente", "valide", "invalide"] as const;

export type EtatConfirmation = (typeof ETATS_CONFIRMATION)[number];

/** Ce que le refus dit de la cible — et RIEN d'autre. Jamais le jeton (§ 20). */
export interface CiblePublique {
  readonly tool: string;
  /** L'empreinte des arguments, PAS les arguments : `argHash` est un HMAC. */
  readonly argHash: string;
}

export type DecisionPolitique =
  | { readonly decision: "autorise" }
  | {
      readonly decision: "refuse";
      readonly code: Extract<ErrorCode, "policy_denied" | "confirmation_required">;
      readonly etape: typeof ETAPE_POLITIQUE;
      readonly niveau: PolicyLevel;
      readonly cible: CiblePublique;
      /** Dit toujours ce qu'il faut faire ensuite (§ 15, deuxième règle). */
      readonly message: string;
    };

export interface DemandeEtape10 {
  readonly effet: Effect;
  readonly niveau: PolicyLevel;
  readonly confirmation: EtatConfirmation;
  readonly cible: CiblePublique;
}

/**
 * La décision de l'étape 10, en fonction PURE. Rien d'asynchrone, rien de
 * secret, rien à journaliser ici : la vérification du jeton se fait dans
 * `confirmation.ts`, et son résultat arrive en `confirmation`.
 *
 * Le tableau du § 20 :
 *   · `brouillon` — lecture et écriture réversible, AUCUN effet extérieur ;
 *   · `confirmé`  — effets extérieurs avec jeton de confirmation à usage unique ;
 *   · `libre`     — effets extérieurs sans confirmation PAR APPEL.
 * Plus la ligne `destructive` du § 19.2 : confirmation systématique, `libre`
 * compris.
 *
 * ⚠️ LE JETON NE FIGURE JAMAIS DANS LA RÉPONSE. La signature de cette fonction
 *    ne le reçoit même pas : on ne peut pas laisser fuir ce qu'on n'a pas.
 */
export function deciderEtape10(demande: DemandeEtape10): DecisionPolitique {
  const { effet, niveau, confirmation, cible } = demande;

  if (!estEffetExterieur(effet)) {
    // `read` et `write-draft` passent à tous les niveaux, `brouillon` compris.
    return { decision: "autorise" };
  }

  if (niveau === "brouillon") {
    return {
      decision: "refuse",
      code: "policy_denied",
      etape: ETAPE_POLITIQUE,
      niveau,
      cible,
      message:
        `Niveau courant « brouillon » : aucun effet extérieur. L'outil « ${cible.tool} » ` +
        `porte l'effet « ${effet} ». Pour l'autoriser, desserrez la politique vers ` +
        `« confirmé » ou « libre » depuis la console (second facteur et durée obligatoires).`,
    };
  }

  const confirmationExigee = niveau === "confirmé" || exigeConfirmationSystematique(effet);

  if (!confirmationExigee) {
    return { decision: "autorise" };
  }

  if (confirmation === "valide") {
    return { decision: "autorise" };
  }

  const pourquoi =
    exigeConfirmationSystematique(effet) && niveau === "libre"
      ? `L'effet « ${effet} » exige une confirmation à TOUS les niveaux, « libre » compris.`
      : `Niveau courant « ${niveau} » : tout effet extérieur exige une confirmation.`;

  const suite =
    confirmation === "invalide"
      ? "La confirmation présentée ne vaut pas pour cet appel (usage unique, courte durée, liée à cette empreinte d'arguments). Demandez-en une nouvelle depuis la console."
      : "Demandez une confirmation depuis la console pour cette cible exacte.";

  return {
    decision: "refuse",
    code: "confirmation_required",
    etape: ETAPE_POLITIQUE,
    niveau,
    cible,
    message: `${pourquoi} ${suite}`,
  };
}

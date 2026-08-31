/**
 * `core/transport/http/enveloppe.ts` — **JSON-RPC 2.0, ET RIEN QUE L'ENVELOPPE.**
 *
 * § 11 : « Transport — Streamable HTTP, JSON-RPC 2.0, sur `POST /api/mcp`. SSE
 * déprécié. Primitives — une seule en v1 : `tools`. »
 *
 * ═══ CE QUE CE MODULE DÉCIDE, ET CE QU'IL NE DÉCIDE PAS ═══
 *
 * Il décide de la FORME : une enveloppe conforme, un `id` corrélable, une
 * méthode connue, des paramètres de la bonne forme. Il ne décide de RIEN
 * d'autre — pas de la validité de la charge (étape 8), pas de l'existence de
 * l'outil (étape 6), pas des droits (étape 5). Ce partage est la raison d'être
 * de la chaîne : une enveloppe bien formée qui demande un outil inexistant est
 * un refus d'ÉTAPE 6, journalisé, pas une erreur de protocole.
 *
 * ⚠️ **L'`id` DE L'ENVELOPPE N'EST PAS, ET NE DEVIENT JAMAIS, LE `requestId` DU
 *    SOCLE.** `STATUT_DES_CANAUX_DE_CONTEXTE.requestId` (`core/types.ts`) le
 *    range parmi les canaux « à fermer au transport » et écrit le motif :
 *    « FRAPPÉ par le socle, jamais recopié d'un en-tête client ni de l'`id`
 *    d'une enveloppe JSON-RPC ». Un identifiant de corrélation choisi par
 *    l'appelant lui permet de faire converger deux appels dans la même ligne,
 *    ou d'en faire diverger un seul. L'`id` ne sert donc qu'à une chose, celle
 *    que le protocole lui donne : renvoyer la réponse en face de la question.
 *    Il ne quitte jamais ce module vers l'aval.
 *
 * ⚠️ **`_meta` PORTE LES TROIS VALEURS DU SOCLE, ET `arguments` N'EN PORTE
 *    AUCUNE.** Le § 20 exige que la clé d'idempotence voyage HORS d'`input` — la
 *    v5 la rendait obligatoire sur `zoho.mail.send` alors qu'aucun champ ne la
 *    transportait. Le curseur (§ 13.1) et le jeton de confirmation (§ 20)
 *    suivent le même chemin, pour le même motif : ce sont des valeurs de
 *    PROTOCOLE, et un schéma d'entrée `.strict()` les refuserait — à juste titre.
 *    `_meta` est l'emplacement d'extension prévu par MCP ; le préfixe
 *    {@link PREFIXE_META_SOCLE} évite de piétiner celui d'un autre.
 */

import type { AppelEntrant } from "../../chaine/orchestrateur.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE VOCABULAIRE DE L'ENVELOPPE
// ═════════════════════════════════════════════════════════════════════════════

/** La seule version du protocole admise. */
export const VERSION_JSON_RPC = "2.0";

/** La seule méthode servie en v1. Voir « les bornes », plus bas. */
export const METHODE_APPEL_OUTIL = "tools/call";

/** Le préfixe des clés de `_meta` que le socle lit. */
export const PREFIXE_META_SOCLE = "ops/";

/** Les trois valeurs du socle qui voyagent dans `_meta`, jamais dans `arguments`. */
export const CLES_META_DU_SOCLE = {
  idempotence: `${PREFIXE_META_SOCLE}idempotencyKey`,
  curseur: `${PREFIXE_META_SOCLE}cursor`,
  confirmation: `${PREFIXE_META_SOCLE}confirmationToken`,
} as const;

/**
 * LES CODES JSON-RPC 2.0. Ils ne remplacent pas les codes du § 15 : ils
 * qualifient l'ENVELOPPE, quand le § 15 qualifie l'APPEL. Une enveloppe illisible
 * n'a pas d'étape à refuser, donc pas de code du § 15 à rendre.
 */
export const CODES_JSON_RPC = {
  analyseImpossible: -32700,
  requeteInvalide: -32600,
  methodeInconnue: -32601,
  parametresInvalides: -32602,
  erreurInterne: -32603,
} as const;

/** L'`id` d'une enveloppe. `null` est licite en JSON-RPC 2.0 (notification). */
export type IdJsonRpc = string | number | null;

/** L'issue d'une lecture d'enveloppe. Union FERMÉE. */
export type LectureDEnveloppe =
  | { readonly genre: "appel"; readonly id: IdJsonRpc; readonly appel: AppelEntrant }
  | {
      readonly genre: "refus";
      /** `null` quand l'enveloppe est si mal formée qu'aucun `id` n'en sort. */
      readonly id: IdJsonRpc;
      readonly codeJsonRpc: number;
      readonly message: string;
    };

// ═════════════════════════════════════════════════════════════════════════════
//  LES LECTEURS DE FORME — aucun `any`, aucune conversion forcée
// ═════════════════════════════════════════════════════════════════════════════

function estObjet(valeur: unknown): valeur is Readonly<Record<string, unknown>> {
  return typeof valeur === "object" && valeur !== null && !Array.isArray(valeur);
}

/**
 * Lit une chaîne facultative d'un objet.
 *
 * ⚠️ **UNE VALEUR PRÉSENTE MAIS DU MAUVAIS TYPE N'EST PAS `null`.** Rendre
 *    `null` pour un `42` reçu là où une chaîne est attendue ferait passer une
 *    erreur d'appelant pour une absence : la clé d'idempotence disparaîtrait en
 *    silence, et l'étape 13 protégerait un appel qu'elle croit sans clé. La
 *    fonction distingue donc les deux, et l'appelant refuse l'enveloppe.
 */
function chaineFacultative(
  source: Readonly<Record<string, unknown>>,
  cle: string,
): { readonly ok: true; readonly valeur: string | null } | { readonly ok: false } {
  const brute: unknown = source[cle];
  if (brute === undefined || brute === null) return { ok: true, valeur: null };
  if (typeof brute !== "string") return { ok: false };
  return { ok: true, valeur: brute };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA LECTURE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LIT UNE ENVELOPPE JSON-RPC ET EN TIRE UN {@link AppelEntrant}.
 *
 * ⚠️ **CETTE FONCTION NE S'EXÉCUTE QU'APRÈS LES ÉTAPES 1 À 4.** C'est le sens de
 *    l'étape 1 (§ 11, « avant tout traitement ») : un analyseur JSON est une
 *    surface d'attaque, et un hôte non autorisé ne doit jamais l'atteindre.
 *    `transport.ts` tient cet ordre par construction — il reçoit le corps sous
 *    la forme d'une fonction, qu'il n'appelle qu'ici.
 *
 * ⚠️ **AUCUN MESSAGE D'ERREUR NE RECOPIE UNE VALEUR REÇUE.** Le corps d'une
 *    requête peut porter n'importe quoi, y compris une donnée personnelle ou un
 *    secret d'un autre système ; le § 15 interdit qu'une erreur le fasse fuir.
 *    Les messages disent le CHAMP et la FORME attendue, jamais ce qui a été lu —
 *    et `reponse.ts` pose un dernier filet qui confronte la réponse aux valeurs
 *    sensibles de l'appel.
 */
export function lireLEnveloppe(corpsBrut: string): LectureDEnveloppe {
  let brut: unknown;
  try {
    brut = JSON.parse(corpsBrut);
  } catch {
    // La cause exacte de l'échec d'analyse n'est pas rendue : elle cite
    // systématiquement un fragment du corps (« Unexpected token … in JSON at
    // position … »), et c'est précisément ce qui ne doit pas sortir.
    return {
      genre: "refus",
      id: null,
      codeJsonRpc: CODES_JSON_RPC.analyseImpossible,
      message: "Corps illisible : un objet JSON-RPC 2.0 est attendu.",
    };
  }

  if (!estObjet(brut)) {
    return {
      genre: "refus",
      id: null,
      codeJsonRpc: CODES_JSON_RPC.requeteInvalide,
      message: "L'enveloppe doit être un objet JSON, ni un tableau ni une valeur simple.",
    };
  }

  // L'`id` est extrait AVANT tout autre reproche, pour que la réponse d'erreur
  // reste corrélable. Une forme d'`id` invalide vaut `null` : le protocole ne
  // permet pas de renvoyer un `id` qu'on n'a pas su lire.
  const idBrut: unknown = brut["id"];
  const id: IdJsonRpc = typeof idBrut === "string" || typeof idBrut === "number" ? idBrut : null;

  if (brut["jsonrpc"] !== VERSION_JSON_RPC) {
    return {
      genre: "refus",
      id,
      codeJsonRpc: CODES_JSON_RPC.requeteInvalide,
      message: `Le champ « jsonrpc » doit valoir « ${VERSION_JSON_RPC} ».`,
    };
  }

  const methode: unknown = brut["method"];
  if (typeof methode !== "string") {
    return {
      genre: "refus",
      id,
      codeJsonRpc: CODES_JSON_RPC.requeteInvalide,
      message: "Le champ « method » doit être une chaîne.",
    };
  }
  if (methode !== METHODE_APPEL_OUTIL) {
    // ⚠️ BORNE ÉCRITE AVEC LA MESURE : `tools/list` n'est pas servi par ce lot.
    //    Le § 11 l'exige (« la liste est relue à chaque `tools/list` »), et le
    //    noyau unique ne l'expose pas — `NoyauUnique` rend un `ResultatAppel`,
    //    c'est-à-dire l'issue d'un APPEL D'OUTIL. Servir la liste demande un
    //    second port, donc une décision sur ce qu'une liste journalise. Écart
    //    signalé au rapport plutôt que comblé par une supposition.
    return {
      genre: "refus",
      id,
      codeJsonRpc: CODES_JSON_RPC.methodeInconnue,
      message: `Méthode inconnue. Seule « ${METHODE_APPEL_OUTIL} » est servie.`,
    };
  }

  const parametres: unknown = brut["params"];
  if (!estObjet(parametres)) {
    return {
      genre: "refus",
      id,
      codeJsonRpc: CODES_JSON_RPC.parametresInvalides,
      message: "Le champ « params » doit être un objet.",
    };
  }

  const nom: unknown = parametres["name"];
  if (typeof nom !== "string" || nom.length === 0) {
    return {
      genre: "refus",
      id,
      codeJsonRpc: CODES_JSON_RPC.parametresInvalides,
      message: "Le champ « params.name » doit être une chaîne non vide.",
    };
  }

  const metaBrut: unknown = parametres["_meta"];
  if (metaBrut !== undefined && !estObjet(metaBrut)) {
    return {
      genre: "refus",
      id,
      codeJsonRpc: CODES_JSON_RPC.parametresInvalides,
      message: "Le champ « params._meta » doit être un objet.",
    };
  }
  const meta: Readonly<Record<string, unknown>> = estObjet(metaBrut) ? metaBrut : {};

  const idempotence = chaineFacultative(meta, CLES_META_DU_SOCLE.idempotence);
  const curseur = chaineFacultative(meta, CLES_META_DU_SOCLE.curseur);
  const confirmation = chaineFacultative(meta, CLES_META_DU_SOCLE.confirmation);
  if (!idempotence.ok || !curseur.ok || !confirmation.ok) {
    return {
      genre: "refus",
      id,
      codeJsonRpc: CODES_JSON_RPC.parametresInvalides,
      message:
        `Les valeurs « ${CLES_META_DU_SOCLE.idempotence} », « ${CLES_META_DU_SOCLE.curseur} » ` +
        `et « ${CLES_META_DU_SOCLE.confirmation} » de « params._meta » doivent être des chaînes.`,
    };
  }

  // ⚠️ LE TYPE EST LA GARDE. `AppelEntrant` ne porte ni `effect`, ni `dataClass`,
  //    ni `policyLevel`, ni habilitation, ni `sessionId` : ce sont des décisions
  //    du socle. Y ajouter un champ ici ne compilerait pas — c'est l'inventaire
  //    de canaux du § 20 tenu par le compilateur, et non par une relecture.
  const appel: AppelEntrant = {
    nomComplet: nom,
    input: parametres["arguments"],
    idempotencyKey: idempotence.valeur,
    curseur: curseur.valeur,
    jetonDeConfirmation: confirmation.valeur,
  };

  return { genre: "appel", id, appel };
}

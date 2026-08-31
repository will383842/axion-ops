/**
 * `core/transport/stdio/protocole.ts` — **L'ENVELOPPE JSON-RPC, ET LA FRONTIÈRE
 * ENTRE UNE ENVELOPPE FAUTIVE ET UN APPEL REFUSÉ.**
 *
 * ═══ LA DÉCISION QUE CE FICHIER PORTE (ADR 0032) ═══
 *
 * **Un refus de la chaîne du § 11 est un RÉSULTAT JSON-RPC, jamais une erreur
 * de protocole.** Le § 15 le dit sans le dire : « un refus de politique est une
 * RÉPONSE NORMALE ». Un `-32603` sur un refus d'étape 10 ferait exactement
 * l'inverse de ce que le § 15 exige — il ferait réessayer le TRANSPORT là où il
 * faut corriger l'APPEL, et il rendrait un refus d'autorisation indiscernable
 * d'une enveloppe malformée pour quiconque lit le fil.
 *
 * La frontière est donc :
 *
 *  · **erreur JSON-RPC** (`error`, code négatif) — l'enveloppe est fautive :
 *    illisible, sans méthode, méthode inconnue, paramètres non conformes. **Aucun
 *    appel n'a été formé**, donc aucune ligne d'`ops_audit` n'est due : l'invariant
 *    de sortie du § 11 lie les terminaisons de la CHAÎNE, et il n'y a pas eu de
 *    chaîne ;
 *  · **résultat d'outil en erreur** (`result.isError`) — l'appel a été formé,
 *    il a traversé la chaîne, et une étape l'a refusé. La ligne d'`ops_audit`
 *    existe, elle porte le numéro de l'étape, et **ce numéro voyage aussi dans
 *    le résultat** pour que le client sache à quel rang il a été arrêté.
 *
 * ⚠️ **CETTE FRONTIÈRE A UN COÛT MESURÉ, ET IL EST ÉCRIT.** Une enveloppe fautive
 *    ne laisse **aucune trace dans `ops_audit`**. En HTTP, le § 11 donne aux
 *    quatre premières étapes un numéro, si bien qu'un `Host` refusé a quelque
 *    chose à inscrire dans `stepDenied` ; en stdio, ces quatre étapes n'existent
 *    pas et une enveloppe fautive n'a **aucun rang** à écrire. Le compte des
 *    rebuts vit donc dans les mesures du serveur, et nulle part ailleurs. Voir
 *    les écarts du lot : c'est une asymétrie réelle entre les deux transports,
 *    pas un oubli.
 *
 * ⚠️ **AUCUNE VALEUR REÇUE NE RESSORT DANS UNE ERREUR.** Ni le nom d'une méthode
 *    inconnue, ni une clé de paramètre refusée : § 31, et surtout § 20 — le jeton
 *    de confirmation voyage dans les paramètres, et un message d'erreur qui
 *    recopierait ce qu'il a reçu le rendrait au client par le canal d'erreur, que
 *    le § 20 interdit nommément. Ce qui sort est une CAUSE, jamais une valeur.
 */

import type { AppelStep, ErrorCode } from "../../types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI VIENT DE LA SPÉCIFICATION, ET NON DE NOUS
// ═════════════════════════════════════════════════════════════════════════════

/** JSON-RPC 2.0. La seule valeur admise au champ `jsonrpc`. */
export const VERSION_JSONRPC = "2.0";

/**
 * Les codes d'erreur d'enveloppe. **Ils viennent de la spécification JSON-RPC
 * 2.0, ils ne sont pas une décision du socle** — c'est pourquoi il n'y en a
 * aucun qui nous soit propre, et pourquoi aucun code du § 15 ne figure ici.
 */
export const CODES_ENVELOPPE = {
  analyse: -32700,
  requeteInvalide: -32600,
  methodeInconnue: -32601,
  parametresInvalides: -32602,
  interne: -32603,
} as const;

/** Un code d'erreur d'enveloppe. */
export type CodeEnveloppe = (typeof CODES_ENVELOPPE)[keyof typeof CODES_ENVELOPPE];

/**
 * LES MÉTHODES SERVIES, EN UNION FERMÉE.
 *
 * ⚠️ **`tools` EST LA SEULE PRIMITIVE (§ 11), ET LA LISTE LE MONTRE.** Il n'y a
 *    ni `resources/*`, ni `prompts/*`, ni `completion/*` : une méthode absente
 *    de cette liste est refusée par `-32601`, et l'ajouter demande de l'écrire
 *    ici. Une méthode servie par défaut aurait été une surface que personne
 *    n'aurait décidé d'ouvrir.
 */
export const METHODES_SERVIES = [
  "initialize",
  "notifications/initialized",
  "tools/list",
  "tools/call",
] as const;

/** Une méthode que ce transport sert. */
export type MethodeServie = (typeof METHODES_SERVIES)[number];

/**
 * LES CLÉS QUE `tools/call` ACCEPTE DANS SES PARAMÈTRES — **ET LA LISTE EST
 * FERMÉE.**
 *
 * ═══ POURQUOI UNE FERMETURE ET NON UNE LISTE NOIRE ═══
 *
 * La question posée est : *par quel chemin une décision de droit pourrait-elle
 * entrer par la charge utile ?* Une liste noire y répond par énumération —
 * `sessionId`, `principal`, `scopes`, `deadline`, `policyLevel`… — et une liste
 * noire vieillit : le champ ajouté demain à `ToolContext` ou à
 * `IdentiteAppelante` n'y sera pas, et il entrera **en silence**. C'est très
 * exactement le mode de défaillance que `NOMS_RESERVES_HORS_CONTEXTE` a coûté au
 * lot 1d.
 *
 * La fermeture, elle, ne vieillit pas : ce qui n'est pas nommé ici est REFUSÉ,
 * aujourd'hui et pour tout nom qui n'existe pas encore. C'est le dialecte que le
 * socle impose déjà aux adaptateurs — le § 09 exige un schéma d'entrée fermé —,
 * et il n'y avait aucune raison que le transport s'en dispense.
 *
 * ⚠️ **REFUSER, ET NON IGNORER.** Un paramètre inconnu silencieusement écarté
 *    laisse croire à l'appelant qu'il a été pris en compte : un client qui
 *    croirait poser une `deadline` obtiendrait un succès et une échéance autre
 *    que la sienne. Un refus dit ce qui s'est passé.
 *
 * ⚠️ **CE QUE LA FERMETURE NE PROUVE PAS.** Elle compare des NOMS au premier
 *    niveau de `params`. Une valeur cachée SOUS `arguments` lui échappe
 *    entièrement — et c'est très bien : `arguments` est validé à l'étape 8 par le
 *    schéma fermé de l'outil, et le contrôle 7 du § 09 y interdit déjà les noms
 *    d'autorisation. Les deux fermetures se répondent ; aucune ne couvre l'autre.
 */
export const CLES_DE_PARAMETRES_DE_TOOLS_CALL = [
  /** Le nom COMPLET de l'outil, tel que `tools/list` le sert (§ 09). */
  "name",
  /** La charge utile brute. Validée à l'étape 8, et seulement là. */
  "arguments",
  /** § 20 — la clé d'idempotence, qui voyage HORS d'`arguments`. */
  "idempotencyKey",
  /** § 13.1 — le jeton de curseur d'une page suivante. */
  "cursor",
  /**
   * § 20 — le jeton de confirmation d'un effet extérieur. Il ENTRE par ici et
   * ne ressort JAMAIS, par aucun canal : voir l'en-tête de ce fichier.
   */
  "confirmation",
] as const;

/** Une clé admise au premier niveau des paramètres de `tools/call`. */
export type CleDeParametreDeToolsCall = (typeof CLES_DE_PARAMETRES_DE_TOOLS_CALL)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  CE QU'UNE ENVELOPPE LUE PEUT ÊTRE
// ═════════════════════════════════════════════════════════════════════════════

/** Un identifiant de requête JSON-RPC. `null` n'est admis que dans une erreur. */
export type IdJsonRpc = string | number;

/** Une requête bien formée, dont la méthode est servie. */
export interface RequeteLue {
  readonly genre: "requête";
  readonly id: IdJsonRpc;
  readonly methode: MethodeServie;
  readonly params: Record<string, unknown>;
}

/** Une notification bien formée — aucune réponse ne lui est due. */
export interface NotificationLue {
  readonly genre: "notification";
  readonly methode: MethodeServie;
}

/**
 * Une enveloppe fautive. Elle porte l'`id` **quand il a pu être lu**, pour que
 * la réponse d'erreur soit corrélable ; `null` sinon, comme la spécification
 * JSON-RPC l'exige.
 */
export interface EnveloppeFautive {
  readonly genre: "enveloppe-fautive";
  readonly id: IdJsonRpc | null;
  readonly code: CodeEnveloppe;
  /** Une CAUSE, jamais une valeur reçue. */
  readonly message: string;
}

/** Ce qu'une ligne d'objet JSON peut être, une fois relue comme du JSON-RPC. */
export type EnveloppeLue = RequeteLue | NotificationLue | EnveloppeFautive;

// ═════════════════════════════════════════════════════════════════════════════
//  LA LECTURE
// ═════════════════════════════════════════════════════════════════════════════

function estMethodeServie(valeur: unknown): valeur is MethodeServie {
  return typeof valeur === "string" && (METHODES_SERVIES as readonly string[]).includes(valeur);
}

function lireId(brut: unknown): IdJsonRpc | null {
  if (typeof brut === "string") return brut;
  // JSON-RPC admet un nombre ; on écarte les non-entiers et les valeurs non
  // finies, qui ne survivent pas à un aller-retour de sérialisation.
  if (typeof brut === "number" && Number.isSafeInteger(brut)) return brut;
  return null;
}

/**
 * Relit un objet JSON comme une enveloppe JSON-RPC 2.0.
 *
 * ⚠️ **L'ORDRE DES CONTRÔLES EST LA MOITIÉ DE LA FONCTION.** L'`id` est lu
 *    D'ABORD, avant tout autre refus, pour qu'une enveloppe fautive puisse
 *    quand même être corrélée par le client — une erreur `id: null` sur une
 *    requête qui portait un `id` parfaitement lisible oblige le client à
 *    abandonner tous ses appels en vol, alors qu'un seul a échoué.
 */
export function lireEnveloppe(objet: Record<string, unknown>): EnveloppeLue {
  const id = lireId(objet["id"]);

  if (objet["jsonrpc"] !== VERSION_JSONRPC) {
    return {
      genre: "enveloppe-fautive",
      id,
      code: CODES_ENVELOPPE.requeteInvalide,
      message: `Le champ « jsonrpc » doit valoir « ${VERSION_JSONRPC} ». Corriger l'enveloppe.`,
    };
  }

  const methodeBrute = objet["method"];
  if (typeof methodeBrute !== "string" || methodeBrute.length === 0) {
    return {
      genre: "enveloppe-fautive",
      id,
      code: CODES_ENVELOPPE.requeteInvalide,
      message: "Le champ « method » est absent ou n'est pas une chaîne. Corriger l'enveloppe.",
    };
  }

  if (!estMethodeServie(methodeBrute)) {
    return {
      genre: "enveloppe-fautive",
      id,
      code: CODES_ENVELOPPE.methodeInconnue,
      // ⚠️ Le nom reçu N'EST PAS recopié : ce serait un écho de chaîne libre.
      //    Ce que le client doit savoir est la liste de ce qui EST servi.
      message: `Méthode non servie. Ce socle ne sert que : ${METHODES_SERVIES.join(", ")}.`,
    };
  }

  const paramsBruts = objet["params"];
  if (paramsBruts !== undefined && (typeof paramsBruts !== "object" || paramsBruts === null)) {
    return {
      genre: "enveloppe-fautive",
      id,
      code: CODES_ENVELOPPE.parametresInvalides,
      message: "Le champ « params » doit être un objet. Un tableau de position n'est pas servi.",
    };
  }
  if (Array.isArray(paramsBruts)) {
    return {
      genre: "enveloppe-fautive",
      id,
      code: CODES_ENVELOPPE.parametresInvalides,
      message: "Le champ « params » doit être un objet. Un tableau de position n'est pas servi.",
    };
  }

  // Une enveloppe SANS `id` est une notification : aucune réponse ne lui est
  // due, et lui en écrire une désynchroniserait le client.
  if (id === null) return { genre: "notification", methode: methodeBrute };

  return {
    genre: "requête",
    id,
    methode: methodeBrute,
    params: (paramsBruts ?? {}) as Record<string, unknown>,
  };
}

/**
 * Confronte les clés d'un objet de paramètres à {@link CLES_DE_PARAMETRES_DE_TOOLS_CALL}.
 *
 * Elle rend les clés REFUSÉES et le compte de celles qu'elle a confrontées : un
 * contrôle qui ne regarde rien serait vert, et ce compte est ce qui le dit.
 */
export function clesRefuseesDeToolsCall(params: Record<string, unknown>): {
  readonly clesConfrontees: number;
  readonly admises: number;
  readonly refusees: readonly string[];
} {
  const admisesConnues = new Set<string>(CLES_DE_PARAMETRES_DE_TOOLS_CALL);
  const clesLues = Object.keys(params);
  const refusees = clesLues.filter((cle) => !admisesConnues.has(cle));
  return {
    clesConfrontees: clesLues.length,
    admises: clesLues.length - refusees.length,
    refusees,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI SORT
// ═════════════════════════════════════════════════════════════════════════════

/** Une réponse JSON-RPC de succès. */
export interface ReponseSucces {
  readonly jsonrpc: typeof VERSION_JSONRPC;
  readonly id: IdJsonRpc;
  readonly result: unknown;
}

/** Une réponse JSON-RPC d'erreur d'ENVELOPPE. Jamais un refus de la chaîne. */
export interface ReponseErreur {
  readonly jsonrpc: typeof VERSION_JSONRPC;
  readonly id: IdJsonRpc | null;
  readonly error: { readonly code: number; readonly message: string };
}

/** Toute réponse écrite sur le fil. */
export type Reponse = ReponseSucces | ReponseErreur;

export function reponseDeSucces(id: IdJsonRpc, result: unknown): ReponseSucces {
  return { jsonrpc: VERSION_JSONRPC, id, result };
}

export function reponseDErreur(
  id: IdJsonRpc | null,
  code: CodeEnveloppe,
  message: string,
): ReponseErreur {
  return { jsonrpc: VERSION_JSONRPC, id, error: { code, message } };
}

/**
 * LE RÉSULTAT D'UN `tools/call` REFUSÉ PAR LA CHAÎNE.
 *
 * ⚠️ **`step` EST DANS LE RÉSULTAT, ET C'EST UNE DÉCISION.** Le § 11 fait écrire
 *    le numéro dans `ops_audit.stepDenied` ; le rendre AUSSI au client n'est pas
 *    une redite. Sans lui, « refusé » ne dit pas à quel rang, et le client — qui
 *    est un modèle — ne peut pas distinguer « corrige ton entrée » (étape 8) de
 *    « demande une confirmation » (étape 10) de « n'insiste pas » (étape 11).
 *    Le § 15 exige que l'erreur dise ce qu'il faut faire ensuite ; le rang est la
 *    moitié de cette réponse, le `message` est l'autre.
 *
 * ⚠️ **`code` PEUT ÊTRE `null`, ET ON NE LE BOUCHE PAS.** Le § 11 donne aux
 *    quatre étapes « HTTP seul » un statut nu et aucun code — elles ne
 *    s'appliquent pas ici, mais le type l'admet, et lui substituer un code voisin
 *    mentirait sur la cause. Le trou reste VISIBLE, comme partout ailleurs dans
 *    ce dépôt.
 */
export interface ResultatDOutilRefuse {
  readonly isError: true;
  readonly step: AppelStep;
  readonly code: ErrorCode | null;
  readonly content: readonly { readonly type: "text"; readonly text: string }[];
}

export function resultatRefuse(
  step: AppelStep,
  code: ErrorCode | null,
  message: string,
): ResultatDOutilRefuse {
  return { isError: true, step, code, content: [{ type: "text", text: message }] };
}

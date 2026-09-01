/**
 * `core/transport/http/fixtures.ts` — **LES DOUBLES DU TRANSPORT HTTP.**
 *
 * ⚠️ **CE FICHIER NE SHIPPE PAS.** `tsconfig.build.json` exclut `**\/fixtures.ts`,
 *    et ce n'est pas un réglage de build : c'est le CRITÈRE dont
 *    `core/coutures/registre.spec.ts` et `core/chaine/identite.spec.ts` dérivent
 *    « ce fichier est-il de PRODUCTION ? ». Une fabrique de témoins émise par le
 *    build compterait pour un module de production, et un symbole dont l'unique
 *    appelant serait une fixture passerait pour COUSU.
 *
 * ⚠️ **TOUS LES DOUBLES COMPTENT LEURS APPELS.** C'est la raison d'être de ce
 *    fichier : la propriété que les gardes de ce dossier tiennent n'est pas « la
 *    réponse est correcte », c'est « telle chose N'A PAS été faite avant telle
 *    autre ». Un double qui ne compte pas ne peut rien prouver de cet ordre-là.
 *
 * ⚠️ **AUCUNE VALEUR RÉELLE, AUCUN SECRET.** Les jetons, les hôtes et les
 *    audiences de ce fichier sont des chaînes de démonstration sur
 *    `stub.invalid` — un TLD réservé par la RFC 2606, qui ne résout jamais.
 */

import { sessionIdDeTemoin } from "../../identite/fixtures.js";
import type { LigneOpsTokenRelue } from "../../chaine/identite.js";
import type { ResultatAppel, TraceOrchestration } from "../../chaine/orchestrateur.js";
import { colonneDuTransport } from "../../chaine/orchestrateur.js";
import type { AppelStep, ErrorCode, Habilitations, OpsScope } from "../../types.js";
import type { JournalDesRefusEnAmont, RefusEnAmont } from "./amont.js";
import type { RegistreDesJetons, RevendicationsDuJeton, VerificateurDeJeton } from "./jeton.js";
import type { PontDIdentite, RequeteHttp } from "./transport.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES VALEURS DE DÉMONSTRATION
// ═════════════════════════════════════════════════════════════════════════════

/** RFC 2606 — `stub.invalid` ne résout jamais. Aucun appel sortant possible. */
export const HOTE_DE_TEMOIN = "socle.stub.invalid";
/** L'audience de démonstration : URL absolue, sans requête, sans barre finale. */
export const AUDIENCE_DE_TEMOIN = "https://socle.stub.invalid/api/mcp";
/** Un porteur de démonstration, assez long pour être confronté par le filet anti-fuite. */
export const PORTEUR_DE_TEMOIN = "jeton-de-demonstration-0000000000000000";
/** Un `jti` de démonstration. */
export const JTI_DE_TEMOIN = "jti-de-demonstration-0001";
/** Un principal conforme à la forme du journal (§ 31). */
export const PRINCIPAL_DE_TEMOIN = "http.temoin";

/** Les habilitations les plus faibles — § 19 bis, défaut fail-closed. */
export const HABILITATIONS_DE_TEMOIN: Habilitations = { peutVoirAppels: false };

// ═════════════════════════════════════════════════════════════════════════════
//  LES DOUBLES QUI COMPTENT
// ═════════════════════════════════════════════════════════════════════════════

/** Une ligne `ops_token` relue, avec une session frappée par la fabrique de témoins. */
export function ligneOpsTokenDeTemoin(
  surcharge: Partial<Pick<LigneOpsTokenRelue, "jti" | "principal">> = {},
): LigneOpsTokenRelue {
  return {
    jti: surcharge.jti ?? JTI_DE_TEMOIN,
    sessionId: sessionIdDeTemoin(),
    principal: surcharge.principal ?? PRINCIPAL_DE_TEMOIN,
  };
}

/** Un vérificateur de jeton (étape 2) qui COMPTE ses appels. */
export interface VerificateurCompteur extends VerificateurDeJeton {
  readonly appels: () => number;
}

export function verificateurDeTemoin(reponse: RevendicationsDuJeton | null): VerificateurCompteur {
  let appels = 0;
  return {
    appels: () => appels,
    verifier(_porteur: string): Promise<RevendicationsDuJeton | null> {
      appels += 1;
      return Promise.resolve(reponse);
    },
  };
}

/** Les revendications d'un jeton conforme. */
export function revendicationsDeTemoin(
  surcharge: Partial<RevendicationsDuJeton> = {},
): RevendicationsDuJeton {
  const scopes: readonly OpsScope[] = surcharge.scopes ?? ["ops:read"];
  return {
    jti: surcharge.jti ?? JTI_DE_TEMOIN,
    audience: "audience" in surcharge ? surcharge.audience : AUDIENCE_DE_TEMOIN,
    scopes,
  };
}

/** Un registre `ops_token` (étape 4) qui COMPTE ses relectures. */
export interface RegistreCompteur extends RegistreDesJetons {
  readonly relectures: () => number;
}

export function registreDeTemoin(ligne: LigneOpsTokenRelue | null): RegistreCompteur {
  let relectures = 0;
  return {
    relectures: () => relectures,
    relire(_jti: string): Promise<LigneOpsTokenRelue | null> {
      relectures += 1;
      return Promise.resolve(ligne);
    },
  };
}

/** Un journal de refus amont ARMÉ, qui garde ce qu'on lui a remis. */
export interface JournalCompteur extends JournalDesRefusEnAmont {
  readonly consignes: () => readonly RefusEnAmont[];
}

/**
 * Un journal ARMÉ : il écrit UNE ligne et rend `1` (ADR 0037, § 1).
 *
 * ⚠️ C'est le TÉMOIN INVERSE de `JOURNAL_AMONT_NON_ARME`. Sans lui, une
 *    garde qui exigerait « 0 consigné » serait satisfaite par un port qui ne
 *    saurait rien écrire du tout — le vert pour la mauvaise raison.
 */
export function journalDeTemoin(): JournalCompteur {
  const consignes: RefusEnAmont[] = [];
  return {
    consignes: () => [...consignes],
    consigner(refus: RefusEnAmont): Promise<number> {
      consignes.push(refus);
      return Promise.resolve(1);
    },
  };
}

/**
 * UN JOURNAL QUI ÉCHOUE À ÉCRIRE — armé, appelé, et il n'a rien posé.
 *
 * ⚠️ **C'EST LE TROISIÈME ÉTAT, ET IL N'EST NI L'UN NI L'AUTRE DES DEUX
 *    PRÉCÉDENTS.** Un port peut être fourni ET ne rien écrire : table
 *    injoignable, écriture refusée. Un booléen l'aurait confondu avec « pas de
 *    port » ; le nombre les distingue, et c'est pourquoi la décision porte sur
 *    un NOMBRE. La garde le fabrique pour que « 0 consigné » ne puisse pas être
 *    lu comme « aucun port ».
 */
export function journalQuiEchoueDeTemoin(): JournalCompteur {
  const consignes: RefusEnAmont[] = [];
  return {
    consignes: () => [...consignes],
    consigner(refus: RefusEnAmont): Promise<number> {
      consignes.push(refus);
      return Promise.resolve(0);
    },
  };
}

/** Le pont d'identité (§ 19 bis), en version la plus faible. */
export const PONT_DE_TEMOIN: PontDIdentite = {
  habilitations(): Habilitations {
    return HABILITATIONS_DE_TEMOIN;
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  LE NOYAU DOUBLÉ
// ═════════════════════════════════════════════════════════════════════════════

/** Une trace d'orchestration de démonstration, DÉRIVÉE de la colonne du transport. */
function traceDeTemoin(etapeRefusante: AppelStep | null): TraceOrchestration {
  const colonne = colonneDuTransport("http");
  return {
    transport: "http",
    etapesApplicables: colonne.etapesApplicables,
    etapesNonApplicables: colonne.etapesNonApplicables,
    etapesAmont: colonne.etapesAmont,
    etapesFranchies: [],
    etapeRefusante,
    etapesNonAtteintes: [],
    niveauApplique: "brouillon",
    niveauMesures: 0,
    argHashBrutIndisponible: false,
    ligneDIntention: null,
  };
}

/** Un `ResultatAppel` de succès, portant la charge qu'on lui donne. */
export function resultatDeSucces(charge: unknown): ResultatAppel {
  return {
    terminaison: {
      genre: "succès",
      valeur: {
        genre: "exécuté",
        execution: {
          charge,
          palier: "intact",
          outcome: "ok",
          octetsServis: 0,
          octetsBruts: 0,
          champsMasques: 0,
          recordIds: [],
          partialSources: [],
          sourceIncomplete: false,
        },
        trace: traceDeTemoin(null),
      },
      outcome: "ok",
      recordIds: [],
      partialSources: [],
    },
    ligne: { seq: 1n, selfHash: "a".repeat(64) },
    refus: null,
    trace: traceDeTemoin(null),
  };
}

/** Un `ResultatAppel` de refus, portant l'étape, le code et le message donnés. */
export function resultatDeRefus(etape: AppelStep, code: ErrorCode, message: string): ResultatAppel {
  return {
    terminaison: { genre: "refus", etape, code },
    ligne: { seq: 2n, selfHash: "b".repeat(64) },
    refus: { etape, code, message },
    trace: traceDeTemoin(etape),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA REQUÊTE QUI COMPTE LES LECTURES DE SON CORPS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une requête dont `lireLeCorps` COMPTE ses invocations.
 *
 * ⚠️ **C'EST L'INSTRUMENT DE LA GARDE D'ORDRE.** Le § 11 veut que l'étape 1
 *    s'exécute « avant tout traitement » ; ce compteur est la seule façon de
 *    MESURER cette phrase plutôt que de la relire. Zéro sur un hôte refusé, zéro
 *    sur un jeton refusé : la garde lit le nombre, pas la couleur.
 */
export interface RequeteCompteur extends RequeteHttp {
  readonly lecturesDuCorps: () => number;
}

export function requeteDeTemoin(options: {
  readonly corps: string;
  readonly hote?: string;
  readonly porteur?: string | null;
  readonly chemin?: string;
  readonly methode?: string;
  readonly entetesEnPlus?: Readonly<Record<string, string>>;
}): RequeteCompteur {
  let lectures = 0;
  const entetes: Record<string, string | undefined> = {
    host: options.hote ?? HOTE_DE_TEMOIN,
    ...options.entetesEnPlus,
  };
  const porteur = options.porteur === undefined ? PORTEUR_DE_TEMOIN : options.porteur;
  if (porteur !== null) entetes["authorization"] = `Bearer ${porteur}`;

  return {
    methode: options.methode ?? "POST",
    chemin: options.chemin ?? "/api/mcp",
    entetes,
    lecturesDuCorps: () => lectures,
    lireLeCorps: (): Promise<string> => {
      lectures += 1;
      return Promise.resolve(options.corps);
    },
  };
}

/** Une enveloppe JSON-RPC `tools/call` bien formée. */
export function enveloppeDeTemoin(options: {
  readonly nom?: string;
  readonly arguments?: unknown;
  readonly meta?: Readonly<Record<string, unknown>>;
  readonly id?: string | number;
}): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: options.id ?? "1",
    method: "tools/call",
    params: {
      name: options.nom ?? "demo.outil.lire",
      arguments: options.arguments ?? {},
      ...(options.meta === undefined ? {} : { _meta: options.meta }),
    },
  });
}

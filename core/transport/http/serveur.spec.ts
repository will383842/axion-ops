/**
 * `core/transport/http/serveur.spec.ts` — **LE SOCLE DÉMARRE ET RÉPOND.**
 *
 * ═══ CE QUE CETTE GARDE EST, ET POURQUOI ELLE OUVRE UNE SOCKET ═══
 *
 * `transport.spec.ts` éprouve le transport SANS réseau, et c'est ce qui lui
 * permet d'être exhaustive. Ce fichier-ci fait l'inverse et n'éprouve que
 * quatre chemins : ce sont ceux dont la valeur de preuve dépend du fil.
 *
 * Un transport qui rendrait la bonne `ReponseHttp` mais dont le serveur
 * écrirait un autre statut, oublierait un en-tête, ou retiendrait la connexion
 * en attendant un corps qu'il n'a pas lu, serait vert partout ailleurs. C'est
 * exactement le défaut qui a défini ce lot, en plus petit : **écrire la fonction
 * n'est pas le travail, la BRANCHER l'est.**
 *
 * ⚠️ **AUCUN APPEL SORTANT.** L'écoute est sur `127.0.0.1`, sur un port attribué
 *    par le système (`0`), et le client est `node:http` — jamais `fetch`, qui
 *    interdit de choisir l'en-tête `Host` et rendrait l'étape 1 inéprouvable sur
 *    le fil.
 *
 * ⚠️ **AUCUN SECRET, AUCUNE VALEUR RÉELLE.** Les hôtes et audiences viennent de
 *    `fixtures.ts`, sur `stub.invalid` (RFC 2606), et le seul hôte admis par la
 *    liste blanche est l'adresse de bouclage suivie du port attribué.
 */

import { request } from "node:http";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ADRESSE_DE_BOUCLE_LOCALE, creerServeurHttp } from "./serveur.js";
import type { ServeurHttp } from "./serveur.js";
import { CHEMIN_MCP, creerTransportHttp } from "./transport.js";
import type { TraceDeTraitement, TransportHttp } from "./transport.js";
import {
  AUDIENCE_DE_TEMOIN,
  PONT_DE_TEMOIN,
  PORTEUR_DE_TEMOIN,
  enveloppeDeTemoin,
  ligneOpsTokenDeTemoin,
  registreDeTemoin,
  resultatDeSucces,
  revendicationsDeTemoin,
} from "./fixtures.js";

/** Plafond du corps. Petit, pour que le chemin « trop grand » soit éprouvable. */
const OCTETS_MAX = 4096;
const BUDGET_MS = 30_000;

interface Reponse {
  readonly statut: number;
  readonly entetes: Readonly<Record<string, string | string[] | undefined>>;
  readonly corps: string;
}

/** Un client HTTP minimal, qui CHOISIT son en-tête `Host`. */
function appeler(options: {
  readonly port: number;
  readonly chemin?: string;
  readonly methode?: string;
  readonly hote?: string;
  readonly porteur?: string | null;
  readonly corps?: string;
}): Promise<Reponse> {
  return new Promise<Reponse>((resoudre, rejeter) => {
    const corps = options.corps ?? "";
    const entetes: Record<string, string> = {
      host: options.hote ?? `${ADRESSE_DE_BOUCLE_LOCALE}:${String(options.port)}`,
      "content-type": "application/json",
      "content-length": String(Buffer.byteLength(corps)),
    };
    if (options.porteur !== null && options.porteur !== undefined) {
      entetes["authorization"] = `Bearer ${options.porteur}`;
    }

    const requete = request(
      {
        host: ADRESSE_DE_BOUCLE_LOCALE,
        port: options.port,
        method: options.methode ?? "POST",
        path: options.chemin ?? CHEMIN_MCP,
        headers: entetes,
      },
      (reponse) => {
        const morceaux: Buffer[] = [];
        reponse.on("data", (morceau: Buffer) => morceaux.push(morceau));
        reponse.on("end", () => {
          resoudre({
            statut: reponse.statusCode ?? 0,
            entetes: reponse.headers,
            corps: Buffer.concat(morceaux).toString("utf8"),
          });
        });
      },
    );
    requete.on("error", rejeter);
    requete.end(corps);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE MONTAGE
// ═════════════════════════════════════════════════════════════════════════════

let serveur: ServeurHttp;
let port = 0;
const traces: TraceDeTraitement[] = [];
let audienceDuJeton: unknown = AUDIENCE_DE_TEMOIN;
let appelsAuNoyau = 0;

beforeAll(async () => {
  // ⚠️ LE TRANSPORT NE PEUT PAS ÊTRE CONSTRUIT AVANT DE CONNAÎTRE LE PORT : sa
  //    liste blanche d'hôtes en dépend, et une liste blanche vide est un refus
  //    de démarrer. On monte donc le serveur sur un transport DIFFÉRÉ, on lie la
  //    socket, puis on construit le vrai. Le différé garde aussi les traces —
  //    c'est par elles que la garde lit ce que le serveur N'A PAS fait.
  let reel: TransportHttp | null = null;
  const differe: TransportHttp = {
    async traiter(requete) {
      if (reel === null) throw new Error("transport non monté");
      const traitement = await reel.traiter(requete);
      traces.push(traitement.trace);
      return traitement;
    },
  };

  serveur = creerServeurHttp(differe, { port: 0, octetsMaxDuCorps: OCTETS_MAX });
  const liee = await serveur.ecouter();
  port = liee.port;

  reel = creerTransportHttp(
    {
      hotesAdmis: [`${ADRESSE_DE_BOUCLE_LOCALE}:${String(port)}`],
      audienceAttendue: AUDIENCE_DE_TEMOIN,
      budgetMs: BUDGET_MS,
    },
    {
      verificateurDeJeton: {
        verifier: (): Promise<ReturnType<typeof revendicationsDeTemoin> | null> =>
          Promise.resolve(revendicationsDeTemoin({ audience: audienceDuJeton })),
      },
      registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
      pontDIdentite: PONT_DE_TEMOIN,
      noyau: () => {
        appelsAuNoyau += 1;
        return Promise.resolve(resultatDeSucces({ servi: "par le noyau" }));
      },
    },
  );

  console.info(
    `[serveur] écoute sur ${liee.adresse}:${String(liee.port)} · ` +
      `plafond de corps ${String(OCTETS_MAX)} octets · aucun appel sortant`,
  );
});

afterAll(async () => {
  await serveur.fermer();
});

function derniereTrace(): TraceDeTraitement {
  const trace = traces.at(-1);
  if (trace === undefined) throw new Error("aucune trace : le transport n'a pas été atteint");
  return trace;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES QUATRE CHEMINS QUI SE PROUVENT SUR LE FIL
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — le socle démarre sur 127.0.0.1 et répond", () => {
  it("un `Host` hors liste blanche est refusé AVANT tout le reste", async () => {
    const avant = appelsAuNoyau;
    const reponse = await appeler({
      port,
      hote: "attaquant.stub.invalid",
      porteur: PORTEUR_DE_TEMOIN,
      corps: enveloppeDeTemoin({}),
    });
    const trace = derniereTrace();

    console.info(
      `[serveur · étape 1] statut ${String(reponse.statut)} · ` +
        `corps de requête lu : ${String(trace.corpsLu)} · ` +
        `${String(appelsAuNoyau - avant)} appel(s) au noyau · ` +
        `WWW-Authenticate : ${String(reponse.entetes["www-authenticate"])}`,
    );

    expect(reponse.statut).toBe(403);
    // ⚠️ LA PROPRIÉTÉ N'EST PAS LE STATUT, C'EST LE TRAVAIL NON FAIT : le corps
    //    JSON-RPC n'a jamais été remis à l'analyseur, alors qu'il était sur le
    //    fil et que le serveur l'avait à disposition.
    expect(trace.corpsLu).toBe(false);
    expect(appelsAuNoyau - avant).toBe(0);
    expect(reponse.entetes["www-authenticate"]).toBeUndefined();
  });

  it("un appel non authentifié échoue — 401 et `WWW-Authenticate`", async () => {
    const avant = appelsAuNoyau;
    const reponse = await appeler({ port, porteur: null, corps: enveloppeDeTemoin({}) });
    const trace = derniereTrace();

    console.info(
      `[serveur · étape 2] statut ${String(reponse.statut)} · ` +
        `WWW-Authenticate : « ${String(reponse.entetes["www-authenticate"])} » · ` +
        `corps lu : ${String(trace.corpsLu)} · ` +
        `${String(appelsAuNoyau - avant)} appel(s) au noyau`,
    );

    expect(reponse.statut).toBe(401);
    expect(String(reponse.entetes["www-authenticate"])).toContain("Bearer");
    expect(trace.corpsLu).toBe(false);
    expect(appelsAuNoyau - avant).toBe(0);
  });

  it("un jeton d'une AUTRE audience est refusé — RFC 8707", async () => {
    audienceDuJeton = "https://autre.stub.invalid/api/mcp";
    try {
      const avant = appelsAuNoyau;
      const reponse = await appeler({
        port,
        porteur: PORTEUR_DE_TEMOIN,
        corps: enveloppeDeTemoin({}),
      });
      const trace = derniereTrace();
      const corps = JSON.parse(reponse.corps) as {
        readonly error: { readonly data: { readonly code: string; readonly stepDenied: number } };
      };

      console.info(
        `[serveur · étape 3] statut ${String(reponse.statut)} · ` +
          `code du § 15 : ${corps.error.data.code} · ` +
          `stepDenied : ${String(corps.error.data.stepDenied)} · ` +
          `étapes franchies en amont : [${(trace.amont?.etapesFranchies ?? []).join(", ")}] · ` +
          `${String(trace.amont?.comparaisonsDAudience ?? 0)} comparaison(s) d'audience`,
      );

      expect(reponse.statut).toBe(401);
      expect(corps.error.data.code).toBe("unauthenticated");
      expect(corps.error.data.stepDenied).toBe(3);
      expect(trace.amont?.comparaisonsDAudience).toBe(1);
      expect(appelsAuNoyau - avant).toBe(0);
      // Le porteur ne ressort ni dans le corps, ni dans le défi.
      expect(reponse.corps).not.toContain(PORTEUR_DE_TEMOIN);
      expect(String(reponse.entetes["www-authenticate"])).not.toContain(PORTEUR_DE_TEMOIN);
    } finally {
      audienceDuJeton = AUDIENCE_DE_TEMOIN;
    }
  });

  it("un appel complet aboutit — 200, et la charge du noyau est servie", async () => {
    const avant = appelsAuNoyau;
    const reponse = await appeler({
      port,
      porteur: PORTEUR_DE_TEMOIN,
      corps: enveloppeDeTemoin({ nom: "demo.outil.lire", arguments: { page: 1 }, id: 42 }),
    });
    const trace = derniereTrace();
    const corps = JSON.parse(reponse.corps) as {
      readonly id: number;
      readonly result: { readonly structuredContent: unknown; readonly isError: boolean };
    };

    console.info(
      `[serveur · appel complet] statut ${String(reponse.statut)} · ` +
        `id renvoyé ${String(corps.id)} · ` +
        `${String(appelsAuNoyau - avant)} appel(s) au noyau · ` +
        `corps lu : ${String(trace.corpsLu)} · ` +
        `étapes amont franchies : [${(trace.amont?.etapesFranchies ?? []).join(", ")}] · ` +
        `${String(trace.fuite.valeursConfrontees)} valeur(s) sensible(s) confrontée(s), ` +
        `${String(trace.fuite.fuites.length)} fuite(s)`,
    );

    expect(reponse.statut).toBe(200);
    expect(corps.id).toBe(42);
    expect(corps.result.isError).toBe(false);
    expect(corps.result.structuredContent).toEqual({ servi: "par le noyau" });
    expect(appelsAuNoyau - avant).toBe(1);
    expect(trace.corpsLu).toBe(true);
    expect(trace.amont?.etapesFranchies).toEqual([1, 2, 3, 4]);
    expect(trace.anomaliesDAmont).toEqual([]);
    expect(trace.fuite.fuites).toEqual([]);
  });
});

describe("§ 15 — un corps sans plafond serait une panne de mémoire à la demande", () => {
  it("refuse un corps au-delà du plafond, en RÉPONDANT plutôt qu'en coupant la connexion", async () => {
    const avant = appelsAuNoyau;
    const enorme = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "demo.outil.lire", arguments: { texte: "x".repeat(OCTETS_MAX * 2) } },
    });

    const reponse = await appeler({ port, porteur: PORTEUR_DE_TEMOIN, corps: enorme });

    console.info(
      `[serveur · plafond] corps envoyé de ${String(Buffer.byteLength(enorme))} octet(s) · ` +
        `plafond ${String(OCTETS_MAX)} · statut ${String(reponse.statut)} · ` +
        `${String(appelsAuNoyau - avant)} appel(s) au noyau`,
    );

    // ⚠️ LA PROPRIÉTÉ MESURÉE EST « LE CLIENT REÇOIT UNE RÉPONSE » : une socket
    //    coupée serait un incident réseau, là où le § 15 veut qu'on dise ce
    //    qu'il faut faire ensuite.
    expect(reponse.statut).toBe(500);
    expect(appelsAuNoyau - avant).toBe(0);
    // 🔴 ÉCART SIGNALÉ : un `413` serait plus juste qu'un `500`. Le rendre
    //    demande que le transport distingue une panne de lecture d'une panne
    //    quelconque, c'est-à-dire un canal de plus entre le serveur et lui.
    //    Écrit ici plutôt que comblé par une supposition.
    expect(reponse.corps).toContain("internal");
    // Et la taille du corps reçu ne ressort pas : la réponse ne cite rien.
    expect(reponse.corps).not.toContain("x".repeat(64));
  });
});

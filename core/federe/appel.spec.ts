import { describe, expect, it, vi } from "vitest";

import { estAmontInjoignable } from "../chaine/orchestrateur.js";
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { ToolContext } from "../types.js";
import {
  appelerAdaptateurFedere,
  corpsDeLAppel,
  DELAI_PAR_DEFAUT_MS,
  ENTETE_SECRET_PARTAGE,
  ErreurAdaptateurDistant,
  extraireRecordIds,
  lireReponseDeLAdaptateur,
  METHODE_APPEL,
  type RaccordementFedere,
} from "./appel.js";

/**
 * `core/federe/appel.spec.ts` — CE QUE L'APPEL FÉDÉRÉ DOIT TENIR.
 *
 * ═══ LE TEST QUI COMPTE LE PLUS EST LE N° 5 ═══
 *
 * Une erreur réseau doit remonter **telle quelle**, pour qu'`estAmontInjoignable()`
 * la reconnaisse dans sa chaîne `cause` et que le § 15 rende `upstream_unavailable`.
 * L'envelopper la transformerait en `internal` : l'appelant ne saurait plus si
 * c'est transitoire, et la seule information utile — « réessayer » — serait
 * perdue. Ce fichier le vérifie en confrontant l'erreur au VRAI reconnaisseur du
 * socle, jamais à une chaîne de caractères recopiée.
 */

const SECRET = "un-secret-de-garde-sans-valeur-reelle";

const RACCORDEMENT: RaccordementFedere = {
  endpoint: "https://produit.stub.invalid/api/mcp",
  secret: SECRET,
  nomComplet: "axionia.inbox.recent",
  idFields: ["id"],
};

function contexteDeTemoin(surcharge: Partial<ToolContext<string>> = {}): ToolContext<string> {
  return {
    principal: "socle.temoin",
    sessionId: sessionIdDeTemoin(),
    scopes: ["ops:read"],
    policyLevel: "brouillon",
    profile: "admin",
    idempotencyRef: null,
    requestId: "req-de-temoin-0001",
    deadline: new Date("2026-09-02T06:00:00Z"),
    habilitations: { peutVoirAppels: false, roleConsole: null },
    ...surcharge,
  };
}

/**
 * Un `fetch` simulé, TYPÉ sur la vraie signature.
 *
 * ⚠️ Un `vi.fn(async () => …)` sans paramètres compile, mais son `mock.calls`
 *    est un tuple VIDE : on ne peut alors rien affirmer sur ce qui est parti
 *    sur le fil, et le typecheck du dépôt le refuse — à raison.
 */
function fetchDeTemoin(reponse: () => Response): typeof fetch {
  return vi.fn((_url: Parameters<typeof fetch>[0], _init?: RequestInit) =>
    Promise.resolve(reponse()),
  );
}

/**
 * Un `fetch` simulé qui ÉCHOUE — l'erreur est rendue TELLE QUELLE.
 *
 * ⚠️ `throw` plutôt que `Promise.reject` : la règle `prefer-promise-reject-errors`
 *    exige une `Error`, et on veut justement pouvoir rejeter n'importe quoi —
 *    une panne réseau réelle porte sa `cause` dans un objet que le socle
 *    inspecte, et le test doit pouvoir en fabriquer de tordus.
 */
function fetchQuiEchoue(erreur: unknown): typeof fetch {
  return vi.fn((_url: Parameters<typeof fetch>[0], _init?: RequestInit): Promise<Response> => {
    throw erreur;
  });
}

/** Ce que le simulateur a reçu au n-ième appel. */
function appelRecu(faux: typeof fetch, index = 0): { url: unknown; init: RequestInit } {
  const calls = (faux as unknown as { mock: { calls: [unknown, RequestInit?][] } }).mock.calls;
  const call = calls[index];
  expect(call, `aucun appel n° ${String(index)}`).toBeDefined();
  return { url: call![0], init: call![1] ?? {} };
}

/** Une réponse JSON-RPC de succès, à laquelle on greffe une seule faute. */
function reponseOk(structure: unknown): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      id: "req-de-temoin-0001",
      result: { content: [], structuredContent: structure, isError: false },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const CHARGE_TYPE = {
  items: [
    { id: "a1", objet: "un" },
    { id: "a2", objet: "deux" },
  ],
  meta: { failedSources: ["podcast"], sourceIncomplete: true, returned: 2 },
};

describe("1 · le corps de l'appel — ce qui part sur le fil", () => {
  it("porte la méthode, le nom COMPLET de l'outil, et les identifiants opaques", () => {
    const corps = corpsDeLAppel(RACCORDEMENT, contexteDeTemoin(), { limite: 5 });
    expect(corps["jsonrpc"]).toBe("2.0");
    expect(corps["method"]).toBe(METHODE_APPEL);
    const params = corps["params"] as Record<string, unknown>;
    expect(params["name"]).toBe("axionia.inbox.recent");
    expect(params["arguments"]).toEqual({ limite: 5 });
    const meta = params["_meta"] as Record<string, unknown>;
    expect(meta["ops/requestId"]).toBe("req-de-temoin-0001");
    expect(meta["ops/principal"]).toBe("socle.temoin");
  });

  it("n'envoie l'idempotence QUE sous forme d'empreinte, et jamais quand il n'y en a pas", () => {
    const sans = corpsDeLAppel(RACCORDEMENT, contexteDeTemoin(), {});
    const metaSans = (sans["params"] as Record<string, unknown>)["_meta"] as Record<
      string,
      unknown
    >;
    expect(Object.keys(metaSans)).toEqual(["ops/requestId", "ops/principal"]);

    const avec = corpsDeLAppel(RACCORDEMENT, contexteDeTemoin({ idempotencyRef: "sha-abc" }), {});
    const metaAvec = (avec["params"] as Record<string, unknown>)["_meta"] as Record<
      string,
      unknown
    >;
    expect(metaAvec["ops/idempotencyKey"]).toBe("sha-abc");
    // ⚠️ L'EMPREINTE, jamais la clé (ADR 0020) : elle voyage vers un tiers.
    expect(JSON.stringify(avec)).not.toContain("idempotencyKey:");
  });

  it("présente le secret dans le BON en-tête, et rien d'autre dans le corps", async () => {
    const espion = fetchDeTemoin(() => reponseOk(CHARGE_TYPE));
    await appelerAdaptateurFedere(RACCORDEMENT, contexteDeTemoin(), {}, espion);

    const { url, init: options } = appelRecu(espion);
    expect(url).toBe(RACCORDEMENT.endpoint);
    const entetes = options.headers as Record<string, string>;
    expect(entetes[ENTETE_SECRET_PARTAGE]).toBe(SECRET);
    // Le secret ne doit JAMAIS se retrouver dans la charge utile.
    const corpsEnvoye = typeof options.body === "string" ? options.body : "";
    expect(corpsEnvoye).not.toContain(SECRET);
    expect(corpsEnvoye).toContain(RACCORDEMENT.nomComplet);
    // Une redirection rejouerait le secret vers une autre origine.
    expect(options.redirect).toBe("manual");
    expect(options.signal).toBeDefined();
    console.info(
      `[fédéré] en-tête « ${ENTETE_SECRET_PARTAGE} » · délai ${String(DELAI_PAR_DEFAUT_MS)} ms`,
    );
  });
});

describe("2 · les trois formes de réponse, qui ne se confondent pas", () => {
  it("succès → la charge, recopiée sans y toucher", () => {
    const { charge, verdict } = lireReponseDeLAdaptateur(
      { jsonrpc: "2.0", id: 1, result: { structuredContent: CHARGE_TYPE, isError: false } },
      200,
      ["id"],
    );
    expect(charge.items).toHaveLength(2);
    // Les deux étages de vérité du § 13.2, recopiés TELS QUELS.
    expect(charge.failedSources).toEqual(["podcast"]);
    expect(charge.sourceIncomplete).toBe(true);
    expect(verdict.itemsRecus).toBe(2);
    expect(verdict.champsConfrontes).toBeGreaterThan(0);
    console.info(
      `[fédéré] ${String(verdict.itemsRecus)} item(s) · ` +
        `${String(verdict.champsIdTrouves)} identifiant(s) · ` +
        `${String(verdict.champsConfrontes)} champ(s) confronté(s)`,
    );
  });

  it("erreur JSON-RPC → refus NOMMÉ, avec le code métier quand il y en a un", () => {
    let leve: unknown;
    try {
      lireReponseDeLAdaptateur(
        {
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32602, message: "entrée hors schéma", data: { code: "invalid_input" } },
        },
        200,
        [],
      );
    } catch (e) {
      leve = e;
    }
    expect(leve).toBeInstanceOf(ErreurAdaptateurDistant);
    expect((leve as ErreurAdaptateurDistant).codeDistant).toBe("invalid_input");
    expect((leve as Error).message).toContain("entrée hors schéma");
  });

  it("isError → refus d'EXÉCUTION, distinct d'une erreur de protocole", () => {
    let leve: unknown;
    try {
      lireReponseDeLAdaptateur(
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            isError: true,
            structuredContent: {
              code: "upstream_unavailable",
              message: "la source n'a pas répondu",
            },
          },
        },
        200,
        [],
      );
    } catch (e) {
      leve = e;
    }
    expect((leve as ErreurAdaptateurDistant).codeDistant).toBe("upstream_unavailable");
  });

  it("refuse ce qui n'est ni l'un ni l'autre — jamais une charge vide par défaut", () => {
    const cas: readonly [string, unknown][] = [
      ["pas un objet", "bonjour"],
      ["sans jsonrpc", { id: 1, result: {} }],
      ["jsonrpc 1.0", { jsonrpc: "1.0", id: 1, result: {} }],
      ["ni result ni error", { jsonrpc: "2.0", id: 1 }],
      ["succès sans structuredContent", { jsonrpc: "2.0", id: 1, result: { isError: false } }],
    ];
    for (const [nom, brut] of cas) {
      expect(() => lireReponseDeLAdaptateur(brut, 200, []), nom).toThrow(ErreurAdaptateurDistant);
    }
    console.info(`[fédéré] ${String(cas.length)} réponse(s) malformée(s) refusée(s)`);
  });
});

describe("3 · `recordIds` — DÉRIVÉS du manifeste, jamais reçus de l'adaptateur", () => {
  it("lit les valeurs des idFields épinglés, et dédoublonne", () => {
    const { recordIds, champsIdTrouves } = extraireRecordIds(
      [{ id: "a1" }, { id: "a2" }, { id: "a1" }, { id: 7 }],
      ["id"],
    );
    expect(recordIds).toEqual(["a1", "a2", "7"]);
    expect(champsIdTrouves).toBe(4);
  });

  it("IGNORE un `recordIds` que l'adaptateur mettrait dans sa réponse", () => {
    // 🔑 LE POINT DE L'ADR 0015. Un adaptateur distant — public dans le cas du
    //    CRM — qui déclarerait `recordIds: []` retirerait ses identifiants de la
    //    purge et du journal d'un seul mot. Le socle ne le lit pas.
    const { charge } = lireReponseDeLAdaptateur(
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          isError: false,
          structuredContent: { items: [{ id: "vrai-1" }], meta: {}, recordIds: [] },
        },
      },
      200,
      ["id"],
    );
    expect(charge.recordIds).toEqual(["vrai-1"]);
  });

  it("compte ZÉRO quand le champ épinglé a disparu — un silence qui se voit", () => {
    // Contrepartie assumée de ne rien croire sur parole : un adaptateur qui
    // renomme un champ sans régénérer son manifeste cesse d'être collecté. Le
    // compte est là pour que ce zéro ne passe pas inaperçu.
    const { verdict, charge } = lireReponseDeLAdaptateur(
      {
        jsonrpc: "2.0",
        id: 1,
        result: { isError: false, structuredContent: { items: [{ identifiant: "x" }], meta: {} } },
      },
      200,
      ["id"],
    );
    expect(verdict.itemsRecus).toBe(1);
    expect(verdict.champsIdTrouves).toBe(0);
    expect(charge.recordIds).toEqual([]);
  });
});

describe("4 · les refus HTTP que le contrôle 8 du harnais exige", () => {
  it("nomme 401 et 503 séparément, et dit quoi vérifier", async () => {
    for (const [statut, attendu] of [
      [401, "secret partagé"],
      [503, "configuration est incomplète"],
    ] as const) {
      const faux = fetchDeTemoin(() => new Response("", { status: statut }));
      await expect(
        appelerAdaptateurFedere(RACCORDEMENT, contexteDeTemoin(), {}, faux),
      ).rejects.toThrow(attendu);
    }
    console.info("[fédéré] 401 et 503 nommés séparément");
  });

  it("ne suit pas une redirection, et ne rejoue donc pas le secret ailleurs", async () => {
    const faux = fetchDeTemoin(
      () => new Response("", { status: 301, headers: { location: "https://ailleurs.invalid" } }),
    );
    await expect(
      appelerAdaptateurFedere(RACCORDEMENT, contexteDeTemoin(), {}, faux),
    ).rejects.toThrow("HTTP 301");
    expect(faux).toHaveBeenCalledOnce();
  });

  it("ne fait JAMAIS fuiter le secret dans un message d'erreur", async () => {
    const faux = fetchDeTemoin(() => new Response("", { status: 500 }));
    try {
      await appelerAdaptateurFedere(RACCORDEMENT, contexteDeTemoin(), {}, faux);
      expect.unreachable("l'appel devait échouer");
    } catch (e) {
      expect((e as Error).message).not.toContain(SECRET);
    }
  });
});

describe("5 · 🔑 une erreur réseau reste RECONNAISSABLE par le socle", () => {
  it("remonte telle quelle, et `estAmontInjoignable` la reconnaît", async () => {
    // On confronte au VRAI reconnaisseur du socle, jamais à une chaîne recopiée :
    // c'est lui qui décidera `upstream_unavailable` au § 15.
    const panne = Object.assign(new Error("fetch failed"), {
      cause: Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" }),
    });
    const faux = fetchQuiEchoue(panne);

    let leve: unknown;
    try {
      await appelerAdaptateurFedere(RACCORDEMENT, contexteDeTemoin(), {}, faux);
    } catch (e) {
      leve = e;
    }

    expect(leve, "l'erreur réseau a été avalée ou remplacée").toBe(panne);
    const verdict = estAmontInjoignable(leve);
    console.info(
      `[fédéré] erreur réseau → amont injoignable : ${String(verdict.injoignable)} ` +
        `(${String(verdict.causesExaminees)} cause(s) examinée(s))`,
    );
    expect(verdict.injoignable).toBe(true);
  });

  it("un dépassement de délai est lui aussi reconnu", async () => {
    const expire = Object.assign(new Error("The operation was aborted due to timeout"), {
      name: "TimeoutError",
      cause: Object.assign(new Error("timeout"), { code: "UND_ERR_CONNECT_TIMEOUT" }),
    });
    const faux = fetchQuiEchoue(expire);
    let leve: unknown;
    try {
      await appelerAdaptateurFedere(RACCORDEMENT, contexteDeTemoin(), {}, faux);
    } catch (e) {
      leve = e;
    }
    expect(estAmontInjoignable(leve).injoignable).toBe(true);
  });

  it("CONTRE-TÉMOIN : un refus de l'adaptateur n'est PAS un amont injoignable", () => {
    // Sans ce contre-témoin, un reconnaisseur qui dirait « oui » à tout
    // transformerait chaque refus légitime en « réessayez plus tard ».
    const refus = new ErreurAdaptateurDistant("entrée hors schéma", 200, "invalid_input");
    expect(estAmontInjoignable(refus).injoignable).toBe(false);
  });
});

describe("6 · la charge est VÉRIFIÉE, pas supposée", () => {
  it("refuse une charge dont la forme ne tient pas le contrat", () => {
    expect(() =>
      lireReponseDeLAdaptateur(
        {
          jsonrpc: "2.0",
          id: 1,
          result: {
            isError: false,
            structuredContent: { items: [{ id: "a" }], meta: { failedSources: "podcast" } },
          },
        },
        200,
        ["id"],
      ),
    ).not.toThrow();
    // `failedSources: "podcast"` (une chaîne) est filtré vers `[]` plutôt que
    // recopié : la charge reste conforme, et l'adaptateur ne peut pas glisser
    // une forme que l'étape 14 ne saurait pas lire.
    const { charge } = lireReponseDeLAdaptateur(
      {
        jsonrpc: "2.0",
        id: 1,
        result: {
          isError: false,
          structuredContent: { items: [{ id: "a" }], meta: { failedSources: "podcast" } },
        },
      },
      200,
      ["id"],
    );
    expect(charge.failedSources).toEqual([]);
  });

  it("un `items` absent donne une charge vide CONFORME, jamais un plantage", () => {
    const { charge, verdict } = lireReponseDeLAdaptateur(
      { jsonrpc: "2.0", id: 1, result: { isError: false, structuredContent: { meta: {} } } },
      200,
      ["id"],
    );
    expect(charge.items).toEqual([]);
    expect(charge.sourceIncomplete).toBe(false);
    expect(verdict.itemsRecus).toBe(0);
  });
});

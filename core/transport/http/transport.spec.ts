/**
 * `core/transport/http/transport.spec.ts` — **LE TRANSPORT, ÉPROUVÉ SANS
 * SOCKET.**
 *
 * ⚠️ **CE QUE CES GARDES MESURENT N'EST PAS UN STATUT, C'EST UN ORDRE.** Un
 *    transport qui rendrait `403` sur un hôte non autorisé APRÈS avoir analysé
 *    le corps et relu `ops_token` serait parfaitement vert sur son statut, et
 *    aurait perdu tout le sens de l'étape 1. Les doubles comptent donc : lectures
 *    du corps, vérifications de jeton, relectures d'`ops_token`, appels au noyau.
 *    C'est ce compte que les gardes lisent, jamais la couleur.
 */

import { describe, expect, it } from "vitest";

import { APPEL_STEPS, type AppelStep } from "../../types.js";
import {
  CHEMIN_MCP,
  CODE_JSON_RPC_REFUS_DU_SOCLE,
  ErreurReglageDuTransport,
  creerTransportHttp,
} from "./transport.js";
import type { DependancesTransportHttp, ReglagesTransportHttp } from "./transport.js";
import {
  AUDIENCE_DE_TEMOIN,
  HOTE_DE_TEMOIN,
  PONT_DE_TEMOIN,
  PORTEUR_DE_TEMOIN,
  enveloppeDeTemoin,
  ligneOpsTokenDeTemoin,
  registreDeTemoin,
  resultatDeRefus,
  resultatDeSucces,
  requeteDeTemoin,
  revendicationsDeTemoin,
  verificateurDeTemoin,
} from "./fixtures.js";

/** Le budget d'appel du témoin. Aucune valeur par défaut n'existe (écart assumé). */
const BUDGET_MS = 30_000;
const INSTANT = new Date(Date.UTC(2026, 7, 31, 12, 0, 0));

const REGLAGES: ReglagesTransportHttp = {
  hotesAdmis: [HOTE_DE_TEMOIN],
  audienceAttendue: AUDIENCE_DE_TEMOIN,
  budgetMs: BUDGET_MS,
};

/** Le numéro d'une étape, LU dans `APPEL_STEPS`. */
function etape(cle: (typeof APPEL_STEPS)[number]["cle"]): AppelStep {
  const trouvee = APPEL_STEPS.find((candidate) => candidate.cle === cle);
  if (trouvee === undefined) throw new Error(`§ 11 — clé « ${cle} » absente d'APPEL_STEPS`);
  return trouvee.numero;
}

interface Montage {
  readonly transport: ReturnType<typeof creerTransportHttp>;
  readonly verificateur: ReturnType<typeof verificateurDeTemoin>;
  readonly registre: ReturnType<typeof registreDeTemoin>;
  readonly appelsAuNoyau: () => number;
}

function monter(options: {
  readonly revendications?: ReturnType<typeof revendicationsDeTemoin> | null;
  readonly ligne?: ReturnType<typeof ligneOpsTokenDeTemoin> | null;
  readonly noyau?: DependancesTransportHttp["noyau"];
  readonly delaiDeReprise?: DependancesTransportHttp["delaiDeReprise"];
}): Montage {
  const verificateur = verificateurDeTemoin(
    options.revendications === undefined ? revendicationsDeTemoin() : options.revendications,
  );
  const registre = registreDeTemoin(
    options.ligne === undefined ? ligneOpsTokenDeTemoin() : options.ligne,
  );
  let appels = 0;
  const noyauParDefaut: DependancesTransportHttp["noyau"] = () => {
    appels += 1;
    return Promise.resolve(resultatDeSucces({ ok: true }));
  };
  const noyau: DependancesTransportHttp["noyau"] =
    options.noyau === undefined
      ? noyauParDefaut
      : (identite, appel) => {
          appels += 1;
          return options.noyau!(identite, appel);
        };

  const dependances: DependancesTransportHttp = {
    verificateurDeJeton: verificateur,
    registreDesJetons: registre,
    pontDIdentite: PONT_DE_TEMOIN,
    noyau,
    maintenant: () => INSTANT,
    ...(options.delaiDeReprise === undefined ? {} : { delaiDeReprise: options.delaiDeReprise }),
  };

  return {
    transport: creerTransportHttp(REGLAGES, dependances),
    verificateur,
    registre,
    appelsAuNoyau: () => appels,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ORDRE — la propriété qui définit ce lot
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — l'étape 1 s'exécute AVANT tout traitement", () => {
  it("un `Host` hors liste blanche : 403, et RIEN n'a été lu ni analysé", async () => {
    const montage = monter({});
    const requete = requeteDeTemoin({
      corps: enveloppeDeTemoin({}),
      hote: "attaquant.stub.invalid",
    });

    const { reponse, trace } = await montage.transport.traiter(requete);

    console.info(
      `[ordre · étape 1] statut ${String(reponse.statut)} · ` +
        `${String(requete.lecturesDuCorps())} lecture(s) du corps · ` +
        `${String(montage.verificateur.appels())} vérification(s) de jeton · ` +
        `${String(montage.registre.relectures())} relecture(s) d'ops_token · ` +
        `${String(trace.appelsAuNoyau)} appel(s) au noyau · ` +
        `corpsLu : ${String(trace.corpsLu)}`,
    );

    expect(reponse.statut).toBe(403);
    // ⚠️ LES QUATRE ZÉROS SONT LA GARDE. Le statut seul ne dirait rien de
    //    l'ordre : c'est le travail NON FAIT qui porte la propriété.
    expect(requete.lecturesDuCorps()).toBe(0);
    expect(montage.verificateur.appels()).toBe(0);
    expect(montage.registre.relectures()).toBe(0);
    expect(trace.appelsAuNoyau).toBe(0);
    expect(trace.corpsLu).toBe(false);
    // Un `403` d'hôte n'est pas un défaut d'authentification : aucun défi.
    expect(reponse.entetes["www-authenticate"]).toBeUndefined();
  });

  it("un `Host` hors liste blanche ne dit pas non plus quelles routes existent", async () => {
    const montage = monter({});
    const requete = requeteDeTemoin({
      corps: enveloppeDeTemoin({}),
      hote: "attaquant.stub.invalid",
      chemin: "/route-qui-nexiste-pas",
    });
    const { reponse } = await montage.transport.traiter(requete);
    console.info(
      `[ordre · routes] chemin inconnu + hôte refusé → statut ${String(reponse.statut)} ` +
        "(l'étape 1 passe avant le routage)",
    );
    expect(reponse.statut).toBe(403);
    expect(reponse.corps).not.toContain(CHEMIN_MCP);
  });
});

describe("§ 11, étapes 2 à 4 — un appel non authentifié n'obtient pas qu'on lise son corps", () => {
  it("aucun jeton : 401, défi NU (RFC 6750 § 3), corps jamais lu", async () => {
    const montage = monter({});
    const requete = requeteDeTemoin({ corps: enveloppeDeTemoin({}), porteur: null });
    const { reponse, trace } = await montage.transport.traiter(requete);

    const defi = reponse.entetes["www-authenticate"] ?? "";
    console.info(
      `[étape 2 · sans jeton] statut ${String(reponse.statut)} · défi « ${defi} » · ` +
        `${String(requete.lecturesDuCorps())} lecture(s) du corps · ` +
        `${String(trace.appelsAuNoyau)} appel(s) au noyau`,
    );

    expect(reponse.statut).toBe(401);
    expect(defi).toContain("Bearer");
    // ⚠️ PAS D'`error="invalid_token"` : aucune tentative n'a eu lieu. Le dire
    //    reviendrait à reprocher à un client un jeton qu'il n'a pas présenté.
    expect(defi).not.toContain("invalid_token");
    expect(requete.lecturesDuCorps()).toBe(0);
    expect(trace.appelsAuNoyau).toBe(0);
  });

  it('un jeton refusé par l\'émetteur : 401 avec `error="invalid_token"`', async () => {
    const montage = monter({ revendications: null });
    const requete = requeteDeTemoin({ corps: enveloppeDeTemoin({}) });
    const { reponse } = await montage.transport.traiter(requete);

    const defi = reponse.entetes["www-authenticate"] ?? "";
    console.info(`[étape 2 · jeton refusé] statut ${String(reponse.statut)} · défi « ${defi} »`);
    expect(reponse.statut).toBe(401);
    expect(defi).toContain('error="invalid_token"');
    // Et le défi ne recopie JAMAIS le porteur reçu.
    expect(defi).not.toContain(PORTEUR_DE_TEMOIN);
  });

  it("un jeton d'une AUTRE audience est refusé — RFC 8707, et le corps reste fermé", async () => {
    const montage = monter({
      revendications: revendicationsDeTemoin({ audience: "https://autre.stub.invalid/api/mcp" }),
    });
    const requete = requeteDeTemoin({ corps: enveloppeDeTemoin({}) });
    const { reponse, trace } = await montage.transport.traiter(requete);

    const corps: unknown = JSON.parse(reponse.corps);
    console.info(
      `[étape 3 · audience] statut ${String(reponse.statut)} · ` +
        `${String(requete.lecturesDuCorps())} lecture(s) du corps · ` +
        `${String(montage.registre.relectures())} relecture(s) d'ops_token · ` +
        `étapes franchies en amont : [${(trace.amont?.etapesFranchies ?? []).join(", ")}]`,
    );

    expect(reponse.statut).toBe(401);
    expect(reponse.entetes["www-authenticate"] ?? "").toContain('error="invalid_token"');
    // L'étape 4 n'a pas eu lieu : `ops_token` n'est pas relue pour un jeton dont
    // l'audience n'est pas la nôtre.
    expect(montage.registre.relectures()).toBe(0);
    expect(requete.lecturesDuCorps()).toBe(0);
    expect(JSON.stringify(corps)).toContain("unauthenticated");
    expect(trace.amont?.etapesFranchies).toEqual([1, 2]);
  });

  it("un `principal` malformé dans `ops_token` refuse l'appel — ADR 0029", async () => {
    const montage = monter({
      ligne: ligneOpsTokenDeTemoin({ principal: "une phrase avec des espaces" }),
    });
    const requete = requeteDeTemoin({ corps: enveloppeDeTemoin({}) });
    const { reponse, trace } = await montage.transport.traiter(requete);

    console.info(
      `[étape 4 · ADR 0029] statut ${String(reponse.statut)} · ` +
        `${String(trace.amont?.champsDeJournalInspectes ?? 0)} champ(s) de journal inspecté(s) · ` +
        `${String(trace.appelsAuNoyau)} appel(s) au noyau`,
    );

    expect(reponse.statut).toBe(401);
    expect(trace.appelsAuNoyau).toBe(0);
    // ⚠️ ET LE PRINCIPAL FAUTIF NE RESSORT PAS DANS LA RÉPONSE : c'est
    //    exactement la valeur que la garde du § 31 refuserait d'écrire.
    expect(reponse.corps).not.toContain("une phrase avec des espaces");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'APPEL COMPLET
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — un appel complet aboutit, et le socle frappe ce qu'il doit frapper", () => {
  it("sert la charge du noyau, une seule fois, avec une deadline CALCULÉE", async () => {
    const montage = monter({});
    const requete = requeteDeTemoin({
      corps: enveloppeDeTemoin({ nom: "demo.outil.lire", arguments: { page: 1 } }),
    });
    const { reponse, trace } = await montage.transport.traiter(requete);

    const corps = JSON.parse(reponse.corps) as {
      readonly id: unknown;
      readonly result: { readonly structuredContent: unknown };
    };

    console.info(
      `[appel complet] statut ${String(reponse.statut)} · ` +
        `${String(requete.lecturesDuCorps())} lecture(s) du corps · ` +
        `${String(trace.appelsAuNoyau)} appel(s) au noyau · ` +
        `budget ${String(trace.budgetMs)} ms · deadline ${trace.deadline?.toISOString() ?? "—"} · ` +
        `${String(trace.fuite.valeursConfrontees)} valeur(s) sensible(s) confrontée(s), ` +
        `${String(trace.fuite.valeursEcartees)} écartée(s), ` +
        `${String(trace.fuite.fuites.length)} fuite(s)`,
    );

    expect(reponse.statut).toBe(200);
    expect(corps.result.structuredContent).toEqual({ ok: true });
    expect(corps.id).toBe("1");
    expect(trace.appelsAuNoyau).toBe(1);
    expect(requete.lecturesDuCorps()).toBe(1);
    expect(trace.anomaliesDAmont).toEqual([]);
    // La `deadline` est CALCULÉE — un instant de référence plus un budget borné,
    // jamais un horodatage reçu recopié tel quel.
    expect(trace.deadline?.getTime()).toBe(INSTANT.getTime() + BUDGET_MS);
    // Et le filet anti-fuite a réellement confronté quelque chose.
    expect(trace.fuite.valeursConfrontees).toBeGreaterThanOrEqual(2);
    expect(trace.fuite.fuites).toEqual([]);
  });

  it("FRAPPE le `requestId` — il n'est ni l'en-tête reçu, ni l'`id` JSON-RPC", async () => {
    // ⚠️ LE TÉMOIN EST CONSTRUIT POUR ÊTRE TENTANT : l'appelant propose la MÊME
    //    valeur par deux chemins différents, celui d'un en-tête de corrélation et
    //    celui de l'enveloppe. Un transport qui « réutiliserait ce que le client
    //    a déjà » prendrait l'un des deux.
    const propose = "correlation-choisie-par-lappelant";
    const montage = monter({});
    const requete = requeteDeTemoin({
      corps: enveloppeDeTemoin({ id: propose }),
      entetesEnPlus: { "x-request-id": propose, "x-correlation-id": propose },
    });
    const premier = await montage.transport.traiter(requete);
    const second = await montage.transport.traiter(requete);

    console.info(
      `[requestId frappé] proposé par l'appelant : « ${propose} » · ` +
        `frappé n° 1 : « ${premier.trace.requestId} » · ` +
        `frappé n° 2 : « ${second.trace.requestId} » · ` +
        `identiques : ${String(premier.trace.requestId === second.trace.requestId)}`,
    );

    expect(premier.trace.requestId).not.toBe(propose);
    // Deux appels rigoureusement identiques ne convergent pas dans la même
    // ligne : c'est ce que `STATUT_DES_CANAUX_DE_CONTEXTE.requestId` protège.
    expect(premier.trace.requestId).not.toBe(second.trace.requestId);
    expect(premier.trace.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // L'`id` de l'enveloppe, lui, revient bien en face de la question — c'est le
    // rôle que le protocole lui donne, et le seul.
    const corps = JSON.parse(premier.reponse.corps) as { readonly id: unknown };
    expect(corps.id).toBe(propose);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LES RÉPONSES D'ERREUR — § 15
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 15 — le statut vient d'`APPEL_STEPS`, et le code du § 15 voyage dans la réponse", () => {
  it("rend le statut de l'étape qui a refusé, DÉRIVÉ — et 200 quand elle n'en a pas", async () => {
    const cas: ReadonlyArray<readonly [(typeof APPEL_STEPS)[number]["cle"], number]> = [
      ["coffre", 200],
      ["scopes", 403],
      ["outil-active", 200],
      ["politique", 200],
      ["quota", 429],
    ];

    const desaccords: string[] = [];
    for (const [cle, statutAttendu] of cas) {
      const numero = etape(cle);
      const montage = monter({
        noyau: () => Promise.resolve(resultatDeRefus(numero, "policy_denied", "refus de témoin")),
      });
      const { reponse } = await montage.transport.traiter(
        requeteDeTemoin({ corps: enveloppeDeTemoin({}) }),
      );
      if (reponse.statut !== statutAttendu) {
        desaccords.push(
          `étape ${cle} (${String(numero)}) : ${String(reponse.statut)} au lieu de ` +
            `${String(statutAttendu)}`,
        );
      }
      const corps = JSON.parse(reponse.corps) as {
        readonly error: { readonly code: number; readonly data: { readonly code: string } };
      };
      if (corps.error.code !== CODE_JSON_RPC_REFUS_DU_SOCLE) {
        desaccords.push(`étape ${cle} : code JSON-RPC ${String(corps.error.code)}`);
      }
      if (corps.error.data.code !== "policy_denied") {
        desaccords.push(`étape ${cle} : code du § 15 « ${corps.error.data.code} »`);
      }
    }

    console.info(
      `[§ 15 · statuts] ${String(cas.length)} étape(s) éprouvée(s) · ` +
        `statuts DÉRIVÉS d'APPEL_STEPS[n].statutHttp · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );
    expect(desaccords).toEqual([]);
  });

  it("429 — `Retry-After` est posé quand le délai est connu, et COMPTÉ quand il ne l'est pas", async () => {
    const numero = etape("quota");

    const sansDelai = monter({
      noyau: () => Promise.resolve(resultatDeRefus(numero, "rate_limited", "débit dépassé")),
    });
    const a = await sansDelai.transport.traiter(requeteDeTemoin({ corps: enveloppeDeTemoin({}) }));

    const avecDelai = monter({
      noyau: () => Promise.resolve(resultatDeRefus(numero, "rate_limited", "débit dépassé")),
      delaiDeReprise: () => 7.2,
    });
    const b = await avecDelai.transport.traiter(requeteDeTemoin({ corps: enveloppeDeTemoin({}) }));

    console.info(
      `[§ 15 · Retry-After] sans lecteur de délai : statut ${String(a.reponse.statut)}, ` +
        `en-tête ${String(a.reponse.entetes["retry-after"])}, ` +
        `écart compté : ${String(a.trace.retryAfterAbsentSur429)} · ` +
        `avec lecteur : statut ${String(b.reponse.statut)}, ` +
        `en-tête ${String(b.reponse.entetes["retry-after"])}`,
    );

    expect(a.reponse.statut).toBe(429);
    // 🔴 L'ÉCART EST VISIBLE, ET IL SE COMPTE. `RefusDetaille` ne porte pas le
    //    délai — il n'existe que dans le TEXTE du message de l'étape 12.
    expect(a.reponse.entetes["retry-after"]).toBeUndefined();
    expect(a.trace.retryAfterAbsentSur429).toBe(true);

    expect(b.reponse.statut).toBe(429);
    // Arrondi au SUPÉRIEUR, et jamais zéro : un `Retry-After: 0` inviterait à
    // rejouer immédiatement l'appel qu'on vient de refuser pour excès de débit.
    expect(b.reponse.entetes["retry-after"]).toBe("8");
    expect(b.trace.retryAfterAbsentSur429).toBe(false);
  });

  it("une exception du noyau rend `internal` — un identifiant, JAMAIS une trace de pile", async () => {
    const montage = monter({
      noyau: () => {
        throw new Error(
          "ECONNREFUSED postgres://ops:motdepasse@10.0.0.7:5432/ops — at Depot.lire " +
            "(/srv/axion-ops/core/limits/quota.ts:118:11)",
        );
      },
    });
    const { reponse, trace } = await montage.transport.traiter(
      requeteDeTemoin({ corps: enveloppeDeTemoin({}) }),
    );

    console.info(
      `[§ 15 · internal] statut ${String(reponse.statut)} · ` +
        `corps de ${String(reponse.corps.length)} caractère(s) · ` +
        `identifiant de corrélation présent : ${String(reponse.corps.includes(trace.requestId))}`,
    );

    expect(reponse.statut).toBe(500);
    expect(reponse.corps).toContain(trace.requestId);
    // Aucun fragment de la cause ne sort : ni chemin de fichier, ni chaîne de
    // connexion, ni « at », ni numéro de ligne.
    for (const fragment of ["ECONNREFUSED", "motdepasse", "10.0.0.7", "quota.ts", "at Depot"]) {
      expect(reponse.corps).not.toContain(fragment);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE FILET ANTI-FUITE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 15 et § 20 — une réponse qui porterait une valeur de la requête est RETENUE", () => {
  it("le jeton de confirmation ne reparaît JAMAIS dans une réponse d'erreur", async () => {
    // § 20 : « confirmation_required — dit la cible exacte, ET JAMAIS LE JETON DE
    // CONFIRMATION ». Le témoin est un noyau qui le recopie dans son message.
    const jeton = "jeton-de-confirmation-a-usage-unique-0001";
    const numero = etape("politique");
    const montage = monter({
      noyau: () =>
        Promise.resolve(
          resultatDeRefus(numero, "confirmation_required", `Confirmer avec le jeton ${jeton}`),
        ),
    });

    const { reponse, trace } = await montage.transport.traiter(
      requeteDeTemoin({
        corps: enveloppeDeTemoin({
          meta: { "ops/confirmationToken": jeton },
        }),
      }),
    );

    console.info(
      `[anti-fuite] ${String(trace.fuite.valeursConfrontees)} valeur(s) confrontée(s) · ` +
        `${String(trace.fuite.valeursEcartees)} écartée(s) (trop courtes) · ` +
        `fuite(s) retenue(s) : [${trace.fuite.fuites.join(", ")}] · ` +
        `statut servi ${String(reponse.statut)}`,
    );

    expect(trace.fuite.fuites).toEqual(["jeton de confirmation"]);
    // FAIL-CLOSED : la réponse est remplacée. Perdre un message d'aide coûte
    // moins qu'un jeton à usage unique renvoyé dans un corps d'erreur.
    expect(reponse.corps).not.toContain(jeton);
    expect(reponse.statut).toBe(500);
  });

  it("un argument de l'appel recopié dans un message est retenu lui aussi", async () => {
    const argument = "adresse-electronique-du-destinataire";
    const numero = etape("provenance");
    const montage = monter({
      noyau: () =>
        Promise.resolve(resultatDeRefus(numero, "provenance_denied", `Argument : ${argument}`)),
    });

    const { reponse, trace } = await montage.transport.traiter(
      requeteDeTemoin({
        corps: enveloppeDeTemoin({ arguments: { destinataire: argument, page: 3 } }),
      }),
    );

    console.info(
      `[anti-fuite · arguments] ${String(trace.fuite.valeursConfrontees)} confrontée(s) · ` +
        `fuite(s) : [${trace.fuite.fuites.join(", ")}]`,
    );

    expect(trace.fuite.fuites.length).toBe(1);
    expect(reponse.corps).not.toContain(argument);
  });

  it("le NOM D'OUTIL, lui, a le droit de reparaître — le § 15 l'exige", async () => {
    // ⚠️ TÉMOIN DE NON-RÉGRESSION DU FILET. Le § 15 veut que `tool_disabled`
    //    « dise qu'il existe, et où l'activer ». Un filet qui confronterait le
    //    nom d'outil rougirait sur le comportement PRESCRIT, et le remède qu'on
    //    lui chercherait serait de le désactiver.
    const nom = "demo.outil.desactive";
    const numero = etape("outil-active");
    const montage = monter({
      noyau: () =>
        Promise.resolve(
          resultatDeRefus(numero, "tool_disabled", `L'outil « ${nom} » est désactivé en console.`),
        ),
    });

    const { reponse, trace } = await montage.transport.traiter(
      requeteDeTemoin({ corps: enveloppeDeTemoin({ nom }) }),
    );

    console.info(
      `[anti-fuite · nom d'outil] statut ${String(reponse.statut)} · ` +
        `${String(trace.fuite.fuites.length)} fuite(s) · ` +
        `le nom reparaît : ${String(reponse.corps.includes(nom))}`,
    );

    expect(trace.fuite.fuites).toEqual([]);
    expect(reponse.corps).toContain(nom);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENVELOPPE ET LA ROUTE
// ═════════════════════════════════════════════════════════════════════════════

describe("JSON-RPC 2.0 — l'enveloppe, la route, et ce qui n'est pas servi", () => {
  it("refuse les enveloppes mal formées sans recopier le corps reçu", async () => {
    const secret = "valeur-sensible-du-corps-recu";
    const cas: ReadonlyArray<readonly [string, string, number, number]> = [
      ["un corps illisible", `{ pas du json ${secret}`, 400, -32700],
      ["un tableau au lieu d'un objet", `["${secret}"]`, 400, -32600],
      [
        "une version de protocole autre",
        `{"jsonrpc":"1.0","id":1,"method":"tools/call"}`,
        400,
        -32600,
      ],
      ["une méthode inconnue", `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`, 400, -32601],
      ["des params absents", `{"jsonrpc":"2.0","id":1,"method":"tools/call"}`, 400, -32602],
      [
        "un nom d'outil vide",
        `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":""}}`,
        400,
        -32602,
      ],
      [
        "une clé d'idempotence numérique — une absence en silence serait pire",
        `{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"a.b","_meta":{"ops/idempotencyKey":42}}}`,
        400,
        -32602,
      ],
    ];

    const desaccords: string[] = [];
    for (const [nom, corps, statut, codeJsonRpc] of cas) {
      const montage = monter({});
      const { reponse, trace } = await montage.transport.traiter(requeteDeTemoin({ corps }));
      if (reponse.statut !== statut) {
        desaccords.push(`${nom} : statut ${String(reponse.statut)} au lieu de ${String(statut)}`);
      }
      const lu = JSON.parse(reponse.corps) as { readonly error: { readonly code: number } };
      if (lu.error.code !== codeJsonRpc) {
        desaccords.push(`${nom} : code ${String(lu.error.code)} au lieu de ${String(codeJsonRpc)}`);
      }
      if (reponse.corps.includes(secret)) {
        desaccords.push(`${nom} : la réponse recopie le corps reçu`);
      }
      if (trace.appelsAuNoyau !== 0) {
        desaccords.push(`${nom} : le noyau a été appelé sur une enveloppe invalide`);
      }
    }

    console.info(
      `[enveloppe] ${String(cas.length)} enveloppe(s) invalide(s) éprouvée(s) · ` +
        `${String(desaccords.length)} désaccord(s) · ` +
        "⚠️ « tools/list » n'est PAS servi par ce lot — écart signalé au rapport",
    );
    expect(cas.length).toBeGreaterThanOrEqual(7);
    expect(desaccords).toEqual([]);
  });

  it("ne sert que `POST /api/mcp`, et le dit sans dévoiler autre chose", async () => {
    const montage = monter({});
    const chemin = await montage.transport.traiter(
      requeteDeTemoin({ corps: enveloppeDeTemoin({}), chemin: "/autre" }),
    );
    const methode = await montage.transport.traiter(
      requeteDeTemoin({ corps: enveloppeDeTemoin({}), methode: "GET" }),
    );

    console.info(
      `[route] chemin inconnu → ${String(chemin.reponse.statut)} · ` +
        `méthode refusée → ${String(methode.reponse.statut)} ` +
        `(Allow: ${String(methode.reponse.entetes["allow"])})`,
    );

    expect(chemin.reponse.statut).toBe(404);
    expect(methode.reponse.statut).toBe(405);
    expect(methode.reponse.entetes["allow"]).toBe("POST");
    expect(chemin.trace.corpsLu).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LES REFUS DE CONSTRUCTION
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11, ADR 0025 — le transport refuse de se monter sur un socle qui ne garderait rien", () => {
  it("rougit sur trois réglages, et chacun ferme un vert-pour-rien distinct", () => {
    const temoins: ReadonlyArray<readonly [string, ReglagesTransportHttp]> = [
      ["une liste blanche d'hôtes VIDE", { ...REGLAGES, hotesAdmis: [] }],
      ["une audience attendue VIDE", { ...REGLAGES, audienceAttendue: "" }],
      ["un budget d'appel nul", { ...REGLAGES, budgetMs: 0 }],
      ["un budget d'appel négatif", { ...REGLAGES, budgetMs: -1 }],
      ["un budget d'appel non entier", { ...REGLAGES, budgetMs: 1.5 }],
    ];

    const manquees: string[] = [];
    for (const [nom, reglages] of temoins) {
      try {
        creerTransportHttp(reglages, {
          verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
          registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
          pontDIdentite: PONT_DE_TEMOIN,
          noyau: () => Promise.resolve(resultatDeSucces(null)),
        });
        manquees.push(nom);
      } catch (erreur: unknown) {
        if (!(erreur instanceof ErreurReglageDuTransport)) {
          manquees.push(`${nom} : levée d'un autre genre`);
        }
      }
    }

    console.info(
      `[construction] ${String(temoins.length)} réglage(s) absurde(s) éprouvé(s) · ` +
        `${String(manquees.length)} accepté(s) à tort`,
    );
    expect(temoins.length).toBeGreaterThanOrEqual(5);
    expect(manquees).toEqual([]);
  });
});

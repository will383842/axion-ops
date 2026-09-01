/**
 * `core/transport/valeurs-servies.spec.ts` — **LE REJEU, APPARIÉ SUR LES DEUX
 * TRANSPORTS. ADR 0037, § 4.**
 *
 * ⚠️ **CE QUE CETTE GARDE MESURE N'EST PAS « HTTP REND QUELQUE CHOSE ».** C'est
 *    que les DEUX transports, mis devant le MÊME noyau doublé, rendent le même
 *    genre et le même `resultRef`. Une garde qui n'aurait éprouvé qu'un seul fil
 *    n'aurait rien vu du défaut : stdio était juste, HTTP effaçait les deux
 *    valeurs, et chacun était vert de son côté.
 *
 * ⚠️ **LE TROU ÉTAIT EXACTEMENT L'ABSENCE DE CE FICHIER.** Aucun des onze
 *    `it.fails` de `core/epreuve/lot2-le-transport-attaque.temoin.spec.ts` ne
 *    portait sur le rejeu, et la mutation qui rendait le chemin FATAL sur un
 *    rejeu HTTP a survécu à la suite complète (lot 3, M5). Un corpus ne voit pas
 *    ce qu'il ne contient pas.
 */

import { describe, expect, it } from "vitest";

import { colonneDuTransport } from "../chaine/orchestrateur.js";
import type { ChargeServie, ResultatAppel, Transport } from "../chaine/orchestrateur.js";
import type { Habilitations } from "../types.js";
import { ErreurTerminaisonInconnue, valeursServiesAuClient } from "./valeurs-servies.js";
import { creerTransportHttp } from "./http/transport.js";
import type { DependancesTransportHttp, ReglagesTransportHttp } from "./http/transport.js";
import {
  AUDIENCE_DE_TEMOIN,
  HOTE_DE_TEMOIN,
  PONT_DE_TEMOIN,
  enveloppeDeTemoin,
  ligneOpsTokenDeTemoin,
  registreDeTemoin,
  requeteDeTemoin,
  revendicationsDeTemoin,
  verificateurDeTemoin,
} from "./http/fixtures.js";
import { creerServeurStdio } from "./stdio/serveur.js";
import type { CatalogueServiEnStdio } from "./stdio/serveur.js";

/** La référence du résultat d'origine — § 13. Une valeur, jamais un secret. */
const REFERENCE_DU_REJEU = "ref-du-rejeu-0001";
const INSTANT = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));

/**
 * Les deux GENRES de terminaison servie, DÉRIVÉS et non recopiés : la garde
 * d'exhaustivité de {@link valeursServiesAuClient} porte sur eux.
 */
const GENRES_SERVIS = ["exécuté", "rejeu"] as const;

/** Une terminaison servie, du genre demandé. Rien d'autre ne change entre les deux. */
function chargeServie(genre: (typeof GENRES_SERVIS)[number], transport: Transport): ChargeServie {
  const colonne = colonneDuTransport(transport);
  const trace = {
    transport,
    etapesApplicables: colonne.etapesApplicables,
    etapesNonApplicables: colonne.etapesNonApplicables,
    etapesAmont: colonne.etapesAmont,
    etapesFranchies: [],
    etapeRefusante: null,
    etapesNonAtteintes: [],
    niveauApplique: "brouillon" as const,
    niveauMesures: 0,
    argHashBrutIndisponible: false,
    ligneDIntention: null,
  };
  if (genre === "rejeu") {
    return { genre: "rejeu", resultRef: REFERENCE_DU_REJEU, trace };
  }
  return {
    genre: "exécuté",
    execution: {
      charge: { ok: true },
      palier: "intact",
      outcome: "ok",
      octetsServis: 0,
      octetsBruts: 0,
      champsMasques: 0,
      recordIds: [],
      partialSources: [],
      sourceIncomplete: false,
    },
    trace,
  };
}

/** Un `ResultatAppel` de succès portant la terminaison donnée. */
function resultatServi(charge: ChargeServie): ResultatAppel {
  return {
    terminaison: {
      genre: "succès",
      valeur: charge,
      outcome: "ok",
      recordIds: [],
      partialSources: [],
    },
    ligne: { seq: 7n, selfHash: "c".repeat(64) },
    refus: null,
    trace: charge.trace,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  ① LA DÉRIVATION — exhaustive, et elle le DIT
// ─────────────────────────────────────────────────────────────────────────────

describe("ADR 0037 — les valeurs servies au client sont dérivées UNE FOIS", () => {
  it("couvre les DEUX genres de terminaison, et annonce ce qu'elle a confronté", () => {
    const verdicts = GENRES_SERVIS.map((genre) => ({
      genre,
      valeurs: valeursServiesAuClient(chargeServie(genre, "stdio")),
    }));

    console.info(
      `[ADR 0037 · dérivation] ${String(verdicts.length)} genre(s) de terminaison confronté(s) : ` +
        verdicts
          .map(
            ({ genre, valeurs }) =>
              `${genre} → genre=${valeurs.genre} · resultRef=${String(valeurs.resultRef)} · ` +
              `charge=${valeurs.charge === null ? "null" : "présente"}`,
          )
          .join(" · "),
    );

    expect(verdicts).toHaveLength(GENRES_SERVIS.length);
    // Un rejeu rend la RÉFÉRENCE, jamais la charge une seconde fois.
    expect(valeursServiesAuClient(chargeServie("rejeu", "stdio"))).toEqual({
      genre: "rejeu",
      resultRef: REFERENCE_DU_REJEU,
      charge: null,
    });
    // Une exécution EST l'origine : elle n'a pas de `resultRef`.
    expect(valeursServiesAuClient(chargeServie("exécuté", "stdio")).resultRef).toBeNull();
    expect(valeursServiesAuClient(chargeServie("exécuté", "stdio")).charge).toEqual({ ok: true });
  });

  it("REFUSE un genre inconnu au lieu de le laisser tomber en silence dans `null`", () => {
    // Le défaut d'origine était un test d'ÉGALITÉ : tout ce qui n'était pas
    // « exécuté » devenait `null`, sans un mot. Le témoin fabrique la valeur que
    // le type interdit — elle peut venir de JavaScript non typé.
    const inconnu = { genre: "troisième-branche" } as unknown as ChargeServie;

    console.info("[ADR 0037 · exhaustivité] 1 genre hors union confronté · refus attendu");

    expect(() => valeursServiesAuClient(inconnu)).toThrow(ErreurTerminaisonInconnue);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  ② LES DEUX TRANSPORTS, DEVANT LE MÊME NOYAU
// ─────────────────────────────────────────────────────────────────────────────

describe("ADR 0037 — un REJEU est lisible des DEUX côtés, et il l'est pareil", () => {
  it("publie `genre` et `resultRef` en HTTP comme en stdio", async () => {
    // ── HTTP ────────────────────────────────────────────────────────────────
    const reglages: ReglagesTransportHttp = {
      hotesAdmis: [HOTE_DE_TEMOIN],
      audienceAttendue: AUDIENCE_DE_TEMOIN,
      budgetMs: 30_000,
    };
    const dependancesHttp: DependancesTransportHttp = {
      verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
      registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
      pontDIdentite: PONT_DE_TEMOIN,
      noyau: () => Promise.resolve(resultatServi(chargeServie("rejeu", "http"))),
      maintenant: () => INSTANT,
    };
    const transport = creerTransportHttp(reglages, dependancesHttp);
    const traitement = await transport.traiter(
      requeteDeTemoin({ corps: enveloppeDeTemoin({ nom: "bonjour.dire" }) }),
    );
    const corpsHttp = JSON.parse(traitement.reponse.corps) as {
      readonly result?: { readonly _meta?: Record<string, unknown> };
    };
    const metaHttp = corpsHttp.result?._meta ?? {};

    // ── stdio ───────────────────────────────────────────────────────────────
    const sortie: string[] = [];
    const catalogue: CatalogueServiEnStdio = {
      listerPourCetAppel: () => Promise.resolve([]),
    };
    const serveur = creerServeurStdio({
      noyau: () => Promise.resolve(resultatServi(chargeServie("rejeu", "stdio"))),
      catalogue,
      habilitations: (): Habilitations => ({ peutVoirAppels: false }),
      maintenant: () => INSTANT,
      ecrire: (ligne) => sortie.push(ligne),
    });
    await serveur.absorber(
      `${JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "bonjour.dire" },
      })}\n`,
    );
    const corpsStdio = JSON.parse(sortie[0] ?? "{}") as {
      readonly result?: { readonly genre?: unknown; readonly resultRef?: unknown };
    };

    console.info(
      "[ADR 0037 · rejeu apparié] même terminaison présentée aux 2 transports · " +
        `HTTP : genre=${String(metaHttp["ops/genre"])} resultRef=${String(metaHttp["ops/resultRef"])} · ` +
        `stdio : genre=${String(corpsStdio.result?.genre)} resultRef=${String(corpsStdio.result?.resultRef)}`,
    );

    // Chacun dans SON enveloppe, mais les mêmes valeurs.
    expect(metaHttp["ops/genre"]).toBe("rejeu");
    expect(metaHttp["ops/resultRef"]).toBe(REFERENCE_DU_REJEU);
    expect(corpsStdio.result?.genre).toBe("rejeu");
    expect(corpsStdio.result?.resultRef).toBe(REFERENCE_DU_REJEU);
    // Et l'appariement lui-même, mesuré plutôt que relu.
    expect(metaHttp["ops/genre"]).toBe(corpsStdio.result?.genre);
    expect(metaHttp["ops/resultRef"]).toBe(corpsStdio.result?.resultRef);
  });

  it("TÉMOIN INVERSE — une EXÉCUTION reste une exécution, et ne gagne pas de `resultRef`", async () => {
    const reglages: ReglagesTransportHttp = {
      hotesAdmis: [HOTE_DE_TEMOIN],
      audienceAttendue: AUDIENCE_DE_TEMOIN,
      budgetMs: 30_000,
    };
    const transport = creerTransportHttp(reglages, {
      verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
      registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
      pontDIdentite: PONT_DE_TEMOIN,
      noyau: () => Promise.resolve(resultatServi(chargeServie("exécuté", "http"))),
      maintenant: () => INSTANT,
    });
    const traitement = await transport.traiter(
      requeteDeTemoin({ corps: enveloppeDeTemoin({ nom: "bonjour.dire" }) }),
    );
    const corps = JSON.parse(traitement.reponse.corps) as {
      readonly result?: {
        readonly structuredContent?: unknown;
        readonly _meta?: Record<string, unknown>;
      };
    };

    console.info(
      "[ADR 0037 · exécution] 1 terminaison exécutée confrontée · " +
        `genre=${String(corps.result?._meta?.["ops/genre"])} · ` +
        `resultRef=${String(corps.result?._meta?.["ops/resultRef"])}`,
    );

    expect(corps.result?._meta?.["ops/genre"]).toBe("exécuté");
    expect(corps.result?._meta?.["ops/resultRef"]).toBeNull();
    expect(corps.result?.structuredContent).toEqual({ ok: true });
  });
});

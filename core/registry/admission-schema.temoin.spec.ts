import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { lireClesDAutorisation } from "../adapter-kit/autorisation.js";
import { creerAdapterKit } from "../adapter-kit/kit.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import { octetsCanoniques } from "../adapter-kit/json.js";
import { PROFILE_NAMES, SCEAU_PROFILS } from "../profiles/index.js";
import type { ProfileName } from "../profiles/index.js";

import { ErreurGardeAveugle, enregistrerAdaptateur } from "./enregistrer.js";
import { empreinteDuManifesteProduit } from "./lock.js";
import { MOTIFS_REFUS, type EntreeVerrou, type VerrouAdaptateurs } from "./types.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";

/**
 * TÉMOINS — L'ADMISSION D'UN MANIFESTE VENU D'AILLEURS SAIT-ELLE ROUGIR ?
 *
 * Ce fichier éprouve les deux barrières que le lot 1b a posées au registre, et
 * elles seules :
 *
 *  · ADR 0003 — le schéma d'entrée doit exprimer sa FERMETURE, dans l'un ou
 *    l'autre dialecte, et ne porter AUCUN champ d'autorisation (§ 09) ;
 *  · ADR 0004 — le manifeste doit avoir été produit contre L'ÉNUMÉRATION DE
 *    PROFILS du socle, et l'empreinte le dit là où le nom ne dit rien.
 *
 * ═══ POURQUOI CES TÉMOINS SONT FABRIQUÉS PAR MUTATION ═══
 *
 * Le kit REFUSE désormais de construire un manifeste au schéma ouvert : on ne
 * peut donc plus en produire un par la voie normale, ce qui est le but. Les
 * témoins partent d'un manifeste CONFORME, le mutilent sur UN SEUL point, et
 * réépinglent le verrou sur le document mutilé — sinon c'est l'empreinte qui
 * refuserait, et la garde visée ne serait jamais atteinte.
 *
 * C'est la règle « un témoin doit isoler UNE seule règle » : neutraliser les
 * voisines est la condition pour qu'une anomalie observée porte sur la règle
 * visée, et sur elle seule.
 */

const PROFILS: readonly ProfileName[] = PROFILE_NAMES;
const kit = creerAdapterKit<ProfileName>(PROFILS, SCEAU_PROFILS);

/** Les noms interdits, DÉRIVÉS de `core/types.ts` — jamais écrits ici. */
const CLES_AUTORISATION = lireClesDAutorisation().toutes;

function manifesteTemoin(): Manifeste {
  return kit
    .defineAdapter({
      id: "axionia",
      version: "1.0.0",
      mode: "fédéré",
      profiles: ["dev", "admin"],
      secrets: [],
      tools: [
        kit.definirOutil({
          name: "inbox.recent",
          version: "1.0.0",
          description: "Les messages récents.",
          effect: "read",
          dataClass: "personal",
          idempotency: "n/a",
          pagination: "page",
          input: z.object({ limite: z.number().int() }).strict(),
          output: z.object({ submissionId: z.string(), extrait: z.string() }).strict(),
          maxBytes: 4096,
          compaction: { free: ["extrait"], tier2: [], aggregateBy: null },
          idFields: ["submissionId"],
          governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
          fixtureMax: "fixtures/inbox.json",
          handler: () => ({ submissionId: "s1", extrait: "…" }),
        }),
      ],
    })
    .manifeste();
}

/** Une copie profonde, franchissant un fil JSON — comme un manifeste reçu. */
function recu(manifeste: Manifeste): Manifeste {
  return JSON.parse(JSON.stringify(manifeste)) as Manifeste;
}

function entreeVerrou(manifeste: Manifeste): EntreeVerrou {
  return {
    id: manifeste.id,
    version: manifeste.version,
    mode: manifeste.mode,
    manifestSha: empreinteDuManifesteProduit(manifeste),
    trustTier: 1,
    maxDataClass: "personal",
    endpoint: "https://adaptateur.stub.invalid/api/mcp",
    authMode: "secret-partage",
    secretRef: "axionia.mcp.shared",
  };
}

function verrou(entrees: readonly EntreeVerrou[]): VerrouAdaptateurs {
  return { lockVersion: 1, adapters: entrees };
}

/**
 * Recalcule les `bytes` d'un outil après mutation.
 *
 * Sans lui, le contrôle `bytes_incoherent` refuserait AVANT celui qu'on vise,
 * et le témoin mesurerait la mauvaise garde. C'est le sens de « neutraliser les
 * voisines ».
 */
function rebaser(manifeste: Manifeste): Manifeste {
  return {
    ...manifeste,
    tools: manifeste.tools.map((outil) => {
      const { bytes: _ignore, ...sansBytes } = outil;
      return { ...outil, bytes: octetsCanoniques(sansBytes) };
    }),
  };
}

/** Admet ou refuse, avec un verrou épinglé SUR CE document exact. */
function admettre(manifeste: Manifeste): ReturnType<typeof enregistrerAdaptateur> {
  return enregistrerAdaptateur({
    manifesteBrut: manifeste,
    verrou: verrou([entreeVerrou(manifeste)]),
    profilsConnus: PROFILS,
    sceauProfils: SCEAU_PROFILS,
    clesDAutorisation: CLES_AUTORISATION,
  });
}

function motifs(resultat: ReturnType<typeof enregistrerAdaptateur>): readonly string[] {
  return resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Le point de départ : un manifeste conforme EST admis
// ─────────────────────────────────────────────────────────────────────────────

describe("TÉMOIN — le décor lui-même est sain", () => {
  it("admet le manifeste témoin, et ANNONCE le nombre d'outils inspectés", () => {
    const resultat = admettre(recu(manifesteTemoin()));

    console.log(
      `[témoin décor] ${String(resultat.outilsInspectes)} outil(s) inspecté(s), ` +
        `admis : ${String(resultat.admis)}, motifs : ${motifs(resultat).join(", ") || "aucun"}`,
    );

    // Sans ce point de départ vert, chaque témoin rouge plus bas pourrait être
    // rouge pour n'importe quelle autre raison.
    expect(resultat.admis).toBe(true);
    expect(resultat.outilsInspectes).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  ADR 0003 — la fermeture, et le contrôle 7
// ─────────────────────────────────────────────────────────────────────────────

describe("TÉMOIN — ADR 0003 : le schéma d'entrée d'un manifeste reçu", () => {
  /**
   * LE TÉMOIN EXACT MESURÉ PAR LA RECETTE AU LOT 1 :
   * « un manifeste fédéré dont un outil déclare
   *   `inputSchema: { type: "object", properties: { peutVoirAppels: {…} } }`
   *   — sans `additionalProperties` — est ADMIS sans un mot ».
   */
  function avecSchemaDuLot1(): Manifeste {
    const base = recu(manifesteTemoin());
    return rebaser({
      ...base,
      tools: base.tools.map((outil) => ({
        ...outil,
        inputSchema: {
          type: "object",
          properties: { peutVoirAppels: { type: "boolean" } },
        },
      })),
    });
  }

  it("REFUSE le témoin du lot 1 — schéma ouvert ET champ d'autorisation", () => {
    const resultat = admettre(avecSchemaDuLot1());
    const trouves = motifs(resultat);

    console.log(
      `[témoin ADR 0003 · lot 1] admis : ${String(resultat.admis)}, ` +
        `${String(trouves.length)} refus : ${trouves.join(", ")}`,
    );

    expect(resultat.admis).toBe(false);
    // LES DEUX règles du § 09 mordent, pas une seule : elles sont distinctes.
    expect(trouves).toContain("schema_entree_ouvert");
    expect(trouves).toContain("champ_d_autorisation_au_schema");
  });

  it("REFUSE un schéma seulement OUVERT, sans champ d'autorisation", () => {
    const base = recu(manifesteTemoin());
    const ouvert = rebaser({
      ...base,
      tools: base.tools.map((outil) => ({
        ...outil,
        inputSchema: { type: "object", properties: { limite: { type: "integer" } } },
      })),
    });

    const trouves = motifs(admettre(ouvert));

    console.log(
      `[témoin ADR 0003 · ouvert] ${String(trouves.length)} refus : ${trouves.join(", ")}`,
    );

    expect(trouves).toContain("schema_entree_ouvert");
    // Et PAS l'autre : un témoin qui déclencherait les deux ne prouverait pas
    // qu'ils sont distincts.
    expect(trouves).not.toContain("champ_d_autorisation_au_schema");
  });

  it("REFUSE un champ d'autorisation dans un schéma pourtant FERMÉ", () => {
    const base = recu(manifesteTemoin());
    const ferme = rebaser({
      ...base,
      tools: base.tools.map((outil) => ({
        ...outil,
        inputSchema: {
          type: "object",
          properties: { peutVoirAppels: { type: "boolean" } },
          additionalProperties: false,
        },
      })),
    });

    const trouves = motifs(admettre(ferme));

    console.log(
      `[témoin ADR 0003 · fermé] ${String(trouves.length)} refus : ${trouves.join(", ")}`,
    );

    expect(trouves).toEqual(["champ_d_autorisation_au_schema"]);
  });

  it("REFUSE `roleConsole` — le nom répercuté d'Axion-IA le 2026-09-02", () => {
    // Avant cette date, `Habilitations` ne portait que `peutVoirAppels` : un
    // manifeste déclarant `roleConsole` en entrée était ADMIS, et l'adaptateur
    // d'Axion-IA (qui réserve 12 noms) l'aurait refusé seul. La dérivation lit
    // `core/types.ts` : retirer la propriété là-bas fait rougir ICI.
    const base = recu(manifesteTemoin());
    const avecRole = rebaser({
      ...base,
      tools: base.tools.map((outil) => ({
        ...outil,
        inputSchema: {
          type: "object",
          properties: { roleConsole: { type: "string" } },
          additionalProperties: false,
        },
      })),
    });

    const trouves = motifs(admettre(avecRole));
    console.log(
      `[témoin ADR 0003 · roleConsole] ${String(trouves.length)} refus : ${trouves.join(", ")}`,
    );
    expect(trouves).toEqual(["champ_d_autorisation_au_schema"]);
  });

  it("ADMET l'autre dialecte — `unevaluatedProperties: false` (la décision)", () => {
    // C'est le cœur de l'ADR 0003. Un registre qui n'accepterait que le
    // dialecte de Zod rejetterait un manifeste PHP parfaitement correct — et,
    // en pratique, obtiendrait une exception écrite à la main.
    const base = recu(manifesteTemoin());
    const autre = rebaser({
      ...base,
      tools: base.tools.map((outil) => ({
        ...outil,
        inputSchema: {
          type: "object",
          properties: { limite: { type: "integer" } },
          unevaluatedProperties: false,
        },
      })),
    });

    const resultat = admettre(autre);

    console.log(
      `[témoin ADR 0003 · dialecte composable] admis : ${String(resultat.admis)}, ` +
        `motifs : ${motifs(resultat).join(", ") || "aucun"}`,
    );

    expect(resultat.admis).toBe(true);
  });

  it("LÈVE si l'appelant prive le contrôle 7 de sa matière", () => {
    // Ce n'est pas un refus de manifeste : le manifeste n'y est pour rien.
    // C'est un défaut de l'APPELANT, et le laisser passer rendrait le contrôle
    // 7 vert sur n'importe quel schéma.
    const manifeste = recu(manifesteTemoin());
    expect(() =>
      enregistrerAdaptateur({
        manifesteBrut: manifeste,
        verrou: verrou([entreeVerrou(manifeste)]),
        profilsConnus: PROFILS,
        sceauProfils: SCEAU_PROFILS,
        clesDAutorisation: [],
      }),
    ).toThrow(ErreurGardeAveugle);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  ADR 0004 — le sceau de l'énumération de profils
// ─────────────────────────────────────────────────────────────────────────────

describe("TÉMOIN — ADR 0004 : l'énumération contre laquelle le manifeste a été produit", () => {
  it("REFUSE une VERSION d'énumération différente de celle du socle", () => {
    const base = recu(manifesteTemoin());
    const perime = rebaser({ ...base, profilesVersion: "0.9.0" });

    const trouves = motifs(admettre(perime));

    console.log(
      `[témoin ADR 0004 · version] ${String(trouves.length)} refus : ${trouves.join(", ")}`,
    );

    expect(trouves).toEqual(["enumeration_profils_divergente"]);
  });

  it("REFUSE la MÊME version avec une EMPREINTE différente — le cas qui comptait", () => {
    // ⚠️ C'EST LE TÉMOIN QUI JUSTIFIE L'EMPREINTE. Le nom des profils reste
    //    connu, la version reste la bonne, et pourtant l'énumération a changé :
    //    un profil retiré puis rendu, un `depuis` corrigé. Sans empreinte, ce
    //    manifeste-là était admis sans un mot, et la divergence ne se voyait
    //    NULLE PART. Confronter la seule version le laisserait passer.
    const base = recu(manifesteTemoin());
    const divergent = rebaser({ ...base, profilesSha: "b".repeat(64) });

    const resultat = admettre(divergent);
    const trouves = motifs(resultat);

    console.log(
      `[témoin ADR 0004 · empreinte] version annoncée « ${divergent.profilesVersion} » ` +
        `= celle du socle, empreinte différente ; ${String(trouves.length)} refus : ` +
        trouves.join(", "),
    );

    expect(divergent.profilesVersion).toBe(SCEAU_PROFILS.version);
    expect(trouves).toEqual(["enumeration_profils_divergente"]);
  });

  it("REFUSE un manifeste qui ne porte PAS le sceau — un document d'avant le lot 1b", () => {
    const base = recu(manifesteTemoin());
    // Les champs sont RETIRÉS par déstructuration : `Manifeste` est en lecture
    // seule, et un `delete` sur une propriété `readonly` ne compile pas — ce
    // qui est en soi une garde, celle du type.
    const { profilesVersion: _v, profilesSha: _s, ...sansSceau } = base;

    const resultat = enregistrerAdaptateur({
      manifesteBrut: sansSceau,
      verrou: verrou([entreeVerrou(base)]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    console.log(
      `[témoin ADR 0004 · sceau absent] admis : ${String(resultat.admis)}, ` +
        `motifs : ${motifs(resultat).join(", ")}`,
    );

    expect(resultat.admis).toBe(false);
    // Le schéma fermé de `manifeste-recu.ts` le prend AVANT tout le reste :
    // un document sans sceau n'est pas un manifeste de ce socle.
    expect(motifs(resultat)).toContain("manifeste_malforme");
  });

  it("ADMET le sceau du socle, et le sceau du socle SEUL — dérivé, jamais recopié", () => {
    const manifeste = recu(manifesteTemoin());

    console.log(
      `[témoin ADR 0004 · sceau conforme] version « ${manifeste.profilesVersion} », ` +
        `empreinte ${manifeste.profilesSha.slice(0, 12)}…`,
    );

    // Le manifeste porte EXACTEMENT ce que `core/profiles` déclare : la chaîne
    // kit → manifeste → registre transporte le sceau sans le recalculer nulle
    // part. Un recalcul quelque part sur ce trajet serait une seconde source de
    // vérité, et la garde cesserait de mordre.
    expect(manifeste.profilesVersion).toBe(SCEAU_PROFILS.version);
    expect(manifeste.profilesSha).toBe(SCEAU_PROFILS.empreinte);
    expect(admettre(manifeste).admis).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Les trois motifs nouveaux existent bien dans l'union du registre
// ─────────────────────────────────────────────────────────────────────────────

describe("TÉMOIN — les motifs de refus sont déclarés, pas inventés à l'usage", () => {
  it("range les trois motifs du lot 1b dans `MOTIFS_REFUS`", () => {
    const nouveaux = [
      "schema_entree_ouvert",
      "champ_d_autorisation_au_schema",
      "enumeration_profils_divergente",
    ] as const;

    console.log(
      `[témoin motifs] ${String(MOTIFS_REFUS.length)} motifs déclarés, ` +
        `${String(nouveaux.length)} confrontés`,
    );

    // Plancher-témoin : l'union ne s'est pas vidée.
    expect(MOTIFS_REFUS.length).toBeGreaterThanOrEqual(16);
    for (const motif of nouveaux) {
      expect(MOTIFS_REFUS).toContain(motif);
    }
  });
});

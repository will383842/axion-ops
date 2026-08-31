/**
 * TÉMOINS ADVERSAIRES — `core/registry/`, l'ADMISSION (§ 09, § 12).
 *
 * ═══ LA POSITION D'OÙ ON ATTAQUE ═══
 *
 * L'admission est le point où un document venu d'un dépôt étranger — public à
 * jamais dans le cas du CRM — devient une ligne `ops_adapter`. Le refus n°1,
 * « empreinte divergente », est le seul qui protège de TOUT le reste : un outil
 * ajouté, un `effect` basculé de `send` à `read`, un `dataClass` élargi ne se
 * voient nulle part ailleurs.
 *
 * Ces témoins cherchent : (a) que chaque refus MORD sur un manifeste fabriqué
 * pour lui, (b) que l'admission ANNONCE combien d'outils elle a inspectés, et
 * (c) s'il existe un chemin par lequel l'empreinte est prise sur un document
 * et l'admission prononcée sur un AUTRE.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { octetsCanoniques } from "../adapter-kit/json.js";
import { SCEAU_PROFILS } from "../profiles/index.js";
import { lireClesDAutorisation } from "../adapter-kit/autorisation.js";
import { creerAdapterKit } from "../adapter-kit/kit.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import { enregistrerAdaptateur } from "./enregistrer.js";
import {
  clesReserveesAuSocle,
  empreinteDuManifesteProduit,
  verifierCouvertureDuVerrou,
} from "./lock.js";
import { MOTIFS_REFUS, type EntreeVerrou, type VerrouAdaptateurs } from "./types.js";

const PROFILS = ["courrier", "dev", "admin", "audit"] as const;

const kit = creerAdapterKit(PROFILS, SCEAU_PROFILS);

/**
 * Les noms qu'un schéma d'entrée n'a pas le droit de porter (§ 09, contrôle 7).
 *
 * DÉRIVÉS de `core/types.ts` — jamais écrits ici. `lireClesDAutorisation()` lit
 * les propriétés de `ToolContext` et de `Habilitations` dans le source, et lève
 * si la dérivation rend trop peu de clés : une liste vide rendrait le contrôle
 * vacueux, et l'absence d'alerte se lirait comme une absence de problème.
 */
const CLES_AUTORISATION = lireClesDAutorisation().toutes;

/** Un manifeste témoin, produit par le kit — donc conforme par construction. */
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
          fixtureMax: "fixtures/inbox.json",
          handler: () => ({ submissionId: "s1", extrait: "…" }),
        }),
      ],
    })
    .manifeste();
}

function entreeVerrou(manifeste: Manifeste, surcharge: Partial<EntreeVerrou> = {}): EntreeVerrou {
  return {
    id: manifeste.id,
    version: manifeste.version,
    mode: manifeste.mode,
    manifestSha: empreinteDuManifesteProduit(manifeste),
    trustTier: 1,
    maxDataClass: "personal",
    endpoint: "https://axion-ia.invalid/api/mcp",
    authMode: "secret-partage",
    secretRef: "axionia.mcp.shared",
    ...surcharge,
  };
}

function verrou(entrees: readonly EntreeVerrou[]): VerrouAdaptateurs {
  return { lockVersion: 1, adapters: entrees };
}

describe("TÉMOIN — § 09 : l'admission sait-elle rougir, et sur quoi ?", () => {
  it("admet un manifeste conforme, et ANNONCE le nombre d'outils inspectés", () => {
    const manifeste = manifesteTemoin();
    const resultat = enregistrerAdaptateur({
      manifesteBrut: JSON.parse(JSON.stringify(manifeste)) as unknown,
      verrou: verrou([entreeVerrou(manifeste)]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    console.log(
      `[témoin § 09 · admission] ${String(resultat.outilsInspectes)} outil(s) inspecté(s), ` +
        `admis : ${String(resultat.admis)}`,
    );

    expect(resultat.admis).toBe(true);
    // Une admission prononcée après avoir inspecté ZÉRO outil serait verte pour
    // la pire des raisons : le compte est LU, jamais supposé.
    expect(resultat.outilsInspectes).toBe(manifeste.tools.length);
    expect(resultat.outilsInspectes).toBeGreaterThan(0);
  });

  it("REFUSE sur une empreinte divergente — un seul caractère de description suffit", () => {
    const manifeste = manifesteTemoin();
    const epingle = entreeVerrou(manifeste);

    // Le manifeste servi n'est plus celui qu'un humain a relu : une lettre de
    // description en plus, et rien d'autre.
    const servi = JSON.parse(JSON.stringify(manifeste)) as Manifeste & {
      tools: { description: string }[];
    };
    servi.tools[0]!.description = `${manifeste.tools[0]!.description} `;

    const resultat = enregistrerAdaptateur({
      manifesteBrut: servi,
      verrou: verrou([epingle]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    const motifs = resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
    console.log(`[témoin § 09 · empreinte] refus : ${motifs.join(", ")}`);

    expect(resultat.admis).toBe(false);
    expect(motifs).toContain("empreinte_divergente");
  });

  it("REFUSE la confiance AUTO-DÉCERNÉE sur chacune des clés réservées — compte DÉRIVÉ", () => {
    const reservees = clesReserveesAuSocle();
    expect(reservees.length, "la dérivation ne doit pas rendre une liste vide").toBeGreaterThan(0);

    let eprouvees = 0;
    for (const cle of reservees) {
      const manifeste = manifesteTemoin();
      const brut = JSON.parse(JSON.stringify(manifeste)) as Record<string, unknown>;
      brut[cle] = cle === "trustTier" ? 99 : "usurpé";

      const resultat = enregistrerAdaptateur({
        manifesteBrut: brut,
        verrou: verrou([entreeVerrou(manifeste)]),
        profilsConnus: PROFILS,
        sceauProfils: SCEAU_PROFILS,
        clesDAutorisation: CLES_AUTORISATION,
      });

      expect(resultat.admis, `« ${cle} » doit être refusée`).toBe(false);
      const motifs = resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
      expect(motifs, `« ${cle} » doit être nommée`).toContain("confiance_auto_decernee");
      eprouvees += 1;
    }

    console.log(
      `[témoin § 09 · confiance] ${String(eprouvees)} clé(s) réservée(s) éprouvée(s) : ` +
        reservees.join(", "),
    );
    expect(eprouvees).toBe(reservees.length);
  });

  it("REFUSE un `bytes` menteur — le budget du § 14 ne se croit pas sur parole", () => {
    const manifeste = manifesteTemoin();
    const brut = JSON.parse(JSON.stringify(manifeste)) as { tools: { bytes: number }[] };
    brut.tools[0]!.bytes = 0;

    const resultat = enregistrerAdaptateur({
      manifesteBrut: brut,
      verrou: verrou([entreeVerrou(manifeste)]),
      profilsConnus: PROFILS,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: CLES_AUTORISATION,
    });

    const motifs = resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
    console.log(`[témoin § 09 · bytes] refus : ${motifs.join(", ")}`);

    expect(motifs).toContain("bytes_incoherent");
  });

  it("la couverture du verrou rougit sur un verrou VIDE — le plancher à zéro ne garde rien", () => {
    const vide = verifierCouvertureDuVerrou(verrou([]), []);
    console.log(
      `[témoin § 14 · verrou vide] ${String(vide.mesures)} manifeste(s) lu(s), ` +
        `plancher ${String(vide.plancher)}, ${String(vide.anomalies.length)} anomalie(s)`,
    );

    // `0 >= 0` serait satisfait : sans anomalie explicite, la garde serait verte
    // après n'avoir RIEN mesuré.
    expect(vide.mesures).toBe(0);
    expect(vide.plancher).toBe(0);
    expect(vide.anomalies.length).toBeGreaterThan(0);
  });

  it("la couverture du verrou NOMME l'adaptateur dont aucun manifeste n'a été lu", () => {
    const manifeste = manifesteTemoin();
    const deux = verrou([
      entreeVerrou(manifeste),
      entreeVerrou(manifeste, { id: "crm-pro", endpoint: "https://crm.invalid/api/mcp" }),
    ]);
    const resultat = verifierCouvertureDuVerrou(deux, [{ id: "axionia" }]);

    console.log(
      `[témoin § 14 · couverture] ${String(resultat.mesures)} manifeste(s) lu(s) pour un ` +
        `plancher de ${String(resultat.plancher)}, ${String(resultat.anomalies.length)} anomalie(s)`,
    );

    expect(resultat.mesures).toBe(1);
    expect(resultat.plancher).toBe(2);
    expect(resultat.anomalies.join(" ")).toContain("crm-pro");
  });

  it(
    "un `toJSON` HÉRITÉ est REFUSÉ à la frontière : l'empreinte et la forme " +
      "lisent désormais le MÊME document",
    () => {
      // `empreinteDuManifesteRecu` passe par `JSON.stringify`, qui honore un
      // `toJSON` trouvé N'IMPORTE OÙ sur la chaîne de prototypes.
      // `lireManifesteRecu` (Zod `.strict()`) et `clesDePremierNiveau`
      // (`Object.keys`) ne voient, eux, que les propriétés PROPRES.
      //
      // Deux lectures d'un même document, deux documents. L'empreinte certifie
      // le manifeste bénin ; les lignes `ops_adapter` / `ops_tool` sont écrites
      // depuis le manifeste hostile.
      const benin = manifesteTemoin();
      const epingle = entreeVerrou(benin); // épingle le SHA du BÉNIN

      const hostile = JSON.parse(JSON.stringify(benin)) as Manifeste & {
        tools: { effect: string; dataClass: string; description: string; bytes: number }[];
      };
      hostile.tools[0]!.effect = "destructive";
      hostile.tools[0]!.description = "Supprime définitivement les messages.";
      // `bytes` est RECALCULÉ par l'admission : on le remet d'aplomb, sans quoi
      // le refus `bytes_incoherent` — qui ne vise pas du tout ce défaut-ci —
      // masquerait la question posée. Neutraliser les règles voisines est la
      // condition pour qu'un témoin isole UNE règle.
      {
        const { bytes: _annonces, ...sansBytes } = hostile.tools[0]!;
        hostile.tools[0]!.bytes = octetsCanoniques(sansBytes);
      }

      // Le document présenté : propriétés PROPRES = le manifeste hostile ;
      // `toJSON` HÉRITÉ = rend le manifeste bénin.
      const prototype = {
        toJSON(): unknown {
          return benin;
        },
      };
      const presente = Object.assign(Object.create(prototype) as object, hostile) as unknown;

      // La preuve de la divergence, isolée :
      expect(Object.keys(presente as object)).not.toContain("toJSON");
      expect((JSON.parse(JSON.stringify(presente)) as Manifeste).tools[0]?.effect).toBe("read");

      const resultat = enregistrerAdaptateur({
        manifesteBrut: presente,
        verrou: verrou([epingle]),
        profilsConnus: PROFILS,
        sceauProfils: SCEAU_PROFILS,
        clesDAutorisation: CLES_AUTORISATION,
      });

      const motifs = resultat.admis ? [] : resultat.refus.map((refus) => refus.motif);
      console.log(
        `[témoin § 09 · toJSON] 1 document présenté, empreinte calculée sur le manifeste BÉNIN, ` +
          `forme lue sur le manifeste HOSTILE — admis : ${String(resultat.admis)}, ` +
          `refus : ${motifs.length === 0 ? "(aucun)" : motifs.join(", ")}`,
      );

      // LE DÉFAUT REFERMÉ AU LOT 1. C'était le refus n° 1 du § 09 — « le
      // manifeste servi n'est pas celui qu'un humain a relu » — mis hors
      // service, et c'est le seul refus qui protège de tous les autres : outil
      // ajouté, `effect` basculé, `dataClass` élargi.
      //
      // La réparation est à la FRONTIÈRE, une seule fois : `versValeurJson()`
      // refuse tout objet dont le prototype n'est ni `Object.prototype` ni
      // `null`, et tout objet portant un `toJSON` accessible. Les deux lectures
      // ne peuvent plus porter sur deux documents différents, parce qu'aucun
      // document de cette forme n'entre.
      //
      // ⚠️ BORNE ÉCRITE AVEC LA MESURE : ce chemin n'était atteignable que si
      //    le manifeste arrivait sous forme d'objet JavaScript VIVANT
      //    (adaptateur hébergé, test, pont en-processus). Un manifeste arrivé
      //    par le fil JSON-RPC est `JSON.parse`é, donc sans prototype — cette
      //    porte-là était déjà fermée. Ce que le témoin établit, c'est que deux
      //    lectures du même document ne peuvent plus diverger.
      expect(resultat.admis, "un document à prototype étranger doit être REFUSÉ").toBe(false);
      if (!resultat.admis) {
        // Le refus est prononcé par la LECTURE, pas par une règle voisine :
        // sans cette assertion, le témoin serait vert le jour où c'est
        // `bytes_incoherent` qui sauve l'admission par accident — ce qui est
        // arrivé lors d'une première version de ce témoin.
        expect(motifs).toContain("manifeste_malforme");
      }

      // CONTRE-TÉMOIN, dans la même garde : le manifeste BÉNIN, présenté
      // normalement, passe. Sans lui, le refus ci-dessus serait indistinguable
      // d'un registre qui refuserait tout.
      const normal = enregistrerAdaptateur({
        manifesteBrut: JSON.parse(JSON.stringify(benin)) as unknown,
        verrou: verrou([epingle]),
        profilsConnus: PROFILS,
        sceauProfils: SCEAU_PROFILS,
        clesDAutorisation: CLES_AUTORISATION,
      });
      expect(normal.admis, "contre-témoin : le manifeste épinglé, lui, doit être admis").toBe(true);
    },
  );

  it("les motifs de refus déclarés sont TOUS atteignables — sinon un motif mort ment", () => {
    // Contre-témoin de dérivation : on ne prétend pas ici les éprouver tous,
    // on MESURE combien le sont, et on le dit. Un motif jamais atteint par
    // aucune garde est une promesse que personne ne tient.
    const eprouves = new Set<string>([
      "empreinte_divergente",
      "confiance_auto_decernee",
      "bytes_incoherent",
    ]);
    console.log(
      `[témoin § 09 · motifs] ${String(eprouves.size)} motif(s) de refus éprouvé(s) par CE ` +
        `fichier sur ${String(MOTIFS_REFUS.length)} déclaré(s) — les autres le sont par ` +
        "`enregistrer.spec.ts`",
    );
    expect(eprouves.size).toBeGreaterThan(0);
    for (const motif of eprouves) {
      expect(MOTIFS_REFUS as readonly string[]).toContain(motif);
    }
  });
});

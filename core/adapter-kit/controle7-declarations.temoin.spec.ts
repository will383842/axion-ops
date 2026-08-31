/**
 * TÉMOINS ADVERSAIRES — `core/adapter-kit/fermeture.ts`, le contrôle 7 du § 09
 * et la fermeture des schémas d'entrée.
 *
 * ═══ LA QUESTION QU'ON POSE ═══
 *
 * Le contrôle 7 tient une règle courte : « une décision de droit atteint la
 * couche service par `ctx`, et par lui seul ». Il l'applique en cherchant, dans
 * tout le schéma d'entrée, une PROPRIÉTÉ portant le nom d'une clé
 * d'autorisation dérivée de `core/types.ts`.
 *
 * Le contrôle de fermeture tient la règle jumelle : aucun schéma d'objet ne
 * doit laisser passer une propriété non déclarée, « un champ d'autorisation
 * glissé dans la charge utile y passerait en silence ».
 *
 * Les deux sont branchés au registre (`core/registry/enregistrer.ts`), qui
 * refuse l'adaptateur sur `schema_entree_ouvert` et sur
 * `champ_d_autorisation_au_schema`.
 *
 * La question adverse : **JSON Schema déclare-t-il des propriétés ailleurs que
 * dans `properties` ?** Oui — `patternProperties` en déclare par motif, et
 * `additionalProperties` sous sa forme OBJET en déclare par défaut. Aucun des
 * deux consommateurs ne les lit.
 *
 * ═══ CE QUE CES TÉMOINS ONT MESURÉ ═══
 *
 * `sousSchemas()` VISITAIT bien `patternProperties` — il est dans
 * `APPLICATEURS_OBJET`. Mais ses deux consommateurs, `analyserFermeture()` et
 * `chercherChampsDAutorisation()`, ne lisaient ensuite que `sous["properties"]`.
 * Le sous-schéma d'un `patternProperties` était donc visité, puis ignoré : il ne
 * déclare pas de `properties`, donc il n'était ni « à fermer », ni inspecté pour
 * ses noms. Et le MOTIF lui-même — qui est l'endroit où le nom est écrit —
 * n'était jamais confronté à la liste interdite.
 *
 * Conséquence, mesurée et non supposée : le même nom réservé passait ou ne
 * passait pas selon l'endroit où on l'écrivait dans le schéma. Écrit sous
 * `properties`, il était refusé ; écrit sous `patternProperties`, il était
 * admis, et le schéma était déclaré FERMÉ par-dessus le marché.
 *
 * ⚠️ CE N'ÉTAIT PAS LA BORNE `$ref`. Le module écrit déjà que les `$ref` ne sont
 *    pas résolus, et les SIGNALE (`refsNonResolus`). Là, rien n'était signalé :
 *    le verdict était net, positif, et faux.
 *
 * ═══ CE QUE LA RECETTE A CORRIGÉ, ET POURQUOI CES TESTS SONT EN `it()` ═══
 *
 * Le défaut est fermé des deux côtés, et **aucun test n'a été supprimé** : les
 * témoins portaient déjà l'assertion CORRECTE — celle du § 09 —, ils étaient
 * donc verts sous `it.fails` parce qu'elle échouait. Elle ne peut plus échouer :
 * les mêmes corps, mot pour mot, sont passés en `it()`.
 *
 *  · `chercherChampsDAutorisation()` confronte désormais LE MOTIF de
 *    `patternProperties` à chaque nom interdit — fail-closed sur un motif qui ne
 *    compile pas, réputé tout admettre — et NOMME les clés réservées qu'un
 *    emplacement joker admet toutes
 *    (`additionalProperties`/`unevaluatedProperties` en forme de schéma, ou
 *    `{"type":"object"}` nu).
 *  · `analyserFermeture()` compte parmi les `objetsAFermer` tout sous-schéma qui
 *    déclare par quelque mot-clé que ce soit, et tout schéma d'objet ; et un
 *    dialecte de fermeture INERTE — un `unevaluatedProperties: false` posé à
 *    côté d'un `additionalProperties` en forme de schéma — ne ferme plus rien.
 *
 * ⚠️ LA DÉCISION PRISE ICI APPARTIENT AU MODULE, PAS AU CDC. Le § 09 ne dit rien
 *    de `patternProperties`. Un objet qui déclare ses champs par un MOTIF n'a pas
 *    d'ensemble de noms énumérable, et le contrôle 7 ne peut confronter que ce
 *    qu'il énumère : il est donc traité comme NON FERMÉ. Fail-closed, et signalé
 *    au rapport.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { PROFILE_NAMES, SCEAU_PROFILS } from "../profiles/index.js";
import { enregistrerAdaptateur } from "../registry/enregistrer.js";
import { empreinteDuManifesteRecu } from "../registry/lock.js";
import { lireClesDAutorisation } from "./autorisation.js";
import { analyserFermeture, chercherChampsDAutorisation, sousSchemas } from "./fermeture.js";
import { octetsCanoniques, type ValeurJson } from "./json.js";
import { creerAdapterKit } from "./kit.js";
import type { Manifeste } from "./manifest.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "./types.js";

/** DÉRIVÉES de `core/types.ts` — jamais écrites ici. */
const CLES = lireClesDAutorisation().toutes;

/** Le nom réservé qu'on essaie de faire passer. LU dans la liste dérivée. */
const NOM_RESERVE = CLES.find((cle) => cle === "peutVoirAppels") ?? CLES[0];

describe("§ 09 contrôle 7 — la liste interdite a de la matière", () => {
  it("porte assez de noms pour que le contrôle ne soit pas vacueux", () => {
    console.info(
      `[capacité contrôle 7] ${String(CLES.length)} nom(s) interdit(s) dérivé(s) de ` +
        `core/types.ts · nom éprouvé : « ${String(NOM_RESERVE)} »`,
    );
    // Plancher-témoin : une liste vide ferait de tous les témoins ci-dessous des
    // verts sans objet — le contrôle ne chercherait plus rien.
    expect(CLES.length).toBeGreaterThanOrEqual(5);
    expect(NOM_RESERVE).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Témoin de CAPACITÉ — le contrôle 7 mord sur la forme nue
// ─────────────────────────────────────────────────────────────────────────────

describe("§ 09 contrôle 7 — il mord sur la déclaration ORDINAIRE", () => {
  it("refuse un nom réservé déclaré sous `properties`, et compte ce qu'il a lu", () => {
    const nu = {
      type: "object",
      properties: {
        id: { type: "string" },
        [String(NOM_RESERVE)]: { type: "boolean" },
      },
      additionalProperties: false,
    };

    const verdict = chercherChampsDAutorisation(nu, CLES);

    console.info(
      `[capacité contrôle 7] ${String(verdict.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(verdict.clesInterdites)} nom(s) interdit(s) · ` +
        `${String(verdict.trouves.length)} trouvé(s)`,
    );

    // ⚠️ SANS CE TÉMOIN, les `it.fails` ci-dessous ne distingueraient pas
    //    « le contrôle ne voit pas CETTE forme » de « le contrôle ne voit rien ».
    expect(verdict.trouves.map((champ) => champ.nom)).toEqual([NOM_RESERVE]);
    expect(verdict.proprietesInspectees).toBeGreaterThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  DÉFAUT FERMÉ — les propriétés déclarées AILLEURS que dans `properties`
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les deux emplacements où JSON Schema déclare des propriétés sans employer le
 * mot-clé `properties`. La liste est unique, pour que le compte annoncé soit
 * DÉRIVÉ et qu'un emplacement ajouté entre au compte le jour même.
 */
const DECLARATIONS_HORS_PROPERTIES = [
  {
    cle: "patternProperties",
    quoi: "le nom réservé est déclaré par un motif exact",
    schema: {
      type: "object",
      properties: { id: { type: "string" } },
      patternProperties: { [`^${String(NOM_RESERVE)}$`]: { type: "boolean" } },
      additionalProperties: false,
    },
  },
  {
    cle: "additionalProperties-objet",
    quoi: "toute propriété non déclarée est acceptée, le nom réservé compris",
    schema: {
      type: "object",
      properties: { id: { type: "string" } },
      unevaluatedProperties: false,
      additionalProperties: { type: "boolean" },
    },
  },
] as const;

describe("§ 09 — un nom réservé déclaré hors de `properties` est vu", () => {
  it("ANNONCE combien d'emplacements sont éprouvés, et combien passent", () => {
    const passent = DECLARATIONS_HORS_PROPERTIES.filter((cas) => {
      const c7 = chercherChampsDAutorisation(cas.schema, CLES);
      const fermeture = analyserFermeture(cas.schema);
      return c7.trouves.length === 0 && fermeture.ferme;
    });

    console.info(
      `[témoin § 09 · déclarations] ${String(DECLARATIONS_HORS_PROPERTIES.length)} emplacement(s) ` +
        `hors « properties » éprouvé(s) · ${String(passent.length)} ADMIS PAR LE REGISTRE ET ` +
        `INVISIBLE(S) AU CONTRÔLE 7 : ${passent.map((cas) => cas.cle).join(", ")}`,
    );

    expect(DECLARATIONS_HORS_PROPERTIES.length).toBeGreaterThanOrEqual(2);
    expect(passent.length).toBeLessThanOrEqual(DECLARATIONS_HORS_PROPERTIES.length);
  });

  it("montre que le parcours VISITE le sous-schéma, puis que le contrôle l'ignore", () => {
    // La distinction compte pour le correctif : le défaut n'est PAS dans le
    // parcours — `patternProperties` est bien dans `APPLICATEURS_OBJET` — il est
    // dans les deux consommateurs, qui ne lisent que `sous["properties"]`.
    const cas = DECLARATIONS_HORS_PROPERTIES[0];
    const visites = sousSchemas(cas.schema).trouves;
    const parMotif = visites.filter((sous) => sous.chemin.includes("patternProperties"));

    console.info(
      `[témoin § 09 · parcours] ${String(visites.length)} sous-schéma(s) visité(s) · ` +
        `${String(parMotif.length)} atteint(s) par patternProperties : ` +
        parMotif.map((sous) => sous.chemin).join(", "),
    );

    // Le parcours fait son travail. C'est la lecture d'après qui ne le fait pas.
    expect(parMotif.length).toBeGreaterThanOrEqual(1);
  });

  for (const cas of DECLARATIONS_HORS_PROPERTIES) {
    it(`✅ ${cas.cle} — ${cas.quoi} : le contrôle 7 le voit`, () => {
      const c7 = chercherChampsDAutorisation(cas.schema, CLES);
      // Le § 09 : un nom réservé déclaré, où qu'il soit déclaré, est refusé.
      expect(c7.trouves.length, `${cas.cle} : aucun champ d'autorisation trouvé`).toBeGreaterThan(
        0,
      );
    });

    it(`✅ ${cas.cle} — et le schéma n'est plus déclaré fermé`, () => {
      const fermeture = analyserFermeture(cas.schema);
      // Un schéma qui accepte des propriétés non déclarées n'est pas fermé.
      expect(fermeture.ferme, `${cas.cle} : déclaré fermé alors qu'il accepte tout`).toBe(false);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  LA CONSÉQUENCE, FERMÉE — le registre REFUSE, de bout en bout
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Les deux témoins ci-dessus portent sur des fonctions. Celui-ci porte sur la
 * PORTE : `enregistrerAdaptateur()`, qui décide ce qui entre dans `ops_tool`.
 *
 * ⚠️ POURQUOI LE MANIFESTE EST MUTÉ APRÈS LE KIT, ET POURQUOI CE N'EST PAS UNE
 *    TRICHE. L'adaptateur éprouvé est en mode `fédéré` : son manifeste arrive
 *    par le réseau, depuis un dépôt tiers. RIEN n'oblige son `inputSchema` à
 *    être sorti de notre kit — c'est précisément la raison d'être des neuf
 *    contrôles du § 09 et de l'épinglage par empreinte. Fabriquer le manifeste
 *    avec le kit puis remplacer le seul `inputSchema` reproduit exactement ce
 *    qu'un adaptateur fédéré peut poster, sans rien casser d'autre.
 *
 * ⚠️ `bytes` EST RECALCULÉ. Sans cela, le refus `bytes_incoherent` masquerait le
 *    résultat : on ne saurait plus si l'admission a été refusée pour le champ
 *    d'autorisation ou pour un compte d'octets périmé par la mutation. Un témoin
 *    doit isoler UNE seule règle.
 */
const kit = creerAdapterKit(PROFILE_NAMES, SCEAU_PROFILS);

function manifesteAvecSchema(inputSchema: ValeurJson): Manifeste {
  const outil = kit.definirOutil({
    name: "inbox.recent",
    version: "1.0.0",
    description: "Les messages récents, tous canaux confondus.",
    effect: "read",
    dataClass: "personal",
    idempotency: "n/a",
    pagination: "page",
    input: z.object({ limite: z.number().int() }).strict(),
    output: z.object({ submissionId: z.string(), extrait: z.string() }).strict(),
    maxBytes: 32768,
    compaction: { free: ["extrait"], tier2: [], aggregateBy: null },
    idFields: ["submissionId"],
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
    fixtureMax: "fixtures/inbox-max.json",
    handler: () => ({ submissionId: "s1", extrait: "…" }),
  } as never);

  const manifeste = kit
    .defineAdapter({
      id: "axionia",
      version: "1.0.0",
      mode: "fédéré",
      profiles: ["dev", "admin"],
      secrets: [],
      tools: [outil],
    } as never)
    .manifeste();

  return {
    ...manifeste,
    tools: manifeste.tools.map((defini) => {
      const { bytes: _perime, ...sansBytes } = { ...defini, inputSchema };
      return { ...sansBytes, bytes: octetsCanoniques(sansBytes) };
    }),
  };
}

/** Les motifs de refus rendus par la porte, ou `[]` si l'adaptateur est admis. */
function motifsDAdmission(inputSchema: ValeurJson): readonly string[] {
  const manifeste = manifesteAvecSchema(inputSchema);
  const resultat = enregistrerAdaptateur({
    manifesteBrut: manifeste,
    verrou: {
      lockVersion: 1,
      adapters: [
        {
          id: manifeste.id,
          version: manifeste.version,
          mode: manifeste.mode,
          // DÉRIVÉE du manifeste muté — un SHA recopié ne prouverait rien.
          manifestSha: empreinteDuManifesteRecu(manifeste),
          trustTier: 1,
          maxDataClass: "personal",
          endpoint: "https://exemple.invalid/api/mcp",
          authMode: "secret-partage",
          secretRef: "axionia.mcp.shared",
        },
      ],
    },
    profilsConnus: PROFILE_NAMES,
    sceauProfils: SCEAU_PROFILS,
    clesDAutorisation: CLES,
  } as never);
  return resultat.admis ? [] : resultat.refus.map((refus: { motif: string }) => refus.motif);
}

/** Le motif que le § 09, contrôle 7, doit produire. Écrit une fois. */
const MOTIF_ATTENDU = "champ_d_autorisation_au_schema";

describe("§ 09 — la porte du registre, de bout en bout", () => {
  it("REFUSE le nom réservé déclaré sous `properties` — le témoin de capacité", () => {
    const motifs = motifsDAdmission({
      type: "object",
      properties: {
        limite: { type: "integer" },
        [String(NOM_RESERVE)]: { type: "boolean" },
      },
      additionalProperties: false,
    });

    console.info(`[capacité registre] forme nue → refus : ${motifs.join(", ")}`);

    // ⚠️ SANS CE TÉMOIN, l'admission des deux formes ci-dessous pourrait venir
    //    d'un montage de test qui n'atteint jamais le contrôle 7.
    expect(motifs).toContain(MOTIF_ATTENDU);
  });

  it("ANNONCE combien de schémas la porte a jugés, et combien elle a ADMIS", () => {
    const juges = DECLARATIONS_HORS_PROPERTIES.map((cas) => ({
      cle: cas.cle,
      motifs: motifsDAdmission(cas.schema),
    }));
    const admis = juges.filter((juge) => juge.motifs.length === 0);

    console.info(
      `[témoin § 09 · registre] ${String(juges.length)} schéma(s) présenté(s) à ` +
        `enregistrerAdaptateur() · ${String(admis.length)} ADMIS SANS UN MOT : ` +
        `${admis.map((juge) => juge.cle).join(", ")} · détail : ` +
        juges.map((juge) => `${juge.cle}=[${juge.motifs.join("|")}]`).join(" · "),
    );

    expect(juges.length).toBeGreaterThanOrEqual(2);
    expect(admis.length).toBeLessThanOrEqual(juges.length);
  });

  for (const cas of DECLARATIONS_HORS_PROPERTIES) {
    it(`✅ ${cas.cle} — le registre le REFUSE`, () => {
      // Le § 09 : un nom réservé au contexte d'autorisation ne franchit pas la
      // porte, où qu'il soit déclaré dans le schéma.
      expect(motifsDAdmission(cas.schema), `${cas.cle} : admis`).toContain(MOTIF_ATTENDU);
    });
  }
});

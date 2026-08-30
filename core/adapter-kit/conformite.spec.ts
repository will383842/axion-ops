import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { lireClesDAutorisation } from "./autorisation.js";
import { executerHarnais, formaterRapport } from "./conformite.js";
import type { EntreeHarnais, RapportHarnais, ResultatControle } from "./conformite.js";
import { definirOutil } from "./types.js";
import type { DefinitionAdaptateur, DefinitionOutil } from "./types.js";

/**
 * Gardes du HARNAIS DE CONFORMITÉ — les neuf contrôles du § 09.
 *
 * ═══ CE QUE CE FICHIER PROUVE ═══
 *
 * Chaque contrôle est appliqué D'ABORD à un adaptateur témoin FABRIQUÉ
 * défectueux — on prouve qu'il rougit — PUIS à un adaptateur conforme. Et pour
 * chacun, on lit le NOMBRE D'ÉLÉMENTS MESURÉS, jamais la couleur seule : un
 * contrôle vert qui n'a rien regardé est le défaut que le § 09, contrôle 9,
 * décrit mot pour mot.
 */

const PROFILS = ["courrier", "dev", "admin", "audit"] as const;
type Profil = (typeof PROFILS)[number];

const CLES = lireClesDAutorisation();

function outilTemoin(surcharges: Partial<DefinitionOutil<Profil>> = {}): DefinitionOutil<Profil> {
  const base = definirOutil<Profil, z.ZodObject, z.ZodObject>({
    name: "inbox.recent",
    version: "1.0.0",
    description: "Les messages récents, tous canaux confondus.",
    effect: "read",
    dataClass: "personal",
    idempotency: "n/a",
    pagination: "page",
    input: z.object({ limite: z.number().int() }).strict(),
    output: z
      .object({
        submissionId: z.string(),
        extrait: z.string(),
        detailHref: z.string().optional(),
        canal: z.string().optional(),
      })
      .strict(),
    maxBytes: 256,
    compaction: { free: ["extrait"], tier2: ["detailHref", "canal"], aggregateBy: "canal" },
    idFields: ["submissionId"],
    fixtureMax: "fixtures/inbox-max.json",
    handler: () => ({ submissionId: "s1", extrait: "…" }),
  });
  return { ...base, ...surcharges };
}

function definitionTemoin(
  surcharges: Partial<DefinitionAdaptateur<Profil>> = {},
): DefinitionAdaptateur<Profil> {
  return {
    id: "axionia",
    version: "1.0.0",
    mode: "fédéré",
    profiles: ["dev", "admin"],
    secrets: [],
    tools: [outilTemoin()],
    ...surcharges,
  };
}

/** Une entrée de harnais CONFORME, que chaque test dégrade sur un seul point. */
function entreeTemoin(surcharges: Partial<EntreeHarnais<Profil>> = {}): EntreeHarnais<Profil> {
  return {
    definition: definitionTemoin(),
    profilsConnus: PROFILS,
    fichiers: [
      { chemin: "src/adapter.ts", source: "export const a = 1;" },
      { chemin: "src/outils/inbox.ts", source: "export function listInbox() { return []; }" },
      {
        chemin: "src/outils/agenda.ts",
        source: "export function getAgendaFenetre() { return []; }",
      },
    ],
    plancherFichiers: 3,
    symbolesAutorises: ["listInbox", "getAgendaFenetre"],
    symbolesExportes: ["listInbox", "getAgendaFenetre", "listSubmissions"],
    plancherSymboles: 1,
    fixtures: [{ outil: "inbox.recent", chemin: "fixtures/inbox-max.json", charge: { items: [] } }],
    clesDAutorisation: CLES,
    sonde: () => 401,
    ...surcharges,
  };
}

function controle(rapport: RapportHarnais, cle: string): ResultatControle {
  const trouve = rapport.controles.find((element) => element.cle === cle);
  if (trouve === undefined) throw new Error(`contrôle « ${cle} » absent du rapport.`);
  return trouve;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le cas conforme — et la lecture des COMPTES, pas des couleurs
// ═════════════════════════════════════════════════════════════════════════════

describe("le harnais sur un adaptateur conforme", () => {
  it("est vert, et AUCUN de ses contrôles n'a mesuré zéro", async () => {
    const rapport = await executerHarnais(entreeTemoin());

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.conforme).toBe(true);

    // 9 contrôles du § 09 + le contrôle supplémentaire C13.3.
    expect(rapport.controles).toHaveLength(10);

    for (const element of rapport.controles) {
      // Le contrôle 8 est le seul dont le plancher puisse valoir 0, et
      // seulement en mode hébergé — ce témoin-ci est fédéré.
      expect(element.plancher).toBeGreaterThanOrEqual(1);
      expect(element.mesures).toBeGreaterThanOrEqual(element.plancher);
    }
  });

  it("annonce combien de FICHIERS d'adaptateur il a lus — contrôle 9", async () => {
    const rapport = await executerHarnais(entreeTemoin());

    expect(rapport.fichiersLus).toBe(3);
    expect(rapport.plancherFichiers).toBe(3);
    expect(formaterRapport(rapport)).toMatch(/Fichiers d'adaptateur LUS : 3/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Le défaut que le § 09 nomme : la garde qui ne regarde RIEN
// ═════════════════════════════════════════════════════════════════════════════

describe("une garde qui n'a rien lu ne peut pas être verte", () => {
  it("rougit quand AUCUN fichier d'adaptateur n'a été lu", async () => {
    // Tout le reste est conforme. C'est le cas exact du § 09 : « un adaptateur
    // rangé ailleurs rend la garde muette sans un mot ».
    const rapport = await executerHarnais(entreeTemoin({ fichiers: [] }));

    expect(rapport.conforme).toBe(false);
    expect(rapport.fichiersLus).toBe(0);
    expect(controle(rapport, "compte-fichiers").mesures).toBe(0);
    expect(rapport.anomalies.some((a) => /plancher/.test(a))).toBe(true);
  });

  it("rougit sur un plancher-témoin posé à zéro — un plancher qui ne mord pas", async () => {
    const rapport = await executerHarnais(entreeTemoin({ plancherFichiers: 0 }));

    expect(rapport.conforme).toBe(false);
    expect(controle(rapport, "compte-fichiers").anomalies.some((a) => /plancher/.test(a))).toBe(
      true,
    );
  });

  it("rougit quand un outil n'a AUCUNE fixture exécutée — contrôle 4", async () => {
    const rapport = await executerHarnais(entreeTemoin({ fixtures: [] }));
    const quatre = controle(rapport, "maxbytes-fixtures");

    expect(quatre.mesures).toBe(0);
    expect(quatre.plancher).toBe(1);
    expect(rapport.conforme).toBe(false);
  });

  it("rougit sur un cliquet de symboles à plancher ZÉRO et à liste VIDE — contrôle 3", async () => {
    // TÉMOIN DÉCISIF. Le contrôle 3 ne gardait pas SON PROPRE plancher, à la
    // différence du contrôle 9. Avec `plancherSymboles: 0` et une liste vide, il
    // confrontait zéro symbole autorisé à zéro export, ne trouvait aucun
    // orphelin, et sortait vert : `0 >= 0`. Le cliquet ne cliquetait plus, en
    // silence — exactement ce que le § 09 reproche à une garde muette.
    const rapport = await executerHarnais(
      entreeTemoin({ symbolesAutorises: [], plancherSymboles: 0 }),
    );
    const trois = controle(rapport, "cliquet-symboles");

    console.info(
      `[garde cliquet] ${String(trois.mesures)} symbole(s) autorisé(s), ` +
        `plancher ${String(trois.plancher)}, ${String(trois.anomalies.length)} anomalie(s)`,
    );

    expect(trois.mesures).toBe(0);
    expect(trois.plancher).toBe(0);
    // Le plancher seul ne peut pas faire rougir ce cas : il faut l'anomalie.
    expect(trois.mesures).toBeGreaterThanOrEqual(trois.plancher);
    expect(trois.anomalies.some((a) => /plancher/.test(a))).toBe(true);
    expect(rapport.conforme).toBe(false);
  });

  it("compte les fichiers UNE fois : un doublon ne fait pas franchir le plancher", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        fichiers: [
          { chemin: "src/adapter.ts", source: "export const a = 1;" },
          { chemin: "src/adapter.ts", source: "export const a = 1;" },
          { chemin: "src/adapter.ts", source: "export const a = 1;" },
        ],
      }),
    );
    expect(controle(rapport, "compte-fichiers").anomalies.some((a) => /deux fois/.test(a))).toBe(
      true,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Un test par contrôle, sur témoin fabriqué
// ═════════════════════════════════════════════════════════════════════════════

describe("les neuf contrôles rougissent chacun sur son propre témoin", () => {
  it("1 · un `effect` inconnu — aucun défaut permissif n'est appliqué", async () => {
    const casse = { ...outilTemoin() } as Record<string, unknown>;
    casse["effect"] = "lecture-seule";

    const rapport = await executerHarnais(
      entreeTemoin({
        definition: definitionTemoin({
          tools: [casse as unknown as DefinitionOutil<Profil>],
        }),
      }),
    );

    const un = controle(rapport, "effect-dataclass");
    expect(un.mesures).toBe(1);
    expect(un.anomalies).toHaveLength(1);
  });

  it("2 · un accès direct à `process.env`, et le motif qui a mordu est NOMMÉ", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        fichiers: [
          { chemin: "src/adapter.ts", source: "export const a = 1;" },
          { chemin: "src/secret.ts", source: "const k = process.env.ZOHO_SECRET;" },
          { chemin: "src/autre.ts", source: "export const b = 2;" },
        ],
      }),
    );

    const deux = controle(rapport, "acces-secret");
    expect(deux.mesures).toBe(3);
    expect(deux.anomalies.some((a) => /process\.env/.test(a))).toBe(true);
    expect(deux.detail).toMatch(/3 fichier\(s\) lu\(s\)/);
  });

  it("2 bis · un `process.env` en COMMENTAIRE compte AUSSI — arbitrage assumé", async () => {
    // ⚠️ CE COMPORTEMENT A CHANGÉ AU LOT 1, ET C'EST UNE DÉCISION.
    //
    // Le contrôle 2 blanchissait les commentaires avant d'appliquer ses
    // motifs. Le filtre qui les blanchissait effaçait aussi du CODE : toute
    // paire d'ouvrant/fermant de commentaire de bloc trouvée dans le texte —
    // deux chaînes anodines, deux motifs de globbing — blanchissait tout ce
    // qui les séparait, y compris un accès direct écrit nu. La seule garde de
    // SÉCURITÉ du § 09 était aveuglée sans la moindre obfuscation.
    //
    // Le contrôle 2 lit désormais le SOURCE BRUT. Prix payé : un accès cité
    // dans un commentaire produit un faux rouge, qui se corrige en
    // reformulant le commentaire. Le sens va bien : un faux rouge se corrige,
    // un faux vert ne se voit pas.
    const rapport = await executerHarnais(
      entreeTemoin({
        fichiers: [
          { chemin: "src/a.ts", source: "// jamais de process.env ici\nexport const a = 1;" },
          { chemin: "src/b.ts", source: "/* process.env est interdit */\nexport const b = 2;" },
          { chemin: "src/c.ts", source: "export const c = 3;" },
        ],
      }),
    );

    const deux = controle(rapport, "acces-secret");
    console.info(
      `[garde contrôle 2 · commentaires] ${String(deux.mesures)} fichier(s) mesuré(s), ` +
        `${String(deux.anomalies.length)} anomalie(s) — les deux fichiers commentés sont nommés`,
    );

    // Les DEUX fichiers commentés sont signalés ; le troisième, muet, ne l'est pas.
    expect(deux.anomalies).toHaveLength(2);
    expect(deux.anomalies.some((a) => a.includes("src/a.ts"))).toBe(true);
    expect(deux.anomalies.some((a) => a.includes("src/b.ts"))).toBe(true);
    expect(deux.anomalies.some((a) => a.includes("src/c.ts"))).toBe(false);
    // Le message DIT quoi faire, sinon un faux rouge devient un mystère.
    expect(deux.anomalies[0]).toContain("source brut");
  });

  it("2 ter · une chaîne contenant un délimiteur de commentaire n'AVEUGLE plus la garde", async () => {
    // LE DÉFAUT REFERMÉ, dans sa forme exacte : deux littéraux encadrant un
    // accès direct. Auparavant : 0 anomalie sur un accès écrit nu.
    const source = [
      'const ouvre = "/*";',
      "export const cle = process.env.ZOHO_SECRET;",
      'const ferme = "*/";',
    ].join("\n");

    const rapport = await executerHarnais(
      entreeTemoin({
        fichiers: [
          { chemin: "src/aveuglement.ts", source },
          { chemin: "src/b.ts", source: "export const b = 2;" },
          { chemin: "src/c.ts", source: "export const c = 3;" },
        ],
      }),
    );

    const deux = controle(rapport, "acces-secret");
    console.info(
      `[garde contrôle 2 · aveuglement] ${String(deux.mesures)} fichier(s) mesuré(s), ` +
        `${String(deux.anomalies.length)} anomalie(s)`,
    );

    expect(deux.anomalies).toHaveLength(1);
    expect(deux.anomalies[0]).toContain("src/aveuglement.ts");
  });

  it("3 · un symbole autorisé qui ne correspond plus à aucun export", async () => {
    const rapport = await executerHarnais(entreeTemoin({ symbolesExportes: ["listInbox"] }));

    const trois = controle(rapport, "cliquet-symboles");
    expect(trois.mesures).toBe(2);
    expect(trois.anomalies.some((a) => /getAgendaFenetre/.test(a))).toBe(true);
  });

  it("4 · un jeu maximal qui dépasse le `maxBytes` de son outil", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        fixtures: [
          {
            outil: "inbox.recent",
            chemin: "fixtures/inbox-max.json",
            charge: { items: Array.from({ length: 40 }, (_, i) => ({ id: `s${String(i)}` })) },
          },
        ],
      }),
    );

    const quatre = controle(rapport, "maxbytes-fixtures");
    expect(quatre.mesures).toBe(1);
    expect(quatre.anomalies.some((a) => /maxBytes de 256/.test(a))).toBe(true);
  });

  it("5 · un préfixe écrit à la main dans le nom d'un outil", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        definition: definitionTemoin({ tools: [outilTemoin({ name: "axionia.inbox.recent" })] }),
      }),
    );

    const cinq = controle(rapport, "prefixes-derives");
    expect(cinq.mesures).toBe(1);
    expect(cinq.anomalies.some((a) => /écrit à la main/.test(a))).toBe(true);
  });

  it("6 · le manifeste non constructible fait rougir le contrôle du SHA", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({ definition: definitionTemoin({ profiles: [] }) }),
    );

    const six = controle(rapport, "manifeste-sha-stable");
    expect(six.mesures).toBe(0);
    expect(six.plancher).toBe(2);
    expect(six.anomalies.some((a) => /pas constructible/.test(a))).toBe(true);
  });

  it("6 bis · deux productions du même manifeste donnent le même SHA", async () => {
    const rapport = await executerHarnais(entreeTemoin());
    const six = controle(rapport, "manifeste-sha-stable");

    expect(six.mesures).toBe(2);
    expect(six.anomalies).toEqual([]);
    expect(six.detail).toMatch(/empreinte sha256:[0-9a-f]{64}/);
  });

  it("7 · un champ d'autorisation glissé dans le schéma d'entrée", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        definition: definitionTemoin({
          tools: [
            outilTemoin({
              // Le défaut EXACT que le § 09 décrit : le handler lirait son droit
              // dans la charge utile au lieu de le recevoir dans `ctx`.
              input: z.object({ limite: z.number(), peutVoirAppels: z.boolean() }).strict(),
            }),
          ],
        }),
      }),
    );

    const sept = controle(rapport, "autorisation-hors-input");
    expect(sept.mesures).toBe(1);
    expect(sept.anomalies.some((a) => /peutVoirAppels/.test(a))).toBe(true);
    // Le rapport NOMME les noms dérivés : sans cela, on ne sait pas d'où sort
    // le refus, ni si la liste était vide.
    expect(sept.detail).toMatch(/nom\(s\) interdit\(s\) dérivé\(s\)/);
  });

  it("7 bis · `idempotencyKey` dans l'entrée est refusé — § 20", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        definition: definitionTemoin({
          tools: [outilTemoin({ input: z.object({ idempotencyKey: z.string() }).strict() })],
        }),
      }),
    );
    expect(
      controle(rapport, "autorisation-hors-input").anomalies.some((a) => /idempotencyKey/.test(a)),
    ).toBe(true);
  });

  it("8 · la route rend 200 sans le secret partagé", async () => {
    const rapport = await executerHarnais(entreeTemoin({ sonde: () => 200 }));

    const huit = controle(rapport, "route-sans-secret");
    expect(huit.mesures).toBe(1);
    expect(huit.anomalies.some((a) => /attendu 401/.test(a))).toBe(true);
  });

  it("8 bis · une SONDE ABSENTE n'est pas un succès pour un adaptateur fédéré", async () => {
    const rapport = await executerHarnais(entreeTemoin({ sonde: null }));

    const huit = controle(rapport, "route-sans-secret");
    expect(huit.mesures).toBe(0);
    expect(huit.plancher).toBe(1);
    expect(huit.anomalies.some((a) => /pas un succès/.test(a))).toBe(true);
  });

  it("8 ter · en mode HÉBERGÉ le contrôle est sans objet, et son plancher vaut 0", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        definition: definitionTemoin({ mode: "hébergé", secrets: [{ name: "zoho.refresh" }] }),
        sonde: null,
      }),
    );

    const huit = controle(rapport, "route-sans-secret");
    expect(huit.plancher).toBe(0);
    expect(huit.mesures).toBe(0);
    expect(huit.anomalies).toEqual([]);
    expect(huit.detail).toMatch(/sans objet/);
  });

  it("C13.3 · un champ de rang 2 obligatoire au schéma de sortie", async () => {
    const rapport = await executerHarnais(
      entreeTemoin({
        definition: definitionTemoin({
          tools: [
            outilTemoin({
              output: z.object({ extrait: z.string(), canal: z.string() }).strict(),
            }),
          ],
        }),
      }),
    );

    // Le manifeste ne se construit pas (l'anomalie est aussi détectée au build),
    // ce qui fait rougir C13.3 par son COMPTE : zéro outil inspecté.
    const supplementaire = controle(rapport, "tier2-optionnel");
    expect(supplementaire.mesures).toBe(0);
    expect(rapport.conforme).toBe(false);
  });

  it("le rapport formaté nomme chaque contrôle, son compte et son plancher", async () => {
    const texte = formaterRapport(await executerHarnais(entreeTemoin({ sonde: () => 500 })));

    expect(texte).toMatch(/ROUGE n°8/);
    expect(texte).toMatch(/vert\s+n°1/);
    expect(texte).toMatch(/mesuré\(s\) \/ plancher/);
  });
});

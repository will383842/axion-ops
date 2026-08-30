/**
 * TÉMOINS ADVERSAIRES — `core/adapter-kit/conformite.ts`, contrôle 2 du § 09.
 *
 * ═══ CE QUE CE FICHIER FAIT, ET POURQUOI IL RESTE DANS LE DÉPÔT ═══
 *
 * Une garde qui ne peut pas rougir n'existe pas. Chaque cas ci-dessous
 * FABRIQUE un adaptateur témoin qui DEVRAIT faire rougir le contrôle 2 —
 * « aucun accès direct à `process.env` ni à un secret » — et vérifie ce qui
 * arrive vraiment. Deux issues, toutes deux consignées :
 *
 *  · la garde mord      → le témoin l'atteste, et il restera vert tant qu'elle
 *                         mordra. C'est le cliquet.
 *  · la garde reste verte → le témoin le DIT, en toutes lettres, plutôt que de
 *                         le taire. Le test décrit alors le comportement RÉEL
 *                         constaté, avec le motif du défaut en commentaire, de
 *                         sorte que le jour où la garde sera réparée le test
 *                         rougira et forcera à le relire.
 *
 * ⚠️ Ces témoins n'affirment JAMAIS que le contrôle est correct. Ils affirment
 *    ce qu'il fait, mesuré.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { lireClesDAutorisation, proportionEffacee, sansCommentaires } from "./autorisation.js";
import { executerHarnais, MOTIFS_ACCES_SECRET } from "./conformite.js";
import type { EntreeHarnais, RapportHarnais } from "./conformite.js";
import { definirOutil } from "./types.js";
import type { DefinitionAdaptateur, DefinitionOutil } from "./types.js";

const PROFILS = ["courrier", "dev", "admin", "audit"] as const;
type Profil = (typeof PROFILS)[number];

const CLES = lireClesDAutorisation();

function outilTemoin(): DefinitionOutil<Profil> {
  return definirOutil<Profil, z.ZodObject, z.ZodObject>({
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
      })
      .strict(),
    maxBytes: 256,
    compaction: { free: ["extrait"], tier2: ["detailHref"], aggregateBy: null },
    idFields: ["submissionId"],
    fixtureMax: "fixtures/inbox-max.json",
    handler: () => ({ submissionId: "s1", extrait: "…" }),
  });
}

function definitionTemoin(): DefinitionAdaptateur<Profil> {
  return {
    id: "axionia",
    version: "1.0.0",
    mode: "hébergé",
    profiles: ["dev", "admin"],
    secrets: [{ name: "zoho-oauth" }],
    tools: [outilTemoin()],
  };
}

/**
 * Une entrée de harnais par ailleurs CONFORME : chaque témoin ne dégrade QUE
 * les sources. Neutraliser les voisines est la condition pour qu'une anomalie
 * observée porte bien sur la règle visée, et sur elle seule.
 */
function entreeAvecSources(
  sources: readonly { readonly chemin: string; readonly source: string }[],
): EntreeHarnais<Profil> {
  const definition = definitionTemoin();
  return {
    definition,
    profilsConnus: PROFILS,
    fichiers: sources,
    plancherFichiers: sources.length,
    symbolesAutorises: ["listInbox"],
    symbolesExportes: ["listInbox", "getAgendaFenetre"],
    plancherSymboles: 1,
    fixtures: definition.tools.map((outil) => ({
      outil: outil.name,
      chemin: `fixtures/${outil.name}.json`,
      charge: { submissionId: "s1", extrait: "x" },
    })),
    clesDAutorisation: CLES,
    sonde: null,
  };
}

/** Les anomalies du seul contrôle 2, isolées du reste du rapport. */
function anomaliesDuControle2(rapport: RapportHarnais): readonly string[] {
  const controle = rapport.controles.find((candidat) => candidat.cle === "acces-secret");
  expect(controle, "le contrôle 2 doit exister dans le rapport").toBeDefined();
  return controle?.anomalies ?? [];
}

describe("TÉMOIN — contrôle 2 du § 09 : la garde sait-elle rougir ?", () => {
  it("rougit sur un `process.env` écrit nu, et NOMME le fichier et le motif", async () => {
    const rapport = await executerHarnais(
      entreeAvecSources([
        { chemin: "src/adapter.ts", source: "export const a = 1;" },
        {
          chemin: "src/fuite.ts",
          source: "export const cle = process.env.ZOHO_SECRET;\n",
        },
      ]),
    );

    const anomalies = anomaliesDuControle2(rapport);
    console.log(
      `[témoin contrôle 2 · nu] 2 fichiers soumis, ${String(anomalies.length)} anomalie(s)`,
    );

    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]).toContain("src/fuite.ts");
    expect(anomalies[0]).toContain("process.env");
    expect(rapport.conforme).toBe(false);
  });

  it("rougit sur chacun des quatre motifs nommés — un témoin PAR motif", async () => {
    const parMotif: { readonly nom: string; readonly source: string }[] = [
      { nom: "process.env", source: "export const a = process.env.X;\n" },
      { nom: "process[…]", source: 'export const a = process["env"];\n' },
      { nom: "import de dotenv", source: 'import "dotenv/config";\n' },
      { nom: "lecture d'un fichier .env", source: 'export const p = ".env.local";\n' },
    ];

    let mordus = 0;
    for (const cas of parMotif) {
      const rapport = await executerHarnais(
        entreeAvecSources([{ chemin: `src/${cas.nom}.ts`, source: cas.source }]),
      );
      const anomalies = anomaliesDuControle2(rapport);
      expect(anomalies.length, `le motif « ${cas.nom} » doit mordre`).toBeGreaterThan(0);
      mordus += 1;
    }

    console.log(
      `[témoin contrôle 2 · motifs] ${String(mordus)} motif(s) éprouvé(s) sur ` +
        `${String(MOTIFS_ACCES_SECRET.length)} déclaré(s)`,
    );
    // Le compte est DÉRIVÉ de la table des motifs : un motif ajouté sans témoin
    // fait rougir cette ligne, au lieu de passer sans être éprouvé.
    expect(mordus).toBe(MOTIFS_ACCES_SECRET.length);
  });

  it(
    "une chaîne contenant un délimiteur de commentaire n'aveugle PLUS la garde : " +
      "`process.env` écrit nu est vu",
    async () => {
      // LE DÉFAUT REFERMÉ AU LOT 1. Rien n'était obscurci :
      // `process.env.ZOHO_SECRET` était écrit en toutes lettres, sous la forme
      // exacte que le motif cherche. C'est `sansCommentaires()` qui l'effaçait
      // AVANT la mesure — son motif de commentaire de bloc ne distinguait pas
      // un commentaire d'une chaîne de caractères, et blanchissait donc tout ce
      // qui séparait un ouvrant d'un fermant, CODE COMPRIS.
      //
      // Deux réparations, indépendantes, et la garde tient si l'une OU l'autre
      // vaut :
      //  · `sansCommentaires()` est devenu un balayage à états, qui reconnaît
      //    les chaînes, les gabarits et les littéraux d'expression régulière ;
      //  · le contrôle 2 n'appelle plus ce filtre DU TOUT — il lit le source
      //    brut, parce que la seule garde de sécurité du § 09 ne doit dépendre
      //    d'aucun filtre préalable.
      const source = [
        'const ouvre = "/*";',
        "export const cle = process.env.ZOHO_SECRET;",
        'const ferme = "*/";',
        "",
      ].join("\n");

      // 1 · LA CAUSE, ISOLÉE : le filtre ne mange plus le code de la chaîne.
      expect(source).toContain("process.env");
      const propre = sansCommentaires(source);
      expect(
        propre,
        "`sansCommentaires()` doit reconnaître une chaîne et ne plus effacer de CODE",
      ).toContain("process.env");
      console.log(
        `[témoin filtre] ${String(Math.round(proportionEffacee(source) * 100))} % des caractères ` +
          "significatifs effacés par le filtre (attendu : 0)",
      );
      expect(proportionEffacee(source)).toBe(0);

      // 2 · LA CONSÉQUENCE, mesurée sur le harnais réel.
      const rapport = await executerHarnais(
        entreeAvecSources([{ chemin: "src/fuite-masquee.ts", source }]),
      );
      const anomalies = anomaliesDuControle2(rapport);

      console.log(
        `[témoin contrôle 2 · aveuglement refermé] 1 fichier soumis, ` +
          `${String(anomalies.length)} anomalie(s) — le fichier écrit process.env en toutes lettres`,
      );

      expect(anomalies, "la garde doit MORDRE sur un `process.env` nu").toHaveLength(1);
      expect(anomalies[0]).toContain("src/fuite-masquee.ts");
      expect(rapport.conforme, "et l'adaptateur ne doit PAS être déclaré conforme").toBe(false);
    },
  );

  it("deux motifs de fichiers ordinaires ne l'aveuglent plus non plus", async () => {
    // Aucune malveillance n'était nécessaire, et aucune chaîne bizarre : deux
    // motifs de globbing comme on en écrit dans n'importe quelle configuration
    // de build. Le premier ouvrait un faux commentaire de bloc, le second le
    // refermait, et TOUT ce qui les séparait disparaissait de la mesure — ici,
    // la seule ligne que le contrôle 2 devait voir.
    const source = [
      'const inclure = "dist/*";',
      "export const cle = process.env.ZOHO_SECRET;",
      'const exclure = "*/node_modules";',
      "",
    ].join("\n");

    const rapport = await executerHarnais(entreeAvecSources([{ chemin: "src/globs.ts", source }]));
    const anomalies = anomaliesDuControle2(rapport);

    console.log(
      `[témoin contrôle 2 · globs] 1 fichier soumis, ${String(anomalies.length)} anomalie(s), ` +
        `filtre : ${String(Math.round(proportionEffacee(source) * 100))} % effacés`,
    );

    expect(anomalies, "la garde doit MORDRE").toHaveLength(1);
    expect(proportionEffacee(source)).toBe(0);
  });

  it("CONTRE-TÉMOIN — le filtre retire encore les VRAIS commentaires", () => {
    // Sans ce contre-témoin, on ne saurait pas distinguer « le filtre reconnaît
    // les chaînes » de « le filtre ne fait plus rien du tout ».
    const source = [
      "/* un vrai commentaire de bloc */",
      "const a = 1; // et un vrai commentaire de ligne",
      "const b = `gabarit ${a} avec substitution`;",
      "const motif = /une\\/regex\\/avec des slashs/;",
      "",
    ].join("\n");

    const propre = sansCommentaires(source);

    console.log(
      `[témoin filtre · contraste] ${String(Math.round(proportionEffacee(source) * 100))} % effacés · ` +
        `commentaire de bloc retiré=${String(!propre.includes("un vrai commentaire de bloc"))} · ` +
        `commentaire de ligne retiré=${String(!propre.includes("et un vrai commentaire de ligne"))} · ` +
        `gabarit conservé=${String(propre.includes("avec substitution"))} · ` +
        `regex conservée=${String(propre.includes("avec des slashs"))}`,
    );

    expect(propre).not.toContain("un vrai commentaire de bloc");
    expect(propre).not.toContain("et un vrai commentaire de ligne");
    // Ce qui n'est PAS un commentaire survit intact.
    expect(propre).toContain("avec substitution");
    expect(propre).toContain("avec des slashs");
    expect(propre).toContain("const a = 1;");
    // Les numéros de ligne ne bougent pas : un rapport qui les cite reste juste.
    expect(propre.split("\n")).toHaveLength(source.split("\n").length);
  });

  it("le contrôle 2 ANNONCE son compte, et le compte insuffisant est lui-même une anomalie", async () => {
    // Une garde qui n'a lu aucun fichier ne peut pas être verte. On la met à
    // l'épreuve : zéro fichier, plancher-témoin à 3.
    const entree = entreeAvecSources([]);
    const rapport = await executerHarnais({ ...entree, plancherFichiers: 3 });

    const controle = rapport.controles.find((candidat) => candidat.cle === "acces-secret");
    console.log(
      `[témoin contrôle 2 · compte] ${String(controle?.mesures ?? -1)} fichier(s) mesuré(s) ` +
        `pour un plancher de ${String(controle?.plancher ?? -1)}`,
    );

    expect(controle?.mesures).toBe(0);
    expect(rapport.conforme).toBe(false);
    expect(rapport.anomalies.join(" ")).toContain("élément(s) mesuré(s) pour un plancher");
  });

  it(
    "BORNE ÉCRITE — le contrôle 3 mesure la FRAÎCHEUR de sa liste d'exceptions, " +
      "et rien d'autre : il ne regarde AUCUN appel",
    async () => {
      // Son libellé promet d'empêcher les contournements de la couche service.
      // Sa mesure porte en réalité sur la seule FRAÎCHEUR de la liste
      // d'exceptions : `symbolesAutorises` moins `symbolesExportes`. Il ne
      // confronte jamais cette liste aux SOURCES — qu'il a pourtant sous la
      // main dans `entree.fichiers`.
      //
      // Témoin : un fichier d'adaptateur qui parle directement à la base, en
      // sautant la couche service. Le contournement est écrit en toutes lettres.
      const contournement = [
        'import { prisma } from "../db.js";',
        "export async function lireSecrets() {",
        "  return prisma.opsSecret.findMany();",
        "}",
        "",
      ].join("\n");

      const rapport = await executerHarnais(
        entreeAvecSources([{ chemin: "src/contournement.ts", source: contournement }]),
      );
      const controle = rapport.controles.find((candidat) => candidat.cle === "cliquet-symboles");

      console.log(
        `[témoin contrôle 3] ${String(controle?.mesures ?? -1)} symbole(s) mesuré(s), ` +
          `${String(controle?.anomalies.length ?? -1)} anomalie(s) — ` +
          "le fichier appelle pourtant `prisma.opsSecret.findMany()` en direct",
      );

      // ⚠️ CE N'EST PAS UN DÉFAUT D'IMPLÉMENTATION, C'EST UN PÉRIMÈTRE.
      //    Le libellé a été corrigé au lot 1 pour dire ce qui est mesuré. Ce
      //    témoin FIXE la borne : tant qu'il est vert, le contournement écrit
      //    en toutes lettres ci-dessus n'est vu par PERSONNE, et une revue qui
      //    écrirait « le risque est couvert par la garde » se tromperait.
      //
      // 🔴 La mesure manquante est notée dans `docs/ETAT.md`. Le jour où elle
      //    existe, cette ligne rougira — et c'est ce qu'on veut : la
      //    réparation doit forcer à relire ce témoin, pas passer inaperçue.
      expect(controle?.anomalies, "BORNE : le contournement n'est pas vu").toHaveLength(0);
      // Le LIBELLÉ ne promet plus que la mesure : c'est la moitié corrigée.
      expect(controle?.libelle, "le libellé doit dire ce qui est mesuré").toContain("cliquet");
      expect(controle?.libelle).not.toContain("Aucun appel");
      // La mesure ANNONCÉE est celle des symboles autorisés, pas celle des
      // appels : le compte est honnête, c'est le LIBELLÉ qui promet davantage.
      expect(controle?.mesures).toBe(1);
      expect(controle?.detail).toContain("symbole(s) autorisé(s)");
    },
  );

  it("le cliquet du contrôle 3 rougit bien sur une entrée PÉRIMÉE — c'est ce qu'il mesure", async () => {
    const entree = entreeAvecSources([{ chemin: "src/a.ts", source: "export const a = 1;" }]);
    const rapport = await executerHarnais({
      ...entree,
      symbolesAutorises: ["listInbox", "symboleDisparu"],
      plancherSymboles: 2,
    });
    const controle = rapport.controles.find((candidat) => candidat.cle === "cliquet-symboles");

    console.log(
      `[témoin contrôle 3 · périmé] ${String(controle?.mesures ?? -1)} symbole(s) mesuré(s), ` +
        `${String(controle?.anomalies.length ?? -1)} anomalie(s)`,
    );

    expect(controle?.anomalies).toHaveLength(1);
    expect(controle?.anomalies[0]).toContain("symboleDisparu");
  });

  it("le contrôle 3 refuse un plancher-témoin à ZÉRO — un cliquet qui ne cliquette plus", async () => {
    const entree = entreeAvecSources([{ chemin: "src/a.ts", source: "export const a = 1;" }]);
    const rapport = await executerHarnais({
      ...entree,
      symbolesAutorises: [],
      plancherSymboles: 0,
    });
    const controle = rapport.controles.find((candidat) => candidat.cle === "cliquet-symboles");

    console.log(
      `[témoin contrôle 3 · plancher 0] ${String(controle?.mesures ?? -1)} symbole(s) mesuré(s), ` +
        `plancher ${String(controle?.plancher ?? -1)}, ` +
        `${String(controle?.anomalies.length ?? -1)} anomalie(s)`,
    );

    expect(controle?.mesures).toBe(0);
    expect(controle?.anomalies.length).toBeGreaterThan(0);
    expect(rapport.conforme).toBe(false);
  });
});

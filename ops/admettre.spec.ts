import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DRAPEAU_ACTIVER, VARIABLE_DE_BASE, executerLAdmission } from "./admettre.js";
import type { DependancesDeLAdmission } from "./admettre.js";
import {
  SOURCE_DU_DEPOT,
  contributionDuSocle,
  dossiersDAdaptateurs,
  lireLesAdaptateursEpingles,
  manifestesAAdmettre,
} from "./adaptateurs-epingles.js";
import type { SourceDesAdaptateurs } from "./adaptateurs-epingles.js";
import { DepotDuRegistreEnMemoire } from "../core/registry/index.js";

/**
 * `ops/admettre.spec.ts` — **LE GESTE, ÉPROUVÉ SUR UN DISQUE FABRIQUÉ ET SUR LE
 * VRAI.**
 *
 * ═══ POURQUOI LES DEUX ═══
 *
 * · Sur un disque **fabriqué**, on peut retirer le verrou, tronquer un
 *   instantané, casser une empreinte — sans mutiler le dépôt. C'est la seule
 *   façon de voir chaque refus ROUGIR.
 * · Sur le **vrai**, on mesure que le geste porte réellement sur `axionia` : un
 *   programme qui ne marcherait que sur ses propres fixtures serait vert pour la
 *   pire des raisons.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  Un disque fabriqué
// ═════════════════════════════════════════════════════════════════════════════

/** L'instantané RÉEL, relu ici pour que le disque fabriqué ne mente pas. */
function instantaneReel(): unknown {
  return JSON.parse(
    readFileSync(new URL("../adapters/axionia/manifeste.json", import.meta.url), "utf8"),
  ) as unknown;
}

function verrouReel(): unknown {
  return JSON.parse(
    readFileSync(new URL("../core/registry/adapters.lock.json", import.meta.url), "utf8"),
  ) as unknown;
}

function disque(options: {
  verrou?: unknown;
  present?: boolean;
  instantanes?: Readonly<Record<string, unknown>>;
}): SourceDesAdaptateurs {
  const instantanes = options.instantanes ?? { axionia: instantaneReel() };
  return {
    verrouPresent: () => options.present ?? true,
    lireLeVerrou: () => options.verrou ?? verrouReel(),
    lireLInstantane: (id) => instantanes[id] ?? null,
  };
}

interface Journal {
  readonly sortie: string[];
  readonly erreurs: string[];
}

function deps(
  surcharge: Partial<DependancesDeLAdmission> = {},
): DependancesDeLAdmission & { readonly journal: Journal } {
  const journal: Journal = { sortie: [], erreurs: [] };
  return {
    journal,
    env: {},
    arguments: [],
    source: disque({}),
    dossiersPresents: () => ["axionia"],
    contributionDuSocle,
    ouvrirLeDepot: () => Promise.resolve(null),
    ecrire: (ligne) => journal.sortie.push(ligne),
    ecrireErreur: (ligne) => journal.erreurs.push(ligne),
    ...surcharge,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  La lecture des deux documents
// ═════════════════════════════════════════════════════════════════════════════

describe("ops/adaptateurs-epingles — les deux documents, lus et appariés", () => {
  it("lit le VRAI dépôt et apparie `axionia` à son instantané", () => {
    const lecture = lireLesAdaptateursEpingles(SOURCE_DU_DEPOT);
    const dossiers = dossiersDAdaptateurs();

    console.info(
      `[épingles] ${String(dossiers.length)} dossier(s) [${dossiers.join(", ")}] · ` +
        `verrou présent : ${String(lecture.verrouPresent)} · ` +
        `${String(lecture.epingles.length)} épinglé(s) · ` +
        `${String(lecture.adaptateurs.length)} instantané(s) · ` +
        `${String(lecture.sansInstantane.length)} sans instantané`,
    );

    expect(lecture.verrouPresent).toBe(true);
    expect(lecture.epingles).toContain("axionia");
    expect(lecture.sansInstantane).toEqual([]);
    expect(lecture.adaptateurs[0]?.shaAnnonce).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(dossiers).toContain("axionia");
  });

  it("NOMME l'entrée de verrou dont l'instantané manque, au lieu de l'ignorer", () => {
    const lecture = lireLesAdaptateursEpingles(disque({ instantanes: {} }));
    console.info(`[épingles · témoin] sans instantané : ${lecture.sansInstantane.join(", ")}`);
    expect(lecture.sansInstantane).toEqual(["axionia"]);
    expect(lecture.adaptateurs).toEqual([]);
  });

  it("rejette un instantané qui ne porte pas de `manifeste` — tronqué, pas vide", () => {
    const lecture = lireLesAdaptateursEpingles(
      disque({ instantanes: { axionia: { manifestSha: "sha256:ab" } } }),
    );
    expect(lecture.sansInstantane).toEqual(["axionia"]);
  });

  it("les trois valeurs du SOCLE sont injectées, jamais lues dans l'adaptateur", () => {
    const lecture = lireLesAdaptateursEpingles(SOURCE_DU_DEPOT);
    const socle = contributionDuSocle();
    const aAdmettre = manifestesAAdmettre(lecture, socle);

    console.info(
      `[épingles] ${String(aAdmettre.length)} manifeste(s) à admettre · ` +
        `${String(socle.profilsConnus.length)} profil(s) connu(s) du socle · ` +
        `${String(socle.clesDAutorisation.length)} clé(s) d'autorisation dérivée(s)`,
    );

    expect(aAdmettre).toHaveLength(1);
    expect(aAdmettre[0]?.profilsConnus).toBe(socle.profilsConnus);
    // Le plancher du contrôle 7 : une liste trop courte ferait LEVER l'admission.
    expect(socle.clesDAutorisation.length).toBeGreaterThanOrEqual(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Les refus du geste — chacun NOMME quoi corriger
// ═════════════════════════════════════════════════════════════════════════════

describe("pnpm ops:admettre — chaque refus DIT quoi corriger", () => {
  it("REFUSE un verrou absent, et le distingue d'un verrou illisible", async () => {
    const d = deps({ source: disque({ present: false }) });
    const code = await executerLAdmission(d);

    console.info(`[admettre · témoin] ${d.journal.erreurs.join(" | ")}`);
    expect(code).toBe(1);
    expect(d.journal.erreurs.join(" ")).toContain("ABSENT");
    expect(d.journal.sortie.join(" ")).toContain("verrou ABSENT");
  });

  it("REFUSE un verrou incohérent en ANNONÇANT ses anomalies", async () => {
    const d = deps({
      source: disque({ verrou: { lockVersion: 1, adapters: [{ id: "axionia" }] } }),
    });
    const code = await executerLAdmission(d);

    console.info(`[admettre · témoin] ${d.journal.erreurs.join(" | ").slice(0, 220)}`);
    expect(code).toBe(1);
    expect(d.journal.erreurs.join(" ")).toMatch(/anomalie|instantané/);
  });

  it("REFUSE quand `DATABASE_URL` manque — et le dit SANS accuser le verrou", async () => {
    const d = deps({});
    const code = await executerLAdmission(d);

    console.info(`[admettre] ${d.journal.erreurs.join(" | ")}`);
    expect(code).toBe(1);
    expect(d.journal.erreurs.join(" ")).toContain(VARIABLE_DE_BASE);
    // ⚠️ LE REFUS PORTE SUR L'ÉCRITURE, PAS SUR L'ADMISSION. Confondre les deux
    //    ferait chercher un défaut de manifeste là où il manque une variable.
    expect(d.journal.erreurs.join(" ")).toContain("pourtant ADMIS");
  });

  it("REFUSE quand la base est nommée mais le client Prisma introuvable", async () => {
    const d = deps({
      env: { [VARIABLE_DE_BASE]: "postgresql://stub:stub@stub.invalid:5432/stub" },
      ouvrirLeDepot: () => Promise.resolve(null),
    });
    const code = await executerLAdmission(d);

    console.info(`[admettre] ${d.journal.erreurs.join(" | ")}`);
    expect(code).toBe(1);
    expect(d.journal.erreurs.join(" ")).toContain("prisma:generate");
  });

  it("REFUSE un manifeste dont l'empreinte a bougé d'un caractère", async () => {
    const instantane = instantaneReel() as { manifeste: { version: string } };
    const altere = {
      ...instantane,
      manifeste: { ...instantane.manifeste, version: "9.9.9" },
    };
    const d = deps({
      source: disque({ instantanes: { axionia: altere } }),
      env: { [VARIABLE_DE_BASE]: "postgresql://x" },
    });
    const code = await executerLAdmission(d);

    console.info(`[admettre · témoin] ${d.journal.erreurs.join(" | ").slice(0, 240)}`);
    expect(code).toBe(1);
    expect(d.journal.erreurs.join(" ")).toContain("refusé");
    // Rien n'a été écrit : l'admission est tout ou rien.
    expect(d.journal.erreurs.join(" ")).toContain("rien n'a");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Le cas qui POSE — et l'activation, qui est le geste de la console
// ═════════════════════════════════════════════════════════════════════════════

describe("pnpm ops:admettre — ce que le geste POSE réellement", () => {
  it("pose l'adaptateur RÉEL et ses 7 outils, et ne les active PAS sans le drapeau", async () => {
    const depot = new DepotDuRegistreEnMemoire();
    const d = deps({
      env: { [VARIABLE_DE_BASE]: "postgresql://x" },
      ouvrirLeDepot: () => Promise.resolve(depot),
    });

    const code = await executerLAdmission(d);
    const lignes = await depot.listerOutils();
    const adaptateur = await depot.lireAdaptateur("axionia");

    console.info(`[admettre] ${d.journal.sortie.slice(-2).join(" | ")}`);
    expect(code).toBe(0);
    expect(lignes.length).toBeGreaterThanOrEqual(7);
    expect(adaptateur?.endpoint).toBe("https://axion-ia.com/api/mcp");
    expect(adaptateur?.secretRef).toBe("axionia.mcp.shared");
    // ⚠️ AUCUN OUTIL SERVI SANS UN GESTE HUMAIN — § 14, correction 3.
    expect(lignes.every((ligne) => !ligne.enabled)).toBe(true);
    expect(d.journal.sortie.join(" ")).toContain(DRAPEAU_ACTIVER);
  });

  it(`« ${DRAPEAU_ACTIVER} » pose \`enabled\` — et le compte est ANNONCÉ`, async () => {
    const depot = new DepotDuRegistreEnMemoire();
    const d = deps({
      arguments: [DRAPEAU_ACTIVER],
      env: { [VARIABLE_DE_BASE]: "postgresql://x" },
      ouvrirLeDepot: () => Promise.resolve(depot),
    });

    const code = await executerLAdmission(d);
    const lignes = await depot.listerOutils();

    console.info(`[admettre · activer] ${d.journal.sortie.slice(-1).join("")}`);
    expect(code).toBe(0);
    expect(lignes.every((ligne) => ligne.enabled)).toBe(true);
    expect(d.journal.sortie.join(" ")).toContain(`${String(lignes.length)} activée(s)`);
  });

  it("une seconde admission met à JOUR sans faire reculer l'activation (ADR 0050)", async () => {
    const depot = new DepotDuRegistreEnMemoire();
    const base = { [VARIABLE_DE_BASE]: "postgresql://x" };
    await executerLAdmission(
      deps({
        arguments: [DRAPEAU_ACTIVER],
        env: base,
        ouvrirLeDepot: () => Promise.resolve(depot),
      }),
    );

    const second = deps({ env: base, ouvrirLeDepot: () => Promise.resolve(depot) });
    const code = await executerLAdmission(second);
    const lignes = await depot.listerOutils();

    console.info(`[admettre · ré-admission] ${second.journal.sortie.slice(-2, -1).join("")}`);
    expect(code).toBe(0);
    // Le second passage n'a PAS le drapeau, et pourtant tout reste activé.
    expect(lignes.every((ligne) => ligne.enabled)).toBe(true);
    expect(second.journal.sortie.join(" ")).toContain("réglages de console conservés");
  });
});

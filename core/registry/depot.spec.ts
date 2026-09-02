import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  COLONNES_POSSEDEES_PAR_LA_CONSOLE,
  DepotDuRegistreEnMemoire,
  DepotDuRegistrePrisma,
  ErreurDeDepotDuRegistre,
  colonnesDAdaptateurTouchees,
  colonnesDOutilTouchees,
  versEnregistrementOutil,
} from "./depot.js";
import type {
  ClientPrismaDuRegistre,
  DepotDuRegistre,
  EnregistrementAdaptateur,
  EnregistrementOutil,
  LignePrismaOpsAdapter,
  LignePrismaOpsTool,
} from "./depot.js";
import type { LigneOpsTool } from "./types.js";

/**
 * `core/registry/depot.spec.ts` — **CE QUE LA PERSISTANCE DE L'ADMISSION DOIT
 * TENIR, MESURÉ SUR LES DEUX PRISES.**
 *
 * ═══ LES QUATRE FAITS QUE CE FICHIER ÉTABLIT ═══
 *
 *  1. Les colonnes que le dépôt touche EXISTENT au schéma — dérivées de
 *     `prisma/schema.prisma`, jamais recopiées. Une interface structurelle
 *     écrite à la main dérive en silence.
 *  2. Les cinq colonnes de console existent AUSSI au schéma, et le dépôt ne les
 *     touche PAS. Deux dérivations, un seul fichier lu.
 *  3. **Une ré-admission ne fait pas reculer un réglage de console** — la
 *     décision de l'ADR 0050, mesurée en ADMETTANT DEUX FOIS et en relisant,
 *     jamais en lisant le corps des méthodes.
 *  4. Les deux prises rendent **les mêmes nombres** sur le même scénario. Un
 *     jumeau qui divergerait rendrait vertes, sur un dépôt qui ne représente
 *     plus rien, toutes les gardes qui l'emploient.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  De quoi fabriquer une admission
// ═════════════════════════════════════════════════════════════════════════════

const ADAPTATEUR: EnregistrementAdaptateur = {
  id: "axionia",
  version: "1.0.0",
  mode: "fédéré",
  authMode: "secret-partage",
  secretRef: "axionia.mcp.shared",
  endpoint: "https://exemple.invalid/api/mcp",
  manifestSha: `sha256:${"a".repeat(64)}`,
  trustTier: 1,
  maxDataClass: "personal",
};

function outil(surcharge: Partial<EnregistrementOutil> = {}): EnregistrementOutil {
  return {
    name: "inbox.recent",
    adapterId: "axionia",
    version: "1.0.0",
    description: "Les messages récents.",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "object" },
    bytes: 4031,
    effect: "read",
    dataClass: "personal",
    idempotency: "n/a",
    profiles: ["admin"],
    governanceFields: [],
    ...surcharge,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 1 — les colonnes touchées existent dans le schéma
// ═════════════════════════════════════════════════════════════════════════════

/** Les noms de champs d'un modèle Prisma, extraits du TEXTE du schéma. */
function champsDuModele(schema: string, modele: string): readonly string[] {
  const debut = schema.indexOf(`model ${modele} {`);
  if (debut < 0) return [];
  const fin = schema.indexOf("\n}", debut);
  const bloc = schema.slice(debut, fin < 0 ? undefined : fin);

  return bloc
    .split("\n")
    .slice(1)
    .map((ligne) => ligne.trim())
    .filter(
      (ligne) =>
        ligne.length > 0 &&
        !ligne.startsWith("//") &&
        !ligne.startsWith("///") &&
        !ligne.startsWith("@@") &&
        !ligne.startsWith("}") &&
        !ligne.startsWith("*") &&
        !ligne.startsWith("/*"),
    )
    .map((ligne) => ligne.split(/\s+/)[0] ?? "")
    .filter((nom) => nom.length > 0);
}

/** Le vrai schéma, lu depuis le dépôt — pas une copie. */
function schemaReel(): string {
  return readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
}

describe("core/registry/depot — les colonnes touchées existent au schéma", () => {
  it("confronte `ops_adapter` et `ops_tool` au VRAI schéma, et ANNONCE ses dénominateurs", () => {
    const schema = schemaReel();
    const champsAdaptateur = new Set(champsDuModele(schema, "OpsAdapter"));
    const champsOutil = new Set(champsDuModele(schema, "OpsTool"));

    const manquantesAdaptateur = colonnesDAdaptateurTouchees().filter(
      (colonne) => !champsAdaptateur.has(colonne),
    );
    const manquantesOutil = colonnesDOutilTouchees().filter((colonne) => !champsOutil.has(colonne));

    console.info(
      `[dépôt du registre] ${String(champsAdaptateur.size)} champ(s) d'OpsAdapter lu(s), ` +
        `${String(colonnesDAdaptateurTouchees().length)} touchée(s) · ` +
        `${String(champsOutil.size)} champ(s) d'OpsTool lu(s), ` +
        `${String(colonnesDOutilTouchees().length)} touchée(s) · ` +
        `${String(manquantesAdaptateur.length + manquantesOutil.length)} manquante(s)`,
    );

    // Un dénominateur NUL rendrait la garde verte pour la pire des raisons.
    expect(champsAdaptateur.size).toBeGreaterThan(0);
    expect(champsOutil.size).toBeGreaterThan(0);
    expect(manquantesAdaptateur).toEqual([]);
    expect(manquantesOutil).toEqual([]);
  });

  it("TÉMOIN — rougit sur un schéma fabriqué auquel il manque `manifestSha`", () => {
    const temoin = [
      "model OpsAdapter {",
      "  id String @id",
      "  version String",
      "  mode AdapterMode",
      "  authMode String",
      "  secretRef String?",
      "  endpoint String?",
      "  trustTier Int",
      "  maxDataClass DataClass",
      "}",
    ].join("\n");

    const champs = new Set(champsDuModele(temoin, "OpsAdapter"));
    const manquantes = colonnesDAdaptateurTouchees().filter((colonne) => !champs.has(colonne));

    console.info(`[dépôt du registre · témoin] manquante(s) : ${manquantes.join(", ")}`);
    expect(manquantes).toEqual(["manifestSha"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 2 — les cinq colonnes de console existent, et l'admission ne les touche pas
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0050 — les cinq colonnes de console sont au schéma et HORS de l'admission", () => {
  it("existe au schéma `OpsTool`, et aucune n'est dans les colonnes touchées", () => {
    const champsOutil = new Set(champsDuModele(schemaReel(), "OpsTool"));
    const touchees = new Set(colonnesDOutilTouchees());

    const absentesDuSchema = COLONNES_POSSEDEES_PAR_LA_CONSOLE.filter(
      (colonne) => !champsOutil.has(colonne),
    );
    const touchéesParErreur = COLONNES_POSSEDEES_PAR_LA_CONSOLE.filter((colonne) =>
      touchees.has(colonne),
    );

    console.info(
      `[ADR 0050] ${String(COLONNES_POSSEDEES_PAR_LA_CONSOLE.length)} colonne(s) de console · ` +
        `${String(absentesDuSchema.length)} absente(s) du schéma · ` +
        `${String(touchéesParErreur.length)} touchée(s) par l'admission`,
    );

    expect(absentesDuSchema).toEqual([]);
    expect(touchéesParErreur).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Un client Prisma FEINT, qui MÉMORISE ce qu'on lui demande d'écrire
// ═════════════════════════════════════════════════════════════════════════════

interface ClientFeint {
  readonly client: ClientPrismaDuRegistre;
  readonly misesAJourDOutils: () => readonly Record<string, unknown>[];
  readonly creationsDOutils: () => readonly Record<string, unknown>[];
}

/**
 * Une base feinte, avec de vraies tables : c'est ce qui permet d'admettre DEUX
 * fois et de relire, au lieu d'inspecter le corps des méthodes.
 */
function clientFeint(): ClientFeint {
  const adaptateurs = new Map<string, LignePrismaOpsAdapter>();
  const outils = new Map<string, LignePrismaOpsTool>();
  const misesAJour: Record<string, unknown>[] = [];
  const creations: Record<string, unknown>[] = [];
  const cle = (name: string, version: string): string => `${name} ${version}`;

  return {
    misesAJourDOutils: () => misesAJour,
    creationsDOutils: () => creations,
    client: {
      opsAdapter: {
        findUnique: ({ where }) => Promise.resolve(adaptateurs.get(where.id) ?? null),
        upsert: ({ where, create, update }) => {
          const existante = adaptateurs.get(where.id);
          const ligne: LignePrismaOpsAdapter =
            existante === undefined ? create : { ...existante, ...update };
          adaptateurs.set(where.id, ligne);
          return Promise.resolve(ligne);
        },
      },
      opsTool: {
        findMany: () =>
          Promise.resolve(
            [...outils.values()].sort((a, b) =>
              a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
            ),
          ),
        updateMany: ({ where, data }) => {
          const k = cle(where.name, where.version);
          const existante = outils.get(k);
          if (existante === undefined) return Promise.resolve({ count: 0 });
          outils.set(k, { ...existante, enabled: data.enabled });
          return Promise.resolve({ count: 1 });
        },
        upsert: ({ where, create, update }) => {
          const k = cle(where.name_version.name, where.name_version.version);
          const existante = outils.get(k);
          let ligne: LignePrismaOpsTool;
          if (existante === undefined) {
            creations.push({ ...create });
            // Les défauts de schéma, appliqués par la base réelle.
            ligne = {
              ...create,
              enabled: false,
              retiredAt: null,
              sunsetAt: null,
              limit: null,
              warnAt: null,
            };
          } else {
            misesAJour.push({ ...update });
            ligne = { ...existante, ...update };
          }
          outils.set(k, ligne);
          return Promise.resolve(ligne);
        },
      },
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 3 — LA DÉCISION : une ré-admission ne fait pas reculer la console
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0050 — une ré-admission NE FAIT PAS RECULER un réglage de console", () => {
  it("PRISMA : l'outil activé en console reste activé après une seconde admission", async () => {
    const feint = clientFeint();
    const depot = new DepotDuRegistrePrisma(feint.client);

    await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    // La console fait son geste : elle active, elle plafonne.
    const apresPremiere = await depot.listerOutils();
    expect(apresPremiere[0]?.enabled).toBe(false);
    await feint.client.opsTool.upsert({
      where: { name_version: { name: "inbox.recent", version: "1.0.0" } },
      create: {
        ...outil(),
        profiles: ["admin"],
        governanceFields: [],
      },
      // La console, elle, écrit bien les cinq colonnes : c'est son rôle.
      update: { enabled: true, limit: 200, warnAt: 160 } as never,
    });

    // ⚠️ LE GESTE DE CONSOLE CI-DESSUS EST LUI AUSSI UNE MISE À JOUR, et il
    //    écrit légitimement les cinq colonnes. Compter depuis zéro ferait
    //    rougir la garde sur le bruit de son propre montage : on ne regarde que
    //    ce que le SECOND DÉMARRAGE écrit.
    const avantLeSecondDemarrage = feint.misesAJourDOutils().length;

    // ── LE SECOND DÉMARRAGE ────────────────────────────────────────────────
    const resultat = await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    const relues = await depot.listerOutils();

    const cinqColonnesReecrites = feint
      .misesAJourDOutils()
      .slice(avantLeSecondDemarrage)
      .flatMap((mise) => Object.keys(mise))
      .filter((colonne) =>
        (COLONNES_POSSEDEES_PAR_LA_CONSOLE as readonly string[]).includes(colonne),
      );

    console.info(
      `[ADR 0050 · prisma] ${String(feint.misesAJourDOutils().length - avantLeSecondDemarrage)} mise(s) à jour au second démarrage · ` +
        `${String(cinqColonnesReecrites.length)} colonne(s) de console réécrite(s) · ` +
        `enabled relu : ${String(relues[0]?.enabled)} · limit relu : ${String(relues[0]?.limit)}`,
    );

    expect(resultat.adaptateurDejaPresent).toBe(true);
    expect(resultat.outilsMisAJour).toBe(1);
    expect(resultat.outilsInseres).toBe(0);
    // La mesure qui compte : la valeur RELUE, pas le corps de la méthode.
    expect(relues[0]?.enabled).toBe(true);
    expect(relues[0]?.limit).toBe(200);
    expect(relues[0]?.warnAt).toBe(160);
    expect(cinqColonnesReecrites).toEqual([]);
  });

  it("MÉMOIRE : le jumeau tient la MÊME règle, sinon il ne représente rien", async () => {
    const depot = new DepotDuRegistreEnMemoire();

    await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    depot.reglerCommeLaConsole("inbox.recent", "1.0.0", {
      enabled: true,
      limit: 200,
      warnAt: 160,
    });

    const resultat = await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    const relues = await depot.listerOutils();

    console.info(
      `[ADR 0050 · mémoire] ${String(depot.ecritures)} écriture(s) · ` +
        `enabled relu : ${String(relues[0]?.enabled)} · limit relu : ${String(relues[0]?.limit)}`,
    );

    expect(resultat.adaptateurDejaPresent).toBe(true);
    expect(resultat.outilsMisAJour).toBe(1);
    expect(relues[0]?.enabled).toBe(true);
    expect(relues[0]?.limit).toBe(200);
    expect(relues[0]?.warnAt).toBe(160);
  });

  it("TÉMOIN — une prise qui RECOPIERAIT les cinq colonnes ferait reculer la console", async () => {
    // La prise fautive n'est pas décrite : elle est JOUÉE. Le client feint
    // applique `update` tel quel ; il suffit d'y remettre les cinq colonnes
    // pour voir ce que l'ADR 0050 empêche.
    const feint = clientFeint();
    const depot = new DepotDuRegistrePrisma(feint.client);
    await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    await feint.client.opsTool.upsert({
      where: { name_version: { name: "inbox.recent", version: "1.0.0" } },
      create: { ...outil(), profiles: ["admin"], governanceFields: [] },
      update: { enabled: true } as never,
    });

    // ── LA PRISE FAUTIVE, EN UNE LIGNE ─────────────────────────────────────
    await feint.client.opsTool.upsert({
      where: { name_version: { name: "inbox.recent", version: "1.0.0" } },
      create: { ...outil(), profiles: ["admin"], governanceFields: [] },
      update: { ...outil(), enabled: false } as never,
    });

    const relues = await depot.listerOutils();
    console.info(
      `[ADR 0050 · témoin] une prise qui réécrit \`enabled\` rend : ${String(relues[0]?.enabled)}`,
    );
    expect(relues[0]?.enabled).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 4 — les deux prises rendent LES MÊMES NOMBRES
// ═════════════════════════════════════════════════════════════════════════════

async function scenario(depot: DepotDuRegistre): Promise<readonly string[]> {
  const trace: string[] = [];
  const premier = await depot.ecrireAdmission(ADAPTATEUR, [
    outil(),
    outil({ name: "agenda.jour", bytes: 3831 }),
  ]);
  trace.push(
    `1:${String(premier.adaptateurDejaPresent)}/${String(premier.outilsInseres)}/` +
      `${String(premier.outilsMisAJour)}/[${premier.outilsOrphelins.join(",")}]`,
  );

  // Le manifeste PERD un outil : la ligne reste, et elle est NOMMÉE.
  const second = await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
  trace.push(
    `2:${String(second.adaptateurDejaPresent)}/${String(second.outilsInseres)}/` +
      `${String(second.outilsMisAJour)}/[${second.outilsOrphelins.join(",")}]`,
  );

  const lignes = await depot.listerOutils();
  trace.push(`lignes:${lignes.map((ligne) => `${ligne.name}@${ligne.version}`).join(",")}`);

  const adaptateur = await depot.lireAdaptateur("axionia");
  trace.push(`adaptateur:${adaptateur?.endpoint ?? "null"}/${adaptateur?.authMode ?? "null"}`);
  trace.push(`absent:${(await depot.lireAdaptateur("inconnu")) === null ? "null" : "TROUVÉ"}`);

  return trace;
}

describe("les deux prises sont JUMELLES — mêmes nombres, mêmes noms", () => {
  it("rend une trace identique sur le même scénario, orphelins compris", async () => {
    const enMemoire = await scenario(new DepotDuRegistreEnMemoire());
    const surPrisma = await scenario(new DepotDuRegistrePrisma(clientFeint().client));

    console.info(`[jumeaux] ${String(enMemoire.length)} point(s) comparé(s)`);
    for (const ligne of enMemoire) console.info(`[jumeaux] ${ligne}`);

    expect(enMemoire.length).toBeGreaterThan(0);
    expect(surPrisma).toEqual(enMemoire);
    // L'orphelin est NOMMÉ, et il n'a pas été supprimé.
    expect(enMemoire[1]).toContain("[agenda.jour@1.0.0]");
    expect(enMemoire[2]).toContain("agenda.jour@1.0.0");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 5 — un outil disparu du manifeste est NOMMÉ, et rien d'autre
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0050 — un outil disparu du manifeste est NOMMÉ, jamais touché", () => {
  it("rend `outilsOrphelins` sans supprimer la ligne ni la désactiver", async () => {
    const depot = new DepotDuRegistreEnMemoire();
    await depot.ecrireAdmission(ADAPTATEUR, [outil(), outil({ name: "agenda.jour" })]);
    depot.reglerCommeLaConsole("agenda.jour", "1.0.0", { enabled: true, limit: 50 });

    // Le manifeste admis ne déclare plus `agenda.jour`.
    const second = await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    const relues = await depot.listerOutils();
    const orpheline = relues.find((ligne) => ligne.name === "agenda.jour");

    console.info(
      `[ADR 0050 · orphelins] ${String(second.outilsOrphelins.length)} orphelin(s) ` +
        `[${second.outilsOrphelins.join(", ")}] · ${String(relues.length)} ligne(s) en base · ` +
        `enabled de l'orpheline : ${String(orpheline?.enabled)}`,
    );

    expect(second.outilsOrphelins).toEqual(["agenda.jour@1.0.0"]);
    // NI SUPPRIMÉE — la ligne est toujours là…
    expect(orpheline).toBeDefined();
    // …NI DÉSACTIVÉE : une mise à jour silencieuse serait l'inverse du § 20.
    expect(orpheline?.enabled).toBe(true);
    expect(orpheline?.limit).toBe(50);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 6 — les refus nommés
// ═════════════════════════════════════════════════════════════════════════════

describe("les refus du dépôt DISENT quoi corriger", () => {
  it("LÈVE sur une ligne dont `authMode` est hors du vocabulaire de core/registry", async () => {
    const feint = clientFeint();
    await feint.client.opsAdapter.upsert({
      where: { id: "axionia" },
      create: { ...ADAPTATEUR, authMode: "oauth-maison" } as never,
      update: {} as never,
    });

    const depot = new DepotDuRegistrePrisma(feint.client);
    await expect(depot.lireAdaptateur("axionia")).rejects.toThrow(ErreurDeDepotDuRegistre);
    await expect(depot.lireAdaptateur("axionia")).rejects.toThrow(/oauth-maison/);
    console.info("[refus] authMode hors vocabulaire : levée nommée, pas de retypage de force");
  });

  it("laisse une panne d'écriture REMONTER, et compte les écritures passées", async () => {
    const depot = new DepotDuRegistreEnMemoire();
    await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    depot.programmerUnePanneDEcriture(1);

    await expect(depot.ecrireAdmission(ADAPTATEUR, [outil()])).rejects.toThrow(/panne/);
    console.info(`[panne] ${String(depot.ecritures)} écriture(s) tentée(s)`);
    expect(depot.ecritures).toBe(2);

    // Une reprise repose exactement les mêmes lignes : l'admission est idempotente.
    const reprise = await depot.ecrireAdmission(ADAPTATEUR, [outil()]);
    expect(reprise.outilsMisAJour).toBe(1);
    expect(reprise.outilsInseres).toBe(0);
  });

  it("REFUSE de régler comme la console une ligne qui n'existe pas", () => {
    const depot = new DepotDuRegistreEnMemoire();
    expect(() => {
      depot.reglerCommeLaConsole("inconnu", "1.0.0", { enabled: true });
    }).toThrow(ErreurDeDepotDuRegistre);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 7 — la conversion depuis l'admission laisse tomber LES DEUX DÉRIVÉS
// ═════════════════════════════════════════════════════════════════════════════

describe("versEnregistrementOutil — deux champs tombent, et ce sont des DÉRIVÉS", () => {
  it("retire `nomComplet` et `retireDeLaListe`, et conserve tout le reste", () => {
    const ligne: LigneOpsTool = {
      name: "inbox.recent",
      nomComplet: "axionia.inbox.recent",
      adapterId: "axionia",
      version: "1.0.0",
      description: "Les messages récents.",
      inputSchema: { type: "object" },
      outputSchema: { type: "object" },
      bytes: 4031,
      effect: "read",
      dataClass: "personal",
      idempotency: "n/a",
      limit: null,
      warnAt: null,
      profiles: ["admin"],
      governanceFields: [],
      enabled: false,
      retireDeLaListe: false,
    };

    const enregistrement = versEnregistrementOutil(ligne);
    const tombes = Object.keys(ligne).filter((cle) => !(cle in enregistrement));

    console.info(
      `[conversion] ${String(Object.keys(ligne).length)} champ(s) d'admission · ` +
        `${String(Object.keys(enregistrement).length)} champ(s) écrit(s) · ` +
        `tombé(s) : ${tombes.join(", ")}`,
    );

    expect(tombes.sort()).toEqual(["enabled", "limit", "nomComplet", "retireDeLaListe", "warnAt"]);
    expect(enregistrement.bytes).toBe(4031);
    expect(enregistrement.profiles).toEqual(["admin"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 8 — l'adaptateur est écrit AVANT ses outils
// ═════════════════════════════════════════════════════════════════════════════

describe("l'ordre d'écriture suit la clé étrangère", () => {
  it("écrit `ops_adapter` avant la première ligne `ops_tool`", async () => {
    const ordre: string[] = [];
    const feint = clientFeint();
    const surveille: ClientPrismaDuRegistre = {
      opsAdapter: {
        findUnique: feint.client.opsAdapter.findUnique.bind(feint.client.opsAdapter),
        upsert: vi.fn((args: Parameters<typeof feint.client.opsAdapter.upsert>[0]) => {
          ordre.push("adaptateur");
          return feint.client.opsAdapter.upsert(args);
        }),
      },
      opsTool: {
        findMany: feint.client.opsTool.findMany.bind(feint.client.opsTool),
        updateMany: feint.client.opsTool.updateMany.bind(feint.client.opsTool),
        upsert: vi.fn((args: Parameters<typeof feint.client.opsTool.upsert>[0]) => {
          ordre.push("outil");
          return feint.client.opsTool.upsert(args);
        }),
      },
    };

    await new DepotDuRegistrePrisma(surveille).ecrireAdmission(ADAPTATEUR, [
      outil(),
      outil({ name: "agenda.jour" }),
    ]);

    console.info(`[ordre] ${ordre.join(" → ")}`);
    expect(ordre).toEqual(["adaptateur", "outil", "outil"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Garde 9 — le geste de la console : `enabled`, et RIEN d'autre
// ═════════════════════════════════════════════════════════════════════════════

describe("`basculerActivation` — le geste de la console, sur les deux prises", () => {
  it("active, désactive, et n'écrit QUE `enabled` — les autres réglages survivent", async () => {
    for (const [nom, depot] of [
      ["mémoire", new DepotDuRegistreEnMemoire()],
      ["prisma", new DepotDuRegistrePrisma(clientFeint().client)],
    ] as const) {
      await depot.ecrireAdmission(ADAPTATEUR, [outil()]);

      const active = await depot.basculerActivation("inbox.recent", "1.0.0", true);
      const apresActivation = (await depot.listerOutils())[0];
      const desactive = await depot.basculerActivation("inbox.recent", "1.0.0", false);
      const apresDesactivation = (await depot.listerOutils())[0];

      console.info(
        `[console · ${nom}] activation → ${String(active)} ligne(s), enabled=` +
          `${String(apresActivation?.enabled)} · désactivation → ${String(desactive)} ligne(s), ` +
          `enabled=${String(apresDesactivation?.enabled)}`,
      );

      expect(active).toBe(1);
      expect(apresActivation?.enabled).toBe(true);
      expect(desactive).toBe(1);
      expect(apresDesactivation?.enabled).toBe(false);
      // Ce que la bascule N'A PAS touché : l'admission reste intacte.
      expect(apresDesactivation?.bytes).toBe(4031);
      expect(apresDesactivation?.retiredAt).toBeNull();
    }
  });

  it("rend ZÉRO sur une ligne absente — une bascule posée sur rien se DIT", async () => {
    for (const depot of [
      new DepotDuRegistreEnMemoire(),
      new DepotDuRegistrePrisma(clientFeint().client),
    ]) {
      const touchees = await depot.basculerActivation("inconnu", "9.9.9", true);
      expect(touchees).toBe(0);
    }
    console.info(
      "[console] bascule sur une ligne absente : 0 ligne(s) touchée(s), pas d'exception",
    );
  });
});

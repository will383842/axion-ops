import { describe, expect, it } from "vitest";

import { construireLeCatalogue, indexerLeManifeste } from "./catalogue.js";
import type { ManifesteIndexe } from "./catalogue.js";
import type { LigneOutilPersistee } from "./depot.js";
import type { Manifeste, ManifesteOutil } from "../adapter-kit/manifest.js";

/**
 * `core/registry/catalogue.spec.ts` — **CE QUE LE LECTEUR DOIT TENIR.**
 *
 * ═══ LES CINQ FAITS ═══
 *
 *  1. Les cinq champs qu'`ops_tool` ne porte pas viennent du **manifeste
 *     épinglé** — et le test le prouve en changeant le manifeste sans toucher la
 *     ligne, puis en relisant la valeur.
 *  2. Une ligne sans entrée au manifeste **n'est pas servie** et elle est
 *     NOMMÉE. Un défaut serait permissif : `maxBytes` plafonne ce qui sort.
 *  3. `effect` / `dataClass` / `idempotency` font foi depuis `ops_tool` (§ 20),
 *     et un **désaccord** avec le manifeste écarte l'outil au lieu de choisir.
 *  4. `retireDeLaListe` se dérive de `retiredAt <= maintenant`, sur un instant
 *     CHOISI par le test.
 *  5. `name` porte le nom COMPLET, dérivé une seule fois.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  De quoi fabriquer les deux documents
// ═════════════════════════════════════════════════════════════════════════════

function entreeDeManifeste(surcharge: Partial<ManifesteOutil> = {}): ManifesteOutil {
  return {
    name: "inbox.recent",
    version: "1.0.0",
    description: "Les messages récents.",
    effect: "read",
    dataClass: "personal",
    idempotency: "n/a",
    pagination: "page",
    inputSchema: { type: "object", additionalProperties: false },
    outputSchema: { type: "object" },
    maxBytes: 20_480,
    compaction: { free: ["objet"], tier2: ["contexte"], aggregateBy: "canal" },
    idFields: ["id"],
    governanceFields: [],
    bytes: 4031,
    ...surcharge,
  };
}

function manifeste(outils: readonly ManifesteOutil[] = [entreeDeManifeste()]): Manifeste {
  return {
    manifestVersion: 1,
    id: "axionia",
    version: "1.0.0",
    mode: "fédéré",
    profilesVersion: "1",
    profilesSha: `sha256:${"0".repeat(64)}`,
    profiles: ["admin"],
    secrets: [],
    tools: outils,
  };
}

function ligne(surcharge: Partial<LigneOutilPersistee> = {}): LigneOutilPersistee {
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
    enabled: true,
    retiredAt: null,
    sunsetAt: null,
    limit: null,
    warnAt: null,
    ...surcharge,
  };
}

const LE_2026_09_02 = new Date("2026-09-02T12:00:00.000Z");

function index(m: Manifeste = manifeste()): readonly ManifesteIndexe[] {
  return [indexerLeManifeste(m)];
}

// ═════════════════════════════════════════════════════════════════════════════
//  Fait 1 — les cinq champs viennent du MANIFESTE ÉPINGLÉ
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0051 — les cinq champs absents d'`ops_tool` viennent du manifeste épinglé", () => {
  it("compose un `OutilDuCatalogue` complet à partir de DEUX documents", () => {
    const resultat = construireLeCatalogue([ligne()], index(), LE_2026_09_02);
    const outil = resultat.outils[0];

    console.info(
      `[catalogue] ${String(resultat.lignesLues)} ligne(s) lue(s) · ` +
        `${String(resultat.manifestesIndexes)} manifeste(s) indexé(s) · ` +
        `${String(resultat.outils.length)} outil(s) au catalogue · ` +
        `${String(resultat.sansEntreeAuManifeste.length)} sans épingle · ` +
        `${String(resultat.desaccords.length)} désaccord(s)`,
    );

    expect(resultat.outils).toHaveLength(1);
    // Le nom COMPLET, dérivé une seule fois.
    expect(outil?.name).toBe("axionia.inbox.recent");
    // Les cinq du manifeste.
    expect(outil?.pagination).toBe("page");
    expect(outil?.maxBytes).toBe(20_480);
    expect(outil?.idFields).toEqual(["id"]);
    expect(outil?.compaction.tier2).toEqual(["contexte"]);
    expect(outil?.adapterVersion).toBe("1.0.0");
    // Ce que la ligne porte.
    expect(outil?.enabled).toBe(true);
    expect(outil?.effect).toBe("read");
  });

  it("🔑 change le MANIFESTE sans toucher la ligne, et la valeur servie SUIT", () => {
    const serre = manifeste([entreeDeManifeste({ maxBytes: 4096, idFields: ["uuid"] })]);
    const resultat = construireLeCatalogue([ligne()], index(serre), LE_2026_09_02);

    console.info(
      `[catalogue · épingle] maxBytes servi : ${String(resultat.outils[0]?.maxBytes)} · ` +
        `idFields servis : [${(resultat.outils[0]?.idFields ?? []).join(", ")}]`,
    );

    // La ligne `ops_tool` est IDENTIQUE dans les deux cas : la seule source de
    // ces valeurs est le document que l'empreinte couvre.
    expect(resultat.outils[0]?.maxBytes).toBe(4096);
    expect(resultat.outils[0]?.idFields).toEqual(["uuid"]);
  });

  it("`adapterVersion` vient du manifeste, PAS de `ops_tool.version`", () => {
    const v2 = { ...manifeste(), version: "2.4.0" };
    const resultat = construireLeCatalogue(
      [ligne({ version: "1.0.0" })],
      [indexerLeManifeste(v2)],
      LE_2026_09_02,
    );

    console.info(
      `[catalogue] version de l'OUTIL : ${String(resultat.outils[0]?.version)} · ` +
        `version de l'ADAPTATEUR : ${String(resultat.outils[0]?.adapterVersion)}`,
    );
    expect(resultat.outils[0]?.version).toBe("1.0.0");
    expect(resultat.outils[0]?.adapterVersion).toBe("2.4.0");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Fait 2 — sans épingle, on ne sert pas
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0051 — une ligne sans entrée au manifeste épinglé N'EST PAS SERVIE", () => {
  it("écarte l'outil et le NOMME, plutôt que de lui inventer un `maxBytes`", () => {
    const resultat = construireLeCatalogue(
      [ligne(), ligne({ name: "agenda.jour" })],
      index(),
      LE_2026_09_02,
    );

    console.info(
      `[catalogue · sans épingle] ${String(resultat.outils.length)} servi(s) sur ` +
        `${String(resultat.lignesLues)} · écarté(s) : [${resultat.sansEntreeAuManifeste.join(", ")}]`,
    );

    expect(resultat.outils.map((o) => o.name)).toEqual(["axionia.inbox.recent"]);
    expect(resultat.sansEntreeAuManifeste).toEqual(["axionia.agenda.jour@1.0.0"]);
  });

  it("nomme l'ADAPTATEUR dont aucun manifeste n'a été fourni", () => {
    const resultat = construireLeCatalogue(
      [ligne({ adapterId: "zoho-mail", name: "mail.send" })],
      index(),
      LE_2026_09_02,
    );

    console.info(
      `[catalogue · adaptateur muet] ${resultat.adaptateursSansManifeste.join(", ")} · ` +
        `${String(resultat.outils.length)} outil(s) servi(s)`,
    );
    expect(resultat.adaptateursSansManifeste).toEqual(["zoho-mail"]);
    expect(resultat.outils).toEqual([]);
  });

  it("TÉMOIN — un catalogue VIDE se distingue d'un catalogue non lu", () => {
    const rienDuTout = construireLeCatalogue([], [], LE_2026_09_02);
    console.info(
      `[catalogue · témoin] ${String(rienDuTout.lignesLues)} ligne(s) lue(s) · ` +
        `${String(rienDuTout.manifestesIndexes)} manifeste(s) · un ZÉRO qui se DIT`,
    );
    // Le zéro est ANNONCÉ des deux côtés : c'est ce qui distingue « rien en
    // base » de « personne n'a lu ».
    expect(rienDuTout.lignesLues).toBe(0);
    expect(rienDuTout.manifestesIndexes).toBe(0);
    expect(rienDuTout.outils).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Fait 3 — le désaccord de gouvernance écarte, il ne choisit pas
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0051 — un désaccord ligne / manifeste ÉCARTE l'outil et le NOMME", () => {
  it("refuse de servir un outil dont `effect` diverge de son épingle", () => {
    // La ligne dit `read`, le manifeste épinglé dit `send`. C'est exactement le
    // cas du § 20 : « un `effect` basculé de `send` à `read` n'est ni un champ
    // ajouté ni un champ disparu — sans cette règle il n'apparaît nulle part ».
    const resultat = construireLeCatalogue(
      [ligne({ effect: "read" })],
      index(manifeste([entreeDeManifeste({ effect: "send" })])),
      LE_2026_09_02,
    );

    console.info(
      `[catalogue · désaccord] ${String(resultat.desaccords.length)} · ` +
        resultat.desaccords
          .map((d) => `${d.nomComplet}.${d.champ} : base=${d.enBase} manifeste=${d.auManifeste}`)
          .join(" | "),
    );

    expect(resultat.outils).toEqual([]);
    expect(resultat.desaccords).toEqual([
      {
        nomComplet: "axionia.inbox.recent",
        champ: "effect",
        enBase: "read",
        auManifeste: "send",
      },
    ]);
  });

  it("compte les TROIS champs confrontés quand ils divergent tous", () => {
    const resultat = construireLeCatalogue(
      [ligne({ effect: "read", dataClass: "internal", idempotency: "n/a" })],
      index(
        manifeste([
          entreeDeManifeste({ effect: "send", dataClass: "sensitive", idempotency: "key" }),
        ]),
      ),
      LE_2026_09_02,
    );

    console.info(
      `[catalogue · désaccord] champs : ${resultat.desaccords.map((d) => d.champ).join(", ")}`,
    );
    expect(resultat.desaccords.map((d) => d.champ)).toEqual(["effect", "dataClass", "idempotency"]);
    expect(resultat.outils).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  Fait 4 — `retireDeLaListe` se DÉRIVE, sur un instant choisi
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 13.4 — `retireDeLaListe` se dérive de `retiredAt`, jamais l'inverse", () => {
  it("vaut `false` avant l'échéance, `true` à partir d'elle, et l'outil reste APPELABLE", () => {
    const echeance = new Date("2026-09-02T12:00:00.000Z");
    const veille = new Date("2026-09-01T12:00:00.000Z");

    const avant = construireLeCatalogue([ligne({ retiredAt: echeance })], index(), veille);
    const apres = construireLeCatalogue([ligne({ retiredAt: echeance })], index(), echeance);

    console.info(
      `[§ 13.4] la veille : retireDeLaListe=${String(avant.outils[0]?.retireDeLaListe)} · ` +
        `à l'échéance : ${String(apres.outils[0]?.retireDeLaListe)} · ` +
        `enabled à l'échéance : ${String(apres.outils[0]?.enabled)}`,
    );

    expect(avant.outils[0]?.retireDeLaListe).toBe(false);
    expect(apres.outils[0]?.retireDeLaListe).toBe(true);
    // ⚠️ RETIRÉ DE LA LISTE ≠ DÉSACTIVÉ : il ne s'affiche plus, il répond encore.
    expect(apres.outils[0]?.enabled).toBe(true);
    expect(apres.outils).toHaveLength(1);
  });

  it("vaut `false` quand `retiredAt` est nul — aucun défaut permissif", () => {
    const resultat = construireLeCatalogue([ligne({ retiredAt: null })], index(), LE_2026_09_02);
    expect(resultat.outils[0]?.retireDeLaListe).toBe(false);
  });
});

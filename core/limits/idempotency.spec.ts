import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { creerCalculArgHash, type CoffreArgHash } from "./arg-hash.js";
import { DepotIdempotenceEnMemoire } from "./memoire.js";
import {
  MODES_IDEMPOTENCE,
  STATUTS_IDEMPOTENCE,
  cloturer,
  reserver,
  type DepotIdempotence,
  type LigneIdempotence,
  type ModeIdempotence,
} from "./idempotency.js";

/**
 * Gardes de `core/limits/` — l'idempotence (§ 11 étape 13, § 12).
 */

const MAINTENANT = new Date("2026-08-30T14:03:25.000Z");
const TTL_MS = 24 * 3_600_000;

const CLE_DE_TEST = "cle-de-test-0123456789abcdef0123456789ab";

const coffre: CoffreArgHash = {
  lireCleArgHash(): Promise<string> {
    return Promise.resolve(CLE_DE_TEST);
  },
};

/** On n'emploie que `correspond` : la comparaison à temps constant, la vraie. */
const calcul = creerCalculArgHash(coffre);

function ligne(
  partiel: Partial<LigneIdempotence> & { readonly argHash: string },
): LigneIdempotence {
  return {
    tool: "zoho.mail.send",
    key: "cle-client-1",
    status: "done",
    resultRef: "ref-du-resultat",
    completedAt: MAINTENANT,
    expiresAt: new Date(MAINTENANT.getTime() + TTL_MS),
    ...partiel,
  };
}

function demande(
  depot: DepotIdempotence,
  argHash: string,
  mode: ModeIdempotence = "key",
  key: string | null = "cle-client-1",
): Parameters<typeof reserver>[0] {
  return {
    depot,
    calcul,
    tool: "zoho.mail.send",
    mode,
    key,
    argHash,
    ttlMs: TTL_MS,
    maintenant: MAINTENANT,
  };
}

const ARG_A = "a".repeat(64);
const ARG_B = "b".repeat(64);

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le vocabulaire est DÉRIVÉ du schéma, pas recopié
// ─────────────────────────────────────────────────────────────────────────────

/** Extrait les valeurs d'une énumération d'un `schema.prisma`. */
function extraireEnum(source: string, nom: string): readonly string[] {
  const entete = `enum ${nom} {`;
  const debut = source.indexOf(entete);
  if (debut < 0) return [];
  const fin = source.indexOf("\n}", debut);
  if (fin < 0) return [];
  return source
    .slice(debut + entete.length, fin)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("/") && !l.startsWith("@"))
    .map((l) => l.split(/\s+/)[0] ?? "")
    .filter((v) => v.length > 0);
}

/** Extrait le corps d'un modèle d'un `schema.prisma`. */
function extraireModele(source: string, nom: string): string {
  const entete = `model ${nom} {`;
  const debut = source.indexOf(entete);
  if (debut < 0) return "";
  const fin = source.indexOf("\n}", debut);
  if (fin < 0) return "";
  return source.slice(debut + entete.length, fin);
}

describe("core/limits — le vocabulaire vient du schéma", () => {
  const chemin = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));
  // Lecture NON protégée : si le fichier a déménagé, la garde doit tomber
  // bruyamment plutôt que mesurer zéro élément en restant verte.
  const schema = readFileSync(chemin, "utf8");

  it("rougit sur un témoin fabriqué à qui il manque une valeur", () => {
    const temoin = "enum IdempotencyStatus {\n  in_flight\n  done\n}\n";
    const valeurs = extraireEnum(temoin, "IdempotencyStatus");
    expect(valeurs).toEqual(["in_flight", "done"]);
    expect(valeurs).not.toEqual([...STATUTS_IDEMPOTENCE]);
  });

  it("rougit sur un témoin fabriqué dont l'énumération n'existe pas", () => {
    expect(extraireEnum("model X {\n  a Int\n}", "IdempotencyStatus")).toEqual([]);
  });

  it("dérive les trois statuts du `schema.prisma` réel, et ils correspondent", () => {
    const valeurs = extraireEnum(schema, "IdempotencyStatus");

    console.info(
      `[garde statuts] ${String(valeurs.length)} valeurs dérivées de ${chemin.split(/[\\/]/).slice(-2).join("/")}`,
    );

    // Plancher-témoin : trois statuts au § 12. Zéro valeur dérivée voudrait
    // dire que l'extraction ne regarde plus rien.
    expect(valeurs).toHaveLength(3);
    expect(valeurs).toEqual([...STATUTS_IDEMPOTENCE]);
  });

  it("vérifie que `ops_idempotency` a bien (tool, key) POUR CLÉ PRIMAIRE", () => {
    const modele = extraireModele(schema, "OpsIdempotency");
    console.info(`[garde clé primaire] ${String(modele.split("\n").length)} lignes de modèle lues`);
    expect(modele.length).toBeGreaterThan(0);
    expect(modele).toMatch(/@@id\(\[tool,\s*key\]\)/);
  });

  it("vérifie que `ops_quota` porte son DÉNOMINATEUR et son seuil d'alerte", () => {
    // § 12 : « un compteur sans dénominateur ne peut ni refuser ni alerter à
    // 80 % ». Si l'une des deux colonnes disparaissait du schéma, tout ce
    // module continuerait de compiler et ne refuserait plus jamais rien.
    const modele = extraireModele(schema, "OpsQuota");
    const temoinSansSeuil = "model OpsQuota {\n  count Int\n  limit Int\n}";

    const colonnes: ReadonlyArray<readonly [string, RegExp]> = [
      ["limit", /^\s*limit\s+Int/m],
      ["warnAt", /^\s*warnAt\s+Int/m],
      ["count", /^\s*count\s+Int/m],
    ];

    let mesures = 0;
    for (const [nom, motif] of colonnes) {
      expect(modele, nom).toMatch(motif);
      mesures += 1;
    }

    console.info(`[garde dénominateur en base] ${String(mesures)} colonnes mesurées`);
    expect(mesures).toBe(3);
    // Le témoin prouve que la garde sait dire NON.
    expect(temoinSansSeuil).not.toMatch(/^\s*warnAt\s+Int/m);
    expect(modele).toMatch(/@@unique\(\[window,\s*tool,\s*principal\]\)/);
  });

  it("énumère les trois modes d'idempotence du § 09", () => {
    console.info(`[garde modes] ${String(MODES_IDEMPOTENCE.length)} modes mesurés`);
    expect([...MODES_IDEMPOTENCE]).toEqual(["key", "non-rejouable", "n/a"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — c'est l'INSERTION qui verrouille
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — étape 13, l'insertion verrouille", () => {
  it("tente l'insertion AVANT toute lecture", async () => {
    // § 11 : « (tool, key) INSÉRÉ en in_flight, argHash comparé ». Une lecture
    // préalable suivie d'une insertion laisse deux appels concurrents s'insérer
    // tous deux : la clé primaire en refuse un, mais seulement si on la laisse
    // trancher.
    const depot = new DepotIdempotenceEnMemoire();
    const verdict = await reserver(demande(depot, ARG_A));

    console.info(`[garde ordre] appels au dépôt : ${depot.appels.join(" → ")}`);

    expect(depot.appels[0]).toBe("insererSiAbsente");
    expect(verdict.type).toBe("reservee");
  });

  it("ne touche PAS au dépôt quand l'outil ne déduplique pas (`n/a`)", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    const verdict = await reserver(demande(depot, ARG_A, "n/a"));

    console.info(`[garde n/a] ${String(depot.appels.length)} appel(s) au dépôt mesuré(s)`);

    expect(verdict.type).toBe("sans-objet");
    expect(depot.appels).toEqual([]);
  });

  it("exige la clé dans `ctx`, jamais dans `input`", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    let mesures = 0;
    for (const cle of [null, "", "   "]) {
      const verdict = await reserver(demande(depot, ARG_A, "key", cle));
      expect(verdict.type).toBe("refus");
      if (verdict.type !== "refus") throw new Error("inatteignable");
      expect(verdict.code).toBe("invalid_input");
      expect(verdict.detail).toContain("ctx.idempotencyKey");
      mesures += 1;
    }

    console.info(`[garde clé absente] ${String(mesures)} formes d'absence mesurées`);
    expect(mesures).toBe(3);
    expect(depot.appels).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — LA règle : même clé, autre argument ⇒ invalid_input
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — une clé réutilisée avec un autre argument", () => {
  it("rend `invalid_input` QUEL QUE SOIT le statut de la ligne existante", async () => {
    // Le piège que cette garde isole : brancher sur le statut AVANT de comparer
    // l'argHash. Avec cet ordre inversé, un statut `done` servirait le résultat
    // de l'autre appel — « pas l'autre résultat en silence » (§ 12).
    // Les statuts sont DÉRIVÉS de `STATUTS_IDEMPOTENCE` : en ajouter un le fait
    // mesurer ici.
    let mesures = 0;
    for (const statut of STATUTS_IDEMPOTENCE) {
      const depot = new DepotIdempotenceEnMemoire();
      depot.poser(ligne({ argHash: ARG_A, status: statut }));

      const verdict = await reserver(demande(depot, ARG_B));

      expect(verdict.type, statut).toBe("refus");
      if (verdict.type !== "refus") throw new Error("inatteignable");
      expect(verdict.code, statut).toBe("invalid_input");
      expect(verdict.detail, statut).toContain("ARGUMENT DIFFÉRENT");
      mesures += 1;
    }

    console.info(`[garde argHash] ${String(mesures)} statuts mesurés`);
    expect(mesures).toBe(3);
    expect(mesures).toBe(STATUTS_IDEMPOTENCE.length);
  });

  it("sert le résultat mémorisé quand l'argument est LE MÊME", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "done", resultRef: "ref-42" }));

    const verdict = await reserver(demande(depot, ARG_A));

    expect(verdict.type).toBe("rejeu");
    if (verdict.type !== "rejeu") throw new Error("inatteignable");
    expect(verdict.resultRef).toBe("ref-42");
  });

  it("laisse la clé LIBRE une fois le TTL passé, même pour un autre argument", async () => {
    // La borne de la règle : « même clé, autre argument = invalid_input » ne
    // vaut que DANS la fenêtre du TTL. Au-delà, la ligne est morte.
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(
      ligne({
        argHash: ARG_A,
        status: "done",
        expiresAt: new Date(MAINTENANT.getTime() - 1),
      }),
    );

    const verdict = await reserver(demande(depot, ARG_B));

    console.info(`[garde TTL] appels au dépôt : ${depot.appels.join(" → ")}`);
    expect(verdict.type).toBe("reservee");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — ce que dit chaque statut, à argument identique
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — le statut décide, une fois l'argument reconnu", () => {
  it("rend `conflict` sur un appel identique EN COURS", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "in_flight", completedAt: null, resultRef: null }));

    const verdict = await reserver(demande(depot, ARG_A));

    expect(verdict.type).toBe("refus");
    if (verdict.type !== "refus") throw new Error("inatteignable");
    expect(verdict.code).toBe("conflict");
  });

  it("REPREND une réservation `failed` — un échec ne doit pas condamner la clé", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "failed", resultRef: null }));

    const verdict = await reserver(demande(depot, ARG_A));

    expect(verdict.type).toBe("reservee");
    expect(depot.appels).toContain("reprendreSiEchouee");
  });

  it("refuse de re-servir un outil `non-rejouable` déjà exécuté", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    depot.poser(ligne({ argHash: ARG_A, status: "done", resultRef: "ref-42" }));

    const verdict = await reserver(demande(depot, ARG_A, "non-rejouable"));

    expect(verdict.type).toBe("refus");
    if (verdict.type !== "refus") throw new Error("inatteignable");
    expect(verdict.code).toBe("conflict");
    expect(verdict.detail).toContain("non rejouable");
  });

  it("clôt la réservation, et le rejeu suivant sert alors le résultat", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    const premiere = await reserver(demande(depot, ARG_A));
    expect(premiere.type).toBe("reservee");

    const close = await cloturer({
      depot,
      reservation: premiere,
      issue: "done",
      resultRef: "ref-99",
      maintenant: MAINTENANT,
    });
    expect(close).toBe(true);

    const seconde = await reserver(demande(depot, ARG_A));
    expect(seconde.type).toBe("rejeu");
    if (seconde.type !== "rejeu") throw new Error("inatteignable");
    expect(seconde.resultRef).toBe("ref-99");
  });

  it("ne clôt rien quand rien n'a été réservé", async () => {
    const depot = new DepotIdempotenceEnMemoire();
    const close = await cloturer({
      depot,
      reservation: { type: "sans-objet" },
      issue: "done",
      resultRef: null,
      maintenant: MAINTENANT,
    });
    expect(close).toBe(false);
    expect(depot.appels).toEqual([]);
  });
});

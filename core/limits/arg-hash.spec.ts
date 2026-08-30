import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  DOMAINE_ARG_HASH,
  ErreurCleArgHash,
  ErreurOutilSansNom,
  LONGUEUR_ARG_HASH,
  creerCalculArgHash,
  messageArgHash,
  type CoffreArgHash,
} from "./arg-hash.js";
import { ErreurCanonisation, canoniser } from "./canonical.js";

/**
 * Gardes de `core/limits/` — l'empreinte des arguments (§ 12, règle 2).
 *
 * Motif repris de `core/types.spec.ts` : chaque garde est appliquée d'ABORD à
 * un témoin fabriqué défectueux — on prouve qu'elle rougit — PUIS à la vraie
 * donnée, et chacune ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS.
 */

/** Une clé de test. Aucune valeur réelle : rien ici ne sort de la machine. */
const CLE_A = "cle-de-test-a-0123456789abcdef0123456789";
const CLE_B = "cle-de-test-b-0123456789abcdef0123456789";

function coffreQuiRend(valeur: string | null | undefined): CoffreArgHash {
  return {
    lireCleArgHash(): Promise<string | null | undefined> {
      return Promise.resolve(valeur);
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la forme canonique ne transforme rien en silence
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — la forme canonique", () => {
  it("refuse les valeurs que JSON.stringify transformerait en silence", () => {
    // Chaque témoin est une valeur que `JSON.stringify` accepte SANS BRUIT en
    // la changeant. Deux charges différentes y produiraient une seule chaîne,
    // donc un seul argHash — et le jeton de confirmation du § 20, « lié à
    // l'argHash de l'appel exact », vaudrait pour les deux.
    const cyclique: Record<string, unknown> = {};
    cyclique["moi"] = cyclique;

    const temoins: ReadonlyArray<readonly [string, unknown]> = [
      ["NaN → JSON.stringify écrit null", { n: Number.NaN }],
      ["Infinity → JSON.stringify écrit null", { n: Number.POSITIVE_INFINITY }],
      ["undefined dans un tableau → écrit null", { t: [1, undefined, 3] }],
      ["fonction dans un tableau → écrit null", { t: [() => 1] }],
      ["Date → écrite par toJSON, sans retour possible", { d: new Date(0) }],
      ["Map → écrite {} , donc vidée", { m: new Map<string, string>() }],
      ["BigInt → JSON.stringify LÈVE, mais pas au bon endroit", { b: 1n }],
      ["cycle", cyclique],
    ];

    let mesures = 0;
    for (const [nom, valeur] of temoins) {
      expect(() => canoniser(valeur), nom).toThrow(ErreurCanonisation);
      mesures += 1;
    }

    console.info(`[garde canonisation] ${String(mesures)} témoins de transformation mesurés`);
    expect(mesures).toBe(temoins.length);
    expect(mesures).toBeGreaterThanOrEqual(8);
  });

  it("rend la MÊME chaîne quel que soit l'ordre des clés — sinon un rejeu légitime est refusé", () => {
    // Sans ce déterminisme, un client qui sérialise ses clés dans un autre
    // ordre voit son rejeu refusé en `invalid_input` à l'étape 13.
    const paires: ReadonlyArray<readonly [unknown, unknown]> = [
      [
        { a: 1, b: 2 },
        { b: 2, a: 1 },
      ],
      [
        { z: { y: 1, x: 2 }, a: [1, 2] },
        { a: [1, 2], z: { x: 2, y: 1 } },
      ],
      [{ a: 1, b: undefined }, { a: 1 }],
    ];

    let mesures = 0;
    for (const [gauche, droite] of paires) {
      expect(canoniser(gauche)).toBe(canoniser(droite));
      mesures += 1;
    }

    console.info(`[garde canonisation] ${String(mesures)} paires équivalentes mesurées`);
    expect(mesures).toBe(3);
  });

  it("garde l'ORDRE des tableaux — un tableau n'est pas un ensemble", () => {
    expect(canoniser([1, 2])).not.toBe(canoniser([2, 1]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — séparation de domaine PAR OUTIL (§ 12, règle 2)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — argHash sépare les domaines par outil", () => {
  it("rougit sur un témoin fabriqué : une empreinte qui IGNORE l'outil", () => {
    // Le témoin est l'implémentation naïve qu'on veut interdire : hacher le
    // seul argument. Elle rend la même valeur pour une lecture et pour une
    // suppression du même identifiant.
    const naif = (_tool: string, input: unknown): string =>
      createHash("sha256").update(canoniser(input)).digest("hex");

    const argument = { id: "42" };
    expect(naif("zoho.mail.read", argument)).toBe(naif("zoho.mail.delete", argument));
  });

  it("rend des empreintes DIFFÉRENTES pour deux outils sur le même argument", async () => {
    const calcul = creerCalculArgHash(coffreQuiRend(CLE_A));
    const argument = { id: "42" };

    // Les couples sont dérivés d'une liste d'outils, pas écrits deux à deux :
    // ajouter un outil élargit la mesure sans retoucher aucune liste de paires.
    const outils = ["zoho.mail.read", "zoho.mail.delete", "axionia.inbox.recent"] as const;

    const empreintes = new Map<string, string>();
    for (const outil of outils) {
      empreintes.set(outil, await calcul.calculer(outil, argument));
    }

    let paires = 0;
    for (const a of outils) {
      for (const b of outils) {
        if (a === b) continue;
        expect(empreintes.get(a), `${a} vs ${b}`).not.toBe(empreintes.get(b));
        paires += 1;
      }
    }

    console.info(
      `[garde séparation de domaine] ${String(outils.length)} outils, ` +
        `${String(paires)} paires distinctes mesurées`,
    );
    expect(empreintes.size).toBe(outils.length);
    expect(paires).toBe(outils.length * (outils.length - 1));
    expect(paires).toBeGreaterThanOrEqual(6);
  });

  it("cadre les morceaux par leur longueur — un séparateur seul serait ambigu", () => {
    // `tool + ":" + argument` fait de ("ab", X) et ("a", "b:" + X) le même
    // message. Le préfixe de longueur rend le glissement impossible : les deux
    // messages diffèrent, quelles que soient les valeurs.
    const gauche = messageArgHash("ab", { id: "1" }).toString("utf8");
    const droite = messageArgHash("a", { id: "1" }).toString("utf8");

    expect(gauche).not.toBe(droite);
    expect(gauche.startsWith(`${String(DOMAINE_ARG_HASH.length)}:${DOMAINE_ARG_HASH}`)).toBe(true);
    expect(gauche).toContain("2:ab");
    expect(droite).toContain("1:a");
  });

  it("refuse un appel sans nom d'outil au lieu d'effacer la séparation", () => {
    expect(() => messageArgHash("", { id: "1" })).toThrow(ErreurOutilSansNom);
    expect(() => messageArgHash("   ", { id: "1" })).toThrow(ErreurOutilSansNom);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — clé absente : échec BRUYANT, jamais un repli silencieux
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — la clé du coffre est obligatoire", () => {
  it("lève sur chacune des cinq formes d'absence, et n'en absorbe aucune", async () => {
    // La chaîne VIDE est le cas réel : une variable déclarée sans valeur dans
    // Coolify n'est pas nullish. Un `??` l'aurait laissée servir de clé.
    const temoins: ReadonlyArray<readonly [string, string | null | undefined]> = [
      ["secret absent", null],
      ["secret indéfini", undefined],
      ["chaîne vide", ""],
      ["blancs seulement", "   "],
      ["clé trop courte pour en être une", "trop-courte"],
    ];

    let mesures = 0;
    for (const [nom, valeur] of temoins) {
      const calcul = creerCalculArgHash(coffreQuiRend(valeur));
      await expect(calcul.calculer("zoho.mail.send", { id: "1" }), nom).rejects.toBeInstanceOf(
        ErreurCleArgHash,
      );
      mesures += 1;
    }

    console.info(`[garde clé manquante] ${String(mesures)} formes d'absence mesurées`);
    expect(mesures).toBe(5);
  });

  it("n'expose AUCUNE clé de repli — le module n'en contient pas", async () => {
    // Une clé de repli produirait des empreintes valides mais PUBLIQUES :
    // quiconque lit le code pourrait forger l'argHash auquel un jeton de
    // confirmation est lié (§ 20). La garde : sans coffre, rien ne sort.
    const calcul = creerCalculArgHash(coffreQuiRend(null));
    const obtenues: string[] = [];
    try {
      obtenues.push(await calcul.calculer("zoho.mail.send", { id: "1" }));
    } catch (_erreur) {
      // Attendu : le module lève plutôt que de rendre une empreinte.
    }
    console.info(`[garde repli] ${String(obtenues.length)} empreinte(s) rendue(s) sans coffre`);
    expect(obtenues).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — c'est un HMAC, pas un SHA nu
// ─────────────────────────────────────────────────────────────────────────────

describe("core/limits — argHash est un HMAC, pas un SHA nu", () => {
  it("dépend de la clé, et ne vaut jamais le SHA-256 nu du même message", async () => {
    const tool = "zoho.mail.delete";
    const argument = { id: "42" };

    const avecA = await creerCalculArgHash(coffreQuiRend(CLE_A)).calculer(tool, argument);
    const avecB = await creerCalculArgHash(coffreQuiRend(CLE_B)).calculer(tool, argument);

    // Le témoin est le SHA nu : c'est exactement ce que le § 12 interdit, et ce
    // qu'on doit pouvoir DISTINGUER. S'il coïncidait, la clé ne servirait à rien.
    const shaNu = createHash("sha256").update(messageArgHash(tool, argument)).digest("hex");

    console.info(`[garde HMAC] 2 clés mesurées, ${String(avecA.length)} caractères par empreinte`);

    expect(avecA).toHaveLength(LONGUEUR_ARG_HASH);
    expect(avecB).toHaveLength(LONGUEUR_ARG_HASH);
    expect(avecA).not.toBe(avecB);
    expect(avecA).not.toBe(shaNu);
    expect(avecB).not.toBe(shaNu);
  });

  it("est déterministe à clé constante — sans quoi aucun rejeu ne serait comparable", async () => {
    const calcul = creerCalculArgHash(coffreQuiRend(CLE_A));
    const un = await calcul.calculer("zoho.mail.send", { b: 2, a: 1 });
    const deux = await calcul.calculer("zoho.mail.send", { a: 1, b: 2 });
    expect(un).toBe(deux);
  });

  it("compare à temps constant, et refuse deux longueurs différentes", () => {
    const calcul = creerCalculArgHash(coffreQuiRend(CLE_A));
    expect(calcul.correspond("a".repeat(64), "a".repeat(64))).toBe(true);
    expect(calcul.correspond("a".repeat(64), `${"a".repeat(63)}b`)).toBe(false);
    // `timingSafeEqual` lève sur des longueurs inégales : la garde doit rendre
    // `false`, jamais propager l'exception.
    expect(calcul.correspond("a".repeat(64), "a")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  ErreurValeurNonCanonique,
  jsonCanonique,
  octetsCanoniques,
  octetsUtf8,
} from "./canonique.js";

/**
 * Gardes de la MESURE. Si ce fichier ment, tout le § 14 ment avec lui : un
 * plafond appliqué sur un nombre d'octets faux n'est pas un plafond.
 *
 * Motif de la Fondation, copié : chaque garde (a) rougit d'abord sur un TÉMOIN
 * FABRIQUÉ, (b) ANNONCE combien d'éléments elle a mesurés, avec un plancher.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — l'ordre des clés ne change pas la mesure
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/canonique — le JSON canonique est stable", () => {
  it("rougit sur un témoin fabriqué : JSON.stringify NU dépend de l'ordre d'insertion", () => {
    // Le témoin prouve que le problème existe. Sans lui, on ne saurait pas si le
    // vert de la garde suivante vient du tri ou d'un hasard heureux.
    const a = { zeta: 1, alpha: 2 };
    const b = { alpha: 2, zeta: 1 };

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("rend les mêmes octets quel que soit l'ordre d'insertion, à toute profondeur", () => {
    const paires: ReadonlyArray<readonly [unknown, unknown]> = [
      [
        { zeta: 1, alpha: 2 },
        { alpha: 2, zeta: 1 },
      ],
      [
        { nom: "a", schema: { type: "object", properties: { b: 1, a: 2 } } },
        { schema: { properties: { a: 2, b: 1 }, type: "object" }, nom: "a" },
      ],
      [{ liste: [{ y: 1, x: 2 }] }, { liste: [{ x: 2, y: 1 }] }],
    ];

    let mesures = 0;
    for (const [gauche, droite] of paires) {
      expect(jsonCanonique(gauche)).toBe(jsonCanonique(droite));
      expect(octetsCanoniques(gauche)).toBe(octetsCanoniques(droite));
      mesures += 1;
    }

    console.info(`[garde canonique] ${String(mesures)} paires d'objets mesurées`);
    expect(mesures).toBe(paires.length);
    expect(mesures).toBeGreaterThanOrEqual(3);
  });

  it("rend deux fois de suite exactement la même chaîne", () => {
    const valeur = { b: [3, 1, 2], a: { d: null, c: true } };
    expect(jsonCanonique(valeur)).toBe(jsonCanonique(valeur));
    expect(jsonCanonique(valeur)).toBe('{"a":{"c":true,"d":null},"b":[3,1,2]}');
  });

  it("NE TRIE PAS les tableaux — l'ordre d'un tableau est une donnée", () => {
    // Témoin : si les tableaux étaient triés, ces deux déclarations
    // d'`effect` deviendraient indiscernables.
    expect(jsonCanonique(["send", "read"])).not.toBe(jsonCanonique(["read", "send"]));
    expect(jsonCanonique(["send", "read"])).toBe('["send","read"]');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — la mesure est en OCTETS UTF-8, pas en unités UTF-16
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/canonique — octets UTF-8, pas String.length", () => {
  it("rougit sur un témoin fabriqué : String.length sous-compte l'accentué et l'emoji", () => {
    // Toutes les `description` de ce socle sont en français. Mesurer avec
    // `String.length` sous-estimerait le budget de façon SILENCIEUSE.
    expect("é".length).toBe(1);
    expect(octetsUtf8("é")).toBe(2);
    expect("🙂".length).toBe(2);
    expect(octetsUtf8("🙂")).toBe(4);
  });

  it("mesure chaque cas d'un jeu de témoins, et annonce combien", () => {
    const cas: ReadonlyArray<readonly [string, number]> = [
      ["", 0],
      ["abc", 3],
      ["é", 2],
      ["€", 3],
      ["🙂", 4],
      ["créneau", 8],
    ];

    let mesures = 0;
    for (const [texte, attendu] of cas) {
      expect(octetsUtf8(texte), texte).toBe(attendu);
      mesures += 1;
    }

    console.info(`[garde octets] ${String(mesures)} chaînes mesurées`);
    expect(mesures).toBe(cas.length);
    expect(mesures).toBeGreaterThanOrEqual(6);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — fail-loud sur ce que JSON.stringify transformerait en silence
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/canonique — refuse ce qui ferait mentir la mesure", () => {
  it("rougit sur un témoin fabriqué : JSON.stringify rend NaN en « null », en silence", () => {
    expect(JSON.stringify({ n: Number.NaN })).toBe('{"n":null}');
    expect(JSON.stringify({ n: undefined })).toBe("{}");
    expect(JSON.stringify(new Date(0))).toBe('"1970-01-01T00:00:00.000Z"');
  });

  it("lève sur chacun des cas trompeurs, en NOMMANT le chemin fautif", () => {
    const cas: ReadonlyArray<readonly [string, unknown, string]> = [
      ["NaN", { n: Number.NaN }, "$.n"],
      ["Infinity", { schema: { max: Number.POSITIVE_INFINITY } }, "$.schema.max"],
      ["undefined imbriqué", { a: { b: undefined } }, "$.a.b"],
      ["bigint", { n: 1n }, "$.n"],
      ["Date (porteuse d'un toJSON)", { at: new Date(0) }, "$.at"],
      ["fonction", { f: () => 1 }, "$.f"],
      ["élément de tableau undefined", { l: [1, undefined] }, "$.l[1]"],
    ];

    let mesures = 0;
    for (const [nom, valeur, cheminAttendu] of cas) {
      let attrapee: unknown;
      try {
        jsonCanonique(valeur);
      } catch (erreur: unknown) {
        attrapee = erreur;
      }

      expect(attrapee, nom).toBeInstanceOf(ErreurValeurNonCanonique);
      expect((attrapee as ErreurValeurNonCanonique).chemin, nom).toBe(cheminAttendu);
      mesures += 1;
    }

    console.info(`[garde fail-loud] ${String(mesures)} valeurs trompeuses mesurées`);
    expect(mesures).toBe(cas.length);
    expect(mesures).toBeGreaterThanOrEqual(7);
  });

  it("accepte en revanche les formes légitimes d'un schéma JSON", () => {
    const schema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
      properties: { depuis: { type: "string" }, limite: { type: "integer" } },
      required: ["depuis"],
    };

    expect(() => jsonCanonique(schema)).not.toThrow();
    expect(octetsCanoniques(schema)).toBeGreaterThan(0);
  });
});

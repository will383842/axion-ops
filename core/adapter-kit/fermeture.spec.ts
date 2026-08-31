import { describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { toJSONSchema } from "zod/v4";

import { lireClesDAutorisation } from "./autorisation.js";
import {
  DIALECTES_FERMETURE,
  PROFONDEUR_MAXIMALE,
  analyserFermeture,
  chercherChampsDAutorisation,
  dialecteDeFermeture,
  sousSchemas,
} from "./fermeture.js";
import { versValeurJson } from "./json.js";
import type { ValeurJson } from "./json.js";

/**
 * Gardes de la FERMETURE des schémas d'entrée (§ 09, ADR 0003).
 *
 * Ce que ces gardes doivent prouver, dans l'ordre :
 *
 *  1. la reconnaissance accepte LES DEUX dialectes — c'est la décision de
 *     l'ADR 0003, et une garde qui n'en accepterait qu'un forcerait un
 *     adaptateur PHP à aplatir ses schémas, ou à obtenir une exception écrite à
 *     la main, c'est-à-dire un trou ;
 *  2. elle ROUGIT sur le témoin exact que la Recette a mesuré au lot 1 : un
 *     schéma ouvert portant `peutVoirAppels` ;
 *  3. elle descend, et ne se contente pas de la racine ;
 *  4. elle ANNONCE combien de sous-schémas et combien de propriétés elle a
 *     inspectés — un schéma déclaré fermé sur zéro sous-schéma inspecté serait
 *     vert pour la pire des raisons.
 */

/** Les noms interdits, DÉRIVÉS de `core/types.ts` — jamais écrits ici. */
const CLES = lireClesDAutorisation().toutes;

/** Un JSON Schema, écrit à la main : ce que produit un générateur non-Zod. */
function schema(objet: unknown): ValeurJson {
  return versValeurJson(objet, "témoin");
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — LES DEUX DIALECTES, et pas un
// ─────────────────────────────────────────────────────────────────────────────

describe("core/adapter-kit/fermeture — les deux dialectes de l'ADR 0003", () => {
  it("reconnaît `additionalProperties: false` — le dialecte que produit Zod", () => {
    const zod = versValeurJson(
      toJSONSchema(z.object({ limite: z.number().int() }).strict(), { io: "input" }),
      "zod",
    );
    const verdict = analyserFermeture(zod);

    console.info(
      `[garde fermeture · zod] ${String(verdict.sousSchemasInspectes)} sous-schéma(s) inspecté(s), ` +
        `${String(verdict.objetsAFermer)} à fermer, dialecte « ${String(verdict.dialecteRacine)} »`,
    );

    expect(verdict.ferme).toBe(true);
    expect(verdict.dialecteRacine).toBe("additionalProperties");
    // Plancher-témoin : au moins la racine ET la propriété ont été visitées.
    expect(verdict.sousSchemasInspectes).toBeGreaterThanOrEqual(2);
    expect(verdict.objetsAFermer).toBe(1);
  });

  it("reconnaît `unevaluatedProperties: false` — le dialecte composable", () => {
    // C'est le cas que l'ADR 0003 tranche : un générateur qui compose ses
    // schémas (le CRM en PHP, § 29) ferme APRÈS composition, et
    // `additionalProperties` ne voit pas ce qu'un `allOf` apporte.
    const compose = schema({
      type: "object",
      allOf: [{ type: "object", properties: { limite: { type: "integer" } } }],
      properties: { curseur: { type: "string" } },
      unevaluatedProperties: false,
    });
    const verdict = analyserFermeture(compose);

    console.info(
      `[garde fermeture · composé] ${String(verdict.sousSchemasInspectes)} sous-schéma(s), ` +
        `${String(verdict.objetsAFermer)} à fermer, ` +
        `${String(verdict.ouverts.length)} ouvert(s)`,
    );

    // ⚠️ LE SOUS-SCHÉMA DU `allOf` DÉCLARE DES PROPRIÉTÉS ET N'EST PAS FERMÉ,
    //    et c'est exact : la garde exige la fermeture de CHAQUE schéma d'objet.
    //    Une racine `unevaluatedProperties: false` couvre bien la composition
    //    au sens de JSON Schema — mais la garde du socle est plus stricte, et
    //    ce test le MESURE plutôt que de le supposer. C'est la borne de l'ADR
    //    0003 : un générateur composable doit fermer chacun de ses morceaux.
    expect(verdict.ouverts).toEqual(["$.allOf[0]"]);
    expect(dialecteDeFermeture({ unevaluatedProperties: false })).toBe("unevaluatedProperties");
  });

  it("accepte un schéma composé dont CHAQUE morceau est fermé", () => {
    const compose = schema({
      type: "object",
      allOf: [
        {
          type: "object",
          properties: { limite: { type: "integer" } },
          unevaluatedProperties: false,
        },
      ],
      properties: { curseur: { type: "string" } },
      unevaluatedProperties: false,
    });
    const verdict = analyserFermeture(compose);

    console.info(
      `[garde fermeture · composé fermé] ${String(verdict.objetsAFermer)} objet(s) à fermer`,
    );

    expect(verdict.ferme).toBe(true);
    expect(verdict.objetsAFermer).toBe(2);
  });

  it("mesure les deux dialectes déclarés, et n'en oublie aucun", () => {
    let mesures = 0;
    for (const dialecte of DIALECTES_FERMETURE) {
      expect(dialecteDeFermeture({ [dialecte.cle]: false })).toBe(dialecte.cle);
      // ⚠️ `true` NE FERME PAS. Un `additionalProperties: true` est le contraire
      //    d'une fermeture, et un test qui ne regarderait que la présence de la
      //    clé l'accepterait.
      expect(dialecteDeFermeture({ [dialecte.cle]: true })).toBeNull();
      mesures += 1;
    }
    console.info(`[garde dialectes] ${String(mesures)} dialectes mesurés`);
    expect(mesures).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — le témoin EXACT mesuré au lot 1
// ─────────────────────────────────────────────────────────────────────────────

describe("core/adapter-kit/fermeture — le témoin du lot 1 rougit maintenant", () => {
  /**
   * Reproduit MOT POUR MOT le témoin exécuté par la Recette :
   * « un manifeste fédéré dont un outil déclare
   *   `inputSchema: { type: "object", properties: { peutVoirAppels: { type: "boolean" } } }`
   *   — sans `additionalProperties` — est ADMIS sans un mot ».
   */
  const TEMOIN_DU_LOT_1 = schema({
    type: "object",
    properties: { peutVoirAppels: { type: "boolean" } },
  });

  it("rougit sur le schéma OUVERT", () => {
    const verdict = analyserFermeture(TEMOIN_DU_LOT_1);

    console.info(
      `[témoin ouvert] ${String(verdict.sousSchemasInspectes)} sous-schéma(s) inspecté(s), ` +
        `${String(verdict.ouverts.length)} ouvert(s) : ${verdict.ouverts.join(", ")}`,
    );

    expect(verdict.ferme).toBe(false);
    expect(verdict.ouverts).toEqual(["$"]);
  });

  it("rougit AUSSI sur le nom d'autorisation, même schéma fermé", () => {
    // Les deux règles du § 09 sont DISTINCTES : fermer le schéma n'efface pas
    // le champ. Un adaptateur qui ajouterait `additionalProperties: false` en
    // gardant `peutVoirAppels` aurait corrigé la forme et gardé le défaut.
    const ferme = schema({
      type: "object",
      properties: { peutVoirAppels: { type: "boolean" } },
      additionalProperties: false,
    });

    expect(analyserFermeture(ferme).ferme).toBe(true);

    const controle7 = chercherChampsDAutorisation(ferme, CLES);

    console.info(
      `[témoin contrôle 7] ${String(controle7.proprietesInspectees)} propriété(s) inspectée(s), ` +
        `${String(controle7.clesInterdites)} nom(s) interdit(s), ` +
        `${String(controle7.trouves.length)} trouvé(s)`,
    );

    // Plancher-témoin : la dérivation a bien rendu des noms.
    expect(controle7.clesInterdites).toBeGreaterThanOrEqual(5);
    expect(controle7.trouves.map((champ) => champ.nom)).toEqual(["peutVoirAppels"]);
  });

  it("descend : un champ d'autorisation NICHÉ ne passe pas", () => {
    // Une racine fermée dont un sous-objet porterait le nom serait un défaut
    // que seule la descente attrape. C'est la raison pour laquelle la garde ne
    // se contente pas de la racine.
    const niche = schema({
      type: "object",
      properties: {
        options: {
          type: "object",
          properties: { peutVoirAppels: { type: "boolean" } },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    });

    const controle7 = chercherChampsDAutorisation(niche, CLES);

    console.info(
      `[témoin niché] ${String(controle7.proprietesInspectees)} propriété(s) inspectée(s), ` +
        `${String(controle7.trouves.length)} trouvé(s)`,
    );

    expect(controle7.trouves).toHaveLength(1);
    expect(controle7.trouves[0]?.chemin).toBe("$.properties.options.properties.peutVoirAppels");
  });

  it("descend AUSSI pour la fermeture : un sous-objet ouvert est vu", () => {
    const racineFermee = schema({
      type: "object",
      properties: {
        options: { type: "object", properties: { verbeux: { type: "boolean" } } },
      },
      additionalProperties: false,
    });

    const verdict = analyserFermeture(racineFermee);

    console.info(
      `[témoin sous-objet ouvert] ${String(verdict.objetsAFermer)} objet(s) à fermer, ` +
        `${String(verdict.ouverts.length)} ouvert(s)`,
    );

    expect(verdict.dialecteRacine).toBe("additionalProperties");
    expect(verdict.ferme).toBe(false);
    expect(verdict.ouverts).toEqual(["$.properties.options"]);
  });

  it("ne déclare PAS fermé un schéma où il n'y avait rien à fermer", () => {
    // Un `{ "type": "string" }` n'a aucune propriété — donc aucune porte. Le
    // déclarer « fermé » serait vrai et trompeur : la garde ne l'a pas éprouvé,
    // elle n'a rien eu à éprouver. `ferme` exige `objetsAFermer > 0`, et le
    // registre rend ce cas visible plutôt que vert.
    const verdict = analyserFermeture(schema({ type: "string" }));

    console.info(
      `[témoin rien à fermer] ${String(verdict.sousSchemasInspectes)} sous-schéma(s), ` +
        `${String(verdict.objetsAFermer)} à fermer`,
    );

    expect(verdict.objetsAFermer).toBe(0);
    expect(verdict.ferme).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — le parcours est BORNÉ, et il le dit
// ─────────────────────────────────────────────────────────────────────────────

describe("core/adapter-kit/fermeture — un document reçu ne fait pas boucler le socle", () => {
  it("signale la profondeur dépassée au lieu de tourner sans fin", () => {
    // Un schéma reçu d'un dépôt tiers PEUT être hostile. Sans borne, un
    // parcours naïf figerait le socle sur un document : un déni de service
    // déclenchable par n'importe quel adaptateur, y compris un dépôt public.
    let profond: Record<string, unknown> = { type: "string" };
    for (let niveau = 0; niveau < PROFONDEUR_MAXIMALE + 5; niveau += 1) {
      profond = { type: "object", properties: { suite: profond }, additionalProperties: false };
    }

    const { profondeurDepassee, trouves } = sousSchemas(schema(profond));

    console.info(
      `[garde profondeur] ${String(trouves.length)} sous-schéma(s) visité(s), ` +
        `borne ${String(PROFONDEUR_MAXIMALE)}, dépassée : ${String(profondeurDepassee)}`,
    );

    expect(profondeurDepassee).toBe(true);
    // Et le dépassement REND LE VERDICT NÉGATIF : ne pas pouvoir conclure n'est
    // pas conclure que c'est fermé.
    expect(analyserFermeture(schema(profond)).ferme).toBe(false);
  });

  it("ne boucle pas sur un schéma qui se référence lui-même", () => {
    const cyclique: Record<string, unknown> = { type: "object", additionalProperties: false };
    cyclique["properties"] = { soi: cyclique };

    // `versValeurJson` refuserait un cycle : on passe la structure telle quelle,
    // ce qui est exactement ce qu'un `JSON.parse` d'un document tiers ne peut
    // pas produire — mais qu'un assemblage en mémoire, lui, peut.
    const { trouves } = sousSchemas(cyclique as unknown as ValeurJson);

    console.info(`[garde cycle] ${String(trouves.length)} sous-schéma(s) visité(s) sur un cycle`);

    expect(trouves.length).toBeGreaterThan(0);
    expect(trouves.length).toBeLessThan(PROFONDEUR_MAXIMALE + 2);
  });

  it("compte les renvois qu'il ne résout pas, au lieu de les ignorer", () => {
    // BORNE ÉCRITE AVEC LA MESURE : la garde ne résout AUCUN `$ref`. Un schéma
    // dont la fermeture dépendrait d'un document externe est refusé pour ce
    // qu'il est — un schéma que le socle ne peut pas vérifier — et le compte le
    // dit dans le message de refus.
    const avecRef = schema({
      type: "object",
      properties: { corps: { $ref: "https://exemple.invalid/schemas/corps.json" } },
      additionalProperties: false,
    });

    const verdict = analyserFermeture(avecRef);

    console.info(
      `[garde renvois] ${String(verdict.refsNonResolus.length)} renvoi(s) non résolu(s)`,
    );

    expect(verdict.refsNonResolus).toHaveLength(1);
  });
});

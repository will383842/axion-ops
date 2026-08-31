import { describe, expect, it } from "vitest";

import {
  clesDAutorisationDepuisSource,
  lireClesDAutorisation,
  proprietesDInterface,
  sansCommentaires,
} from "./autorisation.js";

/**
 * Gardes du contrôle 7 — « aucun champ d'autorisation ne provient du schéma
 * d'entrée » (§ 09).
 *
 * L'enjeu de ce fichier n'est pas le contrôle lui-même : c'est sa SOURCE. La
 * liste des noms interdits est DÉRIVÉE du source de `core/types.ts`. Si la
 * dérivation rendait une liste vide, le contrôle 7 passerait sur n'importe quel
 * schéma — vert, muet, et faux.
 */

const TEMOIN_SANS_INTERFACE = `
export interface AutreChose {
  readonly a: string;
}
`;

const TEMOIN_COMMENTE = `
/**
 * export interface ToolContext {
 *   readonly piege: string;
 * }
 */
export interface ToolContext<T extends string = string> {
  readonly principal: string;
  readonly sessionId: string;
  readonly scopes: readonly string[];
  readonly policyLevel: string;
  readonly profile: T;
  readonly idempotencyKey: string | null;
}
export interface Habilitations {
  readonly peutVoirAppels: boolean;
}
`;

describe("la dérivation des noms interdits", () => {
  it("rougit sur un témoin où l'interface est absente — la liste serait VIDE", () => {
    const tirees = proprietesDInterface(TEMOIN_SANS_INTERFACE, "ToolContext");
    console.info(
      `[garde plancher] 1 source témoin mesurée · ${String(tirees.length)} propriété(s) tirée(s)`,
    );
    expect(tirees).toHaveLength(0);
    expect(() => clesDAutorisationDepuisSource(TEMOIN_SANS_INTERFACE, "témoin")).toThrow(
      /plancher/,
    );
  });

  it("ne se laisse pas prendre à une interface écrite DANS un commentaire", () => {
    // Sans le retrait des commentaires, la première déclaration rencontrée
    // serait celle du bloc de documentation, et la liste dérivée porterait
    // « piege » au lieu des vraies propriétés.
    const proprietes = proprietesDInterface(TEMOIN_COMMENTE, "ToolContext");
    console.info(
      `[garde commentaires] ${String(proprietes.length)} propriété(s) tirée(s) · ` +
        `« piege » retenu = ${String(proprietes.includes("piege"))}`,
    );
    expect(proprietes).not.toContain("piege");
    expect(proprietes).toContain("idempotencyKey");
    expect(proprietes).toHaveLength(6);
  });

  it("retire les commentaires sans décaler les numéros de ligne", () => {
    const source = "const a = 1;\n/* deux\n   lignes */\nconst b = 2;\n";
    const avant = source.split("\n").length;
    const apres = sansCommentaires(source).split("\n").length;
    console.info(`[garde lignes] ${String(avant)} ligne(s) avant, ${String(apres)} après`);
    expect(apres).toBe(avant);
  });

  it("lit le VRAI `core/types.ts` et annonce combien de noms elle en tire", () => {
    const cles = lireClesDAutorisation();

    console.info(
      `[garde noms interdits] ${String(cles.toolContext.length)} depuis ToolContext · ` +
        `${String(cles.habilitations.length)} depuis Habilitations · ` +
        `${String(cles.toutes.length)} au total, lus dans ${cles.origine}`,
    );

    // Compte mesuré. Une dérivation qui rendrait 0 ou 1 nom rendrait le
    // contrôle 7 vacueux ; le plancher est ici la seule chose qui l'empêche.
    expect(cles.toolContext.length).toBeGreaterThanOrEqual(5);
    expect(cles.habilitations.length).toBeGreaterThanOrEqual(1);
    expect(cles.toutes.length).toBeGreaterThanOrEqual(6);

    // Les trois noms que le CDC nomme explicitement doivent y être. Ils ne sont
    // pas la liste : ils sont le témoin que la dérivation a lu le bon fichier.
    expect(cles.toutes).toContain("idempotencyKey");
    expect(cles.toutes).toContain("scopes");
    expect(cles.toutes).toContain("peutVoirAppels");

    expect(cles.origine).toMatch(/types\.ts$/);
  });

  it("dédoublonne et trie — le rapport du contrôle 7 est lisible tel quel", () => {
    const cles = clesDAutorisationDepuisSource(TEMOIN_COMMENTE, "témoin");
    console.info(
      `[garde tri] ${String(cles.toutes.length)} nom(s) mesuré(s) · ` +
        `${String(new Set(cles.toutes).size)} distinct(s)`,
    );
    expect(cles.toutes.length).toBeGreaterThanOrEqual(6);
    expect(cles.toutes).toEqual([...cles.toutes].sort());
    expect(new Set(cles.toutes).size).toBe(cles.toutes.length);
  });
});

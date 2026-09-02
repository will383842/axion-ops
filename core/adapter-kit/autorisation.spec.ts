import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  SOURCES_DES_CLES_DAUTORISATION,
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
        `${String(cles.reservesHorsContexte.length)} réservé(s) HORS contexte · ` +
        `${String(cles.toutes.length)} au total, lus dans ${cles.origine}`,
    );

    // ⚠️ LE TROISIÈME COMPTE EST CELUI QUI NE POUVAIT PAS MANQUER, ET IL
    //    MANQUAIT. L'ADR 0020 exige que ce rapport annonce LES TROIS ensembles ;
    //    il en annonçait deux — « 9 · 1 · 11 au total », une addition qui ne se
    //    reconstitue pas. Le onzième nom EST le troisième ensemble, celui qui
    //    empêche le retrait d'`idempotencyKey` de `ToolContext` de ROUVRIR ce nom
    //    dans un schéma d'entrée en silence. S'il tombait à zéro, le total
    //    passerait de 11 à 10, et un lecteur qui ne voit que « 9 · 1 · total »
    //    n'a aucune raison de trouver ce total anormal. La règle du dépôt est de
    //    lire le COMPTE, pas la couleur — encore faut-il que le compte soit écrit.

    // Compte mesuré. Une dérivation qui rendrait 0 ou 1 nom rendrait le
    // contrôle 7 vacueux ; le plancher est ici la seule chose qui l'empêche.
    expect(cles.toolContext.length).toBeGreaterThanOrEqual(5);
    expect(cles.habilitations.length).toBeGreaterThanOrEqual(1);
    expect(cles.reservesHorsContexte.length).toBeGreaterThanOrEqual(1);
    expect(cles.toutes.length).toBeGreaterThanOrEqual(6);

    // Les trois noms que le CDC nomme explicitement doivent y être. Ils ne sont
    // pas la liste : ils sont le témoin que la dérivation a lu le bon fichier.
    expect(cles.toutes).toContain("idempotencyKey");
    expect(cles.toutes).toContain("scopes");
    expect(cles.toutes).toContain("peutVoirAppels");
    expect(cles.toutes).toContain("roleConsole");

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

// ═════════════════════════════════════════════════════════════════════════════
//  LA SOURCE SOUS `dist/` — ADR 0052
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 🔑 **LE CONTRÔLE 7 DOIT POUVOIR S'ARMER LÀ OÙ LE SOCLE SERT.**
 *
 * `tsconfig.build.json` émet du `.js` et du `.d.ts` ; il ne COPIE aucun `.ts`.
 * Sous `node dist/ops/…`, `../types.ts` n'existe donc pas, et
 * `lireClesDAutorisation()` levait `ENOENT` — c'est-à-dire que la garde était
 * impossible à armer dans le SEUL environnement qui sert des appels. Le défaut
 * n'avait jamais paru parce qu'aucun appelant de production ne l'invoquait.
 *
 * ⚠️ **LA GARDE N'AFFIRME PAS QUE LE `.d.ts` PORTE LES MÊMES NOMS : ELLE LE
 *    MESURE.** Elle fait émettre les déclarations par le VRAI émetteur de
 *    TypeScript, depuis le VRAI `core/types.ts`, et confronte les deux
 *    dérivations. Recopier un `.d.ts` témoin ici en ferait une seconde source,
 *    qui cesserait de suivre au premier champ ajouté.
 */
function declarationsEmisesDepuisLeReel(): string {
  const fichier = fileURLToPath(new URL("../types.ts", import.meta.url));
  let emis: string | null = null;
  // `noResolve` + `noLib` : on ne veut que les DÉCLARATIONS de ce fichier. Sans
  // eux, le programme tire tout le graphe d'imports pour un résultat identique
  // sur ce qui nous intéresse — des NOMS DE PROPRIÉTÉS — et cinq fois plus lent.
  const programme = ts.createProgram([fichier], {
    declaration: true,
    emitDeclarationOnly: true,
    noResolve: true,
    noLib: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  });
  programme.emit(undefined, (nom, contenu) => {
    if (nom.endsWith(".d.ts")) emis = contenu;
  });
  if (emis === null) throw new Error("le compilateur n'a émis aucune déclaration");
  return emis;
}

describe("ADR 0052 — les clés d'autorisation se dérivent AUSSI du `.d.ts`", () => {
  it("nomme les deux sources, dans l'ordre où elles sont essayées", () => {
    console.info(`[contrôle 7 · sources] ${SOURCES_DES_CLES_DAUTORISATION.join(" puis ")}`);
    expect([...SOURCES_DES_CLES_DAUTORISATION]).toEqual(["../types.ts", "../types.d.ts"]);
  });

  it("🔑 dérive EXACTEMENT les mêmes noms du `.ts` et du `.d.ts` émis par tsc", () => {
    const cheminSource = fileURLToPath(new URL("../types.ts", import.meta.url));
    const depuisLeTs = clesDAutorisationDepuisSource(
      readFileSync(cheminSource, "utf8"),
      cheminSource,
    );
    const declarations = declarationsEmisesDepuisLeReel();
    const depuisLeDts = clesDAutorisationDepuisSource(declarations, "types.d.ts (émis)");

    console.info(
      `[contrôle 7 · projection] ${String(declarations.length)} caractère(s) de déclarations ` +
        `émis · ${String(depuisLeTs.toutes.length)} clé(s) depuis le .ts · ` +
        `${String(depuisLeDts.toutes.length)} depuis le .d.ts · ` +
        `écart : [${depuisLeTs.toutes.filter((c) => !depuisLeDts.toutes.includes(c)).join(", ") || "aucun"}]`,
    );

    // Un dénominateur NUL rendrait l'égalité triviale.
    expect(depuisLeTs.toutes.length).toBeGreaterThanOrEqual(5);
    expect(depuisLeDts.toutes).toEqual(depuisLeTs.toutes);
    expect(depuisLeDts.toolContext).toEqual(depuisLeTs.toolContext);
    expect(depuisLeDts.habilitations).toEqual(depuisLeTs.habilitations);
    expect(depuisLeDts.reservesHorsContexte).toEqual(depuisLeTs.reservesHorsContexte);
  });

  it("LÈVE en nommant les deux chemins quand aucune source n'est trouvée", () => {
    // On ne peut pas retirer `core/types.ts` du disque ; on éprouve donc le
    // message par la fonction pure, sur une source VIDE — le même refus, sur le
    // même chemin de code que celui qui protège la dérivation.
    expect(() => clesDAutorisationDepuisSource("", "vide.d.ts")).toThrow(/vide\.d\.ts/);
  });
});

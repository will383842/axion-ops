import { describe, expect, it } from "vitest";

import {
  PLAFOND_PROFILS,
  PROFILES,
  PROFILES_VERSION,
  PROFILE_NAMES,
  declarerProfils,
  empreinteProfils,
  estProfil,
  exigerProfil,
  trierProfils,
  type Profil,
} from "./profiles.js";

/**
 * Gardes de l'ÉNUMÉRATION FERMÉE.
 *
 * § 14 : « c'est la seule garde du budget qui ne dépende d'aucun adaptateur pour
 * exister ». Elle doit donc mordre ici, sans réseau, sans base, sans manifeste.
 *
 * ⚠️ DEUX ÉTAGES, ET IL FAUT LES DEUX :
 *
 *  · les tests de ce fichier tournent sous `pnpm test` ;
 *  · les `@ts-expect-error` du bloc « fermeture » ne sont vérifiés que par
 *    `pnpm typecheck` — `tsconfig.json` inclut tous les fichiers `.ts` de `core/`,
 *    `.spec.ts` compris, tandis que Vitest transpile sans typer. Si l'énumération était
 *    rouverte (`ProfileName` élargi en `string`), l'erreur attendue cesserait de
 *    se produire et `tsc` échouerait sur un « @ts-expect-error inutilisé ».
 *    C'EST LA GARDE. Elle vit dans `pnpm typecheck`, pas dans `pnpm test`.
 */

/** Ce que rend une garde : le verdict ET le nombre d'éléments mesurés. */
interface Verdict {
  readonly mesures: number;
  readonly anomalies: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la table des profils est bien formée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un nom de profil est prononcé à la voix, écrit dans un manifeste produit par
 * un AUTRE DÉPÔT, et stocké dans deux colonnes texte. Une majuscule, un espace
 * ou un accent y produirait deux valeurs indiscernables à l'œil et distinctes en
 * base.
 */
function verifierTableProfils(profils: readonly Profil[]): Verdict {
  const anomalies: string[] = [];
  const nomsVus = new Set<string>();

  for (const profil of profils) {
    if (nomsVus.has(profil.nom)) {
      anomalies.push(`nom « ${profil.nom} » en double`);
    }
    nomsVus.add(profil.nom);

    if (!/^[a-z][a-z0-9-]*$/.test(profil.nom)) {
      anomalies.push(`nom « ${profil.nom} » hors du jeu [a-z0-9-]`);
    }
    if (profil.libelle.trim().length === 0) {
      anomalies.push(`profil « ${profil.nom} » sans libellé`);
    }
    if (!/^\d+\.\d+\.\d+$/.test(profil.depuis)) {
      anomalies.push(`profil « ${profil.nom} » : « depuis » n'est pas une version`);
    }
  }

  if (profils.length > PLAFOND_PROFILS) {
    anomalies.push(`${String(profils.length)} profils, plafond ${String(PLAFOND_PROFILS)}`);
  }

  return { mesures: profils.length, anomalies };
}

describe("core/profiles — la table des profils", () => {
  it("rougit sur un témoin fabriqué portant un doublon et une majuscule", () => {
    const temoin: readonly Profil[] = [
      { nom: "dev", libelle: "a", depuis: "1.0.0" },
      { nom: "dev", libelle: "b", depuis: "1.0.0" },
      { nom: "Admin", libelle: "c", depuis: "1.0.0" },
    ];

    const verdict = verifierTableProfils(temoin);

    expect(verdict.mesures).toBe(3);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("rougit sur un témoin fabriqué de SEPT profils — le plafond mord", () => {
    const temoin: readonly Profil[] = Array.from({ length: PLAFOND_PROFILS + 1 }, (_, index) => ({
      nom: `p${String(index)}`,
      libelle: "témoin",
      depuis: "1.0.0",
    }));

    const verdict = verifierTableProfils(temoin);

    console.info(`[garde plafond profils] ${String(verdict.mesures)} profils témoins mesurés`);
    expect(verdict.mesures).toBe(PLAFOND_PROFILS + 1);
    expect(verdict.anomalies.join(" | ")).toContain(String(PLAFOND_PROFILS));
  });

  it("mesure les quatre profils réels, tous bien formés et sous le plafond", () => {
    const verdict = verifierTableProfils(PROFILES);

    console.info(
      `[garde table profils] ${String(verdict.mesures)} profils mesurés, ` +
        `plafond ${String(PLAFOND_PROFILS)}, énumération ${PROFILES_VERSION}`,
    );

    expect(verdict.anomalies).toEqual([]);
    // Plancher-témoin : zéro profil mesuré serait vert sans rien avoir regardé.
    expect(verdict.mesures).toBeGreaterThanOrEqual(1);
    // TÉMOIN DU CDC — § 02 et § 14 en nomment QUATRE. Ce n'est pas une
    // dérivation : c'est le point où un ajout de profil devient une DÉCISION
    // visible en revue, et non un accident de fusion.
    expect(verdict.mesures).toBe(4);
    expect([...PROFILE_NAMES].sort()).toEqual(["admin", "audit", "courrier", "dev"]);
  });

  it("dérive PROFILE_NAMES de PROFILES — aucune liste écrite à la main", () => {
    expect(PROFILE_NAMES).toEqual(PROFILES.map((profil) => profil.nom));
    expect(PROFILE_NAMES).toHaveLength(PROFILES.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — la fermeture au RUNTIME : ce qui vient d'ailleurs
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles — estProfil ferme la porte à ce qui n'est pas typé", () => {
  it("rougit sur des témoins fabriqués — casse, espace, voisin sémantique, vide", () => {
    const temoins: readonly unknown[] = [
      "DEV",
      " dev",
      "dev ",
      "facturation",
      "développement",
      "",
      null,
      undefined,
      42,
      ["dev"],
      { nom: "dev" },
    ];

    let mesures = 0;
    for (const temoin of temoins) {
      expect(estProfil(temoin), `témoin n°${String(mesures)}`).toBe(false);
      mesures += 1;
    }

    console.info(`[garde estProfil] ${String(mesures)} témoins refusés`);
    expect(mesures).toBe(temoins.length);
    expect(mesures).toBeGreaterThanOrEqual(11);
  });

  it("accepte les quatre profils réels — liste DÉRIVÉE de l'énumération", () => {
    let mesures = 0;
    for (const nom of PROFILE_NAMES) {
      expect(estProfil(nom), nom).toBe(true);
      expect(exigerProfil(nom, "test"), nom).toBe(nom);
      mesures += 1;
    }

    console.info(`[garde estProfil] ${String(mesures)} profils réels acceptés`);
    expect(mesures).toBe(PROFILE_NAMES.length);
    expect(mesures).toBeGreaterThanOrEqual(4);
  });

  it("fait dire à exigerProfil le profil fautif ET les profils connus (§ 15)", () => {
    let message = "";
    try {
      exigerProfil("facturation", "ops_runtime.activeProfile");
    } catch (erreur: unknown) {
      message = erreur instanceof Error ? erreur.message : String(erreur);
    }

    // § 15, deuxième règle : une erreur dit toujours ce qu'il faut faire ensuite.
    expect(message).toContain("facturation");
    expect(message).toContain("ops_runtime.activeProfile");
    for (const nom of PROFILE_NAMES) {
      expect(message, nom).toContain(nom);
    }
  });

  it("trie une liste venue du dehors en annonçant les deux comptes", () => {
    const brut: readonly unknown[] = ["dev", "facturation", "admin", 7, null];
    const verdict = trierProfils(brut);

    console.info(
      `[garde trierProfils] ${String(verdict.mesures)} valeurs mesurées, ` +
        `${String(verdict.connus.length)} connues, ${String(verdict.inconnus.length)} inconnues`,
    );

    expect(verdict.mesures).toBe(brut.length);
    expect(verdict.connus).toEqual(["dev", "admin"]);
    expect(verdict.inconnus).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — la fermeture à la COMPILATION (vérifiée par `pnpm typecheck`)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles — un profil inconnu ne compile pas", () => {
  it("accepte une déclaration de profils connus, et rend les littéraux exacts", () => {
    const declares = declarerProfils(["dev", "admin"]);

    expect(declares).toEqual(["dev", "admin"]);

    // Le type de retour porte les littéraux EXACTS, ce dont le manifeste a
    // besoin : `readonly ["dev", "admin"]`, pas `string[]`.
    const premier: "dev" = declares[0];
    expect(premier).toBe("dev");
  });

  it("refuse à la COMPILATION un profil inventé, une casse fautive, une liste vide", () => {
    // ═══ LA GARDE DU § 14, DANS SA FORME EXACTE ═══
    //
    // Chaque `@ts-expect-error` ci-dessous est une assertion INVERSÉE : `tsc`
    // échoue si l'erreur attendue NE SE PRODUIT PLUS. Rouvrir l'énumération
    // — élargir `ProfileName` en `string`, retirer le tuple non vide — fait donc
    // rougir `pnpm typecheck`, et non `pnpm test`.
    //
    // Vérifié à la main : en remplaçant `ProfileName` par `string`, `tsc`
    // signale « Unused '@ts-expect-error' directive » sur chacune de ces lignes.

    // @ts-expect-error — « facturation » n'appartient pas à l'énumération fermée
    const invente = declarerProfils(["facturation"]);

    // @ts-expect-error — la casse compte : « Dev » n'est pas « dev »
    const casse = declarerProfils(["Dev"]);

    // @ts-expect-error — un adaptateur rattaché à AUCUN profil n'est servi nulle part
    const vide = declarerProfils([]);

    // @ts-expect-error — un seul intrus dans une liste par ailleurs valide suffit
    const melange = declarerProfils(["dev", "facturation"]);

    // Au runtime la fonction ne fait rien d'autre que rendre son argument :
    // c'est le COMPILATEUR qui est la garde. On mesure quand même les quatre
    // témoins, pour qu'aucun ne disparaisse en silence d'un fichier de test.
    const temoins = [invente, casse, vide, melange];
    console.info(`[garde fermeture] ${String(temoins.length)} témoins de non-compilation posés`);
    expect(temoins).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — l'empreinte de l'énumération bouge quand l'énumération bouge
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles — l'empreinte détecte une énumération divergente", () => {
  it("rougit sur des témoins fabriqués : ajout, retrait, renommage, version", () => {
    const reference = empreinteProfils();

    const temoins: ReadonlyArray<readonly [string, readonly Profil[], string]> = [
      [
        "ajout",
        [...PROFILES, { nom: "facturation", libelle: "témoin", depuis: "1.1.0" }],
        PROFILES_VERSION,
      ],
      ["retrait", PROFILES.slice(1), PROFILES_VERSION],
      [
        "renommage",
        PROFILES.map((profil, index) => (index === 0 ? { ...profil, nom: "courrier-2" } : profil)),
        PROFILES_VERSION,
      ],
      ["version", PROFILES, "1.1.0"],
    ];

    let mesures = 0;
    for (const [nom, profils, version] of temoins) {
      expect(empreinteProfils(profils, version), nom).not.toBe(reference);
      mesures += 1;
    }

    console.info(`[garde empreinte] ${String(mesures)} divergences mesurées`);
    expect(mesures).toBe(temoins.length);
    expect(mesures).toBeGreaterThanOrEqual(4);
  });

  it("ne bouge PAS pour une reformulation de libellé — de la prose d'écran", () => {
    const reformule = PROFILES.map((profil) => ({ ...profil, libelle: `${profil.libelle} (bis)` }));

    expect(empreinteProfils(reformule)).toBe(empreinteProfils());
  });

  it("rend une empreinte SHA-256 stable d'un appel à l'autre", () => {
    const empreinte = empreinteProfils();

    console.info(`[garde empreinte] énumération ${PROFILES_VERSION} → ${empreinte.slice(0, 16)}…`);

    expect(empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinteProfils()).toBe(empreinte);
  });
});

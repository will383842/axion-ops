import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../types.js";
import { PLAFOND_PROFILS, PROFILES, PROFILE_NAMES } from "./profiles.js";
import {
  CIBLE_TOKENS_DEFINITIONS,
  CODE_REFUS_PROFIL,
  ETAPE_REFUS_PROFIL,
  PLAFOND_OCTETS_DEFINITIONS,
  PLAFOND_OUTILS_PAR_PROFIL,
  RATIO_OCTETS_PAR_TOKEN_PROVISOIRE,
  estServi,
  mesurerBudgetProfil,
  mesurerTousLesProfils,
  octetsDeLaDefinition,
  outilsServis,
  plafondOctetsDepuisRatio,
  profilLeMoinsExposant,
  reduitStrictement,
  verifierNombreDeProfils,
  type DefinitionOutil,
} from "./budget.js";

/**
 * Gardes du BUDGET D'OUTILS (§ 14).
 *
 * Motif de la Fondation, copié : chaque garde (a) rougit d'abord sur un TÉMOIN
 * FABRIQUÉ, (b) ANNONCE combien d'éléments elle a mesurés, avec un plancher.
 *
 * Toutes les définitions d'outils de ce fichier sont FABRIQUÉES. Aucune n'est
 * lue sur disque ni en base : le § 14 exige que cette garde morde SANS dépendre
 * d'un adaptateur.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Fabrique de témoins
// ─────────────────────────────────────────────────────────────────────────────

function outil(
  nom: string,
  parametres: Partial<Omit<DefinitionOutil, "name">> = {},
): DefinitionOutil {
  return {
    name: nom,
    version: parametres.version ?? "1.0.0",
    description: parametres.description ?? "d",
    inputSchema: parametres.inputSchema ?? {},
    outputSchema: parametres.outputSchema ?? {},
    profiles: parametres.profiles ?? ["dev"],
    enabled: parametres.enabled ?? true,
    retireDeLaListe: parametres.retireDeLaListe ?? false,
  };
}

/** `combien` outils servis dans `dev`, tous minuscules pour ne pas peser. */
function outils(combien: number): readonly DefinitionOutil[] {
  return Array.from({ length: combien }, (_, index) =>
    outil(`t.${String(index).padStart(3, "0")}`),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le plafond de 40 outils SERVIS
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — le plafond de 40 outils servis", () => {
  it("laisse passer exactement 40 outils, et le verdict DIT le compte", () => {
    const verdict = mesurerBudgetProfil("dev", outils(PLAFOND_OUTILS_PAR_PROFIL));

    console.info(
      `[garde budget 40] profil « dev » : ${String(verdict.outilsComptes)} outils comptés ` +
        `sur ${String(verdict.outilsExamines)} examinés, ${String(verdict.octetsMesures)} octets`,
    );

    expect(verdict.outilsComptes).toBe(40);
    expect(verdict.outilsExamines).toBe(40);
    expect(verdict.mesureAveugle).toBe(false);
    expect(verdict.depasse).toBe(false);
    expect(verdict.anomalies).toEqual([]);
  });

  it("refuse 41 outils, et le MESSAGE dit 41 et 40 — jamais un simple booléen", () => {
    const verdict = mesurerBudgetProfil("dev", outils(PLAFOND_OUTILS_PAR_PROFIL + 1));

    console.info(
      `[garde budget 41] profil « dev » : ${String(verdict.outilsComptes)} outils comptés, ` +
        `plafond ${String(verdict.plafondOutils)}`,
    );

    expect(verdict.depasse).toBe(true);
    expect(verdict.outilsComptes).toBe(41);

    const anomalie = verdict.anomalies.find((candidate) => candidate.regle === "outils");
    expect(anomalie).toBeDefined();
    expect(anomalie?.mesure).toBe(41);
    expect(anomalie?.plafond).toBe(40);
    // Le § 15 exige que l'erreur dise ce qu'il faut faire ensuite. Un message
    // qui ne porte pas le NOMBRE COMPTÉ ne le dit pas.
    expect(anomalie?.message).toContain("41");
    expect(anomalie?.message).toContain("40");
    expect(anomalie?.message).toContain("dev");
  });

  it("compte l'onzième outil témoin du lot 1 quand le plafond est abaissé", () => {
    // § 33, critère du lot 1 : « la garde de budget annonce le nombre de
    // manifestes lus et UN ONZIÈME OUTIL TÉMOIN LA FAIT ROUGIR ». Le régime réel
    // — neuf outils au § 27, neuf au § 28 — n'atteint jamais 40 : sans plafond
    // abaissé, la garde ne peut pas rougir sur des données vraies.
    const dix = mesurerBudgetProfil("dev", outils(10), { plafondOutils: 10 });
    const onze = mesurerBudgetProfil("dev", outils(11), { plafondOutils: 10 });

    console.info(
      `[garde onzième outil] ${String(dix.outilsComptes)} → vert, ` +
        `${String(onze.outilsComptes)} → rouge`,
    );

    expect(dix.depasse).toBe(false);
    expect(onze.depasse).toBe(true);
    expect(onze.anomalies.map((anomalie) => anomalie.mesure)).toContain(11);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — mesurer la liste SERVIE, pas la liste déclarée (correction 3)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — la liste SERVIE, pas la liste déclarée", () => {
  it("écarte l'outil désactivé, le sorti de tools/list et celui d'un autre profil", () => {
    const jeu: readonly DefinitionOutil[] = [
      outil("a.servi"),
      outil("a.desactive", { enabled: false }),
      outil("a.retire", { retireDeLaListe: true }),
      outil("a.ailleurs", { profiles: ["audit"] }),
    ];

    const verdict = mesurerBudgetProfil("dev", jeu);

    console.info(
      `[garde liste servie] ${String(verdict.outilsExamines)} définitions examinées, ` +
        `${String(verdict.outilsComptes)} servies dans « dev »`,
    );

    expect(verdict.outilsExamines).toBe(4);
    expect(verdict.outilsComptes).toBe(1);
    expect(outilsServis(jeu, "dev").map((defn) => defn.name)).toEqual(["a.servi"]);

    // Les trois écartés le sont chacun pour SA raison — un seul test qui
    // vérifierait le total laisserait passer une règle muette.
    expect(estServi(jeu[0] as DefinitionOutil, "dev")).toBe(true);
    expect(estServi(jeu[1] as DefinitionOutil, "dev")).toBe(false);
    expect(estServi(jeu[2] as DefinitionOutil, "dev")).toBe(false);
    expect(estServi(jeu[3] as DefinitionOutil, "dev")).toBe(false);
    expect(estServi(jeu[3] as DefinitionOutil, "audit")).toBe(true);
  });

  it("rougit sur un témoin fabriqué : 41 outils DÉCLARÉS mais 40 servis passent", () => {
    // Le témoin prouve que la distinction porte. Si le module comptait la liste
    // déclarée, ce cas serait rouge — et il doit être vert.
    const jeu = [...outils(40), outil("t.999", { enabled: false })];

    const verdict = mesurerBudgetProfil("dev", jeu);

    expect(verdict.outilsExamines).toBe(41);
    expect(verdict.outilsComptes).toBe(40);
    expect(verdict.depasse).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — le plafond en OCTETS
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — le plafond en octets UTF-8 du JSON canonique", () => {
  it("dérive le plafond de la cible en tokens et du ratio, sans nombre magique", () => {
    console.info(
      `[garde plafond octets] ${String(CIBLE_TOKENS_DEFINITIONS)} tokens × ` +
        `${String(RATIO_OCTETS_PAR_TOKEN_PROVISOIRE)} octets/token = ` +
        `${String(PLAFOND_OCTETS_DEFINITIONS)} octets`,
    );

    expect(PLAFOND_OCTETS_DEFINITIONS).toBe(
      plafondOctetsDepuisRatio(RATIO_OCTETS_PAR_TOKEN_PROVISOIRE),
    );
    // M5 changera le ratio, pas ce test : le plafond suit.
    expect(plafondOctetsDepuisRatio(4)).toBe(CIBLE_TOKENS_DEFINITIONS * 4);
    expect(() => plafondOctetsDepuisRatio(0)).toThrow();
    expect(() => plafondOctetsDepuisRatio(Number.NaN)).toThrow();
  });

  it("rougit sur un témoin fabriqué : une seule description obèse suffit", () => {
    const obese = outil("a.obese", { description: "x".repeat(PLAFOND_OCTETS_DEFINITIONS) });
    const verdict = mesurerBudgetProfil("dev", [obese]);

    const anomalie = verdict.anomalies.find((candidate) => candidate.regle === "octets");

    console.info(
      `[garde octets] 1 outil témoin, ${String(verdict.octetsMesures)} octets mesurés, ` +
        `plafond ${String(verdict.plafondOctets)}`,
    );

    expect(verdict.depasse).toBe(true);
    expect(anomalie).toBeDefined();
    expect(anomalie?.mesure).toBe(verdict.octetsMesures);
    expect(anomalie?.message).toContain(String(verdict.octetsMesures));
    // Le message NOMME le plus lourd : sans lui, « trop gros » n'aide personne.
    expect(anomalie?.message).toContain("a.obese");
    expect(anomalie?.message).toContain("M5");
  });

  it("mesure en OCTETS et non en unités UTF-16 — l'accent pèse", () => {
    const ascii = mesurerBudgetProfil("dev", [outil("a.x", { description: "eee" })]);
    const accentue = mesurerBudgetProfil("dev", [outil("a.x", { description: "ééé" })]);

    console.info(
      `[garde octets accentués] ${String(ascii.octetsMesures)} → ` +
        `${String(accentue.octetsMesures)} octets`,
    );

    expect(accentue.octetsMesures).toBe(ascii.octetsMesures + 3);
  });

  it("ne dépend pas de l'ordre des clés d'un schéma — la mesure est canonique", () => {
    const gauche = outil("a.x", {
      inputSchema: { type: "object", additionalProperties: false, properties: { b: 1, a: 2 } },
    });
    const droite = outil("a.x", {
      inputSchema: { properties: { a: 2, b: 1 }, additionalProperties: false, type: "object" },
    });

    expect(octetsDeLaDefinition(gauche)).toBe(octetsDeLaDefinition(droite));
    expect(mesurerBudgetProfil("dev", [gauche]).octetsMesures).toBe(
      mesurerBudgetProfil("dev", [droite]).octetsMesures,
    );
  });

  it("ne dépend pas de l'ordre de la liste servie — les outils sont triés", () => {
    const a = outil("a.un");
    const b = outil("b.deux");

    expect(mesurerBudgetProfil("dev", [a, b]).octetsMesures).toBe(
      mesurerBudgetProfil("dev", [b, a]).octetsMesures,
    );
    expect(mesurerBudgetProfil("dev", [b, a]).poids).toHaveLength(2);
  });

  it("mesure la LISTE, séparateurs compris — pas la somme des définitions", () => {
    // Un test qui vérifierait la somme laisserait filer crochets et virgules :
    // 40 outils, c'est 41 octets de séparateurs qui partent bel et bien sur le fil.
    const jeu = outils(3);
    const verdict = mesurerBudgetProfil("dev", jeu);
    const somme = verdict.poids.reduce((total, poids) => total + poids.octets, 0);

    console.info(
      `[garde liste vs somme] liste ${String(verdict.octetsMesures)} octets, ` +
        `somme des définitions ${String(somme)} octets`,
    );

    // 3 définitions → 2 virgules + 2 crochets = 4 octets de plus.
    expect(verdict.octetsMesures).toBe(somme + 4);
    expect(verdict.poids).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — une mesure qui porte sur zéro élément le DIT
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — une garde qui mesure zéro est verte pour la pire des raisons", () => {
  it("marque « mesure aveugle » quand aucune définition n'a été soumise", () => {
    const verdict = mesurerBudgetProfil("dev", []);

    console.info(
      `[garde plancher] ${String(verdict.outilsExamines)} définitions examinées → ` +
        `mesureAveugle=${String(verdict.mesureAveugle)}`,
    );

    expect(verdict.outilsExamines).toBe(0);
    expect(verdict.outilsComptes).toBe(0);
    expect(verdict.mesureAveugle).toBe(true);
    // Ce n'est pas un dépassement de PLAFOND : conflater les deux refuserait des
    // appels à l'étape 7 pendant qu'un registre se remplit.
    expect(verdict.depasse).toBe(false);
    expect(verdict.anomalies.map((anomalie) => anomalie.regle)).toContain("mesure-aveugle");
  });

  it("honore un plancher-témoin plus haut, celui d'adapters.lock.json", () => {
    const verdict = mesurerBudgetProfil("dev", outils(5), { plancherOutilsExamines: 18 });

    console.info(
      `[garde plancher] ${String(verdict.outilsExamines)} examinées, plancher 18 → ` +
        `mesureAveugle=${String(verdict.mesureAveugle)}`,
    );

    expect(verdict.mesureAveugle).toBe(true);
    const anomalie = verdict.anomalies.find((candidate) => candidate.regle === "mesure-aveugle");
    expect(anomalie?.mesure).toBe(5);
    expect(anomalie?.plafond).toBe(18);
    expect(anomalie?.message).toContain("5");
    expect(anomalie?.message).toContain("18");
  });

  it("ne marque rien quand la mesure atteint son plancher", () => {
    expect(
      mesurerBudgetProfil("dev", outils(18), { plancherOutilsExamines: 18 }).mesureAveugle,
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — l'étape et le code de refus sont DÉRIVÉS du § 11
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — l'étape de refus est dérivée, pas recopiée", () => {
  it("tire son numéro et son code de APPEL_STEPS, pas d'un littéral", () => {
    const etape = APPEL_STEPS.find((candidate) => candidate.cle === "profil");

    console.info(
      `[garde étape] refus à l'étape ${String(ETAPE_REFUS_PROFIL)} → ${CODE_REFUS_PROFIL}`,
    );

    expect(etape).toBeDefined();
    expect(ETAPE_REFUS_PROFIL).toBe(etape?.numero);
    expect(CODE_REFUS_PROFIL).toBe(etape?.refus);

    // TÉMOIN DU CDC : le § 11 met le profil en 7 et le § 15 lui donne
    // `tool_not_in_profile`. Si la chaîne d'appel bouge, la dérivation suit
    // et c'est CE témoin qui rougit — ce qui doit être une décision, pas un
    // effet de bord.
    expect(ETAPE_REFUS_PROFIL).toBe(7);
    expect(CODE_REFUS_PROFIL).toBe("tool_not_in_profile");
  });

  it("porte l'étape et le code dans CHAQUE verdict, refus ou non", () => {
    let mesures = 0;
    for (const profil of PROFILE_NAMES) {
      const verdict = mesurerBudgetProfil(profil, outils(1));
      expect(verdict.etapeDeRefus, profil).toBe(ETAPE_REFUS_PROFIL);
      expect(verdict.codeDeRefus, profil).toBe(CODE_REFUS_PROFIL);
      mesures += 1;
    }

    console.info(`[garde étape] ${String(mesures)} verdicts porteurs de l'étape de refus`);
    expect(mesures).toBe(PROFILE_NAMES.length);
    expect(mesures).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 6 — la mesure globale couvre TOUS les profils
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — la mesure globale", () => {
  it("rend un verdict par profil, dérivé de l'énumération", () => {
    const global = mesurerTousLesProfils(outils(2));

    console.info(
      `[garde globale] ${String(global.profilsMesures)} profils mesurés, ` +
        `${String(global.outilsExamines)} définitions examinées`,
    );

    expect(global.profilsMesures).toBe(PROFILE_NAMES.length);
    expect(global.verdicts).toHaveLength(PROFILE_NAMES.length);
    expect(global.verdicts.map((verdict) => verdict.profil)).toEqual([...PROFILE_NAMES]);
    // Plancher-témoin : zéro profil mesuré serait vert sans rien avoir regardé.
    expect(global.profilsMesures).toBeGreaterThanOrEqual(4);
    expect(global.depasse).toBe(false);
  });

  it("remonte le dépassement d'UN seul profil au verdict global", () => {
    const jeu = [...outils(41).map((defn) => ({ ...defn, profiles: ["admin"] as const }))];
    const global = mesurerTousLesProfils(jeu);

    console.info(
      `[garde globale] ${String(global.anomalies.length)} anomalies sur ` +
        `${String(global.profilsMesures)} profils`,
    );

    expect(global.depasse).toBe(true);
    expect(global.anomalies.some((anomalie) => anomalie.message.includes("admin"))).toBe(true);
  });

  it("rougit sur un témoin fabriqué de SEPT profils — la règle du NOMBRE mord", () => {
    // TÉMOIN DÉCISIF. La règle du nombre de profils comparait la constante de
    // module `PROFILES.length` au plafond, EN LIGNE dans `mesurerTousLesProfils`.
    // Aucun appelant ne pouvait donc lui soumettre autre chose que les quatre
    // profils réels : elle était structurellement INFAILLIBLE, et le seul test
    // qui la visait prouvait uniquement qu'elle NE se déclenche PAS. Le témoin à
    // sept profils de `profiles.spec.ts` exerce, lui, une réimplémentation
    // écrite dans le test — il ne dit rien de CE code-ci.
    const anomalie = verifierNombreDeProfils(PLAFOND_PROFILS + 1);

    console.info(
      `[garde nombre de profils] témoin à ${String(PLAFOND_PROFILS + 1)} profils, ` +
        `plafond ${String(PLAFOND_PROFILS)} → ${anomalie === null ? "AUCUNE" : "1"} anomalie`,
    );

    expect(anomalie).not.toBeNull();
    expect(anomalie?.regle).toBe("profils");
    // Le verdict rend le NOMBRE mesuré et le plafond, jamais un booléen (§ 14).
    expect(anomalie?.mesure).toBe(PLAFOND_PROFILS + 1);
    expect(anomalie?.plafond).toBe(PLAFOND_PROFILS);
    expect(anomalie?.message).toContain(String(PLAFOND_PROFILS + 1));

    // La borne exacte : le plafond lui-même passe, un de plus refuse.
    expect(verifierNombreDeProfils(PLAFOND_PROFILS)).toBeNull();
  });

  it("tient le plafond du NOMBRE de profils sous les six admis", () => {
    console.info(
      `[garde nombre de profils] ${String(PROFILES.length)} profils déclarés, ` +
        `plafond ${String(PLAFOND_PROFILS)}`,
    );

    expect(PROFILES.length).toBeLessThanOrEqual(PLAFOND_PROFILS);
    expect(mesurerTousLesProfils(outils(1)).anomalies.map((a) => a.regle)).not.toContain("profils");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 7 — « réduit strictement » (§ 20)
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — réduit strictement la surface exposée", () => {
  it("rougit sur un témoin fabriqué : deux profils de MÊME taille, outils disjoints", () => {
    // C'est le piège que la comparaison de COMPTES laisserait passer : passer de
    // « courrier » à « dev » n'enlève rien de la surface, il la remplace
    // entièrement — donc facteur TOTP, TTL, ligne au journal.
    const jeu: readonly DefinitionOutil[] = [
      outil("c.un", { profiles: ["courrier"] }),
      outil("c.deux", { profiles: ["courrier"] }),
      outil("d.un", { profiles: ["dev"] }),
      outil("d.deux", { profiles: ["dev"] }),
    ];

    const verdict = reduitStrictement("courrier", "dev", jeu);

    console.info(
      `[garde réduction] ${String(verdict.avant)} → ${String(verdict.apres)} outils, ` +
        `${String(verdict.gagnes.length)} gagnés, ${String(verdict.perdus.length)} perdus`,
    );

    expect(verdict.avant).toBe(verdict.apres);
    expect(verdict.reduitStrictement).toBe(false);
    expect(verdict.gagnes).toEqual(["d.deux", "d.un"]);
  });

  it("admet une réduction stricte : sous-ensemble propre", () => {
    const jeu: readonly DefinitionOutil[] = [
      outil("x.un", { profiles: ["courrier", "audit"] }),
      outil("x.deux", { profiles: ["courrier"] }),
    ];

    const verdict = reduitStrictement("courrier", "audit", jeu);

    expect(verdict.reduitStrictement).toBe(true);
    expect(verdict.gagnes).toEqual([]);
    expect(verdict.perdus).toEqual(["x.deux"]);
  });

  it("refuse le cas « rien ne change » — ne rien retirer n'est pas réduire", () => {
    const jeu: readonly DefinitionOutil[] = [outil("y.un", { profiles: ["dev", "admin"] })];

    const verdict = reduitStrictement("dev", "admin", jeu);

    expect(verdict.reduitStrictement).toBe(false);
    expect(verdict.gagnes).toEqual([]);
    expect(verdict.perdus).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 8 — le profil de repli est DÉRIVÉ de la surface servie
// ─────────────────────────────────────────────────────────────────────────────

describe("core/profiles/budget — le profil de repli", () => {
  it("élit le profil qui expose le moins d'outils, et annonce les deux comptes", () => {
    const jeu: readonly DefinitionOutil[] = [
      outil("a.un", { profiles: ["dev", "admin", "courrier"] }),
      outil("a.deux", { profiles: ["dev", "admin"] }),
      outil("a.trois", { profiles: ["dev"] }),
    ];

    const repli = profilLeMoinsExposant(jeu);

    console.info(
      `[garde repli] profil « ${repli.profil} » à ${String(repli.outilsComptes)} outils, ` +
        `sur ${String(repli.outilsExamines)} définitions examinées`,
    );

    // « audit » n'expose rien dans ce jeu : c'est le moins exposant.
    expect(repli.profil).toBe("audit");
    expect(repli.outilsComptes).toBe(0);
    expect(repli.outilsExamines).toBe(3);
  });

  it("départage une égalité par l'ordre de l'énumération, de façon déterministe", () => {
    const repli = profilLeMoinsExposant([]);

    expect(repli.profil).toBe(PROFILE_NAMES[0]);
    expect(profilLeMoinsExposant([]).profil).toBe(repli.profil);
  });
});

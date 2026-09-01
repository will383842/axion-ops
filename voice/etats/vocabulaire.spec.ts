import { describe, expect, it } from "vitest";

import {
  EFFETS_SUR_LA_SURFACE,
  ETATS_ENGAGES,
  ETATS_OUVERTS,
  ETATS_VOCAUX,
  ETAT_AU_REPOS,
  ETAT_LE_PLUS_FERME,
  GESTES_QUI_ELARGISSENT,
  GESTES_VOCAUX,
  NATURES_GESTE,
  NOMS_GESTES,
  PROVENANCES_FACTEUR,
  PROVENANCE_PROBANTE,
  decrireGeste,
  exigeFenetreDeverrouillee,
  exigeSecondFacteur,
  facteurProbant,
  fenetreOuverte,
  rangEffet,
  rangEtatVocal,
  type DescriptionGeste,
  type EffetSurLaSurface,
  type GesteVocal,
  type NatureGeste,
} from "./vocabulaire.js";

/**
 * Gardes du vocabulaire — § 18, § 20, § 30.
 *
 * La garde centrale de ce fichier est la DÉRIVATION : les deux obligations —
 * second facteur, fenêtre déverrouillée — sont confrontées sur le produit
 * cartésien (nature × effet), pas sur les quinze gestes réels. Un seizième
 * geste ne peut donc pas naître dans un angle mort.
 */

interface Verdict {
  readonly mesures: number;
  readonly anomalies: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — l'ordre des tableaux, dont tout le reste dérive
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/vocabulaire — l'ordre est signifiant", () => {
  it("dérive l'état le plus fermé, le repos, les ouverts et les engagés", () => {
    expect(ETAT_LE_PLUS_FERME).toBe(ETATS_VOCAUX[0]);
    expect(fenetreOuverte(ETAT_LE_PLUS_FERME)).toBe(false);

    // Un seul état ferme la fenêtre : s'il y en avait deux, `ETATS_OUVERTS`
    // serait juste et `ETAT_LE_PLUS_FERME` mentirait.
    const fermes = ETATS_VOCAUX.filter((etat) => !fenetreOuverte(etat));

    console.info(
      `[garde ordre] ${String(ETATS_VOCAUX.length)} états mesurés — ` +
        `${String(fermes.length)} fermé, ${String(ETATS_OUVERTS.length)} ouverts, ` +
        `${String(ETATS_ENGAGES.length)} engagés`,
    );

    expect(ETATS_VOCAUX.length).toBe(7);
    expect(fermes).toEqual([ETAT_LE_PLUS_FERME]);
    expect(ETATS_OUVERTS.length).toBe(6);
    expect(ETAT_AU_REPOS).toBe(ETATS_OUVERTS[0]);
    expect(ETATS_ENGAGES.length).toBe(5);
    expect(ETATS_ENGAGES).not.toContain(ETAT_AU_REPOS);
    expect(ETATS_ENGAGES).not.toContain(ETAT_LE_PLUS_FERME);
  });

  it("range les états et les effets sans trou ni doublon", () => {
    let mesures = 0;
    for (const [index, etat] of ETATS_VOCAUX.entries()) {
      expect(rangEtatVocal(etat), etat).toBe(index);
      mesures += 1;
    }
    for (const [index, effet] of EFFETS_SUR_LA_SURFACE.entries()) {
      expect(rangEffet(effet), effet).toBe(index);
      mesures += 1;
    }

    console.info(`[garde rangs] ${String(mesures)} rangs mesurés`);
    expect(mesures).toBe(ETATS_VOCAUX.length + EFFETS_SUR_LA_SURFACE.length);
    expect(new Set(ETATS_VOCAUX).size).toBe(ETATS_VOCAUX.length);
    expect(new Set(EFFETS_SUR_LA_SURFACE).size).toBe(EFFETS_SUR_LA_SURFACE.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — § 18 : le micro n'authentifie personne
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/vocabulaire — ce qui compte comme facteur", () => {
  it("ne reconnaît QU'UNE provenance probante, et ce n'est ni la voix ni le démon", () => {
    // § 18 : « le micro n'authentifie personne ».
    // § 20 : « ni l'élicitation MCP, ni une réponse produite par le démon vocal
    //         ne comptent comme confirmation humaine ».
    let mesures = 0;
    const probantes: string[] = [];

    for (const provenance of PROVENANCES_FACTEUR) {
      if (facteurProbant(provenance)) {
        probantes.push(provenance);
      }
      mesures += 1;
    }

    // Et l'absence de facteur ne prouve rien non plus.
    expect(facteurProbant(null)).toBe(false);
    mesures += 1;

    console.info(
      `[garde provenances] ${String(mesures)} provenances mesurées — ` +
        `${String(probantes.length)} probante(s) : ${probantes.join(", ")}`,
    );

    expect(mesures).toBe(PROVENANCES_FACTEUR.length + 1);
    expect(mesures).toBe(4);
    expect(probantes).toEqual(["hors-bande"]);
    expect(facteurProbant("voix")).toBe(false);
    expect(facteurProbant("démon")).toBe(false);
  });

  it("dérive la provenance probante de la QUEUE du tableau", () => {
    // Sans cette garde, réordonner `PROVENANCES_FACTEUR` déplacerait
    // silencieusement ce qui prouve — et « voix » pourrait devenir probante
    // sans qu'une seule ligne de logique change.
    expect(PROVENANCE_PROBANTE).toBe(PROVENANCES_FACTEUR[PROVENANCES_FACTEUR.length - 1]);
    expect(PROVENANCE_PROBANTE).toBe("hors-bande");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — LES DEUX OBLIGATIONS, SUR LE PRODUIT (nature × effet)
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/etats/vocabulaire — les obligations sont CALCULÉES", () => {
  it("confronte les neuf combinaisons (nature × effet) à la règle du § 20", () => {
    // La table attendue est écrite ici, à la main, EXPRÈS : c'est la
    // spécification. La dérivation, elle, est dans `vocabulaire.ts`. Si les
    // deux se rejoignent, la règle tient ; si l'une bouge, l'autre rougit.
    const attendu: Record<NatureGeste, Record<EffetSurLaSurface, [boolean, boolean]>> = {
      // [ exige un second facteur, exige la fenêtre déverrouillée ]
      conduite: {
        réduit: [false, false],
        neutre: [false, false],
        // Un geste de conduite qui élargirait n'existe pas — et s'il naissait,
        // il n'aurait toujours personne à qui demander un facteur : la
        // mécanique du démon n'a pas de mains. C'est un écart signalé, pas un
        // trou comblé.
        élargit: [false, false],
      },
      "commande-hors-modèle": {
        réduit: [false, false],
        // § 20 lu à la lettre : n'est admis sans facteur que ce qui RÉDUIT
        // STRICTEMENT. Un `neutre` demandé exigerait donc le facteur.
        neutre: [true, false],
        élargit: [true, true],
      },
      "hors-bande": {
        réduit: [false, false],
        neutre: [true, false],
        // `déverrouiller` : facteur oui, fenêtre non — il EST ce qui la rouvre.
        élargit: [true, false],
      },
    };

    let mesures = 0;
    for (const nature of NATURES_GESTE) {
      for (const effet of EFFETS_SUR_LA_SURFACE) {
        const temoin: DescriptionGeste = { nom: "témoin", nature, effet, motif: "fabriqué" };
        const [facteur, fenetre] = attendu[nature][effet];

        expect(exigeSecondFacteur(temoin), `${nature} × ${effet} — facteur`).toBe(facteur);
        expect(exigeFenetreDeverrouillee(temoin), `${nature} × ${effet} — fenêtre`).toBe(fenetre);
        mesures += 1;
      }
    }

    console.info(`[garde obligations] ${String(mesures)} combinaisons (nature × effet) mesurées`);

    expect(mesures).toBe(NATURES_GESTE.length * EFFETS_SUR_LA_SURFACE.length);
    expect(mesures).toBe(9);
  });

  it("n'exige jamais la fenêtre sans exiger aussi le facteur", () => {
    // L'inverse serait un geste qui élargit derrière une fenêtre ouverte, mais
    // que personne n'a jamais eu à prouver. Vérifié sur les neuf combinaisons,
    // pas sur les quinze gestes.
    let mesures = 0;
    let violations = 0;

    for (const nature of NATURES_GESTE) {
      for (const effet of EFFETS_SUR_LA_SURFACE) {
        const temoin: DescriptionGeste = { nom: "témoin", nature, effet, motif: "fabriqué" };
        if (exigeFenetreDeverrouillee(temoin) && !exigeSecondFacteur(temoin)) {
          violations += 1;
        }
        mesures += 1;
      }
    }

    console.info(
      `[garde implication] ${String(mesures)} combinaisons mesurées — ${String(violations)} violations`,
    );

    expect(mesures).toBe(9);
    expect(violations).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — le catalogue est bien formé
// ─────────────────────────────────────────────────────────────────────────────

function verifierCatalogue(catalogue: readonly DescriptionGeste[]): Verdict {
  const anomalies: string[] = [];
  const vus = new Set<string>();

  for (const geste of catalogue) {
    if (vus.has(geste.nom)) {
      anomalies.push(`geste « ${geste.nom} » en double`);
    }
    vus.add(geste.nom);

    if (!NATURES_GESTE.includes(geste.nature)) {
      anomalies.push(`nature inconnue « ${geste.nature} » sur « ${geste.nom} »`);
    }
    if (!EFFETS_SUR_LA_SURFACE.includes(geste.effet)) {
      anomalies.push(`effet inconnu « ${geste.effet} » sur « ${geste.nom} »`);
    }
    if (geste.motif.trim().length === 0) {
      anomalies.push(`geste « ${geste.nom} » sans motif`);
    }
  }

  return { mesures: catalogue.length, anomalies };
}

describe("voice/etats/vocabulaire — le catalogue des quinze gestes", () => {
  it("rougit sur un témoin fabriqué portant deux fois le même nom", () => {
    const temoin: readonly DescriptionGeste[] = [
      { nom: "stop", nature: "commande-hors-modèle", effet: "réduit", motif: "a" },
      { nom: "stop", nature: "commande-hors-modèle", effet: "élargit", motif: "b" },
    ];

    const verdict = verifierCatalogue(temoin);
    expect(verdict.mesures).toBe(2);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("rougit sur un témoin fabriqué dont l'effet n'est pas un effet connu", () => {
    const temoin = [
      { nom: "stop", nature: "commande-hors-modèle", effet: "annule-tout", motif: "a" },
    ] as unknown as readonly DescriptionGeste[];

    expect(verifierCatalogue(temoin).anomalies).not.toHaveLength(0);
  });

  it("compte quinze gestes, tous bien formés, et deux qui élargissent sur demande", () => {
    const verdict = verifierCatalogue(GESTES_VOCAUX);

    const avecFacteur = GESTES_VOCAUX.filter(exigeSecondFacteur).map((geste) => geste.nom);
    const avecFenetre = GESTES_VOCAUX.filter(exigeFenetreDeverrouillee).map((geste) => geste.nom);

    console.info(
      `[garde catalogue] ${String(verdict.mesures)} gestes mesurés — ` +
        `${String(avecFacteur.length)} exigent un facteur (${avecFacteur.join(", ")}), ` +
        `${String(avecFenetre.length)} exigent la fenêtre (${avecFenetre.join(", ")})`,
    );

    expect(verdict.mesures).toBe(15);
    expect(verdict.anomalies).toEqual([]);
    expect(NOMS_GESTES.length).toBe(GESTES_VOCAUX.length);
    expect(new Set(NOMS_GESTES).size).toBe(GESTES_VOCAUX.length);

    // § 18, mot pour mot : « aucun desserrage ni changement de profil hors
    // fenêtre déverrouillée ». Ce sont ces deux-là, et ces deux-là seuls.
    expect([...avecFenetre].sort()).toEqual(["changer-de-profil", "desserrer"]);
    expect([...GESTES_QUI_ELARGISSENT].sort()).toEqual(["changer-de-profil", "desserrer"]);

    // Et `déverrouiller` s'y ajoute côté facteur, sans y être côté fenêtre.
    expect([...avecFacteur].sort()).toEqual(["changer-de-profil", "desserrer", "déverrouiller"]);
  });

  it("retrouve chaque geste par son nom, et refuse un nom inconnu", () => {
    let mesures = 0;
    for (const nom of NOMS_GESTES) {
      expect(decrireGeste(nom).nom, nom).toBe(nom);
      mesures += 1;
    }

    console.info(`[garde décrire] ${String(mesures)} gestes retrouvés par leur nom`);
    expect(mesures).toBe(15);
    expect(() => decrireGeste("chuchote" as GesteVocal)).toThrow(/inconnu/u);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — L'ANCRAGE AU CAHIER DES CHARGES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * La dérivation des obligations ne peut pas, seule, être réfutée : elle découle
 * de deux champs déclarés. Ce qui reste réfutable — et ce qui compte — c'est que
 * ces champs DÉCLARENT ce que le cahier des charges dit. C'est cet ancrage-ci.
 */
function verifierAncrageCdc(catalogue: readonly DescriptionGeste[]): Verdict {
  /** Les cinq gestes que le § 20 et le § 30 nomment, avec l'effet qu'ils leur donnent. */
  const ancres: ReadonlyArray<readonly [string, EffetSurLaSurface, string]> = [
    ["stop", "réduit", "§ 30 : « stop et annule RÉDUISENT la surface : libre »"],
    ["annuler", "réduit", "§ 30 : même phrase que « stop »"],
    [
      "brouillon-seul",
      "réduit",
      "§ 30 : « brouillon seul réduit la surface : admis sans facteur »",
    ],
    ["changer-de-profil", "élargit", "§ 30 : « passe en mode dev l'ÉLARGIT : facteur + TTL »"],
    ["desserrer", "élargit", "§ 20 : « desserrer n'est jamais libre »"],
  ];

  const anomalies: string[] = [];

  for (const [nom, effetAttendu, source] of ancres) {
    const geste = catalogue.find((candidat) => candidat.nom === nom);
    if (geste === undefined) {
      anomalies.push(`geste « ${nom} » absent du catalogue — ${source}`);
      continue;
    }
    if (geste.effet !== effetAttendu) {
      anomalies.push(
        `« ${nom} » déclare l'effet « ${geste.effet} », le cahier des charges dit ` +
          `« ${effetAttendu} » — ${source}`,
      );
    }
  }

  return { mesures: ancres.length, anomalies };
}

describe("voice/etats/vocabulaire — l'ancrage au § 20 et au § 30", () => {
  it("rougit sur un témoin où « stop » élargirait la surface", () => {
    // Le témoin fabriqué : un catalogue où le tri du § 30 est inversé. Sans
    // cette garde, la dérivation serait juste et le catalogue faux — verte pour
    // la pire des raisons.
    const temoin: readonly DescriptionGeste[] = GESTES_VOCAUX.map((geste) =>
      geste.nom === "stop" ? { ...geste, effet: "élargit" as const } : geste,
    );

    const verdict = verifierAncrageCdc(temoin);
    expect(verdict.mesures).toBe(5);
    expect(verdict.anomalies).not.toHaveLength(0);

    // Et l'effet du témoin sur la décision : « stop » y exigerait un facteur.
    const stopFausse = temoin.find((geste) => geste.nom === "stop");
    expect(stopFausse).toBeDefined();
    if (stopFausse !== undefined) {
      expect(exigeSecondFacteur(stopFausse)).toBe(true);
    }
  });

  it("rougit sur un témoin où « changer-de-profil » ne serait qu'un resserrement", () => {
    // Le jumeau oublié du § 20 : « passe en mode dev suit le chemin du
    // desserrage ». On le déclasse en « réduit » et la garde doit le voir.
    const temoin: readonly DescriptionGeste[] = GESTES_VOCAUX.map((geste) =>
      geste.nom === "changer-de-profil" ? { ...geste, effet: "réduit" as const } : geste,
    );

    expect(verifierAncrageCdc(temoin).anomalies).not.toHaveLength(0);
  });

  it("ancre les cinq gestes nommés par le cahier des charges", () => {
    const verdict = verifierAncrageCdc(GESTES_VOCAUX);

    console.info(`[garde ancrage CDC] ${String(verdict.mesures)} gestes ancrés mesurés`);

    expect(verdict.mesures).toBe(5);
    expect(verdict.anomalies).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import type { CritereDeProduction, FichierSoumis } from "./contrat.js";
import type { AssertionDeCouture, EntreeDeCouture } from "./registre.js";
import {
  corpsDuTestNomme,
  trousDeNumerotation,
  verifierLaCouvertureDesAdr,
  verifierLesAssertions,
  verifierLesCoutures,
} from "./verifier.js";

/**
 * **G3 — LA GARDE DE COUTURE SAIT-ELLE DIRE NON ?**
 *
 * ═══ POURQUOI CE FICHIER EST LA MOITIÉ INDISSOCIABLE DE `registre.spec.ts` ═══
 *
 * `registre.spec.ts` confronte le registre au dépôt réel et exige zéro anomalie.
 * **Un tel test est vert pour trois raisons indiscernables** : la prose du
 * registre est juste, ou la dérivation ne trouve plus rien, ou elle ne lit plus
 * rien du tout. Les planchers-témoins écartent la troisième ; ce fichier-ci
 * écarte la deuxième — il fabrique des jeux de fichiers où la garde DOIT rougir,
 * et compte ceux où elle ne rougit pas.
 *
 * C'est la règle du dépôt : **une garde qui ne peut pas échouer n'existe pas.**
 * Et c'est exactement le défaut que l'ADR 0019 existe pour fermer, appliqué à
 * l'ADR 0019 elle-même — sans ce fichier, la garde écrite pour empêcher qu'une
 * décision reste non prouvée serait elle-même non prouvée.
 *
 * ⚠️ **AUCUN TÉMOIN N'EST ÉCRIT SUR LE DISQUE.** La garde est une fonction PURE
 *    d'un ensemble de fichiers : on lui en passe un fabriqué. C'est la propriété
 *    n° 4 du contrat, et c'est elle qui rend l'épreuve possible sans mutiler le
 *    dépôt — un débranchement par copie de fichier réel, sur un arbre où
 *    plusieurs constructeurs écrivent, perd le travail du voisin en silence.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR FABRIQUÉ
// ═════════════════════════════════════════════════════════════════════════════

/** Un critère de livraison fabriqué : tout ce qui n'est pas `.spec.ts` est livré. */
const CRITERE_FABRIQUE: CritereDeProduction = {
  estLivre: (chemin) => !chemin.endsWith(".spec.ts"),
  motifsLus: 1,
};

const DEFINISSEUR: FichierSoumis = {
  chemin: "faux/definisseur.ts",
  source:
    "export function faireLaChose(quoi: string): string {\n" +
    "  return quoi.length > 0 ? faireLaChose(quoi.slice(1)) : quoi;\n" +
    "}\n",
};

const APPELANT: FichierSoumis = {
  chemin: "faux/appelant.ts",
  source: 'import { faireLaChose } from "./definisseur.js";\nexport const r = faireLaChose("x");\n',
};

/**
 * L'entrée de référence : une fonction déclarée COUSUE, tout le reste dérive.
 *
 * ⚠️ LA SURCHARGE EST TYPÉE `Partial<…>` DE L'UNION ENTIÈRE, et non `unknown` :
 *    un témoin qui passerait un état inexistant ne compilerait pas, et ce
 *    fichier existe pour éprouver la garde, pas pour la contourner.
 */
function entree(
  surcharge: Partial<Extract<EntreeDeCouture, { symbole: string }>> = {},
): EntreeDeCouture {
  return {
    adr: "9999",
    decision: "décision fabriquée — aucune valeur documentaire",
    etat: "cousue",
    symbole: "faireLaChose",
    genre: "fonction",
    module: "faux/definisseur.ts",
    mesureeAilleurs: null,
    assertion: null,
    motif: "témoin fabriqué",
    ...surcharge,
  };
}

interface Temoin {
  readonly nom: string;
  readonly fichiers: readonly FichierSoumis[];
  readonly entree: EntreeDeCouture;
  readonly anomaliesAttendues: number;
  readonly appelantsAttendus: number;
  readonly citationsAttendues?: number;
  readonly definiAttendu?: boolean;
}

/**
 * LES QUATORZE TÉMOINS.
 *
 * ⚠️ CHACUN ISOLE **UNE SEULE** RÈGLE. Un témoin qui en éprouverait deux serait
 *    vert dès que l'une des deux tient, et l'autre pourrait tomber sans un mot.
 */
const TEMOINS: readonly Temoin[] = [
  {
    nom: "① un appelant ordinaire est COMPTÉ — l'entrée `cousue` est satisfaite",
    fichiers: [DEFINISSEUR, APPELANT],
    entree: entree(),
    anomaliesAttendues: 0,
    appelantsAttendus: 1,
  },
  {
    nom: "② on RETIRE l'unique appelant d'un `cousue` — la garde ROUGIT",
    fichiers: [DEFINISSEUR],
    entree: entree(),
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
  },
  {
    nom: "③ on AJOUTE un appelant à un `à-coudre` — la garde ROUGIT (le sens qu'on oublie)",
    fichiers: [DEFINISSEUR, APPELANT],
    entree: entree({ etat: "à-coudre" }),
    anomaliesAttendues: 1,
    appelantsAttendus: 1,
  },
  {
    nom: "④ une CITATION EN COMMENTAIRE n'est pas un appel, et elle est comptée à part",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/prose.ts",
        source: "/** Voir `faireLaChose()` de definisseur.ts. */\nexport const rien = 1;\n",
      },
    ],
    entree: entree(),
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
    citationsAttendues: 1,
  },
  {
    nom: "⑤ un RÉ-EXPORT n'est pas un appelant — la fonction n'en est pas moins morte",
    fichiers: [
      DEFINISSEUR,
      { chemin: "faux/index.ts", source: 'export { faireLaChose } from "./definisseur.js";\n' },
    ],
    entree: entree(),
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
  },
  {
    nom: "⑥ un appel `faireLaChose<T>(…)` EST compté — sans quoi `avecJournal` passerait pour morte",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/generique.ts",
        source:
          'import { faireLaChose } from "./definisseur.js";\n' +
          'export const r = faireLaChose<ChargeServie>("x");\n',
      },
    ],
    entree: entree(),
    anomaliesAttendues: 0,
    appelantsAttendus: 1,
  },
  {
    nom: "⑦ le DÉFINISSEUR ne se compte pas lui-même, même quand il s'appelle en récursion",
    fichiers: [DEFINISSEUR],
    entree: entree({ etat: "à-coudre" }),
    anomaliesAttendues: 0,
    appelantsAttendus: 0,
  },
  {
    nom: "⑧ un appelant NON LIVRÉ ne compte pas — le critère est celui du build",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/appelant.spec.ts",
        source:
          'import { faireLaChose } from "./definisseur.js";\nfaireLaChose("depuis un test");\n',
      },
    ],
    entree: entree(),
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
  },
  {
    nom: "⑨ un `cousue` dont le symbole n'est DÉFINI nulle part ROUGIT deux fois",
    fichiers: [{ chemin: "faux/definisseur.ts", source: "export const autreChose = 1;\n" }],
    entree: entree(),
    anomaliesAttendues: 2,
    appelantsAttendus: 0,
    definiAttendu: false,
  },
  {
    nom: "⑩ un `à-coudre` dont le symbole n'existe pas ne rougit PAS — et c'est le trou, mesuré",
    fichiers: [{ chemin: "faux/definisseur.ts", source: "export const autreChose = 1;\n" }],
    entree: entree({ etat: "à-coudre" }),
    anomaliesAttendues: 0,
    appelantsAttendus: 0,
    definiAttendu: false,
  },
  {
    nom: "⑪ un `mesureeAilleurs` qui pointe un fichier ABSENT ROUGIT",
    fichiers: [DEFINISSEUR, APPELANT],
    entree: entree({ mesureeAilleurs: "faux/garde-qui-nexiste-pas.spec.ts" }),
    anomaliesAttendues: 1,
    appelantsAttendus: 1,
  },
  {
    nom: "⑫ un `à-nommer` dont le dossier attendu A ATTERRI ROUGIT — l'état s'auto-périme",
    fichiers: [{ chemin: "core/transport/serveur.ts", source: "export const rien = 1;\n" }],
    entree: {
      adr: "9999",
      decision: "décision fabriquée",
      etat: "à-nommer",
      dossierAttendu: "core/transport/",
      lot: "lot fabriqué",
      assertion: null,
      motif: "témoin fabriqué",
    },
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
  },
  {
    nom: "⑬ une entrée SANS MOTIF écrit ROUGIT, quel que soit son état",
    fichiers: [DEFINISSEUR, APPELANT],
    entree: entree({ motif: "   " }),
    anomaliesAttendues: 1,
    appelantsAttendus: 1,
  },
  {
    nom: "⑭ pour un TYPE, c'est l'IMPORT qui est la couture — pas une mention dans le corps",
    fichiers: [
      { chemin: "faux/definisseur.ts", source: "export type LaForme = { readonly a: number };\n" },
      {
        chemin: "faux/porteur.ts",
        source:
          'import type { LaForme } from "./definisseur.js";\nexport const f = (x: LaForme) => x;\n',
      },
    ],
    entree: entree({ symbole: "LaForme", genre: "type" }),
    anomaliesAttendues: 0,
    appelantsAttendus: 1,
  },
];

describe("G3 — la garde de couture sait dire NON", () => {
  it("éprouve quatorze témoins fabriqués et n'en manque aucun", () => {
    const desaccords: string[] = [];

    for (const temoin of TEMOINS) {
      const rapport = verifierLesCoutures(temoin.fichiers, [temoin.entree], CRITERE_FABRIQUE);
      if (rapport.anomalies.length !== temoin.anomaliesAttendues) {
        desaccords.push(
          `${temoin.nom} : ${String(rapport.anomalies.length)} anomalie(s) au lieu de ` +
            `${String(temoin.anomaliesAttendues)} [${rapport.anomalies.join(" / ")}]`,
        );
      }

      const verdict = rapport.verdicts[0];
      if (temoin.entree.etat === "à-nommer" || temoin.entree.etat === "hors-code") continue;
      if (verdict === undefined) {
        desaccords.push(`${temoin.nom} : aucun verdict rendu`);
        continue;
      }
      if (verdict.appelants.length !== temoin.appelantsAttendus) {
        desaccords.push(
          `${temoin.nom} : ${String(verdict.appelants.length)} appelant(s) au lieu de ` +
            `${String(temoin.appelantsAttendus)} [${verdict.appelants.join(", ")}]`,
        );
      }
      if (
        temoin.citationsAttendues !== undefined &&
        verdict.citationsEnProse.length !== temoin.citationsAttendues
      ) {
        // ⚠️ CE COMPTE EST LE TÉMOIN DU RETRAIT DES COMMENTAIRES LUI-MÊME. S'il
        //    cessait de fonctionner, la citation deviendrait un APPELANT : les
        //    appelants monteraient et les citations tomberaient à zéro. Les deux
        //    comptes ensemble disent LAQUELLE des deux pannes est arrivée.
        desaccords.push(
          `${temoin.nom} : ${String(verdict.citationsEnProse.length)} citation(s) au lieu de ` +
            `${String(temoin.citationsAttendues)}`,
        );
      }
      if (temoin.definiAttendu !== undefined && verdict.defini !== temoin.definiAttendu) {
        desaccords.push(
          `${temoin.nom} : defini=${String(verdict.defini)} au lieu de ` +
            `${String(temoin.definiAttendu)}`,
        );
      }
    }

    console.info(
      `[G3] ${String(TEMOINS.length)} témoin(s) fabriqué(s) éprouvé(s) · ` +
        `${String(TEMOINS.filter((t) => t.anomaliesAttendues > 0).length)} exigent un ROUGE · ` +
        `${String(desaccords.length)} désaccord(s)` +
        `${desaccords.length > 0 ? ` : ${desaccords.join(" | ")}` : ""}`,
    );

    // Plancher : quatorze témoins, pas moins. Un tableau vidé rendrait ce bloc
    // vert en ne mesurant rien — et c'est précisément la façon dont une garde
    // se fait désactiver sans que personne ne le décide.
    expect(TEMOINS.length).toBeGreaterThanOrEqual(14);
    // Et la moitié au moins exige un rouge : des témoins qui n'attendraient que
    // des verts ne prouveraient pas que la garde sait dire NON.
    expect(TEMOINS.filter((t) => t.anomaliesAttendues > 0).length).toBeGreaterThanOrEqual(7);
    expect(desaccords).toEqual([]);
  });

  it("ne compte pas un fichier de test pour un module de production, et le montre", () => {
    const rapport = verifierLesCoutures(
      [DEFINISSEUR, APPELANT, { chemin: "faux/x.spec.ts", source: "// rien\n" }],
      [entree()],
      CRITERE_FABRIQUE,
    );

    console.info(
      `[G3 · critère] ${String(rapport.fichiersSoumis)} fichier(s) soumis · ` +
        `${String(rapport.modulesDeProduction)} retenu(s) comme production · ` +
        `${String(CRITERE_FABRIQUE.motifsLus)} motif(s) d'exclusion`,
    );

    expect(rapport.fichiersSoumis).toBe(3);
    expect(rapport.modulesDeProduction).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 bis — LA COUVERTURE DES ADR SAIT-ELLE DIRE NON ?
// ═════════════════════════════════════════════════════════════════════════════

/** Un ADR fabriqué, avec l'en-tête exact que la lecture du statut attend. */
function adrFabrique(numero: string, statut: string): FichierSoumis {
  return {
    chemin: `docs/adr/${numero}-temoin.md`,
    source: `# ADR ${numero} — témoin\n\n- **Statut** : ${statut}\n- **Date** : 2026-08-31\n`,
  };
}

const ENTREE_HORS_CODE: EntreeDeCouture = {
  adr: "0001",
  decision: "décision fabriquée",
  etat: "hors-code",
  assertion: null,
  motif: "témoin fabriqué",
};

describe("G3 bis — la couverture des ADR sait dire NON", () => {
  it("rougit sur un ADR présent que le registre ignore", () => {
    const rapport = verifierLaCouvertureDesAdr(
      [adrFabrique("0001", "acceptée"), adrFabrique("0002", "acceptée")],
      [ENTREE_HORS_CODE],
    );

    console.info(
      `[G3 bis · ADR orphelin] ${String(rapport.adrTrouves)} trouvé(s) · ` +
        `${String(rapport.adrCouverts)} couvert(s) · ` +
        `${String(rapport.adrSansEntree.length)} sans entrée [${rapport.adrSansEntree.join(", ")}]`,
    );

    expect(rapport.adrSansEntree).toEqual(["0002"]);
    expect(rapport.anomalies.length).toBe(1);
  });

  it("rougit sur une entrée qui désigne un ADR inexistant — l'anomalie miroir", () => {
    const rapport = verifierLaCouvertureDesAdr(
      [adrFabrique("0001", "acceptée")],
      [ENTREE_HORS_CODE, { ...ENTREE_HORS_CODE, adr: "0099" }],
    );

    console.info(
      `[G3 bis · entrée fantôme] ${String(rapport.entreesFantomes.length)} fantôme(s) ` +
        `[${rapport.entreesFantomes.join(", ")}]`,
    );

    expect(rapport.entreesFantomes).toEqual(["0099"]);
    expect(rapport.anomalies.length).toBe(1);
  });

  it("rougit quand l'en-tête cesse de livrer un statut — le cas où elle deviendrait MUETTE", () => {
    const casse: FichierSoumis = {
      chemin: "docs/adr/0001-temoin.md",
      source: "# ADR 0001\n\nStatut : acceptée (sans la forme attendue)\n",
    };
    const rapport = verifierLaCouvertureDesAdr([casse], [ENTREE_HORS_CODE]);

    console.info(
      `[G3 bis · statut illisible] ${String(rapport.adrTrouves)} trouvé(s) · ` +
        `${String(rapport.statutsLus)} statut(s) lu(s) · ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );

    // Sans ce reproche, un changement de format d'en-tête ferait tomber
    // `statutsLus` à zéro et la garde resterait verte — le pire des verts.
    expect(rapport.statutsLus).toBe(0);
    expect(rapport.anomalies.length).toBe(1);
  });

  it("sait dire OUI : un dossier cohérent ne produit aucune anomalie", () => {
    const rapport = verifierLaCouvertureDesAdr(
      [adrFabrique("0001", "acceptée")],
      [ENTREE_HORS_CODE],
    );

    console.info(
      `[G3 bis · contre-épreuve] ${String(rapport.adrTrouves)} trouvé(s) · ` +
        `${String(rapport.adrCouverts)} couvert(s) · ` +
        `${String(rapport.adrAcceptes)} accepté(s) · ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );

    expect(rapport.anomalies).toEqual([]);
    expect(rapport.adrCouverts).toBe(1);
  });

  it("compte les trous de numérotation sur un dossier FABRIQUÉ, dans les deux sens", () => {
    const avecTrou = trousDeNumerotation([
      adrFabrique("0001", "acceptée"),
      adrFabrique("0004", "acceptée"),
    ]);
    const sansTrou = trousDeNumerotation([
      adrFabrique("0001", "acceptée"),
      adrFabrique("0002", "acceptée"),
    ]);

    console.info(
      `[G3 bis · trous] avec trou : ${avecTrou.join(", ")} · ` +
        `sans trou : ${sansTrou.join(", ") || "aucun"}`,
    );

    expect(avecTrou).toEqual(["0002", "0003"]);
    expect(sansTrou).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G4 — LA GARDE DES ASSERTIONS, ÉPROUVÉE SUR DES JEUX FABRIQUÉS (ADR 0041)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ POURQUOI CE BLOC EXISTE ═══
 *
 * G1 mesure les APPELANTS d'un symbole. Elle est verte, honnête — et elle ne
 * voit RIEN quand une décision neuve porte sur un symbole DÉJÀ COUSU. Deux ADR
 * marqués « Statut : acceptée » sont passés au travers dans le même lot.
 *
 * G4 mesure l'autre fait : **un test rougit-il si la décision se défait ?** Une
 * garde qui répondrait à cette question sans savoir dire NON serait pire que
 * l'absence de garde — elle donnerait à un registre menteur l'apparence d'une
 * mesure. Les cas ci-dessous fabriquent, un par un, chaque façon dont une
 * assertion peut être fausse, et exigent une anomalie pour chacune.
 *
 * ⚠️ **LE DERNIER CAS EST LE PLUS IMPORTANT DES DIX.** Il éprouve que le corps
 *    isolé d'un test NE FUIT PAS jusqu'au test voisin : sans lui, une entrée
 *    serait fermée par un nom que porte le test d'à côté, et G4 rendrait
 *    exactement le genre de vert qu'elle existe pour empêcher.
 */

/** Une entrée fabriquée qui porte une assertion. Rien d'autre ne varie. */
function entreeAvecAssertion(
  assertion: AssertionDeCouture | null,
  etat: "cousue" | "à-coudre" = "à-coudre",
): EntreeDeCouture {
  return {
    adr: "9999",
    decision: "décision fabriquée — aucune valeur documentaire",
    etat,
    symbole: "faireLaChose",
    genre: "fonction",
    module: "faux/definisseur.ts",
    mesureeAilleurs: null,
    assertion,
    motif: "témoin fabriqué",
  };
}

/**
 * Une garde fabriquée. Les sources sont écrites en littéral : c'est le décor
 * que G4 doit savoir lire sans le confondre avec son propre corps.
 */
const GARDE_QUI_VOIT: FichierSoumis = {
  chemin: "faux/garde.spec.ts",
  source: [
    'import { describe, expect, it } from "vitest";',
    'describe("fabriqué", () => {',
    '  it("le port journalDesRefus existe et la ligne est écrite", () => {',
    "    const ports = { journalDesRefus: [] };",
    "    expect(ports.journalDesRefus).toEqual([]);",
    "  });",
    '  it("un voisin qui parle de delaiDeReprise", () => {',
    "    expect(1).toBe(1);",
    "  });",
    '  it("un test qui n_assere rien", () => {',
    "    const ports = { journalDesRefus: [] };",
    "    void ports;",
    "  });",
    '  it.fails("la dette nommée du journalDesRefus", () => {',
    "    const ports = { journalDesRefus: null };",
    "    expect(ports.journalDesRefus).toEqual([]);",
    "  });",
    "});",
    "",
  ].join("\n"),
};

interface CasDAssertion {
  readonly nom: string;
  readonly assertion: AssertionDeCouture | null;
  readonly etat?: "cousue" | "à-coudre";
  readonly anomaliesAttendues: number;
  readonly motAttenduDansLAnomalie: string | null;
  /**
   * ⚠️ **LE DÉFAUT CENTRAL DU LOT 4.** Une entrée `cousue` dont l'assertion est
   *    un `it.fails` dit DEUX VÉRITÉS à la fois : le symbole a des appelants,
   *    et la décision n'a pas atterri. Ce n'est pas un reproche — c'est le
   *    compte que la garde existe pour rendre.
   */
  readonly cousueNonAtterrieAttendue?: boolean;
}

const CAS_D_ASSERTION: readonly CasDAssertion[] = [
  {
    nom: "① une assertion vers un FICHIER absent : le registre nomme un test inexécutable",
    assertion: {
      fichier: "faux/garde-qui-nexiste-pas.spec.ts",
      nom: "le port journalDesRefus existe et la ligne est écrite",
      nomme: ["journalDesRefus"],
    },
    anomaliesAttendues: 1,
    motAttenduDansLAnomalie: "N'EXISTE PAS",
  },
  {
    nom: "② un fichier présent, un NOM DE TEST absent : la chaîne recopiée à la main",
    assertion: {
      fichier: "faux/garde.spec.ts",
      nom: "un test que personne n_a jamais écrit",
      nomme: ["journalDesRefus"],
    },
    anomaliesAttendues: 1,
    motAttenduDansLAnomalie: "aucun test de ce nom EXACT",
  },
  {
    nom: "③ un test présent qui n'assère RIEN : il ne peut faire échouer personne",
    assertion: {
      fichier: "faux/garde.spec.ts",
      nom: "un test qui n_assere rien",
      nomme: ["journalDesRefus"],
    },
    anomaliesAttendues: 1,
    motAttenduDansLAnomalie: "AUCUN « expect( »",
  },
  {
    nom: "④ un test présent qui parle d'AUTRE CHOSE que la décision",
    assertion: {
      fichier: "faux/garde.spec.ts",
      nom: "le port journalDesRefus existe et la ligne est écrite",
      nomme: ["delaiDeReprise"],
    },
    anomaliesAttendues: 1,
    motAttenduDansLAnomalie: "ne NOMME pas",
  },
  {
    nom: "⑤ une liste « nomme » VIDE : une assertion qui désignerait n'importe quel vert",
    assertion: {
      fichier: "faux/garde.spec.ts",
      nom: "le port journalDesRefus existe et la ligne est écrite",
      nomme: [],
    },
    anomaliesAttendues: 1,
    motAttenduDansLAnomalie: "est VIDE",
  },
  {
    nom: "⑥ une assertion portée par un MODULE DE PRODUCTION : ce serait du code, pas une garde",
    assertion: {
      fichier: "faux/definisseur.ts",
      nom: "le port journalDesRefus existe et la ligne est écrite",
      nomme: ["journalDesRefus"],
    },
    anomaliesAttendues: 2,
    motAttenduDansLAnomalie: "« .spec.ts »",
  },
  {
    nom: "⑦ une entrée COUSUE gardée par un « it.fails » : le défaut central, COMPTÉ et non reproché",
    assertion: {
      fichier: "faux/garde.spec.ts",
      nom: "la dette nommée du journalDesRefus",
      nomme: ["journalDesRefus"],
    },
    etat: "cousue",
    anomaliesAttendues: 0,
    motAttenduDansLAnomalie: null,
    cousueNonAtterrieAttendue: true,
  },
  {
    nom: "⑧ la MÊME dette sur un « à-coudre » ne reproche RIEN — elle se compte, elle ne s'interdit pas",
    assertion: {
      fichier: "faux/garde.spec.ts",
      nom: "la dette nommée du journalDesRefus",
      nomme: ["journalDesRefus"],
    },
    anomaliesAttendues: 0,
    motAttenduDansLAnomalie: null,
  },
  {
    nom: "⑨ une assertion JUSTE ne reproche rien — la garde sait dire OUI",
    assertion: {
      fichier: "faux/garde.spec.ts",
      nom: "le port journalDesRefus existe et la ligne est écrite",
      nomme: ["journalDesRefus"],
    },
    anomaliesAttendues: 0,
    motAttenduDansLAnomalie: null,
  },
  {
    nom: "⑩ aucune assertion : ZÉRO reproche, et l'entrée se compte comme SANS-ASSERTION",
    assertion: null,
    anomaliesAttendues: 0,
    motAttenduDansLAnomalie: null,
  },
];

describe("G4 — la garde des assertions sait dire NON, et dire OUI (ADR 0041)", () => {
  it("rougit sur chacune des six façons dont une assertion peut être fausse", () => {
    const fichiers = [GARDE_QUI_VOIT, DEFINISSEUR];
    let casEprouves = 0;

    for (const cas of CAS_D_ASSERTION) {
      const entree = entreeAvecAssertion(cas.assertion, cas.etat);
      const rapport = verifierLesAssertions(fichiers, [entree]);
      casEprouves += 1;

      console.info(
        `[G4 · témoin] ${cas.nom} → ${String(rapport.anomalies.length)} anomalie(s) ` +
          `[${rapport.anomalies.join(" | ") || "aucune"}] · ` +
          `${String(rapport.avecAssertion)} avec assertion · ` +
          `${String(rapport.sansAssertion)} sans · ${String(rapport.enDette)} en dette · ` +
          `${String(rapport.cousuesNonAtterries.length)} cousue(s) NON ATTERRIE(s) ` +
          `[${rapport.cousuesNonAtterries.join(", ") || "aucune"}]`,
      );

      expect(rapport.anomalies, cas.nom).toHaveLength(cas.anomaliesAttendues);
      expect(rapport.cousuesNonAtterries.length, cas.nom).toBe(
        cas.cousueNonAtterrieAttendue === true ? 1 : 0,
      );
      if (cas.motAttenduDansLAnomalie !== null) {
        expect(rapport.anomalies.join(" | "), cas.nom).toContain(cas.motAttenduDansLAnomalie);
      }
    }

    // Plancher : la boucle a réellement tourné sur TOUS les cas. Sans lui, une
    // liste vidée rendrait ce test vert en n'éprouvant rien.
    console.info(`[G4 · témoin · totaux] ${String(casEprouves)} cas fabriqué(s) éprouvé(s)`);
    expect(casEprouves).toBe(CAS_D_ASSERTION.length);
    expect(casEprouves).toBeGreaterThanOrEqual(10);
  });

  /**
   * ⚠️ **LE PIÈGE QUE CE TEST FERME, ET C'EST LE VRAI.** Si l'isolement du corps
   *    fuyait jusqu'à la fin du fichier, le nom cité par le test VOISIN
   *    (`delaiDeReprise`) satisferait `nomme`, et l'entrée serait fermée par un
   *    test qui n'en parle pas. La garde deviendrait alors ce qu'elle existe
   *    pour empêcher : une mesure qui a l'air d'en être une.
   */
  it("n'isole que le corps du test nommé — le nom cité par le VOISIN ne ferme rien", () => {
    const corps = corpsDuTestNomme(
      GARDE_QUI_VOIT.source,
      "le port journalDesRefus existe et la ligne est écrite",
    );

    console.info(
      `[G4 · isolement] corps isolé : ${String(corps?.brut.length ?? 0)} caractère(s) bruts, ` +
        `${String(corps?.code.length ?? 0)} de code · contient journalDesRefus : ` +
        `${String(corps?.brut.includes("journalDesRefus") ?? false)} · contient delaiDeReprise : ` +
        `${String(corps?.brut.includes("delaiDeReprise") ?? false)}`,
    );

    expect(corps).not.toBeNull();
    expect(corps?.brut).toContain("journalDesRefus");
    // Le voisin est HORS du corps. C'est toute la garde.
    expect(corps?.brut).not.toContain("delaiDeReprise");
  });

  /**
   * ⚠️ **ET G4 SE SURVEILLE ELLE-MÊME.** Le rapport du lot 3 écrivait, du
   *    mécanisme des coutures, « ET JE SUIS LOGÉ À LA MÊME ENSEIGNE ». Ce
   *    test-ci est l'assertion que l'entrée de l'ADR 0041 nomme au registre :
   *    la garde des assertions est une décision, et elle est vue par un test
   *    comme n'importe quelle autre.
   */
  it("compte les entrées SANS assertion et dérive les ADR qu'aucun test ne voit", () => {
    const registre: readonly EntreeDeCouture[] = [
      entreeAvecAssertion({
        fichier: "faux/garde.spec.ts",
        nom: "le port journalDesRefus existe et la ligne est écrite",
        nomme: ["journalDesRefus"],
      }),
      entreeAvecAssertion(null),
      { ...entreeAvecAssertion(null), adr: "9998" },
    ];
    const rapport = verifierLesAssertions([GARDE_QUI_VOIT, DEFINISSEUR], registre);

    console.info(
      `[G4 · répartition] ${String(rapport.entreesConfrontees)} entrée(s) · ` +
        `répartition ${JSON.stringify(rapport.parAssertion)} · ` +
        `${String(rapport.adrConfrontes)} ADR · ` +
        `${String(rapport.adrSansAucuneAssertion.length)} sans AUCUNE assertion ` +
        `[${rapport.adrSansAucuneAssertion.join(", ")}]`,
    );

    expect(rapport.entreesConfrontees).toBe(3);
    expect(rapport.avecAssertion).toBe(1);
    expect(rapport.sansAssertion).toBe(2);
    expect(rapport.parAssertion).toEqual({
      "avec-assertion": 1,
      "en-dette": 0,
      "sans-assertion": 2,
    });
    // 9999 porte UNE entrée vue ; 9998 n'en porte aucune. La dérivation est par
    // ADR, jamais par entrée : un ADR dont UNE décision est vue n'est pas aveugle.
    expect(rapport.adrConfrontes).toBe(2);
    expect(rapport.adrSansAucuneAssertion).toEqual(["9998"]);
    expect(rapport.anomalies).toEqual([]);
  });
});

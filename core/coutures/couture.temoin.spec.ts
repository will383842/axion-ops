import { describe, expect, it } from "vitest";

import type { CritereDeProduction, FichierSoumis } from "./contrat.js";
import type { EntreeDeCouture } from "./registre.js";
import {
  trousDeNumerotation,
  verifierLaCouvertureDesAdr,
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

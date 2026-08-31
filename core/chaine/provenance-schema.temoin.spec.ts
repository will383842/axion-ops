/**
 * TÉMOINS ADVERSAIRES — `core/chaine/etape-11-provenance.ts`, la dérivation du
 * § 20 depuis le SCHÉMA d'entrée.
 *
 * ═══ LA QUESTION QU'ON POSE ═══
 *
 * L'étape 11 ne raisonne jamais sur la valeur d'un argument : elle demande au
 * SCHÉMA « cet outil peut-il porter un argument libre ? ». L'orchestrateur la
 * branche directement — `orchestrateur.ts` :
 *
 *     const analyse = analyserArgumentsDuSchema(outil.inputSchema, outil.idFields);
 *     const v11 = dependances.etapeProvenance({ …, porteUnArgumentLibre: analyse.porteUnArgumentLibre, … });
 *
 * Donc : `porteUnArgumentLibre === false` ⇒ l'étape 11 ne refuse rien et
 * n'exige aucune confirmation, quel que soit le marquage de la session. La
 * cinquième règle du § 20 — « un appel ultérieur, dans la même session, vers un
 * adaptateur d'un autre domaine et portant un argument libre, est refusé ou
 * confirmé » — repose ENTIÈREMENT sur ce booléen.
 *
 * La question adverse est donc la seule qui compte : **existe-t-il un schéma
 * qui accepte du texte libre et pour lequel ce booléen vaut `false` ?**
 *
 * ═══ CE QUE CES TÉMOINS ONT MESURÉ ═══
 *
 * Oui. Cinq formes, toutes écrites en JSON Schema ordinaire, toutes admises par
 * le registre (`analyserFermeture` les déclarait fermées), toutes invisibles à
 * l'étape 11. Elles partageaient DEUX causes, et une seule ligne chacune :
 *
 *  · `estTexteLibre()` traitait la PRÉSENCE de `format` ou de `pattern` comme
 *    une fermeture de l'ensemble des valeurs. Or `format` est, dans le draft
 *    2020-12, une ANNOTATION : il ne contraint rien par défaut. Un adaptateur
 *    qui écrivait `format: "texte-long"` sur le corps d'un courrier désarmait le
 *    § 20 d'un mot, sans qu'aucune garde ne bronche. Et un `pattern` peut être
 *    vide de contrainte — `^[\s\S]*$` accepte tout.
 *
 *  · le parcours ne confrontait que `sous["properties"]`. Un champ déclaré par
 *    `patternProperties` ou par la forme OBJET d'`additionalProperties` n'était
 *    jamais compté ; et un conteneur `{"type":"object"}` sans `properties`
 *    n'était ni « libre » ni tenu d'être fermé, alors qu'il accepte n'importe
 *    quel document.
 *
 * ═══ CE QUE LA RECETTE A CORRIGÉ, ET POURQUOI CES TESTS SONT EN `it()` ═══
 *
 * Les deux causes sont fermées, et **aucun test n'a été supprimé**.
 *
 *  · `estTexteLibre()` ne referme plus sur `format` qu'au vu d'une LISTE FERMÉE
 *    de formats réellement contraignants — `uri` en est exclu nommément, une URI
 *    transportant une chaîne de requête arbitraire. Un `pattern` ne referme que
 *    s'il est ancré aux deux bouts ET REJETTE des témoins de prose fabriqués :
 *    c'est mesuré, pas supposé.
 *  · un conteneur d'objet ouvert — `{"type":"object"}` nu, ou un
 *    `additionalProperties` en forme de schéma — est traité comme LIBRE, et
 *    `core/adapter-kit/fermeture.ts` a reçu la correction jumelle : il exige
 *    désormais la fermeture de tout schéma d'objet, déclarant ou non.
 *
 * ⚠️ UNE LIGNE DE CORPS A CHANGÉ, ET ELLE EST SIGNALÉE SUR PLACE. Les témoins
 *    exigeaient `admisParLeRegistre === true` comme PRÉCONDITION. Deux des cinq
 *    formes ne sont plus admises — le § 09 les refuse. Garder cette
 *    précondition rendrait ces deux tests verts POUR LA MAUVAISE RAISON (« le
 *    registre le refuse déjà »), c'est-à-dire exactement le piège d'un contrôle
 *    vert parce qu'il ne regarde rien. L'admission est donc désormais MESURÉE et
 *    ANNONCÉE, jamais exigée ; l'attente du § 20, elle, est inchangée.
 *
 * ═══ CE QUE CE FICHIER NE PRÉTEND PAS ═══
 *
 * Il ne dit RIEN de la borne que le module écrit déjà lui-même — « un champ
 * nommé `cible`, `param3` ou `x` échappe aux cinq familles ». Cette borne-là
 * est ASSUMÉE, écrite, et ces témoins ne la rejouent pas. Ce qu'ils montrent
 * est d'un autre ordre : un champ qui porte LE NOM ATTENDU, ou qui est
 * exactement le texte libre que la règle vise, et que la dérivation ne voit
 * pas. Ce n'est pas la couverture des motifs qui est en cause, c'est la lecture
 * du schéma.
 *
 * ═══ LES TÉMOINS DE CAPACITÉ, ET POURQUOI ILS RESTENT ═══
 *
 * Chaque défaut est APPARIÉ à un témoin de CAPACITÉ, en `it()` ordinaire, qui
 * prouve que la dérivation sait dire « oui » sur la forme nue. Il valait, quand
 * les défauts étaient ouverts, comme plancher : un `it.fails` vert n'aurait pas
 * distingué un défaut d'une dérivation morte. Il vaut toujours, et pour la
 * raison symétrique : une dérivation qui rendrait `true` sur TOUT serait verte
 * sur les cinq formes ci-dessous sans rien mesurer. C'est lui qui l'interdit.
 */

import { describe, expect, it } from "vitest";

import { analyserFermeture } from "../adapter-kit/fermeture.js";
import {
  FAMILLES_GOUVERNANCE,
  analyserArgumentsDuSchema,
  familleDeGouvernance,
} from "./etape-11-provenance.js";

// ─────────────────────────────────────────────────────────────────────────────
//  L'outillage des témoins
// ─────────────────────────────────────────────────────────────────────────────

/** Un schéma d'outil ordinaire, fermé au dialecte de Zod, portant UN champ. */
function outilAvecChamp(champ: unknown): Record<string, unknown> {
  return {
    type: "object",
    properties: { corps: champ },
    additionalProperties: false,
  };
}

/**
 * Ce que le socle CROIT d'un schéma, et ce qu'il en admet.
 *
 * Les deux sont rendus ensemble parce que le défaut n'existe que par leur
 * conjonction : un schéma que le registre REFUSERAIT ne pourrait jamais
 * atteindre l'étape 11, et l'invisibilité serait sans conséquence.
 */
function croyance(schema: Record<string, unknown>): {
  readonly porteUnArgumentLibre: boolean;
  readonly admisParLeRegistre: boolean;
  readonly proprietesInspectees: number;
} {
  const analyse = analyserArgumentsDuSchema(schema, []);
  return {
    porteUnArgumentLibre: analyse.porteUnArgumentLibre,
    admisParLeRegistre: analyserFermeture(schema as never).ferme,
    proprietesInspectees: analyse.proprietesInspectees,
  };
}

/**
 * Les cinq formes éprouvées. Elles vivent dans UNE liste pour que le compte
 * annoncé plus bas soit DÉRIVÉ, jamais écrit — et pour qu'une forme ajoutée ici
 * entre au compte le jour même.
 */
const FORMES_DE_TEXTE_LIBRE = [
  {
    cle: "format-annotatif",
    quoi: "`format` inconnu — annotation du draft 2020-12, ne contraint RIEN",
    schema: outilAvecChamp({ type: "string", format: "texte-long" }),
  },
  {
    cle: "format-standard",
    quoi: "`format` standard posé sur un champ qui reste une chaîne quelconque",
    schema: outilAvecChamp({ type: "string", format: "email" }),
  },
  {
    cle: "pattern-vacant",
    quoi: "`pattern` qui accepte tout — `^[\\s\\S]*$`",
    schema: outilAvecChamp({ type: "string", pattern: "^[\\s\\S]*$" }),
  },
  {
    cle: "objet-fourre-tout",
    quoi: '`{"type":"object"}` sans `properties` — accepte n\'importe quel document',
    schema: outilAvecChamp({ type: "object" }),
  },
  {
    cle: "additionalProperties-objet",
    quoi: '`additionalProperties: {type:"string"}` — chaînes libres en nombre libre',
    schema: outilAvecChamp({ type: "object", additionalProperties: { type: "string" } }),
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  Témoin de CAPACITÉ — la dérivation sait dire « oui »
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 11 — la dérivation du § 20 voit la forme NUE", () => {
  it("dit `porteUnArgumentLibre` sur une chaîne sans mot-clé, et compte ce qu'elle a lu", () => {
    // ⚠️ CE TÉMOIN EST LE PLANCHER DE TOUS LES AUTRES. Sans lui, un `it.fails`
    //    vert ne distinguerait pas « la dérivation ne voit pas cette forme-ci »
    //    de « la dérivation ne voit plus rien du tout ».
    const nu = analyserArgumentsDuSchema(outilAvecChamp({ type: "string" }), []);

    console.info(
      `[capacité étape 11] 1 schéma nu mesuré · ${String(nu.proprietesInspectees)} propriété(s) ` +
        `inspectée(s) · ${String(nu.sousSchemasInspectes)} sous-schéma(s) · ` +
        `libre=${String(nu.porteUnArgumentLibre)}`,
    );

    expect(nu.porteUnArgumentLibre).toBe(true);
    expect(nu.libres.map((champ) => champ.nom)).toEqual(["corps"]);
    // Plancher-témoin : une dérivation qui n'inspecte AUCUNE propriété rendrait
    // `false` partout, et tous les `it.fails` ci-dessous seraient verts pour la
    // pire des raisons.
    expect(nu.proprietesInspectees).toBeGreaterThanOrEqual(1);
  });

  it("reste fail-closed sur un schéma illisible, et le DIT", () => {
    const cyclique: Record<string, unknown> = { type: "object" };
    cyclique["properties"] = { soi: cyclique };
    const analyse = analyserArgumentsDuSchema(cyclique, []);

    console.info(
      `[fail-closed étape 11] illisible=${String(analyse.schemaIllisible)} · ` +
        `libre=${String(analyse.porteUnArgumentLibre)} · ` +
        `gouvernance=${String(analyse.porteUnArgumentDeGouvernance)}`,
    );

    // Un schéma qu'on ne sait pas lire est le cas où il faut refuser.
    expect(analyse.porteUnArgumentLibre).toBe(true);
    expect(analyse.porteUnArgumentDeGouvernance).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  DÉFAUT FERMÉ — cinq schémas de texte libre, jadis invisibles à l'étape 11
// ─────────────────────────────────────────────────────────────────────────────

describe("étape 11 — les cinq formes de texte libre sont vues, et le § 09 en refuse deux", () => {
  it("ANNONCE combien de formes ont été éprouvées, et combien restent invisibles", () => {
    const mesures = FORMES_DE_TEXTE_LIBRE.map((forme) => ({ forme, vu: croyance(forme.schema) }));
    // LE DÉFAUT est la CONJONCTION : invisible à l'étape 11 ET admise par le
    // registre. Une forme que le § 09 refuse n'atteint jamais l'étape 11.
    const invisibles = mesures.filter(
      ({ vu }) => !vu.porteUnArgumentLibre && vu.admisParLeRegistre,
    );
    const vuesParLEtape11 = mesures.filter(({ vu }) => vu.porteUnArgumentLibre);
    const refuseesParLeRegistre = mesures.filter(({ vu }) => !vu.admisParLeRegistre);

    console.info(
      `[garde § 20 · argument libre] ${String(FORMES_DE_TEXTE_LIBRE.length)} forme(s) de texte ` +
        `libre éprouvée(s) · ${String(vuesParLEtape11.length)} vue(s) par l'étape 11 · ` +
        `${String(refuseesParLeRegistre.length)} refusée(s) par le § 09 : ` +
        `${refuseesParLeRegistre.map(({ forme }) => forme.cle).join(", ")} · ` +
        `${String(invisibles.length)} invisible(s) ET admise(s) : ` +
        `${invisibles.map(({ forme }) => forme.cle).join(", ") || "aucune"}`,
    );

    // Plancher-témoin : la liste doit avoir de la matière.
    expect(FORMES_DE_TEXTE_LIBRE.length).toBeGreaterThanOrEqual(5);
    // ⚖️ L'ATTENTE DU § 20, désormais tenue : aucune forme n'est à la fois
    //    invisible à l'étape 11 et admissible par le registre.
    expect(invisibles.map(({ forme }) => forme.cle)).toEqual([]);
    // ⚠️ ET LA BORNE, ÉCRITE AVEC LA MESURE. Deux des cinq formes sont
    //    DOUBLEMENT fermées — le § 09 les refuse à l'enregistrement ET le § 20
    //    les voit. Les trois autres ne sont fermées que par le § 20 : c'est bien
    //    `estTexteLibre()` qui les tient, et rien d'autre.
    expect(refuseesParLeRegistre.length).toBeGreaterThanOrEqual(1);
    expect(refuseesParLeRegistre.length).toBeLessThan(FORMES_DE_TEXTE_LIBRE.length);
  });

  for (const forme of FORMES_DE_TEXTE_LIBRE) {
    // ⚠️ CE CORPS A CHANGÉ D'UNE LIGNE, ET IL FAUT DIRE LAQUELLE. Le témoin
    //    exigeait `admisParLeRegistre === true` comme PRÉCONDITION — « le défaut
    //    est atteignable ». Deux des cinq formes ne sont plus admises : le § 09
    //    les refuse depuis que `analyserFermeture()` voit les objets ouverts.
    //    Garder cette précondition rendrait le test vert POUR LA MAUVAISE
    //    RAISON — « le registre le refuse déjà » — c'est-à-dire exactement le
    //    piège d'un contrôle vert parce qu'il ne regarde rien. L'admission est
    //    donc MESURÉE et annoncée, jamais exigée.
    //
    //    L'ATTENTE DU § 20, elle, est INCHANGÉE : la forme porte du texte libre,
    //    et l'étape 11 doit le voir — que le registre l'ait admise ou non.
    it(`✅ ${forme.cle} — ${forme.quoi}`, () => {
      const vu = croyance(forme.schema);

      console.info(
        `[garde § 20 · ${forme.cle}] admise par le registre : ` +
          `${String(vu.admisParLeRegistre)} · vue par l'étape 11 : ` +
          `${String(vu.porteUnArgumentLibre)}`,
      );

      expect(vu.porteUnArgumentLibre, `${forme.cle} : invisible à l'étape 11`).toBe(true);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  DÉFAUT FERMÉ — les motifs accentués et la normalisation Unicode
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trois des cinq familles du § 20 s'appuient sur des motifs ACCENTUÉS —
 * `créneau`, `durée`, `désactiver`. Un motif littéral accentué est écrit en
 * forme composée (NFC) dans la source ; un nom de propriété reçu d'un dépôt
 * tiers peut arriver en forme décomposée (NFD), où « é » s'écrit « e » suivi
 * d'un accent combinant. Les deux chaînes s'AFFICHENT à l'identique et ne se
 * comparent pas.
 *
 * C'est la même famille de piège que « mesurer dans un moteur et garder dans un
 * autre » : la garde est plus faible que sa mesure, en silence, et rien dans le
 * rendu ne le laisse voir.
 */
const NOMS_ACCENTUES = ["créneau", "durée", "désactiverOutil"] as const;

describe("étape 11 — les familles accentuées et la forme Unicode reçue", () => {
  it("retient les trois noms accentués en forme COMPOSÉE — le témoin de capacité", () => {
    const retenus = NOMS_ACCENTUES.map((nom) => familleDeGouvernance(nom.normalize("NFC")));

    console.info(
      `[capacité gouvernance] ${String(NOMS_ACCENTUES.length)} nom(s) accentué(s) NFC mesuré(s) · ` +
        `${String(FAMILLES_GOUVERNANCE.length)} famille(s) du § 20 · retenus : ${retenus.join(", ")}`,
    );

    expect(retenus.every((famille) => famille !== null)).toBe(true);
    expect(FAMILLES_GOUVERNANCE.length).toBeGreaterThanOrEqual(5);
  });

  it("ANNONCE combien de noms accentués échappent en forme DÉCOMPOSÉE", () => {
    const echappent = NOMS_ACCENTUES.filter(
      (nom) => familleDeGouvernance(nom.normalize("NFD")) === null,
    );

    console.info(
      `[témoin § 20 · Unicode] ${String(NOMS_ACCENTUES.length)} nom(s) accentué(s) éprouvé(s) en ` +
        `NFD · ${String(echappent.length)} échappe(nt) à toute famille : ${echappent.join(", ")}`,
    );

    expect(NOMS_ACCENTUES.length).toBeGreaterThanOrEqual(3);
    expect(echappent.length).toBeLessThanOrEqual(NOMS_ACCENTUES.length);
  });

  for (const nom of NOMS_ACCENTUES) {
    it(`✅ « ${nom} » en NFD est retenu par une famille du § 20`, () => {
      // Le MÊME nom, la MÊME graphie à l'écran — une autre normalisation.
      expect(familleDeGouvernance(nom.normalize("NFD")), `${nom} en NFD`).not.toBeNull();
    });
  }

  it("prouve que les deux formes sont bien LE MÊME NOM à l'écran", () => {
    // Sans ce témoin, on pourrait croire que le NFD est un nom exotique qu'aucun
    // adaptateur n'écrirait. Il s'agit du même texte, octet-à-octet différent.
    let mesures = 0;
    for (const nom of NOMS_ACCENTUES) {
      mesures += 1;
      const nfd = nom.normalize("NFD");
      expect(nfd).not.toBe(nom); // octets différents
      expect(nfd.normalize("NFC")).toBe(nom); // même texte
    }
    console.info(`[témoin § 20 · Unicode] ${String(mesures)} paire(s) NFC/NFD confrontée(s)`);
    expect(mesures).toBe(NOMS_ACCENTUES.length);
  });
});

import { describe, expect, it } from "vitest";

import { analyserArgumentsDuSchema } from "../chaine/etape-11-provenance.js";
import {
  APPLICATEURS_DIRECTS,
  APPLICATEURS_LISTE,
  APPLICATEURS_OBJET,
  analyserFermeture,
  sousSchemas,
} from "./fermeture.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "./types.js";
import type { ValeurJson } from "./json.js";

/**
 * GARDE DE COUVERTURE — **LE PARCOURS DE `sousSchemas()` CONNAÎT-IL TOUS LES
 * ENDROITS OÙ UN SOUS-SCHÉMA PEUT VIVRE ?**
 *
 * ═══ LE DÉFAUT QUI A FAIT ÉCRIRE CETTE GARDE, ET SES DEUX FACES ═══
 *
 * `dependentSchemas` — applicateur ORDINAIRE de JSON Schema 2020-12, celui qui
 * exprime « si `paiement` est présent, alors voici les champs qui vont avec » —
 * n'était dans aucune des trois listes de `fermeture.ts`. Il DÉCLARE pourtant des
 * `properties`, et le parcours ne descendait pas dedans. Deux gardes du socle
 * s'en trouvaient trompées EN MÊME TEMPS, et c'est leur appariement qui faisait
 * le trou :
 *
 *  · le **§ 09** déclarait le schéma FERMÉ — il ne voyait aucun objet à fermer
 *    là où il ne descendait pas ;
 *  · le **§ 20** ne voyait AUCUN des champs qui y vivent — un `corps` de courrier
 *    en texte libre déclaré là n'entrait pas dans `libres`, donc
 *    `porteUnArgumentLibre` restait faux, donc la branche 4 de l'étape 11 ne
 *    demandait aucune confirmation.
 *
 * Un adaptateur n'avait qu'à déplacer sa propriété de trois lignes pour sortir de
 * la garde d'exfiltration, en gardant un schéma que l'admission déclare fermé.
 *
 * ═══ ⚠️ POURQUOI AJOUTER L'ENTRÉE N'ÉTAIT PAS LE CORRECTIF ═══
 *
 * Parce que rien n'aurait empêché le PROCHAIN mot-clé d'être oublié de la même
 * façon, et que personne ne l'aurait vu. Le CDC ne nomme aucun de ces mots-clés ;
 * ce qui les nomme est le **vocabulaire de JSON Schema 2020-12**. Le correctif
 * est donc cette garde : elle confronte les trois listes au vocabulaire et
 * ROUGIT SUR L'ÉCART, en annonçant les comptes.
 *
 * ⚠️ **ELLE NE PEUT PAS ÊTRE UNE DÉRIVATION**, et c'est assumé. Le vocabulaire de
 *    2020-12 n'existe nulle part dans le dépôt : il vit dans une spécification
 *    extérieure, et aucun appel réseau n'est permis ici. La liste ci-dessous est
 *    donc RECOPIÉE d'une source extérieure — c'est le seul endroit du lot où
 *    c'est le cas, et c'est ce qui donne son sens à la confrontation : deux
 *    sources INDÉPENDANTES qui doivent s'accorder. Une garde qui dériverait la
 *    référence du code gardé ne mesurerait que sa propre copie, et serait verte
 *    quel que soit le mot-clé oublié.
 *
 * ⚠️ **LA FORME EST CONFRONTÉE AVEC LE NOM.** Un mot-clé rangé dans la mauvaise
 *    liste n'est pas « à peu près parcouru », il est parcouru DE TRAVERS :
 *    `dependentSchemas` rangé parmi les directs ferait descendre dans la TABLE,
 *    prise pour un schéma ; ses vraies branches ne seraient jamais visitées, et
 *    le parcours rendrait un sous-schéma de plus — c'est-à-dire un compte
 *    RASSURANT. C'est exactement la façon dont un défaut se cache derrière un
 *    nombre qui monte.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  LA RÉFÉRENCE — LE VOCABULAIRE D'APPLICATEURS DE JSON SCHEMA 2020-12
// ─────────────────────────────────────────────────────────────────────────────

/** La forme que prend la VALEUR d'un mot-clé applicateur. */
type FormeApplicateur =
  /** `nom → sous-schéma` : une table. */
  | "table"
  /** Une liste de sous-schémas. */
  | "liste"
  /** UN sous-schéma. */
  | "schéma";

/**
 * LES MOTS-CLÉS DE 2020-12 QUI PORTENT UN SOUS-SCHÉMA.
 *
 * Trois vocabulaires y contribuent, et ils sont marqués : `applicator` (le gros
 * du lot), `unevaluated` (les deux mots-clés de composition), et `core` (`$defs`).
 * Aucun autre mot-clé de 2020-12 ne porte de sous-schéma — les vocabulaires
 * `validation`, `format-annotation`, `content` et `meta-data` ne portent que des
 * valeurs scalaires ou des listes de noms.
 */
const VOCABULAIRE_2020_12: readonly {
  readonly nom: string;
  readonly forme: FormeApplicateur;
  readonly vocabulaire: "applicator" | "unevaluated" | "core";
}[] = [
  { nom: "properties", forme: "table", vocabulaire: "applicator" },
  { nom: "patternProperties", forme: "table", vocabulaire: "applicator" },
  { nom: "dependentSchemas", forme: "table", vocabulaire: "applicator" },
  { nom: "$defs", forme: "table", vocabulaire: "core" },
  { nom: "allOf", forme: "liste", vocabulaire: "applicator" },
  { nom: "anyOf", forme: "liste", vocabulaire: "applicator" },
  { nom: "oneOf", forme: "liste", vocabulaire: "applicator" },
  { nom: "prefixItems", forme: "liste", vocabulaire: "applicator" },
  { nom: "items", forme: "schéma", vocabulaire: "applicator" },
  { nom: "contains", forme: "schéma", vocabulaire: "applicator" },
  { nom: "additionalProperties", forme: "schéma", vocabulaire: "applicator" },
  { nom: "propertyNames", forme: "schéma", vocabulaire: "applicator" },
  { nom: "not", forme: "schéma", vocabulaire: "applicator" },
  { nom: "if", forme: "schéma", vocabulaire: "applicator" },
  { nom: "then", forme: "schéma", vocabulaire: "applicator" },
  { nom: "else", forme: "schéma", vocabulaire: "applicator" },
  { nom: "unevaluatedItems", forme: "schéma", vocabulaire: "unevaluated" },
  { nom: "unevaluatedProperties", forme: "schéma", vocabulaire: "unevaluated" },
];

/**
 * LES MOTS-CLÉS QUE LE PARCOURS VISITE EN PLUS DU VOCABULAIRE, ET LEUR MOTIF.
 *
 * ⚠️ ILS SONT ÉCRITS, ET NON TOLÉRÉS EN SILENCE. Un « en plus » sans motif est
 *    une voiture-balai : la garde y rangerait, en trois relectures, tout ce
 *    qu'elle ne saurait pas classer. Un mot-clé visité qui n'est ni du
 *    vocabulaire ni de cette table fait ROUGIR — visiter un emplacement qui
 *    n'existe pas est au mieux du temps perdu, au pire un nom mal orthographié
 *    qui remplace celui qu'on croyait couvrir.
 */
const HORS_2020_12_ADMIS: readonly { readonly nom: string; readonly motif: string }[] = [
  {
    nom: "definitions",
    motif:
      "draft-07 — l'ancêtre de `$defs`. Un manifeste produit par un générateur qui n'a pas " +
      "migré le porte encore, et ses sous-schémas sont de vrais sous-schémas.",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  LA GARDE — UNE FONCTION PURE DES TROIS LISTES
// ─────────────────────────────────────────────────────────────────────────────

/** Les trois listes de `fermeture.ts`, telles qu'on les lui injecte. */
interface ListesDApplicateurs {
  readonly table: readonly string[];
  readonly liste: readonly string[];
  readonly schéma: readonly string[];
}

/** Ce que rend la confrontation. JAMAIS un booléen seul : les comptes d'abord. */
interface EcartDeCouverture {
  /** Combien de mots-clés la référence porte. Zéro rendrait la garde vacueuse. */
  readonly vocabulaireConfronte: number;
  /** Combien de mots-clés les trois listes portent en tout. */
  readonly parcourus: number;
  /** Ceux du vocabulaire qu'AUCUNE liste ne porte — le trou de couverture. */
  readonly jamaisParcourus: readonly string[];
  /** Ceux qui sont parcourus, mais dans la liste d'une AUTRE forme. */
  readonly malRanges: readonly string[];
  /** Ceux qui sont parcourus sans être ni du vocabulaire ni admis avec motif. */
  readonly horsVocabulaire: readonly string[];
  /** Ceux qui sont admis hors vocabulaire, avec motif écrit. Annoncés, jamais refusés. */
  readonly admisAvecMotif: readonly string[];
}

/**
 * CONFRONTE TROIS LISTES D'APPLICATEURS AU VOCABULAIRE DE 2020-12.
 *
 * ⚠️ C'EST UNE FONCTION PURE DES LISTES REÇUES, et c'est ce qui la rend
 *    ÉPROUVABLE. Une garde qui lirait `APPLICATEURS_OBJET` depuis son propre
 *    corps ne serait vérifiable qu'en mutilant `fermeture.ts` — c'est-à-dire
 *    jamais. Ici, le témoin lui passe des listes fabriquées.
 */
function ecartDeCouverture(listes: ListesDApplicateurs): EcartDeCouverture {
  const parForme: Record<FormeApplicateur, readonly string[]> = {
    table: listes.table,
    liste: listes.liste,
    schéma: listes.schéma,
  };
  const tous = [...listes.table, ...listes.liste, ...listes.schéma];
  const admis = new Set(HORS_2020_12_ADMIS.map(({ nom }) => nom));
  const duVocabulaire = new Set(VOCABULAIRE_2020_12.map(({ nom }) => nom));

  const jamaisParcourus: string[] = [];
  const malRanges: string[] = [];
  for (const { nom, forme } of VOCABULAIRE_2020_12) {
    if (!tous.includes(nom)) {
      jamaisParcourus.push(nom);
      continue;
    }
    if (!parForme[forme].includes(nom)) {
      malRanges.push(`${nom} (attendu en « ${forme} »)`);
    }
  }

  return {
    vocabulaireConfronte: VOCABULAIRE_2020_12.length,
    parcourus: tous.length,
    jamaisParcourus,
    malRanges,
    horsVocabulaire: tous.filter((nom) => !duVocabulaire.has(nom) && !admis.has(nom)),
    admisAvecMotif: tous.filter((nom) => admis.has(nom)),
  };
}

/** Les trois listes RÉELLES, importées de `fermeture.ts` et jamais recopiées. */
const LISTES_REELLES: ListesDApplicateurs = {
  table: APPLICATEURS_OBJET,
  liste: APPLICATEURS_LISTE,
  schéma: APPLICATEURS_DIRECTS,
};

describe("GARDE DE COUVERTURE — le parcours connaît tout le vocabulaire d'applicateurs 2020-12", () => {
  it("confronte les TROIS listes au vocabulaire, et ANNONCE les comptes", () => {
    const ecart = ecartDeCouverture(LISTES_REELLES);

    console.log(
      `[couverture applicateurs] ${String(ecart.vocabulaireConfronte)} mot(s)-clé(s) de 2020-12 ` +
        `confronté(s) · ${String(ecart.parcourus)} emplacement(s) parcouru(s) ` +
        `(${String(APPLICATEURS_OBJET.length)} table + ${String(APPLICATEURS_LISTE.length)} liste ` +
        `+ ${String(APPLICATEURS_DIRECTS.length)} schéma) · ` +
        `${String(ecart.jamaisParcourus.length)} jamais parcouru(s)` +
        (ecart.jamaisParcourus.length > 0 ? ` : ${ecart.jamaisParcourus.join(", ")}` : "") +
        ` · ${String(ecart.malRanges.length)} mal rangé(s)` +
        (ecart.malRanges.length > 0 ? ` : ${ecart.malRanges.join(", ")}` : "") +
        ` · ${String(ecart.admisAvecMotif.length)} hors 2020-12 admis avec motif : ` +
        `${ecart.admisAvecMotif.join(", ") || "aucun"}`,
    );

    // Planchers : une référence vidée rendrait « aucun écart » sur n'importe quoi.
    expect(ecart.vocabulaireConfronte, "plancher — la référence 2020-12").toBeGreaterThanOrEqual(
      18,
    );
    expect(ecart.parcourus, "plancher — les emplacements parcourus").toBeGreaterThanOrEqual(18);

    expect(
      ecart.jamaisParcourus,
      "un applicateur de 2020-12 qu'aucune des trois listes ne porte : un champ déclaré " +
        "là est INVISIBLE au § 20 pendant que le § 09 déclare le schéma FERMÉ",
    ).toEqual([]);
    expect(
      ecart.malRanges,
      "un applicateur rangé dans la liste d'une autre forme : il est parcouru DE TRAVERS, " +
        "et le compte de sous-schémas monte quand même",
    ).toEqual([]);
    expect(
      ecart.horsVocabulaire,
      "un emplacement parcouru qui n'est ni du vocabulaire 2020-12 ni admis avec motif " +
        "dans `HORS_2020_12_ADMIS` — une faute de frappe ressemble exactement à cela",
    ).toEqual([]);
  });

  it("TÉMOIN — retirer un applicateur, un par un, fait rougir la garde et le NOMME", () => {
    // ⚠️ LA GARDE CI-DESSUS EST VERTE. Elle ne vaut donc RIEN tant qu'on n'a pas
    //    montré qu'elle sait rougir — et pas sur un seul mot-clé choisi, mais sur
    //    CHACUN. Une garde qui n'attraperait que `dependentSchemas` aurait laissé
    //    passer exactement le défaut qu'elle est censée empêcher de revenir.
    const rates: string[] = [];
    for (const { nom, forme } of VOCABULAIRE_2020_12) {
      const ampute: ListesDApplicateurs = {
        table: LISTES_REELLES.table.filter((candidat) => forme !== "table" || candidat !== nom),
        liste: LISTES_REELLES.liste.filter((candidat) => forme !== "liste" || candidat !== nom),
        schéma: LISTES_REELLES.schéma.filter((candidat) => forme !== "schéma" || candidat !== nom),
      };
      if (!ecartDeCouverture(ampute).jamaisParcourus.includes(nom)) rates.push(nom);
    }

    console.log(
      `[témoin · applicateur retiré] ${String(VOCABULAIRE_2020_12.length)} mutilation(s) ` +
        `éprouvée(s) — une par mot-clé · ` +
        `${String(VOCABULAIRE_2020_12.length - rates.length)} détectée(s) · ` +
        `${String(rates.length)} manquée(s)` +
        (rates.length > 0 ? ` : ${rates.join(", ")}` : ""),
    );

    expect(VOCABULAIRE_2020_12.length, "plancher — des mutilations à éprouver").toBeGreaterThan(0);
    expect(rates, "un applicateur retiré que la garde ne voit pas partir").toEqual([]);
  });

  it("TÉMOIN — un applicateur rangé dans la MAUVAISE liste est vu comme mal rangé", () => {
    // `dependentSchemas` est une TABLE. Déplacé chez les directs, il reste
    // « parcouru » au sens naïf — c'est la forme d'oubli qu'un simple
    // `includes()` sur l'union des trois listes ne verrait jamais.
    const deplace: ListesDApplicateurs = {
      table: LISTES_REELLES.table.filter((nom) => nom !== "dependentSchemas"),
      liste: LISTES_REELLES.liste,
      schéma: [...LISTES_REELLES.schéma, "dependentSchemas"],
    };
    const ecart = ecartDeCouverture(deplace);

    console.log(
      `[témoin · mal rangé] ${String(ecart.jamaisParcourus.length)} jamais parcouru(s) · ` +
        `${String(ecart.malRanges.length)} mal rangé(s) : ${ecart.malRanges.join(", ") || "aucun"}`,
    );

    expect(ecart.jamaisParcourus, "il est bien parcouru — c'est le piège").toEqual([]);
    expect(ecart.malRanges).toEqual(["dependentSchemas (attendu en « table »)"]);
  });

  it("TÉMOIN — un emplacement inventé est vu comme hors vocabulaire", () => {
    // La faute de frappe qui remplace le mot-clé qu'on croyait couvrir.
    const faute: ListesDApplicateurs = {
      table: [...LISTES_REELLES.table, "dependantSchemas"],
      liste: LISTES_REELLES.liste,
      schéma: LISTES_REELLES.schéma,
    };
    const ecart = ecartDeCouverture(faute);

    console.log(
      `[témoin · hors vocabulaire] ${String(ecart.horsVocabulaire.length)} trouvé(s) : ` +
        `${ecart.horsVocabulaire.join(", ") || "aucun"} · ` +
        `${String(ecart.admisAvecMotif.length)} admis avec motif`,
    );

    expect(ecart.horsVocabulaire).toEqual(["dependantSchemas"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  LE DÉFAUT NOMMÉ, ÉPROUVÉ SUR SES DEUX FACES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Le schéma de l'adaptateur imaginaire : un envoi dont le CORPS n'est déclaré
 * que sous `dependentSchemas`.
 *
 * ⚠️ IL EST FERMÉ AUX DEUX NIVEAUX, et c'est ce qui rendait le défaut atteignable
 *    depuis un manifeste que l'admission accepte sans un mot : rien n'est
 *    « mal écrit » là-dedans, c'est du JSON Schema 2020-12 ordinaire.
 */
const ENVOI_A_CORPS_DEPENDANT: ValeurJson = {
  type: "object",
  properties: { mode: { type: "string", enum: ["courriel"] } },
  additionalProperties: false,
  dependentSchemas: {
    mode: {
      type: "object",
      properties: { corps: { type: "string" } },
      additionalProperties: false,
    },
  },
};

describe("`dependentSchemas` — le champ libre qui s'y cachait est vu des DEUX côtés", () => {
  it("§ 20 — un champ de texte libre déclaré sous `dependentSchemas` entre dans `libres`", () => {
    const analyse = analyserArgumentsDuSchema(ENVOI_A_CORPS_DEPENDANT, AUCUN_CHAMP_DE_GOUVERNANCE);
    const corps = analyse.libres.filter((champ) => champ.nom === "corps");

    console.log(
      `[§ 20 · dependentSchemas] ${String(analyse.sousSchemasInspectes)} sous-schéma(s) ` +
        `inspecté(s) · ${String(analyse.proprietesInspectees)} propriété(s) confrontée(s) · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) : ` +
        `${analyse.libres.map((champ) => champ.chemin).join(", ") || "aucun"} · ` +
        `porteUnArgumentLibre : ${String(analyse.porteUnArgumentLibre)}`,
    );

    // Cliquet : une analyse qui n'aurait rien parcouru rendrait « aucun champ
    // libre », ce qui est le verdict qu'on veut justement ne plus voir.
    expect(analyse.proprietesInspectees, "plancher — des propriétés confrontées").toBeGreaterThan(
      1,
    );
    expect(analyse.schemaIllisible, "le schéma est lisible").toBe(false);
    expect(
      corps.map((champ) => champ.chemin),
      "`corps` est un texte libre : le § 20 doit le voir, où qu'il soit déclaré",
    ).toEqual(["$.dependentSchemas.mode.properties.corps"]);
    expect(
      analyse.porteUnArgumentLibre,
      "sans ce booléen, la branche 4 de l'étape 11 ne demande AUCUNE confirmation",
    ).toBe(true);
  });

  it("§ 09 — un objet OUVERT sous `dependentSchemas` n'est plus déclaré fermé", () => {
    // La seconde face : le même emplacement, non fermé cette fois. Avant que le
    // parcours ne descende, `analyserFermeture` rendait `ferme: true` sur ce
    // schéma — il ne voyait aucun objet à fermer là où il n'allait pas.
    const ouvertLaDedans: ValeurJson = {
      type: "object",
      properties: { mode: { type: "string", enum: ["courriel"] } },
      additionalProperties: false,
      dependentSchemas: {
        mode: { type: "object", properties: { corps: { type: "string" } } },
      },
    };

    const verdict = analyserFermeture(ouvertLaDedans);

    console.log(
      `[§ 09 · dependentSchemas] ${String(verdict.sousSchemasInspectes)} sous-schéma(s) ` +
        `inspecté(s) · ${String(verdict.objetsAFermer)} objet(s) à fermer · ` +
        `fermé : ${String(verdict.ferme)} · ouvert(s) : ` +
        `${verdict.ouverts.join(", ") || "aucun"}`,
    );

    expect(verdict.objetsAFermer, "plancher — des objets à fermer").toBeGreaterThanOrEqual(2);
    expect(verdict.ouverts).toEqual(["$.dependentSchemas.mode"]);
    expect(verdict.ferme, "un objet ouvert sous `dependentSchemas` ouvre le schéma").toBe(false);
  });

  it("le parcours ATTEINT la table, et par le bon chemin", () => {
    const { trouves, profondeurDepassee } = sousSchemas(ENVOI_A_CORPS_DEPENDANT);
    const chemins = trouves.map(({ chemin }) => chemin);

    console.log(
      `[parcours · dependentSchemas] ${String(trouves.length)} sous-schéma(s) atteint(s) : ` +
        `${chemins.join(", ")} · profondeur dépassée : ${String(profondeurDepassee)}`,
    );

    expect(profondeurDepassee, "aucune borne de profondeur ici").toBe(false);
    // Le chemin porte le NOM de la branche : c'est ce qui rend un refus
    // actionnable (§ 15, deuxième règle) — « votre schéma est ouvert » n'apprend
    // rien, « ouvert en `$.dependentSchemas.mode` » se corrige sans chercher.
    expect(chemins).toContain("$.dependentSchemas.mode");
    expect(chemins).toContain("$.dependentSchemas.mode.properties.corps");
  });
});

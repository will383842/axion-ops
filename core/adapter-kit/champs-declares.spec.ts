import { describe, expect, it } from "vitest";

import {
  FORMATS_CONTRAIGNANTS,
  FORMATS_ECARTES_PAR_CAPACITE,
  analyserChampsDeclares,
  cumulerChampsDeGouvernance,
  estValeurLibre,
  occurrencesDuSchema,
  patternReferme,
  remedeIdFieldSansEffet,
} from "./champs-declares.js";
import type { ObjetJson, ValeurJson } from "./json.js";

/**
 * `core/adapter-kit/champs-declares` — CE QUE LE SOCLE CROIT D'UNE DÉCLARATION.
 *
 * Deux règles opposées, une seule fonction (ADR 0015 et ADR 0016) :
 *
 *  · `idFields` **retirerait** une surveillance → on ne le croit pas. Le schéma
 *    seul referme un champ, et la déclaration est au mieux ANNONCÉE sans effet.
 *  · `governanceFields` **ajoute** une surveillance → on le croit, et un nom qui
 *    ne désigne rien est une anomalie, parce que son auteur le croit appliqué.
 *
 * ── RÈGLE DE CE FICHIER ───────────────────────────────────────────────────
 * Chaque garde ANNONCE combien d'éléments elle a mesurés. Une garde qui n'a
 * rien regardé est verte pour la pire des raisons.
 */

/** Un schéma d'objet FERMÉ, comme `z.object({…}).strict()` en produit un. */
function schemaFerme(proprietes: Record<string, ValeurJson>): ValeurJson {
  return {
    type: "object",
    properties: proprietes,
    additionalProperties: false,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI REFERME UNE VALEUR — et ce qui en a seulement l'air
// ═════════════════════════════════════════════════════════════════════════════

describe("`estValeurLibre` — ce qui referme un champ, et ce qui fait semblant", () => {
  /**
   * Chaque cas dit sa FORME et ce qu'on en attend. La table est parcourue en
   * entier et le compte est annoncé : un tableau tronqué se verrait.
   */
  const CAS: readonly {
    readonly nom: string;
    readonly schema: ObjetJson;
    readonly libre: boolean;
  }[] = [
    { nom: "`{type:string}` nu", schema: { type: "string" }, libre: true },
    { nom: "sans `type` du tout", schema: { description: "rien" }, libre: true },
    { nom: "`enum`", schema: { type: "string", enum: ["a", "b"] }, libre: false },
    { nom: "`const`", schema: { type: "string", const: "a" }, libre: false },
    { nom: "`format: uuid`", schema: { type: "string", format: "uuid" }, libre: false },
    // ⚠️ ADR 0035 — `date-time` A CHANGÉ DE CAMP, ET C'EST LA DÉCISION. Sa forme
    //    canonique admet une fraction de seconde de longueur LIBRE, et `format`
    //    ne valide rien : il refermait un champ capable de tout porter, sans
    //    qu'un seul motif soit à écrire. Il referme encore, mais ACCOMPAGNÉ.
    {
      nom: "`format: date-time` seul",
      schema: { type: "string", format: "date-time" },
      libre: true,
    },
    {
      nom: "`format: date-time` + `maxLength`",
      schema: { type: "string", format: "date-time", maxLength: 40 },
      libre: false,
    },
    // ADR 0035 — le mot-clé le plus honnête des trois : le seul que JSON Schema
    // draft 2020-12 valide réellement.
    { nom: "`maxLength` sous la borne", schema: { type: "string", maxLength: 64 }, libre: false },
    { nom: "`maxLength` au-dessus", schema: { type: "string", maxLength: 65 }, libre: true },
    // ⚠️ LE CONTOURNEMENT EXACT TROUVÉ PAR L'AUDIT : ancré aux deux bouts,
    //    rejetant les TROIS témoins de prose, et admettant 2 000 caractères.
    {
      nom: "`pattern` ancré, sans accent, qui admet 2 000 caractères",
      schema: { type: "string", pattern: "^[A-Za-z0-9 ,.'()-]{1,2000}$" },
      libre: true,
    },
    // ⚠️ `format` est une ANNOTATION en draft 2020-12 : il ne valide rien. Un
    //    format inventé par l'adaptateur ne referme donc RIEN.
    { nom: "`format` inventé", schema: { type: "string", format: "texte-long" }, libre: true },
    // ⚠️ `uri` est un format VALIDE et il reste LIBRE : une URI transporte une
    //    chaîne de requête arbitraire. Le format est respecté et le contenu
    //    sort quand même — c'est la définition d'une exfiltration.
    { nom: "`format: uri`", schema: { type: "string", format: "uri" }, libre: true },
    {
      nom: "`pattern` ancré qui rejette la prose",
      schema: { type: "string", pattern: "^[0-9]{1,20}$" },
      libre: false,
    },
    // ⚠️ ANCRÉ DES DEUX CÔTÉS ET POURTANT VACANT : la présence d'un `pattern`
    //    ne prouve rien, seule la MESURE contre de la prose les distingue.
    {
      nom: "`pattern` vacant `^[\\s\\S]*$`",
      schema: { type: "string", pattern: "^[\\s\\S]*$" },
      libre: true,
    },
    {
      nom: "`pattern` non ancré",
      schema: { type: "string", pattern: "[0-9]+" },
      libre: true,
    },
    { nom: "`{type:number}`", schema: { type: "integer" }, libre: false },
    { nom: "`{type:boolean}`", schema: { type: "boolean" }, libre: false },
    {
      nom: "tableau de chaînes",
      schema: { type: "array", items: { type: "string" } },
      libre: true,
    },
    {
      nom: "tableau d'énumérations",
      schema: { type: "array", items: { type: "string", enum: ["a"] } },
      libre: false,
    },
    // ⚠️ L'OBJET LE PLUS PERMISSIF DE TOUT JSON SCHEMA — il ne déclare rien,
    //    donc il ne borne rien.
    { nom: "`{type:object}` nu", schema: { type: "object" }, libre: true },
    {
      nom: "objet à `additionalProperties` en forme de schéma",
      schema: { type: "object", additionalProperties: { type: "string" } },
      libre: true,
    },
    {
      nom: "objet fermé à propriétés déclarées",
      schema: {
        type: "object",
        properties: { a: { type: "string" } },
        additionalProperties: false,
      },
      libre: false,
    },
  ];

  it("juge chacune des formes, et ANNONCE combien elle en a confrontées", () => {
    const desaccords: string[] = [];
    for (const cas of CAS) {
      if (estValeurLibre(cas.schema) !== cas.libre) desaccords.push(cas.nom);
    }

    const libres = CAS.filter((cas) => cas.libre).length;
    console.log(
      `[garde valeur libre] ${String(CAS.length)} forme(s) confrontée(s) · ` +
        `${String(libres)} attendue(s) LIBRE(s) · ${String(CAS.length - libres)} FERMÉE(s) · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Plancher-témoin : une table vidée ne peut pas rendre cette garde verte.
    expect(CAS.length, "plancher-témoin").toBeGreaterThanOrEqual(15);
    expect(libres, "des deux côtés, sinon la garde ne mesure qu'un sens").toBeGreaterThanOrEqual(5);
    expect(CAS.length - libres).toBeGreaterThanOrEqual(5);
    expect(desaccords).toEqual([]);
  });

  it("refuse un `pattern` qui ne compile pas — fail-closed", () => {
    // Un motif venu d'un dépôt tiers peut employer une syntaxe qu'ECMAScript ne
    // connaît pas. Le tenir pour une fermeture serait ouvrir la porte la plus
    // facile à fabriquer.
    const illisible = "^(?<=truc)$[";
    console.log(
      `[garde motif illisible] « ${illisible} » referme : ${String(patternReferme(illisible))}`,
    );
    expect(patternReferme(illisible)).toBe(false);
    expect(estValeurLibre({ type: "string", pattern: illisible })).toBe(true);
  });

  it("porte une liste de `format` NON VIDE, et AUCUN des écartés de l'ADR 0035", () => {
    const revenus = FORMATS_ECARTES_PAR_CAPACITE.filter((format) =>
      FORMATS_CONTRAIGNANTS.has(format),
    );

    console.log(
      `[garde formats] ${String(FORMATS_CONTRAIGNANTS.size)} format(s) contraignant(s) : ` +
        `${[...FORMATS_CONTRAIGNANTS].join(", ")} · ` +
        `${String(FORMATS_ECARTES_PAR_CAPACITE.length)} écarté(s) par l'ADR 0035 · ` +
        `${String(revenus.length)} revenu(s) en service`,
    );

    // Plancher : la fermeture par format n'a pas été vidée.
    expect(FORMATS_CONTRAIGNANTS.size).toBeGreaterThanOrEqual(4);
    // `uri` est EXCLU délibérément — voir la note du module.
    expect(FORMATS_CONTRAIGNANTS.has("uri")).toBe(false);
    // ⚠️ LA LISTE CONFRONTÉE EST DÉRIVÉE DU MODULE, jamais recopiée : un écarté
    //    remis en service rougit ici au lieu de rouvrir le contournement le plus
    //    court du dépôt.
    expect(
      revenus,
      "un `format` de longueur LIBRE est revenu dans la liste des contraignants (ADR 0035)",
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE PARCOURS — à toute profondeur, et le même que celui du § 09
// ═════════════════════════════════════════════════════════════════════════════

describe("`occurrencesDuSchema` — les propriétés, à toute profondeur", () => {
  it("descend dans les sous-schémas et ANNONCE ce qu'il a visité", () => {
    const schema = schemaFerme({
      requete: { type: "string" },
      options: schemaFerme({ ttl: { type: "integer" } }),
    });

    const { occurrences, sousSchemasInspectes, profondeurDepassee } = occurrencesDuSchema(schema);
    const noms = occurrences.map((occurrence) => occurrence.nom).sort();

    console.log(
      `[garde parcours] ${String(sousSchemasInspectes)} sous-schéma(s) visité(s) · ` +
        `${String(occurrences.length)} propriété(s) lue(s) : ${noms.join(", ")}`,
    );

    expect(sousSchemasInspectes).toBeGreaterThanOrEqual(3);
    expect(noms).toEqual(["options", "requete", "ttl"]);
    expect(profondeurDepassee).toBe(false);
    // Un objet fermé à propriétés déclarées n'est pas une valeur libre.
    expect(occurrences.find((champ) => champ.nom === "options")?.libre).toBe(false);
    expect(occurrences.find((champ) => champ.nom === "ttl")?.libre).toBe(false);
    expect(occurrences.find((champ) => champ.nom === "requete")?.libre).toBe(true);
  });

  it("rend TOUTES les occurrences d'un même nom, pas la première", () => {
    // Le même nom, deux fois, avec deux sous-schémas différents : c'est ce que
    // `anyOf` produit, et c'est le cas où conclure sur une seule occurrence
    // dirait le contraire de ce que fait la garde du § 20.
    const schema = {
      anyOf: [
        schemaFerme({ cle: { type: "string", format: "uuid" } }),
        schemaFerme({ cle: { type: "string" } }),
      ],
    } as unknown as ValeurJson;

    const { occurrences } = occurrencesDuSchema(schema);
    const cle = occurrences.filter((champ) => champ.nom === "cle");

    console.log(
      `[garde occurrences] « cle » vue ${String(cle.length)} fois · ` +
        `libre : ${cle.map((champ) => String(champ.libre)).join(", ")}`,
    );

    expect(cle.length).toBe(2);
    expect(cle.map((champ) => champ.libre).sort()).toEqual([false, true]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0015 — `idFields` n'exonère rien, et l'analyse le DIT
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0015 — un `idFields` est confronté au schéma, jamais cru", () => {
  it("range un identifiant REFERMÉ par le schéma dans les fermés", () => {
    const schema = schemaFerme({ submissionId: { type: "string", format: "uuid" } });
    const verdict = analyserChampsDeclares(schema, {
      idFields: ["submissionId"],
      governanceFields: [],
    });

    console.log(
      `[garde idFields fermé] ${String(verdict.idFieldsDeclares)} déclaré(s) · ` +
        `${String(verdict.idFieldsConfrontes.length)} confronté(s) · ` +
        `${String(verdict.idFieldsFermes.length)} fermé(s) · ` +
        `${String(verdict.idFieldsSansEffet.length)} sans effet`,
    );

    expect(verdict.idFieldsConfrontes.map((champ) => champ.nom)).toEqual(["submissionId"]);
    expect(verdict.idFieldsFermes.map((champ) => champ.nom)).toEqual(["submissionId"]);
    expect(verdict.idFieldsSansEffet).toEqual([]);
    expect(verdict.idFieldsIntrouvables).toEqual([]);
  });

  it("range un identifiant LAISSÉ LIBRE dans les sans-effet, avec ses chemins", () => {
    const schema = schemaFerme({ requete: { type: "string" } });
    const verdict = analyserChampsDeclares(schema, {
      idFields: ["requete"],
      governanceFields: [],
    });

    console.log(
      `[garde idFields sans effet] ${String(verdict.proprietesInspectees)} propriété(s) lue(s) · ` +
        `sans effet : ${verdict.idFieldsSansEffet.map((champ) => champ.nom).join(", ")} ` +
        `(${verdict.idFieldsSansEffet.flatMap((champ) => champ.chemins).join(", ")})`,
    );

    expect(verdict.idFieldsSansEffet.map((champ) => champ.nom)).toEqual(["requete"]);
    expect(verdict.idFieldsSansEffet[0]?.chemins).toEqual(["$.properties.requete"]);
    expect(verdict.idFieldsFermes).toEqual([]);
  });

  it("tient pour SANS EFFET un nom refermé quelque part et libre ailleurs", () => {
    // ⚠️ UNE SEULE OCCURRENCE LIBRE SUFFIT. L'étape 11 verse chaque occurrence
    //    libre dans ses arguments libres : conclure « fermé » sur la meilleure
    //    des occurrences dirait le contraire de ce que la garde fera.
    const schema = {
      anyOf: [
        schemaFerme({ cle: { type: "string", format: "uuid" } }),
        schemaFerme({ cle: { type: "string" } }),
      ],
    } as unknown as ValeurJson;

    const verdict = analyserChampsDeclares(schema, { idFields: ["cle"], governanceFields: [] });

    console.log(
      `[garde occurrence la plus faible] « cle » : ` +
        `${String(verdict.idFieldsSansEffet.length)} sans effet, ` +
        `${String(verdict.idFieldsFermes.length)} fermé(s)`,
    );

    expect(verdict.idFieldsSansEffet.map((champ) => champ.nom)).toEqual(["cle"]);
    expect(verdict.idFieldsFermes).toEqual([]);
  });

  it("signale un `idFields` qui ne désigne AUCUNE propriété", () => {
    const schema = schemaFerme({ limite: { type: "integer" } });
    const verdict = analyserChampsDeclares(schema, {
      idFields: ["submissionId"],
      governanceFields: [],
    });

    console.log(
      `[garde idFields introuvable] ${String(verdict.nomsDistincts)} nom(s) au schéma : ` +
        `${verdict.nomsDuSchema.join(", ")} · introuvable(s) : ` +
        verdict.idFieldsIntrouvables.join(", "),
    );

    expect(verdict.idFieldsIntrouvables).toEqual(["submissionId"]);
    expect(verdict.idFieldsConfrontes).toEqual([]);
  });

  it("rend un remède ACTIONNABLE — pas « champ non fermé »", () => {
    const message = remedeIdFieldSansEffet("requete");
    console.log(
      `[garde message] ${String(message.length)} caractère(s) : ${message.slice(0, 90)}…`,
    );

    // Il doit NOMMER le champ, et dire quoi ÉCRIRE — § 15, deuxième règle.
    expect(message).toContain("requete");
    expect(message).toContain("pattern");
    expect(message).toContain("uuid");
    expect(message).toContain("z.string()");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ADR 0016 — `governanceFields` est cru, donc il doit désigner quelque chose
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0016 — un `governanceFields` qui ne désigne rien est une anomalie", () => {
  it("confronte un champ de gouvernance qui EXISTE", () => {
    const schema = schemaFerme({
      destinataire: { type: "string" },
      corps: { type: "string" },
    });
    const verdict = analyserChampsDeclares(schema, {
      idFields: [],
      governanceFields: ["destinataire"],
    });

    console.log(
      `[garde gouvernance confrontée] ${String(verdict.governanceFieldsDeclares)} déclaré(s) · ` +
        `${String(verdict.governanceFieldsConfrontes.length)} confronté(s) · ` +
        `${String(verdict.governanceFieldsIntrouvables.length)} introuvable(s)`,
    );

    expect(verdict.governanceFieldsConfrontes.map((champ) => champ.nom)).toEqual(["destinataire"]);
    expect(verdict.governanceFieldsIntrouvables).toEqual([]);
  });

  it("retient un champ de gouvernance INTROUVABLE — le no-op muet", () => {
    const schema = schemaFerme({ destinataire: { type: "string" } });
    const verdict = analyserChampsDeclares(schema, {
      idFields: [],
      governanceFields: ["destinataireX"],
    });

    console.log(
      `[garde gouvernance introuvable] schéma : ${verdict.nomsDuSchema.join(", ")} · ` +
        `introuvable(s) : ${verdict.governanceFieldsIntrouvables.join(", ")}`,
    );

    expect(verdict.governanceFieldsIntrouvables).toEqual(["destinataireX"]);
    expect(verdict.governanceFieldsConfrontes).toEqual([]);
  });

  it("relève les doublons de CHAQUE liste, séparément", () => {
    const schema = schemaFerme({ a: { type: "string" }, b: { type: "string" } });
    const verdict = analyserChampsDeclares(schema, {
      idFields: ["a", "a"],
      governanceFields: ["b", "b"],
    });

    console.log(
      `[garde doublons] idFields : ${verdict.idFieldsEnDouble.join(", ")} · ` +
        `governanceFields : ${verdict.governanceFieldsEnDouble.join(", ")}`,
    );

    expect(verdict.idFieldsEnDouble).toEqual(["a"]);
    expect(verdict.governanceFieldsEnDouble).toEqual(["b"]);
  });

  it("est FAIL-CLOSED sur un schéma illisible : rien n'y est confronté", () => {
    // Un schéma qui n'est pas un objet ne déclare aucune propriété : tout nom
    // déclaré y devient introuvable, donc refusé plus haut. C'est la direction
    // voulue — un document qu'on ne sait pas lire n'est pas un document sûr.
    const verdict = analyserChampsDeclares("pas un schéma", {
      idFields: ["a"],
      governanceFields: ["b"],
    });

    console.log(
      `[garde schéma illisible] ${String(verdict.sousSchemasInspectes)} sous-schéma(s) · ` +
        `${String(verdict.proprietesInspectees)} propriété(s) · ` +
        `gouvernance introuvable(s) : ${verdict.governanceFieldsIntrouvables.join(", ")}`,
    );

    expect(verdict.proprietesInspectees).toBe(0);
    expect(verdict.governanceFieldsIntrouvables).toEqual(["b"]);
    expect(verdict.idFieldsIntrouvables).toEqual(["a"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE CUMUL — une déclaration ne peut QU'AJOUTER
// ═════════════════════════════════════════════════════════════════════════════

describe("`cumulerChampsDeGouvernance` — l'union, et rien d'autre", () => {
  it("ajoute ce que la déclaration apporte, et ANNONCE les trois comptes", () => {
    const cumul = cumulerChampsDeGouvernance(["to", "ttl"], ["emailTo", "to"]);

    console.log(
      `[garde cumul] ${String(cumul.retenusParLeNom)} retenu(s) par le nom · ` +
        `${String(cumul.declares)} déclaré(s) · ` +
        `${String(cumul.ajoutesParLaDeclaration.length)} ajouté(s) · ` +
        `${String(cumul.union.length)} dans l'union · ` +
        `${String(cumul.perdus.length)} perdu(s)`,
    );

    expect(cumul.union).toEqual(["to", "ttl", "emailTo"]);
    expect(cumul.ajoutesParLaDeclaration).toEqual(["emailTo"]);
    expect(cumul.perdus).toEqual([]);
  });

  it("garde INTACT le filet quand la déclaration est vide", () => {
    const filet = ["to", "ttl", "slot", "policyLevel", "enabled"];
    const cumul = cumulerChampsDeGouvernance(filet, []);

    console.log(
      `[garde filet seul] ${String(cumul.retenusParLeNom)} retenu(s) par le nom · ` +
        `${String(cumul.union.length)} dans l'union · ${String(cumul.perdus.length)} perdu(s)`,
    );

    expect(cumul.union).toEqual(filet);
    expect(cumul.perdus).toEqual([]);
  });

  it("ne perd RIEN quand la déclaration ESSAIE de restreindre — le témoin du retrait", () => {
    // ⚠️ LE TÉMOIN CENTRAL DE L'ADR 0016. Un adaptateur qui déclarerait « seul
    //    `emailTo` est de gouvernance » tente, de fait, de RETIRER `to` et `ttl`
    //    de la surveillance. L'union le lui refuse — et le compte `perdus` est
    //    rendu pour que ce refus se MESURE, au lieu de se lire dans le code.
    const filet = ["to", "ttl"];
    const cumul = cumulerChampsDeGouvernance(filet, ["emailTo"]);

    console.log(
      `[témoin retrait] filet : ${filet.join(", ")} · déclaration : emailTo · ` +
        `union : ${cumul.union.join(", ")} · perdus : ${String(cumul.perdus.length)}`,
    );

    for (const nom of filet) expect(cumul.union).toContain(nom);
    expect(cumul.perdus).toEqual([]);
  });

  it("compte les noms DISTINCTS, jamais les répétitions", () => {
    const cumul = cumulerChampsDeGouvernance(["to", "to"], ["to", "emailTo", "emailTo"]);

    console.log(
      `[garde distincts] retenus ${String(cumul.retenusParLeNom)} · ` +
        `déclarés ${String(cumul.declares)} · union ${String(cumul.union.length)}`,
    );

    expect(cumul.retenusParLeNom).toBe(1);
    expect(cumul.declares).toBe(2);
    expect(cumul.union).toEqual(["to", "emailTo"]);
  });
});

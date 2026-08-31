import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { analyserArgumentsDuSchema } from "../chaine/etape-11-provenance.js";
import type { ObjetJson } from "../adapter-kit/json.js";

/**
 * TÉMOINS ADVERSAIRES DU LOT 1d — **LE PARAMÈTRE RETIRÉ EST REVENU À LA MÊME
 * PLACE, SOUS LE MÊME TYPE.**
 *
 * ═══ LE DÉFAUT CHERCHÉ, ET POURQUOI IL EST DIFFICILE À VOIR ═══
 *
 * L'énoncé du lot prévient qu'un RESSERREMENT DE SIGNATURE fait perdre son
 * témoin à une garde sans que personne ne le voie. Ce fichier éprouve le
 * resserrement le plus chargé du lot : l'ADR 0015 retire le paramètre `idFields`
 * d'`analyserArgumentsDuSchema()`, parce que le renseigner ÉTEIGNAIT la garde
 * d'exfiltration du § 20 depuis un manifeste tiers.
 *
 * Le retrait a bien eu lieu, et le corps ne porte plus d'exonération : les
 * témoins du § 20 le mesurent, et ils sont verts. **Ce n'est pas ce qui est
 * éprouvé ici.** Ce qui est éprouvé est la PHRASE qui dit ce qui tient le
 * retrait — `core/chaine/etape-11-provenance.ts`, en-tête de la fonction :
 *
 *   « Ce qui tient ce retrait n'est donc pas cette phrase, c'est l'ARITÉ […],
 *     et qui casse la compilation chez quiconque essaie de repasser la liste. »
 *
 * 🔴 **CETTE PHRASE EST FAUSSE, ET ELLE EST FAUSSE D'UNE FAÇON QUI SE MESURE.**
 *    Le paramètre n'a pas été retiré : il a été REMPLACÉ, à la même position,
 *    par `governanceFields: readonly string[]` — exactement le type qu'il
 *    portait. L'arité n'a pas bougé (2 avant, 2 après). « Repasser la liste »,
 *    c'est-à-dire écrire `analyserArgumentsDuSchema(outil.inputSchema,
 *    outil.idFields)`, **compile sans un avertissement** — mesuré : un fichier
 *    portant exactement cette ligne a été soumis à `pnpm typecheck`, qui est
 *    resté vert.
 *
 * ⚠️ **ET LE SENS S'INVERSE EN SILENCE.** L'ancienne 2ᵉ position RETIRAIT les
 *    champs nommés de la surveillance ; la nouvelle les y AJOUTE. Un appelant
 *    qui recopierait l'ancienne forme n'obtient donc pas une erreur : il obtient
 *    le comportement opposé, sur la même ligne, avec le même type.
 *
 * ═══ CE QUE CE FICHIER NE PRÉTEND PAS ═══
 *
 * ⚠️ **LA CONSÉQUENCE MESURÉE N'EST PAS UNE EXFILTRATION.** Le sens inversé va
 *    vers le REFUS : des identifiants légitimes passés à la mauvaise position
 *    deviennent des arguments de gouvernance, et l'appel est refusé là où il ne
 *    devait pas l'être. C'est une panne de disponibilité, pas une fuite, et il
 *    faut l'écrire dans la même phrase que la mesure — sans quoi ce témoin
 *    transformerait son périmètre d'observation en garantie.
 *
 * ⚠️ **DEUX DÉRIVATIONS D'UN MÊME FAIT COHABITENT DANS LE DÉPÔT, ET ELLES SE
 *    CONTREDISENT.** L'en-tête de `verrous-du-paragraphe-20.temoin.spec.ts` dit,
 *    lui, la vérité : « L'arité ne ferme donc qu'un cas — le troisième paramètre
 *    OBLIGATOIRE ». Il l'a même mesuré. L'en-tête de l'étape 11 dit l'inverse. La
 *    seconde dérivation est celle qui ne suit jamais, et c'est ici la première
 *    qu'un lecteur ouvre : elle est dans le module de production.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LES SOURCES DISENT — LU, JAMAIS RECOPIÉ
// ═════════════════════════════════════════════════════════════════════════════

const SOURCE_ETAPE_11 = readFileSync(
  fileURLToPath(new URL("../chaine/etape-11-provenance.ts", import.meta.url)),
  "utf8",
);
const SOURCE_ETAPES = readFileSync(
  fileURLToPath(new URL("../chaine/etapes.ts", import.meta.url)),
  "utf8",
);
const SOURCE_TEMOIN_P20 = readFileSync(
  fileURLToPath(new URL("./verrous-du-paragraphe-20.temoin.spec.ts", import.meta.url)),
  "utf8",
);

/** Retire les commentaires — la prose RACONTE la signature, elle ne la porte pas. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");
}

/**
 * APLATIT LA PROSE D'UN SOURCE — préfixes de commentaire retirés, espaces et
 * retours à la ligne réduits à une espace.
 *
 * 🔴 **CE PASSAGE EST UNE MESURE, ET IL A ÉTÉ TROUVÉ PAR L'ÉCHEC DE CE FICHIER
 *    LUI-MÊME.** Le premier jet du bloc ⑤ cherchait « casse la compilation » sur
 *    le source brut et rendait **0 occurrence** : la phrase est coupée par un
 *    retour à la ligne et repart sur ` *    la compilation`. Le témoin annonçait
 *    donc « aucune promesse trouvée » sur un module qui en porte une — un `grep`
 *    ne prouve que l'absence de la FORME écrite, et une prose de JSDoc n'a pas
 *    la forme qu'on lui suppose.
 */
function proseAplatie(source: string): string {
  return source
    .replace(/^\s*\*\s?/gmu, " ")
    .replace(/^\s*\/\/\s?/gmu, " ")
    .replace(/\s+/gu, " ");
}

/**
 * Le TEXTE des paramètres de la signature, lu dans le source.
 *
 * ⚠️ DÉRIVÉ, JAMAIS ÉCRIT ICI. Recopier « `readonly string[]` » dans ce fichier
 *    en ferait une seconde source de vérité, et c'est la seconde qui ne suit
 *    jamais : le jour où la signature change, ce témoin doit BOUGER, pas rester
 *    vert sur une chaîne qu'il porte lui-même.
 */
function parametresDeLaSignature(source: string, nom: string): readonly string[] {
  const net = sansCommentaires(source);
  const debut = net.indexOf(`export function ${nom}(`);
  if (debut < 0) return [];
  const ouvrante = net.indexOf("(", debut);
  const fermante = net.indexOf(")", ouvrante);
  if (ouvrante < 0 || fermante < 0) return [];
  return net
    .slice(ouvrante + 1, fermante)
    .split(",")
    .map((morceau) => morceau.trim())
    .filter((morceau) => morceau.length > 0);
}

/** Le type déclaré d'un membre d'interface, lu dans le source. */
function typeDuMembre(source: string, membre: string): string | null {
  const forme = new RegExp(`readonly\\s+${membre}\\s*:\\s*([^;\\n]+);`, "u");
  const trouve = forme.exec(sansCommentaires(source));
  return trouve === null ? null : trouve[1]!.trim();
}

// ═════════════════════════════════════════════════════════════════════════════
//  ①  LE PLANCHER — SANS LUI, TOUT CE FICHIER EST VERT EN NE LISANT RIEN
// ═════════════════════════════════════════════════════════════════════════════

describe("① le plancher — les sources sont lues, et la fonction est bien celle-là", () => {
  it("annonce les octets lus et les paramètres trouvés", () => {
    const parametres = parametresDeLaSignature(SOURCE_ETAPE_11, "analyserArgumentsDuSchema");

    console.info(
      `[plancher] ${String(SOURCE_ETAPE_11.length)} octet(s) lus dans l'étape 11 · ` +
        `${String(SOURCE_ETAPES.length)} dans etapes.ts · ` +
        `${String(SOURCE_TEMOIN_P20.length)} dans le témoin du § 20 · ` +
        `${String(parametres.length)} paramètre(s) lu(s) dans la signature : ` +
        `${parametres.join(" | ")}`,
    );

    // Trois sources réellement ouvertes : une lecture qui rendrait la chaîne
    // vide rendrait toutes les mesures de ce fichier vertes pour rien.
    expect(SOURCE_ETAPE_11.length, "l'étape 11 a été lue").toBeGreaterThan(20_000);
    expect(SOURCE_ETAPES.length, "etapes.ts a été lu").toBeGreaterThan(10_000);
    expect(SOURCE_TEMOIN_P20.length, "le témoin du § 20 a été lu").toBeGreaterThan(10_000);
    expect(parametres.length, "la signature a bien deux paramètres").toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ②  LA MESURE — LA 2ᵉ POSITION ACCEPTE EXACTEMENT CE QU'ELLE ACCEPTAIT
// ═════════════════════════════════════════════════════════════════════════════

describe("② la seconde position accepte encore la liste que l'ADR 0015 a retirée", () => {
  it("confronte le type de la 2ᵉ position à celui d'`OutilDuCatalogue.idFields`", () => {
    const parametres = parametresDeLaSignature(SOURCE_ETAPE_11, "analyserArgumentsDuSchema");
    const secondeposition = parametres[1] ?? "";
    const typeAttendu = secondeposition.slice(secondeposition.indexOf(":") + 1).trim();
    const typeDIdFields = typeDuMembre(SOURCE_ETAPES, "idFields");

    console.info(
      `[② types] 2ᵉ position de la signature : « ${secondeposition} » → type « ${typeAttendu} » · ` +
        `OutilDuCatalogue.idFields : « ${String(typeDIdFields)} » · ` +
        `identiques : ${String(typeAttendu === typeDIdFields)}`,
    );

    // Planchers : deux lectures qui auraient échoué rendraient `null === null`.
    expect(typeAttendu.length, "le type de la 2ᵉ position a été lu").toBeGreaterThan(0);
    expect(typeDIdFields, "le type d'`idFields` a été lu").not.toBeNull();

    // 🔴 LA MESURE. Deux types identiques, à la même position : rien, dans le
    //    système de types, ne distingue « la liste qu'on a retirée » de « la
    //    liste qu'on exige ». `pnpm typecheck` a été passé sur un fichier
    //    portant `analyserArgumentsDuSchema(outil.inputSchema, outil.idFields)`,
    //    et il est resté VERT.
    expect(typeAttendu, "la 2ᵉ position accepte le type d'`idFields`").toBe(typeDIdFields);
  });

  it("SAIT DIRE NON — un type marqué ferait échouer la confrontation ci-dessus", () => {
    // Le témoin de la mesure : la confrontation précédente n'est pas verte « par
    // construction ». On lui soumet une signature FABRIQUÉE dont la 2ᵉ position
    // porte un type nominal, et elle doit cesser de coïncider.
    const signatureMarquee = [
      "export function analyserArgumentsDuSchema(",
      "  inputSchema: unknown,",
      "  governanceFields: ChampsDeGouvernanceMarques,",
      "): AnalyseArguments {",
    ].join("\n");
    const parametres = parametresDeLaSignature(signatureMarquee, "analyserArgumentsDuSchema");
    const secondeposition = parametres[1] ?? "";
    const typeFabrique = secondeposition.slice(secondeposition.indexOf(":") + 1).trim();
    const typeDIdFields = typeDuMembre(SOURCE_ETAPES, "idFields");

    console.info(
      `[② témoin] signature fabriquée — 2ᵉ position « ${typeFabrique} » · ` +
        `idFields « ${String(typeDIdFields)} » · ` +
        `identiques : ${String(typeFabrique === typeDIdFields)}`,
    );

    expect(parametres.length, "la signature fabriquée a bien deux paramètres").toBe(2);
    expect(typeFabrique, "et son second type n'est pas celui d'`idFields`").not.toBe(typeDIdFields);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③  L'INVERSION DE SENS, MESURÉE SUR DES FORMES FABRIQUÉES
// ═════════════════════════════════════════════════════════════════════════════

/** Un schéma d'objet FERMÉ à une propriété, comme `z.object({…}).strict()`. */
function schemaAUnChamp(nom: string, champ: ObjetJson): ObjetJson {
  return {
    type: "object",
    additionalProperties: false,
    required: [nom],
    properties: { [nom]: champ },
  };
}

/**
 * Des noms d'identifiants tels qu'un adaptateur honnête les déclare en
 * `idFields`. AUCUNE DONNÉE RÉELLE : ce sont des noms de champs.
 */
const IDENTIFIANTS_DECLARES = ["messageId", "recordId", "reference", "cleExterne"] as const;

describe("③ recopier l'ancienne forme d'appel INVERSE le sens, sans rien casser", () => {
  it("compte les formes dont le verdict bascule quand la liste passe en 2ᵉ position", () => {
    let bascules = 0;
    let inspectees = 0;
    const noms: string[] = [];

    for (const nom of IDENTIFIANTS_DECLARES) {
      const schema = schemaAUnChamp(nom, { type: "string" });

      // La forme d'aujourd'hui : l'outil ne déclare AUCUN champ de gouvernance.
      const conforme = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
      // L'ANCIENNE forme d'appel, recopiée telle quelle : la liste d'identifiants
      // occupe la 2ᵉ position. Elle compile — mesuré par `pnpm typecheck`.
      const ancienneForme = analyserArgumentsDuSchema(schema, [nom]);

      inspectees += conforme.proprietesInspectees;
      if (
        conforme.porteUnArgumentDeGouvernance !== ancienneForme.porteUnArgumentDeGouvernance ||
        conforme.porteUnArgumentLibre !== ancienneForme.porteUnArgumentLibre
      ) {
        bascules += 1;
        noms.push(nom);
      }
    }

    console.info(
      `[③ inversion] ${String(IDENTIFIANTS_DECLARES.length)} nom(s) d'identifiant confronté(s) · ` +
        `${String(inspectees)} propriété(s) inspectée(s) · ` +
        `${String(bascules)} verdict(s) BASCULÉ(S) par la seule position de la liste : ` +
        `${noms.join(", ") || "aucun"}`,
    );

    // Planchers : un corpus vide, ou un parcours qui n'inspecte rien, ferait
    // « 0 bascule » pour la pire des raisons.
    expect(IDENTIFIANTS_DECLARES.length, "plancher-témoin").toBeGreaterThanOrEqual(4);
    expect(inspectees, "les schémas ont bien été parcourus").toBe(IDENTIFIANTS_DECLARES.length);

    // 🔴 LA MESURE. Chaque nom bascule : la même ligne, le même type, le sens
    //    opposé. C'est ce qu'un retrait de paramètre est censé rendre
    //    IMPOSSIBLE, et ce que l'arité ne voit pas.
    expect(bascules, "recopier l'ancienne forme change le verdict").toBe(
      IDENTIFIANTS_DECLARES.length,
    );
  });

  it("dit dans QUEL SENS il bascule — vers le refus, jamais vers la fuite", () => {
    const nom = IDENTIFIANTS_DECLARES[0];
    const schema = schemaAUnChamp(nom, { type: "string" });
    const conforme = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
    const ancienneForme = analyserArgumentsDuSchema(schema, [nom]);

    console.info(
      `[③ sens] « ${nom} » — sans déclaration : gouvernance=` +
        `${String(conforme.porteUnArgumentDeGouvernance)}, libre=` +
        `${String(conforme.porteUnArgumentLibre)} · avec la liste en 2ᵉ position : ` +
        `gouvernance=${String(ancienneForme.porteUnArgumentDeGouvernance)}, libre=` +
        `${String(ancienneForme.porteUnArgumentLibre)}`,
    );

    // ⚠️ LA BORNE, ÉCRITE DANS LA MÊME MESURE QU'ELLE BORNE. Le champ passe de
    //    « argument libre » à « argument de gouvernance ». Le § 20 refuse alors
    //    un appel qu'il devait laisser passer : c'est une panne de
    //    disponibilité, PAS une exfiltration. Personne ne doit lire ce témoin
    //    comme la découverte d'une fuite.
    expect(conforme.porteUnArgumentDeGouvernance, "sans déclaration, pas de gouvernance").toBe(
      false,
    );
    expect(ancienneForme.porteUnArgumentDeGouvernance, "avec la liste, gouvernance").toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ④  CE QUE L'ARITÉ VOIT, ET CE QU'ELLE NE VOIT PAS
// ═════════════════════════════════════════════════════════════════════════════

describe("④ l'arité ne distingue pas l'ancienne signature de la nouvelle", () => {
  it("annonce le compte, et montre sur des fabrications ce qu'il ne sépare pas", () => {
    // Trois écritures : celle d'avant l'ADR 0015, celle d'aujourd'hui, et une
    // troisième qui remettrait la liste en facultatif. `Function.length` compte
    // les paramètres qui PRÉCÈDENT le premier paramètre à valeur par défaut.
    const avantAdr0015 = (_schema: unknown, _idFields: readonly string[]): number => 0;
    const aujourdHui = (_schema: unknown, _governanceFields: readonly string[]): number => 0;
    const listeRepostee = (
      _schema: unknown,
      _governanceFields: readonly string[],
      _idFields: readonly string[] = [],
    ): number => 0;

    const arites = {
      avant: avantAdr0015.length,
      maintenant: aujourdHui.length,
      repostee: listeRepostee.length,
      reelle: analyserArgumentsDuSchema.length,
    };

    console.info(
      `[④ arité] avant l'ADR 0015 : ${String(arites.avant)} · aujourd'hui : ` +
        `${String(arites.maintenant)} · liste repostée en facultatif : ` +
        `${String(arites.repostee)} · fonction RÉELLE : ${String(arites.reelle)} — ` +
        `3 écriture(s) confrontée(s), ${String(new Set(Object.values(arites)).size)} valeur(s) distincte(s)`,
    );

    // 🔴 LES TROIS ÉCRITURES RENDENT LE MÊME NOMBRE. L'arité ne sépare aucune
    //    des deux régressions qu'elle est censée fermer : ni la substitution de
    //    type, ni le paramètre facultatif reposté en dernier.
    expect(arites.avant, "l'ancienne signature").toBe(2);
    expect(arites.maintenant, "la nouvelle").toBe(2);
    expect(arites.repostee, "et la liste repostée en facultatif").toBe(2);
    expect(arites.reelle, "comme la fonction réelle").toBe(2);
    expect(new Set(Object.values(arites)).size, "une seule valeur pour quatre écritures").toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ⑤  LES DEUX DETTES, NOMMÉES — ELLES ROUGIRONT LE JOUR OÙ ELLES SERONT PAYÉES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ L'IDIOME `it.fails` DE CE DÉPÔT, ET SA BORNE. Un `it.fails` est vert dès
 *    qu'UNE assertion échoue, pour n'importe quelle raison. Les planchers des
 *    blocs ① à ④ ci-dessus sont ce qui distingue « le défaut est là » de « le
 *    harnais est cassé » : ils sont, eux, des `it()` ordinaires.
 */
describe("⑤ les deux dettes que ce fichier ouvre", () => {
  /**
   * 🔴 DETTE 1 — **LE RETRAIT DE PARAMÈTRE N'EST PAS TENU PAR LE COMPILATEUR.**
   *
   * Le remède est connu et il tient en une ligne : donner à la 2ᵉ position un
   * type qui ne se confonde avec aucune liste de chaînes — le dépôt sait déjà le
   * faire, `SessionId` (ADR 0014) est un type marqué construit par une fabrique
   * nommée. Tant que la position accepte `readonly string[]`, le seul rempart
   * est la vigilance de l'appelant, et c'est exactement ce que l'ADR 0015 a
   * refusé pour le paramètre facultatif.
   */
  it.fails("🔴 ADR 0015 — la 2ᵉ position ne doit pas accepter le type de la liste retirée", () => {
    const parametres = parametresDeLaSignature(SOURCE_ETAPE_11, "analyserArgumentsDuSchema");
    const secondeposition = parametres[1] ?? "";
    const typeAttendu = secondeposition.slice(secondeposition.indexOf(":") + 1).trim();
    const typeDIdFields = typeDuMembre(SOURCE_ETAPES, "idFields");

    console.info(
      `[⑤ dette 1] 2ᵉ position « ${typeAttendu} » · idFields « ${String(typeDIdFields)} » · ` +
        `arité ${String(analyserArgumentsDuSchema.length)}`,
    );

    // Faits qui survivront au correctif : les deux types ont bien été lus.
    expect(typeAttendu.length, "le type de la 2ᵉ position a été lu").toBeGreaterThan(0);
    expect(typeDIdFields, "le type d'`idFields` a été lu").not.toBeNull();

    // L'ATTENTE, celle qui échoue aujourd'hui.
    expect(typeAttendu, "un appelant ne doit pas pouvoir repasser `outil.idFields`").not.toBe(
      typeDIdFields,
    );
  });

  /**
   * 🔴 DETTE 2 — **DEUX DÉRIVATIONS ÉCRITES DU MÊME FAIT SE CONTREDISENT.**
   *
   * Le témoin du § 20 a MESURÉ ce que l'arité prouve, et il écrit sa borne :
   * « L'arité ne ferme donc qu'un cas — le troisième paramètre OBLIGATOIRE ».
   * L'en-tête du module de production écrit l'inverse : l'arité « casse la
   * compilation chez quiconque essaie de repasser la liste ».
   *
   * ⚠️ CE TEST NE JUGE PAS DU STYLE. Il mesure une propriété falsifiable : le
   *    dépôt porte-t-il, DANS UN MODULE DE PRODUCTION, une promesse de rupture
   *    de compilation que la mesure du bloc ② dément ? La forme cherchée est
   *    nommée dans l'annonce, parce qu'un `grep` ne prouve que l'absence de la
   *    FORME écrite — une reformulation lui échapperait, et ce serait alors au
   *    lecteur de la voir.
   */
  it.fails("🔴 aucun module de production ne promet une rupture de compilation démentie", () => {
    const promesses = [
      /casse la compilation/iu,
      /ne compile pas[\s\S]{0,80}repasser/iu,
      /le compilateur (?:l'|le )?interdit/iu,
    ];
    // ⚠️ SUR LA PROSE APLATIE, JAMAIS SUR LE SOURCE BRUT — voir {@link proseAplatie}.
    const prose = proseAplatie(SOURCE_ETAPE_11);
    const trouvees = promesses.filter((forme) => forme.test(prose)).length;
    const borneEcriteAilleurs = /l'arité ne ferme (?:donc )?qu'un cas/iu.test(
      proseAplatie(SOURCE_TEMOIN_P20),
    );
    // Plancher du filtre : une prose aplatie à vide rendrait « 0 promesse » sans
    // avoir rien lu — c'est la panne que le premier jet de ce test a faite.
    const temoinDAplatissement = /l'arité ne ferme (?:donc )?qu'un cas/iu.test(
      proseAplatie(SOURCE_ETAPE_11 + "\n *    l'arité ne ferme\n *    qu'un cas\n"),
    );

    console.info(
      `[⑤ dette 2] ${String(promesses.length)} forme(s) de promesse cherchée(s) · ` +
        `${String(prose.length)} caractère(s) de prose aplatie · ` +
        `${String(trouvees)} promesse(s) trouvée(s) · borne contraire écrite dans le ` +
        `témoin du § 20 : ${String(borneEcriteAilleurs)} · ` +
        `aplatissement éprouvé sur une phrase coupée : ${String(temoinDAplatissement)}`,
    );

    // Le témoin de l'instrument : une phrase COUPÉE par un retour à la ligne est
    // bien retrouvée. Sans lui, « 0 promesse » ne se distinguerait pas d'un
    // filtre cassé.
    expect(temoinDAplatissement, "l'aplatissement retrouve une phrase coupée").toBe(true);
    expect(prose.length, "la prose a bien été lue").toBeGreaterThan(10_000);

    // Fait qui survivra au correctif : la borne JUSTE existe bien quelque part.
    // Si elle disparaissait, ce test resterait vert en ayant perdu son objet.
    expect(borneEcriteAilleurs, "le témoin du § 20 porte bien la borne mesurée").toBe(true);

    // L'ATTENTE : une seule dérivation, et c'est la mesurée.
    expect(trouvees, "le module de production ne doit pas promettre l'inverse").toBe(0);
  });
});

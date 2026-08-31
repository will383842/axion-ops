import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { FAMILLE_DECLAREE_PAR_L_OUTIL } from "../adapter-kit/champs-declares.js";
import type { ValeurJson } from "../adapter-kit/json.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import {
  CHEMIN_DECLARE_SANS_PROPRIETE,
  FAMILLES_GOUVERNANCE,
  analyserArgumentsDuSchema,
  familleDeGouvernance,
} from "./etape-11-provenance.js";

/**
 * TÉMOINS DE L'ADR 0016 — **LA DÉCLARATION DE GOUVERNANCE, ET SA COUTURE.**
 *
 * ═══ CE QUI EST MESURÉ ICI, ET POURQUOI CE FICHIER EXISTE ═══
 *
 * L'épreuve du lot 1c a trouvé un mode de défaillance : une décision écrite,
 * testée, documentée — et **non cousue au chemin de production**.
 * `cumulerChampsDeGouvernance()` était exportée et gardée par quatre tests, et
 * **aucun module de production ne l'appelait**. Les tests passaient parce qu'ils
 * éprouvaient la FONCTION, jamais son BRANCHEMENT.
 *
 * Ce fichier mesure les deux moitiés, séparément et nommément :
 *
 *  · **la RÈGLE** — l'union ne peut qu'AJOUTER (§ 20, protection 1) ;
 *  · **la COUTURE** — `orchestrateur.ts` passe bien `outil.governanceFields` à
 *    `analyserArgumentsDuSchema()`, et celle-ci construit sa liste SUR l'union.
 *
 * ⚠️ **UNE GARDE QUI NE PEUT PAS ÉCHOUER N'EXISTE PAS.** Chaque `describe`
 *    ci-dessous porte donc un CONTRASTE : le même schéma, sans la déclaration.
 *    Sans lui, « l'appel est surveillé » ne distinguerait pas « la déclaration a
 *    mordu » de « le filet au nom l'aurait attrapé de toute façon ».
 *
 * ⚠️ **AUCUN COMPTE N'EST RECOPIÉ.** Les neuf graphies ci-dessous sont
 *    l'INSTRUMENT — un corpus, écrit à la main, comme tout corpus. Ce qui en est
 *    DÉRIVÉ, à chaque exécution : lesquelles échappent au filet, lesquelles sont
 *    surveillées après déclaration, ce que l'union ajoute, ce qu'elle perd. La
 *    garde annonce ces quatre nombres ; elle n'en écrit aucun en dur.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  L'INSTRUMENT — les neuf graphies que le filet AU NOM laisse passer
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES NEUF GRAPHIES MESURÉES AU LOT 1b, CELLES QUE L'ADR 0016 NOMME.
 *
 * Ce ne sont pas des noms exotiques : ce sont les formes qu'un adaptateur réel
 * écrit sans y penser. Elles décident toutes **vers qui**, **quand** ou **sous
 * quel régime** un effet part — c'est-à-dire exactement ce que le § 20 place sur
 * la branche qu'aucune confirmation ne rattrape.
 *
 * ⚠️ CE CORPUS EST L'INSTRUMENT, PAS LA MESURE. Rien ici n'affirme qu'il y en a
 *    neuf, ni qu'elles échappent toutes : le test le DÉRIVE de
 *    `familleDeGouvernance()` et l'ANNONCE. Le jour où le filet est élargi et
 *    qu'il en attrape une, le compte annoncé bouge et la garde reste vraie —
 *    c'est le comportement voulu, parce que l'ADR 0016 ne promet pas que le
 *    filet restera aveugle, elle promet que la déclaration s'AJOUTE à lui.
 */
const GRAPHIES_ORDINAIRES: readonly string[] = [
  "emailTo",
  "adresseDeReponse",
  "envoyerA",
  "validUntil",
  "maxAge",
  "dateDebut",
  "scheduledFor",
  "profil",
  "toolset",
];

/**
 * DES NOMS QUE LE FILET, LUI, RECONNAÎT — le groupe de contrôle.
 *
 * ⚠️ SANS EUX, L'ASYMÉTRIE NE SE MESURE PAS. « Une déclaration ne peut rien
 *    retirer » n'a de sens que s'il existe quelque chose à retirer : il faut des
 *    champs que le FILET retient, pour vérifier qu'une déclaration qui les omet
 *    ne les fait pas disparaître de la surveillance.
 */
const GRAPHIES_DU_FILET: readonly string[] = ["to", "ttl", "policyLevel", "enabled", "slotStart"];

/** Un schéma d'objet FERMÉ, comme le § 09 l'exige de tout schéma d'entrée. */
function schemaFerme(proprietes: Record<string, ValeurJson>): ValeurJson {
  return { type: "object", properties: proprietes, additionalProperties: false };
}

/**
 * UN CHAMP FERMÉ PAR UN `enum`, ET C'EST LA DIFFICULTÉ DE TOUT CE FICHIER.
 *
 * ⚠️ AVEC `{"type":"string"}`, LE TÉMOIN NE MESURERAIT RIEN. Un texte libre fait
 *    jouer la branche 4 de l'étape 11 (« argument libre »), qu'une confirmation
 *    humaine rattrape — et l'appel serait refusé POUR UNE AUTRE RAISON que la
 *    déclaration. La branche 1, celle que le § 20 dit inconditionnelle, ne
 *    s'isole qu'avec ZÉRO argument libre. Chaque test le vérifie avant de rien
 *    conclure.
 */
function champFerme(): ValeurJson {
  return { enum: ["valeur-a", "valeur-b"] };
}

/** Le schéma d'un outil qui porte ces champs, tous refermés par un `enum`. */
function schemaDe(noms: readonly string[]): ValeurJson {
  return schemaFerme(
    Object.fromEntries(noms.map((nom): [string, ValeurJson] => [nom, champFerme()])),
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  PLANCHER — sans lui, tout ce fichier serait vert pour rien
// ═════════════════════════════════════════════════════════════════════════════

describe("PLANCHER — la dérivation sait DIRE OUI et sait DIRE NON", () => {
  it("le filet mord seul sur ses propres noms, et reste muet sur les neuf graphies", () => {
    const parLeFilet = analyserArgumentsDuSchema(
      schemaDe(GRAPHIES_DU_FILET),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );
    const sansPersonne = analyserArgumentsDuSchema(
      schemaDe(GRAPHIES_ORDINAIRES),
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );

    console.info(
      `[plancher · filet] ${String(FAMILLES_GOUVERNANCE.length)} famille(s) du § 20 · ` +
        `${String(GRAPHIES_DU_FILET.length)} nom(s) du groupe de contrôle confronté(s) · ` +
        `${String(parLeFilet.retenusParLeNom)} retenu(s) · ` +
        `${String(GRAPHIES_ORDINAIRES.length)} graphie(s) ordinaire(s) confrontée(s) · ` +
        `${String(sansPersonne.retenusParLeNom)} retenue(s) par le filet`,
    );

    // Le décor doit être lisible, sinon les booléens valent `true` fail-closed et
    // tout ce fichier conclurait « surveillé » pour la pire des raisons.
    expect(parLeFilet.schemaIllisible, "le schéma témoin doit être lisible").toBe(false);
    expect(parLeFilet.profondeurDepassee, "il ne doit pas saturer la borne").toBe(false);
    expect(parLeFilet.libres, "aucun argument libre — la branche 1 est isolée").toEqual([]);
    expect(sansPersonne.libres, "aucun argument libre non plus ici").toEqual([]);

    // SAIT DIRE OUI.
    expect(parLeFilet.retenusParLeNom, "le filet retient ses propres noms").toBe(
      GRAPHIES_DU_FILET.length,
    );
    expect(parLeFilet.porteUnArgumentDeGouvernance).toBe(true);

    // SAIT DIRE NON — et c'est la borne que l'ADR 0016 chiffre.
    expect(sansPersonne.retenusParLeNom, "au moins une graphie échappe au filet").toBeLessThan(
      GRAPHIES_ORDINAIRES.length,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ① LES NEUF GRAPHIES DÉCLARÉES SONT SURVEILLÉES
// ═════════════════════════════════════════════════════════════════════════════

describe("① ADR 0016 — une graphie DÉCLARÉE entre dans la surveillance du § 20", () => {
  it("confronte les graphies une par une, et ANNONCE combien elle en a confrontées", () => {
    const echappentAuFilet: string[] = [];
    const surveilleesSansDeclaration: string[] = [];
    const surveilleesAvecDeclaration: string[] = [];
    const famillesRendues = new Set<string>();
    let perdus = 0;

    for (const nom of GRAPHIES_ORDINAIRES) {
      const schema = schemaFerme({ [nom]: champFerme() });
      if (familleDeGouvernance(nom) === null) echappentAuFilet.push(nom);

      const sans = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
      const avec = analyserArgumentsDuSchema(schema, [nom]);

      // Le décor, vérifié à CHAQUE tour : un schéma illisible rendrait `true`
      // fail-closed et ferait passer la garde pour une bonne raison qui n'en est
      // pas une.
      expect(avec.schemaIllisible, nom).toBe(false);
      expect(avec.profondeurDepassee, nom).toBe(false);
      expect(avec.libres, `${nom} — la branche 1 doit être isolée`).toEqual([]);

      if (sans.porteUnArgumentDeGouvernance) surveilleesSansDeclaration.push(nom);
      if (avec.porteUnArgumentDeGouvernance) surveilleesAvecDeclaration.push(nom);
      for (const champ of avec.gouvernance) {
        if (champ.famille !== undefined) famillesRendues.add(champ.famille);
      }
      perdus += avec.perdusParLeCumul.length;
    }

    console.info(
      `[① graphies déclarées] ${String(GRAPHIES_ORDINAIRES.length)} graphie(s) confrontée(s) · ` +
        `${String(echappentAuFilet.length)} échappe(nt) au filet AU NOM : ${echappentAuFilet.join(", ") || "aucune"} · ` +
        `${String(surveilleesSansDeclaration.length)} surveillée(s) SANS déclaration · ` +
        `${String(surveilleesAvecDeclaration.length)} surveillée(s) AVEC · ` +
        `${String(perdus)} perdue(s) par le cumul · ` +
        `famille(s) rendue(s) : ${[...famillesRendues].join(", ")}`,
    );

    // Cliquet : si plus aucune graphie n'échappait au filet, ce test mesurerait
    // le filet et non la déclaration, tout en restant vert.
    expect(
      echappentAuFilet.length,
      "au moins une graphie doit échapper au filet, sinon la déclaration n'ajoute rien de mesurable",
    ).toBeGreaterThan(0);

    // LA MESURE : déclarées, elles sont TOUTES surveillées.
    expect(surveilleesAvecDeclaration).toEqual([...GRAPHIES_ORDINAIRES]);
    // LE CONTRASTE : celles qui échappent au filet ne l'étaient pas.
    expect(
      surveilleesSansDeclaration.filter((nom) => echappentAuFilet.includes(nom)),
      "sans déclaration, une graphie échappée n'est surveillée par rien",
    ).toEqual([]);
    // L'INVARIANT, mesuré à chaque tour et non lu dans le code.
    expect(perdus, "une déclaration ne retire jamais rien").toBe(0);
    // La SOURCE qui a mordu est nommée, sinon le rapport ne saurait pas dire
    // laquelle des deux a joué.
    expect(famillesRendues.has(FAMILLE_DECLAREE_PAR_L_OUTIL)).toBe(true);
  });

  it("un nom déclaré qu'AUCUNE propriété ne porte reste surveillé, et il est COMPTÉ", () => {
    const analyse = analyserArgumentsDuSchema(schemaDe(["reference"]), ["destinataireX"]);

    console.info(
      `[① déclaré introuvable] ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(analyse.declaresParLOutil)} déclaré(s) · ` +
        `${String(analyse.declaresIntrouvables.length)} introuvable(s) : ` +
        `${analyse.declaresIntrouvables.join(", ")} · ` +
        `gouvernance = ${String(analyse.porteUnArgumentDeGouvernance)}`,
    );

    // ⚠️ FAIL-CLOSED, ET LE CAS EST NOMMÉ. L'admission REFUSE ce manifeste
    //    (ADR 0016, garde G3) ; si un outil arrive quand même jusqu'ici avec une
    //    déclaration qui ne désigne rien, la seule autre issue serait de la
    //    laisser tomber — c'est-à-dire de DESSERRER, ce que l'ADR interdit.
    expect(analyse.proprietesInspectees, "le schéma a bien été parcouru").toBe(1);
    expect(analyse.declaresIntrouvables).toEqual(["destinataireX"]);
    expect(analyse.porteUnArgumentDeGouvernance).toBe(true);
    expect(analyse.gouvernance.map((champ) => champ.chemin)).toEqual([
      CHEMIN_DECLARE_SANS_PROPRIETE,
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② L'ASYMÉTRIE — ON ESSAIE DE RETIRER, ET ON MESURE QUE ÇA NE MARCHE PAS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES QUATRE FAÇONS D'ESSAYER DE RETIRER UN CHAMP PAR DÉCLARATION.
 *
 * ⚠️ **IL N'EN EXISTE PAS DE CINQUIÈME, ET C'EST STRUCTUREL.** `governanceFields`
 *    est une liste de NOMS : le socle en fait une UNION avec le filet, jamais une
 *    intersection ni un remplacement. Il n'y a donc aucune valeur qu'un dépôt
 *    tiers puisse écrire pour dire « ceci n'est PAS de la gouvernance » — c'est
 *    ce que l'ADR 0016 exclut nommément (« ce serait `idFields` à nouveau, avec
 *    un autre nom, et le même trou »).
 *
 *    Les quatre tentatives ci-dessous sont donc l'inventaire de ce qu'un
 *    attaquant PEUT écrire, pas un échantillon : une liste vide, une liste
 *    disjointe, une liste qui omet volontairement le champ visé (la tentative de
 *    « liste blanche »), et une liste qui le nomme en espérant qu'un traitement
 *    spécial s'ensuive.
 */
const TENTATIVES_DE_RETRAIT: readonly {
  readonly nom: string;
  readonly declaration: readonly string[];
}[] = [
  { nom: "déclaration VIDE — « je n'ai aucun champ de gouvernance »", declaration: [] },
  {
    nom: "déclaration DISJOINTE — elle ne parle que d'autres champs",
    declaration: ["reference", "page"],
  },
  {
    nom: "LISTE BLANCHE — elle nomme les autres, en omettant le champ visé",
    declaration: ["reference"],
  },
  {
    nom: "REDONDANTE — elle nomme le champ que le filet retenait déjà",
    declaration: ["to"],
  },
];

describe("② ADR 0016 — une déclaration NE PEUT RIEN RETIRER, et on l'essaie", () => {
  it("essaie les quatre retraits sur un champ retenu par le FILET, et ANNONCE le compte", () => {
    // `to` est retenu par la famille « destinataire d'un envoi » ; `reference` et
    // `page` ne le sont par aucune. Le champ VISÉ par les tentatives est `to`.
    const schema = schemaDe(["to", "reference", "page"]);
    const reference = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);

    const echecs: string[] = [];
    const reussites: string[] = [];
    let perdusCumules = 0;

    for (const tentative of TENTATIVES_DE_RETRAIT) {
      const analyse = analyserArgumentsDuSchema(schema, tentative.declaration);
      perdusCumules += analyse.perdusParLeCumul.length;
      const porteEncoreTo = analyse.gouvernance.some((champ) => champ.nom === "to");
      if (porteEncoreTo && analyse.porteUnArgumentDeGouvernance) echecs.push(tentative.nom);
      else reussites.push(tentative.nom);
    }

    console.info(
      `[② asymétrie] ${String(TENTATIVES_DE_RETRAIT.length)} tentative(s) de retrait confrontée(s) · ` +
        `${String(reference.retenusParLeNom)} champ(s) retenu(s) par le filet AVANT · ` +
        `${String(echecs.length)} tentative(s) SANS EFFET · ` +
        `${String(reussites.length)} tentative(s) qui ONT RETIRÉ : ${reussites.join(", ") || "aucune"} · ` +
        `${String(perdusCumules)} champ(s) perdu(s) par le cumul, toutes tentatives confondues`,
    );

    // Cliquet : le décor doit d'abord SURVEILLER `to`, sinon « rien n'a été
    // retiré » serait vrai parce que rien n'était là.
    expect(
      reference.gouvernance.map((champ) => champ.nom),
      "le filet retient bien `to`",
    ).toEqual(["to"]);
    expect(reference.libres, "aucun argument libre — la branche 1 est isolée").toEqual([]);

    // LA MESURE : aucune des quatre ne retire quoi que ce soit.
    expect(reussites, "aucune déclaration ne doit pouvoir retirer un champ").toEqual([]);
    expect(echecs.length, "les quatre tentatives ont bien été jouées").toBe(
      TENTATIVES_DE_RETRAIT.length,
    );
    expect(perdusCumules, "l'union n'a rien perdu, sur aucune tentative").toBe(0);
  });

  it("une déclaration qui AJOUTE laisse intact tout ce que le filet retenait", () => {
    const schema = schemaDe(["to", "emailTo"]);
    const sans = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
    const avec = analyserArgumentsDuSchema(schema, ["emailTo"]);

    console.info(
      `[② ajout] ${String(sans.gouvernance.length)} champ(s) surveillé(s) AVANT · ` +
        `${String(avec.gouvernance.length)} APRÈS · ` +
        `ajouté(s) : ${avec.ajoutesParLaDeclaration.join(", ")} · ` +
        `perdu(s) : ${avec.perdusParLeCumul.join(", ") || "aucun"}`,
    );

    // Le filet passe EN PREMIER : un nom qu'il retient garde SA famille, et
    // l'ordre de la liste reste comparable d'un appel à l'autre.
    expect(sans.gouvernance.map((champ) => champ.nom)).toEqual(["to"]);
    expect(avec.gouvernance.map((champ) => champ.nom)).toEqual(["to", "emailTo"]);
    expect(avec.gouvernance[0]?.famille, "`to` garde la famille du § 20").not.toBe(
      FAMILLE_DECLAREE_PAR_L_OUTIL,
    );
    expect(avec.gouvernance[1]?.famille, "`emailTo` porte la SOURCE qui a mordu").toBe(
      FAMILLE_DECLAREE_PAR_L_OUTIL,
    );
    expect(avec.ajoutesParLaDeclaration).toEqual(["emailTo"]);
    expect(avec.perdusParLeCumul).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ LA COUTURE — le chemin de PRODUCTION passe bien la déclaration
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **POURQUOI UNE GARDE QUI LIT LE SOURCE, ALORS QUE DES TESTS DE
 *    COMPORTEMENT EXISTENT.**
 *
 * Les tests ci-dessus prouvent que la RÈGLE est juste, et
 * `core/epreuve/verrous-du-paragraphe-20.temoin.spec.ts` prouve qu'un appel réel
 * est refusé bout en bout. Aucun des deux ne dit **d'où** l'orchestrateur tire la
 * déclaration : il pourrait la recalculer, la lire ailleurs, ou — c'est le
 * défaut du lot 1c — ne pas la lire du tout et être rattrapé par un autre refus.
 * Cette garde-ci nomme le tronçon, et elle rougit si le troisième argument cesse
 * de venir de l'outil du catalogue.
 *
 * ⚠️ LES COMMENTAIRES SONT RETIRÉS AVANT TOUTE MESURE, et c'est le piège que
 *    l'épreuve du lot 1c a nommé : `etapes.ts` et `champs-declares.ts` CITENT
 *    `governanceFields` en prose. Un motif appliqué au fichier brut serait vert
 *    parce qu'un commentaire annonce la couture.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** Le chemin d'un module VOISIN, dérivé de l'emplacement de ce fichier. */
function moduleVoisin(nom: string): string {
  return fileURLToPath(new URL(nom, import.meta.url));
}

describe("③ la couture — `orchestrateur.ts` passe `outil.governanceFields` à l'étape 11", () => {
  it("lit le VRAI source de l'orchestrateur et ANNONCE ce qu'il y a mesuré", () => {
    const code = sansCommentaires(readFileSync(moduleVoisin("./orchestrateur.ts"), "utf8"));

    const appels = code.match(/analyserArgumentsDuSchema\s*\([^;]*?\)\s*;/gs) ?? [];
    const avecLaDeclaration = appels.filter((appel) => /outil\.governanceFields/.test(appel));
    const citationsEnProse =
      readFileSync(moduleVoisin("./orchestrateur.ts"), "utf8").split("governanceFields").length - 1;

    console.info(
      `[③ couture] ${String(code.length)} caractère(s) de code lus (commentaires retirés) · ` +
        `${String(appels.length)} appel(s) à \`analyserArgumentsDuSchema\` · ` +
        `${String(avecLaDeclaration.length)} portant \`outil.governanceFields\` · ` +
        `${String(citationsEnProse)} occurrence(s) de \`governanceFields\` dans le fichier BRUT`,
    );

    // Cliquet : un fichier qu'on n'aurait pas su lire rendrait « 0 appel », et
    // cette garde annoncerait un trou inexistant.
    expect(code.length, "le source doit avoir été lu").toBeGreaterThan(1000);
    // Cliquet inverse : le retrait des commentaires doit RÉELLEMENT retirer
    // quelque chose, sinon la mesure porte sur de la prose.
    expect(
      citationsEnProse,
      "le fichier brut doit citer le champ plus souvent que le code seul",
    ).toBeGreaterThan(avecLaDeclaration.length);

    expect(appels.length, "l'orchestrateur appelle la dérivation exactement une fois").toBe(1);
    expect(
      avecLaDeclaration.length,
      "ADR 0016 — la déclaration de l'outil doit atteindre l'étape 11",
    ).toBe(1);
  });

  it("`OutilDuCatalogue` porte `governanceFields`, et le champ n'est PAS optionnel", () => {
    const code = sansCommentaires(readFileSync(moduleVoisin("./etapes.ts"), "utf8"));
    const obligatoires = code.match(/readonly governanceFields\s*:/g) ?? [];
    const facultatifs = code.match(/readonly governanceFields\s*\?\s*:/g) ?? [];

    console.info(
      `[③ champ obligatoire] ${String(obligatoires.length)} déclaration(s) de \`governanceFields\` ` +
        `dans \`etapes.ts\` · ${String(facultatifs.length)} facultative(s)`,
    );

    // ⚠️ UN CHAMP OPTIONNEL AURAIT FAIT DE L'ARBITRAGE UN OUBLI (ADR 0016) : un
    //    outil aurait pu ne rien dire, et personne n'aurait eu à ÉCRIRE qu'il ne
    //    déclarait rien. Seul ce qui est écrit se relit en revue.
    expect(obligatoires.length, "le champ doit exister dans le contrat du catalogue").toBe(1);
    expect(facultatifs, "ADR 0016 — le champ est OBLIGATOIRE, valeur neutre nommée").toEqual([]);
  });

  it("l'étape 11 construit sa liste SUR l'union — mesuré, pas lu dans le code", () => {
    // Si `cumulerChampsDeGouvernance()` était débranchée et la liste reconstruite
    // à la main, rien n'obligerait `perdusParLeCumul` à exister ni à être vide :
    // il est DÉRIVÉ du cumul, donc sa présence prouve que le cumul a tourné.
    const schema = schemaDe(["to", "emailTo", "reference"]);
    const analyse = analyserArgumentsDuSchema(schema, ["emailTo", "emailTo"]);

    console.info(
      `[③ union] ${String(analyse.retenusParLeNom)} retenu(s) par le nom · ` +
        `${String(analyse.declaresParLOutil)} déclaré(s) DISTINCT(s) · ` +
        `${String(analyse.gouvernance.length)} entrée(s) de gouvernance · ` +
        `${String(analyse.ajoutesParLaDeclaration.length)} ajouté(s) · ` +
        `${String(analyse.perdusParLeCumul.length)} perdu(s)`,
    );

    // Le cumul DÉDUPLIQUE : deux fois `emailTo` déclaré ne compte qu'une fois, et
    // n'apparaît qu'une fois dans la liste rendue.
    expect(analyse.declaresParLOutil, "le cumul déduplique la déclaration").toBe(1);
    expect(analyse.retenusParLeNom, "le filet a retenu `to`, et lui seul").toBe(1);
    expect(analyse.gouvernance.map((champ) => champ.nom)).toEqual(["to", "emailTo"]);
    expect(analyse.perdusParLeCumul).toEqual([]);
  });
});

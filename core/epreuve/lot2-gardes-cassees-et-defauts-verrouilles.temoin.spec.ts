/**
 * ÉPREUVE DU LOT 2 — **CE QUE LE LOT A FAIT AUX GARDES QUI EXISTAIENT DÉJÀ.**
 *
 * ═══ LES TROIS FAÇONS DE PERDRE UNE GARDE, ET LE LOT EN ILLUSTRE TROIS ═══
 *
 *  ① **LA CASSER** — la garde G3 de `core/chaine/identite.spec.ts` est ROUGE
 *    depuis ce lot. Pas sur du code : sur une PHRASE. Une gate rouge se
 *    désactive ou se relâche ; c'est ainsi qu'on perd un filet.
 *
 *  ② **VERROUILLER LE DÉFAUT QU'ELLE MESURE** — la garde du raccordement de
 *    `demarrerPolitique`, basculée d'`it.todo` en `it()` par ce lot, assure
 *    désormais qu'il existe AU MOINS une citation en prose comptée comme un
 *    appel. Réparer ce défaut-là fera ROUGIR la garde.
 *
 *  ③ **LA LAISSER HORS DU PÉRIMÈTRE NEUF** — la garde de l'appelant unique du
 *    cliquet dit « dans tout le code de production » et ne lit que `core/`. Le
 *    lot 2 vient de porter `ops/` de sept à douze modules livrés, dont la racine
 *    de composition. Aucun n'est regardé.
 *
 * ⚠️ **CE FICHIER NE CORRIGE RIEN.** Il fabrique des témoins et annonce des
 *    comptes. Aucun secret, aucun réseau, aucune écriture hors de `core/epreuve/`.
 */

import { describe, expect, it } from "vitest";

import { sansCommentairesNiChaines } from "../adapter-kit/autorisation.js";
import {
  fichiersLivresDuDepot,
  lireDuDepot,
  tousLesFichiersTs,
} from "./perimetre-de-production.js";

function lire(relatif: string): string {
  return lireDuDepot(relatif);
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LA GARDE G3 EST ROUGE, ET C'EST UNE PHRASE QUI L'A MISE LÀ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE MOTIF DE G3, **RELU DANS SA GARDE** plutôt que recopié ici.
 *
 * ⚠️ Recopier l'expression rendrait ce témoin juste aujourd'hui et faux le jour
 *    où G3 l'affine : il mesurerait alors une garde qui n'existe plus.
 */
function motifDeG3(): RegExp {
  const source = lire("core/chaine/identite.spec.ts");
  const ligne = /const MOTIF_CONVERSION_FORCEE\s*=\s*\/(.+)\/([a-z]*);/u.exec(source);
  if (ligne === null) throw new Error("le motif de G3 est introuvable dans sa garde");
  return new RegExp(ligne[1] ?? "", ligne[2] ?? "");
}

/**
 * LE NETTOYAGE QUE G3 APPLIQUE — **DÉRIVÉ DE SA GARDE, PLUS RECOPIÉ.**
 *
 * ⚠️ **CE FICHIER RECOPIAIT LE NETTOYAGE, ET C'EST CE QUI L'A RENDU FAUX.** Il
 *    écrivait « les commentaires, et EUX SEULS » — ce qui était vrai de G3 au
 *    moment où ce témoin a été posé, et a cessé de l'être quand G3 a été
 *    réparée. Deux dérivations d'un même fait finissent par se contredire : la
 *    seule qui vaille est celle que G3 exécute réellement.
 *
 * ⚠️ **ET LE TÉMOIN QUI EMPÊCHE CE DÉRIVÉ D'ÊTRE UNE TAUTOLOGIE** : le bloc ①
 *    vérifie AUSSI que `core/chaine/identite.spec.ts` importe bien ce symbole.
 *    Le jour où G3 réécrira son nettoyage sur place, la confrontation rougira
 *    au lieu de mesurer une garde qui n'existe plus.
 */
function commeG3(source: string): string {
  return sansCommentairesNiChaines(source);
}

/** Le nettoyage d'AVANT la réparation : les commentaires, et eux seuls. */
function commeAvantLaReparation(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/gu, "$1 ");
}

describe("① G3 ne distingue pas une conversion d'une PHRASE qui la nomme", () => {
  /**
   * QUATRE TÉMOINS, CHACUN ISOLANT UNE SEULE RÈGLE.
   *
   * G3 se donne déjà quatre témoins, et l'un d'eux couvre la même forme « en
   * COMMENTAIRE ». Il n'en existe AUCUN pour la même forme dans une CHAÎNE DE
   * CARACTÈRES — et c'est très exactement le trou par lequel le lot 2 l'a fait
   * rougir : `core/types.ts` a gagné, dans le motif d'une entrée de registre,
   * la phrase qui NOMME la conversion forcée et la dit « encore écrivable ».
   */
  it("le prouve sur quatre témoins fabriqués, puis le mesure sur le dépôt réel", () => {
    const motif = motifDeG3();
    const compter = (source: string): number => [...commeG3(source).matchAll(motif)].length;

    /**
     * ⚠️ **LE NOM DU TYPE EST ASSEMBLÉ, JAMAIS ÉCRIT D'UN SEUL TENANT — ET C'EST
     *    LA DÉMONSTRATION ELLE-MÊME.** Écrire la forme entière dans une chaîne
     *    de ce fichier ferait rougir G3 SUR CE FICHIER : le témoin deviendrait
     *    la cinquième anomalie qu'il dénonce, et il aggraverait la gate qu'il
     *    mesure. La valeur d'exécution est identique ; seul le TEXTE SOURCE
     *    diffère. Qu'une différence purement textuelle change le verdict d'une
     *    garde est exactement ce que ce bloc a à dire.
     */
    const MARQUE = `Session${"Id"}`;

    const temoins: ReadonlyArray<readonly [string, string, number]> = [
      ["une conversion RÉELLE, dans du code", `const s = recu as unknown as ${MARQUE};\n`, 1],
      ["la même forme en commentaire de ligne", `// ne jamais écrire x as ${MARQUE} ici\n`, 0],
      [
        "la même forme en commentaire de bloc",
        `/* x as unknown as ${MARQUE} */\nconst x = 1;\n`,
        0,
      ],
      [
        "la même forme dans une CHAÎNE — une PHRASE, pas un geste",
        `const motif = "\`as unknown as ${MARQUE}\` reste écrivable";\n`,
        0,
      ],
    ];

    const desaccords: string[] = [];
    for (const [nom, source, attendues] of temoins) {
      const vues = compter(source);
      if (vues !== attendues)
        desaccords.push(`${nom} : ${String(vues)} au lieu de ${String(attendues)}`);
    }

    // LA MESURE SUR LE RÉEL : le dépôt porte-t-il encore le motif, et OÙ ?
    // Deux régimes, et c'est leur ÉCART qui est le fait :
    //  · nettoyage d'AVANT la réparation (commentaires seuls) → l'occurrence est
    //    là, c'est la phrase de `core/types.ts` qui a rougi G3 tout un lot ;
    //  · nettoyage de G3 AUJOURD'HUI → elle a disparu, parce que c'est une
    //    chaîne. La garde ne rougit plus sur ce que le fichier DIT.
    const types = lire("core/types.ts");
    const avantLaReparation = [...commeAvantLaReparation(types).matchAll(motif)].length;
    const dansTypes = compter(types);

    // La garde de G3 dérive-t-elle son nettoyage du même symbole que ce témoin ?
    // Sans cette confrontation, `commeG3` serait une tautologie : elle mesurerait
    // ce qu'elle appelle, jamais ce que G3 exécute.
    const gardeG3 = lire("core/chaine/identite.spec.ts");
    const g3DeriveSonNettoyage =
      /import\s*\{[^}]*sansCommentairesNiChaines[^}]*\}\s*from\s*"[^"]*adapter-kit\/autorisation\.js"/u.test(
        gardeG3,
      ) && /sansCommentairesNiChaines\(/u.test(gardeG3);

    console.info(
      `[lot2·①] ${String(temoins.length)} témoin(s) fabriqué(s) · ` +
        `${String(desaccords.length)} désaccord(s) [${desaccords.join(" | ") || "aucun"}] · ` +
        `motif relu dans G3 : ${motif.source} · ` +
        `occurrence(s) dans core/types.ts — nettoyage d'AVANT la réparation : ` +
        `${String(avantLaReparation)} · nettoyage de G3 aujourd'hui : ${String(dansTypes)} · ` +
        `G3 dérive son nettoyage du symbole partagé : ${String(g3DeriveSonNettoyage)}`,
    );

    // Plancher : le motif a bien été relu, et les fichiers lus.
    expect(motif.source.length).toBeGreaterThan(10);
    expect(types.length).toBeGreaterThan(10_000);
    expect(gardeG3.length).toBeGreaterThan(10_000);

    // Le fait : la PHRASE est toujours là — on ne l'a pas réécrite pour éteindre
    // la garde, ce qui aurait déplacé le défaut au lieu de le fermer.
    expect(avantLaReparation, "core/types.ts porte bien le motif, en prose").toBeGreaterThanOrEqual(
      1,
    );
    // Et G3 ne la voit plus : c'est une chaîne, pas un geste.
    expect(dansTypes, "et le nettoyage de G3 ne la voit plus").toBe(0);

    // Le témoin qui empêche `commeG3` d'être une tautologie.
    expect(g3DeriveSonNettoyage, "G3 doit exécuter le nettoyage que ce témoin mesure").toBe(true);

    // 🔴 L'ATTENTE : une garde qui rougit sur une phrase ne distingue pas ce
    //    qu'un fichier FAIT de ce qu'il DIT — c'est le titre de son propre
    //    premier témoin.
    expect(desaccords, "G3 doit ignorer la forme écrite dans une chaîne").toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② UNE GARDE QUI EXIGE QUE LE DÉFAUT SOIT ENCORE LÀ
// ═════════════════════════════════════════════════════════════════════════════

describe("② le raccordement de `demarrerPolitique` verrouille le défaut qu'il mesure", () => {
  /**
   * CE QUE LE LOT 2 A ÉCRIT, ET CE QUE ÇA COÛTE.
   *
   * L'`it.todo` du lot 1d est devenu un `it()`, et c'est un vrai progrès : la
   * quatrième protection du § 20 a enfin un appelant. Mais la même garde ajoute,
   * en dernière assertion :
   *
   *     expect(citationsEnProse.length).toBeGreaterThanOrEqual(1);
   *
   * `citationsEnProse` compte les modules que `verifierLeCablageDuDemarrage`
   * tient pour des appelants alors qu'ils ne NOMMENT la fonction que dans un
   * commentaire. C'est un DÉFAUT de la fonction gardée — celui-là même que
   * `sansProse` ferme dans le registre des coutures. L'assertion exige qu'il
   * subsiste : le jour où quelqu'un fait retirer les commentaires à
   * `verifierLeCablageDuDemarrage`, cette garde ROUGIT, et le message qu'elle
   * rendra ne dira pas « bravo » mais « expected 0 to be >= 1 ».
   *
   * ⚠️ **CE N'EST PAS LA MÊME CHOSE QU'ANNONCER UNE BORNE.** Le compte affiché
   *    dans le `console.info` rend la borne visible sans rien verrouiller ;
   *    c'est l'`expect` qui la transforme en exigence. Les deux gestes se
   *    ressemblent et ne coûtent pas la même chose.
   */
  it("fabrique la version corrigée de la fonction gardée et montre que la garde rougit", () => {
    const garde = lire("core/epreuve/politique-chemins-de-panne.spec.ts");
    const exigeLeDefaut =
      /expect\(\s*citationsEnProse\.length\s*\)[^;]*toBeGreaterThanOrEqual\(\s*1\s*\)/u.test(garde);

    // On REJOUE la mesure de la garde sur un corpus fabriqué, dans les deux
    // régimes : la fonction telle qu'elle est (`String.includes` sur le source
    // brut) et sa version corrigée (commentaires retirés).
    const corpus = new Map<string, string>([
      ["ops/racine.ts", "demarrerPolitique(depot, maintenant, motif);\n"],
      ["core/policy/notes.ts", "// on appelle demarrerPolitique( ailleurs\nexport const x = 1;\n"],
    ]);
    const sansCommentaires = new Map(
      [...corpus].map(([chemin, source]) => [
        chemin,
        source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/gu, "$1 "),
      ]),
    );
    const compter = (sources: ReadonlyMap<string, string>): readonly string[] =>
      [...sources].filter(([, source]) => source.includes("demarrerPolitique(")).map(([c]) => c);

    const avant = compter(corpus);
    const apres = compter(sansCommentaires);
    const prose = avant.filter((chemin) => !apres.includes(chemin));

    console.info(
      `[lot2·②] ${String(garde.length)} octet(s) lus dans la garde du raccordement · ` +
        `l'assertion « au moins une citation en prose » y est présente : ${String(exigeLeDefaut)} · ` +
        `corpus fabriqué de ${String(corpus.size)} module(s) · ` +
        `${String(avant.length)} appelant(s) avant nettoyage [${avant.join(", ")}] · ` +
        `${String(apres.length)} après [${apres.join(", ")}] · ` +
        `${String(prose.length)} citation(s) en prose — ce compte tomberait à 0 sur la ` +
        `version corrigée, et l'assertion échouerait`,
    );

    // Le corpus fabriqué reproduit bien les deux régimes.
    expect(garde.length).toBeGreaterThan(5_000);
    expect(prose).toEqual(["core/policy/notes.ts"]);
    expect(compter(sansCommentaires).length).toBe(1);

    // 🔴 L'ATTENTE : une garde ne doit jamais EXIGER la persistance du défaut
    //    qu'elle mesure. L'annoncer suffit ; l'assurer inverse le cliquet.
    expect(exigeLeDefaut, "la garde exige que le défaut mesuré subsiste").toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ « TOUT LE CODE DE PRODUCTION » NE COUVRE PAS LA RACINE DE COMPOSITION
// ═════════════════════════════════════════════════════════════════════════════

/** LE CHEMIN DE LA GARDE MESURÉE. Elle est LUE, jamais importée. */
const GARDE_DE_L_APPELANT_UNIQUE = "core/chaine/cliquet-et-lecteur.temoin.spec.ts";

/**
 * LE PÉRIMÈTRE QUE LA GARDE APPLIQUE — **relu dans son source, pas supposé.**
 *
 * Deux régimes possibles, et le second est celui d'avant la réparation :
 *
 *  · la garde APPELLE `fichiersLivresDuDepot()` — alors son périmètre est celui
 *    du build, et ce témoin l'obtient en appelant le MÊME symbole ;
 *  · la garde dérive sa racine d'un fichier de `core/` — alors son périmètre est
 *    `core/` moins les `.spec.ts`, et il manque toute la couche `ops/`.
 *
 * ⚠️ **SANS CETTE LECTURE, LE TEST SERAIT UNE TAUTOLOGIE.** Appeler le symbole
 *    partagé et le confronter à lui-même ne peut pas rougir. Ce qui peut rougir
 *    est qu'une garde CESSE de l'appeler — et c'est très exactement le défaut
 *    que ce bloc existe pour voir.
 */
function perimetreDeLaGarde(source: string): {
  readonly derive: boolean;
  readonly fichiers: readonly string[];
} {
  const derive =
    /fichiersLivresDuDepot\s*\(/u.test(source) &&
    /from\s+"[^"]*epreuve\/perimetre-de-production\.js"/u.test(source);
  if (derive) return { derive, fichiers: fichiersLivresDuDepot() };
  return {
    derive,
    fichiers: tousLesFichiersTs().filter(
      (chemin) => chemin.startsWith("core/") && !chemin.endsWith(".spec.ts"),
    ),
  };
}

describe("③ la garde de l'appelant unique promet un périmètre plus large que le sien", () => {
  /**
   * SA RACINE ÉTAIT DÉRIVÉE DE `../types.ts`, DONC C'ÉTAIT `core/`.
   *
   * Son titre dit « dans tout le code de production » et son plancher-témoin
   * vérifie qu'elle a lu plus de cinquante fichiers — un plancher qu'un
   * périmètre amputé franchit sans difficulté. Ce n'était pas la mesure qui était
   * fausse : c'était l'énoncé qui était plus large qu'elle.
   *
   * Le lot 2 rendait l'écart coûteux plutôt que théorique : il fait de `ops/` la
   * couche qui SÉQUENCE le socle. Un appel au signal d'effet extérieur logé dans
   * la racine de composition — ou dans n'importe lequel de ses étages — n'aurait
   * été vu par personne.
   *
   * ⚠️ **BORNE.** Ce test ne dit pas qu'un tel appel existe : il dit qu'il ne
   *    serait pas vu. Les deux se corrigent différemment.
   */
  it("mesure ce qui tombe hors du périmètre, et ce qui y entre à tort", () => {
    const tous = tousLesFichiersTs();
    const livres = fichiersLivresDuDepot();

    const sourceDeLaGarde = lire(GARDE_DE_L_APPELANT_UNIQUE);
    const perimetre = perimetreDeLaGarde(sourceDeLaGarde);

    const livresHorsPerimetre = livres.filter((chemin) => !perimetre.fichiers.includes(chemin));
    const nonLivresDedans = perimetre.fichiers.filter((chemin) => !livres.includes(chemin));

    // TÉMOIN DE CAPACITÉ : soumis au périmètre d'AVANT, l'instrument doit
    // retrouver les douze modules livrés qu'il ne lisait pas et les cinq
    // fichiers non livrés qu'il lisait pourtant. Sans lui, « zéro écart » serait
    // vrai parce que la mesure ne regarde rien.
    const avantLaReparation = perimetreDeLaGarde("const racine = new URL('../types.ts');");
    const manquesDAvant = livres.filter((chemin) => !avantLaReparation.fichiers.includes(chemin));
    const excesDAvant = avantLaReparation.fichiers.filter((chemin) => !livres.includes(chemin));

    console.info(
      `[lot2·③] ${String(tous.length)} fichier(s) .ts · ${String(livres.length)} livré(s) par ` +
        `pnpm build · la garde dérive son périmètre du build : ${String(perimetre.derive)} · ` +
        `${String(perimetre.fichiers.length)} dans son périmètre · ` +
        `${String(livresHorsPerimetre.length)} module(s) LIVRÉ(S) qu'elle ne lit pas ` +
        `[${livresHorsPerimetre.join(", ") || "aucun"}] · ` +
        `${String(nonLivresDedans.length)} fichier(s) NON livré(s) qu'elle lit pourtant ` +
        `[${nonLivresDedans.join(", ") || "aucun"}] · ` +
        `TÉMOIN — périmètre d'AVANT : ${String(avantLaReparation.fichiers.length)} fichier(s), ` +
        `${String(manquesDAvant.length)} manque(s) [${manquesDAvant.join(", ")}] et ` +
        `${String(excesDAvant.length)} excès [${excesDAvant.join(", ")}]`,
    );

    // Plancher : les deux ensembles ont bien été construits.
    expect(tous.length).toBeGreaterThanOrEqual(150);
    expect(livres.length).toBeGreaterThanOrEqual(80);

    // LE TÉMOIN : l'instrument SAIT voir un périmètre amputé.
    expect(manquesDAvant.length, "le témoin d'AVANT doit exhiber des manques").toBeGreaterThan(0);
    expect(excesDAvant.length, "et des fichiers non livrés comptés à tort").toBeGreaterThan(0);

    // 🔴 L'ATTENTE, DANS LES DEUX SENS. Une garde qui dit « tout le code de
    //    production » doit lire tout le code de production, et rien d'autre :
    //    un fichier non livré dedans dilue le compte, un module livré dehors
    //    est un angle mort.
    expect(perimetre.derive, "la garde doit dériver son périmètre du build").toBe(true);
    expect(livresHorsPerimetre, "des modules livrés échappent à la garde").toEqual([]);
    expect(nonLivresDedans, "et des fichiers non livrés y sont comptés").toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { estValeurLibre } from "../adapter-kit/champs-declares.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { analyserArgumentsDuSchema } from "../chaine/etape-11-provenance.js";
import type { ObjetJson } from "../adapter-kit/json.js";

/**
 * TÉMOINS ADVERSAIRES DU LOT 1d — **LA FUSION A PRIVÉ UNE GARDE DE SON TÉMOIN.**
 *
 * ═══ LE GESTE, ET CE QU'IL A CHANGÉ SANS QUE PERSONNE LE MESURE ═══
 *
 * Le lot 1c portait DEUX écritures de la même question — « ce schéma
 * referme-t-il l'ensemble des valeurs de ce champ ? » : `estTexteLibre()` dans
 * `core/chaine/etape-11-provenance.ts`, `estValeurLibre()` dans
 * `core/adapter-kit/champs-declares.ts`. Une garde les confrontait sur un corpus
 * de formes et annonçait « N formes confrontées · 0 désaccord »
 * (`core/adapter-kit/champs-declares.temoin.spec.ts`). C'était une vraie garde
 * de non-divergence : deux corps indépendants pouvaient réellement se
 * contredire, et le corpus servait à les y prendre.
 *
 * **Le lot 1d a FUSIONNÉ les deux.** `estTexteLibre()` a disparu ; l'étape 11
 * importe et appelle `estValeurLibre()`. C'est le bon geste, et l'en-tête du
 * module l'écrit sans détour : « il n'existe plus de second verdict à faire
 * diverger de celui-ci ».
 *
 * 🔴 **MAIS LA GARDE N'A PAS ÉTÉ REQUALIFIÉE DANS SA PREUVE.** Elle affirme
 *    toujours `desaccords == []` sur son corpus. Depuis la fusion, les deux
 *    côtés de la confrontation appellent LA MÊME fonction : le côté « étape 11 »
 *    ne fait plus que traverser le schéma jusqu'à l'unique ligne
 *    `estValeurLibre(sousSchema)`. Une assertion qui compare f(x) à f(x) est
 *    verte quel que soit f — et **rien, dans le dépôt, ne prouve qu'un désaccord
 *    reste ATTEIGNABLE.**
 *
 *    Ce n'est pas dire que la garde est fausse : elle mesure encore la COUTURE,
 *    et son en-tête le dit honnêtement. C'est dire qu'elle est passée du côté
 *    des gardes dont on ne sait pas si elles peuvent rougir — et la règle de ce
 *    dépôt est sans ambiguïté : **une garde qui ne peut pas échouer n'existe
 *    pas ; il lui faut un témoin FABRIQUÉ et un compte annoncé.** Le compte est
 *    là. Le témoin manque.
 *
 * ═══ CE QUE CE FICHIER FAIT, PLUTÔT QUE DE LE DÉPLORER ═══
 *
 * Il écrit le témoin manquant : une re-dérivation LOCALE fabriquée — celle que
 * le lot 1c portait, avec ses trois règles trop généreuses — et il MESURE
 * combien de formes elle ferait diverger si l'étape 11 la reprenait. Un désaccord
 * atteignable est un désaccord qu'on peut compter ; sans ce compte, « 0
 * désaccord » ne se distingue pas de « rien à trouver ».
 */

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI EST LU DU DÉPÔT — DÉRIVÉ, JAMAIS RECOPIÉ
// ═════════════════════════════════════════════════════════════════════════════

const SOURCE_ETAPE_11 = readFileSync(
  fileURLToPath(new URL("../chaine/etape-11-provenance.ts", import.meta.url)),
  "utf8",
);
const SOURCE_CONFRONTATION = readFileSync(
  fileURLToPath(new URL("../adapter-kit/champs-declares.temoin.spec.ts", import.meta.url)),
  "utf8",
);

function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");
}

/** Compte les APPELS d'un symbole dans un source, commentaires retirés. */
function appelsDe(symbole: string, source: string): number {
  const forme = new RegExp(`\\b${symbole}\\s*(?:<[^;()]*>)?\\s*\\(`, "gu");
  return [...sansCommentaires(source).matchAll(forme)].length;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE CORPUS — LES TROIS RÈGLES QUE LA DÉRIVATION LOCALE PORTAIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Des formes choisies sur les trois règles que la dérivation locale du lot 1c
 * appliquait et que le kit n'applique pas : un `pattern` non vide refermait, un
 * `format` quelconque refermait, un `{"type":"object"}` nu refermait.
 *
 * ⚠️ CE CORPUS EST ÉCRIT ICI, ET IL N'EST PAS CELUI DE LA GARDE ÉPROUVÉE.
 *    Le recopier en ferait une seconde source de vérité, et une divergence entre
 *    les deux corpus passerait pour une divergence entre les deux dérivations.
 */
const FORMES_SENSIBLES: readonly { readonly nom: string; readonly schema: ObjetJson }[] = [
  { nom: "pattern non ancré", schema: { type: "string", pattern: "[a-z]+" } },
  { nom: "pattern qui accepte la prose", schema: { type: "string", pattern: ".*" } },
  { nom: "format non contraignant", schema: { type: "string", format: "uri" } },
  { nom: "objet nu", schema: { type: "object" } },
  { nom: "objet fourre-tout", schema: { type: "object", additionalProperties: true } },
  { nom: "chaîne nue", schema: { type: "string" } },
  { nom: "énumération fermée", schema: { enum: ["a", "b"] } },
  { nom: "constante", schema: { const: 4 } },
  { nom: "entier", schema: { type: "integer" } },
  { nom: "booléen", schema: { type: "boolean" } },
];

/**
 * LA DÉRIVATION LOCALE FABRIQUÉE — celle que le lot 1d a retirée, remise ici
 * pour prouver qu'un désaccord est ATTEIGNABLE.
 *
 * ⚠️ ELLE N'EST PAS UNE COPIE DU CODE RETIRÉ, ET ELLE N'A PAS À L'ÊTRE : elle
 *    n'a qu'à porter les trois règles trop généreuses que le dépôt lui reproche
 *    NOMMÉMENT (voir l'en-tête de `provenance-schema.temoin.spec.ts`). Ce qu'on
 *    mesure est « un second verdict plausible ferait-il diverger la
 *    confrontation », pas « l'ancien code exact rendait-il ceci ».
 */
function libreSelonUneDerivationLocale(schema: ObjetJson): boolean {
  if ("enum" in schema || "const" in schema) return false;
  if (typeof schema["pattern"] === "string" && schema["pattern"].length > 0) return false;
  if (typeof schema["format"] === "string") return false;
  if (schema["type"] === "object") return false;
  return schema["type"] === "string" || schema["type"] === undefined;
}

/** Un schéma d'objet FERMÉ à une seule propriété. */
function schemaAUnChamp(champ: ObjetJson): ObjetJson {
  return {
    type: "object",
    additionalProperties: false,
    required: ["champ"],
    properties: { champ },
  };
}

/** Ce que l'ÉTAPE 11 conclut d'une forme, vu par sa porte publique. */
function libreSelonEtape11(champ: ObjetJson): boolean {
  const analyse = analyserArgumentsDuSchema(schemaAUnChamp(champ), AUCUN_CHAMP_DE_GOUVERNANCE);
  return analyse.libres.some((trouve) => trouve.nom === "champ");
}

// ═════════════════════════════════════════════════════════════════════════════
//  ①  LA FUSION A BIEN EU LIEU — ET C'EST ELLE QUI REND LA CONFRONTATION SEULE
// ═════════════════════════════════════════════════════════════════════════════

describe("① l'étape 11 n'a plus qu'un juge, et il vient du kit", () => {
  it("annonce les appels trouvés, et l'absence de la dérivation retirée", () => {
    const appelsAuKit = appelsDe("estValeurLibre", SOURCE_ETAPE_11);
    const derivationLocale = /function\s+estTexteLibre/u.test(sansCommentaires(SOURCE_ETAPE_11));

    console.info(
      `[① fusion] ${String(SOURCE_ETAPE_11.length)} octet(s) lus · ` +
        `${String(appelsAuKit)} appel(s) à estValeurLibre dans le corps de l'étape 11 · ` +
        `dérivation locale « estTexteLibre » encore définie : ${String(derivationLocale)}`,
    );

    expect(SOURCE_ETAPE_11.length, "le module a bien été lu").toBeGreaterThan(20_000);
    // La fusion est FAITE : un seul juge, et il est importé.
    expect(appelsAuKit, "l'étape 11 appelle le juge du kit").toBeGreaterThanOrEqual(1);
    expect(derivationLocale, "et n'en redéfinit plus aucun").toBe(false);
  });

  it("le verdict SERVI par l'étape 11 est exactement celui du kit, forme par forme", () => {
    let desaccords = 0;
    let libres = 0;
    const noms: string[] = [];

    for (const forme of FORMES_SENSIBLES) {
      const kit = estValeurLibre(forme.schema);
      const chaine = libreSelonEtape11(forme.schema);
      if (kit) libres += 1;
      if (kit !== chaine) {
        desaccords += 1;
        noms.push(forme.nom);
      }
    }

    console.info(
      `[① couture] ${String(FORMES_SENSIBLES.length)} forme(s) confrontée(s) · ` +
        `${String(libres)} jugée(s) LIBRE(s) par le kit · ` +
        `${String(FORMES_SENSIBLES.length - libres)} FERMÉE(s) · ` +
        `${String(desaccords)} désaccord(s) : ${noms.join(", ") || "aucun"}`,
    );

    // Le corpus tranche des DEUX côtés : un corpus tout libre ou tout fermé
    // s'accorderait pour une mauvaise raison.
    expect(libres, "des formes libres").toBeGreaterThanOrEqual(3);
    expect(FORMES_SENSIBLES.length - libres, "des formes fermées").toBeGreaterThanOrEqual(3);
    expect(desaccords, "la couture tient : un seul juge, servi").toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ②  LE TÉMOIN MANQUANT — UN DÉSACCORD EST-IL SEULEMENT ATTEIGNABLE ?
// ═════════════════════════════════════════════════════════════════════════════

describe("② un désaccord reste-t-il ATTEIGNABLE après la fusion ?", () => {
  it("fabrique un second verdict plausible et COMPTE les formes qu'il ferait diverger", () => {
    let divergentes = 0;
    const noms: string[] = [];

    for (const forme of FORMES_SENSIBLES) {
      const kit = estValeurLibre(forme.schema);
      const locale = libreSelonUneDerivationLocale(forme.schema);
      if (kit !== locale) {
        divergentes += 1;
        noms.push(forme.nom);
      }
    }

    console.info(
      `[② atteignabilité] ${String(FORMES_SENSIBLES.length)} forme(s) soumise(s) à une ` +
        `dérivation LOCALE fabriquée · ${String(divergentes)} divergence(s) : ` +
        `${noms.join(", ") || "aucune"}`,
    );

    // 🔴 LA MESURE QUI MANQUAIT. Un second verdict plausible fait diverger
    //    plusieurs formes : la confrontation N'EST PAS structurellement vide,
    //    elle est simplement sans témoin. C'est ce compte-là qui distingue
    //    « 0 désaccord » de « rien à trouver ».
    expect(divergentes, "un second verdict plausible diverge bel et bien").toBeGreaterThanOrEqual(
      3,
    );
  });

  it("SAIT DIRE OUI — la dérivation fabriquée n'est pas divergente PARTOUT", () => {
    // Sans cette moitié, « ça diverge » ne se distinguerait pas d'une fonction
    // fabriquée qui rendrait n'importe quoi.
    let accords = 0;
    for (const forme of FORMES_SENSIBLES) {
      if (estValeurLibre(forme.schema) === libreSelonUneDerivationLocale(forme.schema)) {
        accords += 1;
      }
    }

    console.info(
      `[② contre-épreuve] ${String(accords)} forme(s) sur ` +
        `${String(FORMES_SENSIBLES.length)} où la dérivation fabriquée s'accorde avec le kit`,
    );

    expect(accords, "elle s'accorde sur une partie du corpus").toBeGreaterThanOrEqual(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③  LA DETTE, NOMMÉE
// ═════════════════════════════════════════════════════════════════════════════

describe("③ la dette que ce fichier ouvre", () => {
  /**
   * ✅ **DETTE FERMÉE AU LOT 2 — `it.fails` BASCULÉ EN `it()`.**
   *
   * ═══ CE QUI MANQUAIT ═══
   *
   * `core/adapter-kit/champs-declares.temoin.spec.ts` portait l'assertion
   * `desaccords == []` et son compte, plus trois gardes du CORPUS — chaque
   * format contraignant couvert, chaque témoin de prose isolé, la borne de
   * profondeur encadrée — toutes bonnes. Il ne portait AUCUN test exigeant un
   * désaccord NON VIDE : depuis la fusion du lot 1d, ses deux côtés appellent la
   * même fonction, et f(x) === f(x) est vrai quel que soit f.
   *
   * ═══ CE QUI A ÉTÉ ÉCRIT ═══
   *
   * Le remède est celui du bloc ② ci-dessus, **déplacé chez la garde et non
   * recopié** : une seconde dérivation FABRIQUÉE
   * (`libreSelonUneDerivationTropGenereuse`), un compte de divergences, et
   * l'exigence que ce compte ne soit pas nul — avec sa contre-épreuve, qu'elle
   * s'accorde sur une partie du corpus.
   *
   * ⚠️ **ELLE TOURNE SUR LE CORPUS DE LA GARDE, PAS SUR CELUI D'ICI**, et c'est
   *    ce qui fait la différence entre les deux mesures : celle du bloc ② dit
   *    qu'un désaccord est atteignable EN PRINCIPE (5 formes sur 10 écrites ici) ;
   *    celle de la garde dit combien de ses PROPRES formes basculeraient — c'est
   *    donc elle, et elle seule, qui mesure ce que la confrontation attraperait.
   *
   * ⚠️ **CE TEST NE JUGE TOUJOURS PAS LA GARDE ÉPROUVÉE, IL COMPTE UNE
   *    PROPRIÉTÉ.** Les formes cherchées sont annoncées. Un `grep` ne prouve que
   *    la présence de la FORME écrite — il ne dit pas que la preuve trouvée est
   *    bonne, seulement qu'elle existe. C'est la borne de ce test, et elle vaut
   *    dans les deux sens : il aurait manqué une preuve rédigée autrement.
   */
  it("la confrontation kit / étape 11 porte un témoin qui exige un DÉSACCORD", () => {
    const net = sansCommentaires(SOURCE_CONFRONTATION);
    const formesDePreuve = [
      /expect\(\s*desaccords[\s\S]{0,200}?not\.toEqual\(\s*\[\s*\]/u,
      /expect\(\s*desaccords\.length[\s\S]{0,200}?toBeGreaterThan/u,
      /expect\(\s*divergen[\s\S]{0,200}?toBeGreaterThan/u,
    ];
    const trouvees = formesDePreuve.filter((forme) => forme.test(net)).length;
    const assertionsDAccord = [...net.matchAll(/expect\(\s*desaccords/gu)].length;

    console.info(
      `[③ dette] ${String(SOURCE_CONFRONTATION.length)} octet(s) lus dans la garde éprouvée · ` +
        `${String(assertionsDAccord)} assertion(s) sur « desaccords » · ` +
        `${String(formesDePreuve.length)} forme(s) de preuve cherchée(s) · ` +
        `${String(trouvees)} trouvée(s)`,
    );

    // Faits qui survivront au correctif : le fichier a bien été lu, et il porte
    // bien la confrontation qu'on lui reproche de ne pas éprouver.
    expect(SOURCE_CONFRONTATION.length, "la garde a été lue").toBeGreaterThan(5_000);
    expect(assertionsDAccord, "elle assure bien l'accord").toBeGreaterThanOrEqual(1);

    // L'ATTENTE, DÉSORMAIS TENUE.
    expect(trouvees, "et elle doit prouver qu'un désaccord est atteignable").toBeGreaterThanOrEqual(
      1,
    );
  });
});

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { REGISTRE_DES_COUTURES } from "../coutures/registre.js";
import type { EntreeDeCouture, GenreDeSymbole } from "../coutures/registre.js";

/**
 * TÉMOINS ADVERSAIRES DU LOT 1d — **LE REGISTRE N'A PAS DE GARDE.**
 *
 * ═══ CE QUE CE FICHIER ÉPROUVE ═══
 *
 * L'ADR 0019 a été écrite pour fermer le défaut du lot 1c : *une décision
 * écrite, testée, documentée — et non cousue au chemin de production.* Elle pose
 * trois pièces INDISSOCIABLES : un registre typé (`core/coutures/registre.ts`),
 * une garde qui le confronte au graphe d'appels (`core/coutures/registre.spec.ts`)
 * et une garde de couverture qui lit `docs/adr/`.
 *
 * 🔴 **AU MOMENT OÙ CE FICHIER A ÉTÉ ÉCRIT, SEULE LA PREMIÈRE EXISTAIT.**
 *    `core/coutures/registre.spec.ts` et `core/coutures/couture.temoin.spec.ts`
 *    n'étaient ni sur le disque, ni dans l'index, ni dans aucun commit. Le
 *    registre était donc une DONNÉE que rien ne relisait — et l'entrée qui le
 *    décrit lui-même déléguait sa mesure à `core/coutures/registre.spec.ts`,
 *    c'est-à-dire au fichier absent.
 *
 *    **L'ADR écrite pour empêcher qu'une décision reste non cousue était
 *    elle-même non cousue.** C'était le motif du lot 1c, reproduit à l'intérieur
 *    du remède.
 *
 * ✅ **LES DEUX GARDES ONT ÉTÉ ÉCRITES À LA RECETTE DU LOT 1d**, et ce fichier
 *    NE DISPARAÎT PAS pour autant. Sa dérivation reste INDÉPENDANTE de celle de
 *    `core/coutures/verifier.ts` : les deux confrontent le même registre au même
 *    dépôt et exigent toutes deux zéro désaccord, si bien qu'une divergence
 *    entre elles fait rougir l'une des deux. Deux dérivations d'un même fait
 *    finissent d'ordinaire par se contredire ; ici, se contredire EST le signal,
 *    et aucune des deux n'est la source de l'autre. Les `it.fails` qui portaient
 *    les attentes ouvertes ont ROUGI en atterrissant, et basculé en `it()` — ce
 *    qui est très exactement ce qu'un `it.fails` est écrit pour produire.
 *
 * ═══ CE QUE CE FICHIER FAIT, PLUTÔT QUE DE LE CONSTATER ═══
 *
 * Constater une absence ne prouve rien de ce qui manquera. Ce fichier écrit donc
 * sa PROPRE dérivation du graphe d'appels — {@link mesurerLesCoutures} — à
 * partir des règles ÉNONCÉES par l'ADR 0019, et non du corps d'une garde qui
 * n'existe pas. Il s'en sert pour trois choses :
 *
 *  1. **prouver que la dérivation sait rougir dans les DEUX sens** — huit
 *     témoins fabriqués, chacun sur une propriété différente ;
 *  2. **confronter le registre au dépôt réel** et annoncer les désaccords ;
 *  3. **mesurer les trous que l'état `à-coudre` laisse ouverts** — un symbole
 *     qui n'existe pas satisfait « exactement zéro appelant » gratuitement, et
 *     pour toujours.
 *
 * ⚠️ **CE FICHIER N'A RIEN RÉPARÉ, ET C'ÉTAIT JUSTE.** Il n'a pas écrit la garde
 *    manquante : ce serait décider à la place du constructeur ①, et une garde
 *    écrite par l'adversaire dans `core/epreuve/` ne serait pas la garde de
 *    l'ADR — elle vivrait dans un dossier que l'ADR 0019 exclut désormais
 *    nommément de la livraison. Il MESURE, il annonce des nombres, et il porte
 *    les attentes ouvertes en `it.fails`.
 *
 * ═══ L'IDIOME `it.fails` ═══
 *
 * Les `it()` mesurent le réel et annoncent leurs comptes. Les `it.fails`
 * portent l'attente de l'ADR : ils sont verts AUJOURD'HUI parce qu'ils
 * échouent, et ils ROUGIRONT le jour où le défaut sera fermé — ce qui forcera à
 * les relire au lieu de les laisser vieillir.
 *
 * ⚠️ Un `it.fails` est vert dès qu'il échoue, POUR N'IMPORTE QUELLE RAISON. Le
 *    bloc « ② ma dérivation sait mordre » est donc le plancher de tout ce
 *    fichier : sans lui, un import cassé rendrait chaque `it.fails` vert et ce
 *    fichier entier deviendrait muet.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR — lire le dépôt, sans rien y écrire
// ═════════════════════════════════════════════════════════════════════════════

const RACINE = new URL("../../", import.meta.url);

/** Un fichier soumis à la dérivation : son chemin depuis la racine, son source BRUT. */
interface FichierSoumis {
  readonly chemin: string;
  readonly source: string;
}

/** Les dossiers que le programme TypeScript couvre, d'après `vitest.config.ts`. */
const DOSSIERS_DU_PROGRAMME = ["core", "adapters", "console", "voice", "ops"] as const;

function existe(chemin: string): boolean {
  try {
    return statSync(fileURLToPath(new URL(chemin, RACINE))).isFile();
  } catch {
    return false;
  }
}

function parcourir(relatif: string, acc: FichierSoumis[]): void {
  let entrees;
  try {
    entrees = readdirSync(fileURLToPath(new URL(relatif, RACINE)), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entree of entrees) {
    const chemin = `${relatif}${entree.name}`;
    if (entree.isDirectory()) {
      parcourir(`${chemin}/`, acc);
    } else if (entree.name.endsWith(".ts")) {
      acc.push({ chemin, source: readFileSync(fileURLToPath(new URL(chemin, RACINE)), "utf8") });
    }
  }
}

/**
 * ⚠️ **LE BALAYAGE EST MÉMOÏSÉ — ADR 0040, ET C'EST LE REMÈDE QU'IL NOMME.**
 *
 * Ce fichier rescannait 273 fichiers À CHAQUE TEST, quatorze fois. Mesuré :
 * 23 698 ms pour le fichier sur machine calme ; sur machine chargée, ses gardes
 * ont pris **15 663 ms** — au-delà du seuil d'alerte de 15 000 ms —, et la suite
 * complète a cessé d'être reproductible : verte cinq fois, rouge à la sixième,
 * sur un arbre inchangé. Le remède est celui que l'ADR 0040 écrit — rendre la
 * garde MOINS CHÈRE —, jamais remonter le plafond.
 *
 * ⚠️ **CE QUE LA MÉMOÏSATION NE CHANGE PAS.** Le registre de modules d'un worker
 *    vitest est isolé PAR FICHIER : ce cache naît et meurt avec ce fichier-ci.
 *    Chaque test reçoit le même corpus qu'avant, et continue d'ANNONCER ses
 *    comptes.
 */
let memoireDuProgramme: FichierSoumis[] | null = null;

/** Tous les `.ts` du programme, tests compris. */
function programme(): FichierSoumis[] {
  if (memoireDuProgramme !== null) return memoireDuProgramme;
  const acc: FichierSoumis[] = [];
  for (const dossier of DOSSIERS_DU_PROGRAMME) parcourir(`${dossier}/`, acc);
  memoireDuProgramme = acc;
  return acc;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE CRITÈRE DE PRODUCTION — DÉRIVÉ de `tsconfig.build.json`, jamais réécrit
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que `pnpm build` ÉMET. Le critère est lu dans `exclude`, pas recopié : une
 * seconde liste ici serait la liste que l'ADR 0019 interdit à sa garde de
 * porter, et c'est la seconde qui ne suit jamais.
 *
 * ⚠️ `motifs` est le plancher : à zéro motif lu, TOUT passerait pour livré, les
 *    `.spec.ts` deviendraient des modules de production et la mesure entière
 *    changerait de sens sans un mot.
 */
interface CritereDeProduction {
  readonly estLivre: (chemin: string) => boolean;
  readonly motifs: number;
}

function echapper(texte: string): string {
  return texte.replace(/[.*+?^${}()|[\]\\]/g, (caractere) => `\\${caractere}`);
}

let memoireDuCritere: CritereDeProduction | null = null;

function critereDeLivraison(): CritereDeProduction {
  if (memoireDuCritere !== null) return memoireDuCritere;
  const brut = readFileSync(fileURLToPath(new URL("tsconfig.build.json", RACINE)), "utf8");
  // `tsconfig.build.json` porte des commentaires de ligne : JSON.parse les refuse.
  const sansCommentaires = brut.replace(/^\s*\/\/[^\n]*$/gm, "");
  const lu = JSON.parse(sansCommentaires) as { exclude?: readonly string[] };
  const motifs = lu.exclude ?? [];

  const estExclu = (chemin: string): boolean =>
    motifs.some((motif) => {
      if (!motif.includes("*")) return chemin === motif || chemin.startsWith(`${motif}/`);
      const forme = new RegExp(
        `^${echapper(motif)
          .replace(/\\\*\\\*\//g, "(?:.*/)?")
          .replace(/\\\*/g, "[^/]*")}$`,
      );
      const base = chemin.slice(chemin.lastIndexOf("/") + 1);
      return forme.test(chemin) || forme.test(base);
    });

  memoireDuCritere = { estLivre: (chemin) => !estExclu(chemin), motifs: motifs.length };
  return memoireDuCritere;
}

/**
 * LE RAPPORT SUR LE REGISTRE RÉEL, calculé UNE FOIS pour les six tests qui le
 * lisent. Les témoins FABRIQUÉS appellent {@link mesurerLesCoutures}
 * directement : eux ne passent jamais par ici, sans quoi la mémoire les
 * confondrait avec le registre du dépôt.
 */
let memoireDuRapport: ReturnType<typeof mesurerLesCoutures> | null = null;

function rapportDuRegistreReel(): ReturnType<typeof mesurerLesCoutures> {
  memoireDuRapport ??= mesurerLesCoutures(programme(), REGISTRE_DES_COUTURES, critereDeLivraison());
  return memoireDuRapport;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA DÉRIVATION — les quatre formes, et les trois non-appels
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Retire les commentaires. C'est la règle ② de l'ADR 0019 : deux modules du lot
 * 1c nommaient `cumulerChampsDeGouvernance()` dans un bloc JSDoc, parenthèses
 * comprises, et un motif naïf les aurait comptés pour des appelants.
 */
function sansProse(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ");
}

/**
 * Retire les clauses `import … from` ET `export … from`. C'est la règle ① : un
 * ré-export n'est pas un appelant — `core/adapter-kit/index.ts` réexporte une
 * fonction morte, et la fonction n'en est pas moins morte.
 */
function sansLiaisons(source: string): string {
  return source
    .replace(/^\s*import\s[\s\S]*?from\s*["'][^"']+["']\s*;?/gm, " ")
    .replace(/^\s*export\s[\s\S]*?from\s*["'][^"']+["']\s*;?/gm, " ")
    .replace(/^\s*import\s+["'][^"']+["']\s*;?/gm, " ");
}

/**
 * UNE RÈGLE PAR GENRE, et non une expression par entrée — sans quoi la garde
 * porterait sa liste.
 *
 * ⚠️ **LA FORME `fonction` ADMET UN ARGUMENT DE TYPE.** C'est la règle ③ :
 *    l'orchestrateur écrit `avecJournal<ChargeServie>(…)`, et un motif
 *    `nom\s*\(` déclarerait non cousu le module le plus central du socle.
 *
 * ⚠️ **`\b` EST ASCII EN JAVASCRIPT.** Tous les symboles du registre sont en
 *    ASCII ; le jour où l'un d'eux porterait un accent, cette forme cesserait
 *    de mordre EN SILENCE. C'est écrit ici pour que ce soit relu, pas cru.
 */
function formeDuGenre(genre: GenreDeSymbole, symbole: string): RegExp {
  const nom = echapper(symbole);
  switch (genre) {
    case "fonction":
      return new RegExp(`\\b${nom}\\s*(?:<[^;()]*?>)?\\s*\\(`);
    case "membre":
      return new RegExp(`\\.\\s*${nom}\\b`);
    case "constante":
    case "type":
    default:
      return new RegExp(`\\b${nom}\\b`);
  }
}

/** Le verdict porté sur UNE entrée : des noms et des nombres, jamais une couleur. */
interface VerdictDUneCouture {
  readonly adr: string;
  readonly symbole: string;
  readonly genre: GenreDeSymbole;
  readonly etat: string;
  /** Modules de PRODUCTION qui appellent, lisent ou importent — le DÉFINISSEUR exclu. */
  readonly appelants: readonly string[];
  /** Fichiers qui ne nomment le symbole que dans un COMMENTAIRE ou une liaison. */
  readonly citationsEnProse: readonly string[];
  /** Le symbole est-il défini dans le module que le registre lui attribue ? */
  readonly defini: boolean;
  readonly anomalies: readonly string[];
}

interface RapportDesCoutures {
  readonly fichiersSoumis: number;
  readonly modulesDeProduction: number;
  readonly symbolesConfrontes: number;
  readonly parEtat: Readonly<Record<string, number>>;
  readonly parGenre: Readonly<Record<string, number>>;
  readonly mesuresDeleguees: number;
  readonly verdicts: readonly VerdictDUneCouture[];
  readonly anomalies: readonly string[];
}

/**
 * LA DÉRIVATION, fonction PURE de ce qu'on lui donne.
 *
 * C'est cette pureté qui rend le témoin possible : lui passer un jeu de fichiers
 * FABRIQUÉ dont on a retiré l'unique appelant, et exiger une anomalie. Une
 * mesure qui lirait le disque depuis son propre corps ne serait éprouvable
 * qu'en mutilant le dépôt.
 */
function mesurerLesCoutures(
  fichiers: readonly FichierSoumis[],
  registre: readonly EntreeDeCouture[],
  critere: CritereDeProduction,
): RapportDesCoutures {
  const production = fichiers.filter((fichier) => critere.estLivre(fichier.chemin));
  /**
   * ⚠️ **LA PROSE ET LES LIAISONS SONT RETIRÉES UNE FOIS PAR FICHIER — ADR 0040.**
   *    Les deux étaient calculées au CŒUR de la double boucle, donc 89 entrées ×
   *    134 modules = près de 12 000 fois, pour un résultat qui ne dépend QUE du
   *    fichier. Les deux fonctions sont PURES : le corpus confronté ne change
   *    pas d'un caractère, seul le nombre de calculs change. Mesuré ici :
   *    4 641 ms → 785 ms sur la garde jumelle de `core/coutures/`.
   */
  const corpsSansProse = new Map<string, string>(
    production.map((fichier) => [fichier.chemin, sansProse(fichier.source)]),
  );
  const corpsSansLiaisons = new Map<string, string>(
    production.map((fichier) => [
      fichier.chemin,
      sansLiaisons(corpsSansProse.get(fichier.chemin) ?? ""),
    ]),
  );
  const verdicts: VerdictDUneCouture[] = [];
  const anomalies: string[] = [];
  const parEtat: Record<string, number> = {};
  const parGenre: Record<string, number> = {};
  let mesuresDeleguees = 0;

  for (const entree of registre) {
    parEtat[entree.etat] = (parEtat[entree.etat] ?? 0) + 1;
    if (entree.etat !== "cousue" && entree.etat !== "à-coudre") continue;
    parGenre[entree.genre] = (parGenre[entree.genre] ?? 0) + 1;
    if (entree.mesureeAilleurs !== null) mesuresDeleguees += 1;

    const forme = formeDuGenre(entree.genre, entree.symbole);
    const nomSeul = new RegExp(`\\b${echapper(entree.symbole)}\\b`);
    const appelants: string[] = [];
    const citations: string[] = [];

    for (const fichier of production) {
      if (fichier.chemin === entree.module) continue;
      const nu = corpsSansProse.get(fichier.chemin) ?? "";
      if (entree.genre === "type") {
        // Un type ne s'appelle pas : c'est son IMPORT qui EST la couture.
        if (new RegExp(`import[^;]*\\b${echapper(entree.symbole)}\\b[^;]*from`).test(nu)) {
          appelants.push(fichier.chemin);
        } else if (nomSeul.test(fichier.source)) {
          citations.push(fichier.chemin);
        }
        continue;
      }
      const corps = corpsSansLiaisons.get(fichier.chemin) ?? "";
      // ⚠️ **UNE CONSTANTE LUE EST UNE CONSTANTE IMPORTÉE.** Ce dépôt est en
      //    modules ES : il n'a aucune portée globale. Exiger l'import n'ajoute
      //    donc rien à la réalité, et retire un faux positif MESURÉ au lot 2 —
      //    le nom seul suffisait, **y compris à l'intérieur d'une chaîne de
      //    caractères**, et le registre porte le nom de chaque symbole dans son
      //    champ `symbole:` par construction. Sans cette condition, aucune entrée
      //    `à-coudre` de genre `constante` ne peut exister.
      //
      //    ⚠️ CETTE SECONDE DÉRIVATION SUIT LA PREMIÈRE À DESSEIN, ET C'EST UNE
      //       TENSION ASSUMÉE : deux dérivations d'un même fait finissent par se
      //       contredire. Celle-ci reste indépendante pour rester un témoin ; la
      //       règle, elle, ne peut pas différer sans que l'une des deux mente.
      const importee =
        entree.genre !== "constante" ||
        new RegExp(`import[^;]*\\b${echapper(entree.symbole)}\\b[^;]*from`).test(nu);
      if (importee && forme.test(corps)) appelants.push(fichier.chemin);
      else if (nomSeul.test(fichier.source)) citations.push(fichier.chemin);
    }

    // Le symbole est-il DÉFINI là où le registre le dit ?
    const definisseur = fichiers.find((fichier) => fichier.chemin === entree.module);
    const defini =
      definisseur !== undefined &&
      [
        new RegExp(`export\\s+(?:async\\s+)?function\\s+${echapper(entree.symbole)}\\b`),
        new RegExp(
          `export\\s+(?:const|let|class|interface|type|enum)\\s+${echapper(entree.symbole)}\\b`,
        ),
        new RegExp(`^\\s*(?:readonly\\s+)?${echapper(entree.symbole)}\\s*[(:<]`, "m"),
      ].some((f) => f.test(definisseur.source));

    const reproches: string[] = [];
    if (entree.etat === "cousue" && appelants.length === 0) {
      reproches.push(
        `${entree.symbole} (ADR ${entree.adr}) est déclaré COUSU et n'a AUCUN appelant de production`,
      );
    }
    if (entree.etat === "à-coudre" && appelants.length > 0) {
      reproches.push(
        `${entree.symbole} (ADR ${entree.adr}) est déclaré À-COUDRE et compte ` +
          `${String(appelants.length)} appelant(s) : ${appelants.join(", ")} — ` +
          `la couture a été faite sans que le registre le dise`,
      );
    }

    verdicts.push({
      adr: entree.adr,
      symbole: entree.symbole,
      genre: entree.genre,
      etat: entree.etat,
      appelants,
      citationsEnProse: citations,
      defini,
      anomalies: reproches,
    });
    anomalies.push(...reproches);
  }

  return {
    fichiersSoumis: fichiers.length,
    modulesDeProduction: production.length,
    symbolesConfrontes: verdicts.length,
    parEtat,
    parGenre,
    mesuresDeleguees,
    verdicts,
    anomalies,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ①  LA GARDE DE L'ADR 0019 N'EXISTE PAS
// ═════════════════════════════════════════════════════════════════════════════

/** Les deux fichiers que l'ADR 0019 confie au constructeur ①, nommés par elle. */
const GARDES_EXIGEES_PAR_L_ADR_0019 = [
  "core/coutures/registre.spec.ts",
  "core/coutures/couture.temoin.spec.ts",
] as const;

describe("① la garde de couture de l'ADR 0019", () => {
  it("annonce ce que `core/coutures/` contient réellement", () => {
    const contenu = readdirSync(fileURLToPath(new URL("core/coutures/", RACINE)))
      .filter((nom) => nom.endsWith(".ts"))
      .sort();
    const gardes = contenu.filter((nom) => nom.endsWith(".spec.ts"));

    console.info(
      `[1d·①] ${String(contenu.length)} fichier(s) dans core/coutures/ : ${contenu.join(", ")} · ` +
        `${String(gardes.length)} garde(s) · ` +
        `${String(GARDES_EXIGEES_PAR_L_ADR_0019.filter(existe).length)} des ` +
        `${String(GARDES_EXIGEES_PAR_L_ADR_0019.length)} fichiers exigés par l'ADR 0019 présents`,
    );

    // Plancher : le dossier n'est pas vide, sinon cette garde ne mesure rien.
    expect(contenu.length).toBeGreaterThanOrEqual(2);
    // ⚠️ CE FAIT A CHANGÉ À LA RECETTE DU LOT 1d, ET LE TEST A SUIVI SON FAIT.
    //    Il mesurait `gardes === []` — l'absence, réelle au moment où ce fichier
    //    a été écrit. Les deux gardes ont atterri ; la mesure devient donc « les
    //    gardes exigées sont là », et elle rougit si l'une des deux repart.
    expect(gardes.length).toBeGreaterThanOrEqual(2);
  });

  it("✅ les deux gardes que l'ADR 0019 exige du constructeur ① existent", () => {
    // Ex-`it.fails` : il portait l'attente de l'ADR et était vert PARCE QU'IL
    // ÉCHOUAIT. Les deux fichiers ont été écrits à la recette du lot 1d, il a
    // rougi, et il bascule en `it()` — c'est un progrès, pas une suppression.
    expect(GARDES_EXIGEES_PAR_L_ADR_0019.filter((chemin) => !existe(chemin))).toEqual([]);
  });

  it("annonce les délégations `mesureeAilleurs` qui pointent dans le vide", () => {
    const deleguees = REGISTRE_DES_COUTURES.filter(
      (entree): entree is Extract<EntreeDeCouture, { mesureeAilleurs: string | null }> =>
        (entree.etat === "cousue" || entree.etat === "à-coudre") && entree.mesureeAilleurs !== null,
    );
    const cassees = deleguees.filter((entree) => !existe(entree.mesureeAilleurs as string));

    console.info(
      `[1d·①] ${String(deleguees.length)} mesure(s) déléguée(s) · ` +
        `${String(cassees.length)} pointe(nt) un fichier ABSENT : ` +
        `${cassees.map((e) => `ADR ${e.adr}→${String(e.mesureeAilleurs)}`).join(", ") || "aucune"}`,
    );

    // Plancher : l'ADR 0019 exige que la délégation soit BORNÉE et COMPTÉE.
    // À zéro délégation lue, ce contrôle serait vert en ne regardant rien.
    expect(deleguees.length).toBeGreaterThanOrEqual(2);
  });

  it("✅ toute mesure déléguée nomme un fichier qui EXISTE", () => {
    const orphelines = REGISTRE_DES_COUTURES.filter(
      (entree) =>
        (entree.etat === "cousue" || entree.etat === "à-coudre") &&
        entree.mesureeAilleurs !== null &&
        !existe(entree.mesureeAilleurs),
    ).map(
      (entree) =>
        `ADR ${entree.adr} → ${String("mesureeAilleurs" in entree ? entree.mesureeAilleurs : "?")}`,
    );
    expect(orphelines).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ②  MA DÉRIVATION SAIT-ELLE MORDRE ? — huit témoins FABRIQUÉS
// ═════════════════════════════════════════════════════════════════════════════

/** Un critère de production fabriqué : tout ce qui n'est pas `.spec.ts` est livré. */
const CRITERE_FABRIQUE: CritereDeProduction = {
  estLivre: (chemin) => !chemin.endsWith(".spec.ts"),
  motifs: 1,
};

/** L'entrée de référence des témoins : une fonction déclarée COUSUE. */
function entreeCousue(surcharge: Partial<EntreeDeCouture> = {}): EntreeDeCouture {
  return {
    adr: "9999",
    decision: "décision fabriquée pour le témoin",
    etat: "cousue",
    symbole: "faireLaChose",
    genre: "fonction",
    module: "faux/definisseur.ts",
    mesureeAilleurs: null,
    motif: "témoin fabriqué — aucune valeur documentaire",
    ...surcharge,
  } as EntreeDeCouture;
}

const DEFINISSEUR: FichierSoumis = {
  chemin: "faux/definisseur.ts",
  source: "export function faireLaChose(quoi: string): string {\n  return faireLaChose(quoi);\n}\n",
};

interface Temoin {
  readonly nom: string;
  readonly fichiers: readonly FichierSoumis[];
  readonly entree: EntreeDeCouture;
  readonly anomaliesAttendues: number;
  readonly appelantsAttendus: number;
  readonly citationsAttendues?: number;
}

const TEMOINS: readonly Temoin[] = [
  {
    nom: "① un appelant ordinaire — COMPTÉ, l'entrée `cousue` est satisfaite",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/appelant.ts",
        source:
          'import { faireLaChose } from "./definisseur.js";\nexport const r = faireLaChose("x");\n',
      },
    ],
    entree: entreeCousue(),
    anomaliesAttendues: 0,
    appelantsAttendus: 1,
  },
  {
    nom: "② on RETIRE l'unique appelant d'un `cousue` — la dérivation ROUGIT",
    fichiers: [DEFINISSEUR],
    entree: entreeCousue(),
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
  },
  {
    nom: "③ on AJOUTE un appelant à un `à-coudre` — la dérivation ROUGIT (le sens qu'on oublie)",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/appelant.ts",
        source:
          'import { faireLaChose } from "./definisseur.js";\nexport const r = faireLaChose("x");\n',
      },
    ],
    entree: entreeCousue({ etat: "à-coudre" }),
    anomaliesAttendues: 1,
    appelantsAttendus: 1,
  },
  {
    nom: "④ une CITATION EN COMMENTAIRE n'est pas un appel — et elle est comptée à part",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/prose.ts",
        source: "/** Voir `faireLaChose()` de definisseur.ts. */\nexport const rien = 1;\n",
      },
    ],
    entree: entreeCousue(),
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
    entree: entreeCousue(),
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
  },
  {
    nom: "⑥ un appel `faireLaChose<T>(…)` EST compté — la règle ③ de l'ADR 0019",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/generique.ts",
        source:
          'import { faireLaChose } from "./definisseur.js";\n' +
          'export const r = faireLaChose<ChargeServie>("x");\n',
      },
    ],
    entree: entreeCousue(),
    anomaliesAttendues: 0,
    appelantsAttendus: 1,
  },
  {
    nom: "⑦ le DÉFINISSEUR ne se compte pas lui-même, même s'il s'appelle en récursion",
    fichiers: [DEFINISSEUR],
    entree: entreeCousue({ etat: "à-coudre" }),
    anomaliesAttendues: 0,
    appelantsAttendus: 0,
  },
  {
    nom: "⑧ un appelant qui n'est PAS livré ne compte pas — le critère est celui du build",
    fichiers: [
      DEFINISSEUR,
      {
        chemin: "faux/appelant.spec.ts",
        source:
          'import { faireLaChose } from "./definisseur.js";\nfaireLaChose("depuis un test");\n',
      },
    ],
    entree: entreeCousue(),
    anomaliesAttendues: 1,
    appelantsAttendus: 0,
  },
];

describe("② ma dérivation du graphe d'appels sait mordre", () => {
  it("éprouve huit témoins fabriqués et n'en manque aucun", () => {
    const desaccords: string[] = [];
    for (const temoin of TEMOINS) {
      const rapport = mesurerLesCoutures(temoin.fichiers, [temoin.entree], CRITERE_FABRIQUE);
      const verdict = rapport.verdicts[0];
      if (verdict === undefined) {
        desaccords.push(`${temoin.nom} : aucun verdict rendu`);
        continue;
      }
      if (rapport.anomalies.length !== temoin.anomaliesAttendues) {
        desaccords.push(
          `${temoin.nom} : ${String(rapport.anomalies.length)} anomalie(s) au lieu de ` +
            `${String(temoin.anomaliesAttendues)}`,
        );
      }
      if (verdict.appelants.length !== temoin.appelantsAttendus) {
        desaccords.push(
          `${temoin.nom} : ${String(verdict.appelants.length)} appelant(s) au lieu de ` +
            `${String(temoin.appelantsAttendus)} — [${verdict.appelants.join(", ")}]`,
        );
      }
      if (
        temoin.citationsAttendues !== undefined &&
        verdict.citationsEnProse.length !== temoin.citationsAttendues
      ) {
        // ⚠️ CE COMPTE EST LE TÉMOIN DU FILTRE DE COMMENTAIRES LUI-MÊME. Si le
        //    retrait des commentaires cessait de fonctionner, la citation
        //    deviendrait un APPELANT : les appelants monteraient et les
        //    citations tomberaient à zéro. Les deux comptes, ensemble, disent
        //    laquelle des deux pannes est arrivée.
        desaccords.push(
          `${temoin.nom} : ${String(verdict.citationsEnProse.length)} citation(s) au lieu de ` +
            `${String(temoin.citationsAttendues)}`,
        );
      }
    }

    console.info(
      `[1d·②] ${String(TEMOINS.length)} témoin(s) fabriqué(s) éprouvé(s) · ` +
        `${String(desaccords.length)} désaccord(s)${desaccords.length ? ` : ${desaccords.join(" | ")}` : ""}`,
    );

    // Plancher : huit témoins, pas moins. Un tableau vidé rendrait ce bloc vert
    // en ne mesurant rien — et tous les `it.fails` de ce fichier avec lui.
    expect(TEMOINS.length).toBeGreaterThanOrEqual(8);
    expect(desaccords).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③  LE REGISTRE CONFRONTÉ AU DÉPÔT
// ═════════════════════════════════════════════════════════════════════════════

describe("③ le registre confronté au graphe d'appels du dépôt", () => {
  it("annonce les comptes, symbole par symbole, appelants NOMMÉS", () => {
    const critere = critereDeLivraison();
    const rapport = rapportDuRegistreReel();

    for (const verdict of rapport.verdicts) {
      console.info(
        `[1d·③] ADR ${verdict.adr} · ${verdict.etat} · ${verdict.genre} · ${verdict.symbole} → ` +
          `${String(verdict.appelants.length)} appelant(s) [${verdict.appelants.join(", ") || "aucun"}]` +
          ` · ${String(verdict.citationsEnProse.length)} citation(s) en prose` +
          `${verdict.defini ? "" : " · ⚠️ NON DÉFINI dans le module déclaré"}`,
      );
    }
    console.info(
      `[1d·③] ${String(rapport.fichiersSoumis)} fichier(s) soumis · ` +
        `${String(rapport.modulesDeProduction)} module(s) de PRODUCTION balayé(s) · ` +
        `${String(critere.motifs)} motif(s) d'exclusion lu(s) · ` +
        `${String(REGISTRE_DES_COUTURES.length)} entrée(s) au registre · ` +
        `${String(rapport.symbolesConfrontes)} symbole(s) confronté(s) · ` +
        `états ${JSON.stringify(rapport.parEtat)} · genres ${JSON.stringify(rapport.parGenre)} · ` +
        `${String(rapport.mesuresDeleguees)} mesure(s) déléguée(s) · ` +
        `${String(rapport.anomalies.length)} désaccord(s) : ` +
        `${rapport.anomalies.join(" | ") || "aucun"}`,
    );

    // Planchers-témoins de l'ADR 0019 : sans eux, un dossier déplacé rendrait ce
    // bloc vert en ne lisant rien.
    expect(critere.motifs).toBeGreaterThanOrEqual(2);
    expect(rapport.modulesDeProduction).toBeGreaterThanOrEqual(60);
    expect(rapport.symbolesConfrontes).toBeGreaterThanOrEqual(20);
    expect(rapport.mesuresDeleguees).toBeGreaterThanOrEqual(2);
  });

  /**
   * LE CLIQUET DES DÉSACCORDS — mesuré le 2026-08-31, et il ne peut que SE VIDER.
   *
   * ⚠️ **SANS LUI, L'`it.fails` CI-DESSOUS SERAIT MUET.** Un `it.fails` est vert
   *    dès qu'il échoue, POUR N'IMPORTE QUELLE RAISON : tant qu'un seul
   *    désaccord subsiste, un SECOND qui atterrit ne change aucune couleur.
   *    Mesuré : couper la couture de l'ADR 0021 dans `orchestrateur.ts` porte le
   *    compte de 1 à 2 désaccords, et le seul `it.fails` reste vert. Le cliquet
   *    nomme donc les ADR en désaccord AUJOURD'HUI et rougit sur tout ADR qui
   *    s'ajoute — c'est lui qui garde les 21 coutures qui tiennent, pendant que
   *    l'`it.fails` garde la 22ᵉ qui ne tient pas.
   *
   * ⚠️ **CETTE LISTE NE S'ALLONGE PAS.** Y ajouter un numéro pour obtenir du vert
   *    serait bénir la régression que ce fichier existe pour trouver.
   *
   * ✅ **ELLE S'EST VIDÉE À LA RECETTE DU LOT 1d.** Le désaccord `0018` était
   *    réel — `deciderDemarrageMonoInstance` était déclaré `à-coudre` et comptait
   *    un appelant de production — et l'entrée du registre a été corrigée. Une
   *    liste vide est le seul état où le cliquet et l'attente disent la même
   *    chose ; c'est aussi celui où tout désaccord, ancien ou neuf, fait rougir.
   */
  const DESACCORDS_CONNUS_LE_2026_08_31: readonly string[] = [];

  it("tient le CLIQUET : aucun désaccord NOUVEAU, quel que soit le nombre déjà ouvert", () => {
    const rapport = rapportDuRegistreReel();
    const enDesaccord = [
      ...new Set(rapport.verdicts.filter((v) => v.anomalies.length > 0).map((v) => v.adr)),
    ].sort();
    const nouveaux = enDesaccord.filter((adr) => !DESACCORDS_CONNUS_LE_2026_08_31.includes(adr));
    const refermes = DESACCORDS_CONNUS_LE_2026_08_31.filter((adr) => !enDesaccord.includes(adr));

    console.info(
      `[1d·③ cliquet] ${String(DESACCORDS_CONNUS_LE_2026_08_31.length)} désaccord(s) connu(s) ` +
        `[${DESACCORDS_CONNUS_LE_2026_08_31.join(", ")}] · ` +
        `${String(enDesaccord.length)} mesuré(s) [${enDesaccord.join(", ") || "aucun"}] · ` +
        `${String(nouveaux.length)} NOUVEAU(x) [${nouveaux.join(", ") || "aucun"}] · ` +
        `${String(refermes.length)} refermé(s) [${refermes.join(", ") || "aucun"}]`,
    );

    // Plancher : le cliquet doit avoir quelque chose à confronter.
    expect(rapport.symbolesConfrontes).toBeGreaterThanOrEqual(20);
    // Un désaccord NOUVEAU est une couture débranchée, ou une couture faite sans
    // que le registre le dise. Les deux rendent la prose de l'ADR fausse.
    expect(nouveaux).toEqual([]);
  });

  it("✅ aucune entrée du registre ne contredit le graphe d'appels", () => {
    const rapport = rapportDuRegistreReel();
    expect(rapport.anomalies).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ④  CE QUE L'ÉTAT `à-coudre` NE SAIT PAS DIRE
// ═════════════════════════════════════════════════════════════════════════════

describe("④ un symbole qui n'existe pas satisfait `à-coudre` GRATUITEMENT", () => {
  it("le prouve sur un témoin fabriqué, puis le mesure sur le registre réel", () => {
    // Le témoin : une entrée `à-coudre` dont le module ne définit RIEN. Zéro
    // appelant est vrai, et la dérivation ne trouve donc aucune anomalie — alors
    // que le symbole n'a jamais été écrit. C'est un vert POUR LA MAUVAISE RAISON.
    const fantome = mesurerLesCoutures(
      [{ chemin: "faux/vide.ts", source: "export const rien = 1;\n" }],
      [entreeCousue({ etat: "à-coudre", symbole: "jamaisEcrit", module: "faux/vide.ts" })],
      CRITERE_FABRIQUE,
    );
    expect(fantome.anomalies).toEqual([]);
    expect(fantome.verdicts[0]?.defini).toBe(false);

    // Le réel : quelles entrées du registre nomment un symbole introuvable ?
    const rapport = rapportDuRegistreReel();
    const introuvables = rapport.verdicts.filter((verdict) => !verdict.defini);

    console.info(
      `[1d·④] ${String(rapport.symbolesConfrontes)} symbole(s) confronté(s) · ` +
        `${String(introuvables.length)} NON DÉFINI(s) dans le module que le registre leur donne : ` +
        `${introuvables.map((v) => `${v.symbole} (ADR ${v.adr}, ${v.etat}, attendu dans ${REGISTRE_DES_COUTURES.find((e) => "symbole" in e && e.symbole === v.symbole)?.["module" as never] ?? "?"})`).join(", ") || "aucun"}`,
    );

    // Plancher : la détection de définition doit RENDRE QUELQUE CHOSE. Si elle
    // ne reconnaissait plus aucune forme de définition, tout serait « non
    // défini » et l'annonce ci-dessus deviendrait du bruit.
    expect(rapport.symbolesConfrontes - introuvables.length).toBeGreaterThanOrEqual(15);
  });

  it.fails("tout symbole du registre est DÉFINI dans le module qu'on lui attribue", () => {
    const rapport = rapportDuRegistreReel();
    expect(
      rapport.verdicts.filter((v) => !v.defini).map((v) => `${v.symbole} (ADR ${v.adr})`),
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ⑤  LE CRITÈRE DE PRODUCTION LAISSE PASSER LES FABRIQUES DE TÉMOINS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ADR 0019 § « tsconfig.build.json gagne deux exclusions » demande d'ajouter
 * `core/epreuve/` et tout `fixtures.ts` à l'`exclude`. Tant que ce n'était pas
 * fait, une fabrique de témoins comptait pour un module de production — et un
 * symbole dont l'unique appelant serait une fabrique passait pour COUSU.
 *
 * ✅ **APPLIQUÉ À LA RECETTE DU LOT 1d.** Le témoin FABRIQUÉ ci-dessous ne
 *    bouge pas : il montre, sur un critère qui n'exclut pas les fixtures, qu'une
 *    entrée `cousue` dont l'unique appelant est `faux/fixtures.ts` passe sans
 *    anomalie. C'est la démonstration que le critère DÉCIDE — sans elle, « zéro
 *    fabrique livrée » ne se distinguerait pas de « ce compte ne mesure rien ».
 */
describe("⑤ le critère de livraison et les fabriques de témoins", () => {
  it("le prouve sur un témoin fabriqué, puis mesure les fabriques réellement livrées", () => {
    // Le témoin : l'unique appelant est une fixture. Sous le critère qui ne
    // l'exclut pas, l'entrée `cousue` est satisfaite — et elle ne devrait pas
    // l'être : aucune fabrique de témoins n'exécute quoi que ce soit en service.
    const fabrique = mesurerLesCoutures(
      [
        DEFINISSEUR,
        {
          chemin: "faux/fixtures.ts",
          source:
            'import { faireLaChose } from "./definisseur.js";\n' +
            'export const decor = faireLaChose("décor");\n',
        },
      ],
      [entreeCousue()],
      CRITERE_FABRIQUE,
    );
    expect(fabrique.anomalies).toEqual([]);
    expect(fabrique.verdicts[0]?.appelants).toEqual(["faux/fixtures.ts"]);

    // Le réel.
    const critere = critereDeLivraison();
    const fabriquesLivrees = programme()
      .map((fichier) => fichier.chemin)
      .filter(
        (chemin) =>
          critere.estLivre(chemin) &&
          (chemin.startsWith("core/epreuve/") || chemin.endsWith("/fixtures.ts")),
      )
      .sort();

    // Quelles entrées `cousue` doivent un appelant à l'une d'elles ?
    const rapport = rapportDuRegistreReel();
    const adossees = rapport.verdicts.filter(
      (verdict) =>
        verdict.appelants.length > 0 &&
        verdict.appelants.every((chemin) => fabriquesLivrees.includes(chemin)),
    );

    console.info(
      `[1d·⑤] ${String(fabriquesLivrees.length)} fabrique(s) de témoins ÉMISE(s) par pnpm build : ` +
        `${fabriquesLivrees.join(", ") || "aucune"} · ` +
        `${String(adossees.length)} symbole(s) dont TOUS les appelants sont des fabriques : ` +
        `${adossees.map((v) => v.symbole).join(", ") || "aucun"}`,
    );

    // Plancher : le dépôt PORTE des fabriques de témoins. Si ce compte tombait à
    // zéro, ce serait soit que l'`exclude` a été corrigé (et l'`it.fails`
    // ci-dessous rougira pour le dire), soit que le parcours ne lit plus rien.
    expect(programme().filter((f) => f.chemin.startsWith("core/epreuve/")).length).toBeGreaterThan(
      0,
    );
  });

  it("✅ aucune fabrique de témoins n'est émise par `pnpm build`", () => {
    const critere = critereDeLivraison();
    expect(
      programme()
        .map((fichier) => fichier.chemin)
        .filter(
          (chemin) =>
            critere.estLivre(chemin) &&
            (chemin.startsWith("core/epreuve/") || chemin.endsWith("/fixtures.ts")),
        ),
    ).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ⑥  LA COUVERTURE DES ADR — la garde G2 de l'ADR 0019, refaite ici
// ═════════════════════════════════════════════════════════════════════════════

/** Le statut lu dans l'en-tête d'un ADR, ou `null` si le format a changé. */
function statutDeLAdr(source: string): string | null {
  const trouve = /^-\s+\*\*Statut\*\*\s*:\s*([^\n—]+)/m.exec(source);
  return trouve?.[1]?.trim().toLowerCase() ?? null;
}

describe("⑥ chaque ADR de `docs/adr/` est inscrit au registre", () => {
  it("lit le DOSSIER, jamais le registre, et annonce l'écart", () => {
    const fichiers = readdirSync(fileURLToPath(new URL("docs/adr/", RACINE)))
      .filter((nom) => /^\d{4}-.*\.md$/.test(nom))
      .sort();
    const surDisque = new Set(fichiers.map((nom) => nom.slice(0, 4)));
    const auRegistre = new Set(REGISTRE_DES_COUTURES.map((entree) => entree.adr));

    let statutsLus = 0;
    let acceptes = 0;
    for (const nom of fichiers) {
      const statut = statutDeLAdr(
        readFileSync(fileURLToPath(new URL(`docs/adr/${nom}`, RACINE)), "utf8"),
      );
      if (statut === null) continue;
      statutsLus += 1;
      if (statut.startsWith("accept")) acceptes += 1;
    }

    const sansEntree = [...surDisque].filter((numero) => !auRegistre.has(numero)).sort();
    const fantomes = [...auRegistre].filter((numero) => !surDisque.has(numero)).sort();

    console.info(
      `[1d·⑥] ${String(surDisque.size)} ADR trouvé(s) sur disque · ` +
        `${String(auRegistre.size)} numéro(s) couvert(s) par le registre · ` +
        `${String(statutsLus)} statut(s) lu(s) dont ${String(acceptes)} accepté(s) · ` +
        `${String(sansEntree.length)} sans entrée [${sansEntree.join(", ") || "aucun"}] · ` +
        `${String(fantomes.length)} entrée(s) fantôme(s) [${fantomes.join(", ") || "aucune"}]`,
    );

    // Planchers de l'ADR 0019. `statutsLus` est celui qui compte le plus : si le
    // format d'en-tête change, il s'effondre, et la garde le DIT au lieu de
    // devenir muette.
    expect(surDisque.size).toBeGreaterThanOrEqual(14);
    expect(statutsLus).toBe(surDisque.size);
    expect(acceptes).toBeGreaterThanOrEqual(10);
    expect(sansEntree).toEqual([]);
    expect(fantomes).toEqual([]);
  });

  it("rougit sur un ADR FABRIQUÉ que le registre ne connaît pas", () => {
    // Le témoin de la garde G2 : un `0099-*.md` inventé fait monter le compte des
    // trouvés sans faire monter celui des couverts. Il n'est pas écrit sur le
    // disque — la mesure est une fonction de l'ENSEMBLE des numéros, et le témoin
    // lui en passe un fabriqué.
    const auRegistre = new Set(REGISTRE_DES_COUTURES.map((entree) => entree.adr));
    const avecFantome = new Set([...auRegistre, "0099"]);
    const surDisqueFabrique = new Set([...auRegistre, "0099"]);

    const ecartQuandLAdrManque = [...surDisqueFabrique].filter(
      (numero) => !auRegistre.has(numero),
    ).length;
    const ecartQuandIlEstCouvert = [...surDisqueFabrique].filter(
      (numero) => !avecFantome.has(numero),
    ).length;

    console.info(
      `[1d·⑥ témoin] ADR 0099 fabriqué · écart sans entrée : ${String(ecartQuandLAdrManque)} · ` +
        `écart une fois inscrit : ${String(ecartQuandIlEstCouvert)}`,
    );

    expect(ecartQuandLAdrManque).toBe(1);
    expect(ecartQuandIlEstCouvert).toBe(0);
  });
});

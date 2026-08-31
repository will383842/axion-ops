/**
 * ÉPREUVE DU LOT 2 — **LES DEUX TRANSPORTS SONT ÉCRITS, ET RIEN NE LES MONTE.**
 *
 * ═══ LA PHRASE QUE CE FICHIER ÉPROUVE ═══
 *
 * Le lot 2 se donne pour jalon : « après lui, le socle DÉMARRE et RÉPOND ».
 * « Répondre » a un sens vérifiable : un processus tient une socket, ou lit un
 * flux, et rend une réponse. Ce fichier cherche, dans le dépôt, le module de
 * PRODUCTION qui fait l'un ou l'autre.
 *
 * ═══ CE QU'IL MESURE, ET COMMENT ═══
 *
 * Le critère « de production » n'est pas écrit ici : il est DÉRIVÉ de
 * l'`exclude` de `tsconfig.build.json`, exactement comme le font la garde des
 * coutures (ADR 0019) et celle de l'identité (ADR 0014). Un fichier que
 * `pnpm build` n'émet pas ne tourne nulle part — donc un appel qui n'existe que
 * là n'est pas un appel de production.
 *
 * ⚠️ **AUCUN RÉSEAU SORTANT, AUCUNE ÉCOUTE.** Ce fichier LIT des sources. Il ne
 *    monte rien, ne se lie à aucun port, et ne touche pas à `process.env`.
 *
 * ⚠️ **BORNE, ÉCRITE AVEC LA MESURE.** Chercher un appel par sa forme écrite ne
 *    prouve que l'absence de CETTE forme. Le témoin fabriqué du bloc ① existe
 *    pour cette raison : il montre que le balayage sait trouver un appel quand
 *    il y en a un, ce qui transforme « zéro trouvé » en fait plutôt qu'en
 *    silence d'instrument.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/** Le dépôt, dérivé d'`import.meta.url`. Jamais un chemin codé en dur. */
const RACINE = new URL("../../", import.meta.url);

function lire(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(relatif, RACINE)), "utf8");
}

/**
 * LES MOTIFS D'EXCLUSION, LUS DANS `tsconfig.build.json`.
 *
 * ⚠️ **DÉRIVÉS, JAMAIS RECOPIÉS.** Une liste recopiée ici resterait juste
 *    jusqu'au jour où le build en ajoute un — et ce jour-là, ce fichier
 *    compterait comme « de production » un dossier que personne ne livre.
 */
function motifsDExclusion(): readonly string[] {
  const brut = lire("tsconfig.build.json");
  const bloc = /"exclude"\s*:\s*\[([^\]]*)\]/u.exec(brut);
  if (bloc === null) return [];
  return [...(bloc[1] ?? "").matchAll(/"([^"]+)"/gu)].map((trouve) => trouve[1] ?? "");
}

/**
 * Le fichier est-il émis par `pnpm build` ? Dérivé des motifs ci-dessus.
 *
 * ⚠️ **LE `*` D'UN MOTIF EST TRAITÉ, PAS IGNORÉ.** `**\/*.spec.ts` sans cette
 *    règle se réduirait à « le chemin finit-il par `*.spec.ts` » — faux pour
 *    tous les fichiers du monde — et TOUTES les gardes du dépôt seraient alors
 *    comptées comme des modules de production. Le témoin ① du bloc suivant
 *    isole précisément ce cas : il a rougi sur la première écriture de cette
 *    fonction, et c'est pour cela qu'il est écrit.
 */
function estDeProduction(chemin: string, motifs: readonly string[]): boolean {
  for (const motif of motifs) {
    const nu = motif.startsWith("**/") ? motif.slice(3) : motif;
    if (nu.startsWith("*")) {
      const suffixe = nu.slice(1);
      const global = motif.startsWith("**/");
      if (chemin.endsWith(suffixe) && (global || !chemin.includes("/"))) return false;
      continue;
    }
    if (motif.startsWith("**/")) {
      if (chemin === nu || chemin.endsWith(`/${nu}`)) return false;
      continue;
    }
    if (chemin === motif || chemin.startsWith(`${motif}/`)) return false;
  }
  return chemin.endsWith(".ts");
}

/** Tous les `.ts` du dépôt hors `node_modules` et `dist`, chemin → source. */
function sourcesDuDepot(): ReadonlyMap<string, string> {
  const fichiers = new Map<string, string>();
  const parcourir = (relatif: string): void => {
    let entrees;
    try {
      entrees = readdirSync(fileURLToPath(new URL(relatif, RACINE)), { withFileTypes: true });
    } catch {
      return; // Un dossier absent n'est pas une panne : le plancher le dira.
    }
    for (const entree of entrees) {
      const chemin = `${relatif}${entree.name}`;
      if (entree.isDirectory()) parcourir(`${chemin}/`);
      else if (entree.name.endsWith(".ts")) fichiers.set(chemin, lire(chemin));
    }
  };
  for (const dossier of ["core", "ops", "adapters", "console", "voice"]) parcourir(`${dossier}/`);
  return fichiers;
}

/**
 * Retire commentaires et chaînes. Sans cela, un module qui NOMME
 * `creerServeurHttp(` dans un bloc de documentation compterait pour un appelant
 * — le défaut exact que `sansProse` ferme dans le registre des coutures.
 */
function sansProseNiChaines(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/gu, "$1 ")
    .replace(/"(?:[^"\\\n]|\\.)*"/gu, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/gu, "''")
    .replace(/`(?:[^`\\]|\\.)*`/gu, "``");
}

/** Les fabriques sans lesquelles aucun octet n'entre ni ne sort du socle. */
const FABRIQUES_DU_SERVICE = [
  "creerServeurHttp",
  "creerTransportHttp",
  "creerServeurStdio",
  "brancherSurLesFlux",
] as const;

const MOTIFS = motifsDExclusion();
const SOURCES = sourcesDuDepot();

/** Qui appelle `nom(` dans un fichier de production ? */
function appelantsDeProduction(
  nom: string,
  sources: ReadonlyMap<string, string> = SOURCES,
): {
  readonly appelants: readonly string[];
  readonly enProse: readonly string[];
  readonly balayes: number;
} {
  const forme = new RegExp(`\\b${nom}\\s*\\(`, "u");
  const appelants: string[] = [];
  const enProse: string[] = [];
  let balayes = 0;
  for (const [chemin, source] of sources) {
    if (!estDeProduction(chemin, MOTIFS)) continue;
    balayes += 1;
    // Le DÉFINISSEUR ne se compte jamais lui-même.
    const nu = sansProseNiChaines(source);
    if (new RegExp(`(?:export\\s+)?(?:async\\s+)?function\\s+${nom}\\b`, "u").test(nu)) continue;
    if (forme.test(nu)) appelants.push(chemin);
    else if (source.includes(nom)) enProse.push(chemin);
  }
  return { appelants, enProse, balayes };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LE PLANCHER — le balayage sait TROUVER un appel
// ═════════════════════════════════════════════════════════════════════════════

describe("① le balayage mord — témoins fabriqués", () => {
  /**
   * ⚠️ **SANS CE TEST, LE BLOC ② SERAIT VERT POUR LA PIRE DES RAISONS.** Un
   *    critère de production trop large — une expression mal écrite, un motif
   *    d'exclusion qui avale tout — rendrait « zéro appelant » sans avoir rien
   *    regardé. Cinq témoins fabriqués, chacun isolant UNE règle.
   */
  it("distingue l'appel, la prose, la chaîne, le définisseur et le fichier non livré", () => {
    const temoins: ReadonlyArray<readonly [string, ReadonlyMap<string, string>, number]> = [
      [
        "un appel franc dans un module livré",
        new Map([["core/faux/montage.ts", "creerServeurHttp(transport, reglages);\n"]]),
        1,
      ],
      [
        "le même appel, mais en COMMENTAIRE",
        new Map([["core/faux/montage.ts", "// on pourrait creerServeurHttp(t, r) ici\n"]]),
        0,
      ],
      [
        "le même appel, mais dans une CHAÎNE de caractères",
        new Map([["core/faux/montage.ts", 'const m = "creerServeurHttp(t, r)";\n']]),
        0,
      ],
      [
        "le DÉFINISSEUR lui-même — il ne s'appelle pas",
        new Map([
          ["core/faux/montage.ts", "export function creerServeurHttp(a, b) { return a; }\n"],
        ]),
        0,
      ],
      [
        "un appel franc, mais dans un fichier que `pnpm build` n'émet pas",
        new Map([["core/faux/montage.spec.ts", "creerServeurHttp(transport, reglages);\n"]]),
        0,
      ],
    ];

    const desaccords: string[] = [];
    for (const [nom, sources, attendus] of temoins) {
      const mesure = appelantsDeProduction("creerServeurHttp", sources);
      if (mesure.appelants.length !== attendus) {
        desaccords.push(
          `${nom} : ${String(mesure.appelants.length)} au lieu de ${String(attendus)}`,
        );
      }
    }

    console.info(
      `[lot2·①] ${String(temoins.length)} témoin(s) fabriqué(s) éprouvé(s) · ` +
        `${String(desaccords.length)} désaccord(s) [${desaccords.join(" | ") || "aucun"}] · ` +
        `${String(MOTIFS.length)} motif(s) d'exclusion lus dans tsconfig.build.json ` +
        `[${MOTIFS.join(", ")}]`,
    );

    expect(MOTIFS.length, "les motifs d'exclusion ont bien été lus").toBeGreaterThanOrEqual(4);
    expect(desaccords).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LE DÉFAUT — aucune de ces quatre fabriques n'a d'appelant livré
// ═════════════════════════════════════════════════════════════════════════════

describe("② les fabriques du service n'ont aucun appelant de production", () => {
  /**
   * LES QUATRE FABRIQUES SANS LESQUELLES LE SOCLE NE SERT RIEN.
   *
   * `creerTransportHttp` décide ; `creerServeurHttp` écoute ; `creerServeurStdio`
   * sert un catalogue ; `brancherSurLesFlux` relie ce serveur à `stdin`/`stdout`.
   * Aucune n'est appelée hors des gardes et des fabriques de témoins.
   *
   * Conséquence, et elle est exactement celle que le lot voulait fermer : le
   * socle n'est toujours **appelable par personne**. `ops/main.ts` reçoit
   * `transports: readonly Transport[]` — une liste de NOMS, `"http" | "stdio"` —
   * et son étage 6 annonce `transportsMontes`. Ce compte mesure la longueur d'un
   * tableau de chaînes : **aucun transport n'est monté**, et le mot dit le
   * contraire.
   */
  it("mesure, fabrique par fabrique, et NOMME les appelants trouvés", () => {
    const lignes: string[] = [];
    const sansAppelant: string[] = [];
    for (const nom of FABRIQUES_DU_SERVICE) {
      const mesure = appelantsDeProduction(nom);
      lignes.push(
        `${nom} → ${String(mesure.appelants.length)} appelant(s) ` +
          `[${mesure.appelants.join(", ") || "aucun"}] · ` +
          `${String(mesure.enProse.length)} citation(s) hors production`,
      );
      if (mesure.appelants.length === 0) sansAppelant.push(nom);
    }

    const balayes = appelantsDeProduction(FABRIQUES_DU_SERVICE[0]).balayes;

    console.info(
      `[lot2·②] ${String(SOURCES.size)} fichier(s) .ts lus · ` +
        `${String(balayes)} module(s) de PRODUCTION balayé(s) · ` +
        `${String(FABRIQUES_DU_SERVICE.length)} fabrique(s) confrontée(s) · ` +
        `${String(sansAppelant.length)} SANS appelant de production ` +
        `[${sansAppelant.join(", ") || "aucune"}]\n  ` +
        lignes.join("\n  "),
    );

    // Plancher : le balayage a réellement eu lieu. À zéro module lu, « aucun
    // appelant » serait vrai pour la pire des raisons.
    expect(SOURCES.size).toBeGreaterThanOrEqual(150);
    expect(balayes).toBeGreaterThanOrEqual(80);

    // 🔴 L'ATTENTE DU JALON : le socle doit être MONTÉ quelque part.
    expect(sansAppelant, "aucune fabrique du service ne doit rester sans appelant").toEqual([]);
  });

  /**
   * ET LE PROCESSUS LUI-MÊME : rien ne le démarre.
   *
   * Trois formes suffisent à faire d'un module ES un point d'entrée exécutable,
   * et le dépôt n'en porte aucune : un `bin` dans `package.json`, une garde
   * `import.meta.url === pathToFileURL(process.argv[1])`, ou un appel au niveau
   * du module. `ops/main.ts` porte pourtant un titre de section
   * « L'ENTRÉE DU PROCESSUS » — au-dessus de trois fabriques d'aide et d'aucune
   * entrée.
   */
  it("cherche un point d'entrée exécutable, et annonce les trois formes cherchées", () => {
    const paquet = lire("package.json");
    const aUnBin = /"bin"\s*:/u.test(paquet);
    const aUnMain = /"main"\s*:/u.test(paquet);

    const gardesDEntree: string[] = [];
    const shebangs: string[] = [];
    for (const [chemin, source] of SOURCES) {
      if (!estDeProduction(chemin, MOTIFS)) continue;
      const nu = sansProseNiChaines(source);
      if (/import\.meta\.(url|main)[\s\S]{0,120}process\.argv/u.test(nu))
        gardesDEntree.push(chemin);
      if (source.startsWith("#!")) shebangs.push(chemin);
    }

    const titreDeSection = lire("ops/main.ts").includes("L'ENTRÉE DU PROCESSUS");

    console.info(
      `[lot2·② entrée] 3 forme(s) d'entrée cherchée(s) · ` +
        `"bin" dans package.json : ${String(aUnBin)} · "main" : ${String(aUnMain)} · ` +
        `${String(gardesDEntree.length)} garde(s) import.meta/argv [${gardesDEntree.join(", ") || "aucune"}] · ` +
        `${String(shebangs.length)} shebang(s) [${shebangs.join(", ") || "aucun"}] · ` +
        `ops/main.ts titre une section « L'ENTRÉE DU PROCESSUS » : ${String(titreDeSection)}`,
    );

    expect(paquet.length, "package.json a bien été lu").toBeGreaterThan(200);

    // 🔴 L'ATTENTE : au moins UNE des trois formes doit exister, sans quoi
    //    « le socle démarre » ne désigne aucun geste possible.
    expect(
      aUnBin || gardesDEntree.length > 0 || shebangs.length > 0,
      "aucun point d'entrée exécutable dans le dépôt",
    ).toBe(true);
  });
});

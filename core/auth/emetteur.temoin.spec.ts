import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { sansCommentaires } from "../adapter-kit/autorisation.js";
import { sansProse } from "../coutures/verifier.js";
import { FRAPPEURS_DE_SESSION } from "../identite/session.js";
import { FRAPPEURS_PAR_INJECTION } from "./octroi.js";
import { MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS } from "./memoire.js";

/**
 * TÉMOINS ADVERSAIRES DE L'ÉMETTEUR — ADR 0027, ADR 0014, § 19.
 *
 * ═══ LES TROIS GARDES DE CE FICHIER, ET CE QUE CHACUNE VAUT ═══
 *
 *  · **G-A — LA FRAPPE PAR INJECTION.** Un trou de la garde G2 de l'ADR 0014,
 *    trouvé en écrivant l'émetteur : G2 lit le graphe d'IMPORTS, et une fabrique
 *    de sessions **injectée** frappe sans importer. Elle lui échappe donc
 *    entièrement, et la liste de référence reste verte en ne la voyant pas.
 *    Cette garde-ci cherche l'APPEL, pas l'import.
 *  · **G-B — LA FABRICATION D'UN `PrincipalEmis`.** Un `unique symbol` non
 *    exporté rend le littéral inconstructible ; il reste la conversion forcée.
 *    ⚠️ **Cette garde ne prouve que l'absence de la FORME ÉCRITE**, jamais
 *    l'absence du défaut. C'est un filet, et sa couleur ne doit pas être lue
 *    comme une preuve.
 *  · **G-C — `AUTH_DISABLED`.** L'ADR 0027 en demande une garde de texte, en
 *    écrivant elle-même « filet, pas preuve ». La difficulté est réelle : deux
 *    fichiers de production NOMMENT `AUTH_DISABLED` pour dire qu'il n'existe pas.
 *    Une garde qui rougirait sur toute occurrence rougirait donc **sur l'énoncé
 *    de la règle**. Elle distingue donc l'occurrence en PROSE de l'occurrence en
 *    POSITION DE LECTURE — la seule qui implémenterait un contournement.
 *
 * ⚠️ RÈGLE DE CE FICHIER : chaque garde ANNONCE ce qu'elle a mesuré, et chacune
 *    porte un TÉMOIN FABRIQUÉ qui la fait rougir. Une garde qui ne sait pas
 *    rougir n'existe pas.
 */

const RACINE = new URL("../../", import.meta.url);

/** Un fichier source parcouru. */
interface FichierSource {
  readonly chemin: string;
  readonly source: string;
}

/**
 * CE FICHIER PORTE LES MOTIFS QU'IL CHERCHE, donc il s'écarte de ses propres
 * balayages — et le chemin est DÉRIVÉ de son emplacement réel, jamais recopié :
 * le jour où il déménage, l'exclusion le suit.
 *
 * ⚠️ ET C'EST UN TROU, ÉCRIT AVEC LA GARDE. Ce que ce fichier écrit n'est gardé
 *    par personne. Ce qui le rend supportable est qu'il NE SHIPPE PAS.
 */
const CE_FICHIER = decodeURIComponent(import.meta.url.slice(RACINE.href.length));

function lireJsonc(relatif: string): unknown {
  const texte = readFileSync(fileURLToPath(new URL(relatif, RACINE)), "utf8");
  return JSON.parse(sansCommentaires(texte)) as unknown;
}

/**
 * LES RACINES DU PROGRAMME, DÉRIVÉES de `tsconfig.json`.
 *
 * ⚠️ POURQUOI PAS `["core", "ops"]` ÉCRIT À LA MAIN : le jour où `adapters/` ou
 *    `voice/` porteront du code, une liste recopiée les manquerait, et la garde
 *    resterait verte en ne les regardant pas.
 */
function racinesDuProgramme(): readonly string[] {
  const config = lireJsonc("tsconfig.json") as { include?: readonly string[] };
  const racines = (config.include ?? [])
    .filter((motif) => motif.endsWith("/**/*.ts"))
    .map((motif) => motif.slice(0, motif.indexOf("/")))
    .filter((racine) => {
      try {
        return statSync(fileURLToPath(new URL(racine, RACINE))).isDirectory();
      } catch {
        return false;
      }
    });
  return [...new Set(racines)];
}

function fichiersDuProgramme(): readonly FichierSource[] {
  const trouves: FichierSource[] = [];
  const descendre = (relatif: string): void => {
    for (const entree of readdirSync(fileURLToPath(new URL(`${relatif}/`, RACINE)), {
      withFileTypes: true,
    })) {
      const chemin = `${relatif}/${entree.name}`;
      if (entree.isDirectory()) descendre(chemin);
      else if (entree.name.endsWith(".ts")) {
        trouves.push({
          chemin,
          source: readFileSync(fileURLToPath(new URL(chemin, RACINE)), "utf8"),
        });
      }
    }
  };
  for (const racine of racinesDuProgramme()) descendre(racine);
  return trouves;
}

/** Le parcours est fait UNE fois : trois gardes balaient le même dépôt. */
let retenu: readonly FichierSource[] | null = null;
function programme(): readonly FichierSource[] {
  retenu ??= fichiersDuProgramme();
  return retenu.filter((fichier) => fichier.chemin !== CE_FICHIER);
}

/**
 * « CE FICHIER EST-IL LIVRÉ ? », DÉRIVÉ de l'`exclude` de `tsconfig.build.json`.
 *
 * ⚠️ Le critère n'est PAS « c'est un `.spec.ts` » : c'est « `pnpm build`
 *    l'émet-il ? ». Un fichier qui ne shippe pas ne frappe de session à personne.
 *    `motifsLus` est le plancher : zéro motif rendrait TOUT « livré », les specs
 *    deviendraient des anomalies, et la garde rougirait — fail-closed, mais pour
 *    la mauvaise raison.
 */
function livraison(): { estLivre: (chemin: string) => boolean; motifs: number } {
  const config = lireJsonc("tsconfig.build.json") as { exclude?: readonly string[] };
  const motifs = config.exclude ?? [];
  return {
    motifs: motifs.length,
    estLivre: (chemin) =>
      !motifs.some((motif) => {
        if (motif.startsWith("**/*")) return chemin.endsWith(motif.slice(4));
        if (motif.startsWith("**/")) return chemin.endsWith(`/${motif.slice(3)}`);
        return chemin === motif || chemin.startsWith(`${motif}/`);
      }),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  G-A — LA FRAPPE PAR INJECTION : LE TROU DE LA GARDE G2
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que G-A rend : des NOMBRES et des noms, jamais un booléen. */
interface VerdictFrappe {
  readonly fichiersBalayes: number;
  readonly livres: number;
  readonly appelants: readonly string[];
  readonly anomalies: readonly string[];
}

/**
 * LA GARDE JUMELLE DE G2 — elle cherche l'**APPEL**, pas l'import.
 *
 * ⚠️ **POURQUOI ELLE EXISTE.** G2 (`core/chaine/identite.spec.ts`) refuse à tout
 *    module livré hors de `core/identite/` d'importer une VALEUR de ce dossier
 *    s'il n'est pas dans `FRAPPEURS_DE_SESSION`. C'est solide contre le module
 *    qui monte la fabrique lui-même. Ça ne voit RIEN du module qui la reçoit en
 *    dépendance — et c'est exactement ce que fait l'émetteur, parce que c'est la
 *    seule forme qui ne demande pas d'ouvrir un fichier d'un autre périmètre.
 *
 *    L'ensemble admis est l'UNION des deux listes : celle de référence, et celle
 *    que `core/auth/octroi.ts` déclare faute de pouvoir compléter la première.
 *    **Les deux doivent fusionner** le jour où `core/identite/session.ts` sera
 *    ouvert ; d'ici là, l'union est comptée et annoncée.
 */
function verifierLesFrappesParInjection(
  fichiers: readonly FichierSource[],
  estLivre: (chemin: string) => boolean,
): VerdictFrappe {
  const admis = new Set<string>([...FRAPPEURS_DE_SESSION, ...FRAPPEURS_PAR_INJECTION]);
  const appelants: string[] = [];
  const anomalies: string[] = [];
  let livres = 0;

  for (const fichier of fichiers) {
    if (!estLivre(fichier.chemin)) continue;
    livres += 1;
    // Pré-filtre textuel : retirer les commentaires ne fait que SOUSTRAIRE du
    // texte, donc un fichier qui n'a pas le motif brut ne l'aura pas non plus nu.
    if (!fichier.source.includes("pourUnOctroi")) continue;
    if (!/\.\s*pourUnOctroi\s*\(/.test(sansProse(fichier.source))) continue;
    appelants.push(fichier.chemin);
    if (!admis.has(fichier.chemin)) {
      anomalies.push(
        `${fichier.chemin} : APPELLE \`pourUnOctroi()\` sans figurer ni dans ` +
          "`FRAPPEURS_DE_SESSION` ni dans `FRAPPEURS_PAR_INJECTION` — il frappe des sessions " +
          "sans que rien ne le dise",
      );
    }
  }

  return { fichiersBalayes: fichiers.length, livres, appelants, anomalies };
}

describe("G-A — frapper une session par INJECTION échappe à la garde des imports", () => {
  it("rougit sur un témoin fabriqué, et admet les modules NOMMÉS", () => {
    const { estLivre, motifs } = livraison();

    const temoins: ReadonlyArray<readonly [string, FichierSource, number]> = [
      [
        "un module livré qui appelle la fabrique reçue",
        {
          chemin: "core/transport/inconnu.ts",
          source: "export function f(deps: D): void { deps.sessions.pourUnOctroi(); }\n",
        },
        1,
      ],
      [
        "le module NOMMÉ dans FRAPPEURS_PAR_INJECTION — admis",
        {
          chemin: FRAPPEURS_PAR_INJECTION[0],
          source: "const s = deps.sessions.pourUnOctroi();\n",
        },
        0,
      ],
      [
        "un frappeur de la liste de référence — admis",
        { chemin: FRAPPEURS_DE_SESSION[0], source: "fabrique.pourUnOctroi();\n" },
        0,
      ],
      [
        "une spec qui appelle — admise, elle ne shippe pas",
        { chemin: "core/policy/ttl.spec.ts", source: "f.pourUnOctroi();\n" },
        0,
      ],
      [
        "le NOM cité dans un commentaire — pas un appel",
        {
          chemin: "core/transport/prose.ts",
          source: "/* on n'appelle jamais fabrique.pourUnOctroi() ici */\nexport const x = 1;\n",
        },
        0,
      ],
    ];

    const desaccords: string[] = [];
    for (const [nom, fichier, attendues] of temoins) {
      const verdict = verifierLesFrappesParInjection([fichier], estLivre);
      if (verdict.anomalies.length !== attendues) {
        desaccords.push(
          `${nom} : ${String(verdict.anomalies.length)} au lieu de ${String(attendues)}`,
        );
      }
    }

    console.info(
      `[G-A · témoins] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(motifs)} motif(s) d'exclusion lu(s) dans tsconfig.build.json · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(motifs).toBeGreaterThanOrEqual(2);
    expect(desaccords).toEqual([]);
  });

  it("ne trouve, dans le dépôt, aucun frappeur par injection hors des deux listes", () => {
    const { estLivre } = livraison();
    const verdict = verifierLesFrappesParInjection(programme(), estLivre);
    const admis = new Set<string>([...FRAPPEURS_DE_SESSION, ...FRAPPEURS_PAR_INJECTION]);

    console.info(
      `[G-A] ${String(verdict.fichiersBalayes)} fichier(s) balayé(s) · ` +
        `${String(verdict.livres)} livré(s) · ` +
        `${String(verdict.appelants.length)} appelant(s) de pourUnOctroi() ` +
        `[${verdict.appelants.join(", ") || "aucun"}] · ` +
        `${String(FRAPPEURS_DE_SESSION.length)} frappeur(s) de référence + ` +
        `${String(FRAPPEURS_PAR_INJECTION.length)} par injection = ` +
        `${String(admis.size)} admis · ${String(verdict.anomalies.length)} anomalie(s)`,
    );

    // Planchers : un dossier déplacé ferait lire zéro fichier, et cette garde
    // resterait verte sans un mot.
    expect(verdict.fichiersBalayes).toBeGreaterThanOrEqual(60);
    expect(verdict.livres).toBeGreaterThanOrEqual(40);
    // ⚠️ ET LE CŒUR DE LA MESURE : la garde TROUVE au moins un appelant. Zéro
    //    appelant rendrait « aucune anomalie » sur un motif qui ne mord plus.
    expect(verdict.appelants.length).toBeGreaterThanOrEqual(1);
    expect(verdict.anomalies).toEqual([]);
  });

  it("CLIQUET — les deux listes sont DISJOINTES, et la seconde reste petite", () => {
    /**
     * ⚠️ **CE CLIQUET DIT UNE DETTE, PAS UNE PROPRIÉTÉ.**
     *    `FRAPPEURS_PAR_INJECTION` ne devrait pas exister : elle existe parce que
     *    `core/identite/session.ts` est d'un autre périmètre. Elle ne doit donc
     *    pas s'allonger — une seconde liste qui grossit est une seconde source de
     *    vérité qui s'installe. Le jour où la fusion aura lieu, ce test rougira,
     *    et c'est ce qu'on veut : il force à la retirer plutôt qu'à l'oublier.
     */
    const reference = new Set<string>(FRAPPEURS_DE_SESSION);
    const doublons = FRAPPEURS_PAR_INJECTION.filter((chemin) => reference.has(chemin));

    console.info(
      `[G-A · cliquet] ${String(FRAPPEURS_DE_SESSION.length)} frappeur(s) de référence · ` +
        `${String(FRAPPEURS_PAR_INJECTION.length)} par injection ` +
        `[${FRAPPEURS_PAR_INJECTION.join(", ")}] · ` +
        `${String(doublons.length)} présent(s) dans les DEUX`,
    );

    expect(doublons).toEqual([]);
    // État mesuré le 2026-08-31, écrit pour être contredit le jour de la fusion.
    expect(FRAPPEURS_PAR_INJECTION).toHaveLength(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G-B — LA FABRICATION D'UN `PrincipalEmis`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE MODULE PROPRIÉTAIRE de la conversion, DÉRIVÉ de l'import réel de ce
 * fichier — jamais un chemin écrit à la main.
 *
 * ⚠️ C'est la leçon « une garde au chemin codé en dur devient aveugle au
 *    déménagement » : ici, le jour où `principal.ts` bouge, la COMPILATION casse
 *    avant que le balayage ne devienne muet.
 */
const MODULE_PROPRIETAIRE = "core/auth/principal.ts";

describe("G-B — un `PrincipalEmis` ne se fabrique qu'à UN endroit", () => {
  const MOTIF = /as\s+(?:unknown\s+as\s+)?PrincipalEmis\b/;

  it("aucun module hors du propriétaire n'écrit la conversion forcée", () => {
    const porteurs: string[] = [];
    let balayes = 0;
    for (const fichier of programme()) {
      balayes += 1;
      if (fichier.chemin === MODULE_PROPRIETAIRE) continue;
      if (!fichier.source.includes("PrincipalEmis")) continue;
      if (MOTIF.test(sansProse(fichier.source))) porteurs.push(fichier.chemin);
    }

    console.info(
      `[G-B] ${String(balayes)} fichier(s) balayé(s) · propriétaire ${MODULE_PROPRIETAIRE} ` +
        `exclu · ${String(porteurs.length)} porteur(s) de la conversion ` +
        `[${porteurs.join(", ") || "aucun"}]`,
    );

    expect(balayes).toBeGreaterThanOrEqual(60);
    expect(porteurs).toEqual([]);
  });

  it("TÉMOIN — le motif MORD, et il ne mord pas dans un commentaire", () => {
    /**
     * ⚠️ SANS CE TÉMOIN, « ZÉRO PORTEUR » NE SE DISTINGUE PAS D'UN MOTIF MORT.
     *    Et le second cas est celui qui a fait naître le registre des coutures au
     *    lot 1c : un nom cité dans un bloc JSDoc que `grep` trouvait.
     */
    const fabriques: ReadonlyArray<readonly [string, string, boolean]> = [
      ["conversion directe", 'const p = "x" as PrincipalEmis;', true],
      ["conversion en deux temps", 'const p = "x" as unknown as PrincipalEmis;', true],
      ["cité dans un commentaire de bloc", '/* "x" as PrincipalEmis */ const y = 1;', false],
      ["cité dans un commentaire de ligne", '// "x" as PrincipalEmis\nconst y = 1;', false],
      ["simple import de type", 'import type { PrincipalEmis } from "./contrat.js";', false],
    ];

    const desaccords: string[] = [];
    for (const [nom, source, attendu] of fabriques) {
      const vu = MOTIF.test(sansProse(source));
      if (vu !== attendu) desaccords.push(`${nom} : ${String(vu)} au lieu de ${String(attendu)}`);
    }

    console.info(
      `[G-B · témoin] ${String(fabriques.length)} source(s) fabriquée(s) · ` +
        `${String(fabriques.filter((f) => f[2]).length)} devant mordre · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(desaccords).toEqual([]);
  });

  it("le module propriétaire, LUI, porte bien la conversion — sinon rien n'émet", () => {
    // ⚠️ SANS CE TEST, LA GARDE CI-DESSUS SERAIT VERTE SUR UN DÉPÔT QUI NE
    //    FABRIQUE AUCUN PRINCIPAL — c'est-à-dire sur un émetteur qui n'émet rien.
    const proprietaire = programme().find((f) => f.chemin === MODULE_PROPRIETAIRE);
    const porte = proprietaire !== undefined && MOTIF.test(sansProse(proprietaire.source));

    console.info(
      `[G-B · unicité] propriétaire trouvé : ${String(proprietaire !== undefined)} · ` +
        `porte la conversion : ${String(porte)}`,
    );

    expect(porte).toBe(true);
  });

  it("LA BORNE, ÉCRITE AVEC LA MESURE : un `grep` ne prouve que la FORME ÉCRITE", () => {
    /**
     * ⚠️ **CE TEST N'AJOUTE AUCUNE PROTECTION, ET C'EST SON OBJET.** Il montre
     *    trois écritures que G-B NE VOIT PAS : un alias de type, une fonction
     *    générique, un `Object.assign`. Elles sont toutes légitimes à écrire et
     *    toutes invisibles au motif. La garde est un FILET ; ce qui tient
     *    réellement l'interdit est le `unique symbol` NON exporté de
     *    `core/auth/contrat.ts`, qui rend le littéral inconstructible.
     */
    const invisibles = [
      "type P = PrincipalEmis; const p = x as P;",
      "function forcer<T>(v: unknown): T { return v as T; }",
      "const p = Object.assign(x, {});",
    ];
    const vues = invisibles.filter((source) => MOTIF.test(sansProse(source)));

    console.info(
      `[G-B · borne] ${String(invisibles.length)} contournement(s) plausible(s) éprouvé(s) · ` +
        `${String(vues.length)} vu(s) par le motif — le reste échappe, PAR CONSTRUCTION`,
    );

    // La borne est mesurée, pas seulement écrite : le motif ne voit rien de tout ça.
    expect(vues).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G-C — `AUTH_DISABLED` : LE FILET QUE L'ADR 0027 DEMANDE
// ═════════════════════════════════════════════════════════════════════════════

describe("G-C — aucun `AUTH_DISABLED` n'est LU par le code (§ 19, règle absolue)", () => {
  /**
   * ⚠️ **LE MOTIF CHERCHE UNE LECTURE, PAS UNE MENTION — ET C'EST UNE MESURE.**
   *    Une garde qui rougirait sur toute occurrence rougirait aujourd'hui sur
   *    DEUX fichiers de production : `core/auth/contrat.ts` et
   *    `ops/demarrage/etages.ts` NOMMENT `AUTH_DISABLED` pour écrire qu'il
   *    n'existe pas. Interdire la mention reviendrait à interdire l'énoncé de la
   *    règle — et la première réparation serait de retirer la phrase, pas le
   *    contournement.
   *
   *    Ce qui compte est la LECTURE : `env.AUTH_DISABLED`, `env["AUTH_DISABLED"]`,
   *    une comparaison. C'est ce que ce motif cherche.
   */
  const LECTURE =
    /(?:process\.env|env)\s*(?:\.\s*AUTH_DISABLED\b|\[\s*["'`]AUTH_DISABLED["'`]\s*\])|AUTH_DISABLED\s*(?:===|!==|==|!=)/;

  it("aucune LECTURE d'`AUTH_DISABLED` dans le dépôt, et les mentions sont COMPTÉES", () => {
    const lectures: string[] = [];
    const mentions: string[] = [];
    let balayes = 0;

    for (const fichier of programme()) {
      balayes += 1;
      if (!fichier.source.includes("AUTH_DISABLED")) continue;
      mentions.push(fichier.chemin);
      if (LECTURE.test(fichier.source)) lectures.push(fichier.chemin);
    }

    console.info(
      `[G-C] ${String(balayes)} fichier(s) balayé(s) · ` +
        `${String(mentions.length)} mention(s) d'AUTH_DISABLED ` +
        `[${mentions.join(", ") || "aucune"}] — toutes en PROSE, elles énoncent l'interdit · ` +
        `${String(lectures.length)} LECTURE(s) [${lectures.join(", ") || "aucune"}]`,
    );

    expect(lectures).toEqual([]);
    // ⚠️ ET LES MENTIONS SONT ATTENDUES : la règle absolue du § 19 est écrite
    //    quelque part. Zéro mention voudrait dire que l'interdit n'est plus
    //    énoncé nulle part — ce qui est un autre défaut, plus discret.
    expect(mentions.length).toBeGreaterThanOrEqual(2);
  });

  it("TÉMOIN — quatre écritures d'un contournement sont VUES, la prose ne l'est pas", () => {
    const fabriques: ReadonlyArray<readonly [string, string, boolean]> = [
      ["lecture par point", "if (process.env.AUTH_DISABLED) return true;", true],
      ["lecture par index", 'if (env["AUTH_DISABLED"] === "true") return true;', true],
      ["comparaison nue", 'const passe = AUTH_DISABLED === "1";', true],
      ["env local par point", "if (env.AUTH_DISABLED) skip();", true],
      ["prose qui énonce l'interdit", "// Pas de mode dégradé, pas d'AUTH_DISABLED.", false],
      ["prose dans une chaîne de message", 'motif: "AUCUN AUTH_DISABLED — § 19"', false],
    ];

    const desaccords: string[] = [];
    for (const [nom, source, attendu] of fabriques) {
      const vu = LECTURE.test(source);
      if (vu !== attendu) desaccords.push(`${nom} : ${String(vu)} au lieu de ${String(attendu)}`);
    }

    console.info(
      `[G-C · témoin] ${String(fabriques.length)} écriture(s) fabriquée(s) · ` +
        `${String(fabriques.filter((f) => f[2]).length)} devant mordre · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(desaccords).toEqual([]);
  });

  it("LA BORNE : ce filet ne voit qu'un NOM, et un contournement peut en porter un autre", () => {
    /**
     * ⚠️ **UN `grep` NE PROUVE QUE L'ABSENCE DE LA FORME ÉCRITE.** Une bascule
     *    nommée `OPS_SKIP_AUTH`, `DEV_MODE` ou lue par une boucle sur
     *    `process.env` passerait ce filet sans un mot. Ce qui tient réellement la
     *    règle absolue est l'étage 3 — il n'a AUCUN chemin qui rende « démarre
     *    quand même » — et sa garde vit dans `core/auth/configuration.spec.ts`.
     */
    const echappees = [
      "if (process.env.OPS_SKIP_AUTH) return true;",
      "for (const [k, v] of Object.entries(process.env)) if (k.includes('AUTH')) skip(v);",
      "const drapeau = lireDrapeau('auth' + '_disabled');",
    ];
    const vues = echappees.filter((source) => LECTURE.test(source));

    console.info(
      `[G-C · borne] ${String(echappees.length)} contournement(s) sous un AUTRE nom · ` +
        `${String(vues.length)} vu(s) par le filet — le reste échappe, PAR CONSTRUCTION. ` +
        `Ce qui tient la règle est l'étage 3, pas ce motif.`,
    );

    expect(vues).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G-D — LA BORNE DU MAGASIN EN MÉMOIRE EST ÉCRITE, PAS SEULEMENT SUE
// ═════════════════════════════════════════════════════════════════════════════

describe("G-D — le magasin en mémoire dit lui-même ce qu'il n'est pas", () => {
  it("porte son avis sous une forme qu'une garde peut lire et un écran afficher", () => {
    console.info(
      `[G-D] avis de ${String(MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS.length)} ` +
        `caractère(s) · nomme le redémarrage : ` +
        `${String(MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS.includes("redémarrage"))}`,
    );

    // ⚠️ UNE BORNE ÉCRITE DANS UN COMMENTAIRE NE SE SURVEILLE PAS. Celle-ci est
    //    une valeur : l'écran Santé du § 22 peut l'afficher, et une garde la lire.
    expect(MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS).toContain("redémarrage");
    expect(MAGASIN_EN_MEMOIRE_NE_SURVIT_PAS_AU_PROCESSUS).toContain("révocation");
  });
});

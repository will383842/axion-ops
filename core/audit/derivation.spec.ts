import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { CHAMPS_COUVERTS, CHAMPS_EXCLUS } from "./canonique.js";

/**
 * LES DEUX GARDES DÉRIVÉES DU MODULE.
 *
 * « Dériver, jamais recopier. » Les deux gardes ci-dessous ne portent aucune
 * liste : l'une lit `prisma/schema.prisma`, l'autre lit les fichiers de ce
 * dossier. Toutes deux annoncent COMBIEN d'éléments elles ont mesurés et
 * échouent sous un plancher-témoin — une garde qui lit zéro fichier est verte
 * pour la pire des raisons, et c'est exactement ce qui arrive quand un fichier
 * est déplacé.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la couverture de l'empreinte est confrontée AU SCHÉMA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrait les noms de champ d'un modèle Prisma.
 *
 * Fonction PURE, pour qu'un témoin fabriqué puisse la faire rougir sans qu'on
 * ait à écrire quoi que ce soit dans `prisma/`, dossier d'un autre constructeur.
 */
function champsDuModele(schema: string, modele: string): readonly string[] {
  const debut = schema.indexOf(`model ${modele} {`);
  if (debut === -1) return [];
  const fin = schema.indexOf("\n}", debut);
  if (fin === -1) return [];

  const corps = schema.slice(debut, fin);
  const champs: string[] = [];

  for (const ligne of corps.split("\n").slice(1)) {
    const nettoyee = ligne.trim();
    // On saute les commentaires (`//`, `///`) et les attributs de bloc (`@@`).
    if (nettoyee === "" || nettoyee.startsWith("//") || nettoyee.startsWith("@@")) continue;
    const capture = /^([A-Za-z_][A-Za-z0-9_]*)\s+\S/.exec(nettoyee);
    if (capture?.[1] !== undefined) champs.push(capture[1]);
  }

  return champs;
}

/** Un champ du schéma est-il pris en charge ? Couvert, ou explicitement exclu. */
function champsOrphelins(champsSchema: readonly string[]): readonly string[] {
  const connus = new Set<string>([...CHAMPS_COUVERTS, ...CHAMPS_EXCLUS]);
  return champsSchema.filter((champ) => !connus.has(champ));
}

const CHEMIN_SCHEMA = fileURLToPath(new URL("../../prisma/schema.prisma", import.meta.url));

describe("core/audit — la couverture de l'empreinte dérive du schéma", () => {
  it("rougit sur un témoin fabriqué portant une colonne de plus", () => {
    const temoin = [
      "model OpsAudit {",
      "  seq BigInt @id",
      "  at DateTime",
      "  /// un commentaire qui ne doit pas être lu comme un champ",
      "  colonneAjouteeSansCouverture String",
      '  @@map("ops_audit")',
      "}",
    ].join("\n");

    const champs = champsDuModele(temoin, "OpsAudit");

    expect(champs).toEqual(["seq", "at", "colonneAjouteeSansCouverture"]);
    expect(champsOrphelins(champs)).toEqual(["colonneAjouteeSansCouverture"]);
  });

  it("rougit aussi si le modèle est introuvable — un renommage rendrait la garde muette", () => {
    expect(champsDuModele("model Autre {\n  x Int\n}", "OpsAudit")).toEqual([]);
  });

  it("couvre ou exclut TOUS les champs d'`ops_audit`, et rien de plus", () => {
    const schema = readFileSync(CHEMIN_SCHEMA, "utf8");
    const champs = champsDuModele(schema, "OpsAudit");

    console.info(
      `[garde schéma] ${String(champs.length)} champs lus dans ` +
        `prisma/schema.prisma → model OpsAudit`,
    );

    // Plancher-témoin : le § 12 en énumérait dix-huit ; le lot 1b en ajoute un
    // — `argHashValidated`, qui sépare les deux populations d'`argHash`. Un
    // modèle introuvable ou renommé rendrait `champs` vide, et sans ce plancher
    // la garde resterait verte en n'ayant rien lu.
    expect(champs.length).toBe(19);
    expect(champsOrphelins(champs)).toEqual([]);

    // Et l'inverse : aucun champ déclaré couvert n'est absent du schéma. Sans
    // cela, on couvrirait un fantôme et l'empreinte porterait sur du vide.
    const auSchema = new Set(champs);
    const fantomes = [...CHAMPS_COUVERTS, ...CHAMPS_EXCLUS].filter((champ) => !auSchema.has(champ));
    expect(fantomes).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — `core/audit` NE CALCULE JAMAIS D'HMAC
// ─────────────────────────────────────────────────────────────────────────────

/**
 * § 12, règle 2 — `argHash` est un HMAC clé, fourni par `core/limits`. Une
 * seconde implémentation ici serait une seconde clé, donc une seconde échéance
 * de rotation, alors que le § 12 exige que la clé soit tournée ou purgée AVEC
 * le journal. Le port `ArgHasher` existe pour ça.
 *
 * ⚠️ Cette garde ne prouve que l'absence de la FORME ÉCRITE qu'elle nomme. Elle
 *    cherche donc plusieurs formes, pas une seule : l'import nommé, l'accès par
 *    espace de noms, et le nom de l'algorithme.
 */
const FORMES_INTERDITES: ReadonlyArray<readonly [string, RegExp]> = [
  // La fabrique de `node:crypto`, importée nommément.
  ["createHmac", /\bcreateHmac\b/],
  // La même, atteinte par l'espace de noms — un `import * as crypto`.
  ["crypto.createHmac", /crypto\s*\.\s*createHmac/],
  // Le type Node lui-même. La prose du module écrit « HMAC » en capitales : ce
  // motif-ci ne peut donc pas mordre sur un commentaire.
  ["type Hmac", /\bHmac\b/],
];

/**
 * Retire commentaires de ligne et de bloc.
 *
 * Sans cette étape, la garde mordait sur la PROSE : `ports.ts` explique
 * précisément qu'il ne faut pas appeler `createHmac`, et se faisait donc
 * accuser de l'appeler. Une garde qui confond ce qu'un fichier FAIT et ce qu'il
 * DIT est une garde qui rougit pour la mauvaise raison, ce qui finit toujours
 * par se solder par une exception écrite à la main — c'est-à-dire par un trou.
 *
 * ⚠️ Borne connue : les littéraux de chaîne sont CONSERVÉS (une chaîne ne peut
 *    pas appeler, mais la voir aide à repérer un appel dynamique), et les
 *    littéraux d'expression régulière ne sont pas reconnus. Aucun fichier du
 *    dossier n'en porte qui contienne `//` ou un ouvrant de bloc ; le témoin
 *    ci-dessous vérifie le comportement sur les deux formes de commentaire.
 */
function retirerCommentaires(source: string): string {
  let sortie = "";
  let etat: "code" | "ligne" | "bloc" | "chaine" = "code";
  let delimiteur = "";

  for (let index = 0; index < source.length; index += 1) {
    const caractere = source[index] ?? "";
    const suivant = source[index + 1] ?? "";

    if (etat === "ligne") {
      if (caractere === "\n") {
        etat = "code";
        sortie += caractere;
      }
      continue;
    }
    if (etat === "bloc") {
      if (caractere === "*" && suivant === "/") {
        etat = "code";
        index += 1;
      }
      continue;
    }
    if (etat === "chaine") {
      sortie += caractere;
      if (caractere === "\\") {
        sortie += suivant;
        index += 1;
      } else if (caractere === delimiteur) {
        etat = "code";
      }
      continue;
    }

    if (caractere === "/" && suivant === "/") {
      etat = "ligne";
      index += 1;
      continue;
    }
    if (caractere === "/" && suivant === "*") {
      etat = "bloc";
      index += 1;
      continue;
    }
    if (caractere === '"' || caractere === "'" || caractere === "`") {
      etat = "chaine";
      delimiteur = caractere;
    }
    sortie += caractere;
  }

  return sortie;
}

function formesTrouvees(source: string): readonly string[] {
  const code = retirerCommentaires(source);
  return FORMES_INTERDITES.filter(([, motif]) => motif.test(code)).map(([nom]) => nom);
}

const DOSSIER = new URL(".", import.meta.url);

describe("core/audit — le module ne réimplémente pas l'`argHash`", () => {
  it("rougit sur un témoin fabriqué qui calcule un HMAC", () => {
    const temoin = 'import { createHmac } from "node:crypto";\nconst h = createHmac("sha256", k);';
    expect(formesTrouvees(temoin)).toContain("createHmac");
  });

  it("ne confond pas ce qu'un fichier FAIT et ce qu'il DIT", () => {
    // Trois témoins : le même identifiant en commentaire de ligne, en
    // commentaire de bloc, et en code. Sans cette distinction, la garde
    // accusait `ports.ts` — qui explique justement qu'il ne faut pas l'appeler.
    const temoins: ReadonlyArray<readonly [string, string, boolean]> = [
      ["commentaire de ligne", "// ne jamais appeler createHmac ici\nconst x = 1;", false],
      ["commentaire de bloc", "/* interdit : createHmac */\nconst x = 1;", false],
      ["code", "const h = createHmac(algo, cle);", true],
    ];

    const desaccords: string[] = [];
    for (const [nom, source, attendu] of temoins) {
      const trouve = formesTrouvees(source).length > 0;
      if (trouve !== attendu) desaccords.push(nom);
    }

    console.info(`[garde commentaires] ${String(temoins.length)} témoins éprouvés`);
    expect(desaccords).toEqual([]);
  });

  it("ne trouve aucune forme interdite dans les sources du module", () => {
    const fichiers = readdirSync(DOSSIER)
      .filter((nom) => nom.endsWith(".ts"))
      // Ce fichier-ci PORTE les motifs interdits : il les cherche.
      .filter((nom) => nom !== "derivation.spec.ts");

    const coupables: string[] = [];
    for (const nom of fichiers) {
      const source = readFileSync(fileURLToPath(new URL(nom, DOSSIER)), "utf8");
      for (const forme of formesTrouvees(source)) {
        coupables.push(`${nom} : ${forme}`);
      }
    }

    console.info(`[garde HMAC] ${String(fichiers.length)} fichiers du module scannés`);

    // Plancher-témoin : le module en compte au moins huit. Un dossier déplacé
    // ferait lire zéro fichier, et la garde resterait verte sans un mot.
    expect(fichiers.length).toBeGreaterThanOrEqual(8);
    expect(coupables).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
//  Garde 3 - LES DIX TABLES DU § 12, ET LEURS UNICITES
// -----------------------------------------------------------------------------

/**
 * POURQUOI CETTE GARDE VIT ICI, ET OU ELLE DEVRAIT VIVRE.
 *
 * Le § 12 s'ouvre sur « DIX tables », et deux de ses lignes portent la mention
 * « nouvelle » — `ops_token` et `ops_runtime` — précisément parce que la v5 les
 * avait oubliées. Vérifié le 2026-08-30 : AUCUNE garde du dépôt ne comptait ces
 * dix tables. Trois specs lisent `prisma/schema.prisma` (`core/audit`,
 * `core/policy`, `core/vault`, plus `core/limits` sur `ops_quota`), et chacune
 * n'y regarde QUE le modèle qui la concerne. Une table entière pouvait donc
 * disparaître d'un coup d'éditeur sans qu'une seule ligne rougisse.
 *
 * Le schéma n'appartient à aucun module ; cette garde devrait à terme vivre dans
 * une spec propre au schéma. Elle est posée ici parce que c'est le seul endroit
 * qui lisait déjà le fichier pour autre chose qu'un miroir de module, et parce
 * qu'un trou signalé sans garde reste un trou. À déplacer par la Recette.
 *
 * Les dix noms et les unicités ci-dessous sont recopiés DU CAHIER DES CHARGES,
 * pas du code : c'est le sens même d'une confrontation. Ce qui serait fautif,
 * ce serait de les dériver du schéma qu'ils doivent contrôler.
 */

/** Le nom SQL de chaque modèle, tel que l'attribut `@@map` le pose. */
function tablesDuSchema(source: string): readonly string[] {
  return [...source.matchAll(/@@map\("([a-z_]+)"\)/g)]
    .map((capture) => capture[1] ?? "")
    .filter((nom) => nom !== "");
}

/** Le corps textuel d'un modèle, pour y chercher un attribut de bloc. */
function corpsDuModele(source: string, modele: string): string {
  const debut = source.indexOf(`model ${modele} {`);
  if (debut < 0) return "";
  const fin = source.indexOf("\n}", debut);
  return fin < 0 ? "" : source.slice(debut, fin);
}

/** Les dix tables du § 12, dans son ordre. */
const TABLES_DU_CDC = [
  "ops_secret",
  "ops_policy",
  "ops_adapter",
  "ops_tool",
  "ops_audit",
  "ops_idempotency",
  "ops_quota",
  "ops_discovery",
  "ops_token",
  "ops_runtime",
] as const;

/**
 * Les contraintes que le § 12 ÉNONCE, avec le motif que le cahier lui donne.
 * Chacune est une phrase du document, pas un choix d'implémentation.
 */
const CONTRAINTES_DU_CDC: ReadonlyArray<readonly [string, string, RegExp]> = [
  // « unicité (name, version) » — un `name` unique interdirait de garder l'ancien
  // refresh token valide pendant la propagation (§ 27).
  ["OpsSecret", "@@unique([name, version])", /@@unique\(\[name,\s*version\]\)/],
  // « unicité (window, tool, principal) · incrément atomique conditionnel ».
  [
    "OpsQuota",
    "@@unique([window, tool, principal])",
    /@@unique\(\[window,\s*tool,\s*principal\]\)/,
  ],
  // « Sans unicité, l'action "ignorer" ne survit pas au scan suivant. »
  [
    "OpsDiscovery",
    "@@unique([adapterId, kind, subject])",
    /@@unique\(\[adapterId,\s*kind,\s*subject\]\)/,
  ],
  // « selfHash (unique) » — une réécriture silencieuse produit une collision.
  ["OpsAudit", "selfHash … @unique", /selfHash\s+String\s+@unique/],
  // « clé primaire (tool, key) » — c'est l'insertion qui verrouille.
  ["OpsIdempotency", "@@id([tool, key])", /@@id\(\[tool,\s*key\]\)/],
  // « seq (bigint, ordre total) » — ordonner par seq, JAMAIS par at.
  ["OpsAudit", "seq BigInt @id", /seq\s+BigInt\s+@id/],
  // « Un compteur sans dénominateur ne peut ni refuser ni alerter à 80 %. »
  // Le dénominateur est NON NULLABLE : un `Int?` rendrait le refus indécidable.
  ["OpsQuota", "limit Int (non nullable)", /\n\s*limit\s+Int\s*\n/],
  ["OpsQuota", "warnAt Int (non nullable)", /\n\s*warnAt\s+Int\s*\n/],
];

describe("core/audit — le § 12 pose DIX tables, et le schéma les porte toutes", () => {
  it("rougit sur un témoin fabriqué auquel il manque une table", () => {
    const temoin = [
      'model A {\n  id String @id\n  @@map("ops_secret")\n}',
      'model B {\n  id String @id\n  @@map("ops_policy")\n}',
    ].join("\n\n");

    const tables = tablesDuSchema(temoin);

    expect(tables).toEqual(["ops_secret", "ops_policy"]);
    expect(TABLES_DU_CDC.filter((nom) => !tables.includes(nom))).toHaveLength(8);
  });

  it("rougit sur un témoin fabriqué dont l'unicité a été retirée", () => {
    const sans = "model OpsQuota {\n  id String @id\n  count Int\n}";
    const contrainte = CONTRAINTES_DU_CDC.find(([modele]) => modele === "OpsQuota");
    if (contrainte === undefined) throw new Error("témoin mal fabriqué");
    expect(contrainte[2].test(corpsDuModele(sans, "OpsQuota"))).toBe(false);
  });

  it("compte les dix tables et vérifie les huit contraintes que le § 12 énonce", () => {
    const schema = readFileSync(CHEMIN_SCHEMA, "utf8");
    const tables = tablesDuSchema(schema);

    const manquantes = TABLES_DU_CDC.filter((nom) => !tables.includes(nom));
    const enTrop = tables.filter((nom) => !TABLES_DU_CDC.includes(nom as never));

    const violees: string[] = [];
    for (const [modele, libelle, motif] of CONTRAINTES_DU_CDC) {
      if (!motif.test(corpsDuModele(schema, modele))) violees.push(`${modele} : ${libelle}`);
    }

    console.info(
      `[garde § 12] ${String(tables.length)} tables lues dans prisma/schema.prisma, ` +
        `${String(CONTRAINTES_DU_CDC.length)} contraintes éprouvées`,
    );

    // Plancher-témoin : un fichier déplacé, un `@@map` renommé, et la garde
    // lirait zéro table sans un mot. C'est le compte qui la rend vivante.
    expect(tables.length).toBe(10);
    expect(manquantes).toEqual([]);
    expect(enTrop).toEqual([]);
    expect(CONTRAINTES_DU_CDC.length).toBe(8);
    expect(violees).toEqual([]);
  });
});

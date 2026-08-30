import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DepotEnMemoire, DepotPrisma, EXEMPLAIRE_DE_LIGNE, colonnesTouchees } from "./depot.js";
import type {
  CleNameVersion,
  DelegueOpsSecret,
  DepotDeSecrets,
  EnregistrementSecret,
  LignePrismaOpsSecret,
} from "./depot.js";

/**
 * Gardes du dépôt.
 *
 * La garde centrale de ce fichier DÉRIVE DE `prisma/schema.prisma`. Une
 * interface structurelle écrite à la main dérive en silence : le jour où une
 * colonne est renommée dans le schéma, `DepotPrisma` continue de compiler — il
 * ne dépend d'aucun type généré — et casse en production, sur la seule table
 * qui contienne les secrets. Cette garde-ci lit le schéma et compare.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — les colonnes touchées existent vraiment dans le schéma
// ─────────────────────────────────────────────────────────────────────────────

/** Les noms de champs d'un modèle Prisma, extraits du texte du schéma. */
function champsDuModele(schema: string, modele: string): readonly string[] {
  const debut = schema.indexOf(`model ${modele} {`);
  if (debut < 0) {
    return [];
  }
  const fin = schema.indexOf("\n}", debut);
  const bloc = schema.slice(debut, fin < 0 ? undefined : fin);

  return bloc
    .split("\n")
    .slice(1)
    .map((ligne) => ligne.trim())
    .filter(
      (ligne) =>
        ligne.length > 0 &&
        !ligne.startsWith("//") &&
        !ligne.startsWith("@@") &&
        !ligne.startsWith("}"),
    )
    .map((ligne) => ligne.split(/\s+/)[0] ?? "")
    .filter((nom) => nom.length > 0);
}

interface VerdictDeSchema {
  readonly champsLus: number;
  readonly colonnesVerifiees: number;
  readonly manquantes: readonly string[];
}

function verifierColonnes(schema: string, colonnes: readonly string[]): VerdictDeSchema {
  const champs = new Set(champsDuModele(schema, "OpsSecret"));
  return {
    champsLus: champs.size,
    colonnesVerifiees: colonnes.length,
    manquantes: colonnes.filter((colonne) => !champs.has(colonne)),
  };
}

/** Le vrai schéma, lu depuis le dépôt — pas une copie. */
function schemaReel(): string {
  return readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
}

describe("core/vault/depot — les colonnes touchées existent dans ops_secret", () => {
  it("rougit sur un témoin fabriqué à qui il manque `keyId`", () => {
    const temoin = [
      "model OpsSecret {",
      "  id String @id",
      "  name String",
      "  version Int",
      "  ciphertext Bytes",
      "  iv Bytes",
      "  tag Bytes",
      "  rotatedAt DateTime?",
      "  bootstrapCount Int @default(0)",
      "  @@unique([name, version])",
      "}",
    ].join("\n");

    const verdict = verifierColonnes(temoin, colonnesTouchees());

    expect(verdict.champsLus).toBeGreaterThan(0);
    expect(verdict.manquantes).toEqual(["keyId"]);
  });

  it("rougit sur un témoin fabriqué où le modèle n'existe pas — zéro champ lu", () => {
    // Le piège que ce cas ferme : un schéma déplacé, ou un modèle renommé,
    // rendrait la garde VERTE en n'ayant rien lu. C'est pourquoi le compte de
    // champs lus est asserté, et pas seulement la liste des manquantes.
    const verdict = verifierColonnes("model AutreChose {\n  id String\n}", colonnesTouchees());
    expect(verdict.champsLus).toBe(0);
  });

  it("lit le schéma réel : les huit colonnes touchées y sont toutes", () => {
    const verdict = verifierColonnes(schemaReel(), colonnesTouchees());

    console.info(
      `[garde schéma] ${String(verdict.champsLus)} champs lus dans model OpsSecret, ` +
        `${String(verdict.colonnesVerifiees)} colonnes vérifiées`,
    );

    // Planchers-témoins. Le § 12 donne à `ops_secret` : name, version, keyId,
    // ciphertext, iv, tag, rotatedAt, bootstrapCount — plus l'id et les dates.
    expect(verdict.champsLus).toBeGreaterThanOrEqual(8);
    expect(verdict.colonnesVerifiees).toBe(8);
    expect(verdict.manquantes).toEqual([]);
  });

  it("dérive la liste des colonnes de l'exemplaire, sans la recopier", () => {
    // La liste n'est écrite nulle part : elle est `Object.keys()` d'un
    // exemplaire du type. Ajouter un champ à `EnregistrementSecret` l'élargit
    // tout seul — et fait rougir la garde ci-dessus si le schéma ne suit pas.
    expect(colonnesTouchees()).toEqual(Object.keys(EXEMPLAIRE_DE_LIGNE));
    expect(colonnesTouchees()).toContain("keyId");
    expect(colonnesTouchees()).toContain("bootstrapCount");
  });

  it("vérifie que l'unicité (name, version) est bien celle que DepotPrisma nomme", () => {
    // `DepotPrisma` interroge la clé composite `name_version`. Ce nom est
    // FABRIQUÉ PAR PRISMA à partir de `@@unique([name, version])`. Changer
    // l'unicité renommerait la clé, et `DepotPrisma` — qui ne dépend d'aucun
    // type généré — continuerait de compiler.
    const schema = schemaReel();
    const bloc = schema.slice(schema.indexOf("model OpsSecret {"));
    const fin = bloc.indexOf("\n}");
    const modele = bloc.slice(0, fin < 0 ? undefined : fin);

    expect(modele).toContain("@@unique([name, version])");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — les deux prises se comportent PAREIL
// ─────────────────────────────────────────────────────────────────────────────

/** Un faux délégué Prisma, aux mêmes règles que le vrai (upsert, increment). */
class FauxDelegueOpsSecret implements DelegueOpsSecret {
  private readonly lignes = new Map<string, LignePrismaOpsSecret>();
  public readonly champsMisAJour: string[][] = [];

  private static cle(where: CleNameVersion): string {
    return `${where.name_version.name} ${String(where.name_version.version)}`;
  }

  public findUnique(args: { where: CleNameVersion }): Promise<LignePrismaOpsSecret | null> {
    return Promise.resolve(this.lignes.get(FauxDelegueOpsSecret.cle(args.where)) ?? null);
  }

  public findFirst(args: { where: { name: string } }): Promise<LignePrismaOpsSecret | null> {
    const candidates = [...this.lignes.values()]
      .filter((ligne) => ligne.name === args.where.name)
      .sort((a, b) => b.version - a.version);
    return Promise.resolve(candidates[0] ?? null);
  }

  public findMany(): Promise<LignePrismaOpsSecret[]> {
    return Promise.resolve(
      [...this.lignes.values()].sort((a, b) =>
        a.name === b.name ? a.version - b.version : a.name.localeCompare(b.name),
      ),
    );
  }

  public upsert(args: {
    where: CleNameVersion;
    create: EnregistrementSecret;
    update: Omit<EnregistrementSecret, "name" | "version" | "bootstrapCount">;
  }): Promise<LignePrismaOpsSecret> {
    this.champsMisAJour.push(Object.keys(args.update));

    const cle = FauxDelegueOpsSecret.cle(args.where);
    const existante = this.lignes.get(cle);
    const ligne = existante === undefined ? { ...args.create } : { ...existante, ...args.update };
    this.lignes.set(cle, ligne);
    return Promise.resolve(ligne);
  }

  public update(args: {
    where: CleNameVersion;
    data: { bootstrapCount: { increment: number } };
  }): Promise<LignePrismaOpsSecret> {
    const cle = FauxDelegueOpsSecret.cle(args.where);
    const existante = this.lignes.get(cle);
    if (existante === undefined) {
      return Promise.reject(new Error("ligne absente"));
    }
    const ligne = {
      ...existante,
      bootstrapCount: existante.bootstrapCount + args.data.bootstrapCount.increment,
    };
    this.lignes.set(cle, ligne);
    return Promise.resolve(ligne);
  }

  /**
   * L'incrément CONDITIONNEL, modelé sur `UPDATE … WHERE bootstrapCount <
   * $plafond` : aucun `await` entre le test et l'écriture, sinon la prise
   * d'essai serait plus permissive que Postgres.
   */
  public updateMany(args: {
    where: { name: string; version: number; bootstrapCount: { lt: number } };
    data: { bootstrapCount: { increment: number } };
  }): Promise<{ count: number }> {
    const cle = `${args.where.name} ${String(args.where.version)}`;
    const existante = this.lignes.get(cle);
    if (existante === undefined || existante.bootstrapCount >= args.where.bootstrapCount.lt) {
      return Promise.resolve({ count: 0 });
    }
    this.lignes.set(cle, {
      ...existante,
      bootstrapCount: existante.bootstrapCount + args.data.bootstrapCount.increment,
    });
    return Promise.resolve({ count: 1 });
  }
}

function ligneDeTest(name: string, version: number, keyId: string): EnregistrementSecret {
  return {
    name,
    version,
    keyId,
    ciphertext: Uint8Array.from([1, 2, 3]),
    iv: Uint8Array.from([4, 5, 6]),
    tag: Uint8Array.from([7, 8, 9]),
    rotatedAt: null,
    bootstrapCount: 0,
  };
}

/**
 * Le scénario que les deux prises doivent traverser à l'identique : écrire,
 * compter deux amorçages, RÉÉCRIRE la ligne comme le ferait une rotation de
 * clé, puis relire le compteur.
 */
async function scenario(depot: DepotDeSecrets): Promise<{
  readonly compteApresAmorcages: number;
  readonly compteApresRotation: number;
  readonly keyIdApresRotation: string;
}> {
  await depot.ecrire(ligneDeTest("zoho.refresh_token", 1, "k-1"));
  await depot.incrementerBootstrapCount("zoho.refresh_token", 1);
  const compteApresAmorcages = await depot.incrementerBootstrapCount("zoho.refresh_token", 1);

  await depot.ecrire(ligneDeTest("zoho.refresh_token", 1, "k-2"));

  const relue = await depot.lire("zoho.refresh_token", 1);
  return {
    compteApresAmorcages,
    compteApresRotation: relue?.bootstrapCount ?? -1,
    keyIdApresRotation: relue?.keyId ?? "",
  };
}

describe("core/vault/depot — les deux prises se comportent pareil", () => {
  it("mesure le même scénario sur les deux, et compare tous les résultats", async () => {
    const faux = new FauxDelegueOpsSecret();
    const prises: ReadonlyArray<readonly [string, DepotDeSecrets]> = [
      ["mémoire", new DepotEnMemoire()],
      ["prisma", new DepotPrisma({ opsSecret: faux })],
    ];

    const resultats: Array<Awaited<ReturnType<typeof scenario>>> = [];
    for (const [nom, depot] of prises) {
      const resultat = await scenario(depot);
      // Le point du scénario : une réécriture NE FAIT PAS RECULER le compteur.
      // Le § 27 en fait un plafond ; un compteur qu'une rotation remet à zéro
      // ne compte rien, et il sous-estime — c'est-à-dire qu'il ment dans le
      // sens dangereux.
      expect(resultat.compteApresAmorcages, nom).toBe(2);
      expect(resultat.compteApresRotation, nom).toBe(2);
      expect(resultat.keyIdApresRotation, nom).toBe("k-2");
      resultats.push(resultat);
    }

    console.info(`[garde parité] ${String(prises.length)} prises mesurées sur le même scénario`);

    expect(resultats.length).toBe(2);
    expect(resultats[0]).toEqual(resultats[1]);
  });

  it("n'inclut JAMAIS `bootstrapCount` dans la mise à jour de l'upsert", async () => {
    // La garde qui explique pourquoi la parité tient : c'est le contenu de la
    // clause `update` qui protège le compteur, et il est vérifié ici sur les
    // arguments réellement passés, pas sur le résultat.
    const faux = new FauxDelegueOpsSecret();
    const depot = new DepotPrisma({ opsSecret: faux });

    await depot.ecrire(ligneDeTest("a", 1, "k-1"));
    await depot.ecrire(ligneDeTest("a", 1, "k-2"));

    console.info(`[garde upsert] ${String(faux.champsMisAJour.length)} upserts mesurés`);

    expect(faux.champsMisAJour.length).toBe(2);
    for (const champs of faux.champsMisAJour) {
      expect(champs).not.toContain("bootstrapCount");
      expect(champs).not.toContain("name");
      expect(champs).not.toContain("version");
      expect(champs).toContain("keyId");
    }
  });

  it("rend la version la plus haute quand aucune version n'est demandée", async () => {
    let mesures = 0;
    for (const depot of [
      new DepotEnMemoire(),
      new DepotPrisma({ opsSecret: new FauxDelegueOpsSecret() }),
    ]) {
      await depot.ecrire(ligneDeTest("zoho.refresh_token", 1, "k-1"));
      await depot.ecrire(ligneDeTest("zoho.refresh_token", 3, "k-1"));
      await depot.ecrire(ligneDeTest("zoho.refresh_token", 2, "k-1"));

      const derniere = await depot.lireDerniereVersion("zoho.refresh_token");
      expect(derniere?.version).toBe(3);
      mesures += 1;
    }

    console.info(`[garde dernière version] ${String(mesures)} prises mesurées`);
    expect(mesures).toBe(2);
  });
});

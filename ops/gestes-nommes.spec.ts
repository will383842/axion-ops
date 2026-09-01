import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  GESTE_DE_MIGRATION,
  SCRIPT_D_AJOUT_SEUL,
  VERBES_DE_PNPM,
  tablesCreeesParLeSql,
  tablesDeclareesAuSchema,
  verifierLaChaineDeMigration,
  verifierLesCommandesNommees,
} from "./gestes-nommes.js";
import type { EtatDeLaChaineDeMigration, FichierBalaye } from "./gestes-nommes.js";
import {
  RACINE_DU_DEPOT,
  fichiersLivresDuDepot,
  lireDuDepot,
} from "../core/epreuve/perimetre-de-production.js";

/**
 * **LES DEUX GARDES DE L'ADR 0046, CONFRONTÉES AU DÉPÔT RÉEL PUIS À DES ÉTATS
 * FABRIQUÉS.**
 *
 * ⚠️ **CHAQUE TEST ANNONCE SON COMPTE D'ÉLÉMENTS MESURÉS.** Le nombre de
 *    modules balayés, de scripts déclarés, de tables dérivées du schéma. La
 *    couleur d'une garde ne dit rien ; le nombre d'éléments qu'elle a
 *    réellement confrontés dit tout.
 *
 * ⚠️ **LA MOITIÉ FABRIQUÉE N'EST PAS DÉCORATIVE.** Une garde confrontée
 *    seulement au dépôt réel est verte, et personne ne sait si elle SAIT
 *    rougir. Les états fabriqués retirent, un par un, ce que la décision a
 *    posé — le script, l'ordre, la migration, une table — et exigent une
 *    anomalie à chaque fois.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE DÉPÔT DIT DE LUI-MÊME
// ═════════════════════════════════════════════════════════════════════════════

/** Les scripts déclarés — DÉRIVÉS de `package.json`, jamais recopiés ici. */
function scriptsDeclares(): readonly string[] {
  const manifeste = JSON.parse(lireDuDepot("package.json")) as {
    scripts?: Record<string, string>;
  };
  return Object.keys(manifeste.scripts ?? {}).sort();
}

/** Le script de déploiement de la base, tel que `package.json` l'écrit. */
function scriptDeDeploiement(): string | null {
  const manifeste = JSON.parse(lireDuDepot("package.json")) as {
    scripts?: Record<string, string>;
  };
  return manifeste.scripts?.["db:deploy"] ?? null;
}

/** Les modules de PRODUCTION, dérivés de l'`exclude` de `tsconfig.build.json`. */
function modulesDeProduction(): readonly FichierBalaye[] {
  return fichiersLivresDuDepot().map((chemin) => ({ chemin, source: lireDuDepot(chemin) }));
}

/** L'état de la chaîne de matérialisation, lu sur le disque. */
function chaineSurLeDisque(): EtatDeLaChaineDeMigration {
  const dossier = fileURLToPath(new URL("prisma/migrations/", RACINE_DU_DEPOT));
  const migrations = existsSync(dossier)
    ? readdirSync(dossier, { withFileTypes: true })
        .filter((entree) => entree.isDirectory())
        .map((entree) => entree.name)
        .sort()
    : [];
  const sqlDesMigrations = migrations
    .map((nom) => {
      const chemin = fileURLToPath(
        new URL(`prisma/migrations/${nom}/migration.sql`, RACINE_DU_DEPOT),
      );
      return existsSync(chemin) ? readFileSync(chemin, "utf8") : "";
    })
    .join("\n");
  const verrou = fileURLToPath(new URL("prisma/migrations/migration_lock.toml", RACINE_DU_DEPOT));

  return {
    migrations,
    sqlDesMigrations,
    verrouDeMigration: existsSync(verrou) ? readFileSync(verrou, "utf8") : null,
    schema: lireDuDepot("prisma/schema.prisma"),
    scriptDeDeploiement: scriptDeDeploiement(),
    ajoutSeulPresent: existsSync(fileURLToPath(new URL(SCRIPT_D_AJOUT_SEUL, RACINE_DU_DEPOT))),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE A — LES COMMANDES NOMMÉES DANS LES MESSAGES DU SOCLE
// ═════════════════════════════════════════════════════════════════════════════

describe("A — une commande nommée dans un message du socle doit exister", () => {
  it("confronte chaque commande pnpm nommée dans le code aux scripts déclarés", () => {
    const modules = modulesDeProduction();
    const scripts = scriptsDeclares();
    const verdict = verifierLesCommandesNommees(modules, scripts);

    console.info(
      `[A] ${String(verdict.fichiersBalayes)} module(s) de production balayé(s) · ` +
        `${String(verdict.scriptsDeclares)} script(s) déclaré(s) dans package.json · ` +
        `${String(verdict.occurrencesTrouvees)} occurrence(s) de « pnpm <mot> » · ` +
        `${String(verdict.verbesEcartes)} verbe(s) de pnpm écarté(s) · ` +
        `${String(verdict.commandesInterpolees)} commande(s) composée(s) à l'exécution ` +
        "(non confrontables) · " +
        `${String(verdict.commandesDistinctes)} commande(s) distincte(s) confrontée(s), dont ` +
        `${String(verdict.confrontees.length)} DÉCLARÉE(S) ` +
        `[${verdict.confrontees.join(", ") || "aucune"}] · ` +
        `${String(verdict.introuvables.length)} INTROUVABLE(S) ` +
        `[${verdict.introuvables.map((t) => `${t.commande} @ ${t.chemin}`).join(", ") || "aucune"}]`,
    );

    // ── LES PLANCHERS, sans lesquels cette garde serait verte en ne lisant rien
    expect(verdict.fichiersBalayes).toBeGreaterThanOrEqual(100);
    expect(verdict.scriptsDeclares).toBeGreaterThanOrEqual(10);
    expect(verdict.commandesDistinctes).toBeGreaterThanOrEqual(1);

    // Le cas MESURÉ : le socle refuse de démarrer en nommant cette commande.
    expect(verdict.confrontees).toContain("ops:vault:init");
    expect(verdict.introuvables).toEqual([]);
    expect(verdict.anomalies).toEqual([]);
  });

  it("SAIT rougir : une commande nommée sans script déclaré est une anomalie", () => {
    const fabrique: readonly FichierBalaye[] = [
      {
        chemin: "core/faux/message.ts",
        source: 'export const M = "Créer le coffre avec « pnpm ops:vault:init ».";',
      },
    ];

    const sansLeScript = verifierLesCommandesNommees(fabrique, ["test", "lint"]);
    const avecLeScript = verifierLesCommandesNommees(fabrique, ["test", "ops:vault:init"]);

    console.info(
      `[A · témoin] même fichier, deux jeux de scripts : sans le script → ` +
        `${String(sansLeScript.introuvables.length)} introuvable(s) ; avec le script → ` +
        `${String(avecLeScript.introuvables.length)}`,
    );

    expect(sansLeScript.occurrencesTrouvees).toBe(1);
    expect(sansLeScript.introuvables).toHaveLength(1);
    expect(sansLeScript.introuvables[0]?.commande).toBe("ops:vault:init");
    expect(avecLeScript.introuvables).toEqual([]);
  });

  it("ne lit PAS les commentaires, et compte à part ce qui est composé à l'exécution", () => {
    const fabrique: readonly FichierBalaye[] = [
      {
        chemin: "core/faux/prose.ts",
        source:
          "// Lancer pnpm inexistant-en-commentaire avant tout.\n" +
          "/* Et pnpm autre-inexistant dans un bloc. */\n" +
          "export const A = `gate (pnpm ${nom})`;\n" +
          'export const B = "pnpm exec tsx ops/verifier-secrets.ts";\n',
      },
    ];

    const verdict = verifierLesCommandesNommees(fabrique, ["test"]);

    console.info(
      `[A · prose] ${String(verdict.occurrencesTrouvees)} occurrence(s) retenue(s) · ` +
        `${String(verdict.commandesInterpolees)} interpolée(s) · ` +
        `${String(verdict.verbesEcartes)} verbe(s) écarté(s) · ` +
        `${String(verdict.introuvables.length)} introuvable(s)`,
    );

    // Les deux commandes citées en commentaire ne sont PAS comptées.
    expect(verdict.introuvables).toEqual([]);
    expect(verdict.commandesInterpolees).toBe(1);
    expect(verdict.verbesEcartes).toBe(1);
    expect(VERBES_DE_PNPM).toContain("exec");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE B — LA CHAÎNE DE MATÉRIALISATION DE LA BASE
// ═════════════════════════════════════════════════════════════════════════════

describe("B — les dix tables du § 12 sont matérialisables par un chemin reproductible", () => {
  it("exige les dix tables du schéma dans une migration, et l'ORDRE écrit du chaînage", () => {
    const etat = chaineSurLeDisque();
    const verdict = verifierLaChaineDeMigration(etat);

    console.info(
      `[B] ${String(verdict.migrationsTrouvees)} migration(s) [${etat.migrations.join(", ") || "aucune"}] · ` +
        `moteur « ${verdict.moteur ?? "NON FIXÉ"} » · ` +
        `${String(verdict.tablesDuSchema.length)} table(s) dérivée(s) des @@map du schéma · ` +
        `${String(verdict.tablesCreees.length)} créée(s) par le SQL des migrations · ` +
        `${String(verdict.tablesManquantes.length)} manquante(s) ` +
        `[${verdict.tablesManquantes.join(", ") || "aucune"}] · ` +
        `« ${GESTE_DE_MIGRATION} » en position ${String(verdict.positionDeLaMigration)}, ` +
        `« ${SCRIPT_D_AJOUT_SEUL} » en position ${String(verdict.positionDeLAjoutSeul)} · ` +
        `ordre écrit : ${String(verdict.ordreEcrit)} · ` +
        `${String(verdict.anomalies.length)} anomalie(s) : ${verdict.anomalies.join(" | ") || "aucune"}`,
    );

    // ── LES PLANCHERS : le schéma a bien été lu, et il porte les dix tables.
    expect(verdict.tablesDuSchema.length).toBeGreaterThanOrEqual(10);
    expect(verdict.tablesDuSchema).toContain("ops_audit");

    expect(verdict.migrationsTrouvees).toBeGreaterThanOrEqual(1);
    expect(verdict.moteur).toBe("postgresql");
    expect(verdict.tablesManquantes).toEqual([]);
    expect(verdict.ordreEcrit).toBe(true);
    expect(verdict.anomalies).toEqual([]);

    // ⚠️ LES DEUX GESTES SONT CHERCHÉS SOUS LEUR FORME EXACTE, et ces deux
    //    lignes le disent : renommer une constante sans renommer ce qu'elle
    //    désigne rendrait la garde verte en cherchant une chaîne que le script
    //    de déploiement ne porte plus.
    expect(GESTE_DE_MIGRATION).toBe("prisma migrate deploy");
    expect(SCRIPT_D_AJOUT_SEUL).toBe("prisma/sql/0001-ops-audit-append-only.sql");
  });

  it("SAIT rougir sur chacune des cinq façons dont la chaîne peut se défaire", () => {
    const reel = chaineSurLeDisque();
    const cas: readonly {
      readonly nom: string;
      /**
       * Combien d'anomalies ce cas doit produire, ET PAS UNE DE PLUS. Le
       * premier en vaut DEUX, et c'est inséparable : retirer les migrations
       * retire du même geste les tables qu'elles créaient. L'écrire ici est
       * plus honnête que de relâcher le contrôle à « au moins une ».
       */
      readonly attendues: number;
      readonly etat: EtatDeLaChaineDeMigration;
    }[] = [
      {
        nom: "aucune migration",
        attendues: 2,
        etat: { ...reel, migrations: [], sqlDesMigrations: "" },
      },
      {
        nom: "une table du schéma qu'aucune migration ne crée",
        attendues: 1,
        etat: {
          ...reel,
          sqlDesMigrations: reel.sqlDesMigrations.replace(
            /CREATE TABLE "ops_audit"/u,
            'CREATE TABLE "autre_chose"',
          ),
        },
      },
      { nom: "moteur non fixé", attendues: 1, etat: { ...reel, verrouDeMigration: null } },
      {
        nom: "script d'ajout seul absent",
        attendues: 1,
        etat: { ...reel, ajoutSeulPresent: false },
      },
      {
        nom: "ordre INVERSÉ dans le script de déploiement",
        attendues: 1,
        etat: {
          ...reel,
          scriptDeDeploiement: `psql -f ${SCRIPT_D_AJOUT_SEUL} && ${GESTE_DE_MIGRATION}`,
        },
      },
    ];

    const verdicts = cas.map((c) => ({
      nom: c.nom,
      attendues: c.attendues,
      rapport: verifierLaChaineDeMigration(c.etat),
    }));
    for (const { nom, attendues, rapport } of verdicts) {
      console.info(
        `[B · témoin] « ${nom} » → ${String(rapport.anomalies.length)} anomalie(s) ` +
          `(${String(attendues)} attendue(s)) : ${rapport.anomalies.join(" | ")}`,
      );
    }

    // ⚠️ CHAQUE CAS N'EST QU'UNE SEULE FAÇON D'ÊTRE FAUX. Exiger « au moins
    //    une » anomalie laisserait passer un cas qui rougit pour la raison du
    //    VOISIN : le témoin serait vert sans isoler quoi que ce soit.
    expect(verdicts).toHaveLength(5);
    expect(verifierLaChaineDeMigration(reel).anomalies).toEqual([]);
    for (const { attendues, rapport } of verdicts) {
      expect(rapport.anomalies).toHaveLength(attendues);
    }
  });

  it("dérive les tables du schéma et celles du SQL, sans jamais recopier de liste", () => {
    const duSchema = tablesDeclareesAuSchema(lireDuDepot("prisma/schema.prisma"));
    const modeles = (lireDuDepot("prisma/schema.prisma").match(/^model\s+\w+/gmu) ?? []).length;
    const duSql = tablesCreeesParLeSql('CREATE TABLE "ops_audit" (\n);\nCREATE TABLE "ops_tool" (');

    console.info(
      `[B · dérivation] ${String(modeles)} modèle(s) déclaré(s) au schéma · ` +
        `${String(duSchema.length)} @@map lu(s) [${duSchema.join(", ")}] · ` +
        `${String(duSql.length)} table(s) lue(s) dans un SQL fabriqué [${duSql.join(", ")}]`,
    );

    // Une table par modèle : le schéma mappe TOUS ses modèles, sans exception.
    expect(duSchema).toHaveLength(modeles);
    expect(duSql).toEqual(["ops_audit", "ops_tool"]);
  });
});

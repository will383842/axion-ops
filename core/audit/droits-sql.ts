/**
 * `core/audit/droits-sql.ts` — CE QUE LE SCRIPT DE DROITS DIT VRAIMENT.
 *
 * ═══ POURQUOI CE FICHIER EXISTE ═══
 *
 * L'ADR 0002 rattache au lot 1 un rôle PostgreSQL en ajout seul sur
 * `ops_audit`. Le script est dans `prisma/sql/`. Un script SQL est du TEXTE :
 * rien, dans un dépôt où aucune base ne tourne, ne dit qu'il fait ce qu'il
 * prétend faire. Un `REVOKE` mal orthographié, une ligne perdue à la fusion, un
 * `GRANT ALL` ajouté « pour débloquer un incident » — les trois passent
 * inaperçus, et la garde du journal qui s'appuie dessus reste verte.
 *
 * Ce module LIT le script et en dérive une table de droits. Il ne l'exécute
 * pas, il ne se connecte à rien.
 *
 * ═══ ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE — LIRE AVANT DE S'Y FIER ═══
 *
 * **Cette garde prouve ce que le SCRIPT DIT. Elle ne prouve PAS ce que le
 * CLUSTER APPLIQUE.** Les deux ne coïncident pas dans au moins trois cas, tous
 * réels et tous hors de portée d'une lecture de texte :
 *
 *  1. le rôle de connexion de l'application est PROPRIÉTAIRE de la table — un
 *     propriétaire peut toujours se redonner tous les droits, et le script
 *     n'aura alors rien changé ;
 *  2. un `GRANT` postérieur, appliqué à la main sur la base ;
 *  3. le script n'a jamais été exécuté.
 *
 * Le script nomme, en fin de fichier, les deux requêtes `has_table_privilege`
 * qui répondent à ces trois cas — elles doivent tourner SUR LA BASE, au
 * déploiement. Écrire ici « `ops_audit` est en ajout seul » serait transformer
 * un périmètre d'observation en garantie : la mesure serait juste et l'énoncé
 * plus large qu'elle.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ═════════════════════════════════════════════════════════════════════════════
//  Le vocabulaire
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES DROITS DE TABLE QUI COMPTENT ICI.
 *
 * Ce ne sont pas tous ceux de PostgreSQL : ce sont ceux dont la présence ou
 * l'absence change la réponse à « peut-on réécrire le journal ? ».
 */
export const DROITS_TABLE = [
  "SELECT",
  "INSERT",
  "UPDATE",
  "DELETE",
  "TRUNCATE",
  "REFERENCES",
  "TRIGGER",
] as const;

export type DroitTable = (typeof DROITS_TABLE)[number];

/** Ce que le script accorde et retire à un rôle, sur une table. */
export interface DroitsDunRole {
  readonly role: string;
  /** Droits explicitement ACCORDÉS par un `GRANT`. */
  readonly accordes: readonly DroitTable[];
  /** Droits explicitement RETIRÉS par un `REVOKE`. */
  readonly retires: readonly DroitTable[];
}

/** Ce que rend la lecture du script. JAMAIS un booléen. */
export interface LectureDroits {
  /** Combien d'instructions `GRANT`/`REVOKE` ont été RECONNUES. */
  readonly instructionsLues: number;
  /** Combien d'instructions portaient sur la table visée. */
  readonly instructionsSurLaTable: number;
  /** Les rôles rencontrés, dans l'ordre d'apparition. */
  readonly roles: readonly string[];
  /** La table de droits, par rôle. */
  readonly parRole: ReadonlyMap<string, DroitsDunRole>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  La lecture
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Retire les commentaires SQL : `--` jusqu'en fin de ligne, et les blocs.
 *
 * ⚠️ SANS CETTE ÉTAPE, LA GARDE MORDRAIT SUR LA PROSE. Le script explique
 *    longuement pourquoi tel `REVOKE` existe ; une lecture naïve prendrait
 *    l'explication pour l'instruction, et un script réduit à ses seuls
 *    commentaires serait déclaré conforme. C'est la même leçon que
 *    `core/audit/derivation.spec.ts` a apprise sur `createHmac` : une garde qui
 *    confond ce qu'un fichier FAIT et ce qu'il DIT rougit — ou verdit — pour la
 *    mauvaise raison.
 */
export function sansCommentairesSql(source: string): string {
  let sortie = "";
  let index = 0;
  let dansUneChaine = false;

  while (index < source.length) {
    const c = source[index] ?? "";
    const suivant = source[index + 1] ?? "";

    if (dansUneChaine) {
      sortie += c;
      if (c === "'") dansUneChaine = false;
      index += 1;
      continue;
    }
    if (c === "'") {
      dansUneChaine = true;
      sortie += c;
      index += 1;
      continue;
    }
    if (c === "-" && suivant === "-") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if (c === "/" && suivant === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index += 1;
      }
      index += 2;
      sortie += " ";
      continue;
    }
    sortie += c;
    index += 1;
  }

  return sortie;
}

const MOTIF_INSTRUCTION =
  /\b(GRANT|REVOKE)\s+([A-Z,\s]+?)\s+ON\s+(?:TABLE\s+)?([A-Za-z_][A-Za-z0-9_]*)\s+(?:TO|FROM)\s+([A-Za-z_][A-Za-z0-9_]*)/gi;

/**
 * Lit les `GRANT` et `REVOKE` d'un script, pour UNE table.
 *
 * ⚠️ ELLE NE COMPREND PAS LE SQL. Elle reconnaît la forme
 * `GRANT … ON [TABLE] <table> TO <rôle>` et sa symétrique en `REVOKE`. Tout ce
 * qu'elle ne reconnaît pas n'est PAS compté — d'où `instructionsLues`, qui doit
 * être confronté à un plancher : une expression qui cesserait de mordre
 * rendrait zéro instruction et la garde resterait verte.
 *
 * Les instructions sur les SÉQUENCES sont ignorées à dessein : `ON SEQUENCE`
 * ne correspond pas au motif, et le droit sur la séquence ne décide de rien
 * quant à la réécriture d'une ligne.
 */
export function lireDroits(source: string, table: string): LectureDroits {
  const propre = sansCommentairesSql(source);
  const parRole = new Map<string, { accordes: Set<DroitTable>; retires: Set<DroitTable> }>();
  const roles: string[] = [];
  let instructionsLues = 0;
  let instructionsSurLaTable = 0;

  const connus = new Set<string>(DROITS_TABLE);

  for (const trouve of propre.matchAll(MOTIF_INSTRUCTION)) {
    instructionsLues += 1;
    const verbe = (trouve[1] ?? "").toUpperCase();
    const listeBrute = (trouve[2] ?? "").toUpperCase();
    const cible = trouve[3] ?? "";
    const role = trouve[4] ?? "";

    if (cible !== table) continue;
    instructionsSurLaTable += 1;

    // `ALL` couvre tout : c'est le cas qu'il ne faut surtout pas manquer, un
    // `GRANT ALL` glissé « pour débloquer » annulant tout le reste.
    const listes = listeBrute.includes("ALL")
      ? [...DROITS_TABLE]
      : listeBrute
          .split(",")
          .map((mot) => mot.trim())
          .filter((mot): mot is DroitTable => connus.has(mot));

    if (!parRole.has(role)) {
      parRole.set(role, { accordes: new Set(), retires: new Set() });
      roles.push(role);
    }
    const entree = parRole.get(role);
    if (entree === undefined) continue;

    for (const droit of listes) {
      if (verbe === "GRANT") {
        entree.accordes.add(droit);
        // Un `GRANT` postérieur ANNULE le `REVOKE` qui le précède : l'ordre du
        // script compte, et la lecture le respecte. Sans cela, un script qui
        // révoque puis réaccorde serait déclaré sûr.
        entree.retires.delete(droit);
      } else {
        entree.retires.add(droit);
        entree.accordes.delete(droit);
      }
    }
  }

  const table2 = new Map<string, DroitsDunRole>();
  for (const [role, sets] of parRole) {
    table2.set(role, {
      role,
      accordes: [...sets.accordes],
      retires: [...sets.retires],
    });
  }

  return { instructionsLues, instructionsSurLaTable, roles, parRole: table2 };
}

/** Le rôle a-t-il ce droit, d'après le script SEUL ? */
export function aLeDroit(lecture: LectureDroits, role: string, droit: DroitTable): boolean {
  return lecture.parRole.get(role)?.accordes.includes(droit) ?? false;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le script de ce dépôt
// ═════════════════════════════════════════════════════════════════════════════

/** Le nom de la table du journal, tel que `@@map` la pose (§ 12). */
export const TABLE_JOURNAL = "ops_audit";

/** Les deux rôles de l'ADR 0002. Ils sont NOMMÉS ici, et lus dans le script. */
export const ROLE_ECRITURE = "ops_audit_ecriture";
export const ROLE_PURGE = "ops_audit_purge";

/**
 * Chemin du script, calculé depuis `import.meta.url` — jamais codé en dur
 * depuis la racine. Une garde au chemin figé devient muette au déménagement,
 * et c'est un défaut mesuré ailleurs dans ce dossier.
 */
export function cheminDuScriptDeDroits(): string {
  return fileURLToPath(new URL("../../prisma/sql/0001-ops-audit-append-only.sql", import.meta.url));
}

/** Lit le script de ce dépôt et en rend la table de droits sur `ops_audit`. */
export function lireDroitsDuJournal(): LectureDroits {
  return lireDroits(readFileSync(cheminDuScriptDeDroits(), "utf8"), TABLE_JOURNAL);
}

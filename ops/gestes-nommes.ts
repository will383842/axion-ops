/**
 * `ops/gestes-nommes.ts` — **UN GESTE QUE LE SOCLE NOMME DOIT ÊTRE
 * EXÉCUTABLE.**
 *
 * ═══ UNE SEULE THÈSE, DEUX MESURES ═══
 *
 * Le lot 3 a laissé le dépôt dans un état où **deux gestes étaient nommés et
 * aucun n'était faisable** :
 *
 *  1. `core/vault/demarrage.ts` nommait `pnpm ops:vault:init` dans le message
 *     que le socle rend **quand il refuse de démarrer**. Le script n'existait
 *     pas. La commande tapée rendait `command not found`.
 *  2. `prisma/sql/0001-ops-audit-append-only.sql` se déclarait lui-même
 *     « s'applique APRÈS `prisma migrate deploy` ». Il n'y avait **rien après
 *     quoi s'appliquer** : le dépôt ne portait aucune migration.
 *
 * Ce sont deux instances du même défaut, et il est plus coûteux qu'un manque :
 * **un message précis et faux fait chercher au mauvais endroit, avec
 * confiance.** Un message vague fait au moins chercher. Le premier cas se
 * découvre au milieu d'un incident — le socle est à terre, par définition, dans
 * le seul état où ce message paraît.
 *
 * ⚠️ **LES DEUX GARDES SONT DES FONCTIONS PURES DE CE QU'ON LEUR REMET.** Elles
 *    ne lisent ni disque, ni `package.json`, ni `process` : `ops/
 *    gestes-nommes.spec.ts` constitue l'état et le leur passe. C'est ce qui
 *    permet de les éprouver sur des états FABRIQUÉS — un script effacé, un
 *    ordre inversé, une table absente — sans mutiler le dépôt.
 *
 * ⚠️ **ELLES ANNONCENT DES NOMBRES, JAMAIS UNE COULEUR.** Combien de fichiers
 *    balayés, combien d'occurrences trouvées, combien de scripts déclarés,
 *    combien de tables dérivées du schéma. Une garde qui dirait « conforme »
 *    serait verte le jour où elle ne lit plus rien.
 *
 * Voir **ADR 0046**, ADR 0045, § 12, § 25.
 */

import { sansProse } from "../core/coutures/verifier.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LES DEUX GARDES LISENT
// ═════════════════════════════════════════════════════════════════════════════

/** Un fichier remis à une garde — son chemin depuis la racine, son source BRUT. */
export interface FichierBalaye {
  readonly chemin: string;
  readonly source: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE A — LES COMMANDES NOMMÉES DANS LES MESSAGES DU SOCLE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TROIS VERBES DE `pnpm` QUI NE SONT PAS DES SCRIPTS.
 *
 * ⚠️ **CETTE LISTE EST COURTE PAR CONSTRUCTION, ET ELLE EST COMPTÉE.** Elle ne
 *    tient que ce qui prend un SOUS-ARGUMENT : `pnpm exec tsx …` lance un
 *    binaire, `pnpm run X` lance le script X, `pnpm dlx` lance un paquet. Tout
 *    le reste — `pnpm typecheck`, `pnpm ops:vault:init` — DOIT désigner un
 *    script déclaré.
 *
 * ⚠️ **LE SENS DE L'ERREUR EST CHOISI.** Si un message venait un jour à nommer
 *    `pnpm install`, la garde ROUGIRAIT au lieu de laisser passer, et quelqu'un
 *    trancherait. Une liste de verbes plus large aurait le défaut inverse :
 *    elle rendrait muette la garde sur les commandes qu'elle n'a pas prévues.
 */
export const VERBES_DE_PNPM = ["exec", "run", "dlx"] as const;

/** Une commande `pnpm …` trouvée dans le CODE d'un module, commentaires retirés. */
export interface CommandeTrouvee {
  /** Le mot qui suit `pnpm` — le nom du script attendu. */
  readonly commande: string;
  /** Le module qui la nomme. */
  readonly chemin: string;
}

/** Ce que la garde A rend. Des NOMBRES et des NOMS, jamais une couleur. */
export interface VerdictDesCommandes {
  /** Fichiers réellement balayés. Un zéro rend la garde vacuous. */
  readonly fichiersBalayes: number;
  /** Occurrences de `pnpm <mot>` trouvées, doublons compris. */
  readonly occurrencesTrouvees: number;
  /** Commandes DISTINCTES à confronter, verbes de `pnpm` exclus. */
  readonly commandesDistinctes: number;
  /** Scripts lus dans `package.json`. À zéro, tout serait introuvable. */
  readonly scriptsDeclares: number;
  /** Occurrences écartées parce qu'elles nomment un verbe de `pnpm`. */
  readonly verbesEcartes: number;
  /**
   * Occurrences `pnpm ${…}` — une commande COMPOSÉE À L'EXÉCUTION.
   *
   * ⚠️ **C'EST LA BORNE DE CETTE GARDE, ÉCRITE AVEC ELLE.** Un nom composé à
   *    l'exécution ne peut pas être confronté à une liste de scripts sans faire
   *    tourner le programme. Elles sont donc COMPTÉES et non confrontées — un
   *    silence qui se lit, plutôt qu'un vert qui se croit.
   */
  readonly commandesInterpolees: number;
  /** Les commandes nommées qu'aucun script ne déclare. L'anomalie n° 1. */
  readonly introuvables: readonly CommandeTrouvee[];
  /** Les commandes nommées ET déclarées, pour qu'on voie ce qui a été confronté. */
  readonly confrontees: readonly string[];
  readonly anomalies: readonly string[];
}

/**
 * LA GARDE DES COMMANDES NOMMÉES.
 *
 * ⚠️ **ELLE LIT LE CODE, PAS LA PROSE.** `sansProse` retire les commentaires
 *    avant toute recherche : ce dépôt écrit `pnpm build` et `pnpm typecheck`
 *    dans une dizaine de blocs de documentation, et les compter ferait de cette
 *    garde une lectrice de commentaires. Ce qu'on cherche est ce qu'un
 *    UTILISATEUR verra — un littéral d'un message rendu par le socle.
 *
 * @param fichiers les modules à balayer, sources brutes.
 * @param scriptsDeclares les clés de `scripts` de `package.json`, DÉRIVÉES.
 */
export function verifierLesCommandesNommees(
  fichiers: readonly FichierBalaye[],
  scriptsDeclares: readonly string[],
): VerdictDesCommandes {
  const declares = new Set(scriptsDeclares);
  const verbes = new Set<string>(VERBES_DE_PNPM);

  const introuvables: CommandeTrouvee[] = [];
  const confrontees = new Set<string>();
  const distinctes = new Set<string>();
  let occurrences = 0;
  let verbesEcartes = 0;
  let interpolees = 0;

  for (const fichier of fichiers) {
    const code = sansProse(fichier.source);

    // Une commande composée à l'exécution : `pnpm ${gate.commande}`.
    interpolees += (code.match(/pnpm\s+\$\{/gu) ?? []).length;

    for (const trouve of code.matchAll(/pnpm\s+([A-Za-z][A-Za-z0-9:._-]*)/gu)) {
      const commande = trouve[1];
      if (commande === undefined) continue;
      occurrences += 1;
      if (verbes.has(commande)) {
        verbesEcartes += 1;
        continue;
      }
      distinctes.add(commande);
      if (declares.has(commande)) confrontees.add(commande);
      else introuvables.push({ commande, chemin: fichier.chemin });
    }
  }

  const anomalies = introuvables.map(
    (trouve) =>
      `« ${trouve.chemin} » nomme la commande « pnpm ${trouve.commande} » et AUCUN script de ` +
      "ce nom n'est déclaré dans package.json — un message qui nomme un geste introuvable " +
      "envoie chercher au mauvais endroit, avec confiance, au pire moment",
  );

  return {
    fichiersBalayes: fichiers.length,
    occurrencesTrouvees: occurrences,
    commandesDistinctes: distinctes.size,
    scriptsDeclares: declares.size,
    verbesEcartes,
    commandesInterpolees: interpolees,
    introuvables,
    confrontees: [...confrontees].sort(),
    anomalies,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  GARDE B — LA CHAÎNE DE MATÉRIALISATION DE LA BASE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE CHEMIN DU SCRIPT D'AJOUT SEUL, ET IL EST ÉCRIT UNE SEULE FOIS.
 *
 * ⚠️ C'est ce chemin que la garde cherche DANS le script de déploiement. Le
 *    recopier dans la garde et dans `package.json` ferait deux sources ; ici il
 *    est la SOURCE, et `package.json` lui est confronté.
 */
export const SCRIPT_D_AJOUT_SEUL = "prisma/sql/0001-ops-audit-append-only.sql";

/** Le geste de Prisma qui doit précéder. Cherché littéralement. */
export const GESTE_DE_MIGRATION = "prisma migrate deploy";

/** L'état de la chaîne de matérialisation, tel qu'un appelant l'a constitué. */
export interface EtatDeLaChaineDeMigration {
  /** Les dossiers de `prisma/migrations/`, `migration_lock.toml` exclu. */
  readonly migrations: readonly string[];
  /** Le SQL de TOUTES les migrations, concaténé. */
  readonly sqlDesMigrations: string;
  /** Le contenu de `migration_lock.toml`, ou `null` s'il n'existe pas. */
  readonly verrouDeMigration: string | null;
  /** Le source de `prisma/schema.prisma` — la SOURCE des tables attendues. */
  readonly schema: string;
  /** Le script de déploiement de `package.json`, ou `null` s'il n'est pas déclaré. */
  readonly scriptDeDeploiement: string | null;
  /** Le script d'ajout seul est-il présent sur le disque ? */
  readonly ajoutSeulPresent: boolean;
}

/** Ce que la garde B rend. */
export interface VerdictDeLaChaineDeMigration {
  /** Migrations trouvées. **Zéro était l'état du dépôt au 2026-09-01.** */
  readonly migrationsTrouvees: number;
  /** Tables DÉRIVÉES du schéma (`@@map`), jamais recopiées. */
  readonly tablesDuSchema: readonly string[];
  /** Celles que le SQL des migrations crée réellement. */
  readonly tablesCreees: readonly string[];
  /** Celles que le schéma déclare et qu'aucune migration ne crée. */
  readonly tablesManquantes: readonly string[];
  /** Le moteur fixé par `migration_lock.toml`. `null` = fichier absent ou illisible. */
  readonly moteur: string | null;
  /** Position de `prisma migrate deploy` dans le script. `-1` = absent. */
  readonly positionDeLaMigration: number;
  /** Position du script d'ajout seul dans le script. `-1` = absent. */
  readonly positionDeLAjoutSeul: number;
  /** L'ordre est-il ÉCRIT ? DÉRIVÉ des deux positions, jamais déclaré. */
  readonly ordreEcrit: boolean;
  readonly anomalies: readonly string[];
}

/**
 * LES TABLES QUE LE SCHÉMA DÉCLARE — **dérivées de ses `@@map`.**
 *
 * ⚠️ **LA DÉRIVATION EST LE POINT.** Écrire ici les dix noms du § 12 ferait de
 *    cette garde une seconde source de vérité : le jour où une onzième table
 *    entre au schéma, elle resterait verte sans que la migration la crée. En
 *    lisant `@@map`, une table neuve fait automatiquement monter le
 *    dénominateur — et rougir tant que la migration ne suit pas.
 */
export function tablesDeclareesAuSchema(schema: string): readonly string[] {
  return [...schema.matchAll(/@@map\(\s*"([^"]+)"\s*\)/gu)]
    .map((trouve) => trouve[1])
    .filter((nom): nom is string => nom !== undefined)
    .sort();
}

/** Les tables qu'un script SQL crée réellement. */
export function tablesCreeesParLeSql(sql: string): readonly string[] {
  return [...sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/giu)]
    .map((trouve) => trouve[1])
    .filter((nom): nom is string => nom !== undefined)
    .sort();
}

/**
 * LA GARDE DE LA CHAÎNE DE MATÉRIALISATION.
 *
 * ⚠️ **ELLE ROUGIT DANS QUATRE SENS, ET LE QUATRIÈME EST CELUI QUI MANQUAIT.**
 *    Aucune migration · une table du schéma qu'aucune migration ne crée · le
 *    moteur non fixé · **et l'ORDRE non écrit** : le script d'ajout seul ne se
 *    déclare pas seulement « à appliquer après », il doit être appliqué après
 *    par un chemin qu'une machine peut rejouer. Un ordre convenu oralement est
 *    un ordre qui s'inverse au premier remplaçant.
 *
 * ⚠️ **CE QU'ELLE NE PROUVE PAS, ÉCRIT AVEC ELLE.** Elle lit des FORMES : elle
 *    ne se connecte à aucune base, ne joue aucune migration, et ne peut donc
 *    pas dire que le cluster applique ce que le script DIT. Cette preuve-là
 *    exige une base, et aucune ne tourne dans ce dépôt. Les deux requêtes qui
 *    la fourniraient sont écrites en clair à la fin du script d'ajout seul.
 */
export function verifierLaChaineDeMigration(
  etat: EtatDeLaChaineDeMigration,
): VerdictDeLaChaineDeMigration {
  const tablesDuSchema = tablesDeclareesAuSchema(etat.schema);
  const tablesCreees = tablesCreeesParLeSql(etat.sqlDesMigrations);
  const creees = new Set(tablesCreees);
  const tablesManquantes = tablesDuSchema.filter((table) => !creees.has(table));

  const moteur = etat.verrouDeMigration === null ? null : lireLeMoteur(etat.verrouDeMigration);

  const script = etat.scriptDeDeploiement ?? "";
  const positionDeLaMigration = script.indexOf(GESTE_DE_MIGRATION);
  const positionDeLAjoutSeul = script.indexOf(SCRIPT_D_AJOUT_SEUL);
  const ordreEcrit =
    positionDeLaMigration !== -1 &&
    positionDeLAjoutSeul !== -1 &&
    positionDeLaMigration < positionDeLAjoutSeul;

  const anomalies: string[] = [];

  if (etat.migrations.length === 0) {
    anomalies.push(
      "`prisma/migrations/` ne porte AUCUNE migration — les tables du § 12 sont validées " +
        "comme SCHÉMA et matérialisables par zéro chemin reproductible, et le script " +
        "d'ajout seul n'a rien après quoi s'appliquer",
    );
  }
  if (tablesManquantes.length > 0) {
    anomalies.push(
      `${String(tablesManquantes.length)} table(s) déclarée(s) au schéma qu'aucune migration ` +
        `ne crée : ${tablesManquantes.join(", ")} — une table neuve au schéma n'atterrit pas ` +
        "en base par le seul fait d'y être écrite",
    );
  }
  if (moteur === null) {
    anomalies.push(
      "`prisma/migrations/migration_lock.toml` est absent ou ne déclare aucun `provider` — " +
        "`prisma migrate deploy` ne sait alors pas contre quel dialecte les fichiers " +
        "`migration.sql` ont été produits",
    );
  }
  if (!etat.ajoutSeulPresent) {
    anomalies.push(
      `« ${SCRIPT_D_AJOUT_SEUL} » est absent du dépôt — le journal en ajout seul de ` +
        "l'ADR 0002 n'est alors appliqué par rien, et `verifierChaine` rendrait `valide` " +
        "sur un journal amputé puis recalculé",
    );
  }
  if (etat.scriptDeDeploiement === null) {
    anomalies.push(
      "aucun script de déploiement n'est déclaré dans package.json — l'ordre des deux gestes " +
        "n'est alors écrit nulle part, il est convenu oralement, et un ordre convenu " +
        "oralement s'inverse au premier remplaçant",
    );
  } else if (!ordreEcrit) {
    anomalies.push(
      `le script de déploiement ne nomme pas « ${GESTE_DE_MIGRATION} » AVANT ` +
        `« ${SCRIPT_D_AJOUT_SEUL} » (positions ${String(positionDeLaMigration)} et ` +
        `${String(positionDeLAjoutSeul)}) — appliqué en premier, le script d'ajout seul ` +
        "échouerait sur une table qui n'existe pas encore",
    );
  }

  return {
    migrationsTrouvees: etat.migrations.length,
    tablesDuSchema,
    tablesCreees,
    tablesManquantes,
    moteur,
    positionDeLaMigration,
    positionDeLAjoutSeul,
    ordreEcrit,
    anomalies,
  };
}

/** Le `provider` de `migration_lock.toml`, ou `null` s'il n'y en a pas. */
function lireLeMoteur(verrou: string): string | null {
  const trouve = /^\s*provider\s*=\s*"([^"]+)"/mu.exec(verrou);
  return trouve?.[1] ?? null;
}

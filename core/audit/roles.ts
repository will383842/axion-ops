/**
 * `core/audit/roles.ts` — QUI ÉCRIT, QUI SUPPRIME, ET SOUS QUEL RÔLE.
 *
 * ═══ CE QUE CE MODULE AJOUTE À `droits-sql.ts` ═══
 *
 * `prisma/sql/0001-ops-audit-append-only.sql` crée deux rôles de groupe et leur
 * distribue des droits ; `droits-sql.ts` lit ce script et vérifie qu'il dit ce
 * qu'il prétend dire. Il manquait la MOITIÉ QUI VIT DANS LE CODE : rien
 * n'écrivait quelle opération du journal passe sous quel rôle.
 *
 * Sans elle, la séparation n'existait que dans le cluster. Trois conséquences,
 * toutes réelles :
 *
 *  1. **Rien ne refusait, côté socle, une purge qui insère.** Le refus venait
 *     de PostgreSQL, à l'exécution, loin de sa cause — et seulement si le
 *     script avait été appliqué. Sur une base où il ne l'avait pas été, plus
 *     rien ne refusait du tout.
 *  2. **Rien ne confrontait le code au script.** Le socle pouvait se mettre à
 *     supprimer sous le rôle d'écriture — geste parfaitement compilable — et
 *     l'écart ne se serait vu qu'en production, en erreur SQL.
 *  3. **Rien ne disait dans quel ORDRE se fait une purge** (§ 31 : la clôture
 *     d'abord, sous le rôle d'écriture ; la suppression ensuite, sous celui de
 *     purge). Cet ordre est ce qui rend une panne intercalaire DÉTECTABLE.
 *
 * ═══ LA BORNE, ÉCRITE AVEC LA MESURE ═══
 *
 * ⚠️ CE MODULE NE SE CONNECTE À RIEN. Il ne prouve pas que le cluster applique
 *    la séparation — un rôle de connexion PROPRIÉTAIRE de la table peut se
 *    redonner tous les droits, un `GRANT` postérieur peut être appliqué à la
 *    main, et un script jamais exécuté ne change rien. Les deux requêtes
 *    `has_table_privilege` qui répondent à ces trois cas sont nommées en fin de
 *    script et doivent tourner SUR LA BASE, au déploiement.
 *
 *    Ce qu'il prouve, et c'est autre chose : que le CODE ne demande jamais un
 *    droit que le SCRIPT ne lui accorde pas, et que les deux rôles ne se
 *    recouvrent sur aucune des deux opérations qui, réunies, permettraient de
 *    réécrire le journal.
 */

import {
  ROLE_ECRITURE,
  ROLE_PURGE,
  TABLE_JOURNAL,
  aLeDroit,
  lireDroitsDuJournal,
  type DroitTable,
  type LectureDroits,
} from "./droits-sql.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le vocabulaire
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TROIS OPÉRATIONS que le socle fait subir à `ops_audit`, et rien d'autre.
 *
 * Elles sont nommées ici parce qu'elles sont la charnière : c'est d'elles que
 * se dérive à la fois le droit SQL exigé et le rôle sous lequel l'opération
 * passe. Une quatrième opération — un `UPDATE`, sous n'importe quel prétexte —
 * n'aurait pas sa place dans cette liste, et c'est exactement le propos.
 */
export const OPERATIONS_JOURNAL = ["lire", "ajouter", "supprimer"] as const;

export type OperationJournal = (typeof OPERATIONS_JOURNAL)[number];

/**
 * Le droit de table qu'exige chaque opération.
 *
 * `Record<OperationJournal, DroitTable>` : ajouter une opération sans lui
 * déclarer de droit est une ERREUR DE COMPILATION. C'est la dérivation, pas une
 * seconde liste tenue à la main.
 */
export const DROIT_EXIGE: Record<OperationJournal, DroitTable> = {
  lire: "SELECT",
  ajouter: "INSERT",
  supprimer: "DELETE",
};

/**
 * LES DEUX ACTEURS. Ce ne sont pas deux composants : ce sont les deux
 * COMPROMISSIONS qu'on redoute, et elles ne sont pas la même.
 *
 * Un attaquant qui obtient le processus du socle obtient l'INSERT et la clé de
 * scellement — il ne peut ni modifier ni supprimer. Un attaquant qui obtient
 * les identifiants de la purge obtient le DELETE — il n'a ni INSERT, ni la clé.
 * Réécrire le journal exige LES DEUX, séparément.
 */
export const ACTEURS_JOURNAL = ["socle", "purge"] as const;

export type ActeurJournal = (typeof ACTEURS_JOURNAL)[number];

/** Le rôle PostgreSQL sous lequel chaque acteur se connecte. */
export const ROLE_DE_LACTEUR: Record<ActeurJournal, string> = {
  socle: ROLE_ECRITURE,
  purge: ROLE_PURGE,
};

/**
 * Ce que chaque acteur a le droit de faire.
 *
 * ⚠️ LA PURGE N'AJOUTE PAS, ET CE N'EST PAS UN MANQUE. Elle n'écrit donc pas sa
 *    propre ligne de clôture : un rôle qui pourrait à la fois supprimer une
 *    tranche et écrire la ligne qui l'atteste pourrait écrire n'importe quelle
 *    attestation. La séquence du § 31 est donc, dans cet ordre :
 *      1. le SOCLE écrit la ligne de clôture ;
 *      2. la PURGE supprime la tranche attestée.
 *
 *    Les deux ne sont pas atomiques, et le trou est ASSUMÉ parce qu'il est
 *    DÉTECTABLE : une panne entre les deux laisse une clôture qui atteste une
 *    tranche encore présente, ce que `verifierChaine` compte sous
 *    `ancresInutilisees`. L'ordre inverse laisserait, à la même panne, un
 *    journal troué SANS ancre — indiscernable d'une troncature hostile.
 */
export const OPERATIONS_DE_LACTEUR: Record<ActeurJournal, readonly OperationJournal[]> = {
  socle: ["lire", "ajouter"],
  purge: ["lire", "supprimer"],
};

/**
 * Les opérations dont l'exclusivité FAIT la séparation.
 *
 * DÉRIVÉES : ce sont celles qu'un seul acteur détient. Les écrire à la main
 * aurait produit une seconde liste, silencieusement fausse le jour où
 * `OPERATIONS_DE_LACTEUR` bouge.
 */
export const OPERATIONS_EXCLUSIVES: readonly OperationJournal[] = OPERATIONS_JOURNAL.filter(
  (operation) =>
    ACTEURS_JOURNAL.filter((acteur) => OPERATIONS_DE_LACTEUR[acteur].includes(operation)).length ===
    1,
);

/**
 * Les droits qu'AUCUN rôle ne doit détenir sur `ops_audit`.
 *
 * DÉRIVÉS eux aussi : tout droit de table qui n'est exigé par aucune opération.
 * `UPDATE` y figure — c'est l'ajout-seul lui-même — mais aussi `TRUNCATE`,
 * `REFERENCES` et `TRIGGER`, qui vident ou détournent la table sans passer par
 * `DELETE`. Une liste écrite à la main aurait oublié le jour où un droit
 * s'ajoute à `DROITS_TABLE`.
 */
export function droitsInterdits(lecture: LectureDroits): readonly DroitTable[] {
  const exiges = new Set<DroitTable>(Object.values(DROIT_EXIGE));
  const tous = new Set<DroitTable>();
  for (const role of lecture.roles) {
    for (const droit of lecture.parRole.get(role)?.accordes ?? []) tous.add(droit);
  }
  return [...tous].filter((droit) => !exiges.has(droit));
}

// ═════════════════════════════════════════════════════════════════════════════
//  La sélection de rôle
// ═════════════════════════════════════════════════════════════════════════════

/** Levée quand un acteur demande une opération qui n'est pas la sienne. */
export class ErreurRoleJournal extends Error {
  readonly acteur: ActeurJournal;
  readonly operation: OperationJournal;

  constructor(acteur: ActeurJournal, operation: OperationJournal) {
    super(
      `ADR 0002 — « ${acteur} » ne fait pas « ${operation} » sur ${TABLE_JOURNAL}. ` +
        `Il n'a que : ${OPERATIONS_DE_LACTEUR[acteur].join(", ")}. ` +
        "La séparation des rôles n'est pas une commodité de déploiement : réunir l'INSERT et " +
        "le DELETE dans un même rôle rendrait une réécriture du journal possible sous une " +
        "seule compromission.",
    );
    this.name = "ErreurRoleJournal";
    this.acteur = acteur;
    this.operation = operation;
  }
}

/**
 * Le rôle sous lequel cette opération doit passer — ou un REFUS.
 *
 * ⚠️ ELLE LÈVE, ELLE NE REND PAS `null`. Un `null` se lit `if (role) …`, et le
 *    chemin oublié est alors une opération qui passe sous le rôle courant,
 *    c'est-à-dire sous celui qu'on voulait justement éviter. Le refus doit être
 *    aussi bruyant que la faute.
 *
 * ⚠️ ELLE NE REMPLACE PAS LE `REVOKE`, ELLE LE DOUBLE. Le cluster reste la
 *    barrière ; celle-ci refuse plus tôt, et refuse même sur une base où le
 *    script n'a pas été appliqué — le cas où le cluster, lui, ne refuse rien.
 */
export function roleDe(acteur: ActeurJournal, operation: OperationJournal): string {
  if (!OPERATIONS_DE_LACTEUR[acteur].includes(operation)) {
    throw new ErreurRoleJournal(acteur, operation);
  }
  return ROLE_DE_LACTEUR[acteur];
}

// ═════════════════════════════════════════════════════════════════════════════
//  La confrontation du CODE au SCRIPT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que rend la confrontation. JAMAIS un booléen. */
export interface VerdictSeparation {
  /** Nombre de couples (acteur, opération) réellement CONFRONTÉS. */
  readonly couplesMesures: number;
  /** Nombre de rôles lus dans le script. */
  readonly rolesMesures: number;
  /** Nombre d'instructions `GRANT`/`REVOKE` portant sur la table. */
  readonly instructionsSurLaTable: number;
  readonly anomalies: readonly string[];
}

/**
 * Le code demande-t-il exactement ce que le script accorde ?
 *
 * Trois questions, et elles ne se recouvrent pas :
 *
 *  1. **Chaque opération est-elle POSSIBLE ?** Le rôle de l'acteur détient-il
 *     le droit qu'elle exige. Sinon le code demanderait à l'exécution un droit
 *     que le script refuse : une panne, pas une protection.
 *  2. **Chaque opération exclusive l'est-elle VRAIMENT ?** L'autre rôle ne doit
 *     PAS détenir ce droit. C'est ici, et nulle part ailleurs, que la
 *     séparation se mesure — un `GRANT ALL` glissé « pour débloquer un
 *     incident » la dissout en une ligne, sans rien casser d'autre.
 *  3. **Un droit non exigé traîne-t-il ?** `UPDATE` d'abord — c'est l'ajout
 *     seul —, mais aussi `TRUNCATE`, `REFERENCES`, `TRIGGER`.
 *
 * @param lecture - la table de droits lue dans le script. Injectable pour que
 *   les gardes puissent la FABRIQUER : une confrontation qu'on ne peut pas
 *   nourrir d'un script défectueux ne prouve jamais qu'elle sait rougir.
 */
export function verifierSeparationDesRoles(
  lecture: LectureDroits = lireDroitsDuJournal(),
): VerdictSeparation {
  const anomalies: string[] = [];
  let couplesMesures = 0;

  for (const acteur of ACTEURS_JOURNAL) {
    const role = ROLE_DE_LACTEUR[acteur];

    for (const operation of OPERATIONS_JOURNAL) {
      couplesMesures += 1;
      const droit = DROIT_EXIGE[operation];
      const detenu = aLeDroit(lecture, role, droit);
      const attendu = OPERATIONS_DE_LACTEUR[acteur].includes(operation);

      if (attendu && !detenu) {
        anomalies.push(
          `« ${acteur} » doit pouvoir « ${operation} » sur ${TABLE_JOURNAL}, mais le script ` +
            `n'accorde pas ${droit} à ${role} : le code demanderait un droit refusé.`,
        );
      }
      if (!attendu && detenu && OPERATIONS_EXCLUSIVES.includes(operation)) {
        anomalies.push(
          `le script accorde ${droit} à ${role}, alors que « ${operation} » n'appartient pas à ` +
            `« ${acteur} ». La séparation est dissoute : un seul rôle réunit de quoi réécrire ` +
            "le journal.",
        );
      }
    }
  }

  for (const droit of droitsInterdits(lecture)) {
    anomalies.push(
      `le script accorde ${droit} sur ${TABLE_JOURNAL}, qu'aucune opération du socle n'exige. ` +
        "Un droit accordé sans emploi est un droit qui servira à autre chose.",
    );
  }

  return {
    couplesMesures,
    rolesMesures: lecture.roles.length,
    instructionsSurLaTable: lecture.instructionsSurLaTable,
    anomalies,
  };
}

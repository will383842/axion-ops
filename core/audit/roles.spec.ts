import { describe, expect, it } from "vitest";

import {
  ROLE_ECRITURE,
  ROLE_PURGE,
  TABLE_JOURNAL,
  lireDroits,
  lireDroitsDuJournal,
} from "./droits-sql.js";
import {
  ACTEURS_JOURNAL,
  DROIT_EXIGE,
  ErreurRoleJournal,
  OPERATIONS_DE_LACTEUR,
  OPERATIONS_EXCLUSIVES,
  OPERATIONS_JOURNAL,
  ROLE_DE_LACTEUR,
  droitsInterdits,
  roleDe,
  verifierSeparationDesRoles,
} from "./roles.js";

/**
 * GARDES DE L'ADR 0002, SECONDE MOITIÉ : LA SÉLECTION DE RÔLE.
 *
 * `droits-sql.spec.ts` prouve que le SCRIPT dit ce qu'il prétend dire. Ce
 * fichier-ci prouve l'autre moitié : que le CODE ne demande jamais un droit que
 * le script ne lui accorde pas, et que les deux rôles ne se recouvrent sur
 * aucune des opérations qui, réunies, permettraient de réécrire le journal.
 *
 * ⚠️ CE QUE CES GARDES NE PROUVENT PAS, ÉCRIT DANS LA MÊME PHRASE QUE LA
 *    MESURE : aucune base ne tourne dans ce dépôt. Elles ne disent donc rien de
 *    ce que le CLUSTER applique — un rôle de connexion propriétaire de la table
 *    peut se redonner tous les droits, un `GRANT` postérieur peut être appliqué
 *    à la main, et un script jamais exécuté ne change rien. Les deux requêtes
 *    `has_table_privilege` qui répondent à ces trois cas sont nommées en fin de
 *    `prisma/sql/0001-ops-audit-append-only.sql` et tournent au déploiement.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la sélection de rôle REFUSE, et elle refuse bruyamment
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit/roles — la sélection de rôle", () => {
  it("REFUSE une purge qui insère — le geste qui réunirait de quoi réécrire le journal", () => {
    // C'est LE refus qui porte l'ADR : un rôle capable de supprimer une tranche
    // ET d'écrire la ligne qui l'atteste pourrait écrire n'importe quelle
    // attestation.
    expect(() => roleDe("purge", "ajouter")).toThrow(ErreurRoleJournal);

    let message = "";
    try {
      roleDe("purge", "ajouter");
    } catch (erreur: unknown) {
      message = erreur instanceof Error ? erreur.message : String(erreur);
    }

    console.info(`[garde rôle] refus rendu : ${message}`);

    // § 15 — le refus DIT ce que l'acteur a le droit de faire, il ne se contente
    // pas de dire non.
    expect(message).toContain("purge");
    expect(message).toContain("supprimer");
  });

  it("REFUSE aussi au SOCLE de supprimer — la séparation vaut dans les deux sens", () => {
    // Une garde qui ne mordrait que dans un sens laisserait le socle réunir
    // l'INSERT et le DELETE, c'est-à-dire exactement ce qu'on écarte.
    expect(() => roleDe("socle", "supprimer")).toThrow(ErreurRoleJournal);
  });

  it("SAIT DIRE OUI, et rend le rôle attendu pour chacune des opérations légitimes", () => {
    const rendus: string[] = [];
    let couples = 0;

    for (const acteur of ACTEURS_JOURNAL) {
      for (const operation of OPERATIONS_DE_LACTEUR[acteur]) {
        couples += 1;
        const role = roleDe(acteur, operation);
        expect(role).toBe(ROLE_DE_LACTEUR[acteur]);
        rendus.push(`${acteur}/${operation}→${role}`);
      }
    }

    console.info(`[garde rôle] ${String(couples)} couple(s) légitime(s) : ${rendus.join(" · ")}`);

    // Plancher-témoin : une sélection qui refuserait TOUT serait verte sur les
    // deux gardes précédentes sans rien accorder.
    expect(couples).toBe(4);
    expect(rendus).toContain(`socle/ajouter→${ROLE_ECRITURE}`);
    expect(rendus).toContain(`purge/supprimer→${ROLE_PURGE}`);
  });

  it("DÉRIVE les opérations exclusives, plutôt que de les porter en dur", () => {
    // Si `OPERATIONS_DE_LACTEUR` changeait — un acteur qui gagne ou perd une
    // opération —, une liste écrite à la main deviendrait fausse en silence, et
    // la confrontation ci-dessous cesserait de mesurer la séparation.
    console.info(
      `[garde dérivation] ${String(OPERATIONS_JOURNAL.length)} opération(s), ` +
        `${String(OPERATIONS_EXCLUSIVES.length)} exclusive(s) : ${OPERATIONS_EXCLUSIVES.join(", ")}`,
    );

    expect([...OPERATIONS_EXCLUSIVES].sort()).toEqual(["ajouter", "supprimer"]);
    // `lire` est partagé : les deux acteurs le détiennent, il ne sépare rien.
    expect(OPERATIONS_EXCLUSIVES).not.toContain("lire");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — la confrontation SAIT ROUGIR, sur trois témoins fabriqués
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit/roles — la confrontation du code au script", () => {
  it("rougit sur un témoin fabriqué : la RÉVOCATION est absente", () => {
    // Le témoin le plus simple, et celui qui compte : le script accorde tout au
    // rôle d'écriture. La revocation ne mord plus, et il faut que ça se voie.
    const temoin = `
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ops_audit TO ops_audit_ecriture;
      GRANT SELECT, DELETE ON TABLE ops_audit TO ops_audit_purge;
    `;
    const verdict = verifierSeparationDesRoles(lireDroits(temoin, TABLE_JOURNAL));

    console.info(
      `[témoin sans REVOKE] ${String(verdict.couplesMesures)} couple(s) mesuré(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s) : ${verdict.anomalies.join(" · ")}`,
    );

    expect(verdict.anomalies.length).toBeGreaterThan(0);
    // Deux défauts DISTINCTS, et la garde doit voir les deux : le rôle
    // d'écriture détient DELETE (séparation dissoute) et UPDATE (l'ajout seul
    // n'est plus tenu du tout).
    expect(verdict.anomalies.join(" ")).toContain("DELETE");
    expect(verdict.anomalies.join(" ")).toContain("UPDATE");
  });

  it("rougit sur un témoin fabriqué : un `GRANT ALL` glissé APRÈS le REVOKE", () => {
    // C'est le geste réel qu'on redoute — « pour débloquer un incident ». Une
    // lecture qui s'arrêterait au premier REVOKE ne le verrait pas.
    const temoin = `
      GRANT SELECT, INSERT ON TABLE ops_audit TO ops_audit_ecriture;
      REVOKE UPDATE, DELETE ON TABLE ops_audit FROM ops_audit_ecriture;
      GRANT SELECT, DELETE ON TABLE ops_audit TO ops_audit_purge;
      REVOKE INSERT, UPDATE ON TABLE ops_audit FROM ops_audit_purge;
      GRANT ALL ON TABLE ops_audit TO ops_audit_purge;
    `;
    const verdict = verifierSeparationDesRoles(lireDroits(temoin, TABLE_JOURNAL));

    console.info(
      `[témoin GRANT ALL] ${String(verdict.couplesMesures)} couple(s) mesuré(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies.length).toBeGreaterThan(0);
    expect(verdict.anomalies.join(" ")).toContain(ROLE_PURGE);
  });

  it("rougit sur un témoin fabriqué : le script ne dit RIEN du rôle d'écriture", () => {
    // Le cas de la ligne perdue à la fusion. Le code demanderait alors l'INSERT
    // sous un rôle qui ne l'a pas : une panne en production, pas une protection.
    const temoin = `
      GRANT SELECT, DELETE ON TABLE ops_audit TO ops_audit_purge;
    `;
    const verdict = verifierSeparationDesRoles(lireDroits(temoin, TABLE_JOURNAL));

    console.info(
      `[témoin rôle absent] ${String(verdict.rolesMesures)} rôle(s) lu(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies.join(" ")).toContain(ROLE_ECRITURE);
    expect(verdict.anomalies.join(" ")).toContain(DROIT_EXIGE.ajouter);
  });

  it("rougit sur un script VIDE — une garde qui lit zéro instruction n'est pas verte", () => {
    // Le fichier déplacé, vidé, ou l'expression qui cesse de mordre. C'est le
    // défaut le plus banal des gardes de texte, et il produit du vert.
    const verdict = verifierSeparationDesRoles(lireDroits("", TABLE_JOURNAL));

    console.info(
      `[témoin script vide] ${String(verdict.instructionsSurLaTable)} instruction(s) sur la ` +
        `table, ${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.instructionsSurLaTable).toBe(0);
    expect(verdict.anomalies.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — le SCRIPT RÉEL de ce dépôt
// ─────────────────────────────────────────────────────────────────────────────

describe("ADR 0002 — le script de ce dépôt tient la séparation que le code suppose", () => {
  it("accorde exactement ce que le code demande, et rien de plus", () => {
    const lecture = lireDroitsDuJournal();
    const verdict = verifierSeparationDesRoles(lecture);

    console.info(
      `[garde séparation] ${String(verdict.couplesMesures)} couple(s) (acteur × opération) ` +
        `confronté(s), ${String(verdict.rolesMesures)} rôle(s) lu(s) : ${lecture.roles.join(", ")}, ` +
        `${String(verdict.instructionsSurLaTable)} instruction(s) sur ${TABLE_JOURNAL}, ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    // Planchers-témoins. Le compte de couples est DÉRIVÉ du produit acteurs ×
    // opérations : un acteur ajouté sans être confronté ferait rougir ici.
    expect(verdict.couplesMesures).toBe(ACTEURS_JOURNAL.length * OPERATIONS_JOURNAL.length);
    // Un script vidé ou déplacé rendrait zéro instruction, et tout le reste
    // serait vert en n'ayant rien lu.
    expect(verdict.instructionsSurLaTable).toBeGreaterThanOrEqual(5);
    expect(verdict.rolesMesures).toBeGreaterThanOrEqual(2);

    expect(verdict.anomalies).toEqual([]);
  });

  it("n'accorde AUCUN droit qui ne serve à une opération — `UPDATE` en tête", () => {
    const interdits = droitsInterdits(lireDroitsDuJournal());

    console.info(
      `[garde droits inutiles] ${String(interdits.length)} droit(s) accordé(s) sans emploi : ` +
        `${interdits.length > 0 ? interdits.join(", ") : "aucun"}`,
    );

    expect(interdits).toEqual([]);
  });

  it("témoin de contraste — la même lecture DÉTECTE un droit inutile ajouté", () => {
    // Sans ce contraste, la garde précédente serait verte même si
    // `droitsInterdits` avait cessé de regarder quoi que ce soit.
    const temoin = `
      GRANT SELECT, INSERT ON TABLE ops_audit TO ops_audit_ecriture;
      GRANT TRIGGER ON TABLE ops_audit TO ops_audit_ecriture;
      GRANT SELECT, DELETE ON TABLE ops_audit TO ops_audit_purge;
    `;
    const interdits = droitsInterdits(lireDroits(temoin, TABLE_JOURNAL));

    console.info(`[témoin droit inutile] détecté(s) : ${interdits.join(", ")}`);

    expect(interdits).toContain("TRIGGER");
  });
});

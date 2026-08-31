import { describe, expect, it } from "vitest";

import {
  DROITS_TABLE,
  ROLE_ECRITURE,
  ROLE_PURGE,
  TABLE_JOURNAL,
  aLeDroit,
  cheminDuScriptDeDroits,
  lireDroits,
  lireDroitsDuJournal,
  sansCommentairesSql,
} from "./droits-sql.js";

/**
 * Gardes de l'ADR 0002, première moitié : `ops_audit` EN AJOUT SEUL.
 *
 * ⚠️ CE QUE CES GARDES PROUVENT, ET RIEN DE PLUS. Elles prouvent que le SCRIPT
 *    `prisma/sql/0001-ops-audit-append-only.sql` accorde et retire ce qu'il
 *    prétend accorder et retirer. Elles NE PROUVENT PAS que le cluster
 *    l'applique : un rôle de connexion propriétaire de la table peut se
 *    redonner tous les droits, un `GRANT` postérieur peut être appliqué à la
 *    main, et un script jamais exécuté ne change rien du tout.
 *
 *    Les deux requêtes `has_table_privilege` qui répondent à ces trois cas sont
 *    nommées en fin de script, et elles tournent SUR LA BASE, au déploiement.
 *    Aucune base ne tourne dans ce dépôt — c'est la borne, et elle est écrite
 *    dans la même phrase que la mesure.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la lecture sait rougir, et elle ne lit pas la prose
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit/droits-sql — la lecture d'un script de droits", () => {
  it("rougit sur un témoin fabriqué : le REVOKE est absent", () => {
    const temoin = `
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ops_audit TO ops_audit_ecriture;
    `;
    const lecture = lireDroits(temoin, TABLE_JOURNAL);

    console.info(
      `[témoin sans REVOKE] ${String(lecture.instructionsSurLaTable)} instruction(s) sur la table`,
    );

    expect(aLeDroit(lecture, ROLE_ECRITURE, "UPDATE")).toBe(true);
    expect(aLeDroit(lecture, ROLE_ECRITURE, "DELETE")).toBe(true);
  });

  it("rougit sur un témoin fabriqué : un `GRANT ALL` glissé après le REVOKE", () => {
    // C'est le geste réel qu'on redoute — « pour débloquer un incident » — et
    // il annulerait toute la protection en une ligne. Une lecture qui
    // s'arrêterait au premier REVOKE ne le verrait pas.
    const temoin = `
      GRANT SELECT, INSERT ON TABLE ops_audit TO ops_audit_ecriture;
      REVOKE UPDATE, DELETE ON TABLE ops_audit FROM ops_audit_ecriture;
      GRANT ALL ON TABLE ops_audit TO ops_audit_ecriture;
    `;
    const lecture = lireDroits(temoin, TABLE_JOURNAL);

    console.info(
      `[témoin GRANT ALL] ${String(lecture.instructionsSurLaTable)} instruction(s) sur la table`,
    );

    expect(aLeDroit(lecture, ROLE_ECRITURE, "DELETE")).toBe(true);
    expect(aLeDroit(lecture, ROLE_ECRITURE, "UPDATE")).toBe(true);
  });

  it("ne prend PAS un commentaire pour une instruction", () => {
    // Un script réduit à ses seules explications ne doit accorder RIEN. Sans ce
    // témoin, une garde verte pourrait n'avoir lu que de la prose.
    const temoin = `
      -- GRANT ALL ON TABLE ops_audit TO ops_audit_ecriture;
      /* GRANT DELETE ON TABLE ops_audit TO ops_audit_purge; */
    `;
    const lecture = lireDroits(temoin, TABLE_JOURNAL);

    console.info(`[témoin prose] ${String(lecture.instructionsLues)} instruction(s) reconnue(s)`);

    expect(lecture.instructionsLues).toBe(0);
    expect(sansCommentairesSql(temoin).includes("GRANT")).toBe(false);
  });

  it("ignore les instructions qui portent sur une AUTRE table", () => {
    const temoin = `
      GRANT ALL ON TABLE ops_secret TO ops_audit_ecriture;
      GRANT SELECT, INSERT ON TABLE ops_audit TO ops_audit_ecriture;
    `;
    const lecture = lireDroits(temoin, TABLE_JOURNAL);

    console.info(
      `[témoin autre table] ${String(lecture.instructionsLues)} lue(s), ` +
        `${String(lecture.instructionsSurLaTable)} sur ${TABLE_JOURNAL}`,
    );

    expect(lecture.instructionsLues).toBe(2);
    expect(lecture.instructionsSurLaTable).toBe(1);
    expect(aLeDroit(lecture, ROLE_ECRITURE, "DELETE")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — le script RÉEL de ce dépôt
// ─────────────────────────────────────────────────────────────────────────────

describe("ADR 0002 — le script de droits de ce dépôt", () => {
  it("existe, se lit, et ANNONCE combien d'instructions il porte", () => {
    const lecture = lireDroitsDuJournal();

    console.info(
      `[garde droits] ${cheminDuScriptDeDroits()} — ` +
        `${String(lecture.instructionsLues)} instruction(s) reconnue(s), ` +
        `${String(lecture.instructionsSurLaTable)} sur ${TABLE_JOURNAL}, ` +
        `${String(lecture.roles.length)} rôle(s) : ${lecture.roles.join(", ")}`,
    );

    // Plancher-témoin : le script porte au moins un REVOKE de PUBLIC, deux
    // GRANT et deux REVOKE nommés. Un fichier vidé, déplacé, ou une expression
    // qui cesserait de mordre rendraient zéro — et la garde ci-dessous serait
    // verte sans avoir rien lu.
    expect(lecture.instructionsSurLaTable).toBeGreaterThanOrEqual(5);
    expect(lecture.roles).toContain(ROLE_ECRITURE);
    expect(lecture.roles).toContain(ROLE_PURGE);
  });

  it("donne à l'application l'AJOUT, et lui refuse la modification", () => {
    const lecture = lireDroitsDuJournal();
    const attendus: ReadonlyArray<readonly [(typeof DROITS_TABLE)[number], boolean]> = [
      ["SELECT", true],
      ["INSERT", true],
      ["UPDATE", false],
      ["DELETE", false],
      ["TRUNCATE", false],
    ];

    const ecarts: string[] = [];
    for (const [droit, attendu] of attendus) {
      const obtenu = aLeDroit(lecture, ROLE_ECRITURE, droit);
      if (obtenu !== attendu)
        ecarts.push(`${droit} : ${String(obtenu)} au lieu de ${String(attendu)}`);
    }

    console.info(
      `[garde ${ROLE_ECRITURE}] ${String(attendus.length)} droit(s) confronté(s), ` +
        `${String(ecarts.length)} écart(s)`,
    );

    expect(ecarts).toEqual([]);
  });

  it("donne à la purge la SUPPRESSION, et lui refuse l'insertion", () => {
    // ⚠️ C'EST LA SÉPARATION ELLE-MÊME. Un rôle qui pourrait à la fois
    //    supprimer une tranche ET écrire la ligne qui l'atteste pourrait écrire
    //    n'importe quelle attestation, et la clôture du § 31 ne vaudrait plus
    //    rien.
    const lecture = lireDroitsDuJournal();
    const attendus: ReadonlyArray<readonly [(typeof DROITS_TABLE)[number], boolean]> = [
      ["SELECT", true],
      ["DELETE", true],
      ["INSERT", false],
      ["UPDATE", false],
      ["TRUNCATE", false],
    ];

    const ecarts: string[] = [];
    for (const [droit, attendu] of attendus) {
      const obtenu = aLeDroit(lecture, ROLE_PURGE, droit);
      if (obtenu !== attendu)
        ecarts.push(`${droit} : ${String(obtenu)} au lieu de ${String(attendu)}`);
    }

    console.info(
      `[garde ${ROLE_PURGE}] ${String(attendus.length)} droit(s) confronté(s), ` +
        `${String(ecarts.length)} écart(s)`,
    );

    expect(ecarts).toEqual([]);
  });

  it("n'accorde à AUCUN rôle à la fois l'écriture et la suppression", () => {
    // La propriété qui compte, dérivée plutôt qu'affirmée sur deux noms :
    // réécrire le journal exige l'INSERT ET le DELETE, et aucun rôle du script
    // ne porte les deux. Un troisième rôle ajouté un jour avec les deux ferait
    // rougir ceci sans qu'on ait à penser à lui.
    const lecture = lireDroitsDuJournal();
    const cumulards: string[] = [];
    let mesures = 0;

    for (const role of lecture.roles) {
      mesures += 1;
      if (aLeDroit(lecture, role, "INSERT") && aLeDroit(lecture, role, "DELETE")) {
        cumulards.push(role);
      }
    }

    console.info(
      `[garde cumul] ${String(mesures)} rôle(s) mesuré(s), ${String(cumulards.length)} cumulard(s)`,
    );

    // Plancher-témoin : deux rôles au moins, sinon la mesure ne regarde rien.
    expect(mesures).toBeGreaterThanOrEqual(2);
    expect(cumulards).toEqual([]);
  });

  it("retire tout à PUBLIC — sinon le reste du script ne sert à rien", () => {
    // `PUBLIC` est un rôle implicite dont tout le monde hérite. Un droit qui y
    // traîne annule tout ce qui précède, en silence.
    const lecture = lireDroitsDuJournal();
    const publics = lecture.parRole.get("PUBLIC");

    console.info(
      `[garde PUBLIC] ${String(publics?.retires.length ?? 0)} droit(s) retiré(s) à PUBLIC`,
    );

    expect(publics).toBeDefined();
    expect(publics?.accordes).toEqual([]);
    // `REVOKE ALL` retire les sept droits reconnus.
    expect(publics?.retires.length).toBe(DROITS_TABLE.length);
  });
});

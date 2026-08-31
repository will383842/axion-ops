/**
 * `core/transport/http/audience.spec.ts` — **LA GARDE DE L'ÉTAPE 3 (RFC 8707).**
 *
 * ⚠️ **CE QUE CETTE GARDE EXISTE POUR VOIR.** Une étape 3 se désarme de trois
 *    façons, et aucune des trois ne rougit toute seule :
 *
 *     · la comparaison devient approchée — préfixe, casse, barre finale
 *       tolérée — et un jeton d'une autre ressource passe ;
 *     · l'absence d'audience se lit « pour toutes les ressources » ;
 *     · l'audience attendue est vide, et tout accorde avec tout.
 *
 *    Les trois sont éprouvées, et le compte de COMPARAISONS est lu à chaque
 *    fois : un verdict « autorisé » avec zéro comparaison serait le pire des
 *    verts.
 */

import { describe, expect, it } from "vitest";

import { verifierLAudience } from "./audience.js";

const ATTENDUE = "https://socle.stub.invalid/api/mcp";

describe("§ 19.1, étape 3 — l'audience se compare par ÉGALITÉ EXACTE", () => {
  it("refuse toute variante d'écriture, et ANNONCE ses comparaisons", () => {
    const cas: ReadonlyArray<readonly [string, unknown, boolean, string | null]> = [
      ["l'audience exacte", ATTENDUE, true, null],
      [
        "la même, dans un tableau d'UN élément — RFC 8707 permet les deux écritures",
        [ATTENDUE],
        true,
        null,
      ],
      ["une barre finale de plus", `${ATTENDUE}/`, false, "audience-differente"],
      [
        "l'hôte en majuscules — aucune normalisation d'URL",
        ATTENDUE.toUpperCase(),
        false,
        "audience-differente",
      ],
      ["un paramètre de requête ajouté", `${ATTENDUE}?x=1`, false, "audience-differente"],
      [
        "l'origine seule — elle désignerait le socle entier",
        "https://socle.stub.invalid",
        false,
        "audience-differente",
      ],
      ["un préfixe de l'attendue", "https://socle.stub.invalid/api", false, "audience-differente"],
      ["une autre ressource", "https://autre.stub.invalid/api/mcp", false, "audience-differente"],
      ["aucune audience", undefined, false, "audience-absente"],
      ["une audience nulle", null, false, "audience-absente"],
      ["un tableau vide", [], false, "audience-absente"],
      [
        "DEUX audiences, dont la bonne — le socle n'en admet qu'une en v1",
        [ATTENDUE, "https://x.stub.invalid/a"],
        false,
        "audience-multiple",
      ],
      ["une audience numérique", 42, false, "audience-non-textuelle"],
      ["une audience objet", { url: ATTENDUE }, false, "audience-non-textuelle"],
    ];

    const desaccords: string[] = [];
    let comparaisons = 0;
    let audiencesLues = 0;
    for (const [nom, revendication, attendu, motif] of cas) {
      const verdict = verifierLAudience(revendication, ATTENDUE);
      comparaisons += verdict.comparaisonsFaites;
      audiencesLues += verdict.audiencesRecues;
      if (verdict.autorise !== attendu) {
        desaccords.push(`${nom} : ${String(verdict.autorise)} au lieu de ${String(attendu)}`);
      }
      if (verdict.motif !== motif) {
        desaccords.push(
          `${nom} : motif « ${String(verdict.motif)} » au lieu de « ${String(motif)} »`,
        );
      }
      // ⚠️ LA RÈGLE QUI NE SE VOIT PAS DANS LE BOOLÉEN : un verdict « autorisé »
      //    n'est recevable que s'il a comparé quelque chose.
      if (verdict.autorise && verdict.comparaisonsFaites === 0) {
        desaccords.push(`${nom} : accordé SANS aucune comparaison`);
      }
    }

    console.info(
      `[étape 3 · audience] ${String(cas.length)} cas éprouvé(s) · ` +
        `${String(audiencesLues)} audience(s) lue(s) · ` +
        `${String(comparaisons)} comparaison(s) de chaînes RÉELLEMENT faites · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Planchers : sans comparaison, la garde ne mesurerait que des refus
    // prononcés avant toute comparaison — c'est-à-dire pas l'égalité exacte.
    expect(cas.length).toBeGreaterThanOrEqual(12);
    expect(comparaisons).toBeGreaterThanOrEqual(8);
    expect(desaccords).toEqual([]);
  });

  it("refuse quand l'audience ATTENDUE est vide — sinon tout accorde avec tout", () => {
    const verdict = verifierLAudience("", "");
    console.info(
      `[étape 3 · attendue vide] ${String(verdict.comparaisonsFaites)} comparaison(s) · ` +
        `motif : ${String(verdict.motif)}`,
    );
    expect(verdict.autorise).toBe(false);
    expect(verdict.motif).toBe("audience-attendue-vide");
    expect(verdict.comparaisonsFaites).toBe(0);
  });

  it("TÉMOIN — une comparaison rendue approchée fait passer ce que la garde refuse", () => {
    // La garde ne peut pas muter la fonction de production ; on reconstruit donc
    // la version PERMISSIVE qu'on aurait écrite en cherchant à être accommodant,
    // et on montre qu'elle accorde exactement là où l'exacte refuse. Sans ce
    // témoin, « la comparaison est exacte » ne serait qu'une phrase.
    const approchee = (recue: string, attendue: string): boolean =>
      recue.replace(/\/$/, "").toLowerCase() === attendue.replace(/\/$/, "").toLowerCase();

    const pieges = [`${ATTENDUE}/`, ATTENDUE.toUpperCase()];
    const passeesParLApprochee = pieges.filter((piege) => approchee(piege, ATTENDUE));
    const passeesParLExacte = pieges.filter((piege) => verifierLAudience(piege, ATTENDUE).autorise);

    console.info(
      `[étape 3 · témoin] ${String(pieges.length)} variante(s) d'écriture éprouvée(s) · ` +
        `acceptée(s) par une comparaison APPROCHÉE : ${String(passeesParLApprochee.length)} · ` +
        `par l'ÉGALITÉ EXACTE : ${String(passeesParLExacte.length)}`,
    );

    expect(passeesParLApprochee.length).toBe(pieges.length);
    expect(passeesParLExacte).toEqual([]);
  });
});

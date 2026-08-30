import { describe, expect, it } from "vitest";

import { construireJournal, reecrireSansRecalculer } from "./fixtures.js";
import type { LigneAudit } from "./vocabulaire.js";
import { verifierChaine } from "./verification.js";

/**
 * Gardes du vérificateur d'intégrité.
 *
 * Critère de fini du lot 1, mot pour mot : « une ligne retirée au milieu du
 * journal casse la vérification, qui annonce combien de lignes elle a
 * vérifiées ». Les quatre gardes exigées par le chantier sont ici, plus celle
 * de l'ordre — `seq`, jamais `at`.
 */

const TAILLE = 12;

/** Les genres d'anomalie rencontrés, pour des assertions lisibles. */
function genres(anomalies: readonly { readonly genre: string }[]): readonly string[] {
  return anomalies.map((anomalie) => anomalie.genre);
}

describe("core/audit — la vérification d'un journal intact", () => {
  it("annonce COMBIEN de lignes elle a vérifiées, jamais un booléen seul", async () => {
    const store = await construireJournal(TAILLE);
    const rapport = verifierChaine(store.toutes());

    console.info(`[garde chaîne] ${String(rapport.lignesVerifiees)} lignes vérifiées`);

    // Plancher-témoin. Un journal vide se vérifierait « valide » : c'est vrai,
    // et c'est le pire des verts. Le compte est ce qui distingue les deux.
    expect(rapport.lignesVerifiees).toBe(TAILLE);
    expect(rapport.journalVide).toBe(false);
    expect(rapport.valide).toBe(true);
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.derniereEmpreinte).not.toBeNull();
  });

  it("rend un compte de ZÉRO sur un journal vide — le pire des verts, mais annoncé", () => {
    const rapport = verifierChaine([]);

    console.info(`[garde chaîne · vide] ${String(rapport.lignesVerifiees)} lignes vérifiées`);

    expect(rapport.lignesVerifiees).toBe(0);
    expect(rapport.journalVide).toBe(true);
    expect(rapport.valide).toBe(true);
  });
});

describe("core/audit — une ligne retirée AU MILIEU casse la vérification", () => {
  it("signale un saut non ancré, et annonce combien de lignes il restait", async () => {
    const store = await construireJournal(TAILLE);
    const intact = store.toutes();

    const milieu = intact[5];
    if (milieu === undefined) throw new Error("témoin mal fabriqué : pas de sixième ligne");
    store.supprimerIntervalle(milieu.seq, milieu.seq);

    const restant = store.toutes();
    const rapport = verifierChaine(restant);

    console.info(
      `[garde retrait milieu] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `${String(rapport.anomalies.length)} anomalies`,
    );

    expect(rapport.lignesVerifiees).toBe(TAILLE - 1);
    expect(rapport.valide).toBe(false);
    expect(genres(rapport.anomalies)).toContain("saut-non-ancré");
  });
});

describe("core/audit — une TRONCATURE DE TÊTE casse la vérification aussi", () => {
  it("refuse un journal qui commence sur un chaînon non nul", async () => {
    // ⚠️ LE DÉFAUT MAISON QU'ON NE RECOPIE PAS.
    // `axionia/src/lib/knowledge/audit-log.ts:122` fait
    // `let prev = entries[0]!.prevHash` : il ADOPTE le chaînon de la première
    // ligne qu'on lui présente. Retirer les quatre premières lignes ne casse
    // alors rien — il repart de la cinquième, dont le `prevHash` colle à sa
    // propre lecture, et déclare la chaîne valide. C'est la façon la plus
    // simple d'effacer le début d'une intrusion.
    const store = await construireJournal(TAILLE);
    const intact = store.toutes();
    const premiere = intact[0];
    const derniereRetiree = intact[3];
    if (premiere === undefined || derniereRetiree === undefined) {
      throw new Error("témoin mal fabriqué : moins de quatre lignes");
    }

    store.supprimerIntervalle(premiere.seq, derniereRetiree.seq);
    const restant = store.toutes();

    // 1) Le vérificateur du voisin, reproduit ici À L'IDENTIQUE : il adopte le
    //    chaînon de la première ligne. On PROUVE qu'il ne voit rien.
    const verdictDuVoisin = verificateurDuVoisin(restant);
    console.info(
      `[témoin voisin] ${String(verdictDuVoisin.checked)} lignes « vérifiées », ` +
        `valide = ${String(verdictDuVoisin.valid)}`,
    );
    expect(verdictDuVoisin.valid).toBe(true); // c'est bien le défaut annoncé

    // 2) Le nôtre le voit.
    const rapport = verifierChaine(restant);
    console.info(
      `[garde troncature de tête] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `genres : ${genres(rapport.anomalies).join(", ")}`,
    );

    expect(rapport.lignesVerifiees).toBe(TAILLE - 4);
    expect(rapport.valide).toBe(false);
    expect(genres(rapport.anomalies)).toContain("tête-non-ancrée");
  });
});

/**
 * Le vérificateur du dépôt voisin, reproduit dans sa seule partie qui compte :
 * l'état initial. C'est un TÉMOIN, pas une implémentation — il n'existe que
 * pour prouver que le défaut est réel et que la garde d'à côté le distingue.
 */
function verificateurDuVoisin(lignes: readonly LigneAudit[]): {
  valid: boolean;
  checked: number;
} {
  const premiere = lignes[0];
  if (premiere === undefined) return { valid: true, checked: 0 };
  // La ligne exacte du voisin : `let prev = entries[0]!.prevHash`.
  let prev: string | null = premiere.prevHash;
  let checked = 0;
  for (const ligne of lignes) {
    if (ligne.prevHash !== prev) return { valid: false, checked };
    prev = ligne.selfHash;
    checked += 1;
  }
  return { valid: true, checked };
}

describe("core/audit — une ligne RÉÉCRITE casse la vérification", () => {
  it("recalcule l'empreinte et voit le champ modifié", async () => {
    const store = await construireJournal(TAILLE);
    const reecrit = reecrireSansRecalculer(store.toutes(), 7, { principal: "usurpateur" });

    const rapport = verifierChaine(reecrit);

    console.info(
      `[garde réécriture] ${String(rapport.lignesVerifiees)} lignes vérifiées, ` +
        `genres : ${genres(rapport.anomalies).join(", ")}`,
    );

    expect(rapport.lignesVerifiees).toBe(TAILLE);
    expect(rapport.valide).toBe(false);
    expect(genres(rapport.anomalies)).toContain("empreinte-recalculée");
  });

  it("voit aussi un `recordIds` réordonné — un tableau n'est pas un ensemble", async () => {
    const store = await construireJournal(3);
    const avec = reecrireSansRecalculer(store.toutes(), 0, { recordIds: ["a", "b"] });
    expect(verifierChaine(avec).valide).toBe(false);
  });
});

describe("core/audit — ordonner par `seq`, JAMAIS par `at` (§ 12)", () => {
  it("signale l'ordre non croissant quand on trie sur une horloge qui a reculé", async () => {
    const store = await construireJournal(6);
    const parSeq = store.toutes();

    // Une horloge qui recule : la troisième ligne se croit antérieure à la
    // deuxième. Aucune empreinte n'a bougé — seul l'ordre de lecture change.
    const horlogeCassee: readonly LigneAudit[] = parSeq.map((ligne, rang) =>
      rang === 3 ? { ...ligne, at: new Date(0) } : ligne,
    );

    const parAt = [...horlogeCassee].sort((a, b) => a.at.getTime() - b.at.getTime());
    const rapportParAt = verifierChaine(parAt);

    console.info(
      `[garde ordre] tri par « at » : ${String(rapportParAt.lignesVerifiees)} lignes, ` +
        `genres : ${genres(rapportParAt.anomalies).join(", ")}`,
    );

    expect(rapportParAt.lignesVerifiees).toBe(6);
    expect(rapportParAt.valide).toBe(false);
    expect(genres(rapportParAt.anomalies)).toContain("ordre-non-croissant");

    // Le même journal, lu par `seq`, n'a que l'anomalie du champ `at` réécrit —
    // et surtout aucun désordre.
    const rapportParSeq = verifierChaine(horlogeCassee);
    expect(genres(rapportParSeq.anomalies)).not.toContain("ordre-non-croissant");
  });
});

describe("core/audit — la vérification par tranches", () => {
  it("enchaîne deux tranches et compte chaque ligne une seule fois", async () => {
    const store = await construireJournal(TAILLE);
    const toutes = store.toutes();
    const premiere = toutes.slice(0, 5);
    const seconde = toutes.slice(5);

    const rapportA = verifierChaine(premiere);
    const rapportB = verifierChaine(seconde, { prevHashAttendu: rapportA.derniereEmpreinte });

    const total = rapportA.lignesVerifiees + rapportB.lignesVerifiees;
    console.info(`[garde tranches] ${String(total)} lignes vérifiées en deux tranches`);

    expect(rapportA.valide).toBe(true);
    expect(rapportB.valide).toBe(true);
    expect(total).toBe(TAILLE);
  });

  it("rougit si la seconde tranche est lue avec le mauvais chaînon d'entrée", async () => {
    const store = await construireJournal(TAILLE);
    const seconde = store.toutes().slice(5);

    // Le défaut par défaut : lire une tranche du milieu comme si c'était le
    // début du journal. C'est exactement une troncature de tête.
    const rapport = verifierChaine(seconde);
    expect(rapport.valide).toBe(false);
    expect(genres(rapport.anomalies)).toContain("tête-non-ancrée");
  });
});

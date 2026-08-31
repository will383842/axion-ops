import { describe, expect, it } from "vitest";

import { HorlogeFigee, SCELLEUR_TEMOIN, contenuTemoin } from "./fixtures.js";
import { Journal } from "./journal.js";
import { JournalMemoire, JournalMemoireSansSectionCritique } from "./memoire.js";
import type { JournalStore } from "./ports.js";
import { verifierChaine } from "./verification.js";

/**
 * GARDES — **LA SECTION CRITIQUE DU JOURNAL, TENUE PLUTÔT QUE DÉCLARÉE.**
 *
 * ═══ CE QUE CES GARDES MESURENT ═══
 *
 * `ports.ts` pose l'exigence que le type ne peut pas exprimer : « `dernierSelfHash`
 * puis `ajouter` forment UNE SECTION CRITIQUE. Deux appels concurrents qui
 * liraient le même `prevHash` produiraient deux lignes prétendant toutes deux
 * succéder à la même — l'une des deux étant alors indistinguable d'une insertion
 * frauduleuse. »
 *
 * `core/audit/memoire.ts` DÉCLARAIT tenir cette propriété depuis le lot 1c, et
 * ne la tenait pas. Ces gardes-ci ne lisent pas sa prose : elles font ÉCRIRE
 * deux appels concurrents par `Journal` — le chemin de production, celui qui
 * enchaîne réellement la lecture et l'écriture — et confrontent la chaîne
 * obtenue à `verifierChaine`.
 *
 * ═══ ET ELLES SAVENT DIRE NON ═══
 *
 * ⚠️ CHAQUE RÉGIME POSITIF A SON JUMEAU NÉGATIF, sur le MÊME harnais, à un seul
 *    objet près : {@link JournalMemoireSansSectionCritique}. Sans lui, « la
 *    chaîne reste valide sous concurrence » serait vert pour trois raisons
 *    indiscernables — la section critique tient, ou le vérificateur est cassé,
 *    ou les deux écritures n'ont jamais été concurrentes. Le témoin tranche : le
 *    même harnais, sans la file, FOURCHE.
 *
 * ⚠️ ET LA CONCURRENCE ELLE-MÊME EST MESURÉE, pas supposée.
 *    `ecrituresMisesEnAttente` compte les appelants qui ont réellement dû
 *    attendre. À zéro, une chaîne valide ne prouverait rien : elle dirait que
 *    rien n'a été mis en concurrence.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE HARNAIS — LE MÊME POUR LES DEUX RÉGIMES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Écrit `nombre` lignes SÉQUENTIELLEMENT, pour poser un journal de départ.
 *
 * ⚠️ IL PREND UN `JournalStore`, ET NON UN `JournalMemoire`. C'est ce qui permet
 *    de passer le témoin sans section critique au MÊME harnais : un harnais qui
 *    n'accepterait que le double sain ne pourrait jamais éprouver l'autre.
 */
async function poserDesLignes(store: JournalStore, nombre: number): Promise<void> {
  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
  for (let rang = 0; rang < nombre; rang += 1) {
    await journal.journaliser(contenuTemoin(rang));
  }
}

/**
 * DEUX ÉCRITURES RIGOUREUSEMENT CONCURRENTES, par le chemin de production.
 *
 * ⚠️ DEUX CONTENUS DIFFÉRENTS, ET C'EST NÉCESSAIRE. Deux contenus identiques se
 *    heurteraient à l'unicité de `selfHash` : le témoin serait alors vert pour
 *    une raison qui n'a rien à voir avec la section critique.
 */
async function deuxEcrituresConcurrentes(
  store: JournalStore,
  premier: number,
  second: number,
): Promise<void> {
  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
  await Promise.all([
    journal.journaliser(contenuTemoin(premier)),
    journal.journaliser(contenuTemoin(second)),
  ]);
}

/** Combien de chaînons sont réclamés par PLUSIEURS lignes. Zéro, ou la fourche. */
function chainonsPartages(lignes: readonly { readonly prevHash: string | null }[]): number {
  const parChainon = new Map<string, number>();
  for (const ligne of lignes) {
    const cle = ligne.prevHash ?? "origine";
    parChainon.set(cle, (parChainon.get(cle) ?? 0) + 1);
  }
  return [...parChainon.values()].filter((compte) => compte > 1).length;
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — LA SECTION CRITIQUE TIENT, ET ON MESURE QU'ELLE A MORDU
// ═════════════════════════════════════════════════════════════════════════════

describe("core/audit/memoire — la section critique déclarée est TENUE", () => {
  it("deux écritures CONCURRENTES laissent une chaîne VALIDE, et la file a mordu", async () => {
    const store = new JournalMemoire();
    await poserDesLignes(store, 3);

    await deuxEcrituresConcurrentes(store, 101, 102);

    const lignes = store.toutes();
    const rapport = verifierChaine(SCELLEUR_TEMOIN, lignes);

    console.info(
      `[garde section critique] régime « tient=${String(store.tientLaSectionCritique)} » — ` +
        `${String(lignes.length)} ligne(s) au journal, ` +
        `${String(chainonsPartages(lignes))} chaînon(s) réclamé(s) par plusieurs lignes, ` +
        `${String(rapport.lignesVerifiees)} vérifiée(s), valide=${String(rapport.valide)}, ` +
        `${String(store.reservationsPosees)} réservation(s) posée(s) / ` +
        `${String(store.reservationsConsommees)} consommée(s), ` +
        `${String(store.ecrituresMisesEnAttente)} écriture(s) MISE(S) EN ATTENTE — ` +
        `anomalies : ${rapport.anomalies.map((a) => a.genre).join(", ") || "aucune"}`,
    );

    // LES FAITS. Rien n'est perdu : les deux écritures ont abouti.
    expect(lignes.length, "trois lignes posées, deux ajoutées").toBe(5);
    expect(rapport.lignesVerifiees, "le compte est annoncé, jamais un booléen seul").toBe(5);

    // ⚠️ LA CONCURRENCE A EU LIEU. Sans cette assertion, l'attente ci-dessous
    //    serait verte le jour où les deux écritures cesseraient de se croiser.
    expect(store.ecrituresMisesEnAttente, "au moins un appelant a dû attendre").toBeGreaterThan(0);

    // L'ATTENTE, celle que l'en-tête du fichier écrit depuis le lot 1c.
    expect(chainonsPartages(lignes), "aucune ligne ne réclame le chaînon d'une autre").toBe(0);
    expect(rapport.valide, "la section critique déclarée doit TENIR").toBe(true);
    expect(rapport.anomalies).toEqual([]);
  });

  it("ne fuit AUCUN jeton : autant de réservations rendues que prises", async () => {
    const store = new JournalMemoire();
    await poserDesLignes(store, 4);
    await deuxEcrituresConcurrentes(store, 201, 202);

    console.info(
      `[garde jeton] ${String(store.reservationsPosees)} réservation(s) posée(s), ` +
        `${String(store.reservationsConsommees)} consommée(s), ` +
        `${String(store.toutes().length)} ligne(s) écrite(s)`,
    );

    // Un écart compterait les lectures abandonnées — c'est-à-dire les jetons
    // que plus personne ne rendra, donc l'écriture suivante qui n'arrivera
    // jamais. La borne du fichier est ici MESURÉE, pas seulement écrite.
    expect(store.reservationsPosees, "au moins six passages par la file").toBeGreaterThanOrEqual(6);
    expect(store.reservationsConsommees).toBe(store.reservationsPosees);
  });

  it("SAIT DIRE OUI — deux écritures SÉQUENTIELLES n'attendent pas, et restent valides", async () => {
    const store = new JournalMemoire();
    await poserDesLignes(store, 2);
    const avant = store.ecrituresMisesEnAttente;
    await poserDesLignes(store, 2);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.info(
      `[garde séquentielle] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `valide=${String(rapport.valide)}, ` +
        `${String(store.ecrituresMisesEnAttente - avant)} mise(s) en attente sur la seconde ` +
        `salve — une file qui ferait attendre un appelant SEUL serait un verrou de trop`,
    );

    expect(rapport.valide).toBe(true);
    // ⚠️ SANS CETTE ASSERTION, `ecrituresMisesEnAttente` pourrait compter
    //    n'importe quoi — y compris tous les appels — et la garde G1 serait
    //    verte pour un compteur qui ne mesure pas l'attente.
    expect(store.ecrituresMisesEnAttente - avant, "personne n'attend quand personne ne court").toBe(
      0,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE TÉMOIN — LE MÊME HARNAIS, SANS LA FILE
// ═════════════════════════════════════════════════════════════════════════════

describe("core/audit/memoire — le témoin SANS section critique fait rougir la garde", () => {
  /**
   * ⚠️ CE TÉMOIN EST LE PLANCHER DE LA GARDE G1. Il fabrique le régime d'AVANT
   *    le lot 1d, sur le même harnais, à un seul objet près. S'il devenait vert
   *    — c'est-à-dire si la chaîne restait valide SANS file —, alors G1 serait
   *    verte sans rien mesurer : le harnais ne mettrait plus rien en
   *    concurrence, ou `verifierChaine` ne verrait plus la fourche.
   */
  it("deux écritures concurrentes FOURCHENT la chaîne quand la file est retirée", async () => {
    const store = new JournalMemoireSansSectionCritique();
    await poserDesLignes(store, 3);

    await deuxEcrituresConcurrentes(store, 301, 302);

    const lignes = store.toutes();
    const rapport = verifierChaine(SCELLEUR_TEMOIN, lignes);
    const partages = chainonsPartages(lignes);

    console.info(
      `[témoin sans section critique] régime « tient=${String(store.tientLaSectionCritique)} » — ` +
        `${String(lignes.length)} ligne(s), ${String(partages)} chaînon(s) réclamé(s) par ` +
        `plusieurs lignes, ${String(rapport.lignesVerifiees)} vérifiée(s), ` +
        `valide=${String(rapport.valide)}, ` +
        `anomalies : ${rapport.anomalies.map((a) => a.genre).join(", ") || "aucune"}`,
    );

    // LES FAITS. Les deux écritures aboutissent : c'est le CHAÎNAGE qui a été
    // doublé, rien n'a été perdu.
    expect(lignes.length).toBe(5);
    expect(rapport.lignesVerifiees).toBe(5);
    // LE DÉFAUT, MESURÉ : deux lignes prétendent succéder à la même.
    expect(partages, "deux lignes réclament le même chaînon").toBe(1);
    // ET IL EST VISIBLE — c'est la seule bonne nouvelle : la fourche n'est pas
    // silencieuse, `verifierChaine` la voit.
    expect(rapport.valide).toBe(false);
    expect(rapport.anomalies.map((anomalie) => anomalie.genre)).toContain("saut-non-ancré");
  });

  it("les DEUX doubles sont confrontés, et ils ne déclarent pas le même régime", () => {
    const doubles: readonly { readonly nom: string; readonly store: JournalStore }[] = [
      { nom: "JournalMemoire", store: new JournalMemoire() },
      { nom: "JournalMemoireSansSectionCritique", store: new JournalMemoireSansSectionCritique() },
    ];
    const tiennent = doubles.filter(
      (double) =>
        (double.store as JournalMemoire | JournalMemoireSansSectionCritique).tientLaSectionCritique,
    );

    console.info(
      `[garde régimes] ${String(doubles.length)} double(s) confronté(s) : ` +
        doubles
          .map(
            (double) =>
              `${double.nom}=${String(
                (double.store as JournalMemoire | JournalMemoireSansSectionCritique)
                  .tientLaSectionCritique,
              )}`,
          )
          .join(", ") +
        ` — ${String(tiennent.length)} tient/tiennent la section critique`,
    );

    // Deux régimes, pas un. Un dépôt où les deux déclareraient la même chose
    // n'aurait plus de témoin, et la garde G1 n'aurait plus de plancher.
    expect(doubles.length).toBe(2);
    expect(tiennent.map((double) => double.nom)).toEqual(["JournalMemoire"]);
  });
});

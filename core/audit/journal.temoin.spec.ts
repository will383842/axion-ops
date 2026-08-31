/**
 * TÉMOINS ADVERSAIRES — `core/audit/journal.ts`, l'INVARIANT DE SORTIE (§ 11).
 *
 * « Toute terminaison, Y COMPRIS CHAQUE REFUS, écrit une ligne d'`ops_audit`
 * portant le NUMÉRO de l'étape qui a refusé. Sans cela l'objectif O6 est faux
 * dès le premier jour. »
 *
 * L'invariant est tenu par une INVERSION : le corps ne rend jamais la valeur,
 * c'est `avecJournal` qui la rend. Les témoins ci-dessous cherchent les endroits
 * où l'inversion ne suffit pas — c'est-à-dire les endroits où le journal, LUI,
 * échoue.
 */

import { describe, expect, it } from "vitest";

import { avecJournal, ErreurJournalIndisponible, Journal } from "./journal.js";
import type { EnteteAppel } from "./journal.js";
import { ErreurContenuJournal } from "./contenu.js";
import { SCELLEUR_TEMOIN, HorlogeFigee } from "./fixtures.js";
import { JournalMemoire } from "./memoire.js";
import type { JournalStore } from "./ports.js";
import type { LigneAAjouter, LigneEcrite, Terminaison } from "./vocabulaire.js";
import { APPEL_STEPS } from "../types.js";

const ENTETE: EnteteAppel = {
  principal: "temoin",
  sessionId: "session-1",
  tool: "ops.temoin.lire",
  toolVersion: "1.0.0",
  adapterVersion: "1.0.0",
  effect: "read",
  policyLevel: "brouillon",
  argHash: "a".repeat(64),
};

/** Un store qui échoue à l'écriture — la panne de journal, fabriquée. */
class StoreEnPanne implements JournalStore {
  ajouts = 0;

  dernierSelfHash(): Promise<string | null> {
    return Promise.resolve(null);
  }

  ajouter(_ligne: LigneAAjouter): Promise<LigneEcrite> {
    this.ajouts += 1;
    return Promise.reject(new Error("ops_audit : connexion perdue"));
  }

  lireDepuis(): Promise<readonly never[]> {
    return Promise.resolve([]);
  }
}

describe("TÉMOIN — § 11 : l'invariant de sortie sait-il rougir ?", () => {
  it("écrit UNE ligne pour CHACUNE des quatorze étapes de refus — compte DÉRIVÉ d'APPEL_STEPS", async () => {
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    let refusEprouves = 0;
    for (const etape of APPEL_STEPS) {
      const terminaison: Terminaison<never> = {
        genre: "refus",
        etape: etape.numero,
        code: etape.refus,
      };
      const { ligne } = await avecJournal(journal, ENTETE, () => Promise.resolve(terminaison));
      expect(ligne.seq).toBeGreaterThan(0n);
      refusEprouves += 1;
    }

    const lignes = store.toutes();
    console.log(
      `[témoin § 11 · refus] ${String(refusEprouves)} étape(s) de refus éprouvée(s) sur ` +
        `${String(APPEL_STEPS.length)} déclarée(s), ${String(lignes.length)} ligne(s) écrite(s)`,
    );

    // Le compte est DÉRIVÉ du tableau des étapes : ajouter une quinzième étape
    // sans l'éprouver fait rougir ce témoin.
    expect(refusEprouves).toBe(APPEL_STEPS.length);
    expect(lignes).toHaveLength(APPEL_STEPS.length);
    expect(lignes.map((l) => l.stepDenied)).toEqual(APPEL_STEPS.map((e) => e.numero));
    expect(new Set(lignes.map((l) => l.decision))).toEqual(new Set(["refusé"]));
  });

  it("une EXCEPTION du corps écrit une ligne `interrompu`, PUIS l'exception repart telle quelle", async () => {
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    const panne = new Error("l'amont a coupé");

    await expect(avecJournal(journal, ENTETE, () => Promise.reject(panne))).rejects.toBe(panne);

    const lignes = store.toutes();
    console.log(
      `[témoin § 11 · exception] ${String(lignes.length)} ligne(s) écrite(s), ` +
        `decision « ${String(lignes[0]?.decision)} », outcome « ${String(lignes[0]?.outcome)} »`,
    );

    expect(lignes).toHaveLength(1);
    // Confondre une panne avec un refus falsifierait la métrique du § 24.
    expect(lignes[0]?.decision).toBe("interrompu");
    expect(lignes[0]?.stepDenied).toBeNull();
    expect(lignes[0]?.outcome).toBe("erreur");
  });

  it("REFUSE l'écriture d'une ligne portant du contenu, au lieu d'écrire en avertissant", async () => {
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    await expect(
      avecJournal(journal, ENTETE, () =>
        Promise.resolve({
          genre: "succès",
          valeur: null,
          outcome: "ok",
          recordIds: ["une phrase avec des espaces"],
          partialSources: [],
        } satisfies Terminaison<null>),
      ),
    ).rejects.toBeInstanceOf(ErreurContenuJournal);

    console.log(
      `[témoin § 11 · contenu] ${String(store.toutes().length)} ligne(s) écrite(s) après refus`,
    );
    expect(store.toutes()).toHaveLength(0);
  });

  it("FAIL-CLOSED : une panne du journal fait échouer l'appel, elle n'est jamais avalée", async () => {
    const store = new StoreEnPanne();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    await expect(
      avecJournal(journal, ENTETE, () =>
        Promise.resolve({
          genre: "refus",
          etape: 10,
          code: "policy_denied",
        } satisfies Terminaison<never>),
      ),
    ).rejects.toBeInstanceOf(ErreurJournalIndisponible);

    console.log(
      `[témoin § 11 · panne] ${String(store.ajouts)} tentative(s) d'écriture, toutes en échec — ` +
        "l'appel échoue plutôt que d'être servi sans trace",
    );
    expect(store.ajouts).toBe(1);
  });

  it(
    "DOUBLE PANNE — quand le corps LÈVE et que le journal est en panne, " +
      "la cause première reste lisible dans l'exception remontée",
    async () => {
      // LE DÉFAUT QUE CETTE GARDE REFERME (corrigé au lot 1). `avecJournal`
      // faisait `await ecrire(null); throw erreur;`. Quand `ecrire` lève, le
      // `throw erreur` n'est JAMAIS atteint : l'appelant recevait une panne de
      // journal, et la panne applicative — la seule qui dise ce qui s'est
      // réellement passé — n'apparaissait NULLE PART, ni au journal (aucune
      // ligne n'a pu être écrite) ni dans l'exception remontée.
      //
      // La règle tenue : l'indisponibilité du journal S'AJOUTE à la panne
      // applicative, elle ne la remplace jamais.
      const store = new StoreEnPanne();
      const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
      const causeReelle = new Error("Zoho a rendu 500 sur l'envoi");

      const erreur = await avecJournal(journal, ENTETE, () => Promise.reject(causeReelle)).catch(
        (recue: unknown) => recue,
      );

      // Toutes les erreurs atteignables depuis ce qui est remonté : les
      // membres de l'agrégat, et la chaîne des `cause`.
      const atteignables: unknown[] = [];
      const aVisiter: unknown[] = [erreur];
      for (let garde = 0; garde < 10 && aVisiter.length > 0; garde += 1) {
        const courante = aVisiter.pop();
        if (courante === undefined || atteignables.includes(courante)) continue;
        atteignables.push(courante);
        if (courante instanceof AggregateError) {
          aVisiter.push(...(courante.errors as unknown[]));
        }
        if (courante instanceof Error && courante.cause !== undefined) {
          aVisiter.push(courante.cause);
        }
      }

      console.log(
        `[témoin § 11 · double panne] cause réelle « ${causeReelle.message} » · ` +
          `erreur remontée « ${erreur instanceof Error ? erreur.name : String(erreur)} » · ` +
          `${String(atteignables.length)} erreur(s) atteignable(s) · ` +
          `cause première atteignable=${String(atteignables.includes(causeReelle))} · ` +
          `${String(store.ajouts)} tentative(s) d'écriture`,
      );

      // L'INVARIANT : la panne applicative est atteignable depuis l'exception.
      expect(
        atteignables.includes(causeReelle),
        "la cause première doit rester atteignable : c'est le seul diagnostic qui reste",
      ).toBe(true);
      // Et l'indisponibilité du journal ne se perd pas non plus — les deux
      // pannes se lisent, aucune ne masque l'autre.
      expect(
        atteignables.some((e) => e instanceof ErreurJournalIndisponible),
        "l'indisponibilité du journal doit rester lisible elle aussi",
      ).toBe(true);
      // Une seule tentative d'écriture, et pas une ligne.
      expect(store.ajouts).toBe(1);
    },
  );

  it(
    "🔴 DÉFAUT CONSTATÉ — un effet extérieur DÉJÀ PRODUIT ne laisse AUCUNE trace " +
      "si le journal tombe juste après",
    async () => {
      // Le corps a tourné : à l'étape 14, l'outil a envoyé le courrier. C'est
      // seulement APRÈS que l'écriture du journal échoue. L'appel « échoue »
      // pour l'appelant — mais l'effet, lui, a bien eu lieu, et rien ne
      // l'atteste.
      const store = new StoreEnPanne();
      const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
      let effetProduit = false;

      const erreur = await avecJournal(journal, ENTETE, () => {
        effetProduit = true; // ← le courrier est parti
        return Promise.resolve({
          genre: "succès",
          valeur: { messageId: "m1" },
          outcome: "ok",
          recordIds: ["m1"],
          partialSources: [],
        } satisfies Terminaison<{ messageId: string }>);
      }).catch((recue: unknown) => recue);

      console.log(
        `[témoin § 11 · effet non tracé] effet produit : ${String(effetProduit)}, ` +
          `lignes écrites : 0, erreur remontée « ${erreur instanceof Error ? erreur.name : "?"} »`,
      );

      expect(effetProduit, "l'effet extérieur a bien eu lieu").toBe(true);
      expect(erreur).toBeInstanceOf(ErreurJournalIndisponible);
      // O6 est faux pour cet appel : un envoi réel, zéro ligne. L'inversion de
      // contrôle garantit qu'on PASSE par l'écriture, pas qu'elle RÉUSSISSE.
      expect(store.ajouts).toBe(1);
    },
  );
});

/**
 * TÉMOIN ADVERSAIRE — `ops_audit.argHash` PORTAIT DEUX POPULATIONS.
 *
 * ═══ LE DÉFAUT, TEL QUE LE LOT 1 L'AVAIT ÉCRIT DANS SON PROPRE CODE ═══
 *
 * `journal.ts` portait la note suivante, en toutes lettres :
 *
 *   « 🔴 DETTE ASSUMÉE […] La colonne `ops_audit.argHash` porte donc DEUX
 *     populations : les empreintes brutes (terminaisons avant l'étape 8) et les
 *     empreintes validées (toutes les autres). Elles ne se distinguent par rien
 *     dans la ligne. […] Le `stepDenied` de la ligne permet, en attendant, de
 *     savoir laquelle des deux on lit : `stepDenied < 8` ⇒ empreinte brute. »
 *
 * Deux choses en découlaient, et ce fichier les mesure :
 *
 *  1. deux lignes portant la même colonne disaient deux choses différentes, et
 *     rien dans la ligne ne disait laquelle ;
 *  2. le remède proposé — `stepDenied < 8` — est une INFÉRENCE, pas une donnée.
 *     Elle est FAUSSE pour une terminaison par exception, où `stepDenied` est
 *     nul, donc pas « < 8 » : une empreinte brute s'y lisait comme validée.
 *
 * ═══ CE QUE LE LOT 1b A FAIT ═══
 *
 * `ops_audit.argHashValidated` porte le fait lui-même, et il ENTRE DANS
 * L'EMPREINTE CHAÎNÉE — ce qui n'était possible qu'avant le premier chaînage
 * réel. Les témoins ci-dessous prouvent (a) que les deux populations se
 * séparent maintenant sur la ligne, (b) que l'ancienne inférence était bien
 * fausse sur le chemin de l'exception, et (c) que le nouveau champ n'est pas
 * décoratif : le modifier casse la chaîne.
 */

import { describe, expect, it } from "vitest";

import { calculerSelfHash, CHAMPS_COUVERTS } from "./canonique.js";
import { contenuTemoin, HorlogeFigee, SCELLEUR_TEMOIN } from "./fixtures.js";
// ADR 0014 — la session d'un témoin vient de la fabrique NOMMÉE de
// `core/identite/`, jamais d'un littéral : le type marqué ne l'accepte plus.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import { avecJournal, Journal, type EnteteAppel } from "./journal.js";
import { JournalMemoire } from "./memoire.js";
import { ARG_HASH_NON_LU, ARG_HASH_NON_VALIDE, type Terminaison } from "./vocabulaire.js";
import { enteteAvantIdentification } from "./journal.js";

/** L'empreinte de la charge BRUTE — celle que l'en-tête porte avant l'étape 8. */
const ARG_HASH_BRUT = "b".repeat(64);

/** L'empreinte de la valeur VALIDÉE — celle à laquelle le § 20 lie son jeton. */
const ARG_HASH_VALIDE = "c".repeat(64);

const ENTETE: EnteteAppel = {
  principal: "temoin",
  sessionId: sessionIdDeTemoin(),
  tool: "ops.temoin.lire",
  toolVersion: "1.0.0",
  adapterVersion: "1.0.0",
  effect: "read",
  policyLevel: "brouillon",
  argHash: ARG_HASH_BRUT,
};

function journalNeuf(): { journal: Journal; store: JournalMemoire } {
  const store = new JournalMemoire();
  return { journal: new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee()), store };
}

describe("TÉMOIN — § 12 : les deux populations d'`argHash` se distinguent-elles ?", () => {
  it("SÉPARE les deux populations sur la ligne — refus avant l'étape 8 contre appel abouti", async () => {
    // ── (a) Un refus ANTÉRIEUR à l'étape 8 : l'affineur n'est jamais appelé.
    const avant = journalNeuf();
    const refus: Terminaison<never> = { genre: "refus", etape: 5, code: "policy_denied" };
    await avecJournal(avant.journal, ENTETE, () => Promise.resolve(refus));

    // ── (b) Un appel qui passe l'étape 8 : l'affineur pose l'empreinte validée.
    const apres = journalNeuf();
    await avecJournal(apres.journal, ENTETE, ({ affinerArgHash }) => {
      affinerArgHash(ARG_HASH_VALIDE);
      return Promise.resolve<Terminaison<string>>({
        genre: "succès",
        valeur: "ok",
        outcome: "ok",
        recordIds: [],
        partialSources: [],
      });
    });

    const ligneRefus = avant.store.toutes()[0];
    const ligneSucces = apres.store.toutes()[0];
    if (ligneRefus === undefined || ligneSucces === undefined) {
      throw new Error("témoin mal fabriqué : une ligne manque");
    }

    console.log(
      `[témoin § 12 · deux populations] 2 ligne(s) mesurée(s) — ` +
        `refus étape ${String(ligneRefus.stepDenied)} : argHash ${ligneRefus.argHash.slice(0, 8)}… ` +
        `validé=${String(ligneRefus.argHashValidated)} · ` +
        `succès : argHash ${ligneSucces.argHash.slice(0, 8)}… ` +
        `validé=${String(ligneSucces.argHashValidated)}`,
    );

    // Les empreintes DIFFÈRENT — c'est le fait de départ, et il est mesuré, pas
    // supposé : sans lui, la colonne ne porterait qu'une population et ce
    // témoin n'aurait rien à séparer.
    expect(ligneRefus.argHash).toBe(ARG_HASH_BRUT);
    expect(ligneSucces.argHash).toBe(ARG_HASH_VALIDE);
    expect(ligneRefus.argHash).not.toBe(ligneSucces.argHash);

    // Et la ligne DIT désormais laquelle des deux elle porte.
    expect(ligneRefus.argHashValidated).toBe(false);
    expect(ligneSucces.argHashValidated).toBe(true);
  });

  it(
    "🔴 L'ANCIENNE INFÉRENCE ÉTAIT FAUSSE — `stepDenied < 8` se trompe sur une " +
      "terminaison par EXCEPTION, le nouveau champ ne s'y trompe pas",
    async () => {
      // Le corps LÈVE avant d'avoir affiné : l'empreinte reste BRUTE. Mais la
      // ligne d'une exception ne porte AUCUN numéro d'étape — `stepDenied` est
      // nul, donc l'inférence « stepDenied < 8 » est fausse, et un lecteur du
      // journal aurait pris cette empreinte brute pour une empreinte validée.
      const { journal, store } = journalNeuf();

      await expect(
        avecJournal(journal, ENTETE, () => Promise.reject(new Error("panne du corps"))),
      ).rejects.toThrow("panne du corps");

      const ligne = store.toutes()[0];
      if (ligne === undefined) throw new Error("témoin mal fabriqué : aucune ligne écrite");

      // L'inférence du lot 1, rejouée telle qu'elle était écrite.
      const inference = ligne.stepDenied !== null && ligne.stepDenied < 8;

      console.log(
        `[témoin § 12 · inférence] decision « ${ligne.decision} », stepDenied ` +
          `${String(ligne.stepDenied)} → inférence « brute » = ${String(inference)} ; ` +
          `champ argHashValidated = ${String(ligne.argHashValidated)} ; ` +
          `empreinte réellement brute = ${String(ligne.argHash === ARG_HASH_BRUT)}`,
      );

      expect(ligne.decision).toBe("interrompu");
      // L'empreinte EST brute…
      expect(ligne.argHash).toBe(ARG_HASH_BRUT);
      // …et l'inférence dit le contraire. C'est le défaut, mesuré.
      expect(inference, "l'inférence `stepDenied < 8` se trompe ici").toBe(false);
      // Le champ, lui, dit vrai.
      expect(ligne.argHashValidated).toBe(false);
    },
  );

  it("distingue « pas encore validé » de « jamais lu » — par la VALEUR, pas par un troisième champ", async () => {
    // Étape 1 : le corps JSON-RPC n'a pas été ouvert. `argHashValidated` vaut
    // `false` comme pour une empreinte brute — les deux se séparent par la
    // valeur réservée, qu'aucun HMAC ne produira.
    const { journal, store } = journalNeuf();
    const entete = enteteAvantIdentification("inconnu", sessionIdDeTemoin());
    const refus: Terminaison<never> = { genre: "refus", etape: 1, code: null };

    await avecJournal(journal, entete, () => Promise.resolve(refus));

    const ligne = store.toutes()[0];
    if (ligne === undefined) throw new Error("témoin mal fabriqué : aucune ligne écrite");

    console.log(
      `[témoin § 12 · non lu] argHash réservé = ${String(ligne.argHash === ARG_HASH_NON_LU)}, ` +
        `argHashValidated = ${String(ligne.argHashValidated)}`,
    );

    expect(ligne.argHash).toBe(ARG_HASH_NON_LU);
    expect(ligne.argHashValidated).toBe(ARG_HASH_NON_VALIDE);
  });

  it("le champ ENTRE dans l'empreinte chaînée — le modifier seul casse la chaîne", () => {
    // C'est ce qui justifiait de le poser MAINTENANT plutôt qu'après le premier
    // chaînage réel. Un champ hors empreinte se modifierait après coup sans
    // qu'aucune vérification ne bronche — et c'est précisément ce champ-là qui
    // dit comment lire la colonne voisine.
    const ligne = contenuTemoin(0);
    const bascule = { ...ligne, argHashValidated: !ligne.argHashValidated };

    const avant = calculerSelfHash(SCELLEUR_TEMOIN, null, ligne);
    const apres = calculerSelfHash(SCELLEUR_TEMOIN, null, bascule);

    console.log(
      `[témoin § 12 · empreinte] ${String(CHAMPS_COUVERTS.length)} champ(s) couvert(s), ` +
        `« argHashValidated » couvert = ` +
        `${String((CHAMPS_COUVERTS as readonly string[]).includes("argHashValidated"))} ; ` +
        `${avant.slice(0, 8)}… → ${apres.slice(0, 8)}…`,
    );

    expect(CHAMPS_COUVERTS as readonly string[]).toContain("argHashValidated");
    expect(apres).not.toBe(avant);
  });
});

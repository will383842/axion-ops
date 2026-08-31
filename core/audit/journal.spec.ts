import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../types.js";
import { SCELLEUR_TEMOIN, HorlogeFigee } from "./fixtures.js";
// ADR 0014 — la session d'un témoin vient de la fabrique NOMMÉE de
// `core/identite/`, jamais d'un littéral : le type marqué ne l'accepte plus.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import { sha256Hex } from "./canonique.js";
import type { EnteteAppel } from "./journal.js";
import {
  ErreurJournalIndisponible,
  Journal,
  avecJournal,
  enteteAvantIdentification,
} from "./journal.js";
import { JournalMemoire } from "./memoire.js";
import type { JournalStore } from "./ports.js";
import type { LigneAAjouter, LigneEcrite, Terminaison } from "./vocabulaire.js";
import { ARG_HASH_NON_LU, OUTIL_INCONNU } from "./vocabulaire.js";
import { verifierChaine } from "./verification.js";

/**
 * Gardes de L'INVARIANT DE SORTIE (§ 11).
 *
 *   « Le journal n'est PAS une étape — c'est un invariant de sortie. Toute
 *     terminaison, Y COMPRIS CHAQUE REFUS, écrit une ligne portant le numéro de
 *     l'étape qui a refusé. »
 *
 * La garde ne LISTE PAS les terminaisons : elle les DÉRIVE d'`APPEL_STEPS`.
 * Ajouter une quinzième étape au § 11 élargit donc la garde sans qu'aucune
 * liste ne soit à retoucher — et une étape qui sortirait sans ligne rougirait
 * le jour même où elle est ajoutée.
 */

const ENTETE: EnteteAppel = {
  principal: "temoin-appelant",
  sessionId: sessionIdDeTemoin(),
  tool: "ops.temoin.lire",
  toolVersion: "1.0.0",
  adapterVersion: "1.0.0",
  effect: "read",
  policyLevel: "brouillon",
  argHash: sha256Hex("entete-temoin"),
};

function succes(): Terminaison<string> {
  return { genre: "succès", valeur: "ok", outcome: "ok", recordIds: [], partialSources: [] };
}

describe("core/audit — aucune terminaison ne sort sans ligne (§ 11)", () => {
  it("écrit une ligne pour CHACUN des quatorze refus, avec le numéro de l'étape", async () => {
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    const manquants: string[] = [];
    let terminaisonsEprouvees = 0;
    // Combien de refus tombent APRÈS l'effet extérieur. Le § 11 n'en connaît
    // qu'un ; le compter, plutôt que le supposer, fait rougir cette garde le
    // jour où une seconde étape passerait de l'autre côté de l'adaptateur.
    let apresEffetEprouvees = 0;

    for (const etape of APPEL_STEPS) {
      const avant = store.toutes().length;
      const { terminaison } = await avecJournal(journal, ENTETE, () =>
        Promise.resolve<Terminaison<string>>({
          genre: "refus",
          etape: etape.numero,
          code: etape.refus,
        }),
      );
      const apres = store.toutes();

      terminaisonsEprouvees += 1;
      expect(terminaison.genre).toBe("refus");

      const ecrite = apres[apres.length - 1];
      if (apres.length !== avant + 1 || ecrite === undefined) {
        manquants.push(`étape ${String(etape.numero)} : aucune ligne écrite`);
        continue;
      }
      if (ecrite.stepDenied !== etape.numero) {
        manquants.push(`étape ${String(etape.numero)} : stepDenied = ${String(ecrite.stepDenied)}`);
      }
      // ⚠️ L'`outcome` ATTENDU SE DÉRIVE, IL NE SE SUPPOSE PAS (ADR 0017). La
      //    définition d'`OUTCOMES` borne `non-exécuté` à « refusé AVANT l'étape
      //    14 : rien n'a tourné ». L'étape d'exécution est la seule dont le refus
      //    arrive APRÈS l'appel de l'adaptateur : son `outcome` est `erreur`,
      //    mot que le vocabulaire nommait déjà « incompactable
      //    (`result_too_large`) ». Écrire ici `non-exécuté` pour les quinze
      //    aurait figé dans une garde le défaut que l'ADR referme.
      const outcomeAttendu = etape.cle === "execution" ? "erreur" : "non-exécuté";
      if (etape.cle === "execution") apresEffetEprouvees += 1;
      if (ecrite.decision !== "refusé" || ecrite.outcome !== outcomeAttendu) {
        manquants.push(
          `étape ${String(etape.numero)} : ${ecrite.decision}/${ecrite.outcome} inattendu ` +
            `(attendu refusé/${outcomeAttendu})`,
        );
      }
    }

    // Le succès est la quinzième terminaison possible.
    const avantSucces = store.toutes().length;
    await avecJournal(journal, ENTETE, () => Promise.resolve(succes()));
    terminaisonsEprouvees += 1;
    const lignes = store.toutes();
    const ligneSucces = lignes[lignes.length - 1];
    if (lignes.length !== avantSucces + 1 || ligneSucces === undefined) {
      manquants.push("succès : aucune ligne écrite");
    } else if (ligneSucces.decision !== "autorisé" || ligneSucces.stepDenied !== null) {
      manquants.push("succès : décision ou stepDenied inattendus");
    }

    console.info(
      `[garde invariant] ${String(terminaisonsEprouvees)} terminaisons éprouvées, ` +
        `${String(store.toutes().length)} lignes écrites, ` +
        `${String(apresEffetEprouvees)} refus APRÈS l'effet extérieur (outcome « erreur »)`,
    );

    // Plancher-témoin de la correction de l'ADR 0017 : exactement UNE étape
    // refuse après l'adaptateur. Zéro voudrait dire que la clé « execution » a
    // été renommée dans `APPEL_STEPS` et que la dérivation ne mord plus.
    expect(apresEffetEprouvees).toBe(1);

    // DÉRIVÉ : une terminaison par étape, plus le succès. Le compte n'est pas
    // recopié — il a bougé une fois (étape 0 du § 23, ajoutée au lot 1b,
    // ADR 0005) et un littéral aurait fait rougir cette garde pour la mauvaise
    // raison.
    expect(terminaisonsEprouvees).toBe(APPEL_STEPS.length + 1);
    expect(store.toutes()).toHaveLength(APPEL_STEPS.length + 1);
    // Plancher-témoin : les quatorze étapes du § 11 au minimum, plus le succès.
    // Sans lui, un `APPEL_STEPS` vidé laisserait la dérivation verte sur zéro.
    expect(terminaisonsEprouvees).toBeGreaterThanOrEqual(15);
    expect(manquants).toEqual([]);
  });

  it("rougit sur un témoin fabriqué qui « oublie » de journaliser un refus", async () => {
    // Le contre-exemple : une chaîne d'appel écrite à la main, qui journalise
    // les succès et sort en silence sur un refus. C'est le défaut que
    // `avecJournal` rend structurellement impossible ; on prouve ici que la
    // garde ci-dessus le verrait.
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    const chaineNegligente = async (refuse: boolean): Promise<void> => {
      if (refuse) return; // ← la sortie oubliée
      await avecJournal(journal, ENTETE, () => Promise.resolve(succes()));
    };

    await chaineNegligente(true);
    expect(store.toutes()).toHaveLength(0);

    await chaineNegligente(false);
    expect(store.toutes()).toHaveLength(1);
  });

  it("journalise une EXCEPTION, puis la laisse repartir telle quelle", async () => {
    // Une panne n'est pas un refus. Les confondre falsifierait la métrique du
    // § 24, qui compte les refus pour repérer une injection à demi réussie.
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    const panne = new Error("l'adaptateur a lâché");

    await expect(avecJournal(journal, ENTETE, () => Promise.reject(panne))).rejects.toBe(panne);

    const lignes = store.toutes();
    const ligne = lignes[0];

    console.info(`[garde exception] ${String(lignes.length)} ligne écrite malgré la panne`);

    expect(lignes).toHaveLength(1);
    expect(ligne?.decision).toBe("interrompu");
    expect(ligne?.outcome).toBe("erreur");
    expect(ligne?.stepDenied).toBeNull();
  });

  it("mesure la durée sur l'horloge injectée", async () => {
    const store = new JournalMemoire();
    const horloge = new HorlogeFigee();
    const journal = new Journal(SCELLEUR_TEMOIN, store, horloge);

    await avecJournal(journal, ENTETE, () => {
      horloge.avancer(250);
      return Promise.resolve(succes());
    });

    expect(store.toutes()[0]?.durationMs).toBe(250);
  });

  it("chaîne une ligne par terminaison possible, et la chaîne se vérifie", async () => {
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    for (const etape of APPEL_STEPS) {
      await avecJournal(journal, ENTETE, () =>
        Promise.resolve<Terminaison<string>>({
          genre: "refus",
          etape: etape.numero,
          code: etape.refus,
        }),
      );
    }
    await avecJournal(journal, ENTETE, () => Promise.resolve(succes()));

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());
    console.info(`[garde chaînage d'appels] ${String(rapport.lignesVerifiees)} lignes vérifiées`);

    // DÉRIVÉ d'`APPEL_STEPS`, plus le succès — jamais un littéral.
    expect(rapport.lignesVerifiees).toBe(APPEL_STEPS.length + 1);
    // Plancher-témoin : un journal vide se vérifierait sans anomalie.
    expect(rapport.lignesVerifiees).toBeGreaterThanOrEqual(15);
    expect(rapport.valide).toBe(true);
  });
});

describe("core/audit — un refus AVANT identification s'écrit quand même (§ 11, étapes 1-4)", () => {
  it("écrit une ligne recevable pour chacune des quatre étapes « HTTP seul »", async () => {
    // Ces quatre étapes refusent avant que le corps JSON-RPC n'ait été lu : ni
    // outil, ni version, ni arguments. `ops_audit` les déclare pourtant non
    // nuls. Sans valeurs réservées, ou bien la ligne n'est pas écrite — et O6
    // est faux dès le premier balayage de port — ou bien chaque appelant invente
    // les siennes, et la métrique du § 24 devient illisible.
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    const httpSeul = APPEL_STEPS.filter((etape) => etape.httpSeul);

    for (const etape of httpSeul) {
      await avecJournal(
        journal,
        enteteAvantIdentification("hôte-inconnu", sessionIdDeTemoin()),
        () =>
          Promise.resolve<Terminaison<string>>({
            genre: "refus",
            etape: etape.numero,
            code: etape.refus,
          }),
      );
    }

    const lignes = store.toutes();
    console.info(
      `[garde avant identification] ${String(httpSeul.length)} étapes « HTTP seul » éprouvées, ` +
        `${String(lignes.length)} lignes écrites`,
    );

    // Plancher-témoin : le § 11 en nomme quatre.
    expect(httpSeul).toHaveLength(4);
    expect(lignes).toHaveLength(4);
    expect(lignes.map((ligne) => ligne.tool)).toEqual(Array<string>(4).fill(OUTIL_INCONNU));
    expect(lignes.map((ligne) => ligne.argHash)).toEqual(Array<string>(4).fill(ARG_HASH_NON_LU));
    expect(lignes.map((ligne) => ligne.stepDenied)).toEqual([1, 2, 3, 4]);

    // Et la chaîne tient : ces lignes ne sont pas un régime à part.
    const rapport = verifierChaine(SCELLEUR_TEMOIN, lignes);
    expect(rapport.lignesVerifiees).toBe(4);
    expect(rapport.valide).toBe(true);
  });
});

describe("core/audit — fail-closed : un journal indisponible fait échouer l'appel", () => {
  it("ne rend PAS le résultat quand l'écriture échoue", async () => {
    // Avaler l'erreur de journalisation servirait un appel non tracé sous
    // l'apparence d'un appel normal — exactement le trou que l'objectif O6
    // interdit.
    const storeEnPanne: JournalStore = {
      dernierSelfHash(): Promise<string | null> {
        return Promise.resolve(null);
      },
      ajouter(_ligne: LigneAAjouter): Promise<LigneEcrite> {
        return Promise.reject(new Error("base injoignable"));
      },
      lireDepuis(): Promise<readonly never[]> {
        return Promise.resolve([]);
      },
    };

    const journal = new Journal(SCELLEUR_TEMOIN, storeEnPanne, new HorlogeFigee());
    let corpsExecute = false;

    await expect(
      avecJournal(journal, ENTETE, () => {
        corpsExecute = true;
        return Promise.resolve(succes());
      }),
    ).rejects.toBeInstanceOf(ErreurJournalIndisponible);

    // Le corps a bien tourné : le fail-closed porte sur la RÉPONSE, pas sur
    // l'exécution. C'est ce qu'il faut dire à qui lit le journal ensuite.
    expect(corpsExecute).toBe(true);
  });
});

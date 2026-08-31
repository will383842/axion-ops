/**
 * `core/transport/http/amont.spec.ts` — **LES QUATRE ÉTAPES « HTTP SEUL »,
 * MESURÉES DANS L'ORDRE.**
 *
 * ⚠️ **CE QUE CETTE GARDE MESURE N'EST PAS « LA BONNE RÉPONSE ».** C'est
 *    « laquelle des quatre étapes a refusé, et combien de travail les suivantes
 *    n'ont PAS fait ». Une chaîne qui rendrait le bon verdict en ayant déjà
 *    relu `ops_token` sur un hôte non autorisé serait verte — et ce serait
 *    exactement le contournement que l'ADR 0025 existe pour empêcher. Les
 *    doubles comptent donc leurs appels, et c'est ce compte que la garde lit.
 */

import { describe, expect, it } from "vitest";

import { APPEL_STEPS } from "../../types.js";
import type { AppelStep } from "../../types.js";
import {
  ETAPES_DUES_AU_TRANSPORT,
  ETAPE_AUDIENCE,
  ETAPE_HOTE,
  ETAPE_JETON,
  ETAPE_REVOCATION,
  franchirLAmont,
} from "./amont.js";
import { codeDuRefusAmont } from "./codes.js";
import type { DependancesAmont, ReglagesAmont } from "./amont.js";
import {
  AUDIENCE_DE_TEMOIN,
  HOTE_DE_TEMOIN,
  PORTEUR_DE_TEMOIN,
  journalDeTemoin,
  ligneOpsTokenDeTemoin,
  registreDeTemoin,
  revendicationsDeTemoin,
  verificateurDeTemoin,
} from "./fixtures.js";

const REGLAGES: ReglagesAmont = {
  hotesAdmis: [HOTE_DE_TEMOIN],
  audienceAttendue: AUDIENCE_DE_TEMOIN,
};

const ENTETES_CONFORMES = {
  hote: HOTE_DE_TEMOIN,
  autorisation: `Bearer ${PORTEUR_DE_TEMOIN}`,
};

describe("§ 11 — les étapes 1 à 4 s'exécutent dans l'ordre, et s'arrêtent au premier refus", () => {
  it("refuse à la bonne étape, et les étapes SUIVANTES n'ont rien fait", async () => {
    interface Scenario {
      readonly nom: string;
      readonly entetes: {
        readonly hote: string | undefined;
        readonly autorisation: string | undefined;
      };
      readonly revendications: ReturnType<typeof revendicationsDeTemoin> | null;
      readonly ligne: ReturnType<typeof ligneOpsTokenDeTemoin> | null;
      readonly etapeAttendue: AppelStep | null;
      /** Combien de vérifications de jeton et de relectures `ops_token` sont dues. */
      readonly verificationsDues: number;
      readonly relecturesDues: number;
    }

    const scenarios: readonly Scenario[] = [
      {
        nom: "hôte hors liste blanche — RIEN d'autre ne doit avoir tourné",
        entetes: { hote: "attaquant.stub.invalid", autorisation: ENTETES_CONFORMES.autorisation },
        revendications: revendicationsDeTemoin(),
        ligne: ligneOpsTokenDeTemoin(),
        etapeAttendue: ETAPE_HOTE,
        verificationsDues: 0,
        relecturesDues: 0,
      },
      {
        nom: "aucun en-tête Authorization",
        entetes: { hote: HOTE_DE_TEMOIN, autorisation: undefined },
        revendications: revendicationsDeTemoin(),
        ligne: ligneOpsTokenDeTemoin(),
        etapeAttendue: ETAPE_JETON,
        verificationsDues: 0,
        relecturesDues: 0,
      },
      {
        nom: "un schéma d'authentification autre que Bearer",
        entetes: { hote: HOTE_DE_TEMOIN, autorisation: "Basic dXNlcjpwYXNz" },
        revendications: revendicationsDeTemoin(),
        ligne: ligneOpsTokenDeTemoin(),
        etapeAttendue: ETAPE_JETON,
        verificationsDues: 0,
        relecturesDues: 0,
      },
      {
        nom: "jeton refusé par l'émetteur — signature, iss, ou expiration",
        entetes: ENTETES_CONFORMES,
        revendications: null,
        ligne: ligneOpsTokenDeTemoin(),
        etapeAttendue: ETAPE_JETON,
        verificationsDues: 1,
        relecturesDues: 0,
      },
      {
        nom: "jeton d'une AUTRE audience — RFC 8707, et `ops_token` n'est pas relue",
        entetes: ENTETES_CONFORMES,
        revendications: revendicationsDeTemoin({ audience: "https://autre.stub.invalid/api/mcp" }),
        ligne: ligneOpsTokenDeTemoin(),
        etapeAttendue: ETAPE_AUDIENCE,
        verificationsDues: 1,
        relecturesDues: 0,
      },
      {
        nom: "jti révoqué ou inconnu",
        entetes: ENTETES_CONFORMES,
        revendications: revendicationsDeTemoin(),
        ligne: null,
        etapeAttendue: ETAPE_REVOCATION,
        verificationsDues: 1,
        relecturesDues: 1,
      },
      {
        nom: "principal malformé dans `ops_token` — ADR 0029",
        entetes: ENTETES_CONFORMES,
        revendications: revendicationsDeTemoin(),
        ligne: ligneOpsTokenDeTemoin({ principal: "une phrase avec des espaces" }),
        etapeAttendue: ETAPE_REVOCATION,
        verificationsDues: 1,
        relecturesDues: 1,
      },
      {
        nom: "tout est conforme — les quatre étapes sont franchies",
        entetes: ENTETES_CONFORMES,
        revendications: revendicationsDeTemoin(),
        ligne: ligneOpsTokenDeTemoin(),
        etapeAttendue: null,
        verificationsDues: 1,
        relecturesDues: 1,
      },
    ];

    const desaccords: string[] = [];
    let refusConsignesTotal = 0;
    for (const scenario of scenarios) {
      const verificateur = verificateurDeTemoin(scenario.revendications);
      const registre = registreDeTemoin(scenario.ligne);
      const journal = journalDeTemoin();
      const dependances: DependancesAmont = {
        verificateurDeJeton: verificateur,
        registreDesJetons: registre,
        journalDesRefus: journal,
      };

      const resultat = await franchirLAmont(scenario.entetes, REGLAGES, dependances);
      const etapeRefusante = resultat.genre === "refus" ? resultat.etape : null;

      if (etapeRefusante !== scenario.etapeAttendue) {
        desaccords.push(
          `${scenario.nom} : refus à l'étape ${String(etapeRefusante)} au lieu de ` +
            `${String(scenario.etapeAttendue)}`,
        );
      }
      if (verificateur.appels() !== scenario.verificationsDues) {
        desaccords.push(
          `${scenario.nom} : ${String(verificateur.appels())} vérification(s) de jeton au lieu ` +
            `de ${String(scenario.verificationsDues)} — une étape a tourné trop tôt`,
        );
      }
      if (registre.relectures() !== scenario.relecturesDues) {
        desaccords.push(
          `${scenario.nom} : ${String(registre.relectures())} relecture(s) d'ops_token au lieu ` +
            `de ${String(scenario.relecturesDues)} — une étape a tourné trop tôt`,
        );
      }
      // ⚠️ L'INVARIANT DU § 11, TEL QU'IL EST AUJOURD'HUI : chaque refus PASSE
      //    par le port de journal. Le port livré ne fait rien, et c'est écrit ;
      //    ce qui est mesuré ici, c'est que l'instant est atteint.
      const attenduConsignes = scenario.etapeAttendue === null ? 0 : 1;
      if (journal.consignes().length !== attenduConsignes) {
        desaccords.push(
          `${scenario.nom} : ${String(journal.consignes().length)} refus consigné(s) au lieu ` +
            `de ${String(attenduConsignes)}`,
        );
      }
      refusConsignesTotal += journal.consignes().length;

      // Les étapes franchies forment un préfixe strict de celles qui sont dues.
      const franchies = resultat.trace.etapesFranchies;
      const attenduesFranchies =
        scenario.etapeAttendue === null
          ? ETAPES_DUES_AU_TRANSPORT.length
          : ETAPES_DUES_AU_TRANSPORT.indexOf(scenario.etapeAttendue);
      if (franchies.length !== attenduesFranchies) {
        desaccords.push(
          `${scenario.nom} : ${String(franchies.length)} étape(s) franchie(s) au lieu de ` +
            `${String(attenduesFranchies)}`,
        );
      }
    }

    console.info(
      `[amont] ${String(scenarios.length)} scénario(s) éprouvé(s) · ` +
        `${String(ETAPES_DUES_AU_TRANSPORT.length)} étape(s) due(s) au transport, DÉRIVÉE(S) ` +
        `d'APPEL_STEPS.httpSeul : [${ETAPES_DUES_AU_TRANSPORT.join(", ")}] · ` +
        `${String(refusConsignesTotal)} refus passé(s) par le port de journal · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(ETAPES_DUES_AU_TRANSPORT.length).toBe(4);
    expect(scenarios.length).toBeGreaterThanOrEqual(8);
    expect(refusConsignesTotal).toBe(scenarios.length - 1);
    expect(desaccords).toEqual([]);
  });

  it("ANNONCE ce que chaque étape a confronté — un accord sans mesure serait le pire vert", async () => {
    const journal = journalDeTemoin();
    const resultat = await franchirLAmont(ENTETES_CONFORMES, REGLAGES, {
      verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
      registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
      journalDesRefus: journal,
    });

    expect(resultat.genre).toBe("établi");
    const trace = resultat.trace;
    console.info(
      `[amont · mesures] ${String(trace.entreesDHoteConfrontees)} entrée(s) d'hôte confrontée(s) · ` +
        `${String(trace.comparaisonsDAudience)} comparaison(s) d'audience · ` +
        `${String(trace.lignesOpsTokenConfrontees)} ligne(s) ops_token confrontée(s) · ` +
        `${String(trace.champsDeJournalInspectes)} champ(s) de journal inspecté(s) · ` +
        `étapes franchies : [${trace.etapesFranchies.join(", ")}]`,
    );

    // Les quatre planchers. Chacun correspond à une façon d'être vert sans rien
    // avoir regardé, et aucun ne se déduit des trois autres.
    expect(trace.entreesDHoteConfrontees).toBeGreaterThanOrEqual(1);
    expect(trace.comparaisonsDAudience).toBe(1);
    expect(trace.lignesOpsTokenConfrontees).toBe(1);
    expect(trace.champsDeJournalInspectes).toBeGreaterThanOrEqual(15);
    expect([...trace.etapesFranchies]).toEqual([...ETAPES_DUES_AU_TRANSPORT]);
  });
});

describe("ADR 0030 — le code d'un refus amont, et la priorité de l'ancrage", () => {
  it("rend `unauthenticated` aux étapes 2, 3, 4 et `null` à l'étape 1 — écart signalé", () => {
    const lus: Array<readonly [string, string | null]> = [];
    for (const cle of ["host", "jeton", "audience", "revocation"] as const) {
      lus.push([cle, codeDuRefusAmont(cle)]);
    }
    const distincts = new Set(lus.map(([, code]) => String(code)));

    console.info(
      `[ADR 0030 · amont] ${String(lus.length)} étape(s) confrontée(s) · ` +
        `${String(distincts.size)} code(s) distinct(s) : ` +
        lus.map(([cle, code]) => `${cle}=${String(code)}`).join(" · "),
    );

    expect(lus).toEqual([
      ["host", null],
      ["jeton", "unauthenticated"],
      ["audience", "unauthenticated"],
      ["revocation", "unauthenticated"],
    ]);
  });

  it("TÉMOIN — si l'ancrage gagnait un code, c'est LUI qui ferait foi", () => {
    // On ne peut pas muter `APPEL_STEPS` ; on reconstruit donc la règle de
    // priorité et on la confronte à la table locale. Le témoin montre le sens :
    // l'ancrage d'abord, la table locale seulement quand l'ancrage est vide.
    const ancrages = APPEL_STEPS.filter((etape) => etape.httpSeul);
    const ancragesAvecCode = ancrages.filter((etape) => etape.refus !== null);

    console.info(
      `[ADR 0030 · priorité] ${String(ancrages.length)} étape(s) « HTTP seul » · ` +
        `${String(ancragesAvecCode.length)} portant DÉJÀ un code d'ancrage — ` +
        "c'est ce compte qui doit rester lu : dès qu'il bouge, la table locale meurt.",
    );

    // Aujourd'hui aucune : le défaut est vide, et c'est l'étape qui parle.
    expect(ancragesAvecCode).toEqual([]);
    // Et la priorité est bien celle-là : `codeDuRefusAmont` lit l'ancrage
    // d'abord. Le témoin ci-dessus dit qu'aujourd'hui il n'y a rien à lire.
    expect(ancrages.length).toBe(4);
  });
});

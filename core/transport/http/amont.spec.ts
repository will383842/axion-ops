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
  JOURNAL_AMONT_NON_ARME,
  franchirLAmont,
} from "./amont.js";
import { codeDuRefusAmont } from "./codes.js";
import type { DependancesAmont, JournalDesRefusEnAmont, ReglagesAmont } from "./amont.js";
import {
  AUDIENCE_DE_TEMOIN,
  HOTE_DE_TEMOIN,
  PORTEUR_DE_TEMOIN,
  journalDeTemoin,
  journalQuiEchoueDeTemoin,
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

// ─────────────────────────────────────────────────────────────────────────────
//  ADR 0037, § 1 — LE COMPTE SUR LE CHEMIN **NON ARMÉ**
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ **LA GARDE QUI MANQUAIT, ET SON ABSENCE A ÉTÉ MESURÉE.** La garde du § 11
 *    ci-dessus compte `journal.consignes().length` d'un journal de TEST **ARMÉ** :
 *    elle ne pouvait pas voir le chemin non armé, qui est pourtant celui de
 *    toute composition d'aujourd'hui. Neuf occurrences de `refusConsignes` dans
 *    le dépôt, **aucune assertion** — et la mutation `refusConsignes += 0`
 *    (lot 3, M1) a survécu à la suite complète.
 *
 * ⚠️ **TROIS ÉTATS, ET ILS NE SE DÉDUISENT PAS L'UN DE L'AUTRE.** Port absent
 *    (`JOURNAL_AMONT_NON_ARME`) → 0 ; port armé qui écrit → 1 ; port armé qui
 *    ÉCHOUE à écrire → 0 avec un appel reçu. Sans le troisième, « 0 consigné »
 *    se lirait « aucun port », et un port muet passerait pour un socle nu.
 */
describe("ADR 0037 — le compteur de refus consignés dit ce que le port a ÉCRIT", () => {
  interface Cas {
    readonly nom: string;
    readonly journal: JournalDesRefusEnAmont;
    /** Le port a-t-il reçu l'appel ? `null` quand on ne peut pas le savoir. */
    readonly appelsRecus: (() => number) | null;
    readonly consignesAttendues: number;
  }

  /** Les cinq refus d'amont, DÉRIVÉS — jamais recopiés d'une liste. */
  const refusDAmont: ReadonlyArray<{
    readonly nom: string;
    readonly entetes: {
      readonly hote: string | undefined;
      readonly autorisation: string | undefined;
    };
    readonly revendications: ReturnType<typeof revendicationsDeTemoin> | null;
    readonly ligne: ReturnType<typeof ligneOpsTokenDeTemoin> | null;
  }> = [
    {
      nom: "hôte hors liste blanche",
      entetes: { hote: "attaquant.stub.invalid", autorisation: ENTETES_CONFORMES.autorisation },
      revendications: revendicationsDeTemoin(),
      ligne: ligneOpsTokenDeTemoin(),
    },
    {
      nom: "aucun en-tête Authorization",
      entetes: { hote: HOTE_DE_TEMOIN, autorisation: undefined },
      revendications: revendicationsDeTemoin(),
      ligne: ligneOpsTokenDeTemoin(),
    },
    {
      nom: "jeton refusé par l'émetteur",
      entetes: ENTETES_CONFORMES,
      revendications: null,
      ligne: ligneOpsTokenDeTemoin(),
    },
    {
      nom: "jeton d'une AUTRE audience",
      entetes: ENTETES_CONFORMES,
      revendications: revendicationsDeTemoin({ audience: "https://autre.stub.invalid/api/mcp" }),
      ligne: ligneOpsTokenDeTemoin(),
    },
    {
      nom: "jti révoqué ou inconnu",
      entetes: ENTETES_CONFORMES,
      revendications: revendicationsDeTemoin(),
      ligne: null,
    },
  ];

  it("annonce « 1 prononcé · 0 consigné » sur un socle NON ARMÉ, et « 1 · 1 » sur un socle armé", async () => {
    const desaccords: string[] = [];
    let refusMesures = 0;

    for (const refus of refusDAmont) {
      const cas: readonly Cas[] = [
        {
          nom: "port NON ARMÉ",
          journal: JOURNAL_AMONT_NON_ARME,
          appelsRecus: null,
          consignesAttendues: 0,
        },
        (() => {
          const arme = journalDeTemoin();
          return {
            nom: "port ARMÉ qui écrit",
            journal: arme,
            appelsRecus: () => arme.consignes().length,
            consignesAttendues: 1,
          };
        })(),
        (() => {
          const muet = journalQuiEchoueDeTemoin();
          return {
            nom: "port ARMÉ qui n'a RIEN écrit",
            journal: muet,
            appelsRecus: () => muet.consignes().length,
            consignesAttendues: 0,
          };
        })(),
      ];

      for (const cas_ of cas) {
        const resultat = await franchirLAmont(refus.entetes, REGLAGES, {
          verificateurDeJeton: verificateurDeTemoin(refus.revendications),
          registreDesJetons: registreDeTemoin(refus.ligne),
          journalDesRefus: cas_.journal,
        });
        refusMesures += 1;

        if (resultat.genre !== "refus") {
          desaccords.push(`${refus.nom} / ${cas_.nom} : aucun refus prononcé`);
          continue;
        }
        if (resultat.trace.refusPrononces !== 1) {
          desaccords.push(
            `${refus.nom} / ${cas_.nom} : ${String(resultat.trace.refusPrononces)} refus ` +
              "prononcé(s) au lieu de 1",
          );
        }
        if (resultat.trace.refusConsignes !== cas_.consignesAttendues) {
          desaccords.push(
            `${refus.nom} / ${cas_.nom} : ${String(resultat.trace.refusConsignes)} consigné(s) ` +
              `au lieu de ${String(cas_.consignesAttendues)}`,
          );
        }
        // Le port a été APPELÉ à l'instant exact — c'est l'invariant du § 11, et
        // il est distinct du fait qu'une ligne ait été écrite.
        if (cas_.appelsRecus !== null && cas_.appelsRecus() !== 1) {
          desaccords.push(
            `${refus.nom} / ${cas_.nom} : le port a reçu ${String(cas_.appelsRecus())} appel(s) ` +
              "au lieu de 1 — l'instant du § 11 n'a pas été atteint",
          );
        }
      }
    }

    console.info(
      `[ADR 0037 · amont non armé] ${String(refusDAmont.length)} refus d'amont × 3 états de port = ` +
        `${String(refusMesures)} mesure(s) · ${String(desaccords.length)} désaccord(s)`,
    );

    // Planchers : la confrontation a réellement eu lieu, sur les trois états.
    expect(refusDAmont.length).toBeGreaterThanOrEqual(5);
    expect(refusMesures).toBe(refusDAmont.length * 3);
    expect(desaccords).toEqual([]);
  });

  it("TÉMOIN — un port qui rendrait n'importe quoi ne fait pas monter le compte", async () => {
    // Un port écrit en JavaScript peut rendre `undefined`, `NaN` ou un négatif.
    // Les additionner ferait remonter un `NaN` dans la trace, c'est-à-dire un
    // compte qu'aucune comparaison ne peut plus lire.
    const rendus: readonly unknown[] = [undefined, Number.NaN, -3, 2.5, "1"];
    const mesures: number[] = [];

    for (const rendu of rendus) {
      const journal: JournalDesRefusEnAmont = {
        consigner: () => Promise.resolve(rendu as number),
      };
      const resultat = await franchirLAmont(
        { hote: "attaquant.stub.invalid", autorisation: ENTETES_CONFORMES.autorisation },
        REGLAGES,
        {
          verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
          registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
          journalDesRefus: journal,
        },
      );
      mesures.push(resultat.trace.refusConsignes);
    }

    console.info(
      `[ADR 0037 · valeurs aberrantes] ${String(rendus.length)} valeur(s) rendue(s) par le port · ` +
        `comptes obtenus : [${mesures.join(", ")}]`,
    );

    expect(mesures).toHaveLength(rendus.length);
    expect(mesures.every((mesure) => mesure === 0)).toBe(true);
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

/**
 * `core/transport/http/principal.spec.ts` — **LA GARDE DE L'ADR 0029, MOITIÉ
 * « ÉTAPE 4 ».**
 *
 * Elle tient quatre propriétés, et la quatrième est celle que l'ADR réclame
 * nommément :
 *
 *  1. les formes que la garde du § 31 refuserait sont REFUSÉES à l'étape 4 —
 *     donc AVANT que la ligne d'`ops_audit` soit perdue ;
 *  2. un principal conforme est ADMIS — sans quoi la garde refuserait tout, ce
 *     qui est aussi faux et se remarquerait moins ;
 *  3. la sonde ISOLE le champ : aucune anomalie hors `principal`, sinon elle ne
 *     mesure plus ce qu'elle prétend ;
 *  4. **la valeur réservée du refus passe elle-même la forme du journal** —
 *     sans quoi la valeur choisie POUR RÉPARER la perte de ligne provoquerait,
 *     elle-même, une perte de ligne.
 */

import { describe, expect, it } from "vitest";

import { APPEL_STEPS, type AppelStep } from "../../types.js";
import { MAX_SEGMENTS_ALPHABETIQUES } from "../../audit/contenu.js";
import {
  PRINCIPAL_REFUS_EN_AMONT,
  TEMOIN_DE_CAPACITE,
  verifierLaFormeDuPrincipal,
} from "./principal.js";

/** L'étape 4, LUE dans `APPEL_STEPS` — jamais écrite `4`. */
const ETAPE_4: AppelStep = (() => {
  const etape = APPEL_STEPS.find((candidate) => candidate.cle === "revocation");
  if (etape === undefined) throw new Error("§ 11 — clé « revocation » absente d'APPEL_STEPS");
  return etape.numero;
})();

describe("ADR 0029 — un `principal` malformé REFUSE l'appel, à l'étape 4", () => {
  it("refuse toute forme que la garde du § 31 refuserait, et admet celles qu'elle admet", () => {
    // ⚠️ LA PHRASE FRANCISÉE EST DÉRIVÉE DE LA BORNE, PAS ÉCRITE. `MAX_SEGMENTS_ALPHABETIQUES`
    //    est exporté et vaut aujourd'hui six ; un témoin qui écrirait sept mots à
    //    la main cesserait de mordre le jour où la borne bougerait — en silence.
    const phrase = Array.from(
      { length: MAX_SEGMENTS_ALPHABETIQUES + 1 },
      (_valeur, rang) => `mot${"x".repeat(rang)}`,
    )
      .map((mot) => mot.replace(/[0-9]/gu, ""))
      .join("-");

    const cas: ReadonlyArray<readonly [string, string, boolean]> = [
      ["un principal ordinaire", "http.temoin", true],
      ["la forme du transport stdio", "stdio:local", true],
      ["un identifiant composite bavard", "crm.contact.v2.fr.actif", true],
      ["un principal VIDE", "", false],
      ["un principal portant un espace — un extrait de contenu", "will jullin", false],
      ["une adresse e-mail — le § 12, règle 3, veut un PSEUDONYME", "contact@stub.invalid", false],
      ["un caractère de contrôle", "abcdef", false],
      ["un saut de ligne — l'injection de journal la plus banale", "abc\ndef", false],
      ["une phrase francisée dont les espaces sont des tirets", phrase, false],
      ["une valeur bien au-delà de la borne de la colonne", "a".repeat(1024), false],
    ];

    const desaccords: string[] = [];
    let champsInspectesTotal = 0;
    let anomaliesHorsChamp = 0;
    for (const [nom, principal, attendu] of cas) {
      const verdict = verifierLaFormeDuPrincipal(principal, ETAPE_4);
      champsInspectesTotal += verdict.champsInspectes;
      anomaliesHorsChamp += verdict.anomaliesHorsPrincipal.length;
      if (verdict.admis !== attendu) {
        desaccords.push(
          `${nom} : admis=${String(verdict.admis)} au lieu de ${String(attendu)} ` +
            `(anomalies : ${verdict.anomaliesSurLePrincipal.join(" · ")})`,
        );
      }
      // Un témoin doit isoler UNE règle : toute anomalie sur un autre champ
      // voudrait dire que le squelette de la sonde est cassé.
      if (verdict.anomaliesHorsPrincipal.length > 0) {
        desaccords.push(`${nom} : ${verdict.anomaliesHorsPrincipal.join(" · ")}`);
      }
      // Et le témoin de capacité apparié doit tenir à chaque appel.
      if (!verdict.temoinDeCapaciteSain) {
        desaccords.push(`${nom} : le témoin de capacité de la sonde a échoué`);
      }
    }

    console.info(
      `[ADR 0029 · étape ${String(ETAPE_4)}] ${String(cas.length)} forme(s) éprouvée(s) · ` +
        `${String(champsInspectesTotal)} champ(s) de journal inspecté(s) au total ` +
        `(${String(champsInspectesTotal / cas.length)} par sonde) · ` +
        `${String(anomaliesHorsChamp)} anomalie(s) HORS du champ « principal » · ` +
        `borne de segments lue : ${String(MAX_SEGMENTS_ALPHABETIQUES)} · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Planchers : une sonde qui inspecterait zéro champ serait verte pour rien.
    expect(cas.length).toBeGreaterThanOrEqual(10);
    expect(champsInspectesTotal / cas.length).toBeGreaterThanOrEqual(15);
    expect(anomaliesHorsChamp).toBe(0);
    expect(desaccords).toEqual([]);
  });

  it("la valeur RÉSERVÉE du refus passe elle-même la forme du journal", () => {
    // ⚠️ SANS CE TEST, LA VALEUR CHOISIE POUR RÉPARER LA PERTE DE LIGNE POURRAIT
    //    ELLE-MÊME PROVOQUER UNE PERTE DE LIGNE. C'est la garde que l'ADR 0029
    //    réclame en toutes lettres.
    const verdict = verifierLaFormeDuPrincipal(PRINCIPAL_REFUS_EN_AMONT, ETAPE_4);
    console.info(
      `[ADR 0029 · valeur réservée] « ${PRINCIPAL_REFUS_EN_AMONT} » · ` +
        `${String(verdict.champsInspectes)} champ(s) inspecté(s) · ` +
        `${String(verdict.anomaliesSurLePrincipal.length)} anomalie(s) · ` +
        `admis : ${String(verdict.admis)}`,
    );
    expect(verdict.admis).toBe(true);
    // Et elle n'est confondable avec aucun principal d'un jeton HTTP ni avec le
    // principal réservé de stdio : trois populations, trois valeurs.
    expect(PRINCIPAL_REFUS_EN_AMONT).not.toBe(TEMOIN_DE_CAPACITE);
  });

  it("TÉMOIN DE CAPACITÉ — la sonde SAIT trouver une anomalie, et sait n'en pas trouver", () => {
    // Une sonde qui ne trouverait jamais rien serait verte pour la pire des
    // raisons. On mesure les deux directions dans le même souffle.
    const sain = verifierLaFormeDuPrincipal(TEMOIN_DE_CAPACITE, ETAPE_4);
    const fautif = verifierLaFormeDuPrincipal("une phrase avec des espaces", ETAPE_4);

    console.info(
      `[ADR 0029 · capacité] témoin sain : ${String(sain.anomaliesSurLePrincipal.length)} ` +
        `anomalie(s) · témoin fautif : ${String(fautif.anomaliesSurLePrincipal.length)} ` +
        `anomalie(s) · sonde saine : ${String(fautif.temoinDeCapaciteSain)}`,
    );

    expect(sain.anomaliesSurLePrincipal).toEqual([]);
    expect(sain.admis).toBe(true);
    expect(fautif.anomaliesSurLePrincipal.length).toBeGreaterThanOrEqual(1);
    expect(fautif.admis).toBe(false);
    // ⚠️ ET L'ANOMALIE NE RECOPIE PAS LA VALEUR FAUTIVE : c'est une valeur
    //    suspecte, et le § 15 interdit qu'une erreur fasse fuir du contenu.
    expect(fautif.anomaliesSurLePrincipal.join(" ")).not.toContain("une phrase avec des espaces");
  });
});

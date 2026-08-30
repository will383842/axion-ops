import { describe, expect, it } from "vitest";

import {
  COMMANDE_DE_PROVISION,
  ROUTES_DU_SOCLE,
  ROUTES_SANS_COFFRE,
  decisionDeDemarrage,
  decisionsPourTousLesEtats,
} from "./demarrage.js";
import { ETATS_COFFRE } from "./etat.js";

/**
 * Gardes du démarrage — le défaut bloquant n°12 du CDC, et son correctif.
 *
 * § 32, critère de recette du lot 1, mot pour mot : « le socle refuse de
 * démarrer sans authentification et sans coffre · avec un coffre verrouillé, le
 * healthcheck rend 200 + vaultLocked, console et déverrouillage répondent, tout
 * outil est refusé ».
 *
 * Ce fichier garde la moitié « coffre » de ce critère. Chaque garde parcourt
 * les TROIS états dérivés de `ETATS_COFFRE`, et annonce son compte.
 */

describe("core/vault/demarrage — un seul état refuse le démarrage", () => {
  it("mesure les trois états, et n'en trouve qu'un qui refuse", () => {
    const decisions = decisionsPourTousLesEtats();
    const refusent = decisions.filter((decision) => !decision.demarre);

    console.info(
      `[garde démarrage] ${String(decisions.length)} états mesurés, ` +
        `${String(refusent.length)} refuse(nt) le démarrage`,
    );

    expect(decisions.length).toBe(ETATS_COFFRE.length);
    expect(decisions.length).toBe(3);
    expect(refusent.map((decision) => decision.etat)).toEqual(["absent"]);
  });

  it("COFFRE ABSENT → le démarrage est refusé, et le message nomme la commande", () => {
    const decision = decisionDeDemarrage("absent");

    expect(decision.demarre).toBe(false);
    expect(decision.appelsDOutilsAcceptes).toBe(false);
    expect(decision.routesServies).toEqual([]);
    // Le processus ne vit pas : il n'y a pas de healthcheck à rendre.
    expect(decision.statutHealthcheck).toBeNull();
    // § 25 — « le message nomme la commande ». Sans cette assertion, la phrase
    // du CDC resterait une intention.
    expect(decision.message).toContain(COMMANDE_DE_PROVISION);
    // § 19 — « Ne jamais contourner en désactivant l'authentification. »
    expect(decision.message.toLowerCase()).toContain("authentification");
  });

  it("COFFRE VERROUILLÉ → le socle démarre, 200 + vaultLocked, AUCUN outil", () => {
    const decision = decisionDeDemarrage("verrouillé");

    // Les cinq clauses du § 23, une par assertion. C'est le correctif du défaut
    // qui « rend rouge chaque déploiement » : le repli de W-4 fait démarrer
    // verrouillé À CHAQUE déploiement.
    expect(decision.demarre).toBe(true);
    expect(decision.statutHealthcheck).toBe(200);
    expect(decision.vaultLocked).toBe(true);
    expect(decision.routesServies).toEqual(ROUTES_SANS_COFFRE);
    expect(decision.appelsDOutilsAcceptes).toBe(false);

    // § 21 — la console, le healthcheck et le déverrouillage sont servis SANS
    // le coffre. Vérifié un par un, et non par la longueur de la liste : un
    // compte juste avec la mauvaise route serait vert.
    expect(decision.routesServies).toContain("healthcheck");
    expect(decision.routesServies).toContain("console");
    expect(decision.routesServies).toContain("déverrouillage");
    expect(decision.routesServies).not.toContain("outils");
  });

  it("COFFRE OUVERT → nominal, les quatre routes", () => {
    const decision = decisionDeDemarrage("ouvert");

    expect(decision.demarre).toBe(true);
    expect(decision.statutHealthcheck).toBe(200);
    expect(decision.vaultLocked).toBe(false);
    expect(decision.appelsDOutilsAcceptes).toBe(true);
    expect(decision.routesServies).toEqual(ROUTES_DU_SOCLE);
  });
});

describe("core/vault/demarrage — les invariants, sur les trois états", () => {
  it("dérive `vaultLocked` de l'état, et jamais l'inverse", () => {
    let mesures = 0;
    for (const decision of decisionsPourTousLesEtats()) {
      // L'équivalence, dans les deux sens : `vaultLocked` est vrai si et
      // seulement si l'état n'est pas `ouvert`. Un booléen stocké à part
      // pourrait, lui, se désynchroniser.
      expect(decision.vaultLocked, decision.etat).toBe(decision.etat !== "ouvert");
      mesures += 1;
    }

    console.info(`[garde vaultLocked] ${String(mesures)} états mesurés`);
    expect(mesures).toBe(3);
  });

  it("n'accepte un appel d'outil QUE dans l'état ouvert", () => {
    const acceptent = decisionsPourTousLesEtats().filter(
      (decision) => decision.appelsDOutilsAcceptes,
    );

    console.info(`[garde outils] ${String(acceptent.length)} état(s) acceptent un appel d'outil`);

    expect(acceptent.map((decision) => decision.etat)).toEqual(["ouvert"]);
  });

  it("ne sert la route « outils » que là où les appels sont acceptés", () => {
    let mesures = 0;
    for (const decision of decisionsPourTousLesEtats()) {
      expect(decision.routesServies.includes("outils"), decision.etat).toBe(
        decision.appelsDOutilsAcceptes,
      );
      mesures += 1;
    }

    console.info(`[garde cohérence routes] ${String(mesures)} états mesurés`);
    expect(mesures).toBe(3);
  });

  it("donne à chaque état un message qui dit quoi faire ensuite (§ 15)", () => {
    let mesures = 0;
    for (const decision of decisionsPourTousLesEtats()) {
      expect(decision.message.length, decision.etat).toBeGreaterThan(20);
      mesures += 1;
    }

    console.info(`[garde message] ${String(mesures)} messages mesurés`);
    expect(mesures).toBe(3);
  });

  it("fait démarrer TOUT état qui sert au moins une route, et réciproquement", () => {
    let mesures = 0;
    for (const decision of decisionsPourTousLesEtats()) {
      expect(decision.routesServies.length > 0, decision.etat).toBe(decision.demarre);
      mesures += 1;
    }

    console.info(`[garde routes/démarrage] ${String(mesures)} états mesurés`);
    expect(mesures).toBe(3);
  });
});

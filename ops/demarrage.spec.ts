import { describe, expect, it } from "vitest";

import { ROUTES_DU_SOCLE, decisionDeDemarrage } from "../core/vault/index.js";
import type { ResultatDEtage } from "./demarrage.js";
import {
  CODE_DE_SORTIE_NOMINAL,
  arbitrerLeDemarrage,
  codeDeSortie,
  franchir,
  issueDuRefusDeCoffre,
  refuser,
} from "./demarrage.js";
import { CLES_DES_ETAGES, ETAGES_DU_DEMARRAGE, ISSUES_DE_REFUS } from "./demarrage/etages.js";

/**
 * **ADR 0023 — L'ARBITRE DU DÉMARRAGE, ÉPROUVÉ SUR LES SEPT ÉTAGES.**
 *
 * ═══ CE QUE CES GARDES MESURENT, ET QUE `main.spec.ts` NE MESURE PAS ═══
 *
 * `ops/main.spec.ts` monte un socle et regarde ce qu'il sert. Ici, on ne monte
 * rien : l'arbitre est PUR, on lui donne ce que les étages ont répondu, et on
 * lit ce qu'il en fait. C'est ce qui permet de couvrir **les trois issues et
 * les sept étages** sans ouvrir une connexion — et une garde qu'on ne peut pas
 * exécuter en intégration continue finit désactivée.
 *
 * ⚠️ **AUCUNE LISTE D'ÉTAGES N'EST ÉCRITE DANS CE FICHIER.** Tout est dérivé de
 *    `CLES_DES_ETAGES` et d'`ETAGES_DU_DEMARRAGE`. Un huitième étage ajouté à
 *    l'échelle arrive ici le jour même ; une liste recopiée aurait divergé au
 *    premier ajout, et la divergence aurait été muette.
 */

/**
 * Sept étages rapportés, dérivés de l'échelle. Le coffre porte sa décision.
 *
 * ⚠️ UN COFFRE VERROUILLÉ N'EST PAS « FRANCHI » : il REFUSE, et son refus
 *    AMPUTE. C'est ce que fait la racine, et le distinguer d'un franchissement
 *    est ce qui met la ligne « déverrouiller depuis la console » sur la sortie
 *    d'erreur au lieu de la laisser dans un silence vert.
 */
function septEtages(etatDuCoffre: "ouvert" | "verrouillé" = "ouvert"): ResultatDEtage[] {
  return CLES_DES_ETAGES.map((cle) => {
    if (cle !== "coffre") return franchir(cle, { elementsConfrontes: 1 });
    const decision = decisionDeDemarrage(etatDuCoffre);
    return etatDuCoffre === "ouvert"
      ? franchir(cle, { etatsConfrontes: 1 }, decision)
      : refuser(cle, decision.message, { etatsConfrontes: 1 }, decision);
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  A — LE SOCLE NOMINAL
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0023 · A — les sept étages franchis, le socle sert", () => {
  it("annonce ses comptes, et ne trouve AUCUNE anomalie de séquence", () => {
    const demarrage = arbitrerLeDemarrage(septEtages());

    console.info(
      `[A · nominal] ${String(demarrage.etagesDeclares)} étage(s) déclaré(s) par l'échelle · ` +
        `${String(demarrage.etagesConfrontes)} confronté(s) · ` +
        `${String(demarrage.etagesFranchis)} franchi(s) · sert : ${String(demarrage.sert)} · ` +
        `code de sortie : ${String(demarrage.codeDeSortie)} · ` +
        `${String(demarrage.routesServies.length)} route(s) servie(s) ` +
        `[${demarrage.routesServies.join(", ")}] · ` +
        `${String(demarrage.anomalies.length)} anomalie(s) de séquence · ` +
        `${String(demarrage.lignesDeSortieDErreur.length)} ligne(s) de sortie d'erreur`,
    );

    // Planchers : l'échelle a été LUE, et les sept étages ont RAPPORTÉ.
    expect(demarrage.etagesDeclares).toBe(CLES_DES_ETAGES.length);
    expect(demarrage.etagesConfrontes).toBe(CLES_DES_ETAGES.length);
    expect(demarrage.etagesFranchis).toBe(CLES_DES_ETAGES.length);
    expect(demarrage.sert).toBe(true);
    expect(demarrage.codeDeSortie).toBe(CODE_DE_SORTIE_NOMINAL);
    expect(demarrage.routesServies).toEqual(ROUTES_DU_SOCLE);
    expect(demarrage.appelsDOutilsAcceptes).toBe(true);
    expect(demarrage.vaultLocked).toBe(false);
    expect(demarrage.etatDuCoffre).toBe("ouvert");
    expect(demarrage.anomalies).toEqual([]);
    expect(demarrage.lignesDeSortieDErreur).toEqual([]);
  });

  it("range les comptes de chaque étage, sans en recompter aucun", () => {
    const demarrage = arbitrerLeDemarrage(septEtages());
    const cles = Object.keys(demarrage.comptesParEtage).sort();

    console.info(
      `[A · comptes] ${String(cles.length)} étage(s) ont rapporté des comptes ` +
        `[${cles.join(", ")}] · coffre → ` +
        `${JSON.stringify(demarrage.comptesParEtage["coffre"] ?? {})}`,
    );

    expect(cles.length).toBe(CLES_DES_ETAGES.length);
    expect(demarrage.comptesParEtage["coffre"]?.["etatsConfrontes"]).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  B — LES TROIS ISSUES, ET POURQUOI ELLES SONT TROIS
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0023 · B — trois issues de refus, pas deux", () => {
  it("le COFFRE ABSENT fait SORTIR ; le COFFRE VERROUILLÉ ampute et laisse vivre", () => {
    const absent = arbitrerLeDemarrage([
      franchir("verrou", { implementationsConfrontees: 1 }),
      refuser("coffre", decisionDeDemarrage("absent").message, {}, decisionDeDemarrage("absent")),
    ]);

    const verrouille = arbitrerLeDemarrage(septEtages("verrouillé"));

    console.info(
      `[B · trois issues] ${String(ISSUES_DE_REFUS.length)} issue(s) déclarée(s) · ` +
        `coffre ABSENT → sert : ${String(absent.sert)}, code ${String(absent.codeDeSortie)}, ` +
        `${String(absent.routesServies.length)} route(s) · ` +
        `coffre VERROUILLÉ → sert : ${String(verrouille.sert)}, ` +
        `${String(verrouille.routesServies.length)} route(s) ` +
        `[${verrouille.routesServies.join(", ")}], ` +
        `appels d'outils : ${String(verrouille.appelsDOutilsAcceptes)}`,
    );

    expect(ISSUES_DE_REFUS.length).toBe(3);

    // ── ABSENT : le processus SORT, et le code est le RANG de l'étage ──────
    expect(absent.sert).toBe(false);
    expect(absent.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.coffre.rang);
    expect(absent.routesServies).toEqual([]);
    // FAIL-CLOSED jusque dans le drapeau : un coffre absent n'est pas ouvert.
    expect(absent.vaultLocked).toBe(true);

    // ── VERROUILLÉ : le socle VIT, amputé. C'est le défaut bloquant n° 12 du
    //    § 23 : le réduire à un refus rendrait rouge CHAQUE déploiement.
    expect(verrouille.sert).toBe(true);
    expect(verrouille.vaultLocked).toBe(true);
    expect(verrouille.appelsDOutilsAcceptes).toBe(false);
    // ⚠️ LES ROUTES SONT DÉRIVÉES DE `decisionDeDemarrage`, PAS RECOPIÉES ICI.
    expect(verrouille.routesServies).toEqual(decisionDeDemarrage("verrouillé").routesServies);
    expect(verrouille.routesServies).not.toContain("outils");
    expect(verrouille.routesServies).toContain("déverrouillage");
    // L'amputation est COMPTÉE, et sa ligne part sur la sortie d'erreur : un
    // coffre verrouillé qui démarrerait en silence ne dirait à personne qu'il
    // faut aller le déverrouiller.
    expect(verrouille.amputations.length).toBe(1);
    expect(verrouille.lignesDeSortieDErreur.length).toBe(1);
    expect(verrouille.lignesDeSortieDErreur[0]).toContain("demarrage-ampute");
  });

  /**
   * **L'ÉCART MESURÉ ENTRE L'ÉCHELLE ET LE PROPRIÉTAIRE DE LA DÉCISION.**
   *
   * ⚠️ `ETAGES_DU_DEMARRAGE.coffre.issue` vaut `demarrage-ampute`, et c'est
   *    juste pour UN SEUL des trois états. Son propre `refusQuand` dit que le
   *    refus est prononcé sur un coffre **ABSENT**, cas où le § 23 exige que le
   *    conteneur NE DÉMARRE PAS. Lire l'issue dans l'échelle ferait donc vivre
   *    un socle sans coffre — routes vides, aucun outil, healthcheck 200 —,
   *    c'est-à-dire exactement le « démarrer sans coffre » que le § 32 refuse.
   *
   * L'échelle écrit elle-même la règle qui tranche : « AUCUN CHAMP NE PORTE UNE
   * DÉCISION QUI VIT AILLEURS ». Ce test MESURE l'écart au lieu de le laisser
   * dans une prose, et il rougira si l'échelle est un jour corrigée — auquel cas
   * `issueDuRefusDeCoffre` deviendra une redite qu'il faudra retirer.
   */
  it("MESURE l'écart : l'issue du coffre vient de son propriétaire, pas de l'échelle", () => {
    const etats = ["absent", "verrouillé", "ouvert"] as const;
    const derivees = etats.map((etat) => ({
      etat,
      demarre: decisionDeDemarrage(etat).demarre,
      issue: issueDuRefusDeCoffre(decisionDeDemarrage(etat)),
    }));
    const enEcart = derivees.filter((ligne) => ligne.issue !== ETAGES_DU_DEMARRAGE.coffre.issue);

    console.info(
      `[B · écart] ${String(etats.length)} état(s) du coffre confronté(s) · ` +
        `l'échelle déclare « ${ETAGES_DU_DEMARRAGE.coffre.issue} » pour l'étage 2 · ` +
        derivees.map((l) => `${l.etat} → ${l.issue}`).join(" · ") +
        ` · ${String(enEcart.length)} état(s) EN ÉCART avec l'échelle ` +
        `[${enEcart.map((l) => l.etat).join(", ") || "aucun"}]`,
    );

    // Plancher : les trois états ont été confrontés.
    expect(derivees.length).toBe(3);
    // ⚠️ UN SEUL ÉTAT EST EN ÉCART, ET C'EST LE PLUS GRAVE. `ouvert` s'accorde
    //    avec l'échelle sans que cela signifie quoi que ce soit — un coffre
    //    ouvert ne refuse jamais, donc son issue n'est prononcée nulle part.
    expect(enEcart.map((ligne) => ligne.etat)).toEqual(["absent"]);
    expect(issueDuRefusDeCoffre(decisionDeDemarrage("absent"))).toBe("processus-sort");
    expect(issueDuRefusDeCoffre(decisionDeDemarrage("verrouillé"))).toBe("demarrage-ampute");
  });

  it("un `objet-desactive` ne fait ni sortir ni amputer — il se COMPTE", () => {
    const resultats = septEtages();
    resultats[resultats.length - 1] = refuser("veille", "la veille a vu le verrou non tenu", {
      battements: 1,
    });
    const demarrage = arbitrerLeDemarrage(resultats);

    console.info(
      `[B · objet désactivé] sert : ${String(demarrage.sert)} · ` +
        `code ${String(demarrage.codeDeSortie)} · ` +
        `${String(demarrage.objetsDesactives.length)} objet(s) désactivé(s) · ` +
        `${String(demarrage.amputations.length)} amputation(s) · ` +
        `${String(demarrage.lignesDeSortieDErreur.length)} ligne(s) sur la sortie d'erreur`,
    );

    expect(demarrage.sert).toBe(true);
    expect(demarrage.codeDeSortie).toBe(CODE_DE_SORTIE_NOMINAL);
    expect(demarrage.objetsDesactives.length).toBe(1);
    expect(demarrage.amputations).toEqual([]);
    // Il ne refuse rien — mais il ne se TAIT pas : la ligne est écrite.
    expect(demarrage.lignesDeSortieDErreur.length).toBe(1);
    expect(demarrage.lignesDeSortieDErreur[0]).toContain("veille");
  });

  it("le code de sortie EST le rang de l'étage, pour les quatre étages qui sortent", () => {
    const quiSortent = CLES_DES_ETAGES.filter(
      (cle) => ETAGES_DU_DEMARRAGE[cle].issue === "processus-sort",
    );
    const codes = quiSortent.map((cle) => {
      const etage = ETAGES_DU_DEMARRAGE[cle];
      return codeDeSortie({ cle, rang: etage.rang, issue: etage.issue, message: "témoin" });
    });

    console.info(
      `[B · codes] ${String(quiSortent.length)} étage(s) qui font SORTIR ` +
        `[${quiSortent.join(", ")}] · codes de sortie : ${codes.join(", ")} · ` +
        `${String(new Set(codes).size)} code(s) DISTINCT(s)`,
    );

    // Plancher : la table déclare bien plusieurs étages qui sortent.
    expect(quiSortent.length).toBeGreaterThanOrEqual(4);
    // ⚠️ DISTINCTS : deux étages qui sortiraient sous le même code rendraient
    //    l'exploitation aveugle sur celui des deux qui a refusé.
    expect(new Set(codes).size).toBe(quiSortent.length);
    expect(codes).toEqual(quiSortent.map((cle) => ETAGES_DU_DEMARRAGE[cle].rang));
    // Aucun ne vaut le code nominal : sortir en 0 se lirait « tout va bien ».
    expect(codes).not.toContain(CODE_DE_SORTIE_NOMINAL);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  C — L'ORDRE ET LA TOTALITÉ SONT DES ANOMALIES SÉPARÉES
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0023 · C — l'ordre EST la décision, et la totalité est autre chose", () => {
  it("SAIT DIRE NON — deux étages permutés font une anomalie, même tous présents", () => {
    const resultats = septEtages();
    const permutes = [...resultats];
    const premier = permutes[0];
    const second = permutes[1];
    if (premier !== undefined && second !== undefined) {
      permutes[0] = second;
      permutes[1] = premier;
    }
    const demarrage = arbitrerLeDemarrage(permutes);

    console.info(
      `[C · ordre] ${String(permutes.length)} étage(s) rapportés dans l'ordre ` +
        `[${demarrage.etagesExecutes.join(", ")}] · ` +
        `${String(demarrage.etagesFranchis)} franchi(s) · ` +
        `${String(demarrage.anomalies.length)} anomalie(s) : ${demarrage.anomalies.join(" | ")}`,
    );

    // Tous les étages sont là, tous sont franchis — et pourtant c'est faux :
    // c'est l'ORDRE qui porte la sûreté (verrou avant tout, coffre avant auth).
    expect(demarrage.etagesFranchis).toBe(CLES_DES_ETAGES.length);
    expect(demarrage.anomalies.length).toBe(2);
    expect(demarrage.anomalies.join(" ")).toContain("l'ordre EST la décision");
  });

  it("SAIT DIRE NON — servir après un étage SAUTÉ est une anomalie de totalité", () => {
    const partiels = septEtages().slice(0, 3);
    const demarrage = arbitrerLeDemarrage(partiels);

    console.info(
      `[C · totalité] ${String(demarrage.etagesConfrontes)} étage(s) sur ` +
        `${String(demarrage.etagesDeclares)} · sert : ${String(demarrage.sert)} · ` +
        `${String(demarrage.anomalies.length)} anomalie(s) : ${demarrage.anomalies.join(" | ")}`,
    );

    expect(demarrage.anomalies.length).toBe(1);
    expect(demarrage.anomalies[0]).toContain("étage sauté");
  });

  it("un préfixe interrompu par une SORTIE n'est PAS une anomalie de totalité", () => {
    const demarrage = arbitrerLeDemarrage([
      franchir("verrou", { implementationsConfrontees: 1 }),
      franchir("coffre", { etatsConfrontes: 1 }, decisionDeDemarrage("verrouillé")),
      refuser("authentification", "aucun contrôle câblé", { reglagesConfrontes: 0 }),
    ]);

    console.info(
      `[C · préfixe] ${String(demarrage.etagesConfrontes)} étage(s) rapporté(s) · ` +
        `sert : ${String(demarrage.sert)} · code ${String(demarrage.codeDeSortie)} · ` +
        `${String(demarrage.anomalies.length)} anomalie(s)`,
    );

    // Le contraste avec le test précédent : la séquence s'arrête PARCE QUE le
    // processus sort. Confondre les deux ferait rougir tout refus légitime.
    expect(demarrage.sert).toBe(false);
    expect(demarrage.codeDeSortie).toBe(ETAGES_DU_DEMARRAGE.authentification.rang);
    expect(demarrage.anomalies).toEqual([]);
    // ⚠️ AUCUNE ROUTE N'EST SERVIE : le coffre avait pourtant dit « verrouillé,
    //    trois routes ». Un socle qui sort ne sert rien, y compris ce que
    //    l'étage précédent avait autorisé.
    expect(demarrage.routesServies).toEqual([]);
  });

  it("SAIT DIRE NON — un étage qui choisit lui-même son issue est une anomalie", () => {
    // Un étage `politique` qui prétendrait n'être qu'une amputation : la table
    // lui attribue `processus-sort`, et l'ADR 0023 ne le laisse pas décider.
    const menteur: ResultatDEtage = {
      cle: "politique",
      franchi: false,
      refus: {
        cle: "politique",
        rang: ETAGES_DU_DEMARRAGE.politique.rang,
        issue: "demarrage-ampute",
        message: "témoin fabriqué",
      },
      comptes: {},
      coffre: null,
    };
    const demarrage = arbitrerLeDemarrage([
      franchir("verrou", {}),
      franchir("coffre", {}, decisionDeDemarrage("ouvert")),
      franchir("authentification", {}),
      menteur,
    ]);

    console.info(
      `[C · issue] issue déclarée par l'échelle : ` +
        `« ${ETAGES_DU_DEMARRAGE.politique.issue} » · issue prononcée : ` +
        `« ${menteur.refus?.issue ?? "aucune"} » · ` +
        `${String(demarrage.anomalies.length)} anomalie(s) : ${demarrage.anomalies.join(" | ")}`,
    );

    expect(demarrage.anomalies.length).toBeGreaterThanOrEqual(1);
    expect(demarrage.anomalies.join(" ")).toContain("un étage ne choisit pas ce que son refus");
  });

  it("SAIT DIRE NON — un refus MUET (non franchi, sans refus) est une anomalie", () => {
    const muet: ResultatDEtage = {
      cle: "verrou",
      franchi: false,
      refus: null,
      comptes: {},
      coffre: null,
    };
    const demarrage = arbitrerLeDemarrage([muet]);

    console.info(
      `[C · refus muet] ${String(demarrage.anomalies.length)} anomalie(s) · ` +
        `sert : ${String(demarrage.sert)} · ` +
        `${String(demarrage.lignesDeSortieDErreur.length)} ligne(s) de sortie d'erreur`,
    );

    // ⚠️ IL « SERT » — et c'est précisément pourquoi c'est une anomalie : un
    //    étage qui refuse sans le dire ne fait sortir personne.
    expect(demarrage.anomalies.join(" ")).toContain("refus muet");
  });
});

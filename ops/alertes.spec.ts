import { describe, expect, it } from "vitest";

import type { AlerteEpinglage } from "../core/chaine/etape-06-outil.js";
import {
  ALERTES_DU_SOCLE,
  NIVEAUX_ALERTE,
  alertesDuNiveau,
  ligneDAlerte,
  rangNiveauAlerte,
  verifierTableDAlertes,
  type LigneDAlerteBrute,
} from "./alertes.js";

/**
 * GARDES — LA TABLE D'ALERTES DU SOCLE PORTE L'ÉCART D'ÉPINGLAGE.
 *
 * ⚠️ LA DÉRIVATION EST TENUE PAR LE COMPILATEUR, PAS PAR CES TESTS. La clé et
 *    le niveau de la neuvième ligne sont annotés depuis `AlerteEpinglage` dans
 *    `ops/alertes.ts` : un module émetteur qui renommerait son genre ou
 *    changerait son niveau ferait échouer `pnpm typecheck`. Les gardes
 *    ci-dessous mesurent ce que le compilateur ne voit pas — que la ligne EST
 *    dans la table, à quel niveau, et que le vérificateur sait rougir.
 */

/** Une ligne fabriquée. Les témoins ne touchent jamais la table réelle. */
function ligneTemoin(surcharge: Partial<LigneDAlerteBrute> = {}): LigneDAlerteBrute {
  return {
    cle: "temoin",
    libelle: "événement fabriqué par la garde",
    niveau: "attention",
    source: "§ témoin",
    auTableau24: true,
    motif: "témoin",
    ...surcharge,
  };
}

describe("ops/alertes — le vérificateur sait rougir", () => {
  it("rougit sur un DOUBLON de clé — le routage dépendrait de l'ordre de lecture", () => {
    const verdict = verifierTableDAlertes([
      ligneTemoin({ cle: "meme-cle", niveau: "critique" }),
      ligneTemoin({ cle: "meme-cle", niveau: "aucune" }),
    ]);

    console.info(
      `[garde alertes] témoin doublon — ${String(verdict.lignesMesurees)} ligne(s) mesurée(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.lignesMesurees).toBe(2);
    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("DEUX FOIS");
  });

  it("rougit sur un niveau INVENTÉ — une alerte hors des trois n'est routée nulle part", () => {
    const verdict = verifierTableDAlertes([ligneTemoin({ niveau: "urgent" })]);

    console.info(
      `[garde alertes] témoin niveau inconnu — ${String(verdict.lignesMesurees)} ligne(s), ` +
        `niveaux connus : ${NIVEAUX_ALERTE.join(", ")}`,
    );

    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("urgent");
    // La ligne n'est comptée dans AUCUN niveau : un compte qui l'aurait rangée
    // quelque part cacherait l'anomalie derrière un total juste.
    expect(verdict.parNiveau["critique"]).toBe(0);
    expect(verdict.parNiveau["attention"]).toBe(0);
    expect(verdict.parNiveau["aucune"]).toBe(0);
  });

  it("rougit sur un AJOUT sans motif — un niveau sans motif finit par être abaissé", () => {
    const verdict = verifierTableDAlertes([
      ligneTemoin({ cle: "ajout-muet", auTableau24: false, motif: "   " }),
    ]);

    console.info(
      `[garde alertes] témoin ajout muet — ${String(verdict.ajouts.length)} ajout(s) mesuré(s) ` +
        `(${verdict.ajouts.join(", ")})`,
    );

    expect(verdict.ajouts).toEqual(["ajout-muet"]);
    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("aucun motif");
  });

  it("rougit sur une clé VIDE et sur un libellé vide", () => {
    const verdict = verifierTableDAlertes([ligneTemoin({ cle: "  ", libelle: "" })]);

    console.info(
      `[garde alertes] témoin lignes creuses — ${String(verdict.anomalies.length)} anomalie(s) ` +
        `sur ${String(verdict.lignesMesurees)} ligne(s)`,
    );

    expect(verdict.anomalies).toHaveLength(2);
  });

  it("SAIT DIRE OUI — un témoin sain ne fait rougir personne", () => {
    // Sans ce cas, un vérificateur qui refuserait TOUT serait vert ci-dessus.
    const verdict = verifierTableDAlertes([
      ligneTemoin({ cle: "a", niveau: "critique" }),
      ligneTemoin({ cle: "b", niveau: "aucune" }),
    ]);

    console.info(
      `[garde alertes] témoin sain — ${String(verdict.lignesMesurees)} ligne(s), ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies).toEqual([]);
    expect(verdict.parNiveau["critique"]).toBe(1);
    expect(verdict.parNiveau["aucune"]).toBe(1);
  });
});

describe("ops/alertes — la table RÉELLE du socle, et ses comptes", () => {
  it("porte les HUIT lignes du § 24 plus la neuvième, et les annonce", () => {
    const verdict = verifierTableDAlertes();

    console.info(
      `[garde table § 24] ${String(verdict.lignesMesurees)} ligne(s) mesurée(s) — ` +
        `${String(verdict.lignesDuTableau24)} du tableau du § 24, ` +
        `${String(verdict.ajouts.length)} ajoutée(s) par ce dépôt (${verdict.ajouts.join(", ")}) ; ` +
        NIVEAUX_ALERTE.map(
          (niveau) => `${niveau} : ${String(verdict.parNiveau[niveau] ?? 0)}`,
        ).join(" · "),
    );

    expect(verdict.anomalies).toEqual([]);
    // Le document en compte HUIT — plusieurs gardes de ce dépôt s'appuient sur
    // ce nombre. Il est écrit ici pour qu'une ligne perdue se voie.
    expect(verdict.lignesDuTableau24).toBe(8);
    expect(verdict.lignesMesurees).toBe(ALERTES_DU_SOCLE.length);
    // Dérivé : le total, jamais recompté à la main.
    expect(verdict.lignesMesurees).toBe(verdict.lignesDuTableau24 + verdict.ajouts.length);
  });

  it("PORTE L'ÉCART D'ÉPINGLAGE — la ligne que le § 24 n'a pas", () => {
    // C'est le point du lot : le § 20 prescrit nommément d'alerter, le § 24
    // n'énumère pas l'événement, et une alerte sans niveau n'est routée nulle
    // part. La ligne existe désormais, et elle se déclare comme un AJOUT.
    const ligne = ligneDAlerte("écart-épinglage");

    console.info(
      `[garde épinglage] ligne « ${String(ligne?.cle)} » trouvée, niveau ` +
        `« ${String(ligne?.niveau)} », au tableau du § 24 : ${String(ligne?.auTableau24)}`,
    );

    expect(ligne).toBeDefined();
    expect(ligne?.niveau).toBe("critique");
    expect(ligne?.auTableau24).toBe(false);
    // Le motif porte la comparaison qui a fixé le niveau. Sans elle, personne
    // ne saura pourquoi `critique` plutôt qu'`attention`.
    expect(ligne?.motif).toContain("journal en échec");
    expect(ligne?.source).toContain("§ 20");
  });

  it("fait DÉRIVER la neuvième ligne du module qui émet l'alerte", () => {
    // Garde de compilation, doublée d'une mesure : la valeur ci-dessous est
    // typée par le littéral du module émetteur. Si `AlerteEpinglage` changeait
    // son `genre` ou son `niveau`, cette ligne ne compilerait plus — et c'est
    // le seul moyen d'éviter deux sources de vérité qui divergent en silence.
    const genreDuModule: AlerteEpinglage["genre"] = "écart-épinglage";
    const niveauDuModule: AlerteEpinglage["niveau"] = "critique";

    const ligne = ligneDAlerte(genreDuModule);

    console.info(
      `[garde dérivation] genre du module « ${genreDuModule} », niveau « ${niveauDuModule} » — ` +
        `${String(ALERTES_DU_SOCLE.length)} ligne(s) confrontée(s)`,
    );

    expect(ligne).toBeDefined();
    expect(ligne?.cle).toBe(genreDuModule);
    expect(ligne?.niveau).toBe(niveauDuModule);
  });

  it("range l'écart d'épinglage au même niveau que la chaîne du journal rompue", () => {
    // Le VOISINAGE est le motif écrit du niveau : les deux disent qu'une valeur
    // qui fait foi ne correspond plus à ce qu'on reçoit. Si l'un des deux
    // bougeait sans l'autre, le motif deviendrait faux — et cette garde le dit.
    const critiques = alertesDuNiveau("critique");

    console.info(
      `[garde voisinage] ${String(critiques.length)} ligne(s) au niveau « critique » : ` +
        critiques.join(", "),
    );

    expect(critiques).toContain("écart-épinglage");
    expect(critiques).toContain("chaine-journal-rompue");
    expect(rangNiveauAlerte("critique")).toBeLessThan(rangNiveauAlerte("attention"));
    expect(rangNiveauAlerte("attention")).toBeLessThan(rangNiveauAlerte("aucune"));
  });

  it("garde « refus de politique isolé » à `aucune` — décidé, pas oublié", () => {
    // Le § 15 pose qu'un refus de politique est une RÉPONSE NORMALE. La ligne
    // reste dans la table pour que « on a décidé de ne pas alerter » ne se
    // confonde jamais avec « personne n'y a pensé ».
    const isole = ligneDAlerte("refus-politique-isole");
    const rafale = ligneDAlerte("refus-en-rafale");

    console.info(
      `[garde refus] isolé : « ${String(isole?.niveau)} » · en rafale : ` +
        `« ${String(rafale?.niveau)} »`,
    );

    expect(isole?.niveau).toBe("aucune");
    expect(rafale?.niveau).toBe("attention");
    // Les deux portent sur le même fait brut : c'est la FENÊTRE qui les sépare.
    expect(rangNiveauAlerte(rafale?.niveau ?? "aucune")).toBeLessThan(
      rangNiveauAlerte(isole?.niveau ?? "aucune"),
    );
  });
});

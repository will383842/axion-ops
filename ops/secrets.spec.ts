import { describe, expect, it } from "vitest";

import { SECRETS_REQUIS, secretPresent, verifierSecrets, type ExigenceSecret } from "./secrets.js";

/**
 * GARDES — UN SECRET ABSENT FAIT ÉCHOUER L'ÉTAPE.
 *
 * ⚠️ `SECRETS_REQUIS` EST VIDE AUJOURD'HUI, ET UNE GARDE QUI NE MESURERAIT
 *    QU'ELLE SERAIT VERTE SANS RIEN PROUVER. Toutes les gardes ci-dessous
 *    éprouvent donc la mécanique sur des exigences FABRIQUÉES, et la dernière
 *    seule confronte la liste réelle — en ANNONÇANT qu'elle est vide plutôt
 *    qu'en le taisant.
 */

const EXIGENCE: ExigenceSecret = {
  nom: "TEMOIN_JETON",
  pourquoi: "témoin fabriqué — aucun secret réel n'entre dans ce dépôt",
};

describe("ops/secrets — les trois formes d'un secret ABSENT", () => {
  it("rougit sur les trois : non exposé, chaîne vide, espaces seuls", () => {
    // Les trois arrivent, et la deuxième est la plus dangereuse : GitHub
    // Actions substitue une CHAÎNE VIDE à un secret inconnu — c'est le cas du
    // nom mal orthographié, celui qui ne se voit nulle part.
    const cas: ReadonlyArray<readonly [string, string | undefined]> = [
      ["non exposé", undefined],
      ["chaîne vide", ""],
      ["espaces seuls", "   \n"],
    ];

    let mesures = 0;
    for (const [nom, valeur] of cas) {
      const verdict = verifierSecrets([EXIGENCE], { TEMOIN_JETON: valeur });
      expect(secretPresent(valeur), nom).toBe(false);
      expect(verdict.manquants, nom).toEqual([EXIGENCE.nom]);
      expect(verdict.anomalies.length, nom).toBe(1);
      mesures += 1;
    }

    console.info(`[garde secrets] ${String(mesures)} forme(s) d'absence mesurée(s)`);
    expect(mesures).toBe(cas.length);
  });

  it("SAIT DIRE OUI — un secret réellement présent ne fait rougir personne", () => {
    // Sans ce cas, un vérificateur qui refuserait TOUT serait vert ci-dessus.
    const verdict = verifierSecrets([EXIGENCE], { TEMOIN_JETON: "valeur-de-temoin" });

    console.info(
      `[garde secrets] ${String(verdict.exigencesMesurees)} exigence(s) confrontée(s), ` +
        `${String(verdict.manquants.length)} manquante(s)`,
    );

    expect(verdict.exigencesMesurees).toBe(1);
    expect(verdict.manquants).toEqual([]);
    expect(verdict.anomalies).toEqual([]);
  });

  it("ne recopie AUCUNE valeur dans ses messages — la sortie de chaîne est publique", () => {
    // § 29 : le dépôt est public, et la sortie d'une exécution l'est aussi. Une
    // erreur qui recopierait la valeur fautive serait le pire endroit possible
    // pour une fuite — et c'est un geste que personne ne relit.
    const secret = "valeur-qui-ne-doit-jamais-sortir";
    const verdict = verifierSecrets([{ nom: "TEMOIN_JETON", pourquoi: secret.toUpperCase() }], {
      TEMOIN_JETON: "  ",
    });

    const tout = verdict.anomalies.join(" ");
    console.info(`[garde secrets] message rendu : ${tout.slice(0, 80)}…`);

    expect(tout).toContain("TEMOIN_JETON");
    // La valeur du secret n'apparaît nulle part. On l'éprouve sur la valeur
    // RÉELLE de l'environnement, pas sur la prose de l'exigence.
    expect(tout).not.toContain("  ");
  });

  it("annonce SON PROPRE COMPTE, et il est ZÉRO — écrit, jamais tu", () => {
    const verdict = verifierSecrets();

    console.info(
      `[garde secrets réels] ${String(SECRETS_REQUIS.length)} exigence(s) déclarée(s) dans ` +
        `\`ops/secrets.ts\`, ${String(verdict.exigencesMesurees)} confrontée(s)`,
    );

    // Le compte est dérivé de la liste, jamais supposé : le jour où un secret
    // s'y ajoute, cette garde le voit sans être retouchée.
    expect(verdict.exigencesMesurees).toBe(SECRETS_REQUIS.length);
    expect(verdict.anomalies).toEqual([]);
  });
});

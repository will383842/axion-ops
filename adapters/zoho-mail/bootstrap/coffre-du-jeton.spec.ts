import { describe, expect, it } from "vitest";

import { estErreurDeCoffre } from "../../../core/vault/erreurs.js";
import {
  NOM_DE_L_ANCRE,
  NOM_DU_REFRESH_TOKEN,
  PLAFOND_PRESUME,
  VARIABLE_PLAFOND,
  VERSION_DE_L_ANCRE,
  avertissementDeSecondAmorcage,
  compterCetAmorcage,
  constaterLAmorcage,
  deposerLeJeton,
  plafondEnVigueur,
} from "./coffre-du-jeton.js";
import { coffreOuvert } from "./fixtures.js";

/**
 * **GARDES DU COMPTEUR ET DU DÉPÔT.**
 *
 * ⚠️ **AUCUN RÉSEAU, AUCUN SECRET RÉEL.** Le coffre est monté sur un dépôt en
 *    mémoire, avec une clé de trente-deux octets constants.
 *
 * ⚠️ **LA PROPRIÉTÉ CENTRALE EST CONTRE-INTUITIVE, ET ELLE EST MESURÉE
 *    ICI :** le compteur vit sur une ANCRE à version FIXE, pendant que le jeton
 *    va en version NEUVE à chaque amorçage. Un compteur posé sur la ligne du
 *    jeton repartirait de zéro à chaque fois — et le plafond ne mordrait jamais.
 */

describe("le plafond en vigueur dit d'où il vient", () => {
  it("rend le présumé par défaut, l'environnement quand il est posé, et signale l'illisible", () => {
    const cas: readonly {
      readonly nom: string;
      readonly env: Record<string, string | undefined>;
      readonly valeur: number;
      readonly origine: string;
      readonly anomalie: boolean;
    }[] = [
      { nom: "absent", env: {}, valeur: PLAFOND_PRESUME, origine: "présumé", anomalie: false },
      {
        nom: "vide",
        env: { [VARIABLE_PLAFOND]: "  " },
        valeur: PLAFOND_PRESUME,
        origine: "présumé",
        anomalie: false,
      },
      {
        nom: "posé",
        env: { [VARIABLE_PLAFOND]: "3" },
        valeur: 3,
        origine: "posé par l'environnement",
        anomalie: false,
      },
      {
        nom: "illisible",
        env: { [VARIABLE_PLAFOND]: "beaucoup" },
        valeur: PLAFOND_PRESUME,
        origine: "présumé",
        anomalie: true,
      },
      {
        nom: "zéro",
        env: { [VARIABLE_PLAFOND]: "0" },
        valeur: PLAFOND_PRESUME,
        origine: "présumé",
        anomalie: true,
      },
    ];

    for (const item of cas) {
      const lu = plafondEnVigueur(item.env);
      expect(lu.valeur, `cas « ${item.nom} »`).toBe(item.valeur);
      expect(lu.origine, `cas « ${item.nom} »`).toBe(item.origine);
      expect(lu.anomalie !== null, `cas « ${item.nom} »`).toBe(item.anomalie);
    }
    console.info(
      `[plafond] ${String(cas.length)} cas mesuré(s) · présumé = ${String(PLAFOND_PRESUME)} · ` +
        `variable = ${VARIABLE_PLAFOND}`,
    );
    // Le présumé est BAS volontairement : le mur doit arriver avant celui de Zoho.
    expect(PLAFOND_PRESUME).toBeGreaterThanOrEqual(1);
  });
});

describe("l'ancre compte, le jeton se versionne — et c'est le point de tout le fichier", () => {
  it("pose l'ancre au premier amorçage, et le compte est un MAJORANT dès celui-là", async () => {
    const { coffre, versions } = await coffreOuvert(5);

    const avant = await constaterLAmorcage(coffre, versions);
    expect(avant.ancrePosee).toBe(false);
    expect(avant.compte).toBe(0);
    expect(avant.derniereVersionDuJeton).toBe(null);

    const compteur = await compterCetAmorcage(coffre, avant);
    console.info(
      `[ancre] premier amorçage · ancre « ${NOM_DE_L_ANCRE} » v${String(VERSION_DE_L_ANCRE)} ` +
        `posée · compte ${String(compteur.compte)} · plafond ${String(compteur.plafond ?? -1)} · ` +
        `reste ${String(compteur.reste ?? -1)}`,
    );

    // ⚠️ LE COMPTE EXISTE AVANT QU'AUCUN JETON N'AIT ÉTÉ ÉMIS. C'est ce qui en
    //    fait un majorant : un incident après l'échange ne peut pas le faire
    //    sous-estimer.
    expect(compteur.compte).toBe(1);
    expect(compteur.plafond).toBe(5);
    expect(compteur.reste).toBe(4);

    const apres = await constaterLAmorcage(coffre, versions);
    expect(apres.ancrePosee).toBe(true);
    expect(apres.compte).toBe(1);
  });

  it("SAIT rougir : le compteur ne repart PAS de zéro quand le jeton change de version", async () => {
    const { coffre, versions } = await coffreOuvert(5);

    const versionsVues: number[] = [];
    let compte = 0;
    for (let tour = 1; tour <= 3; tour += 1) {
      const etat = await constaterLAmorcage(coffre, versions);
      compte = (await compterCetAmorcage(coffre, etat)).compte;
      const depot = await deposerLeJeton(coffre, versions, `jeton-invente-du-tour-${String(tour)}`);
      versionsVues.push(depot.version);
    }

    console.info(
      `[ancre] 3 amorçages · versions de jeton [${versionsVues.join(", ")}] · ` +
        `compte final ${String(compte)}`,
    );

    // Le jeton se versionne…
    expect(versionsVues).toEqual([1, 2, 3]);
    // …et le compteur, lui, CUMULE. C'est l'assertion que casserait un compteur
    // posé sur la ligne du jeton : il rendrait 1, trois fois de suite.
    expect(compte).toBe(3);
    expect((await constaterLAmorcage(coffre, versions)).compte).toBe(3);
  });

  it("le dépôt CONSERVE la version précédente — § 12, la fenêtre de propagation", async () => {
    const { coffre, versions } = await coffreOuvert(null);
    await deposerLeJeton(coffre, versions, "jeton-de-la-v1");
    const second = await deposerLeJeton(coffre, versions, "jeton-de-la-v2");

    expect(second.version).toBe(2);
    expect(second.versionPrecedente).toBe(1);

    // Les DEUX lignes s'ouvrent : l'ancienne n'a pas été écrasée.
    const v1 = (await coffre.lire(NOM_DU_REFRESH_TOKEN, 1)).toString("utf8");
    const v2 = (await coffre.lire(NOM_DU_REFRESH_TOKEN, 2)).toString("utf8");
    console.info(
      `[dépôt] v1 lisible (${String(v1.length)} car.) · v2 lisible (${String(v2.length)} car.) · ` +
        `version implicite = ${(await coffre.lire(NOM_DU_REFRESH_TOKEN)).toString("utf8")}`,
    );
    expect(v1).toBe("jeton-de-la-v1");
    expect(v2).toBe("jeton-de-la-v2");
    // Sans version, le coffre rend la PLUS HAUTE : c'est celle que l'adaptateur lira.
    expect((await coffre.lire(NOM_DU_REFRESH_TOKEN)).toString("utf8")).toBe("jeton-de-la-v2");
  });
});

describe("le plafond refuse par l'ÉCRITURE, et le refus nomme le compte", () => {
  it("SAIT rougir : le troisième amorçage est refusé sur un plafond de 2", async () => {
    const { coffre, versions } = await coffreOuvert(2);

    for (let tour = 1; tour <= 2; tour += 1) {
      const etat = await constaterLAmorcage(coffre, versions);
      await compterCetAmorcage(coffre, etat);
    }

    const etat = await constaterLAmorcage(coffre, versions);
    expect(etat.compte).toBe(2);

    let leve: unknown = null;
    try {
      await compterCetAmorcage(coffre, etat);
    } catch (erreur: unknown) {
      leve = erreur;
    }

    expect(estErreurDeCoffre(leve)).toBe(true);
    if (!estErreurDeCoffre(leve)) return;
    console.info(
      `[plafond] plafond 2 · 2 amorçages comptés · 3ᵉ → « ${leve.raison} » · ` +
        `message de ${String(leve.message.length)} caractère(s)`,
    );
    expect(leve.raison).toBe("plafond_bootstrap");
    // Le message NOMME le compte et le plafond : un mur qu'on ne compte pas est
    // un mur qu'on découvre en le percutant (§ 27).
    expect(leve.message).toContain("2");
    // Et le compteur n'a PAS bougé : le refus vient de l'écriture conditionnelle.
    expect((await constaterLAmorcage(coffre, versions)).compte).toBe(2);
  });

  it("TÉMOIN DE CONTRASTE : sans plafond, le troisième passe", async () => {
    const { coffre, versions } = await coffreOuvert(null);
    let compte = 0;
    for (let tour = 1; tour <= 3; tour += 1) {
      const etat = await constaterLAmorcage(coffre, versions);
      compte = (await compterCetAmorcage(coffre, etat)).compte;
    }
    console.info(`[plafond] témoin de contraste : sans plafond, compte = ${String(compte)}.`);
    expect(compte).toBe(3);
  });
});

describe("un second amorçage sur un coffre déjà pourvu AVERTIT, avec le compte", () => {
  it("se tait au premier, et parle ensuite en nommant le compte et le reste", async () => {
    const { coffre, versions } = await coffreOuvert(4);
    const plafond = plafondEnVigueur({ [VARIABLE_PLAFOND]: "4" });

    // Premier amorçage : rien à avertir. Un avertissement permanent ne s'entend plus.
    const vierge = await constaterLAmorcage(coffre, versions);
    expect(avertissementDeSecondAmorcage(vierge, plafond)).toBe(null);

    await compterCetAmorcage(coffre, vierge);
    await deposerLeJeton(coffre, versions, "jeton-du-premier-amorcage");

    const pourvu = await constaterLAmorcage(coffre, versions);
    const avertissement = avertissementDeSecondAmorcage(pourvu, plafond);
    expect(avertissement).not.toBe(null);
    if (avertissement === null) return;

    const texte = avertissement.join(" ");
    console.info(
      `[avertissement] ${String(avertissement.length)} ligne(s) · compte ${String(pourvu.compte)} · ` +
        `version de jeton ${String(pourvu.derniereVersionDuJeton ?? -1)}`,
    );
    expect(texte).toContain("DÉJÀ POURVU");
    expect(texte).toContain("1"); // le compte
    expect(texte).toContain("4"); // le plafond
    expect(texte).toContain("TRANSFÉRER");
  });

  it("distingue l'ancre SANS jeton — un amorçage interrompu entre le compte et le dépôt", async () => {
    const { coffre, versions } = await coffreOuvert(4);
    const etat = await constaterLAmorcage(coffre, versions);
    await compterCetAmorcage(coffre, etat);
    // Aucun dépôt : le processus est mort entre les deux.

    const interrompu = await constaterLAmorcage(coffre, versions);
    const avertissement = avertissementDeSecondAmorcage(
      interrompu,
      plafondEnVigueur({ [VARIABLE_PLAFOND]: "4" }),
    );
    expect(avertissement).not.toBe(null);
    if (avertissement === null) return;
    console.info(`[avertissement] ancre sans jeton → ${String(avertissement.length)} ligne(s).`);
    expect(avertissement.join(" ")).toContain("aucun jeton déposé");
  });
});

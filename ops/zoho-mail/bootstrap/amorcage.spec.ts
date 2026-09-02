import { describe, expect, it } from "vitest";

import { URI_DE_REDIRECTION_LOCALE } from "./autorisation.js";
import { REFUS_D_AMORCAGE, amorcer } from "./amorcage.js";
import type { MondeDAmorcage, RapportDAmorcage } from "./amorcage.js";
import { NOM_DU_REFRESH_TOKEN, VARIABLE_PLAFOND, constaterLAmorcage } from "./coffre-du-jeton.js";
import {
  JETONS_INVENTES,
  boiteDeGarde,
  coffreOuvert,
  coffreVerrouille,
  echangeurDeGarde,
  envDeGarde,
  mandatDeGarde,
} from "./fixtures.js";
import { ErreurDEchange } from "./jetons.js";
import type { EchangeurCompte } from "./fixtures.js";

/**
 * **GARDES DU GESTE ENTIER.**
 *
 * ⚠️ **AUCUN RÉSEAU, AUCUN PORT.** L'échangeur et la boîte aux lettres sont
 *    injectés. L'échangeur **compte ses appels** — et c'est ce compte, et non
 *    une relecture du code, qui prouve que le plafond refuse AVANT de parler à
 *    Zoho.
 *
 * ⚠️ **ELLES ANNONCENT DES NOMBRES** : les étapes franchies, le compte
 *    d'amorçages, le nombre d'appels à l'échangeur.
 */

const CODE_RECU = { recu: true as const, code: "1000.code-invente.0000", hotesLies: ["127.0.0.1"] };

interface Decor {
  readonly monde: MondeDAmorcage;
  readonly echangeur: EchangeurCompte;
  readonly lignesEcrites: string[];
}

async function decorConforme(
  options: {
    plafond?: number | null;
    env?: Record<string, string | undefined>;
    echangeur?: EchangeurCompte;
    repetition?: boolean;
  } = {},
): Promise<Decor & { coffre: Awaited<ReturnType<typeof coffreOuvert>> }> {
  const plafond = options.plafond ?? 5;
  const coffre = await coffreOuvert(plafond);
  // ⚠️ LE COFFRE ET L'ENVIRONNEMENT REÇOIVENT LE MÊME PLAFOND. C'est ce que
  //    `index.ts` fait en production — il pose l'un À PARTIR de l'autre. Les
  //    laisser diverger ici ferait mesurer, à chaque test, l'écart plutôt que
  //    la règle. L'écart a son propre témoin, plus bas.
  const plafondDeLEnv = plafond === null ? {} : { [VARIABLE_PLAFOND]: String(plafond) };
  const echangeur = options.echangeur ?? echangeurDeGarde();
  const lignesEcrites: string[] = [];
  const boite = boiteDeGarde(CODE_RECU);
  return {
    coffre,
    echangeur,
    lignesEcrites,
    monde: {
      env: envDeGarde({ ...plafondDeLEnv, ...options.env }),
      ecrire: (ligne) => lignesEcrites.push(ligne),
      coffre: coffre.coffre,
      versions: coffre.versions,
      echangeur,
      ouvrirLaBoiteAuxLettres: boite.ouvrir,
      fabriquerUnEtat: () => "etat-fixe-de-garde",
      repetition: options.repetition ?? false,
    },
  };
}

describe("le chemin nominal — un clic, et le jeton entre au coffre", () => {
  it("franchit les huit étapes, dépose en version 1, et ne dit AUCUNE valeur", async () => {
    const decor = await decorConforme();
    const rapport = await amorcer(mandatDeGarde(), decor.monde);

    console.info(
      `[amorçage] étapes [${rapport.etapesFranchies.join(" → ")}] · ` +
        `compte ${String(rapport.compte ?? -1)} · plafond ${String(rapport.plafond)} ` +
        `(${rapport.originePlafond}) · reste ${String(rapport.reste ?? -1)} · ` +
        `version déposée ${String(rapport.versionDuJeton ?? -1)} · ` +
        `${String(decor.echangeur.appels.length)} appel(s) à l'échangeur · ` +
        `refus : ${rapport.refus ?? "aucun"}`,
    );

    expect(rapport.refus).toBe(null);
    expect(rapport.etapesFranchies).toEqual([
      "mandat",
      "configuration",
      "coffre-ouvert",
      "constat",
      "compte",
      "url",
      "rappel",
      "échange",
      "dépôt",
    ]);
    expect(rapport.compte).toBe(1);
    expect(rapport.versionDuJeton).toBe(1);
    expect(rapport.jetonEmisParZoho).toBe(true);
    expect(decor.echangeur.appels.length).toBe(1);

    // Le jeton est bien dans le coffre, et c'est le bon.
    const dansLeCoffre = (await decor.coffre.coffre.lire(NOM_DU_REFRESH_TOKEN, 1)).toString("utf8");
    expect(dansLeCoffre).toBe(JETONS_INVENTES.refreshToken);

    // ⚠️ AUCUNE VALEUR SECRÈTE DANS LE RAPPORT. Le rapport se colle dans un ticket.
    const tout = [...rapport.lignes, ...decor.lignesEcrites].join("\n");
    expect(tout).not.toContain(JETONS_INVENTES.refreshToken);
    expect(tout).not.toContain(JETONS_INVENTES.accessToken);
    expect(tout).not.toContain("secret-de-garde-sans-valeur");
    // …mais l'URL d'autorisation, elle, EST affichée : c'est la part de Will.
    expect(tout).toContain("accounts.zoho.eu/oauth/v2/auth");
    expect(tout).toContain("access_type=offline");
    expect(tout).toContain("prompt=consent");
  });

  it("passe à l'échangeur le code reçu et l'URI utilisée pour l'autorisation", async () => {
    const decor = await decorConforme();
    await amorcer(mandatDeGarde(), decor.monde);
    const appel = decor.echangeur.appels[0];
    expect(appel).toBeDefined();
    if (appel === undefined) return;
    expect(appel.code).toBe(CODE_RECU.code);
    // ⚠️ Zoho compare les DEUX URI caractère par caractère : celle de
    //    l'autorisation et celle de l'échange doivent être la MÊME valeur.
    expect(appel.uriDeRedirection).toBe(URI_DE_REDIRECTION_LOCALE);
  });
});

describe("le plafond refuse AVANT de parler à Zoho — et c'est un COMPTE qui le prouve", () => {
  it("SAIT rougir : au plafond, aucun appel à l'échangeur, aucune URL affichée", async () => {
    const echangeur = echangeurDeGarde();
    const decor = await decorConforme({ plafond: 2, echangeur });

    // Deux amorçages complets remplissent le plafond.
    await amorcer(mandatDeGarde(), decor.monde);
    await amorcer(mandatDeGarde(), decor.monde);
    const appelsAvant = echangeur.appels.length;

    const troisieme = await amorcer(mandatDeGarde(), decor.monde);

    console.info(
      `[plafond] 2 amorçages passés (${String(appelsAvant)} appel(s) à l'échangeur) · ` +
        `3ᵉ → refus « ${troisieme.refus ?? "aucun"} » · étapes ` +
        `[${troisieme.etapesFranchies.join(" → ")}] · ` +
        `${String(echangeur.appels.length - appelsAvant)} appel(s) SUPPLÉMENTAIRE(S)`,
    );

    expect(appelsAvant).toBe(2);
    expect(troisieme.refus).toBe("plafond-atteint");
    // ⚠️ LA MESURE QUI COMPTE : l'échangeur n'a PAS été rappelé. Le refus arrive
    //    avant le mur, pas dessus — aucun jeton n'a été émis, aucun jeton
    //    existant n'a été invalidé par Zoho.
    expect(echangeur.appels.length).toBe(appelsAvant);
    expect(troisieme.jetonEmisParZoho).toBe(false);
    // Et l'URL n'a même pas été construite : personne n'a pu cliquer.
    expect(troisieme.etapesFranchies).not.toContain("url");
    expect(troisieme.etapesFranchies).not.toContain("rappel");
    expect(troisieme.lignes.join(" ")).toContain("RIEN N'A ÉTÉ DEMANDÉ À ZOHO");
  });
});

describe("un second amorçage sur un coffre pourvu AVERTIT, avec le compte", () => {
  it("porte le compte, le plafond et le reste dans les lignes du rapport", async () => {
    const decor = await decorConforme({ plafond: 4 });
    const premier = await amorcer(mandatDeGarde(), decor.monde);
    expect(premier.refus).toBe(null);

    const second = await amorcer(mandatDeGarde(), decor.monde);
    const texte = second.lignes.join("\n");

    console.info(
      `[second] compte ${String(second.compte ?? -1)} · reste ${String(second.reste ?? -1)} · ` +
        `versions déposées : 1 puis ${String(second.versionDuJeton ?? -1)}`,
    );

    expect(second.refus).toBe(null);
    expect(texte).toContain("CE COFFRE EST DÉJÀ POURVU");
    expect(texte).toContain("Amorçages comptés : 1");
    expect(texte).toContain("TRANSFÉRER");
    expect(second.compte).toBe(2);
    expect(second.plafond).toBe(4);
    expect(second.plafondAttendu).toBe(4);
    expect(second.reste).toBe(2);
    expect(second.versionDuJeton).toBe(2);
  });
});

describe("deux dérivations du même plafond — le coffre décide, l'écart se SIGNALE", () => {
  /**
   * ⚠️ **CE TÉMOIN EST NÉ D'UN VRAI DÉFAUT, MESURÉ PENDANT L'ÉCRITURE.** Le
   *    rapport annonçait d'abord le plafond relu de l'environnement, alors que
   *    le coffre en appliquait un autre — « il vous reste 7 » sur un coffre qui
   *    refuse au 4ᵉ. Un rapport faux dans CE sens est exactement ce qui fait
   *    percuter le mur en croyant avoir de la marge, c'est-à-dire le défaut que
   *    le § 27 nomme.
   */
  it("SAIT rougir : coffre à 3, environnement à 9 → le rapport annonce 3 et signale l'écart", async () => {
    const coffre = await coffreOuvert(3);
    const echangeur = echangeurDeGarde();
    const monde: MondeDAmorcage = {
      env: envDeGarde({ [VARIABLE_PLAFOND]: "9" }),
      ecrire: () => undefined,
      coffre: coffre.coffre,
      versions: coffre.versions,
      echangeur,
      ouvrirLaBoiteAuxLettres: boiteDeGarde(CODE_RECU).ouvrir,
      fabriquerUnEtat: () => "etat-fixe-de-garde",
    };

    // Le premier amorçage pose l'ancre : avant elle, le coffre n'a rien à dire.
    const premier = await amorcer(mandatDeGarde(), monde);
    const second = await amorcer(mandatDeGarde(), monde);

    console.info(
      `[écart] coffre 3 · environnement 9 · rapport 1 : plafond ${String(premier.plafond)} / ` +
        `attendu ${String(premier.plafondAttendu)} · rapport 2 : plafond ${String(second.plafond)} / ` +
        `attendu ${String(second.plafondAttendu)} · reste ${String(second.reste ?? -1)}`,
    );

    // C'est le COFFRE qui est annoncé, dans les deux rapports.
    expect(premier.plafond).toBe(3);
    expect(second.plafond).toBe(3);
    expect(second.plafondAttendu).toBe(9);
    expect(second.reste).toBe(1);

    // Et l'écart est DIT, au second — quand l'ancre existe et que le coffre parle.
    expect(second.lignes.join("\n")).toContain("DEUX DÉRIVATIONS DU MÊME PLAFOND");

    // TÉMOIN DE CONTRASTE : sans écart, la ligne n'apparaît pas. Sans lui, un
    // avertissement permanent passerait pour une détection.
    const aligne = await decorConforme({ plafond: 3 });
    await amorcer(mandatDeGarde(), aligne.monde);
    const suivant = await amorcer(mandatDeGarde(), aligne.monde);
    expect(suivant.lignes.join("\n")).not.toContain("DEUX DÉRIVATIONS DU MÊME PLAFOND");
    expect(suivant.plafond).toBe(suivant.plafondAttendu);
  });
});

describe("les sept refus sont couverts, et la couverture est confrontée", () => {
  it("fabrique un témoin par refus déclaré", async () => {
    const vus = new Set<string>();
    const rapports: RapportDAmorcage[] = [];

    // 1 · mandat-absent — c'est le déclenchement automatique, refusé.
    const sansMandat = await decorConforme();
    rapports.push(await amorcer({ programme: "secours" }, sansMandat.monde));
    // ⚠️ ET L'ÉCHANGEUR N'A PAS ÉTÉ TOUCHÉ : un secours n'arrive nulle part.
    expect(sansMandat.echangeur.appels.length).toBe(0);

    // 2 · configuration-incomplete
    const sansConfig = await decorConforme({ env: { ZOHO_CLIENT_ID: "", ZOHO_CLIENT_SECRET: "" } });
    rapports.push(await amorcer(mandatDeGarde(), sansConfig.monde));

    // 3 · coffre-non-ouvert
    const ferme = await coffreVerrouille();
    rapports.push(
      await amorcer(mandatDeGarde(), {
        env: envDeGarde(),
        ecrire: () => undefined,
        coffre: ferme.coffre,
        versions: ferme.versions,
        echangeur: echangeurDeGarde(),
        ouvrirLaBoiteAuxLettres: boiteDeGarde(CODE_RECU).ouvrir,
      }),
    );

    // 4 · plafond-atteint
    const auPlafond = await decorConforme({ plafond: 1 });
    await amorcer(mandatDeGarde(), auPlafond.monde);
    rapports.push(await amorcer(mandatDeGarde(), auPlafond.monde));

    // 5 · rappel-sans-code
    const sansCode = await coffreOuvert(5);
    rapports.push(
      await amorcer(mandatDeGarde(), {
        env: envDeGarde(),
        ecrire: () => undefined,
        coffre: sansCode.coffre,
        versions: sansCode.versions,
        echangeur: echangeurDeGarde(),
        ouvrirLaBoiteAuxLettres: boiteDeGarde({
          recu: false,
          refus: "echeance-depassee",
          explication: "personne n'a cliqué",
          hotesLies: ["127.0.0.1"],
        }).ouvrir,
      }),
    );

    // 6 · echange-refuse
    const echangeRate = await decorConforme({
      echangeur: echangeurDeGarde(
        new ErreurDEchange(
          "erreur-annoncee-par-zoho",
          "Zoho refuse : invalid_code",
          "invalid_code",
        ),
      ),
    });
    rapports.push(await amorcer(mandatDeGarde(), echangeRate.monde));

    // 7 · depot-impossible — le coffre se referme entre l'échange et le dépôt.
    const depotRate = await decorConforme();
    const boiteQuiFerme = {
      ouvrir: (demande: Parameters<NonNullable<MondeDAmorcage["ouvrirLaBoiteAuxLettres"]>>[0]) => {
        void demande;
        depotRate.coffre.coffre.verrouiller();
        return Promise.resolve(CODE_RECU);
      },
    };
    rapports.push(
      await amorcer(mandatDeGarde(), {
        ...depotRate.monde,
        ouvrirLaBoiteAuxLettres: boiteQuiFerme.ouvrir,
      }),
    );

    for (const rapport of rapports) {
      expect(rapport.refus).not.toBe(null);
      if (rapport.refus !== null) vus.add(rapport.refus);
      // Un refus muet ferait chercher au hasard.
      expect(rapport.lignes.length).toBeGreaterThanOrEqual(1);
    }

    console.info(
      `[amorçage] ${String(rapports.length)} témoin(s) fabriqué(s) · ${String(vus.size)} refus ` +
        `distinct(s) sur ${String(REFUS_D_AMORCAGE.length)} déclaré(s) [${[...vus].sort().join(", ")}]`,
    );
    expect([...vus].sort()).toEqual([...REFUS_D_AMORCAGE].sort());
  });
});

describe("le mode répétition s'arrête avant tout port et tout échange", () => {
  it("affiche l'URL, compte l'amorçage, et n'ouvre NI boîte NI échange", async () => {
    const decor = await decorConforme({ repetition: true });
    const rapport = await amorcer(mandatDeGarde(), decor.monde);

    console.info(
      `[répétition] étapes [${rapport.etapesFranchies.join(" → ")}] · ` +
        `${String(decor.echangeur.appels.length)} appel(s) à l'échangeur · ` +
        `compte ${String(rapport.compte ?? -1)}`,
    );

    expect(rapport.refus).toBe(null);
    expect(rapport.repetition).toBe(true);
    expect(rapport.etapesFranchies).toContain("url");
    expect(rapport.etapesFranchies).toContain("répétition");
    expect(rapport.etapesFranchies).not.toContain("rappel");
    expect(rapport.etapesFranchies).not.toContain("échange");
    expect(decor.echangeur.appels.length).toBe(0);
    expect(rapport.versionDuJeton).toBe(null);

    // ⚠️ ET L'AMORÇAGE EST TOUT DE MÊME COMPTÉ : un mode qui ne compterait pas
    //    serait le chemin par lequel on contourne le plafond.
    expect(rapport.compte).toBe(1);
    expect((await constaterLAmorcage(decor.coffre.coffre, decor.coffre.versions)).compte).toBe(1);
  });
});

describe("la configuration manquante est nommée EN ENTIER, d'un seul coup", () => {
  it("annonce les deux variables absentes dans le même refus", async () => {
    const decor = await decorConforme({ env: { ZOHO_CLIENT_ID: "", ZOHO_CLIENT_SECRET: "" } });
    const rapport = await amorcer(mandatDeGarde(), decor.monde);
    const texte = rapport.lignes.join("\n");
    console.info(
      `[configuration] refus « ${rapport.refus ?? "aucun"} » · ${String(rapport.lignes.length)} ligne(s).`,
    );
    expect(rapport.refus).toBe("configuration-incomplete");
    expect(texte).toContain("ZOHO_CLIENT_ID");
    expect(texte).toContain("ZOHO_CLIENT_SECRET");
    expect(texte).toContain(VARIABLE_PLAFOND);
  });
});

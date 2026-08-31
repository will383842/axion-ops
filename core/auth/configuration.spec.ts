import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { secretPresent } from "../../ops/secrets.js";
import { ETAGES_DU_DEMARRAGE } from "../../ops/demarrage/etages.js";
import { CONTRAINTES_DE_L_AUDIENCE, VARIABLE_DE_L_AUDIENCE } from "./ressource.js";
import {
  REGLAGES_DAUTHENTIFICATION,
  reglagePresent,
  verifierLaConfigurationDAuthentification,
} from "./configuration.js";

/**
 * GARDES DE LA RÈGLE ABSOLUE DU § 19 — l'étage 3 du démarrage.
 *
 * > « **Le socle ne démarre pas si l'authentification n'est pas configurée. Pas
 * >   de mode dégradé. Pas d'`AUTH_DISABLED`.** »
 *
 * La v5 posait cette phrase comme la plus forte du document et **ne lui donnait
 * aucun test**, quand le coffre en avait un. Ce fichier est ce test, et l'ADR
 * 0027 lui fixe quatre exigences :
 *
 *  · la vérification **annonce combien de réglages elle a confrontés** — une
 *    vérification qui en confronterait zéro serait verte pour la pire des
 *    raisons ;
 *  · elle **nomme les manquants, jamais leur valeur** ;
 *  · **un témoin fabriqué, à qui il manque un réglage, produit exactement une
 *    anomalie nommant ce réglage** ;
 *  · une garde de texte rougit sur `AUTH_DISABLED` — filet, pas preuve. Elle vit
 *    dans `core/auth/emetteur.temoin.spec.ts`, avec la borne de ce qu'elle vaut.
 */

const ENV_EXAMPLE = readFileSync(
  fileURLToPath(new URL("../../.env.example", import.meta.url)),
  "utf8",
);

/** Un environnement COMPLET et factice, dérivé de la liste des exigences. */
function environnementComplet(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const reglage of REGLAGES_DAUTHENTIFICATION) {
    env[reglage.nom] = `valeur-factice-de-temoin-${reglage.nom}`;
  }
  // L'audience a une FORME, elle : une valeur factice quelconque ne suffit pas.
  env[VARIABLE_DE_L_AUDIENCE] = "https://stub.invalid/api/mcp";
  return env;
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — LE TÉMOIN À QUI IL MANQUE EXACTEMENT UN RÉGLAGE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 19 — le socle ne démarre pas sans authentification, et c'est MESURÉ", () => {
  it("chaque réglage manquant, un par un, produit UNE anomalie qui le NOMME", () => {
    /**
     * ⚠️ **UN RÉGLAGE À LA FOIS.** Un témoin auquel il manquerait tout produirait
     *    autant d'anomalies qu'il y a de réglages, et ne dirait pas si chacun est
     *    RÉELLEMENT confronté : un réglage jamais lu se perdrait dans le tas.
     */
    const desaccords: string[] = [];
    const comptesConfrontes = new Set<number>();

    for (const absent of REGLAGES_DAUTHENTIFICATION) {
      const env = environnementComplet();
      delete env[absent.nom];
      const verdict = verifierLaConfigurationDAuthentification(env);
      comptesConfrontes.add(verdict.reglagesConfrontes);

      if (verdict.manquants.length !== 1 || verdict.manquants[0] !== absent.nom) {
        desaccords.push(
          `${absent.nom} : manquants = [${verdict.manquants.join(", ")}] au lieu de lui seul`,
        );
      }
      if (!verdict.anomalies.some((anomalie) => anomalie.includes(absent.nom))) {
        desaccords.push(`${absent.nom} : aucune anomalie ne le nomme`);
      }
      // ⚠️ ELLE NE REND JAMAIS UNE VALEUR. Le journal d'un conteneur qui refuse
      //    de démarrer est lu par n'importe qui ; le dépôt est PUBLIC.
      for (const anomalie of verdict.anomalies) {
        for (const valeur of Object.values(env)) {
          if (valeur.length > 8 && anomalie.includes(valeur)) {
            desaccords.push(`${absent.nom} : une anomalie RECOPIE une valeur`);
          }
        }
      }
    }

    console.info(
      `[§ 19 · G1] ${String(REGLAGES_DAUTHENTIFICATION.length)} réglage(s) déclaré(s) · ` +
        `un témoin par réglage · compte(s) de réglages confrontés observé(s) : ` +
        `${[...comptesConfrontes].join(", ")} · ${String(desaccords.length)} désaccord(s)`,
    );

    // ⚠️ LE COMPTE NE DÉPEND PAS DU RÉSULTAT : c'est ce qui en fait un plancher.
    expect([...comptesConfrontes]).toEqual([REGLAGES_DAUTHENTIFICATION.length]);
    expect(REGLAGES_DAUTHENTIFICATION.length).toBeGreaterThanOrEqual(4);
    expect(desaccords).toEqual([]);
  });

  it("trois formes de « présent » qui n'en sont pas — vide, espaces, absent", () => {
    const formes: ReadonlyArray<readonly [string, string | undefined]> = [
      ["absent", undefined],
      ["vide", ""],
      ["espaces seuls", "   "],
      ["saut de ligne seul", "\n"],
    ];

    const passees: string[] = [];
    for (const [nom, valeur] of formes) {
      const env = environnementComplet();
      if (valeur === undefined) delete env["OPS_CONSOLE_SESSION_KEY"];
      else env["OPS_CONSOLE_SESSION_KEY"] = valeur;
      const verdict = verifierLaConfigurationDAuthentification(env);
      if (!verdict.manquants.includes("OPS_CONSOLE_SESSION_KEY")) passees.push(nom);
    }

    console.info(
      `[§ 19 · formes] ${String(formes.length)} forme(s) d'absence éprouvée(s) · ` +
        `${String(passees.length)} passée(s) au travers [${passees.join(", ") || "aucune"}]`,
    );

    // ⚠️ « `""` » EST LE CAS QUI ARRIVE VRAIMENT : une variable déclarée sans
    //    valeur dans l'interface d'exploitation n'est pas nullish.
    expect(passees).toEqual([]);
  });

  it("SAIT DIRE OUI — un environnement complet et bien formé démarre", () => {
    // ⚠️ SANS CE TEST, TOUT CE FICHIER SERAIT VERT SUR UNE VÉRIFICATION QUI
    //    REFUSE TOUT — c'est-à-dire sur un socle qui ne démarre jamais.
    const verdict = verifierLaConfigurationDAuthentification(environnementComplet());

    console.info(
      `[§ 19 · capacité] ${String(verdict.reglagesConfrontes)} réglage(s) confronté(s) · ` +
        `${String(verdict.contraintesDAudienceConfrontees)} contrainte(s) d'audience · ` +
        `${String(verdict.manquants.length)} manquant(s) · ` +
        `${String(verdict.anomalies.length)} anomalie(s) · ` +
        `audience conforme : ${String(verdict.audienceConforme)}`,
    );

    expect(verdict.manquants).toEqual([]);
    expect(verdict.anomalies).toEqual([]);
    expect(verdict.audienceConforme).toBe(true);
    expect(verdict.contraintesDAudienceConfrontees).toBe(CONTRAINTES_DE_L_AUDIENCE.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — LA FORME DE L'AUDIENCE, ET PAS SEULEMENT SA PRÉSENCE
// ═════════════════════════════════════════════════════════════════════════════

describe("étage 3 — « un réglage manque OU l'audience n'a pas la forme »", () => {
  it("une audience PRÉSENTE mais mal formée refuse le démarrage", () => {
    /**
     * ⚠️ **C'EST LA MOITIÉ QU'ON OUBLIE.** Une vérification de PRÉSENCE seule
     *    laisserait passer `OPS_RESOURCE_INDICATOR="oui"` : le socle démarrerait,
     *    l'étape 3 comparerait par égalité exacte à une valeur qui n'est pas une
     *    URL, et **aucun jeton ne vaudrait jamais** — panne totale, sans message.
     */
    const malFormees = [
      "oui",
      "stub.invalid/api/mcp",
      "https://stub.invalid",
      "http://ailleurs.invalid/api/mcp",
    ];

    const passees: string[] = [];
    for (const valeur of malFormees) {
      const env = environnementComplet();
      env[VARIABLE_DE_L_AUDIENCE] = valeur;
      const verdict = verifierLaConfigurationDAuthentification(env);
      if (verdict.anomalies.length === 0) passees.push(valeur);
      // Le réglage est PRÉSENT : ce n'est pas un manquant, c'est une forme.
      expect(verdict.manquants, valeur).toEqual([]);
    }

    console.info(
      `[étage 3 · forme] ${String(malFormees.length)} audience(s) présente(s) mais mal ` +
        `formée(s) · ${String(passees.length)} passée(s) au travers ` +
        `[${passees.join(", ") || "aucune"}]`,
    );

    expect(passees).toEqual([]);
  });

  it("l'étage 3 nomme le symbole que ce module porte — et il existe", () => {
    // ⚠️ `ops/demarrage/etages.ts` NOMME `verifierLaConfigurationDAuthentification`
    //    dans ses `decideurs`. Un nom qui ne désigne aucun symbole exporté
    //    enverrait `ops/main.ts` appeler quelque chose qui n'existe pas — la
    //    forme d'échec la plus coûteuse d'une table de décideurs.
    const etage = ETAGES_DU_DEMARRAGE.authentification;

    console.info(
      `[étage 3 · couture] rang ${String(etage.rang)} · issue « ${etage.issue} » · ` +
        `${String(etage.decideurs.length)} décideur(s) nommé(s) : ${etage.decideurs.join(", ")}`,
    );

    expect(etage.decideurs).toContain("verifierLaConfigurationDAuthentification");
    // L'issue est `processus-sort` : c'est la règle absolue, pas une amputation.
    expect(etage.issue).toBe("processus-sort");
    expect(typeof verifierLaConfigurationDAuthentification).toBe("function");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 — LES DEUX DÉRIVATIONS DE « PRÉSENT », ET LE MODÈLE DE CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

describe("les deux écritures de « présent » ne se contredisent pas", () => {
  it("`reglagePresent` et `secretPresent` répondent la MÊME chose sur la même table", () => {
    /**
     * ⚠️ **DEUX DÉRIVATIONS D'UN MÊME FAIT FINISSENT PAR SE CONTREDIRE.** Il y en
     *    a deux ici, et c'est assumé : `core/` ne peut pas importer `ops/` —
     *    `ops/` est la couche de composition, et `core → ops` ferait dépendre le
     *    noyau de son montage. Ce qui rend la cohabitation tenable est cette
     *    garde : la même table de formes, soumise aux deux, et zéro désaccord.
     *    **Se contredire EST le signal.**
     */
    const formes: ReadonlyArray<string | undefined> = [
      undefined,
      "",
      " ",
      "\n",
      "\t ",
      "x",
      " x ",
      "0",
      "false",
    ];

    const desaccords = formes.filter((valeur) => reglagePresent(valeur) !== secretPresent(valeur));

    console.info(
      `[G3 · deux écritures] ${String(formes.length)} forme(s) soumise(s) aux DEUX · ` +
        `${String(desaccords.length)} désaccord(s) · ` +
        `${String(formes.filter((v) => reglagePresent(v)).length)} jugée(s) présente(s)`,
    );

    expect(desaccords).toEqual([]);
    // Plancher : la table porte des OUI et des NON. Une table de « non » seuls
    // rendrait « zéro désaccord » sur deux fonctions qui refusent tout.
    expect(formes.filter((v) => reglagePresent(v)).length).toBeGreaterThan(0);
    expect(formes.filter((v) => !reglagePresent(v)).length).toBeGreaterThan(0);
  });

  it("tout réglage exigé figure dans `.env.example` — le dépôt reste démarrable", () => {
    /**
     * ⚠️ **UN RÉGLAGE EXIGÉ ET ABSENT DU MODÈLE EST UN SOCLE QU'ON NE PEUT PAS
     *    DÉMARRER EN SUIVANT LA DOCUMENTATION**, et personne ne le saurait avant
     *    d'essayer. La garde lit le fichier, elle ne le suppose pas.
     */
    const absents = REGLAGES_DAUTHENTIFICATION.map((reglage) => reglage.nom).filter(
      (nom) => !new RegExp(`^${nom}=`, "m").test(ENV_EXAMPLE),
    );

    console.info(
      `[G3 · .env.example] ${String(REGLAGES_DAUTHENTIFICATION.length)} réglage(s) exigé(s) · ` +
        `${String(ENV_EXAMPLE.length)} caractère(s) lus dans le modèle · ` +
        `${String(absents.length)} absent(s) [${absents.join(", ") || "aucun"}]`,
    );

    // Plancher : le fichier a RÉELLEMENT été lu.
    expect(ENV_EXAMPLE.length).toBeGreaterThan(500);
    expect(absents).toEqual([]);
  });

  it("chaque réglage porte un POURQUOI écrit — sans quoi c'est un réglage orphelin", () => {
    const sansMotif = REGLAGES_DAUTHENTIFICATION.filter(
      (reglage) => reglage.pourquoi.trim().length < 40,
    );

    console.info(
      `[G3 · motifs] ${String(REGLAGES_DAUTHENTIFICATION.length)} réglage(s) · ` +
        `${String(sansMotif.length)} sans motif écrit`,
    );

    // Sans motif, personne ne saura jamais si le réglage est encore nécessaire —
    // et un réglage qu'on n'ose pas retirer devient une exigence perpétuelle.
    expect(sansMotif).toEqual([]);
  });
});

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CAUSES_DE_REFUS_DAUDIENCE,
  HOTES_DE_BOUCLAGE,
  comparerLAudienceDuJeton,
  verifierLaFormeDeLAudience,
} from "./audience.js";
import type { CleDeContrainteDAudience } from "./ressource.js";
import {
  CHEMIN_DE_LA_RESSOURCE_MCP,
  CONTRAINTES_DE_L_AUDIENCE,
  VARIABLE_DE_L_AUDIENCE,
} from "./ressource.js";

/**
 * GARDES DE L'AUDIENCE — ADR 0026, § 19.1, § 11 (étape 3), RFC 8707.
 *
 * ═══ CE QUE L'ADR EXIGE DE CE FICHIER, MOT POUR MOT ═══
 *
 *  · « **la forme, contrainte par contrainte**, avec pour chacune un témoin qui
 *    la viole SEULE : un verdict qui ne dirait que *non conforme* ne prouverait
 *    pas que les cinq mordent, et quatre d'entre elles pourraient être mortes » ;
 *  · « le **compte de contraintes confrontées**, annoncé » ;
 *  · « que **la valeur factice du dépôt passe** — sans quoi le critère *démarrer
 *    en local avec des valeurs factices* serait faux, et personne ne le saurait
 *    avant d'essayer » ;
 *  · « qu'**aucune valeur réelle n'entre dans le dépôt** ».
 *
 * ⚠️ RÈGLE DE CE FICHIER : chaque garde ANNONCE COMBIEN D'ÉLÉMENTS ELLE A
 *    MESURÉS. Une garde qui confronte zéro contrainte est verte pour la pire des
 *    raisons.
 */

/** Le modèle de configuration du dépôt, lu tel quel. */
const ENV_EXAMPLE = readFileSync(
  fileURLToPath(new URL("../../.env.example", import.meta.url)),
  "utf8",
);

/** La valeur factice réellement écrite dans `.env.example`, EXTRAITE, jamais recopiée. */
function audienceFacticeDuDepot(): string {
  const trouve = new RegExp(`^${VARIABLE_DE_L_AUDIENCE}="([^"]*)"`, "m").exec(ENV_EXAMPLE);
  if (trouve?.[1] === undefined) {
    throw new Error(
      `${VARIABLE_DE_L_AUDIENCE} est introuvable dans .env.example — la garde ne lit plus ce ` +
        "qu'elle prétend lire, et son verdict ne vaut rien.",
    );
  }
  return trouve[1];
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — LES CINQ CONTRAINTES MORDENT, ET CHACUNE SEULE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0026 — la forme de l'audience, contrainte par contrainte", () => {
  /**
   * ⚠️ **UN TÉMOIN PAR CONTRAINTE, ET IL NE DOIT EN VIOLER QU'UNE.** C'est toute
   *    la valeur de la table : un témoin qui violerait deux contraintes ne
   *    prouverait ni l'une ni l'autre — le verdict serait le même si l'une des
   *    deux était morte.
   */
  const TEMOINS: ReadonlyArray<readonly [CleDeContrainteDAudience, string]> = [
    ["schéma", "ftp://stub.invalid/api/mcp"],
    ["aucune requête", "https://stub.invalid/api/mcp?v=1"],
    ["aucun fragment", "https://stub.invalid/api/mcp#section"],
    ["aucune barre finale", "https://stub.invalid/api/mcp/"],
    ["chemin non vide", "https://stub.invalid"],
  ];

  it("chaque contrainte a un témoin qui la viole SEULE, et le verdict la NOMME", () => {
    const desaccords: string[] = [];
    const comptesConfrontes = new Set<number>();

    for (const [cle, temoin] of TEMOINS) {
      const verdict = verifierLaFormeDeLAudience(temoin);
      comptesConfrontes.add(verdict.contraintesConfrontees);
      if (verdict.violees.length !== 1 || verdict.violees[0] !== cle) {
        desaccords.push(
          `« ${cle} » : ${String(verdict.violees.length)} violation(s) ` +
            `[${verdict.violees.join(", ")}] au lieu d'exactement « ${cle} »`,
        );
      }
      // Le message NOMME la contrainte et la variable — § 25.
      if (!verdict.anomalies.some((anomalie) => anomalie.includes(cle))) {
        desaccords.push(`« ${cle} » : aucune anomalie ne nomme la contrainte`);
      }
    }

    console.info(
      `[ADR 0026 · G1] ${String(CONTRAINTES_DE_L_AUDIENCE.length)} contrainte(s) déclarée(s) · ` +
        `${String(TEMOINS.length)} témoin(s) éprouvé(s) · ` +
        `compte(s) de contraintes confrontées observé(s) : ` +
        `${[...comptesConfrontes].join(", ")} · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Plancher : la table est LUE, et les cinq témoins la couvrent en entier.
    expect(TEMOINS).toHaveLength(CONTRAINTES_DE_L_AUDIENCE.length);
    // Le compte ne dépend PAS du résultat : c'est ce qui en fait un plancher.
    expect([...comptesConfrontes]).toEqual([CONTRAINTES_DE_L_AUDIENCE.length]);
    expect(desaccords).toEqual([]);
  });

  it("chaque clé de la table a un témoin — la couverture est DÉRIVÉE, pas supposée", () => {
    const couvertes = new Set(TEMOINS.map(([cle]) => cle));
    const sansTemoin = CONTRAINTES_DE_L_AUDIENCE.map((c) => c.cle).filter(
      (cle) => !couvertes.has(cle),
    );

    console.info(
      `[ADR 0026 · couverture] ${String(CONTRAINTES_DE_L_AUDIENCE.length)} contrainte(s) lue(s) ` +
        `dans ressource.ts · ${String(couvertes.size)} couverte(s) par un témoin · ` +
        `${String(sansTemoin.length)} sans témoin [${sansTemoin.join(", ") || "aucune"}]`,
    );

    // ⚠️ CETTE GARDE EST CELLE QUI SURVIT À L'AJOUT D'UNE SIXIÈME CONTRAINTE :
    //    le compilateur exigera son contrôle, et celle-ci exigera son témoin.
    expect(sansTemoin).toEqual([]);
  });

  it("SAIT DIRE OUI — sans quoi les cinq refus seraient verts sur un refuseur universel", () => {
    // ⚠️ L'INSTRUMENT SE PROUVE AVANT DE SERVIR. Une fonction qui refuserait
    //    TOUT passerait les cinq témoins ci-dessus sans un mot.
    const admises = [
      `https://stub.invalid${CHEMIN_DE_LA_RESSOURCE_MCP}`,
      `http://localhost:3000${CHEMIN_DE_LA_RESSOURCE_MCP}`,
      `http://127.0.0.1:8080${CHEMIN_DE_LA_RESSOURCE_MCP}`,
      `http://[::1]:3000${CHEMIN_DE_LA_RESSOURCE_MCP}`,
      "https://stub.invalid/sous/chemin/api/mcp",
    ];

    const refusees = admises
      .map((valeur) => ({ valeur, verdict: verifierLaFormeDeLAudience(valeur) }))
      .filter((essai) => !essai.verdict.conforme);

    console.info(
      `[ADR 0026 · capacité] ${String(admises.length)} valeur(s) conformes éprouvée(s) · ` +
        `${String(HOTES_DE_BOUCLAGE.length)} hôte(s) de bouclage admis · ` +
        `${String(refusees.length)} refusée(s) à tort ` +
        `[${refusees.map((e) => e.verdict.violees.join("+")).join(", ") || "aucune"}]`,
    );

    expect(refusees).toEqual([]);
  });

  it("`http` hors bouclage est refusé, et `localhost.attaquant.test` n'est PAS localhost", () => {
    // La contrainte compare l'hôte EXTRAIT, jamais un préfixe de la chaîne :
    // un préfixe aurait fait passer `http://localhost.attaquant.test/api/mcp`.
    const temoins = [
      "http://stub.invalid/api/mcp",
      "http://localhost.attaquant.test/api/mcp",
      "http://127.0.0.1.attaquant.test/api/mcp",
    ];

    const passees = temoins.filter((valeur) => verifierLaFormeDeLAudience(valeur).conforme);

    console.info(
      `[ADR 0026 · bouclage] ${String(temoins.length)} témoin(s) d'hôte trompeur éprouvé(s) · ` +
        `${String(passees.length)} passé(s) au travers [${passees.join(", ") || "aucun"}]`,
    );

    expect(passees).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — LA VALEUR FACTICE DU DÉPÔT DÉMARRE, ET AUCUNE VALEUR RÉELLE N'Y EST
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0026 — le dépôt reste démarrable, et il reste public", () => {
  it("la valeur factice de `.env.example` passe les cinq contraintes", () => {
    const factice = audienceFacticeDuDepot();
    const verdict = verifierLaFormeDeLAudience(factice);

    console.info(
      `[ADR 0026 · factice] ${VARIABLE_DE_L_AUDIENCE} lu dans .env.example · ` +
        `${String(verdict.contraintesConfrontees)} contrainte(s) confrontée(s) · ` +
        `${String(verdict.violees.length)} violée(s) [${verdict.violees.join(", ") || "aucune"}]`,
    );

    // ⚠️ SANS CETTE GARDE, LE CRITÈRE DE RECETTE « DÉMARRER EN LOCAL AVEC DES
    //    VALEURS FACTICES » SERAIT FAUX SANS QUE PERSONNE NE LE SACHE avant
    //    d'essayer — et l'étage 3 refuse le démarrage.
    expect(verdict.contraintesConfrontees).toBe(CONTRAINTES_DE_L_AUDIENCE.length);
    expect(verdict.violees).toEqual([]);
  });

  it("la valeur factice reste sur `stub.invalid` — aucune adresse réelle au dépôt", () => {
    const factice = audienceFacticeDuDepot();

    console.info(
      `[ADR 0026 · dépôt public] hôte factice attendu « stub.invalid » (RFC 2606, ne résout ` +
        `jamais) · longueur de la valeur lue : ${String(factice.length)} caractère(s)`,
    );

    // Le domaine est nommé, la valeur n'est jamais recopiée dans l'annonce :
    // c'est une garde de dépôt PUBLIC, elle ne doit pas devenir la fuite.
    expect(factice).toContain("stub.invalid");
    expect(factice.endsWith(CHEMIN_DE_LA_RESSOURCE_MCP)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 — LA COMPARAISON DE L'ÉTAPE 3
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0026 — l'étape 3 compare par égalité EXACTE, et n'admet qu'une audience", () => {
  const ATTENDUE = `https://stub.invalid${CHEMIN_DE_LA_RESSOURCE_MCP}`;

  it("refuse une audience absente, multiple, ou seulement PRESQUE égale", () => {
    /**
     * ⚠️ **LES QUATRE DERNIERS TÉMOINS SONT LE CŒUR DE LA DÉCISION.** Chacun
     *    serait accepté par une normalisation d'URL « raisonnable » : casse de
     *    l'hôte, barre finale, port explicite, préfixe. L'ADR 0026 dit que
     *    chaque règle d'accommodement est une paire de valeurs distinctes rendues
     *    équivalentes — et l'étape 3 n'existe que pour dire qu'elles ne le sont
     *    pas.
     */
    const temoins: ReadonlyArray<readonly [string, readonly string[]]> = [
      ["aucune audience", []],
      ["deux audiences", [ATTENDUE, "https://autre.invalid/api/mcp"]],
      ["casse de l'hôte", ["https://STUB.invalid/api/mcp"]],
      ["barre finale", [`${ATTENDUE}/`]],
      ["port explicite", ["https://stub.invalid:443/api/mcp"]],
      ["préfixe seulement", ["https://stub.invalid/api"]],
      ["autre ressource", ["https://autre.invalid/api/mcp"]],
    ];

    const passes: string[] = [];
    const causes: string[] = [];
    for (const [nom, presentees] of temoins) {
      const verdict = comparerLAudienceDuJeton(presentees, ATTENDUE);
      if (verdict.admise) passes.push(nom);
      else if (verdict.cause !== null) causes.push(verdict.cause);
      // § 15 — le motif ne recopie JAMAIS la valeur attendue : il nomme la
      // variable. La donner reviendrait à faire la moitié du travail.
      expect(verdict.motif, nom).not.toContain(ATTENDUE);
    }

    const distinctes = new Set(causes);
    console.info(
      `[ADR 0026 · G3] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(passes.length)} passé(s) au travers [${passes.join(", ") || "aucun"}] · ` +
        `${String(distinctes.size)} cause(s) distincte(s) sur ` +
        `${String(CAUSES_DE_REFUS_DAUDIENCE.length)} déclarée(s) : ${[...distinctes].join(", ")}`,
    );

    expect(passes).toEqual([]);
    // ⚠️ LES TROIS CAUSES SONT TOUTES ATTEIGNABLES. Une cause déclarée qu'aucun
    //    chemin ne produit est un vocabulaire mort, et le § 24 compterait un
    //    ensemble qui ne se remplit jamais.
    expect(distinctes.size).toBe(CAUSES_DE_REFUS_DAUDIENCE.length);
  });

  it("admet l'audience exacte — et c'est ce qui distingue une garde d'un mur", () => {
    const verdict = comparerLAudienceDuJeton([ATTENDUE], ATTENDUE);

    console.info(
      `[ADR 0026 · capacité G3] ${String(verdict.indicateursRecus)} indicateur(s) reçu(s) · ` +
        `admise : ${String(verdict.admise)}`,
    );

    expect(verdict.admise).toBe(true);
    expect(verdict.cause).toBeNull();
  });
});

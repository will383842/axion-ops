import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { demarrerLeSocleMonoInstance, relireLaSanteMonoInstance } from "./demarrage.js";
import { MagasinDeVerrousEnMemoire, VerrouEnMemoire, VerrouReentrantTemoin } from "./memoire.js";
import type {
  EtatDuVerrou,
  InstanceDuSocle,
  ResultatAcquisition,
  VerrouDInstance,
} from "./verrou.js";
import {
  STATUT_HEALTHCHECK_VERROU_ABSENT,
  STATUT_HEALTHCHECK_VERROU_TENU,
  frapperInstance,
} from "./verrou.js";

/**
 * TÉMOINS — **LES GARDES DE L'ADR 0018 SAVENT-ELLES DIRE NON ?**
 *
 * ═══ LE DÉFAUT QUE CE FICHIER EXISTE POUR RENDRE IMPOSSIBLE ═══
 *
 * L'épreuve du lot 1c a mesuré un mode de défaillance que personne n'avait
 * anticipé : **une décision écrite, testée, documentée — et non cousue au chemin
 * de production.** Quatre ADR sur cinq étaient dans cet état. Leurs fonctions
 * existaient, étaient exportées, étaient gardées, et aucun module de production
 * ne les appelait. Les tests passaient parce qu'ils éprouvaient la FONCTION,
 * jamais son BRANCHEMENT.
 *
 * `verrou.spec.ts` éprouve l'arbitre ; `demarrage.spec.ts` éprouve la couture.
 * Mais une garde de couture qui ne peut pas échouer n'existe pas : rien ne
 * prouverait qu'elle mesure le branchement plutôt que le verrou. Ce fichier
 * fabrique les quatre défauts, un par garde, et exige qu'ils soient VUS :
 *
 *  · T1 — **la couture DÉFAITE** : le verrou mord, l'arbitre n'est pas appelé ;
 *  · T2 — **le verrou RÉENTRANT** (le témoin que l'ADR 0018 nomme pour G1) ;
 *  · T3 — **le healthcheck QUI SE SOUVIENT** (celui que l'ADR 0018 exclut) ;
 *  · T4 — **la couture nommée en PROSE et jamais appelée** — le défaut du lot
 *    1c, à la lettre.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  T1 — LA COUTURE DÉFAITE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE SOCLE DU LOT 1c : IL PREND LE VERROU, ET NE L'ÉCOUTE PAS.**
 *
 * ⚠️ CE N'EST PAS UNE CARICATURE, C'EST L'ÉTAT RÉEL DU DÉPÔT AVANT CE LOT.
 *    `core/instance/verrou.ts` déclarait les quatre états, `ops/mono-instance.ts`
 *    savait CONSTATER un second socle, et rien n'appelait quoi que ce soit au
 *    démarrage. Un verrou qui mord sans que personne n'en tienne compte est
 *    exactement aussi utile qu'un verrou absent — et il est PIRE, parce que la
 *    prose donne l'apparence d'un périmètre couvert.
 */
async function demarrerSansEcouterLArbitre(
  verrou: VerrouDInstance,
): Promise<{ demarre: boolean; resultat: ResultatAcquisition }> {
  const resultat = await verrou.acquerir();
  // La couture manquante, en une ligne : le résultat est LU, et jeté.
  return { demarre: true, resultat };
}

describe("T1 — la garde G1 voit-elle une COUTURE DÉFAITE ?", () => {
  it("le même verrou, sans l'arbitre : DEUX socles démarrent au lieu d'un", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const socles = [
      new VerrouEnMemoire(magasin, frapperInstance()),
      new VerrouEnMemoire(magasin, frapperInstance()),
    ];

    const debranches = [];
    for (const verrou of socles) debranches.push(await demarrerSansEcouterLArbitre(verrou));
    const autorises = debranches.filter((demarrage) => demarrage.demarre).length;

    console.info(
      `[témoin T1 · couture défaite] ${String(magasin.tentatives)} tentative(s), ` +
        `${String(magasin.acquisitionsAccordees)} acquisition(s) accordée(s) — ` +
        `${String(autorises)} DÉMARRAGE(S) AUTORISÉ(S) par la séquence débranchée, ` +
        `états ignorés : ${debranches.map((demarrage) => demarrage.resultat.etat).join(", ")}`,
    );

    // ⚠️ LE VERROU A PARFAITEMENT MORDU — une seule acquisition accordée. C'est
    //    la démonstration que la garde G1 ne peut PAS se contenter de lire le
    //    magasin : elle doit lire ce que le SOCLE en a fait.
    expect(magasin.acquisitionsAccordees).toBe(1);
    expect(debranches[1]?.resultat.etat).toBe("refusé");
    // Et deux socles démarrent quand même. C'est le défaut, fabriqué.
    expect(autorises).toBe(2);
  });

  it("la MÊME séquence, cousue, n'en autorise qu'un — la différence est la couture", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const socles = [
      new VerrouEnMemoire(magasin, frapperInstance()),
      new VerrouEnMemoire(magasin, frapperInstance()),
    ];

    const cousus = [];
    for (const verrou of socles) cousus.push(await demarrerLeSocleMonoInstance(verrou));
    const autorises = cousus.filter((demarrage) => demarrage.decision.demarre).length;

    console.info(
      `[témoin T1 · plancher] même magasin, même verrou, séquence COUSUE — ` +
        `${String(autorises)} démarrage(s) autorisé(s)`,
    );

    // Les deux moitiés du témoin dans le même fichier : sans celle-ci, la
    // précédente ne dirait pas si la différence vient de la couture ou du
    // harnais.
    expect(autorises).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  T2 — LE VERROU RÉENTRANT, LE TÉMOIN QUE L'ADR 0018 NOMME
// ═════════════════════════════════════════════════════════════════════════════

describe("T2 — la garde G1 voit-elle un VERROU RÉENTRANT ?", () => {
  /**
   * L'ADR 0018, tableau des gardes : « G1 — le témoin qui la fait rougir : un
   * verrou réentrant (qui accorderait deux fois) : le compte de démarrages passe
   * à 2. » C'est écrit là-bas ; c'est mesuré ici.
   */
  it("un verrou qui accorde toujours fait passer le compte de démarrages à 2", async () => {
    const verrou = new VerrouReentrantTemoin();

    const premier = await demarrerLeSocleMonoInstance(verrou);
    const second = await demarrerLeSocleMonoInstance(verrou);
    const autorises = [premier, second].filter((demarrage) => demarrage.decision.demarre).length;

    console.info(
      `[témoin T2 · verrou réentrant] ${String(verrou.accords)} accord(s) rendu(s) par le ` +
        `verrou — ${String(autorises)} démarrage(s) autorisé(s) par la couture`,
    );

    // ⚠️ LA COUTURE EST INTACTE ICI, ET C'EST TOUT L'INTÉRÊT. Elle appelle bien
    //    l'arbitre, l'arbitre décide bien — et le socle démarre deux fois, parce
    //    que le VERROU ment. G1 est donc une garde sur la PAIRE, pas sur l'une
    //    des deux moitiés : le compte de démarrages autorisés ne vaut que
    //    lorsqu'il est lu à côté du compte d'acquisitions accordées.
    expect(verrou.accords).toBe(2);
    expect(autorises).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  T3 — LE HEALTHCHECK QUI SE SOUVIENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE VERROU QUE L'ADR 0018 EXCLUT NOMMÉMENT.**
 *
 * « Un verrou qui se souvient. `relire()` RELIT ; rendre un drapeau posé à
 * l'acquisition ferait une garde verte exactement dans le cas où le verrou vient
 * d'être perdu. »
 */
class VerrouQuiSeSouvient implements VerrouDInstance {
  readonly #magasin: MagasinDeVerrousEnMemoire;
  readonly #instance: InstanceDuSocle;
  #acquis = false;

  constructor(magasin: MagasinDeVerrousEnMemoire, instance: InstanceDuSocle) {
    this.#magasin = magasin;
    this.#instance = instance;
  }

  async acquerir(): Promise<ResultatAcquisition> {
    const reel = await new VerrouEnMemoire(this.#magasin, this.#instance).acquerir();
    this.#acquis = reel.etat === "tenu";
    return reel;
  }

  /** LE DÉFAUT : elle rend le DRAPEAU, elle ne relit rien. */
  relire(): Promise<EtatDuVerrou> {
    return Promise.resolve(this.#acquis ? "tenu" : "perdu");
  }

  liberer(): Promise<void> {
    return Promise.resolve();
  }
}

describe("T3 — la garde G3 voit-elle un HEALTHCHECK QUI SE SOUVIENT ?", () => {
  it("le drapeau posé à l'acquisition rend 200 alors que le verrou est perdu", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const instance = frapperInstance();
    const oublieux = new VerrouQuiSeSouvient(magasin, instance);
    await demarrerLeSocleMonoInstance(oublieux);

    // Le cas RÉEL : la connexion est tombée, le verrou a pu être repris.
    magasin.arracherLeVerrou();
    const sante = await relireLaSanteMonoInstance(oublieux, instance, () => ({
      extraits: 0,
      sessions: 0,
      empreintesRefusees: 0,
      sessionsEvincees: 0,
      indetermine: false,
      plafondExtraits: 100,
      plafondSessions: 10,
      ttlMs: 60_000,
    }));

    console.info(
      `[témoin T3 · verrou qui se souvient] ${String(magasin.relectures)} relecture(s) RÉELLE(S) ` +
        `du magasin — verrou annoncé « ${sante.verrou} », statut ${String(sante.statut)} ` +
        `alors que le magasin ne compte plus aucun détenteur`,
    );

    // ⚠️ LE DÉFAUT, MESURÉ : le magasin n'a JAMAIS été relu (zéro relecture), et
    //    le healthcheck rend 200 sur un verrou perdu. C'est exactement le cas
    //    que l'ADR 0018 décrit comme « le pire » : la garde du § 20 ne
    //    s'applique peut-être déjà qu'un appel sur deux, et l'exploitant ne
    //    verra rien.
    expect(magasin.relectures).toBe(0);
    expect(magasin.detenteur()).toBeNull();
    expect(sante.verrou).toBe("tenu");
    expect(sante.statut).toBe(STATUT_HEALTHCHECK_VERROU_TENU);
  });

  it("le verrou qui RELIT, sur le même scénario, rend 503 — la différence est la relecture", async () => {
    const magasin = new MagasinDeVerrousEnMemoire();
    const instance = frapperInstance();
    const honnete = new VerrouEnMemoire(magasin, instance);
    await demarrerLeSocleMonoInstance(honnete);

    magasin.arracherLeVerrou();
    const sante = await relireLaSanteMonoInstance(honnete, instance, () => ({
      extraits: 0,
      sessions: 0,
      empreintesRefusees: 0,
      sessionsEvincees: 0,
      indetermine: false,
      plafondExtraits: 100,
      plafondSessions: 10,
      ttlMs: 60_000,
    }));

    console.info(
      `[témoin T3 · plancher] ${String(magasin.relectures)} relecture(s) réelle(s) — ` +
        `verrou « ${sante.verrou} », statut ${String(sante.statut)}`,
    );

    expect(magasin.relectures).toBe(1);
    expect(sante.statut).toBe(STATUT_HEALTHCHECK_VERROU_ABSENT);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  T4 — LA COUTURE NOMMÉE EN PROSE ET JAMAIS APPELÉE
// ═════════════════════════════════════════════════════════════════════════════

/** Un fichier soumis à la mesure : son chemin, et son source BRUT. */
interface FichierSoumis {
  readonly chemin: string;
  readonly source: string;
}

/**
 * Retire les commentaires — blocs `/* … *\/` et lignes `//`.
 *
 * ⚠️ **CE RETRAIT EST LA MESURE, PAS UNE PRÉCAUTION.** Le défaut a été chiffré
 *    au lot 1c : deux modules nommaient `cumulerChampsDeGouvernance()` dans un
 *    bloc JSDoc, parenthèses comprises, et une recherche naïve les comptait
 *    comme des appelants. Une couture mesurée sans ce retrait est une couture
 *    qu'une phrase suffit à déclarer faite.
 */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, " ").replace(/\/\/[^\n]*/gu, " ");
}

/**
 * Compte les APPELS d'une fonction dans un ensemble de fichiers INJECTÉ.
 *
 * ⚠️ FONCTION PURE D'UN ENSEMBLE DE FICHIERS — c'est ce qui rend le témoin
 *    possible sans mutiler le dépôt : on lui passe un jeu FABRIQUÉ dont l'appel
 *    a été retiré, et on exige qu'elle compte zéro. Une mesure qui lirait le
 *    disque depuis son propre corps ne serait éprouvable qu'en cassant un
 *    fichier réel.
 *
 * ⚠️ LA FORME CHERCHÉE ADMET LES ARGUMENTS DE TYPE. Le motif naïf `nom\s*\(`
 *    déclarait `avecJournal` non cousue au lot 1c, parce que l'orchestrateur
 *    l'appelle `avecJournal<ChargeServie>(…)`.
 */
function appelantsDe(symbole: string, fichiers: readonly FichierSoumis[]): readonly string[] {
  const forme = new RegExp(`\\b${symbole}\\s*(?:<[^;()]*>)?\\s*\\(`, "u");
  return fichiers
    .filter((fichier) => forme.test(sansCommentaires(fichier.source)))
    .map((fichier) => fichier.chemin);
}

const CHEMIN_COUTURE = fileURLToPath(new URL("./demarrage.ts", import.meta.url));
const CHEMIN_ARBITRE = fileURLToPath(new URL("./verrou.ts", import.meta.url));

describe("T4 — la couture est-elle mesurable, et la mesure sait-elle dire NON ?", () => {
  it("`demarrage.ts` APPELLE l'arbitre — mesuré sur le source du disque", () => {
    const fichiers: readonly FichierSoumis[] = [
      { chemin: "core/instance/demarrage.ts", source: readFileSync(CHEMIN_COUTURE, "utf8") },
      // Le DÉFINISSEUR, soumis lui aussi : une mesure qui le compterait comme
      // son propre appelant annoncerait « 1 appelant » sur une fonction morte.
      { chemin: "core/instance/verrou.ts", source: readFileSync(CHEMIN_ARBITRE, "utf8") },
    ];
    const octets = fichiers.reduce((total, fichier) => total + fichier.source.length, 0);
    const appelants = appelantsDe("deciderDemarrageMonoInstance", fichiers).filter(
      (chemin) => chemin !== "core/instance/verrou.ts",
    );

    console.info(
      `[témoin T4 · couture] ${String(fichiers.length)} fichier(s) soumis, ` +
        `${String(octets)} octet(s) lus — ${String(appelants.length)} appelant(s) hors ` +
        `définisseur : ${appelants.join(", ") || "AUCUN"}`,
    );

    // Plancher : les fichiers ont bien été lus. Une mesure sur zéro octet est
    // verte pour la pire des raisons.
    expect(octets).toBeGreaterThan(2000);
    expect(appelants).toEqual(["core/instance/demarrage.ts"]);
  });

  it("SAIT DIRE NON — un module qui NOMME l'arbitre dans un commentaire n'est PAS un appelant", () => {
    // Le défaut du lot 1c, reproduit à la lettre : la prose promet, le code
    // n'appelle pas. C'est l'état dans lequel se trouvaient quatre ADR sur cinq.
    const fabriques: readonly FichierSoumis[] = [
      {
        chemin: "fabriqué/prose-seule.ts",
        source: [
          "/**",
          " * Ce module applique `deciderDemarrageMonoInstance(etat)` au démarrage.",
          " */",
          "// puis deciderDemarrageMonoInstance(resultat.etat) tranche.",
          "export function demarrer(): boolean {",
          "  return true;",
          "}",
        ].join("\n"),
      },
      {
        chemin: "fabriqué/appel-reel.ts",
        source: [
          "import { deciderDemarrageMonoInstance } from './verrou.js';",
          "export function demarrer(etat) {",
          "  return deciderDemarrageMonoInstance(etat).demarre;",
          "}",
        ].join("\n"),
      },
    ];

    const appelants = appelantsDe("deciderDemarrageMonoInstance", fabriques);

    console.info(
      `[témoin T4 · prose] ${String(fabriques.length)} fichier(s) fabriqué(s) — ` +
        `${String(appelants.length)} appelant(s) retenu(s) : ${appelants.join(", ")}`,
    );

    // ⚠️ SI CETTE ASSERTION TOMBAIT, la mesure précédente serait verte pour un
    //    fichier qui se contente de PARLER de l'arbitre — c'est-à-dire pour
    //    exactement le défaut qu'elle est censée trouver.
    expect(appelants).toEqual(["fabriqué/appel-reel.ts"]);
  });

  it("SAIT DIRE NON — la couture retirée, la mesure compte ZÉRO appelant", () => {
    const reel = readFileSync(CHEMIN_COUTURE, "utf8");
    // On DÉBRANCHE la couture dans une COPIE en mémoire : le dépôt n'est pas
    // touché, et pourtant le défaut est fabriqué pour de bon.
    const debranche = reel.replace(
      /deciderDemarrageMonoInstance\(resultat\.etat\)/gu,
      "{ etat: 1 }",
    );

    const appelants = appelantsDe("deciderDemarrageMonoInstance", [
      { chemin: "core/instance/demarrage.ts", source: debranche },
    ]);

    console.info(
      `[témoin T4 · débranchement] ${String(reel.length)} octet(s) au départ, ` +
        `${String(reel.length - debranche.length)} octet(s) retirés — ` +
        `${String(appelants.length)} appelant(s) restant(s)`,
    );

    // ⚠️ LE PLANCHER DU PLANCHER : si le remplacement n'avait RIEN retiré, la
    //    mesure ci-dessous serait verte sans qu'aucun débranchement n'ait eu
    //    lieu. Le nombre d'octets retirés est donc affirmé, pas seulement écrit.
    expect(reel.length - debranche.length).toBeGreaterThan(0);
    expect(appelants).toEqual([]);
  });
});

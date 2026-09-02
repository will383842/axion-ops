/**
 * `commun.spec.ts` — **CE QUI GARDE LES PARTIES PURES DES SONDES.**
 *
 * ═══ POURQUOI CE FICHIER EXISTE ALORS QUE LES SONDES N'EN SONT PAS ═══
 *
 * Les cinq sondes de ce dossier ne sont pas des gardes, et elles ne tournent pas
 * dans `pnpm test` — leur nom de fichier est ce qui les en tient hors, et c'est
 * délibéré (voyez l'en-tête de `commun.ts`).
 *
 * ⚠️ **MAIS TROIS AFFIRMATIONS DE CE DOSSIER SONT DES PROMESSES DE SÉCURITÉ, ET
 *    UNE PROMESSE NON GARDÉE N'EST QU'UNE PHRASE :**
 *
 *  1. « les sondes n'affichent JAMAIS un identifiant » ;
 *  2. « elles n'écrivent RIEN dans le dépôt » ;
 *  3. « le relevé passe par le filet anti-fuite avant d'être servi ».
 *
 *    Ce dépôt est PUBLIC et le `.env` du répertoire de travail porte deux
 *    identifiants Zoho. Les trois promesses sont donc éprouvées ici, chacune
 *    avec un **témoin fabriqué** — une valeur qu'on met à l'intérieur, et dont
 *    on exige qu'elle ne ressorte pas.
 *
 * ⚠️ **AUCUN TEST DE CE FICHIER N'OUVRE UNE CONNEXION.** Il n'éprouve que des
 *    fonctions pures et le calcul de chemin du relais. `fetch` n'y est ni appelé
 *    ni simulé : ce qui a besoin du réseau se mesure avec les sondes, pas avec
 *    une garde.
 *
 * ⚠️ **CHAQUE TEST ANNONCE SON COMPTE.** Un test qui dirait seulement « conforme »
 *    serait vert le jour où il ne confronte plus rien — c'est la panne que ce
 *    dépôt mesure ailleurs, six fois.
 */

import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CAVIARDE,
  NOMS_DES_SECRETS,
  REGLAGES,
  ValeurSecrete,
  caviarderAdresse,
  cheminDuRelais,
  comparerLesCorps,
  ErreurDeSonde,
  estLePointDEntree,
  normaliserCorps,
  racineDuDepot,
  rendreLeReleve,
  servirLeReleve,
  verdictDEnsemble,
  type Releve,
} from "./commun.js";

/**
 * LE TÉMOIN — une valeur qui ne peut venir de nulle part ailleurs.
 *
 * Assez longue pour passer le seuil du filet anti-fuite (8 caractères), et
 * assez improbable pour qu'une correspondance fortuite soit exclue.
 */
const TEMOIN = "temoin-fabrique-9f3c1e7a-zoho-sonde";

/** Un environnement rendu à son état d'origine après chaque test. */
let sauvegarde: Record<string, string | undefined> = {};

function memoriser(noms: readonly string[]): void {
  sauvegarde = {};
  for (const nom of noms) sauvegarde[nom] = process.env[nom];
}

function restaurer(): void {
  for (const [nom, valeur] of Object.entries(sauvegarde)) {
    if (valeur === undefined) delete process.env[nom];
    else process.env[nom] = valeur;
  }
  sauvegarde = {};
}

// ═════════════════════════════════════════════════════════════════════════════
//  1 · UN SECRET NE PEUT PAS SORTIR PAR MÉGARDE
// ═════════════════════════════════════════════════════════════════════════════

describe("ValeurSecrete — les quatre voies de rendu sont fermées", () => {
  /**
   * ⚠️ **LES QUATRE VOIES SONT ÉNUMÉRÉES, ET LE COMPTE EST ANNONCÉ.** Une garde
   *    qui n'éprouverait que `${x}` serait verte alors que `console.error(x)`
   *    — la voie du diagnostic, celle qu'on emprunte le soir d'une panne —
   *    déverserait le jeton.
   */
  it("aucune des quatre voies de rendu ne laisse passer la valeur", () => {
    const secret = new ValeurSecrete("jeton d'épreuve", TEMOIN);

    const voies: readonly { readonly nom: string; readonly rendu: string }[] = [
      // ⚠️ LA RÈGLE `restrict-template-expressions` EST LEVÉE ICI, ET C'EST LE
      //    SUJET MÊME DU TEST. Elle interdit d'interpoler un objet parce qu'un
      //    objet y devient « [object Object] » ; ce test-ci exige au contraire
      //    que cette voie-là soit empruntée, puisque c'est celle qu'un
      //    développeur écrit sans y penser dans un message d'erreur. La lever
      //    ailleurs serait une porte ; la lever sur son propre témoin est la
      //    seule façon de l'éprouver.
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      { nom: "interpolation `${x}`", rendu: `${secret}` },
      { nom: "String(x)", rendu: String(secret) },
      { nom: "JSON.stringify(x)", rendu: JSON.stringify(secret) },
      {
        nom: "util.inspect (console.error)",
        rendu: String(
          (secret as unknown as Record<symbol, () => string>)[
            Symbol.for("nodejs.util.inspect.custom")
          ]?.call(secret),
        ),
      },
    ];

    console.log(
      `[sondes/secret] ${String(voies.length)} voie(s) de rendu confrontée(s) : ` +
        voies.map((v) => v.nom).join(" · "),
    );

    for (const voie of voies) {
      expect(voie.rendu, `la voie « ${voie.nom} » a laissé passer la valeur`).not.toContain(TEMOIN);
      expect(voie.rendu, `la voie « ${voie.nom} » ne rend pas le caviardage`).toContain(CAVIARDE);
    }
    expect(voies.length, "moins de quatre voies confrontées : la garde regarde trop peu").toBe(4);
  });

  /**
   * ⚠️ **LE TÉMOIN DE CONTRASTE — SANS LUI, LE TEST CI-DESSUS PASSE SUR UNE
   *    CLASSE VIDE.** Une `ValeurSecrete` qui ne retiendrait rien satisferait
   *    les quatre assertions précédentes en ne portant aucune valeur. Ce
   *    test-ci exige que la valeur SOIT là, et qu'elle sorte par l'unique porte
   *    nommée.
   */
  it("`devoiler()` — l'unique porte — rend bien la valeur", () => {
    const secret = new ValeurSecrete("jeton d'épreuve", TEMOIN);
    expect(secret.devoiler()).toBe(TEMOIN);
    expect(secret.longueur).toBe(TEMOIN.length);
    expect(secret.nom).toBe("jeton d'épreuve");
    console.log("[sondes/secret] témoin de contraste : la valeur est bien retenue et récupérable.");
  });

  it("une adresse est caviardée : jamais la partie locale entière", () => {
    const cas: readonly { readonly entree: string; readonly interdit: string }[] = [
      { entree: "contact@exemple.test", interdit: "contact@" },
      { entree: "w@exemple.test", interdit: "w@" },
      { entree: "pas-une-adresse", interdit: "pas-une-adresse" },
    ];
    for (const { entree, interdit } of cas) {
      expect(caviarderAdresse(entree)).not.toContain(interdit);
    }
    expect(caviarderAdresse("contact@exemple.test")).toContain("@exemple.test");
    console.log(`[sondes/adresse] ${String(cas.length)} adresse(s) confrontée(s), 0 fuite.`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  2 · LE RELAIS NE PEUT PAS TOMBER DANS LE DÉPÔT
// ═════════════════════════════════════════════════════════════════════════════

describe("cheminDuRelais — un dépôt PUBLIC ne reçoit rien", () => {
  beforeEach(() => {
    memoriser([REGLAGES.relais]);
  });
  afterEach(restaurer);

  /**
   * ⚠️ **LE TÉMOIN EST FABRIQUÉ SOUS LA RACINE RÉELLE**, dérivée
   *    d'`import.meta.url` et non écrite ici. Un témoin posé sur un chemin codé
   *    en dur cesserait de mordre le jour où le dossier déménage — c'est le
   *    défaut mesuré ailleurs dans ce dossier de travail.
   */
  it("REFUSE un relais situé sous la racine du dépôt", () => {
    const racine = racineDuDepot();
    const dedans: readonly string[] = [
      resolve(racine, "relais.json"),
      resolve(racine, "adapters", "zoho-mail", "sondes", "relais.json"),
      resolve(racine, "dist", "relais.json"),
    ];
    for (const chemin of dedans) {
      process.env[REGLAGES.relais] = chemin;
      expect(() => cheminDuRelais(), `« ${chemin} » n'a PAS été refusé`).toThrow(ErreurDeSonde);
    }
    console.log(
      `[sondes/relais] ${String(dedans.length)} chemin(s) intérieur(s) confronté(s) sous ` +
        `${racine} — tous refusés.`,
    );
  });

  it("ACCEPTE un relais hors du dépôt, et retombe sur le répertoire temporaire", () => {
    const dehors = resolve(tmpdir(), "axion-ops-relais-epreuve.json");
    process.env[REGLAGES.relais] = dehors;
    expect(cheminDuRelais()).toBe(dehors);

    delete process.env[REGLAGES.relais];
    const defaut = cheminDuRelais();
    expect(defaut.startsWith(resolve(tmpdir()))).toBe(true);
    console.log(`[sondes/relais] témoin de contraste : 2 chemins extérieurs acceptés.`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  3 · LE FILET ANTI-FUITE EST TRAVERSÉ, ET IL COMPTE
// ═════════════════════════════════════════════════════════════════════════════

/** Un relevé fabriqué dont le constat porte la valeur qu'on veut voir retenue. */
function releveAvec(constat: string): Releve {
  return {
    sonde: "épreuve",
    titre: "relevé fabriqué",
    date: "2026-09-01T00:00:00.000Z",
    questions: [
      { question: "une question", verdict: "ÉTABLI", constat, decide: "rien", appuis: [] },
    ],
    appelsFaits: 1,
    plancherDAppels: 1,
  };
}

describe("servirLeReleve — le relevé passe par le filet de l'ADR 0044", () => {
  beforeEach(() => {
    memoriser(NOMS_DES_SECRETS);
    for (const nom of NOMS_DES_SECRETS) delete process.env[nom];
  });
  afterEach(restaurer);

  /**
   * ⚠️ **LE DÉFAUT FABRIQUÉ : UN SECRET RECOPIÉ DANS LE CONSTAT.** C'est ce
   *    qu'un `catch` bavard produit — « Zoho a répondu : … » avec l'en-tête
   *    d'autorisation dedans. Le filet doit le voir et REFUSER de servir.
   */
  it("REFUSE de servir un relevé qui contient une valeur sensible", () => {
    process.env[REGLAGES.clientSecret] = TEMOIN;
    expect(() => {
      servirLeReleve(releveAvec(`le serveur a répondu : ${TEMOIN}`));
    }).toThrow(/valeur\(s\) sensible\(s\)/u);
    console.log("[sondes/filet] 1 défaut fabriqué (secret recopié dans le constat) — refusé.");
  });

  /**
   * ⚠️ **ET LE DÉFAUT INVERSE, CELUI QUI SE VOIT LE MOINS : LE FILET QUI NE
   *    REGARDE RIEN.** Sans aucun secret dans l'environnement, `verifierAucuneFuite`
   *    ne confronte AUCUNE valeur et rend un verdict vide — parfaitement « vert ».
   *    L'ADR 0044 nomme cette panne ; `servirLeReleve` la transforme en refus.
   */
  it("REFUSE de servir quand le filet n'a confronté AUCUNE valeur", () => {
    expect(() => {
      servirLeReleve(releveAvec("aucun secret ici"));
    }).toThrow(/AUCUNE valeur/u);
    console.log(
      "[sondes/filet] témoin du « vert pour rien » : 0 valeur confrontée ⇒ relevé NON servi.",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  4 · LA COMPARAISON D'EMPREINTES — LE CŒUR DE LA SONDE ⑤
// ═════════════════════════════════════════════════════════════════════════════

describe("comparerLesCorps — trois cas qui mènent à trois décisions opposées", () => {
  it("sépare l'identité, la seule différence de blancs, et la vraie divergence", () => {
    const base = "Ligne une\nLigne deux\n";

    const identique = comparerLesCorps(base, base);
    expect(identique.identiques).toBe(true);
    expect(identique.premierEcart).toBeNull();
    expect(identique.empreinteA).toBe(identique.empreinteB);

    const blancs = comparerLesCorps(base, "Ligne une\r\nLigne deux\r\n");
    expect(blancs.identiques, "des fins de ligne différentes ne sont PAS identiques").toBe(false);
    expect(
      blancs.identiquesApresNormalisation,
      "après normalisation, seules les fins de ligne différaient",
    ).toBe(true);

    const vraie = comparerLesCorps(base, "Ligne une\nLigne DEUX\n");
    expect(vraie.identiques).toBe(false);
    expect(
      vraie.identiquesApresNormalisation,
      "une vraie divergence survit à la normalisation",
    ).toBe(false);
    expect(vraie.premierEcart, "le premier écart se situe au premier caractère qui change").toBe(
      "Ligne une\nLigne ".length,
    );
    expect(vraie.voisinageA.length).toBeGreaterThan(0);

    console.log(
      "[sondes/empreinte] 3 cas confrontés : identité · blancs seuls · divergence réelle — " +
        `premier écart mesuré au caractère ${String(vraie.premierEcart)}.`,
    );
  });

  it("`normaliserCorps` ne touche QUE les fins de ligne et les bords", () => {
    expect(normaliserCorps("a\r\nb")).toBe("a\nb");
    expect(normaliserCorps("  a\nb  ")).toBe("a\nb");
    // ⚠️ Le témoin qui compte : une espace INTERNE survit. Une normalisation qui
    //    l'écraserait rendrait invisible une modification du corps, et c'est
    //    exactement ce que le § 27 veut détecter.
    expect(normaliserCorps("a  b")).toBe("a  b");
    console.log("[sondes/empreinte] 3 normalisations confrontées, dont 1 témoin d'espace interne.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  5 · LE VERDICT D'ENSEMBLE EST DÉRIVÉ, ET UN COMPTE INSUFFISANT LE REND INDÉCIS
// ═════════════════════════════════════════════════════════════════════════════

describe("verdictDEnsemble — dérivé des questions, jamais écrit", () => {
  it("un compte d'appels sous le plancher rend INDÉCIS, même si tout est ÉTABLI", () => {
    const rien: Releve = { ...releveAvec("ok"), appelsFaits: 0, plancherDAppels: 1 };
    expect(verdictDEnsemble(rien), "0 appel = rien mesuré, jamais « établi »").toBe("INDÉCIS");

    const etabli = releveAvec("ok");
    expect(verdictDEnsemble(etabli)).toBe("ÉTABLI");

    const refute: Releve = {
      ...etabli,
      questions: [
        ...etabli.questions,
        { question: "q2", verdict: "RÉFUTÉ", constat: "non", decide: "rien", appuis: [] },
      ],
    };
    expect(verdictDEnsemble(refute), "un RÉFUTÉ domine").toBe("RÉFUTÉ");

    console.log("[sondes/verdict] 3 relevés fabriqués confrontés : 0 appel · établi · réfuté.");
  });

  it("le relevé rendu porte la date, le compte d'appels et le verdict", () => {
    const texte = rendreLeReleve(releveAvec("un constat"));
    for (const attendu of ["2026-09-01T00:00:00.000Z", "1 appel(s) réseau", "VERDICT D'ENSEMBLE"]) {
      expect(texte, `le relevé ne porte pas « ${attendu} »`).toContain(attendu);
    }
    console.log("[sondes/verdict] 3 mentions obligatoires confrontées dans le relevé rendu.");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  6 · LE POINT D'ENTRÉE ÉCHOUE DU CÔTÉ SÛR
// ═════════════════════════════════════════════════════════════════════════════

describe("estLePointDEntree — une sonde importée ne part pas", () => {
  it("rend faux pour un module qui n'est pas le fichier lancé", () => {
    // ⚠️ Sous vitest, `process.argv[1]` désigne l'exécuteur, jamais ce module.
    //    C'est précisément le cas qu'on veut voir rendre `false` : sans cette
    //    garde, importer une sonde suffirait à la faire partir sur le réseau.
    expect(estLePointDEntree(import.meta.url)).toBe(false);
    console.log(
      `[sondes/entrée] 1 module confronté (${import.meta.url.split("/").pop() ?? "?"}) — ` +
        "il ne se prend pas pour le point d'entrée.",
    );
  });
});

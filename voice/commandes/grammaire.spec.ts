import { describe, expect, it } from "vitest";

import { POLICY_LEVELS } from "../../core/types.js";
import {
  COMMANDES,
  GRAMMAIRE_VERSION,
  NOMS_COMMANDES,
  PLAFOND_COMMANDES,
  SCEAU_GRAMMAIRE,
  commande,
  declarerCommandes,
  empreinteGrammaire,
  estCommande,
  exigerCommande,
  peutElargir,
  type Commande,
  type EffetDeclare,
} from "./grammaire.js";

/**
 * GARDES DE LA GRAMMAIRE FERMÉE.
 *
 * ⚠️ DEUX ÉTAGES, ET IL FAUT LES DEUX — motif repris de `core/profiles/` :
 *
 *  · les tests de ce fichier tournent sous `pnpm test` ;
 *  · les `@ts-expect-error` du bloc « fermeture » ne sont vérifiés que par
 *    `pnpm typecheck`. Vitest transpile sans typer : ce bloc-là y passe
 *    toujours, et ce n'est PAS lui la garde. La garde vit dans `tsc`.
 */

/** Ce que rend une garde : le verdict ET le nombre d'éléments mesurés. */
interface Verdict {
  readonly mesures: number;
  readonly anomalies: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la table est bien formée
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Un nom de commande est écrit dans une ligne de journal (`ops.voix.<nom>`) et
 * relu en console. Un énoncé est prononcé, transcrit par un moteur, et comparé
 * par égalité : une majuscule ou une double espace y produirait deux valeurs
 * indiscernables à l'œil et distinctes à la comparaison.
 */
function verifierTable(commandes: readonly Commande[]): Verdict {
  const anomalies: string[] = [];
  const nomsVus = new Set<string>();
  const enoncesVus = new Set<string>();

  for (const entree of commandes) {
    if (nomsVus.has(entree.nom)) anomalies.push(`nom « ${entree.nom} » en double`);
    nomsVus.add(entree.nom);

    if (!/^[a-z][a-z0-9-]*$/.test(entree.nom)) {
      anomalies.push(`nom « ${entree.nom} » hors du jeu [a-z0-9-]`);
    }
    if (entree.enonce.trim().length === 0) {
      anomalies.push(`commande « ${entree.nom} » sans énoncé`);
    }
    if (entree.enonce !== entree.enonce.trim() || /\s{2,}/.test(entree.enonce)) {
      anomalies.push(`énoncé de « ${entree.nom} » : espaces de bord ou doublés`);
    }
    if (enoncesVus.has(entree.enonce)) {
      anomalies.push(`énoncé « ${entree.enonce} » en double`);
    }
    enoncesVus.add(entree.enonce);

    if (entree.source.trim().length === 0) {
      anomalies.push(`commande « ${entree.nom} » sans source — d'où sort-elle ?`);
    }
    if (!/^\d+\.\d+\.\d+$/.test(entree.depuis)) {
      anomalies.push(`commande « ${entree.nom} » : « depuis » n'est pas une version`);
    }

    // ⚠️ LA RÈGLE QUI PORTE LA SÉCURITÉ. Une commande capable d'élargir ne doit
    //    déclarer AUCUNE variante. `reconnaissance.ts` ne les lit pas pour elle ;
    //    cette garde-ci empêche qu'elles dorment là en attendant un futur
    //    reconnaisseur moins prudent.
    if (peutElargir(entree.effet) && entree.variantes.length > 0) {
      anomalies.push(
        `commande « ${entree.nom} » peut ÉLARGIR et déclare ${String(entree.variantes.length)} variante(s)`,
      );
    }
  }

  if (commandes.length > PLAFOND_COMMANDES) {
    anomalies.push(`${String(commandes.length)} commandes, plafond ${String(PLAFOND_COMMANDES)}`);
  }

  return { mesures: commandes.length, anomalies };
}

describe("voice/commandes — la table de la grammaire", () => {
  it("rougit sur un témoin fabriqué : doublon, majuscule, variante sur une commande qui élargit", () => {
    const temoin: readonly Commande[] = [
      {
        nom: "stop",
        enonce: "stop",
        variantes: [],
        effet: { axe: "outils", versProfil: null },
        source: "témoin",
        depuis: "1.0.0",
      },
      {
        nom: "stop",
        enonce: "stop ",
        variantes: [],
        effet: { axe: "outils", versProfil: null },
        source: "témoin",
        depuis: "1.0.0",
      },
      {
        nom: "ModeDev",
        enonce: "passe en mode dev",
        // La faute qui compte : elle élargit ET porte des variantes.
        variantes: ["mode dev", "dev"],
        effet: { axe: "outils", versProfil: "dev" },
        source: "témoin",
        depuis: "1",
      },
    ];

    const verdict = verifierTable(temoin);

    expect(verdict.mesures).toBe(3);
    console.info(
      `[garde table — témoin] ${String(verdict.mesures)} commandes mesurées, ` +
        `${String(verdict.anomalies.length)} anomalies : ${verdict.anomalies.join(" | ")}`,
    );
    expect(verdict.anomalies.length).toBeGreaterThanOrEqual(4);
    expect(verdict.anomalies.some((a) => a.includes("peut ÉLARGIR"))).toBe(true);
  });

  it("la grammaire du dépôt ne porte aucune anomalie, sur 5 commandes", () => {
    const verdict = verifierTable(COMMANDES);

    console.info(
      `[garde table] ${String(verdict.mesures)} commandes mesurées, 0 anomalie attendue`,
    );
    expect(verdict.mesures).toBe(5);
    expect(verdict.anomalies).toEqual([]);
    expect(NOMS_COMMANDES).toEqual(["stop", "annule", "verrouille", "brouillon-seul", "mode-dev"]);
  });

  it("chaque commande nomme sa source — quatre au § 30, la cinquième à l'ADR 0010", () => {
    const parSource = COMMANDES.map((entree) => ({
      nom: entree.nom,
      duCdc: entree.source.includes("§ 30"),
      deLAdr: entree.source.includes("ADR 0010"),
    }));

    const auCdc = parSource.filter((ligne) => ligne.duCdc).length;
    const aLAdr = parSource.filter((ligne) => ligne.deLAdr).length;

    console.info(
      `[garde sources] ${String(parSource.length)} commandes : ${String(auCdc)} citent le § 30, ` +
        `${String(aLAdr)} citent l'ADR 0010`,
    );

    // Chacune vient d'un document daté, aucune d'une intuition.
    expect(parSource.every((ligne) => ligne.duCdc || ligne.deLAdr)).toBe(true);
    expect(aLAdr).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — `peutElargir` est DÉRIVÉ, pas listé
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes — `peutElargir` se dérive de la structure de l'effet", () => {
  it("un ensemble d'arrivée VIDE ne peut jamais élargir ; un profil nommé, si", () => {
    expect(peutElargir({ axe: "outils", versProfil: null })).toBe(false);
    expect(peutElargir({ axe: "outils", versProfil: "dev" })).toBe(true);
    // Y compris vers le profil le moins exposant : ce n'est pas le profil visé
    // qui décide, c'est le fait qu'un profil soit visé. Le tri, lui, mesurera.
    expect(peutElargir({ axe: "outils", versProfil: "audit" })).toBe(true);
  });

  it("sur l'axe politique, seul le niveau LE PLUS STRICT ne peut pas élargir — dérivé de POLICY_LEVELS", () => {
    // La garde balaie TOUS les niveaux de l'énumération : elle ne peut pas se
    // taire le jour où un quatrième niveau apparaît.
    const verdicts = POLICY_LEVELS.map((niveau) => ({
      niveau,
      elargit: peutElargir({ axe: "politique", versNiveau: niveau }),
    }));

    const incapables = verdicts.filter((ligne) => !ligne.elargit);

    console.info(
      `[garde peutElargir/politique] ${String(verdicts.length)} niveaux mesurés ; ` +
        `${String(incapables.length)} incapable(s) d'élargir : ${incapables.map((l) => l.niveau).join(", ")}`,
    );

    expect(verdicts).toHaveLength(POLICY_LEVELS.length);
    // Exactement UN — le plus strict. Deux témoigneraient d'un ordre cassé.
    expect(incapables).toHaveLength(1);
    expect(incapables[0]?.niveau).toBe("brouillon");
  });

  it("lève sur un axe non classé — témoin fabriqué hors du type", () => {
    // Un axe qui n'a pas traversé le compilateur : une grammaire relue depuis
    // un autre dépôt, par exemple. Le `switch` exhaustif tombe alors dans son
    // `default`, et il LÈVE au lieu de rendre `false` — ce qui aurait fait
    // passer un axe inconnu pour inoffensif.
    const horsType = { axe: "inventé", vers: "n'importe quoi" } as unknown as EffetDeclare;
    expect(() => peutElargir(horsType)).toThrow(/axe d'effet non traité/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — validation de ce qui vient d'ailleurs
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes — validation au runtime", () => {
  it("`estCommande` accepte les 5 noms et refuse tout le reste", () => {
    const acceptes = NOMS_COMMANDES.filter((nom) => estCommande(nom));
    const intrus = ["mode-admin", "Stop", "stop ", "", "ops.voix.stop", null, 42, undefined];
    const refuses = intrus.filter((valeur) => !estCommande(valeur));

    console.info(
      `[garde estCommande] ${String(acceptes.length)} noms acceptés, ` +
        `${String(refuses.length)}/${String(intrus.length)} intrus refusés`,
    );
    expect(acceptes).toHaveLength(5);
    expect(refuses).toHaveLength(intrus.length);
  });

  it("`exigerCommande` lève en NOMMANT les commandes connues (§ 15)", () => {
    expect(() => exigerCommande("mode-admin", "une transcription")).toThrow(
      /Les 5 commandes connues \(grammaire 1\.0\.0\)/,
    );
    // La liste du message est DÉRIVÉE : elle doit contenir chaque nom réel.
    for (const nom of NOMS_COMMANDES) {
      expect(() => exigerCommande("inconnu", "ici")).toThrow(new RegExp(nom));
    }
    expect(exigerCommande("stop", "ici")).toBe("stop");
  });

  it("`commande()` rend l'entrée complète pour les 5 noms", () => {
    const entrees = NOMS_COMMANDES.map((nom) => commande(nom));
    console.info(`[garde commande()] ${String(entrees.length)} entrées résolues`);
    expect(entrees).toHaveLength(5);
    expect(entrees.map((entree) => entree.nom)).toEqual([...NOMS_COMMANDES]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — l'empreinte BOUGE, et seulement sur ce qui décide
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes — l'empreinte de la grammaire", () => {
  const reference = empreinteGrammaire();

  /** Une commande de base, à altérer champ par champ. */
  function base(): Commande[] {
    return COMMANDES.map((entree) => ({
      nom: entree.nom,
      enonce: entree.enonce,
      variantes: [...entree.variantes],
      effet: entree.effet,
      source: entree.source,
      depuis: entree.depuis,
    }));
  }

  it("le sceau est celui de la grammaire courante", () => {
    expect(SCEAU_GRAMMAIRE.version).toBe(GRAMMAIRE_VERSION);
    expect(SCEAU_GRAMMAIRE.empreinte).toBe(reference);
    expect(reference).toMatch(/^[0-9a-f]{64}$/);
  });

  it("BOUGE sur un énoncé, sur un effet, sur la version — les trois qui décident", () => {
    const temoins: { readonly quoi: string; readonly empreinte: string }[] = [];

    const enonceChange = base();
    const premier = enonceChange[0];
    if (premier === undefined) throw new Error("grammaire vide");
    enonceChange[0] = { ...premier, enonce: "stoppe tout" };
    temoins.push({ quoi: "énoncé", empreinte: empreinteGrammaire(enonceChange) });

    const effetChange = base();
    const dernier = effetChange[effetChange.length - 1];
    if (dernier === undefined) throw new Error("grammaire vide");
    // « passe en mode dev » viserait `admin` au lieu de `dev` : la surface
    // ouverte n'est plus la même, l'empreinte DOIT bouger.
    effetChange[effetChange.length - 1] = {
      ...dernier,
      effet: { axe: "outils", versProfil: "admin" },
    };
    temoins.push({ quoi: "effet", empreinte: empreinteGrammaire(effetChange) });

    temoins.push({ quoi: "version", empreinte: empreinteGrammaire(COMMANDES, "1.0.1") });

    const retrait = base().slice(0, 4);
    temoins.push({ quoi: "commande retirée", empreinte: empreinteGrammaire(retrait) });

    console.info(
      `[garde empreinte] ${String(temoins.length)} témoins d'altération, ` +
        `tous distincts de la référence attendus`,
    );
    for (const temoin of temoins) {
      expect(temoin.empreinte, `l'empreinte n'a pas bougé sur : ${temoin.quoi}`).not.toBe(
        reference,
      );
    }
    // Et distincts entre eux : une empreinte qui les confondrait ne dirait pas
    // laquelle des altérations a eu lieu.
    expect(new Set(temoins.map((t) => t.empreinte)).size).toBe(temoins.length);
  });

  it("NE BOUGE PAS sur une variante ni sur une source — de la prose, pas une décision", () => {
    const varianteAjoutee = base();
    const premier = varianteAjoutee[0];
    if (premier === undefined) throw new Error("grammaire vide");
    varianteAjoutee[0] = { ...premier, variantes: [...premier.variantes, "stoppe tout"] };

    const sourceReecrite = base();
    const second = sourceReecrite[1];
    if (second === undefined) throw new Error("grammaire vide");
    sourceReecrite[1] = { ...second, source: "reformulée" };

    console.info("[garde empreinte] 2 témoins de prose, empreinte inchangée attendue");
    expect(empreinteGrammaire(varianteAjoutee)).toBe(reference);
    expect(empreinteGrammaire(sourceReecrite)).toBe(reference);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — LA FERMETURE, vérifiée par `tsc` et non par vitest
// ─────────────────────────────────────────────────────────────────────────────

describe("voice/commandes — la fermeture de la grammaire", () => {
  it("conserve les littéraux déclarés", () => {
    const declarees = declarerCommandes(["stop", "verrouille"]);
    // Si le paramètre `const` disparaissait, ce serait `string[]` et la ligne
    // suivante ne compilerait plus.
    const premiere: "stop" = declarees[0];
    expect(premiere).toBe("stop");
    expect(declarees).toHaveLength(2);
  });

  it("refuse à la COMPILATION une commande inventée, une casse fautive, une liste vide", () => {
    // ═══ LA GARDE, DANS SA FORME EXACTE ═══
    //
    // Chaque `@ts-expect-error` est une assertion INVERSÉE : `tsc` échoue si
    // l'erreur attendue NE SE PRODUIT PLUS. Rouvrir la grammaire — élargir
    // `NomCommande` en `string`, retirer le tuple non vide — fait donc rougir
    // `pnpm typecheck`, et non `pnpm test`.
    //
    // ⚠️ MESURÉ, PAS SUPPOSÉ — 2026-09-01, ET LE COMPTE EST ANNONCÉ. En
    //    remplaçant, dans `grammaire.ts`,
    //    `export type NomCommande = (typeof COMMANDES)[number]["nom"]` par
    //    `export type NomCommande = string`, puis en exécutant `tsc --noEmit`,
    //    la sortie a été EXACTEMENT :
    //
    //      voice/commandes/grammaire.spec.ts(357,5): error TS2578: Unused '@ts-expect-error' directive.
    //      voice/commandes/grammaire.spec.ts(360,5): error TS2578: Unused '@ts-expect-error' directive.
    //      voice/commandes/grammaire.spec.ts(363,5): error TS2578: Unused '@ts-expect-error' directive.
    //
    //    Trois lignes sur quatre — les trois qui portent sur le NOM. La
    //    quatrième, la liste vide, N'A PAS bougé : elle tient au tuple non vide
    //    de `CommandesDeclarees`, pas à la fermeture du nom. Elle garde une
    //    AUTRE règle, et c'est pour cela qu'elle est écrite à part plutôt que
    //    comptée avec les trois autres.
    //
    //    ⚠️ La borne de cette mesure : les numéros de ligne ci-dessus valent
    //       pour la rédaction du jour. C'est le COMPTE — trois — qui est le
    //       fait, pas les numéros.

    // @ts-expect-error — « mode-admin » n'appartient pas à la grammaire fermée
    const invente = declarerCommandes(["mode-admin"]);

    // @ts-expect-error — la casse compte : « Stop » n'est pas « stop »
    const casse = declarerCommandes(["Stop"]);

    // @ts-expect-error — un seul intrus dans une liste par ailleurs valide suffit
    const melange = declarerCommandes(["stop", "mode-admin"]);

    // @ts-expect-error — un démon qui ne reconnaît AUCUNE commande fait passer
    //                    « stop » par le modèle : § 32 refuse exactement cela
    const vide = declarerCommandes([]);

    const temoins = [invente, casse, melange, vide];
    console.info(
      `[garde fermeture] ${String(temoins.length)} témoins de non-compilation posés ` +
        "(3 sur le nom, 1 sur le tuple non vide)",
    );
    expect(temoins).toHaveLength(4);
  });
});

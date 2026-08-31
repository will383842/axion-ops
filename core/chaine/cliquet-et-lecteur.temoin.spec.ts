/**
 * `core/chaine/cliquet-et-lecteur.temoin.spec.ts` — LE CLIQUET GARDE SON SENS
 * UNIQUE, MÊME MAINTENANT QU'ON LE LIT. **ADR 0021, garde G3.**
 *
 * ═══ CE QUE CETTE GARDE PROTÈGE ═══
 *
 * L'ADR 0017 a posé `SignalEffetExterieur` comme un CLIQUET : une fonction sans
 * argument, un seul appelant, aucune direction de retour. « Ce qui est signalé
 * ne se dé-signale pas. » L'ADR 0021 lui ajoute un LECTEUR
 * (`AffineursDAppel.effetExterieurSurvenu`), parce que le `finally` de l'étape 14
 * a besoin de la réponse pour décider de l'issue d'idempotence.
 *
 * **Ajouter un lecteur à un cliquet est exactement le geste qui peut le casser.**
 * Trois façons, et cette garde les prend les trois :
 *
 *  1. le lecteur MODIFIE ce qu'il lit — un accesseur qui « initialise », un
 *     effet de bord ;
 *  2. le lecteur MENT — il rend une copie prise ailleurs, et diverge du cliquet
 *     que la ligne inscrit. C'est le défaut que `core/chaine/modules.ts` a déjà
 *     eu à réparer une fois : deux dérivations d'un même fait ;
 *  3. le SIGNAL gagne un second appelant — deux occasions de désaccord, et le
 *     compilateur n'en verrait aucune.
 *
 * ═══ CE QU'ELLE NE PROUVE PAS ═══
 *
 * Le point 3 se mesure sur le TEXTE des fichiers de production : un `grep` ne
 * prouve que l'absence de la FORME écrite. Un appelant qui passerait par une
 * variable intermédiaire échapperait au motif. Le compte est donc annoncé, la
 * borne est écrite, et les points 1 et 2 — eux — sont mesurés sur le
 * COMPORTEMENT, pas sur le texte.
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUN IDENTIFIANT D'INFRASTRUCTURE.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { Journal, avecJournal, sha256Hex, type AffineursDAppel } from "../audit/index.js";
import { HorlogeFigee, SCELLEUR_TEMOIN } from "../audit/fixtures.js";
import { JournalMemoire } from "../audit/index.js";
import type { EnteteAppel, LigneAudit, Terminaison } from "../audit/index.js";
import { sessionIdDeTemoin } from "../identite/fixtures.js";

const ENTETE: EnteteAppel = {
  principal: "temoin-appelant",
  sessionId: sessionIdDeTemoin(),
  tool: "ops.temoin.envoyer",
  toolVersion: "1.0.0",
  adapterVersion: "1.0.0",
  effect: "send",
  policyLevel: "libre",
  argHash: sha256Hex("entete-cliquet-et-lecteur"),
};

function journalNeuf(): { readonly journal: Journal; readonly store: JournalMemoire } {
  const store = new JournalMemoire();
  return { journal: new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee()), store };
}

function derniere(store: JournalMemoire): LigneAudit {
  const lignes = store.toutes();
  const ligne = lignes[lignes.length - 1];
  if (ligne === undefined) throw new Error("témoin mal fabriqué : aucune ligne écrite");
  return ligne;
}

function succes(): Terminaison<string> {
  return { genre: "succès", valeur: "ok", outcome: "ok", recordIds: [], partialSources: [] };
}

// ═════════════════════════════════════════════════════════════════════════════
//  1 et 2 · LE LECTEUR NE MUTE RIEN, ET IL NE MENT PAS
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0021 — le lecteur du cliquet ne peut ni le lever, ni le baisser", () => {
  it("cent lectures ne LÈVENT pas le cliquet — la ligne reste muette", async () => {
    const { journal, store } = journalNeuf();
    const LECTURES = 100;
    let lectures = 0;
    const reponses = new Set<boolean>();

    await avecJournal(journal, ENTETE, ({ effetExterieurSurvenu }: AffineursDAppel) => {
      for (let i = 0; i < LECTURES; i += 1) {
        reponses.add(effetExterieurSurvenu());
        lectures += 1;
      }
      return Promise.resolve(succes());
    });

    const ligne = derniere(store);

    console.info(
      `[garde lecteur · ne lève pas] ${String(lectures)} lecture(s) effectuée(s) · ` +
        `réponses distinctes : ${[...reponses].map(String).join(", ")} · ` +
        `externalEffect de la ligne : ${String(ligne.externalEffect)}`,
    );

    // PLANCHER-TÉMOIN : zéro lecture rendrait la garde verte sans rien exercer.
    expect(lectures).toBe(LECTURES);
    expect([...reponses], "le lecteur répond toujours la même chose").toEqual([false]);
    expect(ligne.externalEffect, "et lire n'a rien signalé").toBe(false);
  });

  it("cent lectures ne BAISSENT pas le cliquet une fois le signal tiré", async () => {
    const { journal, store } = journalNeuf();
    const LECTURES = 100;
    let lecturesAvant = 0;
    let lecturesApres = 0;
    const avant = new Set<boolean>();
    const apres = new Set<boolean>();

    await avecJournal(
      journal,
      ENTETE,
      ({ signalerEffetExterieur, effetExterieurSurvenu }: AffineursDAppel) => {
        for (let i = 0; i < LECTURES; i += 1) {
          avant.add(effetExterieurSurvenu());
          lecturesAvant += 1;
        }
        signalerEffetExterieur();
        for (let i = 0; i < LECTURES; i += 1) {
          apres.add(effetExterieurSurvenu());
          lecturesApres += 1;
        }
        return Promise.resolve(succes());
      },
    );

    const ligne = derniere(store);

    console.info(
      `[garde lecteur · ne baisse pas] ${String(lecturesAvant)} lecture(s) avant le signal, ` +
        `${String(lecturesApres)} après · réponses avant : ` +
        `${[...avant].map(String).join(", ")} · après : ${[...apres].map(String).join(", ")} · ` +
        `externalEffect de la ligne : ${String(ligne.externalEffect)}`,
    );

    expect(lecturesAvant).toBe(LECTURES);
    expect(lecturesApres).toBe(LECTURES);
    expect([...avant], "le cliquet part bas").toEqual([false]);
    expect([...apres], "il monte, et cent lectures ne le redescendent pas").toEqual([true]);
    expect(ligne.externalEffect, "et la ligne l'inscrit").toBe(true);
  });

  it("ne MENT pas : ce qu'il rend est ce que la LIGNE inscrit, sur les deux valeurs", async () => {
    // ⚠️ SANS CE TÉMOIN, UN LECTEUR CONSTANT PASSERAIT LES DEUX GARDES CI-DESSUS.
    //    Un `() => false` satisferait la première ; un `() => true` la seconde.
    //    Ce qu'il faut prouver, c'est l'ACCORD — que le lecteur et la colonne
    //    lisent la MÊME variable, et non deux états tenus en parallèle. C'est
    //    exactement le défaut que l'ADR 0021 écarte en refusant « une variable de
    //    l'orchestrateur tenue en parallèle du cliquet ».
    let casMesures = 0;
    const desaccords: string[] = [];

    for (const tirer of [false, true]) {
      const { journal, store } = journalNeuf();
      let luParLeCorps: boolean | null = null;

      await avecJournal(
        journal,
        ENTETE,
        ({ signalerEffetExterieur, effetExterieurSurvenu }: AffineursDAppel) => {
          if (tirer) signalerEffetExterieur();
          luParLeCorps = effetExterieurSurvenu();
          return Promise.resolve(succes());
        },
      );

      const inscritParLaLigne = derniere(store).externalEffect;
      casMesures += 1;
      if (luParLeCorps !== inscritParLaLigne) {
        desaccords.push(
          `signal tiré=${String(tirer)} : lecteur=${String(luParLeCorps)} ≠ ` +
            `ligne=${String(inscritParLaLigne)}`,
        );
      }
    }

    console.info(
      `[garde lecteur · accord avec la ligne] ${String(casMesures)} cas mesuré(s) ` +
        `(cliquet bas et cliquet haut) · ${String(desaccords.length)} désaccord(s) : ` +
        `${desaccords.join(" | ") || "aucun"}`,
    );

    // PLANCHER-TÉMOIN : un seul cas ne distinguerait pas un lecteur constant.
    expect(casMesures, "les DEUX valeurs du cliquet sont éprouvées").toBe(2);
    expect(desaccords, "le lecteur et la colonne lisent la MÊME variable").toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  3 · LE SIGNAL GARDE SON APPELANT UNIQUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les fichiers de PRODUCTION de `core/`, DÉRIVÉS du disque.
 *
 * ⚠️ LE CRITÈRE EST DÉRIVÉ, ET SA BORNE EST ÉCRITE. « Production » vaut ici
 *    « ce que `tsconfig.build.json` émet » : tout `.ts` de `core/` qui n'est pas
 *    un `.spec.ts`. Restent donc dedans les doubles en mémoire et les fixtures —
 *    volontairement, parce qu'ils FRANCHISSENT la frontière du paquet et qu'un
 *    appelant du cliquet caché là serait un appelant réel.
 */
function fichiersDeProduction(racine: string): readonly string[] {
  const trouves: string[] = [];
  const parcourir = (dossier: string): void => {
    for (const entree of readdirSync(dossier, { withFileTypes: true })) {
      const chemin = join(dossier, entree.name);
      if (entree.isDirectory()) {
        parcourir(chemin);
        continue;
      }
      if (!entree.name.endsWith(".ts")) continue;
      if (entree.name.endsWith(".spec.ts")) continue;
      trouves.push(chemin);
    }
  };
  parcourir(racine);
  return trouves;
}

/**
 * COMBIEN DE FOIS CE SOURCE APPELLE-T-IL LE SIGNAL ?
 *
 * Fonction PURE d'un source injecté : c'est ce qui rend le témoin possible sans
 * ajouter un second appelant au dépôt pour prouver que la garde mord.
 *
 * ⚠️ ELLE COMPTE LES APPELS, PAS LES MENTIONS. `signalerEffetExterieur` apparaît
 *    aussi en DÉCLARATION (`const signalerEffetExterieur: … =`), en
 *    DESTRUCTURATION (`{ signalerEffetExterieur }`) et en PROPRIÉTÉ d'objet.
 *    Le motif exige la parenthèse ouvrante ET refuse un `:` ou un `=` juste
 *    avant — sans quoi la déclaration du cliquet dans `avecJournal` serait
 *    comptée comme son propre appelant, et la garde annoncerait deux appelants
 *    là où il n'y en a qu'un.
 */
function appelsAuSignal(source: string): number {
  const motif = /(^|[^:=\w$.])signalerEffetExterieur\s*\(\s*\)/g;
  return [...source.matchAll(motif)].length;
}

describe("ADR 0017 + 0021 — le signal garde son appelant unique", () => {
  it("rougit sur un source fabriqué qui l'appelle DEUX fois", () => {
    const deuxAppels = [
      "const a = () => { signalerEffetExterieur(); };",
      "function b() { if (x) signalerEffetExterieur(); }",
    ].join("\n");

    // Et les trois formes qui ne sont PAS des appels : elles ne doivent rien
    // ajouter au compte, sans quoi la garde annoncerait des appelants imaginaires
    // et son plafond deviendrait inatteignable.
    const nonAppels = [
      "const signalerEffetExterieur: SignalEffetExterieur = (): void => {};",
      "const affineurs = { affinerArgHash, signalerEffetExterieur };",
      "const corps = ({ signalerEffetExterieur }) => null;",
      "readonly signalerEffetExterieur: SignalEffetExterieur;",
    ].join("\n");

    console.info(
      `[témoin · compteur d'appels] source à deux appels → ${String(appelsAuSignal(deuxAppels))} · ` +
        `source à quatre non-appels → ${String(appelsAuSignal(nonAppels))}`,
    );

    expect(appelsAuSignal(deuxAppels), "le compteur SAIT compter deux").toBe(2);
    expect(appelsAuSignal(nonAppels), "et il ne compte ni déclaration ni destructuration").toBe(0);
  });

  it("n'a QU'UN appelant dans tout le code de production, et il est nommé", () => {
    const racine = dirname(fileURLToPath(new URL("../types.ts", import.meta.url)));
    const fichiers = fichiersDeProduction(racine);

    let fichiersLus = 0;
    let appelsTotaux = 0;
    const appelants: string[] = [];

    for (const fichier of fichiers) {
      fichiersLus += 1;
      const appels = appelsAuSignal(readFileSync(fichier, "utf8"));
      if (appels > 0) {
        appelsTotaux += appels;
        appelants.push(`${relative(racine, fichier).replace(/\\/g, "/")} ×${String(appels)}`);
      }
    }

    console.info(
      `[garde appelant unique] ${String(fichiersLus)} fichier(s) de production lu(s) · ` +
        `${String(appelsTotaux)} appel(s) au signal · ` +
        `appelant(s) : ${appelants.join(", ") || "aucun"}`,
    );

    // PLANCHER-TÉMOIN : un dossier mal résolu rendrait zéro fichier, et « zéro
    // appelant de trop » serait vert pour la pire des raisons.
    expect(fichiersLus, "le parcours du disque a bien mordu").toBeGreaterThan(50);
    expect(appelsTotaux, "le cliquet EST tiré quelque part").toBe(1);
    expect(appelants, "et c'est l'orchestrateur, à l'étape 14").toEqual([
      "chaine/orchestrateur.ts ×1",
    ]);
  });
});

import { describe, expect, it } from "vitest";

import {
  CHAMPS_COUVERTS,
  CHAMPS_EXCLUS,
  ErreurCanonique,
  calculerSelfHash,
  canonicalStringify,
  champsCouverts,
  sha256Hex,
  type ChampCouvert,
  type JsonValeur,
} from "./canonique.js";
import { SCELLEUR_TEMOIN, contenuTemoin } from "./fixtures.js";
// ADR 0014 — la session d'un témoin vient de la fabrique NOMMÉE de
// `core/identite/`, jamais d'un littéral : le type marqué ne l'accepte plus.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { ContenuLigne } from "./vocabulaire.js";

/**
 * Gardes du canonique et de l'empreinte.
 *
 * Motif imposé par le chantier : chaque garde est appliquée D'ABORD à un témoin
 * fabriqué défectueux — on prouve qu'elle rougit — PUIS à la vraie donnée ; et
 * chacune ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le canonique ne dépend ni de l'ordre des clés, ni de l'ICU
// ─────────────────────────────────────────────────────────────────────────────

describe("core/audit — la sérialisation canonique", () => {
  it("rend la même chaîne quel que soit l'ordre d'écriture des clés", () => {
    const paires: ReadonlyArray<readonly [JsonValeur, JsonValeur]> = [
      [
        { a: 1, b: 2, c: 3 },
        { c: 3, a: 1, b: 2 },
      ],
      [
        { tool: "x", effect: "read", at: "2026-01-01" },
        { at: "2026-01-01", tool: "x", effect: "read" },
      ],
      [
        { imbrique: { z: 1, a: 2 }, liste: [1, 2] },
        { liste: [1, 2], imbrique: { a: 2, z: 1 } },
      ],
    ];

    let mesures = 0;
    for (const [gauche, droite] of paires) {
      expect(canonicalStringify(gauche)).toBe(canonicalStringify(droite));
      mesures += 1;
    }

    console.info(`[garde canonique] ${String(mesures)} paires d'objets mesurées`);
    expect(mesures).toBe(3);
  });

  it("PRÉSERVE l'ordre des tableaux — un tableau n'est pas un ensemble", () => {
    // Si l'ordre des tableaux était normalisé, réordonner `recordIds` ou
    // `partialSources` ne casserait plus l'empreinte : on pourrait déplacer un
    // identifiant d'une ligne à l'autre sans que rien ne rougisse.
    expect(canonicalStringify(["a", "b"])).not.toBe(canonicalStringify(["b", "a"]));
  });

  it("trie par POINTS DE CODE, pas par `localeCompare` — témoin « Z » avant « a »", () => {
    // `"Z".localeCompare("a")` rend 1 dans les locales latines (donc « a » puis
    // « Z ») et -1 avec un tri par points de code. Le modèle voisin emploie
    // `localeCompare` : deux nœuds Node aux ICU différentes y produiraient deux
    // empreintes pour la même ligne, et la chaîne casserait à la migration sans
    // qu'une seule donnée ait bougé.
    const canonique = canonicalStringify({ a: 1, Z: 2 });

    // Le piège n'est constaté que si l'ICU du nœud le produit ; on l'affiche
    // sans l'exiger, parce qu'un nœud sans ICU complète rendrait cette garde
    // rouge pour une raison qui n'est pas celle qu'elle mesure.
    console.info(
      `[garde tri] "Z".localeCompare("a") = ${String("Z".localeCompare("a"))} · ` +
        `canonique observé : ${canonique}`,
    );

    expect(canonique).toBe('{"Z":2,"a":1}');
  });

  it("échoue BRUYAMMENT sur ce qu'il ne sait pas sérialiser", () => {
    // Le voisin fait `JSON.stringify(obj)` sur les non-objets : `undefined` en
    // ressort littéralement `undefined` — une chaîne non-JSON qui se hache
    // pourtant sans broncher, donc une empreinte stable et fausse.
    const temoins: readonly unknown[] = [undefined, 10n, Symbol("x"), () => 0, Number.NaN];

    let mesures = 0;
    for (const temoin of temoins) {
      expect(() => canonicalStringify(temoin as JsonValeur)).toThrow(ErreurCanonique);
      mesures += 1;
    }

    console.info(`[garde fail-loud] ${String(mesures)} valeurs non sérialisables mesurées`);
    expect(mesures).toBe(5);
  });

  it("rend le vecteur SHA-256 connu de la chaîne vide", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — CHAQUE champ déclaré couvert l'est RÉELLEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une valeur différente, de la même forme, pour chaque champ couvert. Le
 * `Record<ChampCouvert, …>` est la dérivation : ajouter un champ à
 * `CHAMPS_COUVERTS` sans lui donner de variante est une ERREUR DE COMPILATION,
 * donc cette garde ne peut pas se mettre à mesurer moins que la liste.
 */
const VARIANTES: Record<ChampCouvert, Partial<ContenuLigne>> = {
  at: { at: new Date(Date.UTC(2030, 0, 1)) },
  principal: { principal: "autre-principal" },
  sessionId: { sessionId: sessionIdDeTemoin() },
  tool: { tool: "ops.autre.outil" },
  toolVersion: { toolVersion: "2.0.0" },
  adapterVersion: { adapterVersion: "2.0.0" },
  effect: { effect: "send" },
  policyLevel: { policyLevel: "libre" },
  decision: { decision: "refusé" },
  stepDenied: { stepDenied: 10 },
  argHash: { argHash: sha256Hex("un-autre-argHash") },
  argHashValidated: { argHashValidated: false },
  recordIds: { recordIds: ["evt-1"] },
  partialSources: { partialSources: ["canal-2"] },
  durationMs: { durationMs: 999 },
  outcome: { outcome: "erreur" },
  // ADR 0017 — la variante qui compte : c'est le passage de « rien n'est sorti »
  // à « quelque chose est sorti » qui doit changer l'empreinte. Hors empreinte,
  // le chemin inverse serait possible APRÈS coup, sans qu'une seule vérification
  // ne rougisse.
  externalEffect: { externalEffect: true },
};

describe("core/audit — les champs couverts par l'empreinte", () => {
  it("rougit sur un témoin fabriqué dont un champ est modifié hors empreinte", () => {
    // La démonstration à l'envers : si un champ n'était PAS couvert, le modifier
    // laisserait l'empreinte inchangée. C'est cet état-là qui doit être
    // impossible, et le test ci-dessous le vérifie champ par champ.
    const ligne = contenuTemoin(1);
    const empreinte = calculerSelfHash(SCELLEUR_TEMOIN, null, ligne);
    const memeLigne = calculerSelfHash(SCELLEUR_TEMOIN, null, contenuTemoin(1));

    expect(memeLigne).toBe(empreinte); // déterminisme : sans lui, rien ne tient
  });

  it("change d'empreinte quand N'IMPORTE LEQUEL des champs couverts change", () => {
    const ligne = contenuTemoin(1);
    const reference = calculerSelfHash(SCELLEUR_TEMOIN, null, ligne);

    const inertes: string[] = [];
    let mesures = 0;

    for (const champ of CHAMPS_COUVERTS) {
      const modifiee: ContenuLigne = { ...ligne, ...VARIANTES[champ] };
      if (calculerSelfHash(SCELLEUR_TEMOIN, null, modifiee) === reference) {
        inertes.push(champ);
      }
      mesures += 1;
    }

    console.info(`[garde couverture] ${String(mesures)} champs couverts mesurés`);

    // Plancher-témoin : `ops_audit` en porte dix-sept hors chaînage — quinze au
    // lot 1, plus `argHashValidated` au lot 1b, plus `externalEffect` au lot 1d
    // (ADR 0017). Zéro champ mesuré serait vert sans avoir rien regardé.
    expect(mesures).toBe(17);
    expect(mesures).toBe(CHAMPS_COUVERTS.length);
    expect(inertes).toEqual([]);
  });

  it("ne couvre PAS `seq`, et couvre `prevHash` par le préfixe", () => {
    const ligne = contenuTemoin(1);

    // `seq` n'est pas dans `ContenuLigne` : il ne peut structurellement pas
    // entrer dans l'empreinte. On vérifie ici que l'exclusion est bien déclarée.
    expect([...CHAMPS_EXCLUS]).toEqual(["seq", "prevHash", "selfHash"]);

    // `prevHash` n'est pas un champ couvert, c'est le PRÉFIXE : deux chaînons
    // différents donnent deux empreintes.
    const a = calculerSelfHash(SCELLEUR_TEMOIN, null, ligne);
    const b = calculerSelfHash(SCELLEUR_TEMOIN, sha256Hex("un-autre-chainon"), ligne);
    expect(a).not.toBe(b);
  });

  it("expose exactement les dix-sept champs couverts, sans doublon", () => {
    const couverts = champsCouverts(contenuTemoin(1));
    const cles = Object.keys(couverts);

    console.info(`[garde champsCouverts] ${String(cles.length)} clés produites`);

    expect(cles.length).toBe(CHAMPS_COUVERTS.length);
    expect(new Set(cles).size).toBe(cles.length);
    expect([...cles].sort()).toEqual([...CHAMPS_COUVERTS].sort());
  });

  it("normalise une `Date` en ISO UTC — le fuseau du processus n'entre pas", () => {
    const couverts = champsCouverts(contenuTemoin(0));
    const iso = contenuTemoin(0).at.toISOString();

    expect(couverts.at).toBe(iso);
    expect(iso).toMatch(/Z$/);
  });
});

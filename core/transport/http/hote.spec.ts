/**
 * `core/transport/http/hote.spec.ts` — **LA GARDE DE L'ÉTAPE 1.**
 *
 * Elle tient trois propriétés, et chacune a son témoin fabriqué :
 *
 *  1. un hôte hors liste blanche est REFUSÉ, et un hôte admis est ACCORDÉ —
 *     sans quoi la garde ne mesurerait qu'une moitié du contrôle ;
 *  2. une liste vide LÈVE au lieu de rendre un tableau vide — c'est le mode de
 *     défaillance nommé par l'ADR 0025, et il ne se voit qu'en l'exerçant ;
 *  3. **`verifierLHote` ne peut pas rendre `autorise: true` avec zéro entrée
 *     confrontée** — la garde verte parce qu'elle ne regarde rien.
 */

import { describe, expect, it } from "vitest";

import { ErreurListeBlancheVide, listeBlancheDHotes, verifierLHote } from "./hote.js";

describe("§ 11, étape 1 — l'en-tête `Host` confronté à la liste blanche", () => {
  it("accorde, refuse, et ANNONCE combien d'entrées ont été confrontées", () => {
    const liste = listeBlancheDHotes("socle.stub.invalid, autre.stub.invalid:8443");

    const cas: ReadonlyArray<readonly [string, string | undefined, boolean]> = [
      ["un hôte de la liste", "socle.stub.invalid", true],
      [
        "le même, en majuscules — un nom d'hôte est insensible à la casse",
        "SOCLE.STUB.INVALID",
        true,
      ],
      ["le même, entouré d'espaces", "  socle.stub.invalid  ", true],
      ["un hôte de la liste, avec son port", "autre.stub.invalid:8443", true],
      [
        "le même hôte, MAIS UN AUTRE PORT — c'est un autre service",
        "autre.stub.invalid:9999",
        false,
      ],
      ["un hôte absent de la liste", "attaquant.stub.invalid", false],
      [
        "un sous-domaine — la comparaison est exacte, jamais un suffixe",
        "x.socle.stub.invalid",
        false,
      ],
      ["l'en-tête absent", undefined, false],
      ["l'en-tête vide", "", false],
    ];

    const desaccords: string[] = [];
    let confrontationsTotales = 0;
    for (const [nom, recu, attendu] of cas) {
      const verdict = verifierLHote(recu, liste);
      confrontationsTotales += verdict.entreesConfrontees;
      if (verdict.autorise !== attendu) {
        desaccords.push(`${nom} : ${String(verdict.autorise)} au lieu de ${String(attendu)}`);
      }
      // La boucle ne sort JAMAIS par anticipation : le compte est le même sur un
      // accord et sur un refus. Une mesure qui varierait avec le résultat ne
      // dirait plus rien du travail réellement fait.
      if (verdict.entreesConfrontees !== liste.length) {
        desaccords.push(
          `${nom} : ${String(verdict.entreesConfrontees)} entrée(s) confrontée(s) au lieu de ` +
            `${String(liste.length)} — la boucle a court-circuité`,
        );
      }
    }

    console.info(
      `[étape 1 · hôte] ${String(liste.length)} entrée(s) retenue(s) dans la liste blanche · ` +
        `${String(cas.length)} cas éprouvé(s) · ` +
        `${String(confrontationsTotales)} confrontation(s) au total · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Planchers : une liste vide ou un jeu de cas vide rendrait tout vert.
    expect(liste.length).toBe(2);
    expect(cas.length).toBeGreaterThanOrEqual(8);
    expect(confrontationsTotales).toBe(liste.length * cas.length);
    expect(desaccords).toEqual([]);
  });

  it("dédoublonne la liste, pour que le compte dise des hôtes DISTINCTS", () => {
    const liste = listeBlancheDHotes("a.stub.invalid, a.stub.invalid , A.STUB.INVALID");
    console.info(
      `[étape 1 · doublons] 3 entrée(s) brute(s) · ${String(liste.length)} retenue(s) · ` +
        `${String(verifierLHote("a.stub.invalid", liste).entreesConfrontees)} confrontée(s)`,
    );
    expect(liste).toEqual(["a.stub.invalid"]);
  });
});

describe("§ 11 — une liste blanche VIDE est un refus, jamais un « tout autoriser »", () => {
  it("LÈVE sur les quatre écritures d'une liste vide, et le témoin le prouve", () => {
    const temoins: ReadonlyArray<readonly [string, string | undefined]> = [
      ["la variable est absente", undefined],
      ["la variable est vide", ""],
      ["la variable ne porte que des espaces", "   "],
      ["la variable ne porte que des séparateurs", " , , "],
    ];

    const manquees: string[] = [];
    let entreesLuesTotales = 0;
    for (const [nom, brut] of temoins) {
      try {
        listeBlancheDHotes(brut);
        manquees.push(nom);
      } catch (erreur: unknown) {
        if (!(erreur instanceof ErreurListeBlancheVide)) {
          manquees.push(`${nom} : levée d'un autre genre`);
          continue;
        }
        entreesLuesTotales += erreur.entreesLues;
        // Le message ne recopie AUCUNE valeur lue : il nomme la variable et le
        // geste. Une liste d'hôtes est une carte de l'infrastructure.
        if (brut !== undefined && brut.length > 0 && erreur.message.includes(brut)) {
          manquees.push(`${nom} : le message recopie la valeur lue`);
        }
      }
    }

    console.info(
      `[étape 1 · liste vide] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(entreesLuesTotales)} entrée(s) brute(s) lue(s) au total · ` +
        `${String(manquees.length)} manquée(s)`,
    );

    expect(temoins.length).toBeGreaterThanOrEqual(4);
    expect(manquees).toEqual([]);
  });

  it("ne peut pas accorder avec ZÉRO entrée confrontée — la garde verte pour rien", () => {
    // On force le cas que `listeBlancheDHotes` interdit : un tableau vide
    // construit ailleurs. C'est le témoin de la règle fail-closed.
    const verdict = verifierLHote("socle.stub.invalid", []);
    console.info(
      `[étape 1 · fail-closed] ${String(verdict.entreesConfrontees)} entrée(s) confrontée(s) · ` +
        `autorisé : ${String(verdict.autorise)}`,
    );
    expect(verdict.entreesConfrontees).toBe(0);
    expect(verdict.autorise).toBe(false);
  });
});

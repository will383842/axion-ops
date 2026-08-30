import { describe, expect, it } from "vitest";

import {
  analyserScope,
  GENRES_SCOPE,
  nomQualifie,
  referenceDepuisNom,
  scopeCouvre,
  scopeDomine,
  scopesCouvrants,
  specificite,
  type ReferenceOutil,
} from "./scope.js";

/**
 * Gardes de la grammaire de `scope` (§ 12, règle 1).
 *
 * Motif imposé par la Fondation : chaque garde est une fonction pure appliquée
 * d'ABORD à un témoin fabriqué défectueux — on prouve qu'elle rougit — PUIS à la
 * vraie donnée, et elle ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS.
 */

interface Verdict {
  readonly mesures: number;
  readonly anomalies: readonly string[];
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la grammaire n'admet que trois formes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Chaque cas porte le verdict attendu. La garde ne vérifie pas « ça marche »,
 * elle vérifie que chaque forme tombe DU CÔTÉ ANNONCÉ — une garde qui n'accepte
 * que des cas valides ne prouve jamais qu'elle sait refuser.
 */
function verifierGrammaire(cas: ReadonlyArray<readonly [string, boolean]>): Verdict {
  const anomalies: string[] = [];
  for (const [scope, attenduValide] of cas) {
    const obtenu = analyserScope(scope).valide;
    if (obtenu !== attenduValide) {
      anomalies.push(
        `« ${scope} » : attendu ${attenduValide ? "valide" : "invalide"}, obtenu ${obtenu ? "valide" : "invalide"}`,
      );
    }
  }
  return { mesures: cas.length, anomalies };
}

describe("core/policy/scope — la grammaire du § 12", () => {
  it("rougit sur un témoin fabriqué dont l'attente est fausse", () => {
    // Témoin : on affirme que `*` est invalide. Si la garde ne rougit pas ici,
    // elle ne regarde rien.
    const verdict = verifierGrammaire([["*", false]]);

    expect(verdict.mesures).toBe(1);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("accepte les trois formes du CDC et refuse tout le reste", () => {
    const cas: ReadonlyArray<readonly [string, boolean]> = [
      // Les trois formes nommées par le § 12.
      ["*", true],
      ["zoho.*", true],
      ["zoho.mail.*", true],
      ["zoho.mail.send", true],
      ["axionia.agenda.poser", true],
      // Et tout ce qui n'en est pas.
      ["", false],
      ["zoho", false], // un seul segment : ni adaptateur.* ni adapterId.tool
      ["*.send", false], // l'étoile n'est admise qu'en tête seule ou en suffixe
      ["zoho.*.send", false],
      ["zoho..send", false],
      ["Zoho.Mail.Send", false], // majuscules hors alphabet
      ["zoho.mail.", false],
      [".zoho.mail", false],
      ["zoho mail.send", false],
      ["**", false],
    ];

    const verdict = verifierGrammaire(cas);

    console.info(`[garde grammaire] ${String(verdict.mesures)} scopes mesurés`);

    // Plancher-témoin : au moins les trois formes valides et cinq refus.
    expect(verdict.mesures).toBeGreaterThanOrEqual(15);
    expect(verdict.anomalies).toEqual([]);
  });

  it("classe chaque forme valide dans l'un des trois genres, et rien d'autre", () => {
    const genres = new Set<string>(GENRES_SCOPE);
    const valides = ["*", "zoho.*", "zoho.mail.*", "zoho.mail.send"];

    let mesures = 0;
    for (const scope of valides) {
      const analyse = analyserScope(scope);
      expect(analyse.valide, scope).toBe(true);
      if (analyse.valide) {
        expect(genres.has(analyse.genre), `${scope} → ${analyse.genre}`).toBe(true);
        mesures += 1;
      }
    }

    console.info(`[garde genres] ${String(mesures)} scopes classés`);
    expect(mesures).toBe(valides.length);
    expect(GENRES_SCOPE).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — la couverture, et l'ambiguïté d'un adapterId à points
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/scope — couverture d'un outil", () => {
  const reference: ReferenceOutil = { adapterId: "zoho.mail", tool: "send" };

  it("rougit sur un témoin où le scope ne couvre pas ce qu'on affirme", () => {
    // Témoin fabriqué : un adaptateur voisin. Si `scopeCouvre` rendait vrai
    // ici, la politique d'un adaptateur s'appliquerait à un autre.
    expect(scopeCouvre("zoho.calendar.*", reference)).toBe(false);
    expect(scopeCouvre("zoho.mail.forward", reference)).toBe(false);
  });

  it("couvre par les trois scopes du § 12, et par aucun autre", () => {
    const couvrants = scopesCouvrants(reference);

    console.info(`[garde couverture] ${String(couvrants.length)} scopes couvrants mesurés`);

    expect(couvrants).toEqual(["*", "zoho.mail.*", "zoho.mail.send"]);
    for (const scope of couvrants) {
      expect(scopeCouvre(scope, reference), scope).toBe(true);
    }

    // Le PIÈGE de l'adapterId à points : un découpage naïf sur le premier point
    // ferait de `zoho` l'adaptateur, et `zoho.*` couvrirait alors `zoho.mail.send`.
    // Ce n'est PAS le cas — et si ça le devenait, une politique posée sur
    // l'adaptateur agenda s'appliquerait au courrier.
    expect(scopeCouvre("zoho.*", reference)).toBe(false);
  });

  it("reconnaît un nom d'outil déjà qualifié sans jamais deviner où couper", () => {
    const depuisQualifie = referenceDepuisNom("zoho.mail", "zoho.mail.send");
    const depuisLocal = referenceDepuisNom("zoho.mail", "send");

    expect(depuisQualifie).toEqual(depuisLocal);
    expect(nomQualifie(depuisQualifie)).toBe("zoho.mail.send");

    // Un préfixe qui RESSEMBLE sans correspondre n'est pas retiré : on
    // reconnaît, on ne devine pas.
    expect(referenceDepuisNom("zoho.mail", "zoho.mailer.send")).toEqual({
      adapterId: "zoho.mail",
      tool: "zoho.mailer.send",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — la domination, et l'interdit de la « spécificité gagnante »
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/scope — domination", () => {
  it("rougit sur un témoin où l'étroit prétendrait dominer le large", () => {
    expect(scopeDomine("zoho.mail.send", "*")).toBe(false);
    expect(scopeDomine("zoho.mail.*", "*")).toBe(false);
  });

  it("fait dominer le large sur l'étroit, sur les seize paires possibles", () => {
    const scopes = ["*", "zoho.mail.*", "zoho.mail.send", "zoho.calendar.poser"];
    const attendu: Record<string, readonly string[]> = {
      "*": scopes,
      "zoho.mail.*": ["zoho.mail.*", "zoho.mail.send"],
      "zoho.mail.send": ["zoho.mail.send"],
      "zoho.calendar.poser": ["zoho.calendar.poser"],
    };

    let paires = 0;
    for (const gros of scopes) {
      for (const petit of scopes) {
        const attenduIci = (attendu[gros] ?? []).includes(petit);
        expect(scopeDomine(gros, petit), `${gros} ⊒ ${petit}`).toBe(attenduIci);
        paires += 1;
      }
    }

    console.info(`[garde domination] ${String(paires)} paires de scopes mesurées`);
    expect(paires).toBe(scopes.length ** 2);
  });

  it("ordonne la spécificité du plus large au plus étroit — POUR L'AFFICHAGE SEUL", () => {
    // § 12 dit « le PLUS STRICT gagne », jamais « le plus spécifique gagne ».
    // `specificite` existe pour trier un écran ; `niveau.spec.ts` porte la garde
    // qui interdit de s'en servir pour décider.
    expect(specificite("global")).toBeLessThan(specificite("adaptateur"));
    expect(specificite("adaptateur")).toBeLessThan(specificite("outil"));
  });
});

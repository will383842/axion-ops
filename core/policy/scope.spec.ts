import { describe, expect, it } from "vitest";

import {
  analyserReference,
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
 *
 * ═══ CE QUI A CHANGÉ AU LOT 1b ═══
 *
 * La grammaire est TRANCHÉE : le PREMIER point d'un scope sépare l'adaptateur
 * de l'outil, donc `adapterId` ne porte aucun point. `zoho.mail.send` est
 * l'outil `mail.send` de l'adaptateur `zoho` ; `zoho.mail.*` n'est plus un
 * scope. Les cas de ce fichier sont réécrits sur cette lecture — et la garde 4,
 * nouvelle, prouve qu'il ne reste PLUS QU'UNE dérivation de la couverture.
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
      ["zoho.mail.send", true],
      ["axionia.agenda.poser", true],
      // Un nom d'outil peut porter des points ; l'identifiant d'adaptateur, non.
      ["crm.contact.fiche.lire", true],
      // ⚖️ LA DÉCISION DU LOT 1b, ÉCRITE COMME UN CAS : un identifiant
      //    d'adaptateur à points n'est pas un adaptateur. C'était la forme qui
      //    faisait diverger `scopeCouvre` et `scopeDomine`.
      ["zoho.mail.*", false],
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

  it("dit POURQUOI un identifiant d'adaptateur à points est refusé — pas seulement qu'il l'est", () => {
    // § 15 : une erreur du socle dit quoi faire. Un « n'est pas un identifiant
    // d'adaptateur » laisserait croire à une faute de frappe, là où la cause
    // ordinaire est un id à points.
    const analyse = analyserScope("zoho.mail.*");

    expect(analyse.valide).toBe(false);
    if (!analyse.valide) {
      console.info(`[garde motif] motif rendu : ${analyse.motif}`);
      expect(analyse.motif).toContain("point");
      expect(analyse.motif).toContain("zoho.mail");
    }
  });

  it("découpe sur le PREMIER point, jamais sur le dernier", () => {
    // C'est LE geste que la décision du lot 1b impose, et le seul endroit où il
    // s'écrit. Un découpage sur le dernier point rendrait `adapterId` =
    // « zoho.mail », donc la lecture que `scopeDomine` faisait et que
    // `scopeCouvre` ne faisait pas.
    const analyse = analyserScope("zoho.mail.send");

    expect(analyse.valide).toBe(true);
    if (analyse.valide) {
      expect(analyse.genre).toBe("outil");
      expect(analyse.adapterId).toBe("zoho");
      expect(analyse.tool).toBe("mail.send");
    }
  });

  it("classe chaque forme valide dans l'un des trois genres, et rien d'autre", () => {
    const genres = new Set<string>(GENRES_SCOPE);
    const valides = ["*", "zoho.*", "zoho.mail.send", "crm.contact.fiche.lire"];

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
//  Garde 2 — la couverture d'un outil
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/scope — couverture d'un outil", () => {
  const reference: ReferenceOutil = { adapterId: "zoho", tool: "mail.send" };

  it("rougit sur un témoin où le scope ne couvre pas ce qu'on affirme", () => {
    // Témoin fabriqué : un adaptateur voisin. Si `scopeCouvre` rendait vrai
    // ici, la politique d'un adaptateur s'appliquerait à un autre.
    expect(scopeCouvre("agenda.*", reference)).toBe(false);
    expect(scopeCouvre("zoho.mail.forward", reference)).toBe(false);
    // Et un scope HORS GRAMMAIRE ne couvre rien : l'appelant doit traiter
    // l'invalidité AVANT, jamais la lire comme « ne couvre pas ».
    expect(scopeCouvre("zoho.mail.*", reference)).toBe(false);
  });

  it("couvre par les trois scopes du § 12, et par aucun autre", () => {
    const couvrants = scopesCouvrants(reference);

    console.info(`[garde couverture] ${String(couvrants.length)} scopes couvrants mesurés`);

    expect(couvrants).toEqual(["*", "zoho.*", "zoho.mail.send"]);
    for (const scope of couvrants) {
      expect(scopeCouvre(scope, reference), scope).toBe(true);
    }
  });

  it("reconnaît un nom d'outil déjà qualifié sans jamais deviner où couper", () => {
    const depuisQualifie = referenceDepuisNom("zoho", "zoho.mail.send");
    const depuisLocal = referenceDepuisNom("zoho", "mail.send");

    expect(depuisQualifie).toEqual(depuisLocal);
    expect(nomQualifie(depuisQualifie)).toBe("zoho.mail.send");

    // Un préfixe qui RESSEMBLE sans correspondre n'est pas retiré : on
    // reconnaît, on ne devine pas.
    expect(referenceDepuisNom("zoho", "zohoo.mail.send")).toEqual({
      adapterId: "zoho",
      tool: "zohoo.mail.send",
    });
  });

  it("refuse une référence qu'AUCUN scope ne saurait nommer, et le DIT", () => {
    // Le cas réel : un `adapterId` à points. Son nom qualifié est valide —
    // « zoho.mail.send » — mais il se relit comme l'outil `mail.send` de
    // l'adaptateur `zoho`. La politique d'un adaptateur porterait sur un autre.
    const ambigue: ReferenceOutil = { adapterId: "zoho.mail", tool: "send" };
    const verdict = analyserReference(ambigue);

    expect(verdict.valide).toBe(false);
    if (!verdict.valide) {
      console.info(`[garde référence] motif rendu : ${verdict.motif}`);
      expect(verdict.motif).toContain("zoho.mail.send");
    }

    // Et la garde sait dire OUI : une référence bien découpée passe.
    expect(analyserReference({ adapterId: "zoho", tool: "mail.send" }).valide).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — la domination, et l'interdit de la « spécificité gagnante »
// ─────────────────────────────────────────────────────────────────────────────

describe("core/policy/scope — domination", () => {
  it("rougit sur un témoin où l'étroit prétendrait dominer le large", () => {
    expect(scopeDomine("zoho.mail.send", "*")).toBe(false);
    expect(scopeDomine("zoho.*", "*")).toBe(false);
  });

  it("fait dominer le large sur l'étroit, sur les seize paires possibles", () => {
    const scopes = ["*", "zoho.*", "zoho.mail.send", "agenda.poser"];
    const attendu: Record<string, readonly string[]> = {
      "*": scopes,
      "zoho.*": ["zoho.*", "zoho.mail.send"],
      "zoho.mail.send": ["zoho.mail.send"],
      "agenda.poser": ["agenda.poser"],
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

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — IL N'Y A PLUS QU'UNE DÉRIVATION DE LA COUVERTURE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ═══ CE QUE CETTE GARDE EXISTE POUR EMPÊCHER ═══
 *
 * Le lot 1 a mesuré que ce dossier répondait DEUX FOIS à « ce scope couvre-t-il
 * cet outil ? » — par appartenance à `scopesCouvrants()` d'un côté, par analyse
 * de la grammaire de l'autre — et que les deux réponses divergeaient sur une
 * politique parfaitement lisible, donc là où aucun fail-closed ne venait
 * refermer l'écart.
 *
 * Réécrire `scopeCouvre()` ne suffit pas : rien n'empêcherait quelqu'un de
 * réintroduire l'appartenance « pour aller plus vite ». Cette garde confronte
 * les deux lectures sur TOUT le produit qu'elle sait fabriquer, et elle annonce
 * le nombre de paires mesurées — un produit vide serait vert sans rien prouver.
 */
describe("core/policy/scope — la couverture n'a plus qu'une seule dérivation", () => {
  const REFERENCES: readonly ReferenceOutil[] = [
    { adapterId: "zoho", tool: "mail.send" },
    { adapterId: "zoho", tool: "mail.forward" },
    { adapterId: "zoho", tool: "poser" },
    { adapterId: "agenda", tool: "poser" },
    { adapterId: "crm", tool: "contact.fiche.lire" },
  ];

  /** Tous les scopes que les références ci-dessus peuvent produire, plus des voisins. */
  const SCOPES: readonly string[] = [
    ...new Set([
      "*",
      ...REFERENCES.flatMap((reference) => scopesCouvrants(reference)),
      "agenda.*",
      "crm.*",
      "zoho.mail.autre",
      // Deux formes HORS grammaire : elles ne doivent couvrir personne, par
      // AUCUNE des deux lectures.
      "zoho.mail.*",
      "zoho",
    ]),
  ];

  it("rougit sur un témoin : la lecture par APPARTENANCE, réintroduite, diverge", () => {
    // Le témoin fabriqué EST l'ancienne implémentation. On la fait tourner à
    // côté de la vraie et on montre qu'elles ne disent pas la même chose : sans
    // ce témoin, la garde ci-dessous serait verte même si les deux lectures
    // étaient devenues le même code trivialement faux.
    const parAppartenance = (scope: string, reference: ReferenceOutil): boolean =>
      scopesCouvrants(reference).includes(scope);

    // `crm.contact.fiche.lire` est couvert par `crm.*` — la grammaire le dit.
    // L'appartenance, elle, ne connaît que les trois scopes fabriqués, et
    // `crm.*` en fait partie : le désaccord se cherche ailleurs, sur un scope
    // hors grammaire que l'appartenance accepterait s'il avait été fabriqué.
    const ambigue: ReferenceOutil = { adapterId: "zoho.mail", tool: "send" };

    console.info(
      `[témoin appartenance] scope « zoho.mail.* » — par appartenance ` +
        `${String(parAppartenance("zoho.mail.*", ambigue))}, par grammaire ` +
        `${String(scopeCouvre("zoho.mail.*", ambigue))}`,
    );

    expect(parAppartenance("zoho.mail.*", ambigue)).toBe(true);
    expect(scopeCouvre("zoho.mail.*", ambigue)).toBe(false);
  });

  it("répond IDENTIQUEMENT par les deux lectures, sur toutes les paires", () => {
    const desaccords: string[] = [];
    let paires = 0;

    for (const reference of REFERENCES) {
      // La référence est nommable — sans quoi la comparaison n'aurait pas de sens.
      expect(analyserReference(reference).valide, nomQualifie(reference)).toBe(true);

      for (const scope of SCOPES) {
        paires += 1;
        const parGrammaire = scopeCouvre(scope, reference);
        const parAppartenance = scopesCouvrants(reference).includes(scope);
        if (parGrammaire !== parAppartenance) {
          desaccords.push(
            `« ${scope} » / « ${nomQualifie(reference)} » : grammaire ${String(parGrammaire)}, ` +
              `appartenance ${String(parAppartenance)}`,
          );
        }
      }
    }

    console.info(
      `[garde dérivation unique] ${String(paires)} paires mesurées ` +
        `(${String(REFERENCES.length)} références × ${String(SCOPES.length)} scopes), ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // Plancher-témoin : un produit vide serait vert sans rien mesurer.
    expect(paires).toBe(REFERENCES.length * SCOPES.length);
    expect(paires).toBeGreaterThanOrEqual(50);
    expect(desaccords).toEqual([]);
  });

  it("couvrir un outil, c'est dominer son nom qualifié — sur les mêmes paires", () => {
    let paires = 0;
    for (const reference of REFERENCES) {
      for (const scope of SCOPES) {
        paires += 1;
        expect(scopeCouvre(scope, reference), `${scope} couvre ${nomQualifie(reference)}`).toBe(
          scopeDomine(scope, nomQualifie(reference)),
        );
      }
    }

    console.info(`[garde couverture = domination] ${String(paires)} paires mesurées`);
    expect(paires).toBe(REFERENCES.length * SCOPES.length);
  });
});

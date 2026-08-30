import { describe, expect, it } from "vitest";

import { CHAMPS_COUVERTS } from "./canonique.js";
import { ErreurContenuJournal, verifierAucunContenu } from "./contenu.js";
import { contenuTemoin } from "./fixtures.js";
import { Journal } from "./journal.js";
import { JournalMemoire } from "./memoire.js";
import type { ContenuLigne } from "./vocabulaire.js";

/**
 * Gardes du § 31 — « jamais de corps ni d'extraits dans les journaux ».
 *
 * Le critère de fini du lot 4b demande un test « dérivé de `detectPii` qui
 * annonce combien d'entrées il a scannées ». Ici, à l'étage socle, on ne
 * cherche pas des données personnelles — aucun détecteur n'est fiable — on
 * exige une FORME par champ. C'est plus fort : la question n'est pas « est-ce
 * personnel ? » mais « cette valeur pouvait-elle légitimement sortir du socle ? »,
 * et un extrait de corps échoue quelle que soit sa langue.
 */

/**
 * Ce qu'aucun champ du journal ne doit accepter : une phrase. Espaces, accents,
 * ponctuation, longueur — c'est la signature d'un extrait de contenu.
 */
const POISON = "Bonjour Madame, suite à notre échange du 12 mars, veuillez trouver…";

describe("core/audit — aucun contenu n'entre dans le journal (§ 31)", () => {
  it("rougit sur un témoin fabriqué portant un extrait de courriel", () => {
    const verdict = verifierAucunContenu(contenuTemoin(1, { principal: POISON }));

    console.info(
      `[garde contenu · témoin] ${String(verdict.champsInspectes)} champs, ` +
        `${String(verdict.valeursInspectees)} valeurs inspectées, ` +
        `${String(verdict.anomalies.length)} anomalies`,
    );

    expect(verdict.champsInspectes).toBe(15);
    expect(verdict.anomalies).not.toHaveLength(0);
  });

  it("laisse passer une ligne légitime, et annonce ce qu'elle a inspecté", () => {
    const verdict = verifierAucunContenu(contenuTemoin(1));

    console.info(
      `[garde contenu] ${String(verdict.champsInspectes)} champs et ` +
        `${String(verdict.valeursInspectees)} valeurs inspectées`,
    );

    expect(verdict.champsInspectes).toBe(CHAMPS_COUVERTS.length);
    expect(verdict.champsInspectes).toBe(15);
    expect(verdict.anomalies).toEqual([]);
  });

  it("refuse le poison sur CHACUN des quinze champs couverts — aucun n'échappe", () => {
    // La dérivation : on ne choisit pas les champs à éprouver, on les prend
    // tous. Un champ qui aurait été oublié dans la table des formes resterait
    // vert ici, et c'est précisément ce que cette boucle interdit.
    const permissifs: string[] = [];
    let mesures = 0;

    for (const champ of CHAMPS_COUVERTS) {
      const surcharge = { [champ]: POISON } as unknown as Partial<ContenuLigne>;
      const verdict = verifierAucunContenu(contenuTemoin(1, surcharge));
      if (verdict.anomalies.length === 0) permissifs.push(champ);
      mesures += 1;
    }

    console.info(`[garde contenu · balayage] ${String(mesures)} champs éprouvés au poison`);

    expect(mesures).toBe(15);
    expect(permissifs).toEqual([]);
  });

  it("refuse aussi un `recordIds` qui porterait un libellé plutôt qu'un identifiant", () => {
    // § 12, règle 3 — `recordIds` est PSEUDONYME, pas anonyme, et sur le canal
    // appels un identifiant mène à des URL-capacités. Y glisser un nom de
    // personne serait une aggravation silencieuse : le champ est déjà purgé à
    // l'échéance d'`argHash`, mais son contenu deviendrait directement lisible.
    const verdict = verifierAucunContenu(
      contenuTemoin(1, { recordIds: ["evt-42", "Marie Dupont"] }),
    );

    console.info(`[garde recordIds] ${String(verdict.valeursInspectees)} valeurs inspectées`);

    expect(verdict.anomalies).not.toHaveLength(0);
    expect(verdict.anomalies.join(" ")).toContain("recordIds[1]");
  });

  it("refuse un `argHash` qui n'a pas la forme d'une empreinte", () => {
    // La garde ne sait pas distinguer un HMAC d'un SHA nu — même forme. Elle
    // refuse en revanche tout ce qui n'est pas une empreinte : une valeur
    // d'argument glissée là devient visible.
    for (const faux of ["", "abc", "Z".repeat(64), "a".repeat(63)]) {
      expect(verifierAucunContenu(contenuTemoin(1, { argHash: faux })).anomalies).not.toHaveLength(
        0,
      );
    }
  });

  it("refuse un `stepDenied` qui ne désigne aucune des quatorze étapes", () => {
    const hors = { stepDenied: 99 } as unknown as Partial<ContenuLigne>;
    expect(verifierAucunContenu(contenuTemoin(1, hors)).anomalies).not.toHaveLength(0);
    expect(verifierAucunContenu(contenuTemoin(1, { stepDenied: 10 })).anomalies).toEqual([]);
  });
});

describe("core/audit — la garde de contenu s'exécute À L'ÉCRITURE", () => {
  it("REFUSE l'écriture, au lieu d'écrire en avertissant", async () => {
    // Une garde qui journaliserait quand même, en signalant, laisserait le
    // contenu sur le disque : c'est le contenu qu'il fallait empêcher, pas le
    // silence.
    const store = new JournalMemoire();
    const journal = new Journal(store);

    await expect(journal.journaliser(contenuTemoin(1, { tool: POISON }))).rejects.toBeInstanceOf(
      ErreurContenuJournal,
    );

    const lignes = store.toutes();
    console.info(`[garde écriture] ${String(lignes.length)} lignes écrites après refus`);
    expect(lignes).toHaveLength(0);
  });
});

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  FORMES_INTERDITES,
  analyserLesWorkflows,
  analyserWorkflow,
  dossierDesWorkflows,
  estCommentaire,
  fichiersDeWorkflow,
} from "./workflow.js";

/**
 * GARDES — LA CHAÎNE D'INTÉGRATION EST-ELLE UNE GATE, OU UN DÉCOR ?
 *
 * ⚠️ CE QU'ELLES PROUVENT, ET RIEN DE PLUS. Elles lisent le TEXTE des fichiers
 *    de `.github/workflows/`. Elles ne prouvent pas que GitHub exécute ces
 *    fichiers, ni qu'une protection de branche exige leur succès — deux faits
 *    qui vivent hors du dépôt et qu'aucune lecture de texte n'atteint. Le
 *    nombre de fichiers et de lignes examinés est RENDU, pour qu'une lecture
 *    qui cesserait de mordre se voie au lieu de verdir.
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — la lecture SAIT ROUGIR, forme par forme
// ─────────────────────────────────────────────────────────────────────────────

describe("ops/workflow — la lecture des formes interdites", () => {
  it("rougit sur un témoin fabriqué pour CHACUNE des formes déclarées", () => {
    // Un témoin PAR forme, et le compte est dérivé de `FORMES_INTERDITES` :
    // ajouter une forme sans lui fabriquer de témoin fait rougir ici.
    const TEMOINS: Readonly<Record<string, string>> = {
      "continue-on-error": "      - name: gate molle\n        continue-on-error: true\n",
      "condition sur un secret":
        "      - name: gate qui disparaît\n        if: ${{ secrets.MON_JETON != '' }}\n",
      "code de retour écrasé": "      - run: pnpm test || true\n",
      "suppression de la sortie d'erreur": "      - run: pnpm lint 2>/dev/null\n",
    };

    let formesEprouvees = 0;
    for (const forme of FORMES_INTERDITES) {
      const temoin = TEMOINS[forme.nom];
      expect(temoin, `aucun témoin fabriqué pour « ${forme.nom} »`).toBeDefined();
      if (temoin === undefined) continue;

      const verdict = analyserWorkflow("temoin.yml", temoin);
      expect(
        verdict.occurrences.map((occurrence) => occurrence.forme),
        forme.nom,
      ).toContain(forme.nom);
      formesEprouvees += 1;
    }

    console.info(
      `[garde workflow] ${String(formesEprouvees)} forme(s) éprouvée(s) sur ` +
        `${String(FORMES_INTERDITES.length)} déclarée(s)`,
    );

    expect(formesEprouvees).toBe(FORMES_INTERDITES.length);
    expect(formesEprouvees).toBeGreaterThan(0);
  });

  it("ne prend PAS un commentaire pour une instruction", () => {
    // Sans cette distinction, la garde mordrait sur la PROSE : le workflow
    // explique précisément pourquoi il ne porte aucun `continue-on-error`, et
    // se ferait accuser d'en porter un. Une garde qui rougit pour la mauvaise
    // raison finit toujours par une exception écrite à la main, c'est-à-dire
    // par un trou.
    const temoin =
      "#  ⚠️ AUCUNE étape ne porte `continue-on-error`.\n" +
      "    # continue-on-error: true  ← jamais\n" +
      "      - run: pnpm test\n";

    const verdict = analyserWorkflow("temoin.yml", temoin);

    console.info(
      `[garde workflow] témoin de prose — ${String(verdict.lignesExaminees)} ligne(s) ` +
        `examinée(s), ${String(verdict.occurrences.length)} occurrence(s)`,
    );

    expect(estCommentaire("   # ceci est un commentaire")).toBe(true);
    expect(estCommentaire("      - run: pnpm test")).toBe(false);
    // Une seule ligne non commentée : le `run`. Les deux autres sont de la prose.
    expect(verdict.lignesExaminees).toBe(1);
    expect(verdict.occurrences).toEqual([]);
  });

  it("SAIT DIRE OUI — un workflow sain ne produit aucune occurrence", () => {
    const sain =
      "name: CI\n" +
      "on:\n  push:\n    branches: [main]\n" +
      "permissions:\n  contents: read\n" +
      "jobs:\n  gates:\n    runs-on: ubuntu-24.04\n    steps:\n" +
      "      - uses: actions/checkout@v4\n" +
      "      - run: pnpm test\n";

    const verdict = analyserWorkflow("sain.yml", sain);

    console.info(
      `[garde workflow] témoin sain — ${String(verdict.lignesExaminees)} ligne(s), ` +
        `${String(verdict.etapesReconnues)} étape(s) reconnue(s)`,
    );

    // Un lecteur qui refuserait TOUT serait vert sur les témoins précédents.
    expect(verdict.occurrences).toEqual([]);
    expect(verdict.etapesReconnues).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — LES WORKFLOWS RÉELS DE CE DÉPÔT
// ─────────────────────────────────────────────────────────────────────────────

describe("La chaîne d'intégration de ce dépôt", () => {
  it("existe, et la garde ANNONCE combien de fichiers et de lignes elle a lus", () => {
    const verdict = analyserLesWorkflows();

    console.info(
      `[garde chaîne] ${String(verdict.fichiersLus)} fichier(s) de workflow lu(s) ` +
        `(${fichiersDeWorkflow().join(", ")}) dans ${dossierDesWorkflows()}, ` +
        `${String(verdict.lignesExaminees)} ligne(s) examinée(s), ` +
        `${String(verdict.etapesReconnues)} étape(s) reconnue(s), ` +
        `${String(verdict.occurrences.length)} occurrence(s) interdite(s)`,
    );

    // Planchers-témoins. Un dossier vide, déplacé, ou une lecture qui cesserait
    // de mordre rendraient zéro — et tout le reste serait vert en n'ayant rien lu.
    expect(verdict.fichiersLus).toBeGreaterThanOrEqual(1);
    expect(verdict.lignesExaminees).toBeGreaterThanOrEqual(40);
    expect(verdict.etapesReconnues).toBeGreaterThanOrEqual(8);
  });

  it("ne porte AUCUNE des formes qui rendent une gate décorative", () => {
    const verdict = analyserLesWorkflows();

    const rendu = verdict.occurrences.map(
      (occurrence) =>
        `${occurrence.fichier}:${String(occurrence.ligne)} — ${occurrence.forme} : ` +
        `${occurrence.extrait}`,
    );

    expect(rendu).toEqual([]);
  });

  it("déclare un bloc `permissions` — le moindre privilège n'est pas le défaut", () => {
    // Sans bloc `permissions`, le jeton d'exécution reçoit les droits par
    // défaut du dépôt, qui sont plus larges que ce qu'aucune étape ne demande.
    // Ce n'est pas une forme interdite — c'est une DÉCLARATION MANQUANTE, et
    // une absence ne se cherche pas avec le même outil qu'une présence.
    const dossier = dossierDesWorkflows();
    const fichiers = fichiersDeWorkflow();

    const sansPermissions = fichiers.filter(
      (nom) => !/^permissions\s*:/m.test(readFileSync(`${dossier}${nom}`, "utf8")),
    );

    console.info(
      `[garde permissions] ${String(fichiers.length)} fichier(s) mesuré(s), ` +
        `${String(sansPermissions.length)} sans bloc \`permissions\``,
    );

    expect(fichiers.length).toBeGreaterThanOrEqual(1);
    expect(sansPermissions).toEqual([]);
  });

  it("appelle bien les QUATRE gates, et le harnais de conformité", () => {
    // Une chaîne qui ne porterait aucune des formes interdites mais n'appellerait
    // rien serait irréprochable et vide. Le contenu est donc mesuré, pas
    // seulement l'absence de défaut.
    const dossier = dossierDesWorkflows();
    const tout = fichiersDeWorkflow()
      .map((nom) => readFileSync(`${dossier}${nom}`, "utf8"))
      .join("\n");

    const attendues = [
      "pnpm typecheck",
      "pnpm lint",
      "pnpm format:check",
      "pnpm test",
      "pnpm prisma:validate",
      "ops/conformite-ci.ts",
      "ops/verifier-secrets.ts",
      "ops/temoin-ci.ts",
    ];

    const absentes = attendues.filter((commande) => !tout.includes(commande));

    console.info(
      `[garde commandes] ${String(attendues.length)} commande(s) attendue(s), ` +
        `${String(absentes.length)} absente(s)`,
    );

    expect(absentes).toEqual([]);
  });
});

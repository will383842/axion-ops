import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { EtatDuDepot } from "./depot-public.js";
import {
  EXEMPTIONS,
  MOTIFS_SENSIBLES,
  SONDES,
  porteLeMotif,
  verifierLeDepotPublic,
} from "./depot-public.js";

/**
 * **LA GARDE DU DÉPÔT PUBLIC — ADR 0042.**
 *
 * ═══ DEUX MOITIÉS, ET AUCUNE NE VAUT SANS L'AUTRE ═══
 *
 *  · **Le RÉEL** — l'état de CE dépôt, constitué par git, confronté aux motifs.
 *    Il annonce combien de chemins il a confrontés : un vert sur zéro chemin
 *    serait le pire des verts.
 *  · **Le FABRIQUÉ** — des états inventés où la garde DOIT rougir, un par sens.
 *    Sans eux, le vert du réel serait indiscernable d'une garde qui ne regarde
 *    rien.
 *
 * ⚠️ **AUCUNE VALEUR DE SECRET N'ENTRE NI NE SORT D'ICI.** La garde ne lit
 *    aucun fichier : elle reçoit des CHEMINS. Le `.env` mesuré sur cette
 *    machine n'est jamais ouvert, et la sortie d'une chaîne d'intégration
 *    publique ne peut donc rien en apprendre (§ 29).
 */

const RACINE = fileURLToPath(new URL("../", import.meta.url));

/** Ce que git suit, ce qu'il ignore, et ce qu'il dit des sondes. */
function etatReelDuDepot(): EtatDuDepot {
  const git = (args: readonly string[]): string =>
    execFileSync("git", [...args], { cwd: RACINE, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

  const suivis = git(["ls-files"]).split("\n").filter(Boolean);

  // `--porcelain` : `?? chemin` = non suivi ET non ignoré. C'est exactement le
  // fichier qu'un « git add . » emporterait.
  const nonSuivisNonIgnores = git(["status", "--porcelain", "--untracked-files=all"])
    .split("\n")
    .filter((ligne) => ligne.startsWith("?? "))
    .map((ligne) => ligne.slice(3).trim())
    .filter(Boolean);

  // ⚠️ `git check-ignore` sort en code 1 quand AUCUN chemin n'est ignoré — un
  //    succès pour nous, une erreur pour `execFileSync`. Le code est donc lu,
  //    jamais écrasé : `|| true` ferait de « git absent » un « rien d'ignoré ».
  let ignores: readonly string[] = [];
  try {
    ignores = git(["check-ignore", "--", ...SONDES])
      .split("\n")
      .filter(Boolean);
  } catch (erreur) {
    const code = (erreur as { status?: number }).status;
    if (code !== 1) throw erreur;
  }
  const ensemble = new Set(ignores);

  return {
    suivis,
    nonSuivisNonIgnores,
    sondes: SONDES.map((chemin) => ({ chemin, ignore: ensemble.has(chemin) })),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE RÉEL
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0042 — aucun porteur de secret n'entre dans ce dépôt PUBLIC", () => {
  it("confronte l'état RÉEL du dépôt aux motifs, et annonce combien de chemins", () => {
    const etat = etatReelDuDepot();
    const verdict = verifierLeDepotPublic(etat);

    console.info(
      `[dépôt public] ${String(verdict.cheminsConfrontes)} chemin(s) confronté(s) dont ` +
        `${String(verdict.suivisConfrontes)} suivi(s) par git · ` +
        `${String(verdict.motifsLus)} motif(s) sensible(s) lu(s) · ` +
        `${String(verdict.sondesConfrontees)} sonde(s) d'ignorance confrontée(s) · ` +
        `${String(verdict.suivisSensibles.length)} suivi(s) sensible(s) ` +
        `[${verdict.suivisSensibles.join(", ") || "aucun"}] · ` +
        `${String(verdict.presentsNonIgnores.length)} présent(s) non ignoré(s) ` +
        `[${verdict.presentsNonIgnores.join(", ") || "aucun"}] · ` +
        `${String(verdict.sondesNonIgnorees.length)} sonde(s) NON ignorée(s) ` +
        `[${verdict.sondesNonIgnorees.join(", ") || "aucune"}] · ` +
        `${String(verdict.exemptes.length)} exempté(s) [${verdict.exemptes.join(", ") || "aucun"}] · ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    // ── LES PLANCHERS, sans lesquels cette garde serait verte en ne lisant rien
    // Un `git ls-files` muet — git absent, dépôt non initialisé, mauvais dossier
    // de travail — rendrait zéro chemin et donc zéro anomalie.
    expect(verdict.suivisConfrontes).toBeGreaterThanOrEqual(100);
    expect(verdict.motifsLus).toBeGreaterThanOrEqual(10);
    expect(verdict.sondesConfrontees).toBe(SONDES.length);
    expect(verdict.sondesConfrontees).toBeGreaterThanOrEqual(4);

    expect(verdict.anomalies).toEqual([]);
  });

  /**
   * ⚠️ **LE CONTRÔLE QUI MORD SUR UNE MACHINE PROPRE.** Un dépôt fraîchement
   *    cloné ne porte aucun `.env` : les deux autres sens n'ont alors RIEN à
   *    confronter. Celui-ci se confronte aux règles d'ignorance elles-mêmes, et
   *    rougit dès que la ligne `.env` quitte `.gitignore` — y compris en
   *    intégration continue, où c'est le seul des trois à pouvoir servir.
   */
  it("exige que chaque SONDE reste ignorée par git, qu'elle existe ou non", () => {
    const etat = etatReelDuDepot();

    console.info(
      `[dépôt public · sondes] ${String(etat.sondes.length)} sonde(s) confrontée(s) : ` +
        etat.sondes
          .map((sonde) => `${sonde.chemin} → ${sonde.ignore ? "ignorée" : "NON IGNORÉE"}`)
          .join(" · "),
    );

    expect(etat.sondes).toHaveLength(SONDES.length);
    expect(etat.sondes.filter((sonde) => !sonde.ignore)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  LE FABRIQUÉ — la garde sait-elle rougir, et sait-elle dire OUI ?
// ═════════════════════════════════════════════════════════════════════════════

const ETAT_SAIN: EtatDuDepot = {
  suivis: ["package.json", "ops/secrets.ts", "ops/verifier-secrets.ts", ".env.example"],
  nonSuivisNonIgnores: ["notes.md"],
  sondes: SONDES.map((chemin) => ({ chemin, ignore: true })),
};

describe("ADR 0042 — la garde du dépôt public sait rougir dans ses TROIS sens", () => {
  it("rougit sur un secret SUIVI, sur un secret NON IGNORÉ, et sur une sonde découverte", () => {
    const cas = [
      {
        nom: "① un `.env` entré dans l'index — irrévocable, il est dans l'historique",
        etat: { ...ETAT_SAIN, suivis: [...ETAT_SAIN.suivis, ".env"] },
        mot: "est SUIVI par git",
      },
      {
        nom: "② une clé privée au fond d'un sous-dossier, suivie",
        etat: { ...ETAT_SAIN, suivis: [...ETAT_SAIN.suivis, "ops/certificats/prive.pem"] },
        mot: "est SUIVI par git",
      },
      {
        nom: "③ un `.env.local` présent que plus aucune règle n'ignore",
        etat: {
          ...ETAT_SAIN,
          nonSuivisNonIgnores: [...ETAT_SAIN.nonSuivisNonIgnores, ".env.local"],
        },
        mot: "AUCUNE règle ne l'ignore",
      },
      {
        nom: "④ la ligne `.env` a quitté `.gitignore` — le fichier n'a même pas besoin d'exister",
        etat: {
          ...ETAT_SAIN,
          sondes: SONDES.map((chemin) => ({ chemin, ignore: chemin !== ".env" })),
        },
        mot: "n'est plus ignoré par git",
      },
    ];

    let casEprouves = 0;
    for (const unCas of cas) {
      const verdict = verifierLeDepotPublic(unCas.etat);
      casEprouves += 1;
      console.info(
        `[dépôt public · témoin] ${unCas.nom} → ${String(verdict.anomalies.length)} ` +
          `anomalie(s) [${verdict.anomalies.join(" | ")}]`,
      );
      expect(verdict.anomalies, unCas.nom).toHaveLength(1);
      expect(verdict.anomalies.join(" "), unCas.nom).toContain(unCas.mot);
    }

    console.info(`[dépôt public · témoin · totaux] ${String(casEprouves)} cas fabriqué(s)`);
    expect(casEprouves).toBe(cas.length);
  });

  it("SAIT DIRE OUI — un état sain ne produit aucune anomalie, et le gabarit reste exempté", () => {
    const verdict = verifierLeDepotPublic(ETAT_SAIN);

    console.info(
      `[dépôt public · oui] ${String(verdict.cheminsConfrontes)} chemin(s) · ` +
        `${String(verdict.exemptes.length)} exempté(s) [${verdict.exemptes.join(", ")}] · ` +
        `${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.anomalies).toEqual([]);
    // Le gabarit est suivi PAR DESSEIN, et il est nommé au lieu d'être invisible.
    expect(verdict.exemptes).toEqual([".env.example"]);
  });

  /**
   * ⚠️ **LE MOTIF LARGE EST UNE FAUSSE BONNE IDÉE, ET CE TEST L'ÉCRIT.** Un
   *    `*secret*` attraperait `ops/secrets.ts`, la garde serait rouge au premier
   *    jour, et on la désarmerait — c'est la façon la plus sûre de se retrouver
   *    sans garde du tout. Ce qu'on cherche est un fichier qui PORTE une valeur,
   *    pas un fichier qui en parle.
   */
  it("ne confond pas un module qui PARLE de secrets avec un fichier qui en PORTE un", () => {
    const parlent = ["ops/secrets.ts", "ops/secrets.spec.ts", "ops/verifier-secrets.ts"];
    const attrapes = parlent.filter((chemin) =>
      MOTIFS_SENSIBLES.some((motif) => porteLeMotif(chemin, motif.motif)),
    );
    const portent = [".env", ".env.local", "ops/prive.pem", "secrets.json", "id_rsa"];
    const manques = portent.filter(
      (chemin) => !MOTIFS_SENSIBLES.some((motif) => porteLeMotif(chemin, motif.motif)),
    );

    console.info(
      `[dépôt public · motifs] ${String(MOTIFS_SENSIBLES.length)} motif(s) · ` +
        `${String(EXEMPTIONS.length)} exemption(s) · ` +
        `${String(parlent.length)} module(s) qui PARLENT de secrets, ` +
        `${String(attrapes.length)} attrapé(s) à tort [${attrapes.join(", ") || "aucun"}] · ` +
        `${String(portent.length)} chemin(s) qui en PORTENT, ` +
        `${String(manques.length)} manqué(s) [${manques.join(", ") || "aucun"}]`,
    );

    expect(attrapes).toEqual([]);
    expect(manques).toEqual([]);
    // Chaque exemption porte un motif ÉCRIT : une exemption muette est une porte.
    expect(EXEMPTIONS.filter((exemption) => exemption.pourquoi.trim().length === 0)).toEqual([]);
  });
});

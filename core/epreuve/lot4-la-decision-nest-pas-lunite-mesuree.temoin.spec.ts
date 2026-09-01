import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { FichierSoumis } from "../coutures/contrat.js";
import { REGISTRE_DES_COUTURES } from "../coutures/registre.js";
import { verifierLaCouvertureDesAdr, verifierLesAssertions } from "../coutures/verifier.js";

/**
 * **ÉPREUVE DU LOT 4 — L'UNITÉ QUE LES GARDES MESURENT N'EST PAS L'UNITÉ DU
 * DÉFAUT.**
 *
 * ═══ CE QUE LE LOT 4 A FERMÉ, ET IL L'A RÉELLEMENT FERMÉ ═══
 *
 * L'ADR 0041 nomme le défaut central du dossier : l'état `cousue` mesure **le
 * nombre d'APPELANTS DE PRODUCTION d'un symbole**, jamais qu'une DÉCISION a
 * atterri. G4 (`assertion`) a été posée pour mesurer le second fait. Onze
 * mutations posées par cette épreuve sur le code livré ont toutes été tuées —
 * dont trois sur G4 elle-même. Le mécanisme mord.
 *
 * ═══ CE QU'IL N'A PAS FERMÉ, ET C'EST LE MÊME MOTIF D'UN CRAN PLUS HAUT ═══
 *
 * Les deux portes que le lot a fermées sont :
 *
 *  · **un ADR NEUF sans entrée au registre** → G2 rougit (`adrSansEntree`) ;
 *  · **une entrée NEUVE sans assertion** → le cliquet de G4 rougit (89 > 88).
 *
 * La porte restée ouverte est **celle par laquelle le défaut est réellement
 * entré le 2026-09-01** : les décisions 2 et 3 de l'ADR 0037 n'étaient ni un
 * ADR neuf, ni une entrée neuve. C'étaient **deux décisions de plus dans un ADR
 * déjà couvert, portant sur un symbole déjà cousu**.
 *
 * L'unité du registre est le couple **(ADR × SYMBOLE)**. L'unité de la décision
 * est le couple **(ADR × NUMÉRO DE DÉCISION)**. Tant que les deux diffèrent,
 * une décision de plus dans un ADR déjà couvert ne fait bouger **aucun** des
 * comptes que G2 et G4 annoncent — et c'est ce que le quatrième test de ce
 * fichier mesure, sur les sources RÉELLES, sans toucher au disque.
 *
 * ⚠️ **CE FICHIER N'ACCUSE AUCUNE DÉCISION D'ÊTRE NON ATTERRIE.** Une entrée de
 *    registre peut légitimement porter deux décisions du même ADR, et une
 *    décision peut délibérément ne livrer aucun symbole. Ce qui est mesuré ici
 *    est plus étroit, et c'est justement pour cela qu'il est vrai : **il
 *    n'existe aujourd'hui aucune mesure PAR DÉCISION**, donc aucune de celles
 *    qui débordent ne peut être ni confirmée ni infirmée par une garde. C'est un
 *    angle mort, pas un verdict.
 *
 * ⚠️ **LA BORNE DE LA MESURE, ÉCRITE AVEC ELLE.** Une décision est ici une
 *    **FORME ÉCRITE** : un titre `### N ·` sous la section « Décision », la
 *    forme que les ADR de ce dépôt emploient. Un ADR qui numéroterait ses
 *    décisions autrement échapperait au compte — le compte de titres lus est
 *    donc annoncé à chaque fois, pour que « aucune décision trouvée » ne se
 *    lise jamais comme « aucune décision manquante ».
 */

const RACINE = new URL("../../", import.meta.url);

/** La forme sous laquelle les ADR de ce dépôt numérotent leurs décisions. */
const TITRE_DE_DECISION = /^###\s+\d+\s*·/gmu;

/** Les fichiers d'ADR, lus une fois pour tous les tests de ce fichier. */
let memoireDesAdr: FichierSoumis[] | null = null;

function adrDuDepot(): FichierSoumis[] {
  if (memoireDesAdr !== null) return memoireDesAdr;
  const dossier = fileURLToPath(new URL("docs/adr/", RACINE));
  memoireDesAdr = readdirSync(dossier)
    .filter((nom) => /^\d{4}-.*\.md$/u.test(nom))
    .map((nom) => ({
      chemin: `docs/adr/${nom}`,
      source: readFileSync(`${dossier}${nom}`, "utf8"),
    }));
  return memoireDesAdr;
}

/** Les modules du programme, pour G4 — même balayage que `registre.spec.ts`. */
let memoireDuProgramme: FichierSoumis[] | null = null;

function parcourir(relatif: string, acc: FichierSoumis[]): void {
  let entrees;
  try {
    entrees = readdirSync(fileURLToPath(new URL(relatif, RACINE)), { withFileTypes: true });
  } catch {
    return;
  }
  for (const entree of entrees) {
    const chemin = `${relatif}${entree.name}`;
    if (entree.isDirectory()) parcourir(`${chemin}/`, acc);
    else if (entree.name.endsWith(".ts")) {
      acc.push({ chemin, source: readFileSync(fileURLToPath(new URL(chemin, RACINE)), "utf8") });
    }
  }
}

function programme(): FichierSoumis[] {
  if (memoireDuProgramme !== null) return memoireDuProgramme;
  const acc: FichierSoumis[] = [];
  for (const dossier of ["core", "adapters", "console", "voice", "ops"]) {
    parcourir(`${dossier}/`, acc);
  }
  memoireDuProgramme = acc;
  return acc;
}

/** Le numéro d'ADR que porte un nom de fichier. `null` si le nom n'en porte pas. */
function numeroDeLAdr(chemin: string): string | null {
  return /(\d{4})-/u.exec(chemin)?.[1] ?? null;
}

/** Combien de décisions NUMÉROTÉES un ADR écrit. Une FORME, jamais un jugement. */
function decisionsNumerotees(source: string): number {
  return (source.match(TITRE_DE_DECISION) ?? []).length;
}

/** Le rapprochement, ADR par ADR, entre décisions écrites et entrées du registre. */
interface EcartDUnAdr {
  readonly adr: string;
  readonly decisions: number;
  readonly entrees: number;
  readonly horsPortee: number;
}

interface RapprochementDesUnites {
  readonly adrLus: number;
  readonly titresLus: number;
  readonly entreesLues: number;
  readonly ecarts: readonly EcartDUnAdr[];
  readonly horsPorteeTotal: number;
}

function rapprocher(): RapprochementDesUnites {
  const parAdr = new Map<string, number>();
  for (const entree of REGISTRE_DES_COUTURES) {
    parAdr.set(entree.adr, (parAdr.get(entree.adr) ?? 0) + 1);
  }
  const ecarts: EcartDUnAdr[] = [];
  let titresLus = 0;
  let adrLus = 0;
  for (const fichier of adrDuDepot()) {
    const numero = numeroDeLAdr(fichier.chemin);
    if (numero === null) continue;
    adrLus += 1;
    const decisions = decisionsNumerotees(fichier.source);
    titresLus += decisions;
    const entrees = parAdr.get(numero) ?? 0;
    if (decisions > entrees) {
      ecarts.push({ adr: numero, decisions, entrees, horsPortee: decisions - entrees });
    }
  }
  return {
    adrLus,
    titresLus,
    entreesLues: REGISTRE_DES_COUTURES.length,
    ecarts,
    horsPorteeTotal: ecarts.reduce((somme, e) => somme + e.horsPortee, 0),
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LA MESURE QUI N'EXISTE PAS — DÉCISIONS ÉCRITES CONTRE ENTRÉES QUI PORTENT
// ═════════════════════════════════════════════════════════════════════════════

describe("épreuve · l'unité du registre n'est pas l'unité de la décision", () => {
  it("confronte les décisions NUMÉROTÉES des ADR aux entrées du registre, et annonce l'écart", () => {
    const mesure = rapprocher();

    console.info(
      `[épreuve · unité] ${String(mesure.adrLus)} ADR lu(s) dans docs/adr/ · ` +
        `${String(mesure.titresLus)} décision(s) NUMÉROTÉE(s) lue(s) · ` +
        `${String(mesure.entreesLues)} entrée(s) au registre · ` +
        `${String(mesure.ecarts.length)} ADR dont les décisions DÉBORDENT ses entrées · ` +
        `${String(mesure.horsPorteeTotal)} décision(s) qu'AUCUNE mesure par décision ne peut ` +
        `voir [${mesure.ecarts.map((e) => `${e.adr}:${String(e.decisions)}>${String(e.entrees)}`).join(", ") || "aucune"}]`,
    );

    // ── LES PLANCHERS, sans lesquels cette garde serait verte en ne lisant rien
    expect(mesure.adrLus).toBeGreaterThanOrEqual(40);
    expect(mesure.titresLus).toBeGreaterThanOrEqual(100);
    expect(mesure.entreesLues).toBe(REGISTRE_DES_COUTURES.length);
  });

  it("SAIT rougir : un ADR fabriqué dont une décision n'est portée par rien est trouvé", () => {
    // Le témoin est FABRIQUÉ EN MÉMOIRE. Une garde qui mutilerait le dépôt pour
    // se prouver laisserait un jour ses dégâts.
    const temoin =
      "# ADR 9999 — témoin\n\n## Décision\n\n" +
      "### 1 · une décision portée\n\n### 2 · une décision que rien ne porte\n";
    const lues = decisionsNumerotees(temoin);
    const portees = 1;

    console.info(
      `[témoin · unité] ADR fabriqué · ${String(lues)} décision(s) numérotée(s) lue(s) · ` +
        `${String(portees)} portée(s) · ${String(lues - portees)} hors portée`,
    );

    expect(lues).toBe(2);
    expect(lues - portees).toBeGreaterThan(0);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ② LA DETTE, NOMMÉE — LA RÈGLE QUE PERSONNE NE TIENT AUJOURD'HUI
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ **DETTE NOMMÉE.** La règle énoncée ici est celle que le mécanisme de
   *    l'ADR 0041 devrait tenir pour fermer le défaut à sa vraie unité. Elle est
   *    FAUSSE aujourd'hui, et ce test le dit en étant `it.fails` : il ROUGIRA le
   *    jour où elle deviendra vraie, forçant celui qui la ferme à retirer le
   *    `.fails`. C'est le seul mécanisme de ce dépôt qui rende une dette
   *    impossible à laisser derrière soi.
   */
  it.fails("chaque décision numérotée d'un ADR est portée par une entrée du registre", () => {
    const mesure = rapprocher();

    console.info(
      `[dette · unité] ${String(mesure.horsPorteeTotal)} décision(s) sans entrée qui la porte, ` +
        `réparties sur ${String(mesure.ecarts.length)} ADR`,
    );

    expect(mesure.ecarts).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  ③ LA PREUVE OPÉRATOIRE — LA PORTE PAR LAQUELLE LE DÉFAUT EST ENTRÉ
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Ce test ne raisonne pas : il FABRIQUE la situation du 2026-09-01 — une
   * décision de plus dans un ADR **déjà couvert** — et fait tourner G2 dessus,
   * G4 étant annoncée au même endroit. Les comptes sont IDENTIQUES, à l'unité
   * près.
   *
   * ⚠️ **IL EST VERT PARCE QUE LE TROU EXISTE, ET IL ROUGIRA LE JOUR OÙ IL SERA
   *    BOUCHÉ.** C'est la forme que ce dépôt donne à un angle mort : une
   *    assertion qui tient tant qu'il est ouvert, et qui réclame d'être réécrite
   *    le jour où une garde devient sensible aux décisions.
   *
   * ⚠️ **RIEN N'EST ÉCRIT SUR LE DISQUE.** Le corpus modifié est fabriqué en
   *    mémoire, à partir des sources réelles : `verifierLaCouvertureDesAdr` est
   *    pure de ses entrées, c'est ce qui rend cette épreuve possible sans
   *    toucher à `docs/adr/`.
   */
  it("une décision NEUVE dans un ADR DÉJÀ COUVERT ne fait bouger aucun compte de G2 ni de G4", () => {
    const avantAdr = adrDuDepot();
    const couvert = avantAdr.find((f) => numeroDeLAdr(f.chemin) === "0025");
    expect(couvert).toBeDefined();
    if (couvert === undefined) return;

    const apresAdr = avantAdr.map((f) =>
      f === couvert
        ? {
            chemin: f.chemin,
            source: `${f.source}\n### 9 · une décision NEUVE, acceptée, que rien ne porte\n`,
          }
        : f,
    );

    const g2Avant = verifierLaCouvertureDesAdr(avantAdr, REGISTRE_DES_COUTURES);
    const g2Apres = verifierLaCouvertureDesAdr(apresAdr, REGISTRE_DES_COUTURES);
    const g4 = verifierLesAssertions(programme(), REGISTRE_DES_COUTURES);

    const decisionsAvant = decisionsNumerotees(couvert.source);
    const fabrique = apresAdr.find((f) => f.chemin === couvert.chemin);

    console.info(
      `[épreuve · porte ouverte] ADR 0025 passe de ${String(decisionsAvant)} à ` +
        `${String(decisionsAvant + 1)} décision(s) numérotée(s) · ` +
        `G2 : ${String(g2Avant.adrTrouves)}→${String(g2Apres.adrTrouves)} ADR trouvé(s), ` +
        `${String(g2Avant.adrSansEntree.length)}→${String(g2Apres.adrSansEntree.length)} sans entrée, ` +
        `${String(g2Avant.anomalies.length)}→${String(g2Apres.anomalies.length)} anomalie(s) · ` +
        `G4 : ${String(g4.entreesConfrontees)} entrée(s), ` +
        `${String(g4.sansAssertion)} sans assertion, ${String(g4.anomalies.length)} anomalie(s) — ` +
        "aucun de ces comptes ne LIT une décision",
    );

    // ── LE PLANCHER : la décision fabriquée a bien été ÉCRITE dans le corpus.
    expect(decisionsNumerotees(fabrique?.source ?? "")).toBe(decisionsAvant + 1);
    expect(g2Avant.adrTrouves).toBeGreaterThanOrEqual(40);
    expect(g4.entreesConfrontees).toBe(REGISTRE_DES_COUTURES.length);

    // ── LA MESURE : G2 ne voit RIEN passer.
    expect(g2Apres.adrTrouves).toBe(g2Avant.adrTrouves);
    expect(g2Apres.adrSansEntree).toEqual(g2Avant.adrSansEntree);
    expect(g2Apres.entreesFantomes).toEqual(g2Avant.entreesFantomes);
    expect(g2Apres.anomalies).toEqual(g2Avant.anomalies);
  });
});

/**
 * `core/epreuve/lot3-la-marge-desarmee-et-la-capacite.temoin.spec.ts` —
 * **CE QUE LE LOT 3 A POSÉ, ATTAQUÉ PAR SES PROPRES NOMBRES.**
 *
 * Quatre angles, tous FABRIQUÉS et tous DÉRIVÉS des modules qu'ils confrontent —
 * aucun nombre de ce fichier n'est recopié d'un rapport.
 *
 *  ① **La fermeture d'un champ ne regarde pas le TYPE qu'elle referme.**
 *     L'ADR 0035 mesure la capacité d'un `pattern` et d'un `maxLength`, et c'est
 *     un vrai progrès sur le motif cosmétique. Mais les trois mots-clés de
 *     fermeture sont lus AVANT le `type`, si bien qu'un mot-clé que JSON Schema
 *     draft 2020-12 n'applique PAS à ce type referme quand même. `maxLength`
 *     est ARRIVÉ AVEC LE LOT 3 : la porte qu'il ouvre est neuve.
 *
 *  ② **Un tableau est jugé fermé sans que sa CARDINALITÉ soit regardée.**
 *     La capacité d'un tableau de textes est celle de son élément multipliée par
 *     le nombre d'éléments ; le second facteur n'est mesuré nulle part.
 *
 *  ③ **Le nombre qui fait ROUGIR n'est pas celui que l'ADR 0040 confronte.**
 *     Ce qui interrompt un test n'est plus le plafond de vitest : c'est le
 *     `throw` du fichier d'amorce, à la PART du plafond. La marge doit donc se
 *     mesurer contre le SEUIL. L'ADR la mesure contre le PLAFOND, et le seul
 *     contrôle du dépôt confronte lui aussi le plafond.
 *
 *  ④ **Le dispositif entier peut être DÉSARMÉ sans qu'une garde rougisse.**
 *     `setupFiles`, `testTimeout` et `hookTimeout` ne sont lus par AUCUNE garde
 *     du dépôt. Ce fichier pose celle qui manquait, et elle annonce ce qu'elle a
 *     lu.
 *
 * ⚠️ **AUCUN SECRET, AUCUN RÉSEAU, AUCUNE ÉCRITURE.** Tous les schémas sont
 *    fabriqués en mémoire ; les seules lectures sont celles de deux fichiers
 *    versionnés et d'un ADR.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  PART_MAXIMALE_DU_PLAFOND,
  PLAFOND_DE_TEST_MS,
  seuilDAlerteMs,
} from "../../plafond-de-test.config.js";
import { BORNE_DE_FERMETURE } from "../adapter-kit/capacite.js";
import { estValeurLibre } from "../adapter-kit/champs-declares.js";
import type { ObjetJson } from "../adapter-kit/json.js";

/** La racine du dépôt, DÉRIVÉE de l'emplacement de ce fichier. */
const RACINE = fileURLToPath(new URL("../../", import.meta.url));

function lire(chemin: string): string {
  return readFileSync(`${RACINE}${chemin}`, "utf8");
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① ET ② — LA FERMETURE NE REGARDE NI LE TYPE, NI LA CARDINALITÉ
// ═════════════════════════════════════════════════════════════════════════════

/** Un cas fabriqué : ce que le socle en dit, et ce qu'il DEVRAIT en dire. */
interface CasDeFermeture {
  readonly nom: string;
  readonly schema: ObjetJson;
  /** `true` quand le champ DEVRAIT rester surveillé (§ 20, cinquième règle). */
  readonly devraitEtreLibre: boolean;
}

/**
 * LE CORPUS EST DÉRIVÉ DE LA BORNE IMPORTÉE, jamais écrit en chiffres. Le jour
 * où `BORNE_DE_FERMETURE` bouge, ces schémas bougent avec elle.
 */
function corpusDeFermeture(): readonly CasDeFermeture[] {
  const sousLaBorne = BORNE_DE_FERMETURE;
  const auDessus = BORNE_DE_FERMETURE + 1;
  return [
    // ── LE PLANCHER : ce que l'ADR 0035 referme réellement, et bien. ────────
    {
      nom: "chaîne `maxLength` à la borne",
      schema: { type: "string", maxLength: sousLaBorne },
      devraitEtreLibre: false,
    },
    {
      nom: "chaîne `maxLength` d'un de plus",
      schema: { type: "string", maxLength: auDessus },
      devraitEtreLibre: true,
    },
    {
      nom: "objet fourre-tout NU",
      schema: { type: "object", additionalProperties: true },
      devraitEtreLibre: true,
    },
    // ── ① LE MOT-CLÉ INERTE : il ne s'applique pas à ce type, et il referme. ─
    {
      nom: "objet fourre-tout + `maxLength` (inerte sur un objet)",
      schema: { type: "object", additionalProperties: true, maxLength: sousLaBorne },
      devraitEtreLibre: true,
    },
    {
      nom: "objet fourre-tout + `pattern` borné (inerte sur un objet)",
      schema: { type: "object", additionalProperties: true, pattern: "^[a-z]{1,4}$" },
      devraitEtreLibre: true,
    },
    {
      nom: "objet fourre-tout + `format` contraignant (inerte sur un objet)",
      schema: { type: "object", additionalProperties: true, format: "uuid" },
      devraitEtreLibre: true,
    },
    // ── ② LA CARDINALITÉ : l'élément est borné, le tableau ne l'est pas. ────
    {
      nom: "tableau SANS `maxItems`, éléments fermés à la borne",
      schema: { type: "array", items: { type: "string", maxLength: sousLaBorne } },
      devraitEtreLibre: true,
    },
    {
      nom: "tableau SANS `maxItems` + `maxLength` (inerte sur un tableau)",
      schema: { type: "array", items: { type: "string" }, maxLength: sousLaBorne },
      devraitEtreLibre: true,
    },
  ];
}

/** Les cas où le socle dit FERMÉ là où le § 20 voudrait garder l'œil. */
function fermeturesDeTrop(corpus: readonly CasDeFermeture[]): readonly string[] {
  return corpus
    .filter((cas) => cas.devraitEtreLibre && !estValeurLibre(cas.schema))
    .map((cas) => cas.nom);
}

describe("① ② ADR 0035 — la fermeture se mesure en capacité, mais ni le TYPE ni la CARDINALITÉ", () => {
  it("mesure le corpus fabriqué et ANNONCE ce que le socle en dit, cas par cas", () => {
    const corpus = corpusDeFermeture();
    const verdicts = corpus.map((cas) => ({ ...cas, libre: estValeurLibre(cas.schema) }));
    const deTrop = fermeturesDeTrop(corpus);

    console.info(
      `[lot3·①②] borne importée ${String(BORNE_DE_FERMETURE)} caractère(s) · ` +
        `${String(corpus.length)} schéma(s) fabriqué(s) · ` +
        `${String(verdicts.filter((verdict) => verdict.libre).length)} jugé(s) LIBRE(s) · ` +
        `${String(verdicts.filter((verdict) => !verdict.libre).length)} jugé(s) FERMÉ(s) · ` +
        `${String(deTrop.length)} fermeture(s) de trop`,
    );
    for (const verdict of verdicts) {
      console.info(`  · ${verdict.libre ? "LIBRE" : "FERMÉ"} — ${verdict.nom}`);
    }

    // PLANCHERS — la mesure a réellement eu lieu, et elle sait rendre les DEUX
    // verdicts. Une confrontation qui n'en rendrait qu'un serait verte pour la
    // pire des raisons.
    expect(corpus.length).toBeGreaterThanOrEqual(8);
    expect(verdicts.filter((verdict) => verdict.libre).length).toBeGreaterThan(0);
    expect(verdicts.filter((verdict) => !verdict.libre).length).toBeGreaterThan(0);
    // Et la fermeture NOMINALE fonctionne : c'est ce qui rend le reste lisible.
    expect(estValeurLibre({ type: "string", maxLength: BORNE_DE_FERMETURE })).toBe(false);
    expect(estValeurLibre({ type: "string", maxLength: BORNE_DE_FERMETURE + 1 })).toBe(true);
  });

  it.fails(
    "🔴 DETTE — un mot-clé de fermeture INERTE sur son type referme quand même le champ",
    () => {
      const corpus = corpusDeFermeture();
      const deTrop = fermeturesDeTrop(corpus);

      console.info(
        `[lot3·① dette] ${String(corpus.length)} schéma(s) confronté(s) · ` +
          `${String(deTrop.length)} champ(s) refermé(s) par un mot-clé que JSON Schema ` +
          `n'applique PAS à ce type, ou par une borne d'élément sans borne de cardinalité : ` +
          `${deTrop.join(" · ") || "aucun"}`,
      );

      // `estValeurLibre` lit `maxLength`, `format` et `pattern` AVANT de lire
      // `type`. Un conteneur ouvert et un tableau non borné sortent donc de la
      // surveillance du § 20 pour le prix d'un mot-clé sans effet.
      expect(deTrop).toEqual([]);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  ③ — LA MARGE SE MESURE CONTRE LE NOMBRE QUI ROUGIT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que l'ADR 0040 transcrit de durées, et la pire d'entre elles. */
interface DureesDeLAdr {
  readonly pireCasMs: number;
  readonly lues: number;
}

/**
 * LE PIRE CAS EST LU DANS L'ADR 0040, jamais recopié ici. L'ADR porte son
 * tableau de durées mesurées sous la forme `**N ms**` ; on en prend le MAXIMUM.
 */
function pireCasTranscritDansLAdr(): DureesDeLAdr {
  const adr = lire("docs/adr/0040-le-plafond-de-duree-des-gardes-et-sa-marge.md");
  const durees = [...adr.matchAll(/\*\*(\d[\d ]*) ms\*\*/g)].map((trouve) =>
    Number.parseInt((trouve[1] ?? "").replace(/ /g, ""), 10),
  );
  return { pireCasMs: durees.length === 0 ? 0 : Math.max(...durees), lues: durees.length };
}

describe("③ ADR 0040 — la marge est mesurée contre le plafond, alors que c'est le SEUIL qui rougit", () => {
  it("lit les deux nombres et le pire cas transcrit, et ANNONCE les DEUX marges", () => {
    const { pireCasMs, lues } = pireCasTranscritDansLAdr();
    const seuilMs = seuilDAlerteMs();
    const margeContreLePlafond = pireCasMs / PLAFOND_DE_TEST_MS;
    const margeContreLeSeuil = pireCasMs / seuilMs;

    console.info(
      `[lot3·③] ${String(lues)} durée(s) lue(s) dans l'ADR 0040 · ` +
        `pire cas ${String(pireCasMs)} ms · plafond ${String(PLAFOND_DE_TEST_MS)} ms · ` +
        `part ${String(PART_MAXIMALE_DU_PLAFOND)} · seuil QUI ROUGIT ${String(seuilMs)} ms · ` +
        `pire cas / plafond = ${String(Math.round(margeContreLePlafond * 100))} % · ` +
        `pire cas / SEUIL = ${String(Math.round(margeContreLeSeuil * 100))} % · ` +
        `facteur restant avant le rouge : ${(seuilMs / pireCasMs).toFixed(2)} fois`,
    );

    // PLANCHER : l'ADR a bien été lue, et elle porte des durées.
    expect(lues).toBeGreaterThanOrEqual(4);
    expect(pireCasMs).toBeGreaterThan(0);
    // Et les deux marges sont bien DEUX nombres différents : c'est tout le point.
    expect(margeContreLeSeuil).toBeGreaterThan(margeContreLePlafond);
  });

  it.fails(
    "🔴 DETTE — le facteur restant avant le ROUGE est sous le facteur deux que l'ADR s'accorde",
    () => {
      const { pireCasMs } = pireCasTranscritDansLAdr();
      const facteurRestant = seuilDAlerteMs() / pireCasMs;

      console.info(
        `[lot3·③ dette] seuil ${String(seuilDAlerteMs())} ms divisé par le pire cas ` +
          `${String(pireCasMs)} ms = ${facteurRestant.toFixed(2)} fois · l'ADR annonce ` +
          `« il reste un facteur deux pour la contention », mais elle le calcule contre le ` +
          `plafond (${String(PLAFOND_DE_TEST_MS)} ms), qui n'interrompt plus rien avant que ` +
          `l'amorce ne lève`,
      );

      // Le fichier d'amorce fait ROUGIR à `seuilDAlerteMs()`. C'est donc CE
      // nombre, et non le plafond, qui doit laisser un facteur deux au pire cas
      // déjà mesuré sur cet arbre. Il n'en laisse pas.
      expect(facteurRestant).toBeGreaterThanOrEqual(2);
    },
  );

  it("BORNE HAUTE — le plafond ne peut pas être remonté en silence", () => {
    const { pireCasMs } = pireCasTranscritDansLAdr();
    // L'ADR 0040 justifie 30 000 ms comme « 2,8 fois le pire cas de l'arbre du
    // lot ». La borne haute est DÉRIVÉE de cette justification : au-delà de
    // quatre fois le pire cas transcrit, le plafond n'attrape plus un test
    // bloqué, il le laisse dormir. Sans cette borne, `PLAFOND_DE_TEST_MS` peut
    // être multiplié par dix sans qu'une seule garde du dépôt le remarque — et
    // le contrôle de marge resterait vert, puisqu'il ne confronte le plafond
    // qu'à `> 10 738`.
    const borneHauteMs = pireCasMs * 4;

    console.info(
      `[lot3·③ borne haute] pire cas ${String(pireCasMs)} ms · borne haute dérivée ` +
        `${String(borneHauteMs)} ms (quatre fois) · plafond posé ${String(PLAFOND_DE_TEST_MS)} ms · ` +
        `part ${String(PART_MAXIMALE_DU_PLAFOND)}`,
    );

    expect(PLAFOND_DE_TEST_MS).toBeGreaterThan(pireCasMs);
    expect(PLAFOND_DE_TEST_MS).toBeLessThanOrEqual(borneHauteMs);
    // Et la part reste dans la bande où le témoin fabriqué à 60 % rougit encore
    // et celui à 49 % passe encore — sans quoi elle dériverait de dix points
    // sans qu'aucune assertion ne le voie.
    expect(PART_MAXIMALE_DU_PLAFOND).toBeGreaterThanOrEqual(0.45);
    expect(PART_MAXIMALE_DU_PLAFOND).toBeLessThanOrEqual(0.55);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ④ — L'ARMEMENT, QUE RIEN NE LISAIT
// ═════════════════════════════════════════════════════════════════════════════

describe("④ ADR 0040 — l'armement du dispositif est lu par une garde, et elle l'ANNONCE", () => {
  it("confronte `vitest.config.ts` aux cinq réglages sans lesquels l'ADR 0040 est vide", () => {
    const config = lire("vitest.config.ts");
    const amorce = "marge-des-gardes.config.ts";

    const reglages = [
      { nom: "setupFiles", present: /setupFiles\s*:/.test(config) },
      { nom: `amorce « ${amorce} »`, present: config.includes(amorce) },
      { nom: "testTimeout", present: /testTimeout\s*:/.test(config) },
      { nom: "hookTimeout", present: /hookTimeout\s*:/.test(config) },
      {
        nom: "plafond IMPORTÉ, jamais recopié",
        present: config.includes("plafond-de-test.config.js"),
      },
    ];
    const manquants = reglages.filter((reglage) => !reglage.present).map((reglage) => reglage.nom);

    console.info(
      `[lot3·④] ${String(config.length)} octet(s) lus dans vitest.config.ts · ` +
        `${String(reglages.length)} réglage(s) confronté(s) · ` +
        `${String(reglages.length - manquants.length)} présent(s) · ` +
        `${String(manquants.length)} manquant(s) : ${manquants.join(", ") || "aucun"}`,
    );

    // PLANCHER : le fichier a réellement été lu.
    expect(config.length).toBeGreaterThan(200);
    expect(reglages.length).toBeGreaterThanOrEqual(5);
    // ⚠️ RETIRER L'UN DES CINQ DÉSARME L'ADR 0040 SANS RIEN CASSER D'AUTRE :
    //    les cinq tests de `core/audit/marge-des-gardes.spec.ts` éprouvent la
    //    fonction PURE, et restent verts sur une configuration désarmée. Cette
    //    garde-ci est la seule du dépôt qui regarde l'armement.
    expect(manquants, "l'armement de l'ADR 0040 a été retiré de vitest.config.ts").toEqual([]);
  });

  it("mesure combien de réglages la garde du lot confrontait AVANT ce fichier", () => {
    // La question à laquelle ce compte répond : « le lot 3 a-t-il posé une garde
    // sur son propre dispositif ? ». On lit la seule garde qu'il lui a donnée,
    // et on cherche si elle nomme les trois réglages.
    const gardeDuLot = lire("core/audit/marge-des-gardes.spec.ts");
    const cles = ["setupFiles", "testTimeout", "hookTimeout"];
    const nommees = cles.filter((cle) => gardeDuLot.includes(cle));

    console.info(
      `[lot3·④ antériorité] ${String(gardeDuLot.length)} octet(s) lus dans ` +
        `core/audit/marge-des-gardes.spec.ts · ${String(cles.length)} réglage(s) cherché(s) · ` +
        `${String(nommees.length)} nommé(s) : ${nommees.join(", ") || "aucun"}`,
    );

    expect(gardeDuLot.length).toBeGreaterThan(200);
    // Le constat, transcrit en assertion : la garde du lot n'en nomme AUCUN. Le
    // jour où elle les nommera, ce test rougira — et ce sera le bon moment pour
    // retirer celui-ci.
    expect(nommees).toEqual([]);
  });
});

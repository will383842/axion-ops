import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { lireClesDAutorisation } from "../../core/adapter-kit/index.js";
import { PROFILE_NAMES, SCEAU_PROFILS } from "../../core/profiles/index.js";
import {
  empreinteDuManifesteProduit,
  enregistrerAdaptateur,
  entreePourId,
  lireManifesteRecu,
  lireVerrou,
  type VerrouAdaptateurs,
} from "../../core/registry/index.js";

/**
 * `adapters/axionia/verrou.spec.ts` — L'ÉPINGLE, CONFRONTÉE AU REGISTRE RÉEL.
 *
 * Trois choses doivent dire la même empreinte : ce que l'adaptateur PUBLIE
 * (`manifestSha` de l'instantané), ce que le socle CALCULE sur la copie épinglée
 * (`empreinteDuManifesteProduit`), et ce que le VERROU épingle. Deux dérivations
 * d'un même fait qui se contredisent sont la panne que ce dépôt nomme le plus
 * souvent ; ici elles sont trois, et confrontées.
 *
 * 🔑 Puis le registre réel ADMET le manifeste avec le verrou réel. Avant ce
 *    fichier, cette mesure vivait hors dépôt (`_AXION-OPS-DOSSIER/mesures/`) :
 *    une mesure qu'aucune CI ne rejoue vieillit en silence.
 */

interface Instantane {
  readonly manifestSha: string;
  readonly manifeste: { readonly id: string; readonly tools: readonly { name: string }[] };
}

function lireJson(relatif: string): unknown {
  return JSON.parse(readFileSync(new URL(relatif, import.meta.url), "utf8")) as unknown;
}

const instantane = lireJson("./manifeste.json") as Instantane;
const lectureVerrou = lireVerrou(lireJson("../../core/registry/adapters.lock.json"));

function verrouReel(): VerrouAdaptateurs {
  if (lectureVerrou.verrou === null) throw new Error("verrou illisible — voir le premier test");
  return lectureVerrou.verrou;
}

function admettre(verrou: VerrouAdaptateurs) {
  return enregistrerAdaptateur({
    manifesteBrut: instantane.manifeste,
    verrou,
    profilsConnus: PROFILE_NAMES,
    sceauProfils: SCEAU_PROFILS,
    clesDAutorisation: [...lireClesDAutorisation().toutes],
  });
}

describe("adapters.lock.json — le verrou réel", () => {
  it("se lit sans anomalie, et porte « axionia » en mode fédéré, joignable", () => {
    expect(lectureVerrou.verdict.anomalies).toEqual([]);
    expect(lectureVerrou.verrou).not.toBeNull();
    const entree = entreePourId(verrouReel(), "axionia");
    expect(entree).toBeDefined();
    expect(entree?.mode).toBe("fédéré");
    expect(entree?.authMode).toBe("secret-partage");
    expect(entree?.secretRef).not.toBeNull();
    // Un endpoint « .invalid » est celui de l'exemple : il ne joint rien.
    expect(entree?.endpoint).toMatch(/^https:\/\/axion-ia\.com\/api\/mcp$/);
    console.info(
      `[verrou] ${String(lectureVerrou.verdict.mesures)} entrée(s), ` +
        `${String(lectureVerrou.verdict.anomalies.length)} anomalie(s)`,
    );
  });
});

describe("l'empreinte — trois dérivations, une valeur", () => {
  it("publiée par l'adaptateur = calculée par le socle = épinglée au verrou", () => {
    const lecture = lireManifesteRecu(instantane.manifeste);
    expect(lecture.verdict.anomalies).toEqual([]);
    if (lecture.manifeste === null) throw new Error("manifeste illisible");
    const calculee = empreinteDuManifesteProduit(lecture.manifeste);
    const epinglee = entreePourId(verrouReel(), "axionia")?.manifestSha;
    expect(calculee).toBe(instantane.manifestSha);
    expect(epinglee).toBe(calculee);
    console.info(`[verrou] empreinte ${calculee.slice(0, 19)}… — publiée = calculée = épinglée`);
  });
});

describe("le registre réel", () => {
  it("ADMET le manifeste d'Axion-IA avec le verrou réel, et compte ses outils", () => {
    const resultat = admettre(verrouReel());
    if (!resultat.admis) {
      throw new Error(resultat.refus.map((r) => `${r.motif} : ${r.detail}`).join("\n"));
    }
    expect(resultat.outilsInspectes).toBe(instantane.manifeste.tools.length);
    expect(instantane.manifeste.tools.length).toBeGreaterThanOrEqual(1);
    console.info(
      `[verrou] admis · ${String(resultat.outilsInspectes)} outil(s) inspecté(s) · ` +
        `${String(resultat.annonces.length)} garde(s) annoncée(s)`,
    );
  });

  it("🔑 REFUSE le même manifeste sous une épingle qui diffère d'un caractère", () => {
    const reel = verrouReel();
    const entree = entreePourId(reel, "axionia");
    if (entree === undefined) throw new Error("entrée axionia absente");
    const dernier = entree.manifestSha.at(-1) === "0" ? "1" : "0";
    const fausse: VerrouAdaptateurs = {
      ...reel,
      adapters: [{ ...entree, manifestSha: `${entree.manifestSha.slice(0, -1)}${dernier}` }],
    };
    const resultat = admettre(fausse);
    expect(resultat.admis).toBe(false);
    if (!resultat.admis) {
      console.info(
        `[verrou] refus sous une épingle altérée : ${resultat.refus.map((r) => r.motif).join(", ")}`,
      );
      expect(resultat.refus.length).toBeGreaterThanOrEqual(1);
    }
  });
});

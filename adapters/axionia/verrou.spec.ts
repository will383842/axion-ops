import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { lireClesDAutorisation } from "../../core/adapter-kit/index.js";
import { nomCompletDeLOutil } from "../../core/federe/raccordement.js";
import { PROFILE_NAMES, SCEAU_PROFILS, outilsServis } from "../../core/profiles/index.js";
import {
  DepotDuRegistreEnMemoire,
  construireLeCatalogue,
  empreinteDuManifesteProduit,
  enregistrerAdaptateur,
  entreePourId,
  indexerLeManifeste,
  lireManifesteRecu,
  lireVerrou,
  versEnregistrementOutil,
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

// ═════════════════════════════════════════════════════════════════════════════
//  DU MANIFESTE ÉPINGLÉ AU CATALOGUE SERVI — la chaîne complète, sans réseau
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 🔑 **CE QUE CETTE SUITE ÉTABLIT, ET QU'AUCUNE AUTRE NE POUVAIT.**
 *
 * Les gardes du dépôt et du catalogue tournent sur des documents FABRIQUÉS. Ici,
 * les deux documents sont les VRAIS : le manifeste épinglé d'Axion-IA, et le
 * verrou versionné dans le socle. La chaîne parcourue est celle de la
 * production — admission → écriture → relecture → catalogue → nom sur le fil —
 * et elle s'arrête à la porte du réseau, qui appartient à `appel.ts`.
 */
describe("🔑 la chaîne complète : manifeste épinglé → ops_tool → OutilDuCatalogue", () => {
  it("sert les 7 outils d'Axion-IA sous leur nom COMPLET, prêts pour `tools/call`", async () => {
    const resultat = admettre(verrouReel());
    if (!resultat.admis) throw new Error("le manifeste réel n'est plus admis");

    // ── L'ADMISSION SE POSE ────────────────────────────────────────────────
    const depot = new DepotDuRegistreEnMemoire();
    const ecriture = await depot.ecrireAdmission(
      resultat.adaptateur,
      resultat.outils.map(versEnregistrementOutil),
    );

    // ── LA CONSOLE ACTIVE, SANS REDÉPLOIEMENT ──────────────────────────────
    for (const outil of resultat.outils) {
      depot.reglerCommeLaConsole(outil.name, outil.version, { enabled: true });
    }

    // ── LE CATALOGUE SE LIT DANS LES DEUX DOCUMENTS ────────────────────────
    const lecture = lireManifesteRecu(instantane.manifeste);
    if (lecture.manifeste === null) throw new Error("manifeste illisible");
    const catalogue = construireLeCatalogue(
      await depot.listerOutils(),
      [indexerLeManifeste(lecture.manifeste)],
      new Date("2026-09-02T00:00:00.000Z"),
    );

    const servis = outilsServis(catalogue.outils, "admin");
    const surLeFil = catalogue.outils.map((outil) => nomCompletDeLOutil(outil));

    console.info(
      `[bout en bout] ${String(ecriture.outilsInseres)} ligne(s) ops_tool insérée(s) · ` +
        `${String(catalogue.lignesLues)} relue(s) · ${String(catalogue.outils.length)} au ` +
        `catalogue · ${String(servis.length)} servi(s) au profil « admin » · ` +
        `${String(catalogue.sansEntreeAuManifeste.length)} sans épingle · ` +
        `${String(catalogue.desaccords.length)} désaccord(s)`,
    );
    console.info(`[bout en bout] sur le fil : ${surLeFil.join(", ")}`);

    // Le compte vient du manifeste réel, pas d'un nombre recopié ici.
    const attendus = instantane.manifeste.tools.length;
    expect(ecriture.outilsInseres).toBe(attendus);
    expect(ecriture.outilsOrphelins).toEqual([]);
    expect(catalogue.outils).toHaveLength(attendus);
    expect(catalogue.sansEntreeAuManifeste).toEqual([]);
    expect(catalogue.desaccords).toEqual([]);
    expect(servis).toHaveLength(attendus);

    // 🔑 CE QUI PART DANS `params.name` — préfixé UNE fois, jamais deux.
    expect(surLeFil).toContain("axionia.inbox.recent");
    expect(surLeFil.every((nom) => !nom.startsWith("axionia.axionia."))).toBe(true);

    // Les cinq champs que `ops_tool` ne porte pas sont bien venus du manifeste.
    const inbox = catalogue.outils.find((outil) => outil.name === "axionia.inbox.recent");
    expect(inbox?.maxBytes).toBe(20_480);
    expect(inbox?.idFields).toEqual(["id"]);
    expect(inbox?.adapterVersion).toBe(lecture.manifeste.version);
  });

  it("TÉMOIN — sans le manifeste épinglé, AUCUN outil n'est servi", async () => {
    const resultat = admettre(verrouReel());
    if (!resultat.admis) throw new Error("le manifeste réel n'est plus admis");

    const depot = new DepotDuRegistreEnMemoire();
    await depot.ecrireAdmission(resultat.adaptateur, resultat.outils.map(versEnregistrementOutil));

    // Les lignes `ops_tool` existent, l'épingle n'est pas fournie : on ne sert
    // rien plutôt que d'inventer un `maxBytes` et une `compaction`.
    const sansEpingle = construireLeCatalogue(
      await depot.listerOutils(),
      [],
      new Date("2026-09-02T00:00:00.000Z"),
    );

    console.info(
      `[bout en bout · témoin] ${String(sansEpingle.lignesLues)} ligne(s) en base · ` +
        `${String(sansEpingle.outils.length)} servi(s) · adaptateur(s) muet(s) : ` +
        `${sansEpingle.adaptateursSansManifeste.join(", ")}`,
    );

    expect(sansEpingle.lignesLues).toBe(instantane.manifeste.tools.length);
    expect(sansEpingle.outils).toEqual([]);
    expect(sansEpingle.adaptateursSansManifeste).toEqual(["axionia"]);
  });
});

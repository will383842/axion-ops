import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  clesDuManifeste,
  clesReserveesAuSocle,
  entreePourId,
  lireVerrou,
  verifierCouvertureDuVerrou,
} from "./lock.js";
import { estVert } from "../adapter-kit/verdict.js";
import { ENTREE_VERROU_TEMOIN } from "./types.js";
import type { EntreeVerrou, VerrouAdaptateurs } from "./types.js";

/**
 * Gardes du VERROU (`adapters.lock.json`, § 09 et § 14).
 */

function entree(surcharges: Partial<EntreeVerrou> = {}): EntreeVerrou {
  return {
    id: "axionia",
    version: "1.0.0",
    mode: "fédéré",
    manifestSha: `sha256:${"a".repeat(64)}`,
    trustTier: 1,
    maxDataClass: "personal",
    endpoint: "https://exemple.invalid/api/mcp",
    authMode: "secret-partage",
    secretRef: "axionia.mcp.shared",
    ...surcharges,
  };
}

function verrou(adapters: readonly EntreeVerrou[]): unknown {
  return { lockVersion: 1, adapters };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Les clés réservées au socle sont DÉRIVÉES, pas écrites
// ═════════════════════════════════════════════════════════════════════════════

describe("les clés que le socle se réserve", () => {
  it("sont la DIFFÉRENCE entre la forme du verrou et celle du manifeste", () => {
    const duManifeste = clesDuManifeste();
    const reservees = clesReserveesAuSocle();

    // Compte mesuré : une dérivation qui rendrait une liste vide laisserait
    // passer un manifeste qui se décerne son propre `trustTier`.
    expect(duManifeste.length).toBeGreaterThanOrEqual(5);
    expect(reservees.length).toBeGreaterThanOrEqual(4);

    // Ce que le § 12 nomme explicitement.
    expect(reservees).toContain("trustTier");
    expect(reservees).toContain("maxDataClass");

    // Et la PREUVE que c'est bien une différence et non une liste recopiée :
    // `id`, `version` et `mode` figurent dans les deux formes, donc ne sont
    // PAS réservés. Une liste écrite à la main aurait pu les y mettre.
    for (const partagee of ["id", "version", "mode"]) {
      expect(duManifeste).toContain(partagee);
      expect(reservees).not.toContain(partagee);
    }
  });

  it("suit le témoin d'entrée de verrou, qui est complet par TYPE", () => {
    // Ajouter un champ à `EntreeVerrou` sans l'ajouter au témoin ne compile
    // pas ; le champ nouveau devient donc réservé sans qu'on retouche rien.
    const clesTemoin = Object.keys(ENTREE_VERROU_TEMOIN);
    const duManifeste = new Set(clesDuManifeste());
    expect(clesReserveesAuSocle()).toEqual(
      clesTemoin.filter((cle) => !duManifeste.has(cle)).sort(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  La lecture du verrou
// ═════════════════════════════════════════════════════════════════════════════

describe("la lecture du verrou", () => {
  it("accepte un verrou cohérent et annonce combien d'entrées il a lues", () => {
    const lecture = lireVerrou(
      verrou([
        entree(),
        entree({
          id: "zoho-mail",
          mode: "hébergé",
          endpoint: null,
          authMode: "en-processus",
          secretRef: "zoho.refresh",
        }),
      ]),
    );

    expect(lecture.verdict.anomalies).toEqual([]);
    expect(lecture.verdict.mesures).toBe(2);
    expect(lecture.verrou).not.toBeNull();
  });

  it("rougit sur deux entrées de même id — la seconde serait ignorée en silence", () => {
    const lecture = lireVerrou(verrou([entree(), entree()]));
    expect(lecture.verrou).toBeNull();
    expect(lecture.verdict.anomalies.some((a) => /deux entrées/.test(a))).toBe(true);
  });

  it("rougit sur une empreinte tronquée — un SHA court comparerait autre chose", () => {
    const lecture = lireVerrou(verrou([entree({ manifestSha: "sha256:abc" })]));
    expect(lecture.verrou).toBeNull();
    expect(lecture.verdict.mesures).toBe(0);
  });

  it("rougit sur un adaptateur fédéré sans endpoint, et sans secretRef", () => {
    const sansEndpoint = lireVerrou(verrou([entree({ endpoint: null })]));
    expect(sansEndpoint.verdict.anomalies.some((a) => /sans endpoint/.test(a))).toBe(true);

    const sansSecret = lireVerrou(verrou([entree({ secretRef: null })]));
    expect(sansSecret.verdict.anomalies.some((a) => /sans secretRef/.test(a))).toBe(true);
  });

  it("rougit sur un adaptateur hébergé doté d'un endpoint", () => {
    const lecture = lireVerrou(
      verrou([entree({ mode: "hébergé", authMode: "en-processus", secretRef: null })]),
    );
    expect(lecture.verdict.anomalies.some((a) => /hébergé avec un endpoint/.test(a))).toBe(true);
  });

  it("rougit sur un champ inconnu — le schéma du verrou est FERMÉ", () => {
    const lecture = lireVerrou({
      lockVersion: 1,
      adapters: [{ ...entree(), trustTierBis: 9 }],
    });
    expect(lecture.verrou).toBeNull();
  });

  it("retrouve une entrée par son id, et rend `undefined` sinon", () => {
    const lecture = lireVerrou(verrou([entree()]));
    const lu: VerrouAdaptateurs | null = lecture.verrou;
    expect(lu).not.toBeNull();
    if (lu === null) return;
    expect(entreePourId(lu, "axionia")?.trustTier).toBe(1);
    expect(entreePourId(lu, "absent")).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  La garde du § 14 — la couverture
// ═════════════════════════════════════════════════════════════════════════════

describe("la couverture du verrou — la garde du § 14", () => {
  const deux: VerrouAdaptateurs = {
    lockVersion: 1,
    adapters: [entree(), entree({ id: "zoho-mail" })],
  };

  it("rougit quand ZÉRO manifeste a été lu pour deux adaptateurs épinglés", () => {
    // C'est le cas exact que le § 14 décrit : « la garde vit dans la CI du socle
    // pendant que les outils qui la feraient rougir vivent dans deux autres
    // dépôts — elle mesure zéro et reste verte ».
    const verdict = verifierCouvertureDuVerrou(deux, []);

    expect(verdict.mesures).toBe(0);
    expect(verdict.plancher).toBe(2);
    expect(verdict.anomalies.some((a) => /axionia, zoho-mail/.test(a))).toBe(true);
  });

  it("NOMME l'adaptateur manquant quand il n'en manque qu'un", () => {
    const verdict = verifierCouvertureDuVerrou(deux, [{ id: "axionia" }]);
    expect(verdict.mesures).toBe(1);
    expect(verdict.anomalies.some((a) => /zoho-mail/.test(a))).toBe(true);
  });

  it("rougit aussi sur un manifeste lu qui n'est épinglé nulle part", () => {
    const verdict = verifierCouvertureDuVerrou(deux, [
      { id: "axionia" },
      { id: "zoho-mail" },
      { id: "crm-pro" },
    ]);
    expect(verdict.anomalies.some((a) => /crm-pro/.test(a))).toBe(true);
  });

  it("rougit sur un verrou VIDE — 0 mesuré, plancher 0, et pourtant `estVert`", () => {
    // TÉMOIN DÉCISIF. Sur un verrou sans aucune entrée, la garde rendait
    // `mesures: 0`, `plancher: 0`, `anomalies: []` — donc `estVert()` VRAI après
    // n'avoir lu AUCUN manifeste. C'est mot pour mot le défaut que le § 14
    // décrit : « elle mesure zéro et reste verte ». Un `adapters.lock.json`
    // vidé, lu au mauvais chemin ou mal désérialisé passait sans un mot.
    const vide: VerrouAdaptateurs = { lockVersion: 1, adapters: [] };
    const verdict = verifierCouvertureDuVerrou(vide, []);

    console.info(
      `[garde couverture] verrou vide : ${String(verdict.mesures)} manifeste(s) lu(s), ` +
        `plancher ${String(verdict.plancher)}, ${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.mesures).toBe(0);
    expect(verdict.plancher).toBe(0);
    // Le plancher seul NE SUFFIT PAS à faire rougir ce cas : `0 >= 0` est
    // satisfait. Il faut donc une anomalie explicite, qui dise quoi faire.
    expect(verdict.mesures).toBeGreaterThanOrEqual(verdict.plancher);
    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toMatch(/AUCUN adaptateur/);
    expect(estVert(verdict)).toBe(false);
  });

  it("est verte quand chaque adaptateur épinglé a bien été lu", () => {
    const verdict = verifierCouvertureDuVerrou(deux, [{ id: "axionia" }, { id: "zoho-mail" }]);
    expect(verdict.anomalies).toEqual([]);
    expect(verdict.mesures).toBe(2);
    expect(verdict.mesures).toBeGreaterThanOrEqual(verdict.plancher);
    // Le témoin inverse du cas « verrou vide » : ici la garde a réellement
    // regardé deux adaptateurs, et c'est CE compte qui rend son vert lisible.
    expect(estVert(verdict)).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'exemple de format est LU, pas seulement écrit
// ═════════════════════════════════════════════════════════════════════════════

describe("`adapters.lock.example.json`", () => {
  function exemple(): Record<string, unknown> {
    // Chemin dérivé de `import.meta.url` : une garde au chemin figé depuis la
    // racine devient muette au premier déménagement du dossier.
    const chemin = fileURLToPath(new URL("./adapters.lock.example.json", import.meta.url));
    return JSON.parse(readFileSync(chemin, "utf8")) as Record<string, unknown>;
  }

  it("passe `lireVerrou` une fois son commentaire retiré, et porte 2 entrées", () => {
    const { _lisez_moi: notice, ...contenu } = exemple();

    expect(notice).toBeDefined();
    const lecture = lireVerrou(contenu);

    expect(lecture.verdict.anomalies).toEqual([]);
    expect(lecture.verdict.mesures).toBe(2);
    // Compte mesuré : un exemple vidé de ses entrées passerait le schéma sans
    // rien documenter, et ce test resterait vert.
    expect(lecture.verrou?.adapters).toHaveLength(2);
  });

  it("est REFUSÉ tel quel — le schéma du verrou est fermé, notice comprise", () => {
    // Témoin à double détente : il prouve à la fois que le schéma est fermé et
    // que la notice de l'exemple n'a pas d'équivalent dans le vrai fichier.
    expect(lireVerrou(exemple()).verrou).toBeNull();
  });

  it("montre les DEUX modes, avec leur raccordement propre", () => {
    const { _lisez_moi: _notice, ...contenu } = exemple();
    const lu = lireVerrou(contenu).verrou;
    expect(lu).not.toBeNull();
    if (lu === null) return;

    const federe = entreePourId(lu, "axionia");
    const heberge = entreePourId(lu, "zoho-mail");

    expect(federe?.mode).toBe("fédéré");
    expect(federe?.endpoint).not.toBeNull();
    expect(heberge?.mode).toBe("hébergé");
    expect(heberge?.endpoint).toBeNull();
  });
});

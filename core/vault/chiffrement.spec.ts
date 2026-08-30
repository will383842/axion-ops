import { describe, expect, it } from "vitest";

import {
  LONGUEUR_CLE,
  LONGUEUR_IV,
  LONGUEUR_TAG,
  SEPARATEUR_AAD,
  chiffrer,
  construireAad,
  dechiffrer,
  motifCleInvalide,
  motifNomInvalide,
  motifVersionInvalide,
} from "./chiffrement.js";
import { ErreurDeCoffre } from "./erreurs.js";

/**
 * Gardes du chiffrement — AES-GCM, AAD = `name‖version` (§ 07).
 *
 * Motif repris de `core/types.spec.ts` : chaque garde est une fonction pure,
 * appliquée D'ABORD à un témoin fabriqué défectueux — on prouve qu'elle rougit
 * — PUIS à la vraie donnée ; et chacune ANNONCE COMBIEN D'ÉLÉMENTS elle a
 * mesurés, avec un plancher-témoin.
 */

/** Une clé de test, jamais un secret réel. Motif reconnaissable à l'œil. */
function cleDeTest(remplissage: number): Uint8Array {
  return Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, remplissage));
}

const CLAIR = Buffer.from("un jeton de rafraîchissement, pour l'exemple", "utf8");

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — l'aller-retour
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/chiffrement — aller-retour", () => {
  it("rend exactement le clair d'origine, pour chaque taille mesurée", () => {
    // Les tailles ne sont pas prises au hasard : 0 (un secret vide est une
    // faute de l'appelant, pas une erreur de chiffrement), 1, une taille
    // ordinaire, et 4 096 — au-delà d'un bloc, pour que `update` et `final`
    // travaillent tous les deux.
    const tailles = [0, 1, 32, 4096];
    const cle = cleDeTest(0x11);
    let mesurees = 0;

    for (const taille of tailles) {
      const clair = Uint8Array.from(Buffer.alloc(taille, 0xab));
      const enveloppe = chiffrer({
        keyId: "k-1",
        cle,
        nom: "zoho.refresh_token",
        version: 1,
        clair,
      });

      expect(enveloppe.iv).toHaveLength(LONGUEUR_IV);
      expect(enveloppe.tag).toHaveLength(LONGUEUR_TAG);

      const rendu = dechiffrer({ cle, nom: "zoho.refresh_token", version: 1, enveloppe });
      expect(Uint8Array.from(rendu)).toEqual(clair);
      mesurees += 1;
    }

    console.info(`[garde aller-retour] ${String(mesurees)} tailles de clair mesurées`);
    expect(mesurees).toBe(tailles.length);
    expect(mesurees).toBeGreaterThanOrEqual(4);
  });

  it("ne rend jamais deux fois le même IV — sinon GCM perd sa sécurité", () => {
    const cle = cleDeTest(0x22);
    const vus = new Set<string>();
    const tirages = 200;

    for (let i = 0; i < tirages; i += 1) {
      const enveloppe = chiffrer({ keyId: "k-1", cle, nom: "n", version: 1, clair: CLAIR });
      vus.add(Buffer.from(enveloppe.iv).toString("hex"));
    }

    console.info(`[garde IV] ${String(vus.size)} IV distincts sur ${String(tirages)} tirages`);
    expect(vus.size).toBe(tirages);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — L'AAD MORD. C'est la garde centrale de ce fichier.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ce que la garde vérifie : chaque déviation du couple `(nom, version)` fait
 * ÉCHOUER le déchiffrement, avec la raison `dechiffrement_impossible`.
 *
 * Sans cela, une ligne `ops_secret` déplacée d'un `name` à un autre — ou d'une
 * version à une autre — s'ouvrirait sans un mot. Le § 27 exige de « garder
 * l'ancien refresh token valide pendant la propagation » : c'est précisément
 * quand deux versions coexistent qu'une confusion de version ne se verrait pas.
 */
describe("core/vault/chiffrement — l'AAD authentifie le contexte", () => {
  const cle = cleDeTest(0x33);
  const enveloppe = chiffrer({
    keyId: "k-1",
    cle,
    nom: "zoho.refresh_token",
    version: 2,
    clair: CLAIR,
  });

  it("s'ouvre avec le bon couple (nom, version) — le témoin positif", () => {
    const rendu = dechiffrer({ cle, nom: "zoho.refresh_token", version: 2, enveloppe });
    expect(rendu.toString("utf8")).toBe(CLAIR.toString("utf8"));
  });

  it("REFUSE chacune des déviations d'AAD mesurées", () => {
    const deviations: ReadonlyArray<readonly [string, string, number]> = [
      ["autre nom", "zoho.access_token", 2],
      ["version plus basse", "zoho.refresh_token", 1],
      ["version plus haute", "zoho.refresh_token", 3],
      ["nom d'un autre adaptateur", "axionia.secret_partage", 2],
      ["nom à la casse différente", "Zoho.refresh_token", 2],
    ];

    let mesurees = 0;
    for (const [libelle, nom, version] of deviations) {
      let raison: string | null = null;
      try {
        dechiffrer({ cle, nom, version, enveloppe });
      } catch (erreur) {
        raison = erreur instanceof ErreurDeCoffre ? erreur.raison : "erreur-inattendue";
      }
      expect(raison, libelle).toBe("dechiffrement_impossible");
      mesurees += 1;
    }

    console.info(
      `[garde AAD] ${String(mesurees)} déviations de contexte mesurées, toutes refusées`,
    );
    expect(mesurees).toBe(deviations.length);
    expect(mesurees).toBeGreaterThanOrEqual(5);
  });

  it("REFUSE une mauvaise clé, et une ligne altérée", () => {
    const alterations: ReadonlyArray<readonly [string, () => void]> = [
      [
        "mauvaise clé",
        () => {
          dechiffrer({ cle: cleDeTest(0x44), nom: "zoho.refresh_token", version: 2, enveloppe });
        },
      ],
      [
        "ciphertext altéré d'un bit",
        () => {
          const abime = Uint8Array.from(enveloppe.ciphertext);
          abime[0] = (abime[0] ?? 0) ^ 0x01;
          dechiffrer({
            cle,
            nom: "zoho.refresh_token",
            version: 2,
            enveloppe: { ...enveloppe, ciphertext: abime },
          });
        },
      ],
      [
        "tag altéré",
        () => {
          const abime = Uint8Array.from(enveloppe.tag);
          abime[0] = (abime[0] ?? 0) ^ 0x01;
          dechiffrer({
            cle,
            nom: "zoho.refresh_token",
            version: 2,
            enveloppe: { ...enveloppe, tag: abime },
          });
        },
      ],
      [
        "IV d'une autre ligne",
        () => {
          const autre = chiffrer({ keyId: "k-1", cle, nom: "n", version: 1, clair: CLAIR });
          dechiffrer({
            cle,
            nom: "zoho.refresh_token",
            version: 2,
            enveloppe: { ...enveloppe, iv: autre.iv },
          });
        },
      ],
    ];

    let mesurees = 0;
    for (const [libelle, provoquer] of alterations) {
      expect(provoquer, libelle).toThrowError(ErreurDeCoffre);
      mesurees += 1;
    }

    console.info(`[garde intégrité] ${String(mesurees)} altérations mesurées, toutes refusées`);
    expect(mesurees).toBeGreaterThanOrEqual(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — le séparateur d'AAD n'est pas décoratif
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/chiffrement — un nom ne peut pas contenir le séparateur", () => {
  it("rougit sur le témoin fabriqué : deux couples distincts, un seul AAD", () => {
    // LE PIÈGE, montré avant d'être fermé. Sans la garde de `motifNomInvalide`,
    // ces deux couples produiraient la MÊME chaîne d'AAD :
    const naif = (nom: string, version: number): string =>
      `${nom}${SEPARATEUR_AAD}${String(version)}`;

    expect(naif(`a${SEPARATEUR_AAD}1`, 2)).toBe(naif("a", 1) + `${SEPARATEUR_AAD}2`);

    // Et c'est exactement ce que `construireAad` refuse :
    expect(() => construireAad(`a${SEPARATEUR_AAD}1`, 2)).toThrowError(ErreurDeCoffre);
  });

  it("mesure les noms refusés et les noms acceptés, sans en oublier", () => {
    const refuses = ["", " ", "  espaces  ", `avec${SEPARATEUR_AAD}separateur`];
    const acceptes = ["zoho.refresh_token", "axionia.secret_partage", "__sceau__", "a"];

    let mesures = 0;
    for (const nom of refuses) {
      expect(motifNomInvalide(nom), `« ${nom} » aurait dû être refusé`).not.toBeNull();
      mesures += 1;
    }
    for (const nom of acceptes) {
      expect(motifNomInvalide(nom), `« ${nom} » aurait dû être accepté`).toBeNull();
      mesures += 1;
    }

    console.info(`[garde nom] ${String(mesures)} noms mesurés`);
    expect(mesures).toBe(refuses.length + acceptes.length);
    expect(mesures).toBeGreaterThanOrEqual(8);
  });

  it("refuse les versions qui ne désignent rien", () => {
    const refusees = [0, -1, 1.5, Number.NaN];
    let mesures = 0;
    for (const version of refusees) {
      expect(motifVersionInvalide(version), String(version)).not.toBeNull();
      mesures += 1;
    }
    expect(motifVersionInvalide(1)).toBeNull();
    mesures += 1;

    console.info(`[garde version] ${String(mesures)} versions mesurées`);
    expect(mesures).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — la longueur de clé est refusée TÔT
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/chiffrement — la clé fait 32 octets, ou rien", () => {
  it("refuse toute longueur autre, et nomme les deux nombres", () => {
    const longueurs = [0, 1, 16, 24, 31, 33, 64];
    let mesurees = 0;

    for (const longueur of longueurs) {
      const motif = motifCleInvalide(new Uint8Array(longueur));
      expect(motif, `longueur ${String(longueur)}`).not.toBeNull();
      // Le message NOMME la longueur attendue et la longueur reçue — sans quoi
      // « clé invalide » envoie chercher au mauvais endroit.
      expect(motif).toContain(String(LONGUEUR_CLE));
      expect(motif).toContain(String(longueur));
      mesurees += 1;
    }

    // ⚠️ La bonne longueur ne suffit PAS : depuis le lot 1, trente-deux octets
    //    à zéro sont refusés eux aussi (voir la garde suivante). Le témoin de
    //    « longueur acceptée » emploie donc un matériau non dégénéré.
    expect(motifCleInvalide(cleDeTest(0x3c))).toBeNull();
    mesurees += 1;

    console.info(`[garde longueur de clé] ${String(mesurees)} longueurs mesurées`);
    expect(mesurees).toBe(longueurs.length + 1);
  });

  it("refuse une clé de la BONNE longueur mais entièrement à zéro", () => {
    // Le piège que la seule mesure de longueur laissait passer : un
    // `Buffer.alloc(32)` oublié, une variable d'environnement tronquée, un
    // gabarit non rempli. La clé provisionnait le coffre, qui s'annonçait
    // ensuite nominal — et son `keyId`, dérivé du matériau, était
    // publiquement calculable.
    const motif = motifCleInvalide(new Uint8Array(LONGUEUR_CLE));

    console.info(
      `[garde clé dégénérée] 2 matériaux mesurés · tout à zéro → ${motif === null ? "ACCEPTÉE" : "refusée"} · ` +
        `motif non dégénéré → ${motifCleInvalide(cleDeTest(0x3c)) === null ? "acceptée" : "REFUSÉE"}`,
    );

    expect(motif, "une clé tout à zéro n'a aucune entropie").not.toBeNull();
    // Contre-témoin dans la même garde : le refus ne mord QUE sur le cas
    // dégénéré, sinon il rejetterait toutes les clés du dépôt.
    expect(motifCleInvalide(cleDeTest(0x3c))).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { LONGUEUR_CLE } from "./chiffrement.js";
import { ErreurDeCoffre } from "./erreurs.js";
import {
  VARIABLES_DE_CLE,
  cleDuTrousseau,
  clonerTrousseau,
  depuisDeverrouillageManuel,
  depuisEnvironnement,
  effacerTrousseau,
  empreinteDeCle,
  keyIdsDuTrousseau,
} from "./source-de-cle.js";
import type { SourceDeCle } from "./source-de-cle.js";

/**
 * Gardes de la source de clé — la décision W-4 n'est PAS prise (§ 16).
 *
 * La garde centrale de ce fichier : LES DEUX IMPLÉMENTATIONS SATISFONT LE MÊME
 * CONTRAT. Elle est écrite comme une batterie appliquée à chaque source, et
 * annonce combien de sources elle a mesurées — parce que le jour où quelqu'un
 * en ajoute une troisième (« clé dans un fichier du volume persistant », le
 * repli nommé par W-4), ce fichier doit la mesurer sans qu'on y pense.
 */

function cleBase64(remplissage: number): string {
  return Buffer.alloc(LONGUEUR_CLE, remplissage).toString("base64");
}

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 1 — le contrat commun
// ─────────────────────────────────────────────────────────────────────────────

/** Les deux sources, avec de quoi les amener à l'état « clé posée ». */
function sourcesAMesurer(): ReadonlyArray<readonly [string, SourceDeCle, () => void]> {
  const manuelle = depuisDeverrouillageManuel();
  return [
    [
      "environnement",
      depuisEnvironnement({ [VARIABLES_DE_CLE.cle]: cleBase64(0x11) }),
      (): void => {
        // Rien à faire : la clé est déjà là.
      },
    ],
    [
      "déverrouillage-manuel",
      manuelle,
      (): void => {
        manuelle.poser(cleBase64(0x11));
      },
    ],
  ];
}

describe("core/vault/source-de-cle — le contrat commun aux deux sources", () => {
  it("mesure les deux sources : une fois la clé posée, chacune rend un trousseau", async () => {
    const sources = sourcesAMesurer();
    let mesurees = 0;

    for (const [nom, source, poser] of sources) {
      poser();
      const trousseau = await source.fournir();
      expect(trousseau, nom).not.toBeNull();
      expect(trousseau?.principale.octets, nom).toHaveLength(LONGUEUR_CLE);
      expect(trousseau?.principale.keyId.length ?? 0, nom).toBeGreaterThan(0);
      mesurees += 1;
    }

    console.info(`[garde contrat] ${String(mesurees)} sources de clé mesurées`);
    expect(mesurees).toBe(sources.length);
    // Plancher-témoin : W-4 laisse DEUX chemins ouverts. Si ce compte tombe à
    // un, quelqu'un a tranché la décision par suppression de code.
    expect(mesurees).toBeGreaterThanOrEqual(2);
  });

  it("distingue les deux sources par `ouvreAuDemarrage`, et par elle seule", async () => {
    // C'est LA propriété que W-4 tranchera. Le reste du socle ne lit qu'elle :
    // s'il lisait le nom de la source, changer d'implémentation exigerait de
    // toucher au code appelant — exactement ce que l'interface évite.
    const env = depuisEnvironnement({ [VARIABLES_DE_CLE.cle]: cleBase64(0x22) });
    const manuelle = depuisDeverrouillageManuel();

    expect(env.ouvreAuDemarrage).toBe(true);
    expect(manuelle.ouvreAuDemarrage).toBe(false);

    // Et la conséquence observable : au démarrage, l'une a une clé, l'autre non.
    expect(await env.fournir()).not.toBeNull();
    expect(await manuelle.fournir()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 2 — « pas de clé » n'est pas une panne ; « mauvaise clé » en est une
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/source-de-cle — le silence et le cri", () => {
  it("rend `null` — sans lever — quand aucune clé n'est posée", async () => {
    // C'est l'état `verrouillé` du § 23. Lever ici ferait échouer le démarrage,
    // et ramènerait le défaut bloquant n°12.
    const cas: ReadonlyArray<readonly [string, Readonly<Record<string, string | undefined>>]> = [
      ["variable absente", {}],
      ["variable vide", { [VARIABLES_DE_CLE.cle]: "" }],
      ["variable indéfinie", { [VARIABLES_DE_CLE.cle]: undefined }],
    ];

    let mesures = 0;
    for (const [libelle, env] of cas) {
      expect(await depuisEnvironnement(env).fournir(), libelle).toBeNull();
      mesures += 1;
    }

    console.info(`[garde absence] ${String(mesures)} formes d'absence mesurées`);
    expect(mesures).toBe(3);
  });

  it("LÈVE quand une clé est présente mais mal formée — jamais en silence", async () => {
    // Une clé mal formée traitée comme une absence transformerait une faute de
    // frappe en « coffre verrouillé » inexplicable, et le § 25 range « coffre
    // illisible » en critique.
    const mauvaises = [
      ["trop courte", Buffer.alloc(16, 1).toString("base64")],
      ["trop longue", Buffer.alloc(64, 1).toString("base64")],
      ["pas du base64", "??????"],
      ["hexadécimal au lieu de base64", Buffer.alloc(LONGUEUR_CLE, 1).toString("hex")],
    ] as const;

    let mesures = 0;
    for (const [libelle, valeur] of mauvaises) {
      const source = depuisEnvironnement({ [VARIABLES_DE_CLE.cle]: valeur });
      await expect(source.fournir(), libelle).rejects.toThrowError(ErreurDeCoffre);
      mesures += 1;
    }

    console.info(`[garde clé mal formée] ${String(mesures)} formes mesurées`);
    expect(mesures).toBe(4);
  });

  it("REJETTE, et ne lève jamais de façon SYNCHRONE", () => {
    // Le piège, découvert en écrivant la garde du dessus : `fournir()` n'est
    // pas `async`. Une fonction non-`async` qui lève lance SYNCHRONEMENT — et
    // l'appelant qui a écrit la forme naturelle, `source.fournir().catch(…)`,
    // ne rattrape alors rien. La panne remonterait au démarrage du socle en
    // contournant le traitement prévu pour elle.
    const source = depuisEnvironnement({ [VARIABLES_DE_CLE.cle]: "trop-court" });

    let promesse: unknown = null;
    expect(() => {
      promesse = source.fournir();
    }).not.toThrow();
    expect(promesse).toBeInstanceOf(Promise);

    // Et le rejet est bien là — la garde ne doit pas se contenter du silence.
    return expect(promesse).rejects.toThrowError(ErreurDeCoffre);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 3 — le trousseau, et la rotation
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/source-de-cle — le trousseau porte les anciennes clés", () => {
  it("lit `OPS_VAULT_KEYS_ANCIENNES` et retrouve chaque clé par son keyId", async () => {
    const source = depuisEnvironnement({
      [VARIABLES_DE_CLE.cle]: cleBase64(0x33),
      [VARIABLES_DE_CLE.keyId]: "k-2026-08",
      [VARIABLES_DE_CLE.anciennes]: `k-2026-05:${cleBase64(0x44)}, k-2026-02:${cleBase64(0x55)}`,
    });

    const trousseau = await source.fournir();
    expect(trousseau).not.toBeNull();
    if (trousseau === null) {
      return;
    }

    const keyIds = keyIdsDuTrousseau(trousseau);
    console.info(`[garde trousseau] ${String(keyIds.length)} clés mesurées au trousseau`);

    expect(keyIds).toEqual(["k-2026-08", "k-2026-05", "k-2026-02"]);

    let retrouvees = 0;
    for (const keyId of keyIds) {
      expect(cleDuTrousseau(trousseau, keyId)?.keyId, keyId).toBe(keyId);
      retrouvees += 1;
    }
    expect(retrouvees).toBe(3);
    expect(cleDuTrousseau(trousseau, "k-inconnue")).toBeUndefined();
  });

  it("refuse une ancienne clé sans keyId — une ligne sans clé ne se rattache à rien", async () => {
    const source = depuisEnvironnement({
      [VARIABLES_DE_CLE.cle]: cleBase64(0x33),
      [VARIABLES_DE_CLE.anciennes]: cleBase64(0x44),
    });

    await expect(source.fournir()).rejects.toThrowError(ErreurDeCoffre);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 4 — l'empreinte de clé
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/source-de-cle — le keyId dérivé", () => {
  it("est stable pour une même clé, distinct pour des clés différentes", () => {
    const empreintes = new Map<string, string>();
    let mesurees = 0;

    // ⚠️ On part de 1, pas de 0 : depuis le lot 1, `motifCleInvalide` refuse
    //    les trente-deux octets à zéro (clé dégénérée). Le périmètre mesuré
    //    reste de 32 clés distinctes.
    for (let remplissage = 1; remplissage <= 32; remplissage += 1) {
      const octets = Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, remplissage));
      const empreinte = empreinteDeCle(octets);

      // Stable : deux appels sur la même clé rendent le même identifiant, sinon
      // un redémarrage ne retrouverait pas ses lignes.
      expect(empreinteDeCle(Uint8Array.from(octets))).toBe(empreinte);

      expect(empreintes.has(empreinte), `collision sur ${String(remplissage)}`).toBe(false);
      empreintes.set(empreinte, String(remplissage));
      mesurees += 1;
    }

    console.info(
      `[garde empreinte] ${String(mesurees)} clés mesurées, ${String(empreintes.size)} empreintes distinctes`,
    );
    expect(empreintes.size).toBe(mesurees);
    expect(mesurees).toBe(32);
  });

  it("ne laisse pas remonter le matériau — 16 caractères hexadécimaux, et rien d'autre", () => {
    const octets = Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, 0x77));
    const empreinte = empreinteDeCle(octets);

    expect(empreinte).toMatch(/^[0-9a-f]{16}$/);
    // Le témoin qui compte : l'empreinte ne contient AUCUN encodage direct de
    // la clé.
    expect(empreinte).not.toContain(Buffer.from(octets).toString("hex").slice(0, 8));
  });

  it("refuse d'empreindre une clé de mauvaise longueur", () => {
    expect(() => empreinteDeCle(new Uint8Array(16))).toThrowError(ErreurDeCoffre);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  Garde 5 — la copie, et l'effacement
// ─────────────────────────────────────────────────────────────────────────────

describe("core/vault/source-de-cle — copier avant d'effacer", () => {
  it("rougirait si le coffre effaçait le matériau de la SOURCE", async () => {
    // LE PIÈGE, montré sur la source où il est RÉEL : la source manuelle garde
    // son tampon entre deux `fournir()`, là où la source d'environnement en
    // décode un neuf à chaque appel. Sans `clonerTrousseau`, `verrouiller()` —
    // qui écrase le matériau qu'il détient — écraserait celui de la source, et
    // le déverrouillage suivant présenterait trente-deux zéros. Le symptôme
    // serait « la clé ne marche plus après un arrêt d'urgence », et la cause
    // serait invisible.
    const source = depuisDeverrouillageManuel();
    source.poser(cleBase64(0x66));

    // Le témoin : effacer SANS cloner détruit le matériau DE LA SOURCE.
    const sansClone = await source.fournir();
    expect(sansClone).not.toBeNull();
    if (sansClone === null) {
      return;
    }
    effacerTrousseau(sansClone);

    const apresEffacementDirect = await source.fournir();
    expect([...(apresEffacementDirect?.principale.octets ?? [])].every((o) => o === 0)).toBe(true);

    // Et la vraie donnée : en clonant d'abord, la source survit.
    const source2 = depuisDeverrouillageManuel();
    source2.poser(cleBase64(0x66));
    const fourni = await source2.fournir();
    expect(fourni).not.toBeNull();
    if (fourni === null) {
      return;
    }
    effacerTrousseau(clonerTrousseau(fourni));

    const apresEffacementDeLaCopie = await source2.fournir();
    expect([...(apresEffacementDeLaCopie?.principale.octets ?? [])].every((o) => o === 0x66)).toBe(
      true,
    );
  });

  it("clone en profondeur : écraser la copie ne touche pas l'original", () => {
    const original = {
      principale: { keyId: "k-1", octets: Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, 0x88)) },
      anciennes: [{ keyId: "k-0", octets: Uint8Array.from(Buffer.alloc(LONGUEUR_CLE, 0x99)) }],
    };

    const copie = clonerTrousseau(original);
    effacerTrousseau(copie);

    let mesures = 0;
    for (const cle of [original.principale, ...original.anciennes]) {
      expect(
        [...cle.octets].some((octet) => octet !== 0),
        cle.keyId,
      ).toBe(true);
      mesures += 1;
    }

    console.info(`[garde clonage] ${String(mesures)} clés d'origine mesurées, toutes intactes`);
    expect(mesures).toBe(2);
  });

  it("oublie la clé posée à la main, et l'écrase", async () => {
    const manuelle = depuisDeverrouillageManuel();
    manuelle.poser(cleBase64(0xaa));
    expect(manuelle.posee).toBe(true);

    manuelle.oublier();

    expect(manuelle.posee).toBe(false);
    expect(await manuelle.fournir()).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { DOMAINE_ARG_HASH, LONGUEUR_MINIMALE_CLE, messageArgHash } from "../limits/arg-hash.js";
import { canoniser } from "../limits/canonical.js";
import { GENRES_DE_JETON } from "./depot.js";
import {
  DOMAINE_TOKEN_HASH,
  ErreurCleEmpreinteDeJeton,
  ErreurJetonSansValeur,
  LONGUEUR_MINIMALE_CLE_TOKEN_HASH,
  LONGUEUR_TOKEN_HASH,
  cadrerPourEmpreinte,
  creerCalculEmpreinteDeJeton,
  messageEmpreinteDeJeton,
} from "./empreinte.js";
import type { CoffreEmpreinteDeJeton } from "./empreinte.js";

/**
 * GARDES DE `ops_token.tokenHash` — ADR 0027, point 7 ; § 12, règles 2 et 3.
 *
 * ═══ CE QUE CES GARDES TIENNENT ═══
 *
 *  · **la dérivation depuis `core/limits/`** — le cadrage est la seule chose que
 *    `core/auth/empreinte.ts` réécrit, faute d'export ; ce fichier confronte les
 *    DEUX écritures sur des morceaux identiques et exige des octets identiques ;
 *  · **le fail-loud** — clé absente, vide, ou trop courte : trois refus, jamais
 *    un repli ;
 *  · **l'empreinte ne rend pas le jeton** — c'est la promesse du § 19.1, et elle
 *    n'a de sens que si la clé est ce qui manque à qui obtiendrait la table ;
 *  · **la séparation de domaine par GENRE** — sans elle, la détection de rejeu
 *    se retournerait en déni de service.
 *
 * ⚠️ AUCUNE VALEUR DE CLÉ RÉELLE N'ENTRE ICI. Les clés de ce fichier sont
 *    fabriquées, nommées comme telles, et ne servent qu'à ce fichier.
 */

/** Une clé de témoin. Jamais une clé réelle — elle est écrite pour être publique. */
const CLE_DE_TEMOIN = "cle-de-temoin-empreinte-de-jeton-axion-ops-jamais-en-production";

function coffreQuiRend(valeur: string | null | undefined): CoffreEmpreinteDeJeton {
  return {
    lireCleEmpreinteDeJeton(): Promise<string | null | undefined> {
      return Promise.resolve(valeur);
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  G1 — LA DÉRIVATION DEPUIS `core/limits/`, MESURÉE
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0027 — l'empreinte de jeton DÉRIVE de l'argHash, et la copie est mesurée", () => {
  it("cadre EXACTEMENT comme `messageArgHash` — sur des morceaux identiques", () => {
    /**
     * ⚠️ **C'EST LA GARDE QUI REMPLACE UNE PHRASE PAR UNE MESURE.**
     *    `core/limits/arg-hash.ts` n'exporte pas son `cadrer()` : `core/auth/`
     *    a donc DEUX écritures du même cadrage. Écrire « même discipline » en
     *    commentaire n'aurait rien tenu — le jour où `core/limits/` change son
     *    préfixe de longueur, rien n'aurait rougi ici, et deux familles
     *    d'empreintes auraient cohabité sans qu'aucune ne le dise.
     */
    const cas: ReadonlyArray<readonly [string, unknown]> = [
      ["outil.simple", { id: "42" }],
      ["a:b", "c"],
      ["", null],
      ["outil.avec.beaucoup.de.segments", { liste: [1, 2, 3], vrai: true }],
    ];

    const desaccords: string[] = [];
    for (const [outil, charge] of cas) {
      if (outil.trim().length === 0) continue; // `messageArgHash` refuse un outil vide.
      const parLeVoisin = messageArgHash(outil, charge);
      const parIci = cadrerPourEmpreinte([DOMAINE_ARG_HASH, outil, canoniser(charge)]);
      if (!parLeVoisin.equals(parIci)) {
        desaccords.push(
          `${outil} : ${String(parLeVoisin.byteLength)} vs ${String(parIci.byteLength)} octets`,
        );
      }
    }

    console.info(
      `[G1 · cadrage] ${String(cas.length - 1)} morceau(x) confronté(s) à messageArgHash · ` +
        `${String(desaccords.length)} désaccord(s) [${desaccords.join(", ") || "aucun"}]`,
    );

    // Plancher : la confrontation a RÉELLEMENT eu lieu sur plus d'un cas.
    expect(cas.length - 1).toBeGreaterThanOrEqual(3);
    expect(desaccords).toEqual([]);
  });

  it("TÉMOIN — un cadrage divergent est VU par la garde ci-dessus", () => {
    // ⚠️ SANS CE TÉMOIN, « 0 désaccord » ne se distinguerait pas de « la
    //    comparaison ne compare rien ». On fabrique le cadrage NAÏF — celui
    //    qu'on écrirait sans y penser — et on exige qu'il diverge.
    const naif = Buffer.from([DOMAINE_ARG_HASH, "outil", canoniser({ id: "1" })].join(":"), "utf8");
    const correct = messageArgHash("outil", { id: "1" });

    console.info(
      `[G1 · témoin] cadrage naïf ${String(naif.byteLength)} octet(s) · ` +
        `cadrage cadré ${String(correct.byteLength)} octet(s) · ` +
        `identiques : ${String(naif.equals(correct))}`,
    );

    expect(naif.equals(correct)).toBe(false);
  });

  it("emprunte ses deux bornes, au lieu de les réécrire", () => {
    console.info(
      `[G1 · bornes] longueur d'empreinte ${String(LONGUEUR_TOKEN_HASH)} · ` +
        `plancher de clé ${String(LONGUEUR_MINIMALE_CLE_TOKEN_HASH)} · ` +
        `sources : core/limits/arg-hash.ts`,
    );

    // ⚠️ Deux constantes vaudraient deux vérités, et c'est la seconde qui ne
    //    suivrait pas. Cette égalité EST la dérivation.
    expect(LONGUEUR_MINIMALE_CLE_TOKEN_HASH).toBe(LONGUEUR_MINIMALE_CLE);
    expect(LONGUEUR_TOKEN_HASH).toBe(64);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G2 — LE FAIL-LOUD
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0027 — la clé manquante LÈVE, en développement comme en production", () => {
  it("refuse quatre formes de clé inutilisable, et ne se replie sur AUCUNE", async () => {
    const temoins: ReadonlyArray<readonly [string, string | null | undefined]> = [
      ["absente", null],
      ["non définie", undefined],
      ["vide", ""],
      ["espaces seuls", "   "],
      ["trop courte", "a".repeat(LONGUEUR_MINIMALE_CLE_TOKEN_HASH - 1)],
    ];

    const passees: string[] = [];
    for (const [nom, valeur] of temoins) {
      const calcul = creerCalculEmpreinteDeJeton(coffreQuiRend(valeur));
      try {
        await calcul.calculer("access", "un-jeton");
        passees.push(nom);
      } catch (erreur) {
        expect(erreur, nom).toBeInstanceOf(ErreurCleEmpreinteDeJeton);
        // § 15 — l'erreur ne recopie JAMAIS la clé.
        if (typeof valeur === "string" && valeur.trim().length > 0) {
          expect((erreur as Error).message, nom).not.toContain(valeur);
        }
      }
    }

    console.info(
      `[G2 · fail-loud] ${String(temoins.length)} forme(s) de clé inutilisable éprouvée(s) · ` +
        `${String(passees.length)} passée(s) au travers [${passees.join(", ") || "aucune"}]`,
    );

    expect(passees).toEqual([]);
  });

  it("un jeton VIDE lève pour ce qu'il est, avant même la lecture de la clé", async () => {
    // ⚠️ L'ORDRE COMPTE. Une empreinte de chaîne vide est CONSTANTE : toutes les
    //    lignes qui la porteraient se heurteraient sur l'unicité, et un jeton
    //    vide vaudrait pour toutes. Ce refus ne doit pas dépendre du coffre.
    let cleLue = 0;
    const coffreQuiCompte: CoffreEmpreinteDeJeton = {
      lireCleEmpreinteDeJeton(): Promise<string> {
        cleLue += 1;
        return Promise.resolve(CLE_DE_TEMOIN);
      },
    };
    const calcul = creerCalculEmpreinteDeJeton(coffreQuiCompte);

    await expect(calcul.calculer("access", "")).rejects.toBeInstanceOf(ErreurJetonSansValeur);

    console.info(`[G2 · ordre] lectures de clé avant le refus : ${String(cleLue)}`);
    expect(cleLue).toBe(0);
    expect(() => messageEmpreinteDeJeton("access", "")).toThrow(ErreurJetonSansValeur);
  });

  it("SAIT CALCULER — sans quoi les refus ci-dessus seraient verts sur un refuseur", async () => {
    const calcul = creerCalculEmpreinteDeJeton(coffreQuiRend(CLE_DE_TEMOIN));
    const empreinte = await calcul.calculer("access", "un-jeton-de-temoin");

    console.info(
      `[G2 · capacité] empreinte de ${String(empreinte.length)} caractère(s) · ` +
        `attendu ${String(LONGUEUR_TOKEN_HASH)} · hexadécimale : ` +
        `${String(/^[0-9a-f]+$/.test(empreinte))}`,
    );

    expect(empreinte).toHaveLength(LONGUEUR_TOKEN_HASH);
    expect(empreinte).toMatch(/^[0-9a-f]+$/);
  });

  it("relit la clé À CHAQUE appel — une rotation qui ne tourne pas est une rotation morte", async () => {
    let lectures = 0;
    const calcul = creerCalculEmpreinteDeJeton({
      lireCleEmpreinteDeJeton(): Promise<string> {
        lectures += 1;
        return Promise.resolve(CLE_DE_TEMOIN);
      },
    });

    await calcul.calculer("access", "a");
    await calcul.calculer("access", "b");
    await calcul.calculer("refresh", "c");

    console.info(`[G2 · rotation] 3 calcul(s) · ${String(lectures)} lecture(s) de clé`);

    // Un cache de processus servirait l'ancienne clé jusqu'au redémarrage.
    expect(lectures).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G3 — L'EMPREINTE NE REND PAS LE JETON, ET LE GENRE SÉPARE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 12 — l'empreinte est clée, et le genre sépare les populations", () => {
  it("le même jeton donne DEUX empreintes selon le genre", async () => {
    const calcul = creerCalculEmpreinteDeJeton(coffreQuiRend(CLE_DE_TEMOIN));
    const jeton = "le-meme-jeton-des-deux-cotes";

    const empreintes = new Map<string, string>();
    for (const genre of GENRES_DE_JETON) {
      empreintes.set(genre, await calcul.calculer(genre, jeton));
    }

    console.info(
      `[G3 · genre] ${String(GENRES_DE_JETON.length)} genre(s) confronté(s) · ` +
        `${String(new Set(empreintes.values()).size)} empreinte(s) distincte(s)`,
    );

    // ⚠️ SANS CETTE SÉPARATION, un jeton d'ACCÈS révoqué présenté au
    //    rafraîchissement déclencherait la révocation de toute la chaîne : la
    //    détection de rejeu se retournerait en déni de service.
    expect(new Set(empreintes.values()).size).toBe(GENRES_DE_JETON.length);
  });

  it("deux clés distinctes donnent deux empreintes — l'index est INUTILISABLE sans le secret", async () => {
    const jeton = "un-jeton-a-retrouver";
    const avec = await creerCalculEmpreinteDeJeton(coffreQuiRend(CLE_DE_TEMOIN)).calculer(
      "access",
      jeton,
    );
    const autre = await creerCalculEmpreinteDeJeton(
      coffreQuiRend(`autre-${CLE_DE_TEMOIN}`),
    ).calculer("access", jeton);

    console.info(
      `[G3 · clé] même jeton, deux clés · empreintes identiques : ${String(avec === autre)} · ` +
        `l'empreinte contient-elle le jeton : ${String(avec.includes(jeton))}`,
    );

    // C'est ce qui distingue un HMAC d'un SHA salé : le sel vit dans la même
    // ligne que l'empreinte, la clé vit dans le coffre.
    expect(avec).not.toBe(autre);
    // L'empreinte ne permet pas de retrouver le jeton — la forme la plus faible
    // de cette propriété, mais la seule qu'un test puisse tenir sans casser SHA-256.
    expect(avec).not.toContain(jeton);
    expect(avec).toMatch(/^[0-9a-f]{64}$/);
  });

  it("compare à temps constant, et refuse deux longueurs différentes sans lever", () => {
    const calcul = creerCalculEmpreinteDeJeton(coffreQuiRend(CLE_DE_TEMOIN));
    const cas: ReadonlyArray<readonly [string, string, string, boolean]> = [
      ["identiques", "a".repeat(64), "a".repeat(64), true],
      ["dernier caractère", "a".repeat(63) + "b", "a".repeat(64), false],
      ["longueurs différentes", "a".repeat(64), "a".repeat(63), false],
      ["vides", "", "", true],
    ];

    const desaccords = cas.filter(([, a, b, attendu]) => calcul.correspond(a, b) !== attendu);

    console.info(
      `[G3 · comparaison] ${String(cas.length)} cas éprouvé(s) · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    // ⚠️ `timingSafeEqual` LÈVE sur des longueurs différentes — ce qui fuirait la
    //    longueur. Le module tranche AVANT ; ce cas le mesure.
    expect(desaccords).toEqual([]);
  });

  it("le domaine porte sa VERSION — un cadrage changé ne se mélange pas aux anciens", () => {
    console.info(`[G3 · domaine] ${DOMAINE_TOKEN_HASH} · distinct de ${DOMAINE_ARG_HASH}`);

    expect(DOMAINE_TOKEN_HASH).not.toBe(DOMAINE_ARG_HASH);
    expect(DOMAINE_TOKEN_HASH).toMatch(/\/v\d+$/);
  });
});

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  CAUSES_DE_REFUS_PKCE,
  LONGUEUR_MAXIMALE_VERIFICATEUR,
  LONGUEUR_MINIMALE_VERIFICATEUR,
  METHODES_DE_DEFI_ADMISES,
  METHODES_DE_DEFI_REFUSEES,
  defiAttendu,
  methodeAdmise,
  verdictDeLaMethodeDeDefi,
  verifierLeDefi,
} from "./pkce.js";

/**
 * GARDES DE PKCE — ADR 0027, point 2 ; RFC 7636.
 *
 * ═══ CE QUE CES GARDES TIENNENT ═══
 *
 *  · **`S256` seul.** `plain` et l'absence de méthode sont refusés, et la liste
 *    des refusés est CONFRONTÉE — sans quoi elle serait un commentaire ;
 *  · **les deux listes sont disjointes.** Une méthode à la fois admise et
 *    refusée serait un vocabulaire qui se contredit ;
 *  · **les quatre causes sont atteignables.** Une cause déclarée qu'aucun chemin
 *    ne produit ne se compte jamais (§ 24) ;
 *  · **le calcul du défi est celui de la RFC**, mesuré contre une seconde
 *    dérivation écrite ici — et non contre lui-même.
 */

/** Un vérificateur conforme, fabriqué à la longueur exacte du plancher. */
const VERIFICATEUR = "a".repeat(LONGUEUR_MINIMALE_VERIFICATEUR);

describe("ADR 0027 — `S256` obligatoire, `plain` refusé, absence refusée", () => {
  it("les deux listes de méthodes sont DISJOINTES, et la refusée est confrontée", () => {
    const admises = new Set<string>(METHODES_DE_DEFI_ADMISES);
    const refusees = METHODES_DE_DEFI_REFUSEES.map((entree) => entree.methode);
    const contradictoires = refusees.filter((methode) => admises.has(methode));
    const sansMotif = METHODES_DE_DEFI_REFUSEES.filter(
      (entree) => entree.motif.trim().length === 0,
    );

    console.info(
      `[PKCE · listes] ${String(admises.size)} méthode(s) admise(s) ` +
        `[${[...admises].join(", ")}] · ${String(refusees.length)} refusée(s) nommément ` +
        `[${refusees.join(", ")}] · ${String(contradictoires.length)} contradictoire(s) · ` +
        `${String(sansMotif.length)} sans motif écrit`,
    );

    expect(contradictoires).toEqual([]);
    // ⚠️ UN MOTIF ÉCRIT EST OBLIGATOIRE : sans lui, la liste des refusées devient
    //    la voiture-balai où l'on range ce qu'on n'a pas voulu réfléchir.
    expect(sansMotif).toEqual([]);
    expect(refusees.length).toBeGreaterThan(0);
  });

  it("chaque méthode NOMMÉMENT refusée est effectivement refusée par le contrôle", () => {
    // ⚠️ SANS CE TEST, `METHODES_DE_DEFI_REFUSEES` serait un commentaire : rien
    //    n'obligerait le contrôle à la lire, et `plain` pourrait passer.
    const passees = METHODES_DE_DEFI_REFUSEES.map((entree) => entree.methode).filter((methode) =>
      methodeAdmise(methode),
    );

    console.info(
      `[PKCE · refus nommés] ${String(METHODES_DE_DEFI_REFUSEES.length)} méthode(s) confrontée(s) ` +
        `· ${String(passees.length)} passée(s) au travers [${passees.join(", ") || "aucune"}]`,
    );

    expect(passees).toEqual([]);
  });

  it("les QUATRE causes de refus sont atteignables, et chacune par un témoin propre", () => {
    const bonDefi = defiAttendu(VERIFICATEUR);

    const temoins: ReadonlyArray<readonly [string, string, string, string | undefined]> = [
      ["méthode-absente", VERIFICATEUR, bonDefi, undefined],
      ["méthode-refusée", VERIFICATEUR, bonDefi, "plain"],
      ["vérificateur-hors-forme", "trop-court", bonDefi, "S256"],
      ["défi-non-concordant", VERIFICATEUR, defiAttendu("b".repeat(50)), "S256"],
    ];

    const vues = new Set<string>();
    const desaccords: string[] = [];
    for (const [attendue, verificateur, defi, methode] of temoins) {
      const verdict = verifierLeDefi(verificateur, defi, methode);
      if (verdict.admis || verdict.cause !== attendue) {
        desaccords.push(
          `${attendue} : reçu ${String(verdict.cause)} (admis ${String(verdict.admis)})`,
        );
      }
      if (verdict.cause !== null) vues.add(verdict.cause);
      // § 15 — le motif ne recopie jamais le vérificateur, qui est un secret.
      expect(verdict.motif, attendue).not.toContain(verificateur);
    }

    console.info(
      `[PKCE · causes] ${String(temoins.length)} témoin(s) éprouvé(s) · ` +
        `${String(vues.size)} cause(s) distincte(s) sur ` +
        `${String(CAUSES_DE_REFUS_PKCE.length)} déclarée(s) : ${[...vues].join(", ")} · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(desaccords).toEqual([]);
    expect(vues.size).toBe(CAUSES_DE_REFUS_PKCE.length);
  });

  it("les bornes du vérificateur mordent aux DEUX bouts, et sur l'alphabet", () => {
    const bonDefi = (v: string): string => defiAttendu(v);
    const cas: ReadonlyArray<readonly [string, string]> = [
      ["un caractère sous le plancher", "a".repeat(LONGUEUR_MINIMALE_VERIFICATEUR - 1)],
      ["un caractère au-dessus du plafond", "a".repeat(LONGUEUR_MAXIMALE_VERIFICATEUR + 1)],
      ["hors alphabet — espace", `a b${"c".repeat(LONGUEUR_MINIMALE_VERIFICATEUR)}`],
      ["hors alphabet — plus", `+${"a".repeat(LONGUEUR_MINIMALE_VERIFICATEUR)}`],
    ];

    const passes = cas.filter(([, v]) => verifierLeDefi(v, bonDefi(v), "S256").admis);

    console.info(
      `[PKCE · bornes] plancher ${String(LONGUEUR_MINIMALE_VERIFICATEUR)} · plafond ` +
        `${String(LONGUEUR_MAXIMALE_VERIFICATEUR)} · ${String(cas.length)} témoin(s) · ` +
        `${String(passes.length)} passé(s) au travers`,
    );

    expect(passes).toEqual([]);
  });

  it("SAIT DIRE OUI — aux deux longueurs extrêmes admises", () => {
    // ⚠️ SANS CE TEST, les quatre refus ci-dessus seraient verts sur un contrôle
    //    qui refuserait TOUT, et aucun client ne pourrait jamais échanger un code.
    const admis = [
      "a".repeat(LONGUEUR_MINIMALE_VERIFICATEUR),
      "a".repeat(LONGUEUR_MAXIMALE_VERIFICATEUR),
      `${"-._~".repeat(11)}abc`,
    ];

    const refuses = admis.filter((v) => !verifierLeDefi(v, defiAttendu(v), "S256").admis);

    console.info(
      `[PKCE · capacité] ${String(admis.length)} vérificateur(s) conformes · ` +
        `${String(refuses.length)} refusé(s) à tort · ` +
        `contrôles confrontés à l'admission : ` +
        `${String(verifierLeDefi(admis[0] ?? "", defiAttendu(admis[0] ?? ""), "S256").controlesConfrontes)}`,
    );

    expect(refuses).toEqual([]);
  });

  it("le défi est bien `base64url(sha256(v))` SANS remplissage — seconde dérivation", () => {
    /**
     * ⚠️ **LA SECONDE DÉRIVATION EST ÉCRITE AUTREMENT, EXPRÈS.** Confronter
     *    `defiAttendu` à lui-même ne prouve rien. Ici on repasse par
     *    `base64` puis on retire le remplissage à la main — deux chemins, un
     *    seul résultat attendu. Un `digest("base64")` oublié laisserait des `=`
     *    finaux, et le client RFC 7636 ne concorderait jamais.
     */
    const parLeModule = defiAttendu(VERIFICATEUR);
    const parUneAutreVoie = createHash("sha256")
      .update(VERIFICATEUR, "ascii")
      .digest("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    console.info(
      `[PKCE · défi] ${String(parLeModule.length)} caractère(s) · ` +
        `remplissage présent : ${String(parLeModule.includes("="))} · ` +
        `deux dérivations d'accord : ${String(parLeModule === parUneAutreVoie)}`,
    );

    expect(parLeModule).toBe(parUneAutreVoie);
    expect(parLeModule).not.toContain("=");
  });

  it("`verdictDeLaMethodeDeDefi` est LA règle, lue aux deux moments", () => {
    // ⚠️ Une seconde écriture de la règle à `/auth/authorize` divergerait de
    //    celle de `/auth/token` : la garde exige que les deux entrées rendent le
    //    MÊME verdict sur la méthode.
    const desaccords: string[] = [];
    for (const methode of [undefined, "plain", "S256", "S512"]) {
      const parLaPorte = verdictDeLaMethodeDeDefi(methode);
      const parLeTout = verifierLeDefi(VERIFICATEUR, defiAttendu(VERIFICATEUR), methode);
      const memeCause = (parLaPorte?.cause ?? null) === (parLeTout.admis ? null : parLeTout.cause);
      if (parLaPorte !== null && !memeCause) {
        desaccords.push(
          `${String(methode)} : ${String(parLaPorte.cause)} vs ${String(parLeTout.cause)}`,
        );
      }
    }

    console.info(
      `[PKCE · règle unique] 4 méthode(s) confrontée(s) aux DEUX entrées · ` +
        `${String(desaccords.length)} désaccord(s)`,
    );

    expect(desaccords).toEqual([]);
    expect(verdictDeLaMethodeDeDefi("S256")).toBeNull();
  });
});

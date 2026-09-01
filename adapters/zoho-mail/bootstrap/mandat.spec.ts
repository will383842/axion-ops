import { describe, expect, it } from "vitest";

import {
  ARGUMENT_SENTINELLE,
  REFUS_DE_MANDAT,
  demanderUnMandat,
  estUnMandatDelivre,
} from "./mandat.js";
import type { IntentionConstatee } from "./mandat.js";

/**
 * **GARDE DU VERROU DU § 27 — UN AMORÇAGE NE SE DÉCLENCHE PAS TOUT SEUL.**
 *
 * ⚠️ **ELLE FABRIQUE CHACUN DES TROIS REFUS, ET LE CAS QUI PASSE.** Une garde
 *    qui n'éprouverait que le refus serait verte le jour où PLUS RIEN ne passe ;
 *    une garde qui n'éprouverait que le passage serait verte le jour où tout
 *    passe. Les quatre cas sont dérivés d'une intention conforme, en n'y
 *    changeant qu'une seule chose à la fois.
 *
 * ⚠️ **ELLE CONFRONTE SA COUVERTURE À `REFUS_DE_MANDAT`.** Un quatrième refus
 *    ajouté au module sans témoin fait rougir ce fichier — c'est la seule façon
 *    qu'une garde ait de se plaindre de ce qu'elle ne regarde pas.
 */

const INTENTION_CONFORME: IntentionConstatee = {
  arguments: [ARGUMENT_SENTINELLE],
  entreeEstUnTerminal: true,
  estLeProgrammeLance: true,
  programme: "adapters/zoho-mail/bootstrap",
};

describe("le mandat — trois constats du monde réel, et un type inhabitable", () => {
  it("délivre un mandat sur une intention conforme, et lui seul est reconnu", () => {
    const issue = demanderUnMandat(INTENTION_CONFORME);
    expect(issue.delivre).toBe(true);
    if (!issue.delivre) return;

    console.info(
      `[mandat] 1 intention conforme · mandat délivré · reconnu par le registre : ` +
        `${String(estUnMandatDelivre(issue.mandat))}`,
    );
    expect(estUnMandatDelivre(issue.mandat)).toBe(true);
  });

  it("SAIT rougir : chacun des trois refus est fabriqué, et la couverture est confrontée", () => {
    const temoins: readonly { readonly refus: string; readonly intention: IntentionConstatee }[] = [
      {
        refus: "pas-le-programme-lance",
        intention: { ...INTENTION_CONFORME, estLeProgrammeLance: false },
      },
      {
        refus: "sentinelle-absente",
        intention: { ...INTENTION_CONFORME, arguments: [] },
      },
      {
        refus: "aucun-terminal",
        intention: { ...INTENTION_CONFORME, entreeEstUnTerminal: false },
      },
    ];

    const vus = new Set<string>();
    for (const temoin of temoins) {
      const issue = demanderUnMandat(temoin.intention);
      expect(issue.delivre, `témoin « ${temoin.refus} »`).toBe(false);
      if (issue.delivre) continue;
      expect(issue.refus).toBe(temoin.refus);
      // Un refus muet ferait chercher au hasard : chacun EXPLIQUE.
      expect(issue.lignes.length).toBeGreaterThanOrEqual(2);
      vus.add(issue.refus);
    }

    console.info(
      `[mandat] ${String(temoins.length)} témoin(s) fabriqué(s) · ` +
        `${String(vus.size)} refus distinct(s) mesuré(s) sur ` +
        `${String(REFUS_DE_MANDAT.length)} déclaré(s) [${[...vus].join(", ")}]`,
    );

    // ⚠️ LA CONFRONTATION QUI FAIT ROUGIR À L'AJOUT D'UN QUATRIÈME REFUS.
    expect([...vus].sort()).toEqual([...REFUS_DE_MANDAT].sort());
  });

  it("le refus du programme non lancé passe AVANT les deux autres", () => {
    // Une intention qui cumule les trois défauts : le message doit dire « ce
    // n'est pas à toi de faire ce geste », pas « il te manque un terminal ».
    const issue = demanderUnMandat({
      arguments: [],
      entreeEstUnTerminal: false,
      estLeProgrammeLance: false,
      programme: "ops/index.ts (socle en train de démarrer)",
    });
    expect(issue.delivre).toBe(false);
    if (issue.delivre) return;
    expect(issue.refus).toBe("pas-le-programme-lance");
    console.info(`[mandat] intention à trois défauts → refus « ${issue.refus} » (le plus amont).`);
  });
});

describe("un mandat forgé ne franchit pas le contrôle d'exécution", () => {
  /**
   * ⚠️ **C'EST LE TÉMOIN QUI COMPTE.** Le verrou de TYPE est invisible à
   *    l'exécution : `as` le contourne, et une garde qui ne mesurerait que la
   *    compilation ne mesurerait rien du tout. Ce test fabrique EXACTEMENT ce
   *    qu'un chemin de secours écrirait — un objet de la bonne forme — et exige
   *    qu'il soit refusé.
   */
  it("SAIT rougir : trois contrefaçons sont fabriquées, trois sont refusées", () => {
    const contrefacons: readonly { readonly nom: string; readonly valeur: unknown }[] = [
      { nom: "objet vide", valeur: {} },
      { nom: "objet à la bonne forme apparente", valeur: { programme: "secours" } },
      {
        nom: "objet portant une clé symbolique fabriquée",
        valeur: { [Symbol("marque") as unknown as string]: "amorçage-zoho" },
      },
      { nom: "null", valeur: null },
      { nom: "chaîne", valeur: "amorçage-zoho" },
    ];

    let refusees = 0;
    for (const contrefacon of contrefacons) {
      expect(estUnMandatDelivre(contrefacon.valeur), `contrefaçon « ${contrefacon.nom} »`).toBe(
        false,
      );
      refusees += 1;
    }

    // LE TÉMOIN DE CONTRASTE : sans lui, un `estUnMandatDelivre` qui rendrait
    // toujours `false` passerait ce test avec les honneurs.
    const authentique = demanderUnMandat(INTENTION_CONFORME);
    expect(authentique.delivre).toBe(true);
    if (authentique.delivre) expect(estUnMandatDelivre(authentique.mandat)).toBe(true);

    console.info(
      `[mandat] ${String(refusees)} contrefaçon(s) fabriquée(s), ${String(refusees)} refusée(s) · ` +
        "1 mandat authentique accepté (témoin de contraste).",
    );
    expect(refusees).toBe(contrefacons.length);
  });

  it("deux mandats successifs sont deux objets distincts, tous deux reconnus", () => {
    const a = demanderUnMandat(INTENTION_CONFORME);
    const b = demanderUnMandat(INTENTION_CONFORME);
    expect(a.delivre && b.delivre).toBe(true);
    if (!a.delivre || !b.delivre) return;
    expect(a.mandat).not.toBe(b.mandat);
    expect(estUnMandatDelivre(a.mandat) && estUnMandatDelivre(b.mandat)).toBe(true);
  });
});

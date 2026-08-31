import { describe, expect, it } from "vitest";

import { APPEL_STEPS, ERROR_CODES, type ErrorCode, type OpsScope } from "../core/types.js";
import { correspondanceCanonique, etape05Scopes } from "../core/chaine/etape-05-scopes.js";
import type { ContexteScopes, CorrespondanceScopes } from "../core/chaine/etapes.js";
import {
  CODES_DU_TABLEAU_15,
  CODES_HORS_TABLEAU_15,
  CODE_SCOPE_INSUFFISANT,
  confronterCodes,
  type CodeHorsTableau,
} from "./codes-hors-tableau.js";

/**
 * GARDES — LES CODES QUE LE § 15 N'ÉNUMÈRE PAS.
 *
 * ⚠️ LA PREMIÈRE GARDE DE CE MODULE N'EST PAS ICI : c'est `pnpm typecheck`.
 *    `CODE_SCOPE_INSUFFISANT` est annoté `ErrorCode` dans le module ; retirer
 *    la valeur de `ERROR_CODES` fait échouer la compilation avant qu'aucun test
 *    ne démarre. Les gardes ci-dessous mesurent ce que le compilateur ne voit
 *    pas : la COHÉRENCE entre l'union, le document et les motifs écrits.
 */

/** Un motif fabriqué, pour éprouver la mécanique sans toucher aux vrais. */
function motifTemoin(code: string, voisins: number): CodeHorsTableau {
  return {
    code: code as ErrorCode,
    exigePar: "§ témoin — fabriqué par la garde, ne décrit aucun § réel",
    voisins: Array.from({ length: voisins }, (_valeur, rang) => ({
      code: "internal",
      mensonge: `mensonge témoin n° ${String(rang + 1)}`,
    })),
    adr: "ADR témoin",
    enAttenteDeBranchement: false,
  };
}

describe("ops/codes-hors-tableau — un écart au § 15 peut être justifié, jamais muet", () => {
  it("rougit sur un code AJOUTÉ à l'union sans motif écrit", () => {
    // Le témoin fabrique exactement le geste qu'on veut interdire : un
    // quinzième code glissé dans l'union, sans ligne qui dise pourquoi.
    const union = [...CODES_DU_TABLEAU_15, "quota_exceeded_temoin"];
    const verdict = confronterCodes(union, CODES_DU_TABLEAU_15, []);

    console.info(
      `[garde codes] témoin muet — ${String(verdict.codesMesures)} code(s) confronté(s) au ` +
        `tableau de ${String(verdict.codesDuDocument)}, ${String(verdict.horsTableau.length)} ` +
        `hors tableau, ${String(verdict.motives.length)} motivé(s)`,
    );

    expect(verdict.horsTableau).toEqual(["quota_exceeded_temoin"]);
    expect(verdict.motives).toEqual([]);
    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("quota_exceeded_temoin");
  });

  it("rougit sur un motif qui n'a écarté AUCUN voisin — un ajout non instruit", () => {
    // Devant un refus sans nom, le premier réflexe est d'emprunter le code du
    // voisin. Un motif qui ne dit pas lequel a été écarté, ni ce qu'il aurait
    // menti, n'a pas fait ce travail-là.
    const union = [...CODES_DU_TABLEAU_15, "temoin_sans_voisin"];
    const verdict = confronterCodes(union, CODES_DU_TABLEAU_15, [
      motifTemoin("temoin_sans_voisin", 0),
    ]);

    console.info(
      `[garde codes] témoin sans voisin — ${String(verdict.horsTableau.length)} code(s) hors ` +
        `tableau, ${String(verdict.anomalies.length)} anomalie(s)`,
    );

    expect(verdict.motives).toEqual(["temoin_sans_voisin"]);
    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("SANS VOISIN");
  });

  it("rougit sur un motif FANTÔME — écrit pour un code que l'union ne porte plus", () => {
    // C'est le symétrique, et il arrive au moment où l'on « nettoie » l'union
    // sans relire les motifs : la justification survit à ce qu'elle justifiait.
    const verdict = confronterCodes(CODES_DU_TABLEAU_15, CODES_DU_TABLEAU_15, [
      motifTemoin("code_disparu_temoin", 1),
    ]);

    console.info(
      `[garde codes] témoin fantôme — ${String(verdict.anomalies.length)} anomalie(s) sur ` +
        `${String(verdict.codesMesures)} code(s) mesuré(s)`,
    );

    expect(verdict.horsTableau).toEqual([]);
    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("ne correspond à aucun code AJOUTÉ");
  });

  it("rougit quand un code DU § 15 manque à l'union — le document annoncerait un faux", () => {
    const ampute = CODES_DU_TABLEAU_15.filter((code) => code !== "conflict");
    const verdict = confronterCodes(ampute, CODES_DU_TABLEAU_15, []);

    console.info(
      `[garde codes] témoin amputé — ${String(verdict.codesMesures)} code(s) dans l'union pour ` +
        `${String(verdict.codesDuDocument)} au document`,
    );

    expect(verdict.anomalies).toHaveLength(1);
    expect(verdict.anomalies[0]).toContain("conflict");
  });

  it("SAIT DIRE OUI — l'union RÉELLE du socle, et elle annonce ses trois comptes", () => {
    // Sans ce cas, une confrontation qui refuserait TOUT serait verte plus haut.
    const verdict = confronterCodes();

    console.info(
      `[garde codes réels] ${String(verdict.codesMesures)} code(s) dans \`ERROR_CODES\`, ` +
        `${String(verdict.codesDuDocument)} au tableau du § 15, ` +
        `${String(verdict.horsTableau.length)} hors tableau (${verdict.horsTableau.join(", ")}), ` +
        `${String(verdict.enAttenteDeBranchement.length)} en attente de branchement ` +
        `(${verdict.enAttenteDeBranchement.join(", ") || "aucun"})`,
    );

    expect(verdict.anomalies).toEqual([]);
    // Dérivé, jamais écrit à la main : le jour où un code s'ajoute AVEC son
    // motif, ce compte suit tout seul.
    expect(verdict.codesMesures).toBe(ERROR_CODES.length);
    expect(verdict.motives).toEqual(verdict.horsTableau);
    // Plancher-témoin : les deux écarts assumés. À zéro, la garde ne mesurerait
    // plus rien et resterait verte.
    expect(verdict.horsTableau.length).toBeGreaterThanOrEqual(2);
    expect(verdict.horsTableau).toContain("scope_insufficient");
    expect(verdict.horsTableau).toContain("vault_locked");
  });
});

describe("ops/codes-hors-tableau — `scope_insufficient` appartient bien à `ErrorCode`", () => {
  it("est dans l'union fermée, et le compilateur le tient déjà", () => {
    // La valeur vient du module, où elle est annotée `ErrorCode` : si elle
    // sortait de l'union, `pnpm typecheck` échouerait avant ce test. Ce qui est
    // mesuré ici est le SECOND effet — que l'union le porte à l'exécution, donc
    // qu'un `switch` exhaustif et une sérialisation le voient.
    const connus: readonly string[] = ERROR_CODES;

    console.info(
      `[garde compilation] ${String(connus.length)} code(s) dans l'union, ` +
        `« ${CODE_SCOPE_INSUFFISANT} » cherché`,
    );

    expect(connus).toContain(CODE_SCOPE_INSUFFISANT);
    expect(CODE_SCOPE_INSUFFISANT).toBe("scope_insufficient");
  });

  it("porte un motif nommant les TROIS voisins écartés, et ce que chacun mentirait", () => {
    const motif = CODES_HORS_TABLEAU_15.find((ligne) => ligne.code === CODE_SCOPE_INSUFFISANT);

    console.info(
      `[garde motif] ${String(CODES_HORS_TABLEAU_15.length)} motif(s) écrit(s), ` +
        `${String(motif?.voisins.length ?? 0)} voisin(s) écarté(s) pour ` +
        `« ${CODE_SCOPE_INSUFFISANT} »`,
    );

    expect(motif).toBeDefined();
    expect(motif?.voisins.map((voisin) => voisin.code).sort()).toEqual([
      "policy_denied",
      "tool_disabled",
      "unauthenticated",
    ]);
    // Un « ne convient pas » ne dit rien. Chaque voisin porte ce qu'il aurait
    // MENTI, et c'est cette phrase-là qu'on relira dans six mois.
    for (const voisin of motif?.voisins ?? []) {
      expect(voisin.mensonge.length, voisin.code).toBeGreaterThan(30);
    }
  });

  it("n'a PLUS aucun code déclaré qu'aucune étape ne rend", () => {
    // Un code que rien n'émet est une métrique qui restera vide, et une
    // métrique vide ressemble à une métrique sans incident. Les deux écarts
    // assumés sont désormais branchés — `vault_locked` à l'étape 0 depuis le
    // lot 1b, `scope_insufficient` à l'étape 5 depuis la Recette du lot 1c.
    const verdict = confronterCodes();
    const etape5 = APPEL_STEPS.find((etape) => etape.cle === "scopes");

    console.info(
      `[garde branchement] ${String(CODES_HORS_TABLEAU_15.length)} écart(s) assumé(s) confronté(s) · ` +
        `${String(verdict.enAttenteDeBranchement.length)} code(s) déclaré(s) qu'aucune étape ne rend ; ` +
        `l'étape 5 rend « ${String(etape5?.refus)} » sous le statut HTTP ${String(etape5?.statutHttp)}`,
    );

    // Plancher-témoin : zéro écart confronté rendrait la ligne suivante vraie
    // sur une liste vide.
    expect(CODES_HORS_TABLEAU_15.length).toBe(2);
    expect(etape5).toBeDefined();
    // Le 403 du § 11 n'a pas bougé : le code nomme la cause, il ne remplace pas
    // le statut.
    expect(etape5?.statutHttp).toBe(403);
    expect(verdict.enAttenteDeBranchement).toEqual([]);
  });

  /**
   * ⚠️ CETTE GARDE ÉTAIT UN `it.fails`, ET ELLE A BASCULÉ EN `it()`.
   *
   * Elle portait l'attente du cahier des charges — « l'étape 5 rendra
   * `scope_insufficient` » — et restait verte TANT QUE le socle ne la tenait
   * pas. La Recette du lot 1c l'a branchée ; la bascule est le signe du
   * progrès, et l'attente n'a été ni supprimée ni affaiblie : elle est
   * seulement passée du futur au présent, et mesure maintenant les QUATRE
   * branches de refus plutôt que la seule ligne du tableau.
   *
   * ⚠️ POURQUOI MESURER LES BRANCHES ET PAS `APPEL_STEPS`. Le tableau peut
   *    annoncer un code que l'étape n'émet pas — c'est même le défaut que
   *    l'ancien `it.fails` interdisait dans l'autre sens. La seule preuve qui
   *    vaille est de faire refuser l'étape et de LIRE le code qu'elle rend.
   */
  it("l'étape 5 rend `scope_insufficient` sur ses QUATRE branches de refus", () => {
    const OUTIL = "zoho.mail.send";
    const contexte = (
      scopes: readonly OpsScope[],
      correspondance: CorrespondanceScopes,
    ): ContexteScopes => ({
      scopes,
      effectEpingle: "read",
      outil: OUTIL,
      correspondance,
    });

    // Les quatre causes que l'en-tête d'`etape-05-scopes.ts` énumère, chacune
    // isolée par un contexte qui ne peut être refusé que par elle.
    const branches: { readonly cause: string; readonly contexte: ContexteScopes }[] = [
      {
        cause: "le jeton porte un scope qu'un jeton d'appel ne porte jamais",
        contexte: contexte(["ops:read", "ops:policy"], correspondanceCanonique),
      },
      {
        cause: "la correspondance exige un scope hors du § 19.2",
        contexte: contexte(["ops:read"], () => "ops:superuser" as unknown as OpsScope),
      },
      {
        cause: "la correspondance exige un scope qu'un jeton d'appel ne porte jamais",
        contexte: contexte(["ops:read"], () => "ops:policy"),
      },
      {
        cause: "le jeton ne porte pas le scope exigé",
        contexte: contexte(["ops:draft"], correspondanceCanonique),
      },
    ];

    const codes: string[] = [];
    const nonRefusees: string[] = [];
    for (const branche of branches) {
      const verdict = etape05Scopes(branche.contexte);
      if (verdict.issue !== "refuse") {
        nonRefusees.push(branche.cause);
        continue;
      }
      codes.push(String(verdict.code));
    }

    console.info(
      `[garde branchement · étape 5] ${String(branches.length)} branche(s) de refus mesurée(s) · ` +
        `${String(nonRefusees.length)} non refusée(s) · ` +
        `code(s) rendu(s) : ${[...new Set(codes)].join(", ")}`,
    );

    // Plancher-témoin : une branche qui n'aurait pas refusé n'aurait rendu
    // aucun code, et la comparaison ci-dessous serait verte sur trois éléments.
    expect(nonRefusees).toEqual([]);
    expect(codes).toHaveLength(branches.length);
    expect([...new Set(codes)]).toEqual([CODE_SCOPE_INSUFFISANT]);
    // Et le code rendu est bien celui du tableau : l'étape ne l'écrit pas à la
    // main, elle le LIT dans l'ancrage.
    expect(APPEL_STEPS.find((etape) => etape.cle === "scopes")?.refus).toBe(CODE_SCOPE_INSUFFISANT);
  });
});

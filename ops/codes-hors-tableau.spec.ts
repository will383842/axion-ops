import { describe, expect, it } from "vitest";

import { APPEL_STEPS, ERROR_CODES, type ErrorCode, type OpsScope } from "../core/types.js";
import { correspondanceCanonique, etape05Scopes } from "../core/chaine/etape-05-scopes.js";
import type { ContexteScopes, CorrespondanceScopes } from "../core/chaine/etapes.js";
import {
  CODES_DU_TABLEAU_15,
  CODES_HORS_TABLEAU_15,
  CODE_SCOPE_INSUFFISANT,
  MODULES_DE_DECLARATION,
  chercherLesSitesDEmission,
  confronterCodes,
  type CodeHorsTableau,
  type FichierDeProduction,
} from "./codes-hors-tableau.js";
// ⚠️ LE PÉRIMÈTRE DE PRODUCTION A **UN** PROPRIÉTAIRE DANS CE DÉPÔT. Le
//    recopier ici mesurerait sa propre recopie — c'est le défaut exact que
//    `core/epreuve/perimetre-de-production.ts` existe pour fermer.
import { fichiersLivresDuDepot, lireDuDepot } from "../core/epreuve/perimetre-de-production.js";

/** Les modules que `pnpm build` émet, avec leur source. Lu une seule fois. */
function productionDuDepot(): readonly FichierDeProduction[] {
  return fichiersLivresDuDepot().map((chemin) => ({ chemin, source: lireDuDepot(chemin) }));
}

/** La recherche des sites d'émission sur le DÉPÔT RÉEL. */
function rechercheReelle(): ReturnType<typeof chercherLesSitesDEmission> {
  return chercherLesSitesDEmission(productionDuDepot());
}

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
    const verdict = confronterCodes(
      ERROR_CODES,
      CODES_DU_TABLEAU_15,
      CODES_HORS_TABLEAU_15,
      rechercheReelle(),
    );

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

  /**
   * ⚠️ **CETTE GARDE MESURAIT DEUX BOOLÉENS ÉCRITS À LA MAIN, ET ELLE MESURE
   *    DÉSORMAIS LES QUINZE CODES.** `CodeHorsTableau` portait un champ
   *    `enAttenteDeBranchement`, renseigné entrée par entrée : la garde ne
   *    pouvait donc rien dire des TREIZE codes DU tableau du § 15, et
   *    `upstream_unavailable` — l'un des treize — est resté sans aucun émetteur
   *    de production pendant quatre lots sans qu'une ligne le dise.
   */
  it("aucun code de l'union n'est sans émetteur de production — les QUINZE confrontés", () => {
    const recherche = rechercheReelle();
    const verdict = confronterCodes(
      ERROR_CODES,
      CODES_DU_TABLEAU_15,
      CODES_HORS_TABLEAU_15,
      recherche,
    );
    const etape5 = APPEL_STEPS.find((etape) => etape.cle === "scopes");
    const litterales = recherche.sites.filter((site) => site.forme === "littérale").length;
    const ancrees = recherche.sites.filter((site) => site.forme === "ancrée").length;

    console.info(
      `[garde branchement] ${String(recherche.codesConfrontes)} code(s) confronté(s) à ` +
        `${String(recherche.modulesBalayes)} module(s) de production ` +
        `(${String(recherche.declarationsEcartees.length)} module(s) de déclaration écarté(s) : ` +
        `${recherche.declarationsEcartees.join(", ")}) · ` +
        `${String(recherche.sites.length)} site(s) d'émission trouvé(s) ` +
        `[${String(litterales)} littérale(s), ${String(ancrees)} ancrée(s)] · ` +
        `${String(recherche.sansProducteur.length)} code(s) SANS producteur ` +
        `[${recherche.sansProducteur.join(", ") || "aucun"}]`,
    );

    // Planchers-témoins : une recherche qui n'aurait balayé aucun module, ou
    // confronté aucun code, rendrait la ligne finale vraie sur du vide.
    expect(recherche.modulesBalayes).toBeGreaterThanOrEqual(60);
    expect(recherche.codesConfrontes).toBe(ERROR_CODES.length);
    expect(recherche.declarationsIntrouvables).toEqual([]);
    expect(recherche.declarationsEcartees).toHaveLength(MODULES_DE_DECLARATION.length);
    expect(CODES_HORS_TABLEAU_15.length).toBe(2);
    expect(etape5).toBeDefined();
    // Le 403 du § 11 n'a pas bougé : le code nomme la cause, il ne remplace pas
    // le statut.
    expect(etape5?.statutHttp).toBe(403);
    expect(verdict.emissionMesuree).toBe(true);
    expect(verdict.enAttenteDeBranchement).toEqual([]);
  });

  /**
   * ⚠️ **LA FORME ANCRÉE N'EST PAS UN CONFORT : SANS ELLE, LA MESURE SERAIT
   *    FAUSSE.** Le dépôt émet la plupart de ses refus en LISANT le code dans
   *    l'ancrage d'`APPEL_STEPS`, jamais en l'écrivant — c'est la règle de
   *    dérivation de `core/chaine/etapes.ts`. Un `grep` sur le seul littéral ne
   *    prouve donc que l'absence de la FORME ÉCRITE, et il rangerait parmi les
   *    codes morts des refus que la chaîne prononce tous les jours.
   */
  it("compte les DEUX formes, et la forme ancrée en trouve que le littéral rate", () => {
    const production = productionDuDepot();
    const complete = chercherLesSitesDEmission(production);
    // Le même balayage, privé de la forme ancrée : sans étape du § 11, plus
    // aucun code ne se déduit d'un `ancrerEtape("…")`.
    const litteraleSeule = chercherLesSitesDEmission(production, ERROR_CODES, []);
    const vusParLAncrage = litteraleSeule.sansProducteur.filter(
      (code) => !complete.sansProducteur.includes(code),
    );

    console.info(
      `[garde formes] ${String(production.length)} module(s) de production · ` +
        `sans producteur avec les deux formes : ${String(complete.sansProducteur.length)} · ` +
        `avec le littéral seul : ${String(litteraleSeule.sansProducteur.length)} ` +
        `[${litteraleSeule.sansProducteur.join(", ") || "aucun"}] · ` +
        `${String(vusParLAncrage.length)} code(s) que SEULE la forme ancrée voit ` +
        `[${vusParLAncrage.join(", ") || "aucun"}]`,
    );

    expect(production.length).toBeGreaterThanOrEqual(60);
    // Plancher : si l'ancrage n'apportait rien, la garde précédente serait verte
    // pour la mauvaise raison — elle mesurerait une forme qui ne sert à rien.
    expect(vusParLAncrage.length).toBeGreaterThanOrEqual(1);
  });

  /**
   * ⚠️ **LE TÉMOIN FABRIQUÉ : SANS LES MODULES DE DÉCLARATION ÉCARTÉS, LA
   *    RECHERCHE SERAIT VERTE PAR CONSTRUCTION.** `core/types.ts` nomme les
   *    quinze codes — il DÉCLARE l'union. Le compter pour un émetteur rendrait
   *    « tout est branché » vrai quoi qu'il arrive, et c'est exactement sous ce
   *    vert-là que `upstream_unavailable` a dormi quatre lots.
   */
  it("écarte les modules de DÉCLARATION, et rougit sur un chemin écarté introuvable", () => {
    const declaration: FichierDeProduction = {
      chemin: "core/types.ts",
      source: 'export const ERROR_CODES = ["internal", "conflict"] as const;',
    };
    // ⚠️ UN TÉMOIN ISOLE UNE SEULE RÈGLE. Ce module-ci existe pour que le
    //    balayage ne soit pas VIDE : sans lui, la confrontation du bas
    //    rougirait AUSSI sur « zéro module balayé », et l'on ne saurait plus
    //    laquelle des deux règles a mordu.
    const emetteur: FichierDeProduction = {
      chemin: "core/emetteur-temoin.ts",
      source: 'export const REFUS = { code: "internal" };',
    };
    const ecarte = chercherLesSitesDEmission(
      [declaration],
      ["internal", "conflict"],
      [],
      MODULES_DE_DECLARATION,
    );
    const siOnLeComptait = chercherLesSitesDEmission(
      [declaration],
      ["internal", "conflict"],
      [],
      [],
    );
    const cheminPerime = confronterCodes(
      CODES_DU_TABLEAU_15,
      CODES_DU_TABLEAU_15,
      [],
      chercherLesSitesDEmission(
        [declaration, emetteur],
        CODES_DU_TABLEAU_15,
        [],
        [
          { chemin: "core/types.ts", motif: "témoin — déclare l'union sans rien émettre" },
          { chemin: "core/chemin-qui-nexiste-plus.ts", motif: "témoin — un chemin périmé" },
        ],
      ),
    );

    console.info(
      `[garde déclarations] 2 module(s) fabriqué(s), dont 1 de DÉCLARATION · écarté : ` +
        `${String(ecarte.sansProducteur.length)} code(s) sans producteur · ` +
        `compté : ${String(siOnLeComptait.sansProducteur.length)} · ` +
        `chemin périmé → ${String(cheminPerime.anomalies.length)} anomalie(s)`,
    );

    // Écarté : le module ne compte pas, donc les deux codes sont sans producteur.
    expect(ecarte.sansProducteur).toEqual(["conflict", "internal"]);
    // Compté : il passerait pour un émetteur, et la garde serait verte pour rien.
    expect(siOnLeComptait.sansProducteur).toEqual([]);
    // Un chemin écarté qui n'existe pas n'écarte plus rien : il faut le dire.
    expect(cheminPerime.anomalies).toHaveLength(1);
    expect(cheminPerime.anomalies[0]).toContain("chemin-qui-nexiste-plus");
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

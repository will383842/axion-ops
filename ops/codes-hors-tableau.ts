/**
 * `ops/codes-hors-tableau.ts` — LES CODES QUE LE § 15 N'ÉNUMÈRE PAS, ET QUE CE
 * DÉPÔT NOMME QUAND MÊME.
 *
 * ═══ LE DÉFAUT QUE CE MODULE FERME ═══
 *
 * Le tableau du § 15 énumère TREIZE codes. `ERROR_CODES` en porte davantage :
 * le lot 1b y a ajouté `vault_locked` (ADR 0005), le lot 1c y ajoute
 * `scope_insufficient`. Les deux ajouts sont motivés, écrits, et tenus par une
 * union fermée.
 *
 * Mais un écart au cahier des charges se paie plus tard, et toujours de la même
 * façon : quelqu'un relit `ERROR_CODES`, le compare au § 15, trouve un code de
 * plus, ne trouve nulle part POURQUOI — et le retire, ou pire, en ajoute un
 * quatorzième sur le même geste, sans motif ni ADR. Le document et le code
 * divergent alors sans qu'aucune ligne ne le dise.
 *
 * Ce module tient les deux ensemble :
 *
 *  · `CODES_DU_TABLEAU_15` transcrit les treize codes DU DOCUMENT. C'est la
 *    seule recopie assumée de ce fichier, et elle est nécessaire : sans une
 *    référence, « en plus du § 15 » ne se calcule pas ;
 *  · `CODES_HORS_TABLEAU_15` porte, pour chaque ajout, le § qui EXIGE le refus,
 *    les voisins écartés avec ce que chacun mentirait, et l'ADR ;
 *  · `confronterCodes()` DÉRIVE l'écart des deux listes et refuse tout code
 *    ajouté sans motif écrit. Un quinzième code apparaîtra donc rouge le jour
 *    même — pas au prochain audit.
 *
 * ⚠️ CE MODULE NE DÉCIDE RIEN. Il ne refuse aucun appel et n'est branché à
 *    aucune étape : c'est une garde de cohérence entre le code et le document.
 *    La chaîne d'appel, elle, ne lit que `ERROR_CODES`.
 *
 * ⚠️ LA GARDE DE COMPILATION EST LA PREMIÈRE DES DEUX. `CODE_SCOPE_INSUFFISANT`
 *    et `CODE_COFFRE_VERROUILLE_OPS` sont annotés `ErrorCode` : le jour où l'un
 *    des deux sort de l'union, ce fichier NE COMPILE PLUS. Une garde d'exécution
 *    seule aurait pu être ignorée ; `pnpm typecheck` ne s'ignore pas.
 */

import type { ErrorCode } from "../core/types.js";
import { ERROR_CODES } from "../core/types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES GARDES DE COMPILATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ GARDE DE COMPILATION — `scope_insufficient` APPARTIENT À `ErrorCode`.
 *
 * Le § 11 donne un `403` à l'étape 5 et le § 15 ne lui donne aucun code : les
 * trois refus de scope sortaient tous avec `code: null`, et le comptage du § 24
 * ne pouvait pas les séparer d'un refus de politique ordinaire. La Recette du
 * lot 1c l'a branché — `APPEL_STEPS` le porte, les trois refus le rendent.
 *
 * Retirer la valeur de `ERROR_CODES` fait échouer `pnpm typecheck` ici, sur une
 * ligne qui dit pourquoi elle existe. C'est le contrôle demandé au lot 1c.
 */
export const CODE_SCOPE_INSUFFISANT: ErrorCode = "scope_insufficient";

/**
 * ⚠️ GARDE DE COMPILATION — même chose pour le premier ajout, celui du lot 1b.
 *
 * `core/vault/erreurs.ts` porte déjà son propre alias typé ; celui-ci ne le
 * remplace pas — il met les DEUX écarts sous la même garde, pour qu'on ne
 * puisse pas en retirer un en croyant n'en toucher aucun.
 */
export const CODE_COFFRE_VERROUILLE_OPS: ErrorCode = "vault_locked";

// ═════════════════════════════════════════════════════════════════════════════
//  LE DOCUMENT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TREIZE CODES DU TABLEAU DU § 15, DANS L'ORDRE DU DOCUMENT.
 *
 * ⚠️ C'EST UNE RECOPIE, ET C'EST DÉLIBÉRÉ. On ne DÉRIVE pas une référence : si
 *    cette liste était calculée depuis `ERROR_CODES`, l'écart qu'elle sert à
 *    mesurer vaudrait zéro par construction, et la garde serait verte pour la
 *    pire des raisons. Le `satisfies` ci-dessous garantit seulement qu'aucune
 *    valeur n'y est mal orthographiée.
 */
export const CODES_DU_TABLEAU_15 = [
  "unauthenticated",
  "tool_disabled",
  "tool_not_in_profile",
  "policy_denied",
  "confirmation_required",
  "provenance_denied",
  "invalid_input",
  "cursor_invalid",
  "rate_limited",
  "result_too_large",
  "upstream_unavailable",
  "conflict",
  "internal",
] as const satisfies readonly ErrorCode[];

// ═════════════════════════════════════════════════════════════════════════════
//  LES AJOUTS, ET LEUR MOTIF
// ═════════════════════════════════════════════════════════════════════════════

/** Un voisin possible, et ce qu'il aurait fait dire au socle. */
export interface VoisinEcarte {
  readonly code: ErrorCode;
  /** Ce que ce code aurait MENTI. Jamais « ne convient pas » : on dit quoi. */
  readonly mensonge: string;
}

/** Pourquoi ce dépôt porte un code que le § 15 n'énumère pas. */
export interface CodeHorsTableau {
  readonly code: ErrorCode;
  /** Le § qui EXIGE le refus alors que le § 15 ne le nomme pas. */
  readonly exigePar: string;
  /** Les voisins écartés. Au moins un : un ajout sans voisin écarté n'a pas
   *  été instruit. */
  readonly voisins: readonly VoisinEcarte[];
  /** La décision qui l'a tranché. */
  readonly adr: string;
  /** Vrai tant qu'AUCUNE étape de la chaîne ne rend ce code. */
  readonly enAttenteDeBranchement: boolean;
}

/**
 * LES DEUX ÉCARTS ASSUMÉS, ET RIEN D'AUTRE.
 *
 * ⚠️ AJOUTER UN CODE À `ERROR_CODES` SANS AJOUTER SA LIGNE ICI FAIT ROUGIR
 *    `confronterCodes()`. C'est tout l'objet du module : un écart au cahier des
 *    charges peut être justifié, il ne peut pas être muet.
 */
export const CODES_HORS_TABLEAU_15: readonly CodeHorsTableau[] = [
  {
    code: CODE_COFFRE_VERROUILLE_OPS,
    exigePar:
      "§ 23 — « tout appel d'outil est refusé » coffre verrouillé, et le § 32 en fait un critère de recette du lot 1",
    voisins: [
      {
        code: "internal",
        mensonge:
          "il ne rend qu'un identifiant de corrélation, alors que le § 15 exige que le message dise ce qu'il faut faire ensuite — ici : déverrouiller le coffre",
      },
      {
        code: "upstream_unavailable",
        mensonge:
          "il accuserait un adaptateur parfaitement joignable, alors que c'est LE SOCLE qui refuse",
      },
    ],
    adr: "ADR 0005",
    // L'étape 0 le rend déjà (`APPEL_STEPS[0].refus`).
    enAttenteDeBranchement: false,
  },
  {
    code: CODE_SCOPE_INSUFFISANT,
    exigePar:
      "§ 11 — l'étape 5 refuse par un 403 ; § 15, troisième règle — le comptage des refus du § 24 doit pouvoir isoler cette cause",
    voisins: [
      {
        code: "unauthenticated",
        mensonge:
          "il ferait se ré-authentifier alors que le jeton est valide, signé, non révoqué et de la bonne audience — le geste ne change rien et fait tourner en rond",
      },
      {
        code: "policy_denied",
        mensonge:
          "il parlerait d'un niveau de garde-fou à desserrer alors que la politique n'a pas été consultée : elle est à l'étape 10, cinq étapes plus loin",
      },
      {
        code: "tool_disabled",
        mensonge:
          "il enverrait chercher un interrupteur dans l'écran Outils, alors que l'outil est actif",
      },
    ],
    adr: "lot 1c — README, « Écarts relevés »",
    // ⚠️ BRANCHÉ PAR LA RECETTE DU LOT 1c. `APPEL_STEPS` donne
    //    `refus: "scope_insufficient"` à l'étape 5, et les TROIS refus de
    //    `core/chaine/etape-05-scopes.ts` le rendent — sans qu'une ligne de ce
    //    module-là ait bougé, parce que `refuse()` LIT le code dans l'ancrage.
    //    L'`it.fails` de la garde a basculé en `it()` du même geste.
    enAttenteDeBranchement: false,
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONFRONTATION
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que rend la confrontation. JAMAIS un booléen. */
export interface VerdictCodes {
  /** Combien de codes de l'union ont été confrontés au document. */
  readonly codesMesures: number;
  /** Combien de codes du § 15 ont été cherchés dans l'union. */
  readonly codesDuDocument: number;
  /** Les codes de l'union absents du § 15, triés. */
  readonly horsTableau: readonly string[];
  /** Ceux d'entre eux qui portent un motif écrit, triés. */
  readonly motives: readonly string[];
  /** Ceux qui sont déclarés mais qu'aucune étape ne rend encore. */
  readonly enAttenteDeBranchement: readonly string[];
  readonly anomalies: readonly string[];
}

/**
 * Confronte l'union fermée au tableau du document et aux motifs écrits.
 *
 * @param codes - l'union à mesurer. INJECTABLE : une garde doit pouvoir
 *   fabriquer un quinzième code non motivé pour prouver que ceci rougit.
 * @param tableau - les codes du § 15.
 * @param motifs - les écarts assumés.
 */
export function confronterCodes(
  codes: readonly string[] = ERROR_CODES,
  tableau: readonly string[] = CODES_DU_TABLEAU_15,
  motifs: readonly CodeHorsTableau[] = CODES_HORS_TABLEAU_15,
): VerdictCodes {
  const anomalies: string[] = [];
  const duDocument = new Set(tableau);
  const motivesParCode = new Map(motifs.map((motif) => [motif.code as string, motif]));

  const horsTableau = codes.filter((code) => !duDocument.has(code)).sort();

  for (const code of horsTableau) {
    const motif = motivesParCode.get(code);
    if (motif === undefined) {
      anomalies.push(
        `le code « ${code} » n'est pas au tableau du § 15 et AUCUN motif ne l'explique. ` +
          "Un écart au cahier des charges peut être justifié, il ne peut pas être muet : " +
          "ajoutez sa ligne à `CODES_HORS_TABLEAU_15` — le § qui exige le refus, les voisins " +
          "écartés avec ce que chacun mentirait, et l'ADR.",
      );
      continue;
    }
    if (motif.voisins.length === 0) {
      anomalies.push(
        `le code « ${code} » porte un motif SANS VOISIN ÉCARTÉ. Un ajout au § 15 qui n'a ` +
          "comparé aucun code existant n'a pas été instruit : le premier réflexe, devant un " +
          "refus sans nom, est d'emprunter celui du voisin — il faut donc dire lequel, et ce " +
          "qu'il aurait menti.",
      );
    }
  }

  const horsTableauConnus = new Set(horsTableau);
  for (const motif of motifs) {
    if (!horsTableauConnus.has(motif.code)) {
      anomalies.push(
        `le motif écrit pour « ${motif.code} » ne correspond à aucun code AJOUTÉ : ou bien le ` +
          "code a été retiré de l'union, ou bien il est entré au tableau du § 15. Dans les deux " +
          "cas, ce motif ne décrit plus rien.",
      );
    }
  }

  const presents = new Set(codes);
  for (const code of tableau) {
    if (!presents.has(code)) {
      anomalies.push(
        `le code « ${code} » est au tableau du § 15 et ABSENT de l'union : le socle ne pourra ` +
          "jamais le rendre, et le § du cahier des charges qui l'annonce est faux.",
      );
    }
  }

  return {
    codesMesures: codes.length,
    codesDuDocument: tableau.length,
    horsTableau,
    motives: horsTableau.filter((code) => motivesParCode.has(code)).sort(),
    enAttenteDeBranchement: motifs
      .filter((motif) => motif.enAttenteDeBranchement)
      .map((motif) => motif.code as string)
      .sort(),
    anomalies,
  };
}

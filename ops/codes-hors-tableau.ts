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
import { APPEL_STEPS, ERROR_CODES } from "../core/types.js";
// La prose et les liaisons se retirent AVANT toute mesure — un code nommé dans
// un bloc JSDoc n'est pas un émetteur, et une ré-exportation non plus. Ces deux
// nettoyages ont UN propriétaire dans le dépôt, et ce module l'appelle.
import { sansLiaisons, sansProse } from "../core/coutures/verifier.js";

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
}

/**
 * ⚠️ **LE CHAMP `enAttenteDeBranchement` A ÉTÉ RETIRÉ DE CE TYPE.** Il était un
 *    booléen ÉCRIT À LA MAIN, entrée par entrée : une seconde source de vérité
 *    sur un fait que le dépôt porte déjà, et c'est toujours la seconde qui ne
 *    suit pas. Le fait est désormais DÉRIVÉ pour les QUINZE codes, pas seulement
 *    pour les deux écarts — voir {@link chercherLesSitesDEmission}.
 */

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
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  LES SITES D'ÉMISSION — « QUI, DANS LA PRODUCTION, REND CE CODE ? »
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **CE QUE CETTE SECTION REMPLACE, ET POURQUOI.** `CodeHorsTableau` portait
 *    un champ `enAttenteDeBranchement: boolean`, écrit à la main, entrée par
 *    entrée. C'était une SECONDE SOURCE DE VÉRITÉ sur un fait que le dépôt
 *    porte déjà — et c'est toujours la seconde qui ne suit pas. Deux
 *    conséquences mesurées :
 *
 *     · elle ne pouvait rien dire des TREIZE codes DU tableau du § 15, puisque
 *       le champ ne vivait que sur les écarts. `upstream_unavailable` — l'un des
 *       treize — n'a eu AUCUN émetteur de production pendant quatre lots, et
 *       rien dans ce module ne pouvait le voir ;
 *     · un booléen recopié se relit comme une mesure, alors qu'il n'est qu'une
 *       affirmation.
 *
 * Le fait est désormais DÉRIVÉ, des deux côtés : pour CHAQUE code de l'union, on
 * cherche un site d'émission dans les modules de production, et l'on annonce le
 * nombre de codes confrontés et le nombre de codes sans producteur.
 */

/** Un fichier de production soumis à la recherche. Injecté, jamais lu ici. */
export interface FichierDeProduction {
  readonly chemin: string;
  readonly source: string;
}

/** Un module qui NOMME les codes sans en rendre aucun. */
export interface ModuleDeDeclaration {
  readonly chemin: string;
  /** Ce que ce module fait des codes. Jamais « c'est spécial » : on dit quoi. */
  readonly motif: string;
}

/**
 * LES MODULES ÉCARTÉS DE LA RECHERCHE, ET CE QU'ILS FONT.
 *
 * ⚠️ **SANS EUX, LA RECHERCHE SERAIT VERTE POUR LA PIRE DES RAISONS.** Les deux
 *    modules ci-dessous nomment TOUS les codes — l'un parce qu'il déclare
 *    l'union, l'autre parce qu'il recopie le tableau du document. Les compter
 *    pour des émetteurs rendrait « tout est branché » vrai par construction, et
 *    `upstream_unavailable` aurait continué de passer pour émis.
 *
 * ⚠️ **UN MODULE ÉCARTÉ QUI N'EXISTE PLUS EST UNE ANOMALIE**, et non un écart
 *    silencieux : la recherche le nomme dans `declarationsIntrouvables`. Un
 *    chemin périmé ici écarterait zéro fichier, donc ne protégerait plus rien.
 */
export const MODULES_DE_DECLARATION: readonly ModuleDeDeclaration[] = [
  {
    chemin: "core/types.ts",
    motif:
      "il DÉCLARE l'union fermée `ERROR_CODES` : les quinze codes y sont nommés, et aucun " +
      "n'y est rendu à un appelant.",
  },
  {
    chemin: "ops/codes-hors-tableau.ts",
    motif:
      "il RECOPIE le tableau du § 15 pour mesurer l'écart. C'est la référence contre " +
      "laquelle on mesure, jamais un émetteur — et se compter soi-même rendrait la " +
      "mesure vide par construction.",
  },
];

/** Un endroit où un module de production rend ce code. */
export interface SiteDEmission {
  readonly code: string;
  readonly module: string;
  /**
   * Comment le site a été reconnu :
   *
   *  · `littérale` — le module NOMME le code entre guillemets, hors commentaire ;
   *  · `ancrée`    — le module ancre une étape d'`APPEL_STEPS` (`ancrerEtape("…")`)
   *                  dont le § 11 donne ce code en `refus`. C'est la forme que le
   *                  dépôt emploie partout, précisément pour ne pas écrire le
   *                  code à la main — un `grep` sur le littéral seul ne voit
   *                  donc PAS ces émetteurs-là.
   */
  readonly forme: "littérale" | "ancrée";
}

/** Ce que rend la recherche. Des NOMBRES et des noms, jamais un booléen. */
export interface RechercheDesSites {
  /** Combien de modules de production ont été balayés. */
  readonly modulesBalayes: number;
  /** Combien de codes ont été confrontés à ces modules. */
  readonly codesConfrontes: number;
  /** Les modules écartés parce qu'ils DÉCLARENT sans émettre. */
  readonly declarationsEcartees: readonly string[];
  /** Ceux qui sont écartés par la liste et qu'on n'a pas trouvés. */
  readonly declarationsIntrouvables: readonly string[];
  readonly sites: readonly SiteDEmission[];
  /** Les codes qu'au moins un module de production rend, triés. */
  readonly avecProducteur: readonly string[];
  /** Les codes qu'AUCUN module de production ne rend, triés. */
  readonly sansProducteur: readonly string[];
}

/**
 * CHERCHE, POUR CHAQUE CODE, UN SITE D'ÉMISSION DE PRODUCTION.
 *
 * ⚠️ **FONCTION PURE D'UN ENSEMBLE DE FICHIERS INJECTÉ.** Elle ne lit ni le
 *    disque ni `ERROR_CODES` par surprise : tout lui est remis. C'est ce qui
 *    permet à un témoin de lui soumettre un dépôt FABRIQUÉ dont on a retiré
 *    l'unique émetteur d'un code, et d'exiger qu'elle le voie.
 *
 * ⚠️ **LA PROSE EST RETIRÉE AVANT TOUTE MESURE**, par `sansProse` et
 *    `sansLiaisons`. Un code nommé dans un bloc JSDoc n'est pas un émetteur, et
 *    une ré-exportation non plus : c'est la mesure exacte qui a fait naître le
 *    registre des coutures, et elle vaut ici mot pour mot.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** Ceci mesure des FORMES sur le source :
 *    qu'un module NOMME le code, ou qu'il ancre l'étape dont le § 11 le tire.
 *    Elle ne fait tourner aucun appel, donc elle ne prouve pas qu'une branche
 *    atteignable rende ce code — seulement qu'un endroit peut le rendre. La
 *    preuve du contraire s'obtient en faisant REFUSER l'étape et en LISANT le
 *    code rendu ; c'est ce que fait la garde des quatre branches de l'étape 5,
 *    plus bas dans `codes-hors-tableau.spec.ts`.
 */
export function chercherLesSitesDEmission(
  fichiers: readonly FichierDeProduction[],
  codes: readonly string[] = ERROR_CODES,
  etapes: readonly { readonly cle: string; readonly refus: ErrorCode | null }[] = APPEL_STEPS,
  declarations: readonly ModuleDeDeclaration[] = MODULES_DE_DECLARATION,
): RechercheDesSites {
  const ecartes = new Set(declarations.map((declaration) => declaration.chemin));
  const presents = new Set(fichiers.map((fichier) => fichier.chemin));
  const declarationsIntrouvables = declarations
    .map((declaration) => declaration.chemin)
    .filter((chemin) => !presents.has(chemin))
    .sort();

  const balayes = fichiers
    .filter((fichier) => !ecartes.has(fichier.chemin))
    .map((fichier) => ({
      chemin: fichier.chemin,
      // Ni commentaire, ni `import … from` : voir la garde ci-dessus.
      source: sansLiaisons(sansProse(fichier.source)),
    }));

  // Les clés d'étapes qui portent ce code au § 11. Un code peut n'en avoir
  // aucune — `internal`, par exemple, qui n'est l'issue d'aucune étape.
  const clesParCode = new Map<string, string[]>();
  for (const etape of etapes) {
    if (etape.refus === null) continue;
    const deja = clesParCode.get(etape.refus);
    if (deja === undefined) clesParCode.set(etape.refus, [etape.cle]);
    else deja.push(etape.cle);
  }

  const sites: SiteDEmission[] = [];
  for (const code of codes) {
    const litteral = `"${code}"`;
    const cles = clesParCode.get(code) ?? [];
    for (const fichier of balayes) {
      if (fichier.source.includes(litteral)) {
        sites.push({ code, module: fichier.chemin, forme: "littérale" });
        continue;
      }
      if (cles.some((cle) => fichier.source.includes(`ancrerEtape("${cle}")`))) {
        sites.push({ code, module: fichier.chemin, forme: "ancrée" });
      }
    }
  }

  const avec = new Set(sites.map((site) => site.code));

  return {
    modulesBalayes: balayes.length,
    codesConfrontes: codes.length,
    declarationsEcartees: [...ecartes].filter((chemin) => presents.has(chemin)).sort(),
    declarationsIntrouvables,
    sites,
    avecProducteur: codes.filter((code) => avec.has(code)).sort(),
    sansProducteur: codes.filter((code) => !avec.has(code)).sort(),
  };
}

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
  /**
   * Les codes de l'union qu'AUCUN module de production ne rend, triés.
   *
   * ⚠️ **DÉRIVÉ DES DEUX CÔTÉS, ET IL COUVRE LES QUINZE CODES.** Il ne vaut plus
   *    ce que deux lignes de motif affirmaient : pour chaque code de l'union, un
   *    site d'émission a été cherché dans les modules de production.
   *
   * ⚠️ **QUAND L'ÉMISSION N'A PAS ÉTÉ MESURÉE, IL LES PORTE TOUS.** Un appelant
   *    qui ne remet aucune recherche n'a rien prouvé ; rendre une liste vide se
   *    lirait « tout est branché », et ce serait une garde verte parce qu'elle
   *    ne regarde rien. Lire {@link VerdictCodes.emissionMesuree} avant celui-ci.
   */
  readonly enAttenteDeBranchement: readonly string[];
  /** Faux quand aucune recherche de sites d'émission n'a été remise. */
  readonly emissionMesuree: boolean;
  /** Combien de modules de production la recherche a balayés. Zéro si aucune. */
  readonly modulesBalayes: number;
  /** Combien de codes ont été confrontés à un site d'émission. */
  readonly codesConfrontesAUnProducteur: number;
  readonly anomalies: readonly string[];
}

/**
 * Confronte l'union fermée au tableau du document et aux motifs écrits.
 *
 * @param codes - l'union à mesurer. INJECTABLE : une garde doit pouvoir
 *   fabriquer un quinzième code non motivé pour prouver que ceci rougit.
 * @param tableau - les codes du § 15.
 * @param motifs - les écarts assumés.
 * @param recherche - les sites d'émission trouvés dans la production, ou `null`
 *   quand on ne les a pas cherchés. `null` n'est PAS « rien à signaler » : le
 *   verdict porte alors `emissionMesuree: false` et range TOUS les codes en
 *   attente de branchement.
 */
export function confronterCodes(
  codes: readonly string[] = ERROR_CODES,
  tableau: readonly string[] = CODES_DU_TABLEAU_15,
  motifs: readonly CodeHorsTableau[] = CODES_HORS_TABLEAU_15,
  recherche: RechercheDesSites | null = null,
): VerdictCodes {
  const anomalies: string[] = [];
  const sansProducteur = new Set(recherche?.sansProducteur ?? []);

  // ⚠️ UNE RECHERCHE QUI N'A BALAYÉ AUCUN MODULE, OU QUI ÉCARTE UN CHEMIN QUI
  //    N'EXISTE PLUS, N'A RIEN MESURÉ — et son silence se lirait « tout va bien ».
  if (recherche !== null && recherche.modulesBalayes === 0) {
    anomalies.push(
      "la recherche des sites d'émission a balayé ZÉRO module de production : elle ne peut " +
        "rien dire du branchement des codes, et rendre « aucun code en attente » serait une " +
        "garde verte parce qu'elle ne regarde rien.",
    );
  }
  for (const chemin of recherche?.declarationsIntrouvables ?? []) {
    anomalies.push(
      `le module de déclaration « ${chemin} » est écarté de la recherche et n'a pas été ` +
        "trouvé : ou bien il a été déplacé, ou bien il a disparu. Dans les deux cas, il " +
        "n'écarte plus rien, et un module qui NOMME tous les codes sans en rendre aucun " +
        "peut de nouveau passer pour un émetteur.",
    );
  }

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
    enAttenteDeBranchement:
      recherche === null
        ? [...codes].sort()
        : codes.filter((code) => sansProducteur.has(code)).sort(),
    emissionMesuree: recherche !== null,
    modulesBalayes: recherche?.modulesBalayes ?? 0,
    codesConfrontesAUnProducteur: recherche?.codesConfrontes ?? 0,
    anomalies,
  };
}

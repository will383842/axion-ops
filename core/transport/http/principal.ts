/**
 * `core/transport/http/principal.ts` — **UN `principal` MALFORMÉ REFUSE L'APPEL
 * (ADR 0029, point 2), ET LA BORNE N'EST PAS RÉÉCRITE : ELLE EST DEMANDÉE À LA
 * GARDE QUI REFUSERAIT LA LIGNE.**
 *
 * ═══ LE DÉFAUT QUE CE MODULE VISE ═══
 *
 * Le lot 1d l'a mesuré : `verifierAucunContenu()` (§ 31) borne des colonnes dont
 * la valeur ne vient pas du socle, et `principal` n'est bornée par rien en
 * amont. L'en-tête vivant la pose verbatim, la garde du § 31 refuse la ligne, et
 * l'écriture lève **hors** du `try` de `journaliser` : **zéro ligne
 * d'`ops_audit`**. Rien ne sort — la porte est fermée —, mais la trace est
 * perdue, et l'invariant du § 11 tombe avec elle.
 *
 * L'ADR 0029 tranche : **refuser**, et non borner. Le motif est écrit et il ne
 * doit pas se perdre, parce que la décision jumelle sur `tool` est l'inverse :
 * le `principal` est la clé d'ancrage d'`ops_quota` (unicité
 * `(window, tool, principal)`) et d'`ops_runtime` (un profil actif par
 * principal). Un repli — quelle que soit la valeur choisie — **fusionnerait deux
 * principaux distincts dans un même compteur de quota** et leur donnerait le
 * même profil actif. Ce n'est pas une perte de trace, c'est un désarmement de
 * limite.
 *
 * ═══ POURQUOI UNE SONDE, ET PAS UNE EXPRESSION ÉCRITE ICI ═══
 *
 * L'ADR 0029, point 4, l'interdit en toutes lettres : « ne pas écrire une
 * seconde expression à la main ». Une seconde écriture de la forme du journal
 * diverge au premier ajustement, et la garde devient muette du côté qui n'a pas
 * suivi. Or la borne exacte — 128 caractères — vit dans `FORMES`, qui n'est pas
 * exporté par `core/audit/contenu.ts`.
 *
 * Ce module ne la recopie donc pas : **il soumet une ligne témoin à
 * `verifierAucunContenu()` elle-même** et lit ce qu'elle en dit du champ
 * `principal`. Il n'y a pas deux règles ; il y en a une, interrogée là où elle
 * vit. Le jour où `FORMES.principal` change de borne ou de genre, ce module suit
 * sans qu'une ligne soit à retoucher — et le jour où la garde du § 31 cesse de
 * nommer le champ dans son anomalie, {@link TEMOIN_DE_CAPACITE} rougit.
 *
 * ⚠️ **LA SONDE EST APPARIÉE À UN TÉMOIN DE CAPACITÉ, ET IL EST INDISPENSABLE.**
 *    Une sonde qui ne trouverait jamais d'anomalie — parce que le squelette est
 *    devenu invalide ailleurs, parce que le préfixe du message a changé — serait
 *    verte pour la pire des raisons. Chaque appel exécute donc DEUX sondes : la
 *    vraie, et une seconde sur {@link PRINCIPAL_STDIO}, valeur dont
 *    `orchestrateur.spec.ts` mesure déjà la conformité. Si le témoin de capacité
 *    échoue, l'appel est refusé — fail-closed : à cet instant, le socle ne sait
 *    plus dire d'aucun principal qu'il est admissible.
 */

import { verifierAucunContenu } from "../../audit/contenu.js";
import {
  ARG_HASH_NON_LU,
  ARG_HASH_NON_VALIDE,
  OUTIL_INCONNU,
  SESSION_HORS_APPEL,
  VERSION_INCONNUE,
} from "../../audit/vocabulaire.js";
import type { ContenuLigne } from "../../audit/vocabulaire.js";
import { EFFECTS, POLICY_LEVELS } from "../../types.js";
import type { AppelStep } from "../../types.js";
import { PRINCIPAL_STDIO } from "../../chaine/orchestrateur.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA VALEUR RÉSERVÉE DU REFUS EN AMONT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE `principal` D'UNE LIGNE DE REFUS PRONONCÉ EN AMONT DU NOYAU.
 *
 * ⚠️ **UNE VALEUR RÉSERVÉE ET NOMMÉE, PARCE QUE QUATRE INVENTIONS DIFFÉRENTES
 *    RENDRAIENT LA MÉTRIQUE DU § 24 ILLISIBLE.** C'est exactement le motif
 *    d'{@link OUTIL_INCONNU} et de `SESSION_HORS_APPEL`, appliqué à la troisième
 *    colonne que les étapes 1 à 4 ne peuvent pas remplir : un refus d'étape 1
 *    n'a pas encore de jeton, donc pas de principal, et un refus d'étape 4 pour
 *    principal malformé n'a **pas le droit** d'écrire celui qu'il a lu — ce
 *    serait remettre dans la colonne la valeur que la garde du § 31 refuse.
 *
 * ⚠️ **AUCUN ÉMETTEUR NE PEUT LA PRODUIRE, ET C'EST VÉRIFIÉ, PAS SUPPOSÉ.**
 *    `principal.spec.ts` la soumet à la même sonde que n'importe quelle autre
 *    valeur : elle doit passer la forme du journal — sans quoi la valeur choisie
 *    POUR RÉPARER la perte de ligne provoquerait, elle-même, une perte de ligne.
 *    C'est la garde que l'ADR 0029 réclame nommément.
 */
export const PRINCIPAL_REFUS_EN_AMONT = "ops.principal-non-identifié";

// ═════════════════════════════════════════════════════════════════════════════
//  LE SQUELETTE DE LA SONDE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le premier habitant d'une énumération fermée, avec une panne BRUYANTE si elle
 * est vide.
 *
 * ⚠️ ON NE PEUT PAS ÉCRIRE `"read"` ICI. Ce serait recopier un habitant
 *    d'`EFFECTS`, c'est-à-dire poser dans ce module une seconde source de vérité
 *    sur une énumération dont `core/types.ts` est propriétaire. On dérive, et on
 *    lève si la dérivation ne rend rien — un `?? "read"` aurait ramené la
 *    recopie par la porte de derrière, en la rendant invisible.
 */
function premierHabitant<T>(valeurs: readonly T[], nom: string): T {
  const valeur = valeurs[0];
  if (valeur === undefined) {
    throw new Error(
      `core/transport/http — l'énumération « ${nom} » est vide : la sonde de forme du ` +
        "§ 31 ne peut pas construire de ligne témoin, et refuse donc de rendre un verdict.",
    );
  }
  return valeur;
}

/**
 * LA LIGNE TÉMOIN, TOUT ENTIÈRE EN VALEURS RÉSERVÉES SAUF `principal`.
 *
 * ⚠️ **UN TÉMOIN DOIT ISOLER UNE SEULE RÈGLE.** Chaque autre champ porte donc la
 *    valeur que `core/audit/vocabulaire.ts` a déjà réservée pour une ligne dont
 *    l'appel n'est pas identifié — celles-là mêmes qu'une ligne de refus d'étape
 *    1 devra porter. Aucune n'est inventée ici, et les deux énumérations sont
 *    dérivées de leur source.
 *
 * ⚠️ **LE TYPE EST LA GARDE DE COMPLÉTUDE.** `ContenuLigne` est un objet dont
 *    tous les champs sont requis : un champ ajouté au § 12 fait **échouer la
 *    compilation de ce module**, plutôt que de laisser la sonde travailler sur
 *    une ligne à laquelle il manque une colonne — c'est-à-dire sur une ligne que
 *    la vraie garde n'accepterait pas.
 */
function ligneTemoin(principal: string, etape: AppelStep): ContenuLigne {
  return {
    at: new Date(0),
    principal,
    sessionId: SESSION_HORS_APPEL,
    tool: OUTIL_INCONNU,
    toolVersion: VERSION_INCONNUE,
    adapterVersion: VERSION_INCONNUE,
    // ⚠️ CES DEUX-LÀ SE DÉRIVENT, LES DEUX SUIVANTS NON, ET LA DIFFÉRENCE EST
    //    UNE RÈGLE. `effect` et `policyLevel` n'ont AUCUNE valeur juste pour une
    //    ligne dont l'appel n'a jamais été identifié : on prend le premier
    //    habitant de la totalité, en notant que l'ordre des deux tableaux est
    //    SIGNIFIANT (§ 09, § 20) et que le premier y est le moins exposant —
    //    `read`, `brouillon`. `decision` et `outcome`, eux, ont une valeur JUSTE
    //    et une seule ; les dériver rendrait « autorisé » sur une ligne de refus.
    //    Le compilateur tient les deux littéraux : ce sont des unions fermées.
    effect: premierHabitant(EFFECTS, "EFFECTS"),
    policyLevel: premierHabitant(POLICY_LEVELS, "POLICY_LEVELS"),
    decision: "refusé",
    stepDenied: etape,
    argHash: ARG_HASH_NON_LU,
    argHashValidated: ARG_HASH_NON_VALIDE,
    recordIds: [],
    partialSources: [],
    durationMs: 0,
    outcome: "non-exécuté",
    externalEffect: false,
  };
}

/** Le préfixe dont la garde du § 31 fait précéder l'anomalie d'un champ. */
const PREFIXE_DU_CHAMP = "principal";

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que la sonde rend : des NOMBRES et des noms, jamais un booléen nu. */
export interface VerdictDeFormeDuPrincipal {
  /** Combien de champs la garde du § 31 a inspectés. Mesuré par ELLE. */
  readonly champsInspectes: number;
  /** Les anomalies portant sur `principal`. Elles ne citent jamais la valeur. */
  readonly anomaliesSurLePrincipal: readonly string[];
  /**
   * Les anomalies portant sur un AUTRE champ du squelette. Elles doivent être
   * vides : une seule signifie que la sonde ne mesure plus ce qu'elle prétend.
   */
  readonly anomaliesHorsPrincipal: readonly string[];
  /**
   * Le témoin de capacité a-t-il tenu ? `false` = la sonde est cassée, et le
   * verdict est un refus quoi qu'il arrive.
   */
  readonly temoinDeCapaciteSain: boolean;
  readonly admis: boolean;
}

/**
 * Le témoin de capacité : une valeur dont la conformité est déjà mesurée
 * ailleurs. Sans lui, « zéro anomalie » se lirait « ce principal est bon » alors
 * que la lecture juste serait « cette sonde ne trouve plus rien ».
 */
export const TEMOIN_DE_CAPACITE = PRINCIPAL_STDIO;

/**
 * **LE `principal` LU DANS `ops_token` PASSERAIT-IL LA GARDE DU § 31 ?**
 *
 * @param etape le numéro d'étape que porterait la ligne de refus. Il entre dans
 *        le squelette parce que `stepDenied` est un champ couvert : lui donner
 *        une valeur arbitraire ferait mesurer la sonde sur une ligne qui n'est
 *        pas celle qu'on écrirait.
 */
export function verifierLaFormeDuPrincipal(
  principal: string,
  etape: AppelStep,
): VerdictDeFormeDuPrincipal {
  const verdict = verifierAucunContenu(ligneTemoin(principal, etape));
  const surLePrincipal = verdict.anomalies.filter((anomalie) =>
    anomalie.startsWith(`${PREFIXE_DU_CHAMP} :`),
  );
  const horsPrincipal = verdict.anomalies.filter(
    (anomalie) => !anomalie.startsWith(`${PREFIXE_DU_CHAMP} :`),
  );

  // Le témoin apparié, sur la MÊME étape, donc sur le MÊME squelette.
  const capacite = verifierAucunContenu(ligneTemoin(TEMOIN_DE_CAPACITE, etape));
  const temoinSain = capacite.anomalies.length === 0 && capacite.champsInspectes > 0;

  return {
    champsInspectes: verdict.champsInspectes,
    anomaliesSurLePrincipal: surLePrincipal,
    anomaliesHorsPrincipal: horsPrincipal,
    temoinDeCapaciteSain: temoinSain,
    // Fail-closed sur les trois motifs : le principal est fautif, le squelette
    // est cassé, ou la sonde ne sait plus reconnaître une valeur conforme.
    admis: temoinSain && surLePrincipal.length === 0 && horsPrincipal.length === 0,
  };
}

/**
 * `core/chaine/etape-05-scopes.ts` — ÉTAPE 5 : LES SCOPES DU JETON AUTORISENT-ILS
 * L'`effect` ÉPINGLÉ DE L'OUTIL ? (§ 11, § 19.2)
 *
 * ═══ CE QUE CETTE ÉTAPE DÉCIDE, ET CE QU'ELLE NE DÉCIDE PAS ═══
 *
 * § 19.2, la phrase qui gouverne tout ce fichier : **le scope autorise EN
 * PRINCIPE ; la politique et l'état console autorisent EN FAIT.** L'étape 5 est
 * le premier des deux contrôles. Elle ne remplace JAMAIS l'étape 10, et
 * l'étape 10 ne dispense JAMAIS de l'étape 5.
 *
 * Elle répond donc à une seule question, et refuse d'en traiter d'autres :
 * *le porteur de ce jeton a-t-il le droit, en principe, de déclencher un
 * `effect` de cette nature ?* Le niveau de politique, la confirmation présentée,
 * l'état console, la provenance de la session — rien de tout cela n'entre ici.
 *
 * ═══ LE TROU DU § 15 — NOMMÉ AU LOT 1c, BRANCHÉ PAR LA RECETTE ═══
 *
 * `ETAPE_SCOPES.code` valait `null` jusqu'au lot 1c : le § 11 donne à cette
 * étape un **403**, et le § 15 n'énumère AUCUN code JSON-RPC pour un scope
 * insuffisant. Les TROIS refus ci-dessous sortaient donc indiscernables les uns
 * des autres pour le comptage du § 24, et indiscernables d'un refus de
 * politique.
 *
 * Le trou n'a pas été bouché par un code voisin — `policy_denied` mentirait sur
 * la couche (la politique n'a même pas été consultée, elle est à l'étape 10),
 * `unauthenticated` mentirait sur l'issue (le jeton est parfaitement valide, il
 * est seulement trop étroit), `tool_disabled` mentirait deux fois. Il a été
 * NOMMÉ : `ERROR_CODES` porte `scope_insufficient`, `APPEL_STEPS` le donne à
 * l'étape 5, et `ops/codes-hors-tableau.ts` tient l'écart au document — un code
 * ajouté sans motif écrit y rougit le jour même.
 *
 * ⚠️ CE MODULE N'ÉCRIT TOUJOURS AUCUN CODE. Les trois refus passent par
 *    `refuse(ETAPE_SCOPES, …)`, qui LIT `APPEL_STEPS`. Le branchement s'est
 *    donc fait sans qu'une ligne de ce fichier bouge — c'est la propriété que
 *    l'ancrage existe pour tenir, et une garde de `etape-05-scopes.spec.ts`
 *    confronte les 20 verdicts au tableau plutôt qu'à une constante écrite.
 *
 * ⚠️ LE `403` DU § 11 RESTE. Le code JSON-RPC nomme la cause ; il ne remplace
 *    pas le statut, et `statutHttp` n'a pas bougé.
 *
 * ═══ LES QUATRE DÉCISIONS DE CE FICHIER ═══
 *
 *  1. **UNE TABLE, JAMAIS UN `switch` RECOPIÉ.** `SCOPE_EXIGE_PAR_EFFET` est un
 *     `Record<Effect, OpsScope>` ANNOTÉ. L'annotation est ce qui fait la
 *     totalité : ajouter un `Effect` à `EFFECTS` sans lui donner de scope ici
 *     est une **erreur de compilation** (propriété manquante), et déclarer une
 *     clé qui n'est pas un `Effect` en est une autre (propriété excédentaire).
 *     C'est aussi fort qu'un `switch` exhaustif, et ça se lit d'un coup d'œil —
 *     ce qui compte pour une table que le § 19.2 transcrit ligne à ligne.
 *
 *  2. **AUCUNE HIÉRARCHIE ENTRE SCOPES.** Le § 19.2 n'en déclare pas, donc il
 *     n'y en a pas : `ops:send` **ne vaut pas** `ops:read`, ni `ops:draft`.
 *     Inventer l'implication « qui peut le plus peut le moins » élargirait en
 *     silence tout jeton d'envoi à la lecture de tout — et le § 19.2 range
 *     précisément `ops:read` et `ops:draft` sur des lignes SÉPARÉES. Si une
 *     hiérarchie devient souhaitable, elle se déclare dans le CDC, puis ici,
 *     jamais par déduction. Voir README, « Écarts relevés ».
 *
 *  3. **`ops:policy` SUR UN JETON QUI APPELLE UN OUTIL EST UN REFUS SEC.**
 *     § 19.2 : « Desserrage de la politique — **le jeton du connecteur ne le
 *     porte JAMAIS** ». § 20, protection 1 : desserrer n'a *aucun outil MCP*,
 *     c'est une route dédiée du socle. Or l'étape 5 n'existe QUE dans la chaîne
 *     d'appel du § 11, c'est-à-dire sur le chemin d'un `tools/call` — la route
 *     de desserrage ne la traverse pas. Tout jeton qui arrive ici est donc, par
 *     construction, un jeton d'appel ; s'il porte `ops:policy`, l'invariant du
 *     § 19.2 est déjà rompu en amont, et le socle ne sert pas l'appel.
 *
 *     ⚠️ CE CONTRÔLE PASSE **AVANT** CELUI DE SUFFISANCE, ET CE N'EST PAS UN
 *        DÉTAIL D'ORDRE. Un jeton portant `["ops:read", "ops:policy"]` qui
 *        appelle un outil `read` satisfait la suffisance : placé après, le
 *        contrôle ne verrait jamais ce cas — c'est-à-dire exactement le cas
 *        d'un jeton d'appel sur-privilégié qui travaille normalement.
 *
 *     ⚠️ CE QU'IL FAUDRAIT POUR FAIRE MIEUX. Distinguer « jeton de connecteur »
 *        d'un éventuel jeton humain porteur d'`ops:policy` demanderait un champ
 *        de genre dans `ContexteScopes` — donc une modification d'`etapes.ts`,
 *        hors du périmètre de ce lot. Le refus sec est le comportement
 *        FAIL-CLOSED, et il ne casse aucun chemin légitime connu : `ops:admin`
 *        (console) reste porté sans gêne, et `ops.policy.tighten` — resserrer —
 *        est « sans scope particulier » (§ 20). Signalé en écart.
 *
 *  4. **LA CONFIRMATION SYSTÉMATIQUE DE `destructive` EST LUE, PAS REDÉDUITE.**
 *     § 19.2, dernière ligne : `destructive` est « assujetti à `ops:send` **et**
 *     à une confirmation systématique, à tous les niveaux, `libre` compris ».
 *     Les deux moitiés vivent ici : la première dans la table (`destructive` →
 *     `ops:send`), la seconde dans `ScopesEtablis.confirmationSystematique`, que
 *     l'étape 10 consomme. La valeur est prise à `exigeConfirmationSystematique`
 *     de `core/policy/effet.ts`, qui la porte déjà avec sa garde de totalité :
 *     la recopier ici ferait DEUX dérivations d'un même fait, et le socle a
 *     déjà payé ce défaut ailleurs.
 *
 * ═══ § 27 — POURQUOI CE PALIER-CI EST LE SEUL RÉEL, CHEZ ZOHO ═══
 *
 * Le § 27 tire une conséquence que le § 19.2 renvoie explicitement : **pour
 * Zoho, le scope ne sépare pas `write-draft` de `send`.** Enregistrer un
 * brouillon et envoyer passent par le MÊME endpoint (`POST …/messages`, à un
 * `mode` près) et exigent tous deux le même scope OAuth amont
 * (`…messages.ALL` ou `.CREATE`). Chez le fournisseur, il n'y a donc rien à
 * franchir entre les deux.
 *
 * Deux conséquences, et elles vont dans des directions opposées :
 *
 *  · **Le double contrôle n'a qu'un seul étage réel** sur cette famille
 *    d'outils. La séparation brouillon/envoi est portée par LA POLITIQUE SEULE
 *    (étape 10), qui doit être fail-closed sur ce point précis. Une lecture
 *    rassurante de l'étape 5 — « le scope garde déjà l'envoi » — serait fausse
 *    *chez le fournisseur*.
 *
 *  · **Raison de plus pour que `ops:draft` et `ops:send` restent disjoints
 *    ICI.** C'est le seul endroit où la distinction existe encore. Lui ajouter
 *    une hiérarchie (décision 2 ci-dessus) supprimerait le dernier palier de
 *    scope et laisserait la politique porter les deux étages à elle seule.
 */

import { EFFECTS, OPS_SCOPES } from "../types.js";
import type { Effect, OpsScope } from "../types.js";
import { exigeConfirmationSystematique } from "../policy/index.js";
import { ETAPE_SCOPES, autorise, refuse } from "./etapes.js";
import type {
  ContexteScopes,
  CorrespondanceScopes,
  EtapeScopes,
  ScopesEtablis,
  VerdictEtape,
} from "./etapes.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA TABLE DU § 19.2 — `effect` → SCOPE EXIGÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA correspondance `effect` → scope exigé. Une seule table, et tout le reste
 * du fichier en dérive.
 *
 * Transcription ligne à ligne du tableau du § 19.2 :
 *   · `ops:read`  — « Outils `read` »                → `read`
 *   · `ops:draft` — « Écritures réversibles »        → `write-draft`
 *   · `ops:send`  — « Effets extérieurs »            → `send`, et `destructive`
 *
 * `destructive` partage `ops:send` parce que le § 19.2 le dit MOT POUR MOT :
 * « assujetti à `ops:send` et à une confirmation systématique ». Ce n'est donc
 * pas un scope propre — la contradiction du § 19.2, qui range `destructive`
 * dans le tableau DES SCOPES alors que le § 09 énumère `ctx.scopes` en cinq
 * valeurs sans lui, a été tranchée dans `core/types.ts` : `destructive` est un
 * `Effect`. Sa seconde moitié — la confirmation — voyage dans
 * `ScopesEtablis.confirmationSystematique`.
 *
 * ⚠️ LES DEUX SCOPES ABSENTS DES VALEURS SONT ABSENTS À DESSEIN.
 *    `ops:admin` autorise « console, bascule d'outils, lecture du journal » et
 *    `ops:policy` « le desserrage de la politique » : ni l'un ni l'autre n'est
 *    l'`effect` d'un outil de la chaîne d'appel. Un `effect` qui exigerait l'un
 *    des deux ferait passer une bascule de console ou un desserrage pour un
 *    appel d'outil ordinaire ; `etape05Scopes` refuse ce cas explicitement,
 *    plutôt que de le laisser dépendre de la vigilance de l'auteur d'une future
 *    ligne.
 *
 * ⚠️ POURQUOI UNE TABLE ANNOTÉE ET NON UN `switch`. L'annotation
 *    `Record<Effect, OpsScope>` est une TOTALITÉ vérifiée par le compilateur,
 *    exactement comme un `switch` exhaustif : un `Effect` ajouté sans scope
 *    déclaré ici ne compile pas, et une clé qui n'est pas un `Effect` non plus.
 *    Une table se relit en face du § 19.2 ; un `switch` de quatre `case` qui
 *    rendent chacun une constante est la même table, écrite plus long.
 */
export const SCOPE_EXIGE_PAR_EFFET: Readonly<Record<Effect, OpsScope>> = {
  read: "ops:read",
  "write-draft": "ops:draft",
  send: "ops:send",
  destructive: "ops:send",
};

/**
 * Ce que le jeton de la CHAÎNE D'APPEL peut porter (§ 19.2).
 *
 * Seconde table, totale sur `OPS_SCOPES` par la même annotation : un scope
 * ajouté au socle sans être classé ici ne compile pas. Sans elle, la règle
 * « le jeton du connecteur ne porte JAMAIS `ops:policy` » serait un littéral
 * `"ops:policy"` égaré dans une condition, et le sixième scope arriverait un
 * jour sans que personne ne se demande de quel côté le ranger.
 *
 * `ops:admin` est à `true` : le § 19.2 lui donne « console, bascule d'outils,
 * lecture du journal », et le § 20 note que l'arrêt d'urgence — un
 * RESSERREMENT — en sort. Rien n'interdit à un jeton d'appel de le porter, et
 * le lui interdire couperait la console de la chaîne d'appel.
 */
export const PORTE_PAR_LE_JETON_DAPPEL: Readonly<Record<OpsScope, boolean>> = {
  "ops:read": true,
  "ops:draft": true,
  "ops:send": true,
  "ops:admin": true,
  // § 19.2 — « le jeton du connecteur ne le porte JAMAIS ». § 20, protection 1 —
  // desserrer n'a AUCUN outil MCP : une route dédiée, second facteur, TTL.
  "ops:policy": false,
};

/**
 * Les scopes qu'un jeton parvenu à l'étape 5 ne devrait jamais porter.
 * DÉRIVÉ des deux constantes ci-dessus — aucune liste écrite.
 */
export const SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL: readonly OpsScope[] = OPS_SCOPES.filter(
  (scope) => !PORTE_PAR_LE_JETON_DAPPEL[scope],
);

/**
 * La correspondance canonique du socle, DÉRIVÉE de la table unique.
 *
 * C'est elle que l'orchestrateur injecte dans `ContexteScopes.correspondance`.
 * Le port reste un port : un adaptateur d'épreuve peut en fournir une autre,
 * et les gardes s'en servent pour prouver que l'étape LIT la correspondance au
 * lieu de la figer dans son corps.
 */
export const correspondanceCanonique: CorrespondanceScopes = (effet: Effect): OpsScope =>
  SCOPE_EXIGE_PAR_EFFET[effet];

/**
 * Les `effect` que ce scope autorise. DÉRIVÉ de la table, jamais listé.
 *
 * Sert aux gardes et aux messages d'exploitation : il n'existe aucune seconde
 * table `scope` → `effects` à tenir en accord avec la première.
 */
export function effetsCouvertsPar(scope: OpsScope): readonly Effect[] {
  return EFFECTS.filter((effet) => SCOPE_EXIGE_PAR_EFFET[effet] === scope);
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce scope fait-il partie des cinq du § 19.2 ? Le port peut mentir. */
function estUnScopeDuSocle(valeur: string): boolean {
  return (OPS_SCOPES as readonly string[]).includes(valeur);
}

/**
 * ÉTAPE 5 — les scopes du jeton couvrent-ils l'`effect` ÉPINGLÉ de l'outil ?
 *
 * ⚠️ `effectEpingle` VIENT D'`ops_tool`, JAMAIS DE L'APPELANT (§ 20,
 *    épinglage). C'est l'étape 6 qui a relu la définition, et c'est pour cela
 *    que l'étape 6 vient d'abord dans le § 11. Un `effect` reçu de l'appelant
 *    ferait de l'étape 5 une formalité : il suffirait d'annoncer `read` pour
 *    envoyer un courrier.
 *
 * ⚠️ AUCUN MESSAGE DE REFUS N'ÉNUMÈRE LES SCOPES PORTÉS PAR LE JETON. Ce que
 *    porte un jeton est une information sur son porteur, et un refus qui la
 *    récite transforme la chaîne d'appel en oracle d'énumération de privilèges.
 *    Le message nomme le scope MANQUANT — ce qu'il faut demander — et rien
 *    d'autre. Une garde du `.spec.ts` le mesure, avec un témoin qui rougit.
 *
 * Trois refus, tous en `ETAPE_SCOPES.code` — c'est-à-dire `scope_insufficient`
 * depuis la Recette du lot 1c, sous le 403 du § 11 :
 *
 *  · le jeton porte un scope que le jeton d'appel ne porte jamais (§ 19.2) ;
 *  · la correspondance exige un scope hors du § 19.2, ou un scope qu'un jeton
 *    d'appel ne porte jamais — FAIL-CLOSED, jamais « on laisse passer » ;
 *  · le jeton ne porte pas le scope exigé.
 */
export const etape05Scopes: EtapeScopes = (
  contexte: ContexteScopes,
): VerdictEtape<ScopesEtablis> => {
  const { scopes, effectEpingle, outil, correspondance } = contexte;

  // ── (a) Le jeton porte-t-il un scope qu'un jeton d'appel ne porte JAMAIS ? ──
  //
  // AVANT la suffisance, et l'ordre est la garde : un jeton portant
  // `["ops:read", "ops:policy"]` qui appelle un outil `read` passerait la
  // suffisance sans un mot. C'est le cas qui compte — un jeton d'appel
  // sur-privilégié qui travaille normalement, donc invisible.
  const interdits = SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL.filter((scope) =>
    scopes.includes(scope),
  );
  if (interdits.length > 0) {
    return refuse(
      ETAPE_SCOPES,
      `Le jeton présenté porte « ${interdits.join(" », « ")} » : le jeton qui appelle un ` +
        `outil ne porte JAMAIS ce scope (§ 19.2). L'appel de « ${outil} » est refusé sans ` +
        "que son effect soit même examiné. Faites réémettre un jeton d'appel dépourvu de ce " +
        "scope ; le desserrage de la politique passe par la route dédiée du socle, avec " +
        "second facteur et durée, jamais par un appel d'outil.",
    );
  }

  // ── (b) Le scope exigé, LU dans la correspondance ────────────────────────
  const scopeExige = correspondance(effectEpingle);

  if (!estUnScopeDuSocle(scopeExige)) {
    // Le port a rendu autre chose qu'un scope du § 19.2. On refuse : accepter
    // reviendrait à laisser un adaptateur d'épreuve — ou une régression —
    // désarmer l'étape 5 en rendant une valeur qu'aucun jeton ne porte, ou pire,
    // que tout jeton porterait.
    return refuse(
      ETAPE_SCOPES,
      `La correspondance des scopes exige « ${scopeExige} » pour l'effect « ${effectEpingle} » ` +
        `de l'outil « ${outil} », qui n'est pas un scope du § 19.2 (${OPS_SCOPES.join(", ")}). ` +
        "Le socle refuse plutôt que de deviner. Corrigez la correspondance injectée.",
    );
  }

  if (!PORTE_PAR_LE_JETON_DAPPEL[scopeExige]) {
    // Un `effect` d'outil qui exigerait `ops:policy` serait soit inatteignable
    // — aucun jeton d'appel ne le porte —, soit franchissable par le seul jeton
    // qui n'aurait jamais dû exister. Les deux issues sont mauvaises ; on le dit.
    return refuse(
      ETAPE_SCOPES,
      `L'effect « ${effectEpingle} » de l'outil « ${outil} » exigerait « ${scopeExige} », ` +
        "un scope qu'un jeton d'appel ne porte jamais (§ 19.2). Aucun appel d'outil ne peut " +
        "en dépendre : ce qui relève de ce scope passe par une route dédiée du socle. " +
        "Corrigez la table des scopes exigés.",
    );
  }

  // ── (c) Le jeton porte-t-il le scope exigé ? ─────────────────────────────
  if (!scopes.includes(scopeExige)) {
    return refuse(
      ETAPE_SCOPES,
      `L'outil « ${outil} » porte l'effect « ${effectEpingle} », qui exige le scope ` +
        `« ${scopeExige} » (§ 19.2). Le jeton présenté ne le porte pas. Demandez un jeton ` +
        `couvrant « ${scopeExige} » ; le scope autorise en principe, la politique et l'état ` +
        "console autorisent en fait — les deux contrôles restent à franchir.",
    );
  }

  return autorise(ETAPE_SCOPES, {
    scopeExige,
    // LU dans `core/policy/effet.ts`, jamais redéduit : deux dérivations d'un
    // même fait finissent par se contredire (§ 19.2, ligne `destructive`).
    confirmationSystematique: exigeConfirmationSystematique(effectEpingle),
  });
};

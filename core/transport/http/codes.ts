/**
 * `core/transport/http/codes.ts` — **LE CODE DU § 15 QUE REND UN REFUS AMONT.**
 *
 * ═══ POURQUOI CE MODULE EST SÉPARÉ DE `amont.ts` ═══
 *
 * Pas par goût du découpage : parce que **le registre des coutures ne compte
 * jamais un définisseur comme son propre appelant**. Écrite dans `amont.ts` et
 * appelée par le `refuser()` local du même fichier, cette fonction annonçait
 * « 0 appelant de production » alors qu'elle décidait de tous les codes de
 * refus amont — une décision de l'ADR 0030 branchée, mais indistinguable d'une
 * décision débranchée. Le registre ne pouvait alors dire ni l'un ni l'autre.
 *
 * ⚠️ **C'EST UNE PROPRIÉTÉ DE LA GARDE, PAS UNE COQUETTERIE.** L'état `cousue`
 *    n'a de sens que si la couture est MESURABLE, et elle ne l'est qu'entre
 *    modules. Un module par décision est donc la forme qui rend la mesure
 *    possible ; l'alternative aurait été de déclarer l'entrée `à-coudre`,
 *    c'est-à-dire d'écrire au registre que personne n'appelle une fonction que
 *    la chaîne appelle à chaque refus.
 */

import { APPEL_STEPS } from "../../types.js";
import type { AppelStepKey, ErrorCode } from "../../types.js";

/**
 * LE CODE DU § 15 QUE REND CHAQUE ÉTAPE AMONT — **ADR 0030 APPLIQUÉE À L'ENVERS
 * DE SON CAS D'ORIGINE.**
 *
 * L'ADR 0030 dit : « l'ancrage porte le code par DÉFAUT ; une étape qui connaît
 * sa cause rend le code de la cause ». Les quatre étapes amont sont le cas
 * limite de cette règle : leur ancrage porte `refus: null`, parce que le § 11
 * les fait refuser « au niveau HTTP » et que le tableau du § 15 ne leur donne
 * pas de nom. Le défaut est donc VIDE, et c'est l'étape qui doit parler.
 *
 * ⚠️ **`unauthenticated` N'EST PAS UN CHOIX, C'EST LA LIGNE DU § 15 LUE MOT À
 *    MOT** : « Jeton absent, expiré, révoqué, **mauvaise audience** ». Les
 *    étapes 2, 3 et 4 sont exactement les quatre cas de cette ligne.
 *
 * 🔴 **ÉCART SIGNALÉ, ET IL EST RÉEL : L'ÉTAPE 1 N'A AUCUN CODE.** Le § 15
 *    n'énumère rien pour « Host non autorisé », et le § 11 lui donne un `403`
 *    sans code JSON-RPC. Trois issues étaient possibles ; celle-ci est la seule
 *    qui ne décide pas à la place de quelqu'un d'autre :
 *
 *     1. rendre `unauthenticated` — mentirait : l'appelant peut être
 *        parfaitement authentifié, et se ré-authentifier ne changera rien ;
 *     2. nommer un code manquant, comme l'ont fait `vault_locked` (ADR 0005) et
 *        `scope_insufficient` — c'est un écart au tableau du § 15, et
 *        `ops/codes-hors-tableau.ts` en est le propriétaire déclaré. Il n'est
 *        pas dans le périmètre de ce lot ;
 *     3. rendre `null`, servir le `403` du § 11, et signaler l'écart.
 *
 *    C'est 3. La conséquence est écrite : la réponse d'un refus d'étape 1 ne
 *    porte **aucun** code du § 15, seulement le statut. Un client qui trie sur
 *    le code ne verra pas ce refus-là.
 */
const CODE_DES_ETAPES_AMONT = {
  host: null,
  jeton: "unauthenticated",
  audience: "unauthenticated",
  revocation: "unauthenticated",
} as const satisfies Partial<Record<AppelStepKey, ErrorCode | null>>;

/** La clé d'une des quatre étapes « HTTP seul ». DÉRIVÉE de la table ci-dessus. */
export type CleDEtapeAmont = keyof typeof CODE_DES_ETAPES_AMONT;

/**
 * LE CODE D'UN REFUS AMONT — **l'ancrage garde la priorité**.
 *
 * Si `APPEL_STEPS` finit par donner un code à l'une de ces quatre étapes, c'est
 * LUI qui fait foi, et la table ci-dessus devient morte sans qu'une ligne soit à
 * retoucher. L'inverse — la table écrasant l'ancrage — serait exactement le
 * défaut que l'ADR 0030 a corrigé à l'étape 13, refait à l'envers.
 */
export function codeDuRefusAmont(cle: CleDEtapeAmont): ErrorCode | null {
  const ancrage = APPEL_STEPS.find((etape) => etape.cle === cle);
  if (ancrage !== undefined && ancrage.refus !== null) return ancrage.refus;
  return CODE_DES_ETAPES_AMONT[cle];
}

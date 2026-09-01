/**
 * `core/transport/valeurs-servies.ts` — **CE QU'UNE TERMINAISON SERVIE REMET AU
 * CLIENT, DÉRIVÉ UNE FOIS POUR LES DEUX TRANSPORTS. ADR 0037, § 4.**
 *
 * ═══ LE DÉFAUT MESURÉ QUE CE MODULE EXISTE POUR FERMER ═══
 *
 * Chaque transport dérivait de son côté « qu'est-ce qu'un appel servi rend au
 * client ». Les deux dérivations se sont contredites, et la contradiction a été
 * MESURÉE — même noyau doublé présenté aux deux fils, terminaison
 * `{ genre: "rejeu", resultRef: … }` :
 *
 *  · HTTP  → `genre` absent · `resultRef` absent · `structuredContent` nul ;
 *  · stdio → `genre: "rejeu"` · `resultRef: "…"` · `content: []`.
 *
 * Un client HTTP ne pouvait donc pas distinguer « ton appel a été REJOUÉ, voici
 * la référence du résultat d'origine » de « ton appel a été exécuté et n'a rien
 * rendu », alors que le § 13 fait du `resultRef` le SEUL pointeur vers le
 * résultat d'origine. Et stdio écrit lui-même pourquoi c'est grave : « loger un
 * rejeu comme une exécution ferait croire à un appel servi ».
 *
 * ⚠️ **UNE SEULE DÉRIVATION, DEUX EMBALLAGES.** Ce module ne connaît ni JSON-RPC,
 *    ni `_meta`, ni `content[]` : il rend les trois valeurs, et chaque transport
 *    les emballe dans SON enveloppe. Deux écritures de la même question
 *    finiraient par se contredire — c'est exactement ce qu'on vient de mesurer.
 *
 * ⚠️ **LE `switch` EST EXHAUSTIF, ET C'EST LA SEULE PARTIE DE CETTE DÉCISION QUI
 *    SE TIENT TOUTE SEULE APRÈS NOTRE DÉPART.** Le code d'origine était un test
 *    d'ÉGALITÉ (`genre === "exécuté" ? … : null`) : la seconde branche de
 *    l'union tombait en silence dans `null`, et une troisième branche ajoutée un
 *    jour y serait tombée pareil, sans un mot. Ici, la garde d'exhaustivité
 *    ({@link ErreurTerminaisonInconnue}) est adossée au type `never` : une
 *    branche neuve fait rougir le COMPILATEUR, avant tout test.
 */

import type { ChargeServie } from "../chaine/orchestrateur.js";
import type { ValeursServiesAuClient } from "./contrat.js";

/**
 * Levée si une terminaison servie sort de l'union connue.
 *
 * ⚠️ **CE CHEMIN EST INATTEIGNABLE PAR LE TYPE, ET IL EXISTE QUAND MÊME.** Le
 *    `never` ci-dessous fait rougir la compilation le jour où `ChargeServie`
 *    gagne une branche ; cette levée-ci couvre le cas où une valeur arrive
 *    depuis du JavaScript non typé — un adaptateur tiers, un test mal fabriqué.
 *    Rendre alors `null` en silence rejouerait le défaut qu'on ferme.
 */
export class ErreurTerminaisonInconnue extends Error {
  public constructor(genre: string) {
    super(
      `core/transport — terminaison servie de genre « ${genre} » inconnue : le socle ne sait ` +
        "pas ce qu'elle remet au client, et il ne l'invente pas (§ 13, ADR 0037).",
    );
    this.name = "ErreurTerminaisonInconnue";
  }
}

/**
 * DÉRIVE LES VALEURS SERVIES. La seule fonction du dépôt qui réponde à
 * « qu'est-ce qu'un appel servi rend au client ? ».
 *
 * @param charge la terminaison de succès rendue par l'orchestrateur.
 */
export function valeursServiesAuClient(charge: ChargeServie): ValeursServiesAuClient {
  switch (charge.genre) {
    case "exécuté":
      return {
        genre: "exécuté",
        // § 13 — le `resultRef` ne pointe QUE vers un résultat d'origine. Une
        // exécution est l'origine : elle n'en a pas.
        resultRef: null,
        charge: charge.execution.charge,
      };
    case "rejeu":
      return {
        genre: "rejeu",
        resultRef: charge.resultRef,
        // Un rejeu ne rend pas la charge une seconde fois : il rend la
        // RÉFÉRENCE. La servir à nouveau ferait croire à une seconde exécution.
        charge: null,
      };
    default: {
      const jamais: never = charge;
      throw new ErreurTerminaisonInconnue(String((jamais as { genre?: unknown }).genre));
    }
  }
}

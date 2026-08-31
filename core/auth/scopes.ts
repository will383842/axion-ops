/**
 * `core/auth/scopes.ts` — **`ops:policy` EST REFUSÉ À L'OCTROI, PAS À L'ÉTAPE 5.**
 *
 * ═══ LA DISTINCTION QUI PORTE TOUTE LA DÉCISION ═══
 *
 * Le § 19.2 : « le jeton du connecteur ne porte **jamais** `ops:policy` ».
 * L'étape 5 le sait déjà, et elle refuse — mais elle refuse un **APPEL**.
 * L'émetteur, lui, refuse que le jeton **EXISTE**.
 *
 * Un jeton portant `ops:policy` qu'aucun appel n'atteindrait resterait une
 * **capacité en circulation**, révocable seulement si quelqu'un s'avise de la
 * révoquer. Le jour où une seconde porte s'ouvre — une route de console, un
 * outil d'administration, un lot qui n'existe pas encore —, la capacité est déjà
 * là, émise, valide trente jours, et personne n'a de raison de la chercher.
 *
 * ═══ L'ENSEMBLE ÉMISSIBLE SE DÉRIVE, IL NE S'ÉCRIT PAS ═══
 *
 * ⚠️ **DÉRIVÉ DE `PORTE_PAR_LE_JETON_DAPPEL`, JAMAIS D'UNE SECONDE LISTE.**
 *    C'est la même totalité qui produit déjà `SCOPES_PAR_DEFAUT_STDIO`
 *    (`core/chaine/orchestrateur.ts`) : basculer un scope dans cette table change
 *    les deux du même geste. Une liste écrite ici serait la seconde source de
 *    vérité, et c'est la seconde qui ne suit jamais — le sixième scope arriverait
 *    un jour sans que personne ne se demande de quel côté le ranger.
 *
 * ═══ POURQUOI L'OCTROI ENTIER EST REFUSÉ, ET NON RÉDUIT ═══
 *
 * OAuth permet d'accorder MOINS que ce qui est demandé, et c'est la réponse
 * qu'on écrit sans y penser. Elle est mauvaise ici : réduire en silence rend un
 * jeton qui « marche » à un client qui a demandé le desserrage de la politique,
 * et le seul endroit où l'écart se verrait est un journal que personne ne lit
 * avant l'incident. **Un client qui demande `ops:policy` demande une capacité que
 * le socle n'émet pas ; il doit l'apprendre à l'octroi, pas à l'usage.**
 *
 * Le desserrage passe par la session de console et sa route dédiée, avec second
 * facteur TOTP et TTL — l'asymétrie du § 20 devient mécanique.
 */

import { OPS_SCOPES } from "../types.js";
import type { OpsScope } from "../types.js";
import { PORTE_PAR_LE_JETON_DAPPEL } from "../chaine/etape-05-scopes.js";
import type { VerdictDeScopes } from "./contrat.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENSEMBLE ÉMISSIBLE, DÉRIVÉ
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les scopes qu'un jeton de connecteur peut porter. **Une dérivation, pas une
 * liste.**
 *
 * ⚠️ Elle est l'exact complément de `SCOPES_JAMAIS_PORTES_PAR_LE_JETON_DAPPEL`
 *    (`core/chaine/etape-05-scopes.ts`), et `core/auth/scopes.spec.ts` mesure que
 *    les deux ensembles PARTITIONNENT `OPS_SCOPES` — ni recouvrement, ni trou.
 *    Sans cette mesure, un scope pourrait disparaître des deux à la fois : il ne
 *    serait ni émissible ni refusé, c'est-à-dire refusé sans motif écrit.
 */
export const SCOPES_EMISSIBLES: readonly OpsScope[] = OPS_SCOPES.filter(
  (scope) => PORTE_PAR_LE_JETON_DAPPEL[scope],
);

/** Ce scope peut-il figurer dans un jeton émis ? Lecture de la table, pas d'une liste. */
export function estEmissible(scope: OpsScope): boolean {
  return PORTE_PAR_LE_JETON_DAPPEL[scope];
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que rend la confrontation d'une demande de scopes.
 *
 * ⚠️ **ÉTEND `VerdictDeScopes` PLUTÔT QUE DE LE REMPLACER.** Le contrat de
 *    l'architecte type `accordes` et `refuses` sur `OpsScope` — donc sur les cinq
 *    valeurs du socle. Or une demande arrive du RÉSEAU : elle peut nommer
 *    n'importe quoi. Ces valeurs-là n'ont pas d'endroit où se ranger dans le
 *    contrat, et les taire les rendrait invisibles ; {@link inconnus} les compte
 *    et les nomme, sans élargir le type qui garde les cinq.
 */
export interface VerdictDeScopesDemandes extends VerdictDeScopes {
  /**
   * Les chaînes demandées qui ne sont AUCUN des cinq scopes du § 19.2.
   *
   * ⚠️ Elles font refuser l'octroi comme les autres. Un scope inconnu n'est pas
   *    « rien » : c'est soit une faute de frappe qui donnerait à un client moins
   *    de droits qu'il ne croit, soit un client qui parle d'un autre serveur.
   *    Les deux méritent une erreur, pas un silence.
   */
  readonly inconnus: readonly string[];
}

/**
 * CONFRONTE UNE DEMANDE DE SCOPES À CE QUE L'ÉMETTEUR ACCEPTE D'ÉCRIRE.
 *
 * ⚠️ **ELLE NE S'ARRÊTE PAS À LA PREMIÈRE ANOMALIE**, pour la même raison que la
 *    forme de l'audience : `scopesConfrontes` doit valoir « combien de scopes
 *    demandés », et non « combien avant l'échec ». Un compte qui dépend du
 *    résultat ne peut pas servir de plancher.
 */
export function verdictDeScopesDemandes(demandes: readonly string[]): VerdictDeScopesDemandes {
  const connus = new Set<string>(OPS_SCOPES);
  const accordes: OpsScope[] = [];
  const refuses: Array<{ readonly scope: OpsScope; readonly motif: string }> = [];
  const inconnus: string[] = [];
  let scopesConfrontes = 0;

  for (const demande of demandes) {
    scopesConfrontes += 1;

    if (!connus.has(demande)) {
      inconnus.push(demande);
      continue;
    }

    const scope = demande as OpsScope;
    if (estEmissible(scope)) {
      accordes.push(scope);
      continue;
    }

    refuses.push({
      scope,
      motif:
        `§ 19.2 — « ${scope} » n'est JAMAIS porté par un jeton de connecteur, et le refus est ` +
        "prononcé À L'ÉMISSION : l'étape 5 refuserait un appel, l'émetteur refuse que le jeton " +
        "existe. Un jeton portant cette capacité resterait en circulation, révocable seulement " +
        "si quelqu'un s'avisait de la révoquer. Le desserrage de la politique passe par la " +
        "console, avec second facteur et durée (§ 20).",
    });
  }

  return { scopesConfrontes, accordes, refuses, inconnus };
}

/** L'octroi demande une capacité que l'émetteur n'écrit pas. */
export class ErreurScopeNonEmissible extends Error {
  public readonly refuses: readonly OpsScope[];
  public readonly inconnus: readonly string[];

  public constructor(verdict: VerdictDeScopesDemandes) {
    const motifs = verdict.refuses.map((refus) => refus.motif);
    if (verdict.inconnus.length > 0) {
      motifs.push(
        `${String(verdict.inconnus.length)} scope(s) inconnu(s) du socle : ` +
          `${verdict.inconnus.join(", ")} — les cinq valeurs admises sont ${OPS_SCOPES.join(", ")}.`,
      );
    }
    super(
      "Octroi refusé : la demande porte des scopes que l'émetteur n'écrit pas. " +
        `${String(verdict.scopesConfrontes)} scope(s) confronté(s). ${motifs.join(" · ")} ` +
        "Redemander un jeton en ne réclamant que les scopes nécessaires — l'octroi n'est PAS " +
        "réduit en silence, pour qu'un client apprenne ici ce qu'il n'obtiendra pas.",
    );
    this.name = "ErreurScopeNonEmissible";
    this.refuses = verdict.refuses.map((refus) => refus.scope);
    this.inconnus = verdict.inconnus;
  }
}

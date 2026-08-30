/**
 * core/policy/niveau.ts — LA POLITIQUE SE CALCULE, ELLE NE SE LIT PAS.
 *
 * § 12, règle 1, mot pour mot : « Le niveau appliqué est le PLUS STRICT parmi
 * les lignes non expirées dont le `scope` couvre l'outil appelé. Sans cette
 * règle, l'asymétrie "resserrer libre / desserrer jamais" est INDÉCIDABLE dès
 * que deux scopes se recouvrent. Le TTL est évalué PARESSEUSEMENT à l'appel
 * (étape 10), et l'écran dérive du même calcul — jamais du champ brut. »
 *
 * Trois conséquences que ce fichier tient :
 *
 *  1. AUCUNE règle du plus spécifique. Un `libre` sur `zoho.mail.send` ne bat
 *     pas un `brouillon` sur `*`. C'est ce qui rend l'asymétrie décidable.
 *  2. Le TTL n'entre dans le calcul QU'ICI, à l'appel. Aucune tâche de fond.
 *  3. FAIL-CLOSED : politique illisible, corrompue, ou aucune ligne → le niveau
 *     le plus strict. Jamais le dernier niveau connu.
 */

import { lePlusStrict, POLICY_LEVELS, type PolicyLevel } from "../types.js";
import {
  anomaliesSemantiques,
  anomaliesStructurelles,
  ligneEnVigueur,
  type AnomalieLigne,
  type LignePolitique,
} from "./ligne.js";
import { scopeCouvre, scopeDomine, type ReferenceOutil } from "./scope.js";

/** Le niveau de repli, DÉRIVÉ de la tête de `POLICY_LEVELS`. */
export const NIVEAU_DE_REPLI: PolicyLevel = POLICY_LEVELS[0];

/**
 * Pourquoi le niveau vaut ce qu'il vaut. L'écran de politique affiche cette
 * raison : « brouillon » sans elle ne distingue pas une politique saine d'une
 * politique corrompue.
 */
export const RAISONS_NIVEAU = [
  /** Aucune ligne en vigueur ne couvre cet outil → repli fail-closed. */
  "aucune-ligne-couvrante",
  /** Au moins une ligne couvre : le plus strict d'entre elles s'applique. */
  "lignes-couvrantes",
  /** Une ligne en vigueur est illisible → repli fail-closed, et on le DIT. */
  "politique-illisible",
] as const;

export type RaisonNiveau = (typeof RAISONS_NIVEAU)[number];

/**
 * Le résultat du calcul — et il ANNONCE COMBIEN DE LIGNES IL A MESURÉES.
 *
 * Une politique calculée sur zéro ligne examinée rendrait « brouillon », donc
 * un vert parfaitement rassurant, alors que le dépôt n'aurait rien renvoyé.
 * `mesures` est ce qui distingue les deux, à l'écran comme au journal.
 */
export interface NiveauApplique {
  readonly niveau: PolicyLevel;
  readonly raison: RaisonNiveau;
  /** Nombre de lignes EXAMINÉES (toutes, y compris expirées et remplacées). */
  readonly mesures: number;
  /** Nombre de lignes encore EN VIGUEUR à l'instant du calcul. */
  readonly enVigueur: number;
  /** Identifiants des lignes en vigueur qui COUVRENT l'outil. */
  readonly retenues: readonly string[];
  /** Vide quand la politique est lisible. */
  readonly anomalies: readonly AnomalieLigne[];
}

/**
 * Le niveau appliqué à cet outil, à cet instant.
 *
 * ⚠️ UNE LIGNE ILLISIBLE N'EST PAS ÉCARTÉE, ELLE FAIT REPLIER LE CALCUL ENTIER.
 *    Écarter une ligne corrompue reviendrait, si elle portait `brouillon`, à
 *    RETIRER un plancher : la corruption élargirait la surface au lieu de la
 *    fermer. C'est exactement l'inverse du fail-closed du § 20.
 */
export function niveauApplique(
  lignes: readonly LignePolitique[],
  reference: ReferenceOutil,
  maintenant: Date,
): NiveauApplique {
  const anomalies: AnomalieLigne[] = [];

  // 1 · Structure d'abord : on ne peut pas savoir qu'une ligne est expirée sans
  //     avoir pu lire sa date d'expiration.
  for (const ligne of lignes) {
    anomalies.push(...anomaliesStructurelles(ligne));
  }
  if (anomalies.length > 0) {
    return {
      niveau: NIVEAU_DE_REPLI,
      raison: "politique-illisible",
      mesures: lignes.length,
      enVigueur: 0,
      retenues: [],
      anomalies,
    };
  }

  // 2 · TTL évalué PARESSEUSEMENT, ici et nulle part ailleurs.
  const vivantes = lignes.filter((ligne) => ligneEnVigueur(ligne, maintenant));

  // 3 · Sémantique, sur les seules lignes en vigueur : une ligne historique mal
  //     formée ne doit pas condamner la politique pour toujours.
  for (const ligne of vivantes) {
    anomalies.push(...anomaliesSemantiques(ligne));
  }
  if (anomalies.length > 0) {
    return {
      niveau: NIVEAU_DE_REPLI,
      raison: "politique-illisible",
      mesures: lignes.length,
      enVigueur: vivantes.length,
      retenues: [],
      anomalies,
    };
  }

  // 4 · Couverture, puis « le plus strict gagne ». Aucune spécificité.
  const couvrantes = vivantes.filter((ligne) => scopeCouvre(ligne.scope, reference));
  if (couvrantes.length === 0) {
    return {
      niveau: NIVEAU_DE_REPLI,
      raison: "aucune-ligne-couvrante",
      mesures: lignes.length,
      enVigueur: vivantes.length,
      retenues: [],
      anomalies: [],
    };
  }

  const niveau = couvrantes.reduce<PolicyLevel>(
    (acquis, ligne) => lePlusStrict(acquis, ligne.level),
    // On part de la première ligne couvrante, pas d'une constante : partir de
    // `libre` marcherait aussi, mais lierait le calcul à un nom de niveau.
    couvrantes[0]?.level ?? NIVEAU_DE_REPLI,
  );

  return {
    niveau,
    raison: "lignes-couvrantes",
    mesures: lignes.length,
    enVigueur: vivantes.length,
    retenues: couvrantes.map((ligne) => ligne.id),
    anomalies: [],
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le plancher d'un SCOPE — ce que voit un changement de politique
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le niveau que subiront TOUS les outils couverts par ce scope, quoi qu'on
 * pose dessus : le plus strict parmi les lignes en vigueur qui DOMINENT ce
 * scope.
 *
 * Pourquoi il faut ce calcul-là et pas `niveauApplique` : poser une ligne sur
 * `zoho.mail.send` alors qu'un `brouillon` sur `*` est en vigueur ne change
 * RIEN — le plus strict gagne. Sans `plancherDuScope`, `desserrer()` écrirait
 * une ligne sans effet, et l'écran la montrerait comme courante. C'est le
 * défaut même que `supersededAt` a été ajouté pour empêcher.
 */
export interface PlancherScope {
  readonly niveau: PolicyLevel;
  /** Lignes en vigueur qui dominent ce scope, plus strictes ou égales. */
  readonly dominantes: readonly LignePolitique[];
  readonly mesures: number;
  readonly enVigueur: number;
  /** Vide quand la politique est lisible. Voir le fail-closed ci-dessous. */
  readonly anomalies: readonly AnomalieLigne[];
}

/**
 * ⚠️ MÊME FAIL-CLOSED QUE `niveauApplique`, ET POUR LA MÊME RAISON.
 *
 * Ce calcul et `niveauApplique` dérivent LE MÊME FAIT — « à quel niveau ce
 * périmètre est-il tenu ? ». Tant que `plancherDuScope` se contentait
 * d'écarter ce qu'il ne savait pas lire, les deux se contredisaient sur une
 * politique corrompue : `niveauApplique` repliait sur le plus strict pendant
 * que `plancherDuScope` rendait le niveau de la ligne illisible.
 *
 * La conséquence n'était pas cosmétique. `classerChangement` trie resserrage /
 * desserrage sur CE plancher : un plancher surévalué faisait passer un
 * élargissement réel (le niveau APPLIQUÉ était `brouillon`) pour un
 * resserrage, donc par `resserrer` — le chemin libre, sans second facteur et
 * sans `ops:policy`. Une seule ligne corrompue suffisait, et le remplacement
 * d'office de la ligne de même scope effaçait ensuite la corruption qui tenait
 * le fail-closed.
 */
export function plancherDuScope(
  lignes: readonly LignePolitique[],
  scope: string,
  maintenant: Date,
): PlancherScope {
  const anomalies: AnomalieLigne[] = [];

  // 1 · Structure d'abord — on ne classe pas comme « expirée » une ligne dont
  //     on n'a pas pu lire la date d'expiration.
  for (const ligne of lignes) {
    anomalies.push(...anomaliesStructurelles(ligne));
  }
  if (anomalies.length > 0) {
    return {
      niveau: NIVEAU_DE_REPLI,
      dominantes: [],
      mesures: lignes.length,
      enVigueur: 0,
      anomalies,
    };
  }

  const vivantes = lignes.filter((ligne) => ligneEnVigueur(ligne, maintenant));

  // 2 · Sémantique, sur les seules lignes en vigueur.
  for (const ligne of vivantes) {
    anomalies.push(...anomaliesSemantiques(ligne));
  }
  if (anomalies.length > 0) {
    return {
      niveau: NIVEAU_DE_REPLI,
      dominantes: [],
      mesures: lignes.length,
      enVigueur: vivantes.length,
      anomalies,
    };
  }

  const dominantes = vivantes.filter((ligne) => scopeDomine(ligne.scope, scope));

  const niveau = dominantes.reduce<PolicyLevel>(
    (acquis, ligne) => lePlusStrict(acquis, ligne.level),
    dominantes.length === 0 ? NIVEAU_DE_REPLI : (dominantes[0]?.level ?? NIVEAU_DE_REPLI),
  );

  return {
    niveau,
    dominantes,
    mesures: lignes.length,
    enVigueur: vivantes.length,
    anomalies: [],
  };
}

/**
 * Lignes en vigueur que ce scope DOMINE et qui sont plus strictes que le niveau
 * demandé : elles survivraient au changement et continueraient de s'appliquer à
 * une PARTIE du périmètre.
 *
 * Ce n'est pas un refus — le changement a bien un effet ailleurs — mais l'écran
 * doit les montrer, sans quoi il annonce un desserrage plus large qu'il n'est.
 */
export function lignesResiduelles(
  lignes: readonly LignePolitique[],
  scope: string,
  niveauDemande: PolicyLevel,
  maintenant: Date,
): readonly LignePolitique[] {
  return lignes
    .filter((ligne) => ligneEnVigueur(ligne, maintenant))
    .filter((ligne) => ligne.scope !== scope && scopeDomine(scope, ligne.scope))
    .filter((ligne) => lePlusStrict(ligne.level, niveauDemande) === ligne.level)
    .filter((ligne) => ligne.level !== niveauDemande);
}

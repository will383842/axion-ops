/**
 * `core/transport/http/audience.ts` — **L'ÉTAPE 3, RFC 8707.**
 *
 * L'ADR 0026 décide ce qu'est l'audience — l'URL absolue de la ressource MCP —
 * et `core/auth/ressource.ts` en porte la FORME. Ce module-ci ne refait ni l'une
 * ni l'autre : il porte la **comparaison**, c'est-à-dire le seul geste que
 * l'étape 3 exécute réellement à chaque appel.
 *
 * ═══ TROIS RÈGLES, ET CHACUNE FERME UNE PERMISSIVITÉ QU'ON ÉCRIT SANS Y PENSER ═══
 *
 *  1. **ÉGALITÉ EXACTE DE CHAÎNES.** Ni préfixe, ni normalisation d'URL, ni
 *     comparaison insensible à la casse de l'hôte. Une normalisation est une
 *     surface d'égalité APPROCHÉE : chaque règle qu'on y ajoute pour être
 *     accommodant est une paire de valeurs distinctes qui deviennent
 *     équivalentes, et l'étape 3 n'existe que pour dire qu'elles ne le sont pas.
 *  2. **UNE AUDIENCE ABSENTE EST REFUSÉE.** Un jeton sans `aud` n'est pas un
 *     jeton « pour toutes les ressources » : c'est un jeton dont personne n'a
 *     dit à quoi il sert, et le laisser passer rend l'étape 3 facultative.
 *  3. **UNE AUDIENCE MULTIPLE EST REFUSÉE.** La RFC 8707 permet plusieurs
 *     indicateurs ; le socle n'en admet qu'un en v1. Motif écrit à l'ADR 0026 :
 *     une audience multiple oblige l'étape 3 à décider « l'une suffit-elle ? »,
 *     et la réponse permissive est celle qu'on écrit sans y penser. Une v2 qui
 *     en voudra plusieurs le décidera explicitement.
 *
 * ⚠️ **L'AUDIENCE N'EST PAS L'ÉMETTEUR.** `iss` se juge à l'étape 2, `aud` ici.
 *    Les confondre rendrait l'étape 3 tautologique : tout jeton émis par le
 *    socle passerait, ce qui est exactement ce que l'indicateur de ressource
 *    existe pour empêcher.
 *
 * ⚠️ **CE MODULE NE VALIDE PAS LA FORME DE `attendue`, ET C'EST UNE FRONTIÈRE.**
 *    Les cinq contraintes de forme de l'ADR 0026 se vérifient **une fois**, à
 *    l'étage 3 du démarrage, sur une valeur de configuration — pas à chaque
 *    appel sur une valeur qui n'a pas bougé. Ce qu'il vérifie en revanche, parce
 *    que c'est gratuit et que le contraire serait un désarmement silencieux :
 *    qu'`attendue` n'est pas vide. Une audience attendue vide accorderait avec
 *    un `aud` vide, et l'étape 3 laisserait passer tout jeton mal formé.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE VERDICT — des NOMBRES, jamais un booléen nu
// ═════════════════════════════════════════════════════════════════════════════

/** Les motifs de refus de l'étape 3, en union FERMÉE. */
export const MOTIFS_DE_REFUS_DAUDIENCE = [
  "audience-absente",
  "audience-multiple",
  "audience-non-textuelle",
  "audience-differente",
  "audience-attendue-vide",
] as const;

/** Un motif de refus de l'étape 3. */
export type MotifDeRefusDAudience = (typeof MOTIFS_DE_REFUS_DAUDIENCE)[number];

/**
 * CE QUE L'ÉTAPE 3 REND.
 *
 * ⚠️ `comparaisonsFaites` N'EST PAS DÉCORATIF. Une étape 3 qui rendrait
 *    « autorisé » sans avoir comparé quoi que ce soit est le seul défaut qui
 *    compte ici, et c'est un compte — pas une couleur — qui le voit. Un refus
 *    prononcé AVANT toute comparaison (audience absente, multiple, non
 *    textuelle) rend donc `0`, et c'est la bonne valeur : rien n'a été comparé.
 */
export interface VerdictDAudience {
  /** Combien de valeurs d'audience le jeton portait. 0, 1, ou davantage. */
  readonly audiencesRecues: number;
  /** Combien de comparaisons de chaînes ont RÉELLEMENT eu lieu. */
  readonly comparaisonsFaites: number;
  readonly autorise: boolean;
  /** `null` quand l'audience est accordée. Jamais une valeur reçue. */
  readonly motif: MotifDeRefusDAudience | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE 3
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CONFRONTE LA REVENDICATION `aud` D'UN JETON À L'AUDIENCE ATTENDUE.
 *
 * @param revendication la valeur brute de `aud`, typée `unknown` **à dessein** :
 *        elle vient d'un jeton, c'est-à-dire de l'extérieur. La typer `string`
 *        obligerait l'appelant à convertir de force, et la conversion serait
 *        l'endroit exact où « une audience est un tableau » cesserait d'être
 *        visible.
 * @param attendue la valeur d'`OPS_RESOURCE_INDICATOR`, dont l'étage 3 du
 *        démarrage a déjà vérifié les cinq contraintes de forme (ADR 0026).
 */
export function verifierLAudience(revendication: unknown, attendue: string): VerdictDAudience {
  if (attendue.length === 0) {
    // Fail-closed : une audience attendue vide accorderait avec un `aud` vide.
    // Ce cas ne devrait pas exister — l'étage 3 refuse de démarrer dessus — et
    // c'est précisément pourquoi il ne doit pas passer en silence ici.
    return {
      audiencesRecues: 0,
      comparaisonsFaites: 0,
      autorise: false,
      motif: "audience-attendue-vide",
    };
  }

  // ── Combien de valeurs le jeton porte-t-il ? ─────────────────────────────
  // Un tableau d'UNE valeur n'est pas une « audience multiple » : c'est la même
  // audience écrite sous l'autre forme que la RFC 8707 permet. Le refus porte
  // sur la MULTIPLICITÉ, pas sur l'écriture — confondre les deux ferait refuser
  // un émetteur parfaitement conforme, et le remède qu'on chercherait à cette
  // fausse alerte serait d'accepter les tableaux en n'en lisant que le premier.
  const valeurs: readonly unknown[] = Array.isArray(revendication)
    ? revendication
    : revendication === undefined || revendication === null
      ? []
      : [revendication];

  if (valeurs.length === 0) {
    return {
      audiencesRecues: 0,
      comparaisonsFaites: 0,
      autorise: false,
      motif: "audience-absente",
    };
  }
  if (valeurs.length > 1) {
    return {
      audiencesRecues: valeurs.length,
      comparaisonsFaites: 0,
      autorise: false,
      motif: "audience-multiple",
    };
  }

  const seule: unknown = valeurs[0];
  if (typeof seule !== "string") {
    return {
      audiencesRecues: 1,
      comparaisonsFaites: 0,
      autorise: false,
      motif: "audience-non-textuelle",
    };
  }

  // ── L'ÉGALITÉ EXACTE. Une ligne, et c'est toute l'étape 3. ────────────────
  const accorde = seule === attendue;
  return {
    audiencesRecues: 1,
    comparaisonsFaites: 1,
    autorise: accorde,
    motif: accorde ? null : "audience-differente",
  };
}

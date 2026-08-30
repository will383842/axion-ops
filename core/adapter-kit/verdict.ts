/**
 * Le verdict d'une garde — le format commun à `core/adapter-kit/` et
 * `core/registry/`.
 *
 * ═══ POURQUOI UNE GARDE ANNONCE SON COMPTE ═══
 *
 * Une garde qui compte ZÉRO élément est verte pour la pire des raisons : elle
 * n'a rien regardé. Le § 09, contrôle 9, et le § 14 le disent tous les deux, et
 * pour le même motif — les fichiers que la garde devrait lire vivent dans
 * D'AUTRES DÉPÔTS que celui où elle tourne. Un adaptateur rangé ailleurs, un
 * glob qui cesse de mordre, un `adapters.lock.json` vidé : dans les trois cas
 * la garde reste verte et ne dit rien.
 *
 * D'où l'invariant de ce fichier : **aucune garde ne rend un booléen seul.**
 * Elle rend le nombre d'éléments qu'elle a effectivement mesurés, ET le
 * plancher sous lequel ce nombre est lui-même une anomalie.
 */

/** Ce que rend une garde : le compte mesuré, son plancher, et les anomalies. */
export interface Verdict {
  /** Combien d'éléments la garde a RÉELLEMENT regardés. */
  readonly mesures: number;
  /** Sous ce plancher, le compte est lui-même une anomalie. */
  readonly plancher: number;
  /** Une ligne par anomalie, lisible sans le code sous les yeux. */
  readonly anomalies: readonly string[];
}

/** Vrai quand la garde a mesuré assez d'éléments ET n'a rien trouvé. */
export function estVert(verdict: Verdict): boolean {
  return verdict.anomalies.length === 0 && verdict.mesures >= verdict.plancher;
}

/**
 * Les anomalies d'un verdict, PLUS celle du compte insuffisant.
 *
 * C'est cette fonction qui transforme « la garde n'a rien mesuré » en une
 * anomalie affichée, au lieu d'un silence vert.
 */
export function anomaliesCompletes(verdict: Verdict, nom: string): readonly string[] {
  if (verdict.mesures >= verdict.plancher) return verdict.anomalies;
  return [
    ...verdict.anomalies,
    `${nom} : ${String(verdict.mesures)} élément(s) mesuré(s) pour un plancher de ` +
      `${String(verdict.plancher)} — la garde n'a pas regardé assez pour conclure.`,
  ];
}

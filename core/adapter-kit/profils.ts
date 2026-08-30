/**
 * Le CONTRAT attendu de `core/profiles/` — déclaré ici, jamais réimplémenté.
 *
 * `core/profiles/` appartient à un autre module. Ce fichier ne contient donc
 * AUCUNE liste de profils : il déclare la forme que `core/adapter-kit/` attend,
 * et code contre elle.
 *
 * ⚠️ Ce qu'il ne faut PAS faire ici, et pourquoi : écrire
 * `["courrier", "dev", "admin", "audit"]` dans ce fichier « en attendant » la
 * livraison de `core/profiles/`. La garde du § 14 — un profil inconnu ne
 * compile pas — n'a de valeur que s'il existe UNE seule énumération. Deux
 * listes qui se ressemblent aujourd'hui ne se ressemblent plus au premier
 * profil ajouté d'un seul côté, et la divergence est silencieuse : le kit
 * accepterait un profil que le socle ne sait pas servir, ou refuserait un
 * profil que la console affiche.
 */

/**
 * Ce que `core/profiles/` doit exporter pour que le kit puisse s'y brancher.
 *
 * La contrainte utile est le couple : la VALEUR (`PROFILE_NAMES`) sert à la
 * vérification au build, le TYPE (`ProfileName`, dérivé du tableau) ferme le
 * champ `profiles` à la compilation. L'un sans l'autre laisse un trou —
 * un type seul ne vérifie rien d'un manifeste reçu d'un dépôt tiers, une valeur
 * seule ne fait rougir aucun compilateur chez l'adaptateur.
 */
export interface ContratProfils<TProfile extends string> {
  /**
   * L'énumération, DANS L'ORDRE et non vide. Le type des profils s'en dérive
   * chez le fournisseur : `type ProfileName = (typeof PROFILE_NAMES)[number]`.
   */
  readonly PROFILE_NAMES: readonly TProfile[];
}

/**
 * Vérifie qu'une énumération de profils reçue est utilisable.
 *
 * Employée par le harnais et par les tests : elle transforme « la liste est
 * vide » en anomalie visible, au lieu d'un kit qui accepte tout.
 */
export function verifierEnumerationProfils(profils: readonly string[]): readonly string[] {
  const anomalies: string[] = [];
  if (profils.length === 0) {
    anomalies.push("l'énumération des profils est VIDE — la garde du § 14 ne fermerait plus rien.");
  }
  const vus = new Set<string>();
  for (const profil of profils) {
    if (profil.trim() === "") anomalies.push("un profil porte un nom vide.");
    if (vus.has(profil)) anomalies.push(`profil « ${profil} » en double.`);
    vus.add(profil);
  }
  return anomalies;
}

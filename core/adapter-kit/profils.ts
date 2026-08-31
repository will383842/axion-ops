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
  /**
   * LE SCEAU de l'énumération — version et empreinte (ADR 0004).
   *
   * ⚠️ IL NE SE DÉDUIT PAS DE `PROFILE_NAMES`. Deux énumérations peuvent porter
   *    les mêmes noms et n'être pas la même : un profil retiré puis rendu,
   *    un `depuis` corrigé. C'est le fournisseur qui décide de ce que
   *    l'empreinte couvre — `core/profiles` en exclut nommément `libelle`,
   *    parce qu'une reformulation d'écran ne doit pas invalider les manifestes
   *    de tout le monde. Le recalculer ici serait décider à sa place.
   */
  readonly SCEAU_PROFILS: SceauProfils;
}

/**
 * Ce qu'un manifeste ÉPINGLE de l'énumération contre laquelle il a été produit.
 *
 * Deux champs, et pas un de plus : la version dit CE QUE l'auteur croyait
 * viser, l'empreinte dit ce qu'il visait VRAIMENT. Garder les deux n'est pas
 * une redondance — une version inchangée avec une empreinte changée est le cas
 * exact qu'on veut voir : quelqu'un a modifié l'énumération sans en changer la
 * version.
 */
export interface SceauProfils {
  readonly version: string;
  readonly empreinte: string;
}

/**
 * Vérifie qu'un sceau reçu a la forme d'un sceau. Rend les anomalies.
 *
 * ⚠️ ELLE NE COMPARE RIEN. La confrontation au sceau du socle appartient au
 *    REGISTRE : c'est lui qui détient la vérité du socle, et c'est chez lui que
 *    le refus doit être prononcé et journalisé.
 */
export function verifierFormeDuSceau(sceau: SceauProfils): readonly string[] {
  const anomalies: string[] = [];
  if (sceau.version.trim() === "") {
    anomalies.push("le sceau des profils porte une version vide.");
  }
  if (!/^[0-9a-f]{64}$/.test(sceau.empreinte)) {
    anomalies.push(
      "le sceau des profils porte une empreinte hors forme — attendu 64 hexadécimaux minuscules.",
    );
  }
  return anomalies;
}

/**
 * VÉRIFIE QU'UNE ÉNUMÉRATION DE PROFILS REÇUE EST UTILISABLE.
 *
 * ═══ LE JUMEAU OUBLIÉ DE L'ADR 0004, ET CE QU'IL A COÛTÉ ═══
 *
 * Sa voisine immédiate {@link verifierFormeDuSceau}, écrite dans ce fichier-ci
 * et par la MÊME décision, avait un appelant de production
 * (`analyserDefinition`, `manifest.ts`). Celle-ci n'en avait AUCUN : le sceau
 * des profils était confronté dans sa FORME et l'énumération jamais dans la
 * sienne. Une garde écrite que rien n'appelle est la panne exacte du lot 1c.
 *
 * ═══ OÙ ELLE EST APPELÉE, ET POURQUOI LÀ ═══
 *
 * L'arbitrage était « à QUOI l'énumération reçue est-elle confrontée ». La
 * réponse est : à rien d'extérieur — elle est confrontée à SA PROPRE FORME,
 * exactement comme le sceau. La confrontation au socle appartient au REGISTRE
 * (`profilesVersion` / `profilesSha`), qui détient la vérité du socle et où le
 * refus se journalise. Deux endroits l'appellent donc, et **ils ne font pas le
 * même geste** :
 *
 *  · `creerAdapterKit()` — **LÈVE.** C'est l'entrée unique de l'énumération dans
 *    le kit ; un kit bâti sur une énumération inutilisable accepterait
 *    `profiles: […]` sans rien fermer, et la garde du § 14 mesurerait sur du
 *    vide en restant verte. Le kit refusait déjà la liste VIDE par une
 *    comparaison écrite à la main ; il la refuse désormais par CETTE
 *    fonction — une seule expression de la règle, et deux anomalies de plus
 *    qu'il laissait passer en silence (un nom vide, un doublon) ;
 *  · `analyserDefinition()` — **REND UNE ANOMALIE**, à côté de son jumeau et
 *    dans le même geste. Le harnais a besoin de la LISTE des anomalies, pas de
 *    la première : c'est le contrat de cette fonction, et le jumeau le respecte.
 *
 * ⚠️ **LES DEUX APPELS NE SONT PAS UNE REDONDANCE.** Un adaptateur tiers peut
 *    appeler `analyserDefinition()` sans passer par le kit — c'est une fonction
 *    exportée —, et le kit peut être construit sans qu'aucune définition ne soit
 *    analysée. Chacun couvre un chemin que l'autre ne voit pas.
 *
 * ⚠️ **CE QU'ELLE NE PROUVE PAS.** Elle dit qu'une énumération est UTILISABLE,
 *    jamais qu'elle est la BONNE. Une énumération parfaitement formée mais
 *    périmée passe ici et se fait prendre par le sceau, chez le registre. Les
 *    confondre ferait croire qu'un manifeste admis a été construit contre
 *    l'énumération courante.
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

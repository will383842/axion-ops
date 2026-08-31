/**
 * `ops/secrets.ts` — UN SECRET ABSENT FAIT ÉCHOUER L'ÉTAPE.
 *
 * ═══ LE DÉFAUT QUE CE MODULE FERME ═══
 *
 * C'est le motif le plus répandu, et le plus coûteux, des chaînes
 * d'intégration : une étape qui a besoin d'un secret est écrite pour se SAUTER
 * quand il manque —
 *
 *     if: ${{ secrets.MON_JETON != '' }}
 *
 * — et le jour où le nom du secret est mal orthographié, où il est révoqué, où
 * il n'est pas exposé aux exécutions issues d'une fourche, l'étape ne rougit
 * pas : elle DISPARAÎT. La chaîne reste verte, et le contrôle qu'elle portait
 * n'a plus lieu. Personne ne le voit, parce que rien ne se distingue d'un
 * succès.
 *
 * GitHub Actions substitue une CHAÎNE VIDE à un secret absent — il ne lève pas.
 * Une étape qui lit `process.env.MON_JETON` sans le vérifier travaille donc
 * avec `""`, et échoue plus loin, sur un message qui parle d'autre chose.
 *
 * ═══ LA RÈGLE, ÉCRITE ICI ET NULLE PART AILLEURS ═══
 *
 * Un secret déclaré REQUIS et absent est un ÉCHEC. Jamais un saut, jamais un
 * avertissement, jamais un repli sur une valeur par défaut.
 *
 * ⚠️ CE MODULE NE LIT AUCUN SECRET ET N'EN JOURNALISE AUCUN. Il ne regarde que
 *    la PRÉSENCE d'une valeur non vide, et ses messages ne portent que des NOMS
 *    de variables. Un vérificateur de secrets qui recopierait une valeur dans
 *    son message serait le pire endroit possible pour une fuite : la sortie
 *    d'une chaîne d'intégration est publique sur un dépôt public (§ 29).
 */

/** Un secret dont une étape a besoin, et la raison pour laquelle elle en a besoin. */
export interface ExigenceSecret {
  /** Le nom de la variable d'environnement, tel que le workflow l'expose. */
  readonly nom: string;
  /** À quoi il sert. Sans cela, personne ne saura s'il est encore nécessaire. */
  readonly pourquoi: string;
}

/**
 * LES SECRETS REQUIS PAR LA CHAÎNE D'INTÉGRATION DE CE DÉPÔT.
 *
 * ⚠️ ELLE EST VIDE, ET C'EST UN FAIT MESURÉ, PAS UN OUBLI. Le socle ne sort pas
 *    de la machine : la chaîne compile, formate, éprouve et valide un schéma
 *    contre une URL STUB (`stub.invalid`, RFC 2606). Aucun déploiement, aucun
 *    appel réseau sortant, donc aucun secret.
 *
 *    La MÉCANIQUE, elle, est en service dès maintenant — c'est le propos. Le
 *    jour où un secret devient nécessaire, il s'ajoute ICI, et l'étape qui en
 *    dépend échoue s'il manque. Poser la mécanique après coup, c'est-à-dire au
 *    moment où l'on est pressé d'ajouter un secret, est précisément ce qui
 *    produit le `if: secrets.X != ''` qu'on veut éviter.
 *
 *    `ops/secrets.spec.ts` éprouve la mécanique sur des exigences FABRIQUÉES :
 *    une liste vide ne peut pas prouver qu'un vérificateur mord.
 */
export const SECRETS_REQUIS: readonly ExigenceSecret[] = [];

/** Ce que rend la vérification. JAMAIS un booléen. */
export interface VerdictSecrets {
  /** Nombre d'exigences réellement CONFRONTÉES à l'environnement. */
  readonly exigencesMesurees: number;
  /** Les NOMS des secrets absents ou vides. Jamais une valeur. */
  readonly manquants: readonly string[];
  /** Les messages, prêts à être écrits sur la sortie d'erreur. */
  readonly anomalies: readonly string[];
}

/**
 * Un secret est-il RÉELLEMENT présent ?
 *
 * Trois formes comptent pour absentes, et les trois arrivent :
 *
 *  · `undefined` — la variable n'est pas exposée à l'étape ;
 *  · `""` — GitHub Actions substitue une chaîne vide à un secret inconnu, et
 *    c'est le cas du nom mal orthographié, celui qui ne se voit nulle part ;
 *  · une valeur d'espaces seuls — un secret collé avec un saut de ligne de
 *    trop dans l'interface, qui se comporte comme absent partout ensuite.
 */
export function secretPresent(valeur: string | undefined): boolean {
  return valeur !== undefined && valeur.trim().length > 0;
}

/**
 * Confronte les exigences à l'environnement.
 *
 * @param exigences - la liste à vérifier. INJECTABLE, pour que les gardes
 *   puissent en fabriquer une : une liste vide ne prouve jamais qu'un
 *   vérificateur sait rougir.
 * @param env - l'environnement lu. Injecté pour la même raison.
 */
export function verifierSecrets(
  exigences: readonly ExigenceSecret[] = SECRETS_REQUIS,
  env: Readonly<Record<string, string | undefined>> = process.env,
): VerdictSecrets {
  const manquants: string[] = [];
  const anomalies: string[] = [];
  let exigencesMesurees = 0;

  for (const exigence of exigences) {
    exigencesMesurees += 1;
    if (!secretPresent(env[exigence.nom])) {
      manquants.push(exigence.nom);
      anomalies.push(
        `secret « ${exigence.nom} » absent ou vide — ${exigence.pourquoi}. ` +
          "L'étape ÉCHOUE : elle ne se saute pas. Un contrôle qui disparaît quand son " +
          "secret manque laisse la chaîne verte et le contrôle non fait.",
      );
    }
  }

  return { exigencesMesurees, manquants, anomalies };
}

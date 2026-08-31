/**
 * `core/auth/configuration.ts` — **L'ÉTAGE 3 DU DÉMARRAGE : LA RÈGLE LA PLUS
 * FORTE DU DOCUMENT, ET SON TEST.**
 *
 * ═══ LA RÈGLE ═══
 *
 * > § 19 — **le socle ne démarre pas si l'authentification n'est pas configurée.
 * >   Pas de mode dégradé. Pas d'`AUTH_DISABLED`.**
 *
 * La v5 posait cette phrase comme la plus forte du document et **ne lui donnait
 * aucun test**, quand le coffre en avait un. Ce module est le test.
 *
 * ═══ CE QUE LA VÉRIFICATION REND, ET CE QU'ELLE NE REND PAS ═══
 *
 * ⚠️ **ELLE NE REND JAMAIS UNE VALEUR, PAS MÊME TRONQUÉE.** Elle rend des NOMS
 *    de réglages et des COMPTES. La sortie d'erreur d'un démarrage raté est lue
 *    dans un journal de conteneur, et le dépôt est PUBLIC (§ 29).
 *
 * ⚠️ **`reglagesConfrontes` N'EST PAS DÉCORATIF.** Une vérification qui
 *    confronterait zéro réglage serait verte pour la pire des raisons — c'est le
 *    mode de défaillance qu'`ops/secrets.ts` documente déjà : « GitHub Actions
 *    substitue une chaîne vide à un secret inconnu ». Le compte est ce que les
 *    tests lisent, jamais la couleur.
 *
 * ⚠️ **DEUX CHOSES SONT CONFRONTÉES, ET LA SECONDE EST FACILE À OUBLIER.**
 *    L'étage 3 refuse « un réglage manque **ou** l'indicateur de ressource n'a
 *    pas la forme exigée » (`ops/demarrage/etages.ts`). Une vérification de
 *    PRÉSENCE seule laisserait passer `OPS_RESOURCE_INDICATOR="oui"` : le socle
 *    démarrerait, l'étape 3 comparerait par égalité exacte à une valeur qui n'est
 *    pas une URL, et **aucun jeton ne vaudrait jamais** — panne totale, message
 *    inexistant.
 *
 * ═══ POURQUOI CE MODULE NE LIT PAS `process.env` LUI-MÊME ═══
 *
 * L'environnement est INJECTÉ. C'est ce qui rend le témoin possible : lui passer
 * un environnement FABRIQUÉ auquel il manque exactement un réglage, et exiger
 * exactement une anomalie qui NOMME ce réglage. Une fonction qui lirait
 * `process.env` depuis son corps ne serait éprouvable qu'en mutilant
 * l'environnement du processus de test.
 */

import type { ConfigurationDAuthentification } from "./contrat.js";
import { verifierLaFormeDeLAudience } from "./audience.js";
import { VARIABLE_DE_L_AUDIENCE } from "./ressource.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES RÉGLAGES
// ═════════════════════════════════════════════════════════════════════════════

/** Un réglage exigé, et la raison pour laquelle il l'est. */
export interface ExigenceDeReglage {
  /** Le nom de la variable d'environnement. */
  readonly nom: string;
  /** À quoi il sert. Sans cela, personne ne saura s'il est encore nécessaire. */
  readonly pourquoi: string;
}

/**
 * LES RÉGLAGES SANS LESQUELS LE SOCLE NE DÉMARRE PAS.
 *
 * ⚠️ **LE MATÉRIEL D'AUTHENTIFICATION DE LA CONSOLE EST ICI, ET PAS DANS LE
 *    COFFRE — C'EST UNE DÉCISION (§ 21, ADR 0027, point 7).** La console, le
 *    healthcheck et le déverrouillage sont servis SANS le coffre : c'est ce qui
 *    rend le deuxième état du § 23 utile, et c'est ce qui permet de se connecter
 *    POUR déverrouiller. Un identifiant de console rangé dans le coffre ferait
 *    d'un coffre verrouillé un socle qu'il faut rouvrir depuis un terminal — ce
 *    que la v5 imposait, et ce que le § 21 corrige.
 *
 *    La clé d'empreinte des jetons OAuth, elle, vit DANS le coffre. Conséquence
 *    assumée : sous coffre verrouillé, `/auth/token` ne répond pas.
 *
 * ⚠️ **CETTE LISTE EST CONFRONTÉE À `.env.example`**, par la garde de
 *    `core/auth/configuration.spec.ts` : un réglage exigé ici et absent du modèle
 *    de configuration serait un socle qu'on ne peut pas démarrer en suivant la
 *    documentation, et personne ne le saurait avant d'essayer.
 */
export const REGLAGES_DAUTHENTIFICATION: readonly ExigenceDeReglage[] = [
  {
    nom: VARIABLE_DE_L_AUDIENCE,
    pourquoi:
      "RFC 8707 — l'indicateur de ressource qui sert d'audience. Sans lui, l'étape 3 n'a rien " +
      "à comparer et n'a aucun sens (§ 19.1, ADR 0026).",
  },
  {
    nom: "OPS_CONSOLE_ISSUER",
    pourquoi:
      "L'émetteur de la session de console (§ 21). C'est elle qui permet l'arrêt d'urgence " +
      "depuis un téléphone, et le déverrouillage du coffre.",
  },
  {
    nom: "OPS_CONSOLE_SESSION_KEY",
    pourquoi:
      "La clé qui signe la session de console. Elle n'entre JAMAIS dans le coffre (§ 21) : " +
      "sans quoi un coffre verrouillé serait un socle qu'on ne peut plus rouvrir.",
  },
  {
    nom: "OPS_CONSOLE_TOTP_ISSUER",
    pourquoi:
      "Le nom d'émetteur affiché par l'application de second facteur (§ 20). Sans lui, le " +
      "TOTP du desserrage s'enrôle sous une étiquette anonyme, et personne ne sait quel " +
      "code appartient à quel socle.",
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  LA PRÉSENCE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un réglage est-il RÉELLEMENT présent ?
 *
 * Trois formes comptent pour absentes, et les trois arrivent :
 *
 *  · `undefined` — la variable n'est pas exposée au processus ;
 *  · `""` — une variable déclarée sans valeur dans l'interface d'exploitation
 *    n'est pas nullish. C'est le cas du nom mal orthographié, celui qui ne se
 *    voit nulle part ;
 *  · une valeur d'espaces seuls — une valeur collée avec un saut de ligne de
 *    trop, qui se comporte comme absente partout ensuite.
 *
 * ⚠️ **CETTE FONCTION A UNE JUMELLE, ET LA GARDE LES CONFRONTE.**
 *    `ops/secrets.ts` porte `secretPresent()`, écrite pour la chaîne
 *    d'intégration. `core/` ne peut pas l'importer : `ops/` est la couche de
 *    composition, et `core → ops` inverserait la dépendance — le noyau
 *    dépendrait de son montage. Deux écritures existent donc, et deux
 *    dérivations d'un même fait finissent d'ordinaire par se contredire : la
 *    garde de `core/auth/configuration.spec.ts` leur soumet la MÊME table de
 *    formes et exige zéro désaccord. Se contredire est le signal.
 */
export function reglagePresent(valeur: string | undefined): boolean {
  return valeur !== undefined && valeur.trim().length > 0;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONFRONTATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que l'étage 3 lit. Étend le contrat de l'architecte pour y ajouter le
 * SECOND compte — celui des contraintes de forme —, sans quoi une vérification
 * qui aurait cessé d'examiner l'audience resterait indiscernable d'une
 * vérification complète.
 */
export interface ConfigurationDAuthentificationMesuree extends ConfigurationDAuthentification {
  /** Combien de contraintes de forme d'audience ont été confrontées. */
  readonly contraintesDAudienceConfrontees: number;
  /** L'audience passe-t-elle les cinq contraintes ? `false` si elle est absente. */
  readonly audienceConforme: boolean;
}

/**
 * **L'ÉTAGE 3, EN UNE FONCTION PURE.**
 *
 * @param env l'environnement lu. Injecté : un témoin lui passe un environnement
 *        fabriqué auquel il manque exactement un réglage.
 * @param reglages la liste à confronter. Injectée pour la même raison — une
 *        liste vide ne prouve jamais qu'un vérificateur mord.
 *
 * ⚠️ **ELLE NE LÈVE PAS, ET C'EST DÉLIBÉRÉ.** Constater et décider sont deux
 *    gestes différents (même motif que `Coffre.ouvrir()` face à un coffre
 *    absent). C'est `ops/main.ts` qui, lisant `anomalies.length > 0`, écrit sur
 *    la sortie d'erreur et SORT — parce que l'issue de l'étage 3 est
 *    `processus-sort`, et qu'un module de `core/` qui appellerait `process.exit`
 *    rendrait l'échelle du démarrage intestable.
 */
export function verifierLaConfigurationDAuthentification(
  env: Readonly<Record<string, string | undefined>>,
  reglages: readonly ExigenceDeReglage[] = REGLAGES_DAUTHENTIFICATION,
): ConfigurationDAuthentificationMesuree {
  const manquants: string[] = [];
  const anomalies: string[] = [];
  let reglagesConfrontes = 0;

  for (const reglage of reglages) {
    reglagesConfrontes += 1;
    if (reglagePresent(env[reglage.nom])) continue;
    manquants.push(reglage.nom);
    anomalies.push(
      `§ 19 — réglage d'authentification « ${reglage.nom} » absent ou vide : ${reglage.pourquoi} ` +
        "Le socle NE DÉMARRE PAS. Il n'existe ni mode dégradé, ni bascule de contournement : " +
        "renseigner la variable dans l'environnement du conteneur, puis redéployer.",
    );
  }

  // ── La FORME de l'audience, et pas seulement sa présence ────────────────────
  // Une audience présente mais mal formée démarre, puis refuse chaque jeton à
  // l'étape 3 sans qu'aucun message n'existe pour le dire.
  const audience = env[VARIABLE_DE_L_AUDIENCE];
  const forme =
    audience === undefined || audience.trim().length === 0
      ? null
      : verifierLaFormeDeLAudience(audience);
  if (forme !== null) anomalies.push(...forme.anomalies);

  return {
    reglagesConfrontes,
    manquants,
    anomalies,
    contraintesDAudienceConfrontees: forme?.contraintesConfrontees ?? 0,
    audienceConforme: forme?.conforme ?? false,
  };
}

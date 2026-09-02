/**
 * `ops/zoho-mail/bootstrap/coffre-du-jeton.ts` — **LE COMPTEUR QUI REND LE
 * MUR VISIBLE, ET LE DÉPÔT DU JETON.**
 *
 * ═══ LE § 27, MOT POUR MOT ═══
 *
 *   « `ops_secret.bootstrapCount` est affiché à l'écran Santé : un plafond
 *     qu'on ne compte pas est un mur qu'on découvre en le percutant. »
 *
 * ═══ POURQUOI DEUX LIGNES, ET NON UNE ═══
 *
 * Le § 12 justifie l'unicité `(name, version)` d'`ops_secret` **par le § 27** :
 * « garder l'ancien refresh token valide pendant la propagation — un `name`
 * unique l'interdirait ». Chaque amorçage écrit donc le jeton en **version
 * NEUVE**, et l'ancienne survit le temps que la production bascule.
 *
 * ⚠️ **ET C'EST EXACTEMENT CE QUI CASSERAIT LE COMPTEUR.** `bootstrapCount` est
 *    une colonne de la LIGNE, donc du couple `(name, version)`. Un compteur posé
 *    sur la ligne du jeton **repartirait de zéro à chaque nouvelle version** —
 *    c'est-à-dire à chaque amorçage. Le plafond ne serait jamais atteint, le mur
 *    ne serait jamais vu, et la garde serait verte pour la pire des raisons : en
 *    ne comptant rien.
 *
 * D'où **deux lignes, et une seule qui compte** :
 *
 *  · `zoho.oauth.amorcage` v1 — **l'ANCRE**. Elle ne porte AUCUN secret : son
 *    clair est un marqueur constant. Sa seule raison d'être est son
 *    `bootstrapCount`, qui compte les amorçages **du client OAuth**, en travers
 *    de toutes les versions du jeton. Version FIXE : une ancre versionnée serait
 *    le défaut qu'elle existe pour fermer.
 *  · `zoho.oauth.refreshToken` v1, v2, … — **le JETON**, en version neuve à
 *    chaque fois, comme le § 12 l'exige.
 *
 * ⚠️ **L'ANCRE EST POSÉE AVANT TOUT ÉCHANGE, ET C'EST CE QUI SUPPRIME LA
 *    BORNE.** L'ordre naturel — échanger, déposer, compter — laisserait le
 *    PREMIER amorçage incomptable : il n'y a pas de ligne à incrémenter tant que
 *    rien n'est écrit. Le plafond ne mordrait donc qu'à partir du deuxième, et
 *    un incident entre l'échange et le dépôt produirait un jeton émis chez Zoho
 *    que personne n'a compté — un compteur qui SOUS-ESTIME, c'est-à-dire pire
 *    que pas de compteur. Comme l'ancre ne porte aucun secret, rien n'empêche de
 *    l'écrire d'abord : le compte devient alors un **majorant** des jetons émis,
 *    dans tous les cas, dès le premier.
 *
 * ⚠️ **LE PLAFOND N'EST PAS CONTRÔLÉ PAR CE MODULE.** Il voyage dans l'écriture
 *    — `Coffre.compterUnAmorcage()` s'appuie sur
 *    `incrementerBootstrapCountSousPlafond()`, qui porte la condition dans le
 *    `UPDATE … WHERE`. Lire le compte, le comparer, puis incrémenter laisserait
 *    un `await` entre le contrôle et l'écriture. Ce module LIT le compte pour le
 *    DIRE, jamais pour décider.
 *
 * ⚠️ **AUCUNE VALEUR DE JETON N'ENTRE DANS UN MESSAGE DE CE FICHIER.**
 */

import type { CompteurDAmorcage, Coffre, DepotDeSecrets } from "../../../core/vault/index.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX LIGNES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ancre. **Sa version est FIXE**, et ce n'est pas un oubli : c'est la
 * propriété qui fait qu'elle compte.
 */
export const NOM_DE_L_ANCRE = "zoho.oauth.amorcage";

/** Voir ci-dessus. Jamais dérivée d'autre chose, jamais incrémentée. */
export const VERSION_DE_L_ANCRE = 1;

/**
 * Le clair de l'ancre. **Un marqueur, pas un secret** — il est écrit avant tout
 * échange réseau, et il ne doit donc rien valoir. Le nom du client OAuth, la
 * région ou l'URI de redirection y seraient des informations d'exploitation
 * qu'aucune ligne chiffrée n'a besoin de porter.
 */
export const CLAIR_DE_L_ANCRE =
  "ancre d'amorcage OAuth — cette ligne ne porte aucun secret ; seul son bootstrapCount compte";

/** Le jeton de rafraîchissement. Version NEUVE à chaque amorçage (§ 12). */
export const NOM_DU_REFRESH_TOKEN = "zoho.oauth.refreshToken";

// ═════════════════════════════════════════════════════════════════════════════
//  LE PLAFOND
// ═════════════════════════════════════════════════════════════════════════════

/** La variable qui pose le plafond. Un NOM. */
export const VARIABLE_PLAFOND = "ZOHO_BOOTSTRAP_PLAFOND";

/**
 * **LE PLAFOND PRÉSUMÉ, ET LE MOT « PRÉSUMÉ » EST LA PARTIE IMPORTANTE.**
 *
 * ⚠️ **CE NOMBRE N'A PAS ÉTÉ CONFRONTÉ À LA DOCUMENTATION ZOHO DEPUIS CETTE
 *    MACHINE** — la règle du chantier interdit tout appel réseau sortant. Le
 *    § 27 dit que le plafond EXISTE, pas quelle est sa valeur.
 *
 * Il est posé bas **volontairement** : le rôle de ce nombre n'est pas d'être
 * exact, il est de faire **arriver le mur avant Zoho**. Un plafond trop bas
 * refuse un amorçage légitime — coût : lire un message et poser
 * `${VARIABLE_PLAFOND}`. Un plafond trop haut ne refuse rien, et Zoho invalide
 * silencieusement le jeton le plus ancien — coût : un adaptateur qui rend 401
 * des jours plus tard, sans cause visible. Les deux erreurs ne se paient pas au
 * même prix, et le défaut penche du côté le moins cher.
 *
 * La mesure qui remplacerait cette présomption par un fait est nommée dans
 * `DEPS.md`, § « Ce qui reste à vérifier ».
 */
export const PLAFOND_PRESUME = 8;

/** D'où vient le plafond en vigueur. Le rapport le DIT, au lieu de le taire. */
export type OriginePlafond = "présumé" | "posé par l'environnement";

export interface PlafondEnVigueur {
  readonly valeur: number;
  readonly origine: OriginePlafond;
  /** L'anomalie de lecture, s'il y en a une. Une valeur illisible ne se déduit pas. */
  readonly anomalie: string | null;
}

/**
 * Lit le plafond. **Une valeur illisible n'est pas remplacée en silence** : elle
 * est signalée, et le présumé reprend — un plafond posé de travers qui
 * retomberait sans un mot sur le défaut ferait croire un réglage appliqué.
 */
export function plafondEnVigueur(
  env: Readonly<Record<string, string | undefined>>,
): PlafondEnVigueur {
  const brut = env[VARIABLE_PLAFOND];
  if (brut === undefined || brut.trim() === "") {
    return { valeur: PLAFOND_PRESUME, origine: "présumé", anomalie: null };
  }
  const valeur = Number(brut);
  if (!Number.isInteger(valeur) || valeur < 1) {
    return {
      valeur: PLAFOND_PRESUME,
      origine: "présumé",
      anomalie:
        `${VARIABLE_PLAFOND} vaut « ${brut} », qui n'est pas un entier ≥ 1. Le plafond ` +
        `présumé (${String(PLAFOND_PRESUME)}) reprend. Corriger la variable, ou la retirer.`,
    };
  }
  return { valeur, origine: "posé par l'environnement", anomalie: null };
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAT DE L'ANCRE, AVANT TOUT GESTE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que l'on sait du compteur avant d'avoir rien fait. */
export interface EtatDAmorcage {
  /** L'ancre existe-t-elle ? `false` = premier amorçage de ce coffre. */
  readonly ancrePosee: boolean;
  /** Amorçages déjà comptés. `0` quand l'ancre n'existe pas encore. */
  readonly compte: number;
  /** Versions du jeton déjà déposées dans CE coffre. */
  readonly derniereVersionDuJeton: number | null;
  /**
   * **LE PLAFOND QUE LE COFFRE APPLIQUE RÉELLEMENT**, tel qu'il le rend lui-même.
   * `null` tant que l'ancre n'existe pas : il n'y a alors rien à qui le demander.
   *
   * ⚠️ **CE N'EST PAS LA MÊME CHOSE QUE `plafondEnVigueur(env)`.** Celui-ci est
   *    posé au coffre à sa construction ; celui-là est relu de l'environnement
   *    par qui veut. Ce sont **deux dérivations d'un même fait**, et deux
   *    dérivations finissent par se contredire — le jour où l'une est posée et
   *    l'autre pas, le rapport annoncerait un plafond que rien n'applique.
   *    C'est **celui-ci** qui décide, et `amorcage.ts` fait de l'autre un
   *    TÉMOIN : il signale l'écart au lieu de le taire.
   */
  readonly plafondDuCoffre: number | null;
}

/**
 * Le port par lequel ce module lit une MÉTADONNÉE de ligne.
 *
 * ⚠️ **CE N'EST PAS UN CONTOURNEMENT DU COFFRE.** Le coffre expose `lire(nom)`,
 *    qui rend un CLAIR — il faut donc être ouvert, et l'on déchiffre un secret
 *    pour apprendre un numéro de version. Ici on ne veut que le numéro, qui
 *    voyage en clair dans `ops_secret` par construction (§ 12). Passer par le
 *    dépôt évite un déchiffrement inutile ; c'est le même choix que
 *    `Coffre.lireAmorcage()`, qui lit `bootstrapCount` sans rien déchiffrer.
 */
export interface LecteurDeVersions {
  derniereVersion(nom: string): Promise<number | null>;
}

/** La prise sur un `DepotDeSecrets`. Aucune écriture, aucun déchiffrement. */
export function lecteurDeVersions(depot: DepotDeSecrets): LecteurDeVersions {
  return {
    async derniereVersion(nom: string): Promise<number | null> {
      const ligne = await depot.lireDerniereVersion(nom);
      return ligne === null ? null : ligne.version;
    },
  };
}

/**
 * **CONSTATE, SANS RIEN ÉCRIRE.** C'est ce que le rapport affiche AVANT de
 * demander quoi que ce soit à Will, et c'est ce qui produit l'avertissement
 * d'un second amorçage.
 */
export async function constaterLAmorcage(
  coffre: Coffre,
  versions: LecteurDeVersions,
): Promise<EtatDAmorcage> {
  const versionDeLAncre = await versions.derniereVersion(NOM_DE_L_ANCRE);
  const derniereVersionDuJeton = await versions.derniereVersion(NOM_DU_REFRESH_TOKEN);

  if (versionDeLAncre === null) {
    return { ancrePosee: false, compte: 0, derniereVersionDuJeton, plafondDuCoffre: null };
  }

  const compteur = await coffre.lireAmorcage(NOM_DE_L_ANCRE, VERSION_DE_L_ANCRE);
  return {
    ancrePosee: true,
    compte: compteur.compte,
    derniereVersionDuJeton,
    plafondDuCoffre: compteur.plafond,
  };
}

/**
 * L'avertissement du § 27 sur un coffre **déjà pourvu**. Rend `null` quand il
 * n'y a rien à dire — jamais une phrase vide qui se lirait comme une absence de
 * risque.
 */
export function avertissementDeSecondAmorcage(
  etat: EtatDAmorcage,
  plafondAttendu: PlafondEnVigueur,
): readonly string[] | null {
  if (!etat.ancrePosee && etat.derniereVersionDuJeton === null) return null;

  // ⚠️ LE PLAFOND ANNONCÉ EST CELUI QUE LE COFFRE APPLIQUE, pas celui qu'on
  //    relit de l'environnement. Voir la note de `EtatDAmorcage.plafondDuCoffre`.
  const applique = etat.plafondDuCoffre;
  const valeur = applique ?? plafondAttendu.valeur;
  const origine = applique === null ? plafondAttendu.origine : "appliqué par le coffre";
  const reste = Math.max(0, valeur - etat.compte);
  return [
    `⚠️ CE COFFRE EST DÉJÀ POURVU. Amorçages comptés : ${String(etat.compte)} · ` +
      `plafond en vigueur : ${String(valeur)} (${origine}) · ` +
      `il en resterait ${String(reste)} après celui-ci` +
      (etat.derniereVersionDuJeton === null
        ? " · aucun jeton déposé (l'ancre existe sans jeton : un amorçage précédent a été " +
          "interrompu APRÈS le compte et AVANT le dépôt)."
        : ` · dernier jeton déposé en version ${String(etat.derniereVersionDuJeton)}.`),
    "Zoho PLAFONNE les jetons de rafraîchissement par client, et l'amorçage de trop " +
      "n'échoue PAS : il invalide le plus ancien. Si le jeton en place fonctionne, " +
      "N'AMORCEZ PAS — le geste utile est de TRANSFÉRER celui qui existe (voir `DEPS.md`).",
  ];
}

/**
 * **LE TÉMOIN DE DIVERGENCE.** Rend une ligne quand le plafond que le coffre
 * applique n'est pas celui que l'environnement annonce, et `null` sinon.
 *
 * ⚠️ **POURQUOI SIGNALER PLUTÔT QUE REFUSER.** Le coffre décide, quoi qu'il
 *    arrive : l'écart ne rend jamais un amorçage dangereux. Mais il rend le
 *    RAPPORT faux — « il vous reste 7 amorçages » alors que le coffre en refuse
 *    au 4ᵉ — et un rapport faux est ce qui fait percuter le mur en croyant
 *    avoir de la marge. C'est exactement le défaut que le § 27 nomme.
 */
export function ecartDeDerivationDuPlafond(
  etat: EtatDAmorcage,
  attendu: PlafondEnVigueur,
): string | null {
  if (etat.plafondDuCoffre === null || etat.plafondDuCoffre === attendu.valeur) return null;
  return (
    `⚠️ DEUX DÉRIVATIONS DU MÊME PLAFOND SE CONTREDISENT. Le coffre APPLIQUE ` +
    `${String(etat.plafondDuCoffre)} ; l'environnement en annonce ` +
    `${String(attendu.valeur)} (${attendu.origine}). C'est le coffre qui décide — il a reçu ` +
    `son plafond à sa construction. Poser ${VARIABLE_PLAFOND} et RELANCER, sinon le rapport ` +
    "annoncera une marge que rien n'applique."
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX ÉCRITURES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **POSE L'ANCRE SI ELLE MANQUE, PUIS COMPTE — DANS CET ORDRE.**
 *
 * Rend le compteur après incrément. **Lève** quand le plafond est atteint : le
 * refus vient de `Coffre.compterUnAmorcage()`, donc de l'écriture elle-même, et
 * ce module ne le prononce pas — il le laisse remonter.
 */
export async function compterCetAmorcage(
  coffre: Coffre,
  etat: EtatDAmorcage,
): Promise<CompteurDAmorcage> {
  if (!etat.ancrePosee) {
    await coffre.ecrire(NOM_DE_L_ANCRE, VERSION_DE_L_ANCRE, Buffer.from(CLAIR_DE_L_ANCRE, "utf8"));
  }
  return coffre.compterUnAmorcage(NOM_DE_L_ANCRE, VERSION_DE_L_ANCRE);
}

/** Ce qu'a fait le dépôt du jeton. Des numéros de version, jamais une valeur. */
export interface DepotDuJeton {
  readonly version: number;
  readonly versionPrecedente: number | null;
  readonly lignes: readonly string[];
}

/**
 * **DÉPOSE LE JETON EN VERSION NEUVE.**
 *
 * ⚠️ **IL N'ÉCRASE JAMAIS LA VERSION PRÉCÉDENTE**, et c'est le § 12 : « garder
 *    l'ancien refresh token valide pendant la propagation ». Entre le dépôt et
 *    la bascule de la production, les deux jetons sont valides chez Zoho — et
 *    c'est cette fenêtre qui rend le transfert possible sans interruption.
 *
 * ⚠️ **LA VERSION EST DÉRIVÉE DE CE QUI EST EN BASE**, jamais d'un compteur tenu
 *    à côté. Un numéro tenu ailleurs finirait par désigner une ligne existante,
 *    et l'écriture écraserait le jeton qu'elle croyait préserver.
 */
export async function deposerLeJeton(
  coffre: Coffre,
  versions: LecteurDeVersions,
  refreshToken: string,
): Promise<DepotDuJeton> {
  const versionPrecedente = await versions.derniereVersion(NOM_DU_REFRESH_TOKEN);
  const version = (versionPrecedente ?? 0) + 1;

  const clair = Buffer.from(refreshToken, "utf8");
  try {
    await coffre.ecrire(NOM_DU_REFRESH_TOKEN, version, clair);
  } finally {
    // Le coffre a chiffré une COPIE ; celle-ci n'a plus de raison de vivre.
    clair.fill(0);
  }

  return {
    version,
    versionPrecedente,
    lignes: [
      `Jeton déposé sous « ${NOM_DU_REFRESH_TOKEN} » version ${String(version)}` +
        (versionPrecedente === null
          ? " (première version de ce coffre)."
          : `, la version ${String(versionPrecedente)} est CONSERVÉE et reste valide chez ` +
            "Zoho le temps que la production bascule (§ 12)."),
      versionPrecedente === null
        ? "Rien à retirer : aucune version antérieure."
        : `⚠️ Une fois la production passée à la version ${String(version)}, la version ` +
          `${String(versionPrecedente)} ne sert plus. La laisser n'est pas neutre : c'est un ` +
          "jeton valide de plus en base, et le plafond de Zoho compte les jetons, pas les " +
          "lignes.",
    ],
  };
}

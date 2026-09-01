/**
 * axion-ops — `voice/commandes/grammaire.ts`
 *
 * LA GRAMMAIRE FERMÉE DES COMMANDES HORS MODÈLE (§ 30).
 *
 * ═══ CE QUE LE § 30 DEMANDE, ET POURQUOI C'EST UNE GRAMMAIRE FERMÉE ═══
 *
 * « Commandes hors modèle, triées — "Stop" et "brouillon seul" réduisent la
 *   surface : admises sans facteur. "Passe en mode dev" l'élargit : facteur,
 *   TTL, ligne au journal. »
 *
 * Et le critère de fin du lot 8 (§ 32) : « "stop" coupe SANS PASSER PAR LE
 * MODÈLE ». Un ordre d'arrêt qui attend une inférence n'est pas un ordre
 * d'arrêt : l'ADR 0010 mesure 1,1 à 1,5 s jusqu'au premier mot sur une session
 * déjà ouverte, contre 119 ms pour une reconnaissance en grammaire fermée.
 *
 * L'ADR 0010, § 4, donne le second motif — le seul qui soit MESURÉ :
 *
 *   grammaire fermée : « passe en mode developpement » | confiance 0,892 | 119 ms
 *   dictée libre     : « Qualiopi » → « Calliope », « OPCO » → « locaux »
 *                    | confiance 0,43 | 900 ms
 *
 *   ⚠️ BORNE DE CETTE MESURE, reprise de l'ADR pour qu'elle ne se perde pas en
 *      chemin : les deux régimes reconnaissaient de la PAROLE SYNTHÉTIQUE, pas
 *      la voix de Will au micro. Ce qui est établi, c'est l'ÉCART entre les deux
 *      régimes sur une entrée identique — pas un taux d'erreur humain.
 *
 * ═══ FERMÉE COMME `core/profiles/` L'EST ═══
 *
 * Le motif est repris tel quel de `core/profiles/profiles.ts` : la fermeture est
 * un fait de TYPE, obtenu au `pnpm typecheck`, pas un contrôle au runtime. Une
 * commande inconnue est une erreur de COMPILATION chez qui l'écrit — le démon,
 * la console, un test — et non un cas à traiter au runtime chez le démon qui la
 * reçoit. Au runtime il reste `estCommande()`, pour ce qui n'a pas traversé le
 * compilateur : une transcription, une ligne relue en base, un message reçu.
 *
 * ═══ CE FICHIER NE TRIE RIEN, ET NE RECONNAÎT RIEN ═══
 *
 * Il porte le VOCABULAIRE. Le tri « réduit / élargit » est dans `tri.ts` et il
 * est DÉRIVÉ de `core/profiles/reduitStrictement()` — jamais d'une colonne de ce
 * tableau. La reconnaissance est dans `reconnaissance.ts`.
 */

import { createHash } from "node:crypto";

import { jsonCanonique, type ProfileName } from "../../core/profiles/index.js";
import { POLICY_LEVELS, lePlusStrict, type PolicyLevel } from "../../core/types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'effet d'une commande SUR LA SURFACE EXPOSÉE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UNE COMMANDE DÉCLARE FAIRE À L'ENSEMBLE DES OUTILS EXPOSÉS — et rien
 * d'autre.
 *
 * ⚠️ NE PAS LE CONFONDRE AVEC `EffetSurLaSurface` DE `voice/etats/`. Le voisin
 *    nomme un VERDICT déjà rendu — « réduit » | « neutre » | « élargit ». Celui-ci
 *    nomme une DÉCLARATION : le profil ou le niveau visé, à partir duquel le
 *    verdict SE CALCULE, sur le catalogue du moment. Deux mots pour deux choses ;
 *    le même mot pour les deux ferait croire que la déclaration décide.
 *
 * C'est la seule chose que la grammaire déclare d'une commande, parce que c'est
 * la seule dont le § 20 ait besoin pour trancher. En particulier, LA GRAMMAIRE
 * NE DÉCLARE JAMAIS « celle-ci réduit » ou « celle-là élargit » : ce serait une
 * seconde source de vérité à côté de `reduitStrictement()`, et deux dérivations
 * d'un même fait finissent par se contredire — la colonne resterait juste
 * jusqu'au jour où un outil change de profil en console, sans redéploiement.
 *
 * Deux AXES, parce que « la surface » se mesure sur deux ensembles distincts et
 * que chacun a DÉJÀ, dans le socle, une autorité et une seule :
 *
 *  · `outils`    — l'ensemble des outils servis. Autorité : `reduitStrictement()`
 *                  de `core/profiles/budget.ts`.
 *  · `politique` — le niveau de garde-fou en vigueur. Autorité :
 *                  `classerChangement()` de `core/policy/desserrage.ts`.
 *
 * ⚠️ LES DEUX AUTORITÉS NE TRAITENT PAS LE NEUTRE DE LA MÊME FAÇON, et ce n'est
 *    pas une incohérence à corriger ici :
 *
 *     · `reduitStrictement` : « un changement qui ne retire rien n'a rien réduit
 *       — il ne se dispense donc pas du facteur » ;
 *     · `classerChangement` : « l'égalité est un resserrage — elle n'ouvre rien ».
 *
 *    Chacune tranche SON axe, et ce module suit chacune sur le sien. Les
 *    harmoniser reviendrait à écrire une troisième règle, c'est-à-dire à faire
 *    exactement ce que la règle de dérivation interdit.
 */
export type EffetDeclare =
  | {
      readonly axe: "outils";
      /**
       * Le profil visé, ou `null` quand la commande ne laisse RIEN d'exposé —
       * un arrêt de tour, un verrouillage du démon.
       *
       * ⚠️ `null` n'est pas « pas de changement » : c'est l'ENSEMBLE VIDE. La
       *    distinction porte tout le module — un ensemble d'arrivée vide ne peut
       *    faire GAGNER aucun outil, quel que soit le catalogue, et c'est cette
       *    propriété-là (pas un jugement porté sur le mot « stop ») qui rend la
       *    commande admissible sans facteur.
       */
      readonly versProfil: ProfileName | null;
    }
  | {
      readonly axe: "politique";
      readonly versNiveau: PolicyLevel;
    };

function jamaisAxe(effet: never): never {
  throw new Error(
    `voice/commandes/grammaire : axe d'effet non traité — ${JSON.stringify(effet)}. ` +
      "Tout axe nouveau doit être classé dans `peutElargir`, sans quoi il tomberait " +
      "du bon côté par défaut.",
  );
}

/**
 * CETTE COMMANDE PEUT-ELLE ÉLARGIR LA SURFACE, SOUS UN CATALOGUE QUELCONQUE ?
 *
 * C'est une propriété STRUCTURELLE : elle se répond sans catalogue, sans base et
 * sans politique — donc AVANT que le démon ait pu lire quoi que ce soit. C'est
 * ce qui permet à `reconnaissance.ts` de choisir son régime de tolérance sans
 * dépendre d'un état qu'un ordre d'arrêt ne peut pas attendre.
 *
 * `switch` exhaustif, motif de `canalDelivreUneConfirmation()` (§ 20) : ajouter
 * un axe sans le classer est une erreur de COMPILATION. Une liste blanche écrite
 * à la main laisserait un axe nouveau tomber du bon côté par défaut ; ici il ne
 * tombe nulle part tant qu'on ne l'a pas tranché.
 *
 * ⚠️ CE N'EST PAS LE TRI DU § 20, et les deux ne se remplacent pas. Celui-ci dit
 *    ce qui est POSSIBLE sous n'importe quel catalogue ; le tri dit ce qui se
 *    passe SOUS CELUI-CI. `tri.spec.ts` les confronte : aucune commande déclarée
 *    ici incapable d'élargir ne doit faire gagner un outil sous un catalogue
 *    fabriqué EXPRÈS pour lui en faire gagner.
 */
export function peutElargir(effet: EffetDeclare): boolean {
  switch (effet.axe) {
    case "outils":
      // Ensemble d'arrivée VIDE ⇒ aucun outil ne peut être gagné. Propriété de
      // l'ensemble vide, pas appréciation sur la commande.
      return effet.versProfil !== null;
    case "politique":
      // DÉRIVÉ de `lePlusStrict`, l'autorité du socle sur l'ordre des niveaux
      // (§ 12, règle 1) — jamais d'une arithmétique de rang réécrite ici. Un
      // niveau qui reste le plus strict FACE À TOUS LES AUTRES ne peut jamais
      // être plus permissif qu'un plancher en vigueur, donc `classerChangement`
      // ne rendra jamais « desserrage » pour lui.
      return !POLICY_LEVELS.every(
        (autre) => lePlusStrict(effet.versNiveau, autre) === effet.versNiveau,
      );
    default:
      return jamaisAxe(effet);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  La table des commandes
// ═════════════════════════════════════════════════════════════════════════════

/** Une entrée de la grammaire. */
export interface Commande {
  /** L'identifiant, écrit dans le journal et dans les tests. Jeu `[a-z0-9-]`. */
  readonly nom: string;
  /**
   * L'ÉNONCÉ CANONIQUE — ce qui est prononcé. C'est la seule forme qu'une
   * commande susceptible d'élargir accepte : voir `reconnaissance.ts`.
   */
  readonly enonce: string;
  /**
   * LES VARIANTES QU'UN FRANÇAIS PARLÉ PRODUIT VRAIMENT.
   *
   * ⚠️ ELLES NE SERVENT QU'AUX COMMANDES QUI NE PEUVENT PAS ÉLARGIR. Le
   *    reconnaisseur ne les consulte même pas pour les autres — ce n'est pas un
   *    filtre appliqué après coup, c'est un chemin qui n'existe pas. La garde de
   *    `grammaire.spec.ts` exige EN PLUS que toute commande capable d'élargir
   *    déclare une liste de variantes VIDE, pour qu'aucune ne dorme là en
   *    attendant qu'un futur reconnaisseur la lise.
   */
  readonly variantes: readonly string[];
  /** Ce que la commande fait à la surface exposée. */
  readonly effet: EffetDeclare;
  /** D'où elle vient — § du cahier des charges, ou ADR. Jamais « parce que ». */
  readonly source: string;
  /** Version de la grammaire où la commande est apparue. */
  readonly depuis: string;
}

/**
 * VERSION DE LA GRAMMAIRE. Le § 30 veut un jeu « fini, typé, versionné ».
 *
 * Elle change à chaque ajout, retrait ou renommage d'une commande, et à tout
 * changement d'`effet` ou d'`enonce` — jamais pour une variante ajoutée à une
 * commande qui ne peut pas élargir, ni pour une retouche de `source`.
 *
 * Elle est journalisée en `toolVersion` (voir `journal.ts`) : une ligne du
 * journal dit alors CONTRE QUELLE GRAMMAIRE la commande a été reconnue.
 */
export const GRAMMAIRE_VERSION = "1.0.0";

/**
 * LES CINQ COMMANDES HORS MODÈLE. Ce tableau est LA source ; tout le reste du
 * module en dérive — le type, les noms, le prédicat, l'empreinte, le tri.
 *
 * ⚠️ QUATRE VIENNENT DU § 30, LA CINQUIÈME DE L'ADR 0010. Le § 30 nomme « stop »,
 *    « annule », « brouillon seul », « passe en mode dev » dans son schéma, et
 *    décrit le verrouillage en prose (« le démon se verrouille après inactivité
 *    et redemande un facteur ») SANS nommer la commande qui le déclenche.
 *    L'ADR 0010, § 4, l'énumère explicitement avec les quatre autres :
 *    « "stop", "annule", "brouillon seul", "passe en mode dev", "verrouille" ».
 *    La colonne `source` porte cette distinction, plutôt que de la dissoudre.
 */
export const COMMANDES = [
  {
    nom: "stop",
    enonce: "stop",
    // Ce que dit un francophone qui veut couper la parole. Aucune n'est un
    // à-peu-près calculé : ce sont des formes ENTIÈRES, comparées par égalité
    // après normalisation. Voir `reconnaissance.ts`, qui n'a ni distance
    // d'édition ni correspondance partielle.
    variantes: ["stoppe", "arrête", "arrête-toi", "arrêtes-toi", "tais-toi", "chut", "silence"],
    effet: { axe: "outils", versProfil: null },
    source:
      "§ 30, schéma — « stop » · § 32, critère de fin : « stop coupe sans passer par le modèle »",
    depuis: "1.0.0",
  },
  {
    nom: "annule",
    enonce: "annule",
    variantes: ["annuler", "annulation", "laisse tomber", "oublie", "non annule"],
    effet: { axe: "outils", versProfil: null },
    source: "§ 30, schéma — « annule »",
    depuis: "1.0.0",
  },
  {
    nom: "verrouille",
    enonce: "verrouille",
    variantes: ["verrouiller", "verrouille-toi", "verrouillage", "ferme la session"],
    effet: { axe: "outils", versProfil: null },
    source: "ADR 0010, § 4 — énumérée · § 30, « Verrouillage » : le démon redemande un facteur",
    depuis: "1.0.0",
  },
  {
    nom: "brouillon-seul",
    enonce: "brouillon seul",
    variantes: [
      "mode brouillon",
      "brouillon uniquement",
      "passe en brouillon",
      "rien qu'un brouillon",
    ],
    effet: { axe: "politique", versNiveau: "brouillon" },
    source: "§ 30, schéma · § 20, tableau des niveaux — « brouillon » est le défaut",
    depuis: "1.0.0",
  },
  {
    nom: "mode-dev",
    enonce: "passe en mode dev",
    // VIDE, ET CE N'EST PAS UN OUBLI : cette commande peut élargir. La garde de
    // `grammaire.spec.ts` rougit si une variante y apparaît.
    variantes: [],
    effet: { axe: "outils", versProfil: "dev" },
    source: "§ 30, schéma — « passe en mode dev » · § 20 : suit le chemin du desserrage",
    depuis: "1.0.0",
  },
] as const satisfies readonly Commande[];

/**
 * LE TYPE FERMÉ. Une commande inconnue devient une erreur de COMPILATION chez
 * qui l'écrit — c'est le but de tout le fichier.
 */
export type NomCommande = (typeof COMMANDES)[number]["nom"];

/** Les noms seuls, DÉRIVÉS du tableau. Aucune liste écrite à la main. */
export const NOMS_COMMANDES: readonly NomCommande[] = COMMANDES.map((commande) => commande.nom);

const INDEX_COMMANDES: ReadonlyMap<string, Commande> = new Map<string, Commande>(
  COMMANDES.map((commande) => [commande.nom, commande]),
);

/**
 * PLAFOND DU NOMBRE DE COMMANDES.
 *
 * Motif, au-delà du chiffre : la mesure de 0,892 de confiance de l'ADR 0010 vaut
 * pour une grammaire de cet ordre de grandeur. Une grammaire fermée qui enfle
 * redevient une dictée — les énoncés se ressemblent, le moteur hésite, et la
 * commande la plus proche l'emporte. Le plafond n'est donc pas un confort
 * d'écriture : c'est ce qui maintient le régime dans lequel la mesure a été
 * faite.
 *
 * ⚠️ Le chiffre lui-même, 12, N'EST PAS MESURÉ — l'ADR ne mesure qu'un point,
 *    à cinq commandes. Il est écrit ici pour qu'un ajout soit une DÉCISION et
 *    non un accident de fusion. La mesure qui le fixerait est en tête des
 *    écarts du module.
 */
export const PLAFOND_COMMANDES = 12;

// ═════════════════════════════════════════════════════════════════════════════
//  Validation de ce qui vient d'AILLEURS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le type ferme la porte à la COMPILATION. Ce prédicat la ferme à ce qui entre
 * au RUNTIME sans passer par le compilateur : une commande relue au journal, un
 * nom reçu de la console, un identifiant reconstruit à partir d'une trace.
 */
export function estCommande(valeur: unknown): valeur is NomCommande {
  return typeof valeur === "string" && INDEX_COMMANDES.has(valeur);
}

/**
 * Comme `estCommande`, mais lève. Le message NOMME les commandes connues (§ 15,
 * deuxième règle : une erreur dit toujours ce qu'il faut faire ensuite), et la
 * liste du message est DÉRIVÉE.
 */
export function exigerCommande(valeur: unknown, ou: string): NomCommande {
  if (!estCommande(valeur)) {
    throw new Error(
      `Commande hors modèle inconnue en ${ou} : ${JSON.stringify(valeur)}. ` +
        `Les ${String(NOMS_COMMANDES.length)} commandes connues (grammaire ${GRAMMAIRE_VERSION}) ` +
        `sont : ${NOMS_COMMANDES.join(", ")}.`,
    );
  }
  return valeur;
}

/** L'entrée complète d'une commande. Le type garantit qu'elle existe. */
export function commande(nom: NomCommande): Commande {
  const trouvee = INDEX_COMMANDES.get(nom);
  if (trouvee === undefined) {
    // Inatteignable tant que `INDEX_COMMANDES` est construit depuis `COMMANDES`.
    // Écrit quand même : `noUncheckedIndexedAccess` est actif, et un repli muet
    // vaudrait une commande silencieusement absente.
    throw new Error(
      `voice/commandes/grammaire : « ${nom} » est dans le type mais pas dans l'index. ` +
        "L'index et la table ont divergé — corriger `COMMANDES`.",
    );
  }
  return trouvee;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Déclaration côté appelant — la fermeture à la COMPILATION
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le type d'une liste de commandes non vide : ce qu'un écran de console, un jeu
 * de tests ou une configuration de démon déclare.
 *
 * NON VIDE, à dessein, pour le motif exact de `ProfilsDeclares` : un démon qui
 * ne reconnaît aucune commande hors modèle est un démon dont « stop » passe par
 * le modèle, c'est-à-dire précisément ce que le § 32 refuse. Ce n'est pas une
 * configuration, c'est une panne — et une panne qui se déploie.
 */
export type CommandesDeclarees = readonly [NomCommande, ...NomCommande[]];

/**
 * À appeler partout où une liste de commandes est écrite à la main. Son seul
 * travail est d'être un point où le compilateur REFUSE.
 *
 * ```ts
 * declarerCommandes(["stop", "annule"]);   // ✅
 * declarerCommandes(["mode-admin"]);       // ❌ erreur de COMPILATION
 * declarerCommandes([]);                   // ❌ erreur de COMPILATION
 * ```
 */
export function declarerCommandes<const T extends CommandesDeclarees>(commandes: T): T {
  return commandes;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Empreinte et sceau de la grammaire
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Empreinte SHA-256 du JSON canonique de la grammaire, version comprise.
 *
 * MOTIF, transposé de `empreinteProfils()` : le démon vocal est un SECOND
 * PROGRAMME (ADR 0010, § 6), lancé à part, mis à jour à part. Rien ne garantit
 * qu'il porte la même grammaire que le socle qui journalise ses commandes. Deux
 * grammaires divergentes restent l'une et l'autre valides, et la divergence ne
 * se voit nulle part — sauf par cette empreinte, qui la rend visible d'un seul
 * octet.
 *
 * `variantes` et `source` sont HORS de l'empreinte : la première est de la
 * prose d'usage — en ajouter une à une commande qui ne peut pas élargir ne
 * change ni ce qui est reconnu comme élargissant, ni ce qui est admis sans
 * facteur ; la seconde est une référence documentaire.
 *
 * ⚠️ `enonce` et `effet` Y SONT, eux. Ce sont les deux champs dont dépend une
 *    décision de sécurité : ce qu'il faut dire exactement pour élargir, et ce
 *    que la commande fait à la surface.
 *
 * Le paramètre existe pour que la garde fabrique un TÉMOIN altéré et prouve que
 * l'empreinte bouge. Une empreinte qu'on ne peut pas faire bouger n'a jamais été
 * vérifiée.
 */
export function empreinteGrammaire(
  commandes: readonly Commande[] = COMMANDES,
  version: string = GRAMMAIRE_VERSION,
): string {
  const canonique = jsonCanonique(
    {
      version,
      commandes: commandes.map((entree) => ({
        nom: entree.nom,
        enonce: entree.enonce,
        effet: entree.effet,
        depuis: entree.depuis,
      })),
    },
    "$.commandes",
  );
  return createHash("sha256").update(canonique, "utf8").digest("hex");
}

/** LE SCEAU DE LA GRAMMAIRE : sa version, et son empreinte. Calculé une fois. */
export const SCEAU_GRAMMAIRE = {
  version: GRAMMAIRE_VERSION,
  empreinte: empreinteGrammaire(),
} as const;

export type SceauGrammaire = { readonly version: string; readonly empreinte: string };

/**
 * `core/coutures/contrat.ts` — **CE QUE LA GARDE DE COUTURE DOIT RENDRE.**
 *
 * ═══ CE FICHIER NE CONTIENT AUCUNE IMPLÉMENTATION, ET C'EST DÉLIBÉRÉ ═══
 *
 * L'architecte du lot 1d pose les formes ; le constructeur ① écrit le corps dans
 * `core/coutures/registre.spec.ts` et le témoin dans
 * `core/coutures/couture.temoin.spec.ts`. Poser ici une fonction qui lève —
 * « non implémentée » — aurait fabriqué une mine : un appelant l'aurait trouvée
 * exportée, et la panne serait arrivée à l'exécution plutôt qu'à la lecture.
 *
 * ⚠️ **AUCUNE VALEUR N'EST EXPORTÉE PAR CE FICHIER.** Rien ne peut donc être
 *    appelé par mégarde, et le registre ne compte pas ce module parmi les
 *    symboles qu'il surveille.
 *
 * ═══ LES QUATRE PROPRIÉTÉS QUE LE CONSTRUCTEUR DOIT TENIR ═══
 *
 *  1. **La garde ne porte pas sa liste.** Elle la lit dans
 *     `REGISTRE_DES_COUTURES`. Une garde qui énumérerait les symboles serait une
 *     seconde source de vérité, et c'est la seconde qui ne suit jamais.
 *  2. **Elle annonce des NOMBRES, jamais une couleur.** Combien de symboles
 *     confrontés, combien de modules de production balayés, et pour CHAQUE
 *     symbole combien d'appelants trouvés — avec leurs noms. Un verdict qui ne
 *     dirait que « conforme » serait vert le jour où il ne lit plus rien.
 *  3. **Elle rougit dans les deux sens.** Une entrée `cousue` qui perd son
 *     dernier appelant, une entrée `à-coudre` qui en gagne un : les deux sont
 *     des anomalies, parce que les deux rendent la prose de l'ADR fausse.
 *  4. **Elle est une FONCTION PURE d'un ensemble de fichiers.** C'est ce qui
 *     rend le témoin possible : lui passer un jeu de fichiers FABRIQUÉ, dont on
 *     a retiré l'unique appelant d'un symbole, et exiger une anomalie. Une garde
 *     qui lirait le disque depuis son propre corps ne serait éprouvable qu'en
 *     mutilant le dépôt.
 */

import type { EntreeDeCouture, GenreDeSymbole } from "./registre.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LA GARDE LIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un fichier soumis à la garde — son chemin depuis la racine du dépôt, et son
 * source BRUT.
 *
 * ⚠️ LE SOURCE EST BRUT, ET LE RETRAIT DES COMMENTAIRES APPARTIENT À LA GARDE.
 *    C'est ce qui permet au témoin de fabriquer un fichier qui CITE un symbole
 *    dans un commentaire et d'exiger qu'il ne soit pas compté : le défaut a été
 *    mesuré au lot 1c, où deux modules nommaient `cumulerChampsDeGouvernance()`
 *    dans un bloc JSDoc, parenthèses comprises.
 */
export interface FichierSoumis {
  readonly chemin: string;
  readonly source: string;
}

/**
 * COMMENT LA GARDE DÉCIDE QU'UN FICHIER EST DE PRODUCTION.
 *
 * ⚠️ **DÉRIVÉ D'`exclude` DE `tsconfig.build.json`, JAMAIS ÉCRIT.** C'est le
 *    critère de la garde G2 de `core/chaine/identite.spec.ts`, et c'est le bon :
 *    ce qui rend une décision non cousue dangereuse est qu'elle N'ATTEINT PAS ce
 *    qui TOURNE. Un fichier que `pnpm build` n'émet pas n'exécute rien.
 *
 * 🔴 **CE CRITÈRE NE SUFFIT PAS AUJOURD'HUI, ET L'ADR 0019 LE CORRIGE À LA
 *    SOURCE.** `tsconfig.build.json` exclut les fichiers `.spec.ts` et rien d'autre
 *    d'utile ici : `core/epreuve/outils.ts`, `core/audit/fixtures.ts` et
 *    `core/identite/fixtures.ts` sont donc ÉMIS PAR `pnpm build`. Un symbole dont
 *    l'unique appelant serait une fabrique de témoins passerait pour cousu.
 *
 *    Le remède n'est pas une seconde liste dans la garde — ce serait la liste
 *    qu'elle ne doit pas porter. C'est d'ajouter le dossier `core/epreuve/` et
 *    tout fichier `fixtures.ts` à l'`exclude` de `tsconfig.build.json`, ce qui est de
 *    toute façon la vérité : aucun module de production n'en importe un seul.
 *    La garde reste alors une pure dérivation.
 */
export interface CritereDeProduction {
  /** `true` quand `pnpm build` émet ce fichier. */
  readonly estLivre: (chemin: string) => boolean;
  /** Combien de motifs d'exclusion ont été lus. Un ZÉRO rend le critère vacuous. */
  readonly motifsLus: number;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LA GARDE REND
// ═════════════════════════════════════════════════════════════════════════════

/** Le verdict porté sur UNE entrée du registre. Des noms et des nombres. */
export interface VerdictDUneCouture {
  readonly entree: EntreeDeCouture;
  /**
   * Les modules de production qui appellent, lisent ou importent le symbole —
   * le DÉFINISSEUR exclu.
   *
   * ⚠️ EXCLURE LE DÉFINISSEUR N'EST PAS UN DÉTAIL : sans cette distinction, un
   *    module qui porte la fonction se compte lui-même comme son propre
   *    appelant, et la garde annonce « 1 appelant » sur une fonction morte.
   */
  readonly appelants: readonly string[];
  /** Les fichiers qui NOMMENT le symbole dans un commentaire seulement. */
  readonly citationsEnProse: readonly string[];
  /** Le symbole est-il DÉFINI quelque part sur le disque ? */
  readonly defini: boolean;
  /** Ce que la garde reproche à cette entrée, ou une liste vide. */
  readonly anomalies: readonly string[];
}

/**
 * Le rapport de la garde. **JAMAIS un booléen seul** — c'est la règle de tout ce
 * dépôt, et elle vaut d'abord pour la garde qui surveille les autres.
 */
export interface RapportDesCoutures {
  /** Fichiers soumis, tous genres confondus. */
  readonly fichiersSoumis: number;
  /** Fichiers retenus comme modules de PRODUCTION, et donc réellement balayés. */
  readonly modulesDeProduction: number;
  /** Entrées du registre confrontées. Un zéro ici est le pire des verts. */
  readonly symbolesConfrontes: number;
  /** Répartition par état, DÉRIVÉE du registre — jamais recomptée à la main. */
  readonly parEtat: Readonly<Record<string, number>>;
  /** Répartition par genre, pour qu'une règle de forme muette se voie. */
  readonly parGenre: Readonly<Record<GenreDeSymbole, number>>;
  /** Entrées qui délèguent leur mesure à une garde nommée. Bornée, et comptée. */
  readonly mesuresDeleguees: number;
  readonly verdicts: readonly VerdictDUneCouture[];
  /** L'union des anomalies, à confronter à `[]`. */
  readonly anomalies: readonly string[];
}

/**
 * LA GARDE ELLE-MÊME — une fonction PURE de ce qu'on lui donne.
 *
 * @param fichiers l'ensemble à balayer. Le témoin lui en passe un FABRIQUÉ.
 * @param registre les entrées à confronter. Le témoin lui en passe une seule.
 * @param critere ce qui distingue un module de production d'un fichier de test.
 */
export type VerifierLesCoutures = (
  fichiers: readonly FichierSoumis[],
  registre: readonly EntreeDeCouture[],
  critere: CritereDeProduction,
) => RapportDesCoutures;

// ═════════════════════════════════════════════════════════════════════════════
//  LA SECONDE GARDE — LA COUVERTURE DES ADR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que la garde de COUVERTURE rend.
 *
 * ⚠️ **C'EST ELLE QUI REND UN ADR NEUF IMPOSSIBLE À OUBLIER.** Elle ne lit pas
 *    le registre pour savoir quels ADR existent — elle lit `docs/adr/`. Un ADR
 *    qui atterrit sans entrée fait donc monter `adrTrouves` sans faire monter
 *    `adrCouverts`, et l'écart est l'anomalie.
 *
 * ⚠️ ET ELLE LIT LE STATUT. Un ADR `proposée` peut légitimement n'avoir aucun
 *    symbole ; un ADR `acceptée` qui serait `hors-code` doit porter un motif
 *    écrit. Le statut se lit dans l'en-tête du fichier : si le format change, le
 *    compte des statuts lus TOMBE, et le plancher le dit.
 */
export interface RapportDeCouvertureDesAdr {
  /** Fichiers `NNNN-*.md` trouvés dans `docs/adr/`. Plancher-témoin obligatoire. */
  readonly adrTrouves: number;
  /** Numéros distincts inscrits au registre. */
  readonly adrCouverts: number;
  /** ADR dont l'en-tête a livré un statut lisible. Un effondrement se voit ici. */
  readonly statutsLus: number;
  /** ADR acceptés — ceux dont on exige davantage. */
  readonly adrAcceptes: number;
  /** ADR trouvés sur le disque et ABSENTS du registre. C'est l'anomalie n° 1. */
  readonly adrSansEntree: readonly string[];
  /** Entrées du registre désignant un ADR qui n'existe pas. L'anomalie miroir. */
  readonly entreesFantomes: readonly string[];
  readonly anomalies: readonly string[];
}

/** La garde de couverture — pure elle aussi, pour la même raison. */
export type VerifierLaCouvertureDesAdr = (
  fichiersAdr: readonly FichierSoumis[],
  registre: readonly EntreeDeCouture[],
) => RapportDeCouvertureDesAdr;

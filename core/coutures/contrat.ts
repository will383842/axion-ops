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

// ═════════════════════════════════════════════════════════════════════════════
//  LA TROISIÈME GARDE — L'ASSERTION (ADR 0041)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ POURQUOI UNE TROISIÈME GARDE, ALORS QUE LA PREMIÈRE EST VERTE ═══
 *
 * G1 mesure **les appelants de production d'un symbole**. C'est utile, c'est
 * honnête, et **ce n'est pas la même chose que « la décision a atterri »**. Les
 * deux faits se séparent exactement là où personne ne regarde : quand une
 * décision NEUVE porte sur un symbole DÉJÀ COUSU. Le symbole garde ses
 * appelants, l'entrée reste `cousue`, G1 reste verte — et la décision n'existe
 * nulle part dans le code.
 *
 * Ce n'est pas une conjecture. Deux ADR marqués « Statut : acceptée » sont
 * passés au travers dans le même lot : l'ADR 0036 (le plafond de 40 à
 * l'étape 7) et l'ADR 0037 (`journalDesRefus` et `delaiDeReprise` sur
 * `PortsDuService`, symbole déjà cousu depuis le lot 2).
 *
 * G4 mesure le SECOND fait, et les deux ne se confondent jamais :
 *
 *  · **G1 — `appelants`** : combien de modules de production appellent le
 *    symbole ;
 *  · **G4 — `assertion`** : quel test ÉCHOUE si la décision n'a pas atterri.
 *
 * ⚠️ **ET G4 SE SURVEILLE ELLE-MÊME.** La garde des assertions est une décision
 *    comme les autres : elle porte son entrée au registre, et cette entrée
 *    porte une assertion. Le rapport du lot 3 écrivait « ET JE SUIS LOGÉ À LA
 *    MÊME ENSEIGNE » d'un mécanisme qui ne se mesurait pas lui-même ; ce
 *    contrat-ci refuse cette phrase.
 */

/** Ce que G4 reproche — ou non — à UNE entrée du registre. */
export interface VerdictDUneAssertion {
  readonly entree: EntreeDeCouture;
  /** Le fichier nommé par l'assertion figure-t-il parmi les fichiers soumis ? */
  readonly fichierTrouve: boolean;
  /** Un `it`/`it.fails`/`test` portant ce nom EXACT y est-il déclaré ? */
  readonly testTrouve: boolean;
  /**
   * Le test est-il déclaré `it.fails` — une DETTE NOMMÉE, non une garde vivante ?
   *
   * ⚠️ **DÉRIVÉ DE LA SOURCE, JAMAIS DÉCLARÉ AU REGISTRE.** Un champ `dette:
   *    true` écrit à la main serait une seconde source de vérité, et c'est la
   *    seconde qui ne suit jamais. La garde LIT la forme sur le disque.
   */
  readonly enDette: boolean;
  /**
   * Le nombre de caractères du corps isolé. **Zéro veut dire que l'isolement a
   * ÉCHOUÉ**, et c'est une anomalie : un corps vide ferait passer tous les
   * contrôles suivants pour des « rien à redire ».
   */
  readonly octetsDuCorps: number;
  /** Combien d'`expect(` le corps porte. Zéro = un test qui n'assère RIEN. */
  readonly assertionsDansLeCorps: number;
  /**
   * Combien de ces `expect(` peuvent RÉELLEMENT échouer — ceux dont l'argument
   * confronte autre chose que des littéraux.
   *
   * ⚠️ **C'EST LA MOITIÉ QUI MANQUAIT À G4, ET L'ÉPREUVE DU LOT 4 L'A MESURÉE.**
   *    Compter les `expect(` fermait le cas ZÉRO — « un test qui n'assère rien »
   *    — et laissait grand ouvert le cas voisin : `expect(1).toBe(1)` EST un
   *    `expect(`, et il est vert quoi qu'il arrive. Une entrée pouvait donc être
   *    fermée par un test qui ne peut pas rougir, dans le mécanisme même que
   *    l'ADR 0041 a posé pour l'empêcher.
   *
   * ⚠️ **LA MESURE PORTE SUR `corps.code`, CHAÎNES BLANCHIES.** `expect("abc")`
   *    y devient `expect()` : un littéral de chaîne n'est pas un identifiant et
   *    ne compte pas. Un argument portant au moins un caractère d'identifiant —
   *    `expect(rapport.sansAssertion)` — confronte une valeur calculée, la seule
   *    chose qu'une mutation de la décision puisse faire changer.
   */
  readonly expectsFalsifiables: number;
  /**
   * Le test est-il enfermé dans une suite SUSPENDUE — un `describe.skip`,
   * `.todo` ou `.only` posé plus haut ?
   *
   * ⚠️ **UNE GARDE QUI MORD SUR UNE FORME ET PAS SUR SON ÉQUIVALENT SE
   *    CONTOURNE SANS LE SAVOIR.** G4 mordait déjà sur `it.skip` — le test n'y
   *    est alors plus trouvé, donc une anomalie — et ne mordait PAS sur la MÊME
   *    suspension posée d'un cran au-dessus : `describe.skip` laisse la
   *    déclaration `it("…")` intacte dans le texte, G4 la trouvait, et vitest
   *    n'exécutait rien. Une entrée pouvait ainsi être gardée par un test qui
   *    n'a jamais tourné.
   */
  readonly suspendu: boolean;
  /** Combien de noms l'entrée exige du corps. Zéro = une assertion sans objet. */
  readonly nomsAttendus: number;
  /** Ceux de ces noms que le corps ne cite pas. */
  readonly nomsAbsents: readonly string[];
  /**
   * Ceux de ces noms que le corps ne cite QUE dans un littéral de chaîne —
   * présents dans `brut`, absents de `code`.
   *
   * ⚠️ **CE N'EST PAS UN REPROCHE, C'EST UNE PART ANNONCÉE.** Un test qui LIT
   *    une source du dépôt et y cherche un nom porte légitimement ce nom dans un
   *    littéral : `expect(bloc).toContain("PLAFOND_OUTILS_PAR_PROFIL")` y EST la
   *    mesure. Un `console.info("… journalDesRefus …")` n'est que du décor, et
   *    satisfait le critère `nomme` tout aussi bien. **G4 ne peut pas trancher
   *    entre les deux**, et c'est pour cela que la part concernée est COMPTÉE au
   *    lieu d'être invisible : ce qu'une garde ne sait pas trancher, elle
   *    l'annonce.
   */
  readonly nomsEnLitteralSeul: readonly string[];
  readonly anomalies: readonly string[];
}

/**
 * LE RAPPORT DE G4. **Des nombres, jamais une couleur** — et le nombre central
 * est `sansAssertion` : c'est LA MESURE QUI MANQUAIT AU PROJET.
 */
export interface RapportDesAssertions {
  /** Entrées du registre confrontées, tous états confondus. */
  readonly entreesConfrontees: number;
  /** Entrées portant une assertion NOMMÉE (qu'elle soit vivante ou en dette). */
  readonly avecAssertion: number;
  /**
   * Entrées dont aucun test ne dirait qu'elles se sont défaites. **Ce n'est pas
   * une faute par entrée : c'est le chiffre du dossier**, et le cliquet qui le
   * garde interdit seulement qu'il MONTE.
   */
  readonly sansAssertion: number;
  /** Assertions portées par un `it.fails` — une dette nommée, et comptée. */
  readonly enDette: number;
  /** Répartition, dans la forme de `parEtat` — pour qu'elle se lise du même œil. */
  readonly parAssertion: Readonly<Record<string, number>>;
  /** ADR distincts inscrits au registre. Le dénominateur de la mesure. */
  readonly adrConfrontes: number;
  /** ADR dont AUCUNE entrée ne porte d'assertion. **Le chiffre demandé.** */
  readonly adrSansAucuneAssertion: readonly string[];
  /**
   * **LE DÉFAUT CENTRAL DU LOT 4, NOMMÉ ET COMPTÉ** : les entrées dont le
   * SYMBOLE a des appelants de production (`cousue`) et dont la DÉCISION n'a
   * pas atterri (assertion sous `it.fails`).
   *
   * ⚠️ CE N'EST PAS UNE ANOMALIE, ET LE CONFONDRE AVEC UNE ANOMALIE SERAIT
   *    RECONFONDRE LES DEUX FAITS. Les deux propositions sont VRAIES
   *    simultanément ; c'est leur cohabitation silencieuse qui était le
   *    défaut, pas leur existence. La liste sort d'ici NOMMÉE, et c'est à
   *    l'appelant de tenir le cliquet dessus.
   */
  readonly cousuesNonAtterries: readonly string[];
  /**
   * **L'IDENTITÉ des entrées sans assertion, pas seulement leur nombre.**
   *
   * ⚠️ **UNE SOMME SE COMPENSE, ET L'ÉPREUVE DU LOT 4 L'A MONTRÉ SUR LE
   *    REGISTRE RÉEL.** Le seul mécanisme qui obligeait une décision NEUVE à
   *    être vue par un test était un cliquet sur le TOTAL `sansAssertion`.
   *    Inscrire une décision aveugle (+1) et poser une assertion sur une entrée
   *    ancienne qui n'en avait pas (−1) laisse ce total à l'identique : 88 avant,
   *    88 après, zéro anomalie. Le défaut central du lot rentrait par la porte
   *    que le lot avait posée.
   *
   * ⚠️ **CE CHAMP NE JUGE PAS, IL NOMME** — comme {@link cousuesNonAtterries},
   *    et pour la même raison : la liste des 88 entrées légitimement sans
   *    assertion est un fait daté du dépôt, pas une faute par entrée. C'est à
   *    l'appelant de figer cette liste et de faire rougir toute IDENTITÉ qui n'y
   *    figurait pas. Le nombre ne suffit plus, la liste ne se compense pas.
   */
  readonly sansAssertionNommees: readonly string[];
  /**
   * Les assertions désignées par PLUSIEURS entrées — « fichier › nom (n) ».
   *
   * ⚠️ **UN MÊME TEST QUI FERME DEUX DÉCISIONS N'EST PAS UNE FAUTE, ET C'EST
   *    POURQUOI IL EST COMPTÉ PLUTÔT QUE REPROCHÉ.** L'ADR 0036 et l'ADR 0043
   *    portent la MÊME règle — le plafond de quarante à l'étape 7 — et il serait
   *    faux d'exiger deux tests là où la décision est une. Mais c'est aussi la
   *    forme exacte que prend la compensation ci-dessus : recopier une assertion
   *    existante sur une entrée qui n'en avait pas. Le partage est donc rendu
   *    VISIBLE, et l'appelant tient le cliquet sur la liste.
   */
  readonly assertionsPartagees: readonly string[];
  /** Fichiers de garde distincts réellement ouverts. Un zéro rend G4 vacuous. */
  readonly fichiersDAssertionDistincts: number;
  /** Noms exigés, tous confondus. Le dénominateur de `nomsEnLitteralSeul`. */
  readonly nomsExiges: number;
  /** Ceux d'entre eux qui ne vivent que dans un littéral. Une part, pas une faute. */
  readonly nomsEnLitteralSeul: number;
  readonly verdicts: readonly VerdictDUneAssertion[];
  readonly anomalies: readonly string[];
}

/** G4 — pure elle aussi, et pour la même raison que G1 : le témoin fabriqué. */
export type VerifierLesAssertions = (
  fichiers: readonly FichierSoumis[],
  registre: readonly EntreeDeCouture[],
) => RapportDesAssertions;

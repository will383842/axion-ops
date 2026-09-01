/**
 * `core/adapter-kit/capacite.ts` — **CE QUI REFERME UN CHAMP SE MESURE EN
 * CAPACITÉ, JAMAIS PAR TROIS TÉMOINS.**
 *
 * ═══ CE FICHIER NE CONTIENT AUCUNE IMPLÉMENTATION, ET C'EST DÉLIBÉRÉ ═══
 *
 * L'architecte du lot 3 pose la borne et la forme de la mesure ; le constructeur
 * écrit le corps dans `champs-declares.ts` et le corpus dans
 * `champs-declares.temoin.spec.ts`. Poser ici une fonction qui lève aurait
 * fabriqué une mine : un appelant l'aurait trouvée exportée, et la panne serait
 * arrivée à l'exécution plutôt qu'à la lecture. Même tenue que
 * `core/transport/contrat.ts` et `core/coutures/contrat.ts`.
 *
 * ═══ LE DÉFAUT QUE CE MODULE EXISTE POUR FERMER — MESURÉ, PAS SUPPOSÉ ═══
 *
 * `patternReferme` jugeait qu'un `pattern` referme un champ à trois conditions :
 * il compile, il est ancré aux deux bouts, et il rejette les TROIS
 * `TEMOINS_DE_PROSE`. Or ces trois témoins ne se distinguent de la prose
 * ordinaire que par des ACCENTS et par la PONCTUATION D'URL. Mesure transcrite
 * de l'audit de bout en bout :
 *
 *  · motif `^[A-Za-z0-9 ,.'()-]{1,2000}$` → réputé FERMANT ;
 *  · charge de 214 caractères — la traduction ASCII d'une consigne injectée —
 *    ACCEPTÉE par le motif ;
 *  · `estValeurLibre` → `false`, l'étape 11 AUTORISE sans confirmation aux trois
 *    niveaux ; le MÊME champ sans `pattern` exige une confirmation à `libre`.
 *
 * **Un jeu de témoins n'a jamais prouvé une fermeture. Il ne peut que
 * l'infirmer.** Trois phrases décidaient d'une propriété universelle. Ce qui
 * décide désormais est la CAPACITÉ du langage accepté — combien de caractères
 * l'appelant peut y loger —, et les témoins deviennent un filet subordonné dont
 * la garde annonce le compte.
 *
 * Voir **ADR 0035**. Voir aussi **ADR 0015** : c'est le même pouvoir — retirer
 * une surveillance par déclaration — refermé sur une autre porte.
 *
 * ⚠️ **AUCUNE VALEUR CALCULÉE N'EST EXPORTÉE PAR CE FICHIER.** Il porte une
 *    borne et des formes. Rien ne peut donc être appelé par mégarde.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LA BORNE, ET SON ENCADREMENT PAR LES DEUX BOUTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE NOMBRE MAXIMAL DE CARACTÈRES QU'UN MOT-CLÉ PEUT ADMETTRE EN REFERMANT
 * ENCORE LE CHAMP.
 *
 * ⚠️ **IL N'EST PAS ÉLU, IL EST ENCADRÉ — ET LES DEUX BORNES DE L'ENCADREMENT
 *    SONT DES MESURES DÉJÀ PRÉSENTES DANS LE DÉPÔT.**
 *
 *  · **Borne HAUTE — strictement en deçà de ce que le socle appelle lui-même une
 *    phrase.** `LONGUEUR_RACCOURCIE` (`core/chaine/etape-14-execution.ts`) vaut
 *    160 et porte sa justification : « un extrait de 160 points de code garde
 *    une phrase entière et une amorce de la suivante, ce qui suffit à ce qu'un
 *    modèle reconnaisse un message ». Un champ capable d'en porter 160 porte
 *    donc une phrase, PAR LA MESURE DU SOCLE. La fermeture doit être en deçà.
 *  · **Borne BASSE — au moins la plus longue valeur que le socle tient déjà pour
 *    fermée par une AUTRE voie.** `FORMATS_CONTRAIGNANTS` retient `ipv6`, dont
 *    la forme textuelle la plus longue pèse 45 caractères. Poser la borne en
 *    dessous ferait juger LIBRE un `pattern` qui réécrit exactement ce qu'un
 *    `format` referme : deux dérivations d'un même fait qui se contredisent,
 *    c'est-à-dire le défaut que l'ADR 0003 nomme.
 *
 * `45 ≤ 64 < 160`. La valeur retenue est en outre celle de `LONGUEUR_EMPREINTE`
 * (`core/audit/vocabulaire.ts`) — **le plus long identifiant que le socle frappe
 * lui-même**, une empreinte SHA-256 en hexadécimal. Un motif qui admet davantage
 * que le plus long identifiant du socle ne décrit plus un identifiant.
 *
 * ⚠️ **L'ENCADREMENT EST UNE GARDE, PAS CE PARAGRAPHE.** La garde CONFRONTE
 *    cette valeur à `LONGUEUR_RACCOURCIE` — importée, jamais recopiée — et aux
 *    quatre exemplaires de format, et elle les ANNONCE. Le jour où l'un des deux
 *    nombres bouge, l'encadrement rougit au lieu de vieillir en silence.
 *
 * ⚠️ **CE QUE CE NOMBRE NE DIT PAS.** 64 caractères portent une adresse de
 *    courriel, une URL courte, une consigne de 44 caractères. Cette borne
 *    empêche un `pattern` d'ACHETER l'exonération sur de la prose ; elle ne rend
 *    aucun champ inoffensif. Le destinataire d'un envoi relève des champs de
 *    gouvernance (ADR 0016) et du cliquet de l'étape 11 — jamais d'ici.
 */
export const BORNE_DE_FERMETURE = 64;

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LA MESURE REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POURQUOI UNE MESURE N'A PAS PU ÊTRE BORNÉE.
 *
 * ⚠️ **CHAQUE RAISON EST UN `null` DE LONGUEUR MAXIMALE, DONC UN CHAMP LIBRE.**
 *    La direction est fail-closed sans exception : ce qu'on ne sait pas borner
 *    reste surveillé. Le seul risque résiduel est l'inverse — refuser la
 *    fermeture à un motif honnête —, et il coûte une confirmation, jamais une
 *    fuite.
 */
export const RAISONS_DE_NON_BORNE = [
  /** `*`, `+` ou `{n,}` appliqués à quelque chose qui consomme un caractère. */
  "quantificateur-non-borne",
  /** `(?=`, `(?!`, `(?<=`, `(?<!` — une vision ne consomme rien et peut tout dire. */
  "avant-ou-arriere-vision",
  /** `\1` — la longueur dépend d'une capture, donc du texte, pas du motif. */
  "reference-arriere",
  /** Le parcours a rencontré une construction hors du sous-ensemble reconnu. */
  "syntaxe-hors-sous-ensemble",
  /** `new RegExp` a levé : un motif illisible ne referme rien. */
  "motif-qui-ne-compile-pas",
] as const;

/** La raison pour laquelle la borne n'a pas pu être dérivée. */
export type RaisonDeNonBorne = (typeof RAISONS_DE_NON_BORNE)[number];

/**
 * CE QUE LA MESURE D'UN `pattern` REND. **JAMAIS UN BOOLÉEN SEUL.**
 *
 * Sans les comptes, une mesure qui n'aurait lu AUCUN nœud rendrait une borne, et
 * l'absence d'alerte se lirait comme une absence de problème — c'est le défaut
 * que tout ce dépôt combat, appliqué ici au parcours d'un motif.
 */
export interface MesureDeCapacite {
  /** Le motif soumis, tel quel. Il est de la donnée d'adaptateur : jamais exécuté ailleurs. */
  readonly motif: string;
  /** `new RegExp(motif, "u")` n'a pas levé. */
  readonly compile: boolean;
  /** Le motif commence par `^` ET finit par `$`. */
  readonly ancreAuxDeuxBouts: boolean;
  /**
   * Le nombre maximal de caractères que le langage accepté peut porter, ou
   * `null` quand le parcours n'a pas su le borner.
   *
   * ⚠️ `null` NE REFERME JAMAIS. C'est la seule lecture admise.
   */
  readonly longueurMaximale: number | null;
  /** Laquelle des cinq raisons a produit le `null`. `null` quand la borne existe. */
  readonly raisonDeNonBorne: RaisonDeNonBorne | null;
  /**
   * Combien d'atomes le parcours a réellement lus.
   *
   * ⚠️ **UN ZÉRO REND LA MESURE VACUOUS**, et c'est le compte qui le dit : une
   *    borne rendue sans avoir rien lu serait verte pour la pire des raisons.
   */
  readonly noeudsLus: number;
  /** Combien de témoins de prose ont été confrontés au motif. */
  readonly temoinsConfrontes: number;
  /** Combien, parmi eux, le motif REJETTE. Le filet subordonné, compté. */
  readonly temoinsRejetes: number;
  /**
   * Le verdict — les quatre conditions de l'ADR 0035 tenues ENSEMBLE :
   * compile, ancré aux deux bouts, `longueurMaximale ≤ BORNE_DE_FERMETURE`, et
   * tous les témoins rejetés.
   */
  readonly referme: boolean;
}

/**
 * LA MESURE — une fonction PURE du motif.
 *
 * ⚠️ **LE SOUS-ENSEMBLE DE SYNTAXE RECONNU EST DÉCLARÉ, ET TOUT CE QUI EN SORT
 *    REND `null`.** Ce n'est pas un analyseur d'expressions régulières complet,
 *    et le prétendre serait la faute exacte que cet ADR corrige. Les
 *    contributions, dans l'ordre du tableau de l'ADR 0035 :
 *
 *    littéral, caractère échappé, `.`, `\d \w \s \D \W \S`, classe `[…]` → 1 ·
 *    ancres `^ $ \b \B` → 0 · groupe `( )` `(?: )` `(?<nom> )` → la borne de son
 *    contenu · concaténation → SOMME · alternation → MAXIMUM des branches ·
 *    `?` `{n}` `{n,m}` → × 1, × n, × m · `*` `+` `{n,}` → `null` · visions →
 *    `null` · référence arrière → `null` · reste → `null`.
 *
 * ⚠️ **ELLE NE LIT AUCUN FICHIER ET N'EXÉCUTE LE MOTIF QUE SUR LES TÉMOINS.** Un
 *    motif venu d'un manifeste fédéré est une donnée hostile ; ce qui le
 *    concerne se décide par LECTURE de sa syntaxe, et l'exécution ne sert qu'au
 *    filet subordonné, sur des chaînes que le socle a écrites.
 */
export type MesurerLaCapacite = (motif: string) => MesureDeCapacite;

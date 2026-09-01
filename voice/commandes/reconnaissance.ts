/**
 * axion-ops — `voice/commandes/reconnaissance.ts`
 *
 * RECONNAÎTRE UNE COMMANDE HORS MODÈLE DANS UNE TRANSCRIPTION.
 *
 * ═══ L'ASYMÉTRIE, ET C'EST LA MÊME QU'AU § 20 ═══
 *
 * § 20, protection 1 : « Resserrer est toujours libre […] Desserrer n'est jamais
 * libre ». Ce fichier applique la même asymétrie un cran plus tôt, à la
 * RECONNAISSANCE elle-même :
 *
 *  · une commande qui NE PEUT PAS élargir la surface est reconnue avec
 *    TOLÉRANCE — un francophone qui veut couper la parole dit « stop », mais
 *    aussi « stoppe », « arrête », « arrête-toi », « chut » ;
 *
 *  · une commande qui PEUT élargir n'est JAMAIS reconnue par approximation. Une
 *    seule forme, son énoncé canonique, et rien autour.
 *
 * Le motif est le même que celui de l'asymétrie du § 20, et il tient en une
 * phrase : **se tromper dans un sens coûte une répétition, se tromper dans
 * l'autre ouvre la surface.** Un « stop » manqué se redit ; un « passe en mode
 * dev » entendu à tort n'a pas de retour en arrière avant l'expiration du TTL.
 *
 * ⚠️ LE RÉGIME EST DÉRIVÉ, PAS LISTÉ. `peutElargir()` répond depuis la STRUCTURE
 *    de l'effet déclaré — ensemble d'arrivée vide, ou niveau le plus strict —
 *    et non depuis une colonne « celle-ci est dangereuse ». Ce fichier ne
 *    connaît aucune commande par son nom.
 *
 * ⚠️ ET IL EST DÉRIVABLE SANS RIEN LIRE. `peutElargir()` ne demande ni catalogue,
 *    ni base, ni politique — c'est ce qui permet de reconnaître « stop » alors
 *    même que la base est injoignable. Le tri du § 20, lui, a besoin de l'état ;
 *    il vient APRÈS, dans `tri.ts`.
 *
 * ═══ CE QU'IL N'Y A PAS ICI, ET POURQUOI ═══
 *
 * Aucune distance d'édition, aucune correspondance partielle, aucun préfixe,
 * aucune sous-chaîne. La comparaison est une ÉGALITÉ, sur des formes ENTIÈRES,
 * après normalisation. Une reconnaissance par sous-chaîne ferait de « ne stoppe
 * pas » un ordre d'arrêt, et — bien pire — d'une phrase dictée contenant
 * l'énoncé d'une commande une commande.
 *
 * La tolérance ne vient donc PAS d'un appariement approximatif : elle vient de
 * la NORMALISATION (casse, accents, apostrophes, traits d'union, ponctuation) et
 * d'une liste FERMÉE de variantes et de chevilles.
 */

import { COMMANDES, peutElargir, type Commande, type NomCommande } from "./grammaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Normalisation
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Au-delà de ce nombre de caractères, AUCUNE commande n'est reconnue.
 *
 * Ce n'est pas une optimisation : c'est un refus. L'énoncé le plus long de la
 * grammaire fait dix-sept caractères ; une transcription de plusieurs centaines
 * est de la dictée, et une dictée n'est jamais une commande. Le plafond rend ce
 * fait EXPLICITE plutôt que de le laisser dépendre du hasard d'une égalité.
 */
export const PLAFOND_CARACTERES_TRANSCRIPTION = 512;

/**
 * Nombre maximal de chevilles retirées de chaque bord. Borné pour qu'une
 * transcription pathologique — « euh euh euh … » — ne fasse pas boucler le
 * démon sur un ordre d'arrêt.
 */
export const PLAFOND_CHEVILLES_PAR_BORD = 3;

/**
 * NORMALISER — casse, accents, apostrophes, traits d'union, ponctuation, espaces.
 *
 * ⚠️ LES ACCENTS SONT REPLIÉS, Y COMPRIS POUR LE RÉGIME STRICT, et c'est mesuré :
 *    l'ADR 0010, § 4, relève la sortie du moteur SAPI en grammaire fermée —
 *    `RECONNU : 'passe en mode developpement'`, SANS accent. Refuser le repli
 *    des accents ferait échouer la reconnaissance stricte sur la sortie même que
 *    le moteur produit. La sévérité du régime strict ne porte pas sur les
 *    accents : elle porte sur l'ABSENCE de variantes, de chevilles et
 *    d'approximation.
 *
 * ⚠️ AUCUN `\b` N'EST EMPLOYÉ ICI, ET C'EST DÉLIBÉRÉ. En JavaScript, `\b` est
 *    défini sur `[A-Za-z0-9_]` : `\barrête\b` ne se comporte pas comme on le lit
 *    sur un mot accentué. Le découpage se fait donc sur des ESPACES, après que
 *    les accents ont été repliés — les mots comparés sont ASCII à ce moment-là.
 */
export function normaliser(texte: string): string {
  return (
    texte
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase()
      // Apostrophes droites et typographiques, traits d'union, ponctuation : tout
      // devient séparateur. « arrête-toi », « arrete toi » et « arrête, toi ! »
      // sont le même ordre prononcé.
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
  );
}

/**
 * LES CHEVILLES — ce qu'un francophone met AUTOUR d'un ordre sans le changer.
 *
 * Liste FERMÉE, et retirée seulement AUX BORDS : « euh stop » et « stop merci »
 * sont des ordres d'arrêt ; « ne stoppe pas » n'en est pas un, et aucune cheville
 * ne l'en rapproche.
 *
 * ⚠️ ELLES NE SONT RETIRÉES QUE POUR LES COMMANDES QUI NE PEUVENT PAS ÉLARGIR.
 *    Ce n'est pas un filtre appliqué après coup : le régime strict n'appelle
 *    jamais `retirerChevilles`.
 */
export const CHEVILLES: readonly string[] = [
  "euh",
  "heu",
  "bon",
  "alors",
  "ok",
  "d accord",
  "s il te plait",
  "s il vous plait",
  "voila",
  "hein",
  "merci",
  "claude",
  "eh",
  "et",
];

const CHEVILLES_NORMALISEES: readonly string[] = CHEVILLES.map(normaliser);

/**
 * Retire les chevilles aux deux bords d'une forme DÉJÀ normalisée.
 *
 * @returns la forme allégée ET la liste de ce qui a été retiré — parce qu'une
 *   transformation muette d'un ordre de sécurité n'est pas auditable.
 */
export function retirerChevilles(normalisee: string): {
  readonly forme: string;
  readonly retirees: readonly string[];
} {
  const retirees: string[] = [];
  let courante = normalisee;

  for (let bord = 0; bord < PLAFOND_CHEVILLES_PAR_BORD; bord += 1) {
    let touche = false;
    for (const cheville of CHEVILLES_NORMALISEES) {
      if (cheville.length === 0) continue;
      if (courante === cheville) {
        // La transcription N'EST QUE la cheville : il ne reste aucun ordre.
        // On s'arrête là plutôt que de rendre la chaîne vide, qui s'apparierait
        // avec n'importe quelle forme vide.
        continue;
      }
      if (courante.startsWith(`${cheville} `)) {
        courante = courante.slice(cheville.length + 1);
        retirees.push(cheville);
        touche = true;
      }
      if (courante.endsWith(` ${cheville}`)) {
        courante = courante.slice(0, courante.length - cheville.length - 1);
        retirees.push(cheville);
        touche = true;
      }
    }
    if (!touche) break;
  }

  return { forme: courante, retirees };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Les formes que chaque commande accepte — DÉRIVÉES du régime
// ═════════════════════════════════════════════════════════════════════════════

/** Le régime de reconnaissance d'une commande. Dérivé, jamais déclaré. */
export type RegimeDeReconnaissance = "stricte" | "tolerante";

/**
 * Le régime d'une commande, DÉRIVÉ de la structure de son effet.
 *
 * Une commande qui peut élargir la surface est reconnue strictement. C'est la
 * seule règle, elle tient en une ligne, et elle ne nomme aucune commande.
 */
export function regimeDe(entree: Commande): RegimeDeReconnaissance {
  return peutElargir(entree.effet) ? "stricte" : "tolerante";
}

/**
 * LES FORMES NORMALISÉES qu'une commande accepte, sous son régime.
 *
 * ⚠️ SOUS RÉGIME STRICT, LES VARIANTES DÉCLARÉES NE SONT PAS LUES. Elles ne sont
 *    pas filtrées ni écartées : le code qui les lirait n'existe pas sur ce
 *    chemin. La garde de `grammaire.spec.ts` exige en outre qu'une commande
 *    stricte n'en déclare aucune — deux protections, dont une qui rougit.
 */
export function formesDe(entree: Commande): readonly string[] {
  const canonique = normaliser(entree.enonce);
  if (regimeDe(entree) === "stricte") return [canonique];
  return [canonique, ...entree.variantes.map(normaliser)];
}

/**
 * Les formes réclamées par PLUSIEURS commandes.
 *
 * Une collision rendrait la reconnaissance dépendante de l'ordre du tableau —
 * c'est-à-dire d'un détail de rédaction. Exportée, et pas confinée au test,
 * pour qu'un démon vérifie SA grammaire au démarrage : elle peut venir d'un
 * autre dépôt (ADR 0010, § 6).
 */
export function formesEnDouble(commandes: readonly Commande[] = COMMANDES): {
  readonly doublons: readonly string[];
  readonly formesExaminees: number;
} {
  const vues = new Map<string, number>();
  let formesExaminees = 0;

  for (const entree of commandes) {
    for (const forme of formesDe(entree)) {
      formesExaminees += 1;
      vues.set(forme, (vues.get(forme) ?? 0) + 1);
    }
  }

  const doublons = [...vues.entries()]
    .filter(([, compte]) => compte > 1)
    .map(([forme]) => forme)
    .sort();

  return { doublons, formesExaminees };
}

// ═════════════════════════════════════════════════════════════════════════════
//  La reconnaissance
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le résultat. Jamais un simple `NomCommande | null` : le démon doit pouvoir
 * dire POURQUOI il n'a rien reconnu, et la ligne de journal doit pouvoir dire
 * sous quel régime et sur quelle forme l'appariement s'est fait.
 */
export interface Reconnaissance<TNom extends string = NomCommande> {
  /**
   * Le nom de la commande reconnue.
   *
   * ⚠️ LE PARAMÈTRE DE TYPE N'EST PAS UN ORNEMENT. Appelée sans second argument,
   *    la fonction travaille sur `COMMANDES` et rend un `NomCommande` — le type
   *    FERMÉ, celui qui fait refuser le compilateur chez l'appelant. Appelée sur
   *    une grammaire-témoin fabriquée dans un test, elle rend le type de CETTE
   *    grammaire. Sans ce paramètre il faudrait un `as NomCommande` au retour,
   *    c'est-à-dire une affirmation non vérifiée au seul endroit où la fermeture
   *    devait mordre.
   */
  readonly commande: TNom | null;
  readonly regime: RegimeDeReconnaissance | null;
  /** La transcription normalisée. C'est elle, et non la brute, qui est empreinte. */
  readonly normalisee: string;
  /** La forme de la grammaire qui a été appariée, ou `null`. */
  readonly formeAppariee: string | null;
  /** Les chevilles retirées — vide sous régime strict, toujours. */
  readonly chevillesRetirees: readonly string[];
  /** Combien de formes ont été comparées. Une garde qui ne le dit pas ment. */
  readonly formesExaminees: number;
  /** Ce qu'il faut faire ensuite (§ 15). */
  readonly motif: string;
}

/**
 * RECONNAÎT — ou ne reconnaît pas, et le dit.
 *
 * L'ordre des deux passes n'est pas indifférent : le régime STRICT passe en
 * premier, sur la transcription normalisée TELLE QUELLE. Une commande capable
 * d'élargir ne peut donc jamais être atteinte par un chemin qui aurait d'abord
 * retiré quelque chose.
 */
export function reconnaitre(transcription: string): Reconnaissance {
  // La grammaire du dépôt, et le type FERMÉ qui va avec.
  return reconnaitreDans<NomCommande>(transcription, COMMANDES);
}

/**
 * La forme générale, sur une grammaire donnée.
 *
 * ⚠️ ELLE EXISTE POUR LES TÉMOINS, ET C'EST UN BESOIN DE GARDE, PAS DE CONFORT.
 *    Une règle d'asymétrie ne se prouve qu'en fabriquant une grammaire où elle
 *    doit mordre — par exemple une commande capable d'élargir à qui on aurait
 *    glissé des variantes. Sans ce point d'entrée, la garde ne pourrait
 *    qu'exercer une RÉIMPLÉMENTATION écrite dans le test, c'est-à-dire ne rien
 *    dire de ce code-ci.
 *
 *    Elle sert aussi au démon, qui est un SECOND PROGRAMME (ADR 0010, § 6) et
 *    peut porter sa propre copie de la grammaire.
 */
export function reconnaitreDans<TNom extends string>(
  transcription: string,
  commandes: readonly (Commande & { readonly nom: TNom })[],
): Reconnaissance<TNom> {
  if (transcription.length > PLAFOND_CARACTERES_TRANSCRIPTION) {
    return {
      commande: null,
      regime: null,
      normalisee: "",
      formeAppariee: null,
      chevillesRetirees: [],
      formesExaminees: 0,
      motif:
        `Transcription de ${String(transcription.length)} caractères, plafond ` +
        `${String(PLAFOND_CARACTERES_TRANSCRIPTION)} : traitée comme de la dictée, ` +
        "aucune commande hors modèle recherchée.",
    };
  }

  const normalisee = normaliser(transcription);
  let formesExaminees = 0;

  if (normalisee.length === 0) {
    return {
      commande: null,
      regime: null,
      normalisee,
      formeAppariee: null,
      chevillesRetirees: [],
      formesExaminees: 0,
      motif: "Transcription vide après normalisation : rien à reconnaître.",
    };
  }

  // ─── Passe 1 — RÉGIME STRICT. Égalité, rien d'autre. ───────────────────────
  for (const entree of commandes) {
    if (regimeDe(entree) !== "stricte") continue;
    for (const forme of formesDe(entree)) {
      formesExaminees += 1;
      if (normalisee === forme) {
        return {
          commande: entree.nom,
          regime: "stricte",
          normalisee,
          formeAppariee: forme,
          chevillesRetirees: [],
          formesExaminees,
          motif:
            `Commande « ${entree.nom} » reconnue en régime STRICT sur l'énoncé exact ` +
            `« ${forme} ». Elle peut élargir la surface : aucune variante, aucune ` +
            "cheville, aucune approximation n'y mène (§ 20).",
        };
      }
    }
  }

  // ─── Passe 2 — RÉGIME TOLÉRANT, réservé à ce qui ne peut pas élargir. ──────
  const allegee = retirerChevilles(normalisee);

  for (const entree of commandes) {
    if (regimeDe(entree) !== "tolerante") continue;
    for (const forme of formesDe(entree)) {
      formesExaminees += 1;
      if (normalisee === forme || allegee.forme === forme) {
        return {
          commande: entree.nom,
          regime: "tolerante",
          normalisee,
          formeAppariee: forme,
          chevillesRetirees: normalisee === forme ? [] : allegee.retirees,
          formesExaminees,
          motif:
            `Commande « ${entree.nom} » reconnue en régime TOLÉRANT sur la forme ` +
            `« ${forme} »` +
            (allegee.retirees.length > 0 && normalisee !== forme
              ? `, après retrait de ${String(allegee.retirees.length)} cheville(s) : ` +
                `${allegee.retirees.join(", ")}`
              : "") +
            ". Elle ne peut faire gagner aucun outil, quel que soit le catalogue.",
        };
      }
    }
  }

  return {
    commande: null,
    regime: null,
    normalisee,
    formeAppariee: null,
    chevillesRetirees: [],
    formesExaminees,
    motif:
      `Aucune commande hors modèle : « ${normalisee} » n'est aucune des ` +
      `${String(formesExaminees)} formes de la grammaire. La transcription part au ` +
      "modèle comme dictée libre — ce qui est le repli SÛR : rien n'est exécuté hors modèle.",
  };
}

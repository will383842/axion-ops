/**
 * `ops/alertes.ts` — LA TABLE D'ALERTES DU SOCLE (§ 24), ET LA NEUVIÈME LIGNE.
 *
 * ═══ LE DÉFAUT QUE CE MODULE FERME ═══
 *
 * Le § 20 prescrit NOMMÉMENT d'alerter sur un écart d'épinglage : « tout écart
 * entre la valeur épinglée et la valeur reçue désactive l'outil ET ALERTE, au
 * lieu de mettre à jour en silence ».
 *
 * La table du § 24, elle, énumère HUIT événements, et aucun n'est celui-là. Le
 * niveau de cette alerte n'est donc fixé par rien — et une alerte sans niveau
 * n'est routée nulle part : le canal du § 24 (bot et salon PROPRES au socle)
 * trie sur le niveau. L'alerte la plus importante du § 20 serait émise, puis
 * jetée, sans qu'aucune ligne ne le dise.
 *
 * `core/chaine/etape-06-outil.ts` a tranché dans son coin au lot 1b, en écrivant
 * `niveau: "critique"` en LITTÉRAL dans le type `AlerteEpinglage`, et en portant
 * l'écart au rapport. Ce module fait la moitié qui manquait : il pose la table
 * du socle — les huit lignes du document PLUS la neuvième — et il fait DÉRIVER
 * la neuvième du littéral du module émetteur.
 *
 * ⚠️ LA DÉRIVATION EST LE POINT DU FICHIER. `CLE_ECART_EPINGLAGE` et
 *    `NIVEAU_ECART_EPINGLAGE` sont annotés depuis `AlerteEpinglage` : si le
 *    module émetteur change son `genre` ou son `niveau`, CE FICHIER NE COMPILE
 *    PLUS. Recopier « écart-épinglage » et « critique » aurait donné deux
 *    sources de vérité qui divergent en silence — exactement le mode de panne
 *    que la règle d'épinglage du § 20 combat par ailleurs.
 *
 * ⚠️ CE MODULE N'ÉMET RIEN ET NE ROUTE RIEN. Il n'ouvre aucune connexion, ne
 *    nomme aucun salon, aucun bot, aucun jeton : le dépôt est PUBLIC (§ 29). Il
 *    ne porte que la TABLE — quel événement, à quel niveau, prescrit par quel §.
 *    Le canal, lui, est un port (`CanalDAlerte`), et son câblage vit hors d'ici.
 */

import type { AlerteEpinglage } from "../core/chaine/etape-06-outil.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES NIVEAUX
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TROIS NIVEAUX DU § 24, DU PLUS URGENT AU MOINS URGENT.
 *
 * ⚠️ `aucune` EST UN NIVEAU, PAS UNE ABSENCE DE LIGNE. Le § 24 range
 *    explicitement « refus de politique isolé » dans sa table, à `aucune` :
 *    l'événement est COMPTÉ (c'est la source de la métrique « refus par étape »)
 *    et n'est pas ÉMIS. Le retirer de la table ferait disparaître la distinction
 *    entre « on a décidé de ne pas alerter » et « personne n'y a pensé ».
 *
 * L'ordre du tableau est SIGNIFIANT : c'est de lui que `rangNiveauAlerte` tire
 * sa comparaison — dériver, ne pas recopier.
 */
export const NIVEAUX_ALERTE = ["critique", "attention", "aucune"] as const;

export type NiveauAlerte = (typeof NIVEAUX_ALERTE)[number];

/** Rang d'urgence, dérivé de l'ordre de `NIVEAUX_ALERTE`. 0 = le plus urgent. */
export function rangNiveauAlerte(niveau: NiveauAlerte): number {
  return NIVEAUX_ALERTE.indexOf(niveau);
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA NEUVIÈME LIGNE — DÉRIVÉE DU MODULE QUI L'ÉMET
// ═════════════════════════════════════════════════════════════════════════════

/**
 * La clé de la neuvième ligne, DÉRIVÉE du `genre` que porte `AlerteEpinglage`.
 * Le module émetteur renomme son genre ⇒ ce fichier ne compile plus.
 */
const CLE_ECART_EPINGLAGE: AlerteEpinglage["genre"] = "écart-épinglage";

/**
 * Le niveau de la neuvième ligne, DÉRIVÉ DEUX FOIS.
 *
 * L'intersection tient les deux bouts à la fois : la valeur doit être celle que
 * `core/chaine/etape-06-outil.ts` a décidée ET un niveau que le § 24 connaît.
 * Un module qui basculerait son alerte sur un niveau inventé donnerait `never`
 * ici — c'est-à-dire un refus de compiler, et pas une ligne de table muette.
 */
type NiveauDuModuleEpinglage = AlerteEpinglage["niveau"] & NiveauAlerte;

const NIVEAU_ECART_EPINGLAGE: NiveauDuModuleEpinglage = "critique";

// ═════════════════════════════════════════════════════════════════════════════
//  LA TABLE
// ═════════════════════════════════════════════════════════════════════════════

/** Une ligne de la table d'alertes du socle. */
export interface LigneDAlerte {
  /** Clé stable, employée par le routage. Jamais le libellé. */
  readonly cle: string;
  /** L'événement, tel que le § qui le prescrit le nomme. */
  readonly libelle: string;
  readonly niveau: NiveauAlerte;
  /** Le § qui prescrit l'alerte. */
  readonly source: string;
  /** Vrai quand la ligne est DANS la table du § 24 ; faux quand ce dépôt
   *  l'ajoute. Un ajout se lit d'un coup d'œil, et se justifie. */
  readonly auTableau24: boolean;
  /** Pourquoi ce niveau. Obligatoire sur un AJOUT : un niveau choisi sans motif
   *  écrit sera rediscuté à chaque relecture. */
  readonly motif: string;
}

/**
 * LA TABLE D'ALERTES DU SOCLE — HUIT LIGNES DU § 24, PLUS UNE.
 *
 * ⚠️ LA SEPTIÈME LIGNE EN COLLE DEUX, ET C'EST LE DOCUMENT QUI LE FAIT. Le § 24
 *    écrit « adaptateur injoignable > 5 min · journal vide alors qu'une
 *    génération de coffre est attendue » sur UNE seule ligne, à un seul niveau.
 *    Ce sont deux événements sans rapport, qui ne se diagnostiquent pas du même
 *    geste. Elle est laissée telle quelle — le document en compte huit, et
 *    plusieurs gardes de ce dépôt s'appuient sur ce huit — et l'écart est
 *    signalé plutôt que corrigé en douce. Les séparer est une décision à
 *    prendre, pas un nettoyage.
 */
export const ALERTES_DU_SOCLE: readonly LigneDAlerte[] = [
  {
    cle: "coffre-illisible",
    libelle: "Coffre illisible, ou jeton non rafraîchissable",
    niveau: "critique",
    source: "§ 24",
    auTableau24: true,
    motif: "le socle ne peut plus rien déchiffrer : tout appel d'outil est refusé (§ 23)",
  },
  {
    cle: "desserrage",
    libelle: "Tout desserrage, confirmé compris, avec canal et auteur",
    niveau: "critique",
    source: "§ 24",
    auTableau24: true,
    motif:
      "desserrer n'est jamais libre (§ 20, protection 1) — l'alerte porte le canal et l'auteur, " +
      "parce qu'un desserrage légitime et un desserrage volé se ressemblent sans eux",
  },
  {
    cle: "veille-muette",
    libelle: "Battement de veille absent",
    niveau: "critique",
    source: "§ 24",
    auTableau24: true,
    motif:
      "une veille muette ne distingue pas sa propre mort d'une absence d'incident — c'est le " +
      "motif du récepteur hors VPS que le § 24 exige",
  },
  {
    cle: "chaine-journal-rompue",
    libelle: "Vérification de chaîne du journal en échec",
    niveau: "critique",
    source: "§ 24",
    auTableau24: true,
    motif: "le journal en ajout seul ne fait plus foi : l'objectif O6 tombe (ADR 0002)",
  },
  {
    cle: "refus-en-rafale",
    libelle: "N refus de politique sur un effect ≠ read, fenêtre courte, même principal",
    niveau: "attention",
    source: "§ 24",
    auTableau24: true,
    motif:
      "signature d'une injection à demi réussie (§ 15, troisième règle) — un refus isolé est " +
      "normal, la RAFALE ne l'est pas",
  },
  {
    cle: "quota-tiers-80",
    libelle: "Quota d'une API tierce à 80 %",
    niveau: "attention",
    source: "§ 24",
    auTableau24: true,
    motif: "il reste du temps pour agir ; à 100 % il n'en reste plus",
  },
  {
    cle: "adaptateur-injoignable-ou-journal-vide",
    libelle:
      "Adaptateur injoignable > 5 min · journal vide alors qu'une génération de coffre est attendue",
    niveau: "attention",
    source: "§ 24",
    auTableau24: true,
    motif:
      "⚠️ DEUX ÉVÉNEMENTS SUR UNE SEULE LIGNE, ET C'EST LE DOCUMENT QUI LES COLLE. Conservée " +
      "telle quelle : le § 24 en compte huit, et les séparer est une décision, pas un nettoyage",
  },
  {
    cle: "refus-politique-isole",
    libelle: "Refus de politique isolé",
    niveau: "aucune",
    source: "§ 24",
    auTableau24: true,
    motif:
      "un refus de politique est une RÉPONSE NORMALE (§ 15) — il est compté, jamais émis ; la " +
      "ligne existe pour que « on a décidé de ne pas alerter » ne se confonde pas avec un oubli",
  },
  {
    // ⚠️ LA NEUVIÈME. Clé et niveau DÉRIVÉS du module qui émet l'alerte.
    cle: CLE_ECART_EPINGLAGE,
    libelle:
      "Écart d'épinglage : la valeur reçue d'un adaptateur ne correspond plus à la valeur épinglée",
    niveau: NIVEAU_ECART_EPINGLAGE,
    source: "§ 20, règle d'épinglage — ABSENTE de la table du § 24",
    auTableau24: false,
    motif:
      "Le § 20 prescrit nommément d'ALERTER, et le § 24 n'en dit rien : une alerte sans niveau " +
      "n'est routée nulle part. Niveau retenu par VOISINAGE avec « vérification de chaîne du " +
      "journal en échec » — les deux disent qu'une valeur qui FAIT FOI ne correspond plus à ce " +
      "qu'on reçoit, et les deux appellent le même geste : ne plus croire la source avant de " +
      "l'avoir relue. C'est une décision de ce dépôt, pas une lecture du § 24 ; elle est écrite " +
      "ici et dans `core/chaine/etape-06-outil.ts`, et portée au rapport.",
  },
];

// ═════════════════════════════════════════════════════════════════════════════
//  LA VÉRIFICATION
// ═════════════════════════════════════════════════════════════════════════════

/** Une ligne telle qu'un TÉMOIN peut la fabriquer : le niveau y est une chaîne
 *  quelconque, pour qu'un niveau inventé soit mesurable et pas refusé par le
 *  compilateur avant d'être vu. */
export interface LigneDAlerteBrute {
  readonly cle: string;
  readonly libelle: string;
  readonly niveau: string;
  readonly source: string;
  readonly auTableau24: boolean;
  readonly motif: string;
}

/** Ce que rend la vérification. JAMAIS un booléen. */
export interface VerdictTableDAlertes {
  /** Combien de lignes ont été confrontées. */
  readonly lignesMesurees: number;
  /** Combien viennent du tableau du § 24. */
  readonly lignesDuTableau24: number;
  /** Les clés des lignes AJOUTÉES par ce dépôt, triées. */
  readonly ajouts: readonly string[];
  /** Combien de lignes par niveau, dans l'ordre de `NIVEAUX_ALERTE`. */
  readonly parNiveau: Readonly<Record<string, number>>;
  readonly anomalies: readonly string[];
}

/**
 * Confronte une table d'alertes à ce qu'on attend d'elle.
 *
 * @param table - la table à vérifier. INJECTABLE : une garde doit pouvoir
 *   fabriquer une table à doublon, à niveau inventé ou à ajout non motivé —
 *   la table réelle, à elle seule, ne prouve jamais qu'un vérificateur mord.
 */
export function verifierTableDAlertes(
  table: readonly LigneDAlerteBrute[] = ALERTES_DU_SOCLE,
): VerdictTableDAlertes {
  const anomalies: string[] = [];
  const niveauxConnus = new Set<string>(NIVEAUX_ALERTE);
  const vues = new Set<string>();
  const parNiveau: Record<string, number> = {};
  for (const niveau of NIVEAUX_ALERTE) parNiveau[niveau] = 0;

  for (const ligne of table) {
    if (ligne.cle.trim().length === 0) {
      anomalies.push(
        `une ligne porte une clé VIDE (libellé « ${ligne.libelle} ») : le routage trie sur la ` +
          "clé, pas sur le libellé — une clé vide range l'alerte nulle part.",
      );
    } else if (vues.has(ligne.cle)) {
      anomalies.push(
        `la clé « ${ligne.cle} » apparaît DEUX FOIS. Deux lignes de même clé et de niveaux ` +
          "différents rendent le routage dépendant de l'ordre de lecture, ce qui n'est écrit " +
          "nulle part.",
      );
    }
    vues.add(ligne.cle);

    if (ligne.libelle.trim().length === 0) {
      anomalies.push(
        `la ligne « ${ligne.cle} » n'a AUCUN libellé : personne ne saura ce qui a alerté.`,
      );
    }

    if (!niveauxConnus.has(ligne.niveau)) {
      anomalies.push(
        `la ligne « ${ligne.cle} » porte le niveau « ${ligne.niveau} », que le § 24 ne connaît ` +
          `pas (${NIVEAUX_ALERTE.join(", ")}). Une alerte de niveau inconnu n'est routée nulle ` +
          "part, et son absence se lit comme une absence de problème.",
      );
    } else {
      parNiveau[ligne.niveau] = (parNiveau[ligne.niveau] ?? 0) + 1;
    }

    if (!ligne.auTableau24 && ligne.motif.trim().length === 0) {
      anomalies.push(
        `la ligne « ${ligne.cle} » est un AJOUT à la table du § 24 et ne porte aucun motif. Un ` +
          "niveau choisi sans motif écrit sera rediscuté à chaque relecture, puis abaissé par " +
          "quelqu'un qui ne saura pas pourquoi il avait été mis là.",
      );
    }
  }

  return {
    lignesMesurees: table.length,
    lignesDuTableau24: table.filter((ligne) => ligne.auTableau24).length,
    ajouts: table
      .filter((ligne) => !ligne.auTableau24)
      .map((ligne) => ligne.cle)
      .sort(),
    parNiveau,
    anomalies,
  };
}

/** La ligne portant cette clé, ou `undefined`. */
export function ligneDAlerte(cle: string): LigneDAlerte | undefined {
  return ALERTES_DU_SOCLE.find((ligne) => ligne.cle === cle);
}

/** Les clés d'un niveau donné, triées. */
export function alertesDuNiveau(niveau: NiveauAlerte): readonly string[] {
  return ALERTES_DU_SOCLE.filter((ligne) => ligne.niveau === niveau)
    .map((ligne) => ligne.cle)
    .sort();
}

/**
 * `core/transport/http/hote.ts` — **L'ÉTAPE 1, ET ELLE EST LA PREMIÈRE.**
 *
 * § 11 : « anti DNS-rebinding — validation de l'en-tête `Host` contre une liste
 * blanche, **avant tout traitement** ». L'ADR 0025 fixe la borne de « avant » :
 * avant l'analyse syntaxique du corps JSON-RPC, avant toute lecture de base,
 * avant le moindre journal. Un analyseur JSON est une surface d'attaque ; le
 * sens de l'étape 1 est qu'un hôte non autorisé ne l'atteigne jamais.
 *
 * Ce module ne tient PAS cet ordre à lui seul — un module ne peut pas décider
 * quand on l'appelle. Ce qui le tient est `core/transport/http/transport.ts`,
 * qui reçoit le corps sous la forme d'une **fonction à appeler** plutôt que
 * d'une chaîne déjà lue : tant que l'étape 1 n'a pas rendu son verdict, il n'y a
 * littéralement rien à analyser, et `amont.spec.ts` compte les invocations de
 * cette fonction sur un hôte refusé — zéro, ou la garde rougit.
 *
 * ═══ LA LISTE VIDE EST UN REFUS, JAMAIS UN « TOUT AUTORISER » ═══
 *
 * C'est le mode de défaillance classique de ce contrôle, et il est écrit à trois
 * endroits du dépôt avant ce fichier (`.env.example`, `contrat.ts`, ADR 0025) :
 * la variable est mal orthographiée, la liste se résout à zéro entrée, la boucle
 * ne trouve aucun refus à prononcer, et la garde reste verte **en ne gardant
 * rien**.
 *
 * {@link listeBlancheDHotes} LÈVE sur une liste vide plutôt que de rendre un
 * tableau vide. Ce n'est pas une préférence de style : une valeur de retour
 * vide se propage silencieusement jusqu'à la boucle de comparaison, alors qu'une
 * exception au moment de la lecture de la configuration remonte à l'étage 6 du
 * démarrage (ADR 0023), qui fait **sortir le processus**.
 *
 * ⚠️ **CE QUE CE MODULE NE VOIT PAS, ÉCRIT AVEC LA MESURE.** L'en-tête `Host`
 *    est déclaratif : un client qui parle directement à l'adresse IP du socle
 *    peut écrire ce qu'il veut dedans. L'étape 1 n'est donc pas une
 *    authentification d'origine — elle ferme UN chemin précis, celui du
 *    navigateur d'un tiers qu'un DNS malveillant a fait pointer vers
 *    `127.0.0.1` : ce navigateur-là, lui, ne choisit pas son `Host`. Les étapes
 *    2 à 4 portent le reste, et le § 28 porte la porte d'accès réseau.
 */

import type { VerdictDHote } from "../contrat.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA CONFIGURATION — un NOM, jamais une valeur (dépôt public)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le nom de la variable qui porte la liste. La VALEUR vit hors du dépôt —
 * `.env.example` ne montre qu'un `localhost:3000` de démonstration.
 */
export const VARIABLE_DES_HOTES_ADMIS = "OPS_ALLOWED_HOSTS";

/** Le séparateur des entrées, écrit ici pour que le lecteur et l'écrivain de la variable s'accordent. */
export const SEPARATEUR_DES_HOTES = ",";

/**
 * Levée quand la liste blanche se résout à zéro entrée.
 *
 * ⚠️ ELLE NE PORTE JAMAIS LA VALEUR LUE. Une liste d'hôtes n'est pas un secret,
 *    mais elle est une carte de l'infrastructure, et le § 15 veut qu'une erreur
 *    dise **le geste** plutôt que l'état. Elle nomme donc la variable et le
 *    geste, et rien d'autre.
 */
export class ErreurListeBlancheVide extends Error {
  /** Combien d'entrées brutes ont été lues avant d'être toutes écartées. */
  public readonly entreesLues: number;

  public constructor(entreesLues: number) {
    super(
      `§ 11 — la liste blanche d'hôtes est vide (${String(entreesLues)} entrée(s) brute(s) lue(s), ` +
        `toutes écartées). Une liste vide est un REFUS DE DÉMARRER, jamais un « tout autoriser » : ` +
        `renseigner ${VARIABLE_DES_HOTES_ADMIS} avec les hôtes servis, séparés par « ${SEPARATEUR_DES_HOTES} ».`,
    );
    this.name = "ErreurListeBlancheVide";
    this.entreesLues = entreesLues;
  }
}

/**
 * NORMALISE UN HÔTE — et la normalisation est la MÊME des deux côtés.
 *
 * ⚠️ C'EST UNE SURFACE D'ÉGALITÉ APPROCHÉE, ET ELLE EST TENUE COURTE. Chaque
 *    règle ajoutée ici pour être accommodant est une paire de valeurs distinctes
 *    qui deviennent équivalentes. Deux seulement sont admises, et chacune
 *    correspond à une règle du protocole, pas à une commodité :
 *
 *     · les espaces de bordure — ils viennent de l'écriture de la variable
 *       d'environnement (`a, b`), jamais du réseau ;
 *     · la casse — un nom d'hôte est insensible à la casse (RFC 4343), si bien
 *       que `LOCALHOST:3000` et `localhost:3000` désignent la même machine. Ne
 *       pas le faire rendrait la liste contournable par un simple changement de
 *       casse dans l'en-tête — l'inverse exact du but.
 *
 * ⚠️ **LE PORT FAIT PARTIE DE LA COMPARAISON, ET C'EST DÉLIBÉRÉ.** `Host` porte
 *    l'autorité (RFC 9110), donc le port quand il n'est pas celui du schéma. Le
 *    retirer ferait qu'un socle servi sur `:3000` accepterait un `Host` disant
 *    `:8080` — c'est-à-dire qu'il accepterait une requête destinée à un autre
 *    service de la même machine.
 */
function normaliser(hote: string): string {
  return hote.trim().toLowerCase();
}

/**
 * LIT LA LISTE BLANCHE. **Lève sur une liste vide.**
 *
 * @param brut la valeur de {@link VARIABLE_DES_HOTES_ADMIS}, ou `undefined`
 *        quand la variable n'existe pas — les deux cas sont le même défaut, et
 *        ils rendent la même erreur.
 */
export function listeBlancheDHotes(brut: string | undefined): readonly string[] {
  const entrees = (brut ?? "").split(SEPARATEUR_DES_HOTES);
  const retenues = entrees.map(normaliser).filter((hote) => hote.length > 0);
  if (retenues.length === 0) {
    throw new ErreurListeBlancheVide(entrees.length);
  }
  // Une entrée écrite deux fois ne doit pas gonfler `entreesConfrontees` : le
  // compte doit dire combien d'hôtes DISTINCTS ont été confrontés, sans quoi une
  // liste dupliquée annoncerait une garde plus large qu'elle n'est.
  return [...new Set(retenues)];
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAPE 1
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CONFRONTE L'EN-TÊTE `Host` REÇU À LA LISTE BLANCHE.
 *
 * Elle ne peut pas être verte pour rien : `entreesConfrontees` est incrémenté
 * **dans** la boucle, jamais rendu depuis `listeBlanche.length`, et la boucle ne
 * sort pas par anticipation — un `break` au premier accord ferait baisser le
 * compte sur le chemin nominal, c'est-à-dire ferait varier la mesure avec le
 * résultat.
 *
 * ⚠️ **UN `Host` ABSENT EST CONFRONTÉ COMME UN AUTRE, ET N'ACCORDE RIEN.** Le
 *    raccourci « pas d'en-tête, donc rien à comparer, donc on rend tout de
 *    suite » produirait `entreesConfrontees: 0` — exactement le compte qu'une
 *    liste vide produirait, et les deux ne veulent pas dire la même chose. La
 *    chaîne vide est normalisée puis confrontée ; aucune entrée retenue n'est
 *    vide ({@link listeBlancheDHotes} les écarte), donc elle ne peut accorder
 *    avec rien.
 *
 * @param hoteRecu l'en-tête tel qu'il arrive. **Jamais journalisé verbatim.**
 */
export function verifierLHote(
  hoteRecu: string | undefined,
  listeBlanche: readonly string[],
): VerdictDHote {
  const recu = normaliser(hoteRecu ?? "");
  let entreesConfrontees = 0;
  let autorise = false;

  for (const admis of listeBlanche) {
    entreesConfrontees += 1;
    if (admis === recu) {
      autorise = true;
    }
  }

  // ⚠️ FAIL-CLOSED SUR UNE LISTE QUI SERAIT ARRIVÉE VIDE MALGRÉ TOUT. Le seul
  //    chemin honnête passe par `listeBlancheDHotes`, qui lève ; celui-ci reste
  //    atteignable depuis un tableau construit ailleurs. Zéro entrée confrontée
  //    ne peut pas rendre `autorise: true` — c'est la même règle que
  //    `verifierCouvertureDesEtapes` applique à un transport inconnu.
  return {
    hoteRecu: recu,
    entreesConfrontees,
    autorise: autorise && entreesConfrontees > 0,
  };
}

/**
 * `core/transport/http/reponse.ts` — **CE QUI SORT, ET LE DERNIER FILET QUI LE
 * RELIT.**
 *
 * Trois choses vivent ici, et la troisième est celle qui compte :
 *
 *  1. le STATUT — **dérivé d'`APPEL_STEPS[n].statutHttp`**, jamais écrit à la
 *     main. Le § 11 donne un statut à cinq étapes et `null` aux autres ; `null`
 *     n'est pas un oubli, c'est la décision que « le refus vit dans la réponse
 *     JSON-RPC, pas dans le statut » (voir l'étape 0 et le § 23, où un coffre
 *     verrouillé doit rendre `200` au healthcheck) ;
 *  2. les EN-TÊTES — `WWW-Authenticate` sur `401` (RFC 6750, § 3), `Retry-After`
 *     sur `429` (§ 15, « dit quand réessayer ») ;
 *  3. **LA RELECTURE ANTI-FUITE**, exécutée sur CHAQUE réponse, en production.
 *
 * ═══ POURQUOI UN FILET, ALORS QUE CHAQUE MESSAGE EST DÉJÀ ÉCRIT AVEC SOIN ═══
 *
 * Parce que « écrit avec soin » n'est pas une garde. Le § 15 pose que « une
 * erreur ne fuit JAMAIS un secret ni une donnée personnelle », et les messages
 * de refus viennent de partout : des quatre étapes amont, de l'enveloppe, et
 * surtout des dix étapes de l'orchestrateur, qui composent leur texte à partir
 * de valeurs de l'appel. Aucun de ces auteurs ne connaît la liste des valeurs
 * sensibles de LA requête en cours ; le transport, lui, la connaît — c'est lui
 * qui a lu le porteur, l'hôte et le corps.
 *
 * {@link verifierAucuneFuite} confronte donc la réponse SÉRIALISÉE — statut,
 * en-têtes et corps — aux valeurs sensibles de l'appel, et le scellement de
 * `transport.ts` REMPLACE la réponse par un `internal` nu si l'une d'elles y
 * apparaît. Fail-closed : perdre un message d'aide coûte moins qu'un jeton
 * porteur, ou qu'un jeton de confirmation à usage unique, renvoyé dans un corps
 * d'erreur.
 *
 * Voir **ADR 0033** : elle porte la décision, la liste NOMMÉE des valeurs
 * confrontées, le motif pour lequel le nom d'outil n'en fait pas partie, et les
 * trois bornes ci-dessous.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE, ET ELLE EST RÉELLE.** Ce filet ne voit
 *    que les valeurs qu'on lui NOMME, et seulement telles quelles : une valeur
 *    ré-encodée (base64, URL-encodée), tronquée ou reformatée lui échappe
 *    entièrement. Il ne voit pas non plus une donnée personnelle qui viendrait
 *    d'ailleurs que de la requête — d'un adaptateur, par exemple. Ce n'est pas
 *    un détecteur de contenu ; c'en est le contraire, et c'est ce qui le rend
 *    fiable : il répond à « cette valeur-CI est-elle ressortie ? », question à
 *    laquelle on peut répondre exactement. `verifierAucunContenu()` (§ 31) porte
 *    l'autre moitié, du côté du journal.
 *
 * ⚠️ **ET IL ÉCARTE LES VALEURS TROP COURTES, EN LES COMPTANT.** Confronter une
 *    valeur de trois caractères ferait rougir la garde sur une coïncidence —
 *    « id », « ok » — et le remède qu'on chercherait à cette fausse alerte
 *    serait de la désactiver. `valeursEcartees` dit combien n'ont pas été
 *    confrontées, pour que la borne soit lue et non seulement écrite.
 */

import { APPEL_STEPS } from "../../types.js";
import type { AppelStep } from "../../types.js";
import type { DefiDAuthentification } from "./amont.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LA RÉPONSE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE RÉPONSE HTTP, SANS SOCKET.
 *
 * ⚠️ CETTE FORME EST CE QUI REND LE TRANSPORT ÉPROUVABLE SANS RÉSEAU. `traiter()`
 *    rend cette valeur ; `serveur.ts` se contente de l'écrire sur une réponse
 *    Node. Une garde qui devrait ouvrir une socket pour mesurer un statut
 *    finirait par ne mesurer que les cas faciles.
 */
export interface ReponseHttp {
  readonly statut: number;
  readonly entetes: Readonly<Record<string, string>>;
  readonly corps: string;
}

/** Les statuts que ce transport rend hors de la table du § 11. */
export const STATUT_SUCCES = 200;
/** Une enveloppe JSON-RPC illisible : aucune étape n'a refusé, la requête est mal formée. */
export const STATUT_ENVELOPPE_INVALIDE = 400;
/** Une méthode ou un chemin hors du contrat. */
export const STATUT_CHEMIN_INCONNU = 404;
export const STATUT_METHODE_INCONNUE = 405;
/** Le « reste » du § 15 : un identifiant de corrélation, JAMAIS une trace de pile. */
export const STATUT_ERREUR_INTERNE = 500;

/** Le domaine d'authentification annoncé. Le nom du socle, jamais un hôte réel. */
export const REALM_DU_SOCLE = "axion-ops";

/**
 * LE STATUT D'UN REFUS, **LU DANS `APPEL_STEPS`**.
 *
 * ⚠️ `null` DEVIENT `200`, ET C'EST LA DÉCISION DU § 11, PAS UN REPLI. Les
 *    étapes sans statut refusent DANS la réponse JSON-RPC : le corps porte le
 *    code du § 15, l'enveloppe HTTP dit seulement que le dialogue a eu lieu. Un
 *    `400` ou un `500` à leur place ferait croire à une panne de transport là où
 *    il y a une décision d'autorisation, et le § 23 en dépend explicitement —
 *    « le healthcheck rend 200 coffre verrouillé, précisément pour que le
 *    déploiement ne rougisse pas ».
 */
export function statutDuRefus(etape: AppelStep): number {
  const ancrage = APPEL_STEPS.find((candidate) => candidate.numero === etape);
  if (ancrage === undefined) {
    // Une étape hors du § 11 ne peut pas décider d'un statut : fail-closed sur
    // le seul statut qui n'affirme rien de l'appel.
    return STATUT_ERREUR_INTERNE;
  }
  return ancrage.statutHttp ?? STATUT_SUCCES;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX EN-TÊTES DU § 15
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE DÉFI `WWW-Authenticate` — RFC 6750, § 3.
 *
 * ⚠️ **AUCUNE VALEUR REÇUE N'Y ENTRE.** Le `motif` vient d'une union fermée
 *    écrite dans ce dépôt (`MOTIFS_DE_DEFI`), et il n'est posé que dans
 *    `error_description`, jamais dans `error` — dont RFC 6750 ferme le
 *    vocabulaire. Un en-tête voyage en clair et se journalise partout : c'est le
 *    dernier endroit où l'on veut d'une valeur d'appelant.
 *
 * 🔴 **ÉCART SIGNALÉ : `resource_metadata` (RFC 9728) N'EST PAS SERVI.** La
 *    révision courante de MCP fait porter au défi l'URL de découverte de la
 *    ressource protégée, ce qui suppose de servir
 *    `/.well-known/oauth-protected-resource` — une route qui appartient à
 *    l'émetteur (ADR 0001), pas au transport. Le § 11 note d'ailleurs que « la
 *    révision courante de la spécification MCP doit être relue au lot 1 ».
 */
export function defiWwwAuthenticate(defi: DefiDAuthentification): string {
  const parties = [`realm="${REALM_DU_SOCLE}"`];
  if (defi.tentativeFaite && defi.motif !== null) {
    parties.push('error="invalid_token"', `error_description="${defi.motif}"`);
  }
  return `Bearer ${parties.join(", ")}`;
}

/**
 * `Retry-After` — **SEULEMENT QUAND LE DÉLAI EST CONNU.**
 *
 * 🔴 **ÉCART MESURÉ, ET C'EST LE POINT DE CETTE FONCTION.** Le délai existe :
 *    `core/limits` le calcule (`retryAfterSecondes`) et l'orchestrateur l'écrit
 *    — **dans le TEXTE du message** de l'étape 12. `RefusDetaille` ne porte que
 *    `{ etape, code, message }` : la valeur ne franchit pas la frontière du
 *    noyau autrement que comme prose.
 *
 *    Trois issues, et pourquoi celle-ci :
 *
 *     1. relire le délai dans le message par expression régulière — c'est
 *        raisonner sur une FORME ÉCRITE, qui change au premier ajustement de
 *        phrase, en silence ;
 *     2. inventer une valeur, dérivée de la fenêtre la plus courte ou la plus
 *        longue de `LIMITES_DE_DEPART` — la première dit de réessayer trop tôt,
 *        la seconde bloque un client une heure pour une rafale de dix secondes.
 *        Et surtout : un transport n'importe pas `core/limits`, qui exécute des
 *        étapes (interdit de construction n° 2, ADR 0025) ;
 *     3. déclarer le port, l'appeler, et **compter les fois où il n'a rien
 *        rendu**.
 *
 *    C'est 3. `TraceDeReponse.retryAfterAbsentSur429` rend l'écart visible à
 *    chaque exécution, et il se referme en une ligne le jour où `RefusDetaille`
 *    porte `retryAfterSecondes`.
 */
export type LectureDuDelaiDeReprise = (etape: AppelStep, message: string) => number | null;

/**
 * LE LECTEUR LIVRÉ : il ne rend rien, et il le dit.
 *
 * Motif de `JOURNAL_AMONT_NON_ARME` et d'`INTENTION_NON_ARMEE` : un mécanisme
 * déclaré, appelé au bon instant, dont l'armement est une ligne chez l'appelant.
 * Il reçoit le message SANS le lire — la signature le lui donne pour que
 * l'implémentation qui saura, plus tard, n'ait pas à changer de forme.
 */
export const DELAI_DE_REPRISE_NON_DECLARE: LectureDuDelaiDeReprise = () => null;

/**
 * La valeur d'un `Retry-After`, en secondes entières, **jamais zéro**.
 *
 * RFC 9110, § 10.2.3 : `delay-seconds` est un entier non négatif. Un `0`
 * inviterait à rejouer immédiatement l'appel qu'on vient de refuser pour excès
 * de débit — c'est la boucle que le § 15 décrit à propos de `conflict`.
 */
export function valeurRetryAfter(secondes: number): string | null {
  if (!Number.isFinite(secondes)) return null;
  const entier = Math.max(1, Math.ceil(secondes));
  return String(entier);
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE FILET ANTI-FUITE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * La longueur au-dessous de laquelle une valeur n'est pas confrontée.
 *
 * Huit caractères : au-delà d'une coïncidence de vocabulaire (« invalid »,
 * « request ») et bien en deçà de tout porteur, de tout `jti` et de toute
 * empreinte. Ce n'est pas un chiffre rond jeté là — c'est le seuil à partir
 * duquel une collision fortuite avec un mot du protocole cesse d'être plausible.
 */
export const LONGUEUR_MINIMALE_CONFRONTEE = 8;

/** Ce que le filet rend. Des NOMBRES, et des NOMS de valeurs — jamais les valeurs. */
export interface VerdictDeFuite {
  /** Combien de valeurs sensibles ont été RÉELLEMENT confrontées. */
  readonly valeursConfrontees: number;
  /** Combien ont été écartées comme trop courtes pour être distinguables. */
  readonly valeursEcartees: number;
  /** Les NOMS des valeurs retrouvées dans la réponse. Jamais leur contenu. */
  readonly fuites: readonly string[];
}

/** Une valeur sensible de la requête, NOMMÉE — et le nom seul sort d'ici. */
export interface ValeurSensible {
  readonly nom: string;
  readonly valeur: string;
}

/**
 * CONFRONTE UNE RÉPONSE AUX VALEURS SENSIBLES DE LA REQUÊTE QUI L'A PRODUITE.
 *
 * Elle ne peut pas être verte pour rien : `valeursConfrontees` est incrémenté
 * dans la boucle, et `reponseSansFuite` refuse d'expédier une réponse dont le
 * filet n'a confronté AUCUNE valeur alors qu'on lui en a nommé — ce serait la
 * garde verte parce qu'elle ne regarde rien.
 */
export function verifierAucuneFuite(
  reponse: ReponseHttp,
  sensibles: readonly ValeurSensible[],
): VerdictDeFuite {
  // En-têtes ET corps : un défi, un `Retry-After` ou un en-tête de corrélation
  // sortent aussi sûrement qu'un corps, et se journalisent plus facilement.
  const sortie = [
    String(reponse.statut),
    ...Object.entries(reponse.entetes).map(([nom, valeur]) => `${nom}: ${valeur}`),
    reponse.corps,
  ].join("\n");

  const fuites: string[] = [];
  let valeursConfrontees = 0;
  let valeursEcartees = 0;

  for (const sensible of sensibles) {
    if (sensible.valeur.length < LONGUEUR_MINIMALE_CONFRONTEE) {
      valeursEcartees += 1;
      continue;
    }
    valeursConfrontees += 1;
    if (sortie.includes(sensible.valeur)) {
      fuites.push(sensible.nom);
    }
  }

  return { valeursConfrontees, valeursEcartees, fuites };
}

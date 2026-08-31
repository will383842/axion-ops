/**
 * `ops/demarrage/etages.ts` — **L'ÉCHELLE DU DÉMARRAGE, ÉCRITE COMME UNE DONNÉE.**
 *
 * ═══ CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ═══
 *
 * Il ne démarre rien. Il **déclare l'ordre** des sept étages du démarrage, et
 * pour chacun : qui décide, ce qui refuse, et ce que le socle sert quand ça
 * refuse. La racine de composition — `ops/main.ts`, écrite par le constructeur —
 * ne redécide rien : elle **parcourt cette table**, et une garde la confronte à
 * elle pour qu'un étage ajouté ici sans exécutant là-bas fasse rougir plutôt que
 * d'être sauté en silence.
 *
 * C'est le motif d'`EXECUTANTS_ETAPES` / `verifierCouvertureDesEtapes`
 * (`core/chaine/orchestrateur.ts`) appliqué au démarrage : la liste des étapes
 * est la SOURCE, l'implémentation lui est CONFRONTÉE. Une racine de composition
 * qui porterait sa propre séquence en dur serait une seconde source de vérité,
 * et c'est la seconde qui ne suit jamais.
 *
 * ═══ POURQUOI CE FICHIER EXISTE — LE MANQUE QUI DÉFINIT LE LOT 2 ═══
 *
 * À la fin du lot 1d, **rien n'appelait le socle**. `demarrerPolitique()` était
 * écrite, testée, documentée — et `core/policy/demarrage.ts` portait déjà sa
 * propre garde de raccordement (`verifierLeCablageDuDemarrage`) qui comptait
 * zéro appelant de production. `demarrerLeSocleMonoInstance()` de même. Un socle
 * réellement déployé ce jour-là n'aurait pris aucun verrou et, redémarré pendant
 * un desserrage, aurait **repris au dernier niveau connu** — ce que le § 20
 * interdit nommément par sa quatrième protection.
 *
 * Voir **ADR 0023**.
 *
 * ⚠️ **AUCUNE FONCTION N'EST EXPORTÉE ICI, ET C'EST DÉLIBÉRÉ.** Poser une
 *    `demarrerLeSocle()` qui lève « non implémentée » fabriquerait une mine : un
 *    appelant la trouverait exportée, et la panne arriverait à l'exécution
 *    plutôt qu'à la lecture. L'architecte pose la forme ; le constructeur écrit
 *    le corps.
 */

import type { RouteDuSocle } from "../../core/vault/demarrage.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES SEPT ÉTAGES, DANS L'ORDRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ORDRE DU DÉMARRAGE. **C'est un tuple, donc l'ordre est tenu par le type.**
 *
 * ⚠️ L'ORDRE EST LA DÉCISION, PAS UNE COMMODITÉ. Chaque rang est justifié à
 *    l'ADR 0023, et deux inversions plausibles y sont écartées nommément :
 *
 *     · **coffre AVANT authentification** — le matériel d'authentification de la
 *       console n'entre JAMAIS dans le coffre (§ 21). L'étage 3 est donc
 *       vérifiable sous coffre verrouillé, et il DOIT l'être : sinon un coffre
 *       verrouillé rendrait la route de déverrouillage inatteignable, et le § 23
 *       perdrait son deuxième état ;
 *     · **verrou AVANT tout** — « un verrou EXCLUSIF est pris AVANT de servir
 *       quoi que ce soit » (ADR 0018). Un second socle qui prendrait le verrou
 *       après avoir monté ses transports aurait déjà servi des appels.
 */
export const CLES_DES_ETAGES = [
  "verrou",
  "coffre",
  "authentification",
  "politique",
  "registre",
  "transports",
  "veille",
] as const;

/** La clé d'un étage du démarrage. */
export type CleDEtage = (typeof CLES_DES_ETAGES)[number];

/**
 * CE QU'UN ÉTAGE FAIT QUAND IL REFUSE. **Trois valeurs, pas deux.**
 *
 * ⚠️ « DÉMARRE » ET « NE DÉMARRE PAS » NE SUFFISENT PAS, et le § 23 le prouve :
 *    le coffre verrouillé fait démarrer un socle **amputé** — healthcheck 200,
 *    console et déverrouillage servis, tout appel d'outil refusé. Réduire cet
 *    état à l'un des deux autres est exactement le raccourci que le § 23 nomme
 *    comme le défaut qui « rend rouge chaque déploiement ».
 */
export const ISSUES_DE_REFUS = [
  /**
   * Le processus **sort**, avec un code non nul. Aucun port n'est ouvert, aucune
   * route n'est montée, et le message nomme le geste (§ 25).
   */
  "processus-sort",
  /**
   * Le socle démarre, mais **une partie des routes seulement** est servie. La
   * liste des routes est DÉRIVÉE du module propriétaire, jamais recopiée ici.
   */
  "demarrage-ampute",
  /**
   * Le démarrage continue, et l'objet fautif est **désactivé et signalé** —
   * l'épinglage du § 20 : « tout écart entre la valeur épinglée et la valeur
   * reçue désactive l'outil et alerte, au lieu de mettre à jour en silence ».
   */
  "objet-desactive",
] as const;

/** Ce qu'un étage fait quand il refuse. */
export type IssueDeRefus = (typeof ISSUES_DE_REFUS)[number];

/**
 * UN ÉTAGE DU DÉMARRAGE.
 *
 * ⚠️ AUCUN CHAMP NE PORTE UNE DÉCISION QUI VIT AILLEURS. `decideurs` NOMME les
 *    symboles qui décident, il ne les recopie pas : la table des quatre états du
 *    verrou vit dans `core/instance/verrou.ts`, celle des trois états du coffre
 *    dans `core/vault/demarrage.ts`, et cet étage-ci ne fait que dire QUI
 *    appeler et DANS QUEL ORDRE. Une décision prise à deux endroits est une
 *    décision qui divergera.
 */
export interface EtageDeDemarrage {
  readonly cle: CleDEtage;
  /** Le rang, à partir de 1. DÉRIVÉ de {@link CLES_DES_ETAGES} par la garde. */
  readonly rang: number;
  /** Ce que l'étage établit, en une phrase. */
  readonly etablit: string;
  /**
   * Les symboles de production qui portent la décision de cet étage. La racine
   * de composition doit les APPELER — c'est ce que la garde de couture (ADR
   * 0019) confronte, symbole par symbole.
   */
  readonly decideurs: readonly string[];
  /** Ce qui fait refuser cet étage, en une phrase falsifiable. */
  readonly refusQuand: string;
  readonly issue: IssueDeRefus;
  /**
   * Les routes encore servies après un refus de cet étage, ou `null` quand
   * l'issue n'est pas `demarrage-ampute`.
   *
   * ⚠️ ELLE EST DÉRIVÉE DE `core/vault/demarrage.ts`, JAMAIS ÉCRITE ICI. Une
   *    seconde liste de routes divergerait de la première au premier ajout, et
   *    la divergence serait muette.
   */
  readonly routesEncoreServies: readonly RouteDuSocle[] | null;
  /**
   * Le paragraphe du cahier des charges qui fonde cet étage. Écrit pour qu'une
   * revue puisse CONTREDIRE, pas pour décorer.
   */
  readonly source: string;
}

/**
 * L'ÉCHELLE. Une entrée par clé de {@link CLES_DES_ETAGES} — la totalité est
 * tenue par le compilateur : ajouter une clé sans son étage **ne compile pas**.
 *
 * ⚠️ **LE CONSTRUCTEUR REMPLIT `routesEncoreServies` PAR DÉRIVATION.** Il est
 *    laissé à `null` partout ici, y compris pour le coffre, précisément pour
 *    qu'aucune liste ne soit recopiée à la main : `decisionDeDemarrage("verrouillé")`
 *    la rend déjà, et c'est de là qu'elle doit venir. Un `null` que la garde
 *    voit est une dette visible ; une liste recopiée est une dette invisible.
 */
export const ETAGES_DU_DEMARRAGE: Readonly<Record<CleDEtage, EtageDeDemarrage>> = {
  verrou: {
    cle: "verrou",
    rang: 1,
    etablit: "Ce processus est le SEUL socle en vie.",
    decideurs: ["demarrerLeSocleMonoInstance", "deciderDemarrageMonoInstance"],
    refusQuand:
      "une autre instance tient le verrou, ou le magasin de verrous est injoignable — " +
      "les deux refusent, et ils ne se réparent pas du même geste.",
    issue: "processus-sort",
    routesEncoreServies: null,
    source: "ADR 0018 · ADR 0024 · § 20 (l'index de provenance est local au processus)",
  },
  coffre: {
    cle: "coffre",
    rang: 2,
    etablit: "Lequel des trois états du § 23 est le nôtre.",
    decideurs: ["decisionDeDemarrage"],
    refusQuand:
      "le coffre est ABSENT — aucun sceau en base. Un coffre VERROUILLÉ ne refuse pas : " +
      "il ampute.",
    issue: "demarrage-ampute",
    routesEncoreServies: null,
    source: "§ 23 (trois états) · ADR 0005 (étape 0, `vault_locked`) · § 21",
  },
  authentification: {
    cle: "authentification",
    rang: 3,
    etablit: "L'émetteur est configuré, et l'audience a une forme valide.",
    decideurs: ["verifierLaConfigurationDAuthentification"],
    refusQuand:
      "un réglage d'authentification manque, ou l'indicateur de ressource n'a pas la forme " +
      "exigée. AUCUN MODE DÉGRADÉ, AUCUN `AUTH_DISABLED` — c'est la règle absolue du § 19.",
    issue: "processus-sort",
    routesEncoreServies: null,
    source: "§ 19 (règle absolue) · ADR 0001 · ADR 0026 · ADR 0027",
  },
  politique: {
    cle: "politique",
    rang: 4,
    etablit: "Le niveau le plus strict est en vigueur, et une ligne le dit.",
    decideurs: ["demarrerPolitique"],
    refusQuand:
      'la ligne `setBy: "boot"` n\'a pas pu être écrite. Le socle ne sert alors AUCUN appel : ' +
      "démarrer sans elle, c'est reprendre au dernier niveau connu — précisément ce que la " +
      "quatrième protection du § 20 interdit.",
    issue: "processus-sort",
    routesEncoreServies: null,
    source: "§ 20 (protection 4, fail-closed) · § 12 (règle 1)",
  },
  registre: {
    cle: "registre",
    rang: 5,
    etablit: "Le catalogue servi est celui que le lock épingle.",
    decideurs: ["enregistrerAdaptateur", "verifierLock"],
    refusQuand:
      "`adapters.lock.json` est illisible ou incohérent — le socle ne peut alors dire d'AUCUN " +
      "outil qu'il est épinglé. Un manifeste isolé qui s'écarte de son épingle ne fait pas " +
      "refuser le démarrage : il désactive SON adaptateur et alerte.",
    issue: "processus-sort",
    routesEncoreServies: null,
    source: "§ 20 (épinglage) · § 09 · ADR 0004",
  },
  transports: {
    cle: "transports",
    rang: 6,
    etablit: "Chaque transport monté couvre toutes les étapes du § 11 qui lui incombent.",
    decideurs: ["verifierCouvertureDesEtapes", "colonneDuTransport"],
    refusQuand:
      "une étape applicable au transport n'a aucun exécutant, ou la liste blanche de `Host` " +
      "est vide. Une liste blanche vide n'est pas « tout autoriser » : c'est un refus.",
    issue: "processus-sort",
    routesEncoreServies: null,
    source: "§ 11 (quatorze étapes, anti DNS-rebinding) · ADR 0025",
  },
  veille: {
    cle: "veille",
    rang: 7,
    etablit: "La veille BAT, et son battement se lit au healthcheck.",
    decideurs: ["relireLaSanteMonoInstance"],
    refusQuand:
      "rien. La veille ne refuse pas le démarrage — elle refuse le SILENCE : son absence de " +
      "battement doit se voir au healthcheck. Une veille muette ne distingue pas sa propre " +
      "mort de l'absence d'incident.",
    issue: "objet-desactive",
    routesEncoreServies: null,
    source: "§ 22 (écran Santé) · § 24 (observabilité) · ADR 0018",
  },
};

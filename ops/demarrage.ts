/**
 * `ops/demarrage.ts` — **L'ARBITRE DU DÉMARRAGE, ET LA GARDE DE L'ÉCHELLE.**
 *
 * ═══ CE QUE CE FICHIER EST ═══
 *
 * Deux fonctions PURES, et rien d'autre :
 *
 *  1. {@link arbitrerLeDemarrage} — on lui donne ce que les sept étages ont
 *     répondu, elle rend ce que le socle SERT. Elle n'ouvre aucune connexion,
 *     ne lit aucun environnement, n'appelle aucun étage : c'est le modèle de
 *     `core/vault/demarrage.ts` — « un arbitre PUR qui rend une décision, et un
 *     câblage mince autour ». Le câblage vit dans `ops/main.ts` ;
 *  2. {@link verifierLaCouvertureDesEtages} — la garde que l'ADR 0023 prescrit :
 *     `ops/main.ts` est **confronté** à `ETAGES_DU_DEMARRAGE`, jamais l'inverse.
 *
 * ═══ POURQUOI L'ARBITRE EST SÉPARÉ DU CÂBLAGE ═══
 *
 * Parce qu'un démarrage ne se rejoue pas. Une décision prise à l'intérieur de la
 * séquence d'ouverture des connexions ne se couvre qu'en montant un socle
 * entier ; une décision PURE se couvre sur les sept étages et les trois issues
 * en quelques lignes, et le jour où l'un d'eux change, c'est `tsc` qui le dit.
 *
 * ⚠️ **CE MODULE NE DÉCIDE JAMAIS DEUX FOIS.** Les routes servies sous coffre
 *    verrouillé viennent de `decisionDeDemarrage()` (`core/vault/demarrage.ts`),
 *    portée telle quelle dans le résultat de l'étage 2 ; l'arbitre les RELAIE.
 *    C'est pour cela que `ETAGES_DU_DEMARRAGE.coffre.routesEncoreServies` vaut
 *    `null` dans la table : une seconde liste recopiée aurait divergé de la
 *    première au premier ajout de route, et la divergence aurait été muette.
 *
 * ⚠️ **LES TROIS NETTOYAGES DE LA GARDE SONT IMPORTÉS, PAS RÉÉCRITS.**
 *    `sansProse` et `sansLiaisons` viennent de `core/coutures/verifier.ts`. Une
 *    seconde écriture de « ce nom est-il appelé ici ? » aurait divergé de celle
 *    du registre des coutures — et c'est la seconde qui ne suit jamais. Le
 *    défaut qu'elles ferment a été MESURÉ au lot 1c : deux modules nommaient
 *    `cumulerChampsDeGouvernance()` dans un bloc JSDoc, parenthèses comprises,
 *    et la couture passait pour faite.
 *
 * Voir **ADR 0023**.
 */

import { sansLiaisons, sansProse } from "../core/coutures/verifier.js";
import type { EtatCoffre } from "../core/vault/etat.js";
import type { DecisionDeDemarrage, RouteDuSocle } from "../core/vault/demarrage.js";
import type { CleDEtage, EtageDeDemarrage, IssueDeRefus } from "./demarrage/etages.js";
import { CLES_DES_ETAGES, ETAGES_DU_DEMARRAGE } from "./demarrage/etages.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QU'UN ÉTAGE REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE REFUS D'UN ÉTAGE — sa cause, et ce qu'il fait du socle.
 *
 * ⚠️ **`issue` VIENT DE LA TABLE, PAS DE L'ÉTAGE.** C'est l'échelle qui décide
 *    si un refus fait sortir le processus, l'ampute ou désactive un objet ; un
 *    étage qui choisirait lui-même son issue pourrait décider de ne pas faire
 *    sortir le processus, et le § 19 y perdrait sa règle absolue.
 */
export interface RefusDEtage {
  readonly cle: CleDEtage;
  /** DÉRIVÉ de la table. Il sert de code de sortie : voir {@link codeDeSortie}. */
  readonly rang: number;
  readonly issue: IssueDeRefus;
  /** Ce qu'il faut faire ensuite (§ 25, le message nomme le geste). */
  readonly message: string;
}

/**
 * CE QU'UN ÉTAGE RAPPORTE — **des faits ET des nombres, jamais un booléen seul.**
 *
 * ⚠️ `comptes` N'EST PAS DÉCORATIF. Un étage qui répond « franchi » sans dire
 *    combien d'éléments il a confrontés est vert de la pire façon : l'étage 6
 *    franchi sur ZÉRO hôte confronté est exactement la liste blanche vide que
 *    l'ADR 0025 refuse, et rien dans un booléen ne les distingue.
 */
export interface ResultatDEtage {
  readonly cle: CleDEtage;
  readonly franchi: boolean;
  /** Non nul si et seulement si {@link franchi} est faux. */
  readonly refus: RefusDEtage | null;
  /** Ce que l'étage a MESURÉ. Des nombres nommés, lus par le healthcheck. */
  readonly comptes: Readonly<Record<string, number>>;
  /**
   * La décision du coffre, portée TELLE QUELLE par l'étage 2 et `null` partout
   * ailleurs. C'est d'elle que l'arbitre dérive les routes servies,
   * `vaultLocked` et l'acceptation des appels d'outils.
   */
  readonly coffre: DecisionDeDemarrage | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES CODES DE SORTIE
// ═════════════════════════════════════════════════════════════════════════════

/** Le socle sert. Aucun étage n'a fait sortir le processus. */
export const CODE_DE_SORTIE_NOMINAL = 0;

/**
 * **L'ISSUE DU REFUS DE L'ÉTAGE 2 NE SE LIT PAS DANS L'ÉCHELLE.**
 *
 * ⚠️ C'est `ops/demarrage/etages.ts` lui-même qui l'impose : « AUCUN CHAMP NE
 *    PORTE UNE DÉCISION QUI VIT AILLEURS. `decideurs` NOMME les symboles qui
 *    décident, il ne les recopie pas : […] la table des trois états du coffre
 *    [vit] dans `core/vault/demarrage.ts` ». L'étage 2 déclare
 *    `issue: "demarrage-ampute"`, et c'est juste POUR UN COFFRE VERROUILLÉ ;
 *    son propre `refusQuand` dit pourtant que le refus est prononcé sur un
 *    coffre **ABSENT** — et le § 23 exige alors que le conteneur NE DÉMARRE
 *    PAS. Lire l'issue dans la table ferait donc vivre un socle sans coffre,
 *    routes vides, ce que le § 32 refuse en toutes lettres.
 *
 * L'issue est donc **dérivée du propriétaire de la décision** : `demarre` vaut
 * vrai pour `verrouillé` (le socle vit, amputé) et faux pour `absent` (il sort).
 * Un quatrième état du coffre tomberait du bon côté sans qu'aucune liste soit
 * retouchée. Voir l'écart signalé à l'architecte de l'ADR 0023.
 */
export function issueDuRefusDeCoffre(decision: DecisionDeDemarrage): IssueDeRefus {
  return decision.demarre ? "demarrage-ampute" : "processus-sort";
}

/**
 * L'issue qu'un résultat DOIT porter : celle de son propriétaire quand il en a
 * un, celle de l'échelle sinon. Une seule écriture, lue par `refuser()` comme
 * par le contrôle de cohérence de l'arbitre — deux écritures se contrediraient.
 */
function issueAttendue(
  resultat: Pick<ResultatDEtage, "cle" | "coffre">,
  etages: Readonly<Record<CleDEtage, EtageDeDemarrage>>,
): IssueDeRefus {
  if (resultat.cle === "coffre" && resultat.coffre !== null) {
    return issueDuRefusDeCoffre(resultat.coffre);
  }
  return etages[resultat.cle].issue;
}

/**
 * LE CODE DE SORTIE EST LE **RANG** DE L'ÉTAGE QUI A REFUSÉ.
 *
 * ⚠️ **DÉRIVÉ, JAMAIS TABULÉ.** Une seconde table « clé → code » aurait vécu à
 *    côté de l'échelle et aurait divergé d'elle au premier étage inséré. Le rang
 *    est déjà porté par `ETAGES_DU_DEMARRAGE`, il est unique, et il se lit sans
 *    documentation : « sorti en 4 » se traduit « l'étage 4, la politique ».
 *
 * ⚠️ **UN `demarrage-ampute` NE PRODUIT AUCUN CODE DE SORTIE**, puisque le
 *    processus vit. Confondre les deux était le défaut bloquant n° 12 du § 23 :
 *    un coffre verrouillé qui ferait sortir le processus rendrait rouge CHAQUE
 *    déploiement, et on apprendrait à ignorer le rouge.
 */
export function codeDeSortie(refus: RefusDEtage | null): number {
  if (refus === null || refus.issue !== "processus-sort") return CODE_DE_SORTIE_NOMINAL;
  return refus.rang;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA DÉCISION DE DÉMARRAGE DU SOCLE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que l'arbitre rend. Le câblage n'a plus rien à recalculer. */
export interface DemarrageDuSocle {
  /** Combien d'étages la table déclare. Un zéro rendrait tout le reste muet. */
  readonly etagesDeclares: number;
  /** Combien ont réellement rapporté. */
  readonly etagesConfrontes: number;
  readonly etagesFranchis: number;
  /** Dans l'ordre où ils ont rapporté. Confronté à {@link CLES_DES_ETAGES}. */
  readonly etagesExecutes: readonly CleDEtage[];
  /** Le socle vit-il et sert-il quelque chose ? */
  readonly sert: boolean;
  readonly codeDeSortie: number;
  /** Le refus qui a fait SORTIR le processus, ou `null`. */
  readonly sortie: RefusDEtage | null;
  /** Les refus qui ont AMPUTÉ le démarrage sans le refuser. */
  readonly amputations: readonly RefusDEtage[];
  /** Les refus qui ont désactivé un objet et alerté (épinglage du § 20). */
  readonly objetsDesactives: readonly RefusDEtage[];
  /** DÉRIVÉES de la décision du coffre. Vides quand le processus sort. */
  readonly routesServies: readonly RouteDuSocle[];
  /** § 23 — le drapeau du healthcheck. FAIL-CLOSED tant que l'étage 2 n'a pas parlé. */
  readonly vaultLocked: boolean;
  /**
   * L'état du coffre TEL QUE L'ÉTAGE 2 L'A CONSTATÉ, et non redérivé de
   * `vaultLocked`.
   *
   * ⚠️ `absent` ET `verrouillé` PORTENT TOUS DEUX `vaultLocked: true` : les
   *    redériver du drapeau les confondrait, alors qu'ils ne se réparent pas du
   *    même geste (provisionner d'un côté, déverrouiller de l'autre — § 23).
   *    `null` tant que l'étage 2 n'a pas parlé.
   */
  readonly etatDuCoffre: EtatCoffre | null;
  readonly appelsDOutilsAcceptes: boolean;
  /**
   * CE QUE CHAQUE ÉTAGE A MESURÉ, rangé par clé.
   *
   * ⚠️ **LE HEALTHCHECK LIT ICI, IL NE RECOMPTE RIEN.** Un second comptage —
   *    « combien d'adaptateurs sont épinglés ? » posée deux fois — aurait
   *    divergé du premier, et c'est le second qui ne suit jamais.
   */
  readonly comptesParEtage: Readonly<Partial<Record<CleDEtage, Readonly<Record<string, number>>>>>;
  /**
   * Les lignes à écrire sur la SORTIE D'ERREUR, et nulle part ailleurs.
   *
   * ⚠️ **AUCUN REFUS DE DÉMARRAGE N'ENTRE DANS `ops_audit`.** La chaîne du
   *    journal est scellée par une clé du coffre (ADR 0002) ; sous coffre
   *    verrouillé — l'état dans lequel les sept étages tournent — cette clé
   *    n'est pas lisible. Une ligne non scellée fabriquerait un trou dans la
   *    chaîne, c'est-à-dire rendrait normal ce que l'ADR 0002 existe pour
   *    rendre détectable.
   */
  readonly lignesDeSortieDErreur: readonly string[];
  /** Ce que la séquence elle-même a de faux : ordre, totalité, doublon. */
  readonly anomalies: readonly string[];
}

/**
 * L'ARBITRE. Il ne parcourt pas l'échelle — il JUGE ce qu'elle a rendu.
 *
 * Trois familles de reproches, et aucune ne se déduit d'une autre :
 *
 *  · **l'ordre** — les étages doivent rapporter dans l'ordre de
 *    {@link CLES_DES_ETAGES}. Un étage déplacé est une anomalie même si tous
 *    sont présents : c'est l'ordre qui porte la sûreté (verrou avant tout,
 *    coffre avant authentification) ;
 *  · **la totalité** — un socle qui SERT doit avoir franchi les sept. Servir
 *    après en avoir sauté un serait précisément le contournement silencieux que
 *    l'ADR 0023 ferme ;
 *  · **la cohérence** — un étage `franchi` qui porte un refus, ou l'inverse.
 *
 * ⚠️ **LE PREMIER `processus-sort` ARRÊTE TOUT.** Les étages suivants ne sont
 *    pas exécutés, donc pas rapportés, et leur absence n'est PAS une anomalie :
 *    la liste rapportée doit être un PRÉFIXE de l'échelle, pas la totalité.
 */
export function arbitrerLeDemarrage(
  resultats: readonly ResultatDEtage[],
  etages: Readonly<Record<CleDEtage, EtageDeDemarrage>> = ETAGES_DU_DEMARRAGE,
): DemarrageDuSocle {
  const anomalies: string[] = [];
  const executes: CleDEtage[] = [];
  const amputations: RefusDEtage[] = [];
  const objetsDesactives: RefusDEtage[] = [];
  const lignes: string[] = [];
  const comptesParEtage: Partial<Record<CleDEtage, Readonly<Record<string, number>>>> = {};
  let sortie: RefusDEtage | null = null;
  let franchis = 0;
  let coffre: DecisionDeDemarrage | null = null;

  for (const [rang, resultat] of resultats.entries()) {
    executes.push(resultat.cle);
    comptesParEtage[resultat.cle] = resultat.comptes;

    // ── L'ORDRE ────────────────────────────────────────────────────────────
    const attendue = CLES_DES_ETAGES[rang];
    if (attendue !== resultat.cle) {
      anomalies.push(
        `étage n° ${String(rang + 1)} : « ${resultat.cle} » a rapporté là où l'échelle attend ` +
          `« ${attendue ?? "aucun étage"} » — l'ordre EST la décision (ADR 0023)`,
      );
    }

    // ── LA COHÉRENCE ───────────────────────────────────────────────────────
    if (resultat.franchi && resultat.refus !== null) {
      anomalies.push(`étage « ${resultat.cle} » : franchi ET porteur d'un refus`);
    }
    if (!resultat.franchi && resultat.refus === null) {
      anomalies.push(`étage « ${resultat.cle} » : non franchi et SANS refus — un refus muet`);
    }

    if (resultat.cle === "coffre" && resultat.coffre !== null) coffre = resultat.coffre;

    if (resultat.franchi) {
      franchis += 1;
      continue;
    }

    const refus = resultat.refus;
    if (refus === null) continue;

    const issueDue = issueAttendue(resultat, etages);
    if (refus.issue !== issueDue) {
      anomalies.push(
        `étage « ${refus.cle} » : refus d'issue « ${refus.issue} » alors que son propriétaire lui ` +
          `attribue « ${issueDue} » — un étage ne choisit pas ce que son refus coûte`,
      );
    }

    lignes.push(
      `[démarrage · étage ${String(refus.rang)}/${String(CLES_DES_ETAGES.length)} · ` +
        `${refus.cle} · ${refus.issue}] ${refus.message}`,
    );

    switch (refus.issue) {
      case "processus-sort":
        sortie ??= refus;
        break;
      case "demarrage-ampute":
        amputations.push(refus);
        break;
      case "objet-desactive":
        objetsDesactives.push(refus);
        break;
    }
  }

  const sert = sortie === null;

  // ── LA TOTALITÉ ─────────────────────────────────────────────────────────
  if (sert && executes.length !== CLES_DES_ETAGES.length) {
    anomalies.push(
      `le socle servirait après ${String(executes.length)} étage(s) sur ` +
        `${String(CLES_DES_ETAGES.length)} — un étage sauté est un contournement, ` +
        "pas une optimisation (ADR 0023)",
    );
  }

  // ⚠️ FAIL-CLOSED TANT QUE L'ÉTAGE 2 N'A PAS PARLÉ. Un socle qui sort à
  //    l'étage 1 n'a jamais lu l'état du coffre : annoncer `vaultLocked: false`
  //    reviendrait à annoncer « coffre ouvert » sur un coffre qu'on n'a pas
  //    regardé. C'est le même repli que `decisionDeDemarrage("absent")`.
  const routesServies = sert && coffre !== null ? coffre.routesServies : [];
  const vaultLocked = coffre === null ? true : coffre.vaultLocked;
  const appelsDOutilsAcceptes = sert && coffre !== null && coffre.appelsDOutilsAcceptes;

  return {
    etagesDeclares: CLES_DES_ETAGES.length,
    etagesConfrontes: resultats.length,
    etagesFranchis: franchis,
    etagesExecutes: executes,
    sert,
    codeDeSortie: codeDeSortie(sortie),
    sortie,
    amputations,
    objetsDesactives,
    routesServies,
    vaultLocked,
    etatDuCoffre: coffre?.etat ?? null,
    appelsDOutilsAcceptes,
    comptesParEtage,
    lignesDeSortieDErreur: lignes,
    anomalies,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX FABRIQUES DE RÉSULTAT — pour que la forme ne s'écrive qu'ici
// ═════════════════════════════════════════════════════════════════════════════

/** Un étage FRANCHI, avec ce qu'il a mesuré. */
export function franchir(
  cle: CleDEtage,
  comptes: Readonly<Record<string, number>>,
  coffre: DecisionDeDemarrage | null = null,
): ResultatDEtage {
  return { cle, franchi: true, refus: null, comptes, coffre };
}

/**
 * Un étage qui REFUSE. L'issue et le rang sont LUS DANS LA TABLE, jamais
 * fournis par l'appelant : c'est ce qui empêche un étage de décider lui-même
 * que son refus ne fait pas sortir le processus.
 */
export function refuser(
  cle: CleDEtage,
  message: string,
  comptes: Readonly<Record<string, number>> = {},
  coffre: DecisionDeDemarrage | null = null,
  etages: Readonly<Record<CleDEtage, EtageDeDemarrage>> = ETAGES_DU_DEMARRAGE,
): ResultatDEtage {
  return {
    cle,
    franchi: false,
    refus: {
      cle,
      rang: etages[cle].rang,
      issue: issueAttendue({ cle, coffre }, etages),
      message,
    },
    comptes,
    coffre,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA GARDE DE L'ADR 0023 — LA RACINE, CONFRONTÉE À L'ÉCHELLE
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'un décideur nommé par la table devient après confrontation au source. */
export interface DecideurConfronte {
  readonly cle: CleDEtage;
  readonly symbole: string;
  /** Position du premier appel dans le source nettoyé, ou `-1`. */
  readonly position: number;
  readonly appele: boolean;
}

/** Le rapport de la garde. **Des nombres, et des noms — jamais une couleur.** */
export interface CouvertureDesEtages {
  /** Octets de racine réellement lus. Un zéro rend tout le reste muet. */
  readonly octetsLus: number;
  readonly etagesConfrontes: number;
  readonly symbolesCherches: number;
  readonly appelsTrouves: number;
  readonly decideurs: readonly DecideurConfronte[];
  /** Les étages dont AUCUN décideur n'est appelé par la racine. */
  readonly etagesSansExecutant: readonly CleDEtage[];
  /**
   * Les symboles nommés par la table que la racine n'appelle pas directement.
   *
   * ⚠️ **CE N'EST PAS UNE ANOMALIE EN SOI, ET LA RAISON EST MESURÉE.** Deux
   *    décideurs d'un même étage peuvent être l'un l'appelant de l'autre :
   *    `demarrerLeSocleMonoInstance` appelle `deciderDemarrageMonoInstance`, et
   *    `core/instance/demarrage.ts` écrit noir sur blanc « IL NE DÉCIDE PAS UNE
   *    SECONDE FOIS ». Exiger que la racine appelle les deux la forcerait à
   *    reprendre une décision qui vit ailleurs. La liste est donc ANNONCÉE, et
   *    c'est l'appelant qui tient le cliquet daté — un symbole de plus ne peut
   *    pas s'y ajouter en silence.
   */
  readonly symbolesSansAppel: readonly string[];
  /** L'ordre dans lequel la racine appelle les étages, LU dans le source. */
  readonly ordreLu: readonly CleDEtage[];
  readonly anomalies: readonly string[];
}

/**
 * Le motif d'appel d'un symbole. **DÉRIVÉ de `formeDuGenre("fonction", …)` de
 * `core/coutures/verifier.ts` dans son intention**, et réécrit ici pour une
 * seule raison : cette garde-ci a besoin de la POSITION du premier appel, pas
 * seulement de son existence, et `RegExp.exec` la rend là où `test` ne la rend
 * pas.
 *
 * ⚠️ L'ARGUMENT DE TYPE EST ADMIS. Un motif `nom\s*\(` déclarerait non appelé
 *    tout symbole écrit `f<T>(…)` — le défaut a été mesuré au lot 1c sur
 *    `avecJournal<ChargeServie>(…)`, le module le plus central du socle.
 */
function formeDAppel(symbole: string): RegExp {
  const nom = symbole.replace(/[.*+?^${}()|[\]\\]/g, (caractere) => `\\${caractere}`);
  return new RegExp(`\\b${nom}\\s*(?:<[^;()]*?>)?\\s*\\(`);
}

/**
 * **LA RACINE EST CONFRONTÉE À L'ÉCHELLE, JAMAIS L'INVERSE.**
 *
 * @param sourceDeLaRacine le source de `ops/main.ts`, TEL QUEL. Le retrait des
 *   commentaires et des clauses d'import appartient à la garde : c'est ce qui
 *   permet au témoin de fabriquer une racine qui CITE un symbole en prose et
 *   d'exiger qu'elle ne soit pas comptée.
 * @param etagesEnAttente les étages dont le décideur n'est pas encore écrit —
 *   le cliquet, tenu par l'appelant et daté chez lui. Un étage qui y figure ET
 *   qui a un exécutant est une anomalie, exactement comme l'inverse : la liste
 *   doit se vider quand le travail arrive, sans quoi elle bénit l'oubli.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** C'est une lecture de TEXTE, pas
 *    d'AST — même borne que `verifierLeCablageDuDemarrage`, qui l'écrit déjà.
 *    Elle répond à « quel fichier écrit ce nom », pas à « quel chemin
 *    d'exécution l'atteint ». Un appel derrière un drapeau jamais vrai lui
 *    échapperait.
 */
export function verifierLaCouvertureDesEtages(
  sourceDeLaRacine: string,
  etagesEnAttente: readonly CleDEtage[] = [],
  etages: Readonly<Record<CleDEtage, EtageDeDemarrage>> = ETAGES_DU_DEMARRAGE,
): CouvertureDesEtages {
  const corps = sansLiaisons(sansProse(sourceDeLaRacine));

  const decideurs: DecideurConfronte[] = [];
  const etagesSansExecutant: CleDEtage[] = [];
  const symbolesSansAppel: string[] = [];
  const anomalies: string[] = [];
  const ordreLu: { readonly cle: CleDEtage; readonly position: number }[] = [];
  let symbolesCherches = 0;
  let appelsTrouves = 0;

  for (const cle of CLES_DES_ETAGES) {
    const etage = etages[cle];
    let premier = -1;

    for (const symbole of etage.decideurs) {
      symbolesCherches += 1;
      const trouve = formeDAppel(symbole).exec(corps);
      const position = trouve?.index ?? -1;
      const appele = position >= 0;
      if (appele) {
        appelsTrouves += 1;
        if (premier < 0 || position < premier) premier = position;
      } else {
        symbolesSansAppel.push(symbole);
      }
      decideurs.push({ cle, symbole, position, appele });
    }

    const attendu = etagesEnAttente.includes(cle);
    if (premier < 0) {
      etagesSansExecutant.push(cle);
      if (!attendu) {
        anomalies.push(
          `étage ${String(etage.rang)} « ${cle} » : AUCUN de ses décideurs ` +
            `[${etage.decideurs.join(", ")}] n'est appelé par la racine — l'étage est déclaré ` +
            "et sauté, ce qui est le contournement exact que l'ADR 0023 ferme",
        );
      }
    } else {
      ordreLu.push({ cle, position: premier });
      if (attendu) {
        anomalies.push(
          `étage ${String(etage.rang)} « ${cle} » est annoncé EN ATTENTE de son constructeur, ` +
            "et la racine l'appelle désormais — le cliquet doit se vider, sinon il bénit l'oubli",
        );
      }
    }
  }

  // ── L'ORDRE DES APPELS DANS LE SOURCE ───────────────────────────────────
  // ⚠️ ON NE COMPARE QUE LES ÉTAGES RÉELLEMENT APPELÉS. Comparer à l'échelle
  //    entière ferait rougir l'ordre à cause d'un étage manquant, c'est-à-dire
  //    ferait dire à cette mesure ce qu'une autre dit déjà — et deux mesures
  //    d'un même fait finissent par se contredire.
  const lus = [...ordreLu].sort((a, b) => a.position - b.position).map((entree) => entree.cle);
  const attenduDansLOrdre = CLES_DES_ETAGES.filter((cle) => lus.includes(cle));
  if (lus.join(">") !== attenduDansLOrdre.join(">")) {
    anomalies.push(
      `la racine appelle les étages dans l'ordre [${lus.join(", ")}] là où l'échelle pose ` +
        `[${attenduDansLOrdre.join(", ")}] — l'ordre EST la décision (ADR 0023)`,
    );
  }

  return {
    octetsLus: sourceDeLaRacine.length,
    etagesConfrontes: CLES_DES_ETAGES.length,
    symbolesCherches,
    appelsTrouves,
    decideurs,
    etagesSansExecutant,
    symbolesSansAppel,
    ordreLu: lus,
    anomalies,
  };
}

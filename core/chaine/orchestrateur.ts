/**
 * `core/chaine/orchestrateur.ts` — LA CHAÎNE D'APPEL DU § 11, CÂBLÉE.
 *
 * ═══ CE QUE CE FICHIER EST ═══
 *
 * Le PROPRIÉTAIRE DE L'ORDRE. Étape 0, puis 5 à 14, chacune pouvant refuser,
 * chacune inscrivant SON numéro dans `ops_audit.stepDenied`. Les étapes 1 à 4
 * sont « HTTP seul » (§ 11) : elles se passent dans le transport, avant cette
 * fonction, et la COLONNE PAR TRANSPORT de ce fichier dit ce qu'il en est en
 * stdio, où elles n'existent pas.
 *
 * Au lot 1, l'ordre n'existait que dans un orchestrateur écrit à la main dans
 * un fichier de tests, avec ce commentaire : « cette main-là n'est gardée par
 * rien ». Deux appelants auraient produit deux ordres, et le second n'aurait
 * fait rougir aucune garde.
 *
 * ═══ LES DEUX RÈGLES DU § 11 QUE CE FICHIER TIENT ═══
 *
 * ① **LE JOURNAL N'EST PAS UNE ÉTAPE — C'EST UN INVARIANT DE SORTIE.**
 *
 *    « Toute terminaison, Y COMPRIS CHAQUE REFUS, écrit une ligne d'`ops_audit`
 *      portant le NUMÉRO de l'étape qui a refusé. Sans cela l'objectif O6 est
 *      faux dès le premier jour, et la métrique “refus de politique” du § 24
 *      n'a aucune source. »
 *
 *    Il n'est pas tenu ici par une consigne. Il l'est par le TYPE DE RETOUR :
 *    `orchestrerAppel()` rend un `ResultatAppel`, qui ÉTEND
 *    `AppelJournalise<ChargeServie>` de `core/audit` — dont le champ `ligne`
 *    est la ligne ÉCRITE. Il n'existe aucune façon de construire cette valeur
 *    sans qu'une écriture ait eu lieu : le corps ne rend jamais à l'appelant,
 *    il rend une `Terminaison` à `avecJournal`, qui journalise ses trois
 *    chemins de sortie (retour, refus, exception) et rend la valeur à sa place.
 *
 * ② **LE SCHÉMA AVANT LE QUOTA.** « Un appel malformé ne consomme rien.
 *    L'ordre inverse produit une boucle : le quota brûle, le 429 dit quand
 *    réessayer, le modèle attend et rejoue le même appel invalide. »
 *
 *    Cette règle-ci n'est pas tenue par ce fichier, et c'est mieux ainsi : elle
 *    est tenue par `appliquerLimites` de `core/limits`, qui reçoit le
 *    VALIDATEUR et l'exécute lui-même, en premier — le dépôt de quota n'étant
 *    atteignable qu'après le `return` du refus d'étape 8. L'orchestrateur ne
 *    PEUT donc pas inverser l'ordre : il n'a pas la main dessus. Une règle
 *    qu'on ne peut pas enfreindre vaut mieux qu'une règle qu'on relit.
 *
 * ═══ ⚠️ LA BORNE DE L'INVARIANT ①, ÉCRITE AVEC LA MESURE ═══
 *
 * L'inversion de contrôle garantit qu'on PASSE par l'écriture. **Elle ne
 * garantit pas qu'elle RÉUSSISSE.** Sur le chemin de succès, le corps a déjà
 * tourné — à l'étape 14, L'EFFET EXTÉRIEUR A EU LIEU — quand l'écriture
 * échoue. L'appel « échoue » alors pour l'appelant, ZÉRO ligne est écrite, et
 * l'effet est parti quand même.
 *
 * Ce n'est pas rattrapable par la seule inversion : le journal ne peut pas être
 * écrit avant que la durée et l'issue soient connues.
 *
 * **L'INVARIANT TIENT DONC, INCONDITIONNELLEMENT, POUR TOUTE TERMINAISON
 * ATTEINTE AVANT L'ÉTAPE 14. AU-DELÀ, IL EST BORNÉ PAR LA DISPONIBILITÉ DU
 * JOURNAL.** C'est la mesure ET sa borne, dans la même phrase.
 *
 * LE MÉCANISME PROPOSÉ, ET IL EST CÂBLÉ ICI : une ligne d'INTENTION écrite
 * AVANT l'effet extérieur, close par une ligne d'ISSUE APRÈS. Une intention non
 * close est alors précisément le signal qu'on veut voir — « un effet est parti,
 * son issue n'est pas revenue ». Il coûte une écriture de plus par appel
 * exécuté, et ce coût est l'arbitrage de Will (`docs/ETAT.md`, § 4.5).
 *
 * Il n'est pas tranché ici, mais il n'est plus une phrase : le port
 * {@link PorteeDIntention} existe, l'orchestrateur l'appelle aux deux instants
 * exacts, et `INTENTION_NON_ARMEE` est l'implémentation qui ne fait rien.
 * L'armer est UNE LIGNE chez l'appelant, et `orchestrateur.spec.ts` l'arme sur
 * un double pour prouver que les deux instants sont atteints — un mécanisme
 * déclaré et jamais exercé serait une garde qui ne peut pas échouer, donc pas
 * une garde.
 *
 * ═══ ⚠️ L'INVERSION 5 ↔ 6, ÉCART DU CDC ASSUMÉ ET DOCUMENTÉ ═══
 *
 * Le § 11 ordonne « scopes (5) → outil activé (6) ». Mais l'étape 5 se prononce
 * sur l'`effect` **ÉPINGLÉ DANS `ops_tool`** (§ 20, règle d'épinglage), et
 * c'est l'étape 6 qui relit `ops_tool`. **L'étape 5 a donc besoin de la sortie
 * de l'étape 6.** Les deux ne peuvent pas s'exécuter dans l'ordre où le § 11
 * les range. `etapes.ts` le dit d'ailleurs sans en tirer la conséquence :
 * « il est lu dans la définition que l'étape 6 a RELUE — d'où l'ordre de la
 * chaîne ».
 *
 * Ce que ce fichier fait : la LECTURE du catalogue est faite une fois,
 * MÉMOÏSÉE POUR CET APPEL SEUL ({@link memoiserPourCetAppel}) ; l'étape 5 se
 * prononce sur l'`effect` ainsi lu ; l'étape 6 rend ensuite son VERDICT
 * (épinglage, `enabled`) sur la même lecture. `stepDenied` reste vrai : 6 pour
 * un refus de catalogue, 5 pour un refus de scope.
 *
 * CE QUI EN DÉCOULAIT, ET CE QUI A ÉTÉ FERMÉ : un outil INEXISTANT était refusé
 * à l'étape 6 sans que l'étape 5 se soit prononcée — elle n'avait alors aucun
 * `effect` à examiner. Un appelant sans scope apprenait donc si un outil EXISTE.
 *
 * Le corps tranche désormais, AVANT toute lecture du catalogue, la seule
 * question que l'étape 5 peut trancher sans lui : **ce porteur couvre-t-il un
 * effect, quel qu'il soit ?** S'il n'en couvre aucun, aucun outil ne lui est
 * servable, et le refus d'étape 5 est prononcé pour n'importe quel nom — les
 * deux réponses sont alors indiscernables.
 *
 * ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE, ET ELLE EST RÉELLE : ceci ne vaut que pour
 *    un porteur SANS AUCUN scope utile. Un appelant qui porte `ops:read` et
 *    demande un outil `send` inconnu est toujours refusé à 6. Fermer ce cas-là
 *    supposerait de connaître l'`effect` d'un outil qu'on ne peut pas lire,
 *    c'est-à-dire de renoncer à l'épinglage du § 20. Écart maintenu au rapport,
 *    avec sa borne.
 *
 * ⚠️ LA MÉMOÏSATION EST **PAR APPEL**, JAMAIS PAR PROCESSUS. Le § 14,
 *    correction 3, dit qu'`ops_tool.enabled` bascule EN CONSOLE, SANS
 *    redéploiement : un cache de processus servirait l'ancienne valeur jusqu'au
 *    prochain redémarrage, c'est-à-dire qu'une désactivation d'urgence ne
 *    désactiverait rien. Une mémoïsation qui meurt avec l'appel ne peut pas
 *    porter cette faute : elle garantit seulement que les étapes 5 et 6 se
 *    prononcent sur LA MÊME lecture — ce qui est l'inverse d'un cache.
 */

import {
  APPEL_STEPS,
  EFFECTS,
  OPS_SCOPES,
  POLICY_LEVELS,
  type AppelStep,
  type ErrorCode,
  type Habilitations,
  type OpsScope,
  type PolicyLevel,
  type ToolContext,
} from "../types.js";
import {
  ARG_HASH_NON_LU,
  VERSION_INCONNUE,
  avecJournal,
  type AffineursDAppel,
  type AppelJournalise,
  type EnteteAppel,
  type Journal,
  type LigneEcrite,
  type Refus,
  type Succes,
  type Terminaison,
} from "../audit/index.js";
import {
  appliquerLimites,
  cloturerLimites,
  // ── LES DEUX COUTURES DU LOT 1d, ET ELLES SONT ICI ────────────────────────
  //  · `empreinteDeCleDIdempotence` — ADR 0020 : c'est CE fichier, et lui seul,
  //    qui pose `ctx.idempotencyRef`. Le constructeur de contexte ne le fabrique
  //    plus, et le type le lui interdit.
  //  · `issueDeReservation` — ADR 0021 : c'est le `finally` de l'étape 14 qui
  //    l'appelle, en lui remettant le CLIQUET lu, jamais le genre de la fin.
  empreinteDeCleDIdempotence,
  issueDeReservation,
  type CalculArgHash,
  type DepotIdempotence,
  type DepotQuota,
  type ModeIdempotence,
  type ResultatLimites,
  type ResultatValidation,
} from "../limits/index.js";
import {
  ETAPE_POLITIQUE,
  NIVEAU_DE_REPLI,
  deciderEtape10,
  estEffetExterieur,
  referenceDepuisNom,
  type EtatConfirmation,
  type NiveauApplique,
  type ReferenceOutil,
} from "../policy/index.js";
import {
  PLAFOND_OUTILS_PAR_PROFIL,
  estServi,
  mesurerBudgetProfil,
  profilLeMoinsExposant,
  type ProfileName,
  type VerdictBudget,
} from "../profiles/index.js";
import {
  ETAPES_CHAINE,
  ETAPE_EXECUTION,
  ETAPE_SCOPES,
  ancrerEtape,
  type AncrageEtape,
  type EtapeRefuse,
} from "./etapes.js";
import { MODULES_ETAPES_CHAINE } from "./modules.js";
import type {
  CatalogueOutils,
  ChargeAdaptateur,
  CorrespondanceScopes,
  EtapeCatalogue,
  EtapeCurseur,
  EtapeExecution,
  EtapeProvenance,
  EtapeScopes,
  ExecutionEtablie,
  IndexProvenance,
  Masquage,
  OutilDuCatalogue,
  SignataireCurseur,
} from "./etapes.js";
import { PORTE_PAR_LE_JETON_DAPPEL, effetsCouvertsPar } from "./etape-05-scopes.js";
import {
  analyserArgumentsDuSchema,
  empreinteExtrait,
  marquerResultat,
} from "./etape-11-provenance.js";
// ADR 0014 — la session de pilotage. Ce fichier n'en frappe AUCUNE : il lit
// celle du démon, ou reçoit celle que le transport HTTP a déjà relue.
import { SESSION_DE_CETTE_EXECUTION, sessionDuJetonRelu } from "./identite.js";
import type { LigneOpsTokenRelue } from "./identite.js";
import type { SessionId } from "../identite/session.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LES ANCRAGES — les seuls numéros de ce fichier, tous LUS dans `APPEL_STEPS`
// ═════════════════════════════════════════════════════════════════════════════

/** § 23, ADR 0005 — l'étape 0 précède TOUTES les autres, sur tous les transports. */
export const ETAPE_COFFRE_CHAINE = ancrerEtape("coffre");

/**
 * § 11, étape 7 — le profil actif.
 *
 * ⚠️ `core/profiles/budget.ts` dérive DÉJÀ le sien (`ETAPE_REFUS_PROFIL`,
 *    `CODE_REFUS_PROFIL`), de la MÊME source — `APPEL_STEPS`. Deux dérivations
 *    d'un même fait finissent par se contredire : celle-ci n'est donc pas une
 *    seconde vérité, et `orchestrateur.spec.ts` les CONFRONTE, numéro et code,
 *    pour qu'une divergence rougisse au lieu de s'installer.
 */
export const ETAPE_PROFIL_CHAINE = ancrerEtape("profil");

/** § 11, étape 8 — le schéma. `core/limits` la porte ; l'ancrage sert au message. */
export const ETAPE_SCHEMA_CHAINE = ancrerEtape("schema");

/** § 11, étape 12 — débit et quota. */
export const ETAPE_QUOTA_CHAINE = ancrerEtape("quota");

/** § 11, étape 13 — idempotence. */
export const ETAPE_IDEMPOTENCE_CHAINE = ancrerEtape("idempotence");

/** § 11, étape 11 — la provenance. Sert au refus « confirmation exigée ». */
export const ETAPE_PROVENANCE_CHAINE = ancrerEtape("provenance");

// ═════════════════════════════════════════════════════════════════════════════
//  LA COLONNE PAR TRANSPORT (§ 11) — « stdio a une identité, un principal,
//  des scopes »
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES DEUX TRANSPORTS DU SOCLE (§ 23 : local = stdio, production = HTTP).
 *
 * ⚠️ POURQUOI CETTE COLONNE EXISTE, ET CE QU'ELLE RÉPARE. Le § 11 le dit mot
 *    pour mot : « une colonne par transport accompagne ce tableau dans le code :
 *    quelles étapes s'appliquent en stdio, quel principal s'y inscrit, quels
 *    scopes y valent par défaut. **La v5 rendait le transport stdio obligatoire
 *    au lot 1 et parade officielle au null-route Hetzner, SANS lui donner ni
 *    identité, ni principal.** » Le lot 1 a laissé ce défaut ouvert ; il ne doit
 *    pas être réintroduit.
 *
 *    Sans identité, une instance stdio écrit des lignes d'`ops_audit` dont le
 *    `principal` est vide ou inventé par l'appelant : le § 24 ne sépare plus les
 *    appels de la parade de ceux de la production, et le § 12 perd le « qui » de
 *    chaque ligne. Sans scopes, l'étape 5 n'a rien à confronter — c'est-à-dire
 *    qu'elle laisse tout passer, en restant verte.
 */
export const TRANSPORTS = ["http", "stdio"] as const;

export type Transport = (typeof TRANSPORTS)[number];

/**
 * LE PRINCIPAL RÉSERVÉ DU TRANSPORT stdio.
 *
 * ⚠️ **LE CDC NE LE NOMME PAS.** Il exige que stdio ait un principal, sans dire
 *    lequel — écart signalé au rapport. La valeur retenue tient trois
 *    contraintes, et c'est de là qu'elle sort, pas d'un goût :
 *
 *     1. elle passe la garde de forme du § 31 (`core/audit/contenu.ts`) : aucun
 *        espace, aucun `@`, moins de sept segments alphabétiques ;
 *     2. elle est RECONNAISSABLE dans `ops_audit` — le § 24 doit pouvoir isoler
 *        les appels de la parade au null-route ;
 *     3. elle ne peut être confondue avec aucun principal d'un jeton HTTP, dont
 *        la forme vient de l'émetteur.
 *
 * ⚠️ ELLE NE VAUT PAS AUTORISATION. Le § 23 range stdio en environnement LOCAL,
 *    « coffre en fichier local », et le § 30 note que couper une instance stdio
 *    suit une procédure dédiée : **elle n'a pas de jeton à révoquer**. C'est
 *    précisément pourquoi ses scopes par défaut sont les plus étroits que la
 *    table du § 19.2 permette — voir {@link SCOPES_PAR_DEFAUT_STDIO}.
 */
export const PRINCIPAL_STDIO = "stdio:local";

/**
 * LES SCOPES PAR DÉFAUT DU TRANSPORT stdio — **DÉRIVÉS, jamais listés**.
 *
 * La règle, en une phrase : *un transport sans jeton à révoquer ne porte, par
 * défaut, aucun scope qui couvre un effet extérieur.*
 *
 * Elle se dérive de trois totalités qui vivent chacune ailleurs :
 *
 *  · `PORTE_PAR_LE_JETON_DAPPEL` (§ 19.2) — écarte `ops:policy`, qu'un jeton
 *    d'appel ne porte JAMAIS ;
 *  · `effetsCouvertsPar` — écarte `ops:admin`, qui ne couvre AUCUN `effect`
 *    (console, bascule d'outils, lecture du journal : rien qui s'appelle par la
 *    chaîne d'appel) ;
 *  · `estEffetExterieur` (§ 20) — écarte `ops:send`, qui couvre `send` et
 *    `destructive`.
 *
 * Reste `ops:read` et `ops:draft`. Ce n'est pas un choix : c'est ce que les
 * trois totalités laissent. Ajouter un `effect` extérieur au § 09, ou basculer
 * un scope dans la première table, change cette valeur SANS qu'une ligne soit à
 * retoucher — et `orchestrateur.spec.ts` mesure qu'aucun scope rendu ici ne
 * couvre un effet extérieur, avec un témoin qui rougit.
 *
 * ⚠️ « PAR DÉFAUT » N'EST PAS « TOUJOURS ». Un poste local qui doit envoyer
 *    passe par {@link identiteStdio} en déclarant explicitement ses scopes. Le
 *    défaut est ce qui s'applique quand personne n'a rien décidé, et c'est là
 *    qu'il doit être fail-closed.
 */
export const SCOPES_PAR_DEFAUT_STDIO: readonly OpsScope[] = OPS_SCOPES.filter((scope) => {
  if (!PORTE_PAR_LE_JETON_DAPPEL[scope]) return false;
  const effets = effetsCouvertsPar(scope);
  if (effets.length === 0) return false;
  return effets.every((effet) => !estEffetExterieur(effet));
});

/** Ce qu'un transport dit de la chaîne. Tout y est dérivé d'`APPEL_STEPS`. */
export interface ColonneTransport {
  readonly transport: Transport;
  /** Les étapes du § 11 qui s'appliquent à ce transport. DÉRIVÉES. */
  readonly etapesApplicables: readonly AppelStep[];
  /**
   * Les étapes que ce transport ne fait PAS. Vide en HTTP ; les quatre étapes
   * « HTTP seul » en stdio, qui n'a ni Host, ni jeton, ni audience, ni `jti`.
   */
  readonly etapesNonApplicables: readonly AppelStep[];
  /**
   * Les étapes établies EN AMONT de l'orchestrateur, dans le transport lui-même.
   * Ce sont les mêmes quatre, du côté HTTP : l'orchestrateur ne les mesure pas,
   * il les reçoit établies dans {@link IdentiteAppelante}.
   */
  readonly etapesAmont: readonly AppelStep[];
  /** Ce transport présente-t-il un jeton porteur de droits ? */
  readonly porteUnJeton: boolean;
  /** Le principal réservé, ou `null` quand il vient du jeton. */
  readonly principalReserve: string | null;
  /** Les scopes qui valent par défaut, ou `null` quand ils viennent du jeton. */
  readonly scopesParDefaut: readonly OpsScope[] | null;
}

/**
 * La colonne d'un transport, ENTIÈREMENT dérivée d'`APPEL_STEPS.httpSeul`.
 *
 * ⚠️ AUCUNE LISTE D'ÉTAPES N'EST ÉCRITE ICI. Ajouter au § 11 une étape « HTTP
 *    seul » la retire de stdio le jour même ; en ajouter une commune l'ajoute
 *    aux deux. Une liste recopiée aurait divergé au premier ajout, et la
 *    divergence aurait été muette — c'est exactement ce que l'étape 0 du § 23 a
 *    coûté à découvrir.
 */
export function colonneDuTransport(transport: Transport): ColonneTransport {
  const httpSeules = APPEL_STEPS.filter((etape) => etape.httpSeul).map((etape) => etape.numero);
  const communes = APPEL_STEPS.filter((etape) => !etape.httpSeul).map((etape) => etape.numero);

  switch (transport) {
    case "http":
      return {
        transport,
        etapesApplicables: APPEL_STEPS.map((etape) => etape.numero),
        etapesNonApplicables: [],
        etapesAmont: httpSeules,
        porteUnJeton: true,
        principalReserve: null,
        scopesParDefaut: null,
      };
    case "stdio":
      return {
        transport,
        etapesApplicables: communes,
        etapesNonApplicables: httpSeules,
        // Rien n'est établi en amont : il n'y a ni Host, ni jeton, ni audience,
        // ni `jti` à révoquer (§ 30, « couper une instance stdio »).
        etapesAmont: [],
        porteUnJeton: false,
        principalReserve: PRINCIPAL_STDIO,
        scopesParDefaut: SCOPES_PAR_DEFAUT_STDIO,
      };
  }
}

/**
 * L'IDENTITÉ D'UN APPEL stdio — ce que la v5 ne donnait pas.
 *
 * Le `principal` est IMPOSÉ, il n'est pas un paramètre : un poste local qui
 * choisirait son principal pourrait se faire passer pour un jeton HTTP dans
 * `ops_audit`, et la ligne ne le dirait pas.
 *
 * ✅ **ET LE `sessionId`, JUSTE À CÔTÉ, EST IMPOSÉ DE LA MÊME FAÇON — ADR 0014.**
 *    Il était un paramètre ordinaire à la fin du lot 1b. C'était le verrou n° 1
 *    du § 20 laissé ouvert : toute la garde d'exfiltration s'ancre sur cette
 *    clé, et un appelant qui la renouvelle entre la lecture et l'appel suivant
 *    annule l'étape 11 en entier. L'épreuve l'avait mesuré sur le pire cas —
 *    argument de gouvernance, argument libre, autre domaine : « même session :
 *    refusé · session renouvelée : AUTORISÉ ».
 *
 *    Il vient désormais de {@link SESSION_DE_CETTE_EXECUTION} : UNE par exécution
 *    du démon, frappée au chargement de `core/chaine/identite.ts`. Le paramètre
 *    a DISPARU de cette signature — le lui rendre optionnel aurait été la forme
 *    sous laquelle une décision redevient un oubli.
 *
 * ⚠️ **CE QUE ÇA COÛTE, ÉCRIT AVEC LA MESURE.** Un test qui voulait deux
 *    sessions distinctes en stdio ne le peut plus dans un même processus, et
 *    c'est exactement l'interdit recherché : c'est CE geste-là que l'épreuve
 *    adverse exécutait. Un test qui a besoin de deux sessions passe par le
 *    transport HTTP, où deux OCTROIS distincts en donnent deux — au prix d'un
 *    geste humain, qui est le prix voulu.
 *
 * @param params.scopes facultatif au sens de la VALEUR seulement : l'absence
 *        vaut {@link SCOPES_PAR_DEFAUT_STDIO}, c'est-à-dire le plus étroit.
 */
export function identiteStdio(params: {
  readonly requestId: string;
  readonly deadline: Date;
  readonly habilitations: Habilitations;
  readonly scopes?: readonly OpsScope[];
}): IdentiteAppelante {
  return {
    principal: PRINCIPAL_STDIO,
    // Ni un paramètre, ni une variable d'environnement — voir ADR 0014.
    sessionId: SESSION_DE_CETTE_EXECUTION,
    scopes: params.scopes ?? SCOPES_PAR_DEFAUT_STDIO,
    habilitations: params.habilitations,
    requestId: params.requestId,
    deadline: params.deadline,
  };
}

/**
 * L'IDENTITÉ D'UN APPEL HTTP — ce que les étapes 1 à 4 ont établi.
 *
 * Le pendant d'{@link identiteStdio} pour le transport qui porte un jeton. Le
 * `principal` et la session viennent tous deux de la LIGNE `ops_token` relue à
 * l'étape 4 (« `jti` non révoqué »), qui est déjà lue à cet instant : la session
 * ne coûte aucune lecture de plus.
 *
 * ⚠️ **LA SESSION N'EST PAS DÉRIVÉE DU `jti`, ET C'EST MESURÉ.** Le jeton d'accès
 *    vit une heure (§ 19.1), une marque de provenance quatre (`TTL_MARQUAGE_MS`) :
 *    une session dérivée du `jti` s'effacerait trois fois par TTL, sur un
 *    rafraîchissement que le client MCP conduit tout seul. Elle suit l'OCTROI —
 *    voir {@link LigneOpsTokenRelue}.
 *
 * ⚠️ **CETTE FONCTION N'EST PAS LE TRANSPORT, ET NE LE DEVIENT PAS.** Elle ne
 *    lit aucune base, ne vérifie aucune signature, ne consulte aucune liste de
 *    révocation : les étapes 1 à 4 sont « HTTP seul » (§ 11) et se passent AVANT
 *    l'orchestrateur. Elle assemble ce qu'elles ont établi, et son seul mérite
 *    est de refuser à la COMPILATION ce que les quatre étapes n'ont pas établi.
 *
 * @param params.scopes § 19.2 — ce que le jeton autorise EN PRINCIPE. Il n'y a
 *        AUCUN défaut ici, contrairement à stdio : un jeton HTTP sans scope
 *        n'est pas un jeton par défaut, c'est un jeton qui n'autorise rien, et
 *        l'étape 5 doit le dire plutôt que de recevoir une liste inventée.
 */
export function identiteHttp(params: {
  readonly jeton: LigneOpsTokenRelue;
  readonly scopes: readonly OpsScope[];
  readonly habilitations: Habilitations;
  readonly requestId: string;
  readonly deadline: Date;
}): IdentiteAppelante {
  return {
    principal: params.jeton.principal,
    sessionId: sessionDuJetonRelu(params.jeton),
    scopes: params.scopes,
    habilitations: params.habilitations,
    requestId: params.requestId,
    deadline: params.deadline,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA PROPRIÉTÉ DES ÉTAPES — qui exécute quoi, confronté à `APPEL_STEPS`
// ═════════════════════════════════════════════════════════════════════════════

/**
 * QUI EXÉCUTE CHAQUE ÉTAPE DU § 11.
 *
 * ⚠️ CE N'EST PAS UNE DOCUMENTATION, C'EST LA SOURCE D'UNE GARDE. Le tableau est
 *    confronté à `APPEL_STEPS` par {@link verifierCouvertureDesEtapes}, qui
 *    ANNONCE combien d'étapes elle a mesurées et lesquelles n'ont personne. Une
 *    étape ajoutée au § 11 sans exécutant fait LEVER `orchestrerAppel` à la
 *    première invocation — plutôt que de laisser traverser une chaîne
 *    silencieusement plus courte d'une garde.
 *
 * `Record<AppelStepKey, …>` est une TOTALITÉ vérifiée par le compilateur : une
 * clé d'étape absente ne compile pas, et une clé qui n'en est pas une non plus.
 */
export const EXECUTANTS_ETAPES = {
  coffre: "core/vault — port `EtatDuCoffre`, étape 0 (§ 23, ADR 0005)",
  host: "transport HTTP — hors orchestrateur (§ 11, « HTTP seul »)",
  jeton: "transport HTTP — hors orchestrateur (§ 11, « HTTP seul »)",
  audience: "transport HTTP — hors orchestrateur (§ 11, « HTTP seul »)",
  revocation: "transport HTTP — hors orchestrateur (§ 11, « HTTP seul »)",
  // ⚠️ LES CINQ CHEMINS SONT LUS DANS `modules.ts`, JAMAIS RECOPIÉS. Ils l'ont
  //    été, et pendant tout le lot cette table et `ETAPES_CHAINE` se sont
  //    contredites sur les CINQ sans que rien ne rougisse. Une recopie ici
  //    rouvrirait exactement cet écart.
  scopes: MODULES_ETAPES_CHAINE.scopes,
  "outil-active": MODULES_ETAPES_CHAINE["outil-active"],
  profil: "core/profiles — `estServi` + `ETAPE_REFUS_PROFIL`",
  schema: "core/limits — `appliquerLimites`, avant tout décompte",
  curseur: `${MODULES_ETAPES_CHAINE.curseur} — dans la couture \`entreSchemaEtQuota\``,
  politique: "core/policy — `deciderEtape10`, dans la couture",
  provenance: `${MODULES_ETAPES_CHAINE.provenance} — dans la couture`,
  quota: "core/limits — `appliquerLimites`",
  idempotence: "core/limits — `appliquerLimites`",
  execution: MODULES_ETAPES_CHAINE.execution,
} as const satisfies Record<(typeof APPEL_STEPS)[number]["cle"], string>;

/**
 * Le registre d'`etapes.ts`, indexé par clé d'étape — pour que la couverture
 * puisse confronter la PHRASE à du CODE.
 */
const REGISTRE_PAR_CLE: ReadonlyMap<string, (typeof ETAPES_CHAINE)[number]> = new Map(
  ETAPES_CHAINE.map((entree) => [entree.ancrage.cle, entree]),
);

/** Ce que la garde de couverture rend. Des NOMBRES, jamais un booléen. */
export interface CouvertureEtapes {
  readonly transport: Transport;
  /** Combien d'étapes du § 11 ont été CONFRONTÉES. Mesuré dans la boucle. */
  readonly etapesMesurees: number;
  /** Combien s'appliquent à ce transport. */
  readonly etapesApplicables: number;
  /** Celles qui n'ont AUCUN exécutant nommé. Vide = la chaîne est complète. */
  readonly sansExecutant: readonly AppelStep[];
  /**
   * Combien d'étapes ont vu leur exécutant confronté à du CODE, et pas
   * seulement à la non-vacuité d'une phrase.
   *
   * ⚠️ CE COMPTE EST LA BORNE DE LA GARDE, ÉCRITE AVEC ELLE. Les étapes servies
   *    hors de `core/chaine` — le coffre, le profil, les limites, la politique,
   *    les quatre étapes « HTTP seul » — ne sont décrites QUE par une phrase :
   *    pour celles-là, la garde mesure encore une chaîne de caractères. Il n'y a
   *    pas de vert global à en tirer ; il y a deux nombres à lire.
   */
  readonly executantsConfrontes: number;
}

/**
 * Confronte {@link EXECUTANTS_ETAPES} à `APPEL_STEPS`, pour ce transport.
 *
 * Elle ne peut pas être verte pour rien : `etapesMesurees` est incrémenté DANS
 * la boucle, jamais rendu depuis `APPEL_STEPS.length`.
 *
 * ═══ ⚠️ CE QUE CETTE GARDE MESURAIT, ET CE QU'ELLE MESURE DEPUIS ═══
 *
 * Son critère était `executant.trim().length === 0` : la NON-VACUITÉ D'UNE
 * PHRASE, jamais l'existence de ce qu'elle nomme. Une étape dont le module
 * aurait été supprimé, renommé, ou n'aurait jamais été écrit restait
 * « couverte » tant que la chaîne était là — et le dossier voisin en faisait la
 * démonstration involontaire : cinq chaînes parfaitement non vides qui ne
 * désignaient aucun fichier l'auraient satisfaite.
 *
 * Pour les cinq étapes portées par `core/chaine`, la phrase est désormais
 * confrontée AU REGISTRE, c'est-à-dire à du code : l'entrée doit exister, se
 * dire `implémentée`, et son résolveur doit RENDRE UNE FONCTION — le résolveur
 * est appelé ici, sans quoi il serait non nul quoi qu'il arrive.
 *
 * ⚠️ ET NON AU SYSTÈME DE FICHIERS, DÉLIBÉRÉMENT. Cette fonction tourne en
 *    production, où le conteneur ne porte que le JavaScript émis : chercher
 *    `…/etape-05-scopes.ts` sur le disque y échouerait toujours, et la chaîne
 *    entière lèverait au premier appel. La confrontation au disque est une
 *    garde de dépôt — elle vit dans `etapes.spec.ts`, qui tourne sur les
 *    sources.
 */
export function verifierCouvertureDesEtapes(transport: Transport): CouvertureEtapes {
  // ⚠️ FAIL-CLOSED SUR UN TRANSPORT QUE `TRANSPORTS` NE CONNAÎT PAS. Le type
  //    l'interdit à la compilation ; il arrive quand même au runtime dès qu'un
  //    câblage se fait depuis une valeur non typée — une variable d'environnement,
  //    un objet de dépendances construit à moitié. Sans ce contrôle,
  //    `colonneDuTransport` rendrait `undefined` et la garde de couverture
  //    planterait sur un `TypeError` illisible, ou pire, laisserait passer une
  //    liste d'applicables vide : ZÉRO étape applicable = ZÉRO étape sans
  //    exécutant = une chaîne « complète » qui n'exécute rien.
  //
  //    On rend donc TOUTES les étapes comme dépourvues d'exécutant : sur un
  //    transport inconnu, le socle ne sait dire de personne qu'il exécute quoi
  //    que ce soit.
  if (!(TRANSPORTS as readonly string[]).includes(transport)) {
    return {
      transport,
      etapesMesurees: APPEL_STEPS.length,
      etapesApplicables: 0,
      sansExecutant: APPEL_STEPS.map((etape) => etape.numero),
      executantsConfrontes: 0,
    };
  }

  const colonne = colonneDuTransport(transport);
  const applicables = new Set<AppelStep>(colonne.etapesApplicables);
  const sansExecutant: AppelStep[] = [];
  const executants: Readonly<Record<string, string>> = EXECUTANTS_ETAPES;
  let etapesMesurees = 0;
  let executantsConfrontes = 0;

  for (const etape of APPEL_STEPS) {
    etapesMesurees += 1;
    if (!applicables.has(etape.numero)) continue;
    const executant: string | undefined = executants[etape.cle];
    if (executant === undefined || executant.trim().length === 0) {
      sansExecutant.push(etape.numero);
      continue;
    }

    // Les étapes portées par `core/chaine` : la phrase est confrontée au
    // REGISTRE, donc à du code. Les autres restent décrites par une phrase, et
    // `executantsConfrontes` dit exactement combien ont eu droit à mieux.
    const entree = REGISTRE_PAR_CLE.get(etape.cle);
    if (entree === undefined) continue;
    executantsConfrontes += 1;
    if (entree.statut !== "implémentée" || !resolveUneFonction(entree.executer)) {
      sansExecutant.push(etape.numero);
    }
  }

  return {
    transport,
    etapesMesurees,
    etapesApplicables: colonne.etapesApplicables.length,
    sansExecutant,
    executantsConfrontes,
  };
}

/**
 * Le résolveur d'une entrée du registre rend-il bien une FONCTION ?
 *
 * ⚠️ ON L'APPELLE. C'est tout l'intérêt : un résolveur est une fonction fléchée,
 *    donc toujours non nul — tester sa non-nullité serait un contrôle vert parce
 *    qu'il ne regarde rien. Ce qu'on veut savoir, c'est si la liaison qu'il
 *    ferme sur elle a bien été initialisée, ce que seul l'appel dit.
 *
 * Un résolveur qui LÈVE — c'est le symptôme d'un cycle d'imports refermé dans le
 * mauvais ordre — compte comme absent : fail-closed.
 */
function resolveUneFonction(resolveur: unknown): boolean {
  if (typeof resolveur !== "function") return false;
  try {
    return typeof (resolveur as () => unknown)() === "function";
  } catch {
    return false;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI ENTRE — l'appel, tel qu'il arrive du transport
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'APPEL BRUT, tel que le transport le remet.
 *
 * ⚠️ IL NE PORTE NI `effect`, NI `dataClass`, NI `policyLevel`, NI HABILITATION,
 *    ET C'EST LE POINT. Ces quatre-là sont ÉPINGLÉS côté socle — `ops_tool`
 *    pour les deux premiers (§ 20, règle d'épinglage), `ops_policy` calculé à
 *    l'appel pour le troisième (§ 12, règle 1), le pont d'identité du § 19 bis
 *    pour le quatrième. Les accepter ici, même « à titre indicatif », créerait
 *    exactement le chemin que le contrôle 7 du § 09 interdit : une décision de
 *    droit qui arrive par la charge utile.
 *
 * ⚠️ `idempotencyKey` VOYAGE ICI, PAS DANS `input` (§ 20). La v5 la rendait
 *    obligatoire sur `zoho.mail.send` alors qu'aucun champ ne la transportait.
 *
 * ⚠️ **ET IL NE PORTE PAS DE `sessionId` — ADR 0014.** Cinquième valeur de la
 *    même liste, et pour le même motif : la session de pilotage est un état que
 *    le socle ÉTABLIT, pas une valeur que l'appel apporte. L'accepter ici, même
 *    « à titre indicatif », rendrait la garde du § 20 désarmable par la charge
 *    utile — c'est le défaut mesuré au lot 1b, par l'autre porte.
 */
export interface AppelEntrant {
  /** Le nom COMPLET servi par `tools/list` — préfixe dérivé compris (§ 09). */
  readonly nomComplet: string;
  /** La charge utile BRUTE. Elle n'est validée qu'à l'étape 8. */
  readonly input: unknown;
  /** § 20 — jamais dans `input`. `null` quand l'outil déclare `idempotency: "n/a"`. */
  readonly idempotencyKey: string | null;
  /** § 13.1 — le jeton de curseur reçu, ou `null` pour une première page. */
  readonly curseur: string | null;
  /**
   * § 20 — le jeton de confirmation présenté avec l'appel.
   *
   * ⚠️ IL EST DÉLIVRÉ SUR LE CANAL DU DESSERRAGE, ET JAMAIS DANS UNE RÉPONSE
   *    D'ERREUR. Il arrive donc ici comme n'importe quelle autre valeur du
   *    transport, et l'étape 10 le confronte à l'`argHash` de l'appel EXACT.
   *    Ni l'élicitation MCP ni une réponse produite par le démon vocal ne
   *    comptent comme confirmation humaine.
   */
  readonly jetonDeConfirmation: string | null;
}

/**
 * QUI APPELLE, ET AVEC QUOI — l'identité déjà établie par les étapes 1 à 4.
 *
 * Ces quatre étapes sont « HTTP seul » (§ 11) : elles se passent AVANT
 * l'orchestrateur, dans le transport. Ce qu'elles établissent arrive ici. En
 * stdio elles n'existent pas, et c'est {@link identiteStdio} qui fabrique cette
 * valeur — avec un principal RÉSERVÉ et les scopes les plus étroits.
 *
 * ⚠️ IL N'Y A AUCUNE SESSION D'AUTHENTIFICATION SERVEUR (§ 11) : le jeton porte
 *    les droits. `sessionId` est un état de PILOTAGE — c'est lui que le § 20
 *    marque, et c'est lui qu'on retrouve dans `ops_audit.sessionId`.
 */
export interface IdentiteAppelante {
  readonly principal: string;
  /**
   * ⚠️ **ÉTABLIE PAR LE SOCLE, JAMAIS ACCEPTÉE DU CLIENT — ADR 0014.** En HTTP
   *    elle vient de la ligne `ops_token` relue à l'étape 4, qui est déjà lue à
   *    cet instant ; en stdio, de l'exécution du démon. Elle n'entre par aucun
   *    chemin que l'appelant contrôle — ni `input` (le contrôle 7 du § 09 la
   *    refuse déjà, par dérivation des propriétés de `ToolContext`), ni
   *    {@link AppelEntrant}, ni un paramètre de transport.
   *
   * ✅ **TYPE RESSERRÉ (ADR 0014) :** {@link SessionId}, le type marqué de
   *    `core/identite/session.ts`. Sa marque est un `unique symbol` NON exporté :
   *    aucun module ne peut nommer la propriété, donc aucun ne peut écrire un
   *    littéral d'objet assignable. Un transport qui poserait ici une chaîne
   *    venue du réseau **ne compile pas**, et c'est la seule forme d'interdit qui
   *    n'arrive pas trop tard.
   *
   * ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE : `as unknown as SessionId` reste
   *    écrivable — aucune marque TypeScript n'y échappe. Ce que le type garantit
   *    n'est pas l'impossibilité, c'est que le chemin HONNÊTE ne passe plus par
   *    une chaîne, donc que toute occurrence devienne visible. C'est le graphe
   *    d'imports (garde G2) qui porte la garantie ; le motif de texte (G3) n'est
   *    qu'un filet.
   */
  readonly sessionId: SessionId;
  /** § 19.2 — ce que le jeton autorise EN PRINCIPE. */
  readonly scopes: readonly OpsScope[];
  /** § 19 bis — calculé PAR LE SOCLE. Un handler ne le reconstitue jamais. */
  readonly habilitations: Habilitations;
  /** Identifiant de corrélation. C'est lui, et lui seul, que rend `internal`. */
  readonly requestId: string;
  /** Échéance au-delà de laquelle l'appel doit abandonner. */
  readonly deadline: Date;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES PORTS — ce que l'orchestrateur attend des autres, et ne fait pas
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA LECTURE DE L'ÉTAT DE PILOTAGE — `ops_runtime`, § 12.
 *
 * ⚠️ LE CDC NE NOMME AUCUN PROFIL DE REPLI quand `ops_runtime` ne porte aucune
 *    ligne pour ce principal — écart relevé au lot 1. Le § 20 donne un repli à
 *    la POLITIQUE (`brouillon`, fail-closed) et n'en donne aucun au profil.
 *    `profilActif` rend donc `null`, et l'orchestrateur le DÉRIVE fail-closed
 *    par `profilLeMoinsExposant()` sur l'inventaire — jamais vers `admin`,
 *    jamais vers un nom écrit à la main.
 */
export interface EtatDePilotage {
  profilActif(principal: string): Promise<ProfileName | null>;
  /**
   * TOUT le catalogue, pour que le profil de repli se DÉRIVE de la surface
   * réellement servie plutôt que d'être élu.
   *
   * ⚠️ **CETTE PROSE DISAIT LE CONTRAIRE, ET ELLE EST DEVENUE FAUSSE — ADR 0036,
   *    décision 2.** Elle écrivait : « elle n'est appelée QUE quand `profilActif`
   *    rend `null` : c'est un chemin de panne, pas le chemin normal ». Le § 14,
   *    correction 3, exige que le plafond des OUTILS SERVIS se refuse à
   *    l'étape 7 — donc sur la liste SERVIE, que seule cette méthode rend, et à
   *    CHAQUE appel : `ops_tool.enabled` bascule en console SANS
   *    redéploiement, si bien que la valeur mesurée en CI n'est jamais celle qui
   *    est servie. Mesurer au démarrage seulement rendrait le plafond aussi faux
   *    que la CI.
   *
   * ⚠️ **ELLE EST APPELÉE AU PLUS UNE FOIS PAR APPEL**, par
   *    {@link memoiserLInventairePourCetAppel} : le repli de profil et le
   *    plafond du § 14 se prononcent sur LA MÊME lecture. Ce n'est pas un cache
   *    — un cache inter-appels réintroduirait exactement la divergence que la
   *    correction 3 existe pour fermer, et il le ferait en silence.
   */
  inventaire(): Promise<readonly OutilDuCatalogue[]>;
}

/**
 * LA LECTURE DU COFFRE — § 23, étape 0.
 *
 * Elle ne rend pas un booléen : `absent` et `verrouillé` ne se réparent pas du
 * même geste, et le message du § 15 doit dire lequel.
 */
export interface EtatDuCoffre {
  /** `null` quand l'appel peut continuer, un refus sinon. */
  refusDAppelDOutil(): { readonly etat: "absent" | "verrouillé"; readonly message: string } | null;
}

/**
 * LE CALCUL DU NIVEAU DE POLITIQUE — § 12, règle 1 : « CALCULÉ À L'APPEL ».
 *
 * ⚠️ IL REND `NiveauApplique`, PAS UN `PolicyLevel` NU, et c'est ce qui
 *    distingue « la politique dit brouillon » de « le dépôt n'a rien rendu ».
 *    Un niveau calculé sur zéro ligne examinée vaut `brouillon` : parfaitement
 *    rassurant, et parfaitement aveugle. C'est `mesures` qui le dit, et la
 *    trace le remonte.
 */
export interface EtatDePolitique {
  niveauPourOutil(reference: ReferenceOutil, maintenant: Date): Promise<NiveauApplique>;
}

/**
 * LA VÉRIFICATION D'UN JETON DE CONFIRMATION — § 20, `core/policy/confirmation`.
 *
 * ⚠️ ELLE CONSOMME. Le jeton est à usage unique ; vérifier sans consommer
 *    atomiquement rendrait le rejeu possible entre les deux. L'orchestrateur ne
 *    l'appelle donc QU'UNE FOIS par appel, et seulement quand une confirmation
 *    est réellement exigée.
 *
 * ⚠️ ELLE NE REND JAMAIS `absente` : l'absence est un fait de l'appel
 *    (`jetonDeConfirmation === null`), pas un verdict du vérificateur.
 */
export interface VerificationConfirmation {
  verifierEtConsommer(appel: {
    readonly presente: string;
    readonly tool: string;
    readonly argHash: string;
    readonly principal: string;
    readonly maintenant: Date;
  }): Promise<Extract<EtatConfirmation, "valide" | "invalide">>;
}

/**
 * LES RÉGLAGES D'`ops_tool` QUE `OutilDuCatalogue` NE PORTE PAS.
 *
 * 🔴 ÉCART SIGNALÉ AU RAPPORT — CE PORT EN EST LA CONSÉQUENCE, PAS LA SOLUTION.
 *    Le § 12 donne à `ops_tool` un `limit` et un `warnAt`, et le § 09 donne à
 *    chaque outil un régime d'`idempotency`. `OutilDuCatalogue` (`etapes.ts`) ne
 *    porte aucun des trois. `appliquerLimites` a besoin des trois. Les DEVINER
 *    serait pire que les demander : un mode d'idempotence supposé `n/a` rendrait
 *    rejouable un `send`, et rien ne le dirait.
 *
 *    Le port les demande donc explicitement, à un endroit nommé, plutôt que de
 *    laisser chaque appelant les inventer. La correction est d'ajouter les trois
 *    champs à `OutilDuCatalogue` — un fichier qui n'appartient pas à ce lot.
 */
export interface ReglagesDeLOutil {
  /** § 09 — `key`, `non-rejouable` ou `n/a`. JAMAIS supposé. */
  readonly modeIdempotence: ModeIdempotence;
  /** `ops_tool.limit`, ou `null` pour la limite de départ du § 26. */
  readonly limiteQuota: number | null;
  /** `ops_tool.warnAt`, ou `null` pour 80 % du dénominateur retenu. */
  readonly warnAtQuota: number | null;
}

/** L'appel de l'adaptateur — § 09. Il rend la charge BRUTE, jamais compactée. */
export type AppelAdaptateur = (
  contexte: ToolContext<ProfileName>,
  entree: unknown,
) => Promise<ChargeAdaptateur>;

/**
 * LA LIGNE D'INTENTION — le remède à la borne de l'invariant ①.
 *
 * ⚠️ CE PORT EST OBLIGATOIRE, ET `INTENTION_NON_ARMEE` EST SON IMPLÉMENTATION
 *    NEUTRE. Le rendre facultatif aurait fait de l'arbitrage de Will un oubli :
 *    personne n'aurait eu à DIRE qu'il ne l'armait pas. Obligatoire, câbler
 *    `INTENTION_NON_ARMEE` est une décision écrite noir sur blanc, et l'armer
 *    est une ligne.
 *
 * L'orchestrateur appelle `avantEffet` JUSTE avant `executer()` de l'étape 14,
 * et `apresEffet` dès que l'issue est connue — succès, refus, ou exception. Une
 * intention SANS issue est le signal recherché : un effet est parti, et le socle
 * n'a pas su dire ce qu'il est devenu.
 */
export interface PorteeDIntention {
  /** Rend la ligne écrite, ou `null` quand le mécanisme n'est pas armé. */
  avantEffet(intention: {
    readonly principal: string;
    // ADR 0014 — une intention est un APPEL en vol : elle a une session de
    // pilotage, la même que la ligne d'appel qui la clôt. C'est la clôture de
    // PURGE (`cloture.ts`) qui n'en a pas, et elle ne passe pas par ici.
    readonly sessionId: SessionId;
    readonly tool: string;
    readonly argHash: string;
    readonly maintenant: Date;
  }): Promise<LigneEcrite | null>;
  /** Clôt l'intention. Ne lève jamais : une clôture qui lève masquerait l'issue. */
  apresEffet(ligne: LigneEcrite | null, issue: "done" | "failed" | "interrompu"): Promise<void>;
}

/**
 * Le mécanisme NON ARMÉ — le comportement du socle tant que Will n'a pas tranché
 * le coût d'une écriture de plus par appel exécuté.
 *
 * ⚠️ IL NE MENT PAS : il rend `null`, et `TraceOrchestration.ligneDIntention`
 *    rend ce `null` visible. Un mécanisme désarmé qui rendrait une ligne factice
 *    ferait croire l'invariant plus fort qu'il n'est.
 */
export const INTENTION_NON_ARMEE: PorteeDIntention = {
  avantEffet(): Promise<LigneEcrite | null> {
    return Promise.resolve(null);
  },
  apresEffet(): Promise<void> {
    return Promise.resolve();
  },
};

/**
 * TOUT CE QUE L'ORCHESTRATEUR REÇOIT DE L'EXTÉRIEUR.
 *
 * ⚠️ AUCUN DE CES CHAMPS N'A DE DÉFAUT, ET AUCUN N'EST OPTIONNEL. Un défaut
 *    serait une étape qu'on peut oublier de brancher : la chaîne tournerait,
 *    verte, en sautant une garde. C'est le même motif qui interdit une clé de
 *    repli à l'`argHash` (`core/limits/arg-hash.ts`) — un repli silencieux est
 *    une garde qui n'existe plus, et personne ne le voit.
 */
export interface DependancesOrchestrateur {
  // ── Le transport, et donc la colonne qui s'applique ──────────────────────
  readonly transport: Transport;

  // ── Les invariants et l'état ─────────────────────────────────────────────
  readonly journal: Journal;
  readonly intention: PorteeDIntention;
  readonly coffre: EtatDuCoffre;
  readonly catalogue: CatalogueOutils;
  readonly pilotage: EtatDePilotage;
  readonly politique: EtatDePolitique;
  readonly confirmation: VerificationConfirmation;
  readonly calculArgHash: CalculArgHash;
  readonly index: IndexProvenance;
  readonly signataireCurseur: SignataireCurseur;
  readonly correspondanceScopes: CorrespondanceScopes;
  readonly depotQuota: DepotQuota;
  readonly depotIdempotence: DepotIdempotence;

  // ── Les cinq étapes de `etapes.ts` ───────────────────────────────────────
  readonly etapeScopes: EtapeScopes;
  readonly etapeCatalogue: EtapeCatalogue;
  readonly etapeCurseur: EtapeCurseur;
  readonly etapeProvenance: EtapeProvenance;
  readonly etapeExecution: EtapeExecution;

  // ── Ce que le socle ne peut pas déduire seul ─────────────────────────────
  readonly reglages: (outil: OutilDuCatalogue) => ReglagesDeLOutil;
  /** ÉTAPE 8 — le validateur de l'outil. Exécuté par `appliquerLimites`. */
  readonly validerEntree: (outil: OutilDuCatalogue, input: unknown) => ResultatValidation<unknown>;
  /** § 13.1 — l'empreinte des FILTRES, calculée sur l'entrée VALIDÉE. */
  readonly empreinteFiltres: (outil: OutilDuCatalogue, valide: unknown) => Promise<string>;
  /** § 19 bis — le second rideau, construit depuis les habilitations. */
  readonly fabriqueMasquage: (habilitations: Habilitations, outil: OutilDuCatalogue) => Masquage;
  readonly construireContexteOutil: ConstruireContexteOutil;
  readonly appelAdaptateur: AppelAdaptateur;
  /** § 20 — les empreintes qui entrent à l'index de provenance après l'étape 14. */
  readonly empreintesDuResultat: (execution: ExecutionEtablie) => readonly string[];

  /** § 09/§ 26 — la durée de vie d'une réservation d'idempotence, en ms. */
  readonly ttlIdempotenceMs: number;
  /** L'instant de l'appel. Injecté pour que la chaîne soit déterministe. */
  readonly maintenant: () => Date;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI SORT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * La trace de ce que la chaîne a parcouru — pour la console et le § 24.
 *
 * ⚠️ ELLE NE REMPLACE PAS LA LIGNE D'`ops_audit`, et ne doit jamais devenir un
 *    second journal : elle vit en mémoire, le temps de l'appel. Le journal est
 *    chaîné, ancré et vérifiable ; ceci ne l'est pas.
 */
export interface TraceOrchestration {
  readonly transport: Transport;
  /** Les étapes du § 11 applicables à ce transport. DÉRIVÉES. */
  readonly etapesApplicables: readonly AppelStep[];
  /** Les étapes que ce transport ne fait pas du tout (stdio : 1 à 4). */
  readonly etapesNonApplicables: readonly AppelStep[];
  /** Les étapes établies par le transport AVANT l'orchestrateur. */
  readonly etapesAmont: readonly AppelStep[];
  /** Les étapes FRANCHIES par l'orchestrateur, dans l'ordre. Mesuré, pas supposé. */
  readonly etapesFranchies: readonly AppelStep[];
  /** L'étape qui a refusé, ou `null`. C'est le `ops_audit.stepDenied`. */
  readonly etapeRefusante: AppelStep | null;
  /**
   * Les étapes applicables que l'appel N'A PAS atteintes. DÉRIVÉ, jamais écrit :
   * c'est la seule façon de voir qu'une étape a été SAUTÉE plutôt que franchie —
   * un compte d'étapes franchies seul ne le dirait pas.
   */
  readonly etapesNonAtteintes: readonly AppelStep[];
  /** § 12, règle 1 — le niveau CALCULÉ à l'appel, jamais un champ brut relu. */
  readonly niveauApplique: PolicyLevel;
  /**
   * Combien de lignes de politique le calcul du niveau a EXAMINÉES. Zéro sur un
   * refus antérieur à l'étape 10 ; zéro APRÈS l'étape 10 veut dire que le dépôt
   * n'a rien rendu — ce qui n'est pas la même chose qu'un niveau `brouillon`.
   */
  readonly niveauMesures: number;
  /**
   * Vrai quand l'`argHash` de la charge BRUTE n'a pas pu être calculé — coffre
   * fermé, clé absente. La ligne porte alors `ARG_HASH_NON_LU`, et ce booléen dit
   * que c'est un empêchement MESURÉ, pas un appel sans arguments.
   */
  readonly argHashBrutIndisponible: boolean;
  /**
   * La ligne d'INTENTION du remède décrit en tête de fichier, ou `null` quand le
   * mécanisme n'est pas armé (`INTENTION_NON_ARMEE`). Voir « la borne de
   * l'invariant ».
   */
  readonly ligneDIntention: LigneEcrite | null;
}

/**
 * Ce qu'un appel AUTORISÉ rend au transport. Union FERMÉE : un `switch`
 * exhaustif la couvre.
 *
 * ⚠️ LE REJEU N'EST PAS UNE EXÉCUTION. Le § 11 fait de l'étape 13 un succès
 *    quand `(tool, key)` est déjà `done` : rien n'a été exécuté, et il n'y a donc
 *    AUCUNE `ExecutionEtablie` à rendre. Loger un rejeu dans la même forme qu'une
 *    exécution — charge vide, palier `intact` — ferait croire à un appel servi et
 *    fausserait la mesure de compaction du § 24.
 */
export type ChargeServie =
  | {
      readonly genre: "exécuté";
      readonly execution: ExecutionEtablie;
      readonly trace: TraceOrchestration;
    }
  | {
      readonly genre: "rejeu";
      /** § 13 — la référence du résultat précédent, quand elle existe. */
      readonly resultRef: string | null;
      readonly trace: TraceOrchestration;
    };

/**
 * LE DÉTAIL D'UN REFUS — le message du § 15, que `Terminaison` ne porte pas.
 *
 * 🔴 ÉCART SIGNALÉ AU RAPPORT. `Refus` (`core/audit/vocabulaire.ts`) porte
 *    l'étape et le code, PAS le message. Or le § 15 exige que toute erreur
 *    « dise ce qu'il faut faire ensuite », et ce sont les étapes qui rédigent ce
 *    message. Le transporter à côté de la terminaison est le moindre mal :
 *    l'alternative aurait été de le laisser tomber, c'est-à-dire de rendre au
 *    modèle un code nu qu'il ne saurait pas corriger.
 */
export interface RefusDetaille {
  readonly etape: AppelStep;
  readonly code: ErrorCode | null;
  readonly message: string;
}

/**
 * LE RÉSULTAT D'UN APPEL — la terminaison ET la ligne qui l'atteste.
 *
 * Il ÉTEND `AppelJournalise` de `core/audit` : le champ `ligne` y reste
 * OBLIGATOIRE, et c'est ce qui rend l'invariant de sortie démontrable plutôt
 * qu'espéré. Les deux champs ajoutés ne l'affaiblissent pas — ils portent ce que
 * la terminaison ne sait pas porter.
 */
export interface ResultatAppel extends AppelJournalise<ChargeServie> {
  /** `null` sur un succès. Voir {@link RefusDetaille}. */
  readonly refus: RefusDetaille | null;
  /** Disponible même sur un refus, contrairement à `ChargeServie`. */
  readonly trace: TraceOrchestration;
}

/**
 * Construit le `ctx` du § 09 — LE SEUL CHEMIN par lequel une décision de droit
 * atteint la couche service.
 *
 * Déclaré ici plutôt qu'inféré : c'est l'orchestrateur, et lui seul, qui a vu
 * passer les quatre sources de `ctx` (le jeton pour `scopes`, `ops_policy` pour
 * `policyLevel`, `ops_runtime` pour `profile`, le pont d'identité du § 19 bis
 * pour `habilitations`). Un adaptateur qui reconstituerait l'un d'eux serait un
 * défaut du § 09.
 */
export type ConstruireContexteOutil = (
  identite: IdentiteAppelante,
  appel: AppelEntrant,
  profil: ProfileName,
  niveau: PolicyLevel,
) => ContexteSansEmpreinte;

/**
 * CE QU'UN CONSTRUCTEUR DE CONTEXTE A LE DROIT DE FABRIQUER — **ADR 0020.**
 *
 * ═══ POURQUOI CE `Omit` EST LA COUTURE, ET NON UNE COQUETTERIE DE TYPE ═══
 *
 * L'ADR 0020 dit que `ctx.idempotencyRef` porte l'EMPREINTE de la clé, jamais la
 * clé. Écrite dans le constructeur de contexte, cette règle n'aurait été cousue
 * NULLE PART : {@link ConstruireContexteOutil} est une DÉPENDANCE INJECTÉE. Ses
 * seules implémentations sont, à ce jour, des harnais de gardes — et une règle
 * dont toutes les implémentations vivent dans des fichiers de test est
 * exactement le défaut que le lot 1c a nommé : une décision écrite, testée,
 * documentée, et non cousue au chemin de production.
 *
 * Le champ est donc RETIRÉ de ce que l'injecté fabrique. L'orchestrateur — un
 * module de production, le seul qui ait vu passer `appel.idempotencyKey` — le
 * pose lui-même, en appelant `empreinteDeCleDIdempotence`. Un constructeur de
 * contexte qui voudrait y remettre la clé brute **ne compile pas**.
 *
 * C'est le motif exact de l'ADR 0014 sur `sessionId` : ce que le socle FRAPPE ne
 * s'accepte pas de l'extérieur. Ici, l'« extérieur » est la racine de
 * composition — et elle n'existe pas encore, ce qui est précisément le moment où
 * la règle ne coûte rien.
 */
export type ContexteSansEmpreinte = Omit<ToolContext<ProfileName>, "idempotencyRef">;

/**
 * L'EN-TÊTE DE JOURNAL, FIGÉ AVANT LA CHAÎNE.
 *
 * ⚠️ IL EST FIGÉ D'ABORD PARCE QU'UN REFUS PRÉCOCE DOIT POUVOIR S'ÉCRIRE. Un
 *    refus d'étape 0, 5 ou 6 n'a pas encore de valeur validée : l'`argHash` de
 *    l'en-tête porte alors sur la charge BRUTE. Dès que l'étape 8 réussit,
 *    `avecJournal` l'AFFINE sur la valeur validée — celle à laquelle le jeton de
 *    confirmation du § 20 se lie.
 *
 * 🔴 DETTE ASSUMÉE, HÉRITÉE DU LOT 1 ET NON REFERMÉE ICI : `ops_audit.argHash`
 *    porte donc deux populations que rien dans la ligne ne distingue. Le remède
 *    est une colonne de plus, qui entrerait dans l'empreinte chaînée du § 12 —
 *    donc un changement du calcul du journal, à décider avec l'ADR 0002 et non à
 *    glisser. En attendant, `stepDenied < 8` dit laquelle des deux on lit.
 */
export type ConstruireEntete = (
  identite: IdentiteAppelante,
  appel: AppelEntrant,
) => Promise<EnteteAppel>;

/**
 * Le type d'un corps de chaîne, tel que `avecJournal()` l'attend.
 *
 * Déclaré pour que l'implémenteur ne l'invente pas : c'est cette forme, et elle
 * seule, qui rend l'invariant de sortie mécanique — le corps ne PEUT PAS rendre
 * une valeur à l'appelant, il rend une terminaison au journal.
 *
 * ⚠️ IL REÇOIT UN OBJET, ET C'EST DÉLIBÉRÉ (ADR 0017). L'empreinte validée, le
 *    cliquet d'effet extérieur — et il devait y en avoir un troisième. **Il est
 *    arrivé au lot 1d** : `effetExterieurSurvenu`, la LECTURE du cliquet
 *    (ADR 0021). L'objet plutôt que des paramètres positionnels a tenu sa
 *    promesse — l'ajout n'a obligé personne à relire un ordre d'arguments.
 *
 * ⚠️ ET LA PHRASE QUI DISAIT « chacun de ses membres est un point de MUTATION de
 *    la ligne » A ÉTÉ RÉÉCRITE, ICI COMME CHEZ SON PROPRIÉTAIRE. Le lecteur ne
 *    mute rien, et ne le peut pas. Ce qui reste vrai, et qui est la vraie règle :
 *    pour chaque membre qui MUTE, il n'existe qu'UN endroit où la valeur change.
 */
export type CorpsDeChaine = (affineurs: AffineursDAppel) => Promise<Terminaison<ChargeServie>>;

// ═════════════════════════════════════════════════════════════════════════════
//  LES ERREURS — ce qui LÈVE, et pourquoi ce n'est pas un refus
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une étape applicable au transport n'a AUCUN exécutant.
 *
 * ⚠️ ELLE LÈVE, ET C'EST LA DÉCISION. Un orchestrateur qui rendrait « autorisé »
 *    servirait un appel qu'aucune garde n'a examiné ; un orchestrateur qui
 *    rendrait « refusé » écrirait dans `ops_audit` un refus que personne n'a
 *    prononcé — la métrique du § 24 compterait alors des refus imaginaires.
 *
 * La liste est DÉRIVÉE d'`APPEL_STEPS` confronté à {@link EXECUTANTS_ETAPES},
 * jamais figée : ajouter une étape au § 11 sans exécutant la fait apparaître ici
 * le jour même.
 */
export class ErreurOrchestrateurNonImplemente extends Error {
  /** Les étapes applicables sans exécutant, au moment de la levée. */
  public readonly etapesManquantes: readonly AppelStep[];
  /** Combien d'étapes la confrontation a MESURÉES. Jamais une couleur. */
  public readonly etapesMesurees: number;

  public constructor(couverture: CouvertureEtapes) {
    super(
      "core/chaine/orchestrateur : la chaîne du § 11 est incomplète sur le transport " +
        `« ${couverture.transport} ». ${String(couverture.etapesMesurees)} étape(s) ` +
        `confrontée(s), ${String(couverture.etapesApplicables)} applicable(s), ` +
        `${String(couverture.sansExecutant.length)} sans exécutant : ` +
        `${couverture.sansExecutant.length === 0 ? "aucune" : couverture.sansExecutant.join(", ")}. ` +
        "Cette fonction LÈVE plutôt que de rendre un refus ou un succès : un orchestrateur " +
        "qui rendrait « autorisé » servirait un appel qu'aucune garde n'a examiné, et un " +
        "orchestrateur qui rendrait « refusé » écrirait dans `ops_audit` un refus que " +
        "personne n'a prononcé.",
    );
    this.name = "ErreurOrchestrateurNonImplemente";
    this.etapesManquantes = couverture.sansExecutant;
    this.etapesMesurees = couverture.etapesMesurees;
  }
}

/**
 * La chaîne s'est contredite elle-même — un port a rendu une valeur que l'ordre
 * du § 11 rend impossible.
 *
 * ⚠️ ELLE LÈVE, ELLE NE REFUSE PAS. Un refus serait un mensonge : il nommerait
 *    une étape qui n'a rien décidé. Le § 11 range cette issue sous
 *    `decision: "interrompu"` — « l'aveu qu'aucune décision n'a été atteinte ».
 */
export class ErreurChaineIncoherente extends Error {
  public constructor(detail: string) {
    super(`core/chaine/orchestrateur : la chaîne du § 11 s'est contredite — ${detail}`);
    this.name = "ErreurChaineIncoherente";
  }
}

/**
 * Une étape de la COUTURE (9, 10, 11) a refusé sans code du § 15.
 *
 * `RefusIntercalaire` de `core/limits` exige un `ErrorCode` non nul, et c'est
 * juste : les trois étapes de la couture en ont un dans `APPEL_STEPS`. Un `null`
 * y serait un défaut de câblage — pas une décision.
 */
export class ErreurCodeIntercalaireAbsent extends Error {
  public constructor(etape: AppelStep) {
    super(
      `core/chaine/orchestrateur : l'étape ${String(etape)} a refusé sans code du § 15. ` +
        "Les étapes 9, 10 et 11 en ont un dans `APPEL_STEPS` ; un `null` ici est un défaut " +
        "de câblage, pas une décision. Le refus n'est pas prononcé : l'appel est interrompu.",
    );
    this.name = "ErreurCodeIntercalaireAbsent";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA MÉMOÏSATION DE LA LECTURE DU CATALOGUE — par appel, jamais par processus
// ═════════════════════════════════════════════════════════════════════════════

/** Un catalogue mémoïsé, qui ANNONCE combien de lectures il a réellement faites. */
export interface CatalogueMemoise extends CatalogueOutils {
  /** Nombre de lectures RÉELLES du port sous-jacent. Mesuré, pas supposé. */
  lectures(): number;
}

/**
 * Enveloppe un catalogue pour que la LECTURE d'un nom n'ait lieu qu'une fois
 * PENDANT CET APPEL.
 *
 * ⚠️ CE N'EST PAS UN CACHE, et la distinction n'est pas rhétorique. Un cache
 *    survit à l'appel : il servirait un `enabled` périmé après une bascule de
 *    console, et le § 14 (correction 3) l'interdit — « la valeur mesurée en CI
 *    n'est jamais celle qui est servie ». Ceci meurt avec l'appel. Ce qu'il
 *    garantit est l'inverse d'un cache : que les étapes 5 et 6 se prononcent sur
 *    LA MÊME lecture, au lieu de deux lectures qui peuvent différer au milieu
 *    d'une seule décision.
 */
export function memoiserPourCetAppel(source: CatalogueOutils): CatalogueMemoise {
  const vues = new Map<string, OutilDuCatalogue | null>();
  let lectures = 0;

  return {
    async relire(nomComplet: string): Promise<OutilDuCatalogue | null> {
      const dejaVu = vues.get(nomComplet);
      if (dejaVu !== undefined || vues.has(nomComplet)) return dejaVu ?? null;
      lectures += 1;
      const lu = await source.relire(nomComplet);
      vues.set(nomComplet, lu);
      return lu;
    },
    lectures(): number {
      return lectures;
    },
  };
}

/** Un inventaire mémoïsé, qui ANNONCE combien de lectures il a réellement faites. */
export interface InventaireMemoise {
  /** L'inventaire SERVI, lu au plus une fois pendant cet appel. */
  lire(): Promise<readonly OutilDuCatalogue[]>;
  /** Nombre de lectures RÉELLES du port sous-jacent. Mesuré, pas supposé. */
  lectures(): number;
}

/**
 * Enveloppe `EtatDePilotage.inventaire` pour que la LISTE SERVIE ne soit lue
 * qu'une fois PENDANT CET APPEL — ADR 0036, décision 2.
 *
 * ⚠️ **CE N'EST PAS UN CACHE, et la distinction est la décision elle-même.** Le
 *    § 14, correction 3, existe parce qu'`ops_tool.enabled` bascule en console
 *    sans redéploiement : la liste mesurée hier n'est pas celle qui est servie
 *    aujourd'hui. Un cache inter-appels rouvrirait ce trou-là, en silence. Ceci
 *    meurt avec l'appel, et ce qu'il garantit est l'inverse d'un cache : que le
 *    profil de repli et le plafond du § 14 se prononcent sur LA MÊME lecture,
 *    au lieu de deux lectures qui peuvent différer au milieu d'une décision.
 */
export function memoiserLInventairePourCetAppel(source: EtatDePilotage): InventaireMemoise {
  let vu: readonly OutilDuCatalogue[] | null = null;
  let lectures = 0;

  return {
    async lire(): Promise<readonly OutilDuCatalogue[]> {
      if (vu !== null) return vu;
      lectures += 1;
      vu = await source.inventaire();
      return vu;
    },
    lectures(): number {
      return lectures;
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  § 15 — `upstream_unavailable` : L'AMONT INJOIGNABLE A ENFIN UN ÉMETTEUR
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ **GARDE DE COMPILATION — `upstream_unavailable` APPARTIENT À `ErrorCode`.**
 *
 * Le § 15 l'énumère depuis le premier jour — « Adaptateur ou API tierce
 * injoignable. Dit lequel, et si c'est transitoire » — et **AUCUN module de
 * production ne le rendait**. Un code que rien n'émet est une métrique qui
 * restera vide, et une métrique vide ressemble à une métrique sans incident :
 * le comptage des refus du § 24 aurait rangé toute panne d'amont sous
 * `interrompu` / `internal`, c'est-à-dire sous « le socle a un défaut ».
 *
 * Le retirer de `ERROR_CODES` fait échouer `pnpm typecheck` sur cette ligne-ci,
 * qui dit pourquoi elle existe.
 */
export const CODE_AMONT_INJOIGNABLE: ErrorCode = "upstream_unavailable";

/**
 * LES CODES SYSTÈME QUI SIGNIFIENT « L'AMONT N'A PAS RÉPONDU ».
 *
 * ⚠️ **CE QUI EST MESURÉ EST LE CODE, JAMAIS LE MESSAGE.** Un adaptateur peut
 *    écrire n'importe quoi dans le texte d'une `Error` ; il ne fabrique pas un
 *    `code` de `libuv` ou de `undici` sans le vouloir. Reconnaître « injoignable »
 *    à un mot du message ferait du LIBELLÉ d'un tiers l'entrée d'une décision du
 *    socle — exactement le vecteur que le § 18 range parmi les adversaires.
 *
 * ⚠️ **ET LE MESSAGE DE L'ERREUR N'ENTRE JAMAIS DANS LE REFUS.** Il porte
 *    couramment l'hôte, le port, une URL, parfois un jeton en clair. Le refus ne
 *    rend que l'`adapterId` — connu du socle — et ce code système. C'est aussi le
 *    § 15 : `internal` est le seul à rendre un identifiant de corrélation, et
 *    aucun refus ne rend de trace de pile.
 *
 * ⚠️ **CETTE LISTE EST FERMÉE, ET SON APPARTENANCE EST UN CHOIX.** Chaque valeur
 *    désigne une panne de JOIGNABILITÉ, jamais une réponse de l'amont : un `500`
 *    reçu d'une API tierce est une réponse, il se range ailleurs. Ajouter ici un
 *    code qui n'est pas une panne de transport ferait passer pour « amont
 *    injoignable » un défaut du socle.
 */
export const CODES_SYSTEME_AMONT_INJOIGNABLE: readonly string[] = [
  // Le pair a refusé la connexion, ou l'a coupée en cours.
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  // Le nom ne se résout pas, ou plus.
  "ENOTFOUND",
  "EAI_AGAIN",
  // La route n'existe pas — hôte ou réseau hors d'atteinte.
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ENETDOWN",
  // Le délai a expiré, aux deux étages où le délai se mesure.
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
];

/** Ce que rend la reconnaissance d'une panne d'amont. JAMAIS un booléen seul. */
export interface VerdictAmont {
  readonly injoignable: boolean;
  /** Le code SYSTÈME reconnu, ou `null`. Jamais le message de l'erreur. */
  readonly codeSysteme: string | null;
  /** Combien de maillons de la chaîne `cause` ont été examinés. Annoncé. */
  readonly causesExaminees: number;
}

/**
 * L'ERREUR REMONTÉE PAR L'ADAPTATEUR EST-ELLE UNE PANNE DE JOIGNABILITÉ ?
 *
 * ⚠️ **ELLE SUIT LA CHAÎNE `cause`, ET ELLE DIT COMBIEN DE MAILLONS ELLE A VUS.**
 *    Un client HTTP moderne enveloppe presque toujours : `TypeError: fetch
 *    failed` avec `{ cause: Error { code: "ECONNREFUSED" } }`. Regarder le seul
 *    premier niveau rendrait cette fonction VERTE POUR LA PIRE DES RAISONS —
 *    elle ne reconnaîtrait jamais rien, et le code du § 15 resterait sans
 *    émetteur tout en ayant l'air branché.
 *
 * ⚠️ **LA PROFONDEUR EST BORNÉE.** Une chaîne de causes peut être cyclique — rien
 *    ne l'interdit — et une boucle ici pendrait l'appel dans un `catch`, à
 *    l'endroit exact où le socle doit encore écrire sa ligne de journal.
 */
export function estAmontInjoignable(
  erreur: unknown,
  codes: readonly string[] = CODES_SYSTEME_AMONT_INJOIGNABLE,
  profondeurMax = 8,
): VerdictAmont {
  const connus = new Set(codes);
  const vues = new Set<object>();
  let courante: unknown = erreur;
  let causesExaminees = 0;

  while (courante !== null && typeof courante === "object" && causesExaminees < profondeurMax) {
    if (vues.has(courante)) break;
    vues.add(courante);
    causesExaminees += 1;

    const code: unknown = (courante as { code?: unknown }).code;
    if (typeof code === "string" && connus.has(code)) {
      return { injoignable: true, codeSysteme: code, causesExaminees };
    }
    courante = (courante as { cause?: unknown }).cause;
  }

  return { injoignable: false, codeSysteme: null, causesExaminees };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES EMPREINTES DE PROVENANCE — la valeur canonique du port
// ═════════════════════════════════════════════════════════════════════════════

/** Une sérialisation qui ne lève pas : une charge non sérialisable a quand même
 *  une empreinte, et c'est mieux qu'une session non marquée. */
function jsonStable(valeur: unknown): string {
  try {
    return JSON.stringify(valeur) ?? "undefined";
  } catch {
    return `[non-sérialisable:${typeof valeur}]`;
  }
}

/**
 * Les empreintes qui entrent à l'index de provenance après l'étape 14 (§ 20).
 *
 * ⚠️ CE QUI ENTRE À L'INDEX N'EST JAMAIS LE CONTENU. `empreinteExtrait` rend une
 *    empreinte ; le § 20 fait de cet index « une exception motivée au § 31 :
 *    jamais persistée ». Rien de ce qui passe ici ne doit pouvoir remonter à un
 *    texte lisible.
 *
 * ⚠️ BORNE ÉCRITE AVEC LA MESURE : l'index compte des EXTRAITS, et ce que cette
 *    fonction lui donne est une empreinte par ÉLÉMENT SERVI. Un outil qui rend un
 *    seul élément portant dix messages n'en déclare qu'un. Le compte du
 *    healthcheck (§ 20) mesure donc la granularité de la SORTIE, pas celle du
 *    contenu — et c'est cette phrase-ci, pas le compte, qui le dit.
 */
export function empreintesParDefaut(execution: ExecutionEtablie): readonly string[] {
  const charge: unknown = execution.charge;
  if (typeof charge === "object" && charge !== null && "items" in charge) {
    const items: unknown = (charge as { readonly items: unknown }).items;
    if (Array.isArray(items)) {
      return items.map((item: unknown, rang: number) =>
        empreinteExtrait(`${String(rang)}:${jsonStable(item)}`),
      );
    }
  }
  return [empreinteExtrait(jsonStable(charge))];
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'EN-TÊTE VIVANT — pourquoi il n'est pas une copie
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'en-tête que `avecJournal` reçoit est MUTÉ au fil de la chaîne.
 *
 * ⚠️ POURQUOI, ET QUELLE PROPRIÉTÉ D'`avecJournal` C'EST. `avecJournal` fige
 *    l'`argHash` à l'entrée — il en a un affineur dédié — mais il LIT les autres
 *    champs de l'en-tête AU MOMENT D'ÉCRIRE, c'est-à-dire APRÈS le corps. Muter
 *    l'objet passé fait donc arriver à la ligne le `toolVersion`,
 *    l'`adapterVersion`, l'`effect` et le `policyLevel` RÉELS, dès que la chaîne
 *    les connaît.
 *
 *    Sans cela, toute ligne — y compris celle d'un appel parfaitement servi —
 *    porterait `effect: "read"` et `toolVersion: "inconnue"`, et la métrique
 *    d'effets du § 24 serait fausse sur la totalité du journal.
 *
 * ⚠️ C'EST UNE DÉPENDANCE À UN COMPORTEMENT D'`avecJournal`, ET ELLE EST GARDÉE.
 *    `orchestrateur.spec.ts` refuse à l'étape 10 puis LIT la ligne écrite : si
 *    `avecJournal` se mettait un jour à copier l'en-tête à l'entrée, la garde
 *    rougirait immédiatement au lieu de laisser un journal faux s'installer.
 */
interface EnteteVivant {
  principal: string;
  // ADR 0014 — la MÊME monnaie qu'`EnteteAppel` et que `IdentiteAppelante` : cet
  // en-tête est recopié tel quel dans la ligne d'`ops_audit`, et une `string` ici
  // aurait laissé le resserrement s'arrêter juste avant le journal.
  sessionId: SessionId;
  tool: string;
  toolVersion: string;
  adapterVersion: string;
  effect: EnteteAppel["effect"];
  policyLevel: PolicyLevel;
  argHash: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA CHAÎNE
// ═════════════════════════════════════════════════════════════════════════════

/** Les trois étapes que la couture du § 11 accepte. Resserrement VÉRIFIÉ. */
function etapeIntercalaire(numero: AppelStep): 9 | 10 | 11 {
  if (numero === 9 || numero === 10 || numero === 11) return numero;
  throw new ErreurChaineIncoherente(
    `l'étape ${String(numero)} s'est exécutée dans la couture « entre le schéma et le quota », ` +
      "que le § 11 réserve aux étapes 9, 10 et 11. Un `stepDenied` faux serait écrit dans " +
      "`ops_audit`, et la métrique du § 24 compterait ce refus sous une autre étape.",
  );
}

/** Le code d'un refus de la couture, refusé s'il est nul. */
function exigerCode(verdict: EtapeRefuse): ErrorCode {
  if (verdict.code === null) throw new ErreurCodeIntercalaireAbsent(verdict.etape);
  return verdict.code;
}

/**
 * ORCHESTRE UN APPEL D'OUTIL — étape 0, puis 5 à 14 du § 11.
 *
 * ═══ L'ORDRE, ET CE QUI LE FIXE ═══
 *
 * L'ordre est celui d'`APPEL_STEPS`, qui est lui-même celui du § 11 — à
 * l'inversion 5 ↔ 6 près, documentée en tête de fichier et imposée par le fait
 * que l'étape 5 se prononce sur un `effect` que l'étape 6 relit. Deux points de
 * cet ordre sont des règles explicites du CDC, et non des commodités :
 *
 *  · **le schéma (8) AVANT le quota (12)** — tenu par `appliquerLimites`, qui
 *    reçoit le validateur et l'exécute avant de toucher un dépôt ;
 *  · **l'étape 0 AVANT tout** — coffre fermé, aucun appel d'outil n'est servi
 *    (§ 23), quel que soit l'outil, quel que soit le profil, quel que soit le
 *    transport.
 *
 * ═══ CE QUE LE CORPS TIENT, ET QU'AUCUN TYPE N'EXPRIME ═══
 *
 *  1. **Une seule sortie.** Le corps ne rend jamais directement : il rend une
 *     `Terminaison` à `avecJournal`, qui écrit la ligne et rend le résultat.
 *  2. **Le schéma n'est évalué QU'UNE FOIS par appel** — `appliquerLimites` le
 *     garantit, et rend la valeur validée à la couture.
 *  3. **Un refus de politique ne consomme AUCUNE unité de quota**, parce qu'il
 *     est prononcé dans `entreSchemaEtQuota`, avant l'étape 12.
 *  4. **`effect` et `dataClass` viennent d'`ops_tool`, jamais de l'appel.**
 *  5. **Le marquage de provenance s'écrit APRÈS l'étape 14**, sur le RÉSULTAT :
 *     c'est le résultat qui marque la session (§ 20), pas la demande.
 *
 * @throws {ErreurOrchestrateurNonImplemente} si une étape applicable au
 *   transport n'a aucun exécutant — AVANT toute écriture, donc sans ligne.
 */
export async function orchestrerAppel(
  identite: IdentiteAppelante,
  appel: AppelEntrant,
  dependances: DependancesOrchestrateur,
): Promise<ResultatAppel> {
  // ═══ LA GARDE DE CÂBLAGE, AVANT TOUTE ÉCRITURE ═══════════════════════════
  //
  // Elle lève AVANT `avecJournal` : une chaîne incomplète ne doit pas écrire de
  // ligne du tout, sans quoi `ops_audit` porterait des appels que le socle n'a
  // pas su examiner, sous l'apparence d'appels normaux.
  const couverture = verifierCouvertureDesEtapes(dependances.transport);
  if (couverture.sansExecutant.length > 0) {
    throw new ErreurOrchestrateurNonImplemente(couverture);
  }

  const colonne = colonneDuTransport(dependances.transport);
  const maintenant = dependances.maintenant();
  const catalogue = memoiserPourCetAppel(dependances.catalogue);
  // ADR 0036, décision 2 — l'inventaire SERVI est du chemin NOMINAL depuis que
  // le plafond du § 14 se refuse à l'étape 7. Une lecture par appel, au plus.
  const inventaire = memoiserLInventairePourCetAppel(dependances.pilotage);

  // ── L'`argHash` de la charge BRUTE, pour qu'un refus précoce ait quoi écrire.
  //    Son échec n'est PAS avalé : il est MESURÉ dans la trace. Un coffre fermé
  //    n'a pas de clé d'HMAC, et c'est l'étape 0 qui prononcera le refus — un
  //    silence n'est un constat que si l'instrument pouvait voir.
  let argHashBrut = ARG_HASH_NON_LU;
  let argHashBrutIndisponible = false;
  try {
    argHashBrut = await dependances.calculArgHash.calculer(appel.nomComplet, appel.input);
  } catch {
    argHashBrutIndisponible = true;
  }

  const entete: EnteteVivant = {
    principal: identite.principal,
    sessionId: identite.sessionId,
    // Le nom complet est CONNU dès l'entrée — contrairement à `OUTIL_INCONNU`,
    // réservé aux refus des étapes 1 à 4, où le corps JSON-RPC n'a même pas été
    // lu.
    tool: appel.nomComplet,
    toolVersion: VERSION_INCONNUE,
    adapterVersion: VERSION_INCONNUE,
    // Le moins faux des choix tant que l'étape 6 n'a pas relu `ops_tool` : le
    // § 09 n'a pas de valeur « inconnu ». Toute mesure d'effets doit donc
    // EXCLURE les lignes dont le `stepDenied` vaut 0.
    effect: "read",
    policyLevel: NIVEAU_DE_REPLI,
    argHash: argHashBrut,
  };

  // ── L'état que la chaîne remplit, et que la trace lira ────────────────────
  const franchies: AppelStep[] = [];
  let etapeRefusante: AppelStep | null = null;
  let niveau: NiveauApplique | null = null;
  let ligneDIntention: LigneEcrite | null = null;
  let refusDetaille: RefusDetaille | null = null;

  const franchir = (etape: AppelStep): void => {
    franchies.push(etape);
  };

  const tracer = (): TraceOrchestration => {
    const atteintes = new Set<AppelStep>([
      ...colonne.etapesAmont,
      ...franchies,
      ...(etapeRefusante === null ? [] : [etapeRefusante]),
    ]);
    return {
      transport: colonne.transport,
      etapesApplicables: colonne.etapesApplicables,
      etapesNonApplicables: colonne.etapesNonApplicables,
      etapesAmont: colonne.etapesAmont,
      etapesFranchies: [...franchies],
      etapeRefusante,
      etapesNonAtteintes: colonne.etapesApplicables.filter((etape) => !atteintes.has(etape)),
      niveauApplique: niveau?.niveau ?? NIVEAU_DE_REPLI,
      niveauMesures: niveau?.mesures ?? 0,
      argHashBrutIndisponible,
      ligneDIntention,
    };
  };

  /** Prononce un refus : il fixe le `stepDenied`, et RIEN d'autre ne le fixe. */
  const refuser = (ancrage: AncrageEtape, message: string): Refus => {
    etapeRefusante = ancrage.numero;
    refusDetaille = { etape: ancrage.numero, code: ancrage.code, message };
    return { genre: "refus", etape: ancrage.numero, code: ancrage.code };
  };

  /** Le même, depuis le verdict d'une étape — numéro et code LUS dans le verdict. */
  const refuserDepuis = (verdict: EtapeRefuse): Refus => {
    etapeRefusante = verdict.etape;
    refusDetaille = { etape: verdict.etape, code: verdict.code, message: verdict.message };
    return { genre: "refus", etape: verdict.etape, code: verdict.code };
  };

  const corps: CorpsDeChaine = async ({
    affinerArgHash,
    signalerEffetExterieur,
    // ADR 0021 — le TROISIÈME membre, celui que l'ADR 0017 annonçait. Il LIT le
    // cliquet ; le `finally` de l'étape 14 en dérive l'issue d'idempotence. Il
    // ne peut ni le lever ni le baisser.
    effetExterieurSurvenu,
  }) => {
    // ═══ ÉTAPE 0 — LE COFFRE (§ 23, ADR 0005) ═══════════════════════════════
    //
    // AVANT TOUT. Coffre fermé, aucun appel d'outil n'est servi.
    const verrou = dependances.coffre.refusDAppelDOutil();
    if (verrou !== null) return refuser(ETAPE_COFFRE_CHAINE, verrou.message);
    franchir(ETAPE_COFFRE_CHAINE.numero);

    // ═══ L'ÉTAPE 5 PARLE D'ABORD QUAND ELLE PEUT PARLER SANS LE CATALOGUE ═══
    //
    // ⚠️ LA FUITE D'EXISTENCE QUE CECI FERME, ET POURQUOI ELLE EXISTAIT. L'étape
    //    5 a besoin de l'`effect` ÉPINGLÉ de l'outil, qui vit dans le catalogue :
    //    pour un outil INCONNU, il n'y a pas d'`effect`, donc rien à confronter,
    //    et le refus tombait à l'étape 6. Un appelant SANS AUCUN SCOPE obtenait
    //    donc un refus d'étape 5 sur un outil qui existe et un refus d'étape 6
    //    sur un outil qui n'existe pas : numéro, code et message différaient.
    //    C'était un oracle d'énumération du catalogue, ouvert à qui n'a aucun
    //    droit.
    //
    //    Il existe pourtant une question que l'étape 5 peut trancher SANS le
    //    catalogue : **ce porteur couvre-t-il un effect, QUEL QU'IL SOIT ?** S'il
    //    n'en couvre aucun, aucun outil ne lui est servable — celui-là comme
    //    n'importe quel autre — et le refus est prononçable avant toute lecture.
    //    Les deux noms deviennent alors indiscernables : même étape, même code,
    //    même message.
    //
    //    ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE : ceci ne ferme la fuite QUE pour un
    //       porteur sans aucun scope utile. Un appelant qui porte `ops:read` et
    //       demande un outil `send` inconnu est toujours refusé à 6, et apprend
    //       donc que le nom n'existe pas. Fermer ce cas-là exigerait de connaître
    //       l'`effect` d'un outil qu'on ne peut pas lire : c'est impossible sans
    //       renoncer à l'épinglage du § 20, et ce n'est pas un arbitrage que ce
    //       lot avait à prendre. L'écart reste au rapport.
    const couvreUnEffetQuelconque = EFFECTS.some((effet) =>
      identite.scopes.includes(dependances.correspondanceScopes(effet)),
    );
    if (!couvreUnEffetQuelconque) {
      return refuser(
        ETAPE_SCOPES,
        `Le jeton d'appel ne porte AUCUN scope couvrant un effet du § 19.2 : aucun outil ne ` +
          `peut lui être servi. Demandez un jeton portant les scopes du niveau voulu ` +
          `(${OPS_SCOPES.join(", ")}) depuis la console. ` +
          `⚠️ Ce message est le MÊME pour tout nom d'outil, existant ou non : à scopes vides, ` +
          `le socle ne dit pas ce que son catalogue contient.`,
      );
    }

    // ═══ LA LECTURE DU CATALOGUE — voir « L'INVERSION 5 ↔ 6 » en tête ═══════
    const outilLu = await catalogue.relire(appel.nomComplet);
    if (outilLu === null) {
      // L'étape 6 rédige le message : il n'y a pas deux façons de dire « cet
      // outil n'existe pas », et la seconde serait celle qui divergerait.
      const verdict = await dependances.etapeCatalogue({
        nomComplet: appel.nomComplet,
        catalogue,
        maintenant,
      });
      if (verdict.issue === "refuse") return refuserDepuis(verdict);
      throw new ErreurChaineIncoherente(
        `le catalogue n'a rendu aucun outil pour « ${appel.nomComplet} », mais l'étape 6 a ` +
          "autorisé l'appel. L'un des deux ment, et servir l'appel reviendrait à choisir " +
          "lequel au hasard.",
      );
    }

    // L'en-tête sait désormais de quel outil il parle — la ligne le dira, même
    // si l'appel est refusé à l'étape suivante.
    entete.toolVersion = outilLu.version;
    entete.adapterVersion = outilLu.adapterVersion;
    entete.effect = outilLu.effect;

    // ═══ ÉTAPE 5 — LES SCOPES (§ 11, § 19.2) ════════════════════════════════
    const v5 = dependances.etapeScopes({
      scopes: identite.scopes,
      // ÉPINGLÉ dans `ops_tool`, jamais reçu de l'appelant (§ 20).
      effectEpingle: outilLu.effect,
      outil: appel.nomComplet,
      correspondance: dependances.correspondanceScopes,
    });
    if (v5.issue === "refuse") return refuserDepuis(v5);
    franchir(v5.etape);

    // ═══ ÉTAPE 6 — L'OUTIL EXISTE ET IL EST ACTIVÉ (§ 14, correction 3) ═════
    const v6 = await dependances.etapeCatalogue({
      nomComplet: appel.nomComplet,
      catalogue,
      maintenant,
    });
    if (v6.issue === "refuse") return refuserDepuis(v6);
    franchir(v6.etape);
    const outil = v6.etabli.outil;

    // ═══ ÉTAPE 7 — L'OUTIL EST-IL AU PROFIL ACTIF ? (§ 14) ══════════════════
    //
    // ⚠️ LE REPLI EST DÉRIVÉ, PAS ÉLU. Le CDC ne nomme aucun profil de repli
    //    (écart du lot 1, toujours ouvert). `profilLeMoinsExposant` le tire de
    //    la surface RÉELLEMENT servie — vers `admin`, jamais.
    let profil = await dependances.pilotage.profilActif(identite.principal);
    if (profil === null) {
      const repli = profilLeMoinsExposant(await inventaire.lire());
      profil = repli.profil;
    }
    if (!estServi(outil, profil)) {
      return refuser(
        ETAPE_PROFIL_CHAINE,
        `L'outil « ${appel.nomComplet} » n'est pas servi dans le profil actif ` +
          `« ${profil} » : il n'y est pas rattaché, ou il est désactivé, ou il est sorti de ` +
          "`tools/list` (§ 14, correction 3 — les trois conditions, pas une de moins). " +
          "Changer de profil depuis la console, ou rattacher l'outil à ce profil-ci.",
      );
    }

    // ── LE PLAFOND DU § 14 SE REFUSE ICI, PAS SEULEMENT EN CI (ADR 0036) ────
    //
    // ⚠️ **L'ORDRE N'EST PAS UNE COMMODITÉ.** L'appartenance parle d'abord : un
    //    outil absent du profil se refuse sans qu'aucun plafond n'ait à être
    //    mesuré, et le message qu'il faut lire est celui de l'appartenance.
    //
    // ⚠️ **LE NUMÉRO ET LE CODE SONT LUS DANS LE VERDICT** — `etapeDeRefus` et
    //    `codeDeRefus`, que `core/profiles/budget.ts` dérive déjà d'`APPEL_STEPS`
    //    par la clé « profil ». Les réécrire ici fabriquerait la seconde source
    //    de vérité que l'ADR 0030 interdit, et elle divergerait en silence.
    //
    // ⚠️ **LE CODE EST EXACT POUR L'APPARTENANCE ET INEXACT POUR LE PLAFOND, ET
    //    ON NE L'INVENTE PAS.** `tool_not_in_profile` dit « absent du profil
    //    actif » ; sur un dépassement, l'outil Y EST, c'est le profil qui
    //    déborde. Le § 15 n'énumère aucun code pour ce second cas, et
    //    `budget.ts` a déjà tranché en laissant l'écart VISIBLE plutôt qu'en le
    //    bouchant par un voisin qui mentirait sur la cause. C'est donc le
    //    MESSAGE qui distingue les deux — c'est lui que l'appelant lit (§ 15).
    // ⚠️ LE PLAFOND EST NOMMÉ ICI, ET IL EST IMPORTÉ DE SON PROPRIÉTAIRE. Le
    //    laisser implicite rendrait l'étape 7 muette sur la règle qu'elle
    //    applique — or c'est précisément ce que le § 14 lui reproche depuis le
    //    début : « le plafond se refuse à l'étape 7, PAS SEULEMENT EN CI ». Ce
    //    n'est pas une recopie : `PLAFOND_OUTILS_PAR_PROFIL` vient de
    //    `core/profiles/budget.ts`, qui reste le seul endroit où le nombre est
    //    écrit.
    const verdictDuBudget: VerdictBudget = mesurerBudgetProfil(profil, await inventaire.lire(), {
      plafondOutils: PLAFOND_OUTILS_PAR_PROFIL,
    });
    const refusDuBudget = (message: string): EtapeRefuse => ({
      issue: "refuse",
      etape: verdictDuBudget.etapeDeRefus,
      code: verdictDuBudget.codeDeRefus,
      message,
    });

    // ⚠️ UNE MESURE AVEUGLE REFUSE, ELLE NE PASSE PAS (ADR 0036, décision 3).
    //    À l'étape 7, `mesureAveugle` ne peut vouloir dire qu'une chose :
    //    l'étape 6 a trouvé l'outil au catalogue et le pilotage rend un
    //    inventaire vide — les deux se contredisent. Laisser passer ferait
    //    mesurer le plafond sur zéro outil, et il ne pourrait plus jamais
    //    mordre : une garde verte parce qu'elle ne regarde rien.
    //
    //    LE MESSAGE NOMME LA CONTRADICTION, PAS LE PLAFOND. Parler de plafond
    //    ici enverrait retirer des outils d'un profil qui n'en sert aucun.
    if (verdictDuBudget.mesureAveugle) {
      return refuserDepuis(
        refusDuBudget(
          `Contradiction interne au socle : l'étape 6 a relu « ${appel.nomComplet} » dans ` +
            `\`ops_tool\`, et le pilotage rend un inventaire de ` +
            `${String(verdictDuBudget.outilsExamines)} définition(s) — les deux ne peuvent pas ` +
            "être vrais ensemble. Le plafond du § 14 ne peut donc être mesuré sur RIEN : " +
            "l'appel est refusé plutôt que servi sur une mesure aveugle. Vérifier que le " +
            "pilotage lit le même `ops_tool` que le catalogue.",
        ),
      );
    }

    if (verdictDuBudget.depasse) {
      const plusLourd = verdictDuBudget.poids[0];
      return refuserDepuis(
        refusDuBudget(
          `L'outil « ${appel.nomComplet} » EST bien rattaché au profil actif ` +
            `« ${profil} » — c'est le PROFIL qui déborde le budget du § 14, et c'est pour ` +
            "cela que l'appel est refusé. " +
            `Mesuré : ${String(verdictDuBudget.outilsComptes)} outil(s) servi(s) pour un ` +
            `plafond de ${String(verdictDuBudget.plafondOutils)}, ` +
            `${String(verdictDuBudget.octetsMesures)} octet(s) de définitions pour un plafond ` +
            `de ${String(verdictDuBudget.plafondOctets)}, sur ` +
            `${String(verdictDuBudget.outilsExamines)} définition(s) soumises. ` +
            (plusLourd === undefined
              ? ""
              : `La définition la plus lourde : « ${plusLourd.name} » à ` +
                `${String(plusLourd.octets)} octet(s). `) +
            "Retirer un outil de ce profil ou le désactiver depuis la console — le refus " +
            "porte sur la liste SERVIE, celle que la console commande, pas sur la liste " +
            "déclarée que la CI épingle.",
        ),
      );
    }
    franchir(ETAPE_PROFIL_CHAINE.numero);

    // ═══ LA CONFIRMATION : VÉRIFIÉE AU PLUS UNE FOIS, ET SEULEMENT SI EXIGÉE ═
    //
    // ⚠️ VÉRIFIER CONSOMME. Un jeton brûlé sur un appel que la politique refuse
    //    pour une autre raison est un jeton perdu pour rien : on n'appelle donc
    //    le vérificateur QUE si une étape réclame une confirmation.
    let etatConfirmation: EtatConfirmation | null = null;
    const confirmationCourante = async (argHash: string): Promise<EtatConfirmation> => {
      if (etatConfirmation !== null) return etatConfirmation;
      if (appel.jetonDeConfirmation === null) {
        etatConfirmation = "absente";
        return etatConfirmation;
      }
      etatConfirmation = await dependances.confirmation.verifierEtConsommer({
        presente: appel.jetonDeConfirmation,
        tool: outil.name,
        argHash,
        principal: identite.principal,
        maintenant,
      });
      return etatConfirmation;
    };

    const reglages = dependances.reglages(outil);
    const reference: ReferenceOutil = referenceDepuisNom(outil.adapterId, outil.name);

    // ═══ ÉTAPES 8 → (9, 10, 11) → 12 → 13, PORTÉES PAR `core/limits` ════════
    //
    // ⚠️ L'ORDRE N'EST PAS LE CHOIX DE CETTE FONCTION. `appliquerLimites` reçoit
    //    le VALIDATEUR et l'exécute en premier ; le dépôt de quota n'est
    //    atteignable qu'après le `return` du refus d'étape 8. Inverser demande
    //    de réécrire `core/limits`, pas de déplacer une ligne ici.
    const limites: ResultatLimites<unknown> = await appliquerLimites<unknown>({
      tool: outil.name,
      effect: outil.effect,
      modeIdempotence: reglages.modeIdempotence,
      principal: identite.principal,
      idempotencyKey: appel.idempotencyKey,
      input: appel.input,
      validerEntree: (input) => dependances.validerEntree(outil, input),
      calcul: dependances.calculArgHash,
      depotQuota: dependances.depotQuota,
      depotIdempotence: dependances.depotIdempotence,
      limiteOutil: reglages.limiteQuota,
      warnAtOutil: reglages.warnAtQuota,
      ttlIdempotenceMs: dependances.ttlIdempotenceMs,
      maintenant,

      // ── LA COUTURE DU § 11 : les étapes 9, 10 et 11, AVANT tout décompte ──
      entreSchemaEtQuota: async (valide, argHash) => {
        // L'étape 8 est franchie : la valeur est validée, et c'est SON empreinte
        // que la ligne doit porter (§ 20, liaison du jeton de confirmation).
        affinerArgHash(argHash);
        franchir(ETAPE_SCHEMA_CHAINE.numero);

        // ── ÉTAPE 9 — LE CURSEUR (§ 13.1) ─────────────────────────────────
        const v9 = await dependances.etapeCurseur({
          pagination: outil.pagination,
          jetonRecu: appel.curseur,
          // ⚠️ SUR L'ENTRÉE VALIDÉE. Un `.default()` au schéma ferait diverger
          //    les deux empreintes, et la deuxième page d'une pagination
          //    parfaitement licite serait refusée.
          filtersHashCourant: await dependances.empreinteFiltres(outil, valide),
          signataire: dependances.signataireCurseur,
        });
        if (v9.issue === "refuse") {
          refuserDepuis(v9);
          return { etape: etapeIntercalaire(v9.etape), code: exigerCode(v9), detail: v9.message };
        }
        franchir(v9.etape);

        // ── ÉTAPE 10 — LA POLITIQUE (§ 20) ────────────────────────────────
        const brut = await dependances.politique.niveauPourOutil(reference, maintenant);

        // ═══════════════════════════════════════════════════════════════════
        //  LE PORT N'EST PAS CRU SUR PAROLE — DEUX CONFRONTATIONS
        // ═══════════════════════════════════════════════════════════════════
        //
        // ⚠️ ① LE NIVEAU EST-IL UN NIVEAU ? `NiveauApplique.niveau` est typé
        //      `PolicyLevel`, mais un type ne survit pas à la compilation : la
        //      valeur vient d'une COLONNE DE BASE, à travers un port que
        //      n'importe qui peut implémenter. Elle était passée DIRECTEMENT à
        //      `deciderEtape10` ET dans `entete.policyLevel`, avec deux
        //      conséquences MESURÉES sur la chaîne complète, port rendant
        //      « libre » suivi d'un espace : (1) l'envoi PARTAIT ; (2) la ligne
        //      d'`ops_audit` ne s'écrivait MÊME PAS, un `policyLevel` hors
        //      énumération étant refusé par la garde du § 31 — donc effet parti,
        //      aucune trace.
        //
        //      L'asymétrie était le défaut : ce fichier fail-close DÉJÀ,
        //      explicitement, sur un TRANSPORT inconnu
        //      (`verifierCouvertureDesEtapes`), et ne le faisait pas sur le
        //      second port qui n'est pas typé à l'exécution.
        //
        // ⚠️ ② A-T-IL SEULEMENT REGARDÉ QUELQUE CHOSE ? Le port est documenté
        //      ainsi, dans ce fichier même : « un niveau calculé sur zéro ligne
        //      examinée vaut `brouillon` : parfaitement rassurant, et
        //      parfaitement aveugle. C'est `mesures` qui le dit, et la trace le
        //      remonte. » La trace le remontait, en effet — et RIEN ne s'en
        //      servait. Un port rendant `{ niveau: "libre", mesures: 0 }` — dépôt
        //      vide, requête qui n'a rien lu, réplique en retard, transaction
        //      avortée — faisait partir l'envoi. Le compte était publié et jamais
        //      confronté : un contrôle vert parce qu'il ne regarde rien.
        //
        // Dans les deux cas on REPLIE sur `NIVEAU_DE_REPLI` plutôt que de lever :
        // une levée ici passerait avant l'écriture du journal, et l'objectif O6
        // exige une ligne. Le MESSAGE distingue les deux pannes d'un refus de
        // politique ordinaire — elles ne se réparent pas du même geste, ni ne
        // doivent se compter ensemble dans la métrique du § 24.
        // ⚠️ ON REPLIE LE NIVEAU, ON NE COURT-CIRCUITE PAS L'ÉTAPE. Refuser
        //    d'emblée fermerait aussi les LECTURES — or `NIVEAU_DE_REPLI` vaut
        //    `brouillon`, qui autorise `read` et `write-draft` : c'est le § 20
        //    lui-même. Une installation neuve, dont la table de politique est
        //    vide, a `mesures === 0` sur chaque appel ; la fermer entièrement la
        //    rendrait inutilisable au premier démarrage, et personne ne saurait
        //    pourquoi. Le repli ferme donc EXACTEMENT ce que `brouillon` ferme :
        //    les effets extérieurs, et rien de plus.
        const niveauLisible = (POLICY_LEVELS as readonly string[]).includes(brut.niveau);
        const politiqueAveugle = brut.mesures === 0;
        const politiqueDouteuse = !niveauLisible || politiqueAveugle;
        const calcule: NiveauApplique = politiqueDouteuse
          ? { ...brut, niveau: NIVEAU_DE_REPLI }
          : brut;

        niveau = calcule;
        entete.policyLevel = calcule.niveau;

        /**
         * Pourquoi le repli a eu lieu — à joindre au message du refus, pour que
         * le § 24 ne compte pas une panne de dépôt comme un refus de politique.
         */
        const causeDuRepli = !niveauLisible
          ? `le niveau enregistré n'est aucun de ceux du § 20 (${POLICY_LEVELS.join(", ")})`
          : "le dépôt de politique n'a examiné AUCUNE ligne — ce n'est pas une décision, " +
            "c'est un silence";

        const cible = { tool: outil.name, argHash };
        // Première évaluation SANS toucher au jeton : si rien n'est exigé, il n'y
        // a aucune raison de consommer une confirmation.
        let decision = deciderEtape10({
          effet: outil.effect,
          niveau: calcule.niveau,
          confirmation: "absente",
          cible,
        });
        if (decision.decision === "refuse" && decision.code === "confirmation_required") {
          const etat = await confirmationCourante(argHash);
          if (etat !== "absente") {
            decision = deciderEtape10({
              effet: outil.effect,
              niveau: calcule.niveau,
              confirmation: etat,
              cible,
            });
          }
        }
        if (decision.decision === "refuse") {
          etapeRefusante = decision.etape;
          // Un refus obtenu SOUS REPLI ne dit pas la même panne qu'un refus de
          // politique ordinaire : le premier se répare dans le dépôt, le second
          // dans la console. Le message le dit ; le code reste celui du § 15,
          // qui n'en a pas d'autre à offrir (écart signalé).
          const message = politiqueDouteuse
            ? `Politique ILLISIBLE : ${causeDuRepli}. Repli sur « ${NIVEAU_DE_REPLI} ». ` +
              `Ce n'est PAS un refus de politique — vérifiez la ligne de politique et l'accès ` +
              `au dépôt depuis la console. Décision sous repli : ${decision.message}`
            : decision.message;
          refusDetaille = { etape: decision.etape, code: decision.code, message };
          return {
            etape: etapeIntercalaire(decision.etape),
            code: decision.code,
            detail: message,
          };
        }
        franchir(ETAPE_POLITIQUE);

        // ── ÉTAPE 11 — LA PROVENANCE (§ 20) ───────────────────────────────
        //
        // ⚠️ LES DEUX BOOLÉENS SE DÉRIVENT DU SCHÉMA, JAMAIS DE LA VALEUR. Le
        //    § 20 a retiré la règle « verbatim » : le socle raisonne sur la
        //    PROVENANCE, pas sur la forme du texte.
        //
        // 🔗 **C'EST ICI QUE LA DÉCLARATION DE L'ADR 0016 ATTEINT UNE DÉCISION.**
        //    `outil.governanceFields` vient d'`ops_tool` par l'étape 6 ; sans cet
        //    argument, la déclaration voyagerait du manifeste jusqu'au
        //    catalogue puis s'arrêterait là — écrite, admise, journalisée, et
        //    perdue avant la seule branche du § 20 qu'aucune confirmation ne
        //    rattrape. C'était le défaut mesuré au lot 1c ; le retirer le rouvre,
        //    et le compilateur le refuse (le paramètre n'a pas de valeur par
        //    défaut, à dessein).
        //
        // 🔗 **ET `outil.idFields` N'Y ENTRE PLUS — ADR 0015, COUSU AU LOT 1d.**
        //    Ce même appel passait la liste des identifiants DÉCLARÉS par
        //    l'adaptateur, et l'étape 11 en retirait chaque champ nommé de la
        //    surveillance : une ligne de manifeste — donc un dépôt tiers —
        //    éteignait la garde d'exfiltration. Le paramètre a disparu de la
        //    signature, et non pas seulement de cet appel : le rendre facultatif
        //    aurait laissé un appelant le renseigner sans qu'une garde bouge.
        const analyse = analyserArgumentsDuSchema(outil.inputSchema, outil.governanceFields);
        const v11 = dependances.etapeProvenance({
          sessionId: identite.sessionId,
          adapterId: outil.adapterId,
          porteUnArgumentLibre: analyse.porteUnArgumentLibre,
          porteUnArgumentDeGouvernance: analyse.porteUnArgumentDeGouvernance,
          niveau: calcule.niveau,
          index: dependances.index,
        });
        if (v11.issue === "refuse") {
          refuserDepuis(v11);
          return {
            etape: etapeIntercalaire(v11.etape),
            code: exigerCode(v11),
            detail: v11.message,
          };
        }

        // § 20 — « est REFUSÉ ou CONFIRMÉ ». L'étape 11 a laissé passer EN
        // EXIGEANT une confirmation humaine ; c'est ici qu'on la réclame.
        //
        // 🔴 ÉCART SIGNALÉ : le § 11 ne donne à l'étape 11 qu'UN code
        //    (`provenance_denied`) alors que le § 20 lui donne DEUX issues. Le
        //    code rendu est donc celui de l'ANCRAGE, et c'est le MESSAGE qui dit
        //    que l'appel est confirmable — plutôt qu'un code emprunté à l'étape
        //    10, qui ferait compter ce refus sous la politique au § 24.
        if (v11.etabli.confirmationExigee) {
          const etat = await confirmationCourante(argHash);
          if (etat !== "valide") {
            const message =
              "Provenance : la session a lu des données marquées chez " +
              `${v11.etabli.domainesMarquants.join(", ")}, et cet appel porte un argument ` +
              `libre vers « ${outil.adapterId} ». Le § 20 l'autorise SOUS CONFIRMATION ` +
              "HUMAINE : ni l'élicitation MCP, ni une réponse produite par le démon vocal " +
              "n'en tiennent lieu. Demander une confirmation depuis la console pour cette " +
              "cible exacte, puis rejouer l'appel avec le jeton reçu.";
            const code = ETAPE_PROVENANCE_CHAINE.code;
            if (code === null) throw new ErreurCodeIntercalaireAbsent(v11.etape);
            etapeRefusante = v11.etape;
            refusDetaille = { etape: v11.etape, code, message };
            return { etape: etapeIntercalaire(v11.etape), code, detail: message };
          }
        }
        franchir(v11.etape);

        return null;
      },
    });

    // ═══ CE QUE `core/limits` A DÉCIDÉ ══════════════════════════════════════
    if (!limites.ok) {
      switch (limites.etape) {
        case 8:
          return refuser(
            ETAPE_SCHEMA_CHAINE,
            `Schéma d'entrée invalide pour « ${appel.nomComplet} » : le champ ` +
              `« ${limites.champ} » attendait ${limites.attendu}. AUCUNE unité de quota n'a ` +
              "été décomptée (§ 11) — corriger l'argument et rejouer immédiatement.",
          );
        case 9:
        case 10:
        case 11:
          // Le refus a déjà été prononcé DANS la couture, avec son message. Le
          // reprononcer ici écrirait une seconde vérité sur le même fait.
          if (refusDetaille === null) {
            throw new ErreurChaineIncoherente(
              `l'étape ${String(limites.etape)} a refusé sans que la couture ait enregistré ` +
                "son message. Le § 15 en exige un ; en fabriquer un ici en ferait deux.",
            );
          }
          return { genre: "refus", etape: limites.etape, code: limites.code };
        case 12:
          return refuser(
            ETAPE_QUOTA_CHAINE,
            `Débit dépassé pour « ${appel.nomComplet} » : ${String(limites.compteur.count)} ` +
              `appel(s) sur un plafond de ${String(limites.compteur.limit)} pour la fenêtre ` +
              `« ${limites.compteur.window} ». Réessayer dans ` +
              `${String(limites.retryAfterSecondes)} seconde(s), ou relever le plafond de ` +
              "l'outil depuis la console.",
          );
        case 13:
          return refuser(
            ETAPE_IDEMPOTENCE_CHAINE,
            `Idempotence : ${limites.detail} ` +
              (limites.quotaRendu
                ? "Les unités de quota prises pour cet appel ont été RENDUES."
                : "Les unités de quota prises pour cet appel restent décomptées : l'appel " +
                  "était légitime, il est simplement arrivé trop tôt."),
          );
      }
    }

    // Le quota a été consommé et la réservation posée : les deux étapes sont
    // franchies, et c'est le RÉSULTAT qui le dit — pas une supposition.
    franchir(ETAPE_QUOTA_CHAINE.numero);
    franchir(ETAPE_IDEMPOTENCE_CHAINE.numero);

    if (limites.rejeu) {
      // § 13 — `(tool, key)` était déjà `done`. RIEN n'a été exécuté : l'étape
      // 14 n'a pas lieu, et la trace le dit en la laissant hors des franchies.
      return {
        genre: "succès",
        valeur: { genre: "rejeu", resultRef: limites.resultRef, trace: tracer() },
        outcome: "ok",
        recordIds: [],
        partialSources: [],
      } satisfies Succes<ChargeServie>;
    }

    // ═══ ÉTAPE 14 — EXÉCUTION, COMPACTION, MASQUAGE (§ 13.3, § 19 bis) ══════
    if (niveau === null) {
      throw new ErreurChaineIncoherente(
        "l'étape 14 a été atteinte sans que l'étape 10 ait calculé un niveau de politique. " +
          "Le `ctx` du § 09 porterait alors un `policyLevel` que personne n'a décidé.",
      );
    }
    const niveauCalcule: NiveauApplique = niveau;

    // ═══ LE `ctx` DU § 09 — ET L'EMPREINTE EST POSÉE ICI, PAR LE SOCLE ═══════
    //
    // ⚠️ **ADR 0020 — CETTE LIGNE EST LA COUTURE, ET ELLE N'EST PAS DÉLÉGUABLE.**
    //    `construireContexteOutil` est une dépendance INJECTÉE : lui confier
    //    l'empreinte reviendrait à confier la règle à des implémentations qui,
    //    toutes, vivent aujourd'hui dans des fichiers de gardes. La règle serait
    //    écrite, testée, documentée — et cousue nulle part. C'est le mode de
    //    défaillance que le lot 1c a nommé, et il ne se répare pas par un
    //    commentaire.
    //
    //    Le TYPE le rend impossible : `ConstruireContexteOutil` rend un
    //    {@link ContexteSansEmpreinte}, et c'est cette construction-ci — un
    //    module de PRODUCTION — qui pose le champ, en appelant l'unique fonction
    //    qui sait le fabriquer.
    //
    // ⚠️ **ET LE `ctx` EST RECONSTRUIT CHAMP PAR CHAMP, PAS ÉTALÉ. MESURÉ.**
    //    Un `{ ...construireContexteOutil(…), idempotencyRef }` compile, et il
    //    laisse passer À L'EXÉCUTION toute propriété surnuméraire que le
    //    constructeur injecté aurait posée — un `idempotencyKey` oublié, par
    //    exemple. `Omit` est une opération de TYPE ; elle n'efface aucune clé
    //    d'objet. Quatre harnais du dépôt portaient précisément cette ligne, et
    //    le compilateur n'en a signalé qu'un seul : la vérification de propriétés
    //    excédentaires ne mord pas de façon fiable au travers d'un type mappé.
    //    Une garde qui dépend de cette subtilité n'est pas une garde.
    //
    //    Reconstruire ferme les deux sens à la fois : ce que l'adaptateur reçoit
    //    est EXACTEMENT les neuf champs déclarés — ni un de plus au runtime, ni un
    //    de moins à la compilation. Ce n'est pas une liste recopiée mais une
    //    TOTALITÉ : ajouter un champ à `ToolContext` sans le poser ici est une
    //    erreur de compilation, ce qui oblige l'orchestrateur à DÉCIDER d'où le
    //    champ vient — exactement la question que l'inventaire des canaux du § 20
    //    (`STATUT_DES_CANAUX_DE_CONTEXTE`) pose au même moment.
    //
    // ⚠️ CE QUI PASSE, ET CE QUI NE PASSE PAS. `appel.idempotencyKey` est la
    //    chaîne LIBRE choisie par l'appelant ; `ctx.idempotencyRef` en est le
    //    condensat SHA-256. Un adaptateur qui relaie vers une API tierce y trouve
    //    le jeton stable dont il a besoin — la déduplication ne s'arrête pas à la
    //    frontière du socle — et aucun extrait d'une lecture marquée ne survit au
    //    passage. Le canal du § 20 est SUPPRIMÉ, pas surveillé.
    const contexteDeclare = dependances.construireContexteOutil(
      identite,
      appel,
      profil,
      niveauCalcule.niveau,
    );
    const contexte: ToolContext<ProfileName> = {
      principal: contexteDeclare.principal,
      sessionId: contexteDeclare.sessionId,
      scopes: contexteDeclare.scopes,
      policyLevel: contexteDeclare.policyLevel,
      profile: contexteDeclare.profile,
      idempotencyRef: empreinteDeCleDIdempotence(appel.idempotencyKey),
      requestId: contexteDeclare.requestId,
      deadline: contexteDeclare.deadline,
      habilitations: contexteDeclare.habilitations,
    };

    // ── LA LIGNE D'INTENTION — juste AVANT l'effet extérieur ────────────────
    ligneDIntention = await dependances.intention.avantEffet({
      principal: identite.principal,
      sessionId: identite.sessionId,
      tool: outil.name,
      argHash: limites.argHash,
      maintenant,
    });

    // ═══ DEUX ISSUES, ET C'EST LEUR CONFUSION QUI ÉTAIT LE DÉFAUT — ADR 0021 ══
    //
    // Une SEULE variable à trois valeurs servait DEUX questions, et le point
    // d'usage l'écrasait en deux (`issueDeLEffet === "done" ? "done" : "failed"`).
    // « interrompu » et « failed » devenaient le même mot à l'endroit exact où la
    // distinction comptait — et `failed` est le seul statut que `reserver()`
    // REPREND. Un envoi parti dont le traitement d'aval levait laissait donc une
    // clé rejouable : **un courrier parti pouvait repartir.**
    //
    //  · L'INTENTION garde ses trois valeurs — « interrompu » y est le signal
    //    recherché (ADR 0022), et rien ne l'écrase.
    //  · L'IDEMPOTENCE se DÉRIVE, plus bas, par `issueDeReservation()`.
    let issueDeLIntention: "done" | "failed" | "interrompu" = "interrompu";

    /**
     * L'étape 14 a-t-elle RENDU — succès ou refus — plutôt que levé ?
     *
     * ⚠️ C'EST UN FAIT, PAS UNE ISSUE. Il est posé une seule fois, JUSTE APRÈS
     *    le retour d'`etapeExecution`, et aucune branche ultérieure ne le
     *    reconsidère : tout ce qui suit se passe dans un monde où le handler a
     *    rendu la main. C'est ce qui empêche qu'il se remette à décrire le genre
     *    de la terminaison de l'APPEL au lieu de celui de l'ÉTAPE 14.
     */
    let terminaisonRendue = false;
    try {
      const v14 = await dependances.etapeExecution({
        outil,
        // ═══ LE CLIQUET D'EFFET EXTÉRIEUR — ADR 0017, UNIQUE APPELANT ═══════
        //
        // ⚠️ C'EST LE SEUL POINT DU SOCLE OÙ « QUELQUE CHOSE EST SORTI » DEVIENT
        //    VRAI. Cette clôture est l'`executer()` de l'étape 14, et l'étape 14
        //    est la seule à l'appeler — une fois, à l'instant nommé « ⚠️ L'EFFET
        //    EXTÉRIEUR A LIEU ICI » dans `etape-14-execution.ts`. Le signal est
        //    donc posé JUSTE APRÈS le retour de l'adaptateur, dans le même
        //    `await`, sans qu'aucun chemin ne puisse s'insérer entre les deux.
        //
        // ⚠️ POURQUOI ICI, ET NON APRÈS `etapeExecution`. Tout ce qui suit le
        //    retour de l'adaptateur — vérification de contrat, masquage,
        //    cascade de compaction, refus `result_too_large` — se passe dans un
        //    monde où l'effet EST DÉJÀ PARTI. Un signal posé après l'étape 14
        //    serait sauté par chacune de ces sorties, et la ligne dirait de
        //    nouveau qu'il ne s'est rien passé.
        //
        // ⚠️ IL EST CONDITIONNÉ PAR `estEffetExterieur`, JAMAIS PAR `effect ===
        //    "send"`. Le test du § 20 vit chez son propriétaire sous forme de
        //    `switch` exhaustif ; le recopier ici laisserait `destructive`
        //    dehors le jour où quelqu'un ne relit qu'une des deux listes.
        executer: async () => {
          const charge = await dependances.appelAdaptateur(contexte, limites.entree);
          if (estEffetExterieur(outil.effect)) signalerEffetExterieur();
          return charge;
        },
        masquage: dependances.fabriqueMasquage(identite.habilitations, outil),
        maxBytes: outil.maxBytes,
        compaction: outil.compaction,
      });

      // ═══ L'ÉTAPE 14 A RENDU — ADR 0021, ET LE FAIT SE POSE ICI ═════════════
      //
      // ⚠️ AVANT TOUTE BRANCHE, ET C'EST TOUT L'ENJEU. Ce qui suit — refus
      //    `result_too_large`, marquage de provenance, construction du succès —
      //    se passe dans un monde où le handler a rendu la main. Poser le fait
      //    dans chacune de ces branches aurait été autant d'occasions de
      //    l'oublier : c'est le motif du cliquet de l'ADR 0017, appliqué au fait
      //    voisin.
      terminaisonRendue = true;

      if (v14.issue === "refuse") {
        // ⚠️ L'EFFET A DÉJÀ EU LIEU. Le refus porte sur ce qui SORT, pas sur ce
        //    qui s'est passé. L'idempotence se ferme en `done` — non plus par
        //    cette affectation-ci, mais par `issueDeReservation()` dans le
        //    `finally`, qui lit le CLIQUET et ce `terminaisonRendue`. La règle
        //    n'a pas changé ; elle a cessé d'être écrite sur une seule branche.
        issueDeLIntention = "done";
        return refuserDepuis(v14);
      }

      issueDeLIntention = "done";
      franchir(v14.etape);

      // ── LE MARQUAGE DE PROVENANCE — APRÈS l'étape 14, sur le RÉSULTAT ─────
      //
      // § 20 : c'est le RÉSULTAT qui marque la session, pas la demande. Le test
      // « quelles classes marquent » est DÉRIVÉ par `marquerResultat`, jamais
      // réécrit ici.
      marquerResultat(dependances.index, {
        sessionId: identite.sessionId,
        adapterId: outil.adapterId,
        dataClass: outil.dataClass,
        empreintes: dependances.empreintesDuResultat(v14.etabli),
      });

      return {
        genre: "succès",
        valeur: { genre: "exécuté", execution: v14.etabli, trace: tracer() },
        outcome: v14.etabli.outcome,
        recordIds: v14.etabli.recordIds,
        partialSources: v14.etabli.partialSources,
      } satisfies Succes<ChargeServie>;
    } catch (erreur: unknown) {
      // ⚠️ **PLUS AUCUNE ISSUE D'IDEMPOTENCE N'EST AFFECTÉE ICI — ADR 0021.**
      //    C'est cette ligne, jumelée au ternaire du `finally`, qui rendait un
      //    envoi PARTI rejouable : `failed` est le seul statut que `reserver()`
      //    reprend. Ce qui reste est l'issue d'INTENTION, qui n'est pas la même
      //    question et n'a jamais commandé de rejeu.
      issueDeLIntention = "failed";

      // ═══ § 15 — L'AMONT INJOIGNABLE EST UN REFUS NOMMÉ, PAS UNE EXCEPTION ══
      //
      // ⚠️ **CE CODE N'AVAIT AUCUN ÉMETTEUR DE PRODUCTION.** Le § 15 énumère
      //    `upstream_unavailable` — « Adaptateur ou API tierce injoignable. Dit
      //    lequel, et si c'est transitoire » — et le socle rendait toute panne
      //    d'amont sous `decision: "interrompu"`, c'est-à-dire « aucune décision
      //    n'a été atteinte ». C'est faux : le socle SAIT ce qui s'est passé, il
      //    sait de quel adaptateur il s'agit, et il sait que réessayer a un sens.
      //    Le taire rangeait toute panne de réseau d'un tiers parmi les défauts
      //    du socle dans la métrique du § 24 — et une métrique vide ressemble à
      //    une métrique sans incident.
      //
      // ⚠️ **NI L'ISSUE D'IDEMPOTENCE NI CELLE D'INTENTION NE CHANGENT.**
      //    `issueDeLIntention` vient d'être posée à `failed` juste au-dessus, et
      //    `issueDeReservation()` du `finally` ne lit que le CLIQUET de
      //    l'ADR 0017 et `terminaisonRendue` — tous deux inchangés, puisque
      //    l'adaptateur a levé. Un envoi PARTI dont l'aval lève reste donc fermé
      //    en `done` : ce refus NOMME la panne, il ne rouvre aucun rejeu.
      //
      // ⚠️ **L'`outcome` RESTE `erreur`.** `core/audit/vocabulaire.ts` l'écrit
      //    déjà — « `erreur` — incompactable (`result_too_large`), amont
      //    injoignable, ou exception » — et `issue()` le dérive pour tout refus
      //    prononcé À l'étape 14. Le vocabulaire était juste avant qu'un
      //    émetteur n'existe ; c'est la dérivation qui manquait, pas le mot.
      const amont = estAmontInjoignable(erreur);
      if (amont.injoignable) {
        return refuserDepuis({
          issue: "refuse",
          etape: ETAPE_EXECUTION.numero,
          code: CODE_AMONT_INJOIGNABLE,
          // ⚠️ NI LE MESSAGE DE L'ERREUR, NI SA PILE, NI HÔTE NI URL : ils
          //    portent couramment une adresse d'infrastructure, parfois un
          //    secret. Le refus ne rend que l'`adapterId`, que le socle connaît
          //    déjà, et le code SYSTÈME, qui est un mot d'une liste fermée.
          message:
            `L'adaptateur « ${outil.adapterId} » n'a pas pu être joint pour ` +
            `« ${appel.nomComplet} » (${amont.codeSysteme ?? "code système inconnu"}). ` +
            "C'est une panne de JOIGNABILITÉ, donc a priori TRANSITOIRE : rien n'indique " +
            "que l'appel soit malformé, et aucune étape ne l'a refusé. Réessayer plus " +
            "tard ; si la panne dure, vérifier l'état de cet adaptateur depuis la console. " +
            "⚠️ Un effet extérieur a PEUT-ÊTRE eu lieu avant la coupure : le socle ne peut " +
            "pas le savoir, et la clé d'idempotence de cet appel reste donc verrouillée " +
            "pour un outil à effet extérieur (§ 20).",
        });
      }

      throw erreur;
    } finally {
      // ═══════════════════════════════════════════════════════════════════════
      //  LES DEUX CLÔTURES, ET L'ORDRE DE PRIORITÉ ENTRE ELLES
      // ═══════════════════════════════════════════════════════════════════════
      //
      // ⚠️ CETTE PHRASE ÉTAIT FAUSSE, ET ELLE ÉTAIT ÉCRITE ICI : « les deux
      //    clôtures ont lieu QUOI QU'IL ARRIVE ». Les deux appels étaient
      //    séquentiels et le PREMIER n'était pas protégé : si
      //    `intention.apresEffet` levait — ce que son contrat interdit, ce qu'un
      //    port réel fera le jour où il écrit en base —, `cloturerLimites`
      //    n'était JAMAIS atteint et la réservation restait `in_flight`.
      //
      //    La conséquence était fail-closed — la clé demeure verrouillée jusqu'au
      //    TTL, donc aucun rejeu ne double l'effet —, et c'est pourquoi ce
      //    n'était pas une porte ouverte. Mais une phrase fausse sur un `finally`
      //    est précisément ce qui fait supprimer la garde suivante, et
      //    `INTENTION_NON_ARMEE` sera un jour remplacée par un port qui écrit.
      //
      // L'ORDRE EXPRIME LA PRIORITÉ RÉELLE : la réservation d'idempotence est ce
      // qui empêche un SECOND effet extérieur ; l'intention n'est qu'un signal.
      //
      // ⚠️ LA PANNE D'INTENTION EST ABSORBÉE, ET CE N'EST PAS UN SILENCE. Une
      //    ligne d'intention qui reste ouverte EST l'alarme — c'est le mécanisme
      //    même décrit en tête de ce fichier : « une intention non close doit
      //    être le SIGNAL, pas le bruit de fond ». La relancer depuis un
      //    `finally` remplacerait, par la sémantique du langage, l'exception ou
      //    le retour déjà décidés : on masquerait la vraie panne de l'appel
      //    derrière une panne de journalisation d'intention. C'est exactement ce
      //    qu'on refuse ailleurs, et c'est pourquoi elle n'est pas relancée.
      try {
        await dependances.intention.apresEffet(ligneDIntention, issueDeLIntention);
      } catch {
        // Absorbée à dessein. La ligne d'intention reste ouverte : c'est le
        // signal, et il survit à ce bloc.
      }

      // ⚠️ BORNE ÉCRITE AVEC LA MESURE : une exception levée par la clôture
      //    d'idempotence remplace, par la sémantique de `finally`, le retour ou
      //    l'exception déjà décidés. Un appel exécuté avec succès dont la
      //    réservation ne peut pas être close devient donc un « interrompu » —
      //    avec sa ligne d'`ops_audit`, l'invariant tient, mais le journal dira
      //    « erreur » d'un appel dont l'effet a bien eu lieu. C'est le choix
      //    fail-closed : une clôture silencieusement ratée laisserait une clé
      //    verrouillée jusqu'au TTL sans que rien ne le dise, ce qui est pire.
      //    À reconsidérer le jour où la ligne d'INTENTION est armée : elle
      //    porterait alors, seule, cette distinction.
      // ═══ L'ISSUE D'IDEMPOTENCE SE DÉRIVE — ADR 0021, ET LE TERNAIRE A DISPARU
      //
      // ⚠️ CE QUI SE TROUVAIT ICI : `issue: issueDeLEffet === "done" ? "done" :
      //    "failed"`. Une variable à trois valeurs, écrasée en deux au point
      //    d'usage — donc une décision qu'on ne prenait pas. « interrompu » y
      //    devenait « failed », et `failed` est le seul statut que `reserver()`
      //    reprend : un envoi PARTI dont la compaction, le masquage, le marquage
      //    de provenance ou cette clôture-ci levait redevenait rejouable.
      //
      // ⚠️ CE QUI DÉCIDE MAINTENANT : le CLIQUET de l'ADR 0017, **LU**. Il vaut
      //    `true` dès que l'adaptateur a rendu sur un effet extérieur — le socle
      //    SAIT déjà, à cet instant précis, que quelque chose est sorti ; il ne
      //    le lisait pas. Le lecteur ne peut ni lever ni baisser le cliquet : il
      //    est sans argument et rend un booléen.
      //
      // ⚠️ ET LE JOURNAL PEUT DIVERGER DE L'IDEMPOTENCE SUR UN MÊME APPEL —
      //    `externalEffect: false` avec une clé fermée en `done`, quand
      //    l'adaptateur lève APRÈS avoir envoyé. Ce n'est pas une contradiction :
      //    le premier dit ce que le socle A VU, le second ce qu'il REFUSE DE
      //    PARIER. Le § 24 doit lire les deux, et un tableau de bord qui n'en lit
      //    qu'un reste faux.
      await cloturerLimites({
        depotIdempotence: dependances.depotIdempotence,
        resultat: limites,
        issue: issueDeReservation({
          effetExterieurSurvenu: effetExterieurSurvenu(),
          terminaisonRendue,
          // L'`effect` ÉPINGLÉ de `ops_tool` (§ 20, règle d'épinglage), jamais
          // celui qu'un manifeste vient d'annoncer.
          effetDeclare: outil.effect,
        }),
        resultRef: null,
        maintenant: dependances.maintenant(),
      });
    }
  };

  const journalise = await avecJournal<ChargeServie>(dependances.journal, entete, corps);

  return { ...journalise, refus: refusDetaille, trace: tracer() };
}

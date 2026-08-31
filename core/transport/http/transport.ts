/**
 * `core/transport/http/transport.ts` — **LE TRANSPORT, SANS SOCKET.**
 *
 * ═══ CE QUE CE FICHIER EST ═══
 *
 * Le seul chemin par lequel une requête HTTP atteint le noyau du socle. Il tient
 * l'ORDRE — étape 1, puis 2, 3, 4, puis le corps, puis l'enveloppe, puis le
 * noyau — et il ne décide de rien d'autre : les dix étapes restantes
 * appartiennent à `orchestrerAppel`, qu'il reçoit sous la forme d'un
 * {@link NoyauUnique} et qu'il n'importe pas.
 *
 * ═══ LES TROIS INTERDITS DE CONSTRUCTION DE L'ADR 0025, ET OÙ ILS SE TIENNENT ═══
 *
 *  1. **Un transport ne peut pas fabriquer une identité.** Ce fichier n'écrit
 *     aucun littéral d'identité : il appelle `identiteHttp()`, qui exige une
 *     {@link LigneOpsTokenRelue} — dont le `sessionId` est un type marqué que
 *     seul `core/identite/` sait frapper. Une chaîne venue du réseau ne compile
 *     pas.
 *  2. **Un transport n'importe aucun module d'étape.** L'ensemble interdit est
 *     DÉRIVÉ d'`EXECUTANTS_ETAPES` par `imports.temoin.spec.ts`, jamais listé.
 *  3. **La couverture est vérifiée au démarrage.** {@link creerTransportHttp}
 *     appelle `exigerLaCouvertureAmont()`, qui LÈVE si une étape « HTTP seul »
 *     n'a pas d'exécutant nommé dans ce dossier — donc dans le conteneur, pas
 *     seulement en CI.
 *
 * ═══ L'ORDRE EST TENU PAR LA SIGNATURE, PAS PAR UN COMMENTAIRE ═══
 *
 * `RequeteHttp.lireLeCorps` est une **fonction**, jamais une chaîne déjà lue.
 * Tant que les étapes 1 à 4 n'ont pas rendu leur verdict, il n'y a
 * littéralement rien à analyser : le § 11 dit « avant tout traitement », et une
 * signature qui ne peut pas donner le corps le tient mieux qu'une consigne.
 * `transport.spec.ts` compte les invocations de cette fonction sur un hôte
 * refusé et sur un jeton refusé — zéro dans les deux cas, ou la garde rougit.
 *
 * ⚠️ **CE QUE CES TROIS INTERDITS NE COUVRENT PAS, ÉCRIT AVEC EUX.** Aucun ne
 *    voit un transport qui appellerait bien le noyau mais lui MENTIRAIT sur ce
 *    que les étapes 1 à 4 ont établi. C'est pourquoi ce fichier confronte
 *    {@link EtapesEtabliesEnAmont} à la colonne du transport AVANT d'appeler le
 *    noyau, et refuse en `internal` sur tout écart : « l'écart entre les deux
 *    est une ANOMALIE, jamais un défaut toléré » (`core/transport/contrat.ts`).
 */

import { randomUUID } from "node:crypto";

import { APPEL_STEPS } from "../../types.js";
import type { AppelStep, ErrorCode, Habilitations, OpsScope } from "../../types.js";
import { CHEMIN_DE_LA_RESSOURCE_MCP } from "../../auth/ressource.js";
import { colonneDuTransport, identiteHttp } from "../../chaine/orchestrateur.js";
import type { ResultatAppel } from "../../chaine/orchestrateur.js";
import type { EtapesEtabliesEnAmont, NoyauUnique } from "../contrat.js";
import { ETAPE_HOTE, franchirLAmont, JOURNAL_AMONT_NON_ARME } from "./amont.js";
import type {
  DefiDAuthentification,
  JournalDesRefusEnAmont,
  ReglagesAmont,
  TraceAmont,
} from "./amont.js";
import { exigerLaCouvertureAmont, verifierLAmontEtabli } from "./couverture.js";
import { CODES_JSON_RPC, VERSION_JSON_RPC, lireLEnveloppe } from "./enveloppe.js";
import type { IdJsonRpc } from "./enveloppe.js";
import type { RegistreDesJetons, VerificateurDeJeton } from "./jeton.js";
import { porteurDeLAutorisation } from "./jeton.js";
import {
  DELAI_DE_REPRISE_NON_DECLARE,
  STATUT_CHEMIN_INCONNU,
  STATUT_ENVELOPPE_INVALIDE,
  STATUT_ERREUR_INTERNE,
  STATUT_METHODE_INCONNUE,
  STATUT_SUCCES,
  defiWwwAuthenticate,
  statutDuRefus,
  valeurRetryAfter,
  verifierAucuneFuite,
} from "./reponse.js";
import type {
  LectureDuDelaiDeReprise,
  ReponseHttp,
  ValeurSensible,
  VerdictDeFuite,
} from "./reponse.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE CONTRAT DE ROUTE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `POST /api/mcp` — **le chemin est DÉRIVÉ de l'ADR 0026, jamais réécrit.**
 * `core/auth/ressource.ts` en est le propriétaire : c'est le chemin qui entre
 * dans l'audience, et deux écritures divergentes rendraient l'étape 3 fausse
 * sans qu'une ligne bouge.
 */
export const CHEMIN_MCP = CHEMIN_DE_LA_RESSOURCE_MCP;

/** La seule méthode HTTP servie sur ce chemin (§ 11). */
export const METHODE_MCP = "POST";

/**
 * Le code JSON-RPC d'un refus prononcé par la chaîne du socle.
 *
 * ⚠️ **IL NE REMPLACE PAS LE CODE DU § 15, IL LE PORTE.** JSON-RPC 2.0 réserve
 *    `-32000` à `-32099` aux erreurs définies par l'implémentation ; le code du
 *    § 15, lui, voyage dans `error.data.code`. Les confondre reviendrait à
 *    inventer treize codes JSON-RPC et à en faire une seconde énumération, que
 *    `ERROR_CODES` ne gouvernerait pas.
 */
export const CODE_JSON_RPC_REFUS_DU_SOCLE = -32000;

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI ENTRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE REQUÊTE, TELLE QUE LE TRANSPORT LA VOIT.
 *
 * ⚠️ `lireLeCorps` EST UNE FONCTION, ET C'EST L'INTERDIT DE L'ÉTAPE 1. Voir
 *    l'en-tête de ce fichier.
 */
export interface RequeteHttp {
  readonly methode: string;
  /** Le chemin SEUL, sans requête ni fragment. */
  readonly chemin: string;
  /** Les en-têtes, en minuscules — c'est ainsi que Node les livre. */
  readonly entetes: Readonly<Record<string, string | undefined>>;
  readonly lireLeCorps: () => Promise<string>;
}

/** § 19 bis — le pont d'identité. Le socle CALCULE les habilitations. */
export interface PontDIdentite {
  habilitations(principal: string, scopes: readonly OpsScope[]): Habilitations;
}

/** Les réglages, établis une fois au démarrage (ADR 0023). */
export interface ReglagesTransportHttp extends ReglagesAmont {
  /**
   * Le budget d'un appel, en millisecondes. C'est lui qui produit la `deadline`.
   *
   * 🔴 **AUCUNE VALEUR PAR DÉFAUT, ET C'EST UN ÉCART SIGNALÉ.** Le cahier des
   *    charges ne fixe aucun budget d'appel : le § 13 borne des TAILLES, le
   *    § 12 borne des débits, aucun ne borne une DURÉE. En inventer une ici
   *    reviendrait à décider, depuis le transport, combien de temps le socle
   *    travaille — c'est-à-dire exactement ce que
   *    `ValeursFrappeesParLeTransport` interdit à l'appelant de décider, refait
   *    par le socle sans que personne l'ait tranché. Le réglage est donc
   *    OBLIGATOIRE, et {@link creerTransportHttp} refuse une valeur qui n'est
   *    pas un entier fini strictement positif.
   */
  readonly budgetMs: number;
}

/** Ce que le transport attend des autres, et qu'il ne fait pas. */
export interface DependancesTransportHttp {
  readonly verificateurDeJeton: VerificateurDeJeton;
  readonly registreDesJetons: RegistreDesJetons;
  readonly pontDIdentite: PontDIdentite;
  /** L'orchestrateur, reçu — jamais importé (interdit de construction n° 2). */
  readonly noyau: NoyauUnique;
  /** L'horloge, injectée pour que la `deadline` soit mesurable. */
  readonly maintenant?: () => Date;
  /** ADR 0025, § 11 — non armé par défaut. Voir `JOURNAL_AMONT_NON_ARME`. */
  readonly journalDesRefus?: JournalDesRefusEnAmont;
  /** § 15 — non déclaré par défaut. Voir `DELAI_DE_REPRISE_NON_DECLARE`. */
  readonly delaiDeReprise?: LectureDuDelaiDeReprise;
}

/** Levée à la construction. Le transport ne se monte pas sur un réglage absurde. */
export class ErreurReglageDuTransport extends Error {
  public constructor(message: string) {
    super(`core/transport/http — réglage refusé : ${message}`);
    this.name = "ErreurReglageDuTransport";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI SORT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce qu'un traitement a MESURÉ. Des nombres et des noms, jamais une couleur. */
export interface TraceDeTraitement {
  /** FRAPPÉ ici. Jamais lu dans un en-tête ni dans l'`id` de l'enveloppe. */
  readonly requestId: string;
  /** L'échéance CALCULÉE, et le budget qui a servi. Annoncés, pas supposés. */
  readonly deadline: Date | null;
  readonly budgetMs: number;
  /** Le corps a-t-il été LU ? C'est la mesure de l'ordre de l'étape 1. */
  readonly corpsLu: boolean;
  /** `null` quand rien n'a été confronté — cas qui ne devrait pas exister. */
  readonly amont: TraceAmont | null;
  /** L'écart entre étapes exécutées et étapes dues. Vide = aucune anomalie. */
  readonly anomaliesDAmont: readonly string[];
  /** Le noyau a-t-il été appelé ? Une seule fois, ou pas du tout. */
  readonly appelsAuNoyau: number;
  readonly fuite: VerdictDeFuite;
  /** § 15 — un `429` sans `Retry-After` est un écart, et il se compte. */
  readonly retryAfterAbsentSur429: boolean;
}

/** Le résultat d'un traitement : la réponse, ET ce qui a été mesuré pour la produire. */
export interface TraitementHttp {
  readonly reponse: ReponseHttp;
  readonly trace: TraceDeTraitement;
}

/** Le transport monté. Une seule opération, et elle ne tient aucun état. */
export interface TransportHttp {
  traiter(requete: RequeteHttp): Promise<TraitementHttp>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES VALEURS SENSIBLES D'UNE REQUÊTE
// ═════════════════════════════════════════════════════════════════════════════

/** Au-delà, on cesse de collecter : une charge utile n'est pas un inventaire. */
const MAX_ARGUMENTS_CONFRONTES = 64;
/** Profondeur maximale du parcours d'`input`. Une charge cyclique ne boucle pas. */
const PROFONDEUR_MAX_ARGUMENTS = 8;

/**
 * COLLECTE LES CHAÎNES D'UN `input`, POUR LES CONFRONTER À LA RÉPONSE.
 *
 * ⚠️ **CE N'EST PAS UNE INSPECTION DE CONTENU, C'EST L'INVERSE.** On ne demande
 *    pas « cette valeur est-elle personnelle ? » — question à laquelle personne
 *    ne sait répondre — mais « cette valeur-CI, que l'appelant vient d'envoyer,
 *    est-elle ressortie dans la réponse ? ». C'est exactement répondable, et
 *    c'est ce que le § 15 interdit.
 *
 * ⚠️ Le NOM D'OUTIL n'en fait volontairement pas partie : le § 15 exige au
 *    contraire que `tool_disabled` « dise qu'il existe, et où l'activer ». Le
 *    confronter ferait rougir la garde sur le comportement prescrit.
 */
function chainesDeLInput(valeur: unknown, profondeur: number, sortie: string[]): void {
  if (sortie.length >= MAX_ARGUMENTS_CONFRONTES || profondeur > PROFONDEUR_MAX_ARGUMENTS) return;
  if (typeof valeur === "string") {
    sortie.push(valeur);
    return;
  }
  if (Array.isArray(valeur)) {
    for (const element of valeur) chainesDeLInput(element, profondeur + 1, sortie);
    return;
  }
  if (typeof valeur === "object" && valeur !== null) {
    for (const membre of Object.values(valeur as Readonly<Record<string, unknown>>)) {
      chainesDeLInput(membre, profondeur + 1, sortie);
    }
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES CORPS DE RÉPONSE
// ═════════════════════════════════════════════════════════════════════════════

function corpsDErreurJsonRpc(
  id: IdJsonRpc,
  codeJsonRpc: number,
  message: string,
  donnees: Readonly<Record<string, unknown>> | null,
): string {
  return JSON.stringify({
    jsonrpc: VERSION_JSON_RPC,
    id,
    error:
      donnees === null
        ? { code: codeJsonRpc, message }
        : { code: codeJsonRpc, message, data: donnees },
  });
}

/**
 * LE CORPS D'UN SUCCÈS.
 *
 * ⚠️ `ligne.seq` EST UN `bigint`, ET `JSON.stringify` LÈVE DESSUS. Le convertir
 *    n'est pas une commodité : sans cela, tout appel réussi terminerait en
 *    `internal`, et la panne n'apparaîtrait qu'au premier appel qui va jusqu'au
 *    bout — c'est-à-dire jamais en test unitaire de refus.
 *
 * 🔴 **ÉCART SIGNALÉ : LA FORME DU `result` N'EST PAS CELLE DE MCP.** Le § 11
 *    note lui-même que « la révision courante de la spécification MCP doit être
 *    relue au lot 1 » et que ni ce document ni le cahier des charges du 29 août
 *    ne font autorité sur un numéro de révision. Servir ici un `content[]` de
 *    l'une des révisions serait la recopier sans l'avoir lue. Le corps porte
 *    donc la charge du socle, et les valeurs de service sous le préfixe `ops/`.
 */
function corpsDeSucces(id: IdJsonRpc, resultat: ResultatAppel, requestId: string): string {
  const charge = resultat.terminaison;
  const servie: unknown =
    charge.genre === "succès" && charge.valeur.genre === "exécuté"
      ? charge.valeur.execution.charge
      : null;
  return JSON.stringify({
    jsonrpc: VERSION_JSON_RPC,
    id,
    result: {
      isError: false,
      structuredContent: servie,
      _meta: {
        "ops/requestId": requestId,
        "ops/outcome": charge.genre === "succès" ? charge.outcome : null,
        "ops/seq": String(resultat.ligne.seq),
        "ops/etapesFranchies": resultat.trace.etapesFranchies,
      },
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE TRANSPORT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * MONTE LE TRANSPORT HTTP. **Refuse de se monter sur un socle incohérent.**
 *
 * Trois refus de construction, et chacun ferme un vert-pour-rien :
 *
 *  · la couverture des étapes amont (`exigerLaCouvertureAmont`) — une étape
 *    « HTTP seul » sans exécutant ferait servir une chaîne trouée ;
 *  · une liste blanche d'hôtes VIDE — l'étape 1 ne trouverait aucun refus à
 *    prononcer et resterait verte en ne gardant rien (ADR 0025) ;
 *  · une audience attendue vide — l'étape 3 accorderait avec un `aud` vide.
 */
export function creerTransportHttp(
  reglages: ReglagesTransportHttp,
  dependances: DependancesTransportHttp,
): TransportHttp {
  exigerLaCouvertureAmont();

  if (reglages.hotesAdmis.length === 0) {
    throw new ErreurReglageDuTransport(
      "la liste blanche d'hôtes est vide. Une liste vide est un refus de démarrer, " +
        "jamais un « tout autoriser » (§ 11, ADR 0025).",
    );
  }
  if (reglages.audienceAttendue.length === 0) {
    throw new ErreurReglageDuTransport(
      "l'audience attendue est vide : l'étape 3 accorderait avec un jeton sans audience (ADR 0026).",
    );
  }
  if (!Number.isInteger(reglages.budgetMs) || reglages.budgetMs <= 0) {
    throw new ErreurReglageDuTransport(
      "`budgetMs` doit être un entier de millisecondes strictement positif : c'est lui qui " +
        "produit la `deadline`, et une échéance déjà passée ferait abandonner tout appel.",
    );
  }

  const maintenant = dependances.maintenant ?? ((): Date => new Date());
  const journalDesRefus = dependances.journalDesRefus ?? JOURNAL_AMONT_NON_ARME;
  const delaiDeReprise = dependances.delaiDeReprise ?? DELAI_DE_REPRISE_NON_DECLARE;
  const colonne = colonneDuTransport("http");

  return {
    async traiter(requete: RequeteHttp): Promise<TraitementHttp> {
      // ⚠️ FRAPPÉ ICI, ET NULLE PART AILLEURS. Il n'est ni un paramètre, ni lu
      //    dans un en-tête, ni recopié de l'`id` JSON-RPC : un identifiant de
      //    corrélation choisi par l'appelant lui permet de faire converger deux
      //    appels dans la même ligne, ou d'en faire diverger un seul
      //    (`STATUT_DES_CANAUX_DE_CONTEXTE.requestId`).
      const requestId = randomUUID();
      let corpsLu = false;
      let amont: TraceAmont | null = null;
      let anomaliesDAmont: readonly string[] = [];
      let appelsAuNoyau = 0;
      let deadline: Date | null = null;
      let retryAfterAbsentSur429 = false;

      const sensibles: ValeurSensible[] = [];
      const hoteRecu = requete.entetes["host"];
      if (hoteRecu !== undefined) sensibles.push({ nom: "en-tête Host", valeur: hoteRecu });
      const porteur = porteurDeLAutorisation(requete.entetes["authorization"]).porteur;
      if (porteur !== null) sensibles.push({ nom: "jeton porteur", valeur: porteur });

      const sceller = (reponse: ReponseHttp): TraitementHttp => {
        const fuite = verifierAucuneFuite(reponse, sensibles);
        const trace: TraceDeTraitement = {
          requestId,
          deadline,
          budgetMs: reglages.budgetMs,
          corpsLu,
          amont,
          anomaliesDAmont,
          appelsAuNoyau,
          fuite,
          retryAfterAbsentSur429,
        };
        if (fuite.fuites.length === 0) return { reponse, trace };
        // FAIL-CLOSED. Perdre un message d'aide coûte moins qu'un porteur ou un
        // jeton de confirmation renvoyé dans un corps d'erreur (§ 15, § 20).
        return {
          reponse: {
            statut: STATUT_ERREUR_INTERNE,
            entetes: { "content-type": "application/json" },
            corps: corpsDErreurJsonRpc(
              null,
              CODES_JSON_RPC.erreurInterne,
              "Réponse retenue : elle portait une valeur de la requête. " +
                "Identifiant de corrélation à donner au support.",
              { code: "internal", requestId, valeursRetenues: fuite.fuites },
            ),
          },
          trace,
        };
      };

      try {
        // ══ ÉTAPES 1 À 4, ET RIEN AVANT ═══════════════════════════════════
        const reglagesAmont: ReglagesAmont = {
          hotesAdmis: reglages.hotesAdmis,
          audienceAttendue: reglages.audienceAttendue,
        };
        const etabli = await franchirLAmont(
          { hote: hoteRecu, autorisation: requete.entetes["authorization"] },
          reglagesAmont,
          {
            verificateurDeJeton: dependances.verificateurDeJeton,
            registreDesJetons: dependances.registreDesJetons,
            journalDesRefus,
          },
        );
        amont = etabli.trace;

        if (etabli.genre === "refus") {
          return sceller(reponseDeRefusAmont(etabli.etape, etabli.code, etabli.defi, etabli.motif));
        }

        // ══ LA ROUTE — APRÈS l'étape 1, jamais avant ══════════════════════
        // ⚠️ L'ORDRE EST UNE DÉCISION : un `404` servi avant l'étape 1 dirait à
        //    un hôte non autorisé quelles routes existent. Le § 11 veut que rien
        //    ne soit traité avant l'anti DNS-rebinding, et une carte des routes
        //    est un traitement comme un autre.
        if (requete.chemin !== CHEMIN_MCP) {
          return sceller({
            statut: STATUT_CHEMIN_INCONNU,
            entetes: { "content-type": "application/json" },
            corps: corpsDErreurJsonRpc(
              null,
              CODES_JSON_RPC.methodeInconnue,
              `Chemin inconnu. La ressource MCP est servie sur « ${CHEMIN_MCP} ».`,
              null,
            ),
          });
        }
        if (requete.methode !== METHODE_MCP) {
          return sceller({
            statut: STATUT_METHODE_INCONNUE,
            entetes: { "content-type": "application/json", allow: METHODE_MCP },
            corps: corpsDErreurJsonRpc(
              null,
              CODES_JSON_RPC.requeteInvalide,
              `Méthode HTTP refusée. Seul « ${METHODE_MCP} » est servi sur « ${CHEMIN_MCP} ».`,
              null,
            ),
          });
        }

        // ══ LE CORPS — LU MAINTENANT, ET PAS PLUS TÔT ═════════════════════
        const corpsBrut = await requete.lireLeCorps();
        corpsLu = true;

        const enveloppe = lireLEnveloppe(corpsBrut);
        if (enveloppe.genre === "refus") {
          return sceller({
            statut: STATUT_ENVELOPPE_INVALIDE,
            entetes: { "content-type": "application/json" },
            corps: corpsDErreurJsonRpc(
              enveloppe.id,
              enveloppe.codeJsonRpc,
              enveloppe.message,
              null,
            ),
          });
        }

        // Les valeurs de protocole de l'appel rejoignent les valeurs sensibles.
        // ⚠️ LE JETON DE CONFIRMATION Y EST NOMMÉMENT : le § 20 interdit qu'il
        //    reparaisse dans une réponse d'erreur, et c'est le seul endroit du
        //    socle qui puisse le vérifier — il n'existe qu'ici.
        if (enveloppe.appel.jetonDeConfirmation !== null) {
          sensibles.push({
            nom: "jeton de confirmation",
            valeur: enveloppe.appel.jetonDeConfirmation,
          });
        }
        if (enveloppe.appel.idempotencyKey !== null) {
          sensibles.push({ nom: "clé d'idempotence", valeur: enveloppe.appel.idempotencyKey });
        }
        if (enveloppe.appel.curseur !== null) {
          sensibles.push({ nom: "curseur", valeur: enveloppe.appel.curseur });
        }
        const arguments_: string[] = [];
        chainesDeLInput(enveloppe.appel.input, 0, arguments_);
        arguments_.forEach((valeur, rang) => {
          sensibles.push({ nom: `argument n° ${String(rang + 1)}`, valeur });
        });

        // ══ CE QUE LE TRANSPORT A ÉTABLI, CONFRONTÉ À CE QU'IL DEVAIT ═════
        const etablies: EtapesEtabliesEnAmont = {
          transport: "http",
          etapesExecutees: etabli.trace.etapesFranchies,
          etapesDues: colonne.etapesAmont,
          refusEnAmont: null,
        };
        anomaliesDAmont = verifierLAmontEtabli(etablies);
        if (anomaliesDAmont.length > 0) {
          return sceller({
            statut: STATUT_ERREUR_INTERNE,
            entetes: { "content-type": "application/json" },
            corps: corpsDErreurJsonRpc(
              enveloppe.id,
              CODES_JSON_RPC.erreurInterne,
              "Le transport n'a pas établi ce que la colonne du § 11 lui attribue. " +
                "Identifiant de corrélation à donner au support.",
              { code: "internal", requestId },
            ),
          });
        }

        // ══ L'IDENTITÉ — assemblée, jamais fabriquée ══════════════════════
        deadline = new Date(maintenant().getTime() + reglages.budgetMs);
        const identite = identiteHttp({
          jeton: etabli.jeton,
          scopes: etabli.scopes,
          habilitations: dependances.pontDIdentite.habilitations(
            etabli.jeton.principal,
            etabli.scopes,
          ),
          requestId,
          deadline,
        });

        // ══ LE NOYAU — les dix étapes restantes, et le journal ════════════
        appelsAuNoyau += 1;
        const resultat = await dependances.noyau(identite, enveloppe.appel);

        if (resultat.refus !== null) {
          const statut = statutDuRefus(resultat.refus.etape);
          const entetes: Record<string, string> = { "content-type": "application/json" };
          if (resultat.refus.etape === ETAPE_QUOTA) {
            const secondes = delaiDeReprise(resultat.refus.etape, resultat.refus.message);
            const valeur = secondes === null ? null : valeurRetryAfter(secondes);
            if (valeur === null) retryAfterAbsentSur429 = true;
            else entetes["retry-after"] = valeur;
          }
          return sceller({
            statut,
            entetes,
            corps: corpsDErreurJsonRpc(
              enveloppe.id,
              CODE_JSON_RPC_REFUS_DU_SOCLE,
              resultat.refus.message,
              {
                code: resultat.refus.code,
                stepDenied: resultat.refus.etape,
                requestId,
              },
            ),
          });
        }

        return sceller({
          statut: STATUT_SUCCES,
          entetes: { "content-type": "application/json" },
          corps: corpsDeSucces(enveloppe.id, resultat, requestId),
        });
      } catch {
        // ⚠️ LA CAUSE N'EST NI LUE, NI RENDUE, NI JOURNALISÉE ICI. Le § 15 :
        //    « internal — le reste. Dit un identifiant de corrélation, JAMAIS
        //    UNE TRACE DE PILE. » Un message d'exception porte régulièrement une
        //    valeur d'appel, un chemin de fichier ou une chaîne de connexion ;
        //    la variable n'est même pas liée, pour qu'il n'y ait rien à
        //    recopier par mégarde.
        return sceller({
          statut: STATUT_ERREUR_INTERNE,
          entetes: { "content-type": "application/json" },
          corps: corpsDErreurJsonRpc(
            null,
            CODES_JSON_RPC.erreurInterne,
            "Erreur interne. Donner cet identifiant de corrélation au support.",
            { code: "internal", requestId },
          ),
        });
      }
    },
  };
}

/**
 * LE NUMÉRO DE L'ÉTAPE DE QUOTA, **LU DANS `APPEL_STEPS`**.
 *
 * ⚠️ ON NE RECONNAÎT PAS LE QUOTA À SON STATUT `429`, ON LE RECONNAÎT À SON
 *    NUMÉRO. Écrire `if (statut === 429)` ferait porter `Retry-After` à toute
 *    étape qui gagnerait ce statut demain — et, si la clé « quota » disparaissait
 *    du § 11, la comparaison retomberait sur `200` et poserait l'en-tête sur
 *    TOUTE réponse. Un numéro absent lève ici, au chargement du module.
 */
function numeroDeLEtapeDeQuota(): AppelStep {
  const quota = APPEL_STEPS.find((etape) => etape.cle === "quota");
  if (quota === undefined) {
    throw new Error("§ 11 — aucune étape ne porte la clé « quota » dans APPEL_STEPS");
  }
  return quota.numero;
}

/** § 11, étape 12 — la seule qui porte un `Retry-After`. */
const ETAPE_QUOTA = numeroDeLEtapeDeQuota();

/** La réponse d'un refus prononcé par les étapes 1 à 4. */
function reponseDeRefusAmont(
  etape: AppelStep,
  code: ErrorCode | null,
  defi: DefiDAuthentification | null,
  motif: string,
): ReponseHttp {
  const statut = statutDuRefus(etape);
  const entetes: Record<string, string> = { "content-type": "application/json" };
  if (defi !== null) entetes["www-authenticate"] = defiWwwAuthenticate(defi);

  return {
    statut,
    entetes,
    corps: corpsDErreurJsonRpc(
      null,
      CODE_JSON_RPC_REFUS_DU_SOCLE,
      etape === ETAPE_HOTE
        ? "Hôte non autorisé."
        : `Authentification refusée : ${motif}. Se ré-authentifier auprès de l'émetteur.`,
      { code, stepDenied: etape },
    ),
  };
}

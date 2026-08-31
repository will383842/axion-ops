/**
 * `ops/service.ts` — **CE QUI ÉCOUTE, ET CE QUI LIT LE FIL.**
 *
 * ═══ LE MANQUE QUE CE FICHIER COMBLE ═══
 *
 * Le lot 2 s'était donné pour jalon : « après lui, le socle DÉMARRE et RÉPOND ».
 * Il a livré les deux transports, entièrement éprouvés — et **aucun module de
 * production ne les montait**. Mesuré à la recette : `creerServeurHttp`,
 * `creerTransportHttp`, `creerServeurStdio` et `brancherSurLesFlux` avaient
 * chacun ZÉRO appelant livré ; leurs seuls appelants étaient des `.spec.ts` et
 * des `fixtures.ts`, tous exclus par `tsconfig.build.json`. Le manque du lot 1d
 * — « le socle est une bibliothèque que personne ne peut appeler » — était
 * remonté d'un étage, intact.
 *
 * `ops/main.ts` reçoit `transports: readonly Transport[]`, c'est-à-dire une
 * liste de NOMS (`"http" | "stdio"`), et son étage 6 annonce `transportsMontes`.
 * Ce compte mesurait la longueur d'un tableau de chaînes. Ce fichier-ci monte
 * des OBJETS, et son propre compte les distingue.
 *
 * ═══ CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ═══
 *
 * **Il monte. Il ne décide pas.** Le noyau, le catalogue, le vérificateur de
 * jeton et le registre `ops_token` lui sont DONNÉS : il n'en fabrique aucun.
 * C'est l'interdit n° 1 de l'ADR 0025 vu depuis la composition — un montage qui
 * fabriquerait une identité, une audience ou un budget déciderait à la place des
 * étapes.
 *
 * ⚠️ **`appelsDOutilsAcceptes` A ENFIN UN EXÉCUTANT, ET C'EST CE FICHIER.**
 *    Jusqu'ici ce booléen était CALCULÉ par `core/vault/demarrage.ts`, relayé par
 *    `ops/demarrage.ts`, republié par le healthcheck — et lu par PERSONNE. Un
 *    constat publié n'est pas un refus prononcé. Ici il décide : coffre
 *    verrouillé, les transports d'outils NE SONT PAS MONTÉS, et le § 23 cesse
 *    d'être éprouvé sur des étiquettes.
 *
 * ⚠️ **AUCUN APPEL SORTANT.** L'écoute est bornée à la boucle locale par défaut
 *    (`ADRESSE_DE_BOUCLE_LOCALE`), et l'exposer se demande explicitement. Les
 *    flux d'entrée et de sortie sont REÇUS : ce module ne nomme ni `process`, ni
 *    `stdin`, ni `stdout`, et peut donc être monté deux fois dans une garde.
 *
 * Voir **ADR 0023**, **ADR 0025**, **ADR 0032**, **ADR 0034**.
 */

import type { Transport } from "../core/chaine/orchestrateur.js";
import type { NoyauUnique } from "../core/transport/contrat.js";
import type {
  PontDIdentite,
  RegistreDesJetons,
  ServeurHttp,
  TransportHttp,
  VerificateurDeJeton,
} from "../core/transport/http/index.js";
import { creerServeurHttp, creerTransportHttp } from "../core/transport/http/index.js";
import type {
  AttacheAuxFlux,
  CatalogueServiEnStdio,
  FluxDEntreeStdio,
  FluxDeSortieStdio,
  ServeurStdio,
} from "../core/transport/stdio/index.js";
import {
  brancherSurLesFlux,
  creerServeurStdio,
  ecrireSurLeFlux,
} from "../core/transport/stdio/index.js";
import type { Habilitations, OpsScope } from "../core/types.js";
import type { SocleDemarre } from "./main.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE MONTAGE REÇOIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES PORTS DU SERVICE. **Aucun n'est fabriqué ici.**
 *
 * ⚠️ **`noyau` PEUT ÊTRE `null`, ET CE N'EST PAS UNE COMMODITÉ.** La chaîne des
 *    quatorze étapes exige un journal SCELLÉ par une clé du coffre (ADR 0002) ;
 *    sous coffre verrouillé, elle n'est pas composable, et un socle qui
 *    prétendrait servir des outils sans elle écrirait des appels qu'aucune ligne
 *    n'atteste. `null` veut donc dire « la chaîne n'est pas composée », et
 *    {@link monterLeService} le COMPTE plutôt que de le taire.
 */
export interface PortsDuService {
  /** LE SEUL chemin par lequel un appel d'outil atteint le socle (ADR 0025). */
  readonly noyau: NoyauUnique | null;
  readonly catalogue: CatalogueServiEnStdio;
  /** § 19 bis — CALCULÉES par le socle. Le fil ne les porte jamais. */
  readonly habilitations: () => Habilitations;
  /** § 19.2 — les scopes du poste, pour stdio. Absent vaut le défaut le plus étroit. */
  readonly scopesDuPoste?: readonly OpsScope[];
  /** Étape 2 — implémenté par l'émetteur (ADR 0001, ADR 0027). */
  readonly verificateurDeJeton: VerificateurDeJeton | null;
  /** Étape 4 — la relecture d'`ops_token`, qui porte aussi la session (ADR 0014). */
  readonly registreDesJetons: RegistreDesJetons | null;
  readonly pontDIdentite: PontDIdentite;
  /** Les flux du démon stdio. `null` des deux côtés = stdio n'est pas demandé. */
  readonly fluxDEntree: FluxDEntreeStdio | null;
  readonly fluxDeSortie: FluxDeSortieStdio | null;
  readonly maintenant: () => Date;
}

/**
 * LES RÉGLAGES, ÉTABLIS UNE FOIS AU DÉMARRAGE (ADR 0023).
 *
 * ⚠️ **NI `budgetMs` NI `octetsMaxDuCorps` N'ONT DE DÉFAUT, ET C'EST UN ÉCART
 *    SIGNALÉ.** Le § 13 borne des TAILLES de résultat, le § 12 des DÉBITS ;
 *    aucun ne borne une DURÉE d'appel ni une taille de requête. Les inventer ici
 *    reviendrait à décider, depuis le montage, combien de temps le socle
 *    travaille — exactement ce que `ValeursFrappeesParLeTransport` interdit à
 *    l'appelant. Les deux transports refusent déjà une valeur absurde ; ce
 *    module ne les choisit pas.
 */
export interface ReglagesDuService {
  /** Les colonnes du § 11 à monter. Dérivées de l'étage 6, jamais réécrites. */
  readonly transports: readonly Transport[];
  readonly hotesAdmis: readonly string[];
  readonly audienceAttendue: string;
  readonly budgetMs: number;
  readonly octetsMaxDuCorps: number;
  readonly portHttp: number;
  /** Défaut : la boucle locale. L'exposer se demande. */
  readonly adresseHttp?: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE MONTAGE REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QU'UN MONTAGE A RÉELLEMENT FAIT. **Des objets et des nombres, jamais une
 * couleur.**
 */
export interface ServiceMonte {
  /** Le transport HTTP monté, ou `null`. */
  readonly transportHttp: TransportHttp | null;
  /** Le serveur qui tient la socket, ou `null`. */
  readonly serveurHttp: ServeurHttp | null;
  readonly serveurStdio: ServeurStdio | null;
  readonly attacheStdio: AttacheAuxFlux | null;
  /**
   * Les transports RÉELLEMENT montés — des objets, pas des noms.
   *
   * ⚠️ C'est la différence avec `transportsMontes` de l'étage 6, qui compte la
   *    longueur d'un tableau de chaînes. Les deux comptes doivent coïncider ;
   *    quand ils divergent, c'est celui-ci qui dit la vérité.
   */
  readonly transportsMontes: readonly Transport[];
  /** § 23 — les appels d'outils sont-ils servis, et par quel chemin ? */
  readonly sertLesOutils: boolean;
  /**
   * Ce qui empêche de servir, nommé. Vide quand tout est monté.
   *
   * ⚠️ **CE N'EST PAS UNE LISTE D'ERREURS**, c'est une liste de FAITS : un
   *    coffre verrouillé y met une ligne, et c'est le § 23 qui s'applique, pas
   *    une panne.
   */
  readonly empechements: readonly string[];
  ecouter(): Promise<{ readonly adresse: string; readonly port: number } | null>;
  arreter(): Promise<void>;
}

/** Levée au montage. Le service ne se monte pas à moitié. */
export class ErreurDeMontageDuService extends Error {
  public constructor(message: string) {
    super(`ops/service — montage refusé : ${message}`);
    this.name = "ErreurDeMontageDuService";
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE MONTAGE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **MONTE LES TRANSPORTS D'UN SOCLE DÉMARRÉ.**
 *
 * L'ordre est la décision, comme aux sept étages :
 *
 *  1. le socle SERT-IL ? Un socle dont l'arbitre a prononcé `sert: false` n'a
 *     pas d'identité publiée, pas de healthcheck, et rien à monter ;
 *  2. les appels d'outils sont-ils ACCEPTÉS (§ 23) ? Sous coffre verrouillé, la
 *     famille de routes `outils` n'est pas servie, et aucun transport d'outils
 *     n'est monté. C'est ici, et nulle part ailleurs, que le refus est
 *     PRONONCÉ ;
 *  3. la chaîne est-elle COMPOSÉE ? Sans noyau, il n'y a rien derrière le fil.
 *
 * ⚠️ **UN EMPÊCHEMENT N'EST PAS UNE LEVÉE.** Un socle qui ne sert pas d'outils
 *    doit continuer de servir la console, le healthcheck et le déverrouillage
 *    (§ 23) : lever ici en ferait un socle mort, et le deuxième état du § 23
 *    perdrait son sens. En revanche, un transport DEMANDÉ dont il manque un port
 *    est une erreur de câblage, et celle-là LÈVE.
 */
export function monterLeService(
  socle: SocleDemarre,
  ports: PortsDuService,
  reglages: ReglagesDuService,
): ServiceMonte {
  const empechements: string[] = [];

  if (!socle.demarrage.sert) {
    empechements.push(
      "le socle ne sert pas : l'arbitre du démarrage a refusé un étage dont l'issue fait sortir " +
        "le processus. Lire les lignes de la sortie d'erreur, elles nomment le geste.",
    );
  }
  // ⚠️ **CE REFUS NE SE PRONONCE QUE SUR UN SOCLE QUI SERT**, et ce n'est pas
  //    une précaution de style. Sur un socle mort, `appelsDOutilsAcceptes` vaut
  //    `false` pour la même raison que tout le reste ; l'écrire ici ferait dire
  //    « coffre » à un refus qui vient de l'étage 3, et l'exploitant irait
  //    déverrouiller un coffre déjà ouvert. Un message qui nomme la mauvaise
  //    cause coûte plus qu'un message absent.
  if (socle.demarrage.sert && !socle.demarrage.appelsDOutilsAcceptes) {
    empechements.push(
      `§ 23 — les appels d'outils sont refusés (coffre « ${socle.demarrage.etatDuCoffre ?? "absent"} ») : ` +
        "aucun transport d'outils n'est monté. Déverrouiller depuis la console, jamais depuis " +
        "un terminal.",
    );
  }
  const noyau = ports.noyau;
  if (noyau === null) {
    empechements.push(
      "la chaîne des quatorze étapes n'est pas composée : aucun noyau n'a été remis au montage. " +
        "Un transport monté sur un noyau absent servirait des appels qu'aucune ligne d'`ops_audit` " +
        "n'atteste — le § 11 l'interdit. Composer la chaîne, puis remonter le service.",
    );
  }

  const sertLesOutils = empechements.length === 0 && noyau !== null;

  let transportHttp: TransportHttp | null = null;
  let serveurHttp: ServeurHttp | null = null;
  let serveurStdio: ServeurStdio | null = null;
  let attacheStdio: AttacheAuxFlux | null = null;
  const montes: Transport[] = [];

  if (sertLesOutils && noyau !== null) {
    if (reglages.transports.includes("http")) {
      const verificateur = ports.verificateurDeJeton;
      const registre = ports.registreDesJetons;
      // ⚠️ FAIL-CLOSED. Un transport HTTP monté sans vérificateur de jeton
      //    n'aurait aucune étape 2, et l'étape 4 n'aurait aucune ligne
      //    `ops_token` à relire : le socle servirait des appels non
      //    authentifiés en restant vert, ce que le § 19 interdit absolument.
      if (verificateur === null || registre === null) {
        throw new ErreurDeMontageDuService(
          "le transport « http » est demandé, et il lui manque " +
            `${verificateur === null ? "`verificateurDeJeton`" : ""}` +
            `${verificateur === null && registre === null ? " et " : ""}` +
            `${registre === null ? "`registreDesJetons`" : ""}. ` +
            "Les étapes 2 et 4 du § 11 n'auraient alors AUCUN exécutant.",
        );
      }
      transportHttp = creerTransportHttp(
        {
          hotesAdmis: reglages.hotesAdmis,
          audienceAttendue: reglages.audienceAttendue,
          budgetMs: reglages.budgetMs,
        },
        {
          verificateurDeJeton: verificateur,
          registreDesJetons: registre,
          pontDIdentite: ports.pontDIdentite,
          noyau,
          maintenant: ports.maintenant,
        },
      );
      serveurHttp = creerServeurHttp(transportHttp, {
        port: reglages.portHttp,
        octetsMaxDuCorps: reglages.octetsMaxDuCorps,
        ...(reglages.adresseHttp === undefined ? {} : { adresse: reglages.adresseHttp }),
      });
      montes.push("http");
    }

    if (reglages.transports.includes("stdio")) {
      const entree = ports.fluxDEntree;
      const sortie = ports.fluxDeSortie;
      if (entree === null || sortie === null) {
        throw new ErreurDeMontageDuService(
          "le transport « stdio » est demandé, et les flux ne lui ont pas été remis. Un démon " +
            "stdio qui ne lit aucun flux est le défaut exact que ce lot existe pour fermer.",
        );
      }
      serveurStdio = creerServeurStdio({
        noyau,
        catalogue: ports.catalogue,
        habilitations: ports.habilitations,
        maintenant: ports.maintenant,
        ecrire: ecrireSurLeFlux(sortie),
        ...(ports.scopesDuPoste === undefined ? {} : { scopes: ports.scopesDuPoste }),
        budgetMs: reglages.budgetMs,
      });
      // ⚠️ **C'EST CET APPEL QUI MANQUAIT, ET IL VAUT UN LOT.** `brancherSurLesFlux`
      //    était écrit, éprouvé — sérialisation prouvée par des retards
      //    décroissants, levées comptées — et le registre des coutures le portait
      //    honnêtement en `à-coudre` avec « 0 appelant de production MESURÉ ».
      attacheStdio = brancherSurLesFlux(serveurStdio, entree);
      montes.push("stdio");
    }
  }

  return {
    transportHttp,
    serveurHttp,
    serveurStdio,
    attacheStdio,
    transportsMontes: montes,
    sertLesOutils,
    empechements,
    ecouter: async (): Promise<{ readonly adresse: string; readonly port: number } | null> => {
      if (serveurHttp === null) return null;
      return serveurHttp.ecouter();
    },
    arreter: async (): Promise<void> => {
      // L'attache stdio n'a rien à fermer : elle ne détient aucune ressource, et
      // `aQuai()` attend seulement que la chaîne de service se vide.
      if (attacheStdio !== null) await attacheStdio.aQuai();
      if (serveurHttp !== null) await serveurHttp.fermer();
    },
  };
}

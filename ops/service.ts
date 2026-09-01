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
 * ⚠️ **ET IL PORTE LES DEUX PORTS D'AMONT DE L'ADR 0037 — LOT 4.** Le lot 3 a
 *    mesuré que les décisions 2 et 3 de cette ADR, marquée « Statut :
 *    acceptée », n'avaient pas atterri : `PortsDuService` n'offrait AUCUNE
 *    fente pour `journalDesRefus` ni pour `delaiDeReprise`. Le mécanisme
 *    existait des deux côtés — `franchirLAmont` appelle le journal à l'instant
 *    exact, `transport.ts` pose l'en-tête depuis le port — et la SEULE
 *    composition de production ne pouvait pas les armer, même en le voulant.
 *
 *    Le défaut a survécu à un lot entier sous une entrée de registre `cousue`
 *    VERTE À BON DROIT : la garde des coutures compte les APPELANTS DE
 *    PRODUCTION d'un symbole, et `ops/index.ts` importe bien `PortsDuService`.
 *    **Ajouter un champ à un type déjà importé ne change aucun compte
 *    d'appelants.** C'est le spécimen que l'ADR 0041 nomme, et les deux gardes
 *    de `ops/service.spec.ts` § ③ partent donc de `monterLeService`, jamais de
 *    `creerTransportHttp` : une garde qui appellerait le transport directement
 *    re-vérifierait ce qui marchait déjà.
 *
 * Voir **ADR 0023**, **ADR 0025**, **ADR 0032**, **ADR 0034**, **ADR 0037**.
 */

import type { Transport } from "../core/chaine/orchestrateur.js";
import type { FabriqueDeNoyau, NoyauUnique } from "../core/transport/contrat.js";
import type {
  JournalDesRefusEnAmont,
  LectureDuDelaiDeReprise,
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
 *
 * ⚠️ **ET C'EST UNE FABRIQUE, PAS UN NOYAU — ADR 0039.** Le champ `transport` de
 *    `DependancesOrchestrateur` fait lire à l'orchestrateur la colonne du § 11 :
 *    quelles étapes s'appliquent, lesquelles sont établies en amont, lesquelles
 *    ne s'appliquent pas du tout. Un noyau unique composé en `stdio` puis remis
 *    aux DEUX transports servirait les appels HTTP en croyant que les quatre
 *    étapes « HTTP seul » n'existent pas — et RIEN ne le verrait :
 *    `verifierCouvertureDesEtapes` boucle à l'étage 6 sur les NOMS de
 *    transports, jamais sur les noyaux montés. Ce montage appelle donc la
 *    fabrique **une fois par transport monté**, avec le nom de la colonne qu'il
 *    monte, et {@link ServiceMonte.colonnesFrappees} le COMPTE.
 */
export interface PortsDuService {
  /**
   * LE SEUL chemin par lequel un appel d'outil atteint le socle (ADR 0025), et
   * il se frappe une fois par colonne (ADR 0039).
   */
  readonly noyau: FabriqueDeNoyau | null;
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
  /**
   * § 11, étapes 1 à 4 — **LE JOURNAL DES REFUS D'AMONT, ET LA FENTE QUI
   * N'EXISTAIT PAS (ADR 0037, décision 2).**
   *
   * 🔴 **CE CHAMP EST LE SPÉCIMEN DU DÉFAUT QUE L'ADR 0041 FERME.** L'ADR 0037
   *    est marquée « Statut : acceptée » depuis le lot 3, et sa décision 2 n'a
   *    pas atterri pendant un lot entier. La garde des coutures est restée
   *    VERTE, et elle avait raison : elle mesure les APPELANTS DE PRODUCTION
   *    d'un symbole, or `PortsDuService` en avait — `ops/index.ts` l'importe.
   *    Ajouter un champ à un type déjà importé ne change AUCUN compte
   *    d'appelants. Mesuré alors : `grep -rn "journalDesRefus" ops` → **0**,
   *    `grep -rn "delaiDeReprise" ops` → **0**, contre 27 lignes des mêmes
   *    formes sous `core/transport/`. Le mécanisme existait, la fente non.
   *
   * Conséquence en service, tant que la fente manquait : les quatre refus
   * « HTTP seul » n'écrivaient AUCUNE ligne, si bien qu'une campagne de jetons
   * contre la porte était invisible — et l'objectif O6 (« 100 % des appels
   * journalisés, y compris chaque refus ») était faux.
   *
   * ⚠️ **LE CANAL EST DISTINCT D'`ops_audit`, ET IL EST NOMMÉ.** Les étapes 1 à
   *    4 précèdent le noyau par construction ; le journal du § 11 est scellé par
   *    une clé du coffre (ADR 0002) et s'écrit dans l'orchestrateur. Y verser une
   *    ligne non scellée fabriquerait un trou dans la chaîne — précisément ce que
   *    l'ADR 0002 rend détectable, et qu'on rendrait alors normal.
   *
   * ⚠️ **`null` EST UN RÉGLAGE, PAS UN OUBLI, ET IL SE COMPTE.** Le champ est
   *    OBLIGATOIRE — un champ qu'on peut omettre est un champ qu'on omet — et le
   *    montage NOMME ce qu'il n'a pas armé dans
   *    {@link ServiceMonte.portsDAmontNonArmes}. Non armé, le transport prend
   *    `JOURNAL_AMONT_NON_ARME`, qui rend `0`, et la trace d'amont annonce
   *    « 1 refus prononcé · 0 consigné ».
   */
  readonly journalDesRefus: JournalDesRefusEnAmont | null;
  /**
   * § 15, étape 12 — **CE QUI DONNE SA VALEUR AU `Retry-After` (ADR 0037,
   * décision 3).**
   *
   * Tant que cette fente manquait, **tout `429` servi par un service RÉELLEMENT
   * MONTÉ sortait sans `Retry-After`**, contre le § 11 et le § 15 : « non armé »
   * n'était pas un réglage, c'était une impossibilité.
   *
   * ⚠️ **L'EN-TÊTE VIENT D'UN PORT, JAMAIS D'UNE RELECTURE DU MESSAGE.** Le
   *    délai existe — `core/limits` le calcule — mais l'orchestrateur ne le fait
   *    franchir la frontière du noyau que dans le TEXTE FRANÇAIS du refus de
   *    l'étape 12. Un en-tête de protocole dérivé d'une phrase casse à la
   *    première reformulation, et il casse EN SILENCE.
   *
   * 🔴 **BORNE ÉCRITE AVEC LA FENTE.** L'ADR 0037 veut à terme que
   *    `RefusDetaille` porte `retryAfterSecondes` ; ce champ vit dans
   *    `core/chaine/orchestrateur.ts` et il n'est pas posé à ce jour. Le port
   *    reste donc la seule voie honnête, et la composition de production le
   *    laisse `null` : voir `ops/index.ts`, où le motif est écrit à l'endroit du
   *    `null` plutôt que caché derrière un défaut.
   */
  readonly delaiDeReprise: LectureDuDelaiDeReprise | null;
}

/**
 * LES PORTS D'AMONT QUI PEUVENT RESTER NON ARMÉS, **DÉRIVÉS DU TYPE**.
 *
 * ⚠️ `satisfies readonly (keyof PortsDuService)[]` N'EST PAS UNE COQUETTERIE :
 *    c'est ce qui fait ROUGIR LE COMPILATEUR si l'un de ces deux noms est
 *    renommé ou retiré du type. Une liste de chaînes libres serait une seconde
 *    source de vérité, et c'est la seconde qui ne suit jamais.
 */
const PORTS_DAMONT_ARMABLES = [
  "journalDesRefus",
  "delaiDeReprise",
] as const satisfies readonly (keyof PortsDuService)[];

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
  /**
   * COMBIEN DE NOYAUX LA FABRIQUE A ÉTÉ APPELÉE À FRAPPER — ADR 0039.
   *
   * ⚠️ **CE COMPTE DOIT ÉGALER `transportsMontes.length`, ET C'EST LA SEULE
   *    FAÇON DE VOIR LE DÉFAUT QUE L'ADR 0039 FERME.** Un montage qui frapperait
   *    UN noyau et le remettrait aux deux transports rendrait ici 1 pour 2
   *    transports montés — et rien d'autre, dans tout le socle, ne le dirait :
   *    la garde de couverture des étapes boucle sur les noms de transports.
   */
  readonly colonnesFrappees: number;
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
  /**
   * LES PORTS D'AMONT QUE CE MONTAGE N'A PAS ARMÉS, **NOMMÉS** — ADR 0037.
   *
   * ⚠️ **CE N'EST NI UN EMPÊCHEMENT NI UNE ANOMALIE, ET C'EST TOUT L'INTÉRÊT.**
   *    Un socle dont le journal d'amont n'est pas armé SERT quand même ; en
   *    faire un empêchement l'empêcherait de démarrer pour un canal
   *    d'observation. Mais un `null` muet est exactement la façon dont ces deux
   *    ports ont disparu pendant un lot entier. La liste est donc RENDUE et
   *    NOMMÉE, dérivée des ports reçus, jamais recopiée : un nombre seul se
   *    contemple, des noms se corrigent.
   *
   * Vide = les deux ports sont armés. `["journalDesRefus"]` = les quatre refus
   * « HTTP seul » n'écriront aucune ligne, et la trace d'amont annoncera
   * « 1 prononcé · 0 consigné ». `["delaiDeReprise"]` = tout `429` sortira sans
   * `Retry-After`, et `TraceDeTraitement.retryAfterAbsentSur429` le comptera.
   */
  readonly portsDAmontNonArmes: readonly string[];
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
  const fabriqueDuNoyau = ports.noyau;
  if (fabriqueDuNoyau === null) {
    empechements.push(
      "la chaîne des quatorze étapes n'est pas composée : aucun noyau n'a été remis au montage. " +
        "Un transport monté sur un noyau absent servirait des appels qu'aucune ligne d'`ops_audit` " +
        "n'atteste — le § 11 l'interdit. Composer la chaîne, puis remonter le service.",
    );
  }

  const sertLesOutils = empechements.length === 0 && fabriqueDuNoyau !== null;

  let transportHttp: TransportHttp | null = null;
  let serveurHttp: ServeurHttp | null = null;
  let serveurStdio: ServeurStdio | null = null;
  let attacheStdio: AttacheAuxFlux | null = null;
  const montes: Transport[] = [];
  // ⚠️ **UN NOYAU PAR COLONNE, FRAPPÉ AU MOMENT DU MONTAGE — ADR 0039.** Frapper
  //    une fois hors de la boucle et réutiliser l'objet est EXACTEMENT le défaut
  //    que la fabrique existe pour rendre impossible.
  let colonnesFrappees = 0;
  const frapperLeNoyauDe = (transport: Transport): NoyauUnique => {
    if (fabriqueDuNoyau === null) {
      throw new ErreurDeMontageDuService(
        `aucune fabrique de noyau pour la colonne « ${transport} » — ce chemin est ` +
          "inatteignable tant que `sertLesOutils` est vrai ; s'il est atteint, c'est que le " +
          "montage a cessé de dériver sa condition de l'absence de noyau.",
      );
    }
    colonnesFrappees += 1;
    return fabriqueDuNoyau(transport);
  };

  if (sertLesOutils && fabriqueDuNoyau !== null) {
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
          noyau: frapperLeNoyauDe("http"),
          maintenant: ports.maintenant,
          // ⚠️ **LES DEUX PORTS DE L'ADR 0037, ET C'EST ICI QU'ILS MANQUAIENT.**
          //    Ils sont FACULTATIFS au transport — il doit pouvoir être monté nu
          //    dans une garde — et c'est précisément pourquoi leur absence ne
          //    faisait rougir personne : un champ optionnel omis compile. Ce
          //    montage-ci les transmet, et `portsDAmontNonArmes` dit lesquels ne
          //    lui ont pas été remis.
          ...(ports.journalDesRefus === null ? {} : { journalDesRefus: ports.journalDesRefus }),
          ...(ports.delaiDeReprise === null ? {} : { delaiDeReprise: ports.delaiDeReprise }),
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
        noyau: frapperLeNoyauDe("stdio"),
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
    colonnesFrappees,
    sertLesOutils,
    empechements,
    // DÉRIVÉ des ports reçus, jamais recopié. Voir `PORTS_DAMONT_ARMABLES`.
    portsDAmontNonArmes: PORTS_DAMONT_ARMABLES.filter((nom) => ports[nom] === null),
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

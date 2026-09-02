/**
 * `ops/main.ts` — **LA RACINE DE COMPOSITION. LE SOCLE DÉMARRE ICI.**
 *
 * ═══ LE MANQUE QUE CE FICHIER COMBLE ═══
 *
 * À la fin du lot 1d, **rien n'appelait le socle.** Le cœur était écrit et
 * prouvé — coffre à trois états, journal chaîné et scellé, politique avec second
 * facteur, limites, profils fermés, registre, contrat d'adaptateur, les quatorze
 * étapes du § 11 et leur orchestrateur — et aucun point d'entrée de conteneur.
 * Deux gardes le comptaient déjà : `verifierLeCablageDuDemarrage` rendait ZÉRO
 * appelant de production pour `demarrerPolitique`, et le registre des coutures
 * portait `relireLaSanteMonoInstance` en `à-coudre` avec zéro appelant.
 *
 * Ce n'était pas une gêne d'ergonomie. Un socle réellement déployé ce jour-là
 * n'aurait pris **aucun verrou** — donc, derrière un répartiteur, la garde
 * d'exfiltration du § 20 se serait appliquée une fois sur deux, en restant verte
 * — et, redémarré pendant un desserrage de douze heures, il aurait **repris au
 * dernier niveau connu**, ce que la quatrième protection du § 20 interdit
 * nommément.
 *
 * ═══ CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS ═══
 *
 * **Il séquence. Il ne décide pas.** Chaque étage appelle le symbole qui porte
 * sa décision, et l'échelle des sept étages vit dans `ops/demarrage/etages.ts`,
 * comme une DONNÉE. Ce fichier est **confronté** à cette table par
 * `verifierLaCouvertureDesEtages` — jamais l'inverse. C'est le motif
 * d'`EXECUTANTS_ETAPES` / `verifierCouvertureDesEtapes` appliqué au démarrage :
 * la liste est la SOURCE, l'implémentation lui est CONFRONTÉE.
 *
 * L'arbitrage — ce que le socle SERT une fois les sept étages passés — vit dans
 * `ops/demarrage.ts` et il est PUR. Ici il n'y a que du câblage.
 *
 * ⚠️ **AUCUN REFUS DE DÉMARRAGE N'ENTRE DANS `ops_audit`.** Ils s'écrivent sur
 *    la sortie d'erreur, et nulle part ailleurs : la chaîne du journal est
 *    scellée par une clé du coffre (ADR 0002), et les sept étages tournent sous
 *    coffre potentiellement VERROUILLÉ. Une ligne non scellée fabriquerait un
 *    trou dans la chaîne — c'est-à-dire rendrait normal ce que l'ADR 0002 existe
 *    pour rendre détectable. Ce module n'importe donc RIEN de `core/audit/`, et
 *    une garde le mesure au lieu de croire cette phrase.
 *
 * ⚠️ **AUCUN APPEL RÉSEAU SORTANT.** Les connexions lui sont DONNÉES par des
 *    ports. Ce fichier peut donc tourner en intégration continue, et le socle
 *    peut démarrer en local avec des valeurs factices sur `stub.invalid`.
 *
 * Voir **ADR 0023**, **ADR 0024**.
 */

import {
  REGLAGES_DAUTHENTIFICATION,
  verifierLaConfigurationDAuthentification,
} from "../core/auth/configuration.js";
import type { EtatIndexProvenance } from "../core/chaine/etape-11-provenance.js";
import type { Transport } from "../core/chaine/orchestrateur.js";
import { colonneDuTransport, verifierCouvertureDesEtapes } from "../core/chaine/orchestrateur.js";
import type { InstanceDuSocle, VerrouDInstance } from "../core/instance/index.js";
import {
  MagasinDeVerrousEnMemoire,
  VerrouEnMemoire,
  demarrerLeSocleMonoInstance,
  frapperInstance,
  relireLaSanteMonoInstance,
} from "../core/instance/index.js";
import type { ChoixDuVerrou, OuvertureDeSessionDediee } from "../core/instance/postgres.js";
import { VerrouPostgres, choisirImplementationDuVerrou } from "../core/instance/postgres.js";
import type { EntreeEnregistrement } from "../core/registry/index.js";
import {
  VERSION_VERROU,
  enregistrerAdaptateur,
  lireVerrou,
  versEnregistrementOutil,
} from "../core/registry/index.js";
import type { DepotDuRegistre } from "../core/registry/index.js";
import type { DepotPolitique, ResultatDemarrage } from "../core/policy/index.js";
import { demarrerPolitique, plancherDuScope } from "../core/policy/index.js";
import type { PolicyLevel } from "../core/types.js";
import type { DecisionDeDemarrage, EtatCoffre, RouteDuSocle } from "../core/vault/index.js";
import { decisionDeDemarrage } from "../core/vault/index.js";
import type { DemarrageDuSocle, ResultatDEtage } from "./demarrage.js";
import { arbitrerLeDemarrage, franchir, refuser } from "./demarrage.js";
import type { CleDEtage } from "./demarrage/etages.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE CLIQUET DES ÉTAGES DONT LE DÉCIDEUR N'EST PAS ENCORE ÉCRIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LE CLIQUET EST VIDE — L'ÉTAGE 3 A SON EXÉCUTANT, ET LA RACINE L'APPELLE.**
 *
 * Il a porté `"authentification"` le temps d'un lot, pendant lequel
 * `ETAGES_DU_DEMARRAGE.authentification` nommait un décideur que personne n'avait
 * encore écrit. Le lot 2 a livré `verifierLaConfigurationDAuthentification`
 * (`core/auth/configuration.ts`) et la recette l'a câblée à l'étage 3 : l'entrée
 * est donc retirée, comme son propre motif l'exigeait.
 *
 * ⚠️ **IL RESTE, ET IL RESTE VIDE.** Le type le maintient confronté à l'échelle,
 *    et la garde `verifierLaCouvertureDesEtages` rougit dans les DEUX sens : un
 *    étage annoncé en attente que la racine appelle, et un étage appelé par
 *    personne qui n'est pas annoncé. Le supprimer rendrait la seconde moitié
 *    muette.
 *
 * ⚠️ **CE CLIQUET SE VIDE, IL NE S'ALLONGE PAS.** Y ajouter un étage pour
 *    obtenir du vert reviendrait à bénir le contournement.
 */
export const ETAGES_EN_ATTENTE_DE_LEUR_CONSTRUCTEUR: readonly CleDEtage[] = [];

/**
 * Les décideurs que la racine n'appelle PAS directement, et pourquoi.
 *
 * ⚠️ Ce ne sont pas des oublis. `deciderDemarrageMonoInstance` est appelée PAR
 *    `demarrerLeSocleMonoInstance`, et `core/instance/demarrage.ts` écrit noir
 *    sur blanc « IL NE DÉCIDE PAS UNE SECONDE FOIS » : l'appeler ici reprendrait
 *    une décision qui vit ailleurs, ce qui est le défaut, pas le remède.
 *    `verifierLock`, lui, n'existe pas — le lecteur réel du verrou d'adaptateurs
 *    s'appelle `lireVerrou`, et c'est lui que l'étage 5 appelle.
 *
 * ⚠️ `verifierLaConfigurationDAuthentification` A ÉTÉ RETIRÉE DE CETTE LISTE au
 *    moment où l'étage 3 l'a appelée. Une entrée qui survit à son motif est une
 *    dispense d'examen, et c'est ce que ce cliquet existe pour empêcher.
 */
export const DECIDEURS_NON_APPELES_DIRECTEMENT: readonly string[] = [
  // Étage 1 — appelée par `demarrerLeSocleMonoInstance`, qui ne décide pas deux fois.
  "deciderDemarrageMonoInstance",
  // Étage 5 — nom sans référent dans le dépôt ; le lecteur réel est `lireVerrou`.
  "verifierLock",
];

// ═════════════════════════════════════════════════════════════════════════════
//  LES PORTS
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que l'étage 3 attend d'un contrôle d'authentification. */
export interface VerdictDAuthentification {
  /** Combien de réglages ont été RÉELLEMENT confrontés. Un zéro est un refus. */
  readonly reglagesConfrontes: number;
  readonly manquants: readonly string[];
  readonly anomalies: readonly string[];
}

/** Un manifeste soumis à l'admission, sans le verrou — la racine l'y ajoute. */
export type ManifesteAAdmettre = Omit<EntreeEnregistrement, "verrou">;

/** Ce que la lecture du verrou d'adaptateurs rapporte à l'étage 5. */
export interface LectureDuLockDAdaptateurs {
  /** Le fichier existe-t-il ? Un fichier ABSENT n'est pas un fichier ILLISIBLE. */
  readonly present: boolean;
  /** Son contenu déjà analysé en JSON, ou `null` quand il n'existe pas. */
  readonly brut: unknown;
}

/** Ce que l'écran Santé du § 22 lit hors du socle lui-même. */
export interface SondesDeSante {
  /** § 27 — `ops_secret.bootstrapCount`. `null` quand aucun secret n'est posé. */
  lireLAmorcage(): Promise<number | null>;
  /** § 16/§ 17 — l'attestation de révocation, et son échéance. */
  lireLAttestation(): Promise<{
    readonly attestedAt: Date | null;
    readonly attestationExpiresAt: Date | null;
  }>;
  /** § 22 — les jetons sont-ils rafraîchissables ? */
  jetonsRafraichissables(): Promise<boolean>;
  /** § 22 — adaptateurs joignables, SUR combien de sondés. */
  sonderLesAdaptateurs(): Promise<{ readonly sondes: number; readonly joignables: number }>;
}

/**
 * **DES SONDES QUI DISENT « JE N'AI RIEN MESURÉ », JAMAIS « TOUT VA BIEN ».**
 *
 * ⚠️ C'est la différence entre un zéro qu'on LIT et un booléen qu'on CROIT. Une
 *    sonde par défaut qui rendrait `true` ferait un écran Santé vert sur un
 *    socle qu'aucune sonde n'a jamais interrogé. `sondes: 0` se voit ; un vert
 *    ne se voit pas.
 */
export const SONDES_NON_POURVUES: SondesDeSante = {
  lireLAmorcage: () => Promise.resolve(null),
  lireLAttestation: () => Promise.resolve({ attestedAt: null, attestationExpiresAt: null }),
  jetonsRafraichissables: () => Promise.resolve(false),
  sonderLesAdaptateurs: () => Promise.resolve({ sondes: 0, joignables: 0 }),
};

/** Programme une tâche répétée, et rend de quoi l'annuler. */
export type Planificateur = (periodeMs: number, tache: () => void) => () => void;

/**
 * Le planificateur réel. `unref()` est délibéré : une veille qui empêcherait le
 * processus de se terminer transformerait un arrêt propre en arrêt forcé.
 */
export const PLANIFICATEUR_PAR_INTERVALLE: Planificateur = (periodeMs, tache) => {
  const minuteur = setInterval(tache, periodeMs);
  minuteur.unref();
  return () => {
    clearInterval(minuteur);
  };
};

// ═════════════════════════════════════════════════════════════════════════════
//  LA VEILLE QUI BAT
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que la veille publie au healthcheck. **Un signal POSITIF, pas un silence.** */
export interface EtatDeVeille {
  readonly battements: number;
  readonly dernierBattementA: Date | null;
  readonly silencieuseDepuisMs: number | null;
  readonly seuilDeSilenceMs: number;
  readonly silencieuse: boolean;
}

/**
 * **LA VEILLE BAT — ELLE NE SE TAIT PAS EN ESPÉRANT QU'ON LE REMARQUE.**
 *
 * ⚠️ UNE VEILLE MUETTE NE DISTINGUE PAS SA PROPRE MORT DE L'ABSENCE
 *    D'INCIDENT. C'est le mode de défaillance que l'étage 7 existe pour fermer :
 *    il ne refuse rien, il refuse le SILENCE. Le compte de battements est donc
 *    monotone et PUBLIÉ ; un observateur qui le voit figé sait que la veille est
 *    morte, là où une absence d'alerte se lit « tout va bien ».
 *
 * ⚠️ **L'HORLOGE ET LE PLANIFICATEUR SONT INJECTÉS.** Une garde qui attendrait
 *    de vraies secondes serait lente, instable, et finirait désactivée.
 */
export class BattementDeVeille {
  readonly #horloge: () => Date;
  readonly #periodeMs: number;
  #battements = 0;
  #dernier: Date | null = null;
  #annuler: (() => void) | null = null;

  constructor(horloge: () => Date, periodeMs: number) {
    this.#horloge = horloge;
    this.#periodeMs = periodeMs;
  }

  /** Un battement. Appelé une fois à l'étage 7, puis par le planificateur. */
  battre(): void {
    this.#battements += 1;
    this.#dernier = this.#horloge();
  }

  demarrer(planifier: Planificateur): void {
    this.#annuler ??= planifier(this.#periodeMs, () => {
      this.battre();
    });
  }

  arreter(): void {
    this.#annuler?.();
    this.#annuler = null;
  }

  /**
   * ⚠️ LE SEUIL DE SILENCE EST **DÉRIVÉ** DE LA PÉRIODE — deux périodes plus une
   *    tolérance d'une demie. Un seuil écrit à part aurait divergé de la période
   *    au premier réglage, et la veille aurait été déclarée muette alors qu'elle
   *    bat, ou l'inverse.
   */
  etat(maintenant: Date): EtatDeVeille {
    const seuil = Math.round(this.#periodeMs * 2.5);
    const depuis = this.#dernier === null ? null : maintenant.getTime() - this.#dernier.getTime();
    return {
      battements: this.#battements,
      dernierBattementA: this.#dernier,
      silencieuseDepuisMs: depuis,
      seuilDeSilenceMs: seuil,
      silencieuse: depuis === null || depuis > seuil,
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE HEALTHCHECK REND
// ═════════════════════════════════════════════════════════════════════════════

/** Le corps de `/healthz` (§ 22, écran Santé ; § 23, `vaultLocked`). */
export interface CorpsDeSante {
  /** § 20 — sans lui, « zéro extrait indexé » ne se distingue pas de « deux instances ». */
  readonly instanceId: string;
  readonly demarreeA: string;
  readonly verrou: string;
  /** § 23 — DÉRIVÉ de l'état du coffre, jamais stocké. */
  readonly vaultLocked: boolean;
  readonly coffre: EtatCoffre;
  readonly routesServies: readonly RouteDuSocle[];
  readonly appelsDOutilsAcceptes: boolean;
  readonly jetonsRafraichissables: boolean;
  /** La politique est-elle LUE, et à quel niveau tient-elle ? Relu à chaque appel. */
  readonly politique: {
    readonly chargee: boolean;
    readonly niveau: PolicyLevel;
    readonly lignesExaminees: number;
  };
  readonly adaptateurs: {
    readonly epingles: number;
    readonly admis: number;
    readonly desactives: number;
    readonly sondes: number;
    readonly joignables: number;
  };
  /** § 20 — le NOMBRE D'EXTRAITS INDEXÉS, signal positif de la garde d'exfiltration. */
  readonly provenance: Pick<EtatIndexProvenance, "extraits" | "sessions" | "indetermine">;
  /** § 27 — un plafond qu'on ne compte pas est un mur qu'on découvre en le percutant. */
  readonly bootstrapCount: number | null;
  readonly attestedAt: string | null;
  readonly attestationExpiresAt: string | null;
  readonly veille: EtatDeVeille;
}

export interface ReponseDeSante {
  readonly statut: number;
  readonly corps: CorpsDeSante;
}

/** Le healthcheck. Une FONCTION : il RELIT tout à chaque appel. */
export type Healthcheck = () => Promise<ReponseDeSante>;

// ═════════════════════════════════════════════════════════════════════════════
//  LES DÉPENDANCES DE LA RACINE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * TOUT CE QUE LA RACINE REÇOIT. **Aucun de ces champs n'est facultatif**, et
 * c'est la seule forme qui empêche un câblage à moitié fait de passer : une
 * valeur par défaut se met en place une fois et ne se retire jamais.
 */
export interface DependancesDuSocle {
  // ── Étage 1 · verrou ──────────────────────────────────────────────────────
  /** L'URL de la base. C'est d'ELLE que dérive le choix d'implémentation. */
  readonly urlDeBase: string | undefined;
  /** De quoi ouvrir la connexion DÉDIÉE du verrou, ou `null` en local. */
  readonly ouvrirLaSessionDeVerrou: OuvertureDeSessionDediee | null;
  readonly magasinEnMemoire: MagasinDeVerrousEnMemoire;
  readonly instance: InstanceDuSocle;

  // ── Étage 2 · coffre ──────────────────────────────────────────────────────
  lireLEtatDuCoffre(): Promise<EtatCoffre>;

  // ── Étage 3 · authentification ────────────────────────────────────────────
  /**
   * LES RÉGLAGES DU § 19, ET **EUX SEULS** — jamais l'environnement entier.
   *
   * ⚠️ **LA RESTRICTION EST LA DÉCISION.** `OPS_CONSOLE_SESSION_KEY` est un
   *    SECRET (§ 21) ; remettre `process.env` à la racine lui donnerait accès à
   *    tout ce que le conteneur porte, pour un contrôle qui n'a besoin que de
   *    quatre noms. La liste est DÉRIVÉE de `REGLAGES_DAUTHENTIFICATION` par
   *    {@link reglagesDepuisLEnvironnement}, jamais recopiée ici.
   */
  readonly reglagesDAuthentification: Readonly<Record<string, string | undefined>>;
  /**
   * UN CONTRÔLE DE REMPLACEMENT, ou `null` pour **le décideur réel du § 19**.
   *
   * ⚠️ **`null` N'EST PAS « AUCUN CONTRÔLE ».** L'étage 3 appelle alors
   *    `verifierLaConfigurationDAuthentification` sur les réglages ci-dessus —
   *    c'est-à-dire le § 19 tel qu'il est écrit. Un environnement vide y rend
   *    quatre réglages manquants, et le processus SORT : la règle absolue tient,
   *    il n'y a ni mode dégradé ni bascule de contournement.
   *
   * ⚠️ Ce port existe pour qu'une garde puisse fabriquer un verdict que
   *    l'environnement ne sait pas produire — au premier chef le contrôle
   *    AVEUGLE, qui confronte ZÉRO réglage et doit être refusé.
   */
  readonly controlerLAuthentification: (() => VerdictDAuthentification) | null;

  // ── Étage 4 · politique ───────────────────────────────────────────────────
  readonly depotPolitique: DepotPolitique;
  readonly motifDuDemarrage: string;

  // ── Étage 5 · registre ────────────────────────────────────────────────────
  lireLeLockDAdaptateurs(): Promise<LectureDuLockDAdaptateurs>;
  readonly manifestesAAdmettre: readonly ManifesteAAdmettre[];
  /**
   * OÙ L'ADMISSION SE POSE — ou `null` quand elle ne se pose nulle part.
   *
   * ⚠️ **OBLIGATOIRE, MÊME POUR VALOIR `null`.** Jusqu'au lot 5, l'étage 5
   *    admettait, comptait `adaptateursAdmis: 1`, et JETAIT le résultat : aucune
   *    ligne `ops_adapter`, aucune ligne `ops_tool`, donc aucun catalogue, donc
   *    aucun outil servi. Un champ facultatif se serait lu « on n'y a pas
   *    pensé » ; celui-ci oblige chaque montage à DIRE s'il pose ou non.
   *
   * ⚠️ **UNE ÉCRITURE QUI ÉCHOUE N'ARRÊTE PAS LE DÉMARRAGE, ELLE LE DIT.** Le
   *    § 20 veut qu'un adaptateur en défaut soit DÉSACTIVÉ et alerté, pas qu'il
   *    fasse sortir le processus : un socle qui refuserait de démarrer parce
   *    qu'une base est momentanément indisponible cesserait aussi de servir la
   *    console, par laquelle on répare.
   */
  readonly depotDuRegistre: DepotDuRegistre | null;

  // ── Étage 6 · transports ──────────────────────────────────────────────────
  readonly transports: readonly Transport[];
  readonly hotesAutorises: readonly string[];

  // ── Étage 7 · veille ──────────────────────────────────────────────────────
  readonly lireLaProvenance: () => EtatIndexProvenance;
  readonly periodeDeVeilleMs: number;
  readonly planifier: Planificateur;

  // ── Transverses ───────────────────────────────────────────────────────────
  readonly sondes: SondesDeSante;
  readonly horloge: () => Date;
  readonly ecrireSurLaSortieDErreur: (ligne: string) => void;
}

/** Ce que la racine rend. Le processus n'a plus qu'à sortir, ou à servir. */
export interface SocleDemarre {
  readonly demarrage: DemarrageDuSocle;
  /** `null` sur toute sortie : un socle refusé ne publie AUCUNE identité. */
  readonly instance: InstanceDuSocle | null;
  readonly verrou: VerrouDInstance | null;
  readonly choixDuVerrou: ChoixDuVerrou;
  readonly politique: ResultatDemarrage | null;
  readonly adaptateursEpingles: number;
  readonly adaptateursAdmis: number;
  readonly adaptateursDesactives: readonly string[];
  /** `null` quand le processus sort — un socle mort ne répond pas. */
  readonly healthcheck: Healthcheck | null;
  readonly veille: BattementDeVeille;
  arreter(): Promise<void>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA SÉQUENCE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **LES SEPT ÉTAGES, DANS L'ORDRE DE L'ÉCHELLE.**
 *
 * L'ordre est la décision, pas une commodité :
 *
 *  · **le verrou avant tout** — « un verrou EXCLUSIF est pris AVANT de servir
 *    quoi que ce soit » (ADR 0018). Un second socle qui le prendrait après avoir
 *    monté ses transports aurait déjà servi des appels ;
 *  · **le coffre avant l'authentification** — le matériel d'authentification de
 *    la console n'entre JAMAIS dans le coffre (§ 21), donc l'étage 3 est
 *    vérifiable sous coffre verrouillé, et il DOIT l'être : sinon un coffre
 *    verrouillé rendrait la route de déverrouillage inatteignable, et le § 23
 *    perdrait son deuxième état.
 *
 * ⚠️ **LES SEPT ÉTAGES TOURNENT TOUS SOUS COFFRE VERROUILLÉ.** C'est une
 *    conséquence qu'il faut écrire, parce qu'on la suppose fausse : la ligne
 *    `setBy: "boot"` de l'étage 4 va dans `ops_policy`, pas dans `ops_audit`
 *    (§ 12), elle ne demande donc AUCUNE clé de scellement ; et l'étage 5 ne lit
 *    que le verrou et les manifestes — les `secretRef` ne sont résolus qu'à
 *    l'appel. Ce qu'un coffre verrouillé retire est exactement ce que le § 23
 *    dit qu'il retire : la famille de routes `outils`. Élargir cette amputation
 *    « par prudence » ferait rougir chaque déploiement.
 */
export async function demarrerLeSocle(deps: DependancesDuSocle): Promise<SocleDemarre> {
  const resultats: ResultatDEtage[] = [];
  const veille = new BattementDeVeille(deps.horloge, deps.periodeDeVeilleMs);

  // ───────────────────────────────────────────────────────────────────────────
  //  ÉTAGE 1 — LE VERROU : CE PROCESSUS EST LE SEUL SOCLE EN VIE
  // ───────────────────────────────────────────────────────────────────────────
  const choixDuVerrou = choisirImplementationDuVerrou(deps.urlDeBase);
  let verrou: VerrouDInstance | null = null;
  let instance: InstanceDuSocle | null = null;

  if (!choixDuVerrou.urlLisible) {
    // ⚠️ FAIL-CLOSED SUR UNE URL ILLISIBLE. Sans ce refus, le socle prendrait un
    //    verrou EN MÉMOIRE en production — aveugle aux autres processus — parce
    //    qu'une URL mal orthographiée ressemble en tout point à une URL factice.
    resultats.push(
      refuser("verrou", `Magasin de verrous indésignable : ${choixDuVerrou.motif}`, {
        implementationsConfrontees: 1,
      }),
    );
  } else {
    if (choixDuVerrou.implementation === "postgres" && deps.ouvrirLaSessionDeVerrou !== null) {
      verrou = new VerrouPostgres({
        ouvrirLaSession: deps.ouvrirLaSessionDeVerrou,
        instance: deps.instance,
      });
    } else {
      verrou = new VerrouEnMemoire(deps.magasinEnMemoire, deps.instance);
    }

    const monoInstance = await demarrerLeSocleMonoInstance(verrou);
    instance = monoInstance.instance;
    const comptesDuVerrou = {
      implementationsConfrontees: 1,
      portALeve: monoInstance.portALeve ? 1 : 0,
      aveugleAuxAutresProcessus: choixDuVerrou.aveugleAuxAutresProcessus ? 1 : 0,
    };
    resultats.push(
      monoInstance.decision.demarre
        ? franchir("verrou", comptesDuVerrou)
        : refuser("verrou", monoInstance.decision.message, comptesDuVerrou),
    );
  }

  if (aArrete(resultats)) return conclure(deps, resultats, choixDuVerrou, veille, null, null, null);

  // ───────────────────────────────────────────────────────────────────────────
  //  ÉTAGE 2 — LE COFFRE : LEQUEL DES TROIS ÉTATS DU § 23 EST LE NÔTRE
  // ───────────────────────────────────────────────────────────────────────────
  let etatDuCoffre: EtatCoffre;
  try {
    etatDuCoffre = await deps.lireLEtatDuCoffre();
  } catch {
    // Le repli tombe du côté strict : un coffre qu'on n'a pas pu lire est traité
    // comme ABSENT, donc le socle ne démarre pas. Le prendre pour « verrouillé »
    // ferait démarrer un socle amputé sur une panne de base.
    etatDuCoffre = "absent";
  }
  const coffre: DecisionDeDemarrage = decisionDeDemarrage(etatDuCoffre);
  const comptesDuCoffre = {
    etatsConfrontes: 1,
    routesServies: coffre.routesServies.length,
  };
  // ⚠️ **TROIS ÉTATS, ET DEUX SEULEMENT SONT DES REFUS — MAIS PAS LE MÊME.**
  //    `ouvert` franchit. `verrouillé` REFUSE, et son refus AMPUTE : le socle
  //    vit, sert la console, le healthcheck et le déverrouillage, et refuse tout
  //    appel d'outil. `absent` REFUSE, et son refus fait SORTIR. L'issue est
  //    dérivée par `issueDuRefusDeCoffre` du propriétaire de la décision — pas
  //    lue dans l'échelle, qui n'en porte qu'une des deux.
  //
  //    Réduire `verrouillé` à `absent` « parce que dans les deux cas on ne peut
  //    rien déchiffrer » est le raccourci que le § 23 nomme comme le défaut qui
  //    « rend rouge chaque déploiement » — puisque le repli fait démarrer
  //    verrouillé à CHAQUE déploiement.
  resultats.push(
    etatDuCoffre === "ouvert"
      ? franchir("coffre", comptesDuCoffre, coffre)
      : refuser("coffre", coffre.message, comptesDuCoffre, coffre),
  );

  if (aArrete(resultats)) {
    return conclure(deps, resultats, choixDuVerrou, veille, verrou, instance, null);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  ÉTAGE 3 — L'AUTHENTIFICATION : § 19, RÈGLE ABSOLUE
  // ───────────────────────────────────────────────────────────────────────────
  // ⚠️ **LA RACINE APPELLE LE DÉCIDEUR DU § 19 ELLE-MÊME**, et ne le reçoit que
  //    lorsqu'une garde veut fabriquer un verdict que l'environnement ne sait pas
  //    produire. Le lot précédent laissait ce port à `null` et refusait : la
  //    racine livrée ne démarrait alors sur AUCUNE configuration, et le seul
  //    démarrage vert du dépôt était celui que sa propre garde s'accordait.
  const controle = deps.controlerLAuthentification;
  const verdict: VerdictDAuthentification =
    controle === null
      ? verifierLaConfigurationDAuthentification(deps.reglagesDAuthentification)
      : controle();
  const comptesDAuth = {
    reglagesConfrontes: verdict.reglagesConfrontes,
    manquants: verdict.manquants.length,
    anomalies: verdict.anomalies.length,
  };
  // ⚠️ ZÉRO RÉGLAGE CONFRONTÉ EST UN REFUS, PAS UN SUCCÈS. C'est le mode de
  //    défaillance classique : le nom de la variable change, la liste se
  //    résout à zéro entrée, la boucle ne trouve aucun manquant à signaler, et
  //    le contrôle reste vert en ne gardant rien.
  const franchissable =
    verdict.reglagesConfrontes > 0 &&
    verdict.manquants.length === 0 &&
    verdict.anomalies.length === 0;
  resultats.push(
    franchissable
      ? franchir("authentification", comptesDAuth)
      : refuser(
          "authentification",
          verdict.reglagesConfrontes === 0
            ? "Le contrôle d'authentification n'a confronté AUCUN réglage : il ne garde rien. " +
                "Le § 19 pose une règle absolue — pas de mode dégradé, pas de contournement. " +
                "Le socle ne démarre pas."
            : `Authentification non configurée — ${String(verdict.manquants.length)} réglage(s) ` +
                `manquant(s) et ${String(verdict.anomalies.length)} anomalie(s) de forme. ` +
                "Le § 19 pose une règle absolue : renseigner les réglages dans l'environnement " +
                "du conteneur, puis redéployer. Ne jamais contourner en désactivant " +
                "l'authentification.",
          comptesDAuth,
        ),
  );

  if (aArrete(resultats)) {
    return conclure(deps, resultats, choixDuVerrou, veille, verrou, instance, null);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  ÉTAGE 4 — LA POLITIQUE : § 20, PROTECTION 4, JAMAIS LE DERNIER NIVEAU CONNU
  // ───────────────────────────────────────────────────────────────────────────
  let politique: ResultatDemarrage | null = null;
  try {
    politique = await demarrerPolitique(deps.depotPolitique, deps.horloge(), deps.motifDuDemarrage);
    resultats.push(
      franchir("politique", {
        lignesExamineesALEntree: politique.mesures,
        lignesRecouvertes: politique.recouvertes.length,
      }),
    );
  } catch {
    // ⚠️ FAIL-CLOSED, ET C'EST TOUT LE SENS DE L'ÉTAGE. Démarrer sans la ligne
    //    `boot`, c'est reprendre au dernier niveau connu — donc rouvrir tout seul
    //    un desserrage de douze heures en cours au moment de la panne. Le § 20
    //    l'interdit nommément.
    resultats.push(
      refuser(
        "politique",
        "La ligne de démarrage « setBy: boot » n'a pas pu être écrite. Le socle ne sert AUCUN " +
          "appel : démarrer sans elle reviendrait à reprendre au dernier niveau connu, ce que la " +
          "quatrième protection du § 20 interdit. Réparer l'accès à la table de politique.",
        { lignesExamineesALEntree: 0, lignesRecouvertes: 0 },
      ),
    );
  }

  if (aArrete(resultats)) {
    return conclure(deps, resultats, choixDuVerrou, veille, verrou, instance, politique);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  ÉTAGE 5 — LE REGISTRE : LE CATALOGUE SERVI EST CELUI QUE LE LOCK ÉPINGLE
  // ───────────────────────────────────────────────────────────────────────────
  let epingles = 0;
  let admis = 0;
  let lignesPosees = 0;
  const desactives: string[] = [];
  const orphelins: string[] = [];
  const echecsDEcriture: string[] = [];

  let lock: LectureDuLockDAdaptateurs;
  try {
    lock = await deps.lireLeLockDAdaptateurs();
  } catch {
    lock = { present: true, brut: null };
  }

  // ⚠️ **UN LOCK ABSENT N'EST PAS UN LOCK ILLISIBLE**, et `lireVerrou` l'écrit
  //    déjà : « un `adapters.lock.json` vide est légitime tant qu'aucun
  //    adaptateur n'est épinglé, et faire échouer la lecture casserait
  //    l'amorçage ». Un fichier PRÉSENT et incohérent, lui, fait sortir : le
  //    socle ne pourrait alors dire d'AUCUN outil qu'il est épinglé.
  const brut = lock.present ? lock.brut : { lockVersion: VERSION_VERROU, adapters: [] };
  const lecture = lireVerrou(brut);

  if (lecture.verrou === null) {
    resultats.push(
      refuser(
        "registre",
        `Le verrou d'adaptateurs est illisible ou incohérent — ` +
          `${String(lecture.verdict.anomalies.length)} anomalie(s). Le socle ne peut dire ` +
          "d'AUCUN outil qu'il est épinglé, et servir un catalogue non épinglé reviendrait à " +
          "accepter une mise à jour silencieuse (§ 20). Corriger `adapters.lock.json`.",
        { entreesLues: lecture.verdict.mesures, anomalies: lecture.verdict.anomalies.length },
      ),
    );
  } else {
    epingles = lecture.verrou.adapters.length;
    for (const manifeste of deps.manifestesAAdmettre) {
      // ⚠️ UN MANIFESTE QUI S'ÉCARTE DE SON ÉPINGLE NE FAIT PAS SORTIR LE
      //    PROCESSUS : il DÉSACTIVE SON adaptateur et alerte. C'est l'épinglage
      //    du § 20 — « au lieu de mettre à jour en silence ».
      const resultat = enregistrerAdaptateur({ ...manifeste, verrou: lecture.verrou });
      if (!resultat.admis) {
        desactives.push(resultat.refus.map((refus) => refus.motif).join("/") || "refusé");
        continue;
      }
      admis += 1;

      // ── L'ADMISSION SE POSE ────────────────────────────────────────────────
      // ⚠️ ELLE NE SE POSE QUE SI UN DÉPÔT EST FOURNI, et le contraire n'est
      //    pas une panne : un socle en mémoire ADMET sans écrire, et l'annonce
      //    le dit par un compte de lignes posées à zéro.
      if (deps.depotDuRegistre === null) continue;
      try {
        const ecriture = await deps.depotDuRegistre.ecrireAdmission(
          resultat.adaptateur,
          resultat.outils.map(versEnregistrementOutil),
        );
        lignesPosees += ecriture.outilsInseres + ecriture.outilsMisAJour;
        orphelins.push(...ecriture.outilsOrphelins);
      } catch (erreur) {
        // ⚠️ ON NOMME L'ADAPTATEUR ET LA CLASSE D'ERREUR, JAMAIS SON MESSAGE :
        //    un message de pilote de base porte volontiers une URL de connexion.
        echecsDEcriture.push(
          `${resultat.adaptateur.id} (${erreur instanceof Error ? erreur.name : "erreur"})`,
        );
      }
    }
    resultats.push(
      franchir("registre", {
        adaptateursEpingles: epingles,
        manifestesSoumis: deps.manifestesAAdmettre.length,
        adaptateursAdmis: admis,
        adaptateursDesactives: desactives.length,
        // ⚠️ CES TROIS COMPTES SONT ANNONCÉS MÊME À ZÉRO. Un zéro de lignes
        //    posées distingue « rien à poser » de « personne n'a écrit », et
        //    c'est exactement la confusion que le lot 5 est venu défaire.
        lignesOpsToolPosees: lignesPosees,
        outilsOrphelins: orphelins.length,
        echecsDEcriture: echecsDEcriture.length,
      }),
    );
  }

  if (aArrete(resultats)) {
    return conclure(deps, resultats, choixDuVerrou, veille, verrou, instance, politique);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  ÉTAGE 6 — LES TRANSPORTS : CHAQUE ÉTAPE DU § 11 A UN EXÉCUTANT
  // ───────────────────────────────────────────────────────────────────────────
  const sansExecutant: string[] = [];
  let etapesConfrontees = 0;
  let etapesAmont = 0;
  for (const transport of deps.transports) {
    const couverture = verifierCouvertureDesEtapes(transport);
    etapesConfrontees += couverture.etapesMesurees;
    etapesAmont += colonneDuTransport(transport).etapesAmont.length;
    for (const etape of couverture.sansExecutant) {
      sansExecutant.push(`${transport}/étape ${String(etape)}`);
    }
  }

  const comptesDesTransports = {
    transportsMontes: deps.transports.length,
    etapesConfrontees,
    etapesAmont,
    etapesSansExecutant: sansExecutant.length,
    hotesAutorises: deps.hotesAutorises.length,
  };

  if (deps.transports.length === 0) {
    resultats.push(
      refuser(
        "transports",
        "Aucun transport n'est monté : le socle n'aurait aucun chemin par lequel servir un " +
          "appel, et son healthcheck vert ne voudrait rien dire.",
        comptesDesTransports,
      ),
    );
  } else if (sansExecutant.length > 0) {
    resultats.push(
      refuser(
        "transports",
        `${String(sansExecutant.length)} étape(s) du § 11 sans exécutant ` +
          `[${sansExecutant.join(", ")}]. Une chaîne trouée laisse traverser un appel sans que ` +
          "la garde correspondante s'applique : le socle ne démarre pas.",
        comptesDesTransports,
      ),
    );
  } else if (deps.hotesAutorises.length === 0) {
    // ⚠️ **UNE LISTE BLANCHE VIDE EST UN REFUS, JAMAIS UN « TOUT AUTORISER ».**
    //    Mode de défaillance visé, et il est précis : le nom de la variable est
    //    mal orthographié, la liste se résout à zéro entrée, la boucle de
    //    l'étape 1 ne trouve aucun refus à prononcer, et l'anti DNS-rebinding
    //    reste vert en ne gardant rien.
    resultats.push(
      refuser(
        "transports",
        "La liste blanche d'hôtes est VIDE. Ce n'est pas « tout autoriser » : c'est un refus de " +
          "démarrer. Renseigner les hôtes admis par l'étape 1 du § 11 (anti DNS-rebinding).",
        comptesDesTransports,
      ),
    );
  } else {
    resultats.push(franchir("transports", comptesDesTransports));
  }

  if (aArrete(resultats)) {
    return conclure(deps, resultats, choixDuVerrou, veille, verrou, instance, politique);
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  ÉTAGE 7 — LA VEILLE : ELLE NE REFUSE RIEN, ELLE REFUSE LE SILENCE
  // ───────────────────────────────────────────────────────────────────────────
  veille.battre();
  veille.demarrer(deps.planifier);

  // Le premier battement RELIT réellement le verrou : une veille qui se
  // contenterait d'incrémenter un compteur battrait aussi bien sur un socle qui
  // a perdu son verrou, et son signal ne vaudrait rien.
  const santeInitiale =
    verrou !== null && instance !== null
      ? await relireLaSanteMonoInstance(verrou, instance, deps.lireLaProvenance)
      : null;

  const comptesDeVeille = {
    battements: veille.etat(deps.horloge()).battements,
    extraitsIndexes: santeInitiale?.provenance.extraits ?? 0,
    sessionsIndexees: santeInitiale?.provenance.sessions ?? 0,
  };

  resultats.push(
    santeInitiale !== null && santeInitiale.verrou === "tenu"
      ? franchir("veille", comptesDeVeille)
      : refuser(
          "veille",
          `Le premier battement de veille a relu le verrou et l'a trouvé ` +
            `« ${santeInitiale?.verrou ?? "indisponible"} » : le socle démarre, mais son ` +
            "healthcheck rendra 503 tant que le verrou n'est pas tenu. Ce n'est pas un silence, " +
            "c'est un signal.",
          comptesDeVeille,
        ),
  );

  return conclure(deps, resultats, choixDuVerrou, veille, verrou, instance, politique, {
    epingles,
    admis,
    desactives,
  });
}

/** Un `processus-sort` a-t-il été prononcé ? La séquence s'arrête là. */
function aArrete(resultats: readonly ResultatDEtage[]): boolean {
  return resultats.some((resultat) => resultat.refus?.issue === "processus-sort");
}

/**
 * L'ARBITRAGE, PUIS LE CÂBLAGE DU HEALTHCHECK.
 *
 * ⚠️ **L'ARBITRE EST APPELÉ ICI ET NULLE PART AILLEURS.** Chaque sortie
 *    anticipée de la séquence passe par cette fonction : une seconde décision
 *    prise dans une branche de sortie aurait divergé de la première.
 */
function conclure(
  deps: DependancesDuSocle,
  resultats: readonly ResultatDEtage[],
  choixDuVerrou: ChoixDuVerrou,
  veille: BattementDeVeille,
  verrou: VerrouDInstance | null,
  instance: InstanceDuSocle | null,
  politique: ResultatDemarrage | null,
  adaptateurs: { epingles: number; admis: number; desactives: readonly string[] } = {
    epingles: 0,
    admis: 0,
    desactives: [],
  },
): SocleDemarre {
  const demarrage = arbitrerLeDemarrage(resultats);

  // § 25 — le message nomme le geste, et il va sur la SORTIE D'ERREUR.
  for (const ligne of demarrage.lignesDeSortieDErreur) deps.ecrireSurLaSortieDErreur(ligne);
  for (const anomalie of demarrage.anomalies) {
    deps.ecrireSurLaSortieDErreur(`[démarrage · séquence] ${anomalie}`);
  }

  const sert = demarrage.sert && verrou !== null && instance !== null;

  return {
    demarrage,
    instance: sert ? instance : null,
    verrou,
    choixDuVerrou,
    politique,
    adaptateursEpingles: adaptateurs.epingles,
    adaptateursAdmis: adaptateurs.admis,
    adaptateursDesactives: adaptateurs.desactives,
    healthcheck:
      sert && verrou !== null && instance !== null
        ? construireLeHealthcheck(deps, demarrage, verrou, instance, veille)
        : null,
    veille,
    arreter: async () => {
      veille.arreter();
      if (verrou !== null) await verrou.liberer();
    },
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE HEALTHCHECK
// ═════════════════════════════════════════════════════════════════════════════

/**
 * **IL RELIT LE VERROU À CHAQUE APPEL, ET REND 503 DÈS QU'IL N'EST PLUS TENU.**
 *
 * ⚠️ C'EST LA SEULE FORME QUI VOIT UN VERROU PERDU EN COURS DE VIE — la forme la
 *    plus probable du défaut : « personne ne démarre volontairement deux socles ;
 *    une connexion, elle, tombe toute seule ». Un drapeau posé au démarrage
 *    répondrait « tenu » exactement dans le cas qu'il faut voir.
 *
 * ⚠️ **UN COFFRE VERROUILLÉ REND 200, UN VERROU PERDU REND 503**, et les deux ne
 *    disent pas la même chose au déploiement. Faire rougir le premier
 *    apprendrait à ignorer le rouge — c'est le défaut bloquant n° 12 du § 23.
 *
 * ⚠️ **LA POLITIQUE EST RELUE, PAS MÉMORISÉE.** Un niveau figé au démarrage
 *    afficherait `brouillon` pendant tout un desserrage légitime, et l'écran
 *    Santé cesserait d'être le lieu où l'on voit la porte ouverte.
 */
export function construireLeHealthcheck(
  deps: DependancesDuSocle,
  demarrage: DemarrageDuSocle,
  verrou: VerrouDInstance,
  instance: InstanceDuSocle,
  veille: BattementDeVeille,
): Healthcheck {
  return async (): Promise<ReponseDeSante> => {
    const maintenant = deps.horloge();
    const sante = await relireLaSanteMonoInstance(verrou, instance, deps.lireLaProvenance);

    let niveau: PolicyLevel = "brouillon";
    let lignesExaminees = 0;
    let politiqueChargee = false;
    try {
      const lignes = await deps.depotPolitique.lignes();
      const plancher = plancherDuScope(lignes, "*", maintenant);
      niveau = plancher.niveau;
      lignesExaminees = plancher.mesures;
      politiqueChargee = true;
    } catch {
      // Fail-closed : une politique illisible s'affiche au plus strict —
      // `niveau` reste à `brouillon`, sa valeur initiale — et `chargee: false`
      // dit POURQUOI. Un `brouillon` sans ce drapeau se lirait « le socle est
      // fermé », alors qu'il est AVEUGLE : les deux se réparent différemment.
    }

    const [amorcage, attestation, jetons, adaptateurs] = await Promise.all([
      deps.sondes.lireLAmorcage(),
      deps.sondes.lireLAttestation(),
      deps.sondes.jetonsRafraichissables(),
      deps.sondes.sonderLesAdaptateurs(),
    ]);

    return {
      // ⚠️ LE STATUT EST DÉRIVÉ DE `relireLaSanteMonoInstance`, jamais recalculé.
      statut: sante.statut,
      corps: {
        instanceId: instance.instanceId,
        demarreeA: instance.demarreeA.toISOString(),
        verrou: sante.verrou,
        vaultLocked: demarrage.vaultLocked,
        // ⚠️ L'ÉTAT VIENT DE L'ÉTAGE 2, IL N'EST PAS REDÉRIVÉ DE `vaultLocked` :
        //    `absent` et `verrouillé` portent tous deux le drapeau, et les
        //    confondre enverrait déverrouiller un coffre qui n'existe pas.
        coffre: demarrage.etatDuCoffre ?? "absent",
        routesServies: demarrage.routesServies,
        appelsDOutilsAcceptes: demarrage.appelsDOutilsAcceptes,
        jetonsRafraichissables: jetons,
        politique: { chargee: politiqueChargee, niveau, lignesExaminees },
        adaptateurs: {
          epingles: compteDeLEtage(demarrage, "registre", "adaptateursEpingles"),
          admis: compteDeLEtage(demarrage, "registre", "adaptateursAdmis"),
          desactives: compteDeLEtage(demarrage, "registre", "adaptateursDesactives"),
          sondes: adaptateurs.sondes,
          joignables: adaptateurs.joignables,
        },
        provenance: sante.provenance,
        bootstrapCount: amorcage,
        attestedAt: attestation.attestedAt?.toISOString() ?? null,
        attestationExpiresAt: attestation.attestationExpiresAt?.toISOString() ?? null,
        veille: veille.etat(maintenant),
      },
    };
  };
}

/**
 * Relit un compte MESURÉ par un étage. **Le healthcheck ne recompte rien** : un
 * second comptage aurait divergé du premier, et c'est le second qui ne suit
 * jamais.
 *
 * ⚠️ LE REPLI EST `-1`, PAS `0`. Un zéro se lirait « aucun adaptateur épinglé »,
 *    c'est-à-dire un FAIT, là où il ne dit que « l'étage n'a pas rapporté ce
 *    compte ». Les deux se corrigent différemment.
 */
function compteDeLEtage(demarrage: DemarrageDuSocle, cle: CleDEtage, nom: string): number {
  return demarrage.comptesParEtage[cle]?.[nom] ?? -1;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ENTRÉE DU PROCESSUS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les réglages que la racine sait dériver de l'environnement, et EUX SEULS.
 *
 * ⚠️ **AUCUN SECRET NE VOYAGE AU-DELÀ DE CE QUE L'ÉTAGE 3 CONFRONTE.** Les clés
 *    du coffre, du journal et des empreintes appartiennent au coffre et à
 *    l'émetteur ; la racine ne les lit jamais. Les quatre réglages du § 19 sont
 *    extraits nommément — dont un secret, `OPS_CONSOLE_SESSION_KEY`, dont
 *    l'étage 3 ne regarde que la PRÉSENCE.
 *
 * ⚠️ **LA LISTE EST DÉRIVÉE DE `REGLAGES_DAUTHENTIFICATION`, JAMAIS RECOPIÉE.**
 *    Une recopie resterait juste jusqu'au jour où le § 19 gagne un cinquième
 *    réglage — et ce jour-là, la racine remettrait à l'étage 3 un environnement
 *    amputé, qui refuserait de démarrer sur une variable pourtant renseignée.
 */
export function reglagesDepuisLEnvironnement(env: Readonly<Record<string, string | undefined>>): {
  readonly urlDeBase: string | undefined;
  readonly hotesAutorises: readonly string[];
  readonly reglagesDAuthentification: Readonly<Record<string, string | undefined>>;
} {
  const hotes = (env["OPS_ALLOWED_HOSTS"] ?? "")
    .split(",")
    .map((hote) => hote.trim())
    .filter((hote) => hote.length > 0);

  const reglagesDAuthentification: Record<string, string | undefined> = {};
  for (const exigence of REGLAGES_DAUTHENTIFICATION) {
    reglagesDAuthentification[exigence.nom] = env[exigence.nom];
  }

  return { urlDeBase: env["DATABASE_URL"], hotesAutorises: hotes, reglagesDAuthentification };
}

/** L'instance de CE processus. Frappée une fois, au plus tôt. */
export function frapperLInstanceDuProcessus(maintenant: Date): InstanceDuSocle {
  return frapperInstance(maintenant);
}

/** Un magasin de verrous en mémoire, pour le cas où la base est factice. */
export function magasinLocal(): MagasinDeVerrousEnMemoire {
  return new MagasinDeVerrousEnMemoire();
}

/**
 * `ops/mono-instance.ts` — LA GARDE DE DÉPLOIEMENT : COMBIEN DE SOCLES SERVENT ?
 *
 * ═══ LE DÉFAUT QUE CE MODULE REND VISIBLE ═══
 *
 * L'index de provenance du § 20 vit EN MÉMOIRE du processus — le § 20 l'exige,
 * le § 31 interdit qu'il soit persisté. Deux instances derrière un répartiteur
 * ne partagent donc pas leurs marques : une session marquée par une lecture
 * `personal` sur l'instance A arrive PROPRE sur l'instance B, l'étape 11 laisse
 * passer, et rien ne le signale. La garde d'exfiltration s'appliquerait une fois
 * sur deux, EN RESTANT VERTE.
 *
 * `core/instance/verrou.ts` tient la contrainte DEDANS : un verrou exclusif au
 * démarrage, relu par le healthcheck (ADR 0018). Ce module-ci la tient DEHORS,
 * et les deux ne se remplacent pas :
 *
 *  · le verrou empêche — mais il vit dans le processus qu'on soupçonne, et un
 *    socle mal câblé, mal déployé ou dont le magasin de verrous a été neutralisé
 *    ne le dira pas de lui-même ;
 *  · cet observateur constate — depuis l'extérieur, sur ce que le healthcheck
 *    EXPOSE : l'identifiant d'instance et le nombre d'extraits indexés (§ 20).
 *
 * ⚠️ LA BORNE, ET ELLE EST ÉCRITE DANS LE VERDICT LUI-MÊME.
 *
 *    **Cet observateur DÉTECTE une seconde instance. Il ne PROUVE JAMAIS qu'il
 *    n'y en a pas.** Un répartiteur peut servir dix lectures de suite depuis la
 *    même instance pendant qu'une seconde sert le trafic réel ; l'absence de
 *    chevauchement n'est donc pas une preuve de solitude. C'est pour cela que la
 *    conclusion s'appelle `aucune-seconde-instance-vue` et non `conforme` : un
 *    périmètre d'observation qu'on énonce comme une garantie est le défaut que
 *    cette prudence-là évite.
 *
 * ⚠️ IL N'APPELLE AUCUN RÉSEAU. Les observations lui sont DONNÉES. La collecte
 *    — interroger `/healthz` à intervalle régulier — appartient à
 *    l'exploitation, hors de ce dépôt : le socle ne sort pas de la machine tant
 *    que les prérequis du § 16 ne sont pas remplis, et une garde qui ouvrirait
 *    une connexion ne pourrait pas tourner en intégration continue.
 *
 * ⚠️ SI LE SOCLE PASSE UN JOUR À DEUX INSTANCES, LE § 20 EST À ROUVRIR AVANT.
 *    Pas après. C'est le cinquième endroit où cette phrase est écrite — avec
 *    `core/instance/verrou.ts`, `core/instance/index.ts`, l'ADR 0018 et le
 *    README — parce que celui qui ajoutera un réplica ne lira pas forcément les
 *    quatre autres.
 */

import type { EtatDuVerrou, SanteMonoInstance } from "../core/instance/verrou.js";
import {
  FORME_INSTANCE_ID,
  STATUT_HEALTHCHECK_VERROU_ABSENT,
  STATUT_HEALTHCHECK_VERROU_TENU,
} from "../core/instance/verrou.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE L'OBSERVATEUR REÇOIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE LECTURE DU HEALTHCHECK, HORODATÉE PAR L'OBSERVATEUR.
 *
 * ⚠️ `luA` EST L'HEURE DE L'OBSERVATEUR, PAS CELLE QUE LE SOCLE ANNONCE. Un
 *    socle dont l'horloge dérive — ou qu'on cherche justement à prendre en
 *    défaut — ne doit pas pouvoir décider tout seul si deux lectures se
 *    chevauchent. `demarreeA`, lui, vient du socle : c'est une DÉCLARATION, et
 *    le contrôle 2 ci-dessous la confronte à `luA` au lieu de la croire.
 *
 * ⚠️ `sante` EST LE TYPE DU SOCLE (`SanteMonoInstance`), pas une copie. Un champ
 *    ajouté au healthcheck arrive ici le jour même ; une copie aurait divergé.
 */
export interface ObservationSante {
  readonly sante: SanteMonoInstance;
  readonly luA: Date;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QU'IL REND
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES TROIS CONCLUSIONS POSSIBLES, ET AUCUNE NE S'APPELLE « CONFORME ».
 *
 * · `seconde-instance-vue`        — DEUX instances ont servi en même temps. Le
 *                                   § 20 s'applique une fois sur deux ; c'est le
 *                                   défaut, constaté.
 * · `aucune-seconde-instance-vue` — rien de tel n'a été VU. Ce n'est pas une
 *                                   preuve de solitude : voir la borne.
 * · `rien-mesuré`                 — moins de deux lectures. Un verdict sans
 *                                   mesure ne conclut rien, et il le dit.
 *
 * ⚠️ LE SEUL ÉTAT QUI PASSE est `aucune-seconde-instance-vue` AVEC zéro
 *    anomalie. `rien-mesuré` n'est pas un succès — c'est le collecteur qui est
 *    en panne, et un collecteur en panne ressemble en tout point à un socle
 *    sain.
 */
export const CONCLUSIONS_MONO_INSTANCE = [
  "seconde-instance-vue",
  "aucune-seconde-instance-vue",
  "rien-mesuré",
] as const;

export type ConclusionMonoInstance = (typeof CONCLUSIONS_MONO_INSTANCE)[number];

/** Combien de lectures il faut au minimum pour conclure quoi que ce soit. */
export const LECTURES_MINIMALES = 2;

/**
 * LA BORNE, RENDUE AVEC CHAQUE VERDICT.
 *
 * Elle n'est pas dans un commentaire : elle voyage AVEC le résultat, pour que
 * celui qui lit le verdict dans un journal d'exploitation lise la borne en même
 * temps que la conclusion. Une mesure et sa borne dans la même phrase.
 */
export const BORNE_DOBSERVATION =
  "Cet observateur DÉTECTE une seconde instance ; il ne prouve jamais qu'il n'y en a pas — " +
  "un répartiteur peut servir toutes les lectures depuis la même instance pendant qu'une " +
  "seconde sert le trafic. Si le socle passe à deux instances, le § 20 est à ROUVRIR AVANT.";

/** Ce qu'on sait d'une instance, sur toute la série d'observations. */
export interface FenetreInstance {
  readonly instanceId: string;
  /** `demarreeA`, tel que le socle le déclare. Début de la fenêtre de vie. */
  readonly vivanteDepuis: Date;
  /** Dernière lecture qui l'a vue. Fin de la fenêtre CONNUE, pas de sa vie. */
  readonly derniereLecture: Date;
  readonly lectures: number;
  /** Vrai si elle a annoncé `tenu` au moins une fois. */
  readonly aTenuLeVerrou: boolean;
  /** Dernier état du verrou vu. */
  readonly dernierVerrou: EtatDuVerrou;
  /** § 20 — le signal positif, au dernier compte vu. */
  readonly extraits: number;
  readonly sessions: number;
  /** Vrai si l'index a dû dégrader (saturation, éviction). */
  readonly indexIndetermine: boolean;
}

/** Ce que rend l'observation. JAMAIS un booléen. */
export interface VerdictMonoInstance {
  /** Combien de lectures ont été confrontées. */
  readonly observationsMesurees: number;
  /** Combien d'identifiants d'instance distincts y sont apparus. */
  readonly instancesDistinctes: number;
  /** Combien de PAIRES d'instances ont été confrontées. Zéro paire = aucun
   *  chevauchement mesurable, quel que soit le nombre de lectures. */
  readonly pairesConfrontees: number;
  /** Les chevauchements constatés, en clair. */
  readonly chevauchements: readonly string[];
  readonly fenetres: readonly FenetreInstance[];
  readonly conclusion: ConclusionMonoInstance;
  /** Les défauts. Une conclusion sans anomalie n'est pas un succès à elle
   *  seule : lire aussi `conclusion`. */
  readonly anomalies: readonly string[];
  /** Ce qui mérite d'être écrit sans être un défaut — les comptes du § 20. */
  readonly constats: readonly string[];
  /** {@link BORNE_DOBSERVATION}, rendue avec le verdict. */
  readonly borne: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'OBSERVATION
// ═════════════════════════════════════════════════════════════════════════════

/** Deux fenêtres se chevauchent-elles ? Bornes INCLUSES : deux instances vues
 *  à la même milliseconde servaient bien en même temps. */
function seChevauchent(a: FenetreInstance, b: FenetreInstance): boolean {
  return (
    a.vivanteDepuis.getTime() <= b.derniereLecture.getTime() &&
    b.vivanteDepuis.getTime() <= a.derniereLecture.getTime()
  );
}

/** État mutable accumulé pendant le parcours des lectures. */
interface Accumulateur {
  instanceId: string;
  vivanteDepuis: Date;
  derniereLecture: Date;
  lectures: number;
  aTenuLeVerrou: boolean;
  dernierVerrou: EtatDuVerrou;
  extraits: number;
  sessions: number;
  indexIndetermine: boolean;
}

/**
 * Confronte une série de lectures du healthcheck.
 *
 * ═══ LES SIX CONTRÔLES ═══
 *
 *  1. **La FORME de l'identifiant.** 32 caractères hexadécimaux (§ dépôt
 *     public) : la forme exclut mécaniquement un `pid`, un nom d'hôte ou une
 *     adresse, qui n'ont rien à faire dans une sortie publique.
 *  2. **L'horodatage.** Un socle qui se déclare démarré APRÈS l'instant où on
 *     l'a lu ment sur sa fenêtre de vie — et c'est exactement ce qu'il faudrait
 *     faire pour qu'aucun chevauchement n'apparaisse jamais.
 *  3. **L'identifiant réutilisé.** Il est frappé À CHAQUE démarrage : deux
 *     `demarreeA` différents sous le même identifiant rendent la détection
 *     aveugle, puisque deux exécutions y deviennent indiscernables.
 *  4. **La cohérence statut / verrou**, DÉRIVÉE de
 *     `STATUT_HEALTHCHECK_VERROU_*`. Un healthcheck qui rend 200 sans tenir le
 *     verrou est le pire cas : l'exploitant ne verra jamais rien.
 *  5. **Le chevauchement des fenêtres** — deux instances ont servi en même
 *     temps. C'est le constat que le lot demande.
 *  6. **Le verrou accordé DEUX FOIS** — parmi les instances qui se chevauchent,
 *     deux ont annoncé `tenu`. Contrôle 5 dit que deux socles tournent ;
 *     celui-ci dit que la garde de l'ADR 0018 n'a pas mordu, ce qui n'est pas
 *     le même incident et ne se répare pas du même geste.
 *
 * @param observations - les lectures, dans l'ordre où elles ont été faites.
 */
export function observerMonoInstance(
  observations: readonly ObservationSante[],
): VerdictMonoInstance {
  const anomalies: string[] = [];
  const constats: string[] = [];
  // L'ordre d'insertion est l'ordre de première apparition : le verdict se lit
  // dans l'ordre où l'exploitant a vu les choses.
  const parInstance = new Map<string, Accumulateur>();

  for (const [rang, observation] of observations.entries()) {
    const { sante, luA } = observation;
    const { instance } = sante;
    const rangLisible = String(rang + 1);

    // ── Contrôle 1 — la FORME de l'identifiant ──
    if (!FORME_INSTANCE_ID.test(instance.instanceId)) {
      anomalies.push(
        `lecture n° ${rangLisible} : l'identifiant d'instance ne respecte pas la forme attendue ` +
          "(32 caractères hexadécimaux). Cette forme n'est pas cosmétique — elle exclut " +
          "mécaniquement un `pid`, un nom d'hôte ou une adresse, qui n'ont rien à faire dans " +
          "une sortie publique (§ 29). Une valeur hors forme signale une sortie bricolée, donc " +
          "une comparaison d'instances qui ne veut plus rien dire.",
      );
    }

    // ── Contrôle 2 — l'horodatage ──
    if (instance.demarreeA.getTime() > luA.getTime()) {
      anomalies.push(
        `lecture n° ${rangLisible} : le socle se déclare démarré APRÈS l'instant où il a été lu. ` +
          "Sa fenêtre de vie est fausse — et c'est exactement ce qu'il faudrait falsifier pour " +
          "qu'aucun chevauchement n'apparaisse jamais.",
      );
    }

    // ── Contrôle 4 — la cohérence statut / verrou, DÉRIVÉE ──
    const statutAttendu =
      sante.verrou === "tenu" ? STATUT_HEALTHCHECK_VERROU_TENU : STATUT_HEALTHCHECK_VERROU_ABSENT;
    if (sante.statut !== statutAttendu) {
      anomalies.push(
        `lecture n° ${rangLisible} : le verrou est « ${sante.verrou} » et le healthcheck rend ` +
          `${String(sante.statut)} au lieu de ${String(statutAttendu)}. ` +
          (sante.statut === STATUT_HEALTHCHECK_VERROU_TENU
            ? "Un 200 sans verrou tenu est le pire des cas : la garde du § 20 est peut-être déjà " +
              "en train de ne s'appliquer qu'un appel sur deux, et l'exploitant ne verra rien."
            : "Un 503 alors que le verrou est tenu fait rougir un socle sain, et un rouge " +
              "permanent finit toujours par être désactivé."),
      );
    }

    const connue = parInstance.get(instance.instanceId);
    if (connue === undefined) {
      parInstance.set(instance.instanceId, {
        instanceId: instance.instanceId,
        vivanteDepuis: instance.demarreeA,
        derniereLecture: luA,
        lectures: 1,
        aTenuLeVerrou: sante.verrou === "tenu",
        dernierVerrou: sante.verrou,
        extraits: sante.provenance.extraits,
        sessions: sante.provenance.sessions,
        indexIndetermine: sante.provenance.indetermine,
      });
      continue;
    }

    // ── Contrôle 3 — l'identifiant réutilisé ──
    if (connue.vivanteDepuis.getTime() !== instance.demarreeA.getTime()) {
      anomalies.push(
        `lecture n° ${rangLisible} : l'identifiant « ${instance.instanceId} » a déjà été vu avec ` +
          "une AUTRE date de démarrage. Il est censé être frappé à chaque démarrage : deux " +
          "exécutions sous le même identifiant sont indiscernables, et la détection d'une " +
          "seconde instance devient aveugle sans qu'aucun compte ne bouge.",
      );
      // On garde la PREMIÈRE date : élargir la fenêtre sur une valeur qu'on
      // vient de déclarer fausse fabriquerait un chevauchement imaginaire.
    }

    connue.derniereLecture = luA;
    connue.lectures += 1;
    connue.aTenuLeVerrou = connue.aTenuLeVerrou || sante.verrou === "tenu";
    connue.dernierVerrou = sante.verrou;
    connue.extraits = sante.provenance.extraits;
    connue.sessions = sante.provenance.sessions;
    connue.indexIndetermine = connue.indexIndetermine || sante.provenance.indetermine;
  }

  const fenetres: readonly FenetreInstance[] = [...parInstance.values()].map((accumule) => ({
    instanceId: accumule.instanceId,
    vivanteDepuis: accumule.vivanteDepuis,
    derniereLecture: accumule.derniereLecture,
    lectures: accumule.lectures,
    aTenuLeVerrou: accumule.aTenuLeVerrou,
    dernierVerrou: accumule.dernierVerrou,
    extraits: accumule.extraits,
    sessions: accumule.sessions,
    indexIndetermine: accumule.indexIndetermine,
  }));

  // ── Contrôles 5 et 6 — les paires ──
  const chevauchements: string[] = [];
  let pairesConfrontees = 0;
  for (let i = 0; i < fenetres.length; i += 1) {
    for (let j = i + 1; j < fenetres.length; j += 1) {
      const a = fenetres[i];
      const b = fenetres[j];
      if (a === undefined || b === undefined) continue;
      pairesConfrontees += 1;
      if (!seChevauchent(a, b)) continue;

      chevauchements.push(
        `« ${a.instanceId} » et « ${b.instanceId} » ont servi EN MÊME TEMPS ` +
          `(${a.lectures} et ${b.lectures} lecture(s)). L'index de provenance du § 20 est local ` +
          "au processus : la garde d'exfiltration ne s'applique qu'à celui des deux qui sert " +
          "l'appel.",
      );

      if (a.aTenuLeVerrou && b.aTenuLeVerrou) {
        anomalies.push(
          `le verrou d'instance a été annoncé « tenu » par « ${a.instanceId} » ET par ` +
            `« ${b.instanceId} », dont les fenêtres se chevauchent. La garde de l'ADR 0018 n'a ` +
            "pas mordu : ce n'est plus seulement un second socle, c'est le verrou lui-même qui " +
            "a accordé deux fois — et redémarrer une instance n'y changerait rien.",
        );
      }
    }
  }
  for (const chevauchement of chevauchements) anomalies.push(chevauchement);

  // ── § 20 — le signal positif, écrit même à zéro ──
  for (const fenetre of fenetres) {
    constats.push(
      `instance « ${fenetre.instanceId} » : ${String(fenetre.lectures)} lecture(s), ` +
        `${String(fenetre.extraits)} extrait(s) indexé(s) sur ${String(fenetre.sessions)} ` +
        `session(s) marquée(s), verrou « ${fenetre.dernierVerrou} »` +
        (fenetre.indexIndetermine
          ? " — ⚠️ l'index a DÉGRADÉ : une éviction rend la provenance indéterminée"
          : ""),
    );
  }

  const conclusion: ConclusionMonoInstance =
    observations.length < LECTURES_MINIMALES
      ? "rien-mesuré"
      : chevauchements.length > 0
        ? "seconde-instance-vue"
        : "aucune-seconde-instance-vue";

  if (conclusion === "rien-mesuré") {
    constats.push(
      `${String(observations.length)} lecture(s) fournie(s), ${String(LECTURES_MINIMALES)} ` +
        "attendue(s) au minimum. Ce n'est PAS une conformité : c'est une absence de mesure, et " +
        "un collecteur en panne ressemble en tout point à un socle sain.",
    );
  }

  return {
    observationsMesurees: observations.length,
    instancesDistinctes: fenetres.length,
    pairesConfrontees,
    chevauchements,
    fenetres,
    conclusion,
    anomalies,
    constats,
    borne: BORNE_DOBSERVATION,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA MOITIÉ « DÉPLOIEMENT »
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE NOMBRE DE RÉPLIQUES ADMIS. UN. Pas « un par défaut » : UN.
 *
 * ⚠️ AUCUN MANIFESTE DE DÉPLOIEMENT NE VIT DANS CE DÉPÔT — ni composition, ni
 *    manifeste d'orchestrateur : le réglage se fait dans l'interface de
 *    l'hébergeur (ADR 0018, conséquence 2). Ce module ne peut donc RIEN lire
 *    tout seul, et il ne prétend pas le contraire : il expose la règle et sait
 *    la confronter à une valeur qu'on lui donne. Le jour où un manifeste entre
 *    dans le dépôt, c'est ici qu'il se lit — et la garde qui compte « 0 fichier
 *    mesuré » deviendra une garde qui en mesure un.
 */
export const REPLIQUES_ADMISES = 1;

/** Ce que rend la confrontation d'un réglage de déploiement. */
export interface VerdictRepliques {
  readonly repliquesDeclarees: number;
  readonly repliquesAdmises: number;
  readonly anomalies: readonly string[];
}

/**
 * Confronte un nombre de répliques à la règle.
 *
 * @param repliques - la valeur réglée chez l'hébergeur, RELEVÉE À LA MAIN. Le
 *   dépôt ne la connaît pas ; la lui donner est un geste d'exploitation.
 */
export function verifierRepliques(repliques: number): VerdictRepliques {
  const anomalies: string[] = [];

  if (!Number.isInteger(repliques) || repliques < 0) {
    anomalies.push(
      `« ${String(repliques)} » n'est pas un nombre de répliques : la valeur relevée est ` +
        "illisible, donc rien n'a été vérifié.",
    );
  } else if (repliques > REPLIQUES_ADMISES) {
    anomalies.push(
      `${String(repliques)} réplique(s) déclarée(s) pour ${String(REPLIQUES_ADMISES)} admise(s). ` +
        "L'index de provenance du § 20 est local au processus : au-delà d'une instance, la " +
        "garde d'exfiltration ne s'applique qu'à celle qui sert l'appel, et aucun compte ne le " +
        "dit. LE § 20 EST À ROUVRIR AVANT d'ajouter un réplica, pas après.",
    );
  } else if (repliques < REPLIQUES_ADMISES) {
    anomalies.push(
      `${String(repliques)} réplique(s) déclarée(s) : le socle ne sert plus. Ce n'est pas un ` +
        "défaut de sûreté, mais ce n'est pas non plus le réglage attendu.",
    );
  }

  return { repliquesDeclarees: repliques, repliquesAdmises: REPLIQUES_ADMISES, anomalies };
}

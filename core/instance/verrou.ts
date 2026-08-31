/**
 * `core/instance/verrou.ts` — LE SOCLE EST MONO-INSTANCE, ET UNE GARDE LE TIENT.
 *
 * ⚠️ CE QUE CE FICHIER PORTE, ET CE QU'IL NE PORTE PAS. Le lot 1c l'a posé en
 *    DÉCLARATIONS SEULES ; le lot 1d y a cousu la moitié « EMPÊCHER » de l'ADR
 *    0018 — l'identité frappée, l'arbitre PUR du démarrage et la dérivation du
 *    statut de healthcheck. Le double en mémoire du port vit dans
 *    `core/instance/memoire.ts`, la séquence de démarrage dans
 *    `core/instance/demarrage.ts`, et **l'adaptation Postgres reste à écrire** :
 *    elle attend `core/transport/`, qui n'existe pas. Voir **ADR 0018**.
 *
 * ═══ LE DÉFAUT QUE CE FICHIER FERME ═══
 *
 * L'index de provenance du § 20 (`IndexProvenanceMemoire`) est **local au
 * processus**. Le § 20 l'exige — « un index EN MÉMOIRE […] jamais persistée » —
 * et le § 23 ne décrit qu'un conteneur. Mais rien, dans le dépôt, n'INTERDISAIT
 * d'en démarrer un second : deux instances derrière un répartiteur appliqueraient
 * la garde d'exfiltration **une fois sur deux**, selon celle qui sert l'appel, et
 * AUCUN compte ne le dirait. Une session marquée sur l'instance A arrive propre
 * sur l'instance B ; l'étape 11 laisse passer, en restant verte.
 *
 * C'est le même mode de panne que le renouvellement de session (ADR 0014), par un
 * autre chemin : la marque existe, elle est cherchée au mauvais endroit.
 *
 * ═══ LA DÉCISION ═══
 *
 * **Le socle reste mono-instance en v1.** C'est un outil personnel, à un seul
 * utilisateur (§ 01) ; un magasin partagé serait de la complexité sans besoin, et
 * il déplacerait la garde du § 20 hors du processus qui la tient.
 *
 * Une décision qu'aucune garde ne tient n'est qu'une intention. Celle-ci en a
 * deux, et elles ne se remplacent pas :
 *
 *  1. **AU DÉMARRAGE** — un verrou EXCLUSIF est pris avant de servir quoi que ce
 *     soit. S'il est déjà tenu, le conteneur NE DÉMARRE PAS, comme pour un coffre
 *     absent (§ 23). Le message nomme le détenteur par son {@link InstanceDuSocle}
 *     — jamais par une adresse, un conteneur ou un hôte : ce dépôt est PUBLIC.
 *  2. **EN CONTINU** — le healthcheck RELIT le verrou à chaque appel et rend 503
 *     dès qu'il n'est plus tenu. Un verrou perdu en cours de vie (la connexion au
 *     magasin est tombée, donc le verrou a pu être repris ailleurs) est la seule
 *     forme de ce défaut qu'un contrôle de démarrage ne voit pas.
 *
 * ⚠️ POURQUOI 503, ALORS QU'UN COFFRE VERROUILLÉ REND 200. Les deux états ne
 *    disent pas la même chose au déploiement. Un coffre verrouillé est l'état
 *    NORMAL après chaque déploiement (§ 23) : le faire rougir apprendrait à
 *    ignorer le rouge. Un verrou perdu dit que la garde du § 20 est peut-être
 *    DÉJÀ en train de ne s'appliquer qu'un appel sur deux — c'est-à-dire le
 *    défaut lui-même, en train de se produire. Il doit rougir.
 *
 * ═══ CE QUE LE VERROU N'EST PAS ═══
 *
 * Ce n'est pas un cache, ni un magasin partagé, ni un début de mise à l'échelle.
 * Il ne porte AUCUNE donnée : un identifiant d'instance frappé au démarrage, et
 * rien d'autre. L'index de provenance reste strictement en mémoire, et le
 * § 31 reste tenu.
 */

import { randomBytes } from "node:crypto";

import type { EtatIndexProvenance } from "../chaine/etape-11-provenance.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'IDENTITÉ D'UNE INSTANCE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Longueur en octets de l'identifiant d'instance. 16 octets = 128 bits, frappés
 * à CHAQUE démarrage : deux exécutions successives du même conteneur portent des
 * identifiants différents, ce qui est exactement ce qu'on veut voir quand on
 * cherche à savoir si le processus a redémarré.
 */
export const OCTETS_INSTANCE_ID = 16;

/** La forme admise : 32 caractères hexadécimaux minuscules, ancrée aux deux bouts. */
export const FORME_INSTANCE_ID = /^[0-9a-f]{32}$/;

/**
 * QUI TIENT LE VERROU.
 *
 * ⚠️ CE QUI N'Y ENTRE PAS, ET C'EST UNE RÈGLE DE DÉPÔT PUBLIC : ni nom d'hôte,
 *    ni adresse, ni identifiant de conteneur, ni `pid`. L'identifiant d'instance
 *    est OPAQUE et suffit à répondre à la seule question que le healthcheck pose
 *    — « est-ce toujours MOI qui tiens le verrou ? ». Le `pid` du système, qui
 *    n'ajoute rien à cette réponse, reste hors de toute sortie publique.
 */
export interface InstanceDuSocle {
  /** Frappé au démarrage. Change à chaque exécution. */
  readonly instanceId: string;
  /** Quand cette exécution a pris le verrou. */
  readonly demarreeA: Date;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ÉTAT DU VERROU
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES QUATRE ÉTATS, DU PLUS SAIN AU PLUS MUET.
 *
 * · `tenu`         — cette instance-ci le tient. Le seul état qui sert.
 * · `refusé`       — une autre instance le tenait au moment du démarrage.
 * · `perdu`        — il a été tenu, il ne l'est plus. Une autre instance a PU le
 *                    reprendre : c'est l'état où la garde du § 20 est douteuse.
 * · `indisponible` — le magasin de verrous n'a pas répondu. Le socle ne sait pas,
 *                    donc il ne prétend rien.
 *
 * ⚠️ `perdu` ET `indisponible` NE SE CONFONDENT PAS, et c'est le même motif que
 *    `absent` / `verrouillé` au § 23 : ils ne se réparent pas du même geste. Un
 *    verrou perdu se répare en redémarrant l'instance ; un magasin indisponible
 *    se répare en réparant le magasin, et redémarrer n'y changerait rien.
 */
export const ETATS_DU_VERROU = ["tenu", "refusé", "perdu", "indisponible"] as const;

export type EtatDuVerrou = (typeof ETATS_DU_VERROU)[number];

/**
 * Les états où le socle NE PEUT PAS affirmer qu'il est seul. DÉRIVÉS : tout sauf
 * `tenu`. Un état nouveau tombe du bon côté sans qu'aucune liste soit retouchée
 * — et c'est le côté fail-closed.
 */
export const ETATS_SANS_EXCLUSIVITE: readonly EtatDuVerrou[] = ETATS_DU_VERROU.filter(
  (etat) => etat !== "tenu",
);

/** Ce que rend une tentative d'acquisition. */
export interface ResultatAcquisition {
  readonly etat: EtatDuVerrou;
  /** L'instance qui vient de prendre le verrou, ou `null` si elle ne l'a pas. */
  readonly instance: InstanceDuSocle | null;
  /**
   * L'instance qui le tenait, quand le magasin sait le dire, sinon `null`.
   *
   * ⚠️ ELLE PEUT ÊTRE `null` MÊME EN `refusé`. Un verrou consultatif Postgres ne
   *    nomme pas son détenteur ; le magasin peut ne rien savoir de plus que
   *    « quelqu'un ». Le message doit rester juste dans ce cas : « une autre
   *    instance », pas un identifiant inventé.
   */
  readonly detenteur: InstanceDuSocle | null;
  /** Ce qu'il faut faire ensuite (§ 15, deuxième règle). */
  readonly message: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE PORT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LE DOMAINE DU VERROU — la chaîne dont la clé du magasin DÉRIVE.
 *
 * ⚠️ ELLE EST VERSIONNÉE, ET C'EST DÉLIBÉRÉ. Le jour où la sémantique du verrou
 *    change — deux instances admises, une par transport, peu importe —, la
 *    version change, et une ancienne instance ne bloque pas une nouvelle par
 *    accident. Une clé numérique écrite à la main, elle, aurait été recopiée
 *    dans une migration et aurait divergé en silence.
 *
 * La clé effective se DÉRIVE de cette chaîne (empreinte, tronquée à la largeur
 * que le magasin accepte) ; elle ne s'écrit nulle part en dur.
 */
export const DOMAINE_DU_VERROU = "axion-ops:instance-unique:v1";

/**
 * LE MAGASIN DE VERROUS — un port, comme `JournalStore` ou `CatalogueOutils`.
 *
 * ⚠️ `core/` NE CONNAÎT NI PRISMA NI SQL. Le verrou retenu est un verrou
 *    CONSULTATIF de session Postgres (ADR 0018) : il se libère tout seul quand la
 *    connexion tombe, ce qui est la propriété qui compte — un socle tué par
 *    `SIGKILL` ne laisse pas un verrou orphelin qui empêcherait tout redémarrage.
 *    Mais ce fait-là appartient à l'adaptation, pas à ce fichier : un double en
 *    mémoire doit pouvoir tenir le même contrat, sans quoi la garde ne serait
 *    éprouvable qu'avec une base.
 */
export interface VerrouDInstance {
  /**
   * Prend le verrou, ou dit pourquoi il ne l'a pas.
   *
   * ⚠️ ELLE NE LÈVE PAS SUR UN MAGASIN INJOIGNABLE — elle rend `indisponible`.
   *    Une exception ici serait indiscernable d'un défaut de câblage, et c'est
   *    `deciderDemarrageMonoInstance` qui doit trancher ce que le socle en fait.
   */
  acquerir(): Promise<ResultatAcquisition>;

  /**
   * RELIT l'état du verrou. C'est ce que le healthcheck appelle, à chaque appel.
   *
   * ⚠️ ELLE RELIT, ELLE NE SE SOUVIENT PAS. Rendre un drapeau posé à
   *    l'acquisition ferait une garde verte pour la pire des raisons : elle
   *    répondrait « tenu » exactement dans le cas où le verrou vient d'être perdu.
   */
  relire(): Promise<EtatDuVerrou>;

  /** Rend le verrou. Appelée à l'arrêt propre ; jamais nécessaire à la sûreté. */
  liberer(): Promise<void>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LA DÉCISION DE DÉMARRAGE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que l'état du verrou décide au démarrage — même forme que
 * `DecisionDeDemarrage` de `core/vault/demarrage.ts`, et pour le même motif :
 * la décision est PURE, elle se couvre sur les quatre états sans monter un socle,
 * et l'entrée du conteneur n'a rien à recalculer.
 *
 * ⚠️ UN SEUL ÉTAT DÉMARRE. Les trois autres refusent, y compris `indisponible` :
 *    le socle qui ne peut pas savoir s'il est seul ne peut pas non plus
 *    journaliser (le § 11 fait de l'écriture du journal un invariant fail-closed,
 *    et le journal vit dans la même base). Un troisième régime « démarre mais
 *    n'accepte aucun appel » aurait ajouté un état sans ajouter une capacité.
 */
export interface DecisionDeDemarrageMonoInstance {
  readonly etat: EtatDuVerrou;
  readonly demarre: boolean;
  /** Le code que rend `/healthz`. `null` quand le processus ne vit pas. */
  readonly statutHealthcheck: number | null;
  readonly message: string;
}

/**
 * LE STATUT DU HEALTHCHECK EN CONTINU — 200 tenu, 503 sinon.
 *
 * Écrit ici, à UN seul endroit, pour que la garde de déploiement de l'ADR 0018 le
 * DÉRIVE au lieu de le recopier : une garde qui porte elle-même sa table est
 * verte pour une mauvaise raison le jour où la table change d'un seul côté.
 */
export const STATUT_HEALTHCHECK_VERROU_TENU = 200;
export const STATUT_HEALTHCHECK_VERROU_ABSENT = 503;

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE HEALTHCHECK EXPOSE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LA SANTÉ MONO-INSTANCE, telle que le healthcheck (§ 22, écran Santé) la rend.
 *
 * ⚠️ LES DEUX COMPTES VONT ENSEMBLE, ET C'EST TOUT L'INTÉRÊT. Le § 20 exige déjà
 *    que le healthcheck expose « le nombre d'extraits indexés — signal positif,
 *    pour qu'une garde à zéro élément se voie ». Ce compte, SEUL, ne distingue
 *    pas « aucune session marquée » de « je regarde le mauvais index parce qu'une
 *    autre instance sert la moitié des appels ». L'identifiant d'instance à côté
 *    du compte le distingue : deux instances servent deux identifiants, et deux
 *    comptes qui bougent chacun de leur côté.
 *
 * ⚠️ LES COMPTES DE PROVENANCE SONT DÉRIVÉS D'`EtatIndexProvenance`, jamais
 *    recopiés. Un champ ajouté là-bas — une saturation de plus à voir — arrive
 *    ici le jour même. Les trois retenus sont ceux qui disent si la garde MORD :
 *    ce qu'elle tient, sur combien de sessions, et si elle a dû dégrader.
 */
export interface SanteMonoInstance {
  readonly instance: InstanceDuSocle;
  readonly verrou: EtatDuVerrou;
  readonly provenance: Pick<EtatIndexProvenance, "extraits" | "sessions" | "indetermine">;
  /** {@link STATUT_HEALTHCHECK_VERROU_TENU} ou {@link STATUT_HEALTHCHECK_VERROU_ABSENT}. */
  readonly statut: number;
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'IDENTITÉ, FRAPPÉE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * FRAPPE UNE IDENTITÉ D'INSTANCE — 16 octets d'aléa, rendus en hexadécimal.
 *
 * ⚠️ AUCUNE ENTRÉE DU SYSTÈME N'Y ENTRE, ET C'EST LA RÈGLE DE DÉPÔT PUBLIC. Ni
 *    `pid`, ni nom d'hôte, ni identifiant de conteneur : la seule question que
 *    cet identifiant sert à trancher est « est-ce toujours MOI ? », et l'aléa y
 *    répond aussi bien qu'un identifiant système — sans rien publier.
 *
 * ⚠️ `demarreeA` EST INJECTABLE, comme l'`Horloge` de `core/audit`. Une garde
 *    qui lirait l'heure réelle échoue un jour de bascule, et personne ne sait
 *    pourquoi.
 */
export function frapperInstance(demarreeA: Date = new Date()): InstanceDuSocle {
  return { instanceId: randomBytes(OCTETS_INSTANCE_ID).toString("hex"), demarreeA };
}

// ═════════════════════════════════════════════════════════════════════════════
//  L'ARBITRE DU DÉMARRAGE — LA MOITIÉ « EMPÊCHER » DE L'ADR 0018
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CE QUE CHAQUE ÉTAT FAIT DIRE AU SOCLE. UNE TABLE, PAS UNE SUITE DE `if`.
 *
 * ⚠️ LE TYPE `Record<EtatDuVerrou, string>` EST LA GARDE, ET ELLE TIENT À LA
 *    COMPILATION. Un cinquième état ajouté à {@link ETATS_DU_VERROU} rend
 *    `tsc --noEmit` rouge ici, avant qu'aucun test ne tourne : c'est la seule
 *    forme de garde qu'on ne peut pas oublier d'exécuter.
 *
 * ⚠️ LE MESSAGE NOMME LE GESTE, JAMAIS UN IDENTIFIANT D'INFRASTRUCTURE (§ 25,
 *    « le message nomme la commande » ; § 29, dépôt public). Aucun nom d'hôte,
 *    aucune adresse, aucun nom de service ne doit entrer ici : ces messages
 *    sortent par le healthcheck et par les journaux d'exploitation.
 */
const MESSAGE_DE_DEMARRAGE: Record<EtatDuVerrou, string> = {
  tenu:
    "Verrou d'instance TENU : ce socle est seul à servir. Nominal — et c'est la condition " +
    "sous laquelle la garde d'exfiltration du § 20 s'applique à tous les appels, puisque " +
    "l'index de provenance est local au processus.",
  refusé:
    "Verrou d'instance REFUSÉ : une autre instance le tenait déjà. LE SOCLE NE DÉMARRE PAS. " +
    "Arrêter l'instance en place, ou ramener le déploiement à UNE seule réplique — un " +
    "déploiement en recouvrement fait précisément échouer ce démarrage-ci, et c'est le " +
    "comportement voulu. Ne jamais contourner en désactivant le verrou : à deux instances, " +
    "la garde du § 20 ne s'applique qu'à celle qui sert l'appel, et aucun compte ne le dit. " +
    "LE § 20 EST À ROUVRIR AVANT d'ajouter un réplica, pas après.",
  perdu:
    "Verrou d'instance PERDU : il a été tenu, il ne l'est plus, et une autre instance a pu " +
    "le reprendre. LE SOCLE NE DÉMARRE PAS, et un socle déjà démarré doit être REDÉMARRÉ — " +
    "c'est le geste qui répare cet état-là, et lui seul.",
  indisponible:
    "Magasin de verrous INJOIGNABLE : le socle ne peut pas savoir s'il est seul, donc il " +
    "n'affirme rien et NE DÉMARRE PAS. Réparer le magasin ; redémarrer n'y changerait rien. " +
    "Un régime « démarre mais n'accepte aucun appel » n'existe pas : le journal vit dans la " +
    "même base et le § 11 en fait un invariant fail-closed — un socle qui ne peut pas " +
    "journaliser n'a rien à servir.",
};

/**
 * CE QUE L'ÉTAT DU VERROU DÉCIDE AU DÉMARRAGE. **PURE.**
 *
 * Même forme et même motif que `decisionDeDemarrage` de
 * `core/vault/demarrage.ts` : la décision se couvre sur les QUATRE états sans
 * monter un socle ni une base, et l'entrée du conteneur n'a rien à recalculer —
 * elle applique. Une décision prise à deux endroits est une décision qui
 * divergera.
 *
 * ⚠️ `demarre` EST DÉRIVÉ D'{@link ETATS_SANS_EXCLUSIVITE}, JAMAIS ÉCRIT À LA
 *    MAIN. C'est ce qui fait tomber un état NOUVEAU du côté fail-closed le jour
 *    où il est ajouté, sans qu'aucune liste ne soit retouchée : un socle qui ne
 *    sait pas s'il est seul ne peut pas non plus journaliser.
 *
 * ⚠️ `statutHealthcheck` VAUT `null` SUR LES TROIS REFUS, et ce n'est pas un
 *    oubli : le processus ne vit pas, il n'y a aucun healthcheck à rendre. Le
 *    503 de l'ADR 0018 est le statut du verrou PERDU EN COURS DE VIE — il se lit
 *    par {@link statutHealthcheckPourVerrou}, appelé à chaque lecture, et non
 *    ici.
 */
export function deciderDemarrageMonoInstance(etat: EtatDuVerrou): DecisionDeDemarrageMonoInstance {
  const demarre = !ETATS_SANS_EXCLUSIVITE.includes(etat);
  return {
    etat,
    demarre,
    statutHealthcheck: demarre ? STATUT_HEALTHCHECK_VERROU_TENU : null,
    message: MESSAGE_DE_DEMARRAGE[etat],
  };
}

/**
 * LE STATUT DU HEALTHCHECK EN CONTINU, DÉRIVÉ DE L'ÉTAT RELU.
 *
 * ⚠️ UN SEUL ENDROIT DÉRIVE CETTE TABLE. `ops/mono-instance.ts` la recalcule
 *    aujourd'hui dans son contrôle 4 (`sante.verrou === "tenu" ? … : …`) : deux
 *    dérivations du même fait, qui se contrediront le jour où l'une des deux
 *    changera. Écart porté au rapport du lot ; ce fichier-ci est la source.
 */
export function statutHealthcheckPourVerrou(etat: EtatDuVerrou): number {
  return etat === "tenu" ? STATUT_HEALTHCHECK_VERROU_TENU : STATUT_HEALTHCHECK_VERROU_ABSENT;
}

/**
 * La décision pour CHACUN des quatre états. DÉRIVÉ d'{@link ETATS_DU_VERROU} :
 * ajouter un état allonge cette liste sans qu'aucune énumération ne soit à
 * retoucher — et fait rougir les gardes qui comptent, ce qui est le but.
 */
export function decisionsPourTousLesEtatsDuVerrou(): readonly DecisionDeDemarrageMonoInstance[] {
  return ETATS_DU_VERROU.map(deciderDemarrageMonoInstance);
}

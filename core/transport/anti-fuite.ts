/**
 * `core/transport/anti-fuite.ts` — **LE DERNIER FILET, UN SEUL, POUR LES DEUX
 * FILS. ADR 0044, § 20.**
 *
 * ═══ LE DÉFAUT MESURÉ QUE CE MODULE EXISTE POUR FERMER ═══
 *
 * Le § 20 exige que le jeton de confirmation ne paraisse « **jamais** dans la
 * réponse d'erreur ». Il ne distingue pas le transport. Or le filet vivait dans
 * `core/transport/http/reponse.ts`, et la mesure transcrite au lot 4 était
 * celle-ci : **2 occurrences hors gardes** — sa définition, et **un seul appel
 * de production**, `core/transport/http/transport.ts`. **Rien sous
 * `core/transport/stdio/`** : 6 modules de production balayés, 0 appelant.
 *
 * Le fil stdio sert pourtant le **même noyau** (ADR 0025), **accepte et
 * transporte le même jeton de confirmation**, et n'avait aucun équivalent. Le
 * filet couvrait un transport sur deux, et c'est le mot « jamais » du § 20 qui
 * devenait faux.
 *
 * ⚠️ **UN SEUL FILET, DEUX APPELANTS — JAMAIS DEUX ÉCRITURES.** C'est la leçon
 *    déjà payée par `core/transport/valeurs-servies.ts` (ADR 0037, § 4) : deux
 *    dérivations d'un même fait finissent par se contredire, et c'est la seconde
 *    qui ne suit jamais. Écrire un second filet pour stdio aurait refait ce
 *    défaut, à l'endroit exact où il coûte le plus cher.
 *
 * ═══ CE QU'IL PREND : LA RÉPONSE **SÉRIALISÉE**, ET LE NOM DU FIL ═══
 *
 * {@link verifierAucuneFuite} ne reçoit plus une `ReponseHttp` — elle reçoit
 * **ce que le transport va réellement écrire sur le fil** : une chaîne, et le
 * nom de ce qui l'a produite ({@link SortieServie}). Confronter l'objet AVANT
 * sérialisation laisserait passer une valeur qu'un sérialiseur recopierait dans
 * un champ d'erreur — et c'est précisément le chemin d'exception, celui qu'on
 * garde le moins.
 *
 * ⚠️ **UN FILET QUI N'A RIEN CONFRONTÉ SE VOIT, ET C'EST TOUT — LA NUANCE EST
 *    IMPORTANTE.** `valeursConfrontees` est incrémenté DANS la boucle et
 *    EXPOSÉ des deux côtés : `TraceDeTraitement.fuite` en HTTP,
 *    `MesuresDuServeurStdio.valeursConfrontees` en stdio. Un filet qui aurait
 *    regardé zéro valeur est donc LISIBLE.
 *
 * 🔴 **ÉCART SIGNALÉ, ET IL EST HÉRITÉ.** La prose de l'ADR 0033, reprise par
 *    l'ADR 0044 § 4, affirme qu'« un `reponseSansFuite` refuse d'expédier une
 *    réponse dont le filet n'a confronté aucune valeur alors qu'on lui en a
 *    nommé ». **Ce symbole n'existe nulle part dans ce dépôt**, et aucun des
 *    deux transports ne refuse pour ce motif : ils ne remplacent la réponse que
 *    sur une fuite CONSTATÉE. La propriété est donc tenue par une GARDE —
 *    `anti-fuite.spec.ts`, § « TÉMOIN INVERSE », qui exige des deux fils un
 *    compte de valeurs confrontées non nul — et pas par la production. Écrire
 *    l'inverse ici aurait fait croire à un verrou qui n'a jamais existé.
 *
 * ═══ LES BORNES, ÉCRITES AVEC LA MESURE ═══
 *
 * ⚠️ **LE FILET COMPARE DES CHAÎNES, ET RIEN D'AUTRE.** Une valeur sensible qui
 *    sortirait TRANSFORMÉE — tronquée, ré-encodée en base64 ou en URL, hachée
 *    puis affichée — lui échappe entièrement. C'est un **plancher** de
 *    détection, jamais une preuve d'absence de fuite. Ce n'est pas un détecteur
 *    de contenu ; c'en est le contraire, et c'est ce qui le rend fiable : il
 *    répond à « cette valeur-CI, que l'appelant vient d'envoyer, est-elle
 *    ressortie ? », question à laquelle on peut répondre exactement.
 *
 * ⚠️ **IL ÉCARTE LES VALEURS TROP COURTES, EN LES COMPTANT.** Confronter une
 *    valeur de trois caractères ferait rougir la garde sur une coïncidence —
 *    « id », « ok » — et le remède qu'on chercherait à cette fausse alerte
 *    serait de la désactiver. `valeursEcartees` dit combien n'ont pas été
 *    confrontées, pour que la borne soit LUE et non seulement écrite.
 *
 * ⚠️ **LE NOM D'OUTIL EST EXCLU DE LA CONFRONTATION, DÉLIBÉRÉMENT.** Le § 15
 *    exige au contraire que `tool_disabled` « dise qu'il existe, et où
 *    l'activer ». Le confronter ferait rougir la garde sur le comportement
 *    prescrit — et le remède qu'on chercherait serait de la désarmer.
 */

import type { Transport } from "../chaine/orchestrateur.js";

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUE LE FILET REÇOIT, ET CE QU'IL REND
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

/** Au-delà, on cesse de collecter : une charge utile n'est pas un inventaire. */
export const MAX_ARGUMENTS_CONFRONTES = 64;

/** Profondeur maximale du parcours d'`input`. Une charge cyclique ne boucle pas. */
export const PROFONDEUR_MAX_ARGUMENTS = 8;

/** Une valeur sensible de la requête, NOMMÉE — et le nom seul sort d'ici. */
export interface ValeurSensible {
  readonly nom: string;
  readonly valeur: string;
}

/**
 * CE QU'UN TRANSPORT S'APPRÊTE À ÉCRIRE SUR LE FIL.
 *
 * ⚠️ **`texte` EST LA FORME SÉRIALISÉE, DÉLIMITEURS ET EN-TÊTES COMPRIS.** Pour
 *    HTTP, c'est le statut, les en-têtes et le corps ; pour stdio, la trame
 *    JSON-RPC telle que `serialiser()` la rend. Un défi `WWW-Authenticate`, un
 *    `Retry-After` ou un en-tête de corrélation sortent aussi sûrement qu'un
 *    corps, et se journalisent plus facilement.
 *
 * ⚠️ **`transport` N'EST PAS DÉCORATIF.** C'est lui qui permet à la garde
 *    d'annoncer LEQUEL des deux fils elle vient de confronter : une garde qui
 *    n'aurait éprouvé qu'un seul fil n'aurait rien vu du défaut de l'ADR 0044.
 */
export interface SortieServie {
  readonly transport: Transport;
  readonly texte: string;
}

/** Ce que le filet rend. Des NOMBRES, et des NOMS de valeurs — jamais les valeurs. */
export interface VerdictDeFuite {
  /** Le fil confronté. Il voyage avec le verdict, pour que le compte se nomme. */
  readonly transport: Transport;
  /** Combien de valeurs sensibles ont été RÉELLEMENT confrontées. */
  readonly valeursConfrontees: number;
  /** Combien ont été écartées comme trop courtes pour être distinguables. */
  readonly valeursEcartees: number;
  /** Les NOMS des valeurs retrouvées dans la réponse. Jamais leur contenu. */
  readonly fuites: readonly string[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  LES VALEURS SENSIBLES D'UN APPEL — DÉRIVÉES UNE FOIS POUR LES DEUX FILS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'appel, réduit à ce que le filet doit confronter.
 *
 * ⚠️ **`nomComplet` N'EN FAIT PAS PARTIE, ET C'EST LA RAISON D'ÊTRE DE CE
 *    TYPE-CI PLUTÔT QUE D'`AppelEntrant`.** Un type qui porterait le nom d'outil
 *    inviterait le prochain lecteur à l'ajouter à la confrontation, ce que le
 *    § 15 interdit. `AppelEntrant` reste structurellement acceptable ici : c'est
 *    lui que les deux transports passent.
 */
export interface AppelConfronte {
  readonly jetonDeConfirmation: string | null;
  readonly idempotencyKey: string | null;
  readonly curseur: string | null;
  readonly input: unknown;
}

/**
 * LES TROIS CANAUX DE PROTOCOLE QUE LE § 20 NOMME, ET LEUR LECTURE.
 *
 * ⚠️ **C'EST UNE TABLE, PAS TROIS `if`.** Le compte des canaux se dérive d'elle
 *    ({@link NOMS_DES_CANAUX_SENSIBLES}) : la garde qui annonce « 3 canaux de
 *    protocole confrontés » ne recopie donc aucune liste, et un quatrième canal
 *    ajouté ici est confronté par les deux transports sans qu'une ligne bouge
 *    ailleurs.
 */
const CANAUX_SENSIBLES: readonly {
  readonly nom: string;
  readonly lire: (appel: AppelConfronte) => string | null;
}[] = [
  // ⚠️ LE JETON DE CONFIRMATION EST EN TÊTE, ET IL EST LE MOTIF DE L'ADR 0044 :
  //    le § 20 interdit nommément qu'il reparaisse dans une réponse d'erreur, et
  //    le transport est le seul endroit du socle qui puisse le vérifier.
  { nom: "jeton de confirmation", lire: (appel) => appel.jetonDeConfirmation },
  { nom: "clé d'idempotence", lire: (appel) => appel.idempotencyKey },
  { nom: "curseur", lire: (appel) => appel.curseur },
];

/** Les noms des canaux de protocole confrontés. DÉRIVÉS de la table ci-dessus. */
export const NOMS_DES_CANAUX_SENSIBLES: readonly string[] = CANAUX_SENSIBLES.map(
  (canal) => canal.nom,
);

/**
 * COLLECTE LES CHAÎNES D'UN `input`, POUR LES CONFRONTER À LA RÉPONSE.
 *
 * ⚠️ **CE N'EST PAS UNE INSPECTION DE CONTENU, C'EST L'INVERSE.** On ne demande
 *    pas « cette valeur est-elle personnelle ? » — question à laquelle personne
 *    ne sait répondre — mais « cette valeur-CI, que l'appelant vient d'envoyer,
 *    est-elle ressortie dans la réponse ? ». C'est exactement répondable, et
 *    c'est ce que le § 15 interdit.
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

/**
 * LES VALEURS SENSIBLES D'UN APPEL, **DÉRIVÉES UNE FOIS POUR LES DEUX FILS.**
 *
 * ⚠️ **C'EST CETTE FONCTION QUI REND L'ÉQUIVALENCE DES TRANSPORTS MESURABLE.**
 *    Tant que chaque transport composait sa propre liste, « la même entrée sur
 *    les deux fils » n'était qu'une phrase : rien ne garantissait que les deux
 *    confrontent les mêmes valeurs, et l'un pouvait oublier le jeton de
 *    confirmation sans qu'aucun compte ne bouge. Ici, la liste est UNE, et
 *    chaque transport n'y AJOUTE que ce qui lui est propre — l'en-tête `Host` et
 *    le jeton porteur pour HTTP, qui n'existent pas sur stdio.
 */
export function valeursSensiblesDeLAppel(appel: AppelConfronte): readonly ValeurSensible[] {
  const sensibles: ValeurSensible[] = [];

  for (const canal of CANAUX_SENSIBLES) {
    const valeur = canal.lire(appel);
    if (valeur !== null) sensibles.push({ nom: canal.nom, valeur });
  }

  const arguments_: string[] = [];
  chainesDeLInput(appel.input, 0, arguments_);
  arguments_.forEach((valeur, rang) => {
    sensibles.push({ nom: `argument n° ${String(rang + 1)}`, valeur });
  });

  return sensibles;
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE FILET
// ═════════════════════════════════════════════════════════════════════════════

/**
 * CONFRONTE LA SORTIE SÉRIALISÉE D'UN TRANSPORT AUX VALEURS SENSIBLES DE LA
 * REQUÊTE QUI L'A PRODUITE.
 *
 * ⚠️ **ELLE EST APPELÉE PAR LES DEUX FILS, ET SUR LE CHEMIN D'ERREUR AUSSI.**
 *    Le § 20 parle de la RÉPONSE D'ERREUR : la garder sur le chemin nominal
 *    seulement reviendrait à ne pas la garder du tout. Chaque transport
 *    l'appelle donc à l'endroit unique où la réponse part — y compris quand
 *    elle part depuis un `catch`.
 *
 * ⚠️ **ELLE NE DÉCIDE PAS, ELLE CONSTATE.** Remplacer la réponse est le geste du
 *    TRANSPORT, pas le sien : chacun sait quelle enveloppe mettre à la place —
 *    un `500` JSON-RPC pour HTTP, une erreur JSON-RPC cadrée pour stdio — et
 *    aucun des deux n'a besoin de connaître la forme de l'autre.
 */
export function verifierAucuneFuite(
  sortie: SortieServie,
  sensibles: readonly ValeurSensible[],
): VerdictDeFuite {
  const fuites: string[] = [];
  let valeursConfrontees = 0;
  let valeursEcartees = 0;

  for (const sensible of sensibles) {
    if (sensible.valeur.length < LONGUEUR_MINIMALE_CONFRONTEE) {
      valeursEcartees += 1;
      continue;
    }
    valeursConfrontees += 1;
    if (sortie.texte.includes(sensible.valeur)) {
      fuites.push(sensible.nom);
    }
  }

  return { transport: sortie.transport, valeursConfrontees, valeursEcartees, fuites };
}

/**
 * core/policy/desserrage.ts — L'ASYMÉTRIE.
 *
 * § 20, protection 1, mot pour mot : « RESSERRER EST TOUJOURS LIBRE — outil MCP
 * `ops.policy.tighten`, sans scope particulier, exécuté immédiatement d'où que
 * ça vienne. DESSERRER N'EST JAMAIS LIBRE — aucun outil MCP, une route dédiée du
 * socle sous `ops:policy` », avec TOTP et TTL obligatoires.
 *
 * Trois choses que ce fichier tient, et qu'aucune autre n'a le droit de tenir :
 *
 *  1. Le TRI resserrage / desserrage n'est pas déclaré par l'appelant : il est
 *     CALCULÉ, en comparant le niveau demandé au PLANCHER du scope visé. Un
 *     appelant qui annonce « resserrage » ne se croit pas sur parole.
 *  2. Un desserrage SANS EFFET est REFUSÉ, pas écrit. Une ligne `libre` sur
 *     `zoho.mail.send` alors qu'un `brouillon` sur `*` est en vigueur ne change
 *     rien — mais l'écran de politique la montrerait comme courante. C'est
 *     exactement le défaut que `supersededAt` a été ajouté pour empêcher.
 *  3. Le desserrage porte une BORNE HAUTE de durée, pas seulement un TTL non
 *     nul. « Toujours avec une durée » sans borne haute autorise dix ans.
 */

import { lePlusStrict, rangPolicyLevel, type OpsScope, type PolicyLevel } from "../types.js";
import { canalDelivreUneConfirmation, type Canal } from "./confirmation.js";
import type { DepotPolitique } from "./depot.js";
import { ligneEnVigueur, type AnomalieLigne, type LignePolitique } from "./ligne.js";
import { lignesResiduelles, niveauApplique, plancherDuScope } from "./niveau.js";
import type { SecondFacteur } from "./second-facteur.js";
import { analyserScope, scopeDomine, type ReferenceOutil } from "./scope.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Bornes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Durée maximale d'un desserrage : vingt-quatre heures.
 *
 * Le § 20 exige « toujours avec une durée » et ne fixe pas de plafond. Un
 * plafond est ajouté ici parce qu'une durée sans borne haute rend la protection
 * 3 décorative : `expiresAt` en 2099 est formellement « une durée ». Vingt-quatre
 * heures est la plus courte valeur compatible avec l'usage décrit au § 30 (une
 * journée de pilotage à la voix) ; à changer, c'est ici et nulle part ailleurs.
 */
export const TTL_DESSERRAGE_MAX_MS = 24 * 60 * 60 * 1000;

/** Le scope de jeton qui ouvre le desserrage. § 19.2 : le jeton du connecteur ne
 *  le porte JAMAIS. */
export const SCOPE_DESSERRAGE: OpsScope = "ops:policy";

// ═════════════════════════════════════════════════════════════════════════════
//  Le tri
// ═════════════════════════════════════════════════════════════════════════════

export const GENRES_CHANGEMENT = ["resserrage", "desserrage"] as const;

export type GenreChangement = (typeof GENRES_CHANGEMENT)[number];

export interface ClassementChangement {
  readonly genre: GenreChangement;
  /** Le plancher AVANT changement : ce que subit aujourd'hui tout outil du scope. */
  readonly niveauAvant: PolicyLevel;
  readonly niveauDemande: PolicyLevel;
  /** Lignes en vigueur qui dominent le scope et imposent ce plancher. */
  readonly dominantes: readonly LignePolitique[];
  readonly mesures: number;
  /**
   * Anomalies rencontrées en lisant la politique. Non vide ⇒ `niveauAvant` est
   * le repli fail-closed, PAS le niveau des lignes présentes : le tri
   * resserrage / desserrage est alors le plus sévère possible, et l'appelant
   * doit dire pourquoi plutôt que d'afficher un plancher inventé.
   */
  readonly anomalies: readonly AnomalieLigne[];
}

/**
 * Resserrage ou desserrage ?
 *
 * La règle de tri du § 20 : « une commande hors modèle n'est admise sans facteur
 * que si elle RÉDUIT STRICTEMENT l'ensemble des outils exposés ». Transposée aux
 * niveaux : un changement est un resserrage s'il ne rend RIEN de plus permissif
 * que ce qui l'était déjà. L'égalité est un resserrage — elle n'ouvre rien.
 *
 * `core/profiles/` réemploie cette même primitive pour trancher « passe en mode
 * dev » : changer de profil change la surface exposée, donc suit le chemin du
 * desserrage. Elle est exportée pour cela, et pour n'être écrite qu'une fois.
 */
export function classerChangement(
  lignes: readonly LignePolitique[],
  scope: string,
  niveauDemande: PolicyLevel,
  maintenant: Date,
): ClassementChangement {
  const plancher = plancherDuScope(lignes, scope, maintenant);
  const genre: GenreChangement =
    rangPolicyLevel(niveauDemande) > rangPolicyLevel(plancher.niveau) ? "desserrage" : "resserrage";

  return {
    genre,
    niveauAvant: plancher.niveau,
    niveauDemande,
    dominantes: plancher.dominantes,
    mesures: plancher.mesures,
    anomalies: plancher.anomalies,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  La demande
// ═════════════════════════════════════════════════════════════════════════════

export interface DemandeChangement {
  readonly level: PolicyLevel;
  readonly scope: string;
  readonly channel: Canal;
  readonly expiresAt: Date | null;
  readonly setBy: string;
  readonly reason: string;
  readonly maintenant: Date;
  /** Identifiant de la ligne à écrire. Fourni pour que les gardes soient
   *  déterministes ; en production, un cuid. */
  readonly id: string;
  /**
   * Lignes DOMINANTES à marquer `supersededAt` dans la même transaction.
   * Jamais implicite : lever un plancher est un acte, il se nomme.
   */
  readonly supersederIds?: readonly string[];
}

export const MOTIFS_REFUS_CHANGEMENT = [
  "scope-invalide",
  "raison-manquante",
  "canal-interdit",
  "scope-jeton-manquant",
  "pas-un-desserrage",
  "pas-un-resserrage",
  "ttl-manquant",
  "ttl-passe",
  "ttl-trop-long",
  "ttl-interdit",
  "second-facteur-refuse",
  "supersession-interdite",
  "supersession-inconnue",
  "desserrage-sans-effet",
  /**
   * Le chemin LIBRE a demandé une ligne qui ne resserre AUCUN niveau et qui
   * repousse l'instant où la surface se referme. Voir `resserrer` : à niveau
   * égal, la seule chose qu'une ligne neuve puisse changer est la DURÉE, et
   * l'allonger est un desserrage.
   */
  "resserrage-qui-recule-la-fermeture",
  /**
   * Une ligne de politique est illisible : le plancher est le repli fail-closed
   * et non ce que les lignes disent. On ne desserre pas au-dessus d'une
   * politique qu'on ne sait pas lire — mais on le DIT, au lieu de rendre
   * « desserrage-sans-effet » avec zéro ligne bloquante à nommer.
   */
  "politique-illisible",
] as const;

export type MotifRefusChangement = (typeof MOTIFS_REFUS_CHANGEMENT)[number];

export type ResultatChangement =
  | {
      readonly applique: true;
      readonly ligne: LignePolitique;
      readonly genre: GenreChangement;
      readonly niveauAvant: PolicyLevel;
      readonly niveauApres: PolicyLevel;
      /** Lignes plus strictes que le scope DOMINE et qui survivent : le
       *  changement ne vaut pas pour elles. L'écran doit les montrer. */
      readonly residuelles: readonly LignePolitique[];
      readonly mesures: number;
    }
  | {
      readonly applique: false;
      readonly motif: MotifRefusChangement;
      readonly message: string;
      /** Ce qu'il faut lever pour que le desserrage ait un effet. */
      readonly bloquantes: readonly LignePolitique[];
    };

function refus(
  motif: MotifRefusChangement,
  message: string,
  bloquantes: readonly LignePolitique[] = [],
): ResultatChangement {
  return { applique: false, motif, message, bloquantes };
}

function controlesCommuns(demande: DemandeChangement): ResultatChangement | null {
  const scope = analyserScope(demande.scope);
  if (!scope.valide) {
    return refus("scope-invalide", scope.motif);
  }
  if (demande.reason.trim().length === 0) {
    return refus(
      "raison-manquante",
      "`reason` est obligatoire : une ligne de politique sans motif rend l'écran d'historique illisible.",
    );
  }
  return null;
}

function construireLigne(demande: DemandeChangement): LignePolitique {
  return {
    id: demande.id,
    level: demande.level,
    scope: demande.scope,
    channel: demande.channel,
    expiresAt: demande.expiresAt,
    supersededAt: null,
    setBy: demande.setBy,
    setAt: demande.maintenant,
    reason: demande.reason,
  };
}

/**
 * Les lignes en vigueur portant EXACTEMENT ce scope. Elles sont remplacées
 * d'office : c'est le sens même de `supersededAt` — « remplacée par une ligne
 * postérieure ». Aucun choix de l'appelant là-dedans, sinon deux lignes de même
 * portée coexisteraient et l'écran ne saurait laquelle est courante.
 */
function remplaceesDoffice(
  lignes: readonly LignePolitique[],
  scope: string,
  maintenant: Date,
): readonly LignePolitique[] {
  return lignes.filter((ligne) => ligne.scope === scope && ligneEnVigueur(ligne, maintenant));
}

// ═════════════════════════════════════════════════════════════════════════════
//  Resserrer — TOUJOURS LIBRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Resserrer. Aucun second facteur, aucun scope de jeton particulier, n'importe
 * quel canal — « exécuté immédiatement d'où que ça vienne » (§ 20).
 *
 * Trois refus, et ils ne resserrent rien :
 *  · la demande n'en est pas un (elle desserre) → passer par `desserrer` ;
 *  · elle demande à lever des lignes (`supersederIds`) — lever un plancher ne
 *    peut qu'ÉLARGIR, donc jamais par le chemin libre ;
 *  · elle porte un `expiresAt` sur autre chose que `libre` — un resserrage qui
 *    expire est un desserrage à retardement.
 */
export async function resserrer(
  demande: DemandeChangement,
  depot: DepotPolitique,
): Promise<ResultatChangement> {
  const commun = controlesCommuns(demande);
  if (commun !== null) return commun;

  const lignes = await depot.lignes();
  const classement = classerChangement(lignes, demande.scope, demande.level, demande.maintenant);

  if (classement.genre !== "resserrage") {
    return refus(
      "pas-un-resserrage",
      `Passer de « ${classement.niveauAvant} » à « ${demande.level} » sur « ${demande.scope} » ÉLARGIT la surface. ` +
        "Le chemin libre ne dessert que le resserrage : employez `desserrer`, avec second facteur et durée.",
      classement.dominantes,
    );
  }

  if (demande.supersederIds !== undefined && demande.supersederIds.length > 0) {
    return refus(
      "supersession-interdite",
      "Un resserrage ne lève aucune ligne : marquer `supersededAt` ne peut qu'élargir, et l'élargissement n'est jamais libre.",
    );
  }

  if (demande.expiresAt !== null && demande.level !== "libre") {
    return refus(
      "ttl-interdit",
      "Un resserrage n'expire pas — un `expiresAt` en ferait un desserrage à retardement, sans second facteur.",
    );
  }

  if (demande.level === "libre" && demande.expiresAt === null) {
    return refus(
      "ttl-manquant",
      "Le niveau « libre » porte TOUJOURS une durée (§ 20), même quand il ne change rien.",
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  LA DIMENSION QUE LE TRI NE VOIT PAS : LE TEMPS
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // `classerChangement` compare deux NIVEAUX à un seul instant. À niveau ÉGAL,
  // il ne voit rien — et pourtant une ligne neuve de même niveau qui expire
  // PLUS TARD recule l'instant où la surface se referme. C'est un desserrage
  // dans le temps, et il passait par le chemin libre : depuis `mcp`, sans
  // second facteur, sans `ops:policy`, sans plafond.
  //
  // Deux formes mesurées, toutes deux refermées ici :
  //  · PROLONGER — reposer le même niveau sur le même scope, plus loin ;
  //  · SURVIVRE — déposer, SOUS une ligne large et brève, une ligne étroite et
  //    éternelle que rien ne remplace et qui prend le relais à l'expiration de
  //    la large. Aucune supersession, donc rien à l'écran ne le signale.
  //
  // LA RÈGLE, en une phrase : un resserrage ne recule JAMAIS l'instant où la
  // surface se referme.

  if (demande.level === "libre") {
    // Le plafond du § 20 (protection 3) ne valait que pour `desserrer`. Le
    // seul niveau que le chemin libre puisse écrire avec une durée est
    // `libre` — c'est aussi le plus permissif : il porte le même plafond.
    const dureeMs = (demande.expiresAt?.getTime() ?? 0) - demande.maintenant.getTime();
    if (dureeMs > TTL_DESSERRAGE_MAX_MS) {
      return refus(
        "ttl-trop-long",
        `Durée demandée ${String(Math.round(dureeMs / 60_000))} min au-delà du plafond de ` +
          `${String(TTL_DESSERRAGE_MAX_MS / 60_000)} min. Le chemin libre ne rallonge pas un « libre » : ` +
          "le plafond du § 20 vaut sur les DEUX chemins, sinon il ne vaut sur aucun.",
        classement.dominantes,
      );
    }
  }

  if (demande.level === classement.niveauAvant) {
    // Rien n'est resserré en NIVEAU. La seule chose que cette ligne puisse
    // changer est la durée — et l'allonger ouvre.
    const finDemandee = demande.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY;
    const finCourante = classement.dominantes.reduce(
      (plusProche, ligne) =>
        Math.min(plusProche, ligne.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY),
      Number.POSITIVE_INFINITY,
    );

    if (finDemandee > finCourante) {
      return refus(
        "resserrage-qui-recule-la-fermeture",
        `À niveau égal (« ${demande.level} »), cette ligne ne resserre rien : elle repousse la ` +
          `fermeture de la surface de ${new Date(finCourante).toISOString()} à ` +
          `${demande.expiresAt === null ? "jamais" : demande.expiresAt.toISOString()}. ` +
          "Prolonger un niveau en vigueur est un DESSERRAGE : employez `desserrer`, " +
          "avec second facteur, `ops:policy` et durée bornée.",
        classement.dominantes,
      );
    }
  }

  const ligne = construireLigne(demande);
  const remplacees = remplaceesDoffice(lignes, demande.scope, demande.maintenant);

  // L'état d'après, DÉRIVÉ avant l'écriture — même motif que dans `desserrer` :
  // une relecture postérieure à l'écriture rendrait un échec sur une ligne
  // pourtant committée.
  const remplaceesIds = new Set(remplacees.map((l) => l.id));
  const simulation = [...lignes.filter((l) => !remplaceesIds.has(l.id)), ligne];

  await depot.ajouter(ligne, [...remplaceesIds], demande.maintenant);

  return {
    applique: true,
    ligne,
    genre: "resserrage",
    niveauAvant: classement.niveauAvant,
    niveauApres: plancherDuScope(simulation, demande.scope, demande.maintenant).niveau,
    residuelles: [],
    mesures: classement.mesures,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Desserrer — JAMAIS LIBRE
// ═════════════════════════════════════════════════════════════════════════════

export interface ContexteDesserrage {
  /** Qui desserre. C'est lui dont le second facteur est vérifié. */
  readonly principal: string;
  /** Les scopes du jeton présenté (§ 19.2). */
  readonly scopes: readonly OpsScope[];
  /** Le code du second facteur. */
  readonly code: string;
}

export interface DependancesDesserrage {
  readonly depot: DepotPolitique;
  readonly secondFacteur: SecondFacteur;
}

/**
 * Desserrer. Le chemin long, et c'est voulu.
 *
 * L'ORDRE DES CONTRÔLES EST UN CHOIX : le second facteur est vérifié APRÈS les
 * contrôles de forme et AVANT l'écriture. Le vérifier en premier brûlerait un
 * pas TOTP (anti-rejeu) sur une demande malformée — le même défaut que « le
 * schéma avant le quota » du § 11, transposé.
 */
export async function desserrer(
  demande: DemandeChangement,
  contexte: ContexteDesserrage,
  deps: DependancesDesserrage,
): Promise<ResultatChangement> {
  const commun = controlesCommuns(demande);
  if (commun !== null) return commun;

  // 1 · Le canal. « Aucun outil MCP » (§ 20) : un desserrage qui arrive par
  //     /api/mcp est demandé par celui-là même qu'il élargit.
  if (!canalDelivreUneConfirmation(demande.channel)) {
    return refus(
      "canal-interdit",
      `Le canal « ${demande.channel} » ne desserre pas la politique. Le desserrage n'est pas un outil MCP (§ 20) : ` +
        "il passe par la route dédiée du socle, sous `ops:policy`.",
    );
  }

  // 2 · Le scope de jeton. Le jeton du connecteur ne porte JAMAIS `ops:policy`.
  if (!contexte.scopes.includes(SCOPE_DESSERRAGE)) {
    return refus(
      "scope-jeton-manquant",
      `Le jeton présenté ne porte pas « ${SCOPE_DESSERRAGE} ». C'est ce scope, et lui seul, qui sépare ` +
        "« resserrer, toujours libre » de « desserrer, jamais libre » (§ 19.2).",
    );
  }

  const lignes = await deps.depot.lignes();
  const classement = classerChangement(lignes, demande.scope, demande.level, demande.maintenant);

  // 3 · Est-ce bien un desserrage ? Un resserrage passé par ici porterait un TTL
  //     obligatoire — donc expirerait, donc élargirait tout seul plus tard.
  if (classement.genre !== "desserrage") {
    return refus(
      "pas-un-desserrage",
      `Passer de « ${classement.niveauAvant} » à « ${demande.level} » sur « ${demande.scope} » n'élargit rien : ` +
        "employez `resserrer`, qui est libre et n'expire pas.",
    );
  }

  // 4 · La durée. Non nulle, dans le futur, ET sous la borne haute.
  if (demande.expiresAt === null) {
    return refus(
      "ttl-manquant",
      "Un desserrage porte TOUJOURS une durée (§ 20, protection 3). Indiquez `expiresAt`.",
    );
  }
  const restantMs = demande.expiresAt.getTime() - demande.maintenant.getTime();
  if (!Number.isFinite(restantMs) || restantMs <= 0) {
    return refus(
      "ttl-passe",
      "La durée demandée est nulle ou déjà passée : un desserrage sans durée non nulle n'est pas un desserrage.",
    );
  }
  if (restantMs > TTL_DESSERRAGE_MAX_MS) {
    return refus(
      "ttl-trop-long",
      `Durée demandée ${String(restantMs)} ms au-delà de la borne haute ${String(TTL_DESSERRAGE_MAX_MS)} ms. ` +
        "« Toujours avec une durée » sans plafond autorise dix ans, et la protection 3 devient décorative.",
    );
  }

  // 5 · Les lignes à lever. Chacune doit exister, être en vigueur, DOMINER le
  //     scope visé, et être plus stricte que le niveau demandé. On ne lève pas
  //     une ligne au hasard sous couvert de desserrer un outil.
  const aLever: LignePolitique[] = [];
  for (const id of demande.supersederIds ?? []) {
    const cible = lignes.find((ligne) => ligne.id === id);
    if (cible === undefined || !ligneEnVigueur(cible, demande.maintenant)) {
      return refus(
        "supersession-inconnue",
        `La ligne « ${id} » n'existe pas ou n'est plus en vigueur : rien à lever.`,
      );
    }
    if (!scopeDomine(cible.scope, demande.scope)) {
      return refus(
        "supersession-interdite",
        `La ligne « ${id} » (scope « ${cible.scope} ») ne domine pas « ${demande.scope} » : la lever élargirait ` +
          "au-delà de ce qui est demandé.",
      );
    }
    if (lePlusStrict(cible.level, demande.level) !== cible.level || cible.level === demande.level) {
      return refus(
        "supersession-interdite",
        `La ligne « ${id} » n'est pas plus stricte que « ${demande.level} » : la lever ne débloque rien.`,
      );
    }
    aLever.push(cible);
  }

  // 6 · LE DESSERRAGE AURA-T-IL UN EFFET ? On simule : lignes à lever retirées,
  //     nouvelle ligne posée, plancher recalculé. S'il reste plus strict que
  //     demandé, on REFUSE — écrire une ligne sans effet, c'est afficher un
  //     desserrage courant qui n'en est pas un.
  const nouvelleLigne = construireLigne(demande);
  const remplacees = remplaceesDoffice(lignes, demande.scope, demande.maintenant);
  const levees = new Set<string>([...aLever, ...remplacees].map((ligne) => ligne.id));
  const simulation = [...lignes.filter((ligne) => !levees.has(ligne.id)), nouvelleLigne];
  const plancherApres = plancherDuScope(simulation, demande.scope, demande.maintenant);

  // 6 bis · Politique illisible : `plancherApres` est alors le REPLI, pas ce
  //         que les lignes disent. Le refus suivant nommerait « 0 ligne(s)
  //         plus stricte(s) » et enverrait chercher au mauvais endroit.
  if (plancherApres.anomalies.length > 0) {
    return refus(
      "politique-illisible",
      `La politique porte ${String(plancherApres.anomalies.length)} anomalie(s) de lecture — ` +
        `${plancherApres.anomalies.map((a) => `« ${a.id} » : ${a.motif}`).join(" · ")}. ` +
        "Le socle replie sur le niveau le plus strict et refuse de desserrer par-dessus. " +
        "Réparer ou resserrer ces lignes (le resserrage, lui, reste libre), puis recommencer.",
    );
  }

  if (plancherApres.niveau !== demande.level) {
    const bloquantes = plancherApres.dominantes.filter(
      (ligne) =>
        ligne.id !== nouvelleLigne.id && lePlusStrict(ligne.level, demande.level) === ligne.level,
    );
    return refus(
      "desserrage-sans-effet",
      `Le niveau resterait « ${plancherApres.niveau} » : le plus strict gagne (§ 12, règle 1), et ` +
        `${String(bloquantes.length)} ligne(s) plus stricte(s) dominent « ${demande.scope} ». ` +
        "Nommez-les dans `supersederIds` pour les lever, ou desserrez à leur portée.",
      bloquantes,
    );
  }

  // 7 · Le second facteur, en dernier — après la forme, avant l'écriture.
  const facteur = await deps.secondFacteur.verifier({
    principal: contexte.principal,
    code: contexte.code,
    maintenant: demande.maintenant,
  });
  if (!facteur.valide) {
    return refus(
      "second-facteur-refuse",
      `Second facteur refusé (${facteur.motif}). Le desserrage exige un canal que le socle ne peut ni lire ni écrire (§ 20).`,
    );
  }

  await deps.depot.ajouter(nouvelleLigne, [...levees], demande.maintenant);

  // ⚠️ AUCUNE RELECTURE ICI, ET C'EST LE POINT. Relire le dépôt pour calculer
  //    `niveauApres` rouvrait une fenêtre entre l'écriture et le compte rendu :
  //    si la base tombait dans cet intervalle — le cas NORMAL d'un basculement
  //    Postgres — l'exception repartait alors que la ligne `libre` était DÉJÀ
  //    committée. L'appelant lisait un échec ; la porte, elle, était ouverte.
  //    Pire, le § 11 faisait alors écrire au journal « interrompu / erreur »
  //    pour un desserrage RÉELLEMENT APPLIQUÉ : la source du § 24 enregistrait
  //    le contraire de ce qui s'était passé.
  //
  //    `simulation` est, par construction, l'état d'APRÈS l'écriture : les
  //    lignes levées retirées, la nouvelle ligne posée. C'est la même valeur,
  //    dérivée au lieu d'être réobservée — et une dérivation ne peut pas
  //    échouer à mi-chemin.
  return {
    applique: true,
    ligne: nouvelleLigne,
    genre: "desserrage",
    niveauAvant: classement.niveauAvant,
    niveauApres: plancherApres.niveau,
    residuelles: lignesResiduelles(simulation, demande.scope, demande.level, demande.maintenant),
    mesures: classement.mesures,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que l'écran affiche — LE MÊME CALCUL
// ═════════════════════════════════════════════════════════════════════════════

/**
 * § 20, protection 3 : « l'écran dérive du MÊME calcul ». Cette fonction existe
 * pour qu'aucun écran n'ait de raison d'en écrire un second : le jour où l'un
 * des deux dévie, l'écran ment sur ce que le socle applique.
 */
export async function niveauPourEcran(
  depot: DepotPolitique,
  reference: ReferenceOutil,
  maintenant: Date,
): Promise<ReturnType<typeof niveauApplique>> {
  return niveauApplique(await depot.lignes(), reference, maintenant);
}

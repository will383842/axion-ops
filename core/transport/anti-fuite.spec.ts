/**
 * `core/transport/anti-fuite.spec.ts` — **LA MÊME ENTRÉE, SUR LES DEUX FILS.
 * ADR 0044, § 20.**
 *
 * ═══ CE QUE CETTE GARDE MESURE, ET CE QU'ELLE NE MESURE PAS ═══
 *
 * Elle ne mesure PAS « le filet existe » ni « HTTP ne fuit pas ». Elle mesure
 * que **les DEUX transports, mis devant le MÊME noyau doublé et devant les MÊMES
 * entrées, retiennent les MÊMES valeurs**. C'est le seul énoncé qui aurait vu le
 * défaut du lot 3 : le filet HTTP était juste, et il était vert de son côté
 * pendant que le fil stdio n'en avait aucun.
 *
 * C'est le motif de l'équivalence des transports que l'audit a déjà employé pour
 * trouver des défauts réels — `core/transport/valeurs-servies.spec.ts` (ADR 0037,
 * § 4) l'a écrit pour le rejeu, et le défaut qu'il a trouvé était exactement de
 * cette forme : chaque fil vert de son côté, les deux en désaccord.
 *
 * ═══ POURQUOI CETTE GARDE NE PEUT PAS ÊTRE VERTE POUR RIEN ═══
 *
 * Trois planchers, et chacun ferme un vert-pour-rien précis :
 *
 *  1. **LA CAPACITÉ** — un noyau qui RENVOIE l'appel fait effectivement retenir
 *     la réponse, sur les deux fils. Sans elle, un filet qui ne détecterait
 *     jamais rien passerait le contrôle n° 2 sans un mot ;
 *  2. **LE TÉMOIN INVERSE** — un noyau NEUTRE ne fait rien retenir, et le filet
 *     annonce quand même un nombre de valeurs CONFRONTÉES non nul. Sans lui, un
 *     filet qui retiendrait TOUT passerait le contrôle n° 1 ;
 *  3. **LE CHEMIN D'ERREUR** — quand le noyau LÈVE, la réponse part depuis un
 *     `catch`, et le filet doit l'avoir regardée. Le § 20 parle de la réponse
 *     d'ERREUR : garder le seul chemin nominal reviendrait à ne pas garder.
 *
 * ⚠️ **LA BORNE, ÉCRITE AVEC LA MESURE.** Cette garde mesure des CHAÎNES qui
 *    ressortent telles quelles. Une valeur qui sortirait transformée — tronquée,
 *    ré-encodée, hachée — ne serait vue ni par le filet ni par cette garde. Elle
 *    dit « ces valeurs-CI ne sont pas ressorties », jamais « rien n'a fui ».
 *
 * ⚠️ **AUCUN SECRET RÉEL.** Les valeurs ci-dessous sont fabriquées pour ce
 *    dossier, et le domaine employé partout est `.invalid` (RFC 2606) : il ne se
 *    résout nulle part, par construction. Dépôt PUBLIC.
 */

import { describe, expect, it } from "vitest";

import { colonneDuTransport } from "../chaine/orchestrateur.js";
import type { AppelEntrant, ResultatAppel, Transport } from "../chaine/orchestrateur.js";
import type { Habilitations } from "../types.js";

import {
  LONGUEUR_MINIMALE_CONFRONTEE,
  NOMS_DES_CANAUX_SENSIBLES,
  valeursSensiblesDeLAppel,
  verifierAucuneFuite,
} from "./anti-fuite.js";
import { CLES_META_DU_SOCLE } from "./http/enveloppe.js";
import { creerTransportHttp } from "./http/transport.js";
import type { DependancesTransportHttp, ReglagesTransportHttp } from "./http/transport.js";
import {
  AUDIENCE_DE_TEMOIN,
  HOTE_DE_TEMOIN,
  PONT_DE_TEMOIN,
  ligneOpsTokenDeTemoin,
  registreDeTemoin,
  requeteDeTemoin,
  revendicationsDeTemoin,
  verificateurDeTemoin,
} from "./http/fixtures.js";
import { creerServeurStdio } from "./stdio/serveur.js";
import type { CatalogueServiEnStdio } from "./stdio/serveur.js";

const INSTANT = new Date(Date.UTC(2026, 8, 1, 12, 0, 0));
const OUTIL = "bonjour.dire";

// ─────────────────────────────────────────────────────────────────────────────
//  LES ENTRÉES CONFRONTÉES — une par CANAL que le § 20 nomme
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une entrée : UNE valeur sensible, LE canal par lequel elle entre, et la façon
 * dont chaque fil l'emballe.
 *
 * ⚠️ **LES DEUX EMBALLAGES DIFFÈRENT, ET C'EST LE POINT.** HTTP fait voyager les
 *    trois valeurs du socle dans `params._meta` sous le préfixe `ops/` ; stdio
 *    les prend à plat dans `params`. Une garde qui n'aurait éprouvé qu'une seule
 *    forme d'enveloppe n'aurait rien dit de l'autre — et c'est précisément
 *    l'asymétrie dans laquelle le défaut a vécu.
 */
interface EntreeConfrontee {
  /** Le nom que le filet doit RETENIR quand cette valeur ressort. */
  readonly canal: string;
  /** La valeur sensible. Fabriquée, assez longue pour être confrontée. */
  readonly valeur: string;
  /** L'enveloppe HTTP : ce qui va dans `params._meta`, et dans `arguments`. */
  readonly meta: Readonly<Record<string, unknown>>;
  readonly arguments: Readonly<Record<string, unknown>>;
  /** L'enveloppe stdio : les clés à plat de `params`. */
  readonly paramsStdio: Readonly<Record<string, unknown>>;
}

const ENTREES: readonly EntreeConfrontee[] = [
  {
    canal: "jeton de confirmation",
    valeur: "jeton-de-confirmation-fabrique-pour-ce-dossier-0001",
    meta: {
      [CLES_META_DU_SOCLE.confirmation]: "jeton-de-confirmation-fabrique-pour-ce-dossier-0001",
    },
    arguments: {},
    paramsStdio: { confirmation: "jeton-de-confirmation-fabrique-pour-ce-dossier-0001" },
  },
  {
    canal: "clé d'idempotence",
    valeur: "cle-d-idempotence-fabriquee-pour-ce-dossier-0002",
    meta: { [CLES_META_DU_SOCLE.idempotence]: "cle-d-idempotence-fabriquee-pour-ce-dossier-0002" },
    arguments: {},
    paramsStdio: { idempotencyKey: "cle-d-idempotence-fabriquee-pour-ce-dossier-0002" },
  },
  {
    canal: "curseur",
    valeur: "curseur-fabrique-pour-ce-dossier-0003",
    meta: { [CLES_META_DU_SOCLE.curseur]: "curseur-fabrique-pour-ce-dossier-0003" },
    arguments: {},
    paramsStdio: { cursor: "curseur-fabrique-pour-ce-dossier-0003" },
  },
  {
    canal: "argument n° 1",
    valeur: "valeur-d-argument-fabriquee-pour-ce-dossier-0004",
    meta: {},
    arguments: { note: "valeur-d-argument-fabriquee-pour-ce-dossier-0004" },
    paramsStdio: { arguments: { note: "valeur-d-argument-fabriquee-pour-ce-dossier-0004" } },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
//  LES DEUX NOYAUX DOUBLÉS, ET LA MISE SUR LE FIL
// ─────────────────────────────────────────────────────────────────────────────

/** Une trace d'orchestration DÉRIVÉE de la colonne du transport éprouvé. */
function traceDe(transport: Transport): ResultatAppel["trace"] {
  const colonne = colonneDuTransport(transport);
  return {
    transport,
    etapesApplicables: colonne.etapesApplicables,
    etapesNonApplicables: colonne.etapesNonApplicables,
    etapesAmont: colonne.etapesAmont,
    etapesFranchies: [],
    etapeRefusante: null,
    etapesNonAtteintes: [],
    niveauApplique: "brouillon",
    niveauMesures: 0,
    argHashBrutIndisponible: false,
    ligneDIntention: null,
  };
}

/** Un `ResultatAppel` de succès portant la charge qu'on lui donne. */
function resultatServi(charge: unknown, transport: Transport): ResultatAppel {
  return {
    terminaison: {
      genre: "succès",
      valeur: {
        genre: "exécuté",
        execution: {
          charge,
          palier: "intact",
          outcome: "ok",
          octetsServis: 0,
          octetsBruts: 0,
          champsMasques: 0,
          recordIds: [],
          partialSources: [],
          sourceIncomplete: false,
        },
        trace: traceDe(transport),
      },
      outcome: "ok",
      recordIds: [],
      partialSources: [],
    },
    ligne: { seq: 1n, selfHash: "a".repeat(64) },
    refus: null,
    trace: traceDe(transport),
  };
}

/**
 * **LE NOYAU QUI FUIT** : un adaptateur qui renvoie l'appel qu'on lui a remis.
 *
 * ⚠️ CE N'EST PAS UNE CARICATURE. C'est le mode de fuite le plus banal : un
 *    adaptateur qui recopie sa requête dans sa réponse « pour aider au
 *    diagnostic ». Le § 20 ne s'appuie pas sur la prudence des adaptateurs — il
 *    exige un filet AU TRANSPORT, et c'est cela qu'on éprouve.
 */
function noyauQuiRenvoieLAppel(transport: Transport) {
  return (_identite: unknown, appel: unknown): Promise<ResultatAppel> =>
    Promise.resolve(resultatServi({ echo: appel }, transport));
}

/** Le noyau NEUTRE : il ne renvoie rien de ce qu'on lui a remis. */
function noyauNeutre(transport: Transport) {
  return (): Promise<ResultatAppel> => Promise.resolve(resultatServi({ ok: true }, transport));
}

/** Le noyau qui LÈVE : la réponse partira depuis un `catch`. */
function noyauQuiLeve() {
  return (): Promise<ResultatAppel> => Promise.reject(new Error("panne fabriquée pour ce dossier"));
}

/** Ce qu'une mise sur le fil rend : la sortie SÉRIALISÉE, et ce que le fil a compté. */
interface SortieDuFil {
  readonly transport: Transport;
  readonly texte: string;
  readonly valeursConfrontees: number;
  readonly retenues: number;
}

/**
 * **UN COMPTE QUI N'EST PAS UN NOMBRE N'EST PAS UN ZÉRO — C'EST UN AVEUGLEMENT.**
 *
 * ⚠️ CETTE FONCTION EXISTE PARCE QUE LE DÉFAUT A ÉTÉ MESURÉ SUR CETTE GARDE
 *    MÊME. À la première exécution contre l'état d'AVANT le lot, le fil stdio ne
 *    portait aucun compteur : `mesures().reponsesRetenues` valait `undefined`,
 *    et `undefined === 0` est **faux** — le plancher de capacité restait donc
 *    VERT sur un fil qui ne mesurait rien du tout, pendant que la garde voisine
 *    trouvait quatre valeurs ressorties. C'est exactement la maladie que ce
 *    dossier ferme : une garde verte parce qu'elle ne regarde pas.
 */
function comptePositif(valeur: number): boolean {
  return typeof valeur === "number" && Number.isFinite(valeur) && valeur > 0;
}

/** Sert une entrée sur la porte HTTP, et rend ce qui est parti sur le fil. */
async function surLeFilHttp(
  entree: EntreeConfrontee,
  noyau: (identite: unknown, appel: unknown) => Promise<ResultatAppel>,
): Promise<SortieDuFil> {
  const reglages: ReglagesTransportHttp = {
    hotesAdmis: [HOTE_DE_TEMOIN],
    audienceAttendue: AUDIENCE_DE_TEMOIN,
    budgetMs: 30_000,
  };
  const dependances: DependancesTransportHttp = {
    verificateurDeJeton: verificateurDeTemoin(revendicationsDeTemoin()),
    registreDesJetons: registreDeTemoin(ligneOpsTokenDeTemoin()),
    pontDIdentite: PONT_DE_TEMOIN,
    noyau,
    maintenant: () => INSTANT,
  };
  const corps = JSON.stringify({
    jsonrpc: "2.0",
    id: "1",
    method: "tools/call",
    params: { name: OUTIL, arguments: entree.arguments, _meta: entree.meta },
  });
  const traitement = await creerTransportHttp(reglages, dependances).traiter(
    requeteDeTemoin({ corps }),
  );

  return {
    transport: "http",
    // ⚠️ LA SORTIE ENTIÈRE — statut, en-têtes ET corps. Une valeur qui sortirait
    //    par un en-tête de corrélation sortirait aussi sûrement que par le corps.
    texte: [
      String(traitement.reponse.statut),
      ...Object.entries(traitement.reponse.entetes).map(([nom, v]) => `${nom}: ${v}`),
      traitement.reponse.corps,
    ].join("\n"),
    valeursConfrontees: traitement.trace.fuite.valeursConfrontees,
    retenues: traitement.trace.fuite.fuites.length,
  };
}

/** Sert la MÊME entrée sur le fil stdio, et rend ce qui est parti sur le fil. */
async function surLeFilStdio(
  entree: EntreeConfrontee,
  noyau: (identite: unknown, appel: unknown) => Promise<ResultatAppel>,
): Promise<SortieDuFil> {
  const sortie: string[] = [];
  const catalogue: CatalogueServiEnStdio = { listerPourCetAppel: () => Promise.resolve([]) };
  const serveur = creerServeurStdio({
    // ⚠️ AUCUNE ASSERTION DE TYPE ICI : `NoyauUnique` accepte ce double par
    //    contravariance de ses paramètres. Un `as` masquerait le jour où la
    //    signature du noyau changerait — c'est-à-dire le jour où il faudrait
    //    l'apprendre.
    noyau,
    catalogue,
    habilitations: (): Habilitations => ({ peutVoirAppels: false }),
    maintenant: () => INSTANT,
    ecrire: (ligne) => sortie.push(ligne),
  });

  await serveur.absorber(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: OUTIL, ...entree.paramsStdio },
    })}\n`,
  );
  const mesures = serveur.mesures();

  return {
    transport: "stdio",
    texte: sortie.join(""),
    valeursConfrontees: mesures.valeursConfrontees,
    retenues: mesures.reponsesRetenues,
  };
}

/** Les DEUX fils, côte à côte, sur la MÊME entrée. */
async function surLesDeuxFils(
  entree: EntreeConfrontee,
  noyau: (transport: Transport) => (identite: unknown, appel: unknown) => Promise<ResultatAppel>,
): Promise<readonly SortieDuFil[]> {
  return [await surLeFilHttp(entree, noyau("http")), await surLeFilStdio(entree, noyau("stdio"))];
}

// ═════════════════════════════════════════════════════════════════════════════
//  ① LA DÉRIVATION — une seule, pour les deux fils
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0044 — les valeurs sensibles d'un appel sont dérivées UNE FOIS", () => {
  it("nomme les TROIS canaux de protocole du § 20 et chaque chaîne de l'input", () => {
    const appel: AppelEntrant = {
      nomComplet: OUTIL,
      input: { a: "chaine-assez-longue-pour-etre-confrontee", court: "id" },
      idempotencyKey: "cle-d-idempotence-fabriquee-0001",
      curseur: "curseur-fabrique-0001",
      jetonDeConfirmation: "jeton-de-confirmation-fabrique-0001",
    };
    const sensibles = valeursSensiblesDeLAppel(appel);
    const noms = sensibles.map((valeur) => valeur.nom);

    console.info(
      `[ADR 0044 · dérivation] ${String(NOMS_DES_CANAUX_SENSIBLES.length)} canal(aux) de ` +
        `protocole dérivé(s) de la table [${NOMS_DES_CANAUX_SENSIBLES.join(", ")}] · ` +
        `${String(sensibles.length)} valeur(s) sensible(s) nommée(s) [${noms.join(", ")}] · ` +
        `le nom d'outil « ${OUTIL} » en fait partie : ${String(noms.includes(OUTIL))}`,
    );

    // Les trois canaux du § 20 sont DÉRIVÉS de la table, jamais recopiés ici.
    for (const canal of NOMS_DES_CANAUX_SENSIBLES) expect(noms).toContain(canal);
    // Et chaque chaîne de l'`input` est nommée, la trop courte comprise : c'est
    // le filet qui l'écarte et la COMPTE, pas la collecte qui la perd.
    expect(noms).toContain("argument n° 1");
    expect(noms).toContain("argument n° 2");
    // ⚠️ LE NOM D'OUTIL EST EXCLU, DÉLIBÉRÉMENT : le § 15 exige au contraire que
    //    `tool_disabled` « dise qu'il existe, et où l'activer ».
    expect(sensibles.some((valeur) => valeur.valeur === OUTIL)).toBe(false);
  });

  it("ÉCARTE les valeurs trop courtes en les COMPTANT, au lieu de les perdre", () => {
    const verdict = verifierAucuneFuite(
      { transport: "stdio", texte: "une réponse qui ne porte rien de la requête" },
      [
        { nom: "trop courte", valeur: "ok" },
        { nom: "assez longue", valeur: "valeur-assez-longue-pour-etre-confrontee" },
      ],
    );

    console.info(
      `[ADR 0044 · borne] seuil ${String(LONGUEUR_MINIMALE_CONFRONTEE)} caractère(s) · ` +
        `${String(verdict.valeursConfrontees)} confrontée(s) · ` +
        `${String(verdict.valeursEcartees)} écartée(s) comme trop courte(s) · ` +
        `fil annoncé : ${verdict.transport}`,
    );

    expect(verdict.valeursConfrontees).toBe(1);
    expect(verdict.valeursEcartees).toBe(1);
    expect(verdict.transport).toBe("stdio");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  ② LA GARDE QUI COMPTE — la MÊME entrée, sur les DEUX transports
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0044 — aucun jeton, aucune valeur de la requête ne ressort, sur AUCUN des deux fils", () => {
  /**
   * ⚠️ **LE PLANCHER DE CAPACITÉ, ET IL PASSE EN PREMIER.** Si le filet ne
   *    savait pas dire non, le contrôle suivant serait vert sans rien mesurer.
   *    Ici le noyau RENVOIE l'appel : chaque valeur DOIT être retenue, et elle
   *    doit l'être **des deux côtés**. Un seul côté qui retient signifie que la
   *    remontée de l'ADR 0044 est cosmétique.
   */
  it("CAPACITÉ — les DEUX fils RETIENNENT la réponse quand l'adaptateur renvoie l'appel", async () => {
    const observations: string[] = [];
    let confrontations = 0;
    const filsSansRetenue: string[] = [];

    for (const entree of ENTREES) {
      for (const fil of await surLesDeuxFils(entree, noyauQuiRenvoieLAppel)) {
        confrontations += 1;
        observations.push(
          `${entree.canal} → ${fil.transport} : ${String(fil.valeursConfrontees)} confrontée(s), ` +
            `${String(fil.retenues)} retenue(s)`,
        );
        if (!comptePositif(fil.retenues))
          filsSansRetenue.push(`${entree.canal} → ${fil.transport}`);
      }
    }

    console.info(
      `[ADR 0044 · capacité] ${String(ENTREES.length)} entrée(s) confrontée(s) × 2 transport(s) ` +
        `= ${String(confrontations)} confrontation(s) · ` +
        `${String(filsSansRetenue.length)} sans retenue [${filsSansRetenue.join(", ") || "aucune"}] · ` +
        observations.join(" · "),
    );

    // Plancher : les deux fils ont bien été mis devant chaque entrée.
    expect(confrontations).toBe(ENTREES.length * 2);
    expect(ENTREES.length).toBeGreaterThanOrEqual(4);
    // ⚠️ L'ASSERTION DU LOT : aucun des deux fils n'échappe au filet.
    expect(filsSansRetenue).toEqual([]);
  });

  /**
   * **LA GARDE ELLE-MÊME.** La même entrée, les deux fils, et la valeur ne
   * ressort d'aucun des deux — y compris du corps d'erreur que le fail-closed
   * met à la place.
   */
  it("la MÊME entrée sur les DEUX transports ne fait paraître ni jeton ni secret", async () => {
    const fuitesConstatees: string[] = [];
    const canauxSansNom: string[] = [];
    let confrontations = 0;
    let octetsLus = 0;

    for (const entree of ENTREES) {
      // ⚠️ **LA DÉRIVATION EST CONFRONTÉE AVANT LES FILS, ET C'EST CE QUI LIE
      //    LES DEUX MOITIÉS DE L'ADR 0044.** Que les deux transports soient
      //    silencieux ne prouverait rien si chacun composait sa propre liste de
      //    valeurs à confronter : l'un pourrait ignorer le jeton de confirmation
      //    et rester vert. `valeursSensiblesDeLAppel` est LA source unique, et
      //    on exige ici qu'elle NOMME le canal de chaque entrée.
      const nommes = valeursSensiblesDeLAppel({
        jetonDeConfirmation: (entree.paramsStdio["confirmation"] as string | undefined) ?? null,
        idempotencyKey: (entree.paramsStdio["idempotencyKey"] as string | undefined) ?? null,
        curseur: (entree.paramsStdio["cursor"] as string | undefined) ?? null,
        input: entree.paramsStdio["arguments"] ?? {},
      }).map((valeur) => valeur.nom);
      if (!nommes.includes(entree.canal)) canauxSansNom.push(entree.canal);

      for (const fil of await surLesDeuxFils(entree, noyauQuiRenvoieLAppel)) {
        confrontations += 1;
        octetsLus += fil.texte.length;
        if (fil.texte.includes(entree.valeur)) {
          fuitesConstatees.push(`${entree.canal} → ${fil.transport}`);
        }
      }
    }

    console.info(
      `[ADR 0044 · équivalence des transports] ${String(ENTREES.length)} entrée(s) confrontée(s) ` +
        `× 2 transport(s) = ${String(confrontations)} sortie(s) relue(s) · ` +
        `${String(octetsLus)} caractère(s) de fil relus · ` +
        `${String(fuitesConstatees.length)} valeur(s) RESSORTIE(s) ` +
        `[${fuitesConstatees.join(", ") || "aucune"}] · ` +
        `${String(canauxSansNom.length)} canal(aux) que valeursSensiblesDeLAppel ne NOMME pas ` +
        `[${canauxSansNom.join(", ") || "aucun"}]`,
    );

    // Planchers : les sorties ont réellement été produites et relues.
    expect(confrontations).toBe(ENTREES.length * 2);
    expect(octetsLus).toBeGreaterThan(200);
    // ⚠️ UNE SEULE DÉRIVATION POUR LES DEUX FILS : sans elle, le silence des
    //    deux transports ne prouverait pas qu'ils confrontent les mêmes valeurs.
    expect(canauxSansNom).toEqual([]);
    // ⚠️ LE § 20 : « JAMAIS dans la réponse d'erreur » — sans distinguer le fil.
    expect(fuitesConstatees).toEqual([]);
  });

  /**
   * ⚠️ **LE TÉMOIN INVERSE, SANS LEQUEL LE PRÉCÉDENT SERAIT VERT POUR RIEN.** Un
   *    filet qui retiendrait TOUT passerait la capacité et l'équivalence. Ici,
   *    rien ne doit être retenu — et le filet doit néanmoins annoncer qu'il a
   *    CONFRONTÉ des valeurs. « Aucune fuite » et « aucune confrontation » sont
   *    deux verdicts opposés que seul ce nombre distingue.
   */
  it("TÉMOIN INVERSE — un noyau neutre ne fait RIEN retenir, et le filet a quand même REGARDÉ", async () => {
    const observations: string[] = [];
    let confrontations = 0;
    let retenuesTotal = 0;
    const filsAveugles: string[] = [];

    for (const entree of ENTREES) {
      for (const fil of await surLesDeuxFils(entree, noyauNeutre)) {
        confrontations += 1;
        retenuesTotal += comptePositif(fil.retenues) ? fil.retenues : 0;
        observations.push(
          `${entree.canal} → ${fil.transport} : ${String(fil.valeursConfrontees)} confrontée(s)`,
        );
        if (!comptePositif(fil.valeursConfrontees)) {
          filsAveugles.push(`${entree.canal} → ${fil.transport}`);
        }
      }
    }

    console.info(
      `[ADR 0044 · témoin inverse] ${String(confrontations)} sortie(s) · ` +
        `${String(retenuesTotal)} retenue(s) · ` +
        `${String(filsAveugles.length)} fil(s) n'ayant confronté AUCUNE valeur ` +
        `[${filsAveugles.join(", ") || "aucun"}] · ` +
        observations.join(" · "),
    );

    expect(confrontations).toBe(ENTREES.length * 2);
    // Un noyau qui ne renvoie rien de l'appel ne doit rien faire retenir.
    expect(retenuesTotal).toBe(0);
    // ⚠️ ET LE FILET A REGARDÉ : c'est ce qui interdit la garde verte parce
    //    qu'elle ne mesure rien.
    expect(filsAveugles).toEqual([]);
  });

  /**
   * ⚠️ **LE CHEMIN D'ERREUR, QUI EST CELUI QUE LE § 20 NOMME.** « Le jeton ne
   *    paraît JAMAIS dans la réponse d'erreur. » Quand le noyau lève, la réponse
   *    part depuis un `catch` — le chemin le moins gardé de tout transport. Le
   *    filet doit l'avoir regardée, sur les deux fils.
   */
  it("sur le chemin d'EXCEPTION aussi, le filet a confronté les valeurs — des DEUX côtés", async () => {
    const observations: string[] = [];
    let confrontations = 0;
    const filsAveugles: string[] = [];
    const fuitesConstatees: string[] = [];

    for (const entree of ENTREES) {
      for (const fil of await surLesDeuxFils(entree, () => noyauQuiLeve())) {
        confrontations += 1;
        observations.push(
          `${entree.canal} → ${fil.transport} : ${String(fil.valeursConfrontees)} confrontée(s), ` +
            `${String(fil.texte.length)} caractère(s) écrits`,
        );
        if (!comptePositif(fil.valeursConfrontees)) {
          filsAveugles.push(`${entree.canal} → ${fil.transport}`);
        }
        if (fil.texte.includes(entree.valeur)) {
          fuitesConstatees.push(`${entree.canal} → ${fil.transport}`);
        }
      }
    }

    console.info(
      `[ADR 0044 · chemin d'exception] ${String(ENTREES.length)} entrée(s) × 2 transport(s) ` +
        `= ${String(confrontations)} réponse(s) d'erreur relue(s) · ` +
        `${String(filsAveugles.length)} sortie(s) NON confrontée(s) ` +
        `[${filsAveugles.join(", ") || "aucune"}] · ` +
        `${String(fuitesConstatees.length)} valeur(s) ressortie(s) ` +
        `[${fuitesConstatees.join(", ") || "aucune"}] · ` +
        observations.join(" · "),
    );

    expect(confrontations).toBe(ENTREES.length * 2);
    // ⚠️ L'ASSERTION : la réponse d'erreur est passée par le filet, sur les deux
    //    fils. Un zéro ici dirait que le `catch` court-circuite le scellement.
    expect(filsAveugles).toEqual([]);
    expect(fuitesConstatees).toEqual([]);
  });
});

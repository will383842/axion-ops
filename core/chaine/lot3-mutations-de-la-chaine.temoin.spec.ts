/**
 * `core/chaine/lot3-mutations-de-la-chaine.temoin.spec.ts` — LES HUIT
 * COMPORTEMENTS QUE RIEN NE VÉRIFIAIT.
 *
 * ═══ D'OÙ VIENT CE FICHIER, ET POURQUOI IL N'EST PAS UNE OPINION ═══
 *
 * L'audit de bout en bout a appliqué **30 mutations sémantiques** sur le code
 * réel de `core/chaine/` — l'orchestrateur, les cinq étapes, `identite.ts` —,
 * en relançant la SUITE COMPLÈTE après chacune. **22 ont été tuées, 8 ont
 * survécu** : le code changeait, la suite restait verte. Taux de mise à mort
 * 73,3 %, contre 86,5 % au cœur et 89,1 % au transport. C'était la zone la plus
 * faible du socle.
 *
 * Une mutation survivante n'est pas un jugement de goût : c'est la preuve
 * mécanique qu'un comportement N'EST GARDÉ PAR RIEN. Ce fichier ferme les huit,
 * et chaque `describe` NOMME la mutation exacte qu'il tue — ligne avant, ligne
 * après — pour que le jour où quelqu'un supprime une garde d'ici, il sache
 * précisément quelle porte il rouvre.
 *
 * ═══ COMMENT LES HUIT ONT ÉTÉ IDENTIFIÉES — la mesure, et sa borne ═══
 *
 * Le rapport d'audit donne un COMPTE (8 sur 30) ; il ne donne pas LESQUELLES.
 * Les trente mutations ont donc été rejouées une à une, suite complète à chaque
 * fois, et le résultat retrouvé : **22 tuées, 8 survivantes, 73,3 %.**
 *
 * ⚠️ **ELLES N'ONT PAS ÉTÉ REJOUÉES DANS LE DÉPÔT DE TRAVAIL, ET C'EST LA
 *    RAISON QUI COMPTE.** Quatre autres sessions y écrivaient au même instant :
 *    une première passe y a rendu des rouges venus de fichiers étrangers à la
 *    mutation — un rouge non imputable est un faux « tuée ». La campagne a donc
 *    tourné sur une COPIE ISOLÉE de `HEAD`, où la suite part verte
 *    (`124 fichiers · 1 418 verts · 24 échecs attendus`) et où tout rouge est
 *    imputable à la seule mutation appliquée.
 *
 * ⚠️ **ET UN ROUGE DE DURÉE N'EST PAS UN ROUGE DE RÈGLE.** `m09` a d'abord été
 *    comptée « tuée » sur un unique test rouge à 30 438 ms — c'est-à-dire AU
 *    PLAFOND de `vitest.config.ts`. Rejoué seul, sans contention, plafond levé,
 *    ce test redevient vert : la mise à mort était une EXPIRATION. `m09` est
 *    bien l'une des huit. Lire la couleur sans lire la durée aurait fait
 *    manquer un défaut.
 *
 * ═══ LES HUIT, NOMMÉES — chacune remesurée par nous, pas reprise sur parole ═══
 *
 *  · **m03** — `etat !== "valide"` → `etat === "absente"` : une confirmation
 *    INVALIDE valait une confirmation, à l'étape 11.
 *  · **m09** — `effetExterieurSurvenu()` → `false` : la clôture d'idempotence
 *    cessait de LIRE le cliquet. **Équivalente au comportement près** — voir sa
 *    section : elle se tue par la STRUCTURE, et on dit pourquoi.
 *  · **m15** — le fail-closed de l'étape 5 sur un scope hors du § 19.2.
 *  · **m19** — une seconde éviction pouvait RACCOURCIR l'indétermination.
 *  · **m23** — la mémoïsation de la confirmation ne couvrait plus qu'un état
 *    sur trois. **Second appel inatteignable aujourd'hui** : structure + capacité.
 *  · **m25** — le jeton de confirmation confronté à l'empreinte BRUTE.
 *  · **m26** — l'exigence de confirmation de l'étape 11, purement débranchée.
 *  · **m30** — la ligne d'`ops_audit` portait le niveau de politique RELU.
 *
 * ═══ ET TROIS SECTIONS QUI DOUBLENT UNE GARDE EXISTANTE, À DESSEIN ═══
 *
 * `m21`, `m27` et `m28`/`m29` étaient déjà TUÉES ailleurs dans le dépôt — la
 * remesure le dit. Elles sont gardées ici parce que la garde qui les tue vit
 * dans `core/epreuve/`, loin du code, et qu'une seule assertion la porte : ce
 * fichier en fait une garde de proximité, avec son contre-témoin. **Aucune de
 * ces trois n'est comptée parmi les huit.**
 *
 * ⚠️ **CE QUE CE FICHIER NE PROUVE PAS.** Il ne dit rien des comportements
 *    qu'AUCUNE des 30 mutations n'a touchés : une campagne ne trouve que les
 *    formes qu'elle a nommées. Le taux de mise à mort porté à 100 % vaut POUR
 *    CES 30 MUTATIONS, et pour elles seules.
 *
 * ⚠️ **CHAQUE GARDE ANNONCE SON COMPTE.** Un test qui n'affiche pas combien
 *    d'éléments il a mesurés est vert pour la pire des raisons.
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUN IDENTIFIANT D'INFRASTRUCTURE.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";

import type { Habilitations, OpsScope, ToolContext } from "../types.js";
import { Journal, JournalMemoire, type LigneAudit } from "../audit/index.js";
import { HorlogeFigee, SCELLEUR_TEMOIN } from "../audit/fixtures.js";
import { correspondance } from "../epreuve/outils.js";
import { issueDeReservation } from "../limits/index.js";
import type {
  DemandeIncrement,
  DepotIdempotence,
  DepotQuota,
  EtatCompteur,
  LigneIdempotence,
  ResultatValidation,
  StatutIdempotence,
} from "../limits/index.js";
import { ETATS_CONFIRMATION, estEffetExterieur, type NiveauApplique } from "../policy/index.js";
import type { ProfileName } from "../profiles/index.js";
import type { ChargeAdaptateur, ExecutionEtablie, Masquage, OutilDuCatalogue } from "./etapes.js";
import { correspondanceCanonique, etape05Scopes } from "./etape-05-scopes.js";
import {
  creerEtapeCatalogue,
  type AlerteEpinglage,
  type DeclarationOutilRecue,
  type DemandeDesactivation,
} from "./etape-06-outil.js";
import { creerSignataireCurseur, etapeCurseur } from "./etape-09-curseur.js";
import {
  IndexProvenanceMemoire,
  TTL_MARQUAGE_MS,
  empreinteExtrait,
  etape11Provenance,
} from "./etape-11-provenance.js";
import { executerEtape14 } from "./etape-14-execution.js";
import {
  INTENTION_NON_ARMEE,
  empreintesParDefaut,
  orchestrerAppel,
  type AppelEntrant,
  type DependancesOrchestrateur,
  type IdentiteAppelante,
  type ReglagesDeLOutil,
} from "./orchestrateur.js";
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { SessionId } from "../identite/session.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE MATÉRIEL — aucun secret réel, aucun appel réseau
// ═════════════════════════════════════════════════════════════════════════════

/** ⚠️ AUCUN SECRET RÉEL. Une chaîne fabriquée pour ce fichier, assez longue. */
const CLE_CURSEUR_D_EPREUVE = "cle-curseur-du-lot3-non-secrete-0123456789abcd";

const INSTANT = new Date("2026-09-01T09:00:00.000Z");
const PROFIL_TEMOIN: ProfileName = "courrier";
const HABILITATIONS: Habilitations = { peutVoirAppels: false, roleConsole: null };
const SESSION_TEMOIN: SessionId = sessionIdDeTemoin();

/** Le domaine qui a MARQUÉ la session — jamais celui qu'on appelle ensuite. */
const DOMAINE_LECTURE = "lecture-marquante";

const SCHEMA_SANS_CHAMP = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

/** Un schéma qui PORTE un argument libre — un champ texte sans `enum` ni `format`. */
const SCHEMA_AVEC_TEXTE_LIBRE = {
  type: "object",
  properties: { note: { type: "string" } },
  additionalProperties: false,
} as const;

function outilTemoin(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  const base: OutilDuCatalogue = {
    name: "temoin.lire",
    version: "1.0.0",
    description: "Outil témoin du lot 3. Aucun métier, aucun réseau.",
    inputSchema: SCHEMA_SANS_CHAMP,
    outputSchema: SCHEMA_SANS_CHAMP,
    profiles: [PROFIL_TEMOIN],
    enabled: true,
    retireDeLaListe: false,
    adapterId: "temoin",
    adapterVersion: "1.0.0",
    idempotency: "n/a",
    limit: null,
    warnAt: null,
    effect: "read",
    dataClass: "none",
    pagination: "none",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 4096,
    idFields: [],
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
  };
  return { ...base, ...surcharge };
}

/** L'outil d'ENVOI, celui dont un effet SORT de la machine. */
function outilEnvoi(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return outilTemoin({
    name: "temoin.envoyer",
    effect: "send",
    inputSchema: SCHEMA_AVEC_TEXTE_LIBRE,
    ...surcharge,
  });
}

class DepotQuotaEnMemoire implements DepotQuota {
  readonly compteurs = new Map<string, number>();

  private static cle(d: Pick<DemandeIncrement, "window" | "tool" | "principal">): string {
    return `${d.window}::${d.tool}::${d.principal}`;
  }

  incrementerSiSousLePlafond(demande: DemandeIncrement): Promise<EtatCompteur> {
    const cle = DepotQuotaEnMemoire.cle(demande);
    const courant = this.compteurs.get(cle) ?? 0;
    const accepte = courant + 1 <= demande.limit;
    if (accepte) this.compteurs.set(cle, courant + 1);
    return Promise.resolve({
      accepte,
      count: accepte ? courant + 1 : courant,
      limit: demande.limit,
      warnAt: demande.warnAt,
      resetAt: demande.resetAt,
    });
  }

  decrementer(cle: Pick<DemandeIncrement, "window" | "tool" | "principal">): Promise<void> {
    const k = DepotQuotaEnMemoire.cle(cle);
    this.compteurs.set(k, Math.max(0, (this.compteurs.get(k) ?? 0) - 1));
    return Promise.resolve();
  }
}

class DepotIdemEnMemoire implements DepotIdempotence {
  readonly lignes = new Map<string, LigneIdempotence>();

  private static cle(tool: string, key: string): string {
    return `${tool}::${key}`;
  }

  insererSiAbsente(ligne: LigneIdempotence): Promise<boolean> {
    const cle = DepotIdemEnMemoire.cle(ligne.tool, ligne.key);
    if (this.lignes.has(cle)) return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  lire(tool: string, key: string): Promise<LigneIdempotence | null> {
    return Promise.resolve(this.lignes.get(DepotIdemEnMemoire.cle(tool, key)) ?? null);
  }

  remplacerSiPerimee(ligne: LigneIdempotence, maintenant: Date): Promise<boolean> {
    const existante = this.lignes.get(DepotIdemEnMemoire.cle(ligne.tool, ligne.key));
    if (existante === undefined || existante.expiresAt.getTime() > maintenant.getTime()) {
      return Promise.resolve(false);
    }
    this.lignes.set(DepotIdemEnMemoire.cle(ligne.tool, ligne.key), ligne);
    return Promise.resolve(true);
  }

  reprendreSiEchouee(ligne: LigneIdempotence): Promise<boolean> {
    const existante = this.lignes.get(DepotIdemEnMemoire.cle(ligne.tool, ligne.key));
    if (existante === undefined || existante.status !== "failed") return Promise.resolve(false);
    this.lignes.set(DepotIdemEnMemoire.cle(ligne.tool, ligne.key), ligne);
    return Promise.resolve(true);
  }

  cloturer(params: {
    readonly tool: string;
    readonly key: string;
    readonly status: Extract<StatutIdempotence, "done" | "failed">;
    readonly resultRef: string | null;
    readonly completedAt: Date;
  }): Promise<void> {
    const cle = DepotIdemEnMemoire.cle(params.tool, params.key);
    const existante = this.lignes.get(cle);
    if (existante !== undefined) {
      this.lignes.set(cle, {
        ...existante,
        status: params.status,
        resultRef: params.resultRef,
        completedAt: params.completedAt,
      });
    }
    return Promise.resolve();
  }

  /** L'état d'une clé, tel que la clôture l'a laissé. Mesuré, jamais supposé. */
  statutDe(tool: string, key: string): StatutIdempotence | null {
    return this.lignes.get(DepotIdemEnMemoire.cle(tool, key))?.status ?? null;
  }
}

/** Le masquage neutre : il ne masque rien, et il le DIT (zéro champ masqué). */
const MASQUAGE_NEUTRE: Masquage = {
  appliquer(charge: unknown): { readonly charge: unknown; readonly champsMasques: number } {
    return { charge, champsMasques: 0 };
  },
};

const NIVEAU_BROUILLON: NiveauApplique = {
  niveau: "brouillon",
  raison: "aucune-ligne-couvrante",
  mesures: 3,
  enVigueur: 1,
  retenues: [],
  anomalies: [],
};

/** Le niveau `libre` — celui du § 20 où un envoi part sans confirmation par appel. */
const NIVEAU_LIBRE: NiveauApplique = { ...NIVEAU_BROUILLON, niveau: "libre" };

/** Une vérification de confirmation OBSERVÉE : le harnais compte et enregistre. */
interface AppelDeConfirmation {
  readonly tool: string;
  readonly argHash: string;
  readonly principal: string;
}

interface Reglages {
  readonly outils?: readonly OutilDuCatalogue[];
  readonly scopes?: readonly OpsScope[];
  readonly profilActif?: ProfileName | null;
  readonly inventaire?: readonly OutilDuCatalogue[];
  readonly niveau?: NiveauApplique;
  readonly reglagesOutil?: ReglagesDeLOutil;
  readonly charge?: ChargeAdaptateur;
  readonly index?: IndexProvenanceMemoire;
  readonly sessionId?: SessionId;
  /** Ce que le vérificateur de confirmation RÉPOND, quand on l'appelle. */
  readonly confirmation?: "valide" | "invalide";
  /** L'étape 8 — ce que le validateur REND, quand il ne rend pas l'entrée. */
  readonly validation?: ResultatValidation<unknown>;
  /** L'adaptateur LÈVE — APRÈS avoir rendu son effet extérieur. */
  readonly adaptateurLeveApresEffet?: boolean;
}

interface Harnais {
  readonly deps: DependancesOrchestrateur;
  readonly identite: IdentiteAppelante;
  readonly store: JournalMemoire;
  readonly idempotence: DepotIdemEnMemoire;
  readonly index: IndexProvenanceMemoire;
  /** Combien de fois l'ADAPTATEUR a été appelé. C'est l'effet extérieur. */
  effets(): number;
  /** Les contextes REÇUS par l'adaptateur — ADR 0020, canal `idempotencyRef`. */
  readonly contextes: ToolContext<ProfileName>[];
  /** Les vérifications de confirmation, dans l'ordre. Une par appel réel. */
  readonly confirmations: AppelDeConfirmation[];
  /** Combien de fois le PILOTAGE a été interrogé sur l'inventaire. */
  lecturesInventaire(): number;
  /** Les empreintes remises à l'index de provenance, par appel. */
  readonly empreintesRemises: readonly string[][];
}

function fabriquerHarnais(reglages: Reglages = {}): Harnais {
  const store = new JournalMemoire();
  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee(INSTANT.getTime()));
  const quota = new DepotQuotaEnMemoire();
  const idempotence = new DepotIdemEnMemoire();
  const index = reglages.index ?? new IndexProvenanceMemoire({ maintenant: () => INSTANT });
  const outils = reglages.outils ?? [outilTemoin()];
  const contextes: ToolContext<ProfileName>[] = [];
  const confirmations: AppelDeConfirmation[] = [];
  const empreintesRemises: string[][] = [];
  let effets = 0;
  let lecturesInventaire = 0;

  const identite: IdentiteAppelante = {
    principal: "principal-temoin",
    sessionId: reglages.sessionId ?? SESSION_TEMOIN,
    scopes: reglages.scopes ?? ["ops:read", "ops:draft", "ops:send"],
    habilitations: HABILITATIONS,
    requestId: "req-temoin",
    deadline: new Date(INSTANT.getTime() + 30_000),
  };

  const deps: DependancesOrchestrateur = {
    transport: "http",
    journal,
    intention: INTENTION_NON_ARMEE,
    coffre: {
      refusDAppelDOutil() {
        return null;
      },
    },
    catalogue: {
      relire(nomComplet: string): Promise<OutilDuCatalogue | null> {
        return Promise.resolve(outils.find((outil) => outil.name === nomComplet) ?? null);
      },
    },
    pilotage: {
      profilActif(): Promise<ProfileName | null> {
        return Promise.resolve(
          reglages.profilActif === undefined ? PROFIL_TEMOIN : reglages.profilActif,
        );
      },
      inventaire(): Promise<readonly OutilDuCatalogue[]> {
        lecturesInventaire += 1;
        return Promise.resolve(reglages.inventaire ?? outils);
      },
    },
    politique: {
      niveauPourOutil(): Promise<NiveauApplique> {
        return Promise.resolve(reglages.niveau ?? NIVEAU_BROUILLON);
      },
    },
    confirmation: {
      verifierEtConsommer(appel): Promise<"valide" | "invalide"> {
        confirmations.push({
          tool: appel.tool,
          argHash: appel.argHash,
          principal: appel.principal,
        });
        return Promise.resolve(reglages.confirmation ?? "invalide");
      },
    },
    calculArgHash: correspondance,
    index,
    signataireCurseur: creerSignataireCurseur({
      lireCleCurseur: () => Promise.resolve(CLE_CURSEUR_D_EPREUVE),
    }),
    correspondanceScopes: correspondanceCanonique,
    depotQuota: quota,
    depotIdempotence: idempotence,

    etapeScopes: etape05Scopes,
    etapeCatalogue: creerEtapeCatalogue({
      declarations: {
        relire(nomComplet: string): Promise<DeclarationOutilRecue | null> {
          const outil = outils.find((candidat) => candidat.name === nomComplet);
          if (outil === undefined) return Promise.resolve(null);
          return Promise.resolve({ effect: outil.effect, dataClass: outil.dataClass });
        },
      },
      interrupteur: {
        desactiver(_demande: DemandeDesactivation): Promise<boolean> {
          return Promise.resolve(true);
        },
      },
      alerte: {
        alerter(_alerte: AlerteEpinglage): Promise<boolean> {
          return Promise.resolve(true);
        },
      },
      secours(): void {
        // Rien : le canal d'alerte du harnais accepte toujours.
      },
    }),
    etapeCurseur,
    etapeProvenance: etape11Provenance,
    etapeExecution: executerEtape14,

    reglages(): ReglagesDeLOutil {
      return (
        reglages.reglagesOutil ?? { modeIdempotence: "n/a", limiteQuota: null, warnAtQuota: null }
      );
    },
    validerEntree(_outil, input): ResultatValidation<unknown> {
      return reglages.validation ?? { ok: true, valeur: input };
    },
    empreinteFiltres(outil, valide): Promise<string> {
      return correspondance.calculer(`${outil.name}#filtres`, valide);
    },
    fabriqueMasquage(): Masquage {
      return MASQUAGE_NEUTRE;
    },
    construireContexteOutil(identiteRecue, _appel, profil, niveau) {
      return {
        principal: identiteRecue.principal,
        sessionId: identiteRecue.sessionId,
        scopes: identiteRecue.scopes,
        policyLevel: niveau,
        profile: profil,
        requestId: identiteRecue.requestId,
        deadline: identiteRecue.deadline,
        habilitations: identiteRecue.habilitations,
      };
    },
    appelAdaptateur(contexte): Promise<ChargeAdaptateur> {
      // ⚠️ C'EST ICI, ET NULLE PART AILLEURS, QUE L'EFFET EXTÉRIEUR A LIEU.
      effets += 1;
      contextes.push(contexte);
      if (reglages.adaptateurLeveApresEffet === true) {
        // L'effet EST parti — c'est le cas de l'ADR 0021 : le traitement
        // d'aval lève APRÈS que quelque chose est sorti.
        throw new Error("adaptateur témoin : panne APRÈS l'envoi");
      }
      return Promise.resolve(
        reglages.charge ?? {
          items: [{ id: "a" }],
          failedSources: [],
          sourceIncomplete: false,
          recordIds: [],
        },
      );
    },
    empreintesDuResultat(execution: ExecutionEtablie): readonly string[] {
      const empreintes = empreintesParDefaut(execution);
      empreintesRemises.push([...empreintes]);
      return empreintes;
    },

    ttlIdempotenceMs: 60_000,
    maintenant: () => INSTANT,
  };

  return {
    deps,
    identite,
    store,
    idempotence,
    index,
    effets: () => effets,
    contextes,
    confirmations,
    lecturesInventaire: () => lecturesInventaire,
    empreintesRemises,
  };
}

function appelTemoin(surcharge: Partial<AppelEntrant> = {}): AppelEntrant {
  return {
    nomComplet: "temoin.lire",
    input: {},
    idempotencyKey: null,
    curseur: null,
    jetonDeConfirmation: null,
    ...surcharge,
  };
}

/** La dernière ligne écrite. Elle DOIT exister : c'est l'invariant du § 11. */
function derniereLigne(store: JournalMemoire): LigneAudit {
  const lignes = store.toutes();
  const derniere = lignes[lignes.length - 1];
  if (derniere === undefined) {
    throw new Error("aucune ligne d'`ops_audit` — l'invariant de sortie du § 11 est rompu");
  }
  return derniere;
}

/**
 * Une session DÉJÀ MARQUÉE par un AUTRE domaine — le décor du § 20 dans lequel
 * l'étape 11 exige une confirmation humaine.
 */
function indexMarque(): IndexProvenanceMemoire {
  const index = new IndexProvenanceMemoire({ maintenant: () => INSTANT });
  index.marquer(SESSION_TEMOIN, DOMAINE_LECTURE, [empreinteExtrait("un-extrait-lu")]);
  return index;
}

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATIONS m03 ET m26 — UNE CONFIRMATION **INVALIDE** VALAIT UNE CONFIRMATION
// ═════════════════════════════════════════════════════════════════════════════
//
//  m03 · AVANT : `if (etat !== "valide") {`   APRÈS : `if (etat === "absente") {`
//  m26 · AVANT : `if (v11.etabli.confirmationExigee) {`
//        APRÈS : `if (false as boolean) {`
//  Fichier : `core/chaine/orchestrateur.ts`, le rappel de confirmation de
//  l'étape 11 (§ 20, « est REFUSÉ ou CONFIRMÉ »).
//
// ⚠️ CE QUE LA MUTATION OUVRE. `EtatConfirmation` a TROIS valeurs — `absente`,
//    `valide`, `invalide`. Le refus doit porter sur les DEUX qui ne sont pas
//    `valide` : un jeton expiré, consommé, lié à un autre `argHash` ou à un
//    autre principal rend `invalide`, et `invalide` n'est PAS une confirmation.
//    Muté, l'étape 11 ne refuse plus que l'ABSENCE de jeton : présenter
//    n'importe quelle chaîne suffit à franchir la seule branche du § 20 dont le
//    socle dit qu'« aucune élicitation MCP n'en tient lieu ».
//
// ⚠️ POURQUOI RIEN NE LE VOYAIT. Les harnais du dépôt n'exercent la branche de
//    confirmation de l'étape 11 qu'avec un jeton ABSENT (`jetonDeConfirmation:
//    null`) : les deux formes se confondent alors, et la mutation devient
//    invisible. La garde ci-dessous PRÉSENTE un jeton et fait répondre
//    `invalide` — c'est le seul décor où les deux écritures divergent.
//
// ⚠️ DEUX DES HUIT SE TUENT ICI, ET C'EST LA MÊME PORTE. `m26` débranche
//    l'exigence entière — l'étape 11 laisse alors passer sans rien demander ;
//    `m03` la laisse en place et n'en refuse plus que la moitié. Le décor qui
//    les distingue est le même. Rejouées séparément sur le dépôt réel, `m03`
//    fait rougir UN test de ce fichier — le premier — et `m26` en fait rougir
//    QUATRE, dont le contre-témoin : débrancher la branche entière se voit de
//    plus loin que la débrancher à moitié.

describe("m03 · § 20 — un jeton de confirmation INVALIDE ne confirme rien", () => {
  /**
   * Le décor du § 20, monté sur l'orchestrateur RÉEL : la session a lu chez un
   * autre domaine, l'appel porte un argument libre vers `temoin`, et le niveau
   * est `libre` — donc l'étape 11 exige une confirmation humaine.
   */
  function harnaisSousConfirmation(confirmation: "valide" | "invalide"): Harnais {
    return fabriquerHarnais({
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
      index: indexMarque(),
      confirmation,
    });
  }

  it("REFUSE, et l'effet extérieur ne part pas", async () => {
    const harnais = harnaisSousConfirmation("invalide");

    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({
        nomComplet: "temoin.envoyer",
        input: { note: "un texte libre" },
        jetonDeConfirmation: "jeton-presente-mais-refuse",
      }),
      harnais.deps,
    );

    const ligne = derniereLigne(harnais.store);
    console.info(
      `[m03 · jeton INVALIDE] ${String(harnais.confirmations.length)} vérification(s) de ` +
        `confirmation · ${String(harnais.effets())} effet(s) extérieur(s) · ` +
        `terminaison ${resultat.terminaison.genre} · code ${String(resultat.refus?.code)} · ` +
        `étape refusante ${String(ligne.stepDenied)}`,
    );

    // PLANCHER-TÉMOIN : sans vérification appelée, la garde ne mesurerait rien.
    expect(harnais.confirmations.length, "le jeton présenté a bien été vérifié").toBe(1);
    expect(resultat.terminaison.genre, "l'appel est REFUSÉ").toBe("refus");
    expect(harnais.effets(), "et rien n'est sorti de la machine").toBe(0);
    // Le refus est bien celui de la PROVENANCE, pas celui de la politique.
    expect(resultat.refus?.etape).toBe(11);
    expect(resultat.refus?.message).toMatch(/CONFIRMATION/);
    expect(ligne.stepDenied, "la ligne du § 11 porte l'étape 11").toBe(11);
  });

  it("CONTRE-TÉMOIN — le MÊME décor avec un jeton VALIDE laisse passer", async () => {
    // Sans ce jumeau, la garde précédente serait verte pour un refus obtenu
    // ailleurs — un scope manquant, une politique fermée, un outil absent.
    const harnais = harnaisSousConfirmation("valide");

    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({
        nomComplet: "temoin.envoyer",
        input: { note: "un texte libre" },
        jetonDeConfirmation: "jeton-presente-et-accepte",
      }),
      harnais.deps,
    );

    console.info(
      `[m03 · contre-témoin, jeton VALIDE] ${String(harnais.confirmations.length)} ` +
        `vérification(s) · ${String(harnais.effets())} effet(s) extérieur(s) · ` +
        `terminaison ${resultat.terminaison.genre}`,
    );

    expect(harnais.confirmations.length).toBe(1);
    expect(resultat.terminaison.genre, "le décor est franchissable").toBe("succès");
    expect(harnais.effets(), "et l'effet part alors").toBe(1);
  });

  it("ISOLE LA SEULE RÈGLE — sans jeton du tout, le refus est le même", async () => {
    // Le troisième état d'`EtatConfirmation`. Il refusait déjà AVANT la
    // mutation : c'est précisément pourquoi la mutation était invisible.
    const harnais = harnaisSousConfirmation("invalide");

    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({
        nomComplet: "temoin.envoyer",
        input: { note: "un texte libre" },
        jetonDeConfirmation: null,
      }),
      harnais.deps,
    );

    console.info(
      `[m03 · jeton ABSENT] ${String(harnais.confirmations.length)} vérification(s) — ` +
        `attendu 0, vérifier CONSOMME · ${String(harnais.effets())} effet(s) · ` +
        `terminaison ${resultat.terminaison.genre}`,
    );

    // Aucune vérification : le socle ne brûle pas un jeton qu'on ne lui a pas
    // donné. Les deux états se distinguent donc AUSSI par ce compte.
    expect(harnais.confirmations.length).toBe(0);
    expect(resultat.terminaison.genre).toBe("refus");
    expect(harnais.effets()).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m25 — LE JETON ÉTAIT CONFRONTÉ À L'EMPREINTE **BRUTE**
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `const etat = await confirmationCourante(argHash);`
//  APRÈS : `const etat = await confirmationCourante(argHashBrut);`
//  Fichier : `core/chaine/orchestrateur.ts`, rappel de confirmation de l'étape 11.
//
// ⚠️ CE QUE LA MUTATION OUVRE. Le § 20 lie le jeton de confirmation à UNE cible
//    exacte : `{ tool, argHash }`. L'orchestrateur le dit lui-même à l'étape 8 —
//    « la valeur est validée, et c'est SON empreinte que la ligne doit porter
//    (§ 20, liaison du jeton de confirmation) ». `argHashBrut` est l'empreinte
//    de la charge **avant** validation. Les deux divergent dès qu'un schéma
//    porte un `.default()`, une coercition ou un champ retiré — c'est-à-dire dès
//    qu'un schéma fait son travail. Un jeton délivré pour une cible pourrait
//    alors être présenté sur une autre, et l'inverse : une confirmation
//    parfaitement légitime serait refusée.
//
// ⚠️ POURQUOI RIEN NE LE VOYAIT. Tous les harnais du dépôt valident par
//    l'IDENTITÉ (`validerEntree` rend l'entrée telle quelle) : les deux
//    empreintes sont alors le MÊME nombre, et la mutation est indiscernable.
//    La garde ci-dessous fait DIVERGER les deux — et vérifie d'abord qu'elles
//    divergent, sans quoi elle mesurerait une égalité pour rien.

describe("m25 · § 20 — le jeton est lié à l'empreinte de l'entrée VALIDÉE", () => {
  /** Ce que l'étape 8 rend : l'entrée reçue PLUS un défaut posé par le schéma. */
  const ENTREE_RECUE = { note: "un texte libre" } as const;
  const ENTREE_VALIDEE = { note: "un texte libre", langue: "fr" } as const;

  it("confronte la confirmation à l'empreinte de l'entrée VALIDÉE, pas de la brute", async () => {
    const harnais = fabriquerHarnais({
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
      index: indexMarque(),
      confirmation: "invalide",
      validation: { ok: true, valeur: ENTREE_VALIDEE },
    });

    const empreinteValidee = await correspondance.calculer("temoin.envoyer", ENTREE_VALIDEE);
    const empreinteBrute = await correspondance.calculer("temoin.envoyer", ENTREE_RECUE);

    await orchestrerAppel(
      harnais.identite,
      appelTemoin({
        nomComplet: "temoin.envoyer",
        input: ENTREE_RECUE,
        jetonDeConfirmation: "jeton-lie-a-une-cible",
      }),
      harnais.deps,
    );

    const recu = harnais.confirmations[0];
    console.info(
      `[m25 · liaison du jeton] ${String(harnais.confirmations.length)} vérification(s) · ` +
        `les deux empreintes DIVERGENT : ${String(empreinteValidee !== empreinteBrute)} · ` +
        `reçue = validée : ${String(recu?.argHash === empreinteValidee)} · ` +
        `reçue = brute : ${String(recu?.argHash === empreinteBrute)} · ` +
        `outil confronté : ${String(recu?.tool)}`,
    );

    // PLANCHER-TÉMOIN — sans cette ligne, la garde serait verte le jour où le
    // harnais revalidrait par l'identité, et elle ne mesurerait plus rien.
    expect(empreinteValidee, "les deux empreintes doivent DIVERGER").not.toBe(empreinteBrute);
    expect(harnais.confirmations.length, "le jeton a bien été vérifié").toBe(1);
    expect(recu?.argHash, "§ 20 — la cible est l'entrée VALIDÉE").toBe(empreinteValidee);
    expect(recu?.argHash, "et surtout PAS la charge brute").not.toBe(empreinteBrute);
    expect(recu?.tool, "la cible porte aussi le nom de l'outil").toBe("temoin.envoyer");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m30 — LA LIGNE D'`ops_audit` PORTAIT LE NIVEAU **BRUT**
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `entete.policyLevel = calcule.niveau;`
//  APRÈS : `entete.policyLevel = brut.niveau;`
//  Fichier : `core/chaine/orchestrateur.ts`, étape 10.
//
// ⚠️ CE QUE LA MUTATION OUVRE. L'orchestrateur ne croit pas le dépôt de
//    politique sur parole : un niveau hors énumération, ou un niveau CALCULÉ SUR
//    ZÉRO LIGNE, replie sur `brouillon`. Muté, la DÉCISION reste prise sur le
//    niveau replié — l'envoi ne part toujours pas — mais la LIGNE affirme le
//    niveau brut. Le journal dirait alors « libre » d'un appel jugé sous
//    `brouillon` : la métrique du § 24 compterait les refus sous un niveau qui
//    n'a jamais été appliqué, et une enquête partirait dans la mauvaise
//    direction. Le § 12 exige le niveau CALCULÉ à l'appel, jamais un champ relu.
//
// ⚠️ POURQUOI RIEN NE LE VOYAIT. Les gardes du repli mesurent ce qui NE PART
//    PAS ; aucune ne relit la colonne `policyLevel` de la ligne écrite dans ce
//    décor. Partout ailleurs `brut` et `calcule` sont le même objet.

describe("m30 · § 12 — la ligne porte le niveau APPLIQUÉ, jamais le niveau relu", () => {
  /** Un dépôt de politique AVEUGLE : il annonce `libre` sans avoir rien examiné. */
  const POLITIQUE_AVEUGLE: NiveauApplique = {
    niveau: "libre",
    raison: "aucune-ligne-couvrante",
    mesures: 0,
    enVigueur: 0,
    retenues: [],
    anomalies: [],
  };

  it("un niveau annoncé « libre » sur ZÉRO ligne examinée s'écrit « brouillon »", async () => {
    const harnais = fabriquerHarnais({
      outils: [outilEnvoi()],
      niveau: POLITIQUE_AVEUGLE,
    });

    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ nomComplet: "temoin.envoyer", input: { note: "un texte" } }),
      harnais.deps,
    );
    const ligne = derniereLigne(harnais.store);

    console.info(
      `[m30 · repli journalisé] niveau ANNONCÉ « ${POLITIQUE_AVEUGLE.niveau} » sur ` +
        `${String(POLITIQUE_AVEUGLE.mesures)} ligne(s) examinée(s) · niveau ÉCRIT ` +
        `« ${ligne.policyLevel} » · niveau de la trace « ${resultat.trace.niveauApplique} » · ` +
        `${String(harnais.effets())} effet(s) extérieur(s) · ` +
        `terminaison ${resultat.terminaison.genre}`,
    );

    // PLANCHER-TÉMOIN : le décor doit VRAIMENT déclencher le repli, sans quoi
    // les deux écritures seraient d'accord et la garde ne mesurerait rien.
    expect(resultat.trace.niveauMesures, "le dépôt n'a examiné aucune ligne").toBe(0);
    expect(resultat.trace.niveauApplique, "le niveau APPLIQUÉ est le repli").toBe("brouillon");
    expect(ligne.policyLevel, "§ 12 — et la LIGNE porte le niveau appliqué").toBe("brouillon");
    expect(ligne.policyLevel, "jamais celui que le dépôt annonçait").not.toBe(
      POLITIQUE_AVEUGLE.niveau,
    );
    expect(harnais.effets(), "et rien n'est parti sous ce repli").toBe(0);
  });

  it("CONTRE-TÉMOIN — une politique QUI A MESURÉ s'écrit telle quelle", async () => {
    // Sans ce jumeau, la garde précédente serait verte pour un `policyLevel`
    // bloqué à « brouillon », ou déduit d'autre chose que du calcul.
    const harnais = fabriquerHarnais({
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
    });

    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ nomComplet: "temoin.envoyer", input: { note: "un texte" } }),
      harnais.deps,
    );
    const ligne = derniereLigne(harnais.store);

    console.info(
      `[m30 · contre-témoin] niveau annoncé « ${NIVEAU_LIBRE.niveau} » sur ` +
        `${String(NIVEAU_LIBRE.mesures)} ligne(s) examinée(s) · niveau ÉCRIT ` +
        `« ${ligne.policyLevel} » · ${String(harnais.effets())} effet(s) extérieur(s)`,
    );

    expect(resultat.trace.niveauMesures).toBeGreaterThan(0);
    expect(ligne.policyLevel, "aucun repli : le niveau mesuré s'écrit").toBe("libre");
    expect(harnais.effets(), "et l'envoi part").toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m21 — UNE LECTURE SERVIE REDEVENAIT REJOUABLE
//  *** DÉJÀ TUÉE AILLEURS — garde de PROXIMITÉ, hors des huit ***
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `terminaisonRendue,`
//  APRÈS : `terminaisonRendue: false,`
//  Fichier : `core/chaine/orchestrateur.ts`, la clôture d'idempotence du
//  `finally` de l'étape 14 (ADR 0021).
//
// ⚠️ CE QUE LA MUTATION OUVRE. `issueDeReservation` a trois branches ; celle du
//    milieu — `terminaisonRendue` — est, dit `core/limits/idempotency.ts`, « CE
//    QUI A RÉELLEMENT REFERMÉ LE DÉFAUT DU LOT 1c ». Muté, un appel `read` ou
//    `write-draft` SERVI ferme sa réservation en `failed` : or `failed` est le
//    seul statut que `reserver()` REPREND. La clé d'idempotence d'un appel
//    parfaitement réussi redevient donc libre — la déduplication du § 12 ne
//    déduplique plus rien sur les deux `effect` non extérieurs.
//
// ⚠️ **ELLE N'EST PAS UNE DES HUIT — LA REMESURE LE DIT.** Rejouée sur une
//    copie isolée de HEAD, elle fait rougir quatre tests de
//    `core/epreuve/chaine-chemins-de-panne.spec.ts`. Elle est gardée ICI parce
//    que ces quatre tests l'attrapent par la BANDE — un journal injoignable, une
//    intention qui lève, un rejeu séquentiel — et qu'aucun ne dit la règle en
//    face. Celle-ci la dit, sur le seul `effect` que la troisième branche ne
//    rattrape pas : `send` et `destructive` ferment en `done` de toute façon,
//    donc seul un `read` ou un `write-draft` met `terminaisonRendue` en jeu.

describe("m21 · ADR 0021 — une clé d'idempotence servie se ferme en « done »", () => {
  const CLE = "cle-de-lecture-du-lot3-0f3a";

  /** Le statut de l'UNIQUE réservation posée, mesuré et non supposé. */
  function statutUnique(harnais: Harnais): { readonly clefs: number; readonly statut: string } {
    const toutes = [...harnais.idempotence.lignes.values()];
    return { clefs: toutes.length, statut: String(toutes[0]?.status) };
  }

  it("sur un outil `read` SERVI — le cas que la troisième branche ne rattrape pas", async () => {
    const harnais = fabriquerHarnais({
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });

    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ idempotencyKey: CLE }),
      harnais.deps,
    );
    const mesure = statutUnique(harnais);

    console.info(
      `[m21 · read servi] effect « read » · ${String(mesure.clefs)} réservation(s) posée(s) · ` +
        `statut « ${mesure.statut} » · ${String(harnais.effets())} appel(s) d'adaptateur · ` +
        `terminaison ${resultat.terminaison.genre}`,
    );

    // PLANCHER-TÉMOIN : sans réservation, « done » ne voudrait rien dire.
    expect(mesure.clefs, "une réservation a bien été posée").toBe(1);
    expect(resultat.terminaison.genre, "l'appel a été SERVI").toBe("succès");
    expect(harnais.effets(), "l'adaptateur a bien rendu").toBe(1);
    // ⚠️ LE POINT : `failed` est le seul statut que `reserver()` reprend.
    expect(mesure.statut, "ADR 0021 — l'étape 14 a RENDU : la clé se ferme").toBe("done");
  });

  it("et le rejeu de la MÊME clé ne rappelle pas l'adaptateur", async () => {
    // La conséquence observable de la règle : sans elle, ce second appel
    // reprendrait la réservation `failed` et rappellerait l'adaptateur.
    const harnais = fabriquerHarnais({
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });

    await orchestrerAppel(harnais.identite, appelTemoin({ idempotencyKey: CLE }), harnais.deps);
    const apresPremier = harnais.effets();
    const second = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ idempotencyKey: CLE }),
      harnais.deps,
    );
    const mesure = statutUnique(harnais);

    console.info(
      `[m21 · rejeu] ${String(apresPremier)} appel(s) d'adaptateur après le 1er · ` +
        `${String(harnais.effets())} après le 2nd · ${String(mesure.clefs)} réservation(s) · ` +
        `statut « ${mesure.statut} » · terminaison du 2nd ${second.terminaison.genre}`,
    );

    expect(apresPremier, "plancher : le premier appel a bien servi").toBe(1);
    expect(harnais.effets(), "§ 12 — le rejeu n'exécute rien de nouveau").toBe(1);
    expect(mesure.clefs, "et il n'a pas posé de seconde réservation").toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATIONS m29 ET m28 — L'INDEX DE PROVENANCE N'INDEXAIT PLUS RIEN
//  *** DÉJÀ TUÉES AILLEURS — garde de PROXIMITÉ, hors des huit ***
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `const charge: unknown = execution.charge;`
//  APRÈS : `if (true as boolean) return []; const charge: unknown = …`
//  Fichier : `core/chaine/orchestrateur.ts`, `empreintesParDefaut`.
//
// ⚠️ CE QUE LA MUTATION OUVRE. `empreintesParDefaut` est ce que la chaîne remet
//    à l'index de provenance après l'étape 14. Muté, elle rend la liste VIDE :
//    la marque de DOMAINE passe encore — l'étape 11 continue donc de refuser —,
//    mais `IndexProvenance.taille()` reste à zéro. Or ce compte est, dit le
//    § 20, « LE signal positif du healthcheck : il distingue “aucune session
//    marquée” de “l'index ne fonctionne plus” ». Muté, les deux redeviennent
//    indiscernables, et l'écran Santé du § 22 affiche un index en panne comme
//    un index au repos.
//
// ⚠️ **ELLE N'EST PAS UNE DES HUIT.** Rejouée sur une copie isolée de HEAD,
//    elle fait rougir trois fichiers. Elle est gardée ici parce que les gardes
//    de l'index l'alimentent DIRECTEMENT par `marquer()`, avec des empreintes
//    fabriquées à la main : aucune ne fait le tour complet par la chaîne pour
//    relire le compte ensuite. Le troisième test ci-dessous le fait — et c'est
//    aussi lui qui tue **m28**, la mutation voisine qui débranche
//    `marquerResultat` : sans marquage, l'index ne compte plus ni extrait ni
//    session.

describe("m29 · § 20 — ce qui entre à l'index est UNE empreinte PAR ÉLÉMENT SERVI", () => {
  it("rend une empreinte par élément, et deux éléments distincts en donnent deux", () => {
    // Un mot qui ne peut pas apparaître par hasard dans un condensat hexadécimal.
    const MOT_DU_CONTENU = "texte-lisible-du-temoin";
    const execution = {
      charge: {
        items: [
          { id: "un", corps: MOT_DU_CONTENU },
          { id: "deux", corps: MOT_DU_CONTENU },
          { id: "trois", corps: MOT_DU_CONTENU },
        ],
      },
    } as unknown as ExecutionEtablie;

    const empreintes = empreintesParDefaut(execution);
    const distinctes = new Set(empreintes);
    const quiFuient = empreintes.filter((e) => e.includes(MOT_DU_CONTENU));

    console.info(
      `[m29 · unité] 3 élément(s) servi(s) · ${String(empreintes.length)} empreinte(s) rendue(s) · ` +
        `${String(distinctes.size)} distincte(s) · ${String(quiFuient.length)} portant le ` +
        `contenu · longueur de la 1re : ${String(empreintes[0]?.length ?? 0)}`,
    );

    expect(empreintes.length, "une empreinte PAR ÉLÉMENT servi").toBe(3);
    // Les trois éléments ne diffèrent que par leur RANG : sans le rang dans
    // l'empreinte, trois messages identiques n'en donneraient qu'une.
    expect(distinctes.size, "et elles ne se confondent pas").toBe(3);
    // Le § 20 : ce qui entre à l'index n'est JAMAIS le contenu.
    expect(quiFuient, "aucune empreinte ne porte le texte servi").toEqual([]);
  });

  it("une charge SANS `items` rend tout de même UNE empreinte — jamais zéro", () => {
    const execution = { charge: { resume: "une valeur servie" } } as unknown as ExecutionEtablie;
    const empreintes = empreintesParDefaut(execution);

    console.info(
      `[m29 · charge sans items] ${String(empreintes.length)} empreinte(s) rendue(s) — ` +
        "attendu 1 : un index vide se lirait comme un index en panne",
    );

    expect(empreintes.length).toBe(1);
  });

  it("PAR LA CHAÎNE ENTIÈRE — l'index compte ce que l'appel a servi", async () => {
    // Le tour complet : sans lui, la garde unitaire ci-dessus resterait verte
    // le jour où l'orchestrateur cesserait d'appeler cette fonction.
    const harnais = fabriquerHarnais({
      outils: [outilTemoin({ dataClass: "personal" })],
      charge: {
        items: [{ id: "a" }, { id: "b" }],
        failedSources: [],
        sourceIncomplete: false,
        recordIds: [],
      },
    });

    await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);
    const etat = harnais.index.etat();

    console.info(
      `[m29 · chaîne] 2 élément(s) servi(s) · ${String(harnais.empreintesRemises[0]?.length ?? 0)} ` +
        `empreinte(s) remise(s) à l'index · ${String(etat.extraits)} extrait(s) indexé(s) · ` +
        `${String(etat.sessions)} session(s) marquée(s)`,
    );

    expect(harnais.empreintesRemises.length, "l'index a bien été alimenté une fois").toBe(1);
    expect(harnais.empreintesRemises[0]?.length, "deux éléments, deux empreintes").toBe(2);
    // ⚠️ LE SIGNAL POSITIF DU HEALTHCHECK : zéro extrait ne doit pas pouvoir
    //    sortir d'une session qui vient d'être marquée.
    expect(etat.extraits, "§ 22 — l'index DIT ce qu'il retient").toBe(2);
    expect(etat.sessions).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m19 — UNE SECONDE ÉVICTION POUVAIT **RACCOURCIR** L'INDÉTERMINATION
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `this.#indetermineJusqua = Math.max(this.#indetermineJusqua ?? 0, jusqua);`
//  APRÈS : `this.#indetermineJusqua = jusqua;`
//  Fichier : `core/chaine/etape-11-provenance.ts`, `#evincerLaPlusAncienne`.
//
// ⚠️ CE QUE LA MUTATION OUVRE. Quand l'index sature, il ÉVINCE une session et se
//    déclare « indéterminé » jusqu'à l'échéance de ce qu'il vient de perdre :
//    tant que dure cette échéance, `domainesMarquants()` rend
//    `DOMAINE_INDETERMINE` et l'étape 11 refuse. `Math.max` écrit UNE règle, et
//    une seule : **cette dégradation ne se lève que par expiration, jamais par
//    un événement postérieur.** Muté, une éviction suivante dont la perte expire
//    PLUS TÔT RACCOURCIT l'indétermination — le socle se redéclare intègre alors
//    qu'il ne sait toujours pas ce qu'il a perdu, et l'étape 11 rouvre.
//
// ⚠️ CE QUI DISTINGUE LES DEUX ÉCRITURES, ET RIEN D'AUTRE. Tant que l'horloge
//    AVANCE, les deux sont d'accord : les échéances suivent l'ordre des
//    marquages, donc chaque éviction porte une échéance ≥ la précédente et
//    `Math.max` rend son second argument. **SEUL un recul de l'horloge les
//    sépare** — un pas NTP arrière, la restauration d'un instantané de machine
//    virtuelle, une correction manuelle. C'est exactement pourquoi rien ne le
//    voyait : aucune garde du dépôt ne fait reculer `maintenant`.
//
// ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE. Ce témoin ne dit PAS qu'une horloge
//    recule souvent. Il dit que la propriété gardée — « l'indétermination ne se
//    raccourcit jamais » — n'est tenue QUE par `Math.max`, et il l'éprouve sur
//    le seul décor qui la met en jeu. La contre-épreuve à horloge croissante est
//    donnée juste après, pour qu'on voie que la garde ne mesure pas l'horloge.

describe("m19 · § 20 — une indétermination ne se RACCOURCIT jamais", () => {
  /** Une horloge que le témoin déplace — en avant comme en arrière. */
  function horloge(debut: number): {
    readonly maintenant: () => Date;
    readonly poser: (instant: number) => void;
  } {
    let instant = debut;
    return {
      maintenant: (): Date => new Date(instant),
      poser: (valeur: number): void => {
        instant = valeur;
      },
    };
  }

  const T0 = new Date("2026-09-01T10:00:00.000Z").getTime();
  /** L'écart entre deux marquages. Il fait que les échéances se DISTINGUENT. */
  const PAS_MS = 60_000;
  /** Le recul : cent secondes en arrière, l'ordre de grandeur d'un pas NTP. */
  const RECUL_MS = 100_000;

  it("une éviction POSTÉRIEURE mais moins durable ne relève pas la dégradation", () => {
    const h = horloge(T0);
    const index = new IndexProvenanceMemoire({ plafondSessions: 2, maintenant: h.maintenant });

    // ① Deux sessions, à deux instants DIFFÉRENTS : leurs marques expirent à
    //    T0 + TTL et T0 + PAS + TTL.
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("a")]);
    h.poser(T0 + PAS_MS);
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("b")]);
    // ② La troisième déborde : PREMIÈRE éviction, perte qui expire à T0 + TTL.
    h.poser(T0 + 2 * PAS_MS);
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("c")]);
    const apresPremiere = index.etat();

    // ③ L'HORLOGE RECULE. Rien n'expire : le pas arrière est bien plus court
    //    que la durée d'une marque.
    h.poser(T0 - RECUL_MS);
    // ④ Une quatrième session : DEUXIÈME éviction — celle marquée à T0 + PAS,
    //    dont l'échéance (T0 + PAS + TTL) est la plus TARDIVE des deux pertes.
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("d")]);
    // ⑤ Une cinquième : TROISIÈME éviction — et cette fois la perte est celle
    //    marquée APRÈS le recul, dont l'échéance (T0 − RECUL + TTL) est la plus
    //    PRÉCOCE de toutes. C'est ici, et nulle part ailleurs, que les deux
    //    écritures divergent.
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("e")]);
    const apresToutes = index.etat();

    // ⑥ L'instant du verdict : après l'échéance de la DERNIÈRE perte, avant
    //    celle de la plus tardive.
    h.poser(T0 - RECUL_MS + TTL_MARQUAGE_MS + 1);
    const auVerdict = index.etat();
    // ⑦ Et au-delà de la plus TARDIVE, la dégradation se lève — elle est bornée.
    h.poser(T0 + PAS_MS + TTL_MARQUAGE_MS + 1);
    const apresTout = index.etat();

    console.info(
      `[m19 · indétermination] recul de l'horloge : ${String(RECUL_MS)} ms · ` +
        `${String(apresToutes.sessionsEvincees)} éviction(s) mesurée(s) · ` +
        `indéterminé après la 1re : ${String(apresPremiere.indetermine)} · ` +
        `après les trois : ${String(apresToutes.indetermine)} · ` +
        `à l'échéance de la perte la plus PRÉCOCE : ${String(auVerdict.indetermine)} · ` +
        `à l'échéance de la plus TARDIVE : ${String(apresTout.indetermine)}`,
    );

    // PLANCHERS-TÉMOINS : sans eux, « toujours indéterminé » se lirait aussi
    // bien d'un index qui n'a jamais rien évincé.
    expect(apresPremiere.indetermine, "la première éviction dégrade").toBe(true);
    expect(apresToutes.sessionsEvincees, "trois évictions ont bien eu lieu").toBe(3);
    expect(apresToutes.indetermine).toBe(true);

    // ⚠️ LE POINT : une éviction postérieure NE RACCOURCIT PAS la dégradation.
    expect(auVerdict.indetermine, "§ 20 — la dégradation court jusqu'à SA fin").toBe(true);
    // Et elle reste BORNÉE : au-delà, ce qui a été perdu aurait expiré.
    expect(apresTout.indetermine, "mais elle finit — un mur permanent se désarme").toBe(false);
  });

  it("CONTRE-TÉMOIN — à horloge CROISSANTE, la dégradation s'ÉTEND et finit", () => {
    // Ce jumeau isole la règle : la garde précédente pourrait être verte pour
    // un `indetermine` bloqué à `true`. Ici l'horloge n'a pas reculé, les deux
    // écritures sont d'accord, et l'échéance suit la perte la plus tardive.
    const h = horloge(T0);
    const index = new IndexProvenanceMemoire({ plafondSessions: 2, maintenant: h.maintenant });

    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("a")]);
    h.poser(T0 + PAS_MS);
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("b")]);
    h.poser(T0 + 2 * PAS_MS);
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("c")]); // évince « a »
    h.poser(T0 + 3 * PAS_MS);
    index.marquer(sessionIdDeTemoin(), DOMAINE_LECTURE, [empreinteExtrait("d")]); // évince « b »

    // Juste après l'échéance de la PREMIÈRE perte : la seconde, plus tardive,
    // tient encore — l'indétermination s'est ÉTENDUE.
    h.poser(T0 + TTL_MARQUAGE_MS + 1);
    const encore = index.etat();
    h.poser(T0 + PAS_MS + TTL_MARQUAGE_MS + 1);
    const fini = index.etat();

    console.info(
      `[m19 · contre-témoin, horloge croissante] ` +
        `${String(encore.sessionsEvincees)} éviction(s) · indéterminé à T0+TTL : ` +
        `${String(encore.indetermine)} · à T0+PAS+TTL : ${String(fini.indetermine)}`,
    );

    expect(encore.sessionsEvincees, "deux évictions ont eu lieu").toBe(2);
    expect(encore.indetermine, "la seconde perte, plus tardive, tient encore").toBe(true);
    expect(fini.indetermine, "et au-delà de la plus tardive, tout se lève").toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m27 — L'ÉTAPE 7 DÉBRANCHÉE
//  *** DÉJÀ TUÉE AILLEURS — garde de PROXIMITÉ, hors des huit ***
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `if (!estServi(outil, profil)) {`
//  APRÈS : `if (false as boolean) {`
//  Fichier : `core/chaine/orchestrateur.ts`, étape 7.
//
// ⚠️ CE QUE LA MUTATION OUVRE. L'étape 7 est le seul endroit où le PROFIL ACTIF
//    décide. Débranchée, un outil qui n'est rattaché à aucun profil — ou qui a
//    été sorti de `tools/list` — est servi comme n'importe quel autre : la
//    console cesse de commander la surface exposée, et personne ne le voit
//    puisque tout continue de fonctionner.
//
// ⚠️ **ELLE N'EST PAS UNE DES HUIT.** Rejouée sur une copie isolée de HEAD, elle
//    fait rougir deux fichiers. Elle est gardée ici parce que les trois
//    conditions du § 14 (rattaché · activé · listé) n'étaient éprouvées face à
//    l'orchestrateur que par la première ; les deux gardes ci-dessous prennent
//    la première et la TROISIÈME, avec leur contre-témoin.

describe("m27 · § 14 — l'outil doit être SERVI par le profil actif", () => {
  it("un outil rattaché à AUCUN profil est refusé à l'étape 7, et rien ne part", async () => {
    const harnais = fabriquerHarnais({
      // Trois conditions au § 14, correction 3 ; celle-ci est le rattachement.
      outils: [outilTemoin({ profiles: [] })],
    });

    const resultat = await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);
    const ligne = derniereLigne(harnais.store);

    console.info(
      `[m27 · profil] outil rattaché à 0 profil · profil actif « ${PROFIL_TEMOIN} » · ` +
        `terminaison ${resultat.terminaison.genre} · étape refusante ` +
        `${String(resultat.trace.etapeRefusante)} · code ${String(resultat.refus?.code)} · ` +
        `${String(harnais.effets())} appel(s) d'adaptateur`,
    );

    expect(resultat.terminaison.genre).toBe("refus");
    expect(resultat.trace.etapeRefusante, "§ 11 — c'est l'étape 7 qui prononce").toBe(7);
    expect(ligne.stepDenied).toBe(7);
    expect(harnais.effets(), "l'adaptateur n'a jamais été atteint").toBe(0);
  });

  it("un outil SORTI de `tools/list` est refusé lui aussi — la 3e condition", async () => {
    const harnais = fabriquerHarnais({
      outils: [outilTemoin({ retireDeLaListe: true })],
    });

    const resultat = await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);

    console.info(
      `[m27 · retiré de la liste] rattaché à « ${PROFIL_TEMOIN} » mais retiré · ` +
        `terminaison ${resultat.terminaison.genre} · étape refusante ` +
        `${String(resultat.trace.etapeRefusante)} · ${String(harnais.effets())} appel(s)`,
    );

    expect(resultat.terminaison.genre).toBe("refus");
    expect(resultat.trace.etapeRefusante).toBe(7);
    expect(harnais.effets()).toBe(0);
  });

  it("CONTRE-TÉMOIN — le MÊME outil, rattaché et listé, est servi", async () => {
    // Sans ce jumeau, les deux gardes ci-dessus seraient vertes pour une chaîne
    // qui refuserait tout.
    const harnais = fabriquerHarnais();
    const resultat = await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);

    console.info(
      `[m27 · contre-témoin] terminaison ${resultat.terminaison.genre} · ` +
        `${String(harnais.effets())} appel(s) d'adaptateur`,
    );

    expect(resultat.terminaison.genre).toBe("succès");
    expect(harnais.effets()).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m15 — UNE CORRESPONDANCE QUI MENT POUVAIT **AUTORISER**
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `if (!estUnScopeDuSocle(scopeExige)) {`
//  APRÈS : `if (false as boolean) {`
//  Fichier : `core/chaine/etape-05-scopes.ts`, branche (b) de l'étape 5.
//
// ⚠️ CE QUE LA MUTATION OUVRE. `CorrespondanceScopes` est un PORT, et l'étape 5
//    écrit en toutes lettres qu'« il peut mentir ». La branche (b) est le
//    fail-closed : un scope exigé qui n'est aucun des cinq du § 19.2 fait
//    REFUSER, plutôt que deviner. Muté, la valeur inventée tombe dans
//    `PORTE_PAR_LE_JETON_DAPPEL[scopeExige]` — une INDEXATION D'OBJET. Pour la
//    plupart des valeurs, le résultat est `undefined` et l'étape refuse encore
//    (avec le mauvais message). Mais pour un nom HÉRITÉ d'`Object.prototype` —
//    `constructor`, `toString`, `valueOf`, `hasOwnProperty` — l'indexation rend
//    une FONCTION, donc une valeur vraie : le contrôle « ce scope est-il portable
//    ? » passe, et il ne reste que « le jeton le porte-t-il ». Un porteur dont le
//    tableau de scopes contient cette chaîne est alors **AUTORISÉ**.
//
// ⚠️ POURQUOI RIEN NE LE VOYAIT. Le témoin du dépôt emploie `ops:superuser` et
//    un jeton qui ne le porte PAS : muté, l'appel est refusé quand même — par la
//    branche suivante, avec un autre message. Le test ne lisait que l'issue.
//    Cette garde-ci lit LEQUEL des refus a parlé, et ajoute au corpus les quatre
//    noms hérités que la branche suivante laisse passer.

describe("m15 · § 19.2 — un scope exigé hors des cinq FAIT REFUSER, et le dit", () => {
  /**
   * Ce qu'un port qui ment peut rendre. Deux familles, et la seconde est celle
   * que la branche suivante ne rattrape pas.
   */
  const FORMES_HORS_19_2: readonly string[] = [
    "ops:superuser", // un scope inventé
    "OPS:READ", // la casse changée à l'import
    "ops:read ", // un espace de fin — ce qu'un `char(n)` produit
    "", // une colonne vide
    "constructor", // ⚠️ hérités d'`Object.prototype` : l'indexation rend VRAI
    "toString",
    "valueOf",
    "hasOwnProperty",
  ];

  function verdictPour(valeur: string): ReturnType<typeof etape05Scopes> {
    return etape05Scopes({
      // Le jeton PORTE exactement ce que la correspondance va exiger : c'est le
      // cas où la dernière branche de l'étape 5 ne refuse plus rien.
      scopes: ["ops:read", valeur] as unknown as readonly OpsScope[],
      effectEpingle: "read",
      outil: "temoin.lire",
      correspondance: () => valeur as unknown as OpsScope,
    });
  }

  it("refuse les huit formes, et le message NOMME la branche du § 19.2", () => {
    let confrontees = 0;
    const autorisees: string[] = [];
    const refuseesParLaMauvaiseBranche: string[] = [];
    const heritees = FORMES_HORS_19_2.filter(
      (forme) => forme in ({} as Record<string, unknown>) && forme !== "",
    );

    for (const forme of FORMES_HORS_19_2) {
      confrontees += 1;
      const verdict = verdictPour(forme);
      if (verdict.issue !== "refuse") {
        autorisees.push(forme);
        continue;
      }
      // ⚠️ LIRE L'ISSUE NE SUFFIT PAS. Deux branches refusent, et une seule est
      //    celle-ci : le message dit laquelle a parlé.
      if (!verdict.message.includes("n'est pas un scope du § 19.2")) {
        refuseesParLaMauvaiseBranche.push(forme);
      }
    }

    console.info(
      `[m15 · port menteur] ${String(confrontees)} forme(s) confrontée(s) · ` +
        `${String(heritees.length)} héritée(s) d'\`Object.prototype\` : ${heritees.join(", ")} · ` +
        `${String(autorisees.length)} AUTORISÉE(s) : ${autorisees.join(", ") || "aucune"} · ` +
        `${String(refuseesParLaMauvaiseBranche.length)} refusée(s) par une AUTRE branche : ` +
        `${refuseesParLaMauvaiseBranche.join(", ") || "aucune"}`,
    );

    // PLANCHER-TÉMOIN : le corpus doit contenir des noms hérités, sans quoi il
    // ne mesure que la famille que la branche suivante rattrape déjà.
    expect(confrontees, "les huit formes ont été confrontées").toBe(FORMES_HORS_19_2.length);
    expect(heritees.length, "le corpus porte des noms hérités").toBeGreaterThanOrEqual(4);

    expect(autorisees, "§ 19.2 — aucune forme inventée n'est autorisée").toEqual([]);
    expect(
      refuseesParLaMauvaiseBranche,
      "et c'est bien le fail-closed du § 19.2 qui prononce le refus",
    ).toEqual([]);
  });

  it("CONTRE-TÉMOIN — les cinq scopes du § 19.2, eux, franchissent la branche", () => {
    // Sans ce jumeau, la garde serait verte pour une étape 5 qui refuse tout.
    const verdict = etape05Scopes({
      scopes: ["ops:read"],
      effectEpingle: "read",
      outil: "temoin.lire",
      correspondance: correspondanceCanonique,
    });

    console.info(
      `[m15 · contre-témoin] correspondance canonique, jeton « ops:read » · ` +
        `issue ${verdict.issue}`,
    );

    expect(verdict.issue, "un scope du § 19.2 n'est pas refusé par cette branche").toBe("autorise");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m23 — LA MÉMOÏSATION NE COUVRAIT PLUS QU'UN ÉTAT SUR TROIS
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `if (etatConfirmation !== null) return etatConfirmation;`
//  APRÈS : `if (etatConfirmation === "valide") return etatConfirmation;`
//  Fichier : `core/chaine/orchestrateur.ts`, `confirmationCourante`.
//
// ⚠️ CE QUE LA MUTATION OUVRE. L'orchestrateur écrit au-dessus de cette ligne :
//    « LA CONFIRMATION : VÉRIFIÉE AU PLUS UNE FOIS » et « VÉRIFIER CONSOMME ».
//    Le cache est un test de NULLITÉ : il couvre les TROIS états d'une
//    confirmation. Comparé à une seule valeur, il n'en couvre plus qu'UN : dès
//    qu'une étape obtient `invalide`, l'étape suivante qui redemande RAPPELLE le
//    vérificateur — et consomme une seconde fois un jeton à usage unique.
//
// ⚠️ **AUCUN TÉMOIN DE COMPORTEMENT NE PEUT LA TUER AUJOURD'HUI, ET C'EST
//    MESURÉ CI-DESSOUS.** Les deux seuls appelants sont l'étape 10 et l'étape
//    11 ; or `deciderEtape10` n'autorise QUE sur `valide` (`core/policy/effet.ts`),
//    donc tout état non valide obtenu à l'étape 10 REFUSE l'appel avant que
//    l'étape 11 n'existe. Le second appel est inatteignable, et fabriquer un
//    décor qui l'atteindrait fabriquerait un état que la chaîne ne produit pas.
//    La garde est donc en deux moitiés : la STRUCTURE — un test de nullité,
//    jamais une comparaison à une valeur — et la CAPACITÉ, qui compte les appels
//    réels sur les décors atteignables. La première mord ; la seconde dit
//    pourquoi la première est nécessaire.

describe("m23 · § 20 — la confirmation est vérifiée AU PLUS UNE FOIS", () => {
  const SOURCE_ORCHESTRATEUR = readFileSync(
    fileURLToPath(new URL("./orchestrateur.ts", import.meta.url)),
    "utf8",
  );

  it("le cache couvre les TROIS états : c'est un test de NULLITÉ, pas une valeur", () => {
    const nullite = /if \(etatConfirmation !== null\) return etatConfirmation;/;
    // Une comparaison à l'un des états nommés ne couvrirait que celui-là.
    const comparaisons = ETATS_CONFIRMATION.filter((etat) =>
      new RegExp(`etatConfirmation\\s*===\\s*"${etat}"`).test(SOURCE_ORCHESTRATEUR),
    );

    console.info(
      `[m23 · portée du cache] ${String(ETATS_CONFIRMATION.length)} état(s) de confirmation au ` +
        `§ 20 : ${ETATS_CONFIRMATION.join(", ")} · test de nullité présent : ` +
        `${String(nullite.test(SOURCE_ORCHESTRATEUR))} · ` +
        `${String(comparaisons.length)} comparaison(s) du cache à un état NOMMÉ : ` +
        `${comparaisons.join(", ") || "aucune"}`,
    );

    // PLANCHER-TÉMOIN : trois états, sinon la mesure ne dit rien de sa portée.
    expect(ETATS_CONFIRMATION.length, "le § 20 en compte trois").toBe(3);
    expect(nullite.test(SOURCE_ORCHESTRATEUR), "le cache teste la NULLITÉ").toBe(true);
    expect(comparaisons, "et jamais l'égalité à un état nommé").toEqual([]);
  });

  it("MESURE la capacité : sur chaque décor atteignable, UN appel au plus", async () => {
    // ⚠️ CE QUE CETTE MOITIÉ DIT, ET CE QU'ELLE NE DIT PAS. Elle ne tue pas la
    //    mutation — le second appel est inatteignable. Elle mesure que la règle
    //    « au plus une fois » tient sur les décors que la chaîne produit
    //    RÉELLEMENT, et elle rougira le jour où un troisième appelant
    //    apparaîtra sans que le cache le couvre.
    const decors: readonly {
      readonly nom: string;
      readonly outil: OutilDuCatalogue;
      readonly niveau: NiveauApplique;
      readonly confirmation: "valide" | "invalide";
      readonly marque: boolean;
    }[] = [
      {
        nom: "send @ confirmé, jeton invalide (étape 10 seule)",
        outil: outilEnvoi(),
        niveau: { ...NIVEAU_BROUILLON, niveau: "confirmé" },
        confirmation: "invalide",
        marque: false,
      },
      {
        nom: "send @ confirmé, jeton valide, session MARQUÉE (étapes 10 puis 11)",
        outil: outilEnvoi(),
        niveau: { ...NIVEAU_BROUILLON, niveau: "confirmé" },
        confirmation: "valide",
        marque: true,
      },
      {
        nom: "send @ libre, session MARQUÉE, jeton invalide (étape 11 seule)",
        outil: outilEnvoi(),
        niveau: NIVEAU_LIBRE,
        confirmation: "invalide",
        marque: true,
      },
      {
        nom: "read @ libre, session MARQUÉE, jeton valide (étape 11 seule)",
        outil: outilTemoin({ inputSchema: SCHEMA_AVEC_TEXTE_LIBRE }),
        niveau: NIVEAU_LIBRE,
        confirmation: "valide",
        marque: true,
      },
    ];

    let confrontes = 0;
    const comptes: string[] = [];
    let maximum = 0;

    for (const decor of decors) {
      const harnais = fabriquerHarnais({
        outils: [decor.outil],
        niveau: decor.niveau,
        confirmation: decor.confirmation,
        ...(decor.marque ? { index: indexMarque() } : {}),
      });
      await orchestrerAppel(
        harnais.identite,
        appelTemoin({
          nomComplet: decor.outil.name,
          input: { note: "un texte libre" },
          jetonDeConfirmation: "jeton-du-decor",
        }),
        harnais.deps,
      );
      confrontes += 1;
      maximum = Math.max(maximum, harnais.confirmations.length);
      comptes.push(`${decor.nom} → ${String(harnais.confirmations.length)}`);
    }

    console.info(
      `[m23 · capacité] ${String(confrontes)} décor(s) atteignable(s) confronté(s) · ` +
        `appels au vérificateur : ${comptes.join(" · ")} · maximum ${String(maximum)}`,
    );

    // PLANCHER-TÉMOIN : sans décor qui appelle vraiment, « au plus un » se
    // lirait aussi bien de « jamais ».
    expect(confrontes).toBe(decors.length);
    expect(maximum, "au moins un décor a bien fait vérifier").toBeGreaterThan(0);
    expect(maximum, "§ 20 — vérifier CONSOMME : au plus une fois par appel").toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  MUTATION m09 — LA CLÔTURE D'IDEMPOTENCE CESSAIT DE **LIRE** LE CLIQUET
// ═════════════════════════════════════════════════════════════════════════════
//
//  AVANT : `effetExterieurSurvenu: effetExterieurSurvenu(),`
//  APRÈS : `effetExterieurSurvenu: false,`
//  Fichier : `core/chaine/orchestrateur.ts`, l'appel à `issueDeReservation`
//  dans le `finally` de l'étape 14 (ADR 0021).
//
// ⚠️ **CETTE MUTATION EST BEHAVIORALEMENT ÉQUIVALENTE AUJOURD'HUI, ET C'EST
//    ÉCRIT DANS LE SOCLE.** `core/limits/idempotency.ts` le dit et le mesure :
//    « la branche du cliquet est la bonne, et elle n'est décisive dans AUCUN cas
//    atteignable » — le cliquet ne se lève que sous `estEffetExterieur(effect)`,
//    et la troisième branche rend déjà `done` sous exactement cette condition.
//    **Aucun témoin de comportement ne peut donc la tuer**, et en fabriquer un
//    exigerait un état que la chaîne ne produit pas. Le dire est plus honnête
//    que d'écrire une garde qui aurait l'air de mordre.
//
// ⚠️ **CE QUI LA TUE EST DONC STRUCTUREL, ET LA BORNE EST ÉCRITE AVEC.** Un
//    `grep` ne prouve que l'absence de la FORME écrite : une lecture passée par
//    une variable intermédiaire y échapperait. Ce que la garde tient vraiment :
//    ce champ est ALIMENTÉ PAR UN APPEL, jamais par un littéral. C'est
//    exactement le geste que la mutation fait, et le seul que ce fichier
//    prétende empêcher.
//
// ⚠️ **ET POURQUOI ON NE LA LAISSE PAS TOMBER.** Le socle nomme le jour où cette
//    branche servira : celui où la troisième cessera d'être aussi franchement
//    fail-closed. Ce jour-là, un `false` littéral posé entre-temps ferait
//    silencieusement rejouer un envoi PARTI. La garde tient la place.

describe("m09 · ADR 0021 — la clôture LIT le cliquet, elle ne le suppose pas", () => {
  /**
   * Le fichier de production, lu tel qu'il est livré.
   *
   * ⚠️ LE CHEMIN EST RÉSOLU DEPUIS CE FICHIER-CI, ET IL ÉCHOUE FORT. Une garde
   *    qui cherche un chemin ÉCRIT devient muette au déménagement ; celle-ci ne
   *    le peut pas : `readFileSync` LÈVE si le module voisin n'est plus là. Le
   *    jour où `orchestrateur.ts` change de dossier, ce fichier rougit — il ne
   *    verdit pas en silence.
   */
  const SOURCE = readFileSync(
    fileURLToPath(new URL("./orchestrateur.ts", import.meta.url)),
    "utf8",
  );

  it("le champ `effetExterieurSurvenu` de la clôture est un APPEL, jamais un littéral", () => {
    const appels = [...SOURCE.matchAll(/issueDeReservation\(\{([\s\S]*?)\}\)/g)];
    const bloc = appels[0]?.[1] ?? "";
    // Les trois faits que `FaitsDeCloture` porte, et ce qui les alimente.
    const champs: readonly { readonly nom: string; readonly motif: RegExp }[] = [
      { nom: "effetExterieurSurvenu", motif: /effetExterieurSurvenu:\s*effetExterieurSurvenu\(\)/ },
      // La forme abrégée : la variable posée juste après le retour de l'étape 14.
      { nom: "terminaisonRendue", motif: /(^|[^:\w])terminaisonRendue\s*,/m },
      { nom: "effetDeclare", motif: /effetDeclare:\s*outil\.effect/ },
    ];
    const alimentes = champs.filter((champ) => champ.motif.test(bloc)).map((c) => c.nom);
    const litteraux = [...bloc.matchAll(/(\w+):\s*(true|false|null)\b/g)].map((m) => m[1] ?? "");

    console.info(
      `[m09 · lecture du cliquet] ${String(appels.length)} appel(s) à \`issueDeReservation\` ` +
        `dans le fichier · ${String(champs.length)} fait(s) confronté(s) · ` +
        `${String(alimentes.length)} alimenté(s) par une lecture : ${alimentes.join(", ")} · ` +
        `${String(litteraux.length)} champ(s) posé(s) à un LITTÉRAL : ` +
        `${litteraux.join(", ") || "aucun"}`,
    );

    // PLANCHER-TÉMOIN : sans appel trouvé, tout ce qui suit serait vert pour
    // n'avoir rien lu — c'est le motif qui aurait changé, pas le code.
    expect(appels.length, "l'appel de clôture existe, et il est unique").toBe(1);
    expect(bloc.length, "et son bloc d'arguments n'est pas vide").toBeGreaterThan(0);
    expect(alimentes, "les trois faits sont LUS, aucun n'est supposé").toEqual(
      champs.map((c) => c.nom),
    );
    expect(litteraux, "aucun fait de clôture n'est posé à un littéral").toEqual([]);
  });

  it("MESURE la capacité : le cliquet CHANGE l'issue, sur les couples où il est lisible", () => {
    // ⚠️ SANS CETTE MOITIÉ, « le champ est lu » ne dirait pas s'il SERT. Un
    //    champ lu dont la valeur ne change jamais rien serait une garde vide.
    //    On confronte les deux valeurs du cliquet sur les quatre `effect`,
    //    `terminaisonRendue` étant faux — le seul décor où la branche 1 peut
    //    parler.
    const effets = ["read", "write-draft", "send", "destructive"] as const;
    let cellules = 0;
    const discriminants: string[] = [];

    for (const effet of effets) {
      const avecCliquet = issueDeReservation({
        effetExterieurSurvenu: true,
        terminaisonRendue: false,
        effetDeclare: effet,
      });
      const sansCliquet = issueDeReservation({
        effetExterieurSurvenu: false,
        terminaisonRendue: false,
        effetDeclare: effet,
      });
      cellules += 2;
      if (avecCliquet !== sansCliquet) discriminants.push(effet);
    }

    console.info(
      `[m09 · capacité] ${String(cellules)} cellule(s) parcourue(s) sur ` +
        `${String(effets.length)} effect(s) · ${String(discriminants.length)} effect(s) où la ` +
        `LECTURE du cliquet change l'issue : ${discriminants.join(", ") || "aucun"} · ` +
        "borne : sur ces effect-là, la chaîne ne peut PAS lever le cliquet — d'où " +
        "l'équivalence, et d'où la garde structurelle.",
    );

    expect(cellules, "la table a bien été parcourue").toBe(effets.length * 2);
    // Le champ N'EST PAS décoratif : il discrimine sur au moins un effect.
    expect(discriminants.length, "le cliquet change bien l'issue quelque part").toBeGreaterThan(0);
    // Et il discrimine EXACTEMENT là où l'orchestrateur ne peut pas le lever —
    // c'est la démonstration de l'équivalence, pas une supposition.
    for (const effet of discriminants) {
      expect(estEffetExterieur(effet as (typeof effets)[number])).toBe(false);
    }
  });
});

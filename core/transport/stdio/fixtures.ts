/**
 * `core/transport/stdio/fixtures.ts` — **LE DÉCOR DES GARDES DU TRANSPORT stdio.**
 *
 * ⚠️ **CE FICHIER N'EST PAS LIVRÉ.** `tsconfig.build.json` exclut tout fichier
 *    nommé `fixtures.ts`, où qu'il soit,
 *    et ce n'est pas un réglage de confort : `core/coutures/registre.spec.ts` et
 *    `core/chaine/identite.spec.ts` DÉRIVENT de cet `exclude` leur critère « ce
 *    fichier est-il de production ? ». Un harnais émis par le build compterait
 *    pour un module de production, et un symbole dont l'unique appelant serait ce
 *    fichier passerait pour COUSU. Le nom `fixtures.ts` est donc porteur — c'est
 *    lui, et non l'intention, qui tient la propriété.
 *
 * ⚠️ **AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUNE VALEUR D'IDENTIFIANT
 *    RÉELLE.** Les clés ci-dessous sont des chaînes fabriquées pour ce dossier,
 *    et le domaine employé partout est `.invalid`, réservé par la RFC 2606 : il
 *    ne se résout nulle part, par construction.
 *
 * ═══ CE QUE CE HARNAIS EST, ET CE QU'IL N'EST PAS ═══
 *
 * C'est un noyau RÉEL : `orchestrerAppel` avec `transport: "stdio"`, les cinq
 * étapes de `core/chaine`, le vrai journal chaîné, le vrai index de provenance.
 * Rien n'est simulé de ce qui DÉCIDE. Ce qui est simulé est ce qui STOCKE — les
 * dépôts de quota et d'idempotence, le catalogue — parce qu'aucune base ne
 * tourne et que le lot l'interdit.
 *
 * ⚠️ **IL EXISTE UN SECOND HARNAIS DE CETTE FORME DANS LE DÉPÔT**, dans
 *    `core/chaine/orchestrateur.spec.ts`. Il n'a pas pu être réutilisé : un
 *    fichier `.spec.ts` importé par un autre fait EXÉCUTER DEUX FOIS ses
 *    `describe` sous vitest, ce qui rend faux le compte de la suite entière —
 *    c'est le motif écrit en tête de `core/coutures/verifier.ts`. La duplication
 *    est donc SUBIE, pas choisie, et elle est signalée aux écarts du lot : le
 *    remède est de hisser ce décor dans un `fixtures.ts` de `core/chaine/`, ce
 *    qui n'appartient pas à ce périmètre.
 */

import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../../adapter-kit/types.js";
import { Journal, JournalMemoire } from "../../audit/index.js";
import type { LigneAudit } from "../../audit/index.js";
import { HorlogeFigee, SCELLEUR_TEMOIN } from "../../audit/fixtures.js";
import { correspondance } from "../../epreuve/outils.js";
import type { Habilitations, OpsScope } from "../../types.js";
import type {
  DemandeIncrement,
  DepotIdempotence,
  DepotQuota,
  EtatCompteur,
  LigneIdempotence,
  ResultatValidation,
  StatutIdempotence,
} from "../../limits/index.js";
import type { NiveauApplique } from "../../policy/index.js";
import type { ProfileName } from "../../profiles/index.js";
import type {
  ChargeAdaptateur,
  ExecutionEtablie,
  Masquage,
  OutilDuCatalogue,
} from "../../chaine/etapes.js";
import { correspondanceCanonique, etape05Scopes } from "../../chaine/etape-05-scopes.js";
import { creerEtapeCatalogue } from "../../chaine/etape-06-outil.js";
import type { DeclarationOutilRecue } from "../../chaine/etape-06-outil.js";
import { creerSignataireCurseur, etapeCurseur } from "../../chaine/etape-09-curseur.js";
import { IndexProvenanceMemoire, etape11Provenance } from "../../chaine/etape-11-provenance.js";
import { executerEtape14 } from "../../chaine/etape-14-execution.js";
import {
  INTENTION_NON_ARMEE,
  empreintesParDefaut,
  orchestrerAppel,
} from "../../chaine/orchestrateur.js";
import type {
  DependancesOrchestrateur,
  IdentiteAppelante,
  ReglagesDeLOutil,
  ResultatAppel,
} from "../../chaine/orchestrateur.js";
import type { NoyauUnique } from "../contrat.js";

import { creerServeurStdio } from "./serveur.js";
import type { CatalogueServiEnStdio, DescripteurOutilServi, ServeurStdio } from "./serveur.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR
// ═════════════════════════════════════════════════════════════════════════════

/** ⚠️ AUCUN SECRET RÉEL — une chaîne fabriquée pour ce dossier, assez longue. */
const CLE_CURSEUR_DU_HARNAIS = "cle-curseur-du-harnais-stdio-non-secrete-0123456789";

export const INSTANT_DU_HARNAIS = new Date("2026-08-31T21:00:00.000Z");
export const PROFIL_DU_HARNAIS: ProfileName = "courrier";
export const HABILITATIONS_DU_HARNAIS: Habilitations = { peutVoirAppels: false, roleConsole: null };

/**
 * L'OUTIL « BONJOUR » — la surface la plus petite qui traverse les onze étapes.
 *
 * ⚠️ **SON SCHÉMA EST FERMÉ PAR UN `enum`, ET C'EST NÉCESSAIRE.** Un
 *    `{"type":"string"}` serait un ARGUMENT LIBRE au sens du § 20, et l'étape 11
 *    refuserait l'appel dès que la session porte une marque — le chemin de succès
 *    dépendrait alors de l'ordre des tests. Fermer le champ rend le succès
 *    attribuable à autre chose qu'à la chance.
 */
export const OUTIL_BONJOUR: OutilDuCatalogue = {
  name: "bonjour.dire",
  version: "1.0.0",
  description: "Rend une salutation. Aucun métier, aucun effet extérieur.",
  inputSchema: {
    type: "object",
    properties: { ton: { enum: ["neutre", "chaleureux"] } },
    additionalProperties: false,
  },
  outputSchema: { type: "object", properties: {}, additionalProperties: false },
  profiles: [PROFIL_DU_HARNAIS],
  enabled: true,
  retireDeLaListe: false,
  adapterId: "bonjour",
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

/** Le même outil, mais porteur d'un effet EXTÉRIEUR — pour les étapes 5 et 10. */
export const OUTIL_ENVOI: OutilDuCatalogue = {
  ...OUTIL_BONJOUR,
  name: "bonjour.envoyer",
  effect: "send",
};

/** Le même outil, mais dont le schéma porte un ARGUMENT LIBRE — pour l'étape 11. */
export const OUTIL_A_TEXTE_LIBRE: OutilDuCatalogue = {
  ...OUTIL_BONJOUR,
  name: "bonjour.noter",
  inputSchema: {
    type: "object",
    properties: { note: { type: "string" } },
    additionalProperties: false,
  },
};

const NIVEAU_BROUILLON: NiveauApplique = {
  niveau: "brouillon",
  raison: "aucune-ligne-couvrante",
  mesures: 2,
  enVigueur: 1,
  retenues: [],
  anomalies: [],
};

const MASQUAGE_NEUTRE: Masquage = {
  appliquer(charge: unknown): { readonly charge: unknown; readonly champsMasques: number } {
    return { charge, champsMasques: 0 };
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  LES DEUX DÉPÔTS EN MÉMOIRE
// ═════════════════════════════════════════════════════════════════════════════

/** Le dépôt de quota du harnais. `refuseTout` est le levier de l'étape 12. */
export class DepotQuotaDuHarnais implements DepotQuota {
  readonly compteurs = new Map<string, number>();
  public refuseTout = false;

  private static cle(demande: Pick<DemandeIncrement, "window" | "tool" | "principal">): string {
    return `${demande.window}::${demande.tool}::${demande.principal}`;
  }

  incrementerSiSousLePlafond(demande: DemandeIncrement): Promise<EtatCompteur> {
    const cle = DepotQuotaDuHarnais.cle(demande);
    const courant = this.compteurs.get(cle) ?? 0;
    const accepte = !this.refuseTout && courant + 1 <= demande.limit;
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
    const k = DepotQuotaDuHarnais.cle(cle);
    this.compteurs.set(k, Math.max(0, (this.compteurs.get(k) ?? 0) - 1));
    return Promise.resolve();
  }
}

/** Le dépôt d'idempotence du harnais. `poser()` est le levier de l'étape 13. */
export class DepotIdempotenceDuHarnais implements DepotIdempotence {
  readonly lignes = new Map<string, LigneIdempotence>();

  private static cle(tool: string, key: string): string {
    return `${tool}::${key}`;
  }

  poser(ligne: LigneIdempotence): void {
    this.lignes.set(DepotIdempotenceDuHarnais.cle(ligne.tool, ligne.key), ligne);
  }

  insererSiAbsente(ligne: LigneIdempotence): Promise<boolean> {
    const cle = DepotIdempotenceDuHarnais.cle(ligne.tool, ligne.key);
    if (this.lignes.has(cle)) return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  lire(tool: string, key: string): Promise<LigneIdempotence | null> {
    return Promise.resolve(this.lignes.get(DepotIdempotenceDuHarnais.cle(tool, key)) ?? null);
  }

  remplacerSiPerimee(ligne: LigneIdempotence, maintenant: Date): Promise<boolean> {
    const cle = DepotIdempotenceDuHarnais.cle(ligne.tool, ligne.key);
    const existante = this.lignes.get(cle);
    if (existante === undefined || existante.expiresAt.getTime() > maintenant.getTime()) {
      return Promise.resolve(false);
    }
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  reprendreSiEchouee(ligne: LigneIdempotence): Promise<boolean> {
    const cle = DepotIdempotenceDuHarnais.cle(ligne.tool, ligne.key);
    const existante = this.lignes.get(cle);
    if (existante === undefined || existante.status !== "failed") return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  cloturer(params: {
    readonly tool: string;
    readonly key: string;
    readonly status: Extract<StatutIdempotence, "done" | "failed">;
    readonly resultRef: string | null;
    readonly completedAt: Date;
  }): Promise<void> {
    const cle = DepotIdempotenceDuHarnais.cle(params.tool, params.key);
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
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE NOYAU TÉMOIN
// ═════════════════════════════════════════════════════════════════════════════

/** Les leviers du harnais — un par étape à faire refuser. */
export interface ReglagesDuHarnais {
  readonly outils?: readonly OutilDuCatalogue[];
  readonly scopes?: readonly OpsScope[];
  readonly profilActif?: ProfileName | null;
  /**
   * L'INVENTAIRE que le PILOTAGE rend, quand il doit différer du catalogue.
   *
   * ⚠️ Par défaut il vaut `outils` : le décor dérive les deux de la même liste,
   *    comme `ops/composition/noyau.ts` le fait en production. Ce levier existe
   *    pour le seul cas où les deux se CONTREDISENT — l'étape 6 relit l'outil,
   *    le pilotage rend une liste vide — que l'ADR 0036, décision 3, exige de
   *    faire refuser. Sans lui, ce cas n'est pas fabricable, donc pas éprouvable.
   */
  readonly inventaire?: readonly OutilDuCatalogue[];
  readonly coffreFerme?: boolean;
  readonly validation?: ResultatValidation<unknown>;
  readonly reglagesOutil?: ReglagesDeLOutil;
  readonly charge?: ChargeAdaptateur;
  readonly niveau?: NiveauApplique;
  /**
   * CE QUE L'ADAPTATEUR LÈVE au lieu de rendre une charge.
   *
   * ⚠️ **`Error`, ET C'EST UNE BORNE DU HARNAIS, PAS DU SOCLE.** `estAmontInjoignable`
   *    accepte `unknown` — un adaptateur ne lève pas toujours une `Error`, et le
   *    socle doit tenir sur ce qu'il reçoit. Ce levier-ci est resserré parce que
   *    la règle de lint du dépôt refuse de rejeter autre chose, et que ce dépôt
   *    ne porte aucun `eslint-disable`. Le cas « l'adaptateur lève un objet nu »
   *    est éprouvé en appelant la fonction directement.
   */
  readonly panneDeLAdaptateur?: Error;
}

/** Ce que le harnais rend : un noyau RÉEL, et de quoi lire ce qu'il a écrit. */
export interface HarnaisStdio {
  readonly noyau: NoyauUnique;
  readonly journal: JournalMemoire;
  readonly quota: DepotQuotaDuHarnais;
  readonly idempotence: DepotIdempotenceDuHarnais;
  readonly index: IndexProvenanceMemoire;
  /** Les traces des appels servis, dans l'ordre — pour la garde de couverture. */
  readonly resultats: ResultatAppel[];
  lignes(): readonly LigneAudit[];
  /** Combien de fois le CATALOGUE sous-jacent a été relu. Mesuré, pas supposé. */
  lecturesDuCatalogue(): number;
}

/**
 * Monte un noyau RÉEL sur `orchestrerAppel`, en transport `stdio`.
 *
 * ⚠️ **`transport: "stdio"` N'EST PAS UN DÉTAIL DE DÉCOR.** C'est lui qui fait
 *    lire à l'orchestrateur la colonne du § 11 sans les quatre étapes « HTTP
 *    seul ». Un harnais monté en `http` aurait servi les mêmes appels avec quatre
 *    étapes attendues en amont, et la garde de couverture aurait mesuré une
 *    colonne qui n'est pas celle du transport éprouvé.
 */
export function fabriquerHarnaisStdio(reglages: ReglagesDuHarnais = {}): HarnaisStdio {
  const store = new JournalMemoire();
  const journal = new Journal(
    SCELLEUR_TEMOIN,
    store,
    new HorlogeFigee(INSTANT_DU_HARNAIS.getTime()),
  );
  const quota = new DepotQuotaDuHarnais();
  const idempotence = new DepotIdempotenceDuHarnais();
  const index = new IndexProvenanceMemoire({ maintenant: () => INSTANT_DU_HARNAIS });
  const resultats: ResultatAppel[] = [];
  const outils = reglages.outils ?? [OUTIL_BONJOUR];
  let lectures = 0;

  const dependances: DependancesOrchestrateur = {
    transport: "stdio",
    journal,
    intention: INTENTION_NON_ARMEE,
    coffre: {
      refusDAppelDOutil() {
        if (reglages.coffreFerme !== true) return null;
        return {
          etat: "verrouillé",
          message:
            "Coffre verrouillé (§ 23) : aucun appel d'outil n'est servi. Déverrouiller " +
            "depuis la console, jamais depuis un terminal.",
        };
      },
    },
    catalogue: {
      relire(nomComplet: string): Promise<OutilDuCatalogue | null> {
        lectures += 1;
        return Promise.resolve(outils.find((outil) => outil.name === nomComplet) ?? null);
      },
    },
    pilotage: {
      profilActif(): Promise<ProfileName | null> {
        return Promise.resolve(
          reglages.profilActif === undefined ? PROFIL_DU_HARNAIS : reglages.profilActif,
        );
      },
      inventaire(): Promise<readonly OutilDuCatalogue[]> {
        return Promise.resolve(reglages.inventaire ?? outils);
      },
    },
    politique: {
      niveauPourOutil(): Promise<NiveauApplique> {
        return Promise.resolve(reglages.niveau ?? NIVEAU_BROUILLON);
      },
    },
    confirmation: {
      verifierEtConsommer(): Promise<"valide" | "invalide"> {
        return Promise.resolve("invalide");
      },
    },
    calculArgHash: correspondance,
    index,
    signataireCurseur: creerSignataireCurseur({
      lireCleCurseur: () => Promise.resolve(CLE_CURSEUR_DU_HARNAIS),
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
        desactiver(): Promise<boolean> {
          return Promise.resolve(true);
        },
      },
      alerte: {
        alerter(): Promise<boolean> {
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
    construireContexteOutil(identite, _appel, profil, niveau) {
      return {
        principal: identite.principal,
        sessionId: identite.sessionId,
        scopes: identite.scopes,
        policyLevel: niveau,
        profile: profil,
        requestId: identite.requestId,
        deadline: identite.deadline,
        habilitations: identite.habilitations,
      };
    },
    appelAdaptateur(): Promise<ChargeAdaptateur> {
      // ⚠️ LA PANNE EST LEVÉE DEPUIS L'ADAPTATEUR, PAS SIMULÉE PLUS HAUT. C'est
      //    le seul moyen d'éprouver ce que le socle fait d'une erreur qu'il n'a
      //    pas fabriquée — voir `estAmontInjoignable` (§ 15).
      if (reglages.panneDeLAdaptateur !== undefined) {
        return Promise.reject(reglages.panneDeLAdaptateur);
      }
      return Promise.resolve(
        reglages.charge ?? {
          items: [{ id: "bonjour" }],
          failedSources: [],
          sourceIncomplete: false,
          recordIds: [],
        },
      );
    },
    empreintesDuResultat(execution: ExecutionEtablie): readonly string[] {
      return empreintesParDefaut(execution);
    },

    ttlIdempotenceMs: 60_000,
    maintenant: () => INSTANT_DU_HARNAIS,
  };

  const noyau: NoyauUnique = async (identite, appel): Promise<ResultatAppel> => {
    // ⚠️ LE NOYAU REÇOIT `unknown` PAR CONTRAT (`NoyauUnique`) : le transport lui
    //    remet ce qu'il a lu, et c'est l'orchestrateur qui décide. La conversion
    //    est ici, dans le harnais, parce que le vrai câblage — `ops/main.ts` —
    //    n'existe pas encore : c'est un écart signalé, pas une commodité.
    const resultat = await orchestrerAppel(
      identite,
      appel as Parameters<typeof orchestrerAppel>[1],
      dependances,
    );
    resultats.push(resultat);
    return resultat;
  };

  return {
    noyau,
    journal: store,
    quota,
    idempotence,
    index,
    resultats,
    lignes: () => store.toutes(),
    lecturesDuCatalogue: () => lectures,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE SERVEUR TÉMOIN
// ═════════════════════════════════════════════════════════════════════════════

/** Ce que le serveur témoin rend : le démon, et tout ce qu'il a écrit. */
export interface ServeurDuHarnais {
  readonly serveur: ServeurStdio;
  readonly harnais: HarnaisStdio;
  /** Les lignes ÉCRITES sur la sortie, telles quelles — délimiteur compris. */
  readonly sortie: string[];
  /** Les réponses relues. Une par ligne écrite ; l'analyse est celle du fil. */
  reponses(): readonly Record<string, unknown>[];
  /** Combien de fois `tools/list` a demandé la liste au catalogue. */
  listagesDuCatalogue(): number;
}

/** Monte un serveur stdio complet sur un noyau RÉEL. */
export function fabriquerServeurDuHarnais(
  reglages: ReglagesDuHarnais = {},
  options: {
    readonly outilsServis?: readonly DescripteurOutilServi[];
    readonly scopes?: readonly OpsScope[];
    readonly caracteresMaxParLigne?: number;
  } = {},
): ServeurDuHarnais {
  const harnais = fabriquerHarnaisStdio(reglages);
  const sortie: string[] = [];
  let listages = 0;

  const catalogue: CatalogueServiEnStdio = {
    listerPourCetAppel(_identite: IdentiteAppelante): Promise<readonly DescripteurOutilServi[]> {
      listages += 1;
      return Promise.resolve(
        options.outilsServis ?? [
          {
            name: OUTIL_BONJOUR.name,
            description: OUTIL_BONJOUR.description,
            inputSchema: OUTIL_BONJOUR.inputSchema,
          },
        ],
      );
    },
  };

  const serveur = creerServeurStdio({
    noyau: harnais.noyau,
    catalogue,
    habilitations: () => HABILITATIONS_DU_HARNAIS,
    maintenant: () => INSTANT_DU_HARNAIS,
    ecrire: (ligne) => sortie.push(ligne),
    ...(options.scopes === undefined ? {} : { scopes: options.scopes }),
    ...(options.caracteresMaxParLigne === undefined
      ? {}
      : { caracteresMaxParLigne: options.caracteresMaxParLigne }),
  });

  return {
    serveur,
    harnais,
    sortie,
    reponses: () => sortie.map((ligne) => JSON.parse(ligne.trimEnd()) as Record<string, unknown>),
    listagesDuCatalogue: () => listages,
  };
}

/** Une enveloppe JSON-RPC sur une ligne, prête à être absorbée. */
export function ligneJsonRpc(
  id: string | number | null,
  methode: string,
  params?: Record<string, unknown>,
): string {
  const enveloppe: Record<string, unknown> = { jsonrpc: "2.0", method: methode };
  if (id !== null) enveloppe["id"] = id;
  if (params !== undefined) enveloppe["params"] = params;
  return `${JSON.stringify(enveloppe)}\n`;
}

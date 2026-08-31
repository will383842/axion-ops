import { describe, expect, it } from "vitest";

import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";

import { APPEL_STEPS, type AppelStep, type Habilitations, type OpsScope } from "../types.js";
import { Journal, JournalMemoire, type LigneAudit } from "../audit/index.js";
import { HorlogeFigee, SCELLEUR_TEMOIN } from "../audit/fixtures.js";
import { correspondance } from "../epreuve/outils.js";
// ADR 0020 — `ops_idempotency.key` porte l'EMPREINTE de la clé, jamais la clé.
import { empreinteDeCleDIdempotence } from "../limits/index.js";
import type {
  DemandeIncrement,
  DepotIdempotence,
  DepotQuota,
  EtatCompteur,
  LigneIdempotence,
  ResultatValidation,
  StatutIdempotence,
} from "../limits/index.js";
import { estEffetExterieur, type NiveauApplique } from "../policy/index.js";
import { CODE_REFUS_PROFIL, ETAPE_REFUS_PROFIL, type ProfileName } from "../profiles/index.js";
import type { ChargeAdaptateur, ExecutionEtablie, Masquage, OutilDuCatalogue } from "./etapes.js";
import { correspondanceCanonique, effetsCouvertsPar, etape05Scopes } from "./etape-05-scopes.js";
import {
  creerEtapeCatalogue,
  type AlerteEpinglage,
  type DeclarationOutilRecue,
  type DemandeDesactivation,
} from "./etape-06-outil.js";
import { creerSignataireCurseur, etapeCurseur } from "./etape-09-curseur.js";
import { IndexProvenanceMemoire, etape11Provenance } from "./etape-11-provenance.js";
import { executerEtape14 } from "./etape-14-execution.js";
import {
  ETAPE_COFFRE_CHAINE,
  ETAPE_IDEMPOTENCE_CHAINE,
  ETAPE_PROFIL_CHAINE,
  ETAPE_QUOTA_CHAINE,
  ETAPE_SCHEMA_CHAINE,
  EXECUTANTS_ETAPES,
  ErreurOrchestrateurNonImplemente,
  INTENTION_NON_ARMEE,
  PRINCIPAL_STDIO,
  SCOPES_PAR_DEFAUT_STDIO,
  TRANSPORTS,
  colonneDuTransport,
  empreintesParDefaut,
  identiteStdio,
  memoiserPourCetAppel,
  orchestrerAppel,
  verifierCouvertureDesEtapes,
  type AppelEntrant,
  type DependancesOrchestrateur,
  type IdentiteAppelante,
  type PorteeDIntention,
  type ReglagesDeLOutil,
  type ResultatAppel,
  type Transport,
} from "./orchestrateur.js";
// ADR 0014 — un `sessionId` ne s'écrit plus à la main : il se frappe.
import { sessionIdDeTemoin } from "../identite/fixtures.js";

/**
 * GARDES DE `core/chaine/orchestrateur.ts` — LA CHAÎNE DU § 11.
 *
 * ═══ CE QUE CES GARDES MESURENT, ET CE QU'ELLES NE MESURENT PAS ═══
 *
 * Elles mesurent quatre choses, et chacune ANNONCE COMBIEN D'ÉLÉMENTS elle a
 * examinés — une garde qui ne dit pas son compte est verte pour la pire des
 * raisons :
 *
 *  1. **L'invariant de sortie du § 11** : aucun chemin de terminaison ne sort
 *     sans une ligne d'`ops_audit`, et cette ligne porte LE NUMÉRO de l'étape
 *     qui a refusé. Le test énumère les refus par étape, DÉRIVÉS d'`APPEL_STEPS`
 *     et confrontés à ce que la chaîne a réellement écrit.
 *  2. **Le schéma avant le quota** : un `invalid_input` ne décompte rien, et le
 *     compteur est LU avant et après, pas supposé.
 *  3. **La colonne par transport** : stdio a une identité, un principal et des
 *     scopes, et aucun de ces scopes ne couvre un effet extérieur.
 *  4. **Les mécanismes annoncés en tête de l'orchestrateur** : la ligne
 *     d'intention, la mémoïsation par appel, et l'en-tête vivant. Un mécanisme
 *     déclaré et jamais exercé serait une garde qui ne peut pas échouer.
 *
 * Elles NE mesurent PAS le comportement des cinq étapes elles-mêmes : chacune a
 * son propre `.spec.ts`. Ici on mesure l'ORDRE, et rien d'autre.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  LE MATÉRIEL — aucun secret réel, aucun appel réseau
// ═════════════════════════════════════════════════════════════════════════════

/** ⚠️ AUCUN SECRET RÉEL. Une chaîne fabriquée pour ce fichier, assez longue. */
const CLE_CURSEUR_D_EPREUVE = "cle-curseur-d-epreuve-non-secrete-0123456789ab";

const INSTANT = new Date("2026-08-31T09:00:00.000Z");
const PROFIL_TEMOIN: ProfileName = "courrier";
const HABILITATIONS: Habilitations = { peutVoirAppels: false };

/**
 * La session du harnais — FRAPPÉE, jamais écrite (ADR 0014). Elle est gardée
 * dans une constante parce que le harnais en a besoin deux fois : un test qui
 * rappellerait la fabrique obtiendrait une autre session, ce qui est exactement
 * le geste que l'ADR 0014 retire au client.
 */
const SESSION_TEMOIN = sessionIdDeTemoin();

/**
 * LE NUMÉRO DE L'ÉTAPE 14, LU DANS `APPEL_STEPS` — jamais écrit.
 *
 * C'est la même dérivation que `issue()` de `core/audit/journal.ts` fait de son
 * côté (ADR 0017) : un refus PRONONCÉ à cette étape porte `outcome: "erreur"`,
 * les autres portent `non-exécuté`. Deux dérivations d'un même fait doivent
 * partir de la même source, sinon elles finissent par se contredire.
 */
const ETAPE_EXECUTION_DU_11 = APPEL_STEPS.find((etape) => etape.cle === "execution")?.numero;

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
    description: "Outil témoin de la chaîne d'appel. Aucun métier.",
    inputSchema: SCHEMA_SANS_CHAMP,
    outputSchema: SCHEMA_SANS_CHAMP,
    profiles: [PROFIL_TEMOIN],
    enabled: true,
    retireDeLaListe: false,
    adapterId: "temoin",
    adapterVersion: "1.0.0",
    effect: "read",
    dataClass: "none",
    pagination: "none",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 4096,
    idFields: [],
    // ADR 0016 — la valeur neutre PORTE UN NOM : « cet outil n'en déclare aucun ».
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
  };
  return { ...base, ...surcharge };
}

class DepotQuotaEnMemoire implements DepotQuota {
  readonly compteurs = new Map<string, number>();
  /** Quand il vaut `true`, TOUT incrément est refusé — pour l'étape 12. */
  public refuseTout = false;

  private static cle(d: Pick<DemandeIncrement, "window" | "tool" | "principal">): string {
    return `${d.window}::${d.tool}::${d.principal}`;
  }

  /** Le total consommé, toutes fenêtres confondues. C'est CE nombre qu'on affiche. */
  get totalConsomme(): number {
    let total = 0;
    for (const valeur of this.compteurs.values()) total += valeur;
    return total;
  }

  incrementerSiSousLePlafond(demande: DemandeIncrement): Promise<EtatCompteur> {
    const cle = DepotQuotaEnMemoire.cle(demande);
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

  poser(ligne: LigneIdempotence): void {
    this.lignes.set(DepotIdemEnMemoire.cle(ligne.tool, ligne.key), ligne);
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
}

/** Le masquage neutre : il ne masque rien, et il le DIT (zéro champ masqué). */
const MASQUAGE_NEUTRE: Masquage = {
  appliquer(charge: unknown): { readonly charge: unknown; readonly champsMasques: number } {
    return { charge, champsMasques: 0 };
  },
};

interface Reglages {
  readonly outils?: readonly OutilDuCatalogue[];
  readonly scopes?: readonly OpsScope[];
  readonly profilActif?: ProfileName | null;
  readonly niveau?: NiveauApplique;
  readonly coffreFerme?: boolean;
  readonly validation?: ResultatValidation<unknown>;
  readonly reglagesOutil?: ReglagesDeLOutil;
  readonly declaration?: DeclarationOutilRecue | null;
  readonly charge?: ChargeAdaptateur;
  readonly adaptateurLeve?: boolean;
  readonly intention?: PorteeDIntention;
  readonly transport?: Transport;
  readonly identite?: IdentiteAppelante;
  readonly confirmationValide?: boolean;
}

interface Harnais {
  readonly deps: DependancesOrchestrateur;
  readonly identite: IdentiteAppelante;
  readonly store: JournalMemoire;
  readonly quota: DepotQuotaEnMemoire;
  readonly idempotence: DepotIdemEnMemoire;
  readonly index: IndexProvenanceMemoire;
  /** Combien de fois le catalogue SOUS-JACENT a été lu. Mesuré, pas supposé. */
  lecturesCatalogue(): number;
  /** Les appels du port d'intention, dans l'ordre : de quoi voir les deux instants. */
  readonly instants: string[];
}

const NIVEAU_BROUILLON: NiveauApplique = {
  niveau: "brouillon",
  raison: "aucune-ligne-couvrante",
  mesures: 3,
  enVigueur: 1,
  retenues: [],
  anomalies: [],
};

function fabriquerHarnais(reglages: Reglages = {}): Harnais {
  const store = new JournalMemoire();
  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee(INSTANT.getTime()));
  const quota = new DepotQuotaEnMemoire();
  const idempotence = new DepotIdemEnMemoire();
  const index = new IndexProvenanceMemoire({ maintenant: () => INSTANT });
  const instants: string[] = [];

  const outils = reglages.outils ?? [outilTemoin()];
  let lectures = 0;

  const identite: IdentiteAppelante =
    reglages.identite ??
    ({
      principal: "principal-temoin",
      sessionId: SESSION_TEMOIN,
      scopes: reglages.scopes ?? ["ops:read", "ops:draft", "ops:send"],
      habilitations: HABILITATIONS,
      requestId: "req-temoin",
      deadline: new Date(INSTANT.getTime() + 30_000),
    } satisfies IdentiteAppelante);

  const deps: DependancesOrchestrateur = {
    transport: reglages.transport ?? "http",
    journal,
    intention: reglages.intention ?? INTENTION_NON_ARMEE,
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
          reglages.profilActif === undefined ? PROFIL_TEMOIN : reglages.profilActif,
        );
      },
      inventaire(): Promise<readonly OutilDuCatalogue[]> {
        return Promise.resolve(outils);
      },
    },
    politique: {
      niveauPourOutil(): Promise<NiveauApplique> {
        return Promise.resolve(reglages.niveau ?? NIVEAU_BROUILLON);
      },
    },
    confirmation: {
      verifierEtConsommer(): Promise<"valide" | "invalide"> {
        return Promise.resolve(reglages.confirmationValide === true ? "valide" : "invalide");
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
          if (reglages.declaration !== undefined) return Promise.resolve(reglages.declaration);
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
    construireContexteOutil(identiteRecue, appel, profil, niveau) {
      return {
        principal: identiteRecue.principal,
        sessionId: identiteRecue.sessionId,
        scopes: identiteRecue.scopes,
        policyLevel: niveau,
        profile: profil,
        // ADR 0020 — le `ctx` ne porte PLUS la clé. C'est l'orchestrateur, en
        // production, qui pose `idempotencyRef` (l'empreinte) ; un constructeur
        // de contexte ne le peut plus, et le type le lui interdit.
        requestId: identiteRecue.requestId,
        deadline: identiteRecue.deadline,
        habilitations: identiteRecue.habilitations,
      };
    },
    appelAdaptateur(): Promise<ChargeAdaptateur> {
      instants.push("adaptateur");
      if (reglages.adaptateurLeve === true) {
        throw new Error("panne de l'adaptateur témoin");
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
      return empreintesParDefaut(execution);
    },

    ttlIdempotenceMs: 60_000,
    maintenant: () => INSTANT,
  };

  return {
    deps,
    identite,
    store,
    quota,
    idempotence,
    index,
    lecturesCatalogue: () => lectures,
    instants,
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

// ═════════════════════════════════════════════════════════════════════════════
//  1 · LA CHAÎNE COMPLÈTE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — un appel traverse la chaîne et journalise", () => {
  it("franchit toutes les étapes applicables et écrit UNE ligne autorisée", async () => {
    const harnais = fabriquerHarnais();
    const resultat: ResultatAppel = await orchestrerAppel(
      harnais.identite,
      appelTemoin(),
      harnais.deps,
    );

    expect(resultat.terminaison.genre).toBe("succès");
    expect(resultat.refus).toBeNull();

    const trace = resultat.trace;
    const atteintes = new Set<AppelStep>([...trace.etapesAmont, ...trace.etapesFranchies]);

    console.log(
      `[chaîne complète] transport « ${trace.transport} » · ` +
        `${String(trace.etapesApplicables.length)} étape(s) applicable(s) · ` +
        `${String(trace.etapesAmont.length)} établie(s) en amont par le transport · ` +
        `${String(trace.etapesFranchies.length)} franchie(s) par l'orchestrateur : ` +
        `${trace.etapesFranchies.join(", ")} · ` +
        `${String(trace.etapesNonAtteintes.length)} non atteinte(s)`,
    );

    // Plancher-témoin : la mesure doit avoir vu quelque chose.
    expect(trace.etapesApplicables.length).toBeGreaterThanOrEqual(15);
    expect(trace.etapesFranchies.length).toBeGreaterThanOrEqual(10);

    // AUCUNE étape applicable n'est sautée sur le chemin de succès.
    expect(trace.etapesNonAtteintes).toEqual([]);
    for (const etape of trace.etapesApplicables) {
      expect(atteintes.has(etape)).toBe(true);
    }

    // L'ordre est CROISSANT : c'est la lecture dont `core/audit` se sert déjà
    // (« `stepDenied < 8` ⇒ empreinte brute »).
    const franchies = [...trace.etapesFranchies];
    expect(franchies).toEqual([...franchies].sort((a, b) => a - b));

    // ── L'INVARIANT DE SORTIE : exactement une ligne, et elle dit tout ───────
    expect(harnais.store.toutes()).toHaveLength(1);
    const ligne = derniereLigne(harnais.store);
    expect(ligne.decision).toBe("autorisé");
    expect(ligne.stepDenied).toBeNull();
    expect(ligne.tool).toBe("temoin.lire");
    expect(ligne.outcome).toBe("ok");
    // La ligne rendue est bien CELLE qui a été écrite.
    expect(resultat.ligne.selfHash).toBe(ligne.selfHash);
  });

  it("marque la session APRÈS l'étape 14, et jamais avant", async () => {
    // `dataClass: "personal"` MARQUE la session (§ 20) — le test « quelles
    // classes marquent » est dérivé par `marquerResultat`, pas réécrit ici.
    const harnais = fabriquerHarnais({ outils: [outilTemoin({ dataClass: "personal" })] });

    expect(harnais.index.taille()).toBe(0);
    await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);

    console.log(
      `[provenance] extraits indexés après l'appel : ${String(harnais.index.taille())} · ` +
        `domaines marquants : ${harnais.index.domainesMarquants(SESSION_TEMOIN).join(", ")}`,
    );
    expect(harnais.index.taille()).toBeGreaterThanOrEqual(1);
    expect(harnais.index.domainesMarquants(SESSION_TEMOIN)).toContain("temoin");
  });

  /**
   * LA COUTURE DE L'ADR 0016, MESURÉE SUR LE VERDICT DE LA CHAÎNE ENTIÈRE.
   *
   * ⚠️ **POURQUOI CE TEST VIT ICI ET PAS DANS LE TÉMOIN DE L'ÉTAPE 11.**
   *    `gouvernance-declaree.temoin.spec.ts` prouve que la RÈGLE est juste, et
   *    que le source de ce fichier-ci nomme `outil.governanceFields`. Ni l'un ni
   *    l'autre ne prouve qu'un APPEL RÉEL est refusé : c'est `orchestrerAppel()`
   *    qui relie l'outil du catalogue à l'étape 11, et c'est ce lien-là que
   *    l'épreuve du lot 1c a trouvé manquant. Retirer l'argument fait rougir ici,
   *    sur le `stepDenied` d'une ligne d'audit — pas sur une lecture de source.
   *
   * ⚠️ **LE SCHÉMA EST FERMÉ PAR UN `enum`, ET C'EST TOUTE LA DIFFICULTÉ.** Avec
   *    un `{"type":"string"}`, l'appel serait refusé de toute façon, par la
   *    branche « argument libre » — et ce test serait vert sans rien mesurer de
   *    la déclaration. Le contraste ci-dessous le vérifie : SANS la déclaration,
   *    le même appel PASSE.
   */
  it("ADR 0016 — un `governanceFields` déclaré fait refuser à l'étape 11, et le contraste le prouve", async () => {
    const schemaFermeSurUnEnum = {
      type: "object",
      properties: { emailTo: { enum: ["equipe@exemple.invalid", "secours@exemple.invalid"] } },
      additionalProperties: false,
    } as const;

    /** Le même décor deux fois : seule la DÉCLARATION change. */
    const soumettre = async (
      governanceFields: readonly string[],
    ): Promise<{ readonly decision: string; readonly stepDenied: number | null }> => {
      const harnais = fabriquerHarnais({
        outils: [outilTemoin({ inputSchema: schemaFermeSurUnEnum, governanceFields })],
      });
      // La session a lu du `personal` chez un AUTRE domaine, avant cet appel.
      harnais.index.marquer(SESSION_TEMOIN, "ailleurs", ["empreinte-temoin"]);
      await orchestrerAppel(
        harnais.identite,
        appelTemoin({ input: { emailTo: "secours@exemple.invalid" } }),
        harnais.deps,
      );
      const ligne = derniereLigne(harnais.store);
      return { decision: ligne.decision, stepDenied: ligne.stepDenied };
    };

    const sans = await soumettre([]);
    const avec = await soumettre(["emailTo"]);

    console.log(
      `[couture ADR 0016] SANS déclaration : ${sans.decision} (étape ${String(sans.stepDenied)}) · ` +
        `AVEC déclaration : ${avec.decision} (étape ${String(avec.stepDenied)}) · ` +
        "1 champ déclaré, fermé par un `enum`, sur session marquée par un autre domaine",
    );

    // LE CONTRASTE : sans déclaration, rien ne mord — ni le filet au nom (qui ne
    // reconnaît pas `emailTo`), ni la branche « argument libre » (le champ est
    // fermé). C'est ce qui rend le refus d'après ATTRIBUABLE à la déclaration.
    expect(sans.decision, "sans déclaration, l'appel passe").toBe("autorisé");
    expect(sans.stepDenied).toBeNull();

    // LA COUTURE : déclarée, la même entrée est refusée À L'ÉTAPE 11.
    expect(avec.decision, "ADR 0016 — la déclaration atteint la décision").toBe("refusé");
    expect(avec.stepDenied, "et c'est bien la provenance qui refuse").toBe(11);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  2 · UN REFUS À CHAQUE ÉTAPE — le cœur de l'invariant ①
// ═════════════════════════════════════════════════════════════════════════════

/** Un scénario de refus : ce qu'on règle, et l'étape qui DOIT refuser. */
interface ScenarioRefus {
  readonly cle: string;
  readonly attendue: AppelStep;
  readonly monter: () => { readonly harnais: Harnais; readonly appel: AppelEntrant };
}

const OUTIL_ENVOI = outilTemoin({
  name: "temoin.envoyer",
  version: "2.3.4",
  effect: "send",
  profiles: [PROFIL_TEMOIN],
});

const SCENARIOS: readonly ScenarioRefus[] = [
  {
    cle: "coffre verrouillé (§ 23)",
    attendue: ETAPE_COFFRE_CHAINE.numero,
    monter: () => ({ harnais: fabriquerHarnais({ coffreFerme: true }), appel: appelTemoin() }),
  },
  {
    cle: "scope insuffisant pour l'effect épinglé (§ 19.2)",
    attendue: 5,
    monter: () => ({
      harnais: fabriquerHarnais({ outils: [OUTIL_ENVOI], scopes: ["ops:read"] }),
      appel: appelTemoin({ nomComplet: "temoin.envoyer" }),
    }),
  },
  {
    cle: "outil désactivé en console (§ 14, correction 3)",
    attendue: 6,
    monter: () => ({
      harnais: fabriquerHarnais({ outils: [outilTemoin({ enabled: false })] }),
      appel: appelTemoin(),
    }),
  },
  {
    cle: "outil absent du profil actif (§ 14)",
    attendue: ETAPE_PROFIL_CHAINE.numero,
    monter: () => ({
      harnais: fabriquerHarnais({ outils: [outilTemoin({ profiles: ["dev"] })] }),
      appel: appelTemoin(),
    }),
  },
  {
    cle: "schéma d'entrée invalide (§ 11 — ne décompte rien)",
    attendue: ETAPE_SCHEMA_CHAINE.numero,
    monter: () => ({
      harnais: fabriquerHarnais({
        validation: { ok: false, champ: "limite", attendu: "un entier entre 1 et 100" },
      }),
      appel: appelTemoin(),
    }),
  },
  {
    cle: "curseur non authentique (§ 13.1)",
    attendue: 9,
    monter: () => ({
      harnais: fabriquerHarnais({ outils: [outilTemoin({ pagination: "keyset" })] }),
      appel: appelTemoin({ curseur: "curseur-forge.0123456789abcdef" }),
    }),
  },
  {
    cle: "politique : effet extérieur au niveau brouillon (§ 20)",
    attendue: 10,
    monter: () => ({
      harnais: fabriquerHarnais({ outils: [OUTIL_ENVOI] }),
      appel: appelTemoin({ nomComplet: "temoin.envoyer" }),
    }),
  },
  {
    cle: "provenance : argument libre vers un autre domaine (§ 20)",
    attendue: 11,
    monter: () => {
      const harnais = fabriquerHarnais({
        outils: [outilTemoin({ inputSchema: SCHEMA_AVEC_TEXTE_LIBRE })],
      });
      // La session a lu du `personal` chez un AUTRE domaine, avant cet appel.
      harnais.index.marquer(SESSION_TEMOIN, "ailleurs", ["empreinte-temoin"]);
      return { harnais, appel: appelTemoin({ input: { note: "texte" } }) };
    },
  },
  {
    cle: "débit dépassé (§ 26)",
    attendue: ETAPE_QUOTA_CHAINE.numero,
    monter: () => {
      const harnais = fabriquerHarnais();
      harnais.quota.refuseTout = true;
      return { harnais, appel: appelTemoin() };
    },
  },
  {
    cle: "clé d'idempotence réutilisée avec un autre argument (§ 12)",
    attendue: ETAPE_IDEMPOTENCE_CHAINE.numero,
    monter: () => {
      const harnais = fabriquerHarnais({
        reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      });
      harnais.idempotence.poser({
        tool: "temoin.lire",
        // ADR 0020 — `ops_idempotency.key` porte l'EMPREINTE. Une ligne posée
        // sous la chaîne d'origine ne serait JAMAIS retrouvée, et l'étape 13
        // réserverait tranquillement au lieu de refuser.
        key: empreinteDeCleDIdempotence("cle-1"),
        status: "in_flight",
        // Une empreinte de la bonne FORME, mais qui n'est celle d'aucun argument
        // de cet appel : c'est exactement le cas que le § 12 refuse.
        argHash: "f".repeat(64),
        resultRef: null,
        completedAt: null,
        expiresAt: new Date(INSTANT.getTime() + 60_000),
      });
      return { harnais, appel: appelTemoin({ idempotencyKey: "cle-1" }) };
    },
  },
  {
    cle: "sortie incompactable (§ 13.3)",
    attendue: 14,
    monter: () => ({
      harnais: fabriquerHarnais({
        outils: [outilTemoin({ maxBytes: 16 })],
        charge: {
          items: Array.from({ length: 40 }, (_, rang) => ({ id: `element-${String(rang)}` })),
          failedSources: [],
          sourceIncomplete: false,
          recordIds: [],
        },
      }),
      appel: appelTemoin(),
    }),
  },
];

describe("§ 11 — toute terminaison écrit une ligne portant LE NUMÉRO de l'étape", () => {
  it("refuse à chaque étape applicable, et la ligne porte le bon `stepDenied`", async () => {
    const applicablesJsonRpc = APPEL_STEPS.filter((etape) => !etape.httpSeul).map(
      (etape) => etape.numero,
    );
    const exercees: AppelStep[] = [];

    for (const scenario of SCENARIOS) {
      const { harnais, appel } = scenario.monter();
      const resultat = await orchestrerAppel(harnais.identite, appel, harnais.deps);

      // ── L'INVARIANT : exactement une ligne, et elle porte le numéro ────────
      expect(harnais.store.toutes(), scenario.cle).toHaveLength(1);
      const ligne = derniereLigne(harnais.store);
      expect(ligne.decision, scenario.cle).toBe("refusé");
      expect(ligne.stepDenied, scenario.cle).toBe(scenario.attendue);
      // ⚠️ L'`outcome` D'UN REFUS N'EST PLUS UNE CONSTANTE — ADR 0017. Le
      //    vocabulaire définit `non-exécuté` comme « refusé AVANT l'étape 14 »
      //    et `erreur` comme « incompactable (`result_too_large`) » : un refus
      //    PRONONCÉ à l'étape 14 porte donc `erreur`, parce qu'il se prononce
      //    sur ce qui SORT et non sur ce qui s'est passé. Cette ligne l'écrivait
      //    en dur et contredisait les deux définitions. Elle le DÉRIVE — de
      //    `APPEL_STEPS`, la même source que `issue()` dans `core/audit/journal.ts`.
      expect(ligne.outcome, scenario.cle).toBe(
        scenario.attendue === ETAPE_EXECUTION_DU_11 ? "erreur" : "non-exécuté",
      );

      // La terminaison, la trace et le détail disent LA MÊME étape : trois
      // dérivations d'un même fait qui se contrediraient seraient pires qu'une.
      expect(resultat.terminaison.genre, scenario.cle).toBe("refus");
      expect(resultat.trace.etapeRefusante, scenario.cle).toBe(scenario.attendue);
      expect(resultat.refus?.etape, scenario.cle).toBe(scenario.attendue);
      // § 15 — le message dit toujours ce qu'il faut faire ensuite.
      expect((resultat.refus?.message ?? "").length, scenario.cle).toBeGreaterThan(40);

      exercees.push(scenario.attendue);
    }

    const manquantes = applicablesJsonRpc.filter((etape) => !exercees.includes(etape));

    console.log(
      `[refus par étape] ${String(exercees.length)} étape(s) EXERCÉE(S) sur ` +
        `${String(applicablesJsonRpc.length)} applicable(s) au transport JSON-RPC : ` +
        `${exercees.join(", ")} · non exercée(s) : ` +
        `${manquantes.length === 0 ? "aucune" : manquantes.join(", ")}`,
    );

    // Plancher-témoin : la boucle doit avoir tourné.
    expect(exercees.length).toBeGreaterThanOrEqual(11);
    // Chaque étape applicable au JSON-RPC a été exercée AU MOINS une fois.
    expect(manquantes).toEqual([]);
    // Aucun doublon : deux scénarios qui refuseraient à la même étape
    // laisseraient une étape sans témoin sans que le compte ne bouge.
    expect(new Set(exercees).size).toBe(exercees.length);
  });

  it("écrit une ligne « interrompu » quand l'adaptateur lève, puis relaie l'exception", async () => {
    const harnais = fabriquerHarnais({ adaptateurLeve: true });

    await expect(
      orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps),
    ).rejects.toThrowError(/adaptateur témoin/u);

    console.log(
      `[panne applicative] lignes écrites : ${String(harnais.store.toutes().length)} · ` +
        `décision : ${derniereLigne(harnais.store).decision}`,
    );
    expect(harnais.store.toutes()).toHaveLength(1);
    const ligne = derniereLigne(harnais.store);
    // Une panne n'est PAS une décision : la confondre avec un refus fausserait
    // la métrique du § 24 qui compte les refus.
    expect(ligne.decision).toBe("interrompu");
    expect(ligne.stepDenied).toBeNull();
    expect(ligne.outcome).toBe("erreur");
  });

  it("clôt la réservation d'idempotence même quand l'adaptateur lève", async () => {
    const harnais = fabriquerHarnais({
      adaptateurLeve: true,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });

    await expect(
      orchestrerAppel(harnais.identite, appelTemoin({ idempotencyKey: "cle-2" }), harnais.deps),
    ).rejects.toThrowError(/adaptateur témoin/u);

    const ligne = harnais.idempotence.lignes.get(
      `temoin.lire::${empreinteDeCleDIdempotence("cle-2")}`,
    );
    console.log(`[idempotence] statut après panne : ${String(ligne?.status)}`);
    // Laissée `in_flight`, la clé bloquerait tout rejeu jusqu'au TTL.
    expect(ligne?.status).toBe("failed");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  3 · LE SCHÉMA AVANT LE QUOTA — compteur LU avant et après
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — le schéma avant le quota : un appel malformé ne consomme rien", () => {
  it("ne décompte AUCUNE unité de quota sur un `invalid_input`", async () => {
    const harnais = fabriquerHarnais({
      validation: { ok: false, champ: "limite", attendu: "un entier entre 1 et 100" },
    });

    const avant = harnais.quota.totalConsomme;
    const resultat = await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);
    const apres = harnais.quota.totalConsomme;

    console.log(
      `[schéma avant quota] compteurs mesurés : ${String(harnais.quota.compteurs.size)} · ` +
        `unités consommées AVANT ${String(avant)} → APRÈS ${String(apres)} · ` +
        `étape refusante ${String(resultat.trace.etapeRefusante)}`,
    );

    expect(resultat.trace.etapeRefusante).toBe(ETAPE_SCHEMA_CHAINE.numero);
    expect(apres).toBe(avant);
    expect(apres).toBe(0);
    // Aucun compteur n'a même été CRÉÉ : le dépôt n'a pas été touché.
    expect(harnais.quota.compteurs.size).toBe(0);
    // Le témoin de la mesure : un appel VALIDE, lui, consomme.
    const valide = fabriquerHarnais();
    await orchestrerAppel(valide.identite, appelTemoin(), valide.deps);
    console.log(
      `[témoin] un appel valide consomme ${String(valide.quota.totalConsomme)} unité(s) ` +
        `sur ${String(valide.quota.compteurs.size)} compteur(s)`,
    );
    expect(valide.quota.totalConsomme).toBeGreaterThan(0);
  });

  it("ne franchit ni l'étape 12 ni l'étape 13 quand la politique refuse", async () => {
    const harnais = fabriquerHarnais({ outils: [OUTIL_ENVOI] });
    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ nomComplet: "temoin.envoyer" }),
      harnais.deps,
    );

    console.log(
      `[refus de politique] étapes franchies : ${resultat.trace.etapesFranchies.join(", ")} · ` +
        `unités de quota consommées : ${String(harnais.quota.totalConsomme)}`,
    );
    expect(resultat.trace.etapeRefusante).toBe(10);
    expect(resultat.trace.etapesFranchies).not.toContain(ETAPE_QUOTA_CHAINE.numero);
    expect(resultat.trace.etapesFranchies).not.toContain(ETAPE_IDEMPOTENCE_CHAINE.numero);
    expect(harnais.quota.totalConsomme).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  4 · L'EN-TÊTE VIVANT — la ligne porte l'effect et la version RÉELS
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 12 — la ligne porte ce que la chaîne a appris, pas ce qu'elle supposait", () => {
  it("inscrit l'`effect` épinglé et la version de l'outil, même sur un refus tardif", async () => {
    const harnais = fabriquerHarnais({ outils: [OUTIL_ENVOI] });
    await orchestrerAppel(
      harnais.identite,
      appelTemoin({ nomComplet: "temoin.envoyer" }),
      harnais.deps,
    );

    const ligne = derniereLigne(harnais.store);
    console.log(
      `[en-tête vivant] tool ${ligne.tool} · effect ${ligne.effect} · ` +
        `toolVersion ${ligne.toolVersion} · policyLevel ${ligne.policyLevel} · ` +
        `stepDenied ${String(ligne.stepDenied)}`,
    );

    // ⚠️ SI CETTE GARDE ROUGIT, `avecJournal` s'est mis à COPIER l'en-tête à
    //    l'entrée : la ligne porterait alors `effect: "read"` et
    //    `toolVersion: "inconnue"` pour TOUS les appels. Voir l'en-tête vivant
    //    dans `orchestrateur.ts`.
    expect(ligne.effect).toBe("send");
    expect(ligne.toolVersion).toBe("2.3.4");
    expect(ligne.adapterVersion).toBe("1.0.0");
    expect(ligne.policyLevel).toBe("brouillon");
  });

  it("remonte le nombre de lignes de politique EXAMINÉES, pas seulement le niveau", async () => {
    const harnais = fabriquerHarnais();
    const resultat = await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);

    console.log(
      `[politique] niveau appliqué « ${resultat.trace.niveauApplique} » calculé sur ` +
        `${String(resultat.trace.niveauMesures)} ligne(s) examinée(s)`,
    );
    // Un niveau calculé sur ZÉRO ligne vaut « brouillon » : rassurant, et
    // aveugle. C'est ce compte, pas le niveau, qui distingue les deux.
    expect(resultat.trace.niveauMesures).toBe(NIVEAU_BROUILLON.mesures);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  5 · LA COLONNE PAR TRANSPORT — « stdio a une identité, un principal, des
//      scopes »
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — la colonne par transport", () => {
  it("dérive les étapes applicables d'`APPEL_STEPS`, et les annonce", () => {
    let colonnesMesurees = 0;
    for (const transport of TRANSPORTS) {
      colonnesMesurees += 1;
      const colonne = colonneDuTransport(transport);
      console.log(
        `[transport ${transport}] ${String(colonne.etapesApplicables.length)} applicable(s) · ` +
          `${String(colonne.etapesNonApplicables.length)} non applicable(s) : ` +
          `${colonne.etapesNonApplicables.join(", ") || "aucune"} · ` +
          `${String(colonne.etapesAmont.length)} établie(s) en amont · ` +
          `principal réservé : ${colonne.principalReserve ?? "(celui du jeton)"} · ` +
          `scopes par défaut : ${colonne.scopesParDefaut?.join(", ") ?? "(ceux du jeton)"}`,
      );
      // Applicables + non applicables = TOUTES les étapes du § 11, sans reste.
      expect(colonne.etapesApplicables.length + colonne.etapesNonApplicables.length).toBe(
        APPEL_STEPS.length,
      );
    }
    expect(colonnesMesurees).toBe(TRANSPORTS.length);

    const stdio = colonneDuTransport("stdio");
    const httpSeules = APPEL_STEPS.filter((etape) => etape.httpSeul).map((etape) => etape.numero);
    // DÉRIVÉ : stdio n'a ni Host, ni jeton, ni audience, ni `jti` à révoquer.
    expect([...stdio.etapesNonApplicables]).toEqual(httpSeules);
    expect(stdio.etapesAmont).toEqual([]);
    expect(stdio.porteUnJeton).toBe(false);
  });

  it("donne à stdio un principal RÉSERVÉ que la garde de forme du § 31 accepte", () => {
    const identite = identiteStdio({
      requestId: "req-stdio",
      deadline: new Date(INSTANT.getTime() + 30_000),
      habilitations: HABILITATIONS,
    });

    console.log(
      `[stdio] principal « ${identite.principal} » · ` +
        `${String(identite.scopes.length)} scope(s) par défaut : ${identite.scopes.join(", ")}`,
    );

    expect(identite.principal).toBe(PRINCIPAL_STDIO);
    // Forme d'identifiant du § 31 : aucun espace, aucun `@`.
    expect(PRINCIPAL_STDIO).not.toMatch(/\s/u);
    expect(PRINCIPAL_STDIO).not.toContain("@");
    expect(PRINCIPAL_STDIO.length).toBeLessThanOrEqual(128);
  });

  it("n'accorde par défaut à stdio AUCUN scope couvrant un effet extérieur", () => {
    // ⚠️ L'INSTRUMENT SE PROUVE AVANT DE SERVIR. Un balayage qui trouverait zéro
    //    effet couvert rendrait « aucun effet extérieur » pour la pire des
    //    raisons — il n'aurait rien regardé. On vérifie donc d'abord que la
    //    dérivation SAIT désigner un scope extérieur, sur un témoin fabriqué.
    const temoin = effetsCouvertsPar("ops:send");
    console.log(
      `[témoin de l'instrument] « ops:send » couvre ${String(temoin.length)} effet(s) : ` +
        `${temoin.join(", ")} — dont ${String(temoin.filter(estEffetExterieur).length)} extérieur(s)`,
    );
    expect(temoin.length).toBeGreaterThan(0);
    expect(temoin.some(estEffetExterieur)).toBe(true);

    const fautifs: { readonly scope: OpsScope; readonly effets: readonly string[] }[] = [];
    let scopesMesures = 0;
    let effetsMesures = 0;

    for (const scope of SCOPES_PAR_DEFAUT_STDIO) {
      scopesMesures += 1;
      const effets = effetsCouvertsPar(scope);
      effetsMesures += effets.length;
      const exterieurs = effets.filter(estEffetExterieur);
      if (exterieurs.length > 0) fautifs.push({ scope, effets: exterieurs });
    }

    console.log(
      `[stdio] ${String(scopesMesures)} scope(s) par défaut mesuré(s) : ` +
        `${SCOPES_PAR_DEFAUT_STDIO.join(", ")} · ${String(effetsMesures)} effet(s) confronté(s) · ` +
        `${String(fautifs.length)} scope(s) couvrant un effet extérieur`,
    );

    // Planchers-témoins : la dérivation doit avoir laissé quelque chose, et le
    // balayage doit avoir regardé quelque chose. Vides, ils seraient
    // « fail-closed » par accident, et stdio ne servirait rien du tout.
    expect(scopesMesures).toBeGreaterThanOrEqual(1);
    expect(effetsMesures).toBeGreaterThanOrEqual(1);
    expect(fautifs).toEqual([]);
    // `ops:policy` n'est JAMAIS porté par un jeton d'appel (§ 19.2).
    expect(SCOPES_PAR_DEFAUT_STDIO).not.toContain("ops:policy");
    // `ops:admin` ne couvre AUCUN `effect` : il n'a rien à faire dans un défaut
    // de transport.
    expect(SCOPES_PAR_DEFAUT_STDIO).not.toContain("ops:admin");
  });

  it("sert un appel en stdio, et la ligne porte le principal réservé", async () => {
    const identite = identiteStdio({
      requestId: "req-stdio",
      deadline: new Date(INSTANT.getTime() + 30_000),
      habilitations: HABILITATIONS,
    });
    const harnais = fabriquerHarnais({ transport: "stdio", identite });

    const resultat = await orchestrerAppel(identite, appelTemoin(), harnais.deps);
    const ligne = derniereLigne(harnais.store);

    console.log(
      `[stdio] appel servi · principal journalisé « ${ligne.principal} » · ` +
        `${String(resultat.trace.etapesFranchies.length)} étape(s) franchie(s) · ` +
        `${String(resultat.trace.etapesNonApplicables.length)} non applicable(s)`,
    );

    expect(ligne.principal).toBe(PRINCIPAL_STDIO);
    expect(ligne.decision).toBe("autorisé");
    expect(resultat.trace.etapesNonAtteintes).toEqual([]);
    expect(resultat.trace.etapesAmont).toEqual([]);
  });

  it("REFUSE en stdio un effet extérieur avec les scopes par défaut — témoin", async () => {
    const identite = identiteStdio({
      requestId: "req-stdio",
      deadline: new Date(INSTANT.getTime() + 30_000),
      habilitations: HABILITATIONS,
    });
    const harnais = fabriquerHarnais({
      transport: "stdio",
      identite,
      outils: [OUTIL_ENVOI],
    });

    const resultat = await orchestrerAppel(
      identite,
      appelTemoin({ nomComplet: "temoin.envoyer" }),
      harnais.deps,
    );

    console.log(
      `[stdio, témoin] un « send » avec les scopes par défaut est refusé à l'étape ` +
        `${String(resultat.trace.etapeRefusante)}`,
    );
    // Étape 5 : le défaut fail-closed MORD. S'il cessait de mordre, ce test
    // rougirait — c'est exactement ce qu'on veut d'un défaut de sécurité.
    expect(resultat.trace.etapeRefusante).toBe(5);
    expect(derniereLigne(harnais.store).stepDenied).toBe(5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  6 · LA COUVERTURE DES ÉTAPES — la garde de câblage, et son témoin
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — chaque étape applicable a un exécutant", () => {
  it("annonce combien d'étapes elle a confrontées, pour les deux transports", () => {
    for (const transport of TRANSPORTS) {
      const couverture = verifierCouvertureDesEtapes(transport);
      console.log(
        `[couverture ${transport}] ${String(couverture.etapesMesurees)} étape(s) confrontée(s) · ` +
          `${String(couverture.etapesApplicables)} applicable(s) · ` +
          `${String(couverture.sansExecutant.length)} sans exécutant : ` +
          `${couverture.sansExecutant.join(", ") || "aucune"}`,
      );
      // MESURÉ dans la boucle : `etapesMesurees` doit valoir le tableau entier.
      expect(couverture.etapesMesurees).toBe(APPEL_STEPS.length);
      expect(couverture.sansExecutant).toEqual([]);
    }
  });

  it("CONFRONTE les deux dérivations de l'étape 7 — l'orchestrateur et `core/profiles`", () => {
    // ⚠️ DEUX DÉRIVATIONS D'UN MÊME FAIT FINISSENT PAR SE CONTREDIRE.
    //    `core/profiles/budget.ts` dérive `ETAPE_REFUS_PROFIL` et
    //    `CODE_REFUS_PROFIL` d'`APPEL_STEPS` ; l'orchestrateur dérive
    //    `ETAPE_PROFIL_CHAINE` de la même source. Tant qu'elles vivent toutes
    //    deux, la seule chose qui empêche la divergence est cette confrontation.
    console.log(
      `[étape 7] orchestrateur : numéro ${String(ETAPE_PROFIL_CHAINE.numero)}, ` +
        `code ${String(ETAPE_PROFIL_CHAINE.code)} · core/profiles : ` +
        `numéro ${String(ETAPE_REFUS_PROFIL)}, code ${CODE_REFUS_PROFIL} · 2 dérivations mesurées`,
    );
    expect(ETAPE_PROFIL_CHAINE.numero).toBe(ETAPE_REFUS_PROFIL);
    expect(ETAPE_PROFIL_CHAINE.code).toBe(CODE_REFUS_PROFIL);
  });

  it("ROUGIT sur un témoin : une étape privée de son exécutant fait LEVER l'appel", async () => {
    const table = EXECUTANTS_ETAPES as unknown as Record<string, string>;
    const original = table["execution"];
    expect(original).toBeDefined();

    try {
      // Le témoin : on prive l'étape 14 de son exécutant.
      table["execution"] = "";

      const couverture = verifierCouvertureDesEtapes("http");
      console.log(
        `[témoin de couverture] avec l'étape 14 privée d'exécutant : ` +
          `${String(couverture.sansExecutant.length)} étape(s) sans exécutant — ` +
          `${couverture.sansExecutant.join(", ")}`,
      );
      expect(couverture.sansExecutant).toEqual([14]);

      const harnais = fabriquerHarnais();
      await expect(
        orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps),
      ).rejects.toBeInstanceOf(ErreurOrchestrateurNonImplemente);

      // ⚠️ ET AUCUNE LIGNE N'EST ÉCRITE : une chaîne incomplète ne doit pas
      //    laisser dans `ops_audit` la trace d'un appel qu'elle n'a pas examiné.
      expect(harnais.store.toutes()).toHaveLength(0);
    } finally {
      table["execution"] = original ?? "";
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  7 · LES MÉCANISMES ANNONCÉS EN TÊTE — intention, mémoïsation, inversion 5↔6
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — la borne de l'invariant, et le mécanisme proposé", () => {
  it("n'écrit aucune intention tant que le mécanisme n'est pas armé", async () => {
    const harnais = fabriquerHarnais();
    const resultat = await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);

    console.log(
      `[intention] mécanisme non armé — ligne d'intention : ` +
        `${resultat.trace.ligneDIntention === null ? "aucune" : "présente"} · ` +
        `lignes du journal écrites : ${String(harnais.store.toutes().length)}`,
    );
    // Le désarmement ne MENT pas : il rend `null`, et la trace le montre.
    expect(resultat.trace.ligneDIntention).toBeNull();
    expect(harnais.store.toutes()).toHaveLength(1);
  });

  it("atteint les DEUX instants — avant l'effet, puis après — quand il est armé", async () => {
    const journal: string[] = [];
    let issueVue: string | null = null;

    const intentionArmee: PorteeDIntention = {
      avantEffet(): Promise<{ readonly seq: bigint; readonly selfHash: string } | null> {
        journal.push("intention");
        return Promise.resolve({ seq: 1n, selfHash: "a".repeat(64) });
      },
      apresEffet(_ligne, issue): Promise<void> {
        journal.push("issue");
        issueVue = issue;
        return Promise.resolve();
      },
    };

    const harnais = fabriquerHarnais({ intention: intentionArmee });
    const resultat = await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);

    // `instants` porte l'appel de l'adaptateur : c'est lui, l'effet extérieur.
    const chronologie = [...journal.slice(0, 1), ...harnais.instants, ...journal.slice(1)];
    console.log(`[intention armée] chronologie mesurée : ${chronologie.join(" → ")}`);

    expect(chronologie).toEqual(["intention", "adaptateur", "issue"]);
    expect(issueVue).toBe("done");
    expect(resultat.trace.ligneDIntention).not.toBeNull();
  });

  it("clôt l'intention en `failed` quand l'effet lève", async () => {
    let issueVue: string | null = null;
    const intentionArmee: PorteeDIntention = {
      avantEffet(): Promise<{ readonly seq: bigint; readonly selfHash: string } | null> {
        return Promise.resolve({ seq: 1n, selfHash: "b".repeat(64) });
      },
      apresEffet(_ligne, issue): Promise<void> {
        issueVue = issue;
        return Promise.resolve();
      },
    };

    const harnais = fabriquerHarnais({ intention: intentionArmee, adaptateurLeve: true });
    await expect(
      orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps),
    ).rejects.toThrowError();

    console.log(`[intention armée] issue vue après une panne : ${String(issueVue)}`);
    expect(issueVue).toBe("failed");
  });
});

describe("§ 14 correction 3 — la lecture du catalogue est mémoïsée PAR APPEL", () => {
  it("ne lit le catalogue sous-jacent qu'une fois par appel, et le dit", async () => {
    const harnais = fabriquerHarnais();
    await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);
    const apresUnAppel = harnais.lecturesCatalogue();

    await orchestrerAppel(harnais.identite, appelTemoin(), harnais.deps);
    const apresDeuxAppels = harnais.lecturesCatalogue();

    console.log(
      `[mémoïsation] lectures RÉELLES du catalogue : ${String(apresUnAppel)} après un appel, ` +
        `${String(apresDeuxAppels)} après deux`,
    );

    // Une seule lecture par appel : les étapes 5 et 6 se prononcent sur LA MÊME.
    expect(apresUnAppel).toBe(1);
    // Et DEUX lectures pour deux appels : ce n'est pas un cache de processus.
    // Si ce nombre restait à 1, une bascule d'`enabled` en console ne
    // désactiverait plus rien (§ 14, correction 3).
    expect(apresDeuxAppels).toBe(2);
  });

  it("relit le catalogue à CHAQUE appel : un outil désactivé entre deux appels est refusé", async () => {
    const outilActif = outilTemoin();
    const outilEteint = outilTemoin({ enabled: false });
    let etat = outilActif;

    const harnais = fabriquerHarnais();
    // On remplace le port pour qu'il rende un état qui CHANGE entre les appels.
    const deps: DependancesOrchestrateur = {
      ...harnais.deps,
      catalogue: {
        relire(nomComplet: string): Promise<OutilDuCatalogue | null> {
          return Promise.resolve(nomComplet === etat.name ? etat : null);
        },
      },
    };

    const premier = await orchestrerAppel(harnais.identite, appelTemoin(), deps);
    etat = outilEteint;
    const second = await orchestrerAppel(harnais.identite, appelTemoin(), deps);

    console.log(
      `[bascule console] premier appel : ${premier.terminaison.genre} · ` +
        `second appel après désactivation : étape refusante ` +
        `${String(second.trace.etapeRefusante)}`,
    );
    expect(premier.terminaison.genre).toBe("succès");
    expect(second.trace.etapeRefusante).toBe(6);
  });

  it("le mémoïseur ANNONCE ses lectures, et n'en fait qu'une par nom", async () => {
    let lectures = 0;
    const memoise = memoiserPourCetAppel({
      relire(): Promise<OutilDuCatalogue | null> {
        lectures += 1;
        return Promise.resolve(outilTemoin());
      },
    });

    await memoise.relire("temoin.lire");
    await memoise.relire("temoin.lire");
    await memoise.relire("temoin.lire");

    console.log(
      `[mémoïseur] 3 demandes → ${String(memoise.lectures())} lecture(s) réelle(s) ` +
        `(port sous-jacent appelé ${String(lectures)} fois)`,
    );
    expect(memoise.lectures()).toBe(1);
    expect(lectures).toBe(1);
  });

  it("mémoïse aussi l'ABSENCE — un outil inconnu n'est pas relu à chaque demande", async () => {
    let lectures = 0;
    const memoise = memoiserPourCetAppel({
      relire(): Promise<OutilDuCatalogue | null> {
        lectures += 1;
        return Promise.resolve(null);
      },
    });

    expect(await memoise.relire("inconnu.outil")).toBeNull();
    expect(await memoise.relire("inconnu.outil")).toBeNull();

    console.log(`[mémoïseur] absence mémoïsée : ${String(lectures)} lecture(s) réelle(s) sur 2`);
    expect(lectures).toBe(1);
  });
});

describe("§ 11 — l'inversion 5 ↔ 6, telle qu'elle est réellement câblée", () => {
  it("refuse à l'étape 5 AVANT de regarder `enabled` — l'ordre du § 11 est tenu", async () => {
    // Un outil DÉSACTIVÉ, appelé avec un scope insuffisant. Le § 11 veut que le
    // scope refuse d'abord ; c'est bien ce qui arrive.
    const harnais = fabriquerHarnais({
      outils: [outilTemoin({ name: "temoin.envoyer", effect: "send", enabled: false })],
      scopes: ["ops:read"],
    });
    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ nomComplet: "temoin.envoyer" }),
      harnais.deps,
    );

    console.log(
      `[inversion 5↔6] outil désactivé + scope insuffisant → étape ` +
        `${String(resultat.trace.etapeRefusante)} (le § 11 veut 5)`,
    );
    expect(resultat.trace.etapeRefusante).toBe(5);
  });

  it("MESURE la fuite documentée : un outil inexistant est refusé à 6, sans scope", async () => {
    const harnais = fabriquerHarnais({ scopes: ["ops:read"] });
    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ nomComplet: "temoin.inexistant" }),
      harnais.deps,
    );

    console.log(
      `[inversion 5↔6, borne] outil inexistant + scope insuffisant → étape ` +
        `${String(resultat.trace.etapeRefusante)}. C'est la fuite documentée : ` +
        "l'appelant apprend qu'un outil n'EXISTE PAS avant que ses scopes soient examinés.",
    );
    // ⚠️ CE TEST NE CÉLÈBRE RIEN : il FIXE la borne RÉSIDUELLE, pour qu'une
    //    correction future la fasse rougir plutôt que de passer inaperçue.
    //
    // ⚠️ ET LA BORNE S'EST RESSERRÉE — il faut dire de combien. À scopes VIDES,
    //    la fuite est FERMÉE : le corps refuse à l'étape 5 avant toute lecture du
    //    catalogue, pour n'importe quel nom (voir « L'INVERSION 5 ↔ 6 » en tête
    //    d'`orchestrateur.ts`). Ce qui reste, et que ce test mesure, c'est le
    //    porteur qui a UN scope mais pas le BON : lui apprend encore qu'un nom
    //    n'existe pas, parce qu'on ne peut pas connaître l'`effect` épinglé d'un
    //    outil qu'on ne peut pas lire.
    expect(resultat.trace.etapeRefusante).toBe(6);
    expect(derniereLigne(harnais.store).stepDenied).toBe(6);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  8 · LE REJEU — l'étape 13 rend un succès SANS exécution
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 13 — un rejeu n'est pas une exécution", () => {
  it("rend un succès `rejeu`, ne franchit pas l'étape 14, et journalise quand même", async () => {
    const harnais = fabriquerHarnais({
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });
    // On calcule l'empreinte exacte de l'appel, pour que la clé soit reconnue
    // comme un rejeu et non comme un argument différent.
    const argHash = await correspondance.calculer("temoin.lire", {});
    harnais.idempotence.poser({
      tool: "temoin.lire",
      // ADR 0020 — l'EMPREINTE, jamais la clé.
      key: empreinteDeCleDIdempotence("cle-rejeu"),
      status: "done",
      argHash,
      resultRef: "ref-1",
      completedAt: INSTANT,
      expiresAt: new Date(INSTANT.getTime() + 60_000),
    });

    const resultat = await orchestrerAppel(
      harnais.identite,
      appelTemoin({ idempotencyKey: "cle-rejeu" }),
      harnais.deps,
    );

    const terminaison = resultat.terminaison;
    expect(terminaison.genre).toBe("succès");
    if (terminaison.genre !== "succès") throw new Error("terminaison inattendue");

    console.log(
      `[rejeu] genre servi : ${terminaison.valeur.genre} · ` +
        `étapes franchies : ${resultat.trace.etapesFranchies.join(", ")} · ` +
        `non atteintes : ${resultat.trace.etapesNonAtteintes.join(", ")}`,
    );

    expect(terminaison.valeur.genre).toBe("rejeu");
    // L'étape 14 n'a PAS eu lieu : la trace le dit, et l'adaptateur n'a pas été
    // appelé.
    expect(resultat.trace.etapesFranchies).not.toContain(14);
    expect(harnais.instants).not.toContain("adaptateur");
    // L'invariant de sortie tient : une ligne, et une seule.
    expect(harnais.store.toutes()).toHaveLength(1);
    expect(derniereLigne(harnais.store).decision).toBe("autorisé");
  });
});

/**
 * `core/epreuve/journal-et-pannes-lot1c.spec.ts` — L'ÉPREUVE ADVERSE DU LOT 1c.
 *
 * ═══ CE QUE CE FICHIER ATTAQUE, ET POURQUOI CE PÉRIMÈTRE-LÀ ═══
 *
 * Le lot 1c a changé le FORMAT DU JOURNAL : `externalEffect` (ADR 0017) est
 * entré dans l'empreinte chaînée, et la dérivation d'`outcome` a bougé avec lui.
 * Un changement de format d'un journal chaîné est le geste le plus dangereux du
 * socle — il touche toutes les empreintes à la fois — et il n'a coûté ce qu'il a
 * coûté que parce qu'aucune ligne réelle n'existe encore. Les quatre questions
 * qui décident si le geste a réussi ne se posent qu'ici :
 *
 *  1. la chaîne se recalcule-t-elle proprement, LIGNE PAR LIGNE ?
 *  2. le vérificateur annonce-t-il TOUJOURS son compte, y compris quand il
 *     rougit ?
 *  3. une ligne d'INTENTION sans ligne d'issue est-elle détectable, et COMPTÉE ?
 *  4. les chemins de PANNE ferment-ils la porte, ou en ouvrent-ils une ?
 *
 * ═══ LA RÈGLE QUE CHAQUE GARDE D'ICI RESPECTE ═══
 *
 * Chaque `it` ANNONCE COMBIEN D'ÉLÉMENTS IL A MESURÉS, et le compte est
 * incrémenté DANS la boucle ou lu sur le sujet — jamais rendu de confiance
 * depuis la longueur d'un tableau écrit à la main.
 *
 * ═══ L'IDIOME `it.fails`, REPRIS DE `chaine-chemins-de-panne.spec.ts` ═══
 *
 * Un témoin marqué 🔴 porte l'assertion CORRECTE — celle du CDC ou du contrat
 * que le socle s'est lui-même écrit — sous `it.fails`. Il est donc vert
 * AUJOURD'HUI parce qu'il échoue, et il ROUGIRA le jour où le défaut sera fermé,
 * forçant celui qui le ferme à le repasser en `it()`. RIEN ici n'attend la
 * valeur fausse.
 *
 * ⚠️ CONSÉQUENCE STRICTE : un `it.fails` est vert dès qu'UNE de ses assertions
 *    échoue. Les assertions de FAIT y sont donc limitées à celles qui resteront
 *    vraies APRÈS le correctif ; tout ce qui changerait avec lui descend dans le
 *    `console.log`, où il informe sans décider.
 *
 * ⚠️ CE FICHIER N'A MODIFIÉ AUCUN FICHIER DU SOCLE. Les correctifs sont au
 *    rapport ; aucun n'est appliqué ici, parce qu'aucun n'est sans arbitrage.
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUN IDENTIFIANT D'INFRASTRUCTURE.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";

import type { Habilitations, OpsScope } from "../types.js";
import {
  DECISIONS,
  Journal,
  JournalMemoire,
  OUTCOMES,
  cumulAncrageTete,
  preparerPurge,
  sha256Hex,
  verifierChaine,
  type LigneAudit,
  type LigneEcrite,
} from "../audit/index.js";
import {
  HorlogeFigee,
  SCELLEUR_TEMOIN,
  construireJournal,
  contenuTemoin,
} from "../audit/fixtures.js";
import { ETATS_DU_VERROU } from "../instance/index.js";
import { correspondance } from "./outils.js";
// ADR 0020 — `ops_idempotency.key` porte l'EMPREINTE de la clé, jamais la clé.
// Une garde qui interrogerait le dépôt par la chaîne d'origine ne trouverait
// RIEN, et lirait ce vide comme « la clé n'a pas été prise ».
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
import type { NiveauApplique } from "../policy/index.js";
import type { ProfileName } from "../profiles/index.js";
import type {
  ChargeAdaptateur,
  ExecutionEtablie,
  IndexProvenance,
  Masquage,
  OutilDuCatalogue,
} from "../chaine/etapes.js";
import { correspondanceCanonique, etape05Scopes } from "../chaine/etape-05-scopes.js";
import {
  creerEtapeCatalogue,
  type AlerteEpinglage,
  type DeclarationOutilRecue,
  type DemandeDesactivation,
} from "../chaine/etape-06-outil.js";
import { creerSignataireCurseur, etapeCurseur } from "../chaine/etape-09-curseur.js";
import { IndexProvenanceMemoire, etape11Provenance } from "../chaine/etape-11-provenance.js";
import { executerEtape14 } from "../chaine/etape-14-execution.js";
import {
  INTENTION_NON_ARMEE,
  empreintesParDefaut,
  orchestrerAppel,
  type AppelEntrant,
  type DependancesOrchestrateur,
  type EtatDuCoffre,
  type IdentiteAppelante,
  type PorteeDIntention,
  type ReglagesDeLOutil,
  type ResultatAppel,
} from "../chaine/orchestrateur.js";
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { SessionId } from "../identite/session.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE HARNAIS — un socle complet, dont chaque pièce peut TOMBER
// ═════════════════════════════════════════════════════════════════════════════

/** ⚠️ AUCUN SECRET RÉEL. Chaîne fabriquée pour ce fichier. */
const CLE_CURSEUR_D_EPREUVE = "cle-curseur-d-epreuve-lot1c-non-secrete-0123456789";

const INSTANT = new Date("2026-08-31T10:00:00.000Z");
const PROFIL_TEMOIN: ProfileName = "courrier";
const HABILITATIONS: Habilitations = { peutVoirAppels: false, roleConsole: null };
const SESSION_TEMOIN = sessionIdDeTemoin();

const SCHEMA_VIDE = { type: "object", properties: {}, additionalProperties: false } as const;

function outilTemoin(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  const base: OutilDuCatalogue = {
    name: "temoin.lire",
    version: "1.0.0",
    description: "Outil témoin de l'épreuve du lot 1c. Aucun métier.",
    inputSchema: SCHEMA_VIDE,
    outputSchema: SCHEMA_VIDE,
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
    // ADR 0016 — la valeur neutre PORTE UN NOM : « cet outil n'en déclare aucun ».
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
  };
  return { ...base, ...surcharge };
}

/** Un outil qui ENVOIE — c'est lui qui rend un effet extérieur observable. */
function outilEnvoi(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return outilTemoin({ name: "temoin.envoyer", effect: "send", ...surcharge });
}

/**
 * Un outil DESTRUCTIF. Il existe pour une seule raison : `estEffetExterieur`
 * classe `send` ET `destructive`, et une garde qui n'éprouverait que `send`
 * resterait verte le jour où le cliquet serait recâblé sur `effect === "send"`.
 */
function outilDestructif(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return outilTemoin({ name: "temoin.detruire", effect: "destructive", ...surcharge });
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

/**
 * Le dépôt d'idempotence ATOMIQUE — ce que `(tool, key)` en clé primaire donne
 * en Postgres (§ 12). Aucun point de suspension entre le test et l'écriture.
 */
class DepotIdemAtomique implements DepotIdempotence {
  readonly lignes = new Map<string, LigneIdempotence>();

  protected static cle(tool: string, key: string): string {
    return `${tool}::${key}`;
  }

  insererSiAbsente(ligne: LigneIdempotence): Promise<boolean> {
    const cle = DepotIdemAtomique.cle(ligne.tool, ligne.key);
    if (this.lignes.has(cle)) return Promise.resolve(false);
    this.lignes.set(cle, ligne);
    return Promise.resolve(true);
  }

  lire(tool: string, key: string): Promise<LigneIdempotence | null> {
    return Promise.resolve(this.lignes.get(DepotIdemAtomique.cle(tool, key)) ?? null);
  }

  remplacerSiPerimee(ligne: LigneIdempotence, maintenant: Date): Promise<boolean> {
    const existante = this.lignes.get(DepotIdemAtomique.cle(ligne.tool, ligne.key));
    if (existante === undefined || existante.expiresAt.getTime() > maintenant.getTime()) {
      return Promise.resolve(false);
    }
    this.lignes.set(DepotIdemAtomique.cle(ligne.tool, ligne.key), ligne);
    return Promise.resolve(true);
  }

  reprendreSiEchouee(ligne: LigneIdempotence): Promise<boolean> {
    const existante = this.lignes.get(DepotIdemAtomique.cle(ligne.tool, ligne.key));
    if (existante === undefined || existante.status !== "failed") return Promise.resolve(false);
    this.lignes.set(DepotIdemAtomique.cle(ligne.tool, ligne.key), ligne);
    return Promise.resolve(true);
  }

  cloturer(params: {
    readonly tool: string;
    readonly key: string;
    readonly status: Extract<StatutIdempotence, "done" | "failed">;
    readonly resultRef: string | null;
    readonly completedAt: Date;
  }): Promise<void> {
    const cle = DepotIdemAtomique.cle(params.tool, params.key);
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

/** Le masquage neutre : il ne masque rien, et il le DIT. */
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

const NIVEAU_LIBRE: NiveauApplique = { ...NIVEAU_BROUILLON, niveau: "libre" };

interface Reglages {
  readonly outils?: readonly OutilDuCatalogue[];
  readonly scopes?: readonly OpsScope[];
  readonly niveau?: NiveauApplique;
  readonly charge?: ChargeAdaptateur | (() => ChargeAdaptateur);
  readonly intention?: PorteeDIntention;
  readonly sessionId?: SessionId;
  readonly index?: IndexProvenance;
  readonly store?: JournalMemoire;
  readonly depotIdempotence?: DepotIdempotence;
  readonly confirmationValide?: boolean;
  readonly masquage?: Masquage;
  readonly reglagesOutil?: ReglagesDeLOutil;
  readonly coffre?: EtatDuCoffre;
}

interface Harnais {
  readonly deps: DependancesOrchestrateur;
  readonly identite: IdentiteAppelante;
  readonly store: JournalMemoire;
  readonly idempotence: DepotIdempotence;
  /** Combien de fois l'ADAPTATEUR a réellement été appelé. C'est l'effet extérieur. */
  effets(): number;
}

const CHARGE_ORDINAIRE: ChargeAdaptateur = {
  items: [{ id: "a" }],
  failedSources: [],
  sourceIncomplete: false,
  recordIds: [],
};

function fabriquerHarnais(reglages: Reglages = {}): Harnais {
  const store = reglages.store ?? new JournalMemoire();
  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee(INSTANT.getTime()));
  const quota = new DepotQuotaEnMemoire();
  const idempotence = reglages.depotIdempotence ?? new DepotIdemAtomique();
  const index = reglages.index ?? new IndexProvenanceMemoire({ maintenant: () => INSTANT });
  const outils = reglages.outils ?? [outilTemoin()];
  let effets = 0;

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
    intention: reglages.intention ?? INTENTION_NON_ARMEE,
    coffre: reglages.coffre ?? {
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
        return Promise.resolve(PROFIL_TEMOIN);
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
      return { ok: true, valeur: input };
    },
    empreinteFiltres(outil, valide): Promise<string> {
      return correspondance.calculer(`${outil.name}#filtres`, valide);
    },
    fabriqueMasquage(): Masquage {
      return reglages.masquage ?? MASQUAGE_NEUTRE;
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
      // ⚠️ C'EST ICI, ET NULLE PART AILLEURS, QUE L'EFFET EXTÉRIEUR A LIEU.
      //    L'ordre compte : un adaptateur qui tombe AVANT d'avoir rien envoyé ne
      //    doit pas être compté comme un effet, sans quoi le contre-témoin de la
      //    section C mesurerait le contraire de ce qu'il croit mesurer.
      const source = reglages.charge ?? CHARGE_ORDINAIRE;
      const charge = typeof source === "function" ? source() : source;
      effets += 1;
      return Promise.resolve(charge);
    },
    empreintesDuResultat(execution: ExecutionEtablie): readonly string[] {
      return empreintesParDefaut(execution);
    },

    ttlIdempotenceMs: 60_000,
    maintenant: () => INSTANT,
  };

  return { deps, identite, store, idempotence, effets: () => effets };
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

/** Capture l'issue d'un appel SANS masquer la distinction retour / exception. */
async function issueDe(
  harnais: Harnais,
  appel: AppelEntrant,
): Promise<
  | { readonly genre: "retour"; readonly resultat: ResultatAppel }
  | { readonly genre: "levée"; readonly erreur: unknown }
> {
  try {
    return {
      genre: "retour",
      resultat: await orchestrerAppel(harnais.identite, appel, harnais.deps),
    };
  } catch (erreur: unknown) {
    return { genre: "levée", erreur };
  }
}

/**
 * Réécrit UNE ligne du journal SANS recalculer son empreinte — le geste d'une
 * réécriture après coup, celui que le chaînage doit rendre visible.
 */
function reecrire(
  lignes: readonly LigneAudit[],
  index: number,
  surcharge: Partial<LigneAudit>,
): readonly LigneAudit[] {
  return lignes.map((ligne, rang) => (rang === index ? { ...ligne, ...surcharge } : ligne));
}

// ═════════════════════════════════════════════════════════════════════════════
//  A · LE CHANGEMENT DE FORMAT — `externalEffect` ENTRE-T-IL VRAIMENT ?
// ═════════════════════════════════════════════════════════════════════════════

describe("ADR 0017 — la chaîne se recalcule-t-elle proprement après le changement de format ?", () => {
  /**
   * ✅ LA CHAÎNE COMPLÈTE, MÊLANT LES DEUX POPULATIONS.
   *
   * Une garde qui n'éprouverait que des lignes `externalEffect: false` — la
   * valeur par défaut des fixtures — serait verte même si le champ n'entrait
   * dans l'empreinte de personne : toutes les lignes porteraient la même valeur,
   * donc la même empreinte qu'avant le changement de format. Ce témoin fabrique
   * DEUX populations dans une seule chaîne, et compte ce qu'il a mesuré.
   */
  it("douze lignes mêlant les deux valeurs se vérifient, et le compte est annoncé", async () => {
    const store = new JournalMemoire();
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    let sorties = 0;
    let muettes = 0;
    for (let rang = 0; rang < 12; rang += 1) {
      const sortie = rang % 3 === 0;
      if (sortie) sorties += 1;
      else muettes += 1;
      await journal.journaliser(
        contenuTemoin(rang, sortie ? { effect: "send", externalEffect: true } : {}),
      );
    }

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.log(
      `[garde format · chaîne mêlée] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s) — ` +
        `${String(sorties)} avec effet extérieur, ${String(muettes)} sans, ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );

    // Plancher-témoin : une chaîne vide se vérifierait aussi, et pour rien.
    expect(rapport.lignesVerifiees, "le vérificateur annonce bien son compte").toBe(12);
    expect(sorties).toBeGreaterThan(0);
    expect(muettes).toBeGreaterThan(0);
    expect(rapport.journalVide).toBe(false);
    expect(rapport.valide).toBe(true);
    expect(rapport.anomalies).toEqual([]);
  });

  /**
   * ✅ LA GARDE DU CHANGEMENT DE FORMAT, LIGNE PAR LIGNE.
   *
   * `effet-exterieur.spec.ts` prouve que deux lignes qui diffèrent par ce seul
   * champ n'ont pas la même empreinte. C'est nécessaire et ce n'est pas
   * suffisant : ce qu'`ops_audit` doit tenir, c'est qu'une réécriture APRÈS COUP
   * de ce champ, SUR N'IMPORTE QUELLE LIGNE d'une chaîne déjà écrite, soit vue.
   * Un « oui, l'envoi est parti » repassé à « non » six mois plus tard est
   * exactement le geste que l'ADR 0002 veut rendre impossible sans la clé.
   *
   * ⚠️ CE TÉMOIN MUTILE LES DOUZE LIGNES, UNE PAR UNE, et exige DOUZE
   *    détections. Mutiler une seule ligne laisserait onze positions non
   *    éprouvées — et c'est toujours la douzième qui compte.
   */
  it("une réécriture d'`externalEffect` est vue sur CHACUNE des lignes, et le compte le dit", async () => {
    const store = await construireJournal(12);
    const intactes = store.toutes();

    let mutilees = 0;
    let detectees = 0;
    let comptesAnnonces = 0;

    for (let rang = 0; rang < intactes.length; rang += 1) {
      const ligne = intactes[rang];
      if (ligne === undefined) continue;
      mutilees += 1;

      const abimees = reecrire(intactes, rang, { externalEffect: !ligne.externalEffect });
      const rapport = verifierChaine(SCELLEUR_TEMOIN, abimees);

      // ⚠️ LE COMPTE EST LU SUR CHAQUE RAPPORT, PAS SUR LE DERNIER. Un
      //    vérificateur qui cesserait de compter dès qu'il rougit rendrait
      //    l'anomalie lisible et la mesure muette — c'est la moitié qu'on perd
      //    en premier.
      if (rapport.lignesVerifiees === intactes.length) comptesAnnonces += 1;
      if (rapport.anomalies.some((anomalie) => anomalie.genre === "empreinte-recalculée")) {
        detectees += 1;
      }
    }

    console.log(
      `[garde format · réécriture] ${String(mutilees)} ligne(s) mutilée(s) une par une, ` +
        `${String(detectees)} détectée(s) par « empreinte-recalculée », ` +
        `${String(comptesAnnonces)} rapport(s) annonçant encore leur compte`,
    );

    expect(mutilees, "les douze positions ont bien été éprouvées").toBe(12);
    expect(detectees, "ADR 0002 : le champ entre dans l'empreinte de CHAQUE ligne").toBe(mutilees);
    expect(comptesAnnonces, "le vérificateur compte même quand il rougit").toBe(mutilees);
  });

  /**
   * ✅ LE MÊME CHAMP, SUR LA LIGNE QUI ANCRE UNE PURGE.
   *
   * Une clôture est une ligne ORDINAIRE de la chaîne (§ 31), et `admettreAncre`
   * RECALCULE son empreinte avant de s'en servir. Le changement de format touche
   * donc aussi l'ancrage : si `externalEffect` n'entrait pas dans l'empreinte
   * d'une clôture, on pourrait retoucher une ancre sans qu'elle cesse d'ancrer —
   * c'est-à-dire faire mentir la seule ligne qui atteste ce qui a disparu.
   *
   * Mesuré des deux côtés : la purge intacte reste valide et ancrée, la même
   * purge dont la clôture est retouchée redevient un trou NON ancré.
   */
  it("une clôture dont `externalEffect` est retouché cesse d'ancrer la tranche purgée", async () => {
    const store = await construireJournal(10);
    const toutes = store.toutes();
    const pointe = toutes[toutes.length - 1];
    expect(pointe, "témoin mal fabriqué : journal vide").toBeDefined();
    if (pointe === undefined) return;

    const preparee = preparerPurge({
      lignesARetirer: toutes.slice(0, 4),
      cumulAnterieur: cumulAncrageTete(toutes),
      empreinteDerniereConservee: pointe.selfHash,
      argHash: sha256Hex("epreuve-lot1c-purge"),
      at: new Date(Date.UTC(2026, 8, 1)),
    });
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());
    await journal.journaliser(preparee.cloture);
    const retirees = store.supprimerIntervalle(preparee.seqDepuis, preparee.seqJusqua);

    const purge = store.toutes();
    const avant = verifierChaine(SCELLEUR_TEMOIN, purge);

    // La clôture est la DERNIÈRE ligne : elle s'appuie à la pointe (§ 31).
    const rangCloture = purge.length - 1;
    const cloture = purge[rangCloture];
    expect(cloture, "la clôture doit exister").toBeDefined();
    if (cloture === undefined) return;

    const apres = verifierChaine(
      SCELLEUR_TEMOIN,
      reecrire(purge, rangCloture, { externalEffect: !cloture.externalEffect }),
    );

    console.log(
      `[garde format · ancre] ${String(retirees)} ligne(s) retirée(s) — ` +
        `AVANT : ${String(avant.lignesVerifiees)} vérifiée(s), ` +
        `${String(avant.sautsAncres)} saut(s) ancré(s), valide=${String(avant.valide)} · ` +
        `APRÈS retouche : ${String(apres.lignesVerifiees)} vérifiée(s), ` +
        `${String(apres.sautsAncres)} saut(s) ancré(s), ` +
        `genres : ${apres.anomalies.map((a) => a.genre).join(", ")}`,
    );

    // Le témoin de capacité : sans retouche, la purge est valide et ancrée.
    expect(retirees).toBe(4);
    expect(avant.valide, "la purge intacte est valide").toBe(true);
    expect(avant.sautsAncres).toBe(1);

    // ⚖️ L'ATTENTE : la retouche casse l'empreinte de la clôture, donc son
    //    admission comme ancre, donc l'ancrage du trou. Les DEUX doivent se
    //    voir — une empreinte cassée qui ancrerait quand même serait le pire
    //    des cas : une ancre qu'on n'a pas le droit de croire, et qu'on croit.
    expect(apres.lignesVerifiees, "le compte est toujours annoncé").toBe(avant.lignesVerifiees);
    expect(apres.valide).toBe(false);
    expect(apres.anomalies.map((a) => a.genre)).toContain("empreinte-recalculée");
    expect(apres.sautsAncres, "la tranche purgée n'est plus attestée").toBe(0);
    expect(apres.anomalies.map((a) => a.genre)).toContain("tête-non-ancrée");
  });

  /**
   * ✅ LE CLIQUET EST BIEN CONDITIONNÉ PAR `estEffetExterieur`, PAS PAR `send`.
   *
   * `orchestrateur.ts` l'écrit : « IL EST CONDITIONNÉ PAR `estEffetExterieur`,
   * JAMAIS PAR `effect === "send"`. Le recopier ici laisserait `destructive`
   * dehors le jour où quelqu'un ne relit qu'une des deux listes. »
   *
   * Les gardes existantes n'éprouvent que `send`. Celle-ci prend l'AUTRE membre
   * de la famille : un outil `destructive`, qui exige par ailleurs une
   * confirmation systématique à TOUS les niveaux (§ 19.2). Si le cliquet était
   * recâblé sur `send`, ce témoin rougirait — et lui seul.
   */
  it("un outil `destructive` pose `externalEffect` — la famille entière, pas le seul `send`", async () => {
    const harnais = fabriquerHarnais({
      outils: [outilDestructif()],
      niveau: NIVEAU_LIBRE,
      confirmationValide: true,
    });

    const issue = await issueDe(
      harnais,
      appelTemoin({ nomComplet: "temoin.detruire", jetonDeConfirmation: "jeton-temoin" }),
    );
    const ecrites = harnais.store.toutes();
    const ligne = ecrites[0];

    console.log(
      `[garde cliquet · destructive] ${String(ecrites.length)} ligne(s) mesurée(s) — ` +
        `effets extérieurs RÉELS : ${String(harnais.effets())}, ` +
        `effect journalisé : ${String(ligne?.effect)}, ` +
        `externalEffect : ${String(ligne?.externalEffect)}, issue : ${issue.genre}`,
    );

    expect(harnais.effets(), "la destruction a bien eu lieu").toBe(1);
    expect(ecrites.length).toBe(1);
    expect(ligne?.effect).toBe("destructive");
    // ⚖️ L'ATTENTE : `estEffetExterieur` classe `destructive` comme extérieur.
    //    Le cliquet doit le suivre, sans quoi toute une famille d'effets
    //    disparaîtrait d'une revue conduite sur `externalEffect`.
    expect(ligne?.externalEffect, "§ 20 : détruire se voit de l'extérieur").toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  B · UNE LIGNE D'INTENTION SANS LIGNE D'ISSUE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UN PORT D'INTENTION QUI ÉCRIT VRAIMENT — le remède décrit en tête
 * d'`orchestrateur.ts`, monté pour de bon.
 *
 * ⚠️ IL N'INVENTE AUCUN CHAMP. Il ne PEUT pas : `ContenuLigne` n'a aucune place
 *    pour dire « ceci est une intention, et voici son issue ». Ce port écrit donc
 *    ce qu'un port réel écrirait aujourd'hui — une ligne ordinaire de plus — et
 *    c'est précisément ce que la garde mesure.
 */
class IntentionQuiEcrit implements PorteeDIntention {
  public ouvertes = 0;
  public closes = 0;
  readonly #journal: Journal;
  readonly #clotureLeve: boolean;

  constructor(journal: Journal, clotureLeve = false) {
    this.#journal = journal;
    this.#clotureLeve = clotureLeve;
  }

  async avantEffet(intention: {
    readonly principal: string;
    readonly sessionId: SessionId;
    readonly tool: string;
    readonly argHash: string;
    readonly maintenant: Date;
  }): Promise<LigneEcrite | null> {
    const ligne = await this.#journal.journaliser({
      at: intention.maintenant,
      principal: intention.principal,
      sessionId: intention.sessionId,
      tool: intention.tool,
      toolVersion: "1.0.0",
      adapterVersion: "1.0.0",
      effect: "send",
      policyLevel: "libre",
      // Une intention n'est ni un refus ni une panne : c'est un appel autorisé
      // dont on n'a pas encore l'issue. Aucun mot du vocabulaire ne dit cela.
      decision: "autorisé",
      stepDenied: null,
      argHash: intention.argHash,
      argHashValidated: true,
      recordIds: [],
      partialSources: [],
      durationMs: 0,
      outcome: "ok",
      externalEffect: false,
    });
    this.ouvertes += 1;
    return ligne;
  }

  apresEffet(): Promise<void> {
    if (this.#clotureLeve) {
      return Promise.reject(new Error("port d'intention d'épreuve : clôture impossible"));
    }
    this.closes += 1;
    return Promise.resolve();
  }
}

describe("§ 11 — une intention SANS issue est-elle détectable, et COMPTÉE ?", () => {
  /**
   * 🔴 CE QUE L'ÉPREUVE A MESURÉ : ELLE N'EST NI L'UN NI L'AUTRE.
   *
   * Le mécanisme est câblé aux deux instants exacts — `orchestrateur.ts` appelle
   * `avantEffet` juste avant `executer()` et `apresEffet` dans le `finally`. Mais
   * ce que `avantEffet` ÉCRIT n'a aucune forme : `ContenuLigne` porte dix-sept
   * champs, et aucun ne dit « ceci est une intention » ni « son issue est
   * revenue ». Une intention non close est donc, dans `ops_audit`, une ligne
   * ordinaire de plus.
   *
   * Conséquence mesurée ci-dessous, avec un port qui écrit RÉELLEMENT :
   *
   *  · `verifierChaine` déclare le journal VALIDE et annonce son compte — et son
   *    compte ne distingue pas les intentions des issues ;
   *  · une revue du § 24 conduite sur ce journal compte DEUX appels là où il y
   *    en a eu un, et n'a aucun moyen de retrouver celui dont l'issue manque.
   *
   * Ce n'est pas une porte ouverte : rien n'est servi de plus. C'est le SIGNAL
   * du remède qui n'existe pas — « une intention non close doit être le SIGNAL,
   * pas le bruit de fond », dit `orchestrateur.ts`. Aujourd'hui, elle EST le
   * bruit de fond.
   */
  it("mesure ce qu'un port d'intention réel laisse dans le journal, et ce qu'on peut en tirer", async () => {
    const store = new JournalMemoire();
    const journalDIntention = new Journal(
      SCELLEUR_TEMOIN,
      store,
      new HorlogeFigee(INSTANT.getTime()),
    );
    const intention = new IntentionQuiEcrit(journalDIntention, true);

    const harnais = fabriquerHarnais({
      store,
      intention,
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
    });

    let appels = 0;
    for (let rang = 0; rang < 3; rang += 1) {
      appels += 1;
      await issueDe(harnais, appelTemoin({ nomComplet: "temoin.envoyer" }));
    }

    const ecrites = store.toutes();
    const rapport = verifierChaine(SCELLEUR_TEMOIN, ecrites);

    // DEUX MESURES, ET ELLES NE DISENT PAS LA MÊME CHOSE.
    //
    //  · le VOCABULAIRE fermé du journal (§ 12) a-t-il un mot pour une
    //    intention ? Il est dérivé, jamais recopié : `DECISIONS` et `OUTCOMES` ;
    //  · le TRIPLET de décision d'une ligne d'intention se distingue-t-il de
    //    celui d'une ligne d'issue ? Les deux populations sont ici comptées par
    //    le nombre de triplets DISTINCTS qu'elles produisent.
    const motsPourUneIntention = [...DECISIONS, ...OUTCOMES].filter((mot) =>
      mot.toLowerCase().includes("intention"),
    ).length;
    const tripletsDistincts = new Set(
      ecrites.map((ligne) => `${ligne.decision}|${ligne.outcome}|${String(ligne.stepDenied)}`),
    ).size;

    console.log(
      `[garde intention] ${String(appels)} appel(s) exécuté(s) — ` +
        `${String(intention.ouvertes)} intention(s) ouverte(s), ` +
        `${String(intention.closes)} close(s), ` +
        `${String(rapport.lignesVerifiees)} ligne(s) au journal, ` +
        `valide=${String(rapport.valide)} — ` +
        `${String(DECISIONS.length + OUTCOMES.length)} mot(s) de vocabulaire confronté(s), ` +
        `${String(motsPourUneIntention)} désigne(nt) une intention · ` +
        `${String(tripletsDistincts)} triplet(s) de décision distinct(s) pour ` +
        `${String(ecrites.length)} ligne(s)`,
    );

    // LES FAITS, et ils resteront vrais après le correctif.
    expect(appels).toBe(3);
    expect(intention.ouvertes, "trois intentions ont bien été ouvertes").toBe(3);
    expect(intention.closes, "et AUCUNE n'a été close : la clôture lève").toBe(0);
    // Deux lignes par appel : l'intention, puis l'issue. Le journal est bien
    // chaîné — ce n'est pas l'intégrité qui manque.
    expect(rapport.lignesVerifiees).toBe(appels * 2);
    expect(rapport.valide, "la chaîne reste intègre : le défaut n'est pas là").toBe(true);
    // ⚠️ LES DEUX FAITS MESURÉS : aucun mot ne nomme une intention, et les six
    //    lignes ne portent qu'UN SEUL triplet de décision — trois intentions et
    //    trois issues, indiscernables l'une de l'autre dans la colonne qui
    //    décide.
    expect(motsPourUneIntention, "aucun mot du vocabulaire ne nomme une intention").toBe(0);
    expect(tripletsDistincts, "intentions et issues portent le MÊME triplet").toBe(1);
  });

  /**
   * 🔴 L'ATTENTE DU CDC, SOUS `it.fails`.
   *
   * `orchestrateur.ts` : « une intention SANS issue est le signal recherché : un
   * effet est parti, et le socle n'a pas su dire ce qu'il est devenu ». Un signal
   * qu'aucun instrument ne sait lire n'est pas un signal. Il faut donc pouvoir
   * répondre, depuis le journal SEUL, à : « combien d'intentions sont restées
   * ouvertes ? »
   *
   * ⚠️ CE TÉMOIN ROUGIRA le jour où une ligne d'intention aura une forme et un
   *    compteur. C'est ce qu'on veut : il faudra alors le repasser en `it()`.
   */
  it.fails("🔴 le journal SEUL doit savoir compter les intentions restées ouvertes", async () => {
    const store = new JournalMemoire();
    const journalDIntention = new Journal(
      SCELLEUR_TEMOIN,
      store,
      new HorlogeFigee(INSTANT.getTime()),
    );
    const intention = new IntentionQuiEcrit(journalDIntention, true);
    const harnais = fabriquerHarnais({
      store,
      intention,
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
    });

    await issueDe(harnais, appelTemoin({ nomComplet: "temoin.envoyer" }));

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());
    // Le rapport de vérification est le seul instrument que le socle offre sur
    // un journal. Il compte les clôtures de purge, les sauts, les ancres
    // inutilisées — et rien du remède de l'invariant ①.
    const champsDuRapport = Object.keys(rapport);
    const compteursDIntention = champsDuRapport.filter((champ) =>
      champ.toLowerCase().includes("intention"),
    );

    console.log(
      `[garde intention · comptage] ${String(champsDuRapport.length)} champ(s) au rapport de ` +
        `vérification, ${String(compteursDIntention.length)} qui compte(nt) une intention`,
    );

    // Le FAIT, vrai avant comme après : le rapport publie bien des comptes.
    expect(champsDuRapport.length).toBeGreaterThan(5);
    // ⚖️ L'ATTENTE : un mécanisme dont le signal est « une intention sans
    //    issue » doit rendre ce signal COMPTABLE. Zéro compteur = un signal
    //    que personne ne peut lire.
    expect(compteursDIntention.length, "le signal doit être comptable").toBeGreaterThan(0);
  });

  /**
   * ⚠️ `avantEffet` EST APPELÉ HORS DU `try … finally` DE L'ÉTAPE 14.
   *
   * Le `finally` d'`orchestrateur.ts` porte les deux clôtures, et il a été durci
   * au lot 1c pour que la panne de l'intention ne saute plus celle de
   * l'idempotence. Mais `avantEffet`, lui, est appelé AVANT ce bloc : s'il lève,
   * `cloturerLimites` n'est jamais atteint et la réservation reste `in_flight`.
   *
   * FERMÉ : rien n'est parti, et la clé demeure verrouillée jusqu'au TTL — donc
   * aucun rejeu ne peut doubler quoi que ce soit. Ce témoin CHIFFRE la
   * conséquence plutôt que de la supposer : une clé consommée pour un appel qui
   * n'a rien exécuté.
   */
  it("une intention qui LÈVE AVANT l'effet ferme la porte, et laisse la clé prise", async () => {
    const intentionQuiLeveAvant: PorteeDIntention = {
      avantEffet(): Promise<null> {
        return Promise.reject(new Error("port d'intention d'épreuve : écriture impossible"));
      },
      apresEffet(): Promise<void> {
        return Promise.resolve();
      },
    };

    const harnais = fabriquerHarnais({
      intention: intentionQuiLeveAvant,
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });

    const issue = await issueDe(
      harnais,
      appelTemoin({ nomComplet: "temoin.envoyer", idempotencyKey: "cle-intention-avant" }),
    );
    const idem = await harnais.idempotence.lire(
      "temoin.envoyer",
      empreinteDeCleDIdempotence("cle-intention-avant"),
    );
    const ecrites = harnais.store.toutes();

    console.log(
      `[garde intention · avant l'effet] 1 appel mesuré — effets : ${String(harnais.effets())}, ` +
        `issue : ${issue.genre}, ligne(s) : ${String(ecrites.length)}, ` +
        `décision : ${String(ecrites[0]?.decision)}, ` +
        `externalEffect : ${String(ecrites[0]?.externalEffect)}, ` +
        `idempotence : ${String(idem?.status)}`,
    );

    expect(harnais.effets(), "FERMÉ : rien n'est parti").toBe(0);
    expect(ecrites.length, "l'invariant tient : la ligne existe").toBe(1);
    expect(ecrites[0]?.decision).toBe("interrompu");
    expect(ecrites[0]?.externalEffect, "et elle n'accuse rien : rien n'est sorti").toBe(false);
    // Le fait chiffré : la réservation reste ouverte, faute d'avoir atteint le
    // `finally`. Fail-closed — mais la clé est prise jusqu'au TTL.
    expect(idem?.status, "la clé reste prise : le `finally` n'a pas été atteint").toBe("in_flight");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  C · UNE PANNE APRÈS L'EFFET ROUVRE LE REJEU
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 09/§ 13 — une panne APRÈS l'envoi laisse-t-elle le rejeu le doubler ?", () => {
  /**
   * ✅ **LE DÉFAUT LE PLUS GRAVE DE CETTE ÉPREUVE EST FERMÉ — ADR 0021.**
   *
   * Ce qu'il disait, et il avait raison : l'orchestrateur appliquait DÉJÀ la
   * bonne règle sur la branche du refus d'étape 14 — « l'effet a déjà eu lieu,
   * l'idempotence est close en `done`, sans quoi un rejeu produirait un SECOND
   * effet ». La branche voisine, celle de l'EXCEPTION, ne l'appliquait pas :
   * `issueDeLEffet` y passait à `"failed"`, et `failed` est le seul statut que
   * `reserver()` REPREND. Un envoi PARTI dont le traitement d'aval levait
   * laissait donc une clé rejouable, et le rejeu renvoyait.
   *
   * ⚠️ **LA PANNE N'EST TOUJOURS PAS FABRIQUÉE**, et c'est ce qui donne son prix
   *    à ce témoin : c'est l'ADAPTATEUR lui-même qui la cause. Il ENVOIE, puis
   *    rend une charge hors contrat — `sourceIncomplete` en chaîne, ce que rend
   *    n'importe quelle API JSON qui écrit `"false"` — et
   *    `verifierChargeDeLAdaptateur` lève APRÈS `executer()`. Aucune panne
   *    d'infrastructure n'est requise, et le geste est répétable.
   *
   * ⚠️ **CE QUI A CHANGÉ, ET CE QUI N'A PAS CHANGÉ.** Le socle SAVAIT déjà :
   *    `externalEffect` valait `true` sur la ligne de la première tentative — le
   *    cliquet de l'ADR 0017 avait été tiré. L'information manquante n'en était
   *    pas une ; la clôture ne la LISAIT pas. L'ADR 0021 lui donne un lecteur
   *    (`AffineursDAppel.effetExterieurSurvenu`) et remplace le ternaire du
   *    `finally` par `issueDeReservation()`. Le journal, lui, dit toujours la
   *    même chose : ce que le socle a VU.
   */
  it("✅ un envoi PARTI suivi d'une charge hors contrat laisse la clé FERMÉE", async () => {
    const harnais = fabriquerHarnais({
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      // L'adaptateur envoie, puis rend une charge hors contrat.
      charge: {
        items: [{ id: "a" }],
        failedSources: [],
        sourceIncomplete: "false" as unknown as boolean,
        recordIds: [],
      },
    });
    const appel = appelTemoin({
      nomComplet: "temoin.envoyer",
      idempotencyKey: "cle-panne-apres-envoi",
    });

    const premiere = await issueDe(harnais, appel);
    const idemApresLaPremiere = await harnais.idempotence.lire(
      "temoin.envoyer",
      empreinteDeCleDIdempotence("cle-panne-apres-envoi"),
    );
    const ligne = harnais.store.toutes()[0];

    // LE REJEU, avec la MÊME clé — ce que fait tout client qui réessaie.
    const seconde = await issueDe(harnais, appel);

    console.log(
      `[garde rejeu après panne post-envoi] 2 tentative(s) mesurée(s) sous la MÊME clé — ` +
        `effets extérieurs RÉELS : ${String(harnais.effets())}, ` +
        `issues : ${premiere.genre}, ${seconde.genre} — ` +
        `externalEffect de la 1ʳᵉ ligne : ${String(ligne?.externalEffect)}, ` +
        `idempotence après la 1ʳᵉ : ${String(idemApresLaPremiere?.status)}`,
    );

    // LES FAITS, inchangés par le correctif.
    expect(ligne, "la première tentative a bien écrit sa ligne").toBeDefined();
    expect(ligne?.effect).toBe("send");
    expect(ligne?.externalEffect, "le socle SAIT que l'envoi est parti").toBe(true);
    expect(premiere.genre, "la première tentative échoue pour l'appelant").toBe("levée");

    // ⚖️ CE QUI A CHANGÉ, ET C'EST LA DÉCISION DE L'ADR 0021.
    expect(idemApresLaPremiere?.status, "la clé est FERMÉE, donc non reprenable").toBe("done");
    expect(harnais.effets(), "§ 09 : une clé, un effet").toBe(1);
  });

  /**
   * ✅ **L'ATTENTE DU § 09, BASCULÉE DE `it.fails` EN `it()`.**
   *
   * Elle était portée sous `it.fails` par l'épreuve du lot 1c : verte parce
   * qu'elle échouait. Le défaut fermé, elle ROUGISSAIT — ce qui est exactement
   * le mécanisme voulu — et elle repasse donc en `it()`. Elle n'est pas
   * supprimée : c'est LA propriété d'une clé d'idempotence, et elle doit
   * continuer à être mesurée quand personne ne regardera plus l'ADR.
   */
  it("✅ une clé d'idempotence ne fait JAMAIS partir deux envois", async () => {
    const harnais = fabriquerHarnais({
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      charge: {
        items: [{ id: "a" }],
        failedSources: [],
        sourceIncomplete: "false" as unknown as boolean,
        recordIds: [],
      },
    });
    const appel = appelTemoin({ nomComplet: "temoin.envoyer", idempotencyKey: "cle-attente" });

    await issueDe(harnais, appel);
    await issueDe(harnais, appel);

    console.log(
      `[garde rejeu · attente § 09] 2 tentative(s) sous la MÊME clé — ` +
        `effets extérieurs : ${String(harnais.effets())}`,
    );

    // Le FAIT : au moins un envoi est bien parti — sans quoi le zéro suivant
    // serait vert pour la pire des raisons.
    expect(harnais.effets()).toBeGreaterThanOrEqual(1);
    // ⚖️ L'ATTENTE, désormais TENUE : le socle la tenait sur le refus d'étape 14,
    //    il la tient maintenant aussi sur l'exception.
    expect(harnais.effets(), "§ 09 : une clé, un effet").toBe(1);
  });

  /**
   * ✅ **LA MÊME PORTE PAR UN AUTRE CHEMIN, FERMÉE PAR LE MÊME VERROU.**
   *
   * `marquerResultat` est appelé APRÈS l'étape 14, DANS le `try`. Un index qui
   * lève — saturation hostile, magasin partagé le jour où il en existera un —
   * produisait exactement la même chose : envoi parti, clé `failed`, rejeu qui
   * renvoie. Deux chemins pour un seul défaut : ce n'était pas un accident du
   * premier, c'était la branche `catch` qui ne lisait pas le cliquet.
   *
   * ⚠️ CE TÉMOIN N'EST PAS UN DOUBLON DU PRÉCÉDENT, ET C'EST TOUT SON INTÉRÊT :
   *    il prouve que le correctif porte sur la CAUSE — la dérivation de l'issue —
   *    et non sur le symptôme du premier chemin. Une rustine posée dans
   *    `etape-14-execution.ts` aurait laissé celui-ci ouvert.
   */
  it("✅ un index de provenance qui LÈVE après l'envoi ne rouvre PAS la porte", async () => {
    class IndexQuiLeve implements IndexProvenance {
      public marquages = 0;

      marquer(): void {
        this.marquages += 1;
        throw new Error("index d'épreuve : magasin de provenance injoignable");
      }

      domainesMarquants(): readonly string[] {
        return [];
      }

      /** Le signal positif du § 20 : zéro, et c'est la vérité — rien n'entre. */
      taille(): number {
        return 0;
      }
    }

    const index = new IndexQuiLeve();
    const harnais = fabriquerHarnais({
      outils: [outilEnvoi({ dataClass: "personal" })],
      niveau: NIVEAU_LIBRE,
      index,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });
    const appel = appelTemoin({ nomComplet: "temoin.envoyer", idempotencyKey: "cle-index" });

    await issueDe(harnais, appel);
    const idem = await harnais.idempotence.lire(
      "temoin.envoyer",
      empreinteDeCleDIdempotence("cle-index"),
    );
    await issueDe(harnais, appel);

    console.log(
      `[garde rejeu · index qui lève] ${String(index.marquages)} marquage(s) tenté(s) — ` +
        `effets extérieurs RÉELS : ${String(harnais.effets())}, ` +
        `idempotence après la 1ʳᵉ : ${String(idem?.status)}`,
    );

    expect(index.marquages, "l'index a bien été sollicité APRÈS l'envoi").toBeGreaterThan(0);
    expect(idem?.status, "la clé est FERMÉE : le cliquet était levé").toBe("done");
    expect(harnais.effets(), "le second chemin est fermé par le même verrou").toBe(1);
  });

  /**
   * ✅ LE CONTRE-TÉMOIN QUI ISOLE LA RÈGLE — sans lui, les trois précédents
   * seraient verts pour un socle qui FERMERAIT TOUJOURS, ce qui serait un tout
   * autre défaut : un amont transitoirement injoignable verrouillerait la clé
   * jusqu'au TTL, et l'ADR 0021 refuse nommément ce fail-closed-là.
   *
   * ⚠️ **CE TÉMOIN A DÛ CHANGER D'OUTIL, ET LE MOTIF EST UNE DÉCISION ÉCRITE.**
   *    Il éprouvait un `send` dont l'adaptateur levait AVANT d'envoyer, et
   *    attendait une reprise. Ce n'est plus le comportement : sur un effet
   *    EXTÉRIEUR, l'ADR 0021 se replie en `done` même quand l'adaptateur lève,
   *    parce que le socle ne peut pas savoir s'il a envoyé avant de lever —
   *    l'ADR 0017 l'écrit dans sa « conséquence acceptée n° 1 ». La reprise vit
   *    donc là où elle est sûre : `read` et `write-draft`, où rien ne sort.
   *
   *    Le second témoin ci-dessous MESURE l'écart plutôt que de le taire.
   */
  it("SAIT DIRE OUI — sur un effet NON extérieur, le rejeu réexécute", async () => {
    let tentatives = 0;
    const depot = new DepotIdemAtomique();
    const store = new JournalMemoire();

    /** Le premier appel de l'adaptateur tombe ; le second passe. */
    const harnais = fabriquerHarnais({
      store,
      depotIdempotence: depot,
      // ⚠️ UN BROUILLON, PAS UN ENVOI. `estEffetExterieur("write-draft")` est
      //    faux : rien ne sort, la reprise est le comportement utile, et le § 20
      //    confie le brouillon à la relecture humaine.
      outils: [outilTemoin({ name: "temoin.brouillon", effect: "write-draft" })],
      niveau: NIVEAU_LIBRE,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      charge: (): ChargeAdaptateur => {
        tentatives += 1;
        if (tentatives === 1) throw new Error("adaptateur d'épreuve : amont injoignable");
        return CHARGE_ORDINAIRE;
      },
    });
    const appel = appelTemoin({
      nomComplet: "temoin.brouillon",
      idempotencyKey: "cle-avant-envoi",
    });

    await issueDe(harnais, appel);
    const idem = await depot.lire(
      "temoin.brouillon",
      empreinteDeCleDIdempotence("cle-avant-envoi"),
    );
    const premiereLigne = store.toutes()[0];
    await issueDe(harnais, appel);

    console.log(
      `[contre-témoin · panne sur un brouillon] ${String(tentatives)} tentative(s) ` +
        `d'adaptateur — externalEffect de la 1ʳᵉ ligne : ` +
        `${String(premiereLigne?.externalEffect)}, ` +
        `idempotence après la 1ʳᵉ : ${String(idem?.status)}, ` +
        `lignes : ${String(store.toutes().length)}`,
    );

    expect(tentatives, "les deux tentatives ont bien atteint l'adaptateur").toBe(2);
    // C'EST LE POINT : ici, `failed` est la BONNE valeur, et le cliquet le dit.
    expect(premiereLigne?.externalEffect, "rien n'était sorti").toBe(false);
    expect(idem?.status).toBe("failed");
    expect(store.toutes().length, "deux terminaisons, deux lignes").toBe(2);
  });

  /**
   * ⚠️ **L'ÉCART ASSUMÉ DE L'ADR 0021, MESURÉ PLUTÔT QUE TU.**
   *
   * Sur un outil `send`, une exception levée AVANT que rien ne parte consomme
   * tout de même la clé : le socle ne dispose d'aucun fait qui distingue « levé
   * avant d'envoyer » de « levé après avoir envoyé ». Le remède serait un second
   * cliquet « l'adaptateur a été atteint » ; l'ADR 0021 le refuse — il ajouterait
   * à `AffineursDAppel` un membre qui ne mute AUCUNE colonne de la ligne, et
   * rouvrirait la fenêtre de l'empreinte chaînée pour une colonne de plus.
   *
   * **Le prix : un appel légitime doit employer une clé neuve.** C'est le sens
   * sûr, et le message de refus du § 15 le dit déjà. Ce témoin existe pour que
   * l'écart soit un CHIFFRE dans une sortie de garde, et non une phrase dans un
   * document que personne ne relira.
   */
  it("⚠️ écart assumé — sur un `send`, une panne AVANT l'envoi consomme quand même la clé", async () => {
    let tentatives = 0;
    const depot = new DepotIdemAtomique();
    const store = new JournalMemoire();

    const harnais = fabriquerHarnais({
      store,
      depotIdempotence: depot,
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      charge: (): ChargeAdaptateur => {
        tentatives += 1;
        if (tentatives === 1) throw new Error("adaptateur d'épreuve : amont injoignable");
        return CHARGE_ORDINAIRE;
      },
    });
    const appel = appelTemoin({
      nomComplet: "temoin.envoyer",
      idempotencyKey: "cle-panne-avant-envoi-sur-send",
    });

    await issueDe(harnais, appel);
    const idem = await depot.lire(
      "temoin.envoyer",
      empreinteDeCleDIdempotence("cle-panne-avant-envoi-sur-send"),
    );
    const premiereLigne = store.toutes()[0];
    await issueDe(harnais, appel);

    console.log(
      `[écart assumé · fail-closed sur un send] ${String(tentatives)} tentative(s) ` +
        `d'adaptateur pour 2 appels — externalEffect de la 1ʳᵉ ligne : ` +
        `${String(premiereLigne?.externalEffect)}, ` +
        `idempotence après la 1ʳᵉ : ${String(idem?.status)} — ` +
        `la clé est consommée alors que RIEN n'est parti`,
    );

    // Le FAIT que le journal atteste, et il reste honnête : rien n'est sorti.
    expect(premiereLigne?.externalEffect, "le socle n'a rien VU sortir").toBe(false);
    // L'ÉCART : la POLITIQUE de reprise, elle, se replie du côté sûr.
    expect(idem?.status, "et la clé se ferme quand même — fail-closed").toBe("done");
    expect(tentatives, "le second appel ne réexécute pas : clé neuve exigée").toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  D · LE JOURNAL QUI FOURCHE SOUS LA CONCURRENCE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 12 — la section critique du journal, éprouvée plutôt que déclarée", () => {
  /**
   * ✅ **DÉFAUT FERMÉ AU LOT 1d.** `JournalMemoire` TIENT DÉSORMAIS LA SECTION
   *    CRITIQUE QU'IL DÉCLARE.
   *
   * Son en-tête l'écrivait déjà mot pour mot au lot 1c — « il tient la section
   * critique du port par une file d'attente à un seul jeton » — et il n'y avait
   * ni file, ni jeton, ni verrou. Deux `journaliser` concurrents lisaient le
   * MÊME `prevHash` et écrivaient tous deux : la chaîne FOURCHAIT, et le
   * contrôle d'unicité de `selfHash` ne les arrêtait pas — deux lignes de
   * contenus différents ont deux empreintes différentes.
   *
   * ⚠️ POURQUOI CELA COMPTAIT MÊME SI LE STORE RÉEL TIENDRA LE CONTRAT. Ce
   *    double est le seul instrument dont disposent les fichiers de gardes du
   *    socle. Une propriété que le double NE TIENT PAS est une propriété que
   *    RIEN n'éprouve — et son en-tête affirmait le contraire, ce qui est la
   *    façon la plus sûre de ne jamais l'écrire.
   *
   * ⚠️ **CE TÉMOIN-CI NE PROUVE RIEN SEUL, ET LE RÉGIME NÉGATIF VIT AILLEURS.**
   *    `core/audit/memoire.spec.ts` fabrique la fourche à la demande sur
   *    `JournalMemoireSansSectionCritique` — le comportement d'AVANT, conservé
   *    exprès pour que la garde puisse prouver qu'elle sait dire NON. Sans ce
   *    jumeau, « la chaîne reste valide » serait vert pour trois raisons
   *    indiscernables : la file tient, le vérificateur est cassé, ou rien n'a
   *    jamais été mis en concurrence.
   */
  it("✅ deux écritures concurrentes NE FOURCHENT PLUS — et la file a MORDU", async () => {
    const store = await construireJournal(3);
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    // Deux contenus DIFFÉRENTS : deux contenus identiques se heurteraient à
    // l'unicité de `selfHash`, et le témoin serait vert pour une autre raison.
    await Promise.all([
      journal.journaliser(contenuTemoin(101)),
      journal.journaliser(contenuTemoin(102)),
    ]);

    const toutes = store.toutes();
    const chainons = new Map<string, number>();
    for (const ligne of toutes) {
      const cle = ligne.prevHash ?? "origine";
      chainons.set(cle, (chainons.get(cle) ?? 0) + 1);
    }
    const chainonsPartages = [...chainons.values()].filter((compte) => compte > 1).length;
    const rapport = verifierChaine(SCELLEUR_TEMOIN, toutes);

    console.log(
      `[garde section critique] ${String(toutes.length)} ligne(s) au journal, ` +
        `${String(chainons.size)} chaînon(s) distinct(s), ` +
        `${String(chainonsPartages)} chaînon(s) réclamé(s) par PLUSIEURS lignes — ` +
        `${String(rapport.lignesVerifiees)} vérifiée(s), valide=${String(rapport.valide)}, ` +
        `${String(store.ecrituresMisesEnAttente)} écriture(s) mise(s) en attente par la file, ` +
        `genres : ${rapport.anomalies.map((a) => a.genre).join(", ") || "aucun"}`,
    );

    // LES FAITS. Les deux écritures ont abouti : rien n'a été perdu, et c'est
    // le chaînage qui n'est plus doublé.
    expect(toutes.length).toBe(5);
    expect(rapport.lignesVerifiees, "le compte est annoncé").toBe(5);
    // ⚠️ LA CONCURRENCE A EU LIEU. Sans cette mesure, les deux attentes
    //    ci-dessous seraient vertes le jour où les écritures cesseraient de se
    //    croiser — c'est-à-dire sans que rien ne soit gardé.
    expect(store.ecrituresMisesEnAttente, "un appelant a dû attendre").toBeGreaterThan(0);
    // LE DÉFAUT, FERMÉ : plus aucune ligne ne réclame le chaînon d'une autre.
    expect(chainonsPartages, "aucun chaînon réclamé deux fois").toBe(0);
    expect(rapport.valide).toBe(true);
    expect(rapport.anomalies.map((a) => a.genre)).not.toContain("saut-non-ancré");
  });

  /**
   * ✅ **L'ATTENTE ÉCRITE PAR LE FICHIER LUI-MÊME — TENUE DEPUIS LE LOT 1d.**
   *
   * « `dernierSelfHash` puis `ajouter` ne peuvent pas s'entrelacer. » C'était
   * faux ; ce test portait donc l'attente sous `it.fails`, vert parce qu'il
   * échouait. Le défaut étant fermé, il BASCULE en `it()` : c'est un progrès,
   * et la dette nommée qu'il portait est soldée.
   */
  it("✅ `JournalMemoire` tient la section critique qu'il déclare tenir", async () => {
    const store = await construireJournal(3);
    const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee());

    await Promise.all([
      journal.journaliser(contenuTemoin(201)),
      journal.journaliser(contenuTemoin(202)),
    ]);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, store.toutes());

    console.log(
      `[garde section critique · attente] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );

    // Le FAIT : les deux lignes sont bien là. Vrai dans les deux régimes.
    expect(rapport.lignesVerifiees).toBe(5);
    // ⚖️ L'ATTENTE, ÉCRITE PAR L'EN-TÊTE DE `memoire.ts`.
    expect(rapport.valide, "la section critique déclarée doit tenir").toBe(true);
  });

  /**
   * ✅ **LA MÊME PAIRE, PAR LA CHAÎNE COMPLÈTE** — et c'est ainsi que le défaut
   * se serait produit en vrai : un appel = une écriture, deux appels concurrents
   * = deux écritures concurrentes.
   *
   * Ce témoin le mesure sur `orchestrerAppel`, sans toucher au journal à la
   * main. C'est LA garde de couture du côté journal : la section critique n'est
   * pas éprouvée sur le store isolé, mais sur le chemin de production qui
   * enchaîne réellement `dernierSelfHash` puis `ajouter` — `Journal.journaliser`,
   * appelé par l'invariant de sortie du § 11. Débrancher la file ferait rougir
   * CE test-ci, et pas seulement un test d'unité.
   */
  it("✅ deux APPELS concurrents laissent un journal VÉRIFIABLE", async () => {
    const harnais = fabriquerHarnais();

    await Promise.all([
      issueDe(harnais, appelTemoin({ input: { a: 1 } })),
      issueDe(harnais, appelTemoin({ input: { b: 2 } })),
    ]);

    const rapport = verifierChaine(SCELLEUR_TEMOIN, harnais.store.toutes());

    console.log(
      `[garde fourche · chaîne complète] 2 appel(s) concurrents mesurés — ` +
        `${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `valide=${String(rapport.valide)}, ` +
        `${String(harnais.store.ecrituresMisesEnAttente)} écriture(s) mise(s) en attente, ` +
        `genres : ${rapport.anomalies.map((a) => a.genre).join(", ") || "aucun"}`,
    );

    expect(rapport.lignesVerifiees, "deux terminaisons, deux lignes").toBe(2);
    // La concurrence a bien eu lieu : sans cette mesure, la validité ci-dessous
    // ne dirait pas si la file a mordu ou si rien ne s'est croisé.
    expect(harnais.store.ecrituresMisesEnAttente).toBeGreaterThan(0);
    // LE FAIT : le journal d'un socle qui sert deux appels à la fois se vérifie.
    expect(rapport.valide).toBe(true);
  });

  /**
   * ✅ SAIT DIRE OUI — les MÊMES appels, en séquence, laissent une chaîne valide.
   * Sans lui, les trois précédents seraient verts pour un vérificateur cassé.
   */
  it("SAIT DIRE OUI — deux appels SÉQUENTIELS laissent la chaîne valide", async () => {
    const harnais = fabriquerHarnais();

    await issueDe(harnais, appelTemoin({ input: { a: 1 } }));
    await issueDe(harnais, appelTemoin({ input: { b: 2 } }));

    const rapport = verifierChaine(SCELLEUR_TEMOIN, harnais.store.toutes());

    console.log(
      `[garde séquentielle] 2 appel(s) séquentiels mesurés — ` +
        `${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), valide=${String(rapport.valide)}`,
    );

    expect(rapport.lignesVerifiees).toBe(2);
    expect(rapport.valide).toBe(true);
    expect(rapport.anomalies).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  E · UN SECOND PROCESSUS QUI DÉMARRE
// ═════════════════════════════════════════════════════════════════════════════

const CHEMIN_VERROU = fileURLToPath(new URL("../instance/verrou.ts", import.meta.url));

describe("ADR 0018 — un second processus est-il EMPÊCHÉ, ou seulement constaté ?", () => {
  /**
   * ✅ **LA MOITIÉ « EMPÊCHER » EXISTE DEPUIS LE LOT 1d.**
   *
   * L'ADR 0018 pose deux gardes, et dit qu'elles ne se remplacent pas : le VERROU
   * (dedans, au démarrage puis en continu) et l'OBSERVATEUR (dehors,
   * `ops/mono-instance.ts`). L'observateur est écrit, éprouvé, et il porte sa
   * borne — « il DÉTECTE une seconde instance, il ne prouve jamais qu'il n'y en a
   * pas ».
   *
   * Le verrou, lui, n'était QUE des types au lot 1c : `VerrouDInstance` n'avait
   * aucune implémentation, pas même un double en mémoire, et `verrou.ts` NOMMAIT
   * une fonction `deciderDemarrageMonoInstance` qui n'existait nulle part. Les
   * quatre états étaient déclarés et AUCUN n'était tranché.
   *
   * ⚠️ **CE TÉMOIN CHIFFRE, IL NE COLORE PAS.** Il compte ce que `verrou.ts`
   *    exporte réellement, et l'écart entre l'annonce de l'ADR et ce que le dépôt
   *    tient reste un NOMBRE. Le compte a changé le jour où l'arbitre a atterri —
   *    c'est ce qu'on voulait —, et la liste des noms est affirmée plutôt que la
   *    seule longueur : trois fonctions dont ce ne serait pas les bonnes
   *    passeraient un compte, jamais une liste.
   *
   * ⚠️ **LE COMPTE SEUL NE PROUVE PAS LA COUTURE.** Une fonction exportée peut
   *    n'être appelée par personne — c'est le défaut même du lot 1c.
   *    `core/instance/couture-adr-0018.temoin.spec.ts` mesure le BRANCHEMENT, et
   *    fabrique le débranchement pour prouver qu'il sait le voir.
   */
  it("✅ chiffre ce que la moitié « verrou » de l'ADR 0018 tient réellement", () => {
    const source = readFileSync(CHEMIN_VERROU, "utf8");

    // DÉRIVÉ du fichier, jamais recopié : on compte les fonctions qu'il exporte.
    const fonctionsExportees = [...source.matchAll(/^export function ([A-Za-z0-9_]+)/gmu)].map(
      (capture) => capture[1] ?? "",
    );
    // La fonction que sa propre prose nomme comme l'arbitre du démarrage.
    const nommeeParLaProse = source.includes("deciderDemarrageMonoInstance");
    const etatsDeclares = ETATS_DU_VERROU.length;

    console.log(
      `[garde ADR 0018 · verrou] ${String(source.length)} octet(s) de source lus, ` +
        `${String(etatsDeclares)} état(s) de verrou déclaré(s), ` +
        `${String(fonctionsExportees.length)} fonction(s) exportée(s) : ` +
        `${fonctionsExportees.join(", ") || "aucune"} — ` +
        `« deciderDemarrageMonoInstance » nommée par la prose : ${String(nommeeParLaProse)}`,
    );

    // Plancher-témoin : le fichier a bien été LU. Une garde qui lit zéro octet
    // est verte pour la pire des raisons.
    expect(source.length).toBeGreaterThan(1000);
    expect(etatsDeclares, "les quatre états du § 20 sont bien déclarés").toBe(4);
    expect(nommeeParLaProse, "la prose la nomme").toBe(true);
    // LE FAIT MESURÉ : l'arbitre que la prose nomme est désormais exporté, et
    // il n'est pas seul — la frappe de l'identité et la dérivation du statut de
    // healthcheck vivent au même endroit, par choix (ADR 0018).
    expect([...fonctionsExportees].sort(), "les fonctions réellement exportées").toEqual([
      "deciderDemarrageMonoInstance",
      "decisionsPourTousLesEtatsDuVerrou",
      "frapperInstance",
      "statutHealthcheckPourVerrou",
    ]);
  });

  /**
   * ✅ **L'ATTENTE DE L'ADR 0018 — TENUE DEPUIS LE LOT 1d.**
   *
   * « AU DÉMARRAGE — un verrou EXCLUSIF est pris avant de servir quoi que ce
   * soit. S'il est déjà tenu, le conteneur NE DÉMARRE PAS. » Une décision qui
   * n'est prise par aucune fonction n'est prise par personne : il fallait un
   * arbitre PUR, éprouvable sur les quatre états sans monter de base, comme
   * `core/vault/demarrage.ts` en a un pour le coffre.
   *
   * ⚠️ CE TÉMOIN ÉTAIT UN `it.fails`, ET IL A BASCULÉ EN `it()`. C'était sa
   *    vocation : « il ROUGIRA le jour où l'arbitre existera ». La dette nommée
   *    qu'il portait est soldée.
   */
  it("✅ les quatre états du verrou sont tranchés par une fonction du dépôt", () => {
    const source = readFileSync(CHEMIN_VERROU, "utf8");
    const fonctionsExportees = [...source.matchAll(/^export function ([A-Za-z0-9_]+)/gmu)].length;

    console.log(
      `[garde ADR 0018 · attente] ${String(ETATS_DU_VERROU.length)} état(s) à trancher, ` +
        `${String(fonctionsExportees)} fonction(s) exportée(s) pour le faire`,
    );

    // Le FAIT : les états sont bien déclarés. Vrai dans les deux régimes.
    expect(ETATS_DU_VERROU.length).toBe(4);
    // ⚖️ L'ATTENTE : « le conteneur NE DÉMARRE PAS » doit être une fonction,
    //    pas une phrase.
    expect(fonctionsExportees, "un arbitre de démarrage doit exister").toBeGreaterThan(0);
  });

  /**
   * ✅ SAIT DIRE OUI — le même comptage, appliqué à un module qui, lui, TRANCHE.
   *
   * `ops/mono-instance.ts` est la moitié « constater » de la même ADR : il
   * exporte des fonctions, et le comptage les voit. Sans ce jumeau, le témoin
   * précédent serait vert pour une expression régulière qui ne trouve jamais
   * rien — c'est-à-dire pour la pire des raisons.
   */
  it("SAIT DIRE OUI — le même comptage voit les fonctions de la moitié « constater »", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../../ops/mono-instance.ts", import.meta.url)),
      "utf8",
    );
    const fonctionsExportees = [...source.matchAll(/^export function ([A-Za-z0-9_]+)/gmu)].map(
      (capture) => capture[1] ?? "",
    );

    console.log(
      `[garde ADR 0018 · jumeau] ${String(source.length)} octet(s) lus, ` +
        `${String(fonctionsExportees.length)} fonction(s) exportée(s) : ` +
        `${fonctionsExportees.join(", ")}`,
    );

    expect(source.length).toBeGreaterThan(1000);
    expect(fonctionsExportees.length, "l'instrument de comptage SAIT trouver").toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  F · LE JOURNAL INJOIGNABLE APRÈS L'EFFET, LE CORPS AYANT LEVÉ
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — la double panne : le corps lève ET le journal est injoignable", () => {
  /**
   * ✅ LA CAUSE PREMIÈRE NE DISPARAÎT PAS.
   *
   * `avecJournal` protège son `ecrire(null)` d'un second `try` et rend un
   * `AggregateError` dont `errors[0]` est la panne APPLICATIVE. C'est le pire
   * moment pour perdre la cause première — celui où deux composants tombent
   * ensemble — et ce témoin le vérifie sur la CHAÎNE COMPLÈTE plutôt que sur
   * `avecJournal` seul : c'est là que l'effet extérieur est réellement parti.
   *
   * La question adverse : que reste-t-il de traçable quand le journal ne peut
   * rien écrire ? Réponse mesurée : ZÉRO ligne, l'effet parti, et la cause
   * première encore lisible par l'appelant. La borne d'`orchestrateur.ts` —
   * « au-delà de l'étape 14, l'invariant est borné par la disponibilité du
   * journal » — est donc exacte, et elle est chiffrée ici.
   */
  it("l'effet est parti, ZÉRO ligne existe, et la panne applicative reste lisible", async () => {
    let tentatives = 0;

    /** Un store qui refuse toute écriture — la panne du § 11. */
    class StoreEnPanne extends JournalMemoire {
      public override ajouter(): Promise<never> {
        tentatives += 1;
        return Promise.reject(new Error("journal d'épreuve : store injoignable"));
      }
    }

    const store = new StoreEnPanne();
    const harnais = fabriquerHarnais({
      store,
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      // L'adaptateur envoie, puis rend une charge hors contrat : le corps lève.
      charge: {
        items: [{ id: "a" }],
        failedSources: [],
        sourceIncomplete: "false" as unknown as boolean,
        recordIds: [],
      },
    });

    const issue = await issueDe(
      harnais,
      appelTemoin({ nomComplet: "temoin.envoyer", idempotencyKey: "cle-double-panne" }),
    );

    const agregee = issue.genre === "levée" && issue.erreur instanceof AggregateError;
    const causes = agregee && issue.genre === "levée" ? issue.erreur.errors.length : 0;

    console.log(
      `[garde double panne] ${String(tentatives)} tentative(s) d'écriture mesurée(s) — ` +
        `effets extérieurs RÉELS : ${String(harnais.effets())}, ` +
        `lignes écrites : ${String(store.toutes().length)}, ` +
        `erreur agrégée : ${String(agregee)}, ${String(causes)} cause(s) transportée(s)`,
    );

    expect(harnais.effets(), "l'envoi est bien PARTI").toBe(1);
    expect(tentatives, "le socle a bien TENTÉ d'écrire").toBe(1);
    expect(store.toutes().length, "et il n'a rien pu écrire : la borne est réelle").toBe(0);
    expect(issue.genre).toBe("levée");
    // ⚖️ L'ATTENTE : l'appelant doit TOUJOURS pouvoir remonter à la panne
    //    applicative. Les DEUX causes voyagent, aucune ne masque l'autre.
    expect(agregee, "la double panne est agrégée, pas écrasée").toBe(true);
    expect(causes, "la panne applicative ET l'indisponibilité du journal").toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  G · LE COFFRE QUI DISPARAÎT EN PLEIN APPEL
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 23 — un verrouillage d'urgence PENDANT l'appel arrête-t-il l'envoi ?", () => {
  /**
   * ⚠️ BORNE MESURÉE, ÉCRITE AVEC LA MESURE — ET ELLE N'EST ÉCRITE NULLE PART
   *    AILLEURS.
   *
   * Le § 23 pose qu'« un coffre verrouillé ne sert aucun appel d'outil ». Le
   * socle le tient à l'ÉTAPE 0, une fois : `EtatDuCoffre.refusDAppelDOutil` est
   * consulté au début de la chaîne, et plus jamais. Un verrouillage d'urgence
   * déclenché pendant qu'un appel est en vol ne l'arrête donc pas — l'envoi part.
   *
   * Ce témoin ne dit pas que c'est un défaut : arrêter un appel en vol suppose
   * un point d'annulation que le § 11 ne décrit pas, et le coffre ne sert qu'à
   * DÉCHIFFRER, ce dont l'appel n'a plus besoin passé l'étape 8. Il CHIFFRE la
   * portée réelle du verrouillage d'urgence — combien de fois le coffre est
   * consulté par appel — pour que « verrouiller le coffre arrête tout » ne soit
   * jamais lu comme une garantie sur les appels en cours.
   */
  it("chiffre combien de fois le coffre est consulté, et ce qu'un verrouillage en vol arrête", async () => {
    let consultations = 0;
    let verrouille = false;

    const coffreQuiSeVerrouille: EtatDuCoffre = {
      refusDAppelDOutil() {
        consultations += 1;
        if (!verrouille) {
          // Le verrouillage d'urgence tombe JUSTE APRÈS l'étape 0 — le pire
          // instant, celui où l'appel a franchi la seule porte qui le regarde.
          verrouille = true;
          return null;
        }
        return {
          etat: "verrouillé",
          message: "Coffre verrouillé (§ 23) : aucun appel d'outil n'est servi.",
        };
      },
    };

    const harnais = fabriquerHarnais({
      coffre: coffreQuiSeVerrouille,
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
    });

    const issue = await issueDe(harnais, appelTemoin({ nomComplet: "temoin.envoyer" }));
    const ligne = harnais.store.toutes()[0];

    console.log(
      `[garde coffre en vol] ${String(consultations)} consultation(s) du coffre pour UN appel ` +
        `complet — effets extérieurs RÉELS : ${String(harnais.effets())}, ` +
        `issue : ${issue.genre}, externalEffect : ${String(ligne?.externalEffect)}`,
    );

    // LE FAIT : une seule porte, à l'étape 0.
    expect(consultations, "le coffre n'est consulté qu'UNE fois par appel").toBe(1);
    // ET SA CONSÉQUENCE : le verrouillage d'urgence ne rattrape pas un appel en
    // vol. La ligne, elle, ne ment pas — elle accuse l'envoi.
    expect(harnais.effets(), "l'envoi est parti malgré le verrouillage").toBe(1);
    expect(ligne?.externalEffect, "et le journal le dit").toBe(true);
  });

  /**
   * ✅ SAIT DIRE NON — le MÊME coffre, verrouillé DÈS l'étape 0, arrête tout.
   * Sans ce jumeau, le témoin précédent serait vert pour un port de coffre que
   * l'orchestrateur ne consulterait jamais.
   */
  it("SAIT DIRE NON — verrouillé dès l'étape 0, rien ne part", async () => {
    let consultations = 0;
    const coffreFerme: EtatDuCoffre = {
      refusDAppelDOutil() {
        consultations += 1;
        return {
          etat: "verrouillé",
          message: "Coffre verrouillé (§ 23) : aucun appel d'outil n'est servi.",
        };
      },
    };

    const harnais = fabriquerHarnais({
      coffre: coffreFerme,
      outils: [outilEnvoi()],
      niveau: NIVEAU_LIBRE,
    });

    const issue = await issueDe(harnais, appelTemoin({ nomComplet: "temoin.envoyer" }));
    const ligne = harnais.store.toutes()[0];

    console.log(
      `[garde coffre fermé d'emblée] ${String(consultations)} consultation(s) — ` +
        `effets : ${String(harnais.effets())}, stepDenied : ${String(ligne?.stepDenied)}, ` +
        `issue : ${issue.genre}`,
    );

    expect(consultations).toBe(1);
    expect(harnais.effets(), "FERMÉ : rien n'est parti").toBe(0);
    expect(ligne?.stepDenied, "l'étape 0 du § 23").toBe(0);
  });
});

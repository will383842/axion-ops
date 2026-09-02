/**
 * `core/epreuve/verrous-du-paragraphe-20.temoin.spec.ts` — LES TROIS VERROUS DU
 * § 20 REJOUÉS, PUIS ATTAQUÉS AILLEURS.
 *
 * ═══ CE QUE CE FICHIER FAIT, ET DANS QUEL ORDRE ═══
 *
 * Le lot 1c PRÉTEND avoir refermé les deux voies par lesquelles l'épreuve du
 * lot 1b désarmait la garde d'exfiltration, et en avoir élargi une troisième.
 * Ce fichier ne relit pas ces prétentions : il les ÉPROUVE, une par une, par un
 * test qui échouerait si elles n'étaient pas tenues.
 *
 *  · ① renouveler le `sessionId` entre la lecture et l'appel suivant (ADR 0014) ;
 *  · ② déclarer `idFields: ["requete"]` sur un champ de texte libre (ADR 0015) ;
 *  · ③ employer un nom de gouvernance qui échappe à `FAMILLES_GOUVERNANCE`
 *    (ADR 0016).
 *
 * PUIS il cherche du NOUVEAU, et il en trouve.
 *
 * ═══ LA DIFFÉRENCE DE MÉTHODE AVEC L'ÉPREUVE DU LOT 1b ═══
 *
 * L'épreuve du lot 1b posait des `ContexteProvenance` À LA MAIN et appelait
 * `etape11Provenance()` directement. C'est ce qui l'a rendue juste sur l'étape
 * et AVEUGLE à la question qui compte : *qui remplit ce contexte, et avec
 * quoi ?* Les deux ADR du lot 1c se lisent d'ailleurs comme des réponses à
 * cette question-là.
 *
 * **Ce fichier-ci attaque par le HAUT : `orchestrerAppel()`, la chaîne
 * complète du § 11.** Un correctif écrit dans `core/adapter-kit` ou dans
 * `core/registry` et jamais branché dans `core/chaine` est vert pour ses
 * propres gardes et n'arrête personne ; seul l'appel de bout en bout le dit.
 * C'est exactement ce que les sections A2 et A3 mesurent.
 *
 * ═══ L'IDIOME, ET LA DISCIPLINE QU'IL IMPOSE ═══
 *
 * Chaque témoin marqué 🔴 porte l'assertion **CORRECTE** — celle du § 20 —
 * sous `it.fails`. Il est vert AUJOURD'HUI parce qu'elle échoue, et il ROUGIRA
 * le jour du correctif, forçant celui qui corrige à le repasser en `it()`. Rien
 * ici n'attend la valeur fausse, donc rien ne verrouille un défaut.
 *
 * ⚠️ CONSÉQUENCE STRICTE : un `it.fails` est vert dès qu'UNE de ses assertions
 *    échoue. Les assertions de FAIT y sont donc limitées à celles qui resteront
 *    VRAIES après le correctif — « la session a bien été marquée », « le schéma
 *    déclare une propriété ». Tout ce qui changerait avec le correctif est
 *    descendu dans le `console.info`, où il informe sans décider.
 *
 * Chaque famille est APPARIÉE à un témoin de CAPACITÉ en `it()` ordinaire, qui
 * prouve que l'instrument SAIT DIRE OUI et SAIT DIRE NON. Sans lui, un
 * `it.fails` vert ne distinguerait pas « le socle a ce défaut » de « le harnais
 * ne s'exécute pas ».
 *
 * Chaque `it` ANNONCE COMBIEN D'ÉLÉMENTS IL A MESURÉS, et le compte est
 * incrémenté DANS la boucle ou lu sur le sujet — jamais rendu de confiance
 * depuis la longueur d'un tableau écrit à la main.
 *
 * ═══ DÉPÔT PUBLIC ═══
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUNE MIGRATION, AUCUN IDENTIFIANT
 * D'INFRASTRUCTURE. Les seuls hôtes cités sont en `stub.invalid` et
 * `exemple.invalid` (RFC 2606). Les deux clés du harnais sont fabriquées pour
 * ce dossier et nommées comme telles.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { Habilitations, OpsScope, PolicyLevel } from "../types.js";
import { Journal, JournalMemoire, type LigneAudit } from "../audit/index.js";
import { HorlogeFigee, SCELLEUR_TEMOIN } from "../audit/fixtures.js";
import { lireClesDAutorisation } from "../adapter-kit/autorisation.js";
import { analyserChampsDeclares, occurrencesDuSchema } from "../adapter-kit/champs-declares.js";
import { analyserFermeture, chercherChampsDAutorisation } from "../adapter-kit/fermeture.js";
import { octetsCanoniques, versValeurJson, type ObjetJson } from "../adapter-kit/json.js";
import { VERSION_MANIFESTE, type Manifeste } from "../adapter-kit/manifest.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import { PROFILE_NAMES, SCEAU_PROFILS, type ProfileName } from "../profiles/index.js";
import { enregistrerAdaptateur } from "../registry/enregistrer.js";
import { empreinteDuManifesteRecu } from "../registry/lock.js";
import type { VerrouAdaptateurs } from "../registry/types.js";
import type { NiveauApplique } from "../policy/index.js";
// ADR 0020 — la section B2 CONFRONTE l'objet reçu par l'adaptateur à l'empreinte
// que le socle est censé y avoir posée. Elle appelle donc la même fonction que
// l'orchestrateur, jamais un second SHA-256 écrit dans ce fichier.
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
import type {
  ChargeAdaptateur,
  ExecutionEtablie,
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
import {
  FAMILLES_GOUVERNANCE,
  IndexProvenanceMemoire,
  analyserArgumentsDuSchema,
  etape11Provenance,
  familleDeGouvernance,
} from "../chaine/etape-11-provenance.js";
import { executerEtape14 } from "../chaine/etape-14-execution.js";
import {
  INTENTION_NON_ARMEE,
  empreintesParDefaut,
  identiteStdio,
  orchestrerAppel,
  type AppelEntrant,
  // ADR 0020 — ce qu'un constructeur de contexte a le droit de fabriquer.
  // `idempotencyRef` n'en fait PAS partie : l'orchestrateur le pose lui-même.
  type ContexteSansEmpreinte,
  type DependancesOrchestrateur,
  type IdentiteAppelante,
  type ReglagesDeLOutil,
  type ResultatAppel,
  type Transport,
} from "../chaine/orchestrateur.js";
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { ToolContext } from "../types.js";
import { correspondance } from "./outils.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR
// ═════════════════════════════════════════════════════════════════════════════

/** ⚠️ AUCUN SECRET RÉEL. Chaîne fabriquée pour ce fichier. */
const CLE_CURSEUR_D_EPREUVE = "cle-curseur-de-l-epreuve-du-para-20-non-secrete";

const INSTANT = new Date("2026-08-31T10:00:00.000Z");
const PROFIL_TEMOIN: ProfileName = "courrier";
const HABILITATIONS: Habilitations = { peutVoirAppels: false };

/** Le domaine où la session LIT du `personal`. C'est lui qui marque. */
const DOMAINE_LU = "boite-courrier";
/** Le domaine VERS lequel l'attaquant veut faire sortir. */
const DOMAINE_TIERS = "annuaire-externe";

/**
 * Le contenu que l'attaquant veut faire sortir. AUCUNE DONNÉE RÉELLE : une
 * phrase fabriquée pour ce dossier.
 */
const CONTENU_LU = "Le rendez-vous du 12 est reporté ; le dossier est chez le notaire.";

const SCHEMA_VIDE: ObjetJson = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

/** Un schéma d'objet fermé qui déclare exactement les propriétés reçues. */
function schemaFerme(proprietes: Record<string, ObjetJson>): ObjetJson {
  return { type: "object", properties: proprietes, additionalProperties: false };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE HARNAIS — la chaîne complète du § 11, deux domaines, un adaptateur espion
// ═════════════════════════════════════════════════════════════════════════════

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

/** Le dépôt ATOMIQUE — ce que `(tool, key)` en clé primaire donne (§ 12). */
class DepotIdemAtomique implements DepotIdempotence {
  readonly lignes = new Map<string, LigneIdempotence>();

  private static cle(tool: string, key: string): string {
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

function outilDuCatalogue(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  const base: OutilDuCatalogue = {
    name: "courrier.lire",
    version: "1.0.0",
    description: "Outil témoin de l'épreuve du § 20. Aucun métier.",
    inputSchema: SCHEMA_VIDE,
    outputSchema: SCHEMA_VIDE,
    profiles: [PROFIL_TEMOIN],
    enabled: true,
    retireDeLaListe: false,
    adapterId: DOMAINE_LU,
    adapterVersion: "1.0.0",
    idempotency: "n/a",
    limit: null,
    warnAt: null,
    effect: "read",
    dataClass: "personal",
    pagination: "none",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 8192,
    idFields: [],
    // ADR 0016 — la valeur neutre PORTE UN NOM : « cet outil n'en déclare aucun ».
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
  };
  return { ...base, ...surcharge };
}

/** L'outil du DOMAINE TIERS — celui vers lequel on essaie de faire sortir. */
function outilDuTiers(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return outilDuCatalogue({
    name: "annuaire.chercher",
    adapterId: DOMAINE_TIERS,
    dataClass: "none",
    ...surcharge,
  });
}

/** Ce que l'ADAPTATEUR a réellement reçu — c'est ça, la sortie de contenu. */
interface AppelRecuParLAdaptateur {
  readonly outil: string;
  readonly contexte: ToolContext<ProfileName>;
  readonly entree: unknown;
}

interface Reglages {
  readonly outils?: readonly OutilDuCatalogue[];
  readonly identite?: IdentiteAppelante;
  readonly index?: IndexProvenanceMemoire;
  readonly transport?: Transport;
  readonly niveau?: NiveauApplique;
  readonly reglagesOutil?: ReglagesDeLOutil;
  readonly scopes?: readonly OpsScope[];
}

interface Harnais {
  readonly deps: DependancesOrchestrateur;
  readonly identite: IdentiteAppelante;
  readonly index: IndexProvenanceMemoire;
  readonly store: JournalMemoire;
  /** Tout ce que l'adaptateur a reçu, dans l'ordre. L'effet extérieur. */
  readonly recus: AppelRecuParLAdaptateur[];
  readonly idempotence: DepotIdemAtomique;
}

function fabriquerSocle(reglages: Reglages = {}): Harnais {
  const store = new JournalMemoire();
  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee(INSTANT.getTime()));
  const index = reglages.index ?? new IndexProvenanceMemoire({ maintenant: () => INSTANT });
  const idempotence = new DepotIdemAtomique();
  const outils = reglages.outils ?? [outilDuCatalogue(), outilDuTiers()];
  const recus: AppelRecuParLAdaptateur[] = [];

  // ⚠️ L'IDENTITÉ PAR DÉFAUT PASSE PAR `identiteStdio()`, ET C'EST LE POINT.
  //    C'est le SEUL chemin livré par lequel une session est frappée
  //    aujourd'hui (ADR 0014). Un harnais qui écrirait une session à la main
  //    éprouverait une chose que le socle n'établit pas.
  const identite =
    reglages.identite ??
    identiteStdio({
      requestId: "req-epreuve-para-20",
      deadline: new Date(INSTANT.getTime() + 30_000),
      habilitations: HABILITATIONS,
      ...(reglages.scopes === undefined ? {} : { scopes: reglages.scopes }),
    });

  const deps: DependancesOrchestrateur = {
    transport: reglages.transport ?? "stdio",
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
        // Aucune confirmation humaine n'existe dans cette épreuve : c'est
        // précisément ce que l'attaquant ne peut pas fabriquer.
        return Promise.resolve("invalide");
      },
    },
    calculArgHash: correspondance,
    index,
    signataireCurseur: creerSignataireCurseur({
      lireCleCurseur: () => Promise.resolve(CLE_CURSEUR_D_EPREUVE),
    }),
    correspondanceScopes: correspondanceCanonique,
    depotQuota: new DepotQuotaEnMemoire(),
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
    // ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE : ce harnais NE VALIDE PAS l'entrée.
    //    `validerEntree` est un port ; le socle ne porte aucun validateur, c'est
    //    l'adaptateur qui fournit le sien. Ce que ce fichier mesure est donc la
    //    DÉRIVATION DU SOCLE — ce que le § 20 voit d'un schéma —, jamais la
    //    question « ce payload passerait-il chez cet adaptateur-là ».
    validerEntree(_outil, input): ResultatValidation<unknown> {
      return { ok: true, valeur: input };
    },
    empreinteFiltres(outil, valide): Promise<string> {
      return correspondance.calculer(`${outil.name}#filtres`, valide);
    },
    fabriqueMasquage(): Masquage {
      return MASQUAGE_NEUTRE;
    },
    construireContexteOutil(identiteRecue, _appel, profil, niveau): ContexteSansEmpreinte {
      return {
        principal: identiteRecue.principal,
        sessionId: identiteRecue.sessionId,
        scopes: identiteRecue.scopes,
        policyLevel: niveau,
        profile: profil,
        // ⚠️ CE HARNAIS NE PEUT PLUS POSER L'EMPREINTE, ET C'EST LA COUTURE —
        //    ADR 0020. `ConstruireContexteOutil` rend un `ContexteSansEmpreinte` :
        //    `idempotencyRef` est posé par l'ORCHESTRATEUR, en production, par
        //    `empreinteDeCleDIdempotence(appel.idempotencyKey)`. Un harnais qui
        //    voudrait y remettre la clé brute ne compile pas ; s'il l'ajoutait
        //    comme propriété SURNUMÉRAIRE, la reconstruction champ par champ de
        //    l'orchestrateur la laisserait dehors. La section B2 mesure ce que ce
        //    chemin transporte VRAIMENT, sur l'objet reçu par l'adaptateur.
        requestId: identiteRecue.requestId,
        deadline: identiteRecue.deadline,
        habilitations: identiteRecue.habilitations,
      };
    },
    appelAdaptateur(contexte, entree): Promise<ChargeAdaptateur> {
      // ⚠️ C'EST ICI, ET NULLE PART AILLEURS, QUE LE CONTENU SORT DU SOCLE.
      //    Cet espion EST la mesure de l'exfiltration : ce que l'adaptateur
      //    d'un domaine tiers a reçu, il l'a.
      recus.push({ outil: contexte.requestId, contexte, entree });
      return Promise.resolve({
        items: [{ id: "resultat-fabrique" }],
        failedSources: [],
        sourceIncomplete: false,
        recordIds: [],
      });
    },
    empreintesDuResultat(execution: ExecutionEtablie): readonly string[] {
      return empreintesParDefaut(execution);
    },

    ttlIdempotenceMs: 60_000,
    maintenant: () => INSTANT,
  };

  return { deps, identite, index, store, recus, idempotence };
}

function appel(surcharge: Partial<AppelEntrant> = {}): AppelEntrant {
  return {
    nomComplet: "courrier.lire",
    input: {},
    idempotencyKey: null,
    curseur: null,
    jetonDeConfirmation: null,
    ...surcharge,
  };
}

/**
 * Un appel de bout en bout, avec l'identité DONNÉE — c'est le seul paramètre
 * par lequel une attaque de session peut s'exprimer.
 */
function appeler(
  harnais: Harnais,
  entrant: AppelEntrant,
  identite: IdentiteAppelante = harnais.identite,
): Promise<ResultatAppel> {
  return orchestrerAppel(identite, entrant, harnais.deps);
}

/** L'issue d'un appel, réduite à ce que l'attaquant en retire. */
function issue(resultat: ResultatAppel): "servi" | "refusé" {
  return resultat.refus === null ? "servi" : "refusé";
}

/** Les lignes écrites par le journal du harnais. */
function lignes(harnais: Harnais): readonly LigneAudit[] {
  return harnais.store.toutes();
}

/**
 * CETTE ENTRÉE D'ADAPTATEUR PORTE-T-ELLE LE CONTENU LU ?
 *
 * ⚠️ ELLE CHERCHE LA VALEUR N'IMPORTE OÙ DANS LA CHARGE, à toute profondeur, et
 *    non sous un nom de champ convenu. Une mesure qui n'interrogerait que
 *    `entree.requete` serait juste sur les témoins d'aujourd'hui et muette sur
 *    le premier témoin qui logerait la phrase ailleurs — c'est-à-dire aveugle
 *    exactement au cas qu'on cherche.
 */
function porteLeContenu(entree: unknown): boolean {
  return JSON.stringify(entree ?? null)?.includes(CONTENU_LU) === true;
}

// ═════════════════════════════════════════════════════════════════════════════
//  A1 · VOIE ① — RENOUVELER LE `sessionId`. ✅ FERMÉE, ET C'EST MESURÉ.
// ═════════════════════════════════════════════════════════════════════════════

describe("A1 · voie ① — renouveler sa session entre la lecture et l'appel suivant", () => {
  /**
   * ✅ LE REJEU EXACT DE L'ATTAQUE DU LOT 1b, MAIS PAR LA CHAÎNE COMPLÈTE.
   *
   * L'épreuve d'origine posait deux `ContexteProvenance` avec deux chaînes
   * différentes et concluait « autorisé ». Ici l'attaquant n'a plus que ce qu'un
   * appelant réel possède : la fonction d'identité de son transport. Le geste
   * « je change de session » n'a plus de forme dans cette signature.
   *
   * ⚠️ CE TEST ÉCHOUERAIT SI LA VOIE N'ÉTAIT PAS FERMÉE. La branche
   *    « stdio, seconde identité du même démon » est exactement le geste
   *    désarmant : si `identiteStdio()` frappait une session par appel, ou si
   *    elle en reprenait une du paramètre, elle rendrait « servi » et cette
   *    ligne rougirait.
   */
  it("SAIT DIRE NON puis OUI : cinq branches confrontées, une seule sert", async () => {
    const harnais = fabriquerSocle({
      outils: [
        outilDuCatalogue(),
        // L'outil du tiers porte le PIRE CAS du § 20 : un argument libre ET un
        // argument de gouvernance reconnu par le nom, vers un AUTRE domaine.
        // C'est la branche que le § 20 dit inconditionnelle.
        outilDuTiers({
          inputSchema: schemaFerme({
            requete: { type: "string" },
            to: { type: "string" },
          }),
        }),
      ],
    });

    // ── 1 · la session LIT du `personal`. C'est la CHAÎNE qui marque. ────────
    const lecture = await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const etatApresLecture = harnais.index.etat();

    // ── 2 · les cinq branches ───────────────────────────────────────────────
    const memeIdentite = issue(await appeler(harnais, appel({ nomComplet: "annuaire.chercher" })));

    // Le geste de l'attaque : redemander une identité au même démon.
    const secondeIdentiteDuMemeDemon = issue(
      await appeler(
        harnais,
        appel({ nomComplet: "annuaire.chercher" }),
        identiteStdio({
          requestId: "req-seconde-identite",
          deadline: new Date(INSTANT.getTime() + 30_000),
          habilitations: HABILITATIONS,
        }),
      ),
    );

    // Une TROISIÈME, pour que « deux fois la même valeur » ne soit pas une
    // coïncidence de deux appels rapprochés.
    const troisiemeIdentiteDuMemeDemon = issue(
      await appeler(
        harnais,
        appel({ nomComplet: "annuaire.chercher" }),
        identiteStdio({
          requestId: "req-troisieme-identite",
          deadline: new Date(INSTANT.getTime() + 60_000),
          habilitations: HABILITATIONS,
        }),
      ),
    );

    // Le même appel vers le MÊME domaine que celui qui a marqué : le § 20 ne
    // parle que d'un AUTRE domaine, et il doit passer. Sans cette branche, les
    // refus ci-dessus seraient verts pour une étape 11 qui refuserait tout.
    const versLeMemeDomaine = issue(
      await appeler(harnais, appel({ nomComplet: "courrier.lire" }), harnais.identite),
    );

    // ⚠️ LA BORNE, ÉCRITE AVEC LA MESURE, ET ELLE EST ASSUMÉE PAR L'ADR 0014 :
    //    une session VRAIMENT neuve — ce qu'un NOUVEL OCTROI donne, au prix d'un
    //    consentement humain — passe. Elle est fabriquée ici par la fabrique
    //    NOMMÉE des témoins, jamais par une conversion forcée : c'est
    //    l'instrument qui prouve que la garde sait dire oui, pas un chemin
    //    qu'un transport aurait le droit d'emprunter.
    const sessionVraimentNeuve = issue(
      await appeler(harnais, appel({ nomComplet: "annuaire.chercher" }), {
        ...harnais.identite,
        sessionId: sessionIdDeTemoin(),
      }),
    );

    const branches = [
      ["même identité", memeIdentite],
      ["stdio — 2ᵉ identité du même démon", secondeIdentiteDuMemeDemon],
      ["stdio — 3ᵉ identité du même démon", troisiemeIdentiteDuMemeDemon],
      ["même domaine que la lecture", versLeMemeDomaine],
      ["session VRAIMENT neuve (borne assumée)", sessionVraimentNeuve],
    ] as const;

    console.info(
      `[A1 · voie ①] ${String(branches.length)} branche(s) confrontée(s) · ` +
        `${String(etatApresLecture.sessions)} session(s) marquée(s) · ` +
        `${String(etatApresLecture.extraits)} extrait(s) indexé(s) · ` +
        `indéterminé : ${String(etatApresLecture.indetermine)}\n` +
        branches.map(([nom, verdict]) => `        · ${nom} : ${verdict}`).join("\n"),
    );

    // L'index est PEUPLÉ : sans ce compte, un « refusé » serait indiscernable
    // d'un socle qui refuse tout, et un « servi » d'un index vide.
    expect(issue(lecture), "la lecture qui marque doit être SERVIE").toBe("servi");
    expect(etatApresLecture.sessions, "une session marquée, pas zéro").toBe(1);
    expect(etatApresLecture.extraits).toBeGreaterThan(0);
    expect(etatApresLecture.indetermine).toBe(false);

    expect(memeIdentite, "sous la session de lecture, la branche « JAMAIS » mord").toBe("refusé");
    expect(
      secondeIdentiteDuMemeDemon,
      "✅ ADR 0014 — redemander une identité au même démon ne blanchit plus",
    ).toBe("refusé");
    expect(troisiemeIdentiteDuMemeDemon, "✅ ADR 0014 — et ce n'est pas une coïncidence").toBe(
      "refusé",
    );
    expect(versLeMemeDomaine, "le § 20 ne parle que d'un AUTRE domaine : celui-ci passe").toBe(
      "servi",
    );
    expect(sessionVraimentNeuve, "borne assumée : une session neuve coûte un geste humain").toBe(
      "servi",
    );
  });

  /**
   * ✅ LA GARDE DE VALEUR, ÉPROUVÉE PLUTÔT QUE LUE.
   *
   * `identiteStdio()` n'ayant plus de paramètre de session, la seule chose qui
   * reste à vérifier est que la valeur qu'elle impose EST BIEN la même d'un
   * appel à l'autre, et qu'elle a la forme que `core/audit/contenu.ts` accepte —
   * un `sessionId` lisible serait refusé à l'écriture du journal (§ 31), et la
   * ligne d'audit se perdrait pour un appel parfaitement servi.
   */
  it("la session imposée est STABLE dans le processus et a la forme d'une empreinte", () => {
    const identites = [1, 2, 3, 4, 5].map((n) =>
      identiteStdio({
        requestId: `req-${String(n)}`,
        deadline: new Date(INSTANT.getTime() + 1_000 * n),
        habilitations: HABILITATIONS,
      }),
    );

    const distinctes = new Set(identites.map((identite) => identite.sessionId));
    const conformes = identites.filter((identite) =>
      /^[0-9a-f]{64}$/.test(identite.sessionId),
    ).length;

    console.info(
      `[A1 · stabilité] ${String(identites.length)} identité(s) frappée(s) · ` +
        `${String(distinctes.size)} session(s) DISTINCTE(s) · ` +
        `${String(conformes)} à la forme d'empreinte`,
    );

    expect(identites.length).toBe(5);
    expect(distinctes.size, "une seule session par exécution du démon").toBe(1);
    expect(conformes, "toutes à la forme d'empreinte").toBe(identites.length);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  A2 · VOIE ② — `idFields` SUR UN CHAMP DE TEXTE LIBRE. 🔴 ENCORE OUVERTE.
// ═════════════════════════════════════════════════════════════════════════════

describe("A2 · voie ② — `idFields` déclaré sur un champ de texte libre", () => {
  /** Le schéma de l'attaquant : un seul champ, du texte, et il le dit « identifiant ». */
  const SCHEMA_DE_L_ATTAQUANT = schemaFerme({ requete: { type: "string" } });

  /**
   * TÉMOIN DE CAPACITÉ — SANS LUI, LE TÉMOIN SUIVANT NE PROUVERAIT RIEN.
   *
   * Le MÊME schéma, le MÊME appel, la MÊME session marquée : seule la
   * déclaration `idFields` change. C'est ce qui distingue « la déclaration
   * désarme la garde » de « ce harnais ne déclenche jamais l'étape 11 ».
   */
  it("SAIT DIRE NON : le même champ, SANS la déclaration, fait refuser l'appel", async () => {
    const harnais = fabriquerSocle({
      outils: [
        outilDuCatalogue(),
        outilDuTiers({ inputSchema: SCHEMA_DE_L_ATTAQUANT, idFields: [] }),
      ],
    });

    await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const verdict = issue(
      await appeler(
        harnais,
        appel({ nomComplet: "annuaire.chercher", input: { requete: CONTENU_LU } }),
      ),
    );

    const analyse = analyserArgumentsDuSchema(SCHEMA_DE_L_ATTAQUANT, AUCUN_CHAMP_DE_GOUVERNANCE);
    console.info(
      `[A2 · capacité] ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) dérivé(s) · ` +
        `${String(harnais.index.etat().sessions)} session(s) marquée(s) · verdict : ${verdict}`,
    );

    expect(analyse.proprietesInspectees).toBe(1);
    expect(analyse.libres.map((champ) => champ.nom)).toEqual(["requete"]);
    expect(verdict, "sans déclaration, la garde du § 20 mord").toBe("refusé");
  });

  /**
   * ✅ **LE CONTOURNEMENT EST FERMÉ — ADR 0015, COUSU AU LOT 1d.**
   *
   * Ce témoin a été un `it.fails` BLOQUANT. Il l'était pour une raison précise :
   * l'ADR 0015 déclarait qu'« `idFields` n'exonère plus rien », et
   * `core/adapter-kit/champs-declares.ts` le tenait — pour SES appelants
   * seulement. `core/chaine/etape-11-provenance.ts`, lui, n'avait pas été
   * rebranché : la signature `analyserArgumentsDuSchema(inputSchema, idFields)`
   * acceptait encore la liste, le corps faisait encore
   * `if (identifiants.has(nom)) continue`, et `orchestrateur.ts` la lui passait
   * depuis `outil.idFields`. **Une décision écrite, testée, documentée — et non
   * cousue au chemin de production.**
   *
   * Le paramètre a disparu DE LA SIGNATURE, le `continue` du corps, et l'appel de
   * l'orchestrateur ne porte plus que deux arguments. La ligne de manifeste ne
   * retire donc plus rien.
   *
   * ⚠️ **CE TÉMOIN ANNONCE TROIS CHOSES, ET AUCUNE NE SUFFIT SEULE.** Un verdict
   *    « refusé » s'obtiendrait aussi en refusant pour une autre raison ; le
   *    compte `analyserArgumentsDuSchema.length` dit combien de paramètres
   *    OBLIGATOIRES la signature expose ; le champ `requete` retenu dans `libres`
   *    dit que la déclaration n'a rien retiré.
   *
   * 🔴 **LA BORNE DE L'ARITÉ A ÉTÉ MESURÉE, PAS SUPPOSÉE — ET LE PREMIER JET DE
   *    CE COMMENTAIRE ÉTAIT FAUX.** Il affirmait qu'un paramètre facultatif
   *    « ferait tomber ce nombre à 1 ». L'expérience a été faite, en reposant
   *    `idFields: readonly string[] = []` en DERNIÈRE position : `length` est
   *    resté à **2**, et l'assertion est restée verte. `Function.length` compte
   *    les paramètres qui PRÉCÈDENT le premier paramètre à valeur par défaut.
   *
   *    L'arité ne ferme donc qu'un cas — le troisième paramètre OBLIGATOIRE — et
   *    c'est écrit ici pour que personne ne lise sa couleur comme une preuve. Le
   *    reste tient par deux autres choses : la garde de SOURCE ci-dessous, qui ne
   *    prouve que l'absence de la forme écrite, et le COMPORTEMENT — un paramètre
   *    rouvert ne nuit que s'il est RENSEIGNÉ, et le renseigner fait rougir ce
   *    témoin-ci ET la garde G1 de `lot1c-la-couture-manquante.temoin.spec.ts`
   *    (mesuré : 15 tests rouges sur trois fichiers).
   *
   * ⚠️ Les assertions de FAIT n'ont pas bougé, et c'est ce qui prouve que le décor
   *    est resté le même : la session est marquée, le schéma déclare une
   *    propriété, la déclaration nomme bien ce champ. Seule l'issue a changé.
   */
  it("✅ § 20 — une déclaration d'adaptateur ne retire PLUS un champ de la surveillance", async () => {
    const outil = outilDuTiers({
      inputSchema: SCHEMA_DE_L_ATTAQUANT,
      idFields: ["requete"],
      // ADR 0016 — la valeur neutre PORTE UN NOM : « cet outil n'en déclare aucun ».
      governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
    });
    const harnais = fabriquerSocle({ outils: [outilDuCatalogue(), outil] });

    await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const resultat = await appeler(
      harnais,
      appel({ nomComplet: "annuaire.chercher", input: { requete: CONTENU_LU } }),
    );

    const analyse = analyserArgumentsDuSchema(outil.inputSchema, AUCUN_CHAMP_DE_GOUVERNANCE);
    const sorties = harnais.recus.filter((recu) => porteLeContenu(recu.entree)).length;

    console.info(
      `[A2 · voie ②] ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) APRÈS déclaration · ` +
        `${String(outil.idFields.length)} idFields déclaré(s) · ` +
        `arité d'analyserArgumentsDuSchema : ${String(analyserArgumentsDuSchema.length)} · ` +
        `verdict : ${issue(resultat)} · ` +
        `contenu lu sorti chez le domaine tiers : ${String(sorties)}`,
    );

    // Faits qui survivront au correctif.
    expect(harnais.index.etat().sessions, "la session a bien été marquée").toBe(1);
    expect(analyse.proprietesInspectees, "le schéma déclare une propriété").toBe(1);
    expect(outil.idFields, "la déclaration nomme bien ce champ").toEqual(["requete"]);

    // L'ATTENTE DU § 20, celle qui échouait jusqu'au lot 1d.
    expect(sorties, "§ 20 — le contenu lu ne doit pas atteindre le domaine tiers").toBe(0);
    expect(
      issue(resultat),
      "§ 20 — l'étiquetage se décide côté socle, JAMAIS sur déclaration",
    ).toBe("refusé");
    // ⚠️ ET LA DÉCLARATION EST TOUJOURS SURVEILLÉE : le champ qu'elle nomme est
    //    retenu comme LIBRE, ce qui est exactement ce que l'exonération lui
    //    retirait.
    expect(
      analyse.libres.map((champ) => champ.nom),
      "le champ déclaré identifiant reste un argument libre",
    ).toEqual(["requete"]);
    // ⚠️ LE CLIQUET DE STRUCTURE, AVEC SA BORNE ÉCRITE : la signature n'expose
    //    que deux paramètres OBLIGATOIRES. Ce compte voit un TROISIÈME paramètre
    //    obligatoire ; il ne voit PAS un facultatif ajouté en dernier — mesuré,
    //    voir l'en-tête. C'est la garde de source ci-dessous qui prend le relais.
    expect(
      analyserArgumentsDuSchema.length,
      "ADR 0015 — aucun troisième paramètre OBLIGATOIRE",
    ).toBe(2);
  });

  /**
   * LE FILET DE SOURCE — CE QU'IL PROUVE, ET CE QU'IL NE PROUVE PAS.
   *
   * ⚠️ **UN `grep` NE PROUVE QUE L'ABSENCE DE LA FORME ÉCRITE.** Une exonération
   *    remise sous un autre nom (`champsExoneres`, `skipFields`) lui échappe
   *    entièrement. Ce qui porte la garantie est le comportement — le témoin
   *    ci-dessus et G1 de `lot1c-la-couture-manquante.temoin.spec.ts` —, et ce
   *    filet est écrit ici COMME TEL, pour que personne ne lise sa couleur comme
   *    une preuve.
   *
   * Il ferme le seul cas que ni l'arité ni le comportement ne voient : un
   * `idFields` REPOSÉ EN FACULTATIF et laissé non renseigné, qui ne changerait
   * aucun verdict aujourd'hui et attendrait le premier appelant qui le remplit.
   */
  it("ADR 0015 — la SOURCE de l'étape 11 ne nomme plus d'exonération par déclaration", () => {
    const chemin = fileURLToPath(new URL("../chaine/etape-11-provenance.ts", import.meta.url));
    const source = readFileSync(chemin, "utf8");

    // Le corps de la fonction, isolé de son bloc de commentaire : celui-ci
    // RACONTE le retrait, et le compter serait mesurer la prose au lieu du code.
    const debut = source.indexOf("export function analyserArgumentsDuSchema(");
    const signature = source.slice(debut, source.indexOf("{", debut));
    const corps = source
      .slice(debut)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*/g, "");

    const idFieldsDansLaSignature = signature.includes("idFields");
    const exonerationsDansLeCorps = [...corps.matchAll(/identifiants\s*\.\s*has\s*\(/g)].length;

    console.info(
      `[A2 · filet de source] signature lue : ${String(signature.length)} caractère(s) · ` +
        `corps lu : ${String(corps.length)} caractère(s) · ` +
        `« idFields » dans la signature : ${String(idFieldsDansLaSignature)} · ` +
        `${String(exonerationsDansLeCorps)} exonération(s) « identifiants.has( » dans le corps`,
    );

    // Planchers : une source qu'on n'aurait pas su découper rendrait deux
    // chaînes vides, et cette garde serait verte pour n'avoir rien lu.
    expect(debut, "la fonction doit être trouvée dans la source").toBeGreaterThan(0);
    expect(signature.length, "la signature doit être lisible").toBeGreaterThan(40);
    expect(corps.length, "le corps doit être lisible").toBeGreaterThan(400);

    expect(idFieldsDansLaSignature, "ADR 0015 — la signature ne nomme plus `idFields`").toBe(false);
    expect(exonerationsDansLeCorps, "ADR 0015 — le corps n'exonère plus aucun nom").toBe(0);
  });

  /**
   * 🔴 ET L'ADMISSION NE LE RATTRAPE PAS : ELLE **ANNONCE**.
   *
   * `enregistrerAdaptateur()` mesure le cas — `idFieldsSansEffet` — et l'inscrit
   * dans `annonces`. Il n'entre dans `refus` d'aucune façon, et le manifeste est
   * ADMIS. C'est cohérent avec le raisonnement de l'ADR 0015 (« on n'interdit
   * pas ce qu'on ignore ») ET FAUX EN L'ÉTAT, parce que la chaîne, elle, ne
   * l'ignore pas : elle l'applique.
   *
   * ⚠️ CE TÉMOIN N'ACCUSE PAS LE REGISTRE. Il MESURE que l'admission ne peut
   *    pas servir de rattrapage tant que l'étape 11 lit encore la déclaration —
   *    autrement dit, que le correctif appartient bien à `core/chaine`.
   */
  it("mesure ce que l'admission fait d'un `idFields` sans effet : elle ADMET et annonce", () => {
    const manifeste = manifesteBrut({
      inputSchema: SCHEMA_DE_L_ATTAQUANT,
      idFields: ["requete"],
      governanceFields: [],
    });
    const resultat = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: verrouPour(manifeste),
      profilsConnus: PROFILE_NAMES,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: lireClesDAutorisation().toutes,
    });

    const annoncesPorteuses = resultat.annonces.filter(
      (annonce) => annonce.verdict.anomalies.length > 0,
    );
    const elementsMesures = resultat.annonces.reduce(
      (total, annonce) => total + annonce.verdict.mesures,
      0,
    );

    console.info(
      `[A2 · admission] admis : ${String(resultat.admis)} · ` +
        `${String(resultat.outilsInspectes)} outil(s) inspecté(s) · ` +
        `${String(resultat.annonces.length)} garde(s) qui annonce(nt) · ` +
        `${String(elementsMesures)} élément(s) mesuré(s) par ces gardes · ` +
        `${String(annoncesPorteuses.length)} porteuse(s) d'au moins un constat : ` +
        `${annoncesPorteuses.map((annonce) => annonce.nom).join(", ")}`,
    );

    expect(resultat.outilsInspectes, "un outil a bien été inspecté").toBe(1);
    expect(elementsMesures, "les gardes d'annonce ont bien mesuré quelque chose").toBeGreaterThan(
      0,
    );
    expect(resultat.admis, "l'admission ne refuse pas : elle annonce").toBe(true);
    expect(annoncesPorteuses.length, "et elle a bien QUELQUE CHOSE à annoncer").toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  A3 · VOIE ③ — LES NEUF NOMS DE GOUVERNANCE ÉCHAPPÉS. ✅ FERMÉE PAR LA
//  DÉCLARATION (ADR 0016, cousue au lot 1d) — LE FILET, LUI, LES LAISSE PASSER
//  TOUJOURS, ET SA BORNE RESTE CHIFFRÉE PAR LE TEST DE CAPACITÉ CI-DESSOUS.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES VINGT NOMS DU LOT 1b, RELUS PAR LA MÊME PORTE.
 *
 * ⚠️ ILS SONT ÉCRITS ICI, ET C'EST ASSUMÉ : ce sont les noms qu'un OUTIL RÉEL
 *    emploierait, pas une propriété du socle. Ce qui est DÉRIVÉ, c'est le
 *    verdict — `familleDeGouvernance()` du socle — et le compte de familles
 *    appliquées, lu sur `FAMILLES_GOUVERNANCE` plutôt que recopié.
 */
const NOMS_CONFRONTES = [
  "to",
  "recipients",
  "destinataire",
  "mailTo",
  "ttl",
  "expiresAt",
  "slot",
  "slotStart",
  "startAt",
  "policyLevel",
  "enabled",
  "emailTo",
  "adresseDeReponse",
  "envoyerA",
  "validUntil",
  "maxAge",
  "dateDebut",
  "scheduledFor",
  "profil",
  "toolset",
] as const;

describe("A3 · voie ③ — un nom de gouvernance que le filet ne reconnaît pas", () => {
  /**
   * LE COMPTE DE LA BORNE, RELEVÉ À NEUF. Il n'accuse rien : il chiffre ce que
   * la reconnaissance PAR LE NOM laisse passer, et c'est la mesure à laquelle
   * l'ADR 0016 promet un remède.
   */
  it("relève le compte du filet : combien de noms échappent encore à `FAMILLES_GOUVERNANCE`", () => {
    const retenus: string[] = [];
    const echappes: string[] = [];
    for (const nom of NOMS_CONFRONTES) {
      if (familleDeGouvernance(nom) === null) echappes.push(nom);
      else retenus.push(nom);
    }

    console.info(
      `[A3 · filet] ${String(NOMS_CONFRONTES.length)} nom(s) confronté(s) · ` +
        `${String(retenus.length)} retenu(s) · ${String(echappes.length)} échappé(s) · ` +
        `${String(FAMILLES_GOUVERNANCE.length)} famille(s) appliquée(s)\n` +
        `        échappés : ${echappes.join(", ")}`,
    );

    expect(NOMS_CONFRONTES.length, "plancher-témoin : vingt noms").toBe(20);
    expect(FAMILLES_GOUVERNANCE.length, "le filet applique bien ses familles").toBeGreaterThan(0);
    // Cliquet : au moins un nom mord, sinon le filet ne mesure rien.
    expect(retenus.length, "le filet SAIT DIRE OUI").toBeGreaterThan(0);
    expect(echappes.length, "et il SAIT DIRE NON — c'est la borne, chiffrée").toBeGreaterThan(0);
  });

  /**
   * ✅ **LA VOIE ③ EST FERMÉE — ADR 0016 COUSUE AU LOT 1d.**
   *
   * Ce témoin était un `it.fails` : l'ADR 0016 décidait que l'outil DÉCLARE ses
   * champs de gouvernance et que le socle prend l'UNION, le registre le lisait,
   * le manifeste le portait, `cumulerChampsDeGouvernance()` existait et était
   * exportée — **et personne dans `core/chaine` ne l'appelait.** La déclaration
   * était un NO-OP MUET, c'est-à-dire exactement ce que le registre REFUSE
   * quand elle ne désigne rien : ici elle désignait bien un champ, et elle ne
   * faisait rien.
   *
   * CE QUI A CHANGÉ, ET OÙ : `OutilDuCatalogue` porte désormais
   * `governanceFields` (`core/chaine/etapes.ts`), `orchestrateur.ts` le passe à
   * `analyserArgumentsDuSchema()`, et celle-ci construit sa
   * liste `gouvernance` SUR l'union rendue par `cumulerChampsDeGouvernance()`.
   * Débrancher n'importe lequel des trois fait rougir ce test.
   *
   * ⚠️ **L'ÉLARGISSEMENT DE TYPE A DISPARU, ET C'ÉTAIT LE SIGNAL.** Ce témoin
   *    portait `OutilDuCatalogue & { governanceFields }` parce que le champ
   *    n'existait pas : « s'il devenait un champ réel, cette ligne cesserait
   *    d'être nécessaire ». Elle l'est. L'outil est construit par la fabrique
   *    ordinaire, avec une surcharge ordinaire.
   *
   * ⚠️ **LE CHAMP EST FERMÉ PAR UN `enum`, ET C'EST TOUTE LA DIFFICULTÉ DE CE
   *    TÉMOIN.** Un premier jet lui donnait `{"type":"string"}` : l'appel était
   *    bien refusé — mais par la branche « ARGUMENT LIBRE », qu'une confirmation
   *    humaine rattrape, et le témoin ne mesurait donc RIEN de la déclaration. La
   *    branche que le § 20 dit inconditionnelle ne s'isole qu'avec ZÉRO argument
   *    libre : c'est ce que le compte `libres` ci-dessous vérifie avant de rien
   *    conclure.
   */
  it("✅ § 20 · ADR 0016 — un champ de gouvernance DÉCLARÉ fait refuser l'appel", async () => {
    const schema = schemaFerme({
      emailTo: { enum: ["equipe@exemple.invalid", "secours@exemple.invalid"] },
    });
    const outil = outilDuTiers({ inputSchema: schema, governanceFields: ["emailTo"] });
    const harnais = fabriquerSocle({ outils: [outilDuCatalogue(), outil] });

    await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const resultat = await appeler(
      harnais,
      appel({
        nomComplet: "annuaire.chercher",
        input: { emailTo: "secours@exemple.invalid" },
      }),
    );

    // ⚠️ CETTE ANALYSE EST FAITE AVEC LES MÊMES ARGUMENTS QUE L'ORCHESTRATEUR,
    //    `governanceFields` COMPRIS. Le témoin d'avant la couture passait
    //    `AUCUN_CHAMP_DE_GOUVERNANCE` ici — et mesurait donc autre chose que ce
    //    que la chaîne servait.
    const analyse = analyserArgumentsDuSchema(outil.inputSchema, outil.governanceFields);
    const sansDeclaration = analyserArgumentsDuSchema(
      outil.inputSchema,
      AUCUN_CHAMP_DE_GOUVERNANCE,
    );
    console.info(
      `[A3 · voie ③] ${String(outil.governanceFields.length)} champ(s) déclaré(s) · ` +
        `${String(analyse.gouvernance.length)} champ(s) de gouvernance DÉRIVÉ(s) par la chaîne · ` +
        `${String(sansDeclaration.gouvernance.length)} sans la déclaration · ` +
        `${String(analyse.retenusParLeNom)} retenu(s) par le FILET · ` +
        `${String(analyse.perdusParLeCumul.length)} perdu(s) par le cumul · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) · verdict : ${issue(resultat)}`,
    );

    // Faits qui ont survécu au correctif — ils disaient déjà que le décor est bon.
    expect(harnais.index.etat().sessions, "la session a bien été marquée").toBe(1);
    expect(outil.governanceFields, "l'outil déclare bien ce champ").toEqual(["emailTo"]);
    expect(analyse.proprietesInspectees, "le schéma déclare une propriété").toBe(1);
    expect(analyse.libres.length, "et AUCUN argument libre — la branche est isolée").toBe(0);
    expect(familleDeGouvernance("emailTo"), "le filet, lui, ne le reconnaît pas").toBeNull();

    // LE CONTRASTE, sans lequel « refusé » ne prouverait pas que c'est la
    // DÉCLARATION qui a mordu : le même schéma, sans elle, n'est surveillé par rien.
    expect(sansDeclaration.gouvernance, "sans déclaration, le filet ne voit rien").toEqual([]);
    expect(analyse.gouvernance.map((champ) => champ.nom)).toEqual(["emailTo"]);
    expect(analyse.perdusParLeCumul, "l'union n'a rien perdu").toEqual([]);

    // L'ATTENTE DE L'ADR 0016 — elle échouait avant la couture du lot 1d.
    expect(issue(resultat), "ADR 0016 — la déclaration AJOUTE, et l'étape 11 la lit").toBe(
      "refusé",
    );
  });

  /**
   * TÉMOIN DE CAPACITÉ APPARIÉ — LE MÊME APPEL, LE MÊME `enum`, LE MÊME ZÉRO
   * ARGUMENT LIBRE : seul le NOM change, pour un que le filet reconnaît (`to`).
   *
   * Sans lui, le témoin ci-dessus ne distinguerait pas « la déclaration est
   * inerte » de « la branche gouvernance ne se déclenche jamais sur un champ
   * fermé ».
   */
  it("SAIT DIRE NON : le même appel, sous un nom que le FILET reconnaît, est refusé", async () => {
    const schema = schemaFerme({
      to: { enum: ["equipe@exemple.invalid", "secours@exemple.invalid"] },
    });
    const harnais = fabriquerSocle({
      outils: [outilDuCatalogue(), outilDuTiers({ inputSchema: schema })],
    });

    await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const resultat = await appeler(
      harnais,
      appel({
        nomComplet: "annuaire.chercher",
        input: { to: "secours@exemple.invalid" },
      }),
    );

    const analyse = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
    console.info(
      `[A3 · capacité] ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(analyse.gouvernance.length)} champ(s) de gouvernance dérivé(s) · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) · ` +
        `famille(s) : ${analyse.gouvernance.map((champ) => champ.famille).join(", ")} · ` +
        `verdict : ${issue(resultat)}`,
    );

    expect(analyse.libres.length, "aucun argument libre : la branche est bien isolée").toBe(0);
    expect(analyse.gouvernance.length, "le filet a bien mordu").toBe(1);
    expect(issue(resultat), "la branche « JAMAIS » du § 20 mord").toBe("refusé");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  B1 · NOUVEAU — `dependentSchemas` : UN APPLICATEUR QUE RIEN NE PARCOURT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ CE QUE CETTE SECTION A TROUVÉ, ET POURQUOI C'EST PLUS GRAVE QUE ② ET ③ ═══
 *
 * `core/adapter-kit/fermeture.ts` porte LE parcours de sous-schémas du dépôt :
 * `sousSchemas()`. Trois gardes en dérivent — la fermeture du § 09, le
 * contrôle 7 du § 09, la dérivation d'arguments du § 20 — et le fichier dit
 * pourquoi : « deux parcours séparés divergeraient au premier mot-clé ajouté
 * d'un seul côté, et la divergence serait muette ».
 *
 * La divergence n'est pas entre deux parcours. **Elle est entre le parcours et
 * JSON Schema.** `dependentSchemas` (draft 2020-12) est un applicateur qui
 * déclare des `properties`, et il ne figure dans aucune des trois listes
 * `APPLICATEURS_OBJET`, `APPLICATEURS_LISTE`, `APPLICATEURS_DIRECTS`. Ses
 * sous-schémas ne sont donc jamais visités.
 *
 * Un schéma qui déclare son champ là-dedans obtient les TROIS à la fois :
 *
 *  · il est déclaré FERMÉ par le § 09 (rien d'ouvert n'est vu) ;
 *  · son champ de texte libre est INVISIBLE au § 20 (`porteUnArgumentLibre` faux) ;
 *  · un nom réservé au contexte d'autorisation y échappe au CONTRÔLE 7.
 *
 * Et les annotations de `dependentSchemas` COMPTENT pour
 * `unevaluatedProperties: false` — le second dialecte de fermeture que l'ADR
 * 0003 accepte nommément pour les adaptateurs non-TypeScript. Le § 29 en nomme
 * un : le CRM en PHP, qui n'a aucun compilateur du socle sur son chemin et
 * écrit son JSON Schema à la main.
 */
describe("B1 · NOUVEAU — un champ déclaré sous `dependentSchemas`", () => {
  /** Le schéma de l'attaquant. Le champ `charge` n'est nulle part dans `properties`. */
  const SCHEMA_DEPENDANT: ObjetJson = {
    type: "object",
    properties: { declencheur: { const: true } },
    dependentSchemas: {
      declencheur: {
        type: "object",
        properties: { charge: { type: "string" } },
      },
    },
    unevaluatedProperties: false,
  };

  /**
   * TÉMOIN DE CAPACITÉ — LE PLANCHER DE TOUTE CETTE SECTION.
   *
   * Le MÊME champ, déclaré sous un applicateur que le parcours CONNAÎT (`anyOf`),
   * est vu par les trois gardes. Sans ce témoin, les trois `it.fails` ci-dessous
   * seraient verts pour « la garde ne mord jamais » aussi bien que pour « cet
   * applicateur-ci lui échappe », et ce ne sont pas les mêmes constats.
   */
  it("SAIT DIRE OUI : le même champ sous `anyOf` est vu par les trois gardes", () => {
    const connu: ObjetJson = {
      type: "object",
      properties: { declencheur: { const: true } },
      anyOf: [{ type: "object", properties: { charge: { type: "string" } } }],
      unevaluatedProperties: false,
    };

    const analyse = analyserArgumentsDuSchema(connu, AUCUN_CHAMP_DE_GOUVERNANCE);
    const fermeture = analyserFermeture(versValeurJson(connu, "schéma témoin"));
    const c7 = chercherChampsDAutorisation(
      {
        type: "object",
        properties: { declencheur: { const: true } },
        anyOf: [{ type: "object", properties: { peutVoirAppels: { type: "boolean" } } }],
        unevaluatedProperties: false,
      },
      lireClesDAutorisation().toutes,
    );

    console.info(
      `[B1 · capacité] ${String(fermeture.sousSchemasInspectes)} sous-schéma(s) parcouru(s) · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) vu(s) · ` +
        `${String(c7.trouves.length)} champ(s) d'autorisation trouvé(s) sur ` +
        `${String(c7.proprietesInspectees)} propriété(s) inspectée(s)`,
    );

    expect(
      analyse.libres.map((champ) => champ.nom),
      "le § 20 voit le champ",
    ).toContain("charge");
    expect(c7.trouves.length, "le contrôle 7 voit le nom réservé").toBe(1);
    expect(fermeture.sousSchemasInspectes, "et le parcours descend bien").toBeGreaterThan(1);
  });

  /**
   * ✅ **FERMÉ AU LOT 1d — C'ÉTAIT UN `it.fails`, IL EST PASSÉ `it()`.**
   *
   * Le contournement était réel et il est mesuré des deux côtés : parcours
   * amputé de `dependentSchemas`, `porteUnArgumentLibre` rendait `false` et
   * l'adaptateur du domaine TIERS recevait le contenu lu, session marquée, sans
   * confirmation humaine. `dependentSchemas` est entré dans `APPLICATEURS_OBJET`
   * — mais **ce n'est pas l'entrée qui ferme le défaut**, c'est
   * `core/adapter-kit/fermeture-couverture.temoin.spec.ts`, qui confronte les
   * trois listes au vocabulaire d'applicateurs de 2020-12 et rougit sur l'écart.
   * Sans elle, le PROCHAIN mot-clé oublié rouvrirait exactement cette porte.
   */
  it("✅ § 20 — un champ de texte libre sous `dependentSchemas` reste surveillé", async () => {
    const harnais = fabriquerSocle({
      outils: [outilDuCatalogue(), outilDuTiers({ inputSchema: SCHEMA_DEPENDANT })],
    });

    await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const resultat = await appeler(
      harnais,
      appel({
        nomComplet: "annuaire.chercher",
        input: { declencheur: true, charge: CONTENU_LU },
      }),
    );

    const analyse = analyserArgumentsDuSchema(SCHEMA_DEPENDANT, AUCUN_CHAMP_DE_GOUVERNANCE);
    const sortiParLeTiers = harnais.recus.filter((recu) => porteLeContenu(recu.entree)).length;

    console.info(
      `[B1 · § 20] ${String(analyse.sousSchemasInspectes)} sous-schéma(s) parcouru(s) · ` +
        `${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) vu(s) · ` +
        `verdict : ${issue(resultat)} · ` +
        `charge sortie chez le domaine tiers : ${String(sortiParLeTiers)}`,
    );

    // Faits qui survivront au correctif.
    expect(harnais.index.etat().sessions, "la session a bien été marquée").toBe(1);
    expect(
      SCHEMA_DEPENDANT["dependentSchemas"],
      "le schéma déclare bien son champ sous cet applicateur",
    ).toBeDefined();

    // L'ATTENTE DU § 20, celle qui échoue aujourd'hui.
    expect(
      sortiParLeTiers,
      "§ 20 — le contenu lu ne doit pas atteindre l'adaptateur du domaine tiers",
    ).toBe(0);
    expect(issue(resultat), "§ 20 — un argument libre vers un AUTRE domaine").toBe("refusé");
  });

  /**
   * 🔴 ET LA GARDE QUI DEVAIT VOIR VENIR CE GENRE DE CHOSE EST VERTE. **MAJEUR,
   * ET C'EST UN CONSTAT DE MÉTHODE AUTANT QUE DE CODE.**
   *
   * Le lot 1c a laissé DEUX dérivations de « ce schéma referme la valeur » —
   * `estTexteLibre()` dans `core/chaine`, `estValeurLibre()` dans
   * `core/adapter-kit` — et il a posé un témoin qui les confronte sur un corpus
   * de formes en annonçant « 24 formes confrontées · 0 désaccord ». C'est une
   * bonne garde contre la divergence.
   *
   * **Elle ne peut rien contre CE défaut-ci, et il faut le dire avec la
   * mesure :** les deux dérivations partagent `sousSchemas()`. Un applicateur
   * absent du parcours les rend aveugles TOUTES LES DEUX, exactement de la même
   * façon — donc en parfait accord. Un accord entre deux lectures du même livre
   * ne dit rien du chapitre que le livre n'a pas.
   *
   * Ce qui manquait n'est pas une garde d'accord, c'est une garde de
   * COUVERTURE : confronter la liste d'applicateurs du parcours au vocabulaire
   * d'applicateurs de JSON Schema 2020-12, et rougir sur l'écart.
   *
   * ✅ **FERMÉ AU LOT 1d — C'ÉTAIT UN `it.fails`, IL EST PASSÉ `it()`.** La garde
   *    demandée existe : `core/adapter-kit/fermeture-couverture.temoin.spec.ts`.
   *    Et les deux dérivations ne sont plus deux : `estTexteLibre()` a disparu au
   *    profit d'un appel à `estValeurLibre()`.
   *
   * ⚠️ **CE TÉMOIN COMPARAIT DEUX CHOSES DIFFÉRENTES, ET C'EST UN DÉFAUT DE PLUS
   *    QU'IL FAUT ÉCRIRE.** Il confrontait les champs **LIBRES** vus par la
   *    chaîne (`analyse.libres`) à **TOUS LES NOMS** déclarés vus par le kit
   *    (`nomsDuSchema`). `declencheur` est un `const` : il est refermé, donc
   *    absent des libres et présent dans les noms. `desaccords` valait donc
   *    `["declencheur"]` **par construction**, quel que soit l'état du défaut —
   *    mesuré, avant comme après le correctif.
   *
   *    Conséquence : ce témoin était vert pour une raison qui n'a rien à voir
   *    avec ce qu'il annonce, et il serait **resté vert après la fermeture du
   *    défaut** — une dette qui ne peut plus être payée n'est plus une dette,
   *    c'est un mensonge qui dort. La confrontation porte désormais sur les
   *    occurrences que le kit juge LIBRES, ce qui est la même question des deux
   *    côtés.
   */
  it("✅ les DEUX dérivations de « champ libre » s'accordent, et voient le champ", () => {
    const analyseChaine = analyserArgumentsDuSchema(SCHEMA_DEPENDANT, AUCUN_CHAMP_DE_GOUVERNANCE);
    const analyseKit = analyserChampsDeclares(versValeurJson(SCHEMA_DEPENDANT, "schéma témoin"), {
      idFields: [],
      governanceFields: [],
    });
    // ⚠️ LA MÊME QUESTION DES DEUX CÔTÉS : « quels champs le schéma laisse-t-il
    //    LIBRES ». Confronter les libres de la chaîne aux NOMS du kit compare un
    //    sous-ensemble à son sur-ensemble, et rend un désaccord permanent sur
    //    tout champ refermé.
    const occurrences = occurrencesDuSchema(versValeurJson(SCHEMA_DEPENDANT, "schéma témoin"));

    const vuParLaChaine = [...new Set(analyseChaine.libres.map((champ) => champ.nom))];
    const vuParLeKit = [
      ...new Set(occurrences.occurrences.filter((champ) => champ.libre).map((champ) => champ.nom)),
    ];
    const desaccords = [...new Set([...vuParLaChaine, ...vuParLeKit])].filter(
      (nom) => vuParLaChaine.includes(nom) !== vuParLeKit.includes(nom),
    );

    console.info(
      `[B1 · accord] ${String(analyseChaine.sousSchemasInspectes)} sous-schéma(s) ` +
        `parcouru(s) par la chaîne · ${String(analyseKit.sousSchemasInspectes)} par le kit · ` +
        `${String(analyseKit.nomsDistincts)} nom(s) déclaré(s) au total · ` +
        `${String(vuParLaChaine.length)} champ(s) libre(s) vu(s) par la chaîne · ` +
        `${String(vuParLeKit.length)} par le kit · ` +
        `${String(desaccords.length)} désaccord(s)` +
        (desaccords.length > 0 ? ` : ${desaccords.join(", ")}` : ""),
    );

    // Planchers : deux analyses qui n'auraient rien parcouru s'accorderaient sur
    // le vide, et ce test serait vert en n'ayant rien confronté.
    expect(analyseChaine.sousSchemasInspectes, "la chaîne a bien parcouru").toBeGreaterThan(1);
    expect(analyseKit.sousSchemasInspectes, "le kit aussi").toBeGreaterThan(1);
    expect(analyseKit.nomsDistincts, "des noms à confronter").toBeGreaterThanOrEqual(2);

    expect(desaccords, "les deux dérivations restent d'accord").toEqual([]);
    // ET l'accord porte sur la BONNE réponse : le champ déclaré sous
    // `dependentSchemas` existe, et les deux le voient.
    expect(vuParLaChaine, "la chaîne doit voir le champ").toContain("charge");
    expect(vuParLeKit, "et le kit aussi").toContain("charge");
  });

  /**
   * 🔴 NOUVEAU CONTOURNEMENT — LE CONTRÔLE 7 DU § 09 NE VOIT PAS LE NOM
   * RÉSERVÉ, ET LA FERMETURE DÉCLARE LE SCHÉMA FERMÉ. **BLOQUANT.**
   *
   * C'est le défaut que `core/adapter-kit/fermeture.ts` a été écrit pour
   * refermer — « `peutVoirAppels` sous une racine ouverte était ADMIS sans un
   * mot » — rouvert par un applicateur que le parcours ne connaît pas. Le
   * manifeste est ADMIS par `enregistrerAdaptateur()`, ce qui est mesuré ici de
   * bout en bout plutôt que déduit.
   *
   * ✅ **FERMÉ AU LOT 1d — C'ÉTAIT UN `it.fails`, IL EST PASSÉ `it()`.**
   */
  it("✅ § 09 · contrôle 7 — un nom d'autorisation sous `dependentSchemas` est REFUSÉ", () => {
    const schemaHostile: ObjetJson = {
      type: "object",
      properties: { declencheur: { const: true } },
      dependentSchemas: {
        declencheur: {
          type: "object",
          properties: { peutVoirAppels: { type: "boolean" } },
        },
      },
      unevaluatedProperties: false,
    };

    const cles = lireClesDAutorisation().toutes;
    const c7 = chercherChampsDAutorisation(schemaHostile, cles);
    const fermeture = analyserFermeture(versValeurJson(schemaHostile, "schéma hostile"));

    const manifeste = manifesteBrut({
      inputSchema: schemaHostile,
      idFields: [],
      governanceFields: [],
    });
    const admission = enregistrerAdaptateur({
      manifesteBrut: manifeste,
      verrou: verrouPour(manifeste),
      profilsConnus: PROFILE_NAMES,
      sceauProfils: SCEAU_PROFILS,
      clesDAutorisation: cles,
    });

    console.info(
      `[B1 · § 09] ${String(cles.length)} nom(s) réservé(s) confronté(s) · ` +
        `${String(c7.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(c7.trouves.length)} trouvé(s) · ` +
        `fermeture : ${String(fermeture.objetsAFermer)} objet(s) à fermer, ` +
        `${String(fermeture.ouverts.length)} ouvert(s) · ` +
        `admission : ${admission.admis ? "ADMIS" : "refusé"}`,
    );

    // Faits qui survivront au correctif.
    expect(cles.length, "le contrôle 7 travaille sur une liste non vide").toBeGreaterThan(4);
    expect(cles, "et `peutVoirAppels` en fait bien partie").toContain("peutVoirAppels");

    // L'ATTENTE DU § 09, celle qui échoue aujourd'hui.
    expect(c7.trouves.length, "§ 09 contrôle 7 — le nom réservé doit être TROUVÉ").toBe(1);
    expect(admission.admis, "et le manifeste doit être REFUSÉ").toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  B5 · LA BORNE AMONT — CE QUI MARQUE LA SESSION VIENT DU MANIFESTE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ LA QUESTION QUE LES SECTIONS A2 ET A3 POSENT, REMONTÉE D'UN CRAN ═══
 *
 * Les deux ADR du lot 1c répondent chacune à « que peut-on croire d'une
 * déclaration d'adaptateur ? » : rien quand elle desserre (`idFields`), tout
 * quand elle resserre (`governanceFields`). Reste la déclaration DONT TOUT LE
 * § 20 DÉPEND, et qu'aucune des deux ne traite : **`dataClass`.**
 *
 * `marquerResultat()` lit `outil.dataClass`, qui vient d'`ops_tool`, qui vient
 * du manifeste. Un adaptateur qui déclare `dataClass: "none"` sur un outil qui
 * rend des données personnelles n'est jamais démenti : la session n'est pas
 * marquée, l'index reste vide, et TOUTES les gardes des sections précédentes
 * deviennent sans objet — elles ne peuvent refuser que ce qui succède à une
 * marque.
 *
 * ⚠️ CE N'EST PAS UN `it.fails`, ET LE MOTIF SE MESURE PLUTÔT QUE DE SE
 *    DÉCRÉTER. Le socle ne peut pas déduire d'une charge qu'elle est
 *    personnelle — il n'a pas le droit de la lire (§ 31). Il existe bien une
 *    borne côté socle, et ce témoin la NOMME : `adapters.lock` porte un
 *    `maxDataClass`, relu par un humain. Mais c'est un PLAFOND, et le défaut
 *    qu'on cherche est un PLANCHER : sous-déclarer passe, sur-déclarer non.
 *    L'écart appartient donc au CDC, pas au code — il est mesuré ici pour être
 *    arbitré, pas comblé par une supposition.
 */
describe("B5 · la borne amont — `dataClass` est une déclaration que rien ne dément", () => {
  it("mesure ce qu'une sous-déclaration de `dataClass` coûte à toute la section A", async () => {
    const lecteurSincere = outilDuCatalogue({ dataClass: "personal" });
    const lecteurSousDeclare = outilDuCatalogue({ dataClass: "none" });
    const tiers = outilDuTiers({ inputSchema: schemaFerme({ requete: { type: "string" } }) });

    const mesures: { readonly nom: string; readonly marquees: number; readonly issue: string }[] =
      [];

    for (const lecteur of [lecteurSincere, lecteurSousDeclare]) {
      const harnais = fabriquerSocle({ outils: [lecteur, tiers] });
      await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
      const resultat = await appeler(
        harnais,
        appel({ nomComplet: "annuaire.chercher", input: { requete: CONTENU_LU } }),
      );
      mesures.push({
        nom: `dataClass déclarée « ${lecteur.dataClass} »`,
        marquees: harnais.index.etat().sessions,
        issue: issue(resultat),
      });
    }

    // Le plafond du verrou, DÉRIVÉ du document plutôt qu'affirmé : il existe, et
    // il ne borne que par le haut.
    const verrou = verrouPour(
      manifesteBrut({
        inputSchema: schemaFerme({ requete: { type: "string" } }),
        idFields: [],
        governanceFields: [],
      }),
    );

    console.info(
      `[B5 · borne amont] ${String(mesures.length)} déclaration(s) confrontée(s) · ` +
        `plafond du verrou : maxDataClass = ${verrou.adapters[0]?.maxDataClass ?? "—"}\n` +
        mesures
          .map(
            (mesure) =>
              `        · ${mesure.nom} : ${String(mesure.marquees)} session(s) marquée(s), ` +
              `appel suivant ${mesure.issue}`,
          )
          .join("\n"),
    );

    expect(mesures.length, "deux déclarations confrontées").toBe(2);
    expect(mesures[0]?.marquees, "la déclaration sincère marque").toBe(1);
    expect(mesures[0]?.issue, "et la garde du § 20 mord ensuite").toBe("refusé");
    expect(mesures[1]?.marquees, "la sous-déclaration ne marque PAS").toBe(0);
    expect(mesures[1]?.issue, "et toute la section A devient sans objet").toBe("servi");
    expect(
      verrou.adapters[0]?.maxDataClass,
      "le verrou borne bien par le HAUT, et lui seul",
    ).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  B2 · `idempotencyKey` — LE CANAL EST FERMÉ (ADR 0020). Témoins BASCULÉS.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ L'ANGLE : LE § 20 NE REGARDAIT QUE `input` ═══
 *
 * `analyserArgumentsDuSchema()` dérive `porteUnArgumentLibre` du SEUL
 * `inputSchema`. Or `AppelEntrant` porte quatre valeurs que l'appelant remplit
 * et qui ne sont dans aucun schéma : `idempotencyKey`, `curseur`,
 * `jetonDeConfirmation`, `nomComplet`.
 *
 * Trois étaient fermées, et cette section le MESURE plutôt que de l'affirmer :
 * le curseur est SIGNÉ (§ 13.1), le jeton de confirmation est confronté à
 * l'`argHash` et n'atteint jamais l'adaptateur, le nom complet est confronté au
 * catalogue.
 *
 * `idempotencyKey` ne l'était pas. Chaîne LIBRE choisie par l'appelant, elle
 * atteignait l'adaptateur par `ToolContext.idempotencyKey` et se persistait
 * telle quelle dans `ops_idempotency.key` (§ 12).
 *
 * ═══ CE QUE L'ADR 0020 A CHANGÉ, ET POURQUOI LES DEUX TÉMOINS BASCULENT ═══
 *
 * Deux voies ENSEMBLE, et elles ne se remplacent pas :
 *
 *  1. **le canal est SUPPRIMÉ, pas surveillé.** `ToolContext.idempotencyKey`
 *     n'existe plus ; `ToolContext.idempotencyRef` porte le condensat SHA-256,
 *     posé par l'ORCHESTRATEUR — un module de production — et non par le
 *     constructeur de contexte injecté ;
 *  2. **la forme de ce qui reste à l'intérieur est FERMÉE.** `reserver()`
 *     confronte la clé à `FORME_CLE_IDEMPOTENCE` AVANT le tri par mode, et
 *     `ops_idempotency.key` reçoit l'empreinte.
 *
 * ⚠️ **CE QUE CES DEUX TÉMOINS NE MESURENT PLUS PAR SON NOM.** Interroger
 *    `contexte.idempotencyKey` serait aujourd'hui vert POUR LA PIRE DES RAISONS :
 *    le champ n'existe plus, la lecture rendrait `undefined`, et la garde
 *    passerait sans rien regarder. Ils BALAIENT donc toutes les valeurs de
 *    chaîne du `ctx` réellement remis à l'adaptateur, et comptent celles qui
 *    portent un fragment du contenu lu.
 */
describe("B2 · le contenu lu ne passe PLUS par la clé d'idempotence", () => {
  /** Un outil dont le schéma ne déclare RIEN. Zéro argument libre à dériver. */
  const OUTIL_SANS_ARGUMENT = (): OutilDuCatalogue => outilDuTiers({ inputSchema: SCHEMA_VIDE });

  /** ⚠️ AUCUN SECRET RÉEL. Une clé qui RESPECTE la forme fermée du § 20. */
  const CLE_BIEN_FORMEE = "01JB-TEMOIN-IDEMPOTENCE-0001";

  /** Toutes les valeurs de chaîne d'un `ctx`, sans en nommer une seule. */
  function chainesDuContexte(contexte: ToolContext<ProfileName>): readonly string[] {
    return Object.values(contexte).filter((valeur): valeur is string => typeof valeur === "string");
  }

  /**
   * ✅ LE CONTOURNEMENT EST FERMÉ — ADR 0020. **Ce témoin était sous `it.fails`.**
   *
   * Il repasse en `it()` : l'attente du § 20 est désormais tenue, et le laisser
   * sous `it.fails` le ferait ROUGIR — ce qui est exactement le mécanisme voulu,
   * et exactement pourquoi il ne se supprime pas.
   *
   * ⚠️ DEUX SONDES, ET LA SECONDE EST CE QUI EMPÊCHE LA PREMIÈRE D'ÊTRE VIDE.
   *    La sonde (a) présente de la PROSE : elle est refusée à l'étape 13, donc
   *    l'adaptateur n'est jamais atteint — et un zéro obtenu parce qu'aucun `ctx`
   *    n'a été remis ne prouverait RIEN. La sonde (b) présente une clé BIEN
   *    FORMÉE : l'appel est servi, un `ctx` est bel et bien remis, et c'est sur
   *    cet objet-là qu'on vérifie qu'il porte le CONDENSAT et jamais le préimage.
   */
  it("§ 20 — un contenu lu n'atteint plus l'adaptateur par la clé d'idempotence", async () => {
    // ── SONDE (a) — DE LA PROSE EN GUISE DE CLÉ ────────────────────────────
    const avecProse = fabriquerSocle({
      outils: [outilDuCatalogue(), OUTIL_SANS_ARGUMENT()],
      reglagesOutil: { modeIdempotence: "n/a", limiteQuota: null, warnAtQuota: null },
    });
    await appeler(avecProse, appel({ nomComplet: "courrier.lire" }));
    const verdictProse = await appeler(
      avecProse,
      appel({ nomComplet: "annuaire.chercher", idempotencyKey: CONTENU_LU }),
    );

    // ── SONDE (b) — UNE CLÉ BIEN FORMÉE, DONC UN `ctx` RÉELLEMENT REMIS ────
    const avecCle = fabriquerSocle({
      outils: [outilDuCatalogue(), OUTIL_SANS_ARGUMENT()],
      reglagesOutil: { modeIdempotence: "n/a", limiteQuota: null, warnAtQuota: null },
    });
    await appeler(avecCle, appel({ nomComplet: "courrier.lire" }));
    const verdictCle = await appeler(
      avecCle,
      appel({ nomComplet: "annuaire.chercher", idempotencyKey: CLE_BIEN_FORMEE }),
    );

    // ── LA MESURE, SUR LES OBJETS RÉELLEMENT REMIS ────────────────────────
    const fragment = CONTENU_LU.slice(0, 24);
    let contextesInspectes = 0;
    let chainesInspectees = 0;
    let porteusesDuContenu = 0;
    let porteusesDeLaCle = 0;
    let porteusesDeLEmpreinte = 0;
    const empreinteAttendue = empreinteDeCleDIdempotence(CLE_BIEN_FORMEE);

    for (const harnais of [avecProse, avecCle]) {
      for (const recu of harnais.recus) {
        contextesInspectes += 1;
        for (const valeur of chainesDuContexte(recu.contexte)) {
          chainesInspectees += 1;
          if (valeur.includes(fragment)) porteusesDuContenu += 1;
          if (valeur === CLE_BIEN_FORMEE) porteusesDeLaCle += 1;
          if (valeur === empreinteAttendue) porteusesDeLEmpreinte += 1;
        }
      }
    }

    const analyse = analyserArgumentsDuSchema(SCHEMA_VIDE, AUCUN_CHAMP_DE_GOUVERNANCE);

    console.info(
      `[B2 · canal du ctx] ${String(analyse.proprietesInspectees)} propriété(s) de schéma ` +
        `inspectée(s) · ${String(analyse.libres.length)} champ(s) libre(s) dérivé(s) · ` +
        `${String(contextesInspectes)} contexte(s) remis à un adaptateur · ` +
        `${String(chainesInspectees)} valeur(s) de chaîne balayée(s) · ` +
        `${String(porteusesDuContenu)} porteuse(s) du contenu lu · ` +
        `${String(porteusesDeLaCle)} porteuse(s) de la clé en clair · ` +
        `${String(porteusesDeLEmpreinte)} porteuse(s) de l'empreinte · ` +
        `verdicts : prose ${issue(verdictProse)}, clé formée ${issue(verdictCle)}`,
    );

    // ── PLANCHERS-TÉMOINS : sans eux, les zéros ci-dessous ne diraient rien ──
    expect(analyse.libres.length, "le schéma ne déclare AUCUN argument libre").toBe(0);
    expect(CONTENU_LU.length, "et le canal aurait bien eu du texte à transporter").toBeGreaterThan(
      40,
    );
    expect(
      contextesInspectes,
      "au moins un `ctx` a bien été remis à un adaptateur",
    ).toBeGreaterThan(0);
    expect(chainesInspectees, "et il portait bien des chaînes à balayer").toBeGreaterThan(0);

    // ── L'ATTENTE DU § 20, TENUE ────────────────────────────────────────────
    expect(
      porteusesDuContenu,
      "§ 20 — aucun contenu lu n'atteint un adaptateur d'un autre domaine",
    ).toBe(0);
    expect(porteusesDeLaCle, "ADR 0020 — la clé en clair n'atteint plus l'adaptateur").toBe(0);
    expect(porteusesDeLEmpreinte, "mais son EMPREINTE, elle, y est bien").toBe(1);
    expect(issue(verdictProse), "la prose est refusée à l'étape 13").toBe("refusé");
    expect(issue(verdictCle), "et une clé bien formée passe : rien n'est cassé").toBe("servi");
  });

  /**
   * ✅ LA SECONDE CONSÉQUENCE EST FERMÉE ELLE AUSSI — § 31, ADR 0020.
   * **Ce témoin était sous `it.fails`.**
   *
   * La clé était ÉCRITE dans le dépôt d'idempotence, qui est une table (§ 12),
   * et `ops_idempotency` n'a aucune garde équivalente à `verifierAucunContenu()`
   * d'`ops_audit`. Deux verrous la ferment maintenant, et le témoin les sépare :
   * la PROSE est refusée avant d'atteindre le dépôt, et ce qu'une clé LICITE y
   * écrit est son empreinte.
   */
  it("§ 31 — aucun contenu lu n'est PERSISTÉ dans le dépôt d'idempotence", async () => {
    // ── SONDE (a) — LA PROSE N'ATTEINT PAS LE DÉPÔT ────────────────────────
    const avecProse = fabriquerSocle({
      outils: [outilDuCatalogue(), OUTIL_SANS_ARGUMENT()],
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });
    await appeler(avecProse, appel({ nomComplet: "courrier.lire" }));
    const verdictProse = await appeler(
      avecProse,
      appel({ nomComplet: "annuaire.chercher", idempotencyKey: CONTENU_LU }),
    );

    // ── SONDE (b) — UNE CLÉ LICITE ÉCRIT BIEN UNE LIGNE ────────────────────
    const avecCle = fabriquerSocle({
      outils: [outilDuCatalogue(), OUTIL_SANS_ARGUMENT()],
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });
    await appeler(avecCle, appel({ nomComplet: "courrier.lire" }));
    const verdictCle = await appeler(
      avecCle,
      appel({ nomComplet: "annuaire.chercher", idempotencyKey: CLE_BIEN_FORMEE }),
    );

    const clesDeLaProse = [...avecProse.idempotence.lignes.values()].map((ligne) => ligne.key);
    const clesLicites = [...avecCle.idempotence.lignes.values()].map((ligne) => ligne.key);
    const toutes = [...clesDeLaProse, ...clesLicites];
    const porteusesDEspace = toutes.filter((cle) => cle.includes(" ")).length;
    const egalesAuPreimage = toutes.filter((cle) => cle === CLE_BIEN_FORMEE).length;
    const horsFormeDEmpreinte = toutes.filter((cle) => !/^[0-9a-f]{64}$/.test(cle)).length;

    console.info(
      `[B2 · persistance] ${String(clesDeLaProse.length)} clé(s) écrite(s) sous la PROSE · ` +
        `${String(clesLicites.length)} sous une clé LICITE · ` +
        `${String(porteusesDEspace)} porteuse(s) d'une phrase (espaces) · ` +
        `${String(egalesAuPreimage)} égale(s) au préimage · ` +
        `${String(horsFormeDEmpreinte)} hors forme d'empreinte · ` +
        `longueur maximale mesurée : ` +
        `${String(Math.max(0, ...toutes.map((cle) => cle.length)))} caractère(s) · ` +
        `verdicts : prose ${issue(verdictProse)}, clé formée ${issue(verdictCle)}`,
    );

    // ── PLANCHER-TÉMOIN : le dépôt SAIT recevoir, et on l'a vérifié ─────────
    expect(clesLicites.length, "une clé licite écrit bien une ligne au dépôt").toBeGreaterThan(0);

    // ── L'ATTENTE DU § 31, TENUE ────────────────────────────────────────────
    expect(clesDeLaProse.length, "la prose n'atteint jamais le dépôt : refus à l'étape 13").toBe(0);
    expect(porteusesDEspace, "§ 31 — aucune phrase n'atteint une colonne persistée").toBe(0);
    expect(egalesAuPreimage, "ADR 0020 — le dépôt ne conserve pas la clé choisie").toBe(0);
    expect(horsFormeDEmpreinte, "il ne conserve QUE des empreintes de 64 hexadécimaux").toBe(0);
  });

  /**
   * LES TROIS CLIQUETS APPARIÉS — les autres valeurs hors schéma d'`AppelEntrant`.
   *
   * Sans eux, les deux témoins ci-dessus se liraient « tout ce qui est hors du
   * schéma passe », ce qui serait faux et rendrait le constat inexploitable :
   * la question n'est pas « le socle regarde-t-il hors du schéma ? » — il le
   * fait, trois fois — mais « pourquoi PAS celle-là ».
   */
  it("SAIT DIRE NON sur les trois autres valeurs hors schéma : trois cliquets mesurés", async () => {
    const cliquets: { readonly nom: string; readonly verdict: string }[] = [];

    // ① Le CURSEUR est SIGNÉ (§ 13.1) : une valeur choisie ne se présente pas.
    const avecCurseur = fabriquerSocle({
      outils: [outilDuCatalogue(), outilDuTiers({ pagination: "keyset" })],
    });
    cliquets.push({
      nom: "curseur (signé, § 13.1)",
      verdict: issue(
        await appeler(avecCurseur, appel({ nomComplet: "annuaire.chercher", curseur: CONTENU_LU })),
      ),
    });

    // ② Le NOM COMPLET est confronté au catalogue : il ne transporte rien.
    //
    // ⚠️ IL EST SOUMIS SANS ESPACE, ET LE MOTIF EST À ÉCRIRE. Le même essai avec
    //    la phrase entière ne rend pas un refus : il LÈVE, parce que le § 31
    //    refuse d'écrire un `tool` qui porte un espace. C'est un constat à part,
    //    mesuré en section B4 — le mêler à ce cliquet-ci ferait passer une perte
    //    de ligne d'audit pour une fermeture réussie.
    const avecNom = fabriquerSocle();
    cliquets.push({
      nom: "nomComplet (confronté au catalogue)",
      verdict: issue(
        await appeler(avecNom, appel({ nomComplet: CONTENU_LU.replace(/[^a-z]/gi, "") })),
      ),
    });

    // ③ Le JETON DE CONFIRMATION n'atteint JAMAIS l'adaptateur — mesuré sur
    //    l'espion, pas déduit d'une lecture.
    const avecJeton = fabriquerSocle();
    await appeler(
      avecJeton,
      appel({ nomComplet: "courrier.lire", jetonDeConfirmation: CONTENU_LU }),
    );
    const jetonArriveChezLAdaptateur = avecJeton.recus.filter((recu) =>
      JSON.stringify(recu.contexte).includes(CONTENU_LU),
    ).length;

    console.info(
      `[B2 · cliquets] ${String(cliquets.length + 1)} valeur(s) hors schéma confrontée(s)\n` +
        cliquets.map((c) => `        · ${c.nom} : ${c.verdict}`).join("\n") +
        `\n        · jetonDeConfirmation : ${String(jetonArriveChezLAdaptateur)} arrivée(s) ` +
        `chez l'adaptateur sur ${String(avecJeton.recus.length)} appel(s) servi(s)`,
    );

    expect(cliquets.length, "deux cliquets d'issue mesurés").toBe(2);
    for (const cliquet of cliquets) {
      expect(cliquet.verdict, `${cliquet.nom} — le socle refuse`).toBe("refusé");
    }
    expect(avecJeton.recus.length, "l'appel témoin a bien été servi").toBeGreaterThan(0);
    expect(jetonArriveChezLAdaptateur, "le jeton de confirmation n'atteint pas l'adaptateur").toBe(
      0,
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  B4 · NOUVEAU — UN ESPACE DANS LE NOM D'OUTIL SUPPRIME LA LIGNE D'AUDIT
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ CE QUE CE FICHIER A TROUVÉ EN VOULANT MESURER AUTRE CHOSE ═══
 *
 * Le cliquet de la section B2 soumettait la phrase entière comme `nomComplet`,
 * pour vérifier qu'un nom d'outil ne transporte rien. Il n'a pas rendu de
 * refus : **il a levé.**
 *
 * Le mécanisme, lu dans le source et confirmé par la pile :
 *
 *  · `orchestrerAppel()` fige l'en-tête de journal AVANT la chaîne, avec
 *    `tool: appel.nomComplet` — c'est-à-dire la valeur BRUTE de l'appelant, et
 *    le commentaire dit pourquoi (« le nom complet est CONNU dès l'entrée ») ;
 *  · l'étape 6 refuse l'outil inconnu, comme elle le doit ;
 *  · `avecJournal` écrit alors la ligne de ce refus, et `verifierAucunContenu()`
 *    du § 31 la REFUSE : « `tool` porte un espace — signature d'un extrait de
 *    contenu » ;
 *  · `ErreurContenuJournal` remonte à l'appelant, et **ZÉRO ligne** est écrite.
 *
 * ⚠️ CE N'EST PAS LA MÊME PANNE QUE LES SECTIONS PRÉCÉDENTES, ET IL FAUT
 *    L'ÉCRIRE : rien ne SORT — aucun effet extérieur n'a lieu, la porte est bien
 *    fermée. Ce qui est perdu, c'est la TRACE. Le § 24 compte les refus sur
 *    `ops_audit` ; ceux-là n'y sont pas. Un appelant qui veut sonder le socle
 *    sans laisser de ligne n'a qu'à mettre un espace dans le nom qu'il demande,
 *    et le § 31 — la garde qui protège le journal — est ce qui l'y aide.
 *
 * C'est le motif exact du témoin `recordIds` du lot 1b, refermé depuis par une
 * normalisation en amont. Le jumeau, sur `tool`, ne l'a pas été : la valeur qui
 * atteint la colonne vient toujours directement de l'appelant.
 */
describe("B4 · NOUVEAU — la ligne d'audit refusée par la garde qui la protège", () => {
  /**
   * TÉMOIN DE CAPACITÉ — SANS LUI, RIEN NE SE LIT.
   *
   * Un nom inconnu mais BIEN FORMÉ est refusé ET journalisé. C'est ce qui
   * distingue « cette forme-ci fait perdre la ligne » de « aucun refus d'outil
   * inconnu n'est jamais journalisé ».
   */
  it("SAIT ÉCRIRE : un nom inconnu bien formé est refusé ET journalisé", async () => {
    const harnais = fabriquerSocle();
    const resultat = await appeler(harnais, appel({ nomComplet: "inconnu.outil" }));
    const ecrites = lignes(harnais);

    console.info(
      `[B4 · capacité] verdict : ${issue(resultat)} · ` +
        `${String(ecrites.length)} ligne(s) écrite(s) · ` +
        `étape refusée : ${String(resultat.refus?.etape ?? "aucune")} · ` +
        `tool journalisé : ${ecrites[0]?.tool ?? "—"}`,
    );

    expect(issue(resultat), "un outil inconnu est refusé").toBe("refusé");
    expect(ecrites.length, "et le refus est attesté par une ligne").toBe(1);
  });

  /**
   * 🔴 NOUVEAU CONSTAT — **MAJEUR.** Trois formes, choisies par l'appelant, qui
   * font disparaître la ligne. Le compte est incrémenté DANS la boucle.
   */
  it.fails(
    "🔴 § 11 · § 24 — toute terminaison doit être attestée par une ligne, même refusée",
    async () => {
      const FORMES = [
        { nom: "un espace", valeur: "outil inconnu" },
        { nom: "une phrase lue", valeur: CONTENU_LU },
        { nom: "un saut de ligne", valeur: "outil\ninconnu" },
      ] as const;

      let soumises = 0;
      let levees = 0;
      let lignesEcrites = 0;
      const perdues: string[] = [];

      for (const forme of FORMES) {
        soumises += 1;
        const harnais = fabriquerSocle();
        try {
          await appeler(harnais, appel({ nomComplet: forme.valeur }));
        } catch {
          levees += 1;
        }
        const ecrites = lignes(harnais).length;
        lignesEcrites += ecrites;
        if (ecrites === 0) perdues.push(forme.nom);
      }

      console.info(
        `[B4 · perte de ligne] ${String(soumises)} forme(s) soumise(s) · ` +
          `${String(levees)} levée(s) · ${String(lignesEcrites)} ligne(s) écrite(s) au total · ` +
          `${String(perdues.length)} terminaison(s) SANS ligne : ${perdues.join(", ")}`,
      );

      // Faits qui survivront au correctif : aucun effet extérieur n'a eu lieu,
      // et les trois formes ont bien été soumises.
      expect(soumises, "plancher-témoin : trois formes").toBe(3);

      // L'ATTENTE DU § 11, celle qui échoue aujourd'hui.
      expect(perdues, "§ 24 — aucune terminaison ne doit rester hors du journal").toEqual([]);
      expect(lignesEcrites, "une ligne par appel soumis").toBe(soumises);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  B3 · LE CLIQUET DU § 20 — TRANSFORMER LE TEXTE NE SERT TOUJOURS À RIEN
// ═════════════════════════════════════════════════════════════════════════════

describe("B3 · cliquet — les cinq transformations du texte, rejouées PAR LA CHAÎNE", () => {
  /**
   * ✅ LE REJEU DU CLIQUET DU LOT 1b, MAIS DE BOUT EN BOUT.
   *
   * Le lot 1b l'avait mesuré sur l'étape seule ; ici c'est la chaîne complète,
   * avec un adaptateur espion. La propriété tient pour la même raison, et elle
   * est vérifiée sur l'INSTRUMENT plutôt que raisonnée : aucun des cinq textes
   * n'apparaît dans le message de refus, et les cinq refus sont IDENTIQUES.
   *
   * Une garde de forme — « l'argument reprend-il verbatim l'extrait lu ? » — en
   * laisserait passer quatre sur cinq. C'est ce que le § 20 a retiré, et ce
   * témoin chiffre ce que ça vaut.
   */
  it("refuse les cinq identiquement, et aucun message ne CITE le texte", async () => {
    const TRANSFORMATIONS = [
      { nom: "verbatim", texte: CONTENU_LU },
      { nom: "reformulation", texte: "Report du rendez-vous ; le dossier a changé de main." },
      { nom: "traduction", texte: "The meeting of the 12th is postponed; the file is at hand." },
      { nom: "découpage", texte: CONTENU_LU.slice(0, 24) },
      { nom: "encodage", texte: Buffer.from(CONTENU_LU, "utf8").toString("base64") },
    ] as const;

    const messages = new Set<string>();
    const citations: string[] = [];
    let servis = 0;
    let mesurees = 0;

    for (const variante of TRANSFORMATIONS) {
      const harnais = fabriquerSocle({
        outils: [
          outilDuCatalogue(),
          outilDuTiers({ inputSchema: schemaFerme({ requete: { type: "string" } }) }),
        ],
      });
      await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
      const resultat = await appeler(
        harnais,
        appel({ nomComplet: "annuaire.chercher", input: { requete: variante.texte } }),
      );
      mesurees += 1;
      if (resultat.refus === null) servis += 1;
      else {
        messages.add(resultat.refus.message);
        if (resultat.refus.message.includes(variante.texte)) citations.push(variante.nom);
      }
    }

    console.info(
      `[B3 · cliquet] ${String(mesurees)} variante(s) soumise(s) · ` +
        `${String(servis)} servie(s) · ${String(messages.size)} message(s) DISTINCT(s) · ` +
        `${String(citations.length)} message(s) citant le texte`,
    );

    expect(mesurees, "plancher-témoin : cinq variantes").toBe(5);
    expect(servis, "aucune ne passe").toBe(0);
    expect(messages.size, "un seul message : la garde ne regarde aucun texte").toBe(1);
    expect(citations, "et elle n'en cite aucun (§ 15)").toEqual([]);
  });

  /**
   * LA MESURE QUI EXPLIQUE POURQUOI : `ContexteProvenance` NE PORTE AUCUN TEXTE.
   *
   * Elle est DÉRIVÉE de la valeur reçue par l'étape, jamais lue dans une phrase.
   * C'est ce qui rend les cinq transformations sans effet, et c'est la moitié
   * solide de la garde — celle que les sections A2, A3, B1 et B2 n'atteignent
   * pas.
   */
  it("mesure que le contexte de l'étape 11 ne porte aucune chaîne de l'appelant", () => {
    const index = new IndexProvenanceMemoire({ maintenant: () => INSTANT });
    const session = sessionIdDeTemoin();
    const contexte = {
      sessionId: session,
      adapterId: DOMAINE_TIERS,
      porteUnArgumentLibre: true,
      porteUnArgumentDeGouvernance: false,
      niveau: "brouillon" as PolicyLevel,
      index,
    };

    const valeurs = Object.entries(contexte).filter(
      ([cle]) => cle !== "index" && cle !== "sessionId",
    );
    const porteursDeTexteLibre = valeurs.filter(
      ([, valeur]) => typeof valeur === "string" && valeur.length > 40,
    ).length;

    console.info(
      `[B3 · contexte] ${String(Object.keys(contexte).length)} champ(s) du contexte · ` +
        `${String(valeurs.length)} confronté(s) · ` +
        `${String(porteursDeTexteLibre)} porteur(s) d'une chaîne de plus de 40 caractères`,
    );

    expect(valeurs.length, "quatre champs confrontés, hors index et session").toBe(4);
    expect(porteursDeTexteLibre, "aucun ne porte de prose").toBe(0);
    // Cliquet de l'instrument : l'étape sait bien décider sur ce contexte-là.
    expect(etape11Provenance(contexte).issue, "session vierge : l'étape sait dire oui").toBe(
      "autorise",
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  L'OUTILLAGE D'ADMISSION — un manifeste BRUT, comme un dépôt tiers l'envoie
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ IL EST CONSTRUIT À LA MAIN, ET C'EST LE SEUL MOYEN DE MESURER CE QUI
 *    COMPTE. `creerAdapterKit()` part de Zod, qui n'émet ni `dependentSchemas`
 *    ni `unevaluatedProperties` : passer par lui reviendrait à éprouver le
 *    registre sur les seuls schémas que le kit sait produire, c'est-à-dire à ne
 *    pas éprouver le chemin du § 29 — « le CRM en PHP, dont la SEULE barrière
 *    est le registre ». Le sceau de profils, lui, est DÉRIVÉ de `SCEAU_PROFILS`
 *    et jamais recopié.
 */
function manifesteBrut(outil: {
  readonly inputSchema: ObjetJson;
  readonly idFields: readonly string[];
  readonly governanceFields: readonly string[];
}): Manifeste {
  // ⚠️ `bytes` EST DÉRIVÉ PAR LA MÊME FONCTION QUE LE REGISTRE, JAMAIS ÉCRIT.
  //    `enregistrerAdaptateur()` le RECALCULE et refuse l'écart — un nombre
  //    posé à la main ici ferait échouer l'admission pour un motif qui n'a rien
  //    à voir avec ce que ces témoins mesurent, et le refus se lirait comme une
  //    fermeture réussie. Le calcul exclut `bytes` de lui-même, exactement
  //    comme là-bas.
  const definition = {
    name: "chercher",
    version: "1.0.0",
    description: "Outil témoin de l'épreuve du § 20. Aucun métier.",
    effect: "read",
    dataClass: "none",
    idempotency: "n/a",
    pagination: "none",
    inputSchema: outil.inputSchema,
    outputSchema: schemaFerme({ id: { type: "string" } }),
    maxBytes: 8192,
    compaction: { free: [], tier2: [], aggregateBy: null },
    idFields: [...outil.idFields],
    governanceFields: [...outil.governanceFields],
  } as const;

  return {
    manifestVersion: VERSION_MANIFESTE,
    id: "epreuve",
    version: "1.0.0",
    mode: "fédéré",
    profilesVersion: SCEAU_PROFILS.version,
    profilesSha: SCEAU_PROFILS.empreinte,
    profiles: [PROFIL_TEMOIN],
    secrets: [],
    tools: [
      {
        ...definition,
        bytes: octetsCanoniques(versValeurJson(definition, "définition d'outil témoin")),
      },
    ],
  };
}

/** Un verrou COHÉRENT avec le manifeste — l'empreinte en est DÉRIVÉE. */
function verrouPour(manifeste: Manifeste): VerrouAdaptateurs {
  return {
    lockVersion: 1,
    adapters: [
      {
        id: manifeste.id,
        version: manifeste.version,
        mode: manifeste.mode,
        manifestSha: empreinteDuManifesteRecu(manifeste),
        trustTier: 1,
        maxDataClass: "personal",
        endpoint: "https://exemple.invalid/api/mcp",
        authMode: "secret-partage",
        secretRef: "epreuve.mcp.shared",
      },
    ],
  };
}

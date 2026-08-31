/**
 * `core/epreuve/lot1d-canaux-du-contexte.temoin.spec.ts` — LES SIX
 * CONTOURNEMENTS DES LOTS 1b ET 1c, REJOUÉS ; PUIS L'INVENTAIRE DES CANAUX,
 * ATTAQUÉ PAR SA MÉTHODE.
 *
 * ═══ CE QUE CE FICHIER FAIT, ET DANS QUEL ORDRE ═══
 *
 * Le lot 1d PRÉTEND avoir refermé six voies nommées par les épreuves
 * précédentes. Ce fichier ne relit pas ces prétentions : il les EXERCE, une par
 * une, par un test qui échouerait si elles n'étaient pas tenues.
 *
 *  · R1 — renouveler le `sessionId` entre la lecture et l'appel (ADR 0014) ;
 *  · R2 — déclarer `idFields` sur un champ de texte libre (ADR 0015) ;
 *  · R3 — employer une graphie de gouvernance qui échappe au filet (ADR 0016) ;
 *  · R4 — loger un champ libre sous `dependentSchemas` (garde de couverture) ;
 *  · R5 — la clé d'idempotence, ESSAYÉE SUR SES QUATRE DESTINATIONS (ADR 0020) ;
 *  · R6 — un envoi PARTI dont l'aval lève : la clé est-elle rejouable ? (ADR 0021).
 *
 * PUIS il attaque l'inventaire des canaux du `ctx` — non pas ses entrées, mais
 * **sa méthode** —, et il en trouve la borne.
 *
 * ═══ LA MÉTHODE, ET CE QU'ELLE DOIT AUX ÉPREUVES PRÉCÉDENTES ═══
 *
 * L'épreuve du lot 1c a établi la règle : on attaque par le HAUT,
 * `orchestrerAppel()`, avec un adaptateur ESPION qui mesure ce qui SORT
 * réellement. Une correction écrite dans un module et jamais branchée dans la
 * chaîne est verte pour ses propres gardes et n'arrête personne.
 *
 * Ce fichier-ci ajoute UNE chose, et c'est elle qui trouve la section N :
 * **il n'écrit aucune liste qu'il pourrait dériver.** Les graphies de
 * gouvernance ne sont pas recopiées du rapport du lot 1b — elles sont
 * FABRIQUÉES puis passées au crible de `familleDeGouvernance()`, et seules
 * celles que le filet laisse passer servent de témoin. Les champs du `ctx` ne
 * sont pas énumérés à la main — ils sont lus dans le SOURCE, par la même
 * fonction que le contrôle 7 du § 09. Une liste recopiée mesure l'état du jour
 * où on l'a écrite ; une dérivation mesure l'état d'aujourd'hui.
 *
 * ═══ L'IDIOME, ET LA DISCIPLINE QU'IL IMPOSE ═══
 *
 * Chaque témoin marqué 🔴 porte l'assertion CORRECTE — celle du CDC ou de l'ADR
 * — sous `it.fails`. Il est vert AUJOURD'HUI parce qu'elle échoue, et il ROUGIRA
 * le jour du correctif, forçant celui qui corrige à le repasser en `it()`.
 *
 * ⚠️ CONSÉQUENCE STRICTE : un `it.fails` est vert dès qu'UNE de ses assertions
 *    échoue, POUR N'IMPORTE QUELLE RAISON — un import cassé compris. Les
 *    assertions de FAIT y sont donc limitées à celles qui resteront VRAIES après
 *    le correctif, et un PLANCHER en `it()` ordinaire ouvre le fichier : sans
 *    lui, une régression d'import rendrait tous les `it.fails` verts et ce
 *    fichier annoncerait des défauts qu'il n'aurait pas mesurés.
 *
 * Chaque famille est APPARIÉE à un témoin de CAPACITÉ en `it()` ordinaire, qui
 * prouve que l'instrument SAIT DIRE OUI et SAIT DIRE NON.
 *
 * Chaque `it` ANNONCE COMBIEN D'ÉLÉMENTS IL A MESURÉS, et le compte est
 * incrémenté DANS la boucle ou lu sur le sujet — jamais rendu de confiance
 * depuis la longueur d'un tableau écrit à la main.
 *
 * ═══ DÉPÔT PUBLIC ═══
 *
 * AUCUN SECRET RÉEL, AUCUN APPEL RÉSEAU, AUCUNE MIGRATION, AUCUN IDENTIFIANT
 * D'INFRASTRUCTURE, AUCUNE DONNÉE PERSONNELLE. Les deux clés du harnais sont
 * fabriquées pour ce fichier et nommées comme telles.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { lireClesDAutorisation, proprietesDInterface } from "../adapter-kit/autorisation.js";
import { analyserFermeture } from "../adapter-kit/fermeture.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
import type { ObjetJson } from "../adapter-kit/json.js";
import { HorlogeFigee, SCELLEUR_TEMOIN } from "../audit/fixtures.js";
import { Journal, JournalMemoire, type LigneAudit } from "../audit/index.js";
import { correspondanceCanonique, etape05Scopes } from "../chaine/etape-05-scopes.js";
import {
  creerEtapeCatalogue,
  type AlerteEpinglage,
  type DeclarationOutilRecue,
  type DemandeDesactivation,
} from "../chaine/etape-06-outil.js";
import { creerSignataireCurseur, etapeCurseur } from "../chaine/etape-09-curseur.js";
import {
  IndexProvenanceMemoire,
  analyserArgumentsDuSchema,
  etape11Provenance,
  familleDeGouvernance,
} from "../chaine/etape-11-provenance.js";
import { executerEtape14 } from "../chaine/etape-14-execution.js";
import type {
  ChargeAdaptateur,
  ExecutionEtablie,
  Masquage,
  OutilDuCatalogue,
} from "../chaine/etapes.js";
import {
  INTENTION_NON_ARMEE,
  empreintesParDefaut,
  identiteStdio,
  orchestrerAppel,
  type AppelEntrant,
  type ContexteSansEmpreinte,
  type DependancesOrchestrateur,
  type IdentiteAppelante,
  type ReglagesDeLOutil,
  type ResultatAppel,
} from "../chaine/orchestrateur.js";
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import {
  DepotIdempotenceEnMemoire,
  DepotQuotaEnMemoire,
  empreinteDeCleDIdempotence,
  formeDeCleValide,
  issueDeReservation,
  type ResultatValidation,
} from "../limits/index.js";
import { estEffetExterieur, type NiveauApplique } from "../policy/index.js";
import type { ProfileName } from "../profiles/index.js";
import {
  EFFECTS,
  STATUT_DES_CANAUX_DE_CONTEXTE,
  STATUT_DES_CANAUX_D_APPEL,
  STATUT_DES_CANAUX_D_IDENTITE,
  type Habilitations,
  type OpsScope,
  type ToolContext,
} from "../types.js";
import { correspondance } from "./outils.js";

// ═════════════════════════════════════════════════════════════════════════════
//  LE DÉCOR
// ═════════════════════════════════════════════════════════════════════════════

/** ⚠️ AUCUN SECRET RÉEL. Chaîne fabriquée pour ce fichier. */
const CLE_CURSEUR_DU_LOT_1D = "cle-curseur-de-l-epreuve-du-lot-1d-non-secrete";

const INSTANT = new Date("2026-08-31T12:00:00.000Z");
const PROFIL: ProfileName = "courrier";
const HABILITATIONS: Habilitations = { peutVoirAppels: false };

/** Le domaine où la session LIT du `personal` : c'est lui qui MARQUE. */
const DOMAINE_LU = "boite-courrier";
/** Le domaine vers lequel l'attaquant veut faire SORTIR. */
const DOMAINE_TIERS = "annuaire-externe";

/**
 * Le texte que l'attaquant veut faire sortir. AUCUNE DONNÉE RÉELLE — une phrase
 * fabriquée pour ce fichier, sans nom, sans adresse, sans identifiant.
 */
const TEXTE_LU = "Le pli du 12 est reporte ; le dossier attend une signature.";

/**
 * Un marqueur SANS ESPACE ni ponctuation de phrase, pour la section N1.
 *
 * ⚠️ IL EST DISTINCT DE `TEXTE_LU`, ET C'EST NÉCESSAIRE. La section N1 mesure
 *    QUELS CHAMPS transportent une valeur choisie par l'appelant jusqu'à
 *    l'adaptateur — pas si le § 20 les refuse. Un marqueur portant un espace
 *    ferait refuser la ligne d'audit (§ 31) et l'appel n'irait jamais jusqu'à
 *    l'adaptateur : la mesure serait vide, et se lirait comme « aucun canal ».
 */
const MARQUEUR = "MARQUEUR-DE-CANAL-0f3a";

const SCHEMA_VIDE: ObjetJson = { type: "object", properties: {}, additionalProperties: false };

function schemaFerme(proprietes: Record<string, ObjetJson>): ObjetJson {
  return { type: "object", properties: proprietes, additionalProperties: false };
}

// ═════════════════════════════════════════════════════════════════════════════
//  LE HARNAIS — la chaîne complète, deux domaines, un adaptateur ESPION
// ═════════════════════════════════════════════════════════════════════════════

const MASQUAGE_NEUTRE: Masquage = {
  appliquer(charge: unknown): { readonly charge: unknown; readonly champsMasques: number } {
    return { charge, champsMasques: 0 };
  },
};

/**
 * Niveau « libre » — le SEUL sous lequel un effet extérieur part sans jeton de
 * confirmation (§ 20 ; `destructive` reste confirmé à tous les niveaux). La
 * section R6 en a besoin : elle mesure des envois RÉELS.
 */
const NIVEAU_LIBRE: NiveauApplique = {
  niveau: "libre",
  raison: "lignes-couvrantes",
  mesures: 3,
  enVigueur: 1,
  retenues: [],
  anomalies: [],
};

/** Niveau « brouillon » : aucune confirmation ne peut être délivrée (§ 20). */
const NIVEAU_BROUILLON: NiveauApplique = {
  niveau: "brouillon",
  raison: "aucune-ligne-couvrante",
  mesures: 3,
  enVigueur: 1,
  retenues: [],
  anomalies: [],
};

function outilLecteur(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  const base: OutilDuCatalogue = {
    name: "courrier.lire",
    version: "1.0.0",
    description: "Outil temoin du lot 1d. Aucun metier.",
    inputSchema: SCHEMA_VIDE,
    outputSchema: SCHEMA_VIDE,
    profiles: [PROFIL],
    enabled: true,
    retireDeLaListe: false,
    adapterId: DOMAINE_LU,
    adapterVersion: "1.0.0",
    effect: "read",
    dataClass: "personal",
    pagination: "none",
    compaction: { free: [], tier2: [], aggregateBy: null },
    maxBytes: 8192,
    idFields: [],
    governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
  };
  return { ...base, ...surcharge };
}

/** L'outil du DOMAINE TIERS — celui vers lequel on essaie de faire sortir. */
function outilTiers(surcharge: Partial<OutilDuCatalogue> = {}): OutilDuCatalogue {
  return outilLecteur({
    name: "annuaire.chercher",
    adapterId: DOMAINE_TIERS,
    dataClass: "none",
    ...surcharge,
  });
}

/** Ce que l'adaptateur a reçu. C'EST ÇA, la sortie de contenu. */
interface RecuParLAdaptateur {
  readonly contexte: ToolContext<ProfileName>;
  readonly entree: unknown;
}

interface Reglages {
  readonly outils?: readonly OutilDuCatalogue[];
  readonly reglagesOutil?: ReglagesDeLOutil;
  readonly niveau?: NiveauApplique;
  /** Ce que l'adaptateur rend, ou lève, APRÈS avoir été atteint. */
  readonly reponseAdaptateur?: (recu: RecuParLAdaptateur) => Promise<ChargeAdaptateur>;
  /** Un index qui lève au marquage — la panne d'AVAL de la section R6. */
  readonly indexQuiLeve?: boolean;
  /** Les scopes du jeton. Par défaut : ceux du transport stdio, qui EXCLUENT `ops:send`. */
  readonly scopes?: readonly OpsScope[];
}

interface Harnais {
  readonly deps: DependancesOrchestrateur;
  readonly identite: IdentiteAppelante;
  readonly index: IndexProvenanceMemoire;
  readonly store: JournalMemoire;
  /** Tout ce que l'adaptateur a reçu, DANS L'ORDRE. */
  readonly recus: RecuParLAdaptateur[];
  readonly idempotence: DepotIdempotenceEnMemoire;
}

/**
 * L'index de provenance qui LÈVE au marquage — la panne d'AVAL.
 *
 * ⚠️ ELLE EST POSTÉRIEURE AU RETOUR DE L'ADAPTATEUR, et c'est tout le point de
 *    la section R6 : l'effet est DÉJÀ parti quand elle se produit.
 */
class IndexQuiLeveApresLEnvoi extends IndexProvenanceMemoire {
  override marquer(...args: Parameters<IndexProvenanceMemoire["marquer"]>): void {
    super.marquer(...args);
    throw new Error("panne d'aval fabriquee : le marquage de provenance a leve");
  }
}

function monterSocle(reglages: Reglages = {}): Harnais {
  const store = new JournalMemoire();
  const journal = new Journal(SCELLEUR_TEMOIN, store, new HorlogeFigee(INSTANT.getTime()));
  const index =
    reglages.indexQuiLeve === true
      ? new IndexQuiLeveApresLEnvoi({ maintenant: () => INSTANT })
      : new IndexProvenanceMemoire({ maintenant: () => INSTANT });
  const idempotence = new DepotIdempotenceEnMemoire();
  const outils = reglages.outils ?? [outilLecteur(), outilTiers()];
  const recus: RecuParLAdaptateur[] = [];

  // ⚠️ L'IDENTITÉ VIENT D'`identiteStdio()`, ET C'EST LE POINT. C'est le SEUL
  //    chemin livré par lequel une session est frappée (ADR 0014). Un harnais qui
  //    écrirait une session à la main éprouverait ce que le socle n'établit pas.
  const identite = identiteStdio({
    requestId: "req-lot-1d",
    deadline: new Date(INSTANT.getTime() + 30_000),
    habilitations: HABILITATIONS,
    ...(reglages.scopes === undefined ? {} : { scopes: reglages.scopes }),
  });

  const deps: DependancesOrchestrateur = {
    transport: "stdio",
    journal,
    intention: INTENTION_NON_ARMEE,
    coffre: {
      refusDAppelDOutil() {
        return null;
      },
    },
    catalogue: {
      relire(nom: string): Promise<OutilDuCatalogue | null> {
        return Promise.resolve(outils.find((outil) => outil.name === nom) ?? null);
      },
    },
    pilotage: {
      profilActif(): Promise<ProfileName | null> {
        return Promise.resolve(PROFIL);
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
        // Aucune confirmation humaine : c'est ce que l'attaquant ne fabrique pas.
        return Promise.resolve("invalide");
      },
    },
    calculArgHash: correspondance,
    index,
    signataireCurseur: creerSignataireCurseur({
      lireCleCurseur: () => Promise.resolve(CLE_CURSEUR_DU_LOT_1D),
    }),
    correspondanceScopes: correspondanceCanonique,
    depotQuota: new DepotQuotaEnMemoire(),
    depotIdempotence: idempotence,

    etapeScopes: etape05Scopes,
    etapeCatalogue: creerEtapeCatalogue({
      declarations: {
        relire(nom: string): Promise<DeclarationOutilRecue | null> {
          const outil = outils.find((candidat) => candidat.name === nom);
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
    //    `validerEntree` est un PORT — le socle ne porte aucun validateur. Ce que
    //    ce fichier mesure est donc la DÉRIVATION DU SOCLE (ce que le § 20 voit
    //    d'un schéma), jamais « ce payload passerait-il chez cet adaptateur ».
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
        requestId: identiteRecue.requestId,
        deadline: identiteRecue.deadline,
        habilitations: identiteRecue.habilitations,
      };
    },
    appelAdaptateur(contexte, entree): Promise<ChargeAdaptateur> {
      // ⚠️ C'EST ICI, ET NULLE PART AILLEURS, QUE LE CONTENU SORT DU SOCLE.
      const recu: RecuParLAdaptateur = { contexte, entree };
      recus.push(recu);
      if (reglages.reponseAdaptateur !== undefined) return reglages.reponseAdaptateur(recu);
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

function lignes(harnais: Harnais): readonly LigneAudit[] {
  return harnais.store.toutes();
}

/**
 * CETTE VALEUR APPARAÎT-ELLE, N'IMPORTE OÙ, DANS CET OBJET ?
 *
 * ⚠️ ELLE CHERCHE À TOUTE PROFONDEUR ET SOUS TOUT NOM. Une mesure qui
 *    n'interrogerait qu'un champ convenu serait juste sur les témoins
 *    d'aujourd'hui et muette sur le premier qui logerait la valeur ailleurs —
 *    c'est-à-dire aveugle exactement au cas qu'on cherche.
 */
function contient(objet: unknown, aiguille: string): boolean {
  try {
    return JSON.stringify(objet ?? null)?.includes(aiguille) === true;
  } catch {
    return false;
  }
}

/** Le source de `core/chaine/orchestrateur.ts`, lu une fois. */
const SOURCE_ORCHESTRATEUR = readFileSync(
  fileURLToPath(new URL("../chaine/orchestrateur.ts", import.meta.url)),
  "utf8",
);

// ═════════════════════════════════════════════════════════════════════════════
//  LE PLANCHER — sans lui, tous les `it.fails` de ce fichier seraient muets
// ═════════════════════════════════════════════════════════════════════════════

describe("PLANCHER · le harnais s'exécute vraiment", () => {
  it("un appel ordinaire est SERVI, atteint l'adaptateur et laisse UNE ligne", async () => {
    const harnais = monterSocle();
    const resultat = await appeler(harnais, appel());
    const ecrites = lignes(harnais);

    console.info(
      `[plancher] verdict : ${issue(resultat)} · ` +
        `${String(harnais.recus.length)} appel(s) chez l'adaptateur · ` +
        `${String(ecrites.length)} ligne(s) d'audit · ` +
        `${String(harnais.index.etat().sessions)} session(s) marquée(s)`,
    );

    expect(issue(resultat), "le harnais doit savoir servir un appel").toBe("servi");
    expect(harnais.recus.length, "l'adaptateur doit avoir été atteint").toBe(1);
    expect(ecrites.length, "et la terminaison doit être attestée").toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  R1 · REJEU — RENOUVELER LE `sessionId` ENTRE LA LECTURE ET L'APPEL
// ═════════════════════════════════════════════════════════════════════════════

describe("R1 · rejeu — le renouvellement de session (ADR 0014)", () => {
  /**
   * ✅ CE TEST ÉCHOUERAIT SI LA VOIE N'ÉTAIT PAS FERMÉE. La branche « seconde
   * identité du même démon » EST le geste désarmant : si `identiteStdio()`
   * frappait une session par appel, ou en reprenait une d'un paramètre, elle
   * rendrait « servi » et cette ligne rougirait.
   *
   * Le pire cas du § 20 est monté chez le tiers : argument libre ET argument de
   * gouvernance retenu par le nom, vers un AUTRE domaine.
   */
  it("SAIT DIRE NON puis OUI : quatre branches, une seule sert", async () => {
    const harnais = monterSocle({
      outils: [
        outilLecteur(),
        outilTiers({
          inputSchema: schemaFerme({ requete: { type: "string" }, to: { type: "string" } }),
        }),
      ],
    });

    const lecture = await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const etat = harnais.index.etat();

    const branches: (readonly [string, "servi" | "refusé"])[] = [];

    branches.push([
      "même identité",
      issue(await appeler(harnais, appel({ nomComplet: "annuaire.chercher" }))),
    ]);

    // LE GESTE DE L'ATTAQUE : redemander une identité au même démon.
    branches.push([
      "stdio — 2ᵉ identité du même démon",
      issue(
        await appeler(
          harnais,
          appel({ nomComplet: "annuaire.chercher" }),
          identiteStdio({
            requestId: "req-seconde",
            deadline: new Date(INSTANT.getTime() + 30_000),
            habilitations: HABILITATIONS,
          }),
        ),
      ),
    ]);

    // Le MÊME domaine que la lecture : le § 20 ne parle que d'un AUTRE domaine.
    // Sans cette branche, les refus ci-dessus seraient verts pour une étape 11
    // qui refuserait tout.
    branches.push([
      "même domaine que la lecture",
      issue(await appeler(harnais, appel({ nomComplet: "courrier.lire" }))),
    ]);

    // ⚠️ LA BORNE, ASSUMÉE PAR L'ADR 0014 : une session VRAIMENT neuve — ce qu'un
    //    NOUVEL OCTROI donne, au prix d'un geste humain — passe.
    branches.push([
      "session vraiment neuve (borne assumée)",
      issue(
        await appeler(harnais, appel({ nomComplet: "annuaire.chercher" }), {
          ...harnais.identite,
          sessionId: sessionIdDeTemoin(),
        }),
      ),
    ]);

    const servies = branches.filter(([, verdict]) => verdict === "servi").length;

    console.info(
      `[R1] ${String(branches.length)} branche(s) confrontée(s) · ` +
        `${String(servies)} servie(s) · ${String(etat.sessions)} session(s) marquée(s) · ` +
        `${String(etat.extraits)} extrait(s) indexé(s) · indéterminé : ${String(etat.indetermine)}\n` +
        branches.map(([nom, verdict]) => `        · ${nom} : ${verdict}`).join("\n"),
    );

    // Sans ces comptes, un « refusé » serait indiscernable d'un socle qui refuse
    // tout, et un « servi » d'un index vide.
    expect(issue(lecture), "la lecture qui marque doit être SERVIE").toBe("servi");
    expect(etat.sessions, "une session marquée, pas zéro").toBe(1);
    expect(etat.extraits, "au moins un extrait indexé").toBeGreaterThan(0);

    expect(branches[0]?.[1], "même identité : refusé").toBe("refusé");
    expect(branches[1]?.[1], "renouveler la session ne désarme PAS l'étape 11").toBe("refusé");
    expect(branches[2]?.[1], "le même domaine que la lecture reste servi").toBe("servi");
    expect(branches[3]?.[1], "une session neuve passe — borne assumée de l'ADR 0014").toBe("servi");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  R2 · REJEU — `idFields` SUR UN CHAMP DE TEXTE LIBRE (ADR 0015)
// ═════════════════════════════════════════════════════════════════════════════

describe("R2 · rejeu — `idFields` sur un champ de texte libre (ADR 0015)", () => {
  /**
   * ✅ LA DÉCLARATION N'EXONÈRE PLUS RIEN, ET C'EST MESURÉ SUR LE VERDICT.
   *
   * Le témoin confronte DEUX outils qui ne diffèrent que par `idFields`, et
   * exige le MÊME verdict. Mesurer un seul des deux laisserait « refusé » se
   * confondre avec « ce socle refuse tout ».
   */
  it("deux outils qui ne diffèrent que par `idFields` reçoivent le MÊME verdict", async () => {
    const schema = schemaFerme({ requete: { type: "string" } });

    const verdicts: (readonly [string, "servi" | "refusé"])[] = [];
    let mesures = 0;

    for (const declaration of [[], ["requete"]] as const) {
      mesures += 1;
      const harnais = monterSocle({
        outils: [outilLecteur(), outilTiers({ inputSchema: schema, idFields: declaration })],
      });
      await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
      const verdict = issue(
        await appeler(
          harnais,
          appel({ nomComplet: "annuaire.chercher", input: { requete: TEXTE_LU } }),
        ),
      );
      verdicts.push([
        declaration.length === 0 ? "sans idFields" : '`idFields: ["requete"]`',
        verdict,
      ]);
    }

    const sorties = verdicts.filter(([, verdict]) => verdict === "servi").length;

    console.info(
      `[R2] ${String(mesures)} outil(s) confronté(s) · ${String(sorties)} servi(s) · ` +
        verdicts.map(([nom, verdict]) => `${nom} : ${verdict}`).join(" · "),
    );

    expect(mesures, "plancher : deux outils mesurés").toBe(2);
    expect(verdicts[0]?.[1], "sans déclaration, l'appel est refusé").toBe("refusé");
    expect(verdicts[1]?.[1], "AVEC la déclaration, il l'est TOUJOURS — ADR 0015").toBe("refusé");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  R3 · REJEU — LES GRAPHIES DE GOUVERNANCE QUI ÉCHAPPENT AU FILET (ADR 0016)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES GRAPHIES SONT DÉRIVÉES, PAS RECOPIÉES.
 *
 * ⚠️ C'EST LA DIFFÉRENCE QUI COMPTE. Le rapport du lot 1b nomme neuf graphies
 *    qui échappaient au filet. Les recopier ici ferait un témoin qui mesure
 *    l'état du jour où la liste a été écrite : si le filet gagnait un motif
 *    demain, le témoin resterait vert en éprouvant des noms désormais retenus,
 *    et il cesserait de mesurer ce qu'il annonce. Ce fichier soumet donc des
 *    graphies CANDIDATES au crible de `familleDeGouvernance()`, et ne garde que
 *    celles que le filet laisse VRAIMENT passer aujourd'hui.
 */
const GRAPHIES_CANDIDATES: readonly string[] = [
  "emailTo",
  "adresseDeReponse",
  "envoyerA",
  "validUntil",
  "maxAge",
  "dateDebut",
  "scheduledFor",
  "profil",
  "toolset",
  // Quatre que le filet DOIT retenir : sans elles, « échappe » serait
  // indiscernable de « le crible ne fonctionne pas ».
  "to",
  "ttl",
  "policyLevel",
  "recipients",
];

describe("R3 · rejeu — la graphie de gouvernance déclarée (ADR 0016)", () => {
  /**
   * TÉMOIN DE CAPACITÉ — LE CRIBLE SAIT DIRE OUI ET NON.
   *
   * Sans lui, la section suivante ne distinguerait pas « ces graphies échappent »
   * de « `familleDeGouvernance()` ne retient jamais rien ».
   */
  it("le crible retient et laisse passer : les deux sont mesurés", () => {
    const retenues: string[] = [];
    const echappees: string[] = [];
    let confrontees = 0;

    for (const graphie of GRAPHIES_CANDIDATES) {
      confrontees += 1;
      if (familleDeGouvernance(graphie) === null) echappees.push(graphie);
      else retenues.push(graphie);
    }

    console.info(
      `[R3 · crible] ${String(confrontees)} graphie(s) confrontée(s) · ` +
        `${String(retenues.length)} retenue(s) par le NOM · ` +
        `${String(echappees.length)} échappée(s) : ${echappees.join(", ")}`,
    );

    expect(confrontees, "plancher : le crible a bien tourné").toBe(GRAPHIES_CANDIDATES.length);
    expect(retenues.length, "le filet retient encore quelque chose").toBeGreaterThan(0);
    expect(echappees.length, "et il laisse encore passer quelque chose").toBeGreaterThan(0);
  });

  /**
   * ✅ CE TEST ÉCHOUERAIT SI LA DÉCLARATION N'ÉTAIT PAS COUSUE À LA CHAÎNE.
   *
   * C'est le défaut nommé par l'épreuve du lot 1c : `cumulerChampsDeGouvernance`
   * existait, était exportée, était gardée, et AUCUN module de production ne
   * l'appelait. On mesure ici le VERDICT de bout en bout, pas la fonction.
   *
   * ⚠️ LA BRANCHE DE GOUVERNANCE NE S'ISOLE QU'AVEC ZÉRO ARGUMENT LIBRE. Le
   *    champ déclaré est donc fermé par un `enum` : sans cette précaution, un
   *    « refusé » viendrait de la branche 4 (argument libre) et non de la
   *    branche 1, et le témoin conclurait juste pour une mauvaise raison. Le
   *    contre-témoin ci-dessous le VÉRIFIE au lieu de le supposer.
   */
  it("chaque graphie ÉCHAPPÉE, une fois DÉCLARÉE, fait refuser l'appel", async () => {
    const echappees = GRAPHIES_CANDIDATES.filter((nom) => familleDeGouvernance(nom) === null);

    let eprouvees = 0;
    const servies: string[] = [];

    for (const graphie of echappees) {
      eprouvees += 1;
      const harnais = monterSocle({
        outils: [
          outilLecteur(),
          outilTiers({
            // Fermé par un `enum` : ZÉRO argument libre. La seule branche
            // possible est donc celle de la gouvernance.
            inputSchema: schemaFerme({ [graphie]: { type: "string", enum: ["a", "b"] } }),
            governanceFields: [graphie],
          }),
        ],
      });
      await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
      const verdict = await appeler(
        harnais,
        appel({ nomComplet: "annuaire.chercher", input: { [graphie]: "a" } }),
      );
      if (issue(verdict) === "servi") servies.push(graphie);
    }

    console.info(
      `[R3 · déclaration] ${String(eprouvees)} graphie(s) échappée(s) éprouvée(s) · ` +
        `${String(servies.length)} encore servie(s) : ${servies.join(", ") || "aucune"}`,
    );

    expect(eprouvees, "plancher : au moins une graphie échappée a été éprouvée").toBeGreaterThan(0);
    expect(servies, "ADR 0016 — une graphie déclarée est surveillée").toEqual([]);
  });

  /**
   * CONTRE-TÉMOIN — IL ISOLE LA RÈGLE, ET IL EST INDISPENSABLE.
   *
   * Le MÊME schéma fermé par un `enum`, SANS déclaration : l'appel doit passer.
   * Sans lui, le témoin précédent serait vert même si tout appel vers le tiers
   * était refusé — et on lirait une couture qui n'existe pas.
   */
  it("SAIT DIRE OUI : le même schéma SANS déclaration passe", async () => {
    const echappees = GRAPHIES_CANDIDATES.filter((nom) => familleDeGouvernance(nom) === null);
    let eprouvees = 0;
    const refusees: string[] = [];

    for (const graphie of echappees) {
      eprouvees += 1;
      const harnais = monterSocle({
        outils: [
          outilLecteur(),
          outilTiers({
            inputSchema: schemaFerme({ [graphie]: { type: "string", enum: ["a", "b"] } }),
            governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
          }),
        ],
      });
      await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
      const verdict = await appeler(
        harnais,
        appel({ nomComplet: "annuaire.chercher", input: { [graphie]: "a" } }),
      );
      if (issue(verdict) === "refusé") refusees.push(graphie);
    }

    console.info(
      `[R3 · contre-témoin] ${String(eprouvees)} graphie(s) éprouvée(s) sans déclaration · ` +
        `${String(refusees.length)} refusée(s) : ${refusees.join(", ") || "aucune"}`,
    );

    expect(eprouvees, "plancher : le contre-témoin a tourné").toBeGreaterThan(0);
    expect(refusees, "sans déclaration, le filet ne retient pas ces graphies").toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  R4 · REJEU — UN CHAMP LIBRE SOUS `dependentSchemas`
// ═════════════════════════════════════════════════════════════════════════════

describe("R4 · rejeu — le champ libre logé sous `dependentSchemas`", () => {
  /**
   * ✅ CE TEST ÉCHOUERAIT SI LE PARCOURS NE DESCENDAIT PAS DANS
   * `dependentSchemas`. Il mesure le VERDICT de la chaîne, pas la liste
   * d'applicateurs : une entrée ajoutée à la liste sans que le parcours en tienne
   * compte laisserait ce témoin rouge.
   */
  it("un `corps` libre logé sous `dependentSchemas` fait REFUSER l'appel", async () => {
    const schema: ObjetJson = {
      type: "object",
      properties: { mode: { type: "string", enum: ["brouillon", "envoi"] } },
      dependentSchemas: {
        mode: {
          type: "object",
          properties: { corps: { type: "string" } },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    };

    const harnais = monterSocle({
      outils: [outilLecteur(), outilTiers({ inputSchema: schema })],
    });
    await appeler(harnais, appel({ nomComplet: "courrier.lire" }));
    const verdict = await appeler(
      harnais,
      appel({ nomComplet: "annuaire.chercher", input: { mode: "envoi", corps: TEXTE_LU } }),
    );
    const sorti = harnais.recus.filter((recu) => contient(recu.entree, TEXTE_LU)).length;

    console.info(
      `[R4] verdict : ${issue(verdict)} · ` +
        `${String(harnais.recus.length)} appel(s) chez un adaptateur · ` +
        `${String(sorti)} porteur(s) du texte lu · étape refusante : ` +
        String(verdict.refus?.etape ?? "aucune"),
    );

    expect(issue(verdict), "un champ libre sous `dependentSchemas` est VU par le § 20").toBe(
      "refusé",
    );
    expect(sorti, "et le texte n'atteint aucun adaptateur tiers").toBe(0);
  });

  /**
   * ⚠️ **LE MOT-CLÉ VOISIN, ET LA BORNE QU'IL RÉVÈLE — CE N'EST PAS UN DÉFAUT,
   * C'EST UNE DÉPENDANCE NON ÉCRITE.**
   *
   * `dependentSchemas` a été refermé en ajoutant le mot-clé au PARCOURS. Mais le
   * consommateur du parcours, `analyserArgumentsDuSchema()`, ne lit que
   * `sous["properties"]` de chaque sous-schéma trouvé. Un champ déclaré par
   * `patternProperties` n'est donc PAS une propriété au sens de cette boucle :
   * le § 20 en voit **zéro**, et `porteUnArgumentLibre` reste faux — alors que le
   * schéma accepte bel et bien une chaîne arbitraire sous ce nom.
   *
   * ✅ **CE QUI SAUVE LE CAS AUJOURD'HUI N'EST PAS LE § 20, C'EST LE § 09.**
   *    `analyserFermeture()` refuse un tel schéma à l'admission — « l'ensemble des
   *    noms admis n'est pas énumérable ». Aucun outil portant cette forme n'entre
   *    donc au catalogue, et le trou n'est pas exploitable.
   *
   * ⚠️ MAIS CETTE DÉPENDANCE N'EST ÉCRITE NULLE PART, et c'est ce que ce témoin
   *    pose : la garde d'exfiltration du § 20 est FAIL-OPEN sur `patternProperties`
   *    (zéro champ vu, donc « appel inoffensif »), et elle ne tient que parce
   *    qu'une garde VOISINE, écrite pour une autre raison, ferme la porte en
   *    amont. Le jour où le § 09 admettrait une forme de `patternProperties`
   *    bornée — un motif ancré, une longueur maximale —, le § 20 redeviendrait
   *    aveugle SANS QU'AUCUNE GARDE NE CHANGE DE COULEUR. C'est exactement le
   *    motif du défaut `dependentSchemas`, un mot-clé plus loin.
   *
   * Les DEUX moitiés sont mesurées ci-dessous, parce qu'aucune ne se lit seule.
   */
  it("`patternProperties` : le § 20 n'y voit RIEN, et c'est le § 09 qui ferme", () => {
    const schema: ObjetJson = {
      type: "object",
      properties: {},
      patternProperties: { "^corps$": { type: "string" } },
      additionalProperties: false,
    };

    const analyse = analyserArgumentsDuSchema(schema, AUCUN_CHAMP_DE_GOUVERNANCE);
    const fermeture = analyserFermeture(schema);

    console.info(
      `[R4 · patternProperties] § 20 : ${String(analyse.sousSchemasInspectes)} sous-schéma(s) ` +
        `visité(s) · ${String(analyse.proprietesInspectees)} propriété(s) inspectée(s) · ` +
        `${String(analyse.libres.length)} champ(s) libre(s) vu(s) · ` +
        `porteUnArgumentLibre : ${String(analyse.porteUnArgumentLibre)} — ` +
        `§ 09 : fermé = ${String(fermeture.ferme)} · ` +
        `${String(fermeture.ouverts.length)} ouvert(s) signalé(s)`,
    );

    // Le parcours DESCEND bien — sans ce compte, « zéro champ libre » se lirait
    // comme « le schéma est inoffensif » plutôt que « la boucle ne l'a pas lu ».
    expect(analyse.sousSchemasInspectes, "le parcours descend dans `patternProperties`").toBe(2);
    expect(analyse.proprietesInspectees, "mais il n'y inspecte AUCUNE propriété").toBe(0);
    expect(analyse.porteUnArgumentLibre, "le § 20 conclut donc « aucun argument libre »").toBe(
      false,
    );

    // Et c'est la garde VOISINE qui tient la porte.
    expect(fermeture.ferme, "le § 09 refuse ce schéma à l'admission").toBe(false);
    expect(fermeture.ouverts.length, "et il DIT pourquoi").toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  R5 · REJEU — LA CLÉ D'IDEMPOTENCE, SUR SES QUATRE DESTINATIONS (ADR 0020)
// ═════════════════════════════════════════════════════════════════════════════

describe("R5 · rejeu — rouvrir le canal `idempotencyKey` (ADR 0020)", () => {
  /**
   * ✅ LES QUATRE DESTINATIONS DE LA CHAÎNE D'ORIGINE, MESURÉES ENSEMBLE.
   *
   * L'ADR 0020 en nomme trois (le `ctx`, `ops_idempotency.key`, le message de
   * refus) ; la quatrième est le JOURNAL, qu'aucune des trois ne couvre. Les
   * mesurer une par une aurait laissé croire qu'en fermer une les ferme toutes.
   *
   * ⚠️ LA CLÉ EMPLOYÉE EST BIEN FORMÉE. Une clé mal formée serait refusée à
   *    l'étape 13 et n'atteindrait jamais l'adaptateur : le témoin serait vert
   *    sans avoir rien mesuré. La forme est VÉRIFIÉE avant de conclure.
   */
  it("la chaîne d'origine n'atteint AUCUNE des quatre destinations", async () => {
    const CLE = "cle-du-lot-1d-0f3a-bien-formee";
    const harnais = monterSocle({
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });

    const resultat = await appeler(harnais, appel({ idempotencyKey: CLE }));
    const recu = harnais.recus[0];
    const ligneIdem = [...harnais.idempotence.lignes.values()][0];
    const destinations: (readonly [string, boolean])[] = [
      ["le `ctx` de l'adaptateur", contient(recu?.contexte ?? null, CLE)],
      ["`ops_idempotency.key`", contient(ligneIdem ?? null, CLE)],
      ["le message de refus", contient(resultat.refus?.message ?? null, CLE)],
      ["la ligne d'`ops_audit`", contient(lignes(harnais), CLE)],
    ];
    const atteintes = destinations.filter(([, porte]) => porte).map(([nom]) => nom);

    console.info(
      `[R5 · canal] clé bien formée : ${String(formeDeCleValide(CLE))} · ` +
        `${String(destinations.length)} destination(s) confrontée(s) · ` +
        `${String(atteintes.length)} atteinte(s) : ${atteintes.join(", ") || "aucune"} · ` +
        `champs du \`ctx\` reçus : ${String(Object.keys(recu?.contexte ?? {}).length)}`,
    );

    // Plancher : sans lui, « aucune destination atteinte » se lirait aussi bien
    // d'un appel qui n'a jamais eu lieu.
    expect(formeDeCleValide(CLE), "la clé du témoin est bien formée").toBe(true);
    expect(issue(resultat), "l'appel doit être SERVI").toBe("servi");
    expect(harnais.recus.length, "l'adaptateur doit avoir été atteint").toBe(1);
    expect(ligneIdem, "une réservation doit exister").toBeDefined();

    expect(atteintes, "ADR 0020 — la clé BRUTE n'atteint aucune destination").toEqual([]);
    // ET l'EMPREINTE, elle, est bien là : sans cette moitié, un `ctx` vide de
    // tout passerait pour une fermeture réussie.
    expect(recu?.contexte.idempotencyRef, "l'empreinte, elle, est remise").toBe(
      empreinteDeCleDIdempotence(CLE),
    );
    expect(ligneIdem?.key, "et c'est l'empreinte qui est conservée").toBe(
      empreinteDeCleDIdempotence(CLE),
    );
  });

  /**
   * ✅ LE `ctx` REÇU PORTE EXACTEMENT LES CHAMPS DÉCLARÉS — NI UN DE PLUS.
   *
   * `Omit` est une opération de TYPE : elle n'efface aucune clé d'objet. Un
   * constructeur de contexte injecté qui poserait une propriété surnuméraire
   * — un `idempotencyKey` oublié — la ferait voyager jusqu'à l'adaptateur sans
   * qu'aucun type ne bronche. On mesure donc les clés RUNTIME de l'objet reçu.
   */
  it("l'objet reçu par l'adaptateur porte exactement les champs de `ToolContext`", async () => {
    const harnais = monterSocle();
    await appeler(harnais, appel({ idempotencyKey: null }));
    const recu = harnais.recus[0];

    const attendus = Object.keys(STATUT_DES_CANAUX_DE_CONTEXTE).sort();
    const recus = Object.keys(recu?.contexte ?? {}).sort();
    const surnumeraires = recus.filter((cle) => !attendus.includes(cle));
    const manquants = attendus.filter((cle) => !recus.includes(cle));

    console.info(
      `[R5 · totalité] ${String(attendus.length)} champ(s) déclaré(s) · ` +
        `${String(recus.length)} reçu(s) · ${String(surnumeraires.length)} surnuméraire(s) · ` +
        `${String(manquants.length)} manquant(s)`,
    );

    expect(attendus.length, "l'inventaire n'est pas vide").toBeGreaterThan(0);
    expect(surnumeraires, "aucune propriété surnuméraire n'atteint l'adaptateur").toEqual([]);
    expect(manquants, "et aucun champ déclaré ne manque").toEqual([]);
  });

  /**
   * ✅ LA FORME EST FERMÉE, ET LE REFUS NE RECOPIE PAS CE QU'IL REFUSE.
   *
   * Le témoin emploie comme clé LE TEXTE LU lui-même : c'est le pire cas, celui
   * où le refus deviendrait le canal.
   */
  it("une clé porteuse de prose est REFUSÉE, et le refus ne la cite pas", async () => {
    const harnais = monterSocle({
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });
    const resultat = await appeler(harnais, appel({ idempotencyKey: TEXTE_LU }));

    console.info(
      `[R5 · forme] verdict : ${issue(resultat)} · code rendu : ${String(resultat.refus?.code)} · ` +
        `étape : ${String(resultat.refus?.etape)} · ` +
        `le message cite la clé : ${String(contient(resultat.refus?.message ?? null, TEXTE_LU))} · ` +
        `${String(harnais.recus.length)} appel(s) chez l'adaptateur`,
    );

    expect(formeDeCleValide(TEXTE_LU), "une phrase n'a pas la forme d'une clé").toBe(false);
    expect(issue(resultat), "elle est refusée").toBe("refusé");
    expect(resultat.refus?.etape, "à l'étape 13").toBe(13);
    expect(contient(resultat.refus?.message ?? null, TEXTE_LU), "le refus ne la recopie pas").toBe(
      false,
    );
    expect(harnais.recus.length, "et l'adaptateur n'est jamais atteint").toBe(0);
  });

  /**
   * 🔴 **NOUVEAU CONSTAT — LE CODE QUE `reserver()` A CHOISI EST ÉCRASÉ.**
   *
   * `core/limits/idempotency.ts` rend `invalid_input` sur une clé mal formée, et
   * l'ADR 0020 le nomme en toutes lettres : « refus `invalid_input` (§ 15, code
   * existant) ». L'orchestrateur, lui, prononce le refus d'étape 13 par
   * `refuser(ETAPE_IDEMPOTENCE_CHAINE, …)`, et `refuser()` LIT le code dans
   * l'ANCRAGE — `APPEL_STEPS[13].refus === "conflict"`. Le code choisi par le
   * module qui a jugé n'arrive jamais à l'appelant.
   *
   * ⚠️ CE N'EST PAS UN DÉTAIL D'ÉTIQUETTE, ET LES DEUX CODES DISENT DES GESTES
   *    OPPOSÉS. `conflict` (§ 15) veut dire « l'état a changé, relire puis
   *    rejouer » — un client qui l'obéit REJOUERA LA MÊME CLÉ MAL FORMÉE, en
   *    boucle. `invalid_input` veut dire « corriger l'argument ». C'est
   *    exactement le motif que le § 11 donne pour placer le schéma avant le
   *    quota, appliqué à l'étape voisine.
   *
   * ⚠️ ET LE SOCLE SAIT DÉJÀ FAIRE AUTREMENT, à trois lignes de là : pour les
   *    étapes 9, 10 et 11 l'orchestrateur rend `code: limites.code` — le code du
   *    module, pas celui de l'ancrage. Seule l'étape 13 le perd.
   *
   * La mesure ci-dessous confronte QUATRE causes de refus d'idempotence de
   * natures différentes et compte les codes DISTINCTS qu'elles produisent.
   */
  it.fails("🔴 § 15 — une clé MAL FORMÉE doit se distinguer d'une clé EN CONFLIT", async () => {
    const CAUSES = [
      { nom: "clé mal formée (prose)", cle: TEXTE_LU },
      { nom: "clé trop courte", cle: "ab" },
      { nom: "clé absente sur un outil qui l'exige", cle: "" },
      { nom: "clé bien formée (aucun refus attendu)", cle: "cle-temoin-lot-1d-0f3a" },
    ] as const;

    let soumises = 0;
    const codes = new Set<string>();
    const messages = new Set<string>();
    const refuses: string[] = [];

    for (const cause of CAUSES) {
      soumises += 1;
      const harnais = monterSocle({
        reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      });
      const resultat = await appeler(harnais, appel({ idempotencyKey: cause.cle }));
      if (resultat.refus !== null) {
        refuses.push(cause.nom);
        codes.add(String(resultat.refus.code));
        messages.add(resultat.refus.message);
      }
    }

    console.info(
      `[R5 · code du refus] ${String(soumises)} cause(s) soumise(s) · ` +
        `${String(refuses.length)} refusée(s) : ${refuses.join(", ")} · ` +
        `${String(messages.size)} message(s) DISTINCT(s) · ` +
        `${String(codes.size)} code(s) DISTINCT(s) : ${[...codes].join(", ")}`,
    );

    // ⚠️ CE PREMIER JET S'EST TROMPÉ, ET LE PIÈGE EST CELUI QU'IL FAUT ÉCRIRE :
    //    j'attendais TROIS messages distincts, il y en a DEUX — « mal formée »
    //    et « trop courte » sont la MÊME violation de forme et partagent, à
    //    juste titre, le même texte. L'`it.fails` était donc vert PAR CETTE
    //    ASSERTION-LÀ, et il l'aurait été même si les codes avaient été
    //    corrigés. Une assertion de fait fausse dans un `it.fails` masque
    //    exactement ce que le test prétend mesurer.
    //
    // Faits qui survivront au correctif :
    expect(soumises, "plancher : quatre causes soumises").toBe(4);
    expect(refuses.length, "trois d'entre elles sont refusées").toBe(3);
    expect(messages.size, "et le socle en distingue DEUX par le message").toBe(2);

    // L'ATTENTE DU § 15 ET DE L'ADR 0020, celle qui échoue aujourd'hui.
    expect(codes.size, "trois causes de nature différente, pas UN seul code").toBeGreaterThan(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  R6 · REJEU — UN ENVOI PARTI DONT L'AVAL LÈVE (ADR 0021)
// ═════════════════════════════════════════════════════════════════════════════

describe("R6 · rejeu — un envoi PARTI dont l'aval lève (ADR 0021)", () => {
  /**
   * ✅ CE TEST ÉCHOUERAIT SI L'ISSUE SE DÉRIVAIT ENCORE DU GENRE DE LA
   * TERMINAISON. La panne est postérieure au retour de l'adaptateur : l'index de
   * provenance lève APRÈS l'envoi. Si la clé se fermait en `failed`, le second
   * appel la reprendrait et un SECOND effet partirait.
   *
   * Deux appels sous la MÊME clé, sur un outil `send` : l'instrument compte les
   * effets RÉELS, pas les verdicts.
   */
  it("une clé dont l'aval a levé APRÈS l'envoi ne fait pas repartir un second envoi", async () => {
    const outilEnvoi = outilLecteur({
      name: "courrier.envoyer",
      effect: "send",
      dataClass: "personal",
      inputSchema: schemaFerme({ destinataire: { type: "string", enum: ["a"] } }),
    });
    const harnais = monterSocle({
      outils: [outilEnvoi],
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      indexQuiLeve: true,
      // ⚠️ LES DEUX RÉGLAGES SONT NÉCESSAIRES, ET LE PREMIER JET LES A OUBLIÉS :
      //    le transport stdio ne porte par défaut AUCUN scope couvrant un effet
      //    extérieur, et le niveau « brouillon » interdit tout effet extérieur.
      //    Sans eux, l'appel était refusé à l'étape 5 puis à l'étape 10 — zéro
      //    envoi, zéro réservation —, et le témoin aurait conclu « aucun second
      //    envoi » sur un socle qui n'en avait pas fait un seul.
      scopes: ["ops:read", "ops:send"],
      niveau: NIVEAU_LIBRE,
    });

    const CLE = "cle-envoi-lot-1d-0f3a";
    let levees = 0;
    let tentatives = 0;

    for (let i = 0; i < 2; i += 1) {
      tentatives += 1;
      try {
        await appeler(
          harnais,
          appel({
            nomComplet: "courrier.envoyer",
            input: { destinataire: "a" },
            idempotencyKey: CLE,
          }),
        );
      } catch {
        levees += 1;
      }
    }

    const reservation = harnais.idempotence.lignes.get(
      `courrier.envoyer::${empreinteDeCleDIdempotence(CLE)}`,
    );
    const effetsJournalises = lignes(harnais).filter((ligne) => ligne.externalEffect).length;

    console.info(
      `[R6] ${String(tentatives)} tentative(s) sous la MÊME clé · ` +
        `${String(harnais.recus.length)} effet(s) extérieur(s) RÉEL(s) · ` +
        `${String(levees)} levée(s) · statut de la réservation : ` +
        `${String(reservation?.status)} · ${String(effetsJournalises)} ligne(s) ` +
        `portant \`externalEffect: true\` · ${String(lignes(harnais).length)} ligne(s) au total`,
    );

    expect(tentatives, "plancher : deux tentatives ont bien eu lieu").toBe(2);
    expect(reservation, "une réservation existe sous cette clé").toBeDefined();

    expect(harnais.recus.length, "ADR 0021 — un courrier parti ne repart PAS").toBe(1);
    expect(reservation?.status, "la clé est close en `done`, jamais en `failed`").toBe("done");
  });

  /**
   * CONTRE-TÉMOIN — IL ISOLE LA RÈGLE. Une panne AVANT l'envoi, sur un outil
   * `read` : rien n'est sorti, `failed` est alors la BONNE valeur, et la reprise
   * est le comportement utile. Sans lui, le témoin ci-dessus serait vert pour un
   * socle qui fermerait TOUT en `done`.
   */
  it("SAIT DIRE `failed` : une panne AVANT l'envoi, en lecture, reste reprenable", async () => {
    const harnais = monterSocle({
      outils: [outilLecteur({ dataClass: "none" })],
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
      niveau: NIVEAU_LIBRE,
      reponseAdaptateur(): Promise<ChargeAdaptateur> {
        // L'adaptateur lève AVANT d'avoir rien envoyé : `recus` a déjà enregistré
        // la tentative, mais l'`effect` est `read` — rien n'est sorti.
        return Promise.reject(new Error("panne fabriquee avant tout envoi"));
      },
    });

    const CLE = "cle-lecture-lot-1d-0f3a";
    let levees = 0;
    try {
      await appeler(harnais, appel({ idempotencyKey: CLE }));
    } catch {
      levees += 1;
    }

    const reservation = harnais.idempotence.lignes.get(
      `courrier.lire::${empreinteDeCleDIdempotence(CLE)}`,
    );
    const effets = lignes(harnais).filter((ligne) => ligne.externalEffect).length;

    console.info(
      `[R6 · contre-témoin] ${String(levees)} levée(s) · ` +
        `statut : ${String(reservation?.status)} · ` +
        `${String(effets)} ligne(s) portant un effet extérieur`,
    );

    expect(levees, "plancher : la panne a bien levé").toBe(1);
    expect(reservation, "une réservation existe").toBeDefined();
    expect(effets, "aucun effet extérieur n'est attesté").toBe(0);
    expect(reservation?.status, "en lecture, la clé reste reprenable").toBe("failed");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  N1 · NOUVEAU — LES NEUF CHAMPS DU `ctx`, CONFRONTÉS UN PAR UN
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ LA MÉTHODE, ET C'EST ELLE QU'ON ATTAQUE ═══
 *
 * L'ADR 0020 pose la totalité ainsi : `AppelAdaptateur` a exactement deux
 * paramètres, l'entrée validée est le périmètre que le § 20 voit déjà, donc
 * **l'inventaire des canaux invisibles est exactement les propriétés de
 * `ToolContext`**. La section N1 vérifie que cet inventaire dit vrai sur chacun
 * de ses neuf champs ; la section N2 attaque la totalité elle-même.
 *
 * ⚠️ LE TEST NE POSE PAS SA PROPRE LISTE DE NEUF NOMS. Il itère les clés de
 *    `STATUT_DES_CANAUX_DE_CONTEXTE` — dont le type est
 *    `Record<keyof ToolContext, …>` —, si bien qu'un champ ajouté au `ctx`
 *    entrera dans cette mesure le jour même.
 */
describe("N1 · les neuf champs du `ctx`, et ce qu'ils transportent VRAIMENT", () => {
  it("chaque champ portant une valeur choisie par l'appelant est déclaré comme tel", async () => {
    const DEADLINE = new Date(INSTANT.getTime() + 424_242);
    const CLE = "cle-marqueur-lot-1d-0f3a";

    const harnais = monterSocle({
      reglagesOutil: { modeIdempotence: "key", limiteQuota: null, warnAtQuota: null },
    });
    // L'identité qu'un TRANSPORT fabriquerait. `principal`, `requestId` et
    // `deadline` y portent une valeur que l'appelant a choisie.
    const identite: IdentiteAppelante = {
      ...harnais.identite,
      principal: `principal-${MARQUEUR}`,
      requestId: `requestId-${MARQUEUR}`,
      deadline: DEADLINE,
    };

    const resultat = await appeler(harnais, appel({ idempotencyKey: CLE }), identite);
    const recu = harnais.recus[0];
    if (recu === undefined) throw new Error("plancher : l'adaptateur n'a pas été atteint");
    const ctx = recu.contexte as unknown as Record<string, unknown>;

    // CE CHAMP PORTE-T-IL, À L'IDENTIQUE, UNE VALEUR QUE L'APPELANT A FOURNIE ?
    //
    // ⚠️ LA COMPARAISON PORTE SUR LA VALEUR REÇUE, jamais sur le nom du champ.
    //    Un champ qui recopierait la valeur d'un autre serait vu.
    const fourniesParLAppelant: readonly unknown[] = [
      identite.principal,
      identite.requestId,
      DEADLINE.getTime(),
      CLE,
    ];
    const porteUneValeurFournie = (valeur: unknown): boolean => {
      const compare = valeur instanceof Date ? valeur.getTime() : valeur;
      return fourniesParLAppelant.some((fournie) => fournie === compare);
    };

    let confrontes = 0;
    const transportent: string[] = [];
    const desaccords: string[] = [];

    for (const [champ, statut] of Object.entries(STATUT_DES_CANAUX_DE_CONTEXTE)) {
      confrontes += 1;
      const transporte = porteUneValeurFournie(ctx[champ]);
      if (transporte) transportent.push(`${champ} (${statut.regime})`);
      // Un champ qui transporte une valeur de l'appelant NE PEUT PAS être
      // déclaré fermé — ni par construction, ni par le socle.
      const declareFerme =
        statut.regime === "fermé-par-construction" || statut.regime === "fermé-par-le-socle";
      if (transporte && declareFerme) desaccords.push(`${champ} déclaré « ${statut.regime} »`);
      // Et l'inverse : un champ déclaré OUVERT qui ne transporterait rien serait
      // un régime périmé — une inquiétude qu'on entretient pour rien.
      const declareOuvert =
        statut.regime === "ouvert-signalé" || statut.regime === "à-fermer-au-transport";
      if (!transporte && declareOuvert) desaccords.push(`${champ} déclaré « ${statut.regime} »`);
    }

    console.info(
      `[N1] ${String(confrontes)} champ(s) du \`ctx\` confronté(s) · ` +
        `${String(transportent.length)} porte(nt) une valeur de l'appelant : ` +
        `${transportent.join(", ")} · ${String(desaccords.length)} désaccord(s) avec ` +
        `l'inventaire : ${desaccords.join(", ") || "aucun"} · ` +
        `idempotencyRef = empreinte : ` +
        `${String(ctx["idempotencyRef"] === empreinteDeCleDIdempotence(CLE))}`,
    );

    expect(issue(resultat), "plancher : l'appel a été servi").toBe("servi");
    expect(confrontes, "l'inventaire n'est pas vide").toBeGreaterThan(0);
    // Sans ce compte, « aucun désaccord » se lirait aussi bien d'un `ctx` vide.
    expect(transportent.length, "au moins un champ porte bien quelque chose").toBeGreaterThan(0);
    expect(desaccords, "l'inventaire dit vrai sur chacun de ses champs").toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  N2 · NOUVEAU — L'INVENTAIRE EST FERMÉ SUR LA DESTINATION, PAS SUR LA SOURCE
// ═════════════════════════════════════════════════════════════════════════════

describe("N2 · la totalité de l'inventaire, attaquée par sa méthode", () => {
  /**
   * TÉMOIN DE CAPACITÉ — LA DÉRIVATION LIT VRAIMENT LE SOURCE.
   *
   * Sans lui, « zéro champ classé » ne se distinguerait pas de « la lecture du
   * source a rendu une liste vide ».
   */
  it("SAIT LIRE : les deux types d'entrée sont lus dans le SOURCE et non devinés", () => {
    const entrant = proprietesDInterface(SOURCE_ORCHESTRATEUR, "AppelEntrant");
    const identite = proprietesDInterface(SOURCE_ORCHESTRATEUR, "IdentiteAppelante");
    const inconnu = proprietesDInterface(SOURCE_ORCHESTRATEUR, "InterfaceQuiNExistePas");

    console.info(
      `[N2 · lecture] AppelEntrant : ${String(entrant.length)} propriété(s) — ` +
        `${entrant.join(", ")} · IdentiteAppelante : ${String(identite.length)} — ` +
        `${identite.join(", ")} · témoin négatif : ${String(inconnu.length)}`,
    );

    expect(entrant.length, "`AppelEntrant` déclare des propriétés").toBeGreaterThan(0);
    expect(identite.length, "`IdentiteAppelante` aussi").toBeGreaterThan(0);
    // Le témoin négatif : sans lui, la fonction pourrait rendre n'importe quoi.
    expect(inconnu, "un nom inexistant ne rend rien").toEqual([]);
  });

  /**
   * ✅ **CONSTAT FERMÉ AU LOT 2 — `it.fails` BASCULÉ EN `it()`. ADR 0031.**
   *
   * ═══ CE QUE LE LOT 1d AVAIT MESURÉ ═══
   *
   * `STATUT_DES_CANAUX_DE_CONTEXTE` est `Record<keyof ToolContext, …>` : ajouter
   * un champ au `ctx` sans le classer ne compile pas. C'était solide, et cela
   * fermait la DESTINATION « adaptateur ». Mais la question posée par les deux
   * épreuves précédentes était plus large — *un champ qui atteint l'adaptateur
   * **ou le journal** sans passer par le schéma* —, et la mesure disait :
   *
   * > `11 champ(s) de SOURCE confronté(s) à 9 champ(s) classé(s) · 6 couvert(s)
   * par HOMONYMIE · 5 classé(s) par RIEN`
   *
   * ═══ CE QUI A CHANGÉ, ET POURQUOI CE TEST-CI EST CELUI QUI LE PROUVE ═══
   *
   * L'ADR 0031 pose deux inventaires de plus, tenus par le compilateur de la
   * même façon : `STATUT_DES_CANAUX_D_APPEL` et `STATUT_DES_CANAUX_D_IDENTITE`.
   * Ce test est **passé de `it.fails` à `it()` sans que son ATTENTE change** —
   * `nonClasses` doit être vide — : seule sa SOURCE de vérité s'élargit, des
   * clés d'un record à celles des trois. Un test écrit après le correctif ne
   * prouverait que le correctif.
   *
   * ⚠️ **LE COMPTE « PAR HOMONYMIE » RESTE DANS L'ANNONCE, ET C'EST UNE RÈGLE
   *    DE L'ADR 0031** : un compte qu'on retire est un compte qu'on ne peut plus
   *    voir remonter. Il doit désormais valoir ZÉRO — chaque champ est classé
   *    par l'inventaire de SON PROPRE type, jamais par la coïncidence des noms.
   *
   * ⚠️ **CE QUE CE TEST NE PROUVE TOUJOURS PAS.** Il classe ; il ne borne rien.
   *    `AppelEntrant.nomComplet` et `IdentiteAppelante.principal` sont désormais
   *    classés — et classés `verbatim`, ce qui est le défaut BLOQUANT de la
   *    section N3, encore ouvert. Un inventaire complet et juste n'empêche rien
   *    tout seul : il rend obligatoire de DÉCIDER. Le confondre avec une
   *    protection serait lire une couleur au lieu d'un compte.
   */
  it("ADR 0031 — tout champ que l'APPELANT choisit est classé par un inventaire", () => {
    // ⚠️ LES TROIS RECORDS SONT LA SOURCE, ET CHACUN EST APPARIÉ À SON TYPE.
    //    Unir leurs clés en un seul ensemble reproduirait la couverture par
    //    HOMONYMIE qu'on vient de faire cesser : `AppelEntrant.principal`
    //    passerait pour classé parce qu'`IdentiteAppelante` a un `principal`.
    const inventaires: readonly (readonly [string, ReadonlySet<string>])[] = [
      ["AppelEntrant", new Set(Object.keys(STATUT_DES_CANAUX_D_APPEL))],
      ["IdentiteAppelante", new Set(Object.keys(STATUT_DES_CANAUX_D_IDENTITE))],
    ];
    const clesDuContexte = new Set(Object.keys(STATUT_DES_CANAUX_DE_CONTEXTE));

    let confrontes = 0;
    const nonClasses: string[] = [];
    const parHomonymie: string[] = [];
    const parSonPropreInventaire: string[] = [];

    for (const [type, propre] of inventaires) {
      for (const champ of proprietesDInterface(SOURCE_ORCHESTRATEUR, type)) {
        confrontes += 1;
        if (propre.has(champ)) parSonPropreInventaire.push(`${type}.${champ}`);
        else if (clesDuContexte.has(champ)) parHomonymie.push(`${type}.${champ}`);
        else nonClasses.push(`${type}.${champ}`);
      }
    }

    console.info(
      `[N2 · totalité] ${String(confrontes)} champ(s) de SOURCE confronté(s) à ` +
        `${String(clesDuContexte.size)} champ(s) classé(s) par l'inventaire du \`ctx\` · ` +
        `${String(parSonPropreInventaire.length)} classé(s) par LEUR PROPRE inventaire · ` +
        `${String(parHomonymie.length)} couvert(s) par HOMONYMIE : ` +
        `${parHomonymie.join(", ") || "aucun"} · ` +
        `${String(nonClasses.length)} classé(s) par RIEN : ${nonClasses.join(", ") || "aucun"}`,
    );

    // Faits qui survivent au correctif : la lecture du SOURCE a bien eu lieu.
    expect(confrontes, "plancher : des champs de source ont été confrontés").toBeGreaterThan(0);
    expect(clesDuContexte.size, "et l'inventaire du `ctx` n'est pas vide").toBeGreaterThan(0);

    // L'ATTENTE, INCHANGÉE DEPUIS LE LOT 1d — et désormais tenue.
    expect(nonClasses, "aucun champ choisi par l'appelant n'échappe à un inventaire").toEqual([]);
    // ET LA MOITIÉ QUE L'ADR 0031 AJOUTE : la coïncidence des noms ne couvre
    // plus personne. Sans elle, trois records dont l'un serait vide passeraient.
    expect(parHomonymie, "l'homonymie ne couvre plus aucun champ").toEqual([]);
    expect(
      parSonPropreInventaire.length,
      "chaque champ est classé par l'inventaire de SON type",
    ).toBe(confrontes);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  N3 · NOUVEAU — LA PERTE DE LA LIGNE D'AUDIT, ET SON JUMEAU
// ═════════════════════════════════════════════════════════════════════════════

describe("N3 · la terminaison qui ne laisse aucune ligne", () => {
  /**
   * TÉMOIN DE CAPACITÉ — SANS LUI, RIEN NE SE LIT.
   *
   * Un nom inconnu mais BIEN FORMÉ est refusé ET journalisé ; un principal bien
   * formé laisse lui aussi sa ligne. C'est ce qui distingue « ces formes-ci font
   * perdre la ligne » de « ce socle ne journalise pas les refus ».
   */
  it("SAIT ÉCRIRE : un nom et un principal bien formés laissent leur ligne", async () => {
    let mesures = 0;
    let ecrites = 0;

    for (const cas of [
      { nom: "outil inconnu bien formé", surPrincipal: false },
      { nom: "principal bien formé", surPrincipal: true },
    ] as const) {
      mesures += 1;
      const harnais = monterSocle();
      const entrant = cas.surPrincipal ? appel() : appel({ nomComplet: "inconnu.outil" });
      const identite: IdentiteAppelante = cas.surPrincipal
        ? { ...harnais.identite, principal: `principal-${MARQUEUR}` }
        : harnais.identite;
      await appeler(harnais, entrant, identite);
      ecrites += lignes(harnais).length;
    }

    console.info(
      `[N3 · capacité] ${String(mesures)} cas mesuré(s) · ${String(ecrites)} ligne(s) écrite(s)`,
    );

    expect(mesures, "plancher : deux cas mesurés").toBe(2);
    expect(ecrites, "chacun laisse exactement une ligne").toBe(2);
  });

  /**
   * 🔴 **CONSTAT REJOUÉ, ET ÉLARGI À SON JUMEAU.**
   *
   * L'épreuve du lot 1c avait mesuré la perte de la ligne sur `tool`. Le constat
   * était juste et il est TOUJOURS OUVERT ; ce qu'il n'avait pas dit, c'est que
   * **la faute n'est pas dans un champ, elle est dans une FAMILLE.**
   *
   * `verifierAucunContenu()` (§ 31) borne la forme de six colonnes dont la valeur
   * ne vient pas du socle. Deux sont normalisées en amont (`recordIds`,
   * `partialSources`) ; deux sont bornées à l'admission par le registre
   * (`toolVersion`, `adapterVersion`, motif de version) ; **deux ne le sont par
   * rien : `tool`, qui vient d'`AppelEntrant.nomComplet`, et `principal`, qui
   * vient d'`IdentiteAppelante`.** L'en-tête du journal les pose VERBATIM, la
   * garde du § 31 refuse la ligne, et l'écriture lève HORS du `try` de
   * `journaliser` : **zéro ligne d'`ops_audit`**.
   *
   * ⚠️ CE N'EST PAS UNE FUITE — rien ne sort, la porte est bien fermée. Ce qui
   *    est perdu est la TRACE. Le § 24 compte les refus sur `ops_audit` ; ceux-là
   *    n'y sont pas. Et c'est la garde qui PROTÈGE le journal qui l'y aide.
   *
   * ⚠️ LE CORRECTIF NE PEUT PAS ÊTRE « assouplir `verifierAucunContenu()` » :
   *    elle a raison, c'est l'amont qui est faux. Il ne peut pas non plus être
   *    « normaliser `nomComplet` » seul — ce serait refermer un champ d'une
   *    famille de deux, et découvrir le second dans six mois. Ce que la mesure
   *    ci-dessous rend lisible, c'est le PÉRIMÈTRE du correctif.
   *
   * ✅ **LA MOITIÉ « BORNE » EXISTE DEPUIS LE LOT 2, ET ELLE PORTE UN NOM —
   *    ADR 0029, point 4.** `bornerIdentifiantDuJournal(champ, valeur, repli)`
   *    (`core/audit/contenu.ts`) DÉRIVE la borne de `FORMES`, lève si le genre de
   *    la colonne change, et REFUSE un repli qui ne passerait pas lui-même la
   *    garde du § 31 — sans quoi le correctif perdrait la ligne qu'il prétend
   *    sauver. La famille est ÉNUMÉRABLE (`CHAMPS_IDENTIFIANTS_DU_JOURNAL`,
   *    cinq colonnes), ce qui est la seule défense contre le troisième champ
   *    oublié. Ses témoins vivent dans `core/audit/contenu.temoin.spec.ts`.
   *
   * 🔴 **ET CE TEST RESTE OUVERT, PARCE QU'ÉCRIRE LA FONCTION N'EST PAS LE
   *    TRAVAIL — LA BRANCHER L'EST.** `bornerIdentifiantDuJournal` compte
   *    aujourd'hui ZÉRO appelant de production, et le registre des coutures
   *    l'inscrit en `à-coudre` pour que l'oubli soit impossible à commettre en
   *    silence. Les deux appels manquants, nommés par l'ADR 0029 :
   *
   *     · **étape 6** — borner `appel.nomComplet` AVANT la recherche au
   *       catalogue. Aucun compteur n'étant ancré sur `tool` pour un outil qui
   *       n'existe pas, il n'y a rien à fusionner : perdre la trace est
   *       strictement pire que la borner ;
   *     · **étape 4** — REFUSER un `principal` malformé, et non le borner : il
   *       ancre `ops_quota` (unicité `(window, tool, principal)`) et
   *       `ops_runtime` (un profil actif par principal), et un repli fusionnerait
   *       deux principaux dans un même compteur. La ligne de refus porte alors un
   *       principal RÉSERVÉ, qu'aucun émetteur ne peut produire.
   */
  it.fails(
    "🔴 § 11 · § 24 — toute terminaison doit être attestée, quel que soit le champ fautif",
    async () => {
      const FORMES = [
        { champ: "tool", nom: "un espace", valeur: "outil inconnu" },
        { champ: "tool", nom: "un saut de ligne", valeur: "outil\ninconnu" },
        { champ: "principal", nom: "un espace", valeur: "prin cipal" },
        { champ: "principal", nom: "une phrase lue", valeur: TEXTE_LU },
      ] as const;

      let soumises = 0;
      let levees = 0;
      let ecrites = 0;
      const perdues: string[] = [];

      for (const forme of FORMES) {
        soumises += 1;
        const harnais = monterSocle();
        const entrant = forme.champ === "tool" ? appel({ nomComplet: forme.valeur }) : appel();
        const identite: IdentiteAppelante =
          forme.champ === "principal"
            ? { ...harnais.identite, principal: forme.valeur }
            : harnais.identite;
        try {
          await appeler(harnais, entrant, identite);
        } catch {
          levees += 1;
        }
        const posees = lignes(harnais).length;
        ecrites += posees;
        if (posees === 0) perdues.push(`${forme.champ} · ${forme.nom}`);
      }

      console.info(
        `[N3 · perte de ligne] ${String(soumises)} forme(s) soumise(s) · ` +
          `${String(levees)} levée(s) · ${String(ecrites)} ligne(s) écrite(s) au total · ` +
          `${String(perdues.length)} terminaison(s) SANS ligne : ${perdues.join(" | ")}`,
      );

      // Fait qui survivra au correctif : les quatre formes ont été soumises.
      expect(soumises, "plancher : quatre formes soumises").toBe(4);

      // L'ATTENTE DU § 11, celle qui échoue aujourd'hui.
      expect(perdues, "§ 24 — aucune terminaison ne reste hors du journal").toEqual([]);
      expect(ecrites, "une ligne par appel soumis").toBe(soumises);
    },
  );
});

// ═════════════════════════════════════════════════════════════════════════════
//  N4 · NOUVEAU — `idempotencyRef` SUR UN OUTIL QUI NE DÉDUPLIQUE PAS
// ═════════════════════════════════════════════════════════════════════════════

describe("N4 · le contrat écrit de `idempotencyRef`", () => {
  /**
   * ✅ CE QUI TIENT, ET IL FALLAIT LE MESURER : la forme de la clé est jugée
   * AVANT le tri par mode. Un outil `n/a` n'est donc pas une porte ouverte vers
   * `core/limits`, et la prose de `reserver()` dit vrai sur ce point.
   */
  it("une clé mal formée est refusée MÊME sur un outil qui ne déduplique pas", async () => {
    const harnais = monterSocle({
      reglagesOutil: { modeIdempotence: "n/a", limiteQuota: null, warnAtQuota: null },
    });
    const resultat = await appeler(harnais, appel({ idempotencyKey: TEXTE_LU }));

    console.info(
      `[N4 · forme sur n/a] verdict : ${issue(resultat)} · ` +
        `étape : ${String(resultat.refus?.etape ?? "aucune")} · ` +
        `${String(harnais.recus.length)} appel(s) chez l'adaptateur`,
    );

    expect(issue(resultat), "ce qui est ignoré doit d'abord avoir été jugé").toBe("refusé");
    expect(harnais.recus.length, "et l'adaptateur n'est pas atteint").toBe(0);
  });

  /**
   * 🔴 **CONSTAT MOITIÉ FERMÉ AU LOT 2 — LA PROSE NE MENT PLUS, LE CHAMP PEUT
   * ENCORE.**
   *
   * ═══ CE QUE C'ÉTAIT ═══
   *
   * `core/types.ts` écrivait, sur `idempotencyRef` : « `null` quand l'outil
   * déclare `idempotency: "n/a"`, ou quand l'appel n'en porte aucune ». La
   * seconde moitié était vraie. La première ne l'était pas : l'orchestrateur pose
   * `empreinteDeCleDIdempotence(appel.idempotencyKey)` INCONDITIONNELLEMENT, sans
   * jamais consulter le mode de l'outil.
   *
   * ✅ **LA PHRASE EST CORRIGÉE (lot 2, correctif (b)).** Elle dit désormais
   *    « `null` quand l'appel ne porte AUCUNE clé », et elle porte en toutes
   *    lettres l'avertissement inverse : ne rien déduire du mode d'un champ non
   *    nul, le mode se lit dans le manifeste. Le mensonge est supprimé.
   *
   * 🔴 **ET CE TEST RESTE OUVERT, DÉLIBÉRÉMENT.** Il porte maintenant le
   *    correctif (a) — DÉRIVER le `null` du mode à la construction du `ctx` —,
   *    qui reste le plus sûr : corriger une prose supprime le mensonge, cela ne
   *    rend pas le champ INCAPABLE de mentir. La ligne visée est celle que
   *    l'ADR 0020 désigne comme « LA couture, et elle n'est pas délégable »
   *    (`core/chaine/orchestrateur.ts`), hors du périmètre du constructeur qui a
   *    corrigé la phrase ; et appeler `dependances.reglages(outil)` une seconde
   *    fois est une décision, pas un branchement.
   *
   * ⚠️ CE QUE ÇA COÛTE, ET CE QUE ÇA NE COÛTE PAS. Aucune fuite : c'est une
   *    empreinte. Mais un adaptateur qui écrit « si `idempotencyRef` n'est pas
   *    nul, je déduplique » dédupliquera sur un outil que le socle a déclaré non
   *    déduplicable — et il le fera d'autant plus volontiers que l'ADR 0020
   *    justifie le champ par ce besoin exact (« un adaptateur qui relaie vers une
   *    API tierce a besoin d'un jeton stable »).
   */
  it.fails("🔴 `idempotencyRef` doit se DÉRIVER du mode : `null` sur un outil `n/a`", async () => {
    const CLE = "cle-sur-outil-na-lot-1d";
    let mesures = 0;
    const refs: (readonly [string, string | null])[] = [];

    for (const mode of ["n/a", "key"] as const) {
      mesures += 1;
      const harnais = monterSocle({
        reglagesOutil: { modeIdempotence: mode, limiteQuota: null, warnAtQuota: null },
      });
      await appeler(harnais, appel({ idempotencyKey: CLE }));
      refs.push([mode, harnais.recus[0]?.contexte.idempotencyRef ?? null]);
    }

    console.info(
      `[N4 · contrat] ${String(mesures)} mode(s) confronté(s) · ` +
        refs
          .map(
            ([mode, ref]) =>
              `${mode} → ${ref === null ? "null" : `empreinte (${String(ref.length)} car.)`}`,
          )
          .join(" · "),
    );

    // Faits qui survivront au correctif : les deux modes ont été mesurés, et le
    // mode `key` porte bien l'empreinte.
    expect(mesures, "plancher : deux modes mesurés").toBe(2);
    expect(refs[1]?.[1], "en mode `key`, l'empreinte est bien posée").toBe(
      empreinteDeCleDIdempotence(CLE),
    );

    // L'ATTENTE DU CORRECTIF (a), celle qui échoue toujours — et qui n'est plus
    // celle d'une phrase : `core/types.ts` ne promet plus le `null`, il AVERTIT
    // qu'il ne le promet pas. Ce qui reste à faire est de le rendre vrai.
    expect(refs[0]?.[1], "en mode `n/a`, la dérivation du mode donnerait `null`").toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  N5 · NOUVEAU — LE CONTRÔLE 7 ANNONCE-T-IL SES TROIS COMPTES ?
// ═════════════════════════════════════════════════════════════════════════════

describe("N5 · le rapport du contrôle 7 (§ 09)", () => {
  /**
   * ✅ LA DÉRIVATION EST JUSTE : les trois ensembles s'additionnent bien dans le
   * total, aux doublons près. C'est la moitié qui tient.
   */
  it("les trois ensembles du contrôle 7 réconcilient le total", () => {
    const cles = lireClesDAutorisation();
    const deuxPremiers = new Set([...cles.toolContext, ...cles.habilitations]);
    const union = new Set([...deuxPremiers, ...cles.reservesHorsContexte]);

    console.info(
      `[N5 · dérivation] ${String(cles.toolContext.length)} depuis ToolContext · ` +
        `${String(cles.habilitations.length)} depuis Habilitations · ` +
        `${String(cles.reservesHorsContexte.length)} nom(s) réservé(s) hors contexte · ` +
        `${String(cles.toutes.length)} au total · union recalculée : ${String(union.size)}`,
    );

    expect(cles.toolContext.length, "le contrôle 7 lit bien le `ctx`").toBeGreaterThan(0);
    expect(
      cles.reservesHorsContexte.length,
      "le troisième ensemble n'est pas vide",
    ).toBeGreaterThan(0);
    expect(cles.toutes.length, "le total est bien l'union des trois").toBe(union.size);
    // Et le total EXCÈDE les deux premiers : c'est ce que le rapport n'annonce pas.
    expect(cles.toutes.length, "le total dépasse les deux ensembles annoncés").toBeGreaterThan(
      deuxPremiers.size,
    );
  });

  /**
   * ✅ **CONSTAT FERMÉ À LA RECETTE DU LOT 1d — `it.fails` BASCULÉ EN `it()`.**
   *
   * Le rapport annonce désormais SES TROIS COMPTES. Le correctif était une
   * chaîne de caractères dans `core/adapter-kit/autorisation.spec.ts`, et un
   * plancher de plus sur `reservesHorsContexte`. Ce test-ci n'a été ni supprimé
   * ni affaibli : il portait l'attente de l'ADR 0020, il la MESURE maintenant, et
   * il rougira le jour où quelqu'un retirera le compte du message.
   *
   * ═══ CE QUE LE CONSTAT DISAIT, ET POURQUOI IL COMPTAIT ═══
   *
   * L'ADR 0020 l'exige mot pour mot : « le rapport du contrôle 7 ANNONCE LES
   * TROIS COMPTES : propriétés de `ToolContext`, propriétés de `Habilitations`,
   * noms réservés hors contexte ». Le rapport livré annonce
   * « 9 depuis ToolContext · 1 depuis Habilitations · 11 au total » — et
   * 9 + 1 ≠ 11. Le onzième nom EST le troisième ensemble, celui que l'ADR 0020
   * vient d'ajouter, et il est absorbé dans le total sans être nommé.
   *
   * ⚠️ POURQUOI CE DÉTAIL COMPTE ICI PLUS QU'AILLEURS. Ce troisième ensemble est
   *    exactement la pièce qui empêche le retrait d'`idempotencyKey` de ROUVRIR
   *    un canal en silence. S'il tombait à zéro, le total passerait de 11 à 10 —
   *    et un lecteur qui ne voit que « 9 · 1 · total » n'a aucune raison de
   *    trouver ce total anormal. Un plancher-témoin existe et lèverait ; mais la
   *    règle est de lire le COMPTE, pas la couleur, et ce compte-là n'est pas
   *    écrit. Le correctif est UNE chaîne de caractères.
   *
   * La mesure porte sur le SOURCE de la garde du socle, jamais sur son affichage.
   */
  it("✅ ADR 0020 — le rapport du contrôle 7 annonce ses TROIS comptes", () => {
    const source = readFileSync(
      fileURLToPath(new URL("../adapter-kit/autorisation.spec.ts", import.meta.url)),
      "utf8",
    );
    const CHAMPS = ["toolContext", "habilitations", "reservesHorsContexte"] as const;

    // ⚠️ **CE DÉCOUPAGE EST LE CORRECTIF D'UNE FAUSSE MESURE, ET IL A ÉTÉ TROUVÉ
    //    EN DÉBRANCHANT.** Ce témoin cherchait `cles.<champ>.length` dans TOUT le
    //    fichier. Le motif était juste tant que le troisième compte n'existait
    //    nulle part ; il a cessé de l'être à la seconde où le correctif a posé,
    //    dans le MÊME fichier, un plancher `expect(cles.reservesHorsContexte
    //    .length)`. Mesuré : en retirant le compte du MESSAGE et en laissant le
    //    plancher, ce témoin restait VERT et annonçait « 3 annoncés ». Il aurait
    //    gardé le plancher en croyant garder le rapport — la mesure était juste,
    //    son énoncé était plus large. Il ne lit donc plus que le `console.info`
    //    du rapport, isolé par son étiquette.
    const ETIQUETTE = "[garde noms interdits]";
    const debut = source.indexOf(ETIQUETTE);
    const rapport = debut < 0 ? "" : source.slice(debut, source.indexOf(");", debut));

    let confrontes = 0;
    const annonces: string[] = [];
    const absents: string[] = [];

    for (const champ of CHAMPS) {
      confrontes += 1;
      // On cherche la LECTURE du compte DANS LE MESSAGE, jamais le nom du champ :
      // il peut apparaître ailleurs dans le fichier sans que le rapport l'annonce.
      if (rapport.includes(`cles.${champ}.length`)) annonces.push(champ);
      else absents.push(champ);
    }

    console.info(
      `[N5 · rapport] ${String(confrontes)} compte(s) exigé(s) par l'ADR 0020 · ` +
        `${String(rapport.length)} caractère(s) de message isolé(s) · ` +
        `${String(annonces.length)} annoncé(s) : ${annonces.join(", ")} · ` +
        `${String(absents.length)} absent(s) : ${absents.join(", ") || "aucun"}`,
    );

    // Faits qui survivront au correctif : la lecture du source a eu lieu, le
    // message a bien été ISOLÉ — un découpage raté rendrait une chaîne vide, et
    // les trois comptes passeraient alors pour absents plutôt que pour présents,
    // ce qui est le bon sens de panne — et le premier compte y est.
    expect(confrontes, "plancher : trois comptes confrontés").toBe(3);
    expect(source.length, "le source de la garde a bien été lu").toBeGreaterThan(0);
    expect(rapport.length, "le message du rapport a bien été isolé").toBeGreaterThan(80);
    expect(rapport.length, "et il ne déborde pas sur le reste du fichier").toBeLessThan(
      source.length / 2,
    );
    expect(annonces, "le premier compte, lui, est bien annoncé").toContain("toolContext");

    // L'ATTENTE DE L'ADR 0020. Elle échouait jusqu'à la recette du lot 1d ; elle
    // tient depuis, et c'est elle qui rougira si le compte disparaît du message.
    expect(absents, "les trois comptes sont annoncés").toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  N6 · NOUVEAU — LE CLIQUET EST LU, ET SA LECTURE NE DÉCIDE JAMAIS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ COMMENT CE CONSTAT A ÉTÉ TROUVÉ — PAR UNE MUTATION QUI N'A RIEN FAIT ═══
 *
 * La campagne de mutation de cette épreuve a posé dix altérations du socle, une
 * par une, pour vérifier que chaque témoin SAIT rougir. Deux n'ont fait rougir
 * AUCUN test de ce fichier, et ce sont elles qui ont appris quelque chose :
 *
 *  · **retirer la première branche d'`issueDeReservation`** — celle qui lit le
 *    cliquet — ne change rien à ce que la CHAÎNE produit ;
 *  · **restaurer le ternaire du lot 1c** (`… === "done" ? "done" : "failed"`)
 *    ne le change pas davantage.
 *
 * Une mutation qui ne casse rien est un renseignement, pas un échec. Elle dit
 * ici deux choses distinctes, et il faut les séparer :
 *
 * ① **CE QUI A VRAIMENT REFERMÉ LE DÉFAUT DU LOT 1c EST `terminaisonRendue`,
 *    PAS LE CLIQUET.** L'orchestrateur pose ce fait juste après le retour de
 *    l'étape 14, AVANT le marquage de provenance. La panne d'aval que l'épreuve
 *    du lot 1c avait mesurée — l'index qui lève dans `marquerResultat` — tombe
 *    donc désormais dans la deuxième branche. C'est correct, et c'est solide.
 *
 * ② **LA BRANCHE DU CLIQUET N'EST DÉCISIVE DANS AUCUN CAS ATTEIGNABLE.** Le
 *    cliquet n'est levé que sous `estEffetExterieur(outil.effect)`
 *    (`orchestrateur.ts`, unique appelant), et la troisième branche rend déjà
 *    `done` sous exactement cette condition. Les deux ensembles COÏNCIDENT.
 *
 * ⚠️ CE N'EST PAS UN DÉFAUT, ET LE DIRE AINSI SERAIT FAUX. La branche est la
 *    bonne, et elle deviendra décisive le jour où la troisième cessera d'être
 *    aussi franchement fail-closed — l'ADR 0021 nomme d'ailleurs l'écart que
 *    cette troisième branche assume (« une panne survenue ENTRE la réservation
 *    et l'appel de l'adaptateur ferme la clé en `done` alors que rien n'est
 *    parti »). C'est une BORNE D'ÉPROUVABILITÉ, et elle s'écrit :
 *
 *    **aucun témoin de bout en bout ne peut aujourd'hui distinguer un socle qui
 *    lit le cliquet d'un socle qui l'ignore.** La seule garde du dépôt qui
 *    rougit sur cette mutation (`core/chaine/cliquet-et-lecteur.temoin.spec.ts`)
 *    appelle la fonction PURE avec un couple que la chaîne ne produit pas —
 *    cliquet levé sur un effet `read`. Elle garde donc la fonction, jamais son
 *    effet.
 *
 * ⚠️ POURQUOI L'ÉCRIRE PLUTÔT QUE DE LA TAIRE. Quiconque affinera la troisième
 *    branche — pour solder l'écart que l'ADR 0021 assume — croira que le cliquet
 *    le couvre. Il le couvrira, en effet ; mais aucune garde existante ne le
 *    VÉRIFIERA, parce qu'aucune ne le vérifie aujourd'hui. Le témoin ci-dessous
 *    est ce qui rendra ce jour-là visible.
 */
describe("N6 · le cliquet d'effet extérieur, et ce que sa lecture décide", () => {
  /**
   * TÉMOIN DE CAPACITÉ — LA TABLE EST BIEN PARCOURUE, ET ELLE SÉPARE.
   *
   * Sans lui, « zéro cellule où le cliquet décide » ne se distinguerait pas de
   * « la boucle n'a rien parcouru » ni de « `issueDeReservation` rend toujours
   * la même chose ».
   */
  it("SAIT SÉPARER : la table des issues distingue bien deux réponses", () => {
    const issues = new Set<string>();
    let cellules = 0;

    for (const effet of EFFECTS) {
      for (const rendue of [true, false]) {
        for (const cliquet of [true, false]) {
          cellules += 1;
          issues.add(
            issueDeReservation({
              effetExterieurSurvenu: cliquet,
              terminaisonRendue: rendue,
              effetDeclare: effet,
            }),
          );
        }
      }
    }

    console.info(
      `[N6 · capacité] ${String(cellules)} cellule(s) parcourue(s) sur ` +
        `${String(EFFECTS.length)} effet(s) · ${String(issues.size)} issue(s) DISTINCTE(s) : ` +
        `${[...issues].sort().join(", ")}`,
    );

    expect(cellules, "la table est parcourue en entier").toBe(EFFECTS.length * 4);
    expect(issues.size, "et elle rend bien DEUX issues différentes").toBe(2);
  });

  /**
   * 🔴 **NOUVEAU CONSTAT — MINEUR, ET C'EST UNE BORNE D'ÉPROUVABILITÉ.**
   *
   * L'ADR 0021 titre : « l'issue d'idempotence se dérive du CLIQUET, jamais du
   * genre de la terminaison ». La mesure ci-dessous cherche UNE combinaison
   * ATTEIGNABLE où la lecture du cliquet change l'issue. Il n'y en a aucune.
   *
   * « Atteignable » est dérivé, pas supposé : l'orchestrateur ne lève le cliquet
   * que sous `estEffetExterieur(outil.effect)`, et c'est `outil.effect` qu'il
   * passe en `effetDeclare`. Les couples (cliquet levé, effet non extérieur) ne
   * sont donc pas des cas, et les compter fausserait la mesure dans le sens
   * rassurant.
   */
  it.fails(
    "🔴 ADR 0021 — il doit exister un cas ATTEIGNABLE où la lecture du cliquet DÉCIDE",
    () => {
      let atteignables = 0;
      let ecartes = 0;
      const decisives: string[] = [];

      for (const effet of EFFECTS) {
        for (const rendue of [true, false]) {
          // Le cliquet ne peut être levé que sur un effet extérieur : c'est
          // l'unique appelant de `signalerEffetExterieur()` qui le dit.
          if (!estEffetExterieur(effet)) {
            ecartes += 1;
            continue;
          }
          atteignables += 1;
          const avec = issueDeReservation({
            effetExterieurSurvenu: true,
            terminaisonRendue: rendue,
            effetDeclare: effet,
          });
          const sans = issueDeReservation({
            effetExterieurSurvenu: false,
            terminaisonRendue: rendue,
            effetDeclare: effet,
          });
          if (avec !== sans) decisives.push(`${effet} · rendue=${String(rendue)}`);
        }
      }

      console.info(
        `[N6 · décision] ${String(atteignables)} couple(s) ATTEIGNABLE(s) confronté(s) · ` +
          `${String(ecartes)} écarté(s) (cliquet impossible sur cet effet) · ` +
          `${String(decisives.length)} cas où la LECTURE du cliquet change l'issue : ` +
          `${decisives.join(", ") || "aucun"}`,
      );

      // Faits qui survivront à toute évolution : la table a bien été parcourue,
      // et les effets se répartissent bien en deux familles.
      expect(
        atteignables,
        "plancher : des couples atteignables ont été confrontés",
      ).toBeGreaterThan(0);
      expect(ecartes, "et des couples ont bien été écartés comme impossibles").toBeGreaterThan(0);

      // L'ATTENTE DE L'ADR 0021, celle qui échoue aujourd'hui.
      expect(decisives.length, "le cliquet décide au moins une fois").toBeGreaterThan(0);
    },
  );

  /**
   * ✅ LA MOITIÉ QUI TIENT, ET ELLE N'EST PAS RIEN : le cliquet suit
   * `estEffetExterieur`, et NON `effect === "send"`. Un outil `destructive` pose
   * bien `externalEffect: true` dans sa ligne, un `read` ne le pose pas.
   */
  it("le cliquet suit `estEffetExterieur`, et la ligne d'audit le dit", async () => {
    let mesures = 0;
    const poses: string[] = [];

    for (const effet of EFFECTS) {
      mesures += 1;
      const harnais = monterSocle({
        outils: [
          outilLecteur({
            name: "courrier.acte",
            effect: effet,
            dataClass: "none",
            inputSchema: SCHEMA_VIDE,
          }),
        ],
        scopes: ["ops:read", "ops:draft", "ops:send", "ops:admin"],
        niveau: NIVEAU_LIBRE,
      });
      // `destructive` exige une confirmation à TOUS les niveaux (§ 19.2) : il
      // sera refusé, et sa ligne portera donc `externalEffect: false`. C'est
      // attendu, et c'est pourquoi la mesure porte sur les lignes SERVIES.
      const resultat = await appeler(harnais, appel({ nomComplet: "courrier.acte" }));
      const ligne = lignes(harnais)[0];
      if (issue(resultat) === "servi" && ligne?.externalEffect === true) poses.push(effet);
    }

    console.info(
      `[N6 · cliquet] ${String(mesures)} effet(s) confronté(s) · ` +
        `${String(poses.length)} ligne(s) servie(s) portant \`externalEffect: true\` : ` +
        `${poses.join(", ") || "aucun"} · effets extérieurs déclarés par le § 20 : ` +
        `${EFFECTS.filter((effet) => estEffetExterieur(effet)).join(", ")}`,
    );

    expect(mesures, "les quatre effets ont été confrontés").toBe(EFFECTS.length);
    // Ce qui est POSÉ est un sous-ensemble de ce que le § 20 déclare extérieur —
    // jamais l'inverse, qui serait une ligne mentant sur ce qui est sorti.
    for (const effet of poses) {
      expect(estEffetExterieur(effet as (typeof EFFECTS)[number]), `${effet} est extérieur`).toBe(
        true,
      );
    }
    expect(poses.length, "au moins un effet extérieur est bien attesté").toBeGreaterThan(0);
  });
});

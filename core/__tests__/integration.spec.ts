/**
 * `core/__tests__/integration.spec.ts` — LA CHAÎNE D'APPEL, DE BOUT EN BOUT.
 *
 * Six constructeurs ont travaillé sur six dossiers DISJOINTS. Chacun a gardé
 * son module ; aucun n'a pu voir si les six s'emboîtent. Ce fichier ne relit
 * rien : il ASSEMBLE, et il essaie de casser l'assemblage.
 *
 * Ce qu'il exerce, dans l'ordre du § 11 :
 *
 *   adapter-kit → registry → profiles (étape 7) → limits (étape 8)
 *              → policy (étape 10) → limits (étapes 12, 13) → exécution (14)
 *
 * et, par-dessus tout, L'INVARIANT DE SORTIE du § 11 :
 *
 *   « Le journal n'est PAS une étape — c'est un invariant de sortie. Toute
 *     terminaison, Y COMPRIS CHAQUE REFUS, écrit une ligne d'`ops_audit`
 *     portant le numéro de l'étape qui a refusé. »
 *
 * ── RÈGLE DE CE FICHIER ───────────────────────────────────────────────────
 * Chaque garde ANNONCE COMBIEN D'ÉLÉMENTS ELLE A MESURÉS, et échoue sous son
 * plancher-témoin. Un assemblage qui ne mesure rien serait vert pour la pire
 * des raisons — et c'est exactement ce qu'un test d'intégration écrit trop
 * gentiment fabrique.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import {
  APPEL_STEPS,
  EFFECTS,
  type AppelStep,
  type Effect,
  type ErrorCode,
  type OpsScope,
  type PolicyLevel,
} from "../types.js";

import { creerAdapterKit } from "../adapter-kit/kit.js";
import { IDEMPOTENCIES } from "../adapter-kit/types.js";
import { octetsCanoniques as octetsAdapterKit } from "../adapter-kit/json.js";
import { lireClesDAutorisation, sansCommentaires } from "../adapter-kit/autorisation.js";
import type { Manifeste } from "../adapter-kit/manifest.js";

import { empreinteDuManifesteRecu } from "../registry/lock.js";
import { enregistrerAdaptateur } from "../registry/enregistrer.js";
import type { LigneOpsTool, VerrouAdaptateurs } from "../registry/types.js";

import {
  CODE_REFUS_PROFIL,
  ETAPE_REFUS_PROFIL,
  PLAFOND_OUTILS_PAR_PROFIL,
  PROFILE_NAMES,
  SCEAU_PROFILS,
  estServi,
  mesurerBudgetProfil,
  octetsDeLaDefinition,
  outilsServis,
  type DefinitionOutil as DefinitionOutilServie,
  type ProfileName,
} from "../profiles/index.js";
// Les deux modules exportent `octetsCanoniques` — c'est le sujet même de la
// garde « un même fait, dérivé deux fois ». On garde les deux noms distincts.
import { octetsCanoniques as octetsCanoniquesProfils } from "../profiles/canonique.js";

import {
  ETAPE_POLITIQUE,
  deciderEtape10,
  ligneDeDemarrage,
  niveauApplique,
  referenceDepuisNom,
  type LignePolitique,
} from "../policy/index.js";

import {
  ETAPES_LIMITES,
  DepotIdempotenceEnMemoire,
  DepotQuotaEnMemoire,
  MODES_IDEMPOTENCE,
  appliquerLimites,
  cloturerLimites,
  creerCalculArgHash,
  type CalculArgHash,
  type CoffreArgHash,
  type ModeIdempotence,
  type ParametresLimites,
  type RefusIntercalaire,
  type ResultatValidation,
} from "../limits/index.js";

import {
  Journal,
  JournalMemoire,
  avecJournal,
  verifierChaine,
  type LigneAudit,
  type Terminaison,
} from "../audit/index.js";
import type { Horloge } from "../audit/ports.js";

import {
  CODE_COFFRE_VERROUILLE,
  Coffre,
  ETAPE_COFFRE,
  decisionDeDemarrage,
  type EtatCoffre,
} from "../vault/index.js";

import { ETAPES_REVENDIQUEES } from "../chaine/index.js";
import { SCELLEUR_TEMOIN } from "../audit/fixtures.js";
import { AUCUN_CHAMP_DE_GOUVERNANCE } from "../adapter-kit/types.js";
// ADR 0014 — la session de témoin vient de la fabrique NOMMÉE de `core/identite/` :
// le type marqué de `SessionId` ne se laisse plus écrire en littéral.
import { sessionIdDeTemoin } from "../identite/fixtures.js";
import type { SessionId } from "../identite/session.js";

// ═════════════════════════════════════════════════════════════════════════════
//  0 · Le décor — aucun secret réel, aucun réseau, une horloge figée
// ═════════════════════════════════════════════════════════════════════════════

const T0 = new Date("2026-08-30T18:04:11.000Z");
const PRINCIPAL = "jeton-integration";
const SESSION: SessionId = sessionIdDeTemoin();
const TTL_IDEMPOTENCE_MS = 24 * 3_600_000;

/** Une horloge qui avance d'une milliseconde par lecture : `durationMs` reste
 *  déterministe et NON NUL, donc réellement mesuré. */
function horlogeQuiAvance(depart: Date): Horloge {
  let tic = 0;
  return {
    maintenant(): Date {
      tic += 1;
      return new Date(depart.getTime() + tic);
    },
  };
}

/** Clé factice, longue de 44 caractères — le plancher du module est 32. */
const coffreArgHash: CoffreArgHash = {
  lireCleArgHash(): Promise<string> {
    return Promise.resolve("cle-factice-integration-0123456789abcdefghij");
  },
};

// ═════════════════════════════════════════════════════════════════════════════
//  1 · L'ASSEMBLAGE — un adaptateur fictif, écrit, enregistré, servi
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'énumération est PRISE À `core/profiles/`, jamais recopiée. Un profil ajouté
 * ou retiré traverse ce fichier sans qu'on y touche — et le kit refuse alors les
 * manifestes qui ne s'y conforment pas.
 */
const PROFILS_CONNUS: readonly ProfileName[] = PROFILE_NAMES;
const kit = creerAdapterKit<ProfileName>(PROFILS_CONNUS, SCEAU_PROFILS);

/**
 * Les noms qu'un schéma d'entrée n'a pas le droit de porter (§ 09, contrôle 7).
 *
 * DÉRIVÉS de `core/types.ts` — jamais écrits ici. `lireClesDAutorisation()` lit
 * les propriétés de `ToolContext` et de `Habilitations` dans le source, et lève
 * si la dérivation rend trop peu de clés : une liste vide rendrait le contrôle
 * vacueux, et l'absence d'alerte se lirait comme une absence de problème.
 */
const CLES_AUTORISATION = lireClesDAutorisation().toutes;

/** Un outil de LECTURE, pur, sans clé d'idempotence. */
const outilLecture = kit.definirOutil<z.ZodObject, z.ZodObject>({
  name: "inbox.recent",
  version: "1.0.0",
  description: "Les messages récents, tous canaux confondus.",
  effect: "read",
  dataClass: "personal",
  idempotency: "n/a",
  pagination: "page",
  input: z.object({ limite: z.number().int().min(1).max(100) }).strict(),
  output: z.object({ submissionId: z.string() }).strict(),
  maxBytes: 32_768,
  compaction: { free: [], tier2: [], aggregateBy: null },
  idFields: ["submissionId"],
  governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
  fixtureMax: "fixtures/inbox-max.json",
  handler: () => ({ submissionId: "s1" }),
});

/** Un outil à EFFET EXTÉRIEUR, rejouable par clé. C'est lui qui exerce le § 20. */
const outilEnvoi = kit.definirOutil<z.ZodObject, z.ZodObject>({
  name: "mail.envoyer",
  version: "1.0.0",
  description: "Envoie un courrier déjà rédigé.",
  effect: "send",
  dataClass: "personal",
  idempotency: "key",
  pagination: "none",
  input: z.object({ destinataire: z.string().min(1) }).strict(),
  output: z.object({ messageId: z.string() }).strict(),
  maxBytes: 8_192,
  compaction: { free: [], tier2: [], aggregateBy: null },
  idFields: ["messageId"],
  governanceFields: AUCUN_CHAMP_DE_GOUVERNANCE,
  fixtureMax: "fixtures/envoi-max.json",
  handler: () => ({ messageId: "m1" }),
});

const adaptateur = kit.defineAdapter({
  id: "temoin",
  version: "1.0.0",
  mode: "fédéré",
  profiles: ["courrier", "admin"],
  secrets: [],
  tools: [outilLecture, outilEnvoi],
});

const MANIFESTE: Manifeste = adaptateur.manifeste();

const VERROU: VerrouAdaptateurs = {
  lockVersion: 1,
  adapters: [
    {
      id: MANIFESTE.id,
      version: MANIFESTE.version,
      mode: MANIFESTE.mode,
      // DÉRIVÉE du manifeste : un SHA recopié ne prouverait que le copier-coller.
      manifestSha: empreinteDuManifesteRecu(MANIFESTE),
      trustTier: 1,
      maxDataClass: "personal",
      endpoint: "https://temoin.invalid/api/mcp",
      authMode: "secret-partage",
      secretRef: "temoin.mcp.shared",
    },
  ],
};

const ENREGISTREMENT = enregistrerAdaptateur({
  manifesteBrut: MANIFESTE,
  verrou: VERROU,
  profilsConnus: PROFILS_CONNUS,
  sceauProfils: SCEAU_PROFILS,
  clesDAutorisation: CLES_AUTORISATION,
});

/**
 * ⚠️ LA COUTURE MANQUANTE, matérialisée ici et NULLE PART DANS `core/`.
 *
 * `core/registry` produit des `LigneOpsTool` ; `core/profiles` mesure des
 * `DefinitionOutil`. Les deux décrivent `ops_tool`, et les deux ne portent pas
 * les mêmes champs. Cette fonction comble le trou À LA MAIN — ce qui est
 * précisément le constat, pas la solution. Voir la garde « les champs qu'aucun
 * producteur ne fournit ».
 */
function versDefinitionServie(
  ligne: LigneOpsTool,
  etat: { readonly enabled: boolean; readonly retireDeLaListe: boolean },
): DefinitionOutilServie {
  return {
    name: ligne.nomComplet,
    version: ligne.version,
    description: ligne.description,
    inputSchema: ligne.inputSchema,
    outputSchema: ligne.outputSchema,
    // Aucune assertion : depuis le lot 1, `LigneOpsTool.profiles` est resserré
    // sur `ProfileName`. La couture registre → profils tient au TYPE, pas à une
    // conversion que rien ne garderait.
    profiles: ligne.profiles,
    enabled: etat.enabled,
    retireDeLaListe: etat.retireDeLaListe,
  };
}

/** L'état de console des deux outils — la bascule du § 14, correction 3. */
const ETAT_CONSOLE = new Map<string, { enabled: boolean; retireDeLaListe: boolean }>([
  ["temoin.inbox.recent", { enabled: true, retireDeLaListe: false }],
  ["temoin.mail.envoyer", { enabled: true, retireDeLaListe: false }],
]);

function catalogueServi(): readonly DefinitionOutilServie[] {
  if (!ENREGISTREMENT.admis) return [];
  return ENREGISTREMENT.outils.map((ligne) =>
    versDefinitionServie(
      ligne,
      ETAT_CONSOLE.get(ligne.nomComplet) ?? { enabled: false, retireDeLaListe: false },
    ),
  );
}

describe("§ 09 → § 12 — l'adaptateur fictif traverse le kit puis le registre", () => {
  it("est admis, et rend autant de lignes `ops_tool` qu'il a d'outils", () => {
    expect(ENREGISTREMENT.admis).toBe(true);
    if (!ENREGISTREMENT.admis) return;

    console.log(
      `[assemblage] ${String(ENREGISTREMENT.outilsInspectes)} outil(s) inspecté(s), ` +
        `${String(ENREGISTREMENT.outils.length)} ligne(s) ops_tool produite(s)`,
    );

    expect(ENREGISTREMENT.outilsInspectes).toBe(MANIFESTE.tools.length);
    expect(ENREGISTREMENT.outils.length).toBe(MANIFESTE.tools.length);
    // Plancher-témoin : une mesure sur zéro outil serait verte pour rien.
    expect(ENREGISTREMENT.outils.length).toBeGreaterThanOrEqual(2);
  });

  it("sert les deux outils dans les profils de l'adaptateur, et aucun ailleurs", () => {
    const catalogue = catalogueServi();
    const parProfil = PROFILS_CONNUS.map((profil) => ({
      profil,
      servis: outilsServis(catalogue, profil).length,
    }));

    console.log(
      `[profils] ${String(PROFILS_CONNUS.length)} profil(s) mesuré(s) : ` +
        parProfil.map((p) => `${p.profil}=${String(p.servis)}`).join(" "),
    );

    expect(PROFILS_CONNUS.length).toBeGreaterThanOrEqual(4);
    expect(
      parProfil
        .filter((p) => p.servis > 0)
        .map((p) => p.profil)
        .sort(),
    ).toEqual([...MANIFESTE.profiles].sort());
  });

  it("mesure le budget du § 14 sur la liste SERVIE, et l'annonce en nombres", () => {
    const verdict = mesurerBudgetProfil("courrier", catalogueServi());
    console.log(
      `[budget] profil courrier : ${String(verdict.outilsExamines)} examiné(s), ` +
        `${String(verdict.outilsComptes)} compté(s), ${String(verdict.octetsMesures)} octets ` +
        `(plafonds ${String(verdict.plafondOutils)} / ${String(verdict.plafondOctets)})`,
    );
    expect(verdict.mesureAveugle).toBe(false);
    expect(verdict.outilsComptes).toBeGreaterThan(0);
    expect(verdict.depasse).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  2 · L'ORCHESTRATEUR — la chaîne du § 11, étapes 5 à 14
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ CET ORCHESTRATEUR N'EXISTE PAS DANS `core/`. Il est écrit ICI parce qu'il
 *    fallait bien quelque chose pour éprouver l'emboîtement — et son écriture
 *    est le premier constat du rapport : la chaîne du § 11 n'a AUCUN
 *    propriétaire. Cinq de ses dix étapes applicables au transport JSON-RPC
 *    (5, 6, 9, 11 et 14) ne sont revendiquées par aucun module ; elles sont
 *    donc écrites ici, à la main, et cette main-là n'est gardée par rien.
 */

/** § 19.2 — le scope exigé par un `effect`. DÉRIVÉ par totalité, pas listé. */
function scopeExigeParEffet(effet: Effect): OpsScope {
  switch (effet) {
    case "read":
      return "ops:read";
    case "write-draft":
      return "ops:draft";
    case "send":
      return "ops:send";
    case "destructive":
      // § 19.2 — « assujetti à `ops:send` ET à une confirmation systématique ».
      return "ops:send";
  }
}

interface AppelFictif {
  readonly outil: string;
  readonly effet: Effect;
  readonly modeIdempotence: ModeIdempotence;
  readonly scopes: readonly OpsScope[];
  readonly profilActif: ProfileName;
  readonly input: unknown;
  readonly valider: (input: unknown) => ResultatValidation<Record<string, unknown>>;
  /**
   * Observe l'empreinte à laquelle l'étape 10 lie son jeton de confirmation.
   * Sert à confronter cette valeur à celle que la LIGNE DE JOURNAL porte : la
   * garde « l'argHash du journal et celui du jeton » ne compare pas deux
   * calculs qu'elle aurait faits elle-même, mais deux valeurs que la CHAÎNE a
   * produites.
   */
  readonly espionArgHash?: (argHash: string) => void;
  readonly idempotencyKey: string | null;
  readonly curseur: { readonly valide: boolean } | null;
  readonly sessionMarquee: boolean;
  readonly argumentLibre: boolean;
  readonly confirmation: "absente" | "valide" | "invalide";
  /**
   * § 23 — l'état du coffre au moment de l'appel. C'est LUI que l'étape 0
   * interroge. Il vit sur l'appel plutôt que sur le contexte parce que le
   * témoin doit pouvoir refermer le coffre sans reconstruire tout le décor.
   */
  readonly etatCoffre: EtatCoffre;
  readonly lever?: boolean;
}

interface Contexte {
  readonly journal: Journal;
  readonly store: JournalMemoire;
  readonly quota: DepotQuotaEnMemoire;
  readonly idempotence: DepotIdempotenceEnMemoire;
  readonly calcul: CalculArgHash;
  readonly politique: readonly LignePolitique[];
  readonly catalogue: readonly DefinitionOutilServie[];
}

function contexteNeuf(politique: readonly LignePolitique[]): Contexte {
  const store = new JournalMemoire();
  return {
    store,
    journal: new Journal(SCELLEUR_TEMOIN, store, horlogeQuiAvance(T0)),
    quota: new DepotQuotaEnMemoire(),
    idempotence: new DepotIdempotenceEnMemoire(),
    calcul: creerCalculArgHash(coffreArgHash),
    politique,
    catalogue: catalogueServi(),
  };
}

function refus(etape: AppelStep, code: ErrorCode | null): Terminaison<never> {
  return { genre: "refus", etape, code };
}

/**
 * Exécute la chaîne. Le corps ne peut pas sortir sans écrire : c'est
 * `avecJournal` qui rend la valeur, jamais le corps (invariant du § 11).
 */
async function executerAppel(
  ctx: Contexte,
  appel: AppelFictif,
): Promise<{ terminaison: Terminaison<unknown>; ligne: { seq: bigint } }> {
  const definition = ctx.catalogue.find((outil) => outil.name === appel.outil);

  const niveau: PolicyLevel = niveauApplique(
    ctx.politique,
    referenceDepuisNom(MANIFESTE.id, appel.outil),
    T0,
  ).niveau;

  // L'en-tête est figé AVANT la chaîne : un refus d'étape 5 doit encore pouvoir
  // s'écrire. `argHash` y est donc calculé sur la charge BRUTE — voir la garde
  // « deux argHash pour un seul appel ».
  const argHashEntete = await ctx.calcul.calculer(appel.outil, appel.input).catch(() => null);

  return avecJournal(
    ctx.journal,
    {
      principal: PRINCIPAL,
      sessionId: SESSION,
      tool: appel.outil,
      toolVersion: definition?.version ?? "0",
      adapterVersion: MANIFESTE.version,
      effect: appel.effet,
      policyLevel: niveau,
      argHash: argHashEntete ?? "0".repeat(64),
    },
    async ({ affinerArgHash }): Promise<Terminaison<unknown>> => {
      if (appel.lever === true) throw new Error("panne simulée de l'adaptateur");

      // ── ÉTAPE 0 — le coffre. `core/vault` (§ 23). ────────────────────────
      //
      // Elle PRÉCÈDE tout le reste : l'outil existe, il est au profil, les
      // scopes suffisent — c'est le socle qui ne peut rien déchiffrer. Le
      // numéro et le code sont DÉRIVÉS de `core/vault`, jamais écrits ici
      // (ADR 0005).
      if (!decisionDeDemarrage(appel.etatCoffre).appelsDOutilsAcceptes) {
        return refus(ETAPE_COFFRE, CODE_COFFRE_VERROUILLE);
      }

      // ── ÉTAPE 5 — scopes. AUCUN MODULE DE `core/` NE LA PORTE. ───────────
      if (!appel.scopes.includes(scopeExigeParEffet(appel.effet))) {
        return refus(5, null);
      }

      // ── ÉTAPE 6 — l'outil existe et est activé. AUCUN MODULE NON PLUS. ───
      if (definition === undefined || !definition.enabled) {
        return refus(6, "tool_disabled");
      }

      // ── ÉTAPE 7 — profil actif. `core/profiles`. ─────────────────────────
      if (!estServi(definition, appel.profilActif)) {
        return refus(ETAPE_REFUS_PROFIL, CODE_REFUS_PROFIL);
      }
      // § 14 — le plafond se refuse ICI, pas seulement en CI.
      if (outilsServis(ctx.catalogue, appel.profilActif).length > PLAFOND_OUTILS_PAR_PROFIL) {
        return refus(ETAPE_REFUS_PROFIL, CODE_REFUS_PROFIL);
      }

      // ── ÉTAPES 8 → 9 → 10 → 11 → 12 → 13, DANS L'ORDRE DU § 11. ─────────
      //
      // `appliquerLimites` porte 8, 12 et 13 ; les étapes 9, 10 et 11 vivent
      // dans la COUTURE `entreSchemaEtQuota`, qui reçoit la valeur validée et
      // son `argHash`. Deux conséquences, toutes deux mesurées par les gardes
      // de ce fichier :
      //  · le schéma n'est évalué QU'UNE FOIS par appel ;
      //  · un refus de politique ne consomme AUCUNE unité de quota, parce
      //    qu'il est prononcé avant l'étape 12.
      const limites = await appliquerLimites({
        tool: appel.outil,
        effect: appel.effet,
        modeIdempotence: appel.modeIdempotence,
        principal: PRINCIPAL,
        idempotencyKey: appel.idempotencyKey,
        input: appel.input,
        validerEntree: appel.valider,
        calcul: ctx.calcul,
        depotQuota: ctx.quota,
        depotIdempotence: ctx.idempotence,
        limiteOutil: null,
        warnAtOutil: null,
        ttlIdempotenceMs: TTL_IDEMPOTENCE_MS,
        maintenant: T0,
        entreSchemaEtQuota: (_valide, argHashValide): RefusIntercalaire | null => {
          // ⚠️ L'EN-TÊTE DU JOURNAL EST AFFINÉ ICI, ET NULLE PART AILLEURS.
          //    L'étape 8 vient de réussir : c'est désormais l'empreinte de la
          //    valeur VALIDÉE qui fait foi — celle à laquelle le jeton de
          //    confirmation du § 20 se lie, donc celle que `ops_audit.argHash`
          //    doit porter pour que le journal et le jeton désignent le MÊME
          //    appel.
          affinerArgHash(argHashValide);
          appel.espionArgHash?.(argHashValide);

          // ── ÉTAPE 9 — le curseur. AUCUN MODULE DE `core/` NE LA PORTE. ───
          if (appel.curseur !== null && !appel.curseur.valide) {
            return { etape: 9, code: "cursor_invalid" };
          }

          // ── ÉTAPE 10 — la politique. `core/policy`. ──────────────────────
          const decision = deciderEtape10({
            effet: appel.effet,
            niveau,
            confirmation: appel.confirmation,
            cible: { tool: appel.outil, argHash: argHashValide },
          });
          if (decision.decision === "refuse") {
            // `deciderEtape10` rend 10 ou une étape voisine : on la resserre
            // sur la couture, en la mesurant plutôt qu'en la supposant.
            const etape = decision.etape === 10 ? 10 : decision.etape === 11 ? 11 : 9;
            return { etape, code: decision.code };
          }

          // ── ÉTAPE 11 — provenance. AUCUN MODULE DE `core/` NE LA PORTE. ──
          if (appel.sessionMarquee && appel.argumentLibre) {
            return { etape: 11, code: "provenance_denied" };
          }

          return null;
        },
      });

      if (!limites.ok) return refus(limites.etape, limites.code);

      if (limites.rejeu) {
        return {
          genre: "succès",
          valeur: { rejeu: true },
          outcome: "ok",
          recordIds: [],
          partialSources: [],
        };
      }

      // ── ÉTAPE 14 — exécution. AUCUN MODULE DE `core/` NE LA PORTE. ───────
      await cloturerLimites({
        depotIdempotence: ctx.idempotence,
        resultat: limites,
        issue: "done",
        resultRef: "ref-1",
        maintenant: T0,
      });

      return {
        genre: "succès",
        valeur: { fait: true },
        outcome: "ok",
        recordIds: ["s1"],
        partialSources: [],
      };
    },
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  3 · Les témoins — un appel par terminaison possible
// ═════════════════════════════════════════════════════════════════════════════

const SCHEMA_LECTURE = z.object({ limite: z.number().int().min(1).max(100) }).strict();
const SCHEMA_ENVOI = z.object({ destinataire: z.string().min(1) }).strict();

function validateurZod(
  schema: z.ZodType,
): (input: unknown) => ResultatValidation<Record<string, unknown>> {
  return (input: unknown): ResultatValidation<Record<string, unknown>> => {
    const analyse = schema.safeParse(input);
    if (analyse.success) {
      return { ok: true, valeur: analyse.data as Record<string, unknown> };
    }
    const premier = analyse.error.issues[0];
    return {
      ok: false,
      champ: premier === undefined ? "(racine)" : premier.path.join(".") || "(racine)",
      attendu: premier?.message ?? "valeur conforme au schéma",
    };
  };
}

const LECTURE: AppelFictif = {
  outil: "temoin.inbox.recent",
  effet: "read",
  modeIdempotence: "n/a",
  scopes: ["ops:read"],
  profilActif: "courrier",
  input: { limite: 25 },
  valider: validateurZod(SCHEMA_LECTURE),
  idempotencyKey: null,
  curseur: null,
  sessionMarquee: false,
  argumentLibre: false,
  confirmation: "absente",
  etatCoffre: "ouvert",
};

const ENVOI: AppelFictif = {
  outil: "temoin.mail.envoyer",
  effet: "send",
  modeIdempotence: "key",
  scopes: ["ops:read", "ops:send"],
  profilActif: "courrier",
  input: { destinataire: "quelquun@exemple.invalid" },
  valider: validateurZod(SCHEMA_ENVOI),
  idempotencyKey: "cle-1",
  curseur: null,
  sessionMarquee: false,
  argumentLibre: false,
  confirmation: "valide",
  etatCoffre: "ouvert",
};

/** Politique de démarrage : `brouillon`, portée `*`, sans expiration. */
const POLITIQUE_BROUILLON: readonly LignePolitique[] = [
  ligneDeDemarrage(T0, "démarrage du socle — aucun effet extérieur"),
];

/** Politique desserrée à `libre` sur tout, pour laisser passer les `send`. */
const POLITIQUE_LIBRE: readonly LignePolitique[] = [
  {
    id: "libre-1",
    level: "libre",
    scope: "*",
    channel: "console",
    expiresAt: new Date(T0.getTime() + 3_600_000),
    supersededAt: null,
    setBy: "will",
    setAt: T0,
    reason: "témoin d'intégration",
  },
];

/** Chaque témoin vise UNE étape, et une seule. */
interface Temoin {
  readonly etape: AppelStep;
  readonly politique: readonly LignePolitique[];
  readonly appel: AppelFictif;
  /** Appels à jouer AVANT le témoin, pour amener le socle dans l'état voulu. */
  readonly prelude?: readonly AppelFictif[];
}

const TEMOINS: readonly Temoin[] = [
  {
    // § 23 — coffre verrouillé : l'appel est refusé AVANT toute autre étape,
    // sur un outil qui existe, qui est activé, et qui est au profil actif.
    etape: ETAPE_COFFRE,
    politique: POLITIQUE_BROUILLON,
    appel: { ...LECTURE, etatCoffre: "verrouillé" },
  },
  {
    etape: 5,
    politique: POLITIQUE_LIBRE,
    appel: { ...ENVOI, scopes: ["ops:read"] },
  },
  {
    etape: 6,
    politique: POLITIQUE_BROUILLON,
    appel: { ...LECTURE, outil: "temoin.inbox.inexistant" },
  },
  {
    etape: 7,
    politique: POLITIQUE_BROUILLON,
    appel: { ...LECTURE, profilActif: "audit" },
  },
  {
    etape: 8,
    politique: POLITIQUE_BROUILLON,
    appel: { ...LECTURE, input: { limite: "vingt-cinq" } },
  },
  {
    etape: 9,
    politique: POLITIQUE_BROUILLON,
    appel: { ...LECTURE, curseur: { valide: false } },
  },
  {
    etape: 10,
    politique: POLITIQUE_BROUILLON,
    appel: { ...ENVOI, confirmation: "absente" },
  },
  {
    etape: 11,
    politique: POLITIQUE_BROUILLON,
    appel: { ...LECTURE, sessionMarquee: true, argumentLibre: true },
  },
  {
    etape: 12,
    politique: POLITIQUE_BROUILLON,
    // La rafale est de 10 / 10 s : le onzième appel est refusé.
    prelude: Array.from({ length: 10 }, () => LECTURE),
    appel: LECTURE,
  },
  {
    etape: 13,
    politique: POLITIQUE_LIBRE,
    // Même clé, autres arguments ⇒ `invalid_input` à l'étape 13 (§ 12).
    prelude: [ENVOI],
    appel: { ...ENVOI, input: { destinataire: "autre@exemple.invalid" } },
  },
  {
    etape: 14,
    politique: POLITIQUE_LIBRE,
    appel: ENVOI,
  },
];

describe("§ 11 — la chaîne d'appel, une terminaison par étape", () => {
  it("refuse à l'étape visée, et JAMAIS à une autre", async () => {
    const observees: { etape: AppelStep; obtenue: AppelStep | null }[] = [];

    for (const temoin of TEMOINS) {
      const ctx = contexteNeuf(temoin.politique);
      for (const avant of temoin.prelude ?? []) await executerAppel(ctx, avant);
      const { terminaison } = await executerAppel(ctx, temoin.appel);

      observees.push({
        etape: temoin.etape,
        obtenue: terminaison.genre === "refus" ? terminaison.etape : null,
      });
    }

    console.log(
      `[chaîne] ${String(observees.length)} terminaison(s) exercée(s) : ` +
        observees
          .map((o) => `${String(o.etape)}→${o.obtenue === null ? "succès" : String(o.obtenue)}`)
          .join(" "),
    );

    // Plancher-témoin, DÉRIVÉ : autant de témoins que d'étapes applicables au
    // transport JSON-RPC. Une étape ajoutée au § 11 fait rougir cette ligne.
    const etapesJsonRpc = APPEL_STEPS.filter((etape) => !etape.httpSeul);
    expect(observees.length).toBe(etapesJsonRpc.length);

    for (const observee of observees) {
      if (observee.etape === 14) {
        expect(observee.obtenue).toBeNull();
      } else {
        expect(observee.obtenue).toBe(observee.etape);
      }
    }
  });

  it("écrit EXACTEMENT une ligne par appel, refus compris, avec le bon `stepDenied`", async () => {
    let lignes = 0;
    let appels = 0;
    const stepsEcrits: (number | null)[] = [];

    for (const temoin of TEMOINS) {
      const ctx = contexteNeuf(temoin.politique);
      for (const avant of temoin.prelude ?? []) {
        await executerAppel(ctx, avant);
        appels += 1;
      }
      await executerAppel(ctx, temoin.appel);
      appels += 1;

      const toutes = ctx.store.toutes();
      lignes += toutes.length;
      const derniere = toutes[toutes.length - 1];
      stepsEcrits.push(derniere?.stepDenied ?? null);
    }

    console.log(
      `[invariant] ${String(appels)} appel(s), ${String(lignes)} ligne(s) de journal, ` +
        `stepDenied écrits : ${stepsEcrits.map((s) => (s === null ? "—" : String(s))).join(" ")}`,
    );

    expect(appels).toBeGreaterThanOrEqual(TEMOINS.length);
    expect(lignes).toBe(appels);

    const attendus = TEMOINS.map((t) => (t.etape === 14 ? null : t.etape));
    expect(stepsEcrits).toEqual(attendus);
  });

  it("journalise AUSSI la panne, puis laisse repartir l'exception", async () => {
    const ctx = contexteNeuf(POLITIQUE_BROUILLON);
    await expect(executerAppel(ctx, { ...LECTURE, lever: true })).rejects.toThrow(
      "panne simulée de l'adaptateur",
    );

    const toutes = ctx.store.toutes();
    console.log(`[panne] ${String(toutes.length)} ligne(s) écrite(s) sur un corps qui lève`);
    expect(toutes.length).toBe(1);
    expect(toutes[0]?.decision).toBe("interrompu");
    expect(toutes[0]?.outcome).toBe("erreur");
    expect(toutes[0]?.stepDenied).toBeNull();
  });

  it("journal en panne ET corps qui lève : la cause première ne doit pas disparaître", async () => {
    const storeMuet: JournalMemoire = new JournalMemoire();
    const enPanne = new Journal(
      SCELLEUR_TEMOIN,
      {
        dernierSelfHash: () => Promise.reject(new Error("ops_audit injoignable")),
        ajouter: (ligne) => storeMuet.ajouter(ligne),
        lireDepuis: (seq, limite) => storeMuet.lireDepuis(seq, limite),
      },
      horlogeQuiAvance(T0),
    );

    let attrapee: unknown = null;
    try {
      await avecJournal(
        enPanne,
        {
          principal: PRINCIPAL,
          sessionId: SESSION,
          tool: "temoin.inbox.recent",
          toolVersion: "1.0.0",
          adapterVersion: MANIFESTE.version,
          effect: "read",
          policyLevel: "brouillon",
          argHash: "0".repeat(64),
        },
        () => Promise.reject(new Error("panne première de l'adaptateur")),
      );
    } catch (erreur: unknown) {
      attrapee = erreur;
    }

    const texte = attrapee instanceof Error ? `${attrapee.name}: ${attrapee.message}` : "aucune";

    // ⚠️ ON PARCOURT LES DEUX AXES, PAS SEULEMENT `cause`. Une double panne
    //    produit un `AggregateError` : la panne applicative et l'échec de
    //    journal sont deux causes ANTÉRIEURES ET INDÉPENDANTES l'une de
    //    l'autre, pas une chaîne. Ne suivre que `cause` ne verrait qu'une
    //    moitié de ce qui s'est passé — et déclarerait perdue une erreur qui
    //    est là.
    const causes: string[] = [];
    const aVisiter: unknown[] = [attrapee];
    for (let i = 0; i < 10 && aVisiter.length > 0; i += 1) {
      const courante = aVisiter.pop();
      if (!(courante instanceof Error)) continue;
      causes.push(courante.message);
      if (courante instanceof AggregateError) aVisiter.push(...(courante.errors as unknown[]));
      if (courante.cause !== undefined) aVisiter.push(courante.cause);
    }

    console.log(
      `[double panne] 1 appel mesuré — exception rendue : ${texte} ; ` +
        `${String(causes.length)} erreur(s) atteignable(s) : ${causes.join(" ← ")}`,
    );

    expect(attrapee).toBeInstanceOf(Error);
    // Plancher-témoin : un parcours qui ne trouverait rien serait vert sur un
    // `toContain` d'une chaîne vide.
    expect(causes.length).toBeGreaterThanOrEqual(2);
    // L'INVARIANT : la panne applicative reste atteignable. Sans elle, le seul
    // diagnostic de la cause d'origine serait perdu — et il n'y a, par
    // construction, aucune ligne de journal pour le rattraper.
    expect(causes.join(" ← ")).toContain("panne première de l'adaptateur");
    // Et l'indisponibilité du journal ne se perd pas non plus.
    expect(causes.join(" ← ")).toContain("journal");
  });

  it("produit une chaîne de hachage VÉRIFIABLE sur l'ensemble des terminaisons", async () => {
    const ctx = contexteNeuf(POLITIQUE_LIBRE);
    for (const temoin of TEMOINS) {
      for (const avant of temoin.prelude ?? []) await executerAppel(ctx, avant);
      await executerAppel(ctx, temoin.appel).catch(() => undefined);
    }

    const lignes: readonly LigneAudit[] = ctx.store.toutes();
    const rapport = verifierChaine(SCELLEUR_TEMOIN, lignes, {});
    console.log(
      `[chaînage] ${String(rapport.lignesVerifiees)} ligne(s) vérifiée(s), ` +
        `${String(rapport.anomalies.length)} anomalie(s)`,
    );
    expect(rapport.lignesVerifiees).toBeGreaterThanOrEqual(TEMOINS.length);
    expect(rapport.anomalies).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  4 · LES ÉTAPES SANS PROPRIÉTAIRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Chaque module qui PORTE une étape l'annonce par une constante exportée. On
 * réunit ces annonces, et on les compare aux étapes du § 11 applicables au
 * transport JSON-RPC. Ce qui reste n'appartient à personne — et sera donc
 * réécrit, différemment, par chaque appelant.
 */
describe("§ 11 — quelles étapes un module revendique-t-il ?", () => {
  /**
   * ✅ DÉ-`todo`-ÉE AU LOT 1b (2026-08-31), ET VOICI EXACTEMENT CE QUI A CHANGÉ.
   *
   * À la fin du lot 1, cinq des dix étapes du § 11 applicables au transport
   * JSON-RPC n'avaient AUCUN module propriétaire — 5, 6, 9, 11, 14 — et cette
   * garde était marquée `.todo` parce qu'elle ne pouvait pas verdir sans qu'on
   * écrive cinq modules.
   *
   * `core/chaine/etapes.ts` les revendique désormais, par
   * `ETAPES_REVENDIQUEES`, dérivé comme `ETAPE_POLITIQUE` et `ETAPES_LIMITES`
   * le font déjà. `core/vault` revendique en outre l'étape 0 du § 23, ajoutée
   * au § 11 par l'ADR 0005.
   *
   * ⚠️ CE QUE CE VERT DIT, ET CE QU'IL NE DIT PAS. Il dit qu'aucune étape n'est
   *    sans PROPRIÉTAIRE : plus aucun appelant n'a de raison d'écrire un numéro
   *    d'étape ou un code d'erreur à la main. Il NE DIT RIEN de l'exécution :
   *    les cinq étapes de `core/chaine` sont DÉCLARÉES, pas implémentées, et
   *    l'orchestrateur LÈVE. C'est `core/chaine/etapes.spec.ts` qui mesure
   *    cette seconde chose, par la cohérence `statut`/`executer` du registre —
   *    une entrée ne peut pas se dire implémentée sans porter de fonction.
   *
   *    Les deux gardes ensemble disent la vérité. Celle-ci seule dirait trop,
   *    et c'est pourquoi le commentaire précède le vert plutôt que de le suivre.
   */
  it("dit combien d'étapes sont revendiquées, et lesquelles ne le sont pas", () => {
    const revendiquees = new Set<number>([
      ETAPE_COFFRE, // core/vault
      ETAPE_REFUS_PROFIL, // core/profiles
      ETAPE_POLITIQUE, // core/policy
      ...ETAPES_LIMITES, // core/limits
      ...ETAPES_REVENDIQUEES, // core/chaine — DÉCLARÉES, pas implémentées
    ]);

    const applicables = APPEL_STEPS.filter((etape) => !etape.httpSeul);
    const orphelines = applicables.filter((etape) => !revendiquees.has(etape.numero));

    console.log(
      `[propriété] ${String(applicables.length)} étape(s) applicables au JSON-RPC, ` +
        `${String(revendiquees.size)} revendiquée(s) par un module, ` +
        `${String(orphelines.length)} orpheline(s) : ` +
        orphelines.map((e) => `${String(e.numero)} (${e.cle})`).join(", "),
    );

    // Plancher-témoin : la dérivation doit avoir vu quelque chose.
    expect(applicables.length).toBeGreaterThanOrEqual(10);
    expect(revendiquees.size).toBeGreaterThanOrEqual(1);

    expect(orphelines.map((e) => e.numero)).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  5 · LES PORTS DÉCLARÉS ET JAMAIS FOURNIS
// ═════════════════════════════════════════════════════════════════════════════

/** Les membres de premier niveau d'une interface, lus dans la source. */
function membresDInterface(source: string, nom: string): readonly string[] {
  const propre = sansCommentaires(source);
  const declaration = new RegExp(`\\binterface\\s+${nom}\\b[^{]*\\{`).exec(propre);
  if (declaration === null) return [];

  let profondeur = 0;
  let debut = -1;
  let fin = -1;
  for (let i = declaration.index; i < propre.length; i += 1) {
    const caractere = propre[i];
    if (caractere === "{") {
      if (profondeur === 0) debut = i + 1;
      profondeur += 1;
    } else if (caractere === "}") {
      profondeur -= 1;
      if (profondeur === 0) {
        fin = i;
        break;
      }
    }
  }
  if (debut === -1 || fin === -1) return [];

  const membres: string[] = [];
  let niveau = 0;
  for (const ligne of propre.slice(debut, fin).split("\n")) {
    if (niveau === 0) {
      const trouve = /^\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)\s*\??\s*[:(<]/.exec(ligne);
      const nomMembre = trouve?.[1];
      if (nomMembre !== undefined && !membres.includes(nomMembre)) membres.push(nomMembre);
    }
    for (const caractere of ligne) {
      if (caractere === "{") niveau += 1;
      else if (caractere === "}") niveau -= 1;
    }
  }
  return membres;
}

function lireSource(relatif: string): string {
  return readFileSync(fileURLToPath(new URL(relatif, import.meta.url)), "utf8");
}

describe("les ports qu'un module déclare et qu'un autre doit fournir", () => {
  it("`core/audit` déclare `ArgHasher` — `core/limits` doit l'implémenter", () => {
    const membres = membresDInterface(lireSource("../audit/ports.ts"), "ArgHasher");
    const fourni = creerCalculArgHash(coffreArgHash) as unknown as Record<string, unknown>;
    const absents = membres.filter((membre) => typeof fourni[membre] !== "function");

    console.log(
      `[port ArgHasher] ${String(membres.length)} membre(s) déclaré(s) : ` +
        `${membres.join(", ")} — ${String(absents.length)} absent(s) chez le fournisseur ` +
        `annoncé (core/limits, \`creerCalculArgHash\`)`,
    );

    // Plancher-témoin : si la lecture de la source rendait zéro membre, la
    // garde serait verte sans avoir rien regardé.
    expect(membres.length).toBeGreaterThanOrEqual(1);
    // 🔴 CONSTAT — `core/limits` expose `calculer`/`correspond`, jamais `argHash`.
    expect(absents).toEqual([]);
  });

  it("`core/limits` déclare `CoffreArgHash` — `core/vault` doit le fournir", () => {
    const membres = membresDInterface(lireSource("../limits/arg-hash.ts"), "CoffreArgHash");
    const surLeCoffre = Object.getOwnPropertyNames(Coffre.prototype);
    const absents = membres.filter((membre) => !surLeCoffre.includes(membre));

    console.log(
      `[port CoffreArgHash] ${String(membres.length)} membre(s) déclaré(s) : ` +
        `${membres.join(", ")} — ${String(surLeCoffre.length)} membre(s) sur \`Coffre\`, ` +
        `${String(absents.length)} absent(s)`,
    );

    expect(membres.length).toBeGreaterThanOrEqual(1);
    expect(surLeCoffre.length).toBeGreaterThanOrEqual(5);
    // 🔴 CONSTAT — `Coffre` expose `lire(nom, version)`, jamais `lireCleArgHash`.
    expect(absents).toEqual([]);
  });

  it("les champs qu'`ops_tool` doit porter et qu'aucun producteur ne fournit", () => {
    if (!ENREGISTREMENT.admis) throw new Error("l'assemblage a échoué avant la mesure");
    const produits = Object.keys(ENREGISTREMENT.outils[0] ?? {});
    const exiges = membresDInterface(lireSource("../profiles/budget.ts"), "DefinitionOutil");
    const absents = exiges.filter((champ) => !produits.includes(champ));

    console.log(
      `[couture ops_tool] ${String(exiges.length)} champ(s) exigés par ` +
        `core/profiles.DefinitionOutil, ${String(produits.length)} champ(s) produits par ` +
        `core/registry.LigneOpsTool, ${String(absents.length)} absent(s) : ${absents.join(", ")}`,
    );

    expect(exiges.length).toBeGreaterThanOrEqual(6);
    expect(produits.length).toBeGreaterThanOrEqual(6);
    // 🔴 CONSTAT — `enabled` et `retireDeLaListe` ne sont produits par personne,
    //    et `retireDeLaListe` n'a même pas de colonne dans `prisma/schema.prisma`.
    expect(absents).toEqual([]);
  });

  it("`retireDeLaListe` (§ 13.4) a-t-il seulement une colonne en base ?", () => {
    const schema = lireSource("../../prisma/schema.prisma");
    const bloc = /model OpsTool \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? "";
    const colonnes = [...bloc.matchAll(/^\s{2}([a-zA-Z][\w]*)\s+\S/gm)].map((m) => m[1]);
    const marqueurs = ["retireDeLaListe", "deprecated", "sunsetAt", "retiredAt"];
    const trouves = marqueurs.filter((marqueur) => colonnes.includes(marqueur));

    console.log(
      `[schéma ops_tool] ${String(colonnes.length)} colonne(s) lue(s) : ${colonnes.join(", ")} — ` +
        `${String(trouves.length)} marqueur(s) de dépréciation sur ${String(marqueurs.length)} cherché(s)`,
    );

    expect(colonnes.length).toBeGreaterThanOrEqual(10);
    // 🔴 CONSTAT — le § 13.4 (« une version dépréciée SORT de tools/list ») n'a
    //    aucune source de vérité en base ; `estServi` lira toujours `false`.
    expect(trouves.length).toBeGreaterThanOrEqual(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  6 · DEUX DÉRIVATIONS D'UN MÊME FAIT
// ═════════════════════════════════════════════════════════════════════════════

describe("un même fait, dérivé deux fois", () => {
  it("`ops_tool.bytes` : le registre et le budget ne mesurent pas la même chose", () => {
    if (!ENREGISTREMENT.admis) throw new Error("l'assemblage a échoué avant la mesure");
    const catalogue = catalogueServi();

    const ecarts = ENREGISTREMENT.outils.map((ligne, index) => {
      const servie = catalogue[index];
      return {
        outil: ligne.nomComplet,
        registre: ligne.bytes,
        budget: servie === undefined ? -1 : octetsDeLaDefinition(servie),
      };
    });

    console.log(
      `[bytes] ${String(ecarts.length)} outil(s) mesuré(s) deux fois : ` +
        ecarts
          .map((e) => `${e.outil} registre=${String(e.registre)} budget=${String(e.budget)}`)
          .join(" · "),
    );

    expect(ecarts.length).toBeGreaterThanOrEqual(2);
    // 🔴 CONSTAT — `core/registry` écrit dans `ops_tool.bytes` le poids de
    //    l'entrée COMPLÈTE du manifeste ; `core/profiles` mesure le poids de la
    //    PROJECTION SERVIE. Le § 12 dit « bytes », le § 14 compte des octets
    //    servis : deux nombres, une colonne.
    for (const ecart of ecarts) expect(ecart.budget).toBe(ecart.registre);
  });

  it("les deux implémentations de JSON canonique rendent le même octet-compte", () => {
    const echantillons: unknown[] = [
      {},
      { b: 1, a: 2 },
      { a: [1, "deux", null, true] },
      { accent: "éàü", imbrique: { z: 1, a: { profond: [] } } },
      MANIFESTE.tools[0]?.inputSchema ?? {},
    ];

    const ecarts = echantillons.filter((valeur, index) => {
      const gauche = octetsAdapterKit(valeur as never);
      const droite = octetsCanoniquesProfils(valeur, `$[${String(index)}]`);
      return gauche !== droite;
    });

    console.log(
      `[canonique] ${String(echantillons.length)} échantillon(s) mesuré(s) par les deux ` +
        `implémentations, ${String(ecarts.length)} écart(s)`,
    );
    expect(echantillons.length).toBeGreaterThanOrEqual(5);
    expect(ecarts).toEqual([]);
  });

  it("`MODES_IDEMPOTENCE` et `IDEMPOTENCIES` sont deux listes, écrites deux fois", () => {
    console.log(
      `[idempotence] core/limits en déclare ${String(MODES_IDEMPOTENCE.length)}, ` +
        `core/adapter-kit en déclare ${String(IDEMPOTENCIES.length)}`,
    );
    expect(MODES_IDEMPOTENCE.length).toBeGreaterThanOrEqual(3);
    // Vraie AUJOURD'HUI, et c'est bien le problème : rien n'empêche l'une de
    // bouger sans l'autre — un manifeste déclarerait alors un mode que
    // `core/limits` ne connaît pas, sans erreur de compilation.
    expect([...MODES_IDEMPOTENCE]).toEqual([...IDEMPOTENCIES]);
  });

  it("`EFFECTS` couvre tous les scopes exigés — la totalité est close", () => {
    const couples = EFFECTS.map((effet) => ({ effet, scope: scopeExigeParEffet(effet) }));
    console.log(
      `[scopes] ${String(couples.length)} effet(s) mesuré(s) : ` +
        couples.map((c) => `${c.effet}→${c.scope}`).join(" "),
    );
    expect(couples.length).toBe(EFFECTS.length);
    expect(couples.length).toBeGreaterThanOrEqual(4);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  7 · LA SOUDURE 8-12-13, ET CE QU'ELLE COÛTE
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 11 — l'ordre des étapes 8 à 13", () => {
  it("un refus de POLITIQUE ne doit consommer aucune unité de quota", async () => {
    const ctx = contexteNeuf(POLITIQUE_BROUILLON);
    const avant = ctx.quota.totalConsomme;

    const { terminaison } = await executerAppel(ctx, { ...ENVOI, confirmation: "absente" });

    console.log(
      `[ordre] quota avant=${String(avant)} après=${String(ctx.quota.totalConsomme)} ` +
        `(terminaison : étape ${terminaison.genre === "refus" ? String(terminaison.etape) : "—"})`,
    );

    expect(terminaison.genre).toBe("refus");
    expect(ctx.quota.totalConsomme).toBe(avant);
  });

  it("la composition NAÏVE ne compile plus — la couture 9/10/11 est OBLIGATOIRE", async () => {
    // LE DÉFAUT QUE CETTE GARDE REFERME (corrigé au lot 1). `appliquerLimites`
    // soudait 8, 12 et 13 sans laisser de couture pour 9, 10 et 11. La seule
    // composition que sa signature rendait NATURELLE — l'appeler, puis
    // `deciderEtape10` — consommait donc le quota d'un appel que la politique
    // allait refuser : mot pour mot la boucle que le § 11 décrit pour
    // l'étape 8. Le module qui rendait l'ordre structurel rendait impossible
    // l'ordre complet.
    //
    // `entreSchemaEtQuota` est désormais OBLIGATOIRE : le compilateur exige de
    // chaque appelant qu'il dise ce qui se passe entre le schéma et le quota.

    // ── PREUVE 1, au COMPILATEUR : l'objet sans couture n'est plus un
    //    `ParametresLimites`. La garde tient au type, donc elle rougirait à la
    //    compilation, pas seulement à l'exécution.
    type SansCouture = Omit<ParametresLimites<Record<string, unknown>>, "entreSchemaEtQuota">;
    const naifEstIncomplet: SansCouture extends ParametresLimites<Record<string, unknown>>
      ? false
      : true = true;

    // ── PREUVE 2, à l'EXÉCUTION : la composition CORRECTE ne brûle rien sur un
    //    refus de politique.
    const ctx = contexteNeuf(POLITIQUE_BROUILLON);
    const avant = ctx.quota.totalConsomme;

    let coutureAppelee = 0;
    const limites = await appliquerLimites({
      tool: ENVOI.outil,
      effect: ENVOI.effet,
      modeIdempotence: ENVOI.modeIdempotence,
      principal: PRINCIPAL,
      idempotencyKey: ENVOI.idempotencyKey,
      input: ENVOI.input,
      validerEntree: ENVOI.valider,
      calcul: ctx.calcul,
      depotQuota: ctx.quota,
      depotIdempotence: ctx.idempotence,
      limiteOutil: null,
      warnAtOutil: null,
      ttlIdempotenceMs: TTL_IDEMPOTENCE_MS,
      maintenant: T0,
      entreSchemaEtQuota: (_valide, argHash): RefusIntercalaire | null => {
        coutureAppelee += 1;
        const decision = deciderEtape10({
          effet: ENVOI.effet,
          niveau: "brouillon",
          confirmation: "absente",
          cible: { tool: ENVOI.outil, argHash },
        });
        return decision.decision === "refuse" ? { etape: 10, code: decision.code } : null;
      },
    });

    console.log(
      `[ordre 9-11] couture appelée ${String(coutureAppelee)} fois · ` +
        `refus à l'étape ${limites.ok ? "—" : String(limites.etape)} · ` +
        `unités de quota consommées=${String(ctx.quota.totalConsomme - avant)} · ` +
        `la composition sans couture compile=${String(!naifEstIncomplet)}`,
    );

    // Plancher-témoin : une couture jamais appelée rendrait cette garde verte
    // sans avoir rien mesuré.
    expect(coutureAppelee).toBe(1);
    expect(naifEstIncomplet, "la couture doit être obligatoire au type").toBe(true);
    expect(limites.ok).toBe(false);
    if (!limites.ok) expect(limites.etape).toBe(10);
    // L'INVARIANT DU § 11 : un refus de politique ne consomme aucune unité.
    expect(ctx.quota.totalConsomme - avant).toBe(0);
  });

  it("`appliquerLimites` rejoue l'étape 8 — la validation est faite DEUX fois", async () => {
    const ctx = contexteNeuf(POLITIQUE_LIBRE);
    let appels = 0;
    const compte = (input: unknown): ResultatValidation<Record<string, unknown>> => {
      appels += 1;
      return validateurZod(SCHEMA_ENVOI)(input);
    };

    await executerAppel(ctx, { ...ENVOI, valider: compte });

    console.log(`[double validation] le schéma a été évalué ${String(appels)} fois pour 1 appel`);
    expect(appels).toBeGreaterThanOrEqual(1);
    // 🔴 CONSTAT — 2 : une fois pour obtenir l'`argHash` de l'étape 10, une
    //    seconde à l'intérieur d'`appliquerLimites`. Un schéma coûteux, ou un
    //    schéma à effet de bord, paie deux fois.
    expect(appels).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
//  8 · DEUX `argHash` POUR UN SEUL APPEL
// ═════════════════════════════════════════════════════════════════════════════

describe("§ 12 règle 2 et § 20 — l'`argHash` du journal et celui du jeton", () => {
  it("sont le MÊME nombre, sinon le jeton de confirmation n'est pas auditable", async () => {
    // LE DÉFAUT QUE CETTE GARDE REFERME (corrigé au lot 1). L'en-tête du
    // journal est figé AVANT la chaîne — un refus d'étape 5 doit pouvoir
    // s'écrire — donc son `argHash` portait sur la charge BRUTE. `core/limits`,
    // lui, calcule le sien sur la valeur VALIDÉE, « c'est elle que le jeton de
    // confirmation du § 20 doit lier ». Dès qu'un schéma porte un `.default()`
    // — la forme la plus banale d'un champ `limite` — `ops_audit.argHash`
    // désignait un appel et le jeton de confirmation en désignait un autre.
    //
    // La règle tenue : dès que l'étape 8 a réussi, l'en-tête est AFFINÉ, et
    // c'est l'empreinte de la valeur validée qui est inscrite.

    // Un schéma à valeur par défaut : la charge BRUTE et la charge VALIDÉE
    // diffèrent.
    const schema = z.object({ limite: z.number().int().default(25) }).strict();
    const valider = validateurZod(schema);
    const calcul = creerCalculArgHash(coffreArgHash);

    const brut: unknown = {};
    const validation = valider(brut);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    // TÉMOIN DE CONTRASTE — les deux empreintes SONT bien différentes. Sans lui,
    // cette garde serait verte sur un schéma qui ne transforme rien, c'est-à-dire
    // verte sans avoir rien éprouvé.
    const empreinteBrute = await calcul.calculer(ENVOI.outil, brut);
    const empreinteValidee = await calcul.calculer(ENVOI.outil, validation.valeur);
    expect(
      empreinteBrute,
      "témoin : sur un schéma à `.default()`, brut et validé DOIVENT différer",
    ).not.toBe(empreinteValidee);

    // LA VRAIE MESURE : on fait passer un appel par la chaîne complète, et on
    // compare ce que la LIGNE DE JOURNAL porte à ce à quoi le jeton se lie.
    const ctx = contexteNeuf(POLITIQUE_LIBRE);
    let argHashDuJeton: string | null = null;

    await executerAppel(ctx, {
      ...ENVOI,
      input: brut,
      valider,
      // On intercepte l'empreinte que l'étape 10 emploie pour lier le jeton.
      confirmation: "absente",
      effet: "read",
      espionArgHash: (h: string) => {
        argHashDuJeton = h;
      },
    });

    const ligne = ctx.store.toutes()[0];
    const argHashDuJournal = ligne?.argHash ?? null;

    console.log(
      `[argHash] 1 appel traversé — journal=${String(argHashDuJournal).slice(0, 12)}… ` +
        `jeton=${String(argHashDuJeton).slice(0, 12)}… ` +
        `identiques=${String(argHashDuJournal === argHashDuJeton)} · ` +
        `témoin brut≠validé=${String(empreinteBrute !== empreinteValidee)}`,
    );

    // Plancher-témoin : une garde qui comparerait deux `null` serait verte.
    expect(argHashDuJournal).not.toBeNull();
    expect(argHashDuJeton).not.toBeNull();
    // § 12 : `argHash` relie le journal à l'appel. § 20 : le jeton se lie « à
    // l'argHash de l'appel exact ». Un seul nombre, ou les deux tombent.
    expect(argHashDuJournal).toBe(argHashDuJeton);
    // Et c'est bien l'empreinte VALIDÉE qui a été inscrite, pas la brute.
    expect(argHashDuJournal).toBe(empreinteValidee);
  });
});

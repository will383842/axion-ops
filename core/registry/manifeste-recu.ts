/**
 * La lecture d'un manifeste REÇU — la frontière de confiance du registre.
 *
 * ═══ POSITION ═══
 *
 * Le manifeste vient du dépôt de l'adaptateur. Dans le cas du CRM, ce dépôt est
 * PUBLIC À JAMAIS et écrit dans un autre langage. Rien de ce qu'il contient
 * n'est cru sur parole ici : la forme est validée par un schéma FERMÉ, et ce
 * que le socle décide (`trustTier`, `maxDataClass`, raccordement) n'est pas lu
 * du tout — c'est `core/registry/lock.ts` qui le porte.
 *
 * Le schéma est fermé (`.strict()`) et non permissif, pour la raison exacte du
 * § 09 : un champ inattendu doit être un REFUS VISIBLE, jamais un silence.
 */

import { z } from "zod/v4";

import { ADAPTER_MODES, DATA_CLASSES, EFFECTS } from "../types.js";
import { canoniser, versValeurJson } from "../adapter-kit/json.js";
import type { ObjetJson } from "../adapter-kit/json.js";
import { IDEMPOTENCIES, PAGINATIONS } from "../adapter-kit/types.js";
import { VERSION_MANIFESTE } from "../adapter-kit/manifest.js";
import type { Manifeste } from "../adapter-kit/manifest.js";
import type { Verdict } from "../adapter-kit/verdict.js";

const MOTIF_VERSION = /^\d+\.\d+\.\d+$/;

/**
 * Un JSON Schema : un objet, franchissable par un fil JSON, et rien d'autre.
 *
 * La vérification ne se contente pas de `typeof === "object"` : elle exige que
 * la valeur SURVIVE à une canonicalisation. Un schéma porteur d'un cycle, d'un
 * `BigInt` ou d'une fonction passerait le test de type et ferait lever le socle
 * plus tard, au moment d'écrire `ops_tool.inputSchema` — c'est-à-dire loin
 * d'ici, sans rapport visible avec sa cause.
 */
function estObjetJsonSchema(valeur: unknown): boolean {
  if (valeur === null || typeof valeur !== "object" || Array.isArray(valeur)) return false;
  try {
    canoniser(versValeurJson(valeur, "schéma"));
    return true;
  } catch {
    return false;
  }
}

const SchemaJsonSchema = z.custom<ObjetJson>(estObjetJsonSchema, {
  message: "attendu un objet JSON Schema sérialisable",
});

const SchemaOutilRecu = z
  .object({
    name: z.string().min(1),
    version: z.string().regex(MOTIF_VERSION),
    description: z.string().min(1),
    // Pas de `.default()` ici, et c'est le contrôle 1 du § 09 : un `effect`
    // absent doit REFUSER le manifeste, jamais valoir « read ».
    effect: z.enum(EFFECTS),
    dataClass: z.enum(DATA_CLASSES),
    idempotency: z.enum(IDEMPOTENCIES),
    pagination: z.enum(PAGINATIONS),
    inputSchema: SchemaJsonSchema,
    outputSchema: SchemaJsonSchema,
    maxBytes: z.number().int().positive(),
    compaction: z
      .object({
        free: z.array(z.string()),
        tier2: z.array(z.string()),
        aggregateBy: z.string().min(1).nullable(),
      })
      .strict(),
    idFields: z.array(z.string()),
    bytes: z.number().int().nonnegative(),
  })
  .strict();

const SchemaManifesteRecu = z
  .object({
    manifestVersion: z.literal(VERSION_MANIFESTE),
    id: z.string().min(1),
    version: z.string().regex(MOTIF_VERSION),
    mode: z.enum(ADAPTER_MODES),
    // ADR 0004 — LE SCEAU DE L'ÉNUMÉRATION DE PROFILS.
    //
    // Ils sont obligatoires, et la FORME est vérifiée ici ; la CONFRONTATION au
    // sceau du socle appartient à `enregistrerAdaptateur()`. Un manifeste
    // produit avant le lot 1b ne les porte pas : il est refusé pour ce qu'il
    // est — un document construit contre une énumération dont on ne sait rien.
    profilesVersion: z.string().min(1),
    profilesSha: z.string().regex(/^[0-9a-f]{64}$/),
    // NON VIDE. `analyserDefinition()` refuse déjà `profiles: []` au BUILD —
    // « l'adaptateur ne serait exposé dans aucun profil ». Ce refus-là ne vaut
    // que pour un adaptateur écrit en TypeScript avec le kit ; le registre est
    // la SEULE barrière pour un manifeste produit ailleurs — le CRM en PHP. Sans
    // cette borne, un tel manifeste était ADMIS avec `profiles: []`, chaque
    // ligne `ops_tool` recevait une liste de profils vide, et ses outils
    // échappaient au décompte du § 14 en n'étant servis nulle part.
    profiles: z
      .array(z.string().min(1))
      .min(
        1,
        "profiles : vide — l'adaptateur ne serait exposé dans aucun profil, et ses outils échapperaient au décompte du § 14.",
      ),
    // Des NOMS de secrets. Le type ne peut pas porter de valeur, et le schéma
    // non plus : une chaîne de nom, jamais un objet à champ libre.
    secrets: z.array(z.string().min(1)),
    // NON VIDE, pour le même motif : le kit refuse `tools: []` au build, et sans
    // cette borne le registre admettait un adaptateur SANS AUCUN OUTIL, en
    // annonçant `outilsInspectes: 0`. Une admission prononcée après avoir
    // inspecté zéro outil est verte pour la pire des raisons.
    tools: z
      .array(SchemaOutilRecu)
      .min(
        1,
        "tools : vide — un adaptateur sans outil n'expose rien, et l'admission serait prononcée après avoir inspecté ZÉRO outil.",
      ),
  })
  .strict();

/** Le résultat d'une lecture : le manifeste typé, ou les anomalies de forme. */
export interface LectureManifeste {
  readonly manifeste: Manifeste | null;
  readonly verdict: Verdict;
}

/**
 * Valide un manifeste reçu.
 *
 * ⚠️ NE CALCULE AUCUNE EMPREINTE. L'empreinte se prend sur le document BRUT,
 *    avant validation — voir `empreinteDuManifesteRecu()`. Si elle était prise
 *    ici, sur la forme validée, un champ en trop aurait déjà été retiré et
 *    l'empreinte coïnciderait avec celle épinglée.
 */
export function lireManifesteRecu(brut: unknown): LectureManifeste {
  const analyse = SchemaManifesteRecu.safeParse(brut);
  if (!analyse.success) {
    const anomalies = analyse.error.issues.map((probleme) => {
      const chemin = probleme.path.length > 0 ? probleme.path.join(".") : "(racine)";
      return `manifeste, ${chemin} : ${probleme.message}`;
    });
    return { manifeste: null, verdict: { mesures: 0, plancher: 1, anomalies } };
  }

  return {
    manifeste: analyse.data,
    verdict: { mesures: analyse.data.tools.length, plancher: 1, anomalies: [] },
  };
}

/**
 * Les clés de premier niveau d'un document reçu, sans le valider.
 *
 * Sert au contrôle « confiance auto-décernée » : il faut voir les clés AVANT
 * que le schéma fermé ne les rejette en bloc, pour pouvoir dire précisément
 * « ce manifeste tente de fixer son propre `trustTier` ».
 */
export function clesDePremierNiveau(brut: unknown): readonly string[] {
  if (brut === null || typeof brut !== "object" || Array.isArray(brut)) return [];
  return Object.keys(brut);
}

/**
 * `core/federe/validation.ts` — ÉTAPE 8 : L'ENTRÉE CONTRE LE SCHÉMA DU MANIFESTE.
 *
 * Le port `validerEntree` de l'orchestrateur reçoit un outil du catalogue et
 * une entrée brute. Pour un adaptateur HÉBERGÉ, la clôture capture un schéma
 * Zod vivant. Pour un adaptateur FÉDÉRÉ, le socle ne possède que ce que le
 * manifeste épinglé déclare : un **JSON Schema** (draft 2020-12), produit par
 * l'adaptateur et figé par `manifestSha`. Il faut donc un validateur de JSON
 * Schema — ce fichier.
 *
 * ═══ POURQUOI UNE BIBLIOTHÈQUE, ET PAS UN VALIDATEUR MAISON ═══
 *
 * Ce port est une GARDE DE SÉCURITÉ, pas une commodité : il existe pour qu'un
 * champ d'habilitation glissé dans la charge utile soit refusé (§ 09, contrôle
 * 7). Un validateur maison qui laisserait passer un cas sur vingt — un objet
 * imbriqué non fermé, un `enum` mal lu, un `format` ignoré — serait une garde
 * qui rassure sans garder, ce que ce dépôt nomme comme son pire défaut. Décision
 * de Will, 2026-09-02 : **ajv, version épinglée, mode strict**. Mesure préalable
 * hors dépôt : les sept schémas d'Axion-IA compilent tels quels, les clés
 * inconnues et les champs d'autorisation sont refusés 7/7.
 *
 * ═══ CE QUE CE FICHIER REND, ET POURQUOI CETTE FORME ═══
 *
 * `ResultatValidation` du § 15 : « dit le champ fautif, et la valeur attendue ».
 * Pas la liste brute d'ajv — elle nomme des mots-clés de schéma
 * (`additionalProperties`, `enum`), pas ce qu'un appelant doit corriger. On
 * traduit donc la PREMIÈRE erreur en `{ champ, attendu }` lisibles, et le
 * compte total reste annoncé pour qu'un « 1 » ne cache pas « 12 ».
 *
 * ⚠️ LES VALIDATEURS SONT MÉMORISÉS PAR EMPREINTE DU SCHÉMA, jamais par nom
 *    d'outil. Deux outils de même nom sur deux versions d'adaptateur ont deux
 *    schémas ; un cache par nom servirait l'ancien au nouveau. Et une empreinte
 *    canonique, pas `JSON.stringify` : deux écritures du même schéma dans un
 *    autre ordre de clés sont le même schéma.
 */

import { Ajv2020, type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import * as ajvFormats from "ajv-formats";

import { canoniser, empreinteSha256, versValeurJson } from "../adapter-kit/json.js";
import type { OutilDuCatalogue } from "../chaine/etapes.js";
import type { ResultatValidation } from "../limits/index.js";

/** Ce que la validation a mesuré — des NOMBRES, jamais un seul booléen. */
export interface VerdictValidation {
  readonly resultat: ResultatValidation<unknown>;
  /** Combien d'erreurs le validateur a relevées (0 si l'entrée passe). */
  readonly erreursRelevees: number;
}

/**
 * Le schéma ne peut pas être compilé : c'est un défaut du MANIFESTE (donc de
 * l'admission), pas de l'entrée. On ne le déguise pas en `invalid_input` — le
 * modèle recevrait « ton champ est mauvais » là où la vérité est « le socle a
 * épinglé un schéma qu'il ne sait pas lire ».
 */
export class ErreurSchemaIllisible extends Error {
  public readonly nomComplet: string;
  public constructor(nomComplet: string, detail: string) {
    super(
      `Schéma d'entrée de « ${nomComplet} » incompilable : ${detail}. ` +
        "Le manifeste a été admis avec ce schéma ; c'est l'admission qu'il faut resserrer, " +
        "pas l'entrée qu'il faut refuser.",
    );
    this.name = "ErreurSchemaIllisible";
    this.nomComplet = nomComplet;
  }
}

/**
 * `ajv-formats` est publié en CommonJS : sous ESM strict, l'import par défaut
 * rend un espace de noms dont `.default` est la fonction. Résolu ici, une fois.
 */
const addFormats = (ajvFormats as unknown as { default: (ajv: Ajv2020) => Ajv2020 }).default;

/** Un paramètre d'erreur ajv rendu lisible, sans jamais afficher « [object Object] ». */
function param(params: Record<string, unknown>, cle: string): string {
  const v = params[cle];
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  return "?";
}

function creerAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    // ⚠️ `strict: true` refuse les schémas ambigus (mot-clé inconnu, `additionalProperties`
    //    sans `properties`, …) À LA COMPILATION : un schéma flou est refusé avant de servir.
    strict: true,
    // Toutes les erreurs, pour que `erreursRelevees` dise combien, pas seulement laquelle.
    allErrors: true,
    // Aucune coercition : « 5 » n'est pas 5. Un adaptateur qui attend un entier en
    // recevra un, ou rien.
    coerceTypes: false,
    useDefaults: false,
  });
  addFormats(ajv);
  return ajv;
}

/** Traduit la première erreur d'ajv en ce que le § 15 demande de dire. */
function traduire(erreur: ErrorObject): { champ: string; attendu: string } {
  const chemin = erreur.instancePath.replace(/^\//, "").replace(/\//g, ".");
  switch (erreur.keyword) {
    case "additionalProperties": {
      const inconnu = param(erreur.params, "additionalProperty");
      return {
        champ: chemin.length > 0 ? `${chemin}.${inconnu}` : inconnu,
        attendu: "aucun champ hors du schéma — cette clé n'est pas déclarée par l'outil",
      };
    }
    case "required": {
      const manquant = param(erreur.params, "missingProperty");
      return {
        champ: chemin.length > 0 ? `${chemin}.${manquant}` : manquant,
        attendu: "présent (obligatoire)",
      };
    }
    case "enum": {
      const valeurs = (erreur.params as { allowedValues?: unknown[] }).allowedValues ?? [];
      return {
        champ: chemin || "(racine)",
        attendu: `l'une de : ${valeurs.map(String).join(", ")}`,
      };
    }
    case "type":
      return {
        champ: chemin || "(racine)",
        attendu: param(erreur.params, "type"),
      };
    case "format":
      return {
        champ: chemin || "(racine)",
        attendu: `format ${param(erreur.params, "format")}`,
      };
    case "minimum":
    case "maximum":
    case "minLength":
    case "maxLength":
    case "pattern":
      return { champ: chemin || "(racine)", attendu: erreur.message ?? erreur.keyword };
    default:
      return { champ: chemin || "(racine)", attendu: erreur.message ?? erreur.keyword };
  }
}

export interface ValidateurFedere {
  readonly valider: (outil: OutilDuCatalogue, entree: unknown) => VerdictValidation;
  /** Combien de schémas distincts ont été compilés depuis la création. */
  readonly schemasCompiles: () => number;
}

/**
 * Crée un validateur qui mémorise ses compilations par EMPREINTE de schéma.
 * Une instance par noyau : le cache ne traverse ni les redémarrages ni les
 * transports, ce qui suffit — compiler un schéma coûte quelques millisecondes.
 */
export function creerValidateurFedere(): ValidateurFedere {
  const ajv = creerAjv();
  const compiles = new Map<string, ValidateFunction>();

  function compiler(outil: OutilDuCatalogue): ValidateFunction {
    const nomComplet = `${outil.adapterId}.${outil.name}`;
    let schema;
    try {
      schema = versValeurJson(outil.inputSchema, `schéma d'entrée de ${nomComplet}`);
    } catch (erreur) {
      throw new ErreurSchemaIllisible(nomComplet, (erreur as Error).message);
    }
    const empreinte = empreinteSha256(canoniser(schema));
    const connu = compiles.get(empreinte);
    if (connu !== undefined) return connu;
    try {
      const fn = ajv.compile(schema as object);
      compiles.set(empreinte, fn);
      return fn;
    } catch (erreur) {
      throw new ErreurSchemaIllisible(nomComplet, (erreur as Error).message);
    }
  }

  return {
    valider(outil, entree) {
      const fn = compiler(outil);
      if (fn(entree)) {
        return { resultat: { ok: true, valeur: entree }, erreursRelevees: 0 };
      }
      const erreurs = fn.errors ?? [];
      const premiere = erreurs[0];
      const { champ, attendu } =
        premiere === undefined
          ? { champ: "(racine)", attendu: "une entrée conforme au schéma publié" }
          : traduire(premiere);
      return { resultat: { ok: false, champ, attendu }, erreursRelevees: erreurs.length };
    },
    schemasCompiles: () => compiles.size,
  };
}

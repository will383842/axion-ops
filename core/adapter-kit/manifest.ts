/**
 * Le MANIFESTE — la sortie de build de `defineAdapter()` (§ 09).
 *
 * ═══ CE QUE LE SOCLE CONSOMME, ET CE QU'IL NE CONSOMME JAMAIS ═══
 *
 * Le socle **ne consomme jamais une fonction `handler` distante**. Il consomme
 * ce manifeste, épinglé par empreinte SHA dans un `adapters.lock.json`
 * versionné dans le socle, et appelle l'endpoint en JSON-RPC.
 *
 * Le manifeste ne porte donc AUCUNE valeur JavaScript : les schémas Zod y sont
 * convertis en JSON Schema draft 2020-12 par `z.toJSONSchema()` de `zod/v4`,
 * et le `handler` n'y figure pas du tout.
 *
 * ═══ CE QUE LE MANIFESTE N'A PAS LE DROIT DE PORTER ═══
 *
 * `trustTier` et `maxDataClass` sont fixés **côté socle** à l'enregistrement,
 * JAMAIS lus dans le manifeste — sinon un dépôt public se décerne son propre
 * niveau de confiance. Ce module ne les produit pas, et `core/registry/`
 * refuse un manifeste qui les porterait, sur une liste DÉRIVÉE de la forme du
 * verrou (`clesReserveesAuSocle()`), jamais écrite à la main.
 *
 * ═══ DÉPENDANCE VÉRIFIÉE ═══
 *
 * `zod` 3.25.76 (épinglé EXACTEMENT par la Fondation) expose le sous-chemin
 * `zod/v4`, où `toJSONSchema()` produit du draft 2020-12 et rend
 * `additionalProperties: false` sur un `.strict()`. Vérifié sur la version
 * installée. **Aucune dépendance nouvelle n'est nécessaire** — pas de
 * `core/adapter-kit/DEPS.md`.
 */

import { toJSONSchema } from "zod/v4";

import { ADAPTER_MODES, DATA_CLASSES, EFFECTS } from "../types.js";
import type { AdapterMode, DataClass, Effect } from "../types.js";
import { canoniser, empreinteCanonique, octetsCanoniques, versValeurJson } from "./json.js";
import { analyserFermeture } from "./fermeture.js";
import { analyserChampsDeclares, motifGovernanceFieldIntrouvable } from "./champs-declares.js";
import { verifierFormeDuSceau } from "./profils.js";
import type { SceauProfils } from "./profils.js";
import type { ObjetJson, ValeurJson } from "./json.js";
import { IDEMPOTENCIES, PAGINATIONS } from "./types.js";
import type {
  AnnotationsCompaction,
  DefinitionAdaptateur,
  DefinitionOutil,
  Idempotency,
  Pagination,
} from "./types.js";
import type { Verdict } from "./verdict.js";

// ═════════════════════════════════════════════════════════════════════════════
//  La forme du manifeste
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Version du FORMAT du manifeste — distincte de celle de l'adaptateur.
 *
 * ⚠️ **ELLE RESTE À 1 ALORS QUE LA FORME A CHANGÉ DEUX FOIS**, et c'est
 *    délibéré : `profilesVersion`/`profilesSha` au lot 1b (ADR 0004),
 *    `governanceFields` au lot 1c (ADR 0016). La raison est que le schéma de
 *    `core/registry/manifeste-recu.ts` est **FERMÉ** : un document d'avant est
 *    refusé pour ce qu'il est — un manifeste à qui il manque un champ
 *    obligatoire — avec le nom du champ manquant. L'incrémenter rendrait un
 *    message plus court et MOINS actionnable (« version 1 attendue, 2 reçue »),
 *    et ferait vivre deux formats là où il n'y a jamais eu qu'un producteur.
 *
 * ⚠️ **TOUTE EMPREINTE ÉPINGLÉE BOUGE À CHACUN DE CES AJOUTS.** Les deux ont été
 *    faits AVANT tout épinglage réel : `adapters.lock.json` n'existe encore qu'en
 *    exemple, et ses `manifestSha` y sont des marque-places. Après le premier
 *    épinglage véritable, un champ de plus exigerait de revalider à la main
 *    chaque `manifestSha` de chaque dépôt tiers — c'est le motif qui a fait
 *    poser `profilesSha` au lot 1b, et c'est le même ici.
 */
export const VERSION_MANIFESTE = 1;

/** Un outil, vu du fil JSON-RPC. */
export interface ManifesteOutil {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly effect: Effect;
  readonly dataClass: DataClass;
  readonly idempotency: Idempotency;
  readonly pagination: Pagination;
  /** JSON Schema draft 2020-12, côté ENTRÉE (`io: "input"`), FERMÉ. */
  readonly inputSchema: ValeurJson;
  /** JSON Schema draft 2020-12 de la forme NON COMPACTÉE (§ 13.3). */
  readonly outputSchema: ValeurJson;
  readonly maxBytes: number;
  readonly compaction: {
    readonly free: readonly string[];
    readonly tier2: readonly string[];
    readonly aggregateBy: string | null;
  };
  readonly idFields: readonly string[];
  /**
   * § 09 étendu par l'**ADR 0016** — les champs d'entrée que l'outil DÉCLARE de
   * gouvernance. Obligatoire ; valeur neutre nommée
   * `AUCUN_CHAMP_DE_GOUVERNANCE`.
   *
   * ⚠️ IL ENTRE DANS `bytes`, DONC DANS `manifestSha`, DONC DANS
   *    `adapters.lock.json` — voir la note de `Manifeste.profilesSha`, dont le
   *    motif vaut mot pour mot : le champ est posé MAINTENANT, avant tout
   *    épinglage réel. Après le premier, l'ajouter aurait exigé de revalider à
   *    la main chaque `manifestSha` de chaque dépôt tiers.
   */
  readonly governanceFields: readonly string[];
  /**
   * Taille en octets UTF-8 du JSON canonique de CETTE entrée, `bytes` exclu.
   *
   * `bytes` est exclu de son propre calcul, sans quoi la mesure serait
   * auto-référentielle : écrire la taille change la taille. C'est le champ
   * `ops_tool.bytes` du § 12, et l'unité du budget du § 14 — des OCTETS, pas
   * des tokens : aucun tokenizer n'est installé et `countTokens` du SDK
   * Anthropic est un appel HTTP.
   */
  readonly bytes: number;
}

/** Le manifeste complet. C'est CE document que le SHA du verrou épingle. */
export interface Manifeste {
  readonly manifestVersion: number;
  readonly id: string;
  readonly version: string;
  readonly mode: AdapterMode;
  /**
   * LA VERSION DE L'ÉNUMÉRATION DE PROFILS contre laquelle ce manifeste a été
   * produit (ADR 0004). Elle dit ce que l'auteur CROYAIT viser.
   */
  readonly profilesVersion: string;
  /**
   * L'EMPREINTE de cette énumération. Elle dit ce qu'il visait VRAIMENT.
   *
   * ⚠️ POURQUOI LES DEUX. Un adaptateur fédéré produit son manifeste DANS UN
   *    AUTRE DÉPÔT, contre sa propre copie de `core/profiles`. Si les deux
   *    divergent, le manifeste reste syntaxiquement valide et les noms de
   *    profils restent connus : la divergence ne se voit NULLE PART. Une
   *    version inchangée avec une empreinte changée est précisément le cas
   *    qu'on veut voir — quelqu'un a modifié l'énumération sans en changer la
   *    version.
   *
   * ⚠️ CE CHAMP CHANGE TOUTES LES EMPREINTES DE MANIFESTE. Il a été ajouté au
   *    lot 1b, AVANT tout épinglage réel (`adapters.lock.json` n'existe encore
   *    qu'en exemple). Après le premier épinglage, l'ajouter aurait exigé de
   *    revalider à la main chaque `manifestSha` de chaque dépôt tiers.
   */
  readonly profilesSha: string;
  readonly profiles: readonly string[];
  /** NOMS de secrets seulement. Jamais une valeur — voir `ReferenceSecret`. */
  readonly secrets: readonly string[];
  readonly tools: readonly ManifesteOutil[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  Préfixes — § 09, harnais, contrôle 5
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Le préfixe d'outil, DÉRIVÉ de l'id de l'adaptateur. Jamais saisi.
 *
 * Fonction d'une ligne, exportée exprès : c'est la SEULE source du préfixe. Le
 * jour où le préfixe cesserait d'être l'id nu (un espace de noms, une version
 * majeure), le changement se fait ici et le contrôle 5 continue de mordre —
 * parce qu'il compare à `prefixeDe()` et non à une chaîne recopiée.
 */
export function prefixeDe(idAdaptateur: string): string {
  return idAdaptateur;
}

/** Le nom complet servi par `tools/list` : préfixe dérivé + nom local. */
export function nomComplet(idAdaptateur: string, nomLocal: string): string {
  return `${prefixeDe(idAdaptateur)}.${nomLocal}`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Analyse d'une définition
// ═════════════════════════════════════════════════════════════════════════════

const MOTIF_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MOTIF_VERSION = /^\d+\.\d+\.\d+$/;
const MOTIF_NOM_OUTIL = /^[a-z0-9]+(?:[._][a-z0-9]+)*$/;

/** Le résultat d'une analyse : le manifeste s'il est constructible, et le verdict. */
export interface AnalyseDefinition {
  /** `null` dès qu'une anomalie interdit de construire un manifeste sûr. */
  readonly manifeste: Manifeste | null;
  readonly verdict: Verdict;
}

function doublons(valeurs: readonly string[]): readonly string[] {
  const vus = new Set<string>();
  const doubles = new Set<string>();
  for (const valeur of valeurs) {
    if (vus.has(valeur)) doubles.add(valeur);
    vus.add(valeur);
  }
  return [...doubles];
}

function schemaJson(
  schema: DefinitionOutil<string>["input"],
  sens: "input" | "output",
  ou: string,
  anomalies: string[],
): ValeurJson | null {
  try {
    return versValeurJson(toJSONSchema(schema, { io: sens }), ou);
  } catch (erreur) {
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    anomalies.push(
      `${ou} : la conversion en JSON Schema échoue (${message}). ` +
        "Un schéma que `z.toJSONSchema()` ne sait pas rendre ne franchit pas le fil " +
        "JSON-RPC : le socle ne pourrait ni publier l'outil ni valider son entrée.",
    );
    return null;
  }
}

/**
 * La valeur vue comme objet JSON, ou `null` si ce n'en est pas un.
 *
 * `Array.isArray` ne suffit pas à écarter la branche tableau de `ValeurJson`
 * pour TypeScript : ce point de passage unique évite d'éparpiller la même
 * conversion dans trois fonctions.
 */
function commeObjet(valeur: ValeurJson): ObjetJson | null {
  if (valeur === null || typeof valeur !== "object" || Array.isArray(valeur)) return null;
  // `Array.isArray` ne resserre pas un `readonly T[]` dans une union : la
  // conversion est ici, une seule fois, après le contrôle qui la justifie.
  return valeur as ObjetJson;
}

/** Les noms de propriétés d'un JSON Schema d'objet, ou `[]`. */
export function proprietesDuSchema(schema: ValeurJson): readonly string[] {
  const proprietes = commeObjet(schema)?.["properties"];
  if (proprietes === undefined) return [];
  const objet = commeObjet(proprietes);
  return objet === null ? [] : Object.keys(objet);
}

/** Les noms de propriétés OBLIGATOIRES d'un JSON Schema d'objet, ou `[]`. */
export function requisDuSchema(schema: ValeurJson): readonly string[] {
  const requis = commeObjet(schema)?.["required"];
  if (!Array.isArray(requis)) return [];
  return requis.filter((valeur): valeur is string => typeof valeur === "string");
}

function analyserCompaction(
  compaction: AnnotationsCompaction,
  ou: string,
  anomalies: string[],
): void {
  const enDouble = [...doublons(compaction.free), ...doublons(compaction.tier2)];
  if (enDouble.length > 0) {
    anomalies.push(`${ou} : champ de compaction en double — ${enDouble.join(", ")}.`);
  }
  const partages = compaction.free.filter((champ) => compaction.tier2.includes(champ));
  if (partages.length > 0) {
    // La cascade du § 13.3 raccourcit `free` AVANT de retirer `tier2`. Un champ
    // présent dans les deux serait raccourci puis retiré : le premier palier
    // aurait travaillé pour rien, et le rapport de compaction mentirait sur ce
    // qui a été gagné à chaque étage.
    anomalies.push(
      `${ou} : ${partages.join(", ")} figure(nt) à la fois dans \`free\` et \`tier2\` — ` +
        "la cascade du § 13.3 raccourcirait puis retirerait le même champ.",
    );
  }
}

/**
 * Analyse une définition d'adaptateur : structure, énumérations, préfixes,
 * schémas. Ne lève JAMAIS — le harnais a besoin de la LISTE des anomalies, pas
 * de la première.
 *
 * @param profilsConnus l'énumération fermée de `core/profiles/`, transmise par
 *        `creerAdapterKit()`. Ce module ne la contient pas : la recopier ferait
 *        une seconde source de vérité.
 */
export function analyserDefinition<TProfile extends string>(
  definition: DefinitionAdaptateur<TProfile>,
  profilsConnus: readonly TProfile[],
  sceauProfils: SceauProfils,
): AnalyseDefinition {
  const anomalies: string[] = [];

  // Le sceau est vérifié DANS SA FORME ici, et confronté au socle par le
  // REGISTRE. Un sceau malformé produirait un manifeste qu'aucun registre ne
  // pourrait admettre, et l'auteur ne l'apprendrait qu'au déploiement.
  anomalies.push(...verifierFormeDuSceau(sceauProfils));

  if (!MOTIF_ID.test(definition.id)) {
    anomalies.push(
      `id « ${definition.id} » : attendu des minuscules et des chiffres séparés par ` +
        "des tirets. C'est de lui que TOUS les préfixes d'outils dérivent.",
    );
  }
  if (!MOTIF_VERSION.test(definition.version)) {
    anomalies.push(`version « ${definition.version} » : attendu \`MAJEUR.MINEUR.CORRECTIF\`.`);
  }
  if (!(ADAPTER_MODES as readonly string[]).includes(definition.mode)) {
    anomalies.push(
      `mode « ${String(definition.mode)} » inconnu — attendu ${ADAPTER_MODES.join(" ou ")}.`,
    );
  }

  if (definition.profiles.length === 0) {
    // Un adaptateur sans profil n'est exposé nulle part : il ne peut jamais
    // être appelé, et sa surface d'outils échappe pourtant au décompte du § 14.
    anomalies.push("profiles : vide — l'adaptateur ne serait exposé dans aucun profil.");
  }
  const profilsInconnus = definition.profiles.filter(
    (profil) => !(profilsConnus as readonly string[]).includes(profil),
  );
  if (profilsInconnus.length > 0) {
    anomalies.push(
      `profiles : ${profilsInconnus.join(", ")} hors de l'énumération fermée ` +
        `(${profilsConnus.join(", ")}).`,
    );
  }
  const profilsEnDouble = doublons(definition.profiles);
  if (profilsEnDouble.length > 0) {
    anomalies.push(`profiles : ${profilsEnDouble.join(", ")} en double.`);
  }

  // ═══ L'ASSERTION DU § 09 ═══
  if (definition.mode === "fédéré" && definition.secrets.length > 0) {
    anomalies.push(
      `mode « fédéré » avec ${String(definition.secrets.length)} secret(s) déclaré(s) — ` +
        "REFUSÉ. Le socle n'émet jamais un secret déchiffré hors de son processus : " +
        "un adaptateur fédéré détient ses identifiants par les moyens de son produit " +
        "et déclare `secrets: []`.",
    );
  }
  const secretsSansNom = definition.secrets.filter((secret) => secret.name.trim() === "");
  if (secretsSansNom.length > 0) {
    anomalies.push("secrets : une référence sans nom ne désigne aucune ligne d'`ops_secret`.");
  }

  if (definition.tools.length === 0) {
    anomalies.push("tools : vide — un adaptateur sans outil n'expose rien.");
  }

  const outils: ManifesteOutil[] = [];
  const nomsComplets: string[] = [];

  for (const outil of definition.tools) {
    const ou = `outil « ${outil.name} »`;
    // Repère du nombre d'anomalies AVANT cet outil. Un outil déjà fautif ne
    // sera pas mesuré plus bas : `octetsCanoniques` lèverait sur un champ
    // `undefined`, et l'exception masquerait l'anomalie qu'on vient d'écrire.
    const anomaliesAvantCetOutil = anomalies.length;

    if (!MOTIF_NOM_OUTIL.test(outil.name)) {
      anomalies.push(
        `${ou} : nom hors forme — minuscules, chiffres, points et tirets bas seulement.`,
      );
    }
    // ═══ CONTRÔLE 5 — le préfixe est DÉRIVÉ, jamais saisi ═══
    if (outil.name.startsWith(`${prefixeDe(definition.id)}.`)) {
      anomalies.push(
        `${ou} : le préfixe « ${prefixeDe(definition.id)}. » est ÉCRIT À LA MAIN. Il est ` +
          "dérivé de l'id de l'adaptateur — deux sources de vérité pour un même préfixe " +
          "se désynchronisent au premier renommage.",
      );
    }
    nomsComplets.push(nomComplet(definition.id, outil.name));

    if (!MOTIF_VERSION.test(outil.version)) {
      anomalies.push(`${ou} : version « ${outil.version} » hors forme \`X.Y.Z\`.`);
    }
    if (outil.description.trim() === "") {
      // § 09 : la description est obligatoire, journalisée et COMPTÉE AU BUDGET.
      // Une description vide rend le choix d'outil du modèle aveugle, et c'est
      // exactement ce que le mur d'échelle du § 14 décrit.
      anomalies.push(`${ou} : description vide — obligatoire, journalisée, comptée au budget.`);
    }

    // ═══ CONTRÔLE 1 — ni `effect` ni `dataClass` par défaut permissif ═══
    //
    // La vérification est faite ICI, sur la valeur reçue, et non par un défaut
    // du type : le manifeste peut être construit depuis du JavaScript non typé
    // (un dépôt PHP qui produit sa définition, un test). Un `effect` absent doit
    // REFUSER, jamais valoir « read ».
    if (!(EFFECTS as readonly string[]).includes(outil.effect)) {
      anomalies.push(
        `${ou} : effect « ${String(outil.effect)} » absent ou inconnu — attendu ` +
          `${EFFECTS.join(" | ")}. AUCUNE valeur par défaut n'est appliquée : un effect ` +
          "manquant qui vaudrait « read » ferait passer un envoi pour une lecture.",
      );
    }
    if (!(DATA_CLASSES as readonly string[]).includes(outil.dataClass)) {
      anomalies.push(
        `${ou} : dataClass « ${String(outil.dataClass)} » absent ou inconnu — attendu ` +
          `${DATA_CLASSES.join(" | ")}. AUCUNE valeur par défaut : un dataClass manquant ` +
          "qui vaudrait « none » dispenserait du marquage de session du § 20.",
      );
    }
    if (!(IDEMPOTENCIES as readonly string[]).includes(outil.idempotency)) {
      anomalies.push(`${ou} : idempotency inconnu — attendu ${IDEMPOTENCIES.join(" | ")}.`);
    }
    if (!(PAGINATIONS as readonly string[]).includes(outil.pagination)) {
      anomalies.push(`${ou} : pagination inconnu — attendu ${PAGINATIONS.join(" | ")}.`);
    }

    if (!Number.isInteger(outil.maxBytes) || outil.maxBytes <= 0) {
      anomalies.push(
        `${ou} : maxBytes « ${String(outil.maxBytes)} » — attendu un entier strictement positif.`,
      );
    }
    if (outil.fixtureMax.trim() === "") {
      anomalies.push(
        `${ou} : fixtureMax vide — le contrôle 4 du harnais n'aurait rien à exécuter, ` +
          "et compterait zéro fixture en restant vert.",
      );
    }

    analyserCompaction(outil.compaction, ou, anomalies);

    const entree = schemaJson(outil.input, "input", `${ou}, schéma d'entrée`, anomalies);
    const sortie = schemaJson(outil.output, "output", `${ou}, schéma de sortie`, anomalies);

    if (entree !== null) {
      // § 09 : le schéma d'entrée est `.strict()`, pour qu'un champ
      // d'autorisation glissé dans la charge utile soit un REFUS VISIBLE et non
      // un silence. Un schéma ouvert accepterait `peutVoirAppels: true` sans
      // broncher, et le contrôle 7 du harnais n'aurait plus rien à mordre.
      //
      // ⚠️ LA MÊME FONCTION QUE LE REGISTRE. `core/registry` applique cette
      //    analyse-ci à un manifeste venu d'AILLEURS (ADR 0003) ; l'écrire deux
      //    fois ferait deux définitions de « fermé », et le build accepterait
      //    ce que l'admission refuse — ou l'inverse, ce qui est pire.
      const fermeture = analyserFermeture(entree);
      if (!fermeture.ferme) {
        anomalies.push(
          `${ou} : schéma d'entrée OUVERT — ${
            fermeture.ouverts.length > 0
              ? `${String(fermeture.ouverts.length)} schéma(s) d'objet sans fermeture (${fermeture.ouverts.join(", ")})`
              : fermeture.profondeurDepassee
                ? "profondeur maximale dépassée : le socle ne peut pas conclure"
                : "aucun schéma d'objet à fermer n'a été trouvé"
          }. Un champ d'autorisation glissé dans la charge utile y passerait en ` +
            `silence. Fermez le schéma avec \`.strict()\` (\`additionalProperties: false\`) ` +
            "ou `unevaluatedProperties: false`.",
        );
      }

      // ═══ LES DEUX DÉCLARATIONS DU § 09, CONFRONTÉES AU SCHÉMA ═══
      //
      // ⚠️ LA MÊME FONCTION QUE LE REGISTRE — `analyserChampsDeclares()`. Le
      //    harnais tourne dans la CI de l'ADAPTATEUR, le registre dans celle du
      //    SOCLE ; deux implémentations feraient que le build accepte ce que
      //    l'admission refuse (ADR 0003, appliqué à deux champs de plus).
      //
      // Ce que le BUILD en tire, et ce qu'il n'en tire pas :
      //  · `governanceFields` introuvable → ANOMALIE (ADR 0016, garde G3). Un
      //    nom qui ne désigne aucune propriété est un no-op MUET, et son auteur
      //    le croit appliqué : c'est la seule branche de l'étape 11 qu'aucune
      //    confirmation ne rattrape qui reste alors découverte.
      //  · `idFields` sans effet → RIEN ICI (ADR 0015, garde G2). L'annonce est
      //    faite par l'admission, qui la rend à l'exploitant ; le build ne
      //    refuse pas un `messageId: z.string()`, qui n'a rien d'illégitime.
      const declares = analyserChampsDeclares(entree, {
        idFields: outil.idFields,
        governanceFields: outil.governanceFields,
      });

      if (declares.idFieldsEnDouble.length > 0) {
        anomalies.push(`${ou} : idFields en double — ${declares.idFieldsEnDouble.join(", ")}.`);
      }
      if (declares.governanceFieldsEnDouble.length > 0) {
        anomalies.push(
          `${ou} : governanceFields en double — ${declares.governanceFieldsEnDouble.join(", ")}.`,
        );
      }
      for (const nom of declares.governanceFieldsIntrouvables) {
        anomalies.push(
          `${ou} : ` +
            motifGovernanceFieldIntrouvable(nom, declares.nomsDistincts, declares.nomsDuSchema),
        );
      }
    }

    if (entree === null || sortie === null) continue;
    if (anomalies.length > anomaliesAvantCetOutil) continue;

    // ═══ CONTRÔLE SUPPLÉMENTAIRE C13.3 ═══
    // « Tout champ de rang 2 est OPTIONNEL au schéma `output` — sinon une charge
    //   compactée ne valide plus le schéma que l'outil publie. »
    const requis = requisDuSchema(sortie);
    const tier2Obligatoires = outil.compaction.tier2.filter((champ) => requis.includes(champ));
    if (tier2Obligatoires.length > 0) {
      anomalies.push(
        `${ou} : ${tier2Obligatoires.join(", ")} est de rang 2 mais OBLIGATOIRE au schéma de ` +
          "sortie. Au deuxième palier de la cascade du § 13.3, le socle retire ce champ — et " +
          "la charge compactée ne valide plus le schéma que l'outil publie.",
      );
    }

    const sansBytes = {
      name: outil.name,
      version: outil.version,
      description: outil.description,
      effect: outil.effect,
      dataClass: outil.dataClass,
      idempotency: outil.idempotency,
      pagination: outil.pagination,
      inputSchema: entree,
      outputSchema: sortie,
      maxBytes: outil.maxBytes,
      compaction: {
        free: [...outil.compaction.free],
        tier2: [...outil.compaction.tier2],
        aggregateBy: outil.compaction.aggregateBy,
      },
      idFields: [...outil.idFields],
      governanceFields: [...outil.governanceFields],
    } as const;

    outils.push({ ...sansBytes, bytes: octetsCanoniques(sansBytes) });
  }

  const nomsEnDouble = doublons(nomsComplets);
  if (nomsEnDouble.length > 0) {
    anomalies.push(
      `outils en double après dérivation du préfixe — ${nomsEnDouble.join(", ")}. ` +
        "Deux outils de même nom complet : `tools/list` en publierait un, et le second " +
        "serait injoignable sans un mot.",
    );
  }

  const verdict: Verdict = {
    // La garde mesure les OUTILS. Un adaptateur sans outil est déjà une
    // anomalie plus haut, ce qui interdit le « zéro mesuré, tout vert ».
    mesures: definition.tools.length,
    plancher: 1,
    anomalies,
  };

  if (anomalies.length > 0) {
    return { manifeste: null, verdict };
  }

  return {
    manifeste: {
      manifestVersion: VERSION_MANIFESTE,
      id: definition.id,
      version: definition.version,
      mode: definition.mode,
      profilesVersion: sceauProfils.version,
      profilesSha: sceauProfils.empreinte,
      profiles: [...definition.profiles],
      secrets: definition.secrets.map((secret) => secret.name),
      tools: outils,
    },
    verdict,
  };
}

/** Levée quand une définition ne peut pas produire de manifeste sûr. */
export class ErreurManifeste extends Error {
  public readonly anomalies: readonly string[];

  public constructor(anomalies: readonly string[]) {
    super(
      `Manifeste refusé — ${String(anomalies.length)} anomalie(s) :\n · ${anomalies.join("\n · ")}`,
    );
    this.name = "ErreurManifeste";
    this.anomalies = anomalies;
  }
}

/**
 * Produit le manifeste, ou lève.
 *
 * C'est la commande de build de l'adaptateur. Elle échoue BRUYAMMENT : un
 * manifeste construit malgré une anomalie serait épinglé par un SHA parfaitement
 * stable, et le verrou certifierait un document faux.
 */
export function construireManifeste<TProfile extends string>(
  definition: DefinitionAdaptateur<TProfile>,
  profilsConnus: readonly TProfile[],
  sceauProfils: SceauProfils,
): Manifeste {
  const { manifeste, verdict } = analyserDefinition(definition, profilsConnus, sceauProfils);
  if (manifeste === null) throw new ErreurManifeste(verdict.anomalies);
  return manifeste;
}

/** Le texte canonique du manifeste — c'est LUI qui est haché, pas l'objet. */
export function texteDuManifeste(manifeste: Manifeste): string {
  return canoniser(manifeste as unknown as ValeurJson);
}

/** L'empreinte du manifeste : le `manifestSha` d'`ops_adapter` et du verrou. */
export function empreinteDuManifeste(manifeste: Manifeste): string {
  return empreinteCanonique(manifeste as unknown as ValeurJson);
}

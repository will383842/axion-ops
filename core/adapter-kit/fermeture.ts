/**
 * `core/adapter-kit/fermeture.ts` — LA FERMETURE D'UN SCHÉMA D'ENTRÉE, ET LE
 * CONTRÔLE 7 DU § 09, DÉRIVÉS EN UN SEUL ENDROIT.
 *
 * ═══ LE DÉFAUT QUE CE FICHIER REFERME ═══
 *
 * Le § 09 pose deux règles sur le schéma d'entrée :
 *
 *   « Le schéma d'entrée est `.strict()`, pour qu'un champ d'autorisation
 *     glissé dans la charge utile soit un REFUS VISIBLE et non un silence. »
 *   « Contrôle 7 — aucun champ d'autorisation ne provient du schéma d'entrée. »
 *
 * À la fin du lot 1, les deux n'étaient tenues QUE DU CÔTÉ BUILD : le harnais
 * tourne dans la CI de l'ADAPTATEUR, et `analyserDefinition()` ne voit que les
 * adaptateurs écrits en TypeScript avec le kit. Le registre — seule barrière
 * pour un manifeste produit ailleurs — n'en vérifiait aucune.
 *
 * Témoin exécuté par la Recette, et c'est une mesure, pas une crainte : un
 * manifeste fédéré dont un outil déclare
 * `inputSchema: { type: "object", properties: { peutVoirAppels: {…} } }`, sans
 * `additionalProperties`, était **ADMIS sans un mot**. `peutVoirAppels` est
 * nommément une propriété de `Habilitations` (§ 19 bis).
 *
 * Et le § 29 nomme précisément le cas : le CRM en PHP, dépôt **public à
 * jamais**, qui ne passe par aucun compilateur du socle.
 *
 * ═══ LA DÉCISION : DEUX DIALECTES, PAS UN (ADR 0003) ═══
 *
 * Refuser tout schéma dont `additionalProperties !== false` rejetterait un
 * manifeste parfaitement correct qui exprimerait la fermeture par
 * `unevaluatedProperties: false` — le mot-clé que JSON Schema 2020-12 a
 * introduit précisément pour fermer un schéma APRÈS composition (`allOf`,
 * `$ref`), là où `additionalProperties` ne voit pas les propriétés apportées
 * par les sous-schémas.
 *
 * Ce n'est pas un détail d'implémentation : c'est un CONTRAT INTER-LANGAGES.
 * Zod (`.strict()`, via `z.toJSONSchema()`) produit le premier ; un générateur
 * PHP qui compose ses schémas produira le second. Refuser le second forcerait
 * l'adaptateur PHP à aplatir ses schémas — ou, bien plus probablement, à ce
 * qu'on lui accorde une exception écrite à la main, c'est-à-dire un trou.
 *
 * **Les deux sont acceptés, et le dialecte qui a servi est RENDU** : la console
 * peut alors dire lequel, et une bascule silencieuse de l'un à l'autre se voit.
 *
 * ═══ ⚠️ LA BORNE DE CETTE GARDE, ÉCRITE AVEC SA MESURE ═══
 *
 * Elle inspecte les sous-schémas qui déclarent `properties` — à la racine et
 * en profondeur, `properties`, `items`, `$defs`, `allOf`, `anyOf`, `oneOf`,
 * `not` compris. Elle NE RÉSOUT AUCUN `$ref`. Un schéma dont la fermeture
 * dépendrait d'un `$ref` vers `$defs` sera donc jugé sur le sous-schéma cible
 * lui-même, que le parcours atteint par `$defs` — mais un `$ref` vers un
 * document EXTERNE n'est pas atteignable, et un tel schéma est refusé pour ce
 * qu'il est : un schéma que le socle ne peut pas vérifier. Le refus dit la
 * cause.
 *
 * Elle compare des NOMS pour le contrôle 7. Un champ nommé `peutTout` ou
 * `bypass` ne ressemble à aucune propriété de `ToolContext` et passe — c'est
 * déjà écrit dans `autorisation.ts`, et ce fichier ne fait pas mieux. Un `grep`
 * ne prouve que l'absence de la forme écrite.
 */

import type { ObjetJson, ValeurJson } from "./json.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Les deux dialectes
// ═════════════════════════════════════════════════════════════════════════════

/**
 * LES MOTS-CLÉS QUI FERMENT UN SCHÉMA D'OBJET, ET CE QU'ILS FERMENT.
 *
 * L'ordre est SIGNIFIANT : c'est celui dans lequel la reconnaissance est
 * tentée, donc celui du dialecte rendu quand un schéma porte les deux. Il n'a
 * aucune conséquence de sécurité — les deux ferment — mais il rend le résultat
 * déterministe, donc comparable d'un enregistrement à l'autre.
 */
export const DIALECTES_FERMETURE = [
  {
    cle: "additionalProperties",
    /** Le dialecte de Zod : `.strict()` ⇒ `additionalProperties: false`. */
    origine: "draft 2020-12, forme historique — produite par `z.toJSONSchema()`",
  },
  {
    cle: "unevaluatedProperties",
    /**
     * Le dialecte de la composition. Il ferme APRÈS application des `allOf`,
     * `anyOf`, `$ref` — ce que `additionalProperties` ne sait pas faire, et ce
     * dont un générateur qui compose ses schémas a besoin.
     */
    origine: "draft 2020-12, forme composable — attendue d'un générateur non-Zod",
  },
] as const;

export type DialecteFermeture = (typeof DIALECTES_FERMETURE)[number]["cle"];

// ═════════════════════════════════════════════════════════════════════════════
//  Le parcours
// ═════════════════════════════════════════════════════════════════════════════

/** La valeur vue comme objet JSON, ou `null` si ce n'en est pas un. */
function commeObjet(valeur: ValeurJson | undefined): ObjetJson | null {
  if (valeur === undefined || valeur === null || typeof valeur !== "object") return null;
  if (Array.isArray(valeur)) return null;
  return valeur as ObjetJson;
}

/**
 * Les emplacements où un sous-schéma peut vivre, dans l'ordre de parcours.
 *
 * DÉRIVÉ EN UN SEUL ENDROIT : ajouter un mot-clé applicateur ici l'ajoute au
 * contrôle de fermeture ET au contrôle 7, sans qu'aucun des deux ne soit à
 * retoucher. Les recopier séparément ferait qu'un mot-clé ajouté d'un seul côté
 * ouvrirait une porte que l'autre côté croirait fermée.
 */
const APPLICATEURS_OBJET = ["properties", "$defs", "definitions", "patternProperties"] as const;
const APPLICATEURS_LISTE = ["allOf", "anyOf", "oneOf", "prefixItems"] as const;
const APPLICATEURS_DIRECTS = ["items", "not", "if", "then", "else", "contains"] as const;

/** Un sous-schéma atteint par le parcours, avec le chemin qui y mène. */
interface SousSchema {
  readonly chemin: string;
  readonly schema: ObjetJson;
}

/**
 * Tous les sous-schémas d'un schéma, RACINE COMPRISE, en profondeur d'abord.
 *
 * ⚠️ Le parcours est BORNÉ EN PROFONDEUR. Un schéma cyclique — que `$ref` rend
 *    possible — ferait boucler un parcours naïf, et le socle se figerait sur un
 *    document reçu d'un dépôt tiers : un déni de service déclenchable par
 *    n'importe quel adaptateur. La borne est haute (bien au-delà de tout schéma
 *    d'outil réel) et son dépassement est SIGNALÉ, jamais silencieux.
 */
export const PROFONDEUR_MAXIMALE = 32;

export function sousSchemas(racine: ValeurJson): {
  readonly trouves: readonly SousSchema[];
  readonly profondeurDepassee: boolean;
} {
  const trouves: SousSchema[] = [];
  let profondeurDepassee = false;
  const vus = new Set<ObjetJson>();

  const descendre = (valeur: ValeurJson | undefined, chemin: string, niveau: number): void => {
    const objet = commeObjet(valeur);
    if (objet === null) return;
    if (niveau > PROFONDEUR_MAXIMALE) {
      profondeurDepassee = true;
      return;
    }
    // Un même objet atteint deux fois (cycle par `$ref` résolu en amont, ou
    // simple partage de référence) n'est pas visité deux fois.
    if (vus.has(objet)) return;
    vus.add(objet);

    trouves.push({ chemin, schema: objet });

    for (const cle of APPLICATEURS_OBJET) {
      const conteneur = commeObjet(objet[cle]);
      if (conteneur === null) continue;
      for (const [nom, sous] of Object.entries(conteneur)) {
        descendre(sous, `${chemin}.${cle}.${nom}`, niveau + 1);
      }
    }
    for (const cle of APPLICATEURS_LISTE) {
      const liste = objet[cle];
      // `Array.isArray` élargit à `any[]` : le narrowing se fait sur l'union
      // déclarée de `ValeurJson`, jamais sur le prédicat seul — sinon chaque
      // élément arrive en `any` et la garde cesse d'être typée là où elle
      // descend dans un document venu d'ailleurs.
      if (liste === undefined || !Array.isArray(liste)) continue;
      const elements: readonly ValeurJson[] = liste;
      elements.forEach((sous, index) => {
        descendre(sous, `${chemin}.${cle}[${String(index)}]`, niveau + 1);
      });
    }
    for (const cle of APPLICATEURS_DIRECTS) {
      descendre(objet[cle], `${chemin}.${cle}`, niveau + 1);
    }
  };

  descendre(racine, "$", 0);
  return { trouves, profondeurDepassee };
}

// ═════════════════════════════════════════════════════════════════════════════
//  La fermeture
// ═════════════════════════════════════════════════════════════════════════════

/** Le dialecte par lequel CE sous-schéma est fermé, ou `null`. */
export function dialecteDeFermeture(schema: ObjetJson): DialecteFermeture | null {
  for (const dialecte of DIALECTES_FERMETURE) {
    if (schema[dialecte.cle] === false) return dialecte.cle;
  }
  return null;
}

/**
 * Un sous-schéma DOIT-IL être fermé ?
 *
 * ⚠️ CE QUE CETTE FONCTION REGARDAIT, ET LE VERDICT FAUX QU'ELLE PRODUISAIT.
 *    Elle ne lisait que `properties` — « seuls ceux-là ont besoin d'être
 *    fermés ». Deux formes ordinaires y échappaient donc entièrement :
 *
 *     · un sous-schéma qui déclare par `patternProperties` n'était JAMAIS compté
 *       parmi les `objetsAFermer` ;
 *     · `{ "type": "object" }` NU — qui n'a rien à fermer à ses yeux, et qui
 *       accepte pourtant n'importe quelle clé et n'importe quelle valeur. Un
 *       objet qui ne déclare rien est le PLUS permissif, pas le plus inoffensif ;
 *       `z.record(z.string(), z.string())` produit exactement cette forme.
 *
 *    Le verdict n'était pas seulement incomplet : il était NET, POSITIF ET FAUX
 *    — `ferme: true` sur un schéma qui accepte n'importe quelle propriété — et
 *    rien n'était signalé, contrairement aux `$ref`, dont la borne est écrite ET
 *    remontée par `refsNonResolus`.
 *
 * Elle compte désormais tout sous-schéma qui déclare des propriétés PAR QUELQUE
 * MOT-CLÉ QUE CE SOIT, et tout sous-schéma d'objet — déclarant ou non.
 */
function doitEtreFerme(schema: ObjetJson): boolean {
  if (commeObjet(schema["properties"]) !== null) return true;
  if (commeObjet(schema["patternProperties"]) !== null) return true;
  if (schema["type"] === "object") return true;
  // Les deux mots-clés de fermeture eux-mêmes : leur PRÉSENCE dit qu'on parle
  // d'un objet, quelle que soit leur valeur.
  if (schema["additionalProperties"] !== undefined) return true;
  if (schema["unevaluatedProperties"] !== undefined) return true;
  return false;
}

/**
 * CE QUI RESTE OUVERT MALGRÉ UN DIALECTE DE FERMETURE, ou `null`.
 *
 * ⚠️ POURQUOI `dialecteDeFermeture` NE SUFFIT PAS. Elle cherche un mot-clé valant
 *    `false`. Un `unevaluatedProperties: false` posé À CÔTÉ d'un
 *    `additionalProperties: { "type": "string" }` la satisfaisait donc — alors
 *    que `additionalProperties` évalue TOUTES les propriétés restantes, ne laisse
 *    rien d'« inévalué », et rend le `false` voisin parfaitement inerte. Le
 *    schéma acceptait n'importe quelle clé, et se déclarait fermé.
 *
 * `patternProperties` ouvre pour une autre raison, et elle vaut d'être écrite :
 * l'ensemble des noms qu'un MOTIF admet n'est pas énumérable en général. Le
 * contrôle 7 ne peut confronter que des noms qu'il peut énumérer ; un objet dont
 * les champs admissibles ne s'énumèrent pas n'est pas « fermé » au sens du § 09,
 * quoi qu'en dise le validateur JSON Schema. **Le CDC ne tranche pas
 * `patternProperties` — c'est une décision de ce module, prise fail-closed, et
 * signalée au rapport.**
 */
function ouvertureResiduelle(schema: ObjetJson): string | null {
  if (commeObjet(schema["patternProperties"]) !== null) {
    return "patternProperties (l'ensemble des noms admis n'est pas énumérable)";
  }
  const additionnelles = schema["additionalProperties"];
  if (additionnelles !== undefined && additionnelles !== false) {
    return "additionalProperties en forme de schéma (toute propriété non déclarée est acceptée)";
  }
  const inevaluees = schema["unevaluatedProperties"];
  if (inevaluees !== undefined && inevaluees !== false) {
    return "unevaluatedProperties en forme de schéma";
  }
  return null;
}

/** Ce que rend l'analyse de fermeture. JAMAIS un booléen seul. */
export interface VerdictFermeture {
  /** Vrai si TOUS les schémas d'objet rencontrés sont fermés. */
  readonly ferme: boolean;
  /** Le dialecte employé À LA RACINE, `null` si la racine n'est pas fermée. */
  readonly dialecteRacine: DialecteFermeture | null;
  /**
   * Combien de sous-schémas le parcours a RÉELLEMENT visités. Un schéma
   * inspecté à zéro sous-schéma serait déclaré fermé pour la pire des raisons.
   */
  readonly sousSchemasInspectes: number;
  /** Combien, parmi eux, déclaraient des propriétés — donc devaient être fermés. */
  readonly objetsAFermer: number;
  /** Les chemins des schémas d'objet OUVERTS. Vide si tout est fermé. */
  readonly ouverts: readonly string[];
  /** Vrai si le parcours a buté sur `PROFONDEUR_MAXIMALE`. */
  readonly profondeurDepassee: boolean;
  /** Les `$ref` rencontrés, qui ne sont PAS résolus — voir la borne en tête. */
  readonly refsNonResolus: readonly string[];
}

/**
 * Le schéma d'entrée est-il FERMÉ, dans l'un ou l'autre dialecte ?
 *
 * ⚠️ ELLE EXIGE LA FERMETURE DE CHAQUE SCHÉMA D'OBJET, PAS SEULEMENT DE LA
 *    RACINE. Une racine fermée dont un champ `options` serait un objet ouvert
 *    laisserait passer `{ options: { peutVoirAppels: true } }` — le contrôle 7
 *    verrait le nom, mais seulement parce qu'il descend, lui aussi. Fermer la
 *    racine seule serait une garde qui ne mord qu'au premier niveau, sur un
 *    document venu d'un dépôt public.
 */
export function analyserFermeture(schema: ValeurJson): VerdictFermeture {
  const { trouves, profondeurDepassee } = sousSchemas(schema);
  const ouverts: string[] = [];
  const refsNonResolus: string[] = [];
  let objetsAFermer = 0;

  for (const { chemin, schema: sous } of trouves) {
    const ref = sous["$ref"];
    if (typeof ref === "string") refsNonResolus.push(`${chemin} → ${ref}`);
    if (!doitEtreFerme(sous)) continue;
    objetsAFermer += 1;
    if (dialecteDeFermeture(sous) === null) {
      ouverts.push(chemin);
      continue;
    }
    // Le dialecte est là — mais il peut être INERTE. Le chemin porte la raison,
    // pour qu'un adaptateur refusé sache quoi corriger (§ 15, deuxième règle).
    const residuelle = ouvertureResiduelle(sous);
    if (residuelle !== null) ouverts.push(`${chemin} (${residuelle})`);
  }

  const racine = commeObjet(schema);

  return {
    ferme: ouverts.length === 0 && objetsAFermer > 0 && !profondeurDepassee,
    dialecteRacine: racine === null ? null : dialecteDeFermeture(racine),
    sousSchemasInspectes: trouves.length,
    objetsAFermer,
    ouverts,
    profondeurDepassee,
    refsNonResolus,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le contrôle 7 — aucun champ d'autorisation ne vient du schéma
// ═════════════════════════════════════════════════════════════════════════════

/** Un champ d'autorisation trouvé dans un schéma d'entrée. */
export interface ChampDAutorisation {
  readonly nom: string;
  readonly chemin: string;
}

/** Ce que rend le contrôle 7. */
export interface VerdictControle7 {
  readonly trouves: readonly ChampDAutorisation[];
  /** Combien de NOMS de propriétés ont été confrontés. */
  readonly proprietesInspectees: number;
  /** Combien de noms interdits la liste portait. Zéro rendrait le contrôle vacueux. */
  readonly clesInterdites: number;
}

/**
 * Cherche, dans TOUT le schéma, une propriété portant le nom d'une clé
 * d'autorisation.
 *
 * @param clesInterdites LES NOMS DÉRIVÉS de `ToolContext` et `Habilitations`,
 *        produits par `clesDAutorisationDepuisSource()` — jamais une liste
 *        écrite à la main ici. « Un drapeau nouveau s'ajoute dans
 *        `core/types.ts`, jamais dans un `input` », dit ce fichier-là : le
 *        contrôle le refuse alors le jour même, sans qu'une liste soit à
 *        retoucher.
 *
 * ⚠️ La liste est délibérément PLUS LARGE que la règle : elle porte aussi
 *    `sessionId`, `requestId`, `deadline`, qui n'autorisent rien. Le remède à
 *    une collision légitime est de renommer le champ d'entrée — une minute —
 *    tandis qu'une liste restreinte devrait être écrite à la main, donc
 *    recopiée, donc divergente au premier ajout. Bruyante et dérivée plutôt que
 *    juste et recopiée.
 */
export function chercherChampsDAutorisation(
  schema: ValeurJson,
  clesInterdites: readonly string[],
): VerdictControle7 {
  const interdites = new Set(clesInterdites);
  const trouves: ChampDAutorisation[] = [];
  let proprietesInspectees = 0;

  for (const { chemin, schema: sous } of sousSchemas(schema).trouves) {
    // ── ① Les noms LITTÉRAUX, sous `properties`. C'est tout ce que ce contrôle
    //      lisait, et c'est ce qui l'a rendu aveugle à deux emplacements
    //      ordinaires : le parcours VISITE bien `patternProperties`, mais la
    //      lecture d'après ne regardait que `sous["properties"]`. Prouvé de bout
    //      en bout sur la vraie porte : le MÊME nom réservé passait ou non selon
    //      l'endroit du schéma où on l'écrivait.
    const proprietes = commeObjet(sous["properties"]);
    if (proprietes !== null) {
      for (const nom of Object.keys(proprietes)) {
        proprietesInspectees += 1;
        if (interdites.has(nom)) trouves.push({ nom, chemin: `${chemin}.properties.${nom}` });
      }
    }

    // ── ② Les noms déclarés par un MOTIF. C'est le motif qu'on confronte, et
    //      non le sous-schéma : le nom est écrit LÀ, pas ailleurs.
    const parMotif = commeObjet(sous["patternProperties"]);
    if (parMotif !== null) {
      for (const motif of Object.keys(parMotif)) {
        for (const interdite of interdites) {
          proprietesInspectees += 1;
          if (motifAdmet(motif, interdite)) {
            trouves.push({
              nom: interdite,
              chemin: `${chemin}.patternProperties[${motif}]`,
            });
          }
        }
      }
    }

    // ── ③ Les JOKERS. Un objet qui accepte toute propriété non déclarée accepte
    //      AUSSI chacun des noms réservés — il n'y a pas de nom à trouver, il y a
    //      un emplacement qui les admet tous. Les nommer un par un est ce qui
    //      rend le refus actionnable : l'adaptateur lit lesquels sont en cause.
    if (admetToutNom(sous)) {
      for (const interdite of interdites) {
        proprietesInspectees += 1;
        trouves.push({ nom: interdite, chemin: `${chemin} (accepte toute propriété)` });
      }
    }
  }

  return { trouves, proprietesInspectees, clesInterdites: interdites.size };
}

/**
 * Le motif de `patternProperties` admet-il ce nom ?
 *
 * ⚠️ FAIL-CLOSED SUR UN MOTIF QUI NE COMPILE PAS. Un motif venu d'un dépôt tiers
 *    peut employer une syntaxe qu'`ECMAScript` ne connaît pas (JSON Schema
 *    prescrit ECMA-262, mais rien n'oblige l'émetteur à s'y tenir). Rendre
 *    `false` sur une exception laisserait passer un nom réservé DERRIÈRE un motif
 *    illisible — c'est-à-dire derrière la forme la plus facile à fabriquer. On
 *    rend donc `true` : un motif qu'on ne sait pas lire est réputé tout admettre.
 */
function motifAdmet(motif: string, nom: string): boolean {
  try {
    return new RegExp(motif, "u").test(nom);
  } catch {
    return true;
  }
}

/**
 * Ce sous-schéma accepte-t-il n'importe quel NOM de propriété ?
 *
 * Les trois formes, et elles sont toutes ordinaires :
 *  · `additionalProperties` en forme de schéma — `z.record(…)` la produit ;
 *  · `unevaluatedProperties` en forme de schéma ;
 *  · `{ "type": "object" }` NU, sans `properties` ni fermeture — l'objet le plus
 *    permissif de tout JSON Schema, et celui qui ressemblait le plus à rien.
 */
function admetToutNom(schema: ObjetJson): boolean {
  const additionnelles = schema["additionalProperties"];
  if (additionnelles !== undefined && additionnelles !== false) return true;
  const inevaluees = schema["unevaluatedProperties"];
  if (inevaluees !== undefined && inevaluees !== false) return true;
  if (schema["type"] !== "object") return false;
  if (commeObjet(schema["properties"]) !== null) return false;
  if (commeObjet(schema["patternProperties"]) !== null) return false;
  // `type: "object"` nu : ni champs déclarés, ni fermeture. Il admet tout.
  return dialecteDeFermeture(schema) === null;
}

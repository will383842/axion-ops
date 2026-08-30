/**
 * La DSL d'écriture — les types de `defineAdapter()` (§ 09).
 *
 * ═══ LA SCISSION LOCALE / DISTANTE, QUI EST LE CŒUR DU § 09 ═══
 *
 * `defineAdapter()` est une DSL D'ÉCRITURE, **locale à l'adaptateur**. Ce
 * fichier décrit donc des valeurs JavaScript vivantes : des schémas Zod, une
 * fonction `handler`, des références de secrets.
 *
 * Le socle ne voit RIEN de tout cela. Sa sortie de build est un MANIFESTE
 * JSON (`manifest.ts`) : les schémas y sont en JSON Schema, et le `handler`
 * n'y figure pas du tout — le socle appelle l'endpoint en JSON-RPC.
 *
 * Le défaut de la v5, en une phrase : elle déclarait « des schémas Zod, une
 * fonction handler et des secrets injectés déjà déchiffrés » — trois valeurs
 * JavaScript **qui ne franchissent pas un fil JSON-RPC**.
 */

import type { AdapterMode, DataClass, Effect, ToolContext } from "../types.js";
import type { ZodType, output } from "zod/v4";

// ═════════════════════════════════════════════════════════════════════════════
//  Idempotence et pagination — § 09 et § 13.1
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce que l'outil promet quand on le rejoue.
 *
 * · `key`           — rejouable avec une clé ; `ctx.idempotencyKey` la porte,
 *                     JAMAIS `input` (§ 09).
 * · `non-rejouable` — un second appel produit un second effet.
 * · `n/a`           — sans objet (lecture pure).
 */
export const IDEMPOTENCIES = ["key", "non-rejouable", "n/a"] as const;

export type Idempotency = (typeof IDEMPOTENCIES)[number];

/**
 * § 13.1 — deux régimes, déclarés par l'outil.
 *
 * `keyset` exige un curseur signé (HMAC sur `{ lastId, lastSortValue,
 * filtersHash }`) : un curseur rejoué avec d'autres filtres rend une fenêtre
 * SILENCIEUSEMENT FAUSSE, d'où le refus `cursor_invalid` de l'étape 9.
 */
export const PAGINATIONS = ["keyset", "page", "none"] as const;

export type Pagination = (typeof PAGINATIONS)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  Compaction — § 13.3
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les annotations de compaction. **Le socle ne connaît aucun métier : il ne
 * devine pas quels champs raccourcir.** Sans ces annotations, la cascade du
 * § 13.3 n'a aucune prise et tout dépassement finit en `result_too_large`.
 *
 * Cascade : < 150 % ⇒ raccourcir `free` · 150–300 % ⇒ retirer `tier2` ·
 * > 300 % ⇒ mode agrégat sur `aggregateBy`.
 */
export interface AnnotationsCompaction {
  /** Champs à RACCOURCIR en premier. */
  readonly free: readonly string[];
  /**
   * Champs de rang 2, RETIRÉS au deuxième palier.
   *
   * § 13.3, règle qui manquait : ces champs doivent être **optionnels** au
   * schéma `output` — sinon une charge compactée ne valide plus le schéma que
   * l'outil publie. Le harnais le vérifie (contrôle supplémentaire C13.3).
   */
  readonly tier2: readonly string[];
  /**
   * Clé du mode agrégat, ou `null` quand l'outil n'en a pas.
   *
   * `null` n'est pas neutre : il rend le troisième palier IMPOSSIBLE, donc tout
   * dépassement au-delà de 300 % se termine en `result_too_large`. Le harnais
   * le signale sans le refuser — c'est un choix d'outil, pas une faute.
   */
  readonly aggregateBy: string | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Secrets — § 09
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une RÉFÉRENCE de secret : un nom dans `ops_secret`, JAMAIS une valeur.
 *
 * Ce type n'a délibérément **aucun champ pouvant porter une valeur**. Ce n'est
 * pas de la prudence rédactionnelle : le manifeste est produit dans le dépôt de
 * l'adaptateur — public à jamais dans le cas du CRM — et il est versionné.
 * Un champ `value` optionnel finirait rempli un jour, et le commit resterait.
 */
export interface ReferenceSecret {
  /** Nom dans `ops_secret`. */
  readonly name: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Un outil
// ═════════════════════════════════════════════════════════════════════════════

/** Les champs communs aux deux formes d'outil (écrite et effacée). */
interface ChampsOutil {
  /**
   * Nom LOCAL de l'outil : `inbox.recent`, sans préfixe.
   *
   * § 09, harnais, contrôle 5 : **le préfixe est DÉRIVÉ de l'id de
   * l'adaptateur, jamais saisi**. Écrire `axionia.inbox.recent` ici est un
   * refus, pas une redondance : deux sources de vérité pour un même préfixe se
   * désynchronisent au premier renommage d'adaptateur.
   */
  readonly name: string;

  /**
   * § 13.4 — **la version est portée par l'OUTIL**, pas par l'adaptateur. La
   * v5 la posait sur l'adaptateur, ce qui faisait lire « v2 à côté de v1 »
   * comme une duplication de tout l'adaptateur.
   */
  readonly version: string;

  /** Obligatoire, journalisée, COMPTÉE AU BUDGET (§ 09 et § 14). */
  readonly description: string;

  /** Ce que l'outil FAIT. Sans valeur par défaut permissive (contrôle 1). */
  readonly effect: Effect;

  /** Ce que l'outil TOUCHE. Sans valeur par défaut permissive (contrôle 1). */
  readonly dataClass: DataClass;

  readonly idempotency: Idempotency;

  readonly pagination: Pagination;

  /** Plafond de sortie en octets, **hors du schéma** (§ 09). */
  readonly maxBytes: number;

  readonly compaction: AnnotationsCompaction;

  /**
   * § 12, règle 3 — les champs porteurs d'identifiants, **déclarés par
   * l'outil** : le socle ne peut pas les deviner, et `recordIds` n'est pas
   * anonyme mais pseudonyme. Sur le canal appels, un identifiant
   * `CalendlyEvent` mène à une fiche portant `cancelUrl` et `rescheduleUrl` —
   * des URL-capacités.
   */
  readonly idFields: readonly string[];

  /**
   * Chemin du jeu MAXIMAL, exigé par le test du § 32 et lu par le contrôle 4
   * du harnais. Le harnais annonce combien de fixtures il a exécutées : sans ce
   * compte, un chemin faux rend le contrôle muet.
   */
  readonly fixtureMax: string;
}

/**
 * Un outil tel que le socle et le harnais le manipulent : schémas Zod
 * quelconques, `handler` effacé.
 *
 * `handler` prend `never` À DESSEIN. Le socle ne l'appelle JAMAIS — il appelle
 * l'endpoint en JSON-RPC. Le type `never` en position de paramètre rend
 * n'importe quel handler typé assignable ici, ET rend tout appel impossible à
 * écrire : la règle « le socle ne consomme jamais une fonction handler
 * distante » devient une erreur de COMPILATION plutôt qu'une consigne.
 */
export interface DefinitionOutil<TProfile extends string> extends ChampsOutil {
  /** Zod, FERMÉ (`.strict()`). Vérifié par le harnais, contrôle 7. */
  readonly input: ZodType;
  /** Zod — décrit la forme NON COMPACTÉE (§ 13.3). */
  readonly output: ZodType;
  readonly handler: (input: never, ctx: ToolContext<TProfile>) => unknown;
}

/**
 * Un outil tel que son AUTEUR l'écrit : les schémas gardent leurs types, si
 * bien que `input` et le retour du `handler` sont vérifiés à la compilation.
 */
export interface SpecOutil<
  TProfile extends string,
  TEntree extends ZodType,
  TSortie extends ZodType,
> extends ChampsOutil {
  readonly input: TEntree;
  readonly output: TSortie;
  readonly handler: (
    input: output<TEntree>,
    ctx: ToolContext<TProfile>,
  ) => output<TSortie> | Promise<output<TSortie>>;
}

/**
 * Écrit un outil en gardant ses types, puis l'efface vers `DefinitionOutil`.
 *
 * Aucune conversion forcée n'est nécessaire : `SpecOutil` est assignable à
 * `DefinitionOutil` par la contravariance du paramètre `never`. Si cette
 * assignabilité disparaissait, le typecheck le dirait ici — et non par un
 * `as unknown as` qui l'aurait tue.
 */
export function definirOutil<
  TProfile extends string,
  TEntree extends ZodType,
  TSortie extends ZodType,
>(outil: SpecOutil<TProfile, TEntree, TSortie>): DefinitionOutil<TProfile> {
  return outil;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Un adaptateur
// ═════════════════════════════════════════════════════════════════════════════

/**
 * La définition écrite par l'adaptateur.
 *
 * `TProfile` est FERMÉ par `creerAdapterKit()` : le kit reçoit l'énumération de
 * `core/profiles/` et la propage ici, si bien qu'un profil inconnu devient une
 * ERREUR DE COMPILATION chez l'adaptateur (§ 14, « la seule garde du budget qui
 * ne dépende d'aucun adaptateur pour exister »).
 */
export interface DefinitionAdaptateur<TProfile extends string> {
  /** `axionia`, `zoho-mail`. C'est de lui que les préfixes d'outils dérivent. */
  readonly id: string;

  /** Version de l'ADAPTATEUR. À ne pas confondre avec celle de chaque outil. */
  readonly version: string;

  readonly mode: AdapterMode;

  /** Typé sur l'énumération fermée de `core/profiles/`. */
  readonly profiles: readonly TProfile[];

  /**
   * ASSERTION AU REGISTRE : `mode === "fédéré" && secrets.length > 0`
   * ⇒ enregistrement REFUSÉ (§ 09).
   *
   * Ce n'est pas une correction de style. « Le socle injecte les secrets déjà
   * déchiffrés » appliqué à un adaptateur fédéré déverse des secrets EN CLAIR
   * vers un autre processus — et, dans le cas du CRM, vers un dépôt PUBLIC.
   */
  readonly secrets: readonly ReferenceSecret[];

  readonly tools: readonly DefinitionOutil<TProfile>[];
}

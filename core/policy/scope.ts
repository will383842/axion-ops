/**
 * core/policy/scope.ts — LA GRAMMAIRE DE `ops_policy.scope`.
 *
 * § 12, règle 1 : « le niveau appliqué est le PLUS STRICT parmi les lignes non
 * expirées dont le `scope` couvre l'outil appelé. Grammaire de `scope` :
 * `*` · `adapterId.*` · `adapterId.tool`. »
 *
 * ⚠️ CE FICHIER NE DÉCIDE D'AUCUN NIVEAU. Il répond à une seule question :
 *    « ce scope couvre-t-il cet outil ? ». Le choix du niveau est dans
 *    `niveau.ts`, et il n'emploie PAS la spécificité — voir plus bas.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  La référence d'un outil
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'outil appelé, tel que la chaîne d'appel le connaît : un adaptateur et un
 * nom LOCAL d'outil.
 *
 * ⚠️ ÉCART RELEVÉ — le § 12 donne `ops_tool.name` ET `ops_tool.adapterId` sans
 *    dire si `name` porte déjà le préfixe de l'adaptateur. Les exemples du CDC
 *    (`zoho.mail.send`, `ops.policy.tighten`) sont qualifiés, et l'adaptateur
 *    du § 27 s'appelle `zoho.mail` — donc `adapterId` contient lui-même des
 *    points. Plutôt que de deviner, ce module :
 *      · ne DÉCOUPE jamais un nom qualifié à l'aveugle ;
 *      · accepte les deux conventions par `referenceDepuisNom()` ;
 *      · teste la couverture en FABRIQUANT les scopes qui couvriraient la
 *        référence, jamais en analysant le scope pour en extraire un adapterId.
 *    Un découpage naïf sur le premier point ferait de `zoho.mail.send` un outil
 *    « mail.send » de l'adaptateur « zoho » — et un scope `zoho.mail.*` cesserait
 *    de couvrir quoi que ce soit, EN SILENCE.
 */
export interface ReferenceOutil {
  /** `ops_tool.adapterId`. Peut contenir des points (`zoho.mail`). */
  readonly adapterId: string;
  /** Nom LOCAL de l'outil, sans le préfixe de l'adaptateur (`send`). */
  readonly tool: string;
}

/**
 * Construit une référence à partir de `ops_tool.adapterId` et `ops_tool.name`,
 * que `name` soit déjà qualifié (`zoho.mail.send`) ou local (`send`).
 *
 * Le préfixe n'est retiré que s'il correspond EXACTEMENT à `adapterId` suivi
 * d'un point : on ne devine rien, on reconnaît.
 */
export function referenceDepuisNom(adapterId: string, name: string): ReferenceOutil {
  const prefixe = `${adapterId}.`;
  const tool = name.startsWith(prefixe) ? name.slice(prefixe.length) : name;
  return { adapterId, tool };
}

/** Le nom pleinement qualifié de l'outil — celui qu'un scope `adapterId.tool` vise. */
export function nomQualifie(reference: ReferenceOutil): string {
  return `${reference.adapterId}.${reference.tool}`;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Les trois genres de scope
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'ordre est SIGNIFIANT : du plus large au plus étroit. `specificite()` en
 * dérive.
 */
export const GENRES_SCOPE = ["global", "adaptateur", "outil"] as const;

export type GenreScope = (typeof GENRES_SCOPE)[number];

/**
 * Un segment de nom : minuscules, chiffres, tiret et souligné, ne commençant ni
 * ne finissant par un séparateur. L'étoile n'y est JAMAIS admise — elle n'a que
 * deux places légales dans la grammaire, et `zoho.*.send` n'en est pas une.
 */
const SEGMENT = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/;

export interface ScopeValide {
  readonly valide: true;
  readonly genre: GenreScope;
  /** `null` pour le scope global `*`. */
  readonly adapterId: string | null;
  /** Renseigné pour le seul genre `outil`. */
  readonly tool: string | null;
}

export interface ScopeInvalide {
  readonly valide: false;
  /** Pourquoi, en clair — un message d'erreur du socle dit toujours quoi faire. */
  readonly motif: string;
}

export type AnalyseScope = ScopeValide | ScopeInvalide;

function segmentsValides(dotted: string, minimum: number): boolean {
  const segments = dotted.split(".");
  if (segments.length < minimum) return false;
  return segments.every((segment) => SEGMENT.test(segment));
}

/**
 * Analyse un scope selon la grammaire du § 12. Un scope hors grammaire est
 * INVALIDE, pas « ne couvre rien » : la nuance décide de tout, parce qu'une
 * ligne ignorée est une ligne qui n'impose plus son niveau — donc un
 * ÉLARGISSEMENT silencieux. Voir `niveau.ts`, qui refuse de calculer plutôt que
 * d'écarter une ligne illisible.
 */
export function analyserScope(scope: string): AnalyseScope {
  if (scope.length === 0) {
    return { valide: false, motif: "scope vide — attendu `*`, `adapterId.*` ou `adapterId.tool`" };
  }

  if (scope === "*") {
    return { valide: true, genre: "global", adapterId: null, tool: null };
  }

  if (scope.endsWith(".*")) {
    const adapterId = scope.slice(0, -2);
    if (!segmentsValides(adapterId, 1)) {
      return {
        valide: false,
        motif: `scope « ${scope} » — la partie avant « .* » n'est pas un identifiant d'adaptateur`,
      };
    }
    return { valide: true, genre: "adaptateur", adapterId, tool: null };
  }

  if (scope.includes("*")) {
    return {
      valide: false,
      motif: `scope « ${scope} » — l'étoile n'est admise qu'en « * » ou en suffixe « .* »`,
    };
  }

  if (!segmentsValides(scope, 2)) {
    return {
      valide: false,
      motif: `scope « ${scope} » — attendu « adapterId.tool », soit au moins deux segments`,
    };
  }

  const segments = scope.split(".");
  const tool = segments[segments.length - 1] ?? "";
  const adapterId = segments.slice(0, -1).join(".");
  return { valide: true, genre: "outil", adapterId, tool };
}

/**
 * Rang de spécificité, DÉRIVÉ de l'ordre de `GENRES_SCOPE`.
 *
 * ⚠️ IL NE SERT QU'À L'AFFICHAGE. Le § 12 dit « le PLUS STRICT gagne », jamais
 *    « le plus spécifique gagne ». Un `libre` posé sur `zoho.mail.send` ne bat
 *    PAS un `brouillon` posé sur `*` : c'est précisément ce qui rend
 *    l'asymétrie « resserrer libre / desserrer jamais » décidable. Une garde de
 *    `niveau.spec.ts` interdit de réintroduire la règle du plus spécifique.
 */
export function specificite(genre: GenreScope): number {
  return GENRES_SCOPE.indexOf(genre);
}

// ═════════════════════════════════════════════════════════════════════════════
//  Couverture
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les TROIS scopes — et eux seuls — qui couvrent cette référence. Fabriqués
 * depuis la référence, jamais recopiés : ajouter un genre à la grammaire se
 * voit ici et nulle part ailleurs.
 */
export function scopesCouvrants(reference: ReferenceOutil): readonly string[] {
  return ["*", `${reference.adapterId}.*`, nomQualifie(reference)];
}

/**
 * Ce scope couvre-t-il cet outil ?
 *
 * Rendu par appartenance à `scopesCouvrants()` : aucune analyse du scope n'est
 * nécessaire, donc aucune ambiguïté sur l'endroit où couper `zoho.mail.send`.
 */
export function scopeCouvre(scope: string, reference: ReferenceOutil): boolean {
  return scopesCouvrants(reference).includes(scope);
}

/**
 * `gros` couvre-t-il TOUT ce que `petit` couvre ?
 *
 * C'est la question du desserrage : poser une ligne sur `zoho.mail.send` ne
 * sert à rien si une ligne plus stricte sur `*` la DOMINE — elle s'appliquera
 * quand même, et l'écran montrerait un desserrage sans effet comme courant.
 *
 * Rendu `false` si l'un des deux scopes est hors grammaire : l'appelant doit
 * traiter l'invalidité AVANT, jamais la lire comme « ne domine pas ».
 */
export function scopeDomine(gros: string, petit: string): boolean {
  const a = analyserScope(gros);
  const b = analyserScope(petit);
  if (!a.valide || !b.valide) return false;

  if (a.genre === "global") return true;
  if (a.genre === "adaptateur") return b.genre !== "global" && a.adapterId === b.adapterId;
  // a.genre === "outil" : ne domine que lui-même.
  return b.genre === "outil" && a.adapterId === b.adapterId && a.tool === b.tool;
}

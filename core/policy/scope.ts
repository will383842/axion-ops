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
 *
 * ═══ LA QUESTION LAISSÉE OUVERTE AU LOT 1, ET TRANCHÉE ICI ═══
 *
 * Le lot 1 a mesuré que ce dossier RÉPONDAIT DEUX FOIS à un même fait, et que
 * les deux réponses se contredisaient sur une politique parfaitement lisible :
 *
 *  · `niveauApplique()` répondait par APPARTENANCE aux trois scopes que
 *    `scopesCouvrants()` FABRIQUE depuis une `ReferenceOutil` ;
 *  · `plancherDuScope()` / `scopeDomine()` répondaient par ANALYSE de la
 *    grammaire, en découpant le scope sur son DERNIER point.
 *
 * Le même outil `zoho.mail.send` recevait `libre` ou `brouillon` selon la
 * fonction interrogée, sans qu'une seule anomalie soit levée — donc là où aucun
 * fail-closed ne venait refermer l'écart. Et la contradiction atteignait le TRI
 * resserrage / desserrage, c'est-à-dire le chemin qui ne demande NI second
 * facteur NI `ops:policy`.
 *
 * ⚖️ CE QUI EST TRANCHÉ, ET ÉCRIT ICI UNE SEULE FOIS : la grammaire du § 12
 *    est `*` | `adapterId.*` | `adapterId.tool`. Un scope se lit donc de gauche
 *    à droite, et le PREMIER point sépare l'adaptateur du reste — DONC
 *    `adapterId` NE CONTIENT AUCUN POINT.
 *
 *    Ce n'est pas un arbitrage de confort : c'est déjà la règle que
 *    `core/adapter-kit/manifest.ts` applique au BUILD (`MOTIF_ID` n'admet que
 *    des minuscules, des chiffres et des tirets), tandis que le nom d'outil,
 *    lui, admet les points (`MOTIF_NOM_OUTIL`). `zoho.mail.send` est donc
 *    l'outil `mail.send` de l'adaptateur `zoho`, et `zoho.mail.*` n'est PAS un
 *    scope : c'est un identifiant d'adaptateur à points, que rien ne peut
 *    enregistrer.
 *
 *    La règle est REVALIDÉE À L'ENREGISTREMENT — un manifeste vient d'un autre
 *    dépôt, souvent d'un autre langage, et `lireManifesteRecu` n'exigeait
 *    jusqu'ici qu'un `id` non vide. Voir le refus `id_innommable_par_un_scope`
 *    de `core/registry/enregistrer.ts`, qui INTERROGE `analyserScope()` plutôt
 *    que de retaper la règle.
 *
 * ⚠️ IL N'Y A PLUS QU'UNE SEULE DÉRIVATION : `scopeCouvre()` passe désormais
 *    par `scopeDomine()`, donc par `analyserScope()`. `scopesCouvrants()`
 *    subsiste pour l'écran de politique — elle ÉNUMÈRE, elle ne DÉCIDE plus —
 *    et une garde exhaustive de `scope.spec.ts` confronte les deux sur tout le
 *    produit scopes × références qu'elle sait fabriquer.
 */

// ═════════════════════════════════════════════════════════════════════════════
//  La référence d'un outil
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'outil appelé, tel que la chaîne d'appel le connaît : un adaptateur et un
 * nom LOCAL d'outil.
 *
 * Le § 12 donne `ops_tool.name` ET `ops_tool.adapterId` sans dire si `name`
 * porte déjà le préfixe de l'adaptateur. `referenceDepuisNom()` accepte donc
 * les deux conventions — mais il ne DEVINE pas où couper : il RECONNAÎT un
 * préfixe qui correspond exactement à l'`adapterId` reçu.
 *
 * ⚠️ `adapterId` NE CONTIENT AUCUN POINT (voir l'en-tête du fichier). Une
 *    référence qui en porterait un ne serait nommable par AUCUN scope : c'est
 *    `analyserReference()` qui le dit, et `niveauApplique()` qui replie sur le
 *    niveau le plus strict plutôt que de calculer sur un nom ambigu.
 */
export interface ReferenceOutil {
  /** `ops_tool.adapterId`. UN SEUL SEGMENT — jamais de point (`zoho`). */
  readonly adapterId: string;
  /** Nom LOCAL de l'outil, sans le préfixe de l'adaptateur. Les points y sont
   *  admis (`mail.send`), et c'est ce qui rend le découpage non ambigu. */
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
 * Le motif de refus d'un identifiant d'adaptateur, ÉCRIT UNE SEULE FOIS.
 *
 * Il DIT la règle plutôt que de constater un échec : un message qui se
 * contenterait de « n'est pas un identifiant d'adaptateur » laisserait
 * quelqu'un croire qu'il a mal orthographié son nom, alors que la cause
 * ordinaire est un identifiant à points — la lecture même que ce module vient
 * d'écarter. Le § 15 veut qu'une erreur dise quoi faire.
 */
function motifAdapterId(scope: string, adapterId: string, position: string): string {
  const cause = adapterId.includes(".")
    ? "il porte un point, et un identifiant d'adaptateur n'en porte aucun — " +
      "le PREMIER point d'un scope sépare l'adaptateur de l'outil"
    : "attendu des minuscules, des chiffres, un tiret ou un souligné";
  return `scope « ${scope} » — ${position} (« ${adapterId} ») n'est pas un identifiant d'adaptateur : ${cause}`;
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
    if (!SEGMENT.test(adapterId)) {
      return {
        valide: false,
        motif: motifAdapterId(scope, adapterId, "la partie avant « .* »"),
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

  // ═══ LE DÉCOUPAGE, ET LE SEUL ═══
  //
  // Sur le PREMIER point, jamais sur le dernier. C'est la conséquence directe
  // de la décision écrite en tête de fichier — `adapterId` ne contient aucun
  // point —, et c'est ce qui rend le découpage NON AMBIGU : `zoho.mail.send`
  // est l'outil `mail.send` de l'adaptateur `zoho`, et il n'a pas d'autre
  // lecture. Tant que le découpage se faisait sur le DERNIER point, le même nom
  // avait deux lectures défendables, et les deux fonctions de ce dossier en
  // choisissaient chacune une.
  const premierPoint = scope.indexOf(".");
  if (premierPoint === -1) {
    return {
      valide: false,
      motif: `scope « ${scope} » — attendu « adapterId.tool », soit au moins deux segments`,
    };
  }

  const adapterId = scope.slice(0, premierPoint);
  const tool = scope.slice(premierPoint + 1);

  if (!SEGMENT.test(adapterId)) {
    return {
      valide: false,
      motif: motifAdapterId(scope, adapterId, "la partie avant le PREMIER point"),
    };
  }
  if (!segmentsValides(tool, 1)) {
    return {
      valide: false,
      motif:
        `scope « ${scope} » — « ${tool} » n'est pas un nom d'outil : minuscules, chiffres, ` +
        "tiret, souligné, segments séparés par des points",
    };
  }

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
 * La référence est-elle NOMMABLE par un scope ?
 *
 * ⚠️ LA VÉRIFICATION EST UN ALLER-RETOUR, PAS UNE SECONDE ÉCRITURE DE LA RÈGLE.
 *    On fabrique le nom qualifié, on le REDONNE À `analyserScope()`, et on
 *    exige qu'il en ressorte identique. C'est ce qui rend cette fonction
 *    incapable de diverger de la grammaire : elle n'en connaît rien, elle
 *    l'interroge. Une règle retapée ici serait la TROISIÈME dérivation d'un
 *    fait qui n'en supporte déjà pas deux.
 *
 * Ce qu'elle attrape en pratique : un `adapterId` à points (`zoho.mail`), qui
 * produit un nom qualifié parfaitement valide — `zoho.mail.send` — mais qui se
 * relit comme l'outil `mail.send` de l'adaptateur `zoho`. La politique posée
 * sur un adaptateur s'appliquerait alors à un autre, EN SILENCE.
 */
export function analyserReference(reference: ReferenceOutil): AnalyseScope {
  const analyse = analyserScope(nomQualifie(reference));
  if (!analyse.valide) return analyse;

  if (
    analyse.genre !== "outil" ||
    analyse.adapterId !== reference.adapterId ||
    analyse.tool !== reference.tool
  ) {
    return {
      valide: false,
      motif:
        `référence d'outil « ${reference.adapterId} » / « ${reference.tool} » : son nom ` +
        `qualifié « ${nomQualifie(reference)} » se relit « ${analyse.adapterId ?? "*"} » / ` +
        `« ${analyse.tool ?? "*"} ». Un identifiant d'adaptateur ne porte aucun point.`,
    };
  }

  return analyse;
}

/**
 * Les TROIS scopes — et eux seuls — qui couvrent cette référence. Fabriqués
 * depuis la référence, jamais recopiés : ajouter un genre à la grammaire se
 * voit ici et nulle part ailleurs.
 *
 * ⚠️ ELLE ÉNUMÈRE, ELLE NE DÉCIDE PLUS. `scopeCouvre()` passait par elle
 *    jusqu'au lot 1b ; c'était la seconde dérivation, et elle contredisait
 *    `scopeDomine()`. Elle sert désormais à l'écran de politique — « quelles
 *    lignes pourrais-je poser sur cet outil ? » — et la garde exhaustive de
 *    `scope.spec.ts` vérifie qu'elle rend exactement les scopes que
 *    `scopeCouvre()` reconnaît.
 */
export function scopesCouvrants(reference: ReferenceOutil): readonly string[] {
  return ["*", `${reference.adapterId}.*`, nomQualifie(reference)];
}

/**
 * Ce scope couvre-t-il cet outil ?
 *
 * ═══ UNE SEULE DÉRIVATION ═══
 *
 * Couvrir un outil, c'est dominer son nom qualifié. Les deux questions n'en
 * font qu'une, et il n'y a donc qu'un seul code pour y répondre —
 * `analyserScope()`, via `scopeDomine()`. Tant que cette fonction répondait par
 * APPARTENANCE à `scopesCouvrants()`, elle donnait une réponse que l'analyse de
 * la grammaire démentait, sans qu'aucune anomalie ne soit levée.
 *
 * ⚠️ RÉFÉRENCE HORS GRAMMAIRE : `scopeDomine` rend `false`, donc « ne couvre
 *    pas ». Lu tel quel, c'est un RETRAIT de plancher, c'est-à-dire un
 *    élargissement — l'exact inverse du fail-closed. L'appelant doit donc
 *    traiter `analyserReference()` AVANT, et `niveauApplique()` le fait :
 *    référence illisible ⇒ niveau le plus strict, avec sa raison.
 */
export function scopeCouvre(scope: string, reference: ReferenceOutil): boolean {
  return scopeDomine(scope, nomQualifie(reference));
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

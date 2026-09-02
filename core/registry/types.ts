/**
 * `core/registry/` — le vocabulaire du registre (§ 09, § 12).
 *
 * Le registre est le point où un document venu d'AILLEURS — souvent d'un dépôt
 * public — entre dans le socle. Tout ce fichier est écrit depuis cette
 * position : le manifeste n'est pas de confiance, le verrou l'est.
 */

import type { AdapterMode, DataClass } from "../types.js";
import type { Idempotency } from "../adapter-kit/types.js";
import type { Verdict } from "../adapter-kit/verdict.js";
import type { ProfileName } from "../profiles/index.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Comment le socle s'authentifie auprès de l'adaptateur
// ═════════════════════════════════════════════════════════════════════════════

/**
 * `ops_adapter.authMode`. Le schéma Prisma le laisse en `String` avec le
 * commentaire « le vocabulaire est celui de core/registry » : le voici.
 *
 * · `secret-partage` — § 08 : la route `/api/mcp` de l'adaptateur exige un
 *   secret partagé porté dans un en-tête, logé dans `ops_secret` côté socle.
 *   En son absence dans la configuration, la route rend **503 et ne sert
 *   rien** ; comparaison à temps constant ; limitation de débit par IP.
 * · `en-processus` — l'adaptateur hébergé vit dans le processus du socle : il
 *   n'y a ni route ni en-tête.
 *
 * ⚠️ Distinction à ne pas perdre : ce secret-ci authentifie LE SOCLE AUPRÈS DE
 *    L'ADAPTATEUR. Il n'a rien à voir avec les identifiants du produit de
 *    l'adaptateur, que le socle n'émet JAMAIS hors de son processus (§ 09).
 *    Confondre les deux est précisément le défaut que la v5 portait.
 */
export const AUTH_MODES = ["secret-partage", "en-processus"] as const;

export type AuthMode = (typeof AUTH_MODES)[number];

// ═════════════════════════════════════════════════════════════════════════════
//  `adapters.lock.json` — l'épinglage
// ═════════════════════════════════════════════════════════════════════════════

/** Version du FORMAT du verrou. */
export const VERSION_VERROU = 1;

/**
 * Une entrée du verrou : ce que LE SOCLE décide d'un adaptateur.
 *
 * Le verrou est versionné DANS LE SOCLE. C'est ce qui rend légitime d'y loger
 * `trustTier` et `maxDataClass` : « fixés côté socle à l'enregistrement,
 * jamais lus dans le manifeste ». Le manifeste vient du dépôt de l'adaptateur ;
 * le verrou vient d'ici. La frontière entre les deux documents EST la frontière
 * de confiance, et elle est visible en revue de code.
 */
export interface EntreeVerrou {
  readonly id: string;
  /** Version d'adaptateur attendue. Doit coïncider avec le manifeste. */
  readonly version: string;
  /** Mode attendu. Doit coïncider avec le manifeste. */
  readonly mode: AdapterMode;
  /** L'empreinte ÉPINGLÉE du manifeste : `sha256:` + 64 hexadécimaux. */
  readonly manifestSha: string;
  /** Niveau de confiance, ordonné, ENTIER. Fixé ici, jamais par l'adaptateur. */
  readonly trustTier: number;
  /** Plafond de classe de données de cet adaptateur. Fixé ici. */
  readonly maxDataClass: DataClass;
  /** `null` en mode hébergé : l'adaptateur vit dans le processus du socle. */
  readonly endpoint: string | null;
  readonly authMode: AuthMode;
  /** Renvoi vers `ops_secret.name`. JAMAIS le secret lui-même. */
  readonly secretRef: string | null;
}

/** Le fichier `adapters.lock.json`, versionné dans le socle. */
export interface VerrouAdaptateurs {
  readonly lockVersion: number;
  readonly adapters: readonly EntreeVerrou[];
}

/**
 * TÉMOIN COMPLET d'une entrée de verrou.
 *
 * Il ne sert à rien d'autre qu'à DÉRIVER la liste des clés réservées au socle
 * (`clesReserveesAuSocle()`), par différence avec les clés d'un manifeste
 * témoin. Aucune liste de noms interdits n'est écrite dans ce module.
 *
 * Le typage le tient à jour tout seul : ajouter un champ à `EntreeVerrou` sans
 * l'ajouter ici ne compile pas, et le champ nouveau devient automatiquement
 * réservé au socle.
 */
export const ENTREE_VERROU_TEMOIN: EntreeVerrou = {
  id: "temoin",
  version: "0.0.0",
  mode: "hébergé",
  manifestSha: `sha256:${"0".repeat(64)}`,
  trustTier: 0,
  maxDataClass: "none",
  endpoint: null,
  authMode: "en-processus",
  secretRef: null,
};

// ═════════════════════════════════════════════════════════════════════════════
//  Les motifs de refus
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Les motifs de refus D'ENREGISTREMENT.
 *
 * ⚠️ Ils sont DISTINCTS des codes d'erreur du § 15 (`ERROR_CODES`) : ceux-là
 *    répondent à un APPEL d'outil et sont rendus au modèle ; ceux-ci répondent
 *    à l'admission d'un adaptateur et sont rendus à l'exploitant, en console.
 *    Les mélanger ferait apparaître un refus d'admission comme un refus
 *    d'appel dans la métrique « refus de politique » du § 24.
 */
export const MOTIFS_REFUS = [
  /** Le document reçu n'a pas la forme d'un manifeste. */
  "manifeste_malforme",
  /** Aucune entrée de verrou ne porte cet id : rien n'a été épinglé. */
  "adaptateur_absent_du_verrou",
  /** L'empreinte du manifeste reçu ne correspond pas à celle épinglée. */
  "empreinte_divergente",
  /** Le manifeste porte un champ que le socle se réserve (`trustTier`, …). */
  "confiance_auto_decernee",
  /** `mode === "fédéré" && secrets.length > 0`. */
  "secrets_en_mode_federe",
  /** Un outil déclare un `dataClass` au-dessus du plafond de son adaptateur. */
  "dataclass_au_dessus_du_plafond",
  /** Un profil hors de l'énumération fermée de `core/profiles/`. */
  "profil_inconnu",
  /** Le préfixe d'un outil est saisi au lieu d'être dérivé de l'id. */
  "prefixe_non_derive",
  /** Deux outils portent le même nom complet. */
  "outil_en_double",
  /** Version ou mode du manifeste différents de ceux épinglés. */
  "epinglage_incoherent",
  /** Endpoint, secret partagé ou `authMode` incohérents avec le mode. */
  "raccordement_incoherent",
  /** `trustTier` hors de forme (non entier, négatif). */
  "confiance_invalide",
  /**
   * Le `bytes` annoncé par un outil ne correspond pas à sa mesure.
   *
   * `bytes` est l'UNITÉ du budget du § 14 et la colonne `ops_tool.bytes` du
   * § 12. Il est ANNONCÉ par un document venu d'ailleurs, et il est
   * intégralement DÉRIVABLE de ce même document : le croire sur parole
   * laisserait un adaptateur déclarer `bytes: 0` sur une définition obèse, et
   * tout le décompte du budget en dépendrait sans qu'aucune garde ne bronche.
   */
  "bytes_incoherent",
  /**
   * Un outil porte un nom que le SOCLE se réserve pour ses propres lignes de
   * journal — aujourd'hui le nom de la ligne de clôture de purge (§ 31).
   *
   * `core/audit/cloture.ts` reconnaît une clôture au SEUL nom d'outil. Une
   * ligne d'appel ORDINAIRE portant ce nom rendait donc la vérification du
   * journal ROUGE en permanence (`clôture-illisible`) : fail-closed, donc pas
   * un trou de sécurité, mais un DÉNI DE SERVICE sur la vérification,
   * déclenchable par n'importe quel adaptateur. Le commentaire de `cloture.ts`
   * affirmait que le registre refusait ce nom ; c'était faux, aucun code ne le
   * faisait. C'est fait ici, en IMPORTANT la constante plutôt qu'en la
   * retapant.
   */
  "nom_reserve_au_socle",
  /**
   * Le schéma d'entrée d'un outil n'exprime pas sa FERMETURE (ADR 0003).
   *
   * Le § 09 pose que « le schéma d'entrée est `.strict()`, pour qu'un champ
   * d'autorisation glissé dans la charge utile soit un refus VISIBLE et non un
   * silence ». Jusqu'au lot 1b, cette règle n'était tenue qu'au BUILD, donc
   * seulement pour un adaptateur TypeScript passant par le kit. Le registre est
   * la SEULE barrière statique pour un manifeste produit ailleurs — le CRM en
   * PHP, dépôt public à jamais (§ 29).
   *
   * ⚠️ DEUX DIALECTES SONT ACCEPTÉS : `additionalProperties: false` ET
   *    `unevaluatedProperties: false`. Voir `core/adapter-kit/fermeture.ts`.
   */
  "schema_entree_ouvert",
  /**
   * Un outil déclare, dans son schéma d'entrée, une propriété portant le nom
   * d'une clé d'autorisation — contrôle 7 du § 09.
   *
   * « Un handler qui lit une habilitation dans `input` EST UN DÉFAUT » : la
   * décision de droit atteint la couche service par `ctx`, et par lui seul. La
   * liste des noms est DÉRIVÉE de `ToolContext` et `Habilitations`, jamais
   * écrite à la main.
   *
   * Témoin mesuré au lot 1 : un manifeste déclarant `peutVoirAppels` dans son
   * `inputSchema` était admis sans un mot.
   */
  "champ_d_autorisation_au_schema",
  /**
   * Le manifeste a été produit contre une énumération de profils qui n'est plus
   * celle du socle (ADR 0004).
   *
   * Un adaptateur fédéré produit son manifeste DANS UN AUTRE DÉPÔT, contre sa
   * propre copie de `core/profiles`. Si les deux divergent — un profil ajouté
   * d'un côté seulement — le manifeste reste syntaxiquement valide et le nom du
   * profil reste connu : la divergence ne se voit NULLE PART. C'est
   * `empreinteProfils()` qui la rend visible d'un seul octet, et c'est ici
   * qu'elle est confrontée.
   */
  "enumeration_profils_divergente",
  /**
   * L'`id` de l'adaptateur n'est NOMMABLE PAR AUCUN SCOPE de la grammaire du
   * § 12 — en pratique, il porte un point.
   *
   * ═══ CE QUE CE REFUS REFERME ═══
   *
   * La grammaire de `ops_policy.scope` est `*` | `adapterId.*` |
   * `adapterId.tool` : le PREMIER point sépare l'adaptateur de l'outil, donc un
   * identifiant d'adaptateur n'en porte aucun. `core/adapter-kit/manifest.ts`
   * l'applique déjà — mais AU BUILD, donc seulement à un adaptateur écrit en
   * TypeScript avec le kit. `lireManifesteRecu()` n'exigeait, lui, qu'un `id`
   * non vide : un manifeste produit ailleurs — le CRM en PHP, dépôt public à
   * jamais (§ 29) — pouvait s'enregistrer sous `zoho.mail` sans un mot.
   *
   * Ses outils devenaient alors ceux d'un AUTRE adaptateur : `zoho.mail` +
   * `send` se relit `zoho` / `mail.send`, et une ligne de politique posée sur
   * `zoho.*` — l'agenda, la facturation, le reste — s'appliquait au courrier.
   * Le lot 1 avait mesuré la contradiction dans `core/policy` ; c'est ici
   * qu'elle ne peut plus ENTRER.
   *
   * ⚠️ Le contrôle INTERROGE `analyserScope()` au lieu de retaper la règle.
   *    Une seconde écriture de la grammaire serait exactement le défaut que ce
   *    refus existe pour fermer.
   */
  "id_innommable_par_un_scope",
  /**
   * Un outil déclare un `governanceFields` qui ne désigne AUCUNE propriété de
   * son schéma d'entrée — ADR 0016, garde G3.
   *
   * ═══ POURQUOI CELUI-CI REFUSE, LÀ OÙ UN `idFields` SANS EFFET EST SEULEMENT
   *     ANNONCÉ (ADR 0015, garde G2) ═══
   *
   * La différence n'est pas de degré, elle est de nature :
   *
   *  · un `idFields` sans effet est une déclaration que le socle **IGNORE**.
   *    Depuis l'ADR 0015, rien à l'entrée n'en dépend ; elle est inoffensive, et
   *    la refuser rejetterait de vrais outils — un `messageId: z.string()` n'a
   *    rien d'illégitime ;
   *  · un `governanceFields` sans effet est une déclaration que son auteur
   *    **CROIT APPLIQUÉE**. Elle donne l'apparence d'un périmètre couvert sur la
   *    branche 1 de l'étape 11 — la seule qu'aucune confirmation ne rattrape
   *    (§ 20). Une faute de frappe y coûte la surveillance entière, en silence.
   *
   * C'est la faute que ce lot referme partout : une garde verte parce qu'elle ne
   * regarde rien.
   */
  "champ_de_gouvernance_introuvable",
  /**
   * Un outil déclare DEUX FOIS le même champ de gouvernance.
   *
   * ⚠️ IL A SON PROPRE MOTIF, ET CE N'EST PAS UNE COQUETTERIE. Le ranger sous
   *    `champ_de_gouvernance_introuvable` ferait dire au refus le CONTRAIRE de
   *    la cause : un nom répété est parfaitement trouvable. Un motif qui ment
   *    sur la cause fait chercher au mauvais endroit, et c'est la deuxième règle
   *    du § 15 — un refus doit dire quoi corriger.
   *
   * Le doublon n'est pas dangereux en lui-même : l'union dédoublonne, et la
   * surveillance est la même. Il est refusé parce qu'il signale une liste
   * RECOPIÉE À LA MAIN — donc relue par personne — sur la déclaration qui
   * commande la seule branche de l'étape 11 qu'aucune confirmation ne rattrape.
   */
  "champs_de_gouvernance_en_double",
  /**
   * Un outil déclare un champ de `compaction.tier2` qui est OBLIGATOIRE à son
   * schéma de sortie — § 13.3, ADR 0036.
   *
   * ═══ CE QUE CE REFUS REFERME ═══
   *
   * Au deuxième palier de la cascade du § 13.3, le socle RETIRE les champs de
   * rang 2 (`retirerRang2()`, `core/chaine/etape-14-execution.ts`). Si le
   * schéma que l'outil PUBLIE les exige, la charge compactée ne valide plus ce
   * schéma — et c'est le schéma publié que le client a lu.
   *
   * La règle n'était tenue qu'AU BUILD (`analyserDefinition()`, contrôle
   * C13.3), donc seulement pour un adaptateur TypeScript passant par le kit. Or
   * c'est le mode FÉDÉRÉ que la règle vise, et un manifeste fédéré est produit
   * dans un AUTRE dépôt — le CRM en PHP, dépôt public à jamais (§ 29). Le mode
   * visé était le seul pour lequel elle ne s'appliquait jamais.
   *
   * ⚠️ IL REFUSE, LÀ OÙ UN `idFields` SANS EFFET EST SEULEMENT ANNONCÉ
   *    (ADR 0015). On n'interdit pas ce qu'on IGNORE — mais ici la règle est
   *    TENUE au build, et admettre ce que le build refuse est exactement « le
   *    build accepte ce que l'admission refuse, ou l'inverse, ce qui est pire »
   *    (ADR 0003).
   *
   * ⚠️ LA MESURE EST FAITE PAR `requisDuSchema()`, LA MÊME FONCTION QUE LE
   *    BUILD. La réécrire ici ferait deux définitions de « quels champs ce
   *    schéma exige-t-il », et c'est la seconde qui ne suit jamais.
   *
   * ⚠️ RIEN NE RATTRAPE EN AVAL : `outputSchema` n'est validé à aucun moment du
   *    runtime, et l'étape 14 l'écrit elle-même — « ici on retire, on ne
   *    revalide pas ».
   */
  "rang2_obligatoire_au_schema",
] as const;

export type MotifRefus = (typeof MOTIFS_REFUS)[number];

/** Un refus, avec de quoi le comprendre sans ouvrir le code. */
export interface Refus {
  readonly motif: MotifRefus;
  readonly detail: string;
}

// ═════════════════════════════════════════════════════════════════════════════
//  CE QUI EST DIT SANS ÊTRE REFUSÉ — ADR 0015, garde G2
// ═════════════════════════════════════════════════════════════════════════════

/**
 * UNE GARDE QUI ANNONCE SANS REFUSER.
 *
 * ═══ POURQUOI UN CANAL À PART, PLUTÔT QU'UN REFUS DE PLUS OU RIEN DU TOUT ═══
 *
 * L'ADR 0015 a retiré à `idFields` tout effet sur la surveillance du § 20. Un
 * champ sans lecteur est un champ qui dérive : plus personne ne le relit, et sa
 * fausseté ne coûte plus rien à qui l'écrit — jusqu'au jour où le § 31 s'en sert
 * pour purger `recordIds` sur une liste qui ne correspond à rien.
 *
 * Le registre lui redonne donc un lecteur, **sans lui rendre un pouvoir**. Il
 * DIT ce qui est sans effet, avec le remède ; il ne refuse pas. « On n'interdit
 * pas ce qu'on ignore », et un refus rejetterait de vrais outils.
 *
 * ⚠️ LE VERDICT PORTE SON PLANCHER, ET IL VAUT 1. Un manifeste dont AUCUN
 *    `idFields` n'a été confronté rend cette garde muette : `mesures` vaut zéro,
 *    et c'est `anomaliesCompletes()` — jamais la couleur — qui le dit. Une garde
 *    qui n'a rien regardé est verte pour la pire des raisons.
 */
export interface GardeAnnoncee {
  /** Le nom sous lequel la garde s'annonce, tel qu'il apparaît en console. */
  readonly nom: string;
  /** Le compte mesuré, son plancher, et ce que la garde a trouvé. */
  readonly verdict: Verdict;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que l'enregistrement produit
// ═════════════════════════════════════════════════════════════════════════════

/** Une ligne `ops_adapter` prête à écrire (§ 12). */
export interface LigneOpsAdapter {
  readonly id: string;
  readonly version: string;
  readonly mode: AdapterMode;
  readonly authMode: AuthMode;
  readonly secretRef: string | null;
  readonly endpoint: string | null;
  readonly manifestSha: string;
  readonly trustTier: number;
  readonly maxDataClass: DataClass;
}

/** Une ligne `ops_tool` prête à écrire (§ 12). */
export interface LigneOpsTool {
  /** Nom LOCAL, tel qu'`ops_tool.name` le stocke. */
  readonly name: string;
  /** Nom COMPLET servi par `tools/list`, dérivé du préfixe. */
  readonly nomComplet: string;
  readonly adapterId: string;
  readonly version: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  /**
   * LE POIDS DE LA PROJECTION SERVIE, en octets UTF-8 — pas le poids de
   * l'entrée du manifeste.
   *
   * ⚠️ CE N'EST PAS LA MÊME GRANDEUR QUE `Manifeste.tools[].bytes`, et les
   *    confondre a coûté ~38 % d'écart. Le manifeste annonce les octets de son
   *    entrée COMPLÈTE — effect, dataClass, idempotency, pagination, maxBytes,
   *    compaction, idFields et le nom LOCAL compris — et le registre les
   *    recalcule pour vérifier qu'il n'a pas été menti (`bytes_incoherent`).
   *    Le § 14, lui, compte CE QUI PART DANS LE CONTEXTE DU MODÈLE : la
   *    projection servie par `tools/list`. Une colonne, un seul nombre — celui
   *    du budget, dérivé par `core/profiles.octetsDeLaDefinition`.
   */
  readonly bytes: number;
  readonly effect: string;
  readonly dataClass: DataClass;
  /** § 09 — recopié du manifeste à l'admission, jamais deviné. */
  readonly idempotency: Idempotency;
  /** `null` à l'admission : la console règle, le § 26 fournit le départ. */
  readonly limit: number | null;
  readonly warnAt: number | null;
  /**
   * Resserré sur l'ÉNUMÉRATION FERMÉE, pas sur `string`. Le registre validait
   * déjà les valeurs au runtime, mais le TYPE s'ouvrait en chemin : la
   * conversion vers `core/profiles.DefinitionOutil` exigeait alors une
   * assertion que rien ne gardait, et la garde fermée du § 14 s'arrêtait à la
   * frontière du registre.
   */
  readonly profiles: readonly ProfileName[];
  /**
   * `ops_tool.governanceFields` — les champs d'entrée que l'outil DÉCLARE de
   * gouvernance (ADR 0016).
   *
   * ⚠️ IL EST RECOPIÉ DU MANIFESTE, ET C'EST LÉGITIME — au contraire de
   *    `trustTier` ou de `bytes`. Une déclaration qui ne peut que RESSERRER se
   *    croit sur parole : un dépôt tiers hostile n'a aucun intérêt à
   *    s'auto-restreindre, et s'il le fait il se punit lui-même. C'est l'exacte
   *    asymétrie de l'ADR 0015 / ADR 0016, et la seule chose à en retenir.
   *
   * ⚠️ CE QUE LE SOCLE EN FAIT N'EST PAS DE LE REMPLACER PAR LE FILET, MAIS DE
   *    L'UNIR À LUI. `FAMILLES_GOUVERNANCE` reste, et la reconnaissance par le
   *    nom continue d'être annoncée : voir `cumulerChampsDeGouvernance()` de
   *    `core/adapter-kit/champs-declares.ts`.
   *
   * 🔧 La colonne correspondante de `prisma/schema.prisma` n'est pas dans le
   *    périmètre qui écrit cette ligne — voir l'ADR 0016, point 2.
   */
  readonly governanceFields: readonly string[];
  /** § 14, correction 3 — bascule de console, SANS redéploiement. */
  readonly enabled: boolean;
  /**
   * § 13.4 — « une version dépréciée SORT de `tools/list` dès la publication de
   * v2 et reste appelable six mois. » DÉRIVÉ de `ops_tool.retiredAt`, jamais
   * porté à la main.
   */
  readonly retireDeLaListe: boolean;
}

/** Le résultat d'un enregistrement. Jamais un booléen : un refus dit pourquoi. */
export type ResultatEnregistrement =
  | {
      readonly admis: false;
      readonly refus: readonly Refus[];
      /** Combien d'outils ont été inspectés avant le refus. */
      readonly outilsInspectes: number;
      /**
       * Ce que l'admission a MESURÉ sans le refuser (ADR 0015, garde G2).
       *
       * Il est rendu sur LES DEUX branches, y compris celle du refus : un
       * exploitant qui corrige un refus doit voir du même coup ce qui, dans son
       * manifeste, est écrit sans effet — sinon il le corrigera au tour suivant,
       * et chaque tour coûte un cycle de build dans un autre dépôt.
       */
      readonly annonces: readonly GardeAnnoncee[];
    }
  | {
      readonly admis: true;
      readonly adaptateur: LigneOpsAdapter;
      readonly outils: readonly LigneOpsTool[];
      readonly outilsInspectes: number;
      /** Voir la branche du refus : le canal est le même, et il est rendu toujours. */
      readonly annonces: readonly GardeAnnoncee[];
    };

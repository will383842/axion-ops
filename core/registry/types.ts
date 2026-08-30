/**
 * `core/registry/` — le vocabulaire du registre (§ 09, § 12).
 *
 * Le registre est le point où un document venu d'AILLEURS — souvent d'un dépôt
 * public — entre dans le socle. Tout ce fichier est écrit depuis cette
 * position : le manifeste n'est pas de confiance, le verrou l'est.
 */

import type { AdapterMode, DataClass } from "../types.js";
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
] as const;

export type MotifRefus = (typeof MOTIFS_REFUS)[number];

/** Un refus, avec de quoi le comprendre sans ouvrir le code. */
export interface Refus {
  readonly motif: MotifRefus;
  readonly detail: string;
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
  /**
   * Resserré sur l'ÉNUMÉRATION FERMÉE, pas sur `string`. Le registre validait
   * déjà les valeurs au runtime, mais le TYPE s'ouvrait en chemin : la
   * conversion vers `core/profiles.DefinitionOutil` exigeait alors une
   * assertion que rien ne gardait, et la garde fermée du § 14 s'arrêtait à la
   * frontière du registre.
   */
  readonly profiles: readonly ProfileName[];
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
    }
  | {
      readonly admis: true;
      readonly adaptateur: LigneOpsAdapter;
      readonly outils: readonly LigneOpsTool[];
      readonly outilsInspectes: number;
    };

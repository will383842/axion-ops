/**
 * `core/registry/depot.ts` — **OÙ L'ADMISSION SE POSE.** Le port, et deux prises.
 *
 * ═══ CE QUE CE MODULE FERME ═══
 *
 * `enregistrerAdaptateur()` rend des `LigneOpsAdapter` / `LigneOpsTool[]` et
 * **n'écrit rien** — c'est écrit en toutes lettres dans son en-tête, et c'est le
 * bon découpage : « un enregistrement qui écrirait au fil de ses contrôles
 * laisserait un registre à moitié rempli au premier refus ». Mais rien, ensuite,
 * ne prenait ces lignes. Le socle admettait `axionia` à chaque démarrage, comptait
 * `adaptateursAdmis: 1`, et **jetait le résultat** : aucune ligne `ops_adapter`,
 * aucune ligne `ops_tool`, donc aucun catalogue, donc aucun outil servi.
 *
 * Ce fichier est le tronçon manquant. Il ne décide RIEN de l'admission : il pose
 * ce qu'elle a produit, et il annonce des NOMBRES.
 *
 * ═══ LE PATRON EST CELUI DE `core/vault/depot.ts`, ET LES MOTIFS SONT LES MÊMES ═══
 *
 *  1. Le registre ne connaît pas Prisma. Il connaît {@link DepotDuRegistre} et
 *     rien d'autre — c'est ce qui permet d'éprouver l'admission complète sur un
 *     double en mémoire, y compris **une écriture qui échoue au milieu**.
 *  2. `@prisma/client` n'est pas généré à l'heure où ce module s'écrit : la
 *     prise Prisma est donc écrite contre une interface **STRUCTURELLE** du
 *     délégué, que le vrai `PrismaClient` satisfait sans le savoir.
 *  3. `depot.spec.ts` DÉRIVE de `prisma/schema.prisma` la liste des colonnes et
 *     confronte celles que ce fichier touche. Une interface écrite à la main
 *     dérive en silence ; celle-ci ne peut pas.
 *
 * ═══ LA DÉCISION QUI PORTE TOUT LE RESTE (ADR 0050) ═══
 *
 * ⚠️ **UNE RÉ-ADMISSION NE RÉÉCRIT JAMAIS CE QUE LA CONSOLE A RÉGLÉ.**
 *    `enabled`, `retiredAt`, `sunsetAt`, `limit` et `warnAt` sont ABSENTS de la
 *    branche `update` des deux prises. Le § 14, correction 3, veut qu'`enabled`
 *    bascule **en console, sans redéploiement** : un redémarrage qui remettrait
 *    `enabled: false` désactiverait, à chaque déploiement, tout ce qu'un humain
 *    a activé — et le ferait en silence, sur un chemin que personne ne relit.
 *    C'est mot pour mot le motif qui exclut `bootstrapCount` de l'upsert du
 *    coffre : **un réglage qu'un redémarrage peut faire reculer ne règle rien.**
 *
 * ⚠️ **CE MODULE N'ÉCRIT NI `lastSeenAt` NI `healthy`.** Ils appartiennent à la
 *    sonde de santé, pas à l'admission : les poser ici ferait dire « joignable »
 *    à un adaptateur que personne n'a joint. Ils ne sont donc pas dans
 *    l'exemplaire, et la garde de schéma ne les compte pas parmi les colonnes
 *    touchées.
 */

import type { AdapterMode, DataClass } from "../types.js";
import type { Idempotency } from "../adapter-kit/types.js";
import type { ProfileName } from "../profiles/index.js";
import { AUTH_MODES, type AuthMode, type LigneOpsAdapter, type LigneOpsTool } from "./types.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Ce qu'est une ligne — les NOMS SONT CEUX DES COLONNES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Une ligne `ops_adapter`, réduite à ce que l'ADMISSION écrit.
 *
 * ⚠️ Les NOMS DE CHAMPS SONT CEUX DES COLONNES, et c'est de `Object.keys()` d'un
 *    exemplaire que la garde de schéma tire sa liste. Les franciser romprait
 *    cette dérivation et obligerait à une table de correspondance écrite à la
 *    main — c'est-à-dire à une seconde vérité.
 *
 * La forme est exactement celle de {@link LigneOpsAdapter}, que
 * `enregistrerAdaptateur()` produit : **aucune conversion entre l'admission et
 * l'écriture**, donc aucun endroit où un champ puisse se perdre en chemin.
 */
export type EnregistrementAdaptateur = LigneOpsAdapter;

/**
 * Une ligne `ops_tool`, réduite à ce que l'ADMISSION écrit.
 *
 * ═══ CE QU'ELLE NE PORTE PAS, ET POURQUOI ═══
 *
 * · `nomComplet` — **ce n'est pas une colonne.** `ops_tool.name` stocke le nom
 *   LOCAL ; le nom complet se DÉRIVE du préfixe (`prefixeDe()`), et une colonne
 *   de plus en ferait une seconde source qui finirait par diverger.
 * · `enabled`, `retiredAt`, `sunsetAt`, `limit`, `warnAt` — **la console les
 *   possède** (ADR 0050). L'insertion les laisse à leurs défauts de schéma ; la
 *   mise à jour n'y touche pas.
 * · `id`, `createdAt`, `updatedAt` — la base les fabrique.
 */
export interface EnregistrementOutil {
  /** Nom LOCAL. Le préfixe est DÉRIVÉ, jamais stocké deux fois. */
  readonly name: string;
  readonly adapterId: string;
  readonly version: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  /** Les octets de la PROJECTION SERVIE — l'unité du budget du § 14. */
  readonly bytes: number;
  readonly effect: string;
  readonly dataClass: DataClass;
  readonly idempotency: Idempotency;
  readonly profiles: readonly ProfileName[];
  readonly governanceFields: readonly string[];
}

/**
 * Un exemplaire d'`ops_adapter`, dont les gardes dérivent les colonnes touchées.
 * Ce n'est pas une donnée de test : c'est la seule forme sous laquelle une
 * interface TypeScript devient inspectable à l'exécution.
 */
export const EXEMPLAIRE_D_ADAPTATEUR: EnregistrementAdaptateur = {
  id: "",
  version: "",
  mode: "hébergé",
  authMode: "en-processus",
  secretRef: null,
  endpoint: null,
  manifestSha: "",
  trustTier: 0,
  maxDataClass: "none",
};

/** Un exemplaire d'`ops_tool`. Même rôle, même raison. */
export const EXEMPLAIRE_D_OUTIL: EnregistrementOutil = {
  name: "",
  adapterId: "",
  version: "",
  description: "",
  inputSchema: {},
  outputSchema: {},
  bytes: 0,
  effect: "read",
  dataClass: "none",
  idempotency: "n/a",
  profiles: [],
  governanceFields: [],
};

/** Les colonnes d'`ops_adapter` que ce module touche. DÉRIVÉ de l'exemplaire. */
export function colonnesDAdaptateurTouchees(): readonly string[] {
  return Object.keys(EXEMPLAIRE_D_ADAPTATEUR);
}

/** Les colonnes d'`ops_tool` que ce module touche. DÉRIVÉ de l'exemplaire. */
export function colonnesDOutilTouchees(): readonly string[] {
  return Object.keys(EXEMPLAIRE_D_OUTIL);
}

/**
 * **LES COLONNES QUE L'ADMISSION NE RÉÉCRIT JAMAIS — ADR 0050.**
 *
 * Elles existent au schéma, elles sont écrites par la console, et la branche
 * `update` des deux prises doit les ignorer. La liste est ici, à un seul
 * endroit, et `depot.spec.ts` la confronte AU CORPS des deux prises : une prise
 * qui en réécrirait une la ferait rougir.
 *
 * ⚠️ **LE MOTIF EST UNE MESURE, PAS UNE PRÉCAUTION.** Le socle admet ses
 *    adaptateurs À CHAQUE DÉMARRAGE (étage 5). Réécrire `enabled` dans l'update
 *    remettrait donc `false` à chaque redéploiement — et le § 14 fait
 *    d'`enabled` la bascule d'urgence « sans redéploiement ». La garde
 *    correspondante ne mesure pas une intention : elle admet deux fois et relit
 *    la valeur.
 */
export const COLONNES_POSSEDEES_PAR_LA_CONSOLE = [
  "enabled",
  "retiredAt",
  "sunsetAt",
  "limit",
  "warnAt",
] as const;

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que l'écriture rend — des NOMBRES, jamais une couleur
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'une admission POSÉE a réellement fait.
 *
 * ⚠️ **`outilsOrphelins` EST LE CHAMP QUI COMPTE, ET IL NE DÉCLENCHE RIEN.** Ce
 *    sont les lignes `ops_tool` de cet adaptateur que le manifeste admis ne
 *    déclare plus. Le dépôt ne les supprime pas et ne les désactive pas :
 *
 *    · les SUPPRIMER effacerait les réglages de console d'un outil que le
 *      § 13.4 veut « retiré de la liste, encore appelable six mois » ;
 *    · les DÉSACTIVER serait une mise à jour silencieuse, exactement ce que le
 *      § 20 interdit dans l'autre sens.
 *
 *    Il les NOMME. Un outil disparu du manifeste change l'empreinte, donc exige
 *    une ré-épingle relue par un humain : c'est à ce moment-là que la décision
 *    se prend, avec la liste sous les yeux.
 */
export interface ResultatEcritureDuRegistre {
  readonly adapterId: string;
  /** `true` si la ligne `ops_adapter` existait déjà (ré-admission). */
  readonly adaptateurDejaPresent: boolean;
  /** Combien de lignes `ops_tool` ont été insérées. */
  readonly outilsInseres: number;
  /** Combien ont été mises à jour — donc combien ont GARDÉ leurs réglages. */
  readonly outilsMisAJour: number;
  /** Les `name@version` présents en base et absents du manifeste admis. */
  readonly outilsOrphelins: readonly string[];
}

/** Levée quand une ligne relue en base ne se laisse pas retyper. */
export class ErreurDeDepotDuRegistre extends Error {
  public readonly detail: string;

  public constructor(message: string) {
    super(message);
    this.name = "ErreurDeDepotDuRegistre";
    this.detail = message;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Le port
// ═════════════════════════════════════════════════════════════════════════════

export interface DepotDuRegistre {
  /**
   * Pose une admission : la ligne `ops_adapter` et ses lignes `ops_tool`.
   *
   * ⚠️ **L'ADAPTATEUR EST ÉCRIT AVANT SES OUTILS**, et ce n'est pas un détail de
   *    style : `ops_tool.adapterId` porte une clé étrangère `onDelete: Cascade`.
   *    L'ordre inverse échouerait sur la première ligne d'outil, et le message
   *    parlerait d'une contrainte plutôt que de l'adaptateur manquant.
   */
  ecrireAdmission(
    adaptateur: EnregistrementAdaptateur,
    outils: readonly EnregistrementOutil[],
  ): Promise<ResultatEcritureDuRegistre>;

  /** La ligne `ops_adapter` d'un id, ou `null`. Ne lève pas : `null` est un cas. */
  lireAdaptateur(id: string): Promise<EnregistrementAdaptateur | null>;

  /** Toutes les lignes `ops_tool`, ordre stable. C'est de là que naît le catalogue. */
  listerOutils(): Promise<readonly LigneOutilPersistee[]>;
}

/**
 * Une ligne `ops_tool` RELUE — l'admission plus ce que la console possède.
 *
 * ⚠️ **LES CINQ COLONNES DE CONSOLE SONT LUES ICI, ET SEULEMENT LUES.** C'est
 *    l'asymétrie de l'ADR 0050 rendue visible par le type : l'admission écrit
 *    {@link EnregistrementOutil}, le catalogue relit celle-ci.
 */
export interface LigneOutilPersistee extends EnregistrementOutil {
  readonly enabled: boolean;
  readonly retiredAt: Date | null;
  readonly sunsetAt: Date | null;
  readonly limit: number | null;
  readonly warnAt: number | null;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Prise 1 — en mémoire
// ═════════════════════════════════════════════════════════════════════════════

/** La clé de la table en mémoire, calquée sur `@@unique([name, version])`. */
function cleDOutil(name: string, version: string): string {
  return `${name} ${version}`;
}

/**
 * Dépôt en mémoire — les tests, et le socle qui tourne AVANT qu'une base
 * n'existe (§ 23, l'étage volatil).
 *
 * ⚠️ **IL EST LE JUMEAU DE LA PRISE PRISMA, PAS UNE COMMODITÉ.** Toute règle qui
 *    n'est tenue que d'un côté rend une garde verte sur un dépôt qui ne
 *    représente plus la production. Les réglages de console SURVIVENT ici à une
 *    ré-admission, exactement comme dans l'`update` de {@link DepotDuRegistrePrisma}.
 *
 * `programmerUnePanneDEcriture` fait échouer la n-ième écriture À VENIR (1 = la
 * prochaine). Le rang est RELATIF : un rang absolu obligerait chaque test à
 * compter les écritures que son montage a déjà faites, et un montage enrichi
 * rendrait la panne impossible à déclencher **en silence**.
 */
export class DepotDuRegistreEnMemoire implements DepotDuRegistre {
  private readonly adaptateurs = new Map<string, EnregistrementAdaptateur>();
  private readonly outils = new Map<string, LigneOutilPersistee>();
  private ecrituresVues = 0;
  private echouerALEcriture: number | null = null;

  public programmerUnePanneDEcriture(rang: number): void {
    this.echouerALEcriture = this.ecrituresVues + rang;
  }

  /** Nombre d'écritures réellement passées. Les gardes l'annoncent. */
  public get ecritures(): number {
    return this.ecrituresVues;
  }

  /**
   * Pose une valeur de console sur une ligne existante — le geste que la console
   * fera. Il n'existe QUE sur la prise en mémoire : côté Prisma, c'est la
   * console qui écrit, pas le registre.
   *
   * Lève si la ligne n'existe pas : un réglage posé sur rien se lirait comme un
   * réglage appliqué.
   */
  public reglerCommeLaConsole(
    name: string,
    version: string,
    reglages: Partial<
      Pick<LigneOutilPersistee, "enabled" | "retiredAt" | "sunsetAt" | "limit" | "warnAt">
    >,
  ): void {
    const cle = cleDOutil(name, version);
    const ligne = this.outils.get(cle);
    if (ligne === undefined) {
      throw new ErreurDeDepotDuRegistre(
        `aucune ligne « ${name} » version ${version} : un réglage posé sur rien se lirait ` +
          "comme un réglage appliqué.",
      );
    }
    this.outils.set(cle, { ...ligne, ...reglages });
  }

  public ecrireAdmission(
    adaptateur: EnregistrementAdaptateur,
    outils: readonly EnregistrementOutil[],
  ): Promise<ResultatEcritureDuRegistre> {
    this.ecrituresVues += 1;
    if (this.echouerALEcriture !== null && this.ecrituresVues === this.echouerALEcriture) {
      this.echouerALEcriture = null;
      return Promise.reject(new Error("panne d'écriture provoquée par le test"));
    }

    const adaptateurDejaPresent = this.adaptateurs.has(adaptateur.id);
    this.adaptateurs.set(adaptateur.id, adaptateur);

    let inseres = 0;
    let misAJour = 0;
    const declares = new Set<string>();
    for (const outil of outils) {
      const cle = cleDOutil(outil.name, outil.version);
      declares.add(cle);
      const existante = this.outils.get(cle);
      if (existante === undefined) {
        inseres += 1;
        // Les défauts d'INSERTION sont ceux du schéma : `enabled` à `false`, le
        // reste à `null`. Les écrire ici plutôt que de les deviner ailleurs est
        // ce qui rend les deux prises comparables.
        this.outils.set(cle, {
          ...outil,
          enabled: false,
          retiredAt: null,
          sunsetAt: null,
          limit: null,
          warnAt: null,
        });
      } else {
        misAJour += 1;
        // ⚠️ LES CINQ COLONNES DE CONSOLE SURVIVENT. C'est l'ADR 0050, et c'est
        //    la seule ligne de cette méthode qui compte vraiment.
        this.outils.set(cle, {
          ...outil,
          enabled: existante.enabled,
          retiredAt: existante.retiredAt,
          sunsetAt: existante.sunsetAt,
          limit: existante.limit,
          warnAt: existante.warnAt,
        });
      }
    }

    const orphelins = [...this.outils.values()]
      .filter(
        (ligne) =>
          ligne.adapterId === adaptateur.id && !declares.has(cleDOutil(ligne.name, ligne.version)),
      )
      .map((ligne) => `${ligne.name}@${ligne.version}`)
      .sort();

    return Promise.resolve({
      adapterId: adaptateur.id,
      adaptateurDejaPresent,
      outilsInseres: inseres,
      outilsMisAJour: misAJour,
      outilsOrphelins: orphelins,
    });
  }

  public lireAdaptateur(id: string): Promise<EnregistrementAdaptateur | null> {
    return Promise.resolve(this.adaptateurs.get(id) ?? null);
  }

  public listerOutils(): Promise<readonly LigneOutilPersistee[]> {
    // Ordre stable : par nom puis par version — la même clause que la prise
    // Prisma. Un inventaire dont l'ordre varie fait varier le catalogue servi,
    // donc la mesure du § 14, sans qu'aucune valeur n'ait changé.
    const toutes = [...this.outils.values()].sort((a, b) =>
      a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
    );
    return Promise.resolve(toutes);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  Prise 2 — Prisma, par interface structurelle
// ═════════════════════════════════════════════════════════════════════════════

/** La clé composite telle que Prisma la nomme pour `@@unique([name, version])`. */
export interface CleNomVersion {
  readonly name_version: { readonly name: string; readonly version: string };
}

/** Ce que Prisma rend pour `ops_adapter`. Les champs en trop sont ignorés. */
export interface LignePrismaOpsAdapter {
  readonly id: string;
  readonly version: string;
  readonly mode: AdapterMode;
  readonly authMode: string;
  readonly secretRef: string | null;
  readonly endpoint: string | null;
  readonly manifestSha: string;
  readonly trustTier: number;
  readonly maxDataClass: DataClass;
}

/** Ce que Prisma rend pour `ops_tool`. */
export interface LignePrismaOpsTool {
  readonly name: string;
  readonly adapterId: string;
  readonly version: string;
  readonly description: string;
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly bytes: number;
  readonly effect: string;
  readonly dataClass: DataClass;
  readonly idempotency: Idempotency;
  readonly profiles: string[];
  readonly governanceFields: string[];
  readonly enabled: boolean;
  readonly retiredAt: Date | null;
  readonly sunsetAt: Date | null;
  readonly limit: number | null;
  readonly warnAt: number | null;
}

/** Le délégué `prisma.opsAdapter`, réduit aux trois appels du registre. */
export interface DelegueOpsAdapter {
  findUnique(args: { where: { id: string } }): Promise<LignePrismaOpsAdapter | null>;
  upsert(args: {
    where: { id: string };
    create: EnregistrementAdaptateur;
    update: Omit<EnregistrementAdaptateur, "id">;
  }): Promise<LignePrismaOpsAdapter>;
}

/**
 * Le délégué `prisma.opsTool`.
 *
 * ⚠️ **`update` NE PORTE AUCUNE DES CINQ COLONNES DE CONSOLE**, et le TYPE le
 *    dit : `Omit<…, "name" | "version" | (les cinq)>`. Un jour où quelqu'un les
 *    ajouterait au corps, la compilation le refuserait avant la revue.
 */
export interface DelegueOpsTool {
  findMany(args: {
    orderBy: readonly [{ name: "asc" }, { version: "asc" }];
  }): Promise<LignePrismaOpsTool[]>;
  upsert(args: {
    where: CleNomVersion;
    create: EnregistrementOutilPourPrisma;
    update: Omit<EnregistrementOutilPourPrisma, "name" | "version">;
  }): Promise<LignePrismaOpsTool>;
}

/**
 * Ce que Prisma accepte à l'écriture : les tableaux `readonly` de
 * {@link EnregistrementOutil} deviennent des tableaux mutables, parce que le
 * client généré les déclare ainsi. La conversion est écrite UNE fois, ici.
 */
export interface EnregistrementOutilPourPrisma extends Omit<
  EnregistrementOutil,
  "profiles" | "governanceFields"
> {
  readonly profiles: string[];
  readonly governanceFields: string[];
}

export interface ClientPrismaDuRegistre {
  readonly opsAdapter: DelegueOpsAdapter;
  readonly opsTool: DelegueOpsTool;
}

/** Débarrasse une ligne Prisma de ses champs en trop, et RETYPE `authMode`. */
function versAdaptateur(ligne: LignePrismaOpsAdapter): EnregistrementAdaptateur {
  // ⚠️ `ops_adapter.authMode` est un `String` au schéma — « le vocabulaire est
  //    celui de core/registry ». Une valeur hors de ce vocabulaire est une ligne
  //    que le registre n'a pas écrite : on LÈVE plutôt que de la retyper de
  //    force, sans quoi `construireRaccordement` recevrait un mode d'authentifi-
  //    cation qu'aucune branche ne traite et refuserait sur un motif étranger.
  if (!(AUTH_MODES as readonly string[]).includes(ligne.authMode)) {
    throw new ErreurDeDepotDuRegistre(
      `ops_adapter « ${ligne.id} » porte authMode « ${ligne.authMode} », hors du vocabulaire ` +
        `de core/registry [${AUTH_MODES.join(", ")}]. La ligne n'a pas été écrite par ` +
        "l'admission ; le socle ne devine pas comment s'authentifier.",
    );
  }
  return {
    id: ligne.id,
    version: ligne.version,
    mode: ligne.mode,
    authMode: ligne.authMode as AuthMode,
    secretRef: ligne.secretRef,
    endpoint: ligne.endpoint,
    manifestSha: ligne.manifestSha,
    trustTier: ligne.trustTier,
    maxDataClass: ligne.maxDataClass,
  };
}

/** Idem pour `ops_tool`. Les cinq colonnes de console sont LUES. */
function versOutilPersiste(ligne: LignePrismaOpsTool): LigneOutilPersistee {
  return {
    name: ligne.name,
    adapterId: ligne.adapterId,
    version: ligne.version,
    description: ligne.description,
    inputSchema: ligne.inputSchema,
    outputSchema: ligne.outputSchema,
    bytes: ligne.bytes,
    effect: ligne.effect,
    dataClass: ligne.dataClass,
    idempotency: ligne.idempotency,
    // Le retypage vers `ProfileName` est adossé au registre, qui a confronté
    // chaque valeur à `profilsConnus` AVANT l'écriture (`profil_inconnu`).
    profiles: ligne.profiles as readonly ProfileName[],
    governanceFields: ligne.governanceFields,
    enabled: ligne.enabled,
    retiredAt: ligne.retiredAt,
    sunsetAt: ligne.sunsetAt,
    limit: ligne.limit,
    warnAt: ligne.warnAt,
  };
}

/** Ce qu'on écrit, dans la forme que Prisma accepte. */
function versEcriture(outil: EnregistrementOutil): EnregistrementOutilPourPrisma {
  return {
    name: outil.name,
    adapterId: outil.adapterId,
    version: outil.version,
    description: outil.description,
    inputSchema: outil.inputSchema,
    outputSchema: outil.outputSchema,
    bytes: outil.bytes,
    effect: outil.effect,
    dataClass: outil.dataClass,
    idempotency: outil.idempotency,
    profiles: [...outil.profiles],
    governanceFields: [...outil.governanceFields],
  };
}

/**
 * Le dépôt de production.
 *
 * ⚠️ **AUCUNE TRANSACTION, ET C'EST ÉCRIT AVEC CE QUE ÇA COÛTE.** `$transaction`
 *    n'est pas dans l'interface structurelle : l'y mettre obligerait à décrire le
 *    client entier, et la garde de schéma perdrait sa dérivation. La conséquence
 *    RÉELLE d'une écriture interrompue est bornée par la forme des opérations :
 *    chaque upsert est idempotent sur sa clé, et une reprise de l'admission —
 *    qui a lieu à CHAQUE démarrage — repose exactement les mêmes lignes. Un
 *    registre à moitié posé se répare donc en redémarrant, sans intervention.
 *    Le jour où une écriture cessera d'être idempotente, cette phrase devra être
 *    remplacée par une transaction, pas par une précaution.
 */
export class DepotDuRegistrePrisma implements DepotDuRegistre {
  public constructor(private readonly client: ClientPrismaDuRegistre) {}

  public async ecrireAdmission(
    adaptateur: EnregistrementAdaptateur,
    outils: readonly EnregistrementOutil[],
  ): Promise<ResultatEcritureDuRegistre> {
    const avant = await this.client.opsAdapter.findUnique({ where: { id: adaptateur.id } });

    // ⚠️ L'ADAPTATEUR D'ABORD : `ops_tool.adapterId` porte une clé étrangère.
    const { id: _id, ...sansId } = adaptateur;
    await this.client.opsAdapter.upsert({
      where: { id: adaptateur.id },
      create: adaptateur,
      update: sansId,
    });

    // Les lignes déjà en base, relues UNE fois : c'est ce qui permet d'annoncer
    // des nombres honnêtes (`upsert` ne dit pas s'il a inséré ou mis à jour) et
    // de nommer les orphelins.
    const existantes = await this.client.opsTool.findMany({
      orderBy: [{ name: "asc" }, { version: "asc" }],
    });
    const cles = new Set(existantes.map((ligne) => cleDOutil(ligne.name, ligne.version)));

    let inseres = 0;
    let misAJour = 0;
    const declares = new Set<string>();
    for (const outil of outils) {
      const cle = cleDOutil(outil.name, outil.version);
      declares.add(cle);
      if (cles.has(cle)) misAJour += 1;
      else inseres += 1;

      const ecriture = versEcriture(outil);
      const { name: _name, version: _version, ...pourLaMiseAJour } = ecriture;
      await this.client.opsTool.upsert({
        where: { name_version: { name: outil.name, version: outil.version } },
        create: ecriture,
        // ⚠️ NI `enabled`, NI `retiredAt`, NI `sunsetAt`, NI `limit`, NI
        //    `warnAt` — ADR 0050. Le type l'exige déjà ; ce commentaire dit
        //    POURQUOI, parce qu'un type dit seulement QUOI.
        update: pourLaMiseAJour,
      });
    }

    const orphelins = existantes
      .filter(
        (ligne) =>
          ligne.adapterId === adaptateur.id && !declares.has(cleDOutil(ligne.name, ligne.version)),
      )
      .map((ligne) => `${ligne.name}@${ligne.version}`)
      .sort();

    return {
      adapterId: adaptateur.id,
      adaptateurDejaPresent: avant !== null,
      outilsInseres: inseres,
      outilsMisAJour: misAJour,
      outilsOrphelins: orphelins,
    };
  }

  public async lireAdaptateur(id: string): Promise<EnregistrementAdaptateur | null> {
    const ligne = await this.client.opsAdapter.findUnique({ where: { id } });
    return ligne === null ? null : versAdaptateur(ligne);
  }

  public async listerOutils(): Promise<readonly LigneOutilPersistee[]> {
    const lignes = await this.client.opsTool.findMany({
      orderBy: [{ name: "asc" }, { version: "asc" }],
    });
    return lignes.map(versOutilPersiste);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  DE L'ADMISSION À L'ÉCRITURE — une seule conversion, ici
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Convertit une {@link LigneOpsTool} rendue par `enregistrerAdaptateur()` en
 * {@link EnregistrementOutil} prête à poser.
 *
 * ⚠️ **DEUX CHAMPS TOMBENT, ET LES DEUX SONT DES DÉRIVÉS.**
 *
 *  · `nomComplet` — le nom complet se DÉRIVE du préfixe. Le stocker en ferait
 *    une seconde vérité, qui divergerait le jour où `prefixeDe()` changerait.
 *  · `retireDeLaListe` — le § 13.4 le DÉRIVE d'`ops_tool.retiredAt`
 *    (« `retiredAt !== null && retiredAt <= maintenant`, jamais l'inverse »).
 *    L'admission le rend toujours `false` ; l'écrire écraserait, à chaque
 *    démarrage, une dépréciation que la console a posée.
 *
 * ⚠️ **UNE SEULE CONVERSION, ET ELLE EST ICI.** Deux appelants qui la
 *    recopieraient chacun de son côté finiraient par ne pas laisser tomber les
 *    mêmes champs.
 */
export function versEnregistrementOutil(ligne: LigneOpsTool): EnregistrementOutil {
  return {
    name: ligne.name,
    adapterId: ligne.adapterId,
    version: ligne.version,
    description: ligne.description,
    inputSchema: ligne.inputSchema,
    outputSchema: ligne.outputSchema,
    bytes: ligne.bytes,
    effect: ligne.effect,
    dataClass: ligne.dataClass,
    idempotency: ligne.idempotency,
    profiles: ligne.profiles,
    governanceFields: ligne.governanceFields,
  };
}

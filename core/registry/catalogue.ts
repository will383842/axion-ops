/**
 * `core/registry/catalogue.ts` — **DE DEUX DOCUMENTS À UN `OutilDuCatalogue`.**
 *
 * ═══ POURQUOI DEUX DOCUMENTS, ET PAS QUATRE COLONNES DE PLUS ═══
 *
 * `OutilDuCatalogue` (`core/chaine/etapes.ts`) exige cinq valeurs que `ops_tool`
 * **ne porte pas** : `pagination`, `compaction`, `maxBytes`, `idFields` et
 * `adapterVersion`. Deux voies s'offraient, et la seconde a été retenue :
 *
 *  1. **Quatre colonnes de plus au schéma.** Elles seraient écrites à
 *     l'admission depuis le manifeste, donc recopiées — et une recopie n'est
 *     couverte par AUCUNE empreinte. Le jour où une console, une migration ou
 *     une main les modifierait, `manifestSha` resterait vrai et le socle
 *     compacterait selon des annotations que personne n'a relues. C'est
 *     exactement la faute que le verrou existe pour fermer.
 *  2. **Les relire dans le manifeste ÉPINGLÉ** (`adapters/<id>/manifeste.json`),
 *     dont le SHA est confronté au verrou à chaque admission. Ce qui gouverne ce
 *     qui SORT du socle — le plafond d'octets, les champs de rang 2 retirés, les
 *     champs libres — reste alors sous l'empreinte qu'un humain a relue.
 *
 * ⚠️ **CE N'EST PAS UNE ÉCONOMIE DE MIGRATION.** C'est une décision sur
 *    l'endroit où vit la vérité : sous l'empreinte, ou à côté d'elle. ADR 0051.
 *
 * ═══ CE QUI FAIT FOI DEPUIS `ops_tool`, ET POURQUOI ═══
 *
 * `effect`, `dataClass` et `idempotency` sont lus dans **la ligne**, pas dans le
 * manifeste — c'est le § 20 : « tout écart entre `effect`/`dataClass` épinglés
 * ici et la valeur reçue DÉSACTIVE l'outil et alerte ». `ops_tool` EST l'épingle
 * de gouvernance ; la préférer au manifeste, ce serait retirer à l'étape 6 la
 * valeur qu'elle est chargée de confronter.
 *
 * Les deux documents devraient donc dire la même chose, puisque la ligne a été
 * écrite depuis le manifeste épinglé. **Quand ils divergent, l'outil sort du
 * catalogue et il est NOMMÉ** — voir {@link ResultatDeCatalogue.desaccords}.
 * Une divergence ne se corrige pas en silence : elle signale une ligne modifiée
 * hors admission, et c'est précisément le cas où le socle ne doit rien servir.
 */

import { nomComplet } from "../adapter-kit/manifest.js";
import type { Manifeste, ManifesteOutil } from "../adapter-kit/manifest.js";
import type { OutilDuCatalogue } from "../chaine/etapes.js";
import type { Effect } from "../types.js";
import type { LigneOutilPersistee } from "./depot.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Le manifeste épinglé, indexé
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Un manifeste épinglé, prêt à être interrogé outil par outil.
 *
 * ⚠️ **L'INDEX EST CONSTRUIT ICI, PAS RECOPIÉ D'AILLEURS.** Un appelant qui
 *    passerait une `Map` fabriquée à la main pourrait y glisser une entrée que
 *    le manifeste ne porte pas — c'est-à-dire contourner l'empreinte par la
 *    porte de service.
 */
export interface ManifesteIndexe {
  readonly adapterId: string;
  /** La version de l'ADAPTATEUR, telle que le manifeste épinglé la déclare. */
  readonly adapterVersion: string;
  /** `nom local` → l'entrée du manifeste. */
  readonly outils: ReadonlyMap<string, ManifesteOutil>;
}

/** Indexe un manifeste déjà lu et validé (`lireManifesteRecu`). */
export function indexerLeManifeste(manifeste: Manifeste): ManifesteIndexe {
  const outils = new Map<string, ManifesteOutil>();
  for (const outil of manifeste.tools) outils.set(outil.name, outil);
  return { adapterId: manifeste.id, adapterVersion: manifeste.version, outils };
}

// ═════════════════════════════════════════════════════════════════════════════
//  Ce que la construction rend — des NOMBRES et des NOMS
// ═════════════════════════════════════════════════════════════════════════════

/** Un désaccord entre la ligne persistée et le manifeste épinglé. */
export interface DesaccordDeCatalogue {
  /** Le nom COMPLET de l'outil écarté. */
  readonly nomComplet: string;
  /** Le champ qui diverge — `effect`, `dataClass` ou `idempotency`. */
  readonly champ: string;
  /** Ce que porte `ops_tool`. */
  readonly enBase: string;
  /** Ce que porte le manifeste épinglé. */
  readonly auManifeste: string;
}

/**
 * Le verdict complet de la construction. **Jamais une simple liste** : un
 * catalogue court sans dire pourquoi il est court est un catalogue qui ment par
 * omission, et c'est l'étape 7 qui en hériterait.
 */
export interface ResultatDeCatalogue {
  /** Les outils servables. C'est la seule liste ; le reste explique ses trous. */
  readonly outils: readonly OutilDuCatalogue[];
  /** Combien de lignes `ops_tool` ont été lues. Un ZÉRO rend tout le reste muet. */
  readonly lignesLues: number;
  /** Combien de manifestes épinglés ont été confrontés. */
  readonly manifestesIndexes: number;
  /**
   * Les `adapterId.name@version` dont AUCUNE entrée de manifeste épinglé ne
   * porte le nom — **écartés**, pas complétés par des valeurs par défaut.
   *
   * ⚠️ **UN DÉFAUT SERAIT PERMISSIF, ET C'EST TOUT LE SUJET.** `maxBytes`
   *    plafonne ce qui SORT du socle ; `compaction.tier2` dit quels champs sont
   *    retirés au deuxième palier ; `idFields` alimente `recordIds`, donc la
   *    purge du § 31. Inventer l'un des trois, c'est servir une charge que
   *    personne n'a bornée. La ligne existe, l'épingle n'existe pas : on ne
   *    sert pas.
   */
  readonly sansEntreeAuManifeste: readonly string[];
  /** Les adaptateurs dont aucun manifeste épinglé n'a été fourni. Ordre stable. */
  readonly adaptateursSansManifeste: readonly string[];
  /** Les divergences ligne / manifeste. L'outil correspondant est ÉCARTÉ. */
  readonly desaccords: readonly DesaccordDeCatalogue[];
}

// ═════════════════════════════════════════════════════════════════════════════
//  La construction
// ═════════════════════════════════════════════════════════════════════════════

/** Les trois champs de gouvernance que les deux documents portent tous les deux. */
const CHAMPS_CONFRONTES = ["effect", "dataClass", "idempotency"] as const;

/**
 * Construit le catalogue à partir des lignes persistées et des manifestes
 * épinglés.
 *
 * ⚠️ **`maintenant` EST UN PARAMÈTRE, ET IL N'A PAS DE DÉFAUT.** `retireDeLaListe`
 *    se dérive de `retiredAt <= maintenant` (§ 13.4). Un défaut `new Date()`
 *    rendrait la dérivation impossible à éprouver sur une date choisie, et une
 *    garde qui ne peut pas choisir son instant ne mesure pas une échéance.
 *
 * ⚠️ **AUCUN FILTRAGE PAR PROFIL, ET AUCUN PAR `enabled`.** Cette fonction rend
 *    l'INVENTAIRE ; `outilsServis()` (`core/profiles`) décide de ce qui est
 *    servi, et l'étape 7 refuse. Filtrer ici ferait deux endroits où un outil
 *    disparaît, et le second ne saurait pas dire lequel des deux l'a retiré.
 */
export function construireLeCatalogue(
  lignes: readonly LigneOutilPersistee[],
  manifestes: readonly ManifesteIndexe[],
  maintenant: Date,
): ResultatDeCatalogue {
  const parAdaptateur = new Map<string, ManifesteIndexe>();
  for (const manifeste of manifestes) parAdaptateur.set(manifeste.adapterId, manifeste);

  const outils: OutilDuCatalogue[] = [];
  const sansEntree: string[] = [];
  const sansManifeste = new Set<string>();
  const desaccords: DesaccordDeCatalogue[] = [];

  for (const ligne of lignes) {
    const complet = nomComplet(ligne.adapterId, ligne.name);
    const manifeste = parAdaptateur.get(ligne.adapterId);
    if (manifeste === undefined) {
      sansManifeste.add(ligne.adapterId);
      sansEntree.push(`${complet}@${ligne.version}`);
      continue;
    }

    const entree = manifeste.outils.get(ligne.name);
    if (entree === undefined) {
      sansEntree.push(`${complet}@${ligne.version}`);
      continue;
    }

    // ── LA CONFRONTATION ────────────────────────────────────────────────────
    // Elle porte sur les trois champs que les DEUX documents portent. Un
    // désaccord écarte l'outil : la ligne a été modifiée hors admission, et le
    // socle ne choisit pas entre deux gouvernances.
    const divergents = CHAMPS_CONFRONTES.filter(
      (champ) => String(ligne[champ]) !== String(entree[champ]),
    );
    if (divergents.length > 0) {
      for (const champ of divergents) {
        desaccords.push({
          nomComplet: complet,
          champ,
          enBase: String(ligne[champ]),
          auManifeste: String(entree[champ]),
        });
      }
      continue;
    }

    outils.push({
      // ⚠️ LE NOM PORTÉ PAR `OutilDuCatalogue` EST LE NOM COMPLET. C'est celui
      //    que `relire()` compare et celui que `octetsDeLaDefinition` mesure.
      //    Il est DÉRIVÉ ici, par la seule fonction qui sache le faire.
      name: complet,
      version: ligne.version,
      description: ligne.description,
      inputSchema: ligne.inputSchema,
      outputSchema: ligne.outputSchema,
      profiles: ligne.profiles,
      enabled: ligne.enabled,
      // § 13.4 — DÉRIVÉ de `retiredAt`, jamais porté à la main.
      retireDeLaListe:
        ligne.retiredAt !== null && ligne.retiredAt.getTime() <= maintenant.getTime(),

      adapterId: ligne.adapterId,
      // ⚠️ LA VERSION DE L'ADAPTATEUR VIENT DU MANIFESTE ÉPINGLÉ, pas de
      //    `ops_tool.version` — qui est la version de L'OUTIL (§ 13.4). Les
      //    confondre journaliserait « la version qui a servi » à côté.
      adapterVersion: manifeste.adapterVersion,

      // ── `ops_tool` FAIT FOI (§ 20) ────────────────────────────────────────
      effect: ligne.effect as Effect,
      dataClass: ligne.dataClass,
      idempotency: ligne.idempotency,
      limit: ligne.limit,
      warnAt: ligne.warnAt,
      governanceFields: ligne.governanceFields,

      // ── LE MANIFESTE ÉPINGLÉ FAIT FOI (ADR 0051) ──────────────────────────
      pagination: entree.pagination,
      compaction: entree.compaction,
      maxBytes: entree.maxBytes,
      idFields: entree.idFields,
    });
  }

  return {
    outils,
    lignesLues: lignes.length,
    manifestesIndexes: manifestes.length,
    sansEntreeAuManifeste: [...sansEntree].sort(),
    adaptateursSansManifeste: [...sansManifeste].sort(),
    desaccords,
  };
}

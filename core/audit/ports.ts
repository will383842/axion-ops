/**
 * `core/audit/ports.ts` — CE QUE `core/audit` ATTEND DES AUTRES, ET NE FAIT PAS.
 *
 * Règle du chantier : « déclare l'interface et code contre elle — ne la
 * réimplémente pas ». Ce fichier est le seul endroit où `core/audit` nomme un
 * service qu'il ne rend pas lui-même. Trois ports, pas un de plus.
 *
 * Chaque port porte le module qui doit le fournir. Tant qu'il n'est pas fourni,
 * `core/audit` compile, ses gardes tournent sur des doubles, et rien n'est
 * réimplémenté en double dans le socle.
 */

import type { LigneAAjouter, LigneAudit, LigneEcrite } from "./vocabulaire.js";

// ═════════════════════════════════════════════════════════════════════════════
//  Port 1 — l'empreinte d'arguments (FOURNI PAR `core/limits`)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * § 12, règle 2 — « `argHash` est un HMAC, pas un SHA nu ».
 *
 * HMAC-SHA-256, clé issue du coffre, SÉPARATION DE DOMAINE PAR OUTIL, FAIL-LOUD
 * si la clé manque. Motif en service dans le dépôt voisin :
 * `src/lib/security/email-hash.ts` — « un SHA-256 nu d'adresse e-mail se casse
 * en quelques secondes ; un HMAC clé rend l'index inutilisable pour qui
 * obtiendrait un dump sans le secret ».
 *
 * ⚠️ `core/audit` NE L'IMPLÉMENTE PAS. Il n'a d'ailleurs aucun accès au coffre,
 *    et une seconde implémentation serait une seconde clé, donc une seconde
 *    échéance de rotation — alors que le § 12 exige que la clé soit tournée ou
 *    purgée AVEC le journal. `derivation.spec.ts` échoue si un fichier de ce
 *    dossier se met à appeler `createHmac`.
 *
 * FOURNI PAR : `core/limits`.
 */
export interface ArgHasher {
  /**
   * Empreinte de `input` pour l'outil `tool`.
   *
   * ⚠️ CE NOM ET CETTE SIGNATURE NE SONT PAS LIBRES. Ce port portait
   * auparavant `argHash(outil, args): string` — un nom différent, une
   * signature différente, SYNCHRONE là où `core/limits` est asynchrone. Le
   * port était donc déclaré, cité quatre fois dans ce dossier, et implémenté
   * par personne : le premier code qui aurait voulu le brancher aurait
   * inventé un adaptateur, c'est-à-dire une SECONDE source de vérité sur
   * l'empreinte, donc une seconde clé à tourner — ce que le § 12 interdit
   * explicitement.
   *
   * La forme retenue est celle du fournisseur, `core/limits.CalculArgHash` :
   * une seule forme, un seul nom. `integration.spec.ts` confronte les membres
   * lus DANS CE FICHIER à l'objet réellement rendu par `creerCalculArgHash`,
   * et rougit si les deux divergent à nouveau.
   *
   * @param tool - le nom de l'outil, qui SÉPARE LES DOMAINES : deux outils aux
   *   arguments identiques ne doivent pas produire la même empreinte, sans quoi
   *   un dump du journal laisserait recouper les appels d'un outil par l'autre.
   * @param input - les arguments de l'appel.
   * @returns une empreinte hexadécimale de 64 caractères.
   * @throws si la clé du coffre manque — FAIL-LOUD, jamais un repli silencieux.
   */
  calculer(tool: string, input: unknown): Promise<string>;

  /** Compare deux empreintes À TEMPS CONSTANT. Voir `core/limits`. */
  correspond(a: string, b: string): boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Port 2 — la persistance du journal (FOURNI PAR la couche Prisma du socle)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'accès à `ops_audit`. `core/audit` ne connaît ni Prisma, ni SQL : le journal
 * doit pouvoir être vérifié depuis une archive hors ligne (§ 31, 12 mois
 * archivés) aussi bien que depuis la base vivante.
 *
 * ⚠️ DEUX EXIGENCES QUE L'IMPLÉMENTATION DOIT TENIR, et qu'aucun type ne peut
 *    exprimer :
 *
 *  1. `dernierSelfHash` puis `ajouter` forment UNE SECTION CRITIQUE. Deux
 *     appels concurrents qui liraient le même `prevHash` produiraient deux
 *     lignes prétendant toutes deux succéder à la même — l'une des deux étant
 *     alors indistinguable d'une insertion frauduleuse. Verrou consultatif ou
 *     transaction sérialisable : au choix, mais pas rien.
 *
 *  2. `lireDepuis` rend les lignes ORDONNÉES PAR `seq` CROISSANT, jamais par
 *     `at` (§ 12). `verifierChaine` ne trie pas : il signale l'ordre non
 *     croissant comme une anomalie, parce qu'un tri défensif masquerait
 *     précisément le défaut qu'il faut voir.
 */
export interface JournalStore {
  /** `selfHash` de la ligne de `seq` maximal, ou `null` si le journal est vide. */
  dernierSelfHash(): Promise<string | null>;

  /** Insère une ligne déjà chaînée et rend le `seq` que la base lui a donné. */
  ajouter(ligne: LigneAAjouter): Promise<LigneEcrite>;

  /**
   * Lit une tranche, ORDONNÉE PAR `seq` CROISSANT.
   *
   * @param seqDepuis - borne basse INCLUSE.
   * @param limite - nombre maximal de lignes rendues. La vérification d'un
   *   journal de douze mois se fait par tranches : `verifierChaine` accepte
   *   qu'on lui passe le `prevHash` attendu au début de la tranche.
   */
  lireDepuis(seqDepuis: bigint, limite: number): Promise<readonly LigneAudit[]>;
}

// ═════════════════════════════════════════════════════════════════════════════
//  Port 3 — l'horloge
// ═════════════════════════════════════════════════════════════════════════════

/**
 * L'horloge, injectée pour que les gardes soient déterministes.
 *
 * Elle sert à `at` et à `durationMs`. Elle NE SERT JAMAIS À ORDONNER : c'est
 * exactement pour ça que `seq` existe (§ 12).
 */
export interface Horloge {
  maintenant(): Date;
}

/** L'horloge du système. */
export const HORLOGE_SYSTEME: Horloge = {
  maintenant(): Date {
    return new Date();
  },
};

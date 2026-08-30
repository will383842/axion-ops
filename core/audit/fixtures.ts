/**
 * `core/audit/fixtures.ts` — LE MATÉRIEL DES GARDES.
 *
 * ⚠️ Kit de test. Il ne sert à aucun chemin de production et n'est pas
 *    réexporté par `index.ts`.
 *
 * Il vit dans un module à part, et pas dans un fichier `.spec.ts`, pour une
 * raison mécanique : `describe`/`it` s'enregistrent auprès du fichier qui les
 * importe, si bien qu'un `.spec.ts` importé par un autre verrait ses gardes
 * comptées deux fois — un compte faussé étant précisément ce que ce chantier
 * cherche à éviter.
 *
 * Ce que le kit fabrique, une garde peut le MUTILER. C'est le point : une garde
 * qui ne peut pas mutiler son sujet ne prouve rien.
 */

import { sha256Hex } from "./canonique.js";
import { Journal } from "./journal.js";
import { JournalMemoire } from "./memoire.js";
import type { Horloge } from "./ports.js";
import type { ContenuLigne, LigneAudit } from "./vocabulaire.js";

/** Origine des horodatages témoins : fixe, pour que les empreintes soient stables. */
export const INSTANT_ZERO = Date.UTC(2026, 7, 30, 12, 0, 0);

/** Une horloge qui n'avance que quand on le lui dit. */
export class HorlogeFigee implements Horloge {
  #ms: number;

  constructor(ms: number = INSTANT_ZERO) {
    this.#ms = ms;
  }

  maintenant(): Date {
    return new Date(this.#ms);
  }

  avancer(ms: number): void {
    this.#ms += ms;
  }
}

/**
 * Le contenu d'une ligne témoin. Toutes ses valeurs passent la garde de forme du
 * § 31 : c'est délibéré, pour qu'une garde qui rougit rougisse de ce qu'elle
 * mesure, et non du décor.
 */
export function contenuTemoin(rang: number, surcharge: Partial<ContenuLigne> = {}): ContenuLigne {
  const base: ContenuLigne = {
    at: new Date(INSTANT_ZERO + rang * 1000),
    principal: `temoin-${String(rang % 3)}`,
    sessionId: `session-${String(rang % 2)}`,
    tool: "ops.temoin.lire",
    toolVersion: "1.0.0",
    adapterVersion: "1.0.0",
    effect: "read",
    policyLevel: "brouillon",
    decision: "autorisé",
    stepDenied: null,
    // Un HMAC vient de `core/limits` ; ici on ne fabrique qu'une valeur de la
    // bonne FORME — 64 hexadécimaux — puisque c'est tout ce que `core/audit`
    // vérifie, et tout ce qu'il a le droit de vérifier (§ 12, règle 2).
    argHash: sha256Hex(`argHash-temoin-${String(rang)}`),
    recordIds: [],
    partialSources: [],
    durationMs: 12,
    outcome: "ok",
  };
  return { ...base, ...surcharge };
}

/**
 * Fabrique un journal de `nombre` lignes, correctement chaînées.
 *
 * @returns le store, pour que la garde puisse le lire ET le mutiler.
 */
export async function construireJournal(
  nombre: number,
  store: JournalMemoire = new JournalMemoire(),
): Promise<JournalMemoire> {
  const journal = new Journal(store, new HorlogeFigee());
  for (let rang = 0; rang < nombre; rang += 1) {
    await journal.journaliser(contenuTemoin(rang));
  }
  return store;
}

/** Une empreinte de la bonne forme, mais qui n'est celle d'aucune ligne. */
export function empreinteEtrangere(graine: string): string {
  return sha256Hex(`empreinte-etrangere-${graine}`);
}

/**
 * Remplace une ligne par une copie modifiée, SANS toucher aux empreintes.
 * C'est le geste d'une réécriture après coup : c'est exactement ce que le
 * chaînage doit rendre visible.
 */
export function reecrireSansRecalculer(
  lignes: readonly LigneAudit[],
  index: number,
  surcharge: Partial<ContenuLigne>,
): readonly LigneAudit[] {
  return lignes.map((ligne, rang) => (rang === index ? { ...ligne, ...surcharge } : ligne));
}

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
import { creerScelleurJournal } from "../sceau/index.js";
import type { Horloge, ScelleurJournal } from "./ports.js";
import type { ContenuLigne, LigneAudit } from "./vocabulaire.js";
import { EFFET_EXTERIEUR_NON_SURVENU } from "./vocabulaire.js";

/**
 * LA CLÉ DE SCELLEMENT DES TÉMOINS (ADR 0002).
 *
 * ⚠️ CE N'EST PAS UN SECRET, ET ELLE NE DOIT JAMAIS EN DEVENIR UN. Elle est
 *    écrite en clair dans un dépôt PUBLIC, et son nom le dit. Elle existe pour
 *    qu'une garde puisse fabriquer un journal, le mutiler, et vérifier que la
 *    vérification rougit — un test qui ne peut pas mutiler ne prouve rien.
 *
 *    Le socle, lui, refuse de démarrer sans une clé du coffre : `core/sceau`
 *    n'a AUCUN repli, précisément pour qu'une clé de témoin ne puisse jamais
 *    servir en production.
 */
export const CLE_DE_TEMOIN = "cle-de-temoin-axion-ops-jamais-en-production";

/** Le scelleur des témoins. Construit une fois, partagé par les fixtures. */
export const SCELLEUR_TEMOIN: ScelleurJournal = creerScelleurJournal(CLE_DE_TEMOIN);

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
    // Une ligne témoin représente un appel ALLÉ AU BOUT : son empreinte porte
    // donc la valeur validée. Les gardes qui veulent l'autre population la
    // demandent par surcharge, et c'est le but même de ce champ.
    argHashValidated: true,
    recordIds: [],
    partialSources: [],
    durationMs: 12,
    outcome: "ok",
    // ADR 0017 — une ligne témoin est une LECTURE réussie : rien n'en est sorti.
    // Les gardes qui veulent l'autre population la demandent par surcharge, et
    // c'est justement ce que ce champ rend possible : sans lui, « l'effet est
    // parti » n'était exprimable nulle part dans une ligne.
    externalEffect: EFFET_EXTERIEUR_NON_SURVENU,
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
  scelleur: ScelleurJournal = SCELLEUR_TEMOIN,
): Promise<JournalMemoire> {
  const journal = new Journal(scelleur, store, new HorlogeFigee());
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

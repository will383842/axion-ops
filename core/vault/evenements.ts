/**
 * core/vault/evenements.ts — LA COUTURE VERS LE JOURNAL, pas le journal.
 *
 * § 24 range quatre choses en CRITIQUE, dont « coffre illisible » et « tout
 * desserrage, confirmé compris, avec canal et auteur ». Le coffre doit donc
 * PARLER. Mais il n'écrit pas `ops_audit` : le journal chaîné (seq, prevHash,
 * selfHash) appartient à `core/audit/`, et deux modules qui écrivent la même
 * chaîne en cassent l'ordre total.
 *
 * D'où cette interface, DÉCLARÉE ICI et implémentée ailleurs — la règle du
 * chantier : « si tu as besoin de quelque chose qu'un autre module doit
 * fournir, déclare l'interface dans ton dossier et code contre elle ».
 *
 * Le défaut est un observateur MUET, et c'est délibéré : un coffre qui refuse
 * de fonctionner faute de journal serait un coffre qu'on désactive au premier
 * incident.
 */

import type { EtatCoffre } from "./etat.js";

/**
 * Ce que le coffre a à dire. Union fermée : `core/audit/` peut faire un
 * `switch` exhaustif pour attribuer un niveau d'alerte du § 24, et un
 * événement nouveau devient une erreur de compilation chez lui plutôt qu'une
 * ligne silencieusement classée « aucune ».
 */
export const EVENEMENTS_DU_COFFRE = [
  /** Le sceau vient d'être posé. Une fois par vie de base. */
  "provisionné",
  /** Le trousseau ouvre le sceau. */
  "déverrouillé",
  /** Un trousseau a été présenté et n'ouvre pas. § 24 : CRITIQUE. */
  "coffre-illisible",
  /** Fermé — arrêt d'urgence, inactivité, ou rotation interrompue. */
  "verrouillé",
  /** Un geste hors table a été demandé. */
  "geste-refusé",
  "rotation-commencée",
  "rotation-terminée",
  /** Une écriture de rotation a échoué. Les lignes déjà réécrites portent le
   *  nouveau `keyId`, les autres l'ancien — et c'est rattrapable, à condition
   *  que les DEUX clés restent au trousseau. § 24 : CRITIQUE. */
  "rotation-interrompue",
  /** § 27 — le compteur d'amorçage a bougé. */
  "amorçage-compté",
  /** Le plafond d'amorçage est atteint. Le mur, annoncé avant d'être percuté. */
  "plafond-d-amorçage-atteint",
] as const;

export type NomEvenementDuCoffre = (typeof EVENEMENTS_DU_COFFRE)[number];

export interface EvenementDuCoffre {
  readonly nom: NomEvenementDuCoffre;
  /** L'état APRÈS l'événement. Trois valeurs, jamais un booléen. */
  readonly etat: EtatCoffre;
  /**
   * Texte court, destiné à un humain qui reçoit une alerte Telegram à 2 h du
   * matin. Il NOMME `name`, `version`, `keyId` — jamais un octet de clair ni de
   * clé. `erreurs.spec.ts` porte la garde qui balaie ce champ.
   */
  readonly detail: string;
  readonly horodatage: Date;
}

export interface JournalDuCoffre {
  evenement(evenement: EvenementDuCoffre): void;
}

/** L'observateur par défaut : il n'écrit rien, et il ne casse rien. */
export const JOURNAL_MUET: JournalDuCoffre = {
  evenement(): void {
    // Volontairement vide — voir l'en-tête du fichier.
  },
};

/**
 * Un observateur qui GARDE ce qu'il reçoit. Sert aux tests, et à l'écran Santé
 * en local, où il n'y a pas de bot Telegram.
 */
export class JournalEnMemoire implements JournalDuCoffre {
  private readonly recus: EvenementDuCoffre[] = [];

  public evenement(evenement: EvenementDuCoffre): void {
    this.recus.push(evenement);
  }

  public get tous(): readonly EvenementDuCoffre[] {
    return this.recus;
  }

  public nomsRecus(): readonly NomEvenementDuCoffre[] {
    return this.recus.map((evenement) => evenement.nom);
  }

  public compte(nom: NomEvenementDuCoffre): number {
    return this.recus.filter((evenement) => evenement.nom === nom).length;
  }
}

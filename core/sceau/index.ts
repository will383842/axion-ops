/**
 * `core/sceau/` — LE SCELLEMENT DE LA CHAÎNE D'`ops_audit` (ADR 0002).
 *
 * Un seul sujet, une seule clé, un seul fichier de code. Il vit hors de
 * `core/audit/` pour une raison mécanique et non esthétique : ce dossier-là
 * porte une garde qui refuse tout appel à `createHmac`, et son motif — une
 * seconde implémentation de l'`argHash` serait une seconde clé pour le même
 * usage — reste juste. Ce module est un usage DIFFÉRENT, et la garde du voisin
 * n'a pas à être désarmée pour le loger.
 */

export {
  DOMAINE_SCEAU_JOURNAL,
  ErreurCleSceauJournal,
  LONGUEUR_MINIMALE_CLE,
  LONGUEUR_SCEAU,
  creerScelleurJournal,
  messageDuSceau,
  scelleurDepuisCoffre,
} from "./journal.js";

export type { CoffreSceauJournal } from "./journal.js";

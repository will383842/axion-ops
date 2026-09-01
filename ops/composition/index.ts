/**
 * `ops/composition/` — **LA CHAÎNE DES QUATORZE ÉTAPES, COMPOSÉE À LA RACINE.**
 *
 * Le partage des rôles de la racine, et il tient en quatre lignes :
 *
 *  · `ops/index.ts`      RELIE   — il lit l'environnement, et lui seul ;
 *  · `ops/main.ts`       SÉQUENCE — les sept étages du démarrage ;
 *  · `ops/service.ts`    MONTE    — les transports, sur ce qu'on lui remet ;
 *  · `ops/composition/`  COMPOSE  — le noyau, à partir de ports.
 *
 * ⚠️ **POURQUOI UN DOSSIER À PART, ET PAS `ops/index.ts`.** Une composition
 *    écrite dans le point d'entrée serait inéprouvable sans lire `process.env` —
 *    c'est exactement le motif qui a fait séparer `ops/service.ts` de
 *    `ops/main.ts` à l'ADR 0034. Ici rien ne touche `process`, et une garde peut
 *    composer deux noyaux dans le même test.
 */

export {
  CANAL_DALERTE_SANS_DESTINATAIRE,
  CONFIRMATION_SANS_DEPOT,
  DECLARATIONS_SANS_ADAPTATEUR_ADMIS,
  ErreurAdaptateurNonAdmis,
  INTERRUPTEUR_SANS_ECRITURE,
  SANS_PONT_DE_CLE_DE_CURSEUR,
  TTL_IDEMPOTENCE_MAX_MS,
  composerLeNoyau,
} from "./noyau.js";

export type { NoyauCompose, PortsDuNoyau } from "./noyau.js";

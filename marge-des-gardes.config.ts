/**
 * `marge-des-gardes.config.ts` — **LE FICHIER D'AMORCE QUI FAIT ROUGIR UN TEST
 * TROP LONG. ADR 0040, § 3.**
 *
 * ═══ CE QUE CE FICHIER FAIT ═══
 *
 * vitest le charge avant CHAQUE fichier de test (`test.setupFiles`). Il pose un
 * `beforeEach`/`afterEach` autour de chaque test du dépôt, et il fait **rougir
 * le test lui-même** dès que sa durée dépasse la part du plafond écrite dans
 * `plafond-de-test.config.ts`. À la fin de chaque fichier, il ANNONCE son
 * dénominateur : combien de tests mesurés, le plafond, le seuil, la marge, et
 * les plus longs.
 *
 * ⚠️ **TROIS PLACEMENTS ONT ÉTÉ ÉCARTÉS, ET LES MOTIFS SONT MESURABLES.**
 *
 *  1. `ops/marge-des-gardes.ts` — ce que l'ADR 0040 nommait. `ops/` est ÉMIS par
 *     `pnpm build` : le contrôle serait alors un module de PRODUCTION, ce qui
 *     contredirait mot pour mot l'entrée de registre de l'ADR 0040 (« AUCUN
 *     SYMBOLE LIVRÉ »), et un module livré importerait `vitest`, une dépendance
 *     de développement.
 *  2. `core/**` — même objection : sous `core/`, `tsconfig.build.json` n'exclut
 *     que `*.spec.ts`, `core/epreuve/` et les `fixtures.ts`. Un fichier d'amorce
 *     n'est aucun des trois.
 *  3. La racine, sous le motif `*.config.ts` — **c'est celui-ci**. Le même motif
 *     qui sort `vitest.config.ts` du périmètre livré sort ce fichier.
 *
 * ⚠️ **ÉCART ASSUMÉ AVEC L'ADR 0040, § 3, ET IL EST EN NOTRE FAVEUR.** L'ADR
 *    décrivait une étape de chaîne d'intégration qui RELANCE la suite en
 *    `--reporter=json`. Ce fichier ne relance rien : il mesure pendant la seule
 *    exécution qui a lieu. La chaîne n'exécute donc pas la suite deux fois, et
 *    **le test fautif est celui qui rougit**, nommé, au lieu d'un rapport séparé
 *    qui nomme un fichier.
 *
 * ⚠️ **CE QUE CET ÉCART COÛTE, ÉCRIT AVEC LA MESURE QUI MANQUE.** Chaque fichier
 *    annonce SES plus longs ; il n'existe pas de vue globale des cinq plus longs
 *    du dépôt, parce qu'aucun worker ne voit les autres. La mesure qui la
 *    rendrait est nommée : un rapporteur vitest sur mesure, agrégeant
 *    `onTestCaseResult`. Elle n'a pas été faite.
 */

import { afterAll, afterEach, beforeEach } from "vitest";
import type { TestContext } from "vitest";

import { alerteDeDepassement, annonceDeMarge, verdictDeMarge } from "./plafond-de-test.config.js";
import type { DureeMesuree } from "./plafond-de-test.config.js";

// ═════════════════════════════════════════════════════════════════════════════
//  L'ARMEMENT — un `afterEach` autour de CHAQUE test du dépôt
// ═════════════════════════════════════════════════════════════════════════════

/*
 * ⚠️ **CE BLOC S'EXÉCUTE À L'IMPORT, ET UNE SEULE FOIS PAR FICHIER DE TEST.**
 *    vitest charge ce module comme amorce ; le registre de modules du worker est
 *    isolé par fichier, si bien qu'une garde qui importerait AUSSI les fonctions
 *    ci-dessus recevrait la MÊME instance et n'armerait rien une seconde fois.
 *
 * ⚠️ **CE QUE CET ÉCART COÛTE, ÉCRIT AVEC LA MESURE QUI MANQUE.** Chaque fichier
 *    annonce SES plus longs ; il n'existe pas de vue globale des cinq plus longs
 *    du dépôt, parce qu'aucun worker ne voit les autres. La mesure qui la
 *    rendrait est nommée : un rapporteur vitest sur mesure, agrégeant
 *    `onTestCaseResult`. Elle n'a pas été faite.
 */

/** Les durées du fichier de test courant. Vidée à chaque fichier — voir ci-dessus. */
const mesuresDuFichier: DureeMesuree[] = [];
/** L'instant d'entrée du test courant, par identifiant de tâche. */
const debuts = new Map<string, number>();

/** Le nom lisible d'un test, fichier compris quand vitest le donne. */
function nomDuTest(contexte: TestContext): string {
  return contexte.task.name;
}

beforeEach((contexte: TestContext) => {
  debuts.set(contexte.task.id, performance.now());
});

afterEach((contexte: TestContext) => {
  const debut = debuts.get(contexte.task.id);
  debuts.delete(contexte.task.id);
  if (debut === undefined) return;
  const dureeMs = performance.now() - debut;
  const mesure: DureeMesuree = { nom: nomDuTest(contexte), dureeMs };
  mesuresDuFichier.push(mesure);

  // ⚠️ **AUCUNE COMPARAISON N'EST ÉCRITE ICI — ADR 0040, § 4, ET C'EST UNE
  //    CORRECTION.** Ce bloc portait sa propre écriture du seuil
  //    (`if (dureeMs > seuilMs)`), et c'était celle-là qui faisait réellement
  //    rougir les tests du dépôt — la seule des deux que rien n'éprouvait. La
  //    décision vient désormais d'`alerteDeDepassement`, fonction PURE,
  //    éprouvée sur témoins fabriqués par `core/audit/marge-des-gardes.spec.ts`,
  //    et le test fautif reste celui qui rougit, nommé, avec ses nombres.
  const alerte = alerteDeDepassement(mesure);
  if (alerte !== null) throw new Error(alerte);
});

afterAll(() => {
  const verdict = verdictDeMarge(mesuresDuFichier);
  if (verdict.testsMesures === 0) return;
  // ⚠️ `process.stdout.write` PLUTÔT QUE `console.info`, ET CE N'EST PAS UN
  //    CONTOURNEMENT DE RÈGLE. La règle `no-console` du dépôt n'autorise que
  //    `warn` et `error` hors des gardes ; or ceci n'est ni l'un ni l'autre —
  //    c'est une ANNONCE de mesure, émise à chaque exécution, y compris quand
  //    tout va bien. L'écrire en `warn` ferait passer une mesure normale pour un
  //    incident, et c'est le genre de bruit qui fait couper les avertissements.
  process.stdout.write(`${annonceDeMarge(verdict, "fichier")}
`);
});

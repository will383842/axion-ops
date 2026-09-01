import { defineConfig } from "vitest/config";

import { PLAFOND_DE_TEST_MS } from "./plafond-de-test.config.js";

/**
 * ⚠️ **LE PLAFOND A UNE SEULE ÉCRITURE, ET DEUX LECTEURS — ADR 0040, § 4.** Il
 *    est écrit dans `plafond-de-test.config.ts`, avec sa mesure ; ce fichier-ci
 *    l'IMPORTE, et le contrôle de marge le lit de la même source. Une valeur
 *    recopiée resterait juste jusqu'au jour où le plafond change — et ce
 *    jour-là, le contrôle mesurerait une marge par rapport à un plafond qui
 *    n'existe plus, EN RESTANT VERT.
 *
 * ⚠️ **LE SENS DE LA LECTURE EST L'INVERSE DE CELUI QUE L'ADR 0040 DÉCRIVAIT, ET
 *    LE MOTIF EST MESURABLE.** L'ADR faisait de ce fichier l'écrivain et du
 *    contrôle le lecteur. Or le contrôle est le fichier d'AMORCE de vitest : il
 *    est chargé dans CHAQUE worker, et importer ce fichier-ci depuis un worker y
 *    ferait charger `vitest/config`, c'est-à-dire vite, 126 fois par exécution.
 *    La propriété que l'ADR protège — une seule écriture — est tenue à
 *    l'identique dans l'autre sens.
 *
 */

export default defineConfig({
  test: {
    // Les tests vivent À CÔTÉ du code qu'ils gardent : `core/policy/ttl.spec.ts`
    // et non `tests/unit/policy/ttl.spec.ts`. Un test rangé ailleurs se perd,
    // et une garde perdue ne rougit plus.
    include: [
      "core/**/*.spec.ts",
      "adapters/**/*.spec.ts",
      "console/**/*.spec.ts",
      "voice/**/*.spec.ts",
      "ops/**/*.spec.ts",
    ],
    environment: "node",
    // Aucun réseau : le socle ne sort pas de la machine tant que les prérequis
    // d'exploitation du lot 0a ne sont pas remplis.
    globals: false,
    reporters: ["default"],
    // ⚠️ **LA MARGE SE SURVEILLE, ET ELLE MORD — ADR 0040, § 3.** Cette amorce
    //    pose un `afterEach` autour de chaque test du dépôt : un test qui
    //    dépasse la MOITIÉ du plafond fait rougir ce test-là, nommé, avec sa
    //    durée. Sans elle, le plafond serait un confort qu'on cesse de
    //    regarder, et le premier rouge arriverait un jour de machine chargée —
    //    trop tard pour l'apprendre.
    setupFiles: ["./marge-des-gardes.config.ts"],
    testTimeout: PLAFOND_DE_TEST_MS,
    // ⚠️ SANS LUI, TOUT LE RAISONNEMENT CI-DESSUS EST VIDE. Le défaut de
    //    `hookTimeout` vaut 10 000 ms : une garde qui balaie le dépôt dans un
    //    `beforeAll` — la forme naturelle quand cinq tests lisent le même
    //    corpus — aurait une falaise DIFFÉRENTE et PLUS BASSE que les tests
    //    qu'elle prépare, et un crochet qui expire ne nomme AUCUN test. Les deux
    //    sont posés à la même valeur pour qu'il n'y ait qu'UNE seule falaise.
    hookTimeout: PLAFOND_DE_TEST_MS,
  },
});

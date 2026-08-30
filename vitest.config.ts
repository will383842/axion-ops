import { defineConfig } from "vitest/config";

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
  },
});

// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**", "**/*.d.ts"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Un paramètre ou une variable délibérément inutilisé se préfixe d'un `_`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `import type` explicite : `verbatimModuleSyntax` est actif.
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      // Le socle ne renvoie jamais une trace de pile (§ 15) ; `console` non plus.
      "no-console": ["error", { allow: ["warn", "error"] }],
    },
  },
  {
    // Les tests peuvent journaliser leur compte d'éléments mesurés : une garde
    // qui n'annonce pas combien elle a mesuré est verte pour la pire des raisons.
    files: ["**/*.spec.ts"],
    rules: {
      "no-console": "off",
    },
  },
  {
    // Ce fichier-ci n'est pas dans le programme TypeScript : les règles qui
    // exigent un type ne peuvent pas s'y appliquer.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);

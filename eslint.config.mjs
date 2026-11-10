// Lint do projeto (perfil JS do Vibe Coding Toolkit, sem TypeScript).
// quality/max-lines: limite de 350 linhas por arquivo (referência do toolkit).
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";

import quality from "./eslint-rules/index.cjs";

export default defineConfig([
  globalIgnores(["node_modules/", ".vercel/", "public/", ".claude/"]),
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: globals.node },
    plugins: { quality },
    rules: {
      "quality/max-lines": "error",
      eqeqeq: ["error", "smart"],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
  {
    files: ["eslint-rules/**/*.cjs"],
    languageOptions: { sourceType: "commonjs" },
  },
]);

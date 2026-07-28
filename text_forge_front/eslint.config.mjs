import { globalIgnores } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  globalIgnores([
    ".next/**",
    "out/**", 
    "build/**",
    "node_modules/**",
    "e2e/**",
    "src/test/**",
    "public/**",
    "scripts/**",
    "*.mjs",
  ]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
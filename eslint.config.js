import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/dist-online/**", "**/dist-accounts/**", "coverage/**", "node_modules/**", "apps/web/public/**", "playwright-report/**", "test-results/**", "supabase/functions/_shared/domain/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  {
    // Rule S7: no innerHTML with interpolated data in typed code.
    files: ["**/*.ts"],
    rules: {
      "no-restricted-properties": ["error", { property: "innerHTML", message: "Use textContent or DOM building (manifest S7)." }],
    },
  },
  {
    // The legacy single-file app being migrated (manifest §12). Kept as-is; new code goes elsewhere.
    files: ["apps/web/src/legacy/**", "apps/web/src/ui/board.js"],
    languageOptions: { globals: { claude: "readonly" } },
    rules: { "no-unused-vars": "off", "no-empty": "off", "no-cond-assign": "off", "no-useless-escape": "off", "@typescript-eslint/no-unused-vars": "off", "@typescript-eslint/no-unused-expressions": "off" },
  },
  {
    // End-to-end tests read the untyped legacy state through the ?test hook.
    files: ["tests/e2e/**"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
);

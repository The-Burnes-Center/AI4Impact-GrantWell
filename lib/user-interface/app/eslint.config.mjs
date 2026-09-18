import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import { defineConfig, globalIgnores } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs["flat/recommended"],
      reactHooks.configs["recommended-latest"],
      react.configs.flat.recommended,
      jsxA11y.flatConfigs.strict,
      react.configs.flat["jsx-runtime"],
    ],
    plugins: {
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      "react/prop-types": "off",

      "jsx-a11y/no-noninteractive-tabindex": [
        "error",
        { tags: [], roles: ["tabpanel", "log"], allowExpressionValues: true },
      ],

      "@typescript-eslint/no-unused-vars": "warn",
      "react/no-unescaped-entities": "warn",

      // New in eslint:recommended v9; fires on intentional `{false && ...}` feature switches.
      "no-constant-binary-expression": "warn",
    },
  },

  {
    files: [
      "src/components/chat/DocumentManager.tsx",
      "src/components/common/Modal.tsx",
      "src/pages/requirements/components/HelpModal.tsx",
    ],
    rules: {
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-noninteractive-element-interactions": "warn",
    },
  },
  {
    files: [
      "src/components/chat/DocumentManager.tsx",
      "src/components/document-editor/ProgressStepper.tsx",
      "src/components/search/IntegratedSearchBar.tsx",
      "src/pages/dashboard/DashboardPage.tsx",
      "src/pages/requirements/components/HelpModal.tsx",
    ],
    rules: { "jsx-a11y/no-static-element-interactions": "warn" },
  },
  {
    files: [
      "src/components/chat/DocumentManager.tsx",
      "src/pages/dashboard/components/GrantActionsDropdown.tsx",
      "src/pages/dashboard/components/RowActions.tsx",
      "src/pages/document-editor/ReviewApplication.tsx",
      "src/pages/requirements/ChecklistPage.tsx",
    ],
    rules: { "jsx-a11y/interactive-supports-focus": "warn" },
  },
  {
    files: ["src/components/chat/DocumentManager.tsx"],
    rules: { "jsx-a11y/no-noninteractive-element-to-interactive-role": "warn" },
  },
  {
    files: [
      "src/pages/dashboard/components/FeatureRolloutModeSelector.tsx",
      "src/pages/dashboard/components/FeatureRolloutsTab.tsx",
    ],
    rules: { "jsx-a11y/label-has-associated-control": "warn" },
  },

  {
    files: ["src/components/chat/ChatMessage.tsx"],
    rules: { "react-hooks/rules-of-hooks": "warn" },
  },
  {
    files: ["src/components/chat/ChatInputPanel.tsx"],
    rules: { "@typescript-eslint/no-explicit-any": "warn" },
  },
  {
    files: ["src/hooks/use-feature-rollout-access.ts"],
    rules: { "no-empty": "warn" },
  },
  {
    files: ["src/pages/document-editor/ProjectBasics.tsx"],
    rules: { "no-case-declarations": "warn" },
  },
  {
    files: ["src/pages/home/GrantsTable.tsx"],
    rules: { "prefer-const": "warn" },
  },
]);

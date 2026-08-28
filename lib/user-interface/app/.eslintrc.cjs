module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
    "plugin:react/recommended",
    "plugin:jsx-a11y/strict",
    "plugin:react/jsx-runtime",
  ],
  ignorePatterns: ["dist", ".eslintrc.cjs"],
  parser: "@typescript-eslint/parser",
  plugins: ["react", "react-refresh", "jsx-a11y"],
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
  },
  overrides: [
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
  ],
};

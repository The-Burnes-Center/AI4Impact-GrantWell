import { defineConfig } from "vitest/config";
import path from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@active-instance": path.resolve(__dirname, "config/instances/neutral.ts"),
      "@chrome": path.resolve(__dirname, "config/chrome.ts"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup-tests.ts"],
    include: ["tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["node_modules/**", "dist/**", "tests/a11y/**"],
    css: false,
    restoreMocks: true,
    clearMocks: true,
  },
});

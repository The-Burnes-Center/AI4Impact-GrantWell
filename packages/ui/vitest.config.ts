import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}", "vite/**/*.test.ts"],
      setupFiles: ["./src/test/setup.ts"],
      restoreMocks: true,
    },
  })
);

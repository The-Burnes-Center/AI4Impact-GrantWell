import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Handler tests run without the synth, via vitest.lambda.config.ts (npm run test:lambda).
    exclude: ["test/lambda/**", "**/node_modules/**"],
    globalSetup: ["test/global-setup.ts"],
  },
});

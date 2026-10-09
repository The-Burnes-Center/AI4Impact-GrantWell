import * as path from "node:path";
import { defineConfig } from "vitest/config";

// Handler tests only: no CDK synth, the real SDK clients (pinned to the Lambda runtime's version)
// faked at send() with aws-sdk-client-mock, and the real grantwell-shared layer.
export default defineConfig({
  resolve: {
    alias: {
      "grantwell-shared": path.join(
        __dirname,
        "lib/chatbot-api/functions/layers/js-shared-layer/nodejs/node_modules/grantwell-shared/index.mjs"
      ),
    },
  },
  test: {
    include: ["test/lambda/**/*.test.ts"],
    // The layer sits under a node_modules path; inlining it makes it share the SDK instances the
    // tests mock instead of loading its own copy.
    server: { deps: { inline: [/grantwell-shared/] } },
    restoreMocks: true,
    unstubGlobals: true,
  },
});

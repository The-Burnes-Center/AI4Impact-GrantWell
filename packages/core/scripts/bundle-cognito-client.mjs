#!/usr/bin/env node
/**
 * Builds lib/chatbot-api/functions/user-management/users/vendor/cognito-client.mjs: the Cognito
 * commands the nodejs24.x runtime's bundled SDK doesn't have yet, from the pinned devDependency.
 * test/cognito-client-bundle.test.ts fails when the committed file is stale.
 *
 *   node scripts/bundle-cognito-client.mjs
 */

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));

export const BUNDLE_PATH = path.join(
  here,
  "../lib/chatbot-api/functions/user-management/users/vendor/cognito-client.mjs"
);

const ENTRY = `export { AdminDeleteSoftwareTokenCommand, CognitoIdentityProviderClient } from "@aws-sdk/client-cognito-identity-provider";`;

export async function buildCognitoClientBundle() {
  const result = await build({
    stdin: { contents: ENTRY, resolveDir: here, loader: "js" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node24",
    minify: true,
    legalComments: "none",
    // The SDK's CommonJS require() calls need a real require inside an .mjs file.
    banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
    write: false,
  });
  return result.outputFiles[0].text;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(BUNDLE_PATH, await buildCognitoClientBundle());
  console.log(`Wrote ${path.relative(process.cwd(), BUNDLE_PATH)}`);
}

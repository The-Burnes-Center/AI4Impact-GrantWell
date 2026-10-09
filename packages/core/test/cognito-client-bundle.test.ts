import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs script without types
import { BUNDLE_PATH, buildCognitoClientBundle } from "../scripts/bundle-cognito-client.mjs";

const handlerPath = path.join(
  __dirname,
  "../lib/chatbot-api/functions/user-management/users/index.mjs"
);

describe("Cognito client bundle for user management", () => {
  it("matches a fresh build from the pinned SDK (run scripts/bundle-cognito-client.mjs)", async () => {
    expect(readFileSync(BUNDLE_PATH, "utf8") === (await buildCognitoClientBundle())).toBe(true);
  });

  // Under plain node, not vitest: vitest's module runner supplies a require() that Lambda's
  // ESM loader doesn't, which once hid a bundle that threw on import.
  it("loads under plain node and sends a request", () => {
    const script = `
      const m = await import(${JSON.stringify(pathToFileURL(BUNDLE_PATH).href)});
      const client = new m.CognitoIdentityProviderClient({
        region: "us-east-1",
        endpoint: "http://127.0.0.1:9",
        credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "example" },
        maxAttempts: 1,
      });
      try {
        await client.send(new m.AdminDeleteSoftwareTokenCommand({ UserPoolId: "us-east-1_example", Username: "nobody" }));
      } catch (e) {
        console.log(e.code ?? e.name);
      }`;
    const out = execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    expect(out.trim()).toBe("ECONNREFUSED");
  });

  it("keeps the reset command out of the handler's static runtime-SDK import", () => {
    const source = readFileSync(handlerPath, "utf8");
    const staticImport = source.match(/import\s*\{([^}]*)\}\s*from\s*"@aws-sdk\/client-cognito-identity-provider"/);
    expect(staticImport).not.toBeNull();
    expect(staticImport![1]).not.toContain("AdminDeleteSoftwareTokenCommand");
  });
});

import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { redactDiff } from "../../../../scripts/redact-diff.mjs";

const SCRIPT = path.join(__dirname, "../../../../scripts/redact-diff.mjs");

// Shapes cdk diff --method template --no-color prints, with an old value no current secret matches.
const TREE = [
  "Stack grantwell-staging-App",
  "Resources",
  "[~] AWS::Lambda::Function ChatHandler ChatHandlerA1B2",
  " └─ [~] Environment",
  "     └─ [~] .Variables:",
  "         ├─ [~] .MODEL_ID:",
  "         │   ├─ [-] us.anthropic.claude-old",
  "         │   └─ [+] us.anthropic.claude-new",
  "         ├─ [~] .TURNSTILE_SECRET_KEY:",
  "         │   ├─ [-] 0x4AAAAold-rotated-secret",
  "         │   └─ [+] 0x4AAAAcurrent-secret",
  "         └─ [~] .GRANTS_GOV_API_KEY:",
  "             ├─ [-] old-grants-key-123",
  "             └─ [+] current-grants-key",
  "[~] AWS::Lambda::Function Scraper Scraper99",
  " └─ [~] Timeout",
  "     ├─ [-] 60",
  "     └─ [+] 120",
].join("\n");

describe("prod diff redaction", () => {
  it("replaces the current secret values by name, as before", () => {
    const out = redactDiff("token current-grants-key here", { GRANTS_GOV_API_KEY: "current-grants-key" });
    expect(out).toBe("token <GRANTS_GOV_API_KEY> here");
  });

  it("redacts old and new values of a secret-named variable in the tree form", () => {
    const out = redactDiff(TREE, { TURNSTILE_SECRET_KEY: "0x4AAAAcurrent-secret" });
    expect(out).not.toMatch(/old-rotated-secret|current-secret|old-grants-key|current-grants-key/);
    expect(out).toContain("         ├─ [~] .TURNSTILE_SECRET_KEY:\n         │   ├─ [-] <redacted>\n         │   └─ [+] <redacted>");
    expect(out).toContain("├─ [-] us.anthropic.claude-old");
    expect(out).toContain(" └─ [~] Timeout\n     ├─ [-] 60\n     └─ [+] 120");
  });

  it("redacts secret-named key-value pairs in JSON, escaped JSON and NAME=value forms", () => {
    const out = redactDiff(
      [
        '[+] {"Environment":{"Variables":{"TURNSTILE_SECRET_KEY":"0x4AAAold","STAGE":"prod"}}}',
        '      "GRANTS_GOV_API_KEY": "old-grants-key-123",',
        '"Command": "{\\"SLACK_TOKEN\\":\\"xoxb-old\\",\\"REGION\\":\\"us-east-1\\"}"',
        "export DB_PASSWORD=hunter2 STAGE=prod",
        '{"Key": "Project", "Value": "GrantWell"}',
      ].join("\n")
    );
    expect(out).not.toMatch(/0x4AAAold|old-grants-key|xoxb-old|hunter2/);
    expect(out).toContain('"TURNSTILE_SECRET_KEY":"<redacted>","STAGE":"prod"');
    expect(out).toContain('"GRANTS_GOV_API_KEY": "<redacted>",');
    expect(out).toContain('\\"SLACK_TOKEN\\":\\"<redacted>\\",\\"REGION\\":\\"us-east-1\\"');
    expect(out).toContain("DB_PASSWORD=<redacted> STAGE=prod");
    expect(out).toContain('{"Key": "Project", "Value": "GrantWell"}');
  });

  it("runs as the CI filter from stdin with the secrets in its environment", () => {
    const out = execFileSync("node", [SCRIPT], {
      input: TREE,
      env: { PATH: process.env.PATH, GRANTS_GOV_API_KEY: "current-grants-key" },
      encoding: "utf8",
    });
    expect(out).not.toMatch(/old-rotated-secret|current-secret|old-grants-key|current-grants-key/);
    expect(out).toContain("Stack grantwell-staging-App");
  });
});

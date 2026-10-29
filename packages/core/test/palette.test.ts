// grantwell-check's palette copy against the shared fixture; packages/ui/src/common/palette.test.ts
// holds the browser copy to the same cases.
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { derivedTints, findContrastFailures, resolvePalette } from "../lib/config/palette";

const { cases } = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "palette.json"), "utf8"));

describe("palette", () => {
  it.each(cases.map((c: any) => [c.name, c]))("%s", (_name, c: any) => {
    expect(resolvePalette(c.colors)).toEqual(c.palette);
    expect(derivedTints(c.colors.primary) ?? null).toEqual(c.tints);
    expect(findContrastFailures(c.colors).map(({ usage, ratio, required }) => ({ usage, ratio, required }))).toEqual(c.failures);
  });

  it("mirrors the UI copy line for line", () => {
    const body = (file: string) => fs.readFileSync(file, "utf8").replace(/^\/\*\*[\s\S]*?\*\/\n/, "");
    expect(body(path.join(__dirname, "..", "lib", "config", "palette.ts"))).toBe(
      body(path.join(__dirname, "..", "..", "ui", "src", "common", "palette.ts"))
    );
  });
});

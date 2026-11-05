import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { extractFacts, unsupportedFacts } from "grantwell-shared";

const LAYER = "lib/chatbot-api/functions/layers/js-shared-layer/nodejs/node_modules/grantwell-shared/fact-check.mjs";
const CHAT = "lib/chatbot-api/functions/websocket-chat/fact-check.mjs";

const GRANT = [
  "Applications are due March 14, 2026 at 11:59 PM Eastern. Letters of intent by 1/15/2026.",
  "Awards range from $50,000 to $1,500,000; total funding is $12 million. A 20 percent match is required.",
  "Up to twelve awards. Projects may last 36 months. See Section D.4 and 2 CFR 200.",
].join(" ");
const keys = (t: string) => extractFacts(t).map((f: { key: string }) => f.key);
const missing = (t: string, sources = [GRANT]) => unsupportedFacts(t, sources).map((f: { raw: string }) => f.raw);

describe("fact check", () => {
  it("normalizes dates, money, percentages and times", () => {
    expect(keys("Due Mar. 14th, 2026, 14 March 2026, 2026-03-14 and 3/14/26.")).toEqual(Array(4).fill("date:2026-03-14"));
    expect(keys("$1.5 million, $1,500,000, $1.5M and 1.5 million dollars")).toEqual(Array(4).fill("money:1500000"));
    expect(keys("20% or 20 percent")).toEqual(["pct:20", "pct:20"]);
    expect(keys("by 11:59 p.m., 5 pm or 17:00")).toEqual(["time:23:59", "time:17:00", "time:17:00"]);
    expect(keys("in March 2026, on March 14, about 36 months")).toEqual(["month:2026-03", "md:03-14", "num:36"]);
  });

  it("accepts facts the grant states in another format", () => {
    expect(missing("Due **March 14** at 11:59 p.m.; awards up to $1.5 million with a 20% match; 12 awards over 36 months; total $12,000,000; LOI by January 15, 2026.")).toEqual([]);
    expect(missing("See section D.4 and 2 CFR 200 for 2026.")).toEqual([]);
  });

  it("flags facts no source states", () => {
    expect(missing("Due April 1, 2026. Cap $75,000. A 25% match. 3 awards. Closes at 5:00 PM.")).toEqual([
      "April 1, 2026", "$75,000", "25%", "5:00 PM.", "3",
    ]);
  });

  it("lets the user's own facts through and ignores list numbering, links and emails", () => {
    expect(missing("Your 14 buses and $415,000 match qualify.", [GRANT, "We run 14 buses; the board approved $415,000."])).toEqual([]);
    expect(missing("1. Apply at https://grants.gov/x/123\n2. Email help99@example.org")).toEqual([]);
  });

  it("keeps the chat copy identical to the layer's", () => {
    expect(fs.readFileSync(CHAT, "utf8")).toBe(fs.readFileSync(LAYER, "utf8"));
  });
});

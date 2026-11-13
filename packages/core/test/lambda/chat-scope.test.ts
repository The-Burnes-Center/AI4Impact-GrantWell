import { describe, expect, it } from "vitest";
import { getPromptText, OUT_OF_SCOPE_REPLY } from "../../lib/chatbot-api/functions/websocket-chat/prompt.mjs";

describe("chat scope", () => {
  for (const source of ["fullText", "summary"] as const) {
    it(`limits the ${source} chat to the grant and the user's documents, with one fixed refusal`, () => {
      const prompt = getPromptText("MA", { source });
      expect(prompt).toContain(`reply with exactly this sentence and nothing else: "${OUT_OF_SCOPE_REPLY}"`);
      expect(prompt).toContain("no emails, letters, titles, rewrites, drafts");
      expect(prompt).not.toContain("do it or decline it");
      expect(prompt).not.toMatch(/point the user to it|Briefly name the limit/);
    });
  }

  it("refuses drafting requests in its examples and answers document questions", () => {
    const prompt = getPromptText("MA");
    expect(prompt).toContain(`<user>Draft an email to our chairman asking to apply.</user>\n<assistant>${OUT_OF_SCOPE_REPLY}</assistant>`);
    expect(prompt).toContain("<user>What does my uploaded budget say about staff costs?</user>");
  });

  it("names only accepted application types and compares dates with today", () => {
    const prompt = getPromptText("MA");
    expect(prompt).toContain("Name only application types this grant accepts");
    expect(prompt).toContain("only a date before today has passed");
    expect(prompt).toContain("never state today's date itself");
  });

  it("keeps the conditions attached to amounts, limits and lists", () => {
    expect(getPromptText("MA")).toContain("include the conditions the grant attaches to it");
    expect(getPromptText("MA")).toContain('say "No, except …", not "generally no"');
  });

  it("lists every date for applying, including passed earlier steps", () => {
    expect(getPromptText("MA")).toContain("including pre-applications, letters of intent and other required earlier steps, even when they have passed");
    expect(getPromptText("MA")).not.toContain("unless the sentence already says it has passed");
  });
});

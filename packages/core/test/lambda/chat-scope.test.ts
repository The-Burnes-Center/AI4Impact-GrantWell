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

  it("doesn't double the passed marker", () => {
    expect(getPromptText("MA")).toContain("writing (passed) right after that date unless the sentence already says it has passed");
  });
});

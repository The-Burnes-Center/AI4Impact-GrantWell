// The chat sees its whole history (cached), and the check reports grant text copied into an answer.
import { describe, expect, it } from "vitest";
import { buildChatRequest } from "../../lib/chatbot-api/functions/websocket-chat/prompt.mjs";
import { calculationResults, meaningRequest, verbatimTail } from "../../lib/chatbot-api/functions/websocket-chat/verify.mjs";

const GRANT = `Applications must be submitted through Grants.gov by the time and date deadline. Applications received after the closing time and date deadline will be deemed ineligible and will not be considered for funding, unless the applicant can document a Grants.gov system problem.`;

const breakpoints = (request: { system: any[]; messages: any[] }) =>
  JSON.stringify(request).split('"cache_control"').length - 1;

describe("chat history", () => {
  it("caches the history after the last earlier answer and stays within four breakpoints", () => {
    const request = buildChatRequest({
      instructions: "RULES",
      grantText: GRANT,
      citations: true,
      applicantDocuments: [{ type: "text", text: "Budget letter" }],
      context: "Today's date is November 11, 2026.",
      turns: [
        { user: "First question", chatbot: "First answer" },
        { user: "Second question", chatbot: "Second answer" },
      ],
      question: "Summarize what we talked about",
    });

    expect(breakpoints(request)).toBe(3);
    expect(request.messages[3].content).toEqual([{ type: "text", text: "Second answer", cache_control: { type: "ephemeral" } }]);
    expect(request.messages[1].content[0]).not.toHaveProperty("cache_control");
    expect(request.messages.at(-1).content.map((b: any) => b.text)).toEqual(["Today's date is November 11, 2026.", "Summarize what we talked about"]);
  });

  it("adds no history breakpoint on a chat's first question", () => {
    const request = buildChatRequest({ instructions: "RULES", grantText: GRANT, citations: true, context: "ctx", turns: [], question: "Hi" });
    expect(breakpoints(request)).toBe(1);
  });
});

describe("answer check inputs", () => {
  it("gives the check the newest turns that fit, labelled as being for sentences about the chat", () => {
    const old = { user: "x".repeat(30000), chatbot: "old answer" };
    const recent = { user: "Do we need a match?", chatbot: "Most projects need one." };
    const body = meaningRequest({ units: [{ start: 0, end: 4, text: "Hi." }], grantText: GRANT, history: [old, old, recent], question: "Summarize" });
    const prompt = body.messages[0].content.at(-1).text;

    expect(prompt).toContain("<user>Do we need a match?</user>\n<assistant>Most projects need one.</assistant>");
    expect(prompt.split("<user>").length - 1).toBe(2);
    expect(prompt).toContain("<question>Summarize</question>");
  });
});

describe("copied grant text", () => {
  it("returns a closing paragraph copied from the grant", () => {
    const answer = `There's no grace period for late submissions.\n\n${GRANT}`;
    expect(verbatimTail(answer, GRANT)).toBe(GRANT);
  });

  it("ignores a paraphrased closing paragraph, a one-paragraph answer and a short quote", () => {
    expect(verbatimTail(`No grace period.\n\nSubmit through Grants.gov before the deadline; a late application is only considered if you can show Grants.gov itself failed.`, GRANT)).toBeNull();
    expect(verbatimTail(GRANT, GRANT)).toBeNull();
    expect(verbatimTail("No grace period.\n\nApplications must be submitted through Grants.gov.", GRANT)).toBeNull();
  });
});

describe("arithmetic on the user's figures", () => {
  it("takes the result of each shown calculation as a known number", () => {
    const answer = "**Up to $337,500**, using your figures.\n\n- Non-federal match: 25% × $450,000 = $112,500\n- Federal request: $450,000 − $112,500 = $337,500";
    expect(calculationResults(answer)).toEqual(["$112,500", "$337,500"]);
  });

  it("ignores equals signs that aren't a calculation", () => {
    expect(calculationResults("Score = 130 points. Region 1 cap: $3,000,000.")).toEqual([]);
  });
});

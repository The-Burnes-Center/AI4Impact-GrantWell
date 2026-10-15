import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { testConfig } from "../../test/render";
import { DraftsClient } from "./drafts-client";

const START = "POST /draft-generation";

describe("DraftsClient.startDraftGeneration", () => {
  it("sends the additional information and each answer with its question", async () => {
    const net = stubFetch({ [START]: json({ jobId: "job-1" }) });
    const jobId = await new DraftsClient(testConfig).startDraftGeneration({
      query: "Generate all sections",
      documentIdentifier: "Grant A",
      questionnaire: { question_1: "Rural seniors" },
      questionnaireAnswers: [{ question: "Who will the project serve?", answer: "Rural seniors" }],
      additionalInfo: "We partner with the council on aging.",
      sessionId: "s1",
    });
    expect(jobId).toBe("job-1");
    expect(net.last(START).body).toEqual({
      query: "Generate all sections",
      documentIdentifier: "Grant A",
      projectBasics: {},
      questionnaire: { question_1: "Rural seniors" },
      questionnaireAnswers: [{ question: "Who will the project serve?", answer: "Rural seniors" }],
      additionalInfo: "We partner with the council on aging.",
      sessionId: "s1",
    });
  });
});

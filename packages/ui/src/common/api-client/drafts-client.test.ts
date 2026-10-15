import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { testConfig } from "../../test/render";
import { DraftsClient, InputTooLongError } from "./drafts-client";

const DOCX = "POST /generate-docx";
const PDF = "POST /generate-pdf";
const client = () => new DraftsClient(testConfig);
const draft = { title: "Application", sections: { Summary: "Text" } };

describe("DraftsClient exports", () => {
  it("asks for contact details on the cover only when told to", async () => {
    const net = stubFetch({
      [DOCX]: () => new Response("docx", { status: 200 }),
      [PDF]: () => json({ jobId: "job-1" }, 202),
    });

    await client().generateDOCX(draft);
    await client().generateDOCX({ ...draft, includeContactDetails: true });
    await client().startPdfExport(draft);
    await client().startPdfExport({ ...draft, includeContactDetails: true });

    expect(net.to(DOCX).map((r) => (r.body as { includeContactDetails: boolean }).includeContactDetails)).toEqual([false, true]);
    expect(net.to(PDF).map((r) => (r.body as { includeContactDetails: boolean }).includeContactDetails)).toEqual([false, true]);
  });
});

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

  it("carries the API's message when additional information or an answer is too long", async () => {
    const message = "Additional information can be up to 10,000 characters.";
    stubFetch({ [START]: json({ error: "INPUT_TOO_LONG", message }, 400) });
    const started = new DraftsClient(testConfig).startDraftGeneration({
      query: "q",
      documentIdentifier: "Grant A",
      additionalInfo: "x".repeat(10001),
      sessionId: "s1",
    });
    await expect(started).rejects.toBeInstanceOf(InputTooLongError);
    await expect(started).rejects.toThrow(message);
  });
});

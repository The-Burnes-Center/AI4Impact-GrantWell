import { describe, expect, it } from "vitest";
import { json, stubFetch } from "../../test/fetch-routes";
import { testConfig } from "../../test/render";
import { DraftsClient } from "./drafts-client";

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

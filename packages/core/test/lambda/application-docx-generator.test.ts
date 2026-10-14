import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const htmlToDocx = vi.hoisted(() => vi.fn(async (_html: string) => Buffer.from("docx")));

vi.mock("module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("module")>();
  const fakes: Record<string, unknown> = {
    "html-to-docx": htmlToDocx,
    jszip: { loadAsync: async () => ({ file: () => null }) },
  };
  return { ...actual, createRequire: () => (id: string) => fakes[id] };
});

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  ({ handler } = await import("../../lib/chatbot-api/functions/application-docx-generator/index.mjs"));
});

beforeEach(() => {
  htmlToDocx.mockClear();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const draftData = {
  title: "Application for Clean Water",
  projectBasics: {
    projectName: "River Project",
    organizationName: "Town of Example",
    contactName: "Pat Example",
    contactEmail: "pat@example.org",
  },
  sections: { Summary: "We will clean the river." },
};

const exportDocx = async (body: Record<string, unknown>) => {
  const res = await handler({ body: JSON.stringify(body) });
  expect(res.statusCode).toBe(200);
  return htmlToDocx.mock.calls[0][0];
};

describe("application docx generator cover", () => {
  it("leaves contact details off the cover by default", async () => {
    const html = await exportDocx({ draftData });
    expect(html).toContain("River Project");
    expect(html).toContain("Town of Example");
    expect(html).not.toContain("Pat Example");
    expect(html).not.toContain("pat@example.org");
    expect(html).not.toContain("Contact");
  });

  it("leaves snake_case contact fields off the cover too", async () => {
    const html = await exportDocx({
      draftData: { ...draftData, projectBasics: { contact_name: "Pat Example", contact_email: "pat@example.org" } },
      includeContactDetails: false,
    });
    expect(html).not.toContain("Pat Example");
    expect(html).not.toContain("pat@example.org");
  });

  it("puts contact details on the cover when the request opts in", async () => {
    const html = await exportDocx({ draftData, includeContactDetails: true });
    expect(html).toContain("<strong>Primary Contact Name:</strong> Pat Example");
    expect(html).toContain("<strong>Contact Email:</strong> pat@example.org");
    expect(html).toContain("River Project");
  });

  it("still rejects a request without draftData", async () => {
    const res = await handler({ body: JSON.stringify({}) });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("draftData is required");
  });
});

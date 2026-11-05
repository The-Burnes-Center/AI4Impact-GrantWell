import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({
  setContent: vi.fn(async (_html: string) => {}),
  launch: vi.fn(),
  page: {} as Record<string, any>,
}));
const setContent = browser.setContent;

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: ["--no-sandbox", "--disable-web-security", "--allow-running-insecure-content", "--single-process"],
    executablePath: async () => "/chromium",
  },
}));
vi.mock("puppeteer-core", () => ({
  default: {
    launch: async (options: unknown) => {
      browser.launch(options);
      const listeners: Record<string, (r: unknown) => void> = {};
      browser.page = {
        setContent: browser.setContent,
        setJavaScriptEnabled: vi.fn(async () => {}),
        setRequestInterception: vi.fn(async () => {}),
        on: (event: string, fn: (r: unknown) => void) => (listeners[event] = fn),
        listeners,
        evaluate: async () => {},
        pdf: async () => new Uint8Array([37, 80, 68, 70]),
      };
      return { newPage: async () => browser.page, close: async () => {} };
    },
  },
}));

const ddb = mockClient(DynamoDBClient);
const lambda = mockClient(LambdaClient);

let handler: (event: any) => Promise<{ statusCode: number; body: string }>;
beforeAll(async () => {
  vi.stubEnv("EXPORTS_BUCKET", "exports");
  vi.stubEnv("EXPORT_JOBS_TABLE_NAME", "jobs");
  vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "pdf-generator");
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  ({ handler } = await import("../../lib/chatbot-api/functions/application-pdf-generator/index.mjs"));
});

beforeEach(() => {
  ddb.reset();
  lambda.reset();
  ddb.on(PutItemCommand).resolves({});
  lambda.on(InvokeCommand).resolves({});
  setContent.mockClear();
  browser.launch.mockClear();
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

const exportPdf = async (body: Record<string, unknown>) => {
  const res = await handler({ body: JSON.stringify(body) });
  expect(res.statusCode).toBe(200);
  return setContent.mock.calls[0][0];
};

const startAsyncExport = async (body: Record<string, unknown>) => {
  const res = await handler({
    body: JSON.stringify({ async: true, ...body }),
    requestContext: { authorizer: { jwt: { claims: { sub: "owner" } } } },
  });
  expect(res.statusCode).toBe(202);
  const payload = lambda.commandCalls(InvokeCommand)[0].args[0].input.Payload as Uint8Array;
  return JSON.parse(Buffer.from(payload).toString()).exportWorker.draftData;
};

describe("application pdf generator cover", () => {
  it("leaves contact details off the cover by default", async () => {
    const html = await exportPdf({ draftData });
    expect(html).toContain("River Project");
    expect(html).toContain("Town of Example");
    expect(html).not.toContain("Pat Example");
    expect(html).not.toContain("pat@example.org");
    expect(html).not.toContain("Contact");
  });

  it("puts contact details on the cover when the request opts in", async () => {
    const html = await exportPdf({ draftData, includeContactDetails: true });
    expect(html).toContain("<strong>Primary Contact Name:</strong> Pat Example");
    expect(html).toContain("<strong>Contact Email:</strong> pat@example.org");
  });

  it("does not hand contact details to the async export worker unless the request opts in", async () => {
    const withheld = await startAsyncExport({ draftData });
    expect(withheld.projectBasics).toEqual({ projectName: "River Project", organizationName: "Town of Example" });

    lambda.resetHistory();
    const included = await startAsyncExport({ draftData, includeContactDetails: true });
    expect(included.projectBasics).toMatchObject({ contactName: "Pat Example", contactEmail: "pat@example.org" });
  });

  it("exports sections in the application's order under their names", async () => {
    const html = await exportPdf({
      draftData: {
        ...draftData,
        sections: { "2": "Second text.", need: "Need text.", "custom-annex": "Annex text." },
        sectionOrder: [
          { id: "need", name: "Statement of Need" },
          { id: "2", name: "Budget" },
          { id: "custom-annex", name: "Annex" },
        ],
      },
    });
    const at = (text: string) => html.indexOf(text);
    expect(at("Statement of Need")).toBeGreaterThan(-1);
    expect(at("Need text.")).toBeLessThan(at("Second text."));
    expect(at("Second text.")).toBeLessThan(at("Annex text."));
    expect(html).toContain("2. Budget");
    expect(html).not.toContain("custom-annex");
  });

  it("renders with JavaScript off, no network and Chromium's web security on", async () => {
    await exportPdf({ draftData });
    const options = browser.launch.mock.calls[0][0];
    expect(options.args).toEqual(["--no-sandbox", "--single-process"]);
    expect(options).not.toHaveProperty("ignoreHTTPSErrors");
    expect(browser.page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(browser.page.setRequestInterception).toHaveBeenCalledWith(true);
    const outcome = (url: string) => {
      const request = { url: () => url, continue: vi.fn(), abort: vi.fn() };
      browser.page.listeners.request(request);
      return request.continue.mock.calls.length ? "continue" : "abort";
    };
    expect(outcome("data:image/png;base64,AAAA")).toBe("continue");
    expect(outcome("about:blank")).toBe("continue");
    expect(outcome("https://fonts.example.com/a.woff2")).toBe("abort");
    expect(outcome("file:///etc/passwd")).toBe("abort");
  });

  it("still rejects a request without draftData", async () => {
    const res = await handler({ body: JSON.stringify({}) });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("draftData is required");
  });
});

import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const setContent = vi.hoisted(() => vi.fn(async (_html: string) => {}));

vi.mock("@sparticuz/chromium", () => ({ default: { args: [], executablePath: async () => "/chromium" } }));
vi.mock("puppeteer-core", () => ({
  default: {
    launch: async () => ({
      newPage: async () => ({ setContent, evaluate: async () => {}, pdf: async () => new Uint8Array([37, 80, 68, 70]) }),
      close: async () => {},
    }),
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

  it("still rejects a request without draftData", async () => {
    const res = await handler({ body: JSON.stringify({}) });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe("draftData is required");
  });
});

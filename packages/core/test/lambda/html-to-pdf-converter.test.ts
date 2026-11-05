import { mockClient } from "aws-sdk-client-mock";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const browser = vi.hoisted(() => ({ launch: vi.fn(), page: {} as Record<string, any> }));

vi.mock("@sparticuz/chromium", () => ({
  default: {
    args: ["--no-sandbox", "--disable-web-security", "--allow-running-insecure-content", "--no-zygote"],
    executablePath: async () => "/chromium",
  },
}));
vi.mock("puppeteer-core", () => ({
  default: {
    launch: async (options: unknown) => {
      browser.launch(options);
      const listeners: Record<string, (r: unknown) => void> = {};
      browser.page = {
        setJavaScriptEnabled: vi.fn(async () => {}),
        setRequestInterception: vi.fn(async () => {}),
        on: (event: string, fn: (r: unknown) => void) => (listeners[event] = fn),
        listeners,
        setContent: vi.fn(async () => {}),
        evaluate: async () => {},
        pdf: async () => new Uint8Array([37, 80, 68, 70]),
      };
      return { newPage: async () => browser.page, close: async () => {} };
    },
  },
}));

const s3 = mockClient(S3Client);
const ddb = mockClient(DynamoDBClient);

let handler: (event: any) => Promise<unknown>;
beforeAll(async () => {
  vi.stubEnv("BUCKET", "nofos");
  vi.stubEnv("REVIEW_TABLE_NAME", "reviews");
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "AKIDEXAMPLE");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "example");
  ({ handler } = await import("../../lib/chatbot-api/functions/landing-page/html-to-pdf-converter/index.mjs"));
});

beforeEach(() => {
  s3.reset();
  ddb.reset();
  browser.launch.mockClear();
  ddb.on(PutItemCommand).resolves({});
  s3.on(PutObjectCommand).resolves({});
  s3.on(DeleteObjectCommand).resolves({});
  s3.on(GetObjectCommand).resolves({
    Body: (async function* () {
      yield Buffer.from(`<html><body><h1>Notice</h1><p>${"Eligibility text. ".repeat(400)}</p></body></html>`);
    })() as any,
  });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const convert = () =>
  handler({
    Records: [{ s3: { bucket: { name: "nofos" }, object: { key: "pending-conversion/Bridge+Grant/NOFO-File-HTML.html" } } }],
  });

describe("scraped HTML to PDF", () => {
  it("launches Chromium without the web-security and insecure-content switches", async () => {
    await convert();
    const options = browser.launch.mock.calls[0][0];
    expect(options.args).toEqual(["--no-sandbox", "--no-zygote"]);
    expect(options).not.toHaveProperty("ignoreHTTPSErrors");
  });

  it("renders with JavaScript off and every non-inline request aborted", async () => {
    await convert();
    expect(browser.page.setJavaScriptEnabled).toHaveBeenCalledWith(false);
    expect(browser.page.setRequestInterception).toHaveBeenCalledWith(true);
    expect(browser.page.setJavaScriptEnabled.mock.invocationCallOrder[0]).toBeLessThan(
      browser.page.setContent.mock.invocationCallOrder[0]
    );
    const outcome = (url: string) => {
      const request = { url: () => url, continue: vi.fn(), abort: vi.fn() };
      browser.page.listeners.request(request);
      return request.continue.mock.calls.length ? "continue" : "abort";
    };
    expect(outcome("data:text/css,body{}")).toBe("continue");
    expect(outcome("blob:null/1234")).toBe("continue");
    expect(outcome("about:blank")).toBe("continue");
    expect(outcome("http://169.254.169.254/latest/meta-data/")).toBe("abort");
    expect(outcome("https://agency.gov/logo.png")).toBe("abort");
    expect(outcome("file:///var/task/index.mjs")).toBe("abort");
  });

  it("still uploads the PDF and removes the staged HTML", async () => {
    await convert();
    expect(s3.commandCalls(PutObjectCommand)[0].args[0].input).toMatchObject({
      Bucket: "nofos",
      Key: "Bridge Grant/NOFO-File-PDF",
      ContentType: "application/pdf",
    });
    expect(s3.commandCalls(DeleteObjectCommand)[0].args[0].input.Key).toBe("pending-conversion/Bridge Grant/NOFO-File-HTML.html");
  });
});

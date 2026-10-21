import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile } from "../../lib/chatbot-api/functions/nofo-scraper/opportunity-processor/download.mjs";

let server: Server;
let base: string;
let tlsAttempts: number;
let requests: { path: string; headers: IncomingMessage["headers"] }[];
let handle: (req: IncomingMessage, res: ServerResponse) => void;

beforeEach(async () => {
  tlsAttempts = 0;
  requests = [];
  server = createServer((req, res) => {
    requests.push({ path: req.url!, headers: req.headers });
    handle(req, res);
  });
  // A TLS ClientHello sent to this plain-HTTP server is a malformed request.
  server.on("clientError", (_err, socket) => {
    tlsAttempts++;
    socket.destroy();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

describe("opportunity processor downloads", () => {
  it("tries https first for an http:// link and falls back to http", async () => {
    handle = (_req, res) => res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF-1.7");

    const file = await downloadFile(`${base}/nofo.pdf`);

    expect(tlsAttempts).toBe(1);
    expect(requests.map((r) => r.path)).toEqual(["/nofo.pdf"]);
    expect(file).toEqual({ buffer: Buffer.from("%PDF-1.7"), contentType: "application/pdf", finalUrl: `${base}/nofo.pdf` });
  });

  it("never falls back to http for an https:// link", async () => {
    handle = (_req, res) => res.end("should not be reached");

    await expect(downloadFile(base.replace("http:", "https:") + "/nofo.pdf")).rejects.toThrow();
    expect(requests).toEqual([]);
  });

  it("sends a browser user agent and never asks for brotli", async () => {
    handle = (_req, res) => res.end("ok");

    await downloadFile(`${base}/page`);

    expect(requests[0].headers["user-agent"]).toMatch(/^Mozilla\//);
    expect(requests[0].headers["accept-encoding"]).toBe("gzip, deflate");
  });

  it("follows relative redirects and reports the final url", async () => {
    handle = (req, res) =>
      req.url === "/old" ? res.writeHead(302, { location: "/files/new.pdf" }).end() : res.end("%PDF-1.7");

    const file = await downloadFile(`${base}/old`);

    expect(requests.map((r) => r.path)).toEqual(["/old", "/files/new.pdf"]);
    expect(file?.finalUrl).toBe(`${base}/files/new.pdf`);
  });

  it("gives up on a redirect loop", async () => {
    handle = (_req, res) => res.writeHead(301, { location: "/loop" }).end();

    await expect(downloadFile(`${base}/loop`)).rejects.toThrow(/Too many redirects/);
  });

  it("decodes a gzip body", async () => {
    handle = (_req, res) => res.writeHead(200, { "content-encoding": "gzip" }).end(gzipSync("%PDF-1.7 gz"));

    const file = await downloadFile(`${base}/nofo.pdf`);

    expect(file?.buffer.toString()).toBe("%PDF-1.7 gz");
  });

  it("refuses a brotli body it did not ask for", async () => {
    handle = (_req, res) => res.writeHead(200, { "content-encoding": "br" }).end(brotliCompressSync("%PDF-1.7"));

    await expect(downloadFile(`${base}/nofo.pdf`)).rejects.toThrow(/content-encoding "br"/);
  });

  it("returns null for a missing file and throws on a server error", async () => {
    handle = (req, res) => res.writeHead(req.url === "/gone" ? 410 : 500).end();

    await expect(downloadFile(`${base}/gone`)).resolves.toBeNull();
    await expect(downloadFile(`${base}/broken`)).rejects.toThrow(/Download failed 500/);
  });

  it("times out a host that never answers", async () => {
    handle = () => {};

    await expect(downloadFile(`${base}/slow`, { timeoutMs: 200 })).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

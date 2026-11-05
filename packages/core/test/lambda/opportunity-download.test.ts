import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { brotliCompressSync, gzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile as download, isPublicAddress } from "../../lib/chatbot-api/functions/nofo-scraper/opportunity-processor/download.mjs";

// The test server is on loopback, which production refuses; only that one address is let through.
const testServerOnly = (address: string) => address === "127.0.0.1" || isPublicAddress(address);
const downloadFile = (url: string, options: Parameters<typeof download>[1] = {}) =>
  download(url, { isAllowed: testServerOnly, ...options });

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

  it("stops following redirects after five hops", async () => {
    handle = (req, res) => {
      const n = Number(req.url!.slice(1));
      return n < 5 ? res.writeHead(302, { location: `/${n + 1}` }).end() : res.end("%PDF-1.7");
    };
    await expect(downloadFile(`${base}/0`)).resolves.toMatchObject({ finalUrl: `${base}/5` });

    handle = (req, res) => res.writeHead(302, { location: `/${Number(req.url!.slice(1)) + 1}` }).end();
    requests = [];
    await expect(downloadFile(`${base}/0`)).rejects.toThrow(/Too many redirects/);
    expect(requests.map((r) => r.path)).toEqual(["/0", "/1", "/2", "/3", "/4", "/5"]);
  });

  it("refuses loopback, private and link-local hosts by default, by name or address", async () => {
    handle = (_req, res) => res.end("internal");
    const port = (server.address() as AddressInfo).port;

    for (const url of [
      `http://127.0.0.1:${port}/`,
      `http://localhost:${port}/`,
      `http://[::1]:${port}/`,
      "http://169.254.169.254/latest/meta-data/",
      "http://[fd00:ec2::254]/latest/meta-data/",
      "http://10.0.0.5/",
      "http://[::ffff:192.168.1.1]/",
      "http://0x7f.1/",
    ]) {
      await expect(download(url, { timeoutMs: 2000 }), url).rejects.toMatchObject({ code: "ERR_NON_PUBLIC_HOST" });
    }
    expect(requests).toEqual([]);
  });

  it("checks every redirect hop, not only the first host", async () => {
    handle = (_req, res) => res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();

    await expect(downloadFile(`${base}/nofo.pdf`)).rejects.toMatchObject({ code: "ERR_NON_PUBLIC_HOST" });

    handle = (_req, res) => res.writeHead(302, { location: "http://[::1]/admin" }).end();
    await expect(downloadFile(`${base}/nofo.pdf`)).rejects.toMatchObject({ code: "ERR_NON_PUBLIC_HOST" });
  });

  it("aborts a body past the size cap while streaming, with or without a content-length", async () => {
    let written = 0;
    handle = (_req, res) => {
      res.writeHead(200);
      const chunk = Buffer.alloc(64 * 1024);
      const pump = () => {
        while (written < 10 * 1024 * 1024) {
          written += chunk.length;
          if (!res.write(chunk)) return void res.once("drain", pump);
        }
        res.end();
      };
      pump();
    };
    await expect(downloadFile(`${base}/big`, { maxBytes: 1024 * 1024 })).rejects.toMatchObject({ code: "ERR_BODY_TOO_LARGE" });
    expect(written).toBeLessThan(10 * 1024 * 1024);

    handle = (_req, res) => res.writeHead(200, { "content-length": String(2 * 1024 * 1024) }).end(Buffer.alloc(2 * 1024 * 1024));
    await expect(downloadFile(`${base}/big`, { maxBytes: 1024 * 1024 })).rejects.toMatchObject({ code: "ERR_BODY_TOO_LARGE" });
  });

  it("refuses a gzip body that decodes past the size cap", async () => {
    handle = (_req, res) => res.writeHead(200, { "content-encoding": "gzip" }).end(gzipSync(Buffer.alloc(2 * 1024 * 1024)));

    await expect(downloadFile(`${base}/nofo.pdf`, { maxBytes: 1024 * 1024 })).rejects.toMatchObject({ code: "ERR_BUFFER_TOO_LARGE" });
  });

  it("classifies addresses", () => {
    for (const a of ["8.8.8.8", "52.94.236.248", "2600:1f18::1", "::ffff:8.8.8.8"]) expect(isPublicAddress(a), a).toBe(true);
    for (const a of ["127.0.0.1", "10.1.2.3", "172.31.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0",
      "::1", "::", "fe80::1", "fd00:ec2::254", "::ffff:127.0.0.1", "::ffff:a9fe:a9fe", "not-an-ip"]) {
      expect(isPublicAddress(a), a).toBe(false);
    }
  });

  it("times out a host that never answers", async () => {
    handle = () => {};

    await expect(downloadFile(`${base}/slow`, { timeoutMs: 200 })).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

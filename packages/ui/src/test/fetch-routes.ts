import { vi } from "vitest";

export const API = "https://api.test";

export interface RouteRequest {
  method: string;
  url: URL;
  headers: Headers;
  body: unknown;
}

type Reply = Response | ((request: RouteRequest) => Response | Promise<Response>);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const realFetch = globalThis.fetch;
let unexpected: string[] = [];

/**
 * Replaces fetch with a table keyed "METHOD /path" (query ignored; handlers see the full URL).
 * Any other request rejects, and setup.ts fails the test even if the app swallowed the error.
 */
export function stubFetch(routes: Record<string, Reply>) {
  const calls: RouteRequest[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? "GET").toUpperCase();
    const key = `${method} ${url.pathname}`;
    const raw = init?.body;
    const request: RouteRequest = {
      method,
      url,
      headers: new Headers(init?.headers),
      body: typeof raw === "string" ? safeParse(raw) : raw,
    };
    calls.push(request);
    const reply = routes[key];
    if (!reply) {
      unexpected.push(`${key}${url.search}`);
      throw new TypeError(`Unexpected request: ${key}`);
    }
    return typeof reply === "function" ? reply(request) : reply.clone();
  });
  globalThis.fetch = fetch as typeof globalThis.fetch;
  return {
    calls,
    to: (key: string) => calls.filter((c) => `${c.method} ${c.url.pathname}` === key),
    last: (key: string) => {
      const matching = calls.filter((c) => `${c.method} ${c.url.pathname}` === key);
      if (matching.length === 0) throw new Error(`No ${key} request was made`);
      return matching[matching.length - 1];
    },
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function restoreFetch(): string[] {
  globalThis.fetch = realFetch;
  const seen = unexpected;
  unexpected = [];
  return seen;
}

/**
 * Every spec imports `test` and `expect` from here, so each test runs under the guard: it fails
 * the test, once and with the full list, if the app's API answered 5xx, a page threw an uncaught
 * error, the chat socket sent `<!ERROR!>`, or a red notification or the error boundary is on
 * screen when the test ends. 4xx is allowed, and other origins are ignored.
 */
import { test as base, expect, type Page, type Response, type WebSocket } from "@playwright/test";
import { SITE_URL, appConfig } from "./config";

export { expect };
export type { Page };

interface Problem {
  kind: "http" | "pageerror" | "websocket" | "ui";
  detail: string;
}

const SNIPPET = 200;
const snippet = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, SNIPPET);

// Chromium reports this benign layout notice as an uncaught error.
const BENIGN_PAGE_ERRORS = [/ResizeObserver loop/];

/** A page error whose stack names only other origins (analytics, Cloudflare) isn't the app's. */
function isThirdParty(error: Error, siteOrigin: string): boolean {
  const urls = (error.stack ?? "").match(/https?:\/\/[^\s)]+/g) ?? [];
  return urls.length > 0 && urls.every((u) => !u.startsWith(siteOrigin));
}

const NOTIFICATION_ERRORS = '#main-content > [role="alert"] .alert-danger';

async function visibleErrors(page: Page): Promise<string[]> {
  if (page.isClosed()) return [];
  const notifications = page.locator(NOTIFICATION_ERRORS).filter({ visible: true });
  const boundary = page
    .locator(".alert-danger")
    .filter({ has: page.locator(".alert-heading", { hasText: /^Something went wrong$/ }) })
    .filter({ visible: true });
  try {
    return [
      ...(await notifications.allInnerTexts()).map((t) => `error notification: ${snippet(t)}`),
      ...(await boundary.allInnerTexts()).map((t) => `error boundary: ${snippet(t)}`),
    ];
  } catch {
    return [];
  }
}

export const test = base.extend<{ guard: void }>({
  guard: [
    async ({ page }, use, testInfo) => {
      const problems: Problem[] = [];
      const bodies: Promise<void>[] = [];
      const apiOrigin = new URL(appConfig().httpEndpoint).origin;
      const wsEndpoint = appConfig().wsEndpoint;
      const siteOrigin = new URL(SITE_URL).origin;
      const context = page.context();
      let active = true;

      const onResponse = (response: Response) => {
        if (!active || response.status() < 500) return;
        const url = new URL(response.url());
        if (url.origin !== apiOrigin) return;
        const label = `${response.request().method()} ${url.pathname} → ${response.status()}`;
        bodies.push(
          response
            .text()
            .catch(() => "(body unavailable)")
            .then((body) => void problems.push({ kind: "http", detail: `${label}: ${snippet(body)}` }))
        );
      };

      const onPageError = (error: Error) => {
        if (!active || BENIGN_PAGE_ERRORS.some((re) => re.test(error.message))) return;
        if (isThirdParty(error, siteOrigin)) return;
        problems.push({ kind: "pageerror", detail: snippet(`${error.name}: ${error.message}`) });
      };

      // The socket URL carries the ID token, so it is never recorded.
      const onWebSocket = (ws: WebSocket) => {
        if (wsEndpoint ? !ws.url().startsWith(wsEndpoint.replace(/\/$/, "")) : !ws.url().startsWith("wss:")) return;
        ws.on("framereceived", ({ payload }) => {
          const text = String(payload);
          if (active && text.includes("<!ERROR!>")) problems.push({ kind: "websocket", detail: `chat socket: ${snippet(text)}` });
        });
      };

      const watch = (p: Page) => {
        p.on("pageerror", onPageError);
        p.on("websocket", onWebSocket);
      };
      context.on("response", onResponse);
      context.on("page", watch);
      context.pages().forEach(watch);

      await use();

      for (const p of context.pages()) {
        for (const detail of await visibleErrors(p)) problems.push({ kind: "ui", detail });
      }
      active = false;
      await Promise.race([Promise.allSettled(bodies), new Promise((r) => setTimeout(r, 5_000))]);
      context.off("response", onResponse);
      context.off("page", watch);

      if (problems.length === 0) return;
      for (const p of problems) testInfo.annotations.push({ type: `guard: ${p.kind}`, description: p.detail });
      await testInfo.attach("guard-problems.json", {
        body: JSON.stringify(problems, null, 2),
        contentType: "application/json",
      });
      throw new Error(
        `The guard found ${problems.length} problem(s):\n` + problems.map((p) => `  - [${p.kind}] ${p.detail}`).join("\n")
      );
    },
    { auto: true },
  ],
});

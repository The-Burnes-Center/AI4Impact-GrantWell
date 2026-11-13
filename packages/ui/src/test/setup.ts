import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, vi } from "vitest";
import { resetAmplify } from "./amplify";
import { restoreFetch } from "./fetch-routes";
import { resetInstance } from "./instance";

vi.mock("aws-amplify/auth", async () => (await import("./amplify")).auth);
vi.mock("../common/instance", async () => (await import("./instance")).instanceModule());

beforeEach(() => {
  // jsdom has no layout, so no scrollIntoView; tests that check scrolling replace it.
  if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => {};
  resetInstance();
  resetAmplify();
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // A test that stubs storage owns it.
  }
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  const unexpected = restoreFetch();
  if (unexpected.length > 0) {
    throw new Error(`Unexpected requests (add them to stubFetch):\n  ${unexpected.join("\n  ")}`);
  }
});

// ProseMirror's DOM observer schedules its selection sync on a short timer; let it run while jsdom still exists.
afterAll(() => new Promise((resolve) => setTimeout(resolve, 60)));

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { resetAmplify } from "./amplify";
import { restoreFetch } from "./fetch-routes";
import { resetInstance } from "./instance";

vi.mock("aws-amplify/auth", async () => (await import("./amplify")).auth);
vi.mock("../common/instance", async () => (await import("./instance")).instanceModule());

beforeEach(() => {
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

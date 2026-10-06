import { defineConfig } from "@playwright/test";
import { AUTH_FILE, SITE_URL } from "./helpers/config";

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./global-setup",
  globalTeardown: "./global-teardown",

  // One test account: parallel journeys would share its session and data.
  workers: 1,
  fullyParallel: false,
  retries: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "results.json" }]],

  use: {
    baseURL: SITE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    viewport: { width: 1280, height: 900 },
    acceptDownloads: true,
  },

  projects: [
    {
      name: "login",
      testMatch: /auth\.setup\.ts/,
      // A trace would hold the password and the bypass token, and run artifacts are public.
      use: { browserName: "chromium", trace: "off" },
    },
    {
      name: "journeys",
      dependencies: ["login"],
      testIgnore: /auth\.setup\.ts/,
      use: { browserName: "chromium", storageState: AUTH_FILE },
    },
  ],
});

import { defineConfig, devices } from "@playwright/test";

const PUBLIC_BASE_URL = process.env.A11Y_PUBLIC_BASE_URL ?? "http://127.0.0.1:4173";

const skipWebServer = Boolean(process.env.A11Y_SKIP_WEB_SERVER);

export default defineConfig({
  testDir: "./tests/a11y",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "public",
      testMatch: /public-pages\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: PUBLIC_BASE_URL },
    },
    {
      name: "authenticated",
      testMatch: /authenticated-pages\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: process.env.A11Y_AUTH_BASE_URL ?? PUBLIC_BASE_URL,
      },
    },
  ],
  webServer: skipWebServer
    ? undefined
    : {
        command: "npm run build && npm run preview -- --port 4173 --strictPort",
        url: PUBLIC_BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
        stdout: "pipe",
        stderr: "pipe",
      },
});

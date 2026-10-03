import { defineConfig, devices } from "@playwright/test";

/**
 * Browser smoke tests run against a real deployment (or a local production
 * server) rather than the dev server, so the journey proves what ships.
 *
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3111 npx playwright test
 */
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3111",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      // A narrow touch viewport rather than a device preset: Chromium's mobile
      // emulation reports a layout viewport that does not match the visual
      // one, which makes hit-testing unreliable in this Playwright version.
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        hasTouch: true,
        isMobile: false,
      },
    },
  ],
});
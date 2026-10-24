import { defineConfig, devices } from "@playwright/test";
const port = process.env.PLAYWRIGHT_PORT || "5180";
const channel = process.env.CI ? "chromium" : "msedge";
export default defineConfig({
  forbidOnly: !!process.env.CI,
  webServer: process.env.CI
    ? {
        command: `npm run preview -- --port ${port} --strictPort`,
        url: `http://127.0.0.1:${port}${process.env.PAGES_TEST_BASE || "/"}`,
        reuseExistingServer: false,
      }
    : undefined,
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    channel,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel,
      },
    },
  ],
});

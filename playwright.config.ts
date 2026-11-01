import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:4173/", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "phone", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 660 }, hasTouch: true, isMobile: false } },
  ],
  webServer: { command: "npm run build -w @sjakk/web && npm run preview -w @sjakk/web -- --strictPort", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});

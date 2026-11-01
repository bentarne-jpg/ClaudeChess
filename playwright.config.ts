import { defineConfig, devices } from "@playwright/test";

/* The accounts build points at a mocked Supabase (tests/e2e/accounts.spec.ts); the others have accounts off. */
const ACCOUNTS_ENV = "VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_ANON_KEY=anon-key VITE_AUTH_PROVIDERS=google,facebook,custom:vipps";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { trace: "retain-on-failure" },
  projects: [
    { name: "desktop", testIgnore: /accounts\.spec/, use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173/", viewport: { width: 1280, height: 900 } } },
    { name: "phone", testIgnore: /accounts\.spec/, use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4173/", viewport: { width: 390, height: 660 }, hasTouch: true } },
    { name: "accounts", testMatch: /accounts\.spec/, use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4174/", viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    { command: "npm run build -w @sjakk/web && npm run preview -w @sjakk/web -- --strictPort", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: `cd apps/web && ${ACCOUNTS_ENV} npx vite build --outDir dist-accounts && npx vite preview --outDir dist-accounts --port 4174 --strictPort`, url: "http://localhost:4174/", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});

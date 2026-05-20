import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3101",
    actionTimeout: 5_000,
    navigationTimeout: 30_000,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command:
      "NODE_OPTIONS= AUTH_MODE=local_noauth VITE_E2E_DOMAIN_FIXTURES=1 VITE_E2E_KEYWORD_FIXTURES=1 PORT=3101 pnpm exec vite dev --host 127.0.0.1 --strictPort",
    url: "http://localhost:3101",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

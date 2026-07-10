import { defineConfig } from "@playwright/test";
import { fileURLToPath } from "node:url";

const badseoDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:18787",
    browserName: "chromium",
    headless: true,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "../node_modules/.bin/wrangler dev --config wrangler.jsonc --var GA4_MEASUREMENT_ID:G-TEST123 --var GA4_ADMIN_VERIFIED:true --port 18787",
    cwd: badseoDir,
    url: "http://127.0.0.1:18787",
    reuseExistingServer: false,
    timeout: 45_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
  },
});

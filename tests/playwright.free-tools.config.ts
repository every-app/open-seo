import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  // Keep test-results/ at the repo root (see .gitignore) now that the config lives in tests/.
  outputDir: "../test-results",
  testDir: "../web/tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: "http://localhost:4324",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: repoRoot,
    command: "pnpm --dir web dev --host 127.0.0.1 --port 4324 --strictPort",
    url: "http://localhost:4324",
    env: { VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" },
    timeout: 120_000,
  },
});

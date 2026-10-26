import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const PORT = 3108;
const BASE_URL = `http://localhost:${PORT}`;

// Two-account tenant-isolation suite against the real hosted /mcp endpoint.
// It boots its own hosted-mode dev server on :3108 so it never shares a port
// with `pnpm dev` (:3107). Prerequisites are listed at the top of
// tests/mcp-tenant-isolation.spec.ts.
//
// How the overrides reach the Worker: @cloudflare/vite-plugin builds the
// Worker env with wrangler's getVarsForDev, which reads .env and .env.local
// from the repo root and ignores process.env by default. With
// CLOUDFLARE_INCLUDE_PROCESS_ENV=true wrangler merges process.env in, and a
// process value wins over the file value for the same key (dotenv-expand's
// precedence), so AUTH_MODE / PORT / BETTER_AUTH_URL below override .env.local
// for this server only, while BETTER_AUTH_SECRET, GOOGLE_*, AUTUMN_* and the
// rest still come from .env.local. Side effect: every variable of the shell
// that launches Playwright becomes a secret binding of this dev Worker, which
// is harmless locally. vite.config.ts reads PORT from process.env first, so
// the Vite server itself moves to :3108 as well.
export default defineConfig({
  // Keep test-results/ at the repo root (see .gitignore).
  outputDir: "../test-results",
  testDir: ".",
  testMatch: "mcp-tenant-isolation.spec.ts",
  // The cross-tenant matrix alone is ~60 MCP calls against a cold dev server.
  timeout: 240_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    cwd: repoRoot,
    command: "pnpm exec vite dev --host 127.0.0.1 --strictPort",
    env: {
      NODE_OPTIONS: "",
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      AUTH_MODE: "hosted",
      BYPASS_EMAIL_VERIFICATION: "true",
      PORT: String(PORT),
      BETTER_AUTH_URL: BASE_URL,
    },
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});

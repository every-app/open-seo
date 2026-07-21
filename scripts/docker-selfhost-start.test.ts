import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const script = path.join("scripts", "docker-selfhost-start.sh");

// Only the env vite.config.ts exposes to the client bundle (envPrefix) may
// change the fingerprint; everything else must not force a rebuild.
const baseEnv = {
  PATH: process.env.PATH ?? "",
  AUTH_MODE: "local_noauth",
  VITE_SHOW_DEVTOOLS: "false",
};

function fingerprint(env: Record<string, string>): string {
  const result = spawnSync("sh", [script, "--print-fingerprint"], {
    cwd: repoRoot,
    env: env as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
  expect(result.status).toBe(0);
  const output = result.stdout.trim();
  expect(output).toMatch(/^[0-9a-f]{64}$/);
  return output;
}

describe.skipIf(process.platform === "win32")(
  "docker-selfhost-start.sh --print-fingerprint",
  () => {
    it("is stable for identical env", () => {
      expect(fingerprint(baseEnv)).toBe(fingerprint({ ...baseEnv }));
    });

    it("changes when a build-inlined env value changes", () => {
      const base = fingerprint(baseEnv);
      expect(
        fingerprint({ ...baseEnv, AUTH_MODE: "cloudflare_access" }),
      ).not.toBe(base);
      expect(fingerprint({ ...baseEnv, VITE_SHOW_DEVTOOLS: "true" })).not.toBe(
        base,
      );
      expect(fingerprint({ ...baseEnv, POSTHOG_PUBLIC_KEY: "phc_x" })).not.toBe(
        base,
      );
    });

    it("ignores env that is not inlined into the client bundle", () => {
      const base = fingerprint(baseEnv);
      expect(
        fingerprint({
          ...baseEnv,
          DATAFORSEO_API_KEY: "changed",
          PORT: "4000",
        }),
      ).toBe(base);
    });
  },
);

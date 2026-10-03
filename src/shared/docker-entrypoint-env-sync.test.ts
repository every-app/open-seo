import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Config integrity: deploy/docker/docker-entrypoint.sh fingerprints a
// hardcoded list of env vars to decide whether a container may skip its
// client rebuild; the set Vite actually inlines into the bundle is
// `envPrefix` in vite.config.ts. If they drift, a self-hoster who changes the
// new var and restarts gets "Reusing existing build" and a bundle with the
// old value baked in — nothing errors, the setting just does nothing (#316).

// Vars fingerprinted by the entrypoint that are not client-inlined (they
// change build *config*, not bundle content). Adding one here is deliberate.
const BUILD_ONLY_VARS = ["POSTHOG_SOURCEMAPS"];

function entrypointFingerprintedVars(): string[] {
  const entrypoint = readFileSync("deploy/docker/docker-entrypoint.sh", "utf8");
  const match = /grep -E '\^\(([^)]+)\)'/.exec(entrypoint);
  if (!match?.[1]) {
    throw new Error(
      "fingerprinted env list not found in docker-entrypoint.sh — update this test",
    );
  }
  return match[1].split("|");
}

function viteEnvPrefixVars(): string[] {
  const viteConfig = readFileSync("vite.config.ts", "utf8");
  const match = /envPrefix:\s*\[([^\]]*)\]/.exec(viteConfig);
  if (!match?.[1]) {
    throw new Error(
      "envPrefix array not found in vite.config.ts — update this test",
    );
  }
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1] ?? "");
}

describe("docker entrypoint env sync", () => {
  it("fingerprints every client-inlined env var", () => {
    const fingerprinted = new Set(entrypointFingerprintedVars());
    const missing = viteEnvPrefixVars().filter((v) => !fingerprinted.has(v));
    if (missing.length > 0) {
      throw new Error(
        `envPrefix gained ${missing.join(", ")} but the Docker entrypoint ` +
          "doesn't fingerprint it — containers would silently reuse stale builds.",
      );
    }
  });

  it("fingerprints nothing beyond envPrefix plus the build-only allowlist", () => {
    const inlined = new Set(viteEnvPrefixVars());
    const extras = entrypointFingerprintedVars().filter((v) => !inlined.has(v));
    expect(new Set(extras)).toEqual(new Set(BUILD_ONLY_VARS));
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `docker-entrypoint.sh` skips the client build when the build-relevant envs are
 * unchanged, fingerprinting them with a `grep` allow-list. That list must stay in
 * sync with `vite.config.ts`'s `envPrefix` (the prefixes Vite inlines into the
 * client bundle) plus the build-only extras that move the output (POSTHOG_SOURCEMAPS
 * switches the outDir). If they drift, a container could silently reuse a stale
 * build after a build-relevant env changed — this test fails loudly instead of
 * relying on the "keep in sync" comment.
 */
const BUILD_ONLY_EXTRAS = ["POSTHOG_SOURCEMAPS"];

function vitePrefixes(): string[] {
  const src = readFileSync("vite.config.ts", "utf8");
  const block = src.match(/envPrefix:\s*\[([\s\S]*?)\]/);
  if (!block?.[1]) throw new Error("Could not find the envPrefix array in vite.config.ts");
  return [...block[1].matchAll(/["']([^"']+)["']/g)]
    .map((m) => m[1])
    .filter((s): s is string => Boolean(s));
}

function entrypointFingerprintKeys(): string[] {
  const src = readFileSync("docker-entrypoint.sh", "utf8");
  const grep = src.match(/grep -E '\^\(([^)]+)\)'/);
  if (!grep?.[1]) throw new Error("Could not find the fingerprint grep allow-list in docker-entrypoint.sh");
  return grep[1].split("|");
}

describe("docker-entrypoint build fingerprint", () => {
  it("fingerprints exactly Vite's envPrefix plus the build-only extras", () => {
    const expected = [...vitePrefixes(), ...BUILD_ONLY_EXTRAS].sort();
    const actual = [...entrypointFingerprintKeys()].sort();
    expect(actual).toEqual(expected);
  });
});

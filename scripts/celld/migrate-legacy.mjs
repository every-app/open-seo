// Runs in the migrate service (deploy/standalone/compose.migrate.yaml): exports
// the old Docker image's Miniflare state, imports it through the operator
// endpoint, and records the result so a repeated start changes nothing.
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const marker = "/config/legacy-import.json";
const source = "/legacy/state/v3";
const previous = await readFile(marker, "utf8").catch(() => null);
if (previous) {
  console.log(
    `Legacy data was already imported on ${JSON.parse(previous).importedAt}; nothing to do.`,
  );
  process.exit(0);
}
function run(script, ...args) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: "/build",
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
const output = join(tmpdir(), `openseo-legacy-${process.pid}`);
try {
  run("scripts/celld/export-legacy.mjs", source, output);
  run("scripts/celld/runtime/import.mjs", output);
} finally {
  await rm(output, { recursive: true, force: true });
}
await writeFile(
  marker,
  `${JSON.stringify({ importedAt: new Date().toISOString(), source })}\n`,
  { mode: 0o644 },
);
console.log(
  "Legacy import finished. Reconnect Google in the app; with AUTH_MODE=password, claim the imported admin as described in docs/SELF_HOSTING_DOCKER.md.",
);

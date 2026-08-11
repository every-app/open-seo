/**
 * Container-start preflight for Docker self-hosting. Validates the environment
 * before migrations and the vite build so misconfiguration fails in seconds
 * with the exact fix. Run via: pnpm exec tsx scripts/selfhost-preflight.ts
 *
 * Exits non-zero on hard failures (invalid AUTH_MODE, missing auth config for
 * the selected mode). Warnings and info lines never block startup.
 */
import process from "node:process";
import {
  formatPreflightReport,
  runSelfhostPreflight,
} from "../src/lib/selfhost-preflight";
import { isTelemetryOptOutValue } from "../src/shared/selfhost-checks";
import { version } from "../package.json";

const SELF_HOST_POSTHOG_KEY =
  "phc_xaXj4vE4LikxfvR7q6EHemAYNBSZW4hQkqor7fpf8aGT";
const SELF_HOST_POSTHOG_HOST = "https://us.i.posthog.com";

function telemetryDisabled(): boolean {
  return (
    isTelemetryOptOutValue(process.env.OPENSEO_TELEMETRY_DISABLED) ||
    isTelemetryOptOutValue(process.env.DO_NOT_TRACK)
  );
}

// Anonymous "an install failed preflight" beacon: failed check names only, a
// throwaway distinct id, no env values. Without this, installs that never
// finish booting are invisible — the regular heartbeat needs a working app.
async function sendPreflightFailedBeacon(failedChecks: string[]) {
  if (telemetryDisabled()) return;

  try {
    await fetch(`${SELF_HOST_POSTHOG_HOST}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        api_key: SELF_HOST_POSTHOG_KEY,
        event: "self_host.preflight_failed",
        distinct_id: crypto.randomUUID(),
        properties: {
          failedChecks,
          version,
          $process_person_profile: false,
        },
      }),
    });
  } catch {
    // Telemetry must never affect startup.
  }
}

const result = runSelfhostPreflight(process.env);

console.log("--- OpenSEO self-host preflight ---");
console.log(formatPreflightReport(result));

if (result.failed) {
  await sendPreflightFailedBeacon(
    result.items
      .filter((item) => item.level === "fail")
      .map((item) => item.name),
  );
  process.exit(1);
}

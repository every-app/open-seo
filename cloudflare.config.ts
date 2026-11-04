import { bindings, defineConfig } from "cf/config";
import {
  everyAppWorker,
  type EveryAppWorkerManifest,
} from "@every-app/sdk/cloudflare";
import config from "./everyapp.config.ts";

// @every-app/sdk 0.3.0-rc.14 types a feature as its secrets and settings
// alone, so one listing only capabilities or providers fails the type check.
// Drop the cast once the SDK types the whole feature.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
const manifest = config as Omit<typeof config, "features"> &
  Pick<EveryAppWorkerManifest, "features">;

// OpenSEO on an Every App gateway (AUTH_MODE=everyapp), as
// `everyapp install` and `pnpm dev:everyapp` build it: the app's Worker
// here, and the site-audit engine as its helper Worker
// (vite-plugin-every-app.ts). Hosted, the other self-host modes and Docker
// build from wrangler.jsonc instead. Nothing the Workers import may be
// imported here: in dev the Cloudflare Vite plugin hides this file's
// imports from the Workers.

/** What both of OpenSEO's Workers add to the SDK's definitions. */
export function withOpenSeoRuntime<
  W extends { compatibilityFlags: string[]; env: object },
>(worker: W, appWorkerName: string) {
  return {
    ...worker,
    compatibilityFlags: [
      ...worker.compatibilityFlags,
      "global_fetch_strictly_public",
    ],
    env: {
      ...worker.env,
      AUTH_MODE: bindings.text("everyapp"),
      // Cached provider responses, Lighthouse payloads and AI visibility
      // exports, in a bucket named after the app's Worker.
      R2: bindings.r2({ name: appWorkerName }),
    },
  };
}

export default defineConfig((ctx) => {
  const worker = everyAppWorker({
    manifest,
    entrypoint: "./src/server.ts",
    ctx,
    // Due rank checks, AI visibility runs and the stale-audit reconcile.
    crons: ["*/5 * * * *"],
  });
  return { worker: withOpenSeoRuntime(worker, worker.name) };
});

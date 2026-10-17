import { bindings, defineConfig } from "cf/config";
import { everyAppWorker } from "@every-app/sdk/cloudflare";
import manifest from "./everyapp.config.ts";

// OpenSEO on an Every App gateway (AUTH_MODE=everyapp), as
// `pnpm deploy:everyapp` and `pnpm dev:everyapp` build it: the app's Worker
// here, and the site-audit engine as its helper Worker
// (vite-plugin-every-app.ts). Hosted, the other self-host modes and Docker
// build from wrangler.jsonc instead. Nothing the Workers import may be
// imported here: in dev the Cloudflare Vite plugin hides this file's
// imports from the Workers.

/** OpenSEO's own settings (`everyapp secret set`), all optional. */
export const OPENSEO_SECRETS = [
  // Encrypts the access signatures audits use to crawl protected sites.
  "CRAWLER_ACCESS_SECRET",
] as const;

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
    secrets: OPENSEO_SECRETS,
  });
  return { worker: withOpenSeoRuntime(worker, worker.name) };
});

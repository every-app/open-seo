import { cloudflare } from "@cloudflare/vite-plugin-cf";
import { everyAppAuxiliaryWorker } from "@every-app/sdk/cloudflare";
import { OPENSEO_SECRETS, withOpenSeoRuntime } from "./cloudflare.config.ts";
import manifest from "./everyapp.config.ts";

/**
 * The Cloudflare Vite plugin for OpenSEO on an Every App gateway
 * (AUTH_MODE=everyapp): the app's Worker from cloudflare.config.ts, and the
 * site-audit engine (src/audit-worker.ts) as its helper Worker, which keeps
 * the audits' memory spikes off the app's isolate as the open-seo-audit
 * Worker does elsewhere.
 */
export function everyAppCloudflare({ mode }: { mode: string }) {
  return cloudflare({
    inspectorPort: false,
    viteEnvironment: { name: "ssr" },
    // Local dev never touches remote resources.
    remoteBindings: false,
    // OpenSEO types its Env itself (src/env.d.ts).
    types: { generate: false },
    auxiliaryWorkers: [
      {
        // The name vite-plugin-lean-worker-bundle.ts checks.
        viteEnvironment: { name: "open_seo_audit" },
        config: ({ entryWorkerConfig }) =>
          withOpenSeoRuntime(
            everyAppAuxiliaryWorker({
              manifest,
              worker: "audit",
              entrypoint: "./src/audit-worker.ts",
              ctx: { mode },
              secrets: OPENSEO_SECRETS,
            }),
            entryWorkerConfig.name,
          ),
      },
    ],
  });
}

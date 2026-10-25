import { cloudflare } from "@cloudflare/vite-plugin-cf";
import { everyAppAuxiliaryWorker } from "@every-app/sdk/cloudflare";
import { withOpenSeoRuntime } from "./cloudflare.config.ts";
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
        // The SDK's binding union (0.3.0-rc.3) names kinds (`version_metadata`,
        // AI Gateway) that @cloudflare/config 0.24.1's `BindingInput` doesn't,
        // so the helper's config is not assignable to the plugin's
        // `WorkerConfigProvider` by type alone; the shapes are the plugin's own.
        // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion
        config: (({
          entryWorkerConfig,
        }: {
          entryWorkerConfig: { name: string };
        }) =>
          withOpenSeoRuntime(
            everyAppAuxiliaryWorker({
              manifest,
              worker: "audit",
              entrypoint: "./src/audit-worker.ts",
              ctx: { mode },
            }),
            entryWorkerConfig.name,
          )) as never,
      },
    ],
  });
}

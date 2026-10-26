import { cloudflare } from "@cloudflare/vite-plugin-cf";
import { everyAppAuxiliaryWorker } from "@every-app/sdk/cloudflare";
import { withOpenSeoRuntime } from "./cloudflare.config.ts";
import manifest from "./everyapp.config.ts";

type PluginConfig = NonNullable<Parameters<typeof cloudflare>[0]>;
type AuxiliaryWorkerConfig = Exclude<
  NonNullable<PluginConfig["auxiliaryWorkers"]>[number]["config"],
  (...args: never) => unknown
>;

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
        // The SDK types the Durable Object references and the gateway
        // binding more precisely than this plugin beta's input schema does;
        // the shapes agree at run time (cf validates them on deploy).
        config: ({ entryWorkerConfig }) =>
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
          withOpenSeoRuntime(
            everyAppAuxiliaryWorker({
              manifest,
              worker: "audit",
              entrypoint: "./src/audit-worker.ts",
              ctx: { mode },
            }),
            entryWorkerConfig.name,
          ) as unknown as AuxiliaryWorkerConfig,
      },
    ],
  });
}

// The first-party OpenSEO deployment behind the hosted Every App gateway:
// Alchemy stage `everyapp` (alchemy.run.ts) plus the gateway binding Alchemy
// can't express (bindEveryAppGateway below, run by
// scripts/everyapp-gateway-binding.ts after every deploy of the stage).
// The runbook is docs/EVERY_APP_DEPLOYMENT.md.
//
// One Worker pair for every organization on the gateway: AUTH_MODE=everyapp
// with no EVERY_APP_ORG_ID (the organization comes from each request's
// identity), DEPLOYMENT_TIER=first_party, Postgres through Hyperdrive. No
// provider, Autumn or Google secret: the gateway holds them.

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { z } from "zod";
import manifest from "../../everyapp.config.ts";
import { workerName } from "./alchemy.access.ts";

export const EVERYAPP_STAGE = "everyapp";

/** The hosted gateway, which also issues the identity tokens. */
const HOSTED_GATEWAY_URL = "https://app.everyapp.com";

/** The gateway's Worker and the entrypoint it serves apps on (the SDK's). */
const GATEWAY_WORKER = "every-app-gateway";
const GATEWAY_ENTRYPOINT = "AppGateway";
const GATEWAY_BINDING = "EVERY_APP_GATEWAY";

const optionalVar = (name: string) =>
  Config.string(name).pipe(
    Config.withDefault(""),
    Config.map((value) => value.trim()),
  );

/**
 * The everyapp stage's settings from .env.everyapp, or undefined on every
 * other stage. AUTH_MODE=everyapp and the stage only come together: the build
 * reads AUTH_MODE from the same file, and this is the only stage wired to a
 * gateway.
 *
 * The app's Worker checks every request's gateway token against the identity
 * public key (src/server.ts), so a missing key fails the deploy rather than
 * shipping a Worker that refuses everyone.
 */
export const readEveryAppStage = (stage: string, authMode: string) =>
  Effect.gen(function* () {
    const everyApp = stage === EVERYAPP_STAGE;
    if (everyApp !== (authMode === "everyapp")) {
      return yield* Effect.die(
        new Error(
          everyApp
            ? "Set AUTH_MODE=everyapp in .env.everyapp: the everyapp stage runs OpenSEO behind the Every App gateway."
            : "AUTH_MODE=everyapp deploys only as the everyapp stage (`pnpm deploy:everyapp:first-party`), or as a fork with `pnpm deploy:everyapp`.",
        ),
      );
    }
    if (!everyApp) return undefined;

    const publicKeys = yield* optionalVar("EVERYAPP_IDENTITY_PUBLIC_KEYS");
    if (!publicKeys.includes("BEGIN PUBLIC KEY")) {
      return yield* Effect.die(
        new Error(
          "Set EVERYAPP_IDENTITY_PUBLIC_KEYS in .env.everyapp to the hosted gateway's identity public key (a PEM, or a JSON array of PEMs): the gateway's install row holds it, see docs/EVERY_APP_DEPLOYMENT.md.",
        ),
      );
    }
    const gatewayUrl = new URL(
      yield* Config.string("EVERYAPP_GATEWAY_URL").pipe(
        Config.withDefault(HOSTED_GATEWAY_URL),
      ),
    ).origin;
    const issuer = yield* Config.string("EVERYAPP_IDENTITY_ISSUER").pipe(
      Config.withDefault(gatewayUrl),
    );

    // Both Workers, in place of the env file's secrets: the tier, and
    // OpenSEO's one setting of its own. The gateway binding comes after the
    // deploy (bindEveryAppGateway).
    const shared = {
      EVERYAPP_APP_ID: manifest.id,
      DEPLOYMENT_TIER: "first_party",
      CRAWLER_ACCESS_SECRET: Config.redacted("CRAWLER_ACCESS_SECRET").pipe(
        Config.withDefault(Redacted.make("")),
      ),
    };
    return {
      // Where the gateway publishes OpenSEO, <app id>.<gateway host>. Only
      // URL building reads it (BETTER_AUTH_URL); Better Auth is off.
      appUrl: `https://${manifest.id}.${new URL(gatewayUrl).host}`,
      auditEnv: shared,
      appEnv: {
        ...shared,
        EVERYAPP_IDENTITY_PUBLIC_KEYS: publicKeys,
        EVERYAPP_IDENTITY_ISSUER: issuer,
        // "Sign out on Every App" (src/serverFunctions/everyApp.ts).
        GATEWAY_URL: gatewayUrl,
        // Scheduled rank checks and AI visibility wait for the gateway to
        // attribute background calls (src/server/lib/deployment-tier.ts).
        FIRST_PARTY_SCHEDULED_CHECKS: optionalVar(
          "FIRST_PARTY_SCHEDULED_CHECKS",
        ),
        OPENROUTER_MODEL: optionalVar("OPENROUTER_MODEL"),
      },
      // Nothing reaches the app but the gateway's service binding
      // (APP__open-seo-everyapp): no workers.dev URL.
      appWorker: { url: false },
    };
  });

const cloudflareResponse = z.object({
  success: z.boolean(),
  errors: z
    .array(z.object({ code: z.number().optional(), message: z.string() }))
    .optional(),
  result: z.unknown(),
});

const scriptSettings = z.object({
  bindings: z.array(z.object({ name: z.string(), type: z.string() })),
});

/**
 * Binds both of the stage's Workers to the gateway's AppGateway entrypoint as
 * EVERY_APP_GATEWAY, with the props the gateway trusts (it reads them from
 * the binding, never from a request): the platform organization that owns
 * the shared app, the app id, and the app's Worker, which helper Workers
 * share as `everyAppAuxiliaryWorker()` does.
 *
 * Alchemy (through @distilled.cloud/cloudflare) drops `props` from service
 * bindings, and every Alchemy deploy re-uploads the Worker without this
 * binding, so this runs after each deploy. It patches the Workers' settings,
 * keeping every other binding as it is (`inherit`).
 */
export async function bindEveryAppGateway(options: {
  accountId: string;
  apiToken: string;
  platformOrganizationId: string;
  fetch?: typeof fetch;
}) {
  const fetchImpl = options.fetch ?? fetch;
  const appWorker = workerName(EVERYAPP_STAGE);
  const gateway = {
    type: "service",
    name: GATEWAY_BINDING,
    service: GATEWAY_WORKER,
    entrypoint: GATEWAY_ENTRYPOINT,
    props: {
      organizationId: options.platformOrganizationId,
      appId: manifest.id,
      workerName: appWorker,
    },
  };

  const call = async (url: string, init: RequestInit) => {
    const response = await fetchImpl(url, {
      ...init,
      headers: { Authorization: `Bearer ${options.apiToken}` },
    });
    const body = cloudflareResponse.parse(await response.json());
    if (!response.ok || !body.success) {
      const errors = (body.errors ?? []).map((error) => error.message);
      throw new Error(
        `Cloudflare API ${init.method ?? "GET"} ${url} failed (${response.status}): ${errors.join("; ") || "no error message"}`,
      );
    }
    return body.result;
  };

  const workers = [appWorker, `${appWorker}-audit`];
  for (const worker of workers) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/workers/scripts/${worker}/settings`;
    const current = scriptSettings.parse(await call(url, { method: "GET" }));
    const bindings = [
      ...current.bindings
        .filter((binding) => binding.name !== GATEWAY_BINDING)
        .map((binding) => ({ type: "inherit", name: binding.name })),
      gateway,
    ];
    const form = new FormData();
    form.set(
      "settings",
      new Blob([JSON.stringify({ bindings })], { type: "application/json" }),
    );
    await call(url, { method: "PATCH", body: form });
  }
  return { workers, props: gateway.props };
}

// The first-party OpenSEO deployment behind the hosted Every App gateway:
// Alchemy stage `everyapp` (alchemy.run.ts) plus the gateway binding Alchemy
// can't express (bindEveryAppGateway below, run by
// scripts/everyapp-gateway-binding.ts after every deploy of the stage).
// The runbook is docs/EVERY_APP_DEPLOYMENT.md.
//
// One Worker pair for every organization on the gateway: AUTH_MODE=everyapp
// with no EVERY_APP_ORG_ID (the organization comes from each request's
// identity), EVERYAPP_SHARED=1 (every gateway call says whose it is),
// DEPLOYMENT_TIER=first_party, Postgres through Hyperdrive. No provider,
// Autumn or Google secret: the gateway holds them.

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { z } from "zod";
import manifest from "../../everyapp.config.ts";

export const EVERYAPP_STAGE = "everyapp";

/**
 * The app's Worker as the gateway's registry names it,
 * `every-<platform organization key>-<app id>`: the platform organization
 * "Every App" has the key `everyapp`. `everyapp register` refuses any other
 * name (WORKER_NAME_MISMATCH, which names the one it wants), so a gateway
 * whose platform organization has another key sets EVERYAPP_WORKER_NAME.
 */
const DEFAULT_WORKER_NAME = `every-everyapp-${manifest.id}`;
const WORKER_NAME_PATTERN = new RegExp(`^every-[a-z0-9]{1,12}-${manifest.id}$`);

/**
 * The stage's two Worker names: the app's, and its audit helper's,
 * `<app worker>--audit` as the SDK names helper Workers.
 */
function everyAppWorkerNames(configured?: string) {
  const app = configured?.trim() || DEFAULT_WORKER_NAME;
  if (!WORKER_NAME_PATTERN.test(app)) {
    throw new Error(
      `EVERYAPP_WORKER_NAME must be the name the gateway's registry gives OpenSEO's Worker, every-<platform organization key>-${manifest.id}; got "${app}".`,
    );
  }
  return { app, audit: `${app}--audit` };
}

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

    const configuredName = yield* optionalVar("EVERYAPP_WORKER_NAME");
    const workerNames = yield* Effect.try({
      try: () => everyAppWorkerNames(configuredName),
      catch: (error) => error,
    }).pipe(Effect.orDie);

    // Both Workers, in place of the env file's secrets: the tier, the shared
    // flag, and OpenSEO's one setting of its own. The gateway binding comes
    // after the deploy (bindEveryAppGateway).
    const shared = {
      EVERYAPP_APP_ID: manifest.id,
      // One Worker for every organization: the SDK refuses a gateway call
      // that names neither a request nor an organization, as an
      // everyAppWorker() shared deploy sets it.
      EVERYAPP_SHARED: "1",
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
        // The gateway mints every identity for the Worker's name (`aud`).
        EVERYAPP_AUDIENCE: workerNames.app,
        // "Sign out on Every App" (src/serverFunctions/everyApp.ts).
        GATEWAY_URL: gatewayUrl,
        // `off` holds scheduled rank checks and AI visibility
        // (src/server/lib/deployment-tier.ts).
        FIRST_PARTY_SCHEDULED_CHECKS: optionalVar(
          "FIRST_PARTY_SCHEDULED_CHECKS",
        ),
        OPENROUTER_MODEL: optionalVar("OPENROUTER_MODEL"),
      },
      // Nothing reaches the app but the gateway's service binding
      // (APP__<app worker>): no workers.dev URL.
      appWorker: { name: workerNames.app, url: false },
      auditWorker: { name: workerNames.audit },
    };
  });

const cloudflareResponse = z.object({
  success: z.boolean(),
  errors: z
    .array(z.object({ code: z.number().optional(), message: z.string() }))
    .optional(),
  result: z.unknown(),
});

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function errorMessages(body: z.infer<typeof cloudflareResponse>): string {
  return (body.errors ?? []).map((error) => error.message).join("; ");
}

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
  /** EVERYAPP_WORKER_NAME, when the platform organization's key isn't `everyapp`. */
  workerName?: string;
  fetch?: typeof fetch;
}) {
  const fetchImpl = options.fetch ?? fetch;
  const names = everyAppWorkerNames(options.workerName);
  const appWorker = names.app;
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
    const failed = (detail: string) =>
      new Error(
        `Cloudflare API ${init.method ?? "GET"} ${url} failed (${response.status}): ${detail || "no error message"}`,
      );
    // A failure's body may not be Cloudflare's envelope (a gateway's HTML
    // page), so read it as text and take the envelope's errors if it is one.
    const text = await response.text();
    const body = cloudflareResponse.safeParse(parseJson(text));
    if (!response.ok) {
      throw failed(
        body.success ? errorMessages(body.data) : text.trim().slice(0, 300),
      );
    }
    if (!body.success) throw failed("the response isn't the API's JSON");
    if (!body.data.success) throw failed(errorMessages(body.data));
    return body.data.result;
  };

  const workers = [names.app, names.audit];
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

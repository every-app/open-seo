import {
  ConfigurationError,
  integrationFetch,
  integrationStatus,
  type IntegrationId,
} from "@every-app/sdk/server";
import { isEveryAppAuthMode } from "@/lib/auth-mode";
import { AppError } from "@/server/lib/errors";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
  getWorkersEnv,
} from "@/server/lib/runtime-env";

// How OpenSEO reaches the APIs it calls with a key (DataForSEO, Context.dev).
// Every mode but one holds the keys itself. Behind an Every App gateway
// (AUTH_MODE=everyapp) the gateway holds them: calls go over the gateway's
// binding, which puts the key on them, so the deployment needs no key of its
// own (docs/maintainers/every-app.md). No request is passed: workflows and
// crons call these with nobody signed in, so the manifest asks for
// background use.

async function isBehindEveryAppGateway(): Promise<boolean> {
  return isEveryAppAuthMode(await getOptionalEnvValue("AUTH_MODE"));
}

async function gatewayEnv(): Promise<object> {
  return (await getWorkersEnv()) ?? {};
}

function withAuthorization(authorization: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", authorization);
    return fetch(input, { ...init, headers });
  };
}

/** The gateway's fetch for an integration, or null without its binding. */
async function gatewayFetch(provider: IntegrationId) {
  try {
    return integrationFetch({ env: await gatewayEnv(), provider });
  } catch (error) {
    // No gateway binding (and in local dev, no key in .dev.vars).
    if (error instanceof ConfigurationError) return null;
    throw error;
  }
}

/** A fetch that reaches DataForSEO authenticated, for this deployment. */
export async function getDataforseoFetch(): Promise<typeof fetch> {
  if (await isBehindEveryAppGateway()) {
    const providerFetch = await gatewayFetch("dataforseo");
    if (!providerFetch) {
      throw new AppError(
        "DATAFORSEO_AUTH_FAILED",
        "DataForSEO is unavailable: deploy with the EVERY_APP_GATEWAY binding, or set DATAFORSEO_API_KEY in .dev.vars for local development.",
      );
    }
    return providerFetch;
  }
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
  return withAuthorization(`Basic ${apiKey}`);
}

/** A fetch that reaches Context.dev authenticated, or null without a key. */
export async function getContextFetch(): Promise<typeof fetch | null> {
  if (await isBehindEveryAppGateway()) return gatewayFetch("context");
  const apiKey = await getOptionalEnvValue("CONTEXT_API_KEY");
  return apiKey ? withAuthorization(`Bearer ${apiKey}`) : null;
}

const KEY_ENV: Record<IntegrationId, string> = {
  dataforseo: "DATAFORSEO_API_KEY",
  context: "CONTEXT_API_KEY",
};

/** Whether calls to the provider would go through, without making one. */
export async function hasProviderAccess(
  provider: IntegrationId,
): Promise<boolean> {
  if (await isBehindEveryAppGateway()) {
    const status = await integrationStatus({
      env: await gatewayEnv(),
      provider,
    });
    return status.ready;
  }
  return Boolean(await getOptionalEnvValue(KEY_ENV[provider]));
}

export function hasDataforseoAccess(): Promise<boolean> {
  return hasProviderAccess("dataforseo");
}

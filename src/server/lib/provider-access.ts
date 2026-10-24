import {
  ConfigurationError,
  integrationFetch,
  integrationStatus,
  type CapabilityId,
} from "@every-app/sdk/server";
import { isEveryAppAuthMode } from "@/lib/auth-mode";
import { AppError } from "@/server/lib/errors";
import { gatewayCallFor } from "@/server/lib/gateway-attribution";
import { DATAFORSEO_NOT_SET_UP_MESSAGE } from "@/shared/gateway-setup-messages";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
  getWorkersEnv,
} from "@/server/lib/runtime-env";

// How OpenSEO reaches the APIs it calls with a key (DataForSEO, Context.dev).
// Every mode but one holds the keys itself. Behind an Every App gateway
// (AUTH_MODE=everyapp) the gateway holds them: calls go over the gateway's
// binding, which puts the key on them, so the deployment needs no key of its
// own (docs/maintainers/every-app.md). Each call says whose it is: the
// request's identity while serving one, else the organization the work is
// for (gateway-attribution.ts).

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

/**
 * The gateway's fetch for a capability, its calls for the forOrganization
 * scope's organization or the request being served, or null without its
 * binding.
 */
async function gatewayFetch(provider: CapabilityId) {
  const env = await gatewayEnv();
  try {
    return integrationFetch({ env, provider, for: gatewayCallFor(env) });
  } catch (error) {
    // No gateway binding (and in local dev, no key in .dev.vars). A call that
    // says nobody's (AttributionError) is a bug, so it is thrown.
    if (error instanceof ConfigurationError) return null;
    throw error;
  }
}

/**
 * A fetch that reaches DataForSEO authenticated, for this deployment. Behind
 * the gateway its calls are the forOrganization scope's, which the metering
 * seam (dataforseo/client.ts) opens, or the served request's.
 */
export async function getDataforseoFetch(): Promise<typeof fetch> {
  if (await isBehindEveryAppGateway()) {
    const providerFetch = await gatewayFetch("dataforseo");
    if (!providerFetch) {
      // Only local dev gets here (production always has the binding). The
      // thrown message is what a rank check stores and a tool answers with,
      // so it is the member's sentence; the developer's hint goes to the log.
      console.warn(
        "[openseo] no DataForSEO key: set DATAFORSEO_API_KEY in .dev.vars for local development",
      );
      throw new AppError(
        "DATAFORSEO_AUTH_FAILED",
        DATAFORSEO_NOT_SET_UP_MESSAGE,
      );
    }
    return providerFetch;
  }
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
  return withAuthorization(`Basic ${apiKey}`);
}

/**
 * A fetch that reaches Context.dev authenticated, or null without a key.
 * Behind the gateway its calls are the forOrganization scope's (website
 * research's, a site audit's), or the served request's.
 */
export async function getContextFetch(): Promise<typeof fetch | null> {
  if (await isBehindEveryAppGateway()) return gatewayFetch("context");
  const apiKey = await getOptionalEnvValue("CONTEXT_API_KEY");
  return apiKey ? withAuthorization(`Bearer ${apiKey}`) : null;
}

const KEY_ENV: Record<CapabilityId, string> = {
  dataforseo: "DATAFORSEO_API_KEY",
  context: "CONTEXT_API_KEY",
};

/**
 * Whether calls to the provider would go through, without making one. The
 * gateway answers this for no organization in particular, so it needs none.
 */
export async function hasProviderAccess(
  provider: CapabilityId,
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

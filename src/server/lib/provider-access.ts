import {
  ConfigurationError,
  GATEWAY_ERROR_HEADER,
  integrationFetch,
  integrationStatus,
} from "@every-app/sdk/server";
import { isEveryAppAuthMode } from "@/lib/auth-mode";
import { AppError } from "@/server/lib/errors";
import { createTregDataforseoFetch } from "@/server/lib/dataforseo/treg";
import { gatewayCallFor } from "@/server/lib/gateway-attribution";
import { DATAFORSEO_NOT_SET_UP_MESSAGE } from "@/shared/gateway-setup-messages";
import {
  getOptionalEnvValue,
  getRequiredEnvValue,
  getWorkersEnv,
} from "@/server/lib/runtime-env";

// How OpenSEO reaches the APIs it calls with a key (DataForSEO, Context.dev).
// Without a DataForSEO key, OpenSEO reaches DataForSEO through treg
// (dataforseo/treg.ts) with TREG_API_TOKEN, on a gateway as anywhere else.
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

function withHeader(name: string, value: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(name, value);
    return fetch(input, { ...init, headers });
  };
}

/** The gateway capabilities OpenSEO calls through its fetch: its API-key providers. */
type GatewayProvider = "dataforseo" | "treg" | "context";

/** What OpenSEO asks about: DataForSEO is reached directly or through treg. */
type OpenSeoProvider = "dataforseo" | "context";

/**
 * The gateway's fetch for a capability, or null without its binding. Whose
 * call it is: gateway-attribution.ts.
 */
async function gatewayFetch(provider: GatewayProvider) {
  const env = await gatewayEnv();
  try {
    return integrationFetch({ env, provider, for: gatewayCallFor() });
  } catch (error) {
    // No gateway binding (and in local dev, no key in .dev.vars). A call that
    // says nobody's (AttributionError) is a bug, so it is thrown.
    if (error instanceof ConfigurationError) return null;
    throw error;
  }
}

/**
 * The gateway's way to DataForSEO: its DataForSEO key, else its treg token,
 * as a deployment's own keys are chosen. Null without either (local dev).
 */
async function gatewayDataforseoFetch(): Promise<typeof fetch | null> {
  const direct = await gatewayFetch("dataforseo");
  const treg = await gatewayFetch("treg");
  const viaTreg = treg && createTregDataforseoFetch(treg);
  if (!direct || !viaTreg) return direct ?? viaTreg;
  // Over the binding both always exist, and only the gateway knows which
  // key it holds: a gateway without DataForSEO's refuses the call before
  // reaching DataForSEO, and treg gets it. The bodies sent are strings, so
  // the call can be sent twice.
  return async (input, init) => {
    const response = await direct(input, init);
    if (
      response.headers.get(GATEWAY_ERROR_HEADER) !==
      "integration_not_configured"
    ) {
      return response;
    }
    return viaTreg(input, init);
  };
}

/** A fetch that reaches DataForSEO authenticated, for this deployment. */
export async function getDataforseoFetch(): Promise<typeof fetch> {
  if (await isBehindEveryAppGateway()) {
    const providerFetch = await gatewayDataforseoFetch();
    if (!providerFetch) {
      // Only local dev gets here (production always has the binding). The
      // thrown message is what a rank check stores and a tool answers with,
      // so it is the member's sentence; the developer's hint goes to the log.
      console.warn(
        "[openseo] no DataForSEO key: set DATAFORSEO_API_KEY or TREG_API_TOKEN in .dev.vars for local development",
      );
      throw new AppError(
        "DATAFORSEO_AUTH_FAILED",
        DATAFORSEO_NOT_SET_UP_MESSAGE,
      );
    }
    return providerFetch;
  }
  if (!(await getOptionalEnvValue("DATAFORSEO_API_KEY"))) {
    // No DataForSEO account of its own: buy the calls through treg instead.
    const tregKey = await getOptionalEnvValue("TREG_API_TOKEN");
    if (tregKey) {
      return createTregDataforseoFetch(withHeader("X-Treg-Token", tregKey));
    }
  }
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");
  return withHeader("Authorization", `Basic ${apiKey}`);
}

/** A fetch that reaches Context.dev authenticated, or null without a key. */
export async function getContextFetch(): Promise<typeof fetch | null> {
  if (await isBehindEveryAppGateway()) return gatewayFetch("context");
  const apiKey = await getOptionalEnvValue("CONTEXT_API_KEY");
  return apiKey ? withHeader("Authorization", `Bearer ${apiKey}`) : null;
}

const KEY_ENV: Record<OpenSeoProvider, string> = {
  dataforseo: "DATAFORSEO_API_KEY",
  context: "CONTEXT_API_KEY",
};

/**
 * Whether calls to the provider would go through, without making one. On a
 * gateway, DataForSEO is reachable with its own key or with treg's.
 */
export async function hasProviderAccess(
  provider: OpenSeoProvider,
): Promise<boolean> {
  if (await isBehindEveryAppGateway()) {
    const env = await gatewayEnv();
    const ready = async (id: GatewayProvider) =>
      (await integrationStatus({ env, provider: id, for: gatewayCallFor() }))
        .ready;
    if (await ready(provider)) return true;
    return provider === "dataforseo" && ready("treg");
  }
  if (await getOptionalEnvValue(KEY_ENV[provider])) return true;
  return provider === "dataforseo"
    ? Boolean(await getOptionalEnvValue("TREG_API_TOKEN"))
    : false;
}

export function hasDataforseoAccess(): Promise<boolean> {
  return hasProviderAccess("dataforseo");
}

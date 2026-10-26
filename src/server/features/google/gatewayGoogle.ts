import {
  ConfigurationError,
  connectUrl,
  integrationFetch,
  integrationStatus,
  type OAuthClientIntegrationStatus,
} from "@every-app/sdk/server";
import { gatewayCallFor } from "@/server/lib/gateway-attribution";
import { getWorkersEnv } from "@/server/lib/runtime-env";

/**
 * Google through the Every App gateway (AUTH_MODE=everyapp): the gateway
 * holds the Google OAuth client and each member's connection (Every App →
 * Settings → Connected accounts, or the Connect button here, which sends
 * the person to the gateway's `/connect/google-workspace` and back). Search
 * Console and Analytics calls go through `integrationFetch`, which puts the
 * member's token on them; OpenSEO never sees a Google token, client or
 * secret (docs/design/2026-10-oauth-providers.md in the Every App repo).
 *
 * The capability is `google-workspace` with the scope sets `identity`,
 * `search-console.read` and `analytics.read` (everyapp.config.ts). A
 * project's connection rows keep `connectedByUserId` as the member whose
 * gateway connection serves it, and the sentinel
 * {@link GATEWAY_GOOGLE_ACCOUNT_ID} where OpenSEO's own mode keeps the
 * Google account id: the gateway, not OpenSEO, knows which Google account
 * that member connected.
 */
export const GATEWAY_GOOGLE_PROVIDER = "google-workspace";

/** The one "account" a member has in gateway mode: their gateway connection. */
export const GATEWAY_GOOGLE_ACCOUNT_ID = "everyapp";

type GatewayGoogleStatus = {
  /** The app lists `google-workspace` and the gateway holds a Google client. */
  available: boolean;
  /** The member behind the served request has a connection with every set OpenSEO declares. */
  connected: boolean;
  /** A connection exists but has expired or lacks a set: connect again. */
  reconnect: boolean;
  /** Who connected, as the gateway labels it (an email). */
  label: string | null;
};

async function gatewayEnv(): Promise<object> {
  return (await getWorkersEnv()) ?? {};
}

function statusOf(
  status: OAuthClientIntegrationStatus | null,
): GatewayGoogleStatus {
  const connection = status?.connection ?? null;
  return {
    available: Boolean(status?.requested && status.configured),
    connected: Boolean(connection?.ready),
    reconnect: Boolean(connection && !connection.ready),
    label: connection?.label ?? null,
  };
}

/**
 * The gateway's answer for Google, for the served request's member (or the
 * named organization's own connection from background work). Never calls
 * Google.
 */
export async function getGatewayGoogleStatus(): Promise<GatewayGoogleStatus> {
  const env = await gatewayEnv();
  try {
    // `for: gatewayCallFor(env)` names the organization's own connection from
    // background work; the published SDK (0.3.0-rc.3) takes it on
    // integrationStatus only from rc.4, so until then the served request's
    // identity is what the status answers for.
    const status = await integrationStatus({
      env,
      provider: GATEWAY_GOOGLE_PROVIDER,
    });
    return statusOf(status);
  } catch (error) {
    // No gateway binding and nothing in .dev.vars: local dev without Google.
    if (error instanceof ConfigurationError) return statusOf(null);
    throw error;
  }
}

/**
 * A fetch that reaches Google's APIs through the gateway with the member's
 * token on it, or null without the gateway binding (local dev with no
 * GOOGLE_WORKSPACE_ACCESS_TOKEN in .dev.vars). Send Google's real URLs and
 * no Authorization header.
 */
export async function getGatewayGoogleFetch(): Promise<typeof fetch | null> {
  const env = await gatewayEnv();
  try {
    return integrationFetch({
      env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: gatewayCallFor(env),
    });
  } catch (error) {
    if (error instanceof ConfigurationError) return null;
    throw error;
  }
}

/**
 * Where a Connect button sends the member: the gateway's connect page for
 * Google, which comes back to `returnTo` (the OpenSEO page the person was
 * on) once Google has answered.
 */
export async function getGatewayGoogleConnectUrl(
  returnTo: string,
): Promise<string> {
  return connectUrl({
    env: await gatewayEnv(),
    provider: GATEWAY_GOOGLE_PROVIDER,
    returnTo,
  });
}

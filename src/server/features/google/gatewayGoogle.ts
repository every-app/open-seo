import {
  ConfigurationError,
  connectUrl,
  integrationFetch,
  integrationStatus,
  type OAuthClientIntegrationStatus,
} from "@every-app/sdk/server";
import {
  gatewayCallFor,
  gatewayCallForUser,
} from "@/server/lib/gateway-attribution";
import { getWorkersEnv } from "@/server/lib/runtime-env";

/**
 * Google through the Every App gateway (AUTH_MODE=everyapp): the gateway
 * holds the Google OAuth client and each member's connection to OpenSEO,
 * which the member makes once, here (the Connect button sends them to the
 * gateway's `/connect/google-workspace` and back). The connection is that
 * member's and OpenSEO's alone; another app's Google connection is a
 * different one. Calls go through `integrationFetch`, which puts the
 * member's token on them; OpenSEO never sees a Google token, client or
 * secret (docs/design/2026-11-oauth-simplify.md in the Every App repo).
 *
 * The capability is `google-workspace` with Google's own scopes
 * `webmasters.readonly` and `analytics.readonly` (everyapp.config.ts); the
 * gateway adds the identity scopes. A project's connection rows keep
 * `connectedByUserId`, the member who picked the property, and every read
 * for that project goes out on that member's connection, whoever is
 * looking, as OpenSEO's own mode reads with that member's Google grant.
 * Where OpenSEO's own mode keeps the Google account id, the rows keep the
 * sentinel {@link GATEWAY_GOOGLE_ACCOUNT_ID}: the gateway, not OpenSEO,
 * knows which Google account was connected.
 */
export const GATEWAY_GOOGLE_PROVIDER = "google-workspace";

/** The one "account" a member has in gateway mode: their gateway connection. */
export const GATEWAY_GOOGLE_ACCOUNT_ID = "everyapp";

type GatewayGoogleStatus = {
  /** The app lists `google-workspace` and the gateway holds a Google client. */
  available: boolean;
  /** The member behind the served request has a working connection. */
  connected: boolean;
  /** A connection exists but has expired or was revoked: connect again. */
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
 * The gateway's answer for Google: whether it holds a client, and the
 * served request's member's connection. Never calls Google.
 */
export async function getGatewayGoogleStatus(): Promise<GatewayGoogleStatus> {
  const env = await gatewayEnv();
  try {
    const status = await integrationStatus({
      env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: gatewayCallFor(),
    });
    return statusOf(status);
  } catch (error) {
    // No gateway binding and nothing in .dev.vars: local dev without Google.
    if (error instanceof ConfigurationError) return statusOf(null);
    throw error;
  }
}

/**
 * A fetch that reaches Google's APIs through the gateway with `userId`'s
 * token on it (the member listing their own properties, or the member who
 * connected a project's property), or null without the gateway binding
 * (local dev with no GOOGLE_WORKSPACE_ACCESS_TOKEN in .dev.vars). Send
 * Google's real URLs and no Authorization header.
 */
export async function getGatewayGoogleFetch(
  userId: string,
): Promise<typeof fetch | null> {
  const env = await gatewayEnv();
  try {
    return integrationFetch({
      env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: gatewayCallForUser(userId),
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

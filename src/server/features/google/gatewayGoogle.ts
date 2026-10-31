import {
  ConfigurationError,
  connectUrl,
  integrationFetch,
  integrationStatus,
  type OAuthClientIntegrationStatus,
} from "@every-app/sdk/server";

/** The organization's own connection, whoever is asking. */
const ORGANIZATION = { background: true } as const;
import { getWorkersEnv } from "@/server/lib/runtime-env";

/**
 * Google through the Every App gateway (AUTH_MODE=everyapp): the gateway
 * holds the Google OAuth client and the organization's connection, which an
 * owner or admin makes once (the Connect button here, or Every App → Manage
 * workspace → Providers → Connect for the organization). Everyone in the
 * workspace reads Search Console and Analytics through it, as they share
 * one OpenSEO workspace. Calls go through `integrationFetch`, which puts the
 * organization's token on them; OpenSEO never sees a Google token, client
 * or secret (docs/design/2026-10-oauth-providers.md in the Every App repo).
 *
 * The capability is `google-workspace` with the scope sets `identity`,
 * `search-console.read` and `analytics.read` (everyapp.config.ts). A
 * project's connection rows keep `connectedByUserId` as the member who
 * picked the property, and the sentinel
 * {@link GATEWAY_GOOGLE_ACCOUNT_ID} where OpenSEO's own mode keeps the
 * Google account id: the gateway, not OpenSEO, knows which Google account
 * was connected.
 */
export const GATEWAY_GOOGLE_PROVIDER = "google-workspace";

/** The one "account" in gateway mode: the organization's connection. */
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
 * The gateway's answer for Google: whether it holds a client, and the
 * organization's connection. Never calls Google.
 */
export async function getGatewayGoogleStatus(): Promise<GatewayGoogleStatus> {
  const env = await gatewayEnv();
  try {
    const status = await integrationStatus({
      env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: ORGANIZATION,
    });
    return statusOf(status);
  } catch (error) {
    // No gateway binding and nothing in .dev.vars: local dev without Google.
    if (error instanceof ConfigurationError) return statusOf(null);
    throw error;
  }
}

/**
 * A fetch that reaches Google's APIs through the gateway with the
 * organization's token on it, or null without the gateway binding (local dev with no
 * GOOGLE_WORKSPACE_ACCESS_TOKEN in .dev.vars). Send Google's real URLs and
 * no Authorization header.
 */
export async function getGatewayGoogleFetch(): Promise<typeof fetch | null> {
  const env = await gatewayEnv();
  try {
    return integrationFetch({
      env,
      provider: GATEWAY_GOOGLE_PROVIDER,
      for: ORGANIZATION,
    });
  } catch (error) {
    if (error instanceof ConfigurationError) return null;
    throw error;
  }
}

/**
 * Where a Connect button sends an owner or admin: the gateway's page that
 * connects Google for the organization, which comes back to `returnTo` (the
 * OpenSEO page they were on) once Google has answered.
 */
export async function getGatewayGoogleConnectUrl(
  returnTo: string,
): Promise<string> {
  return connectUrl({
    env: await gatewayEnv(),
    provider: GATEWAY_GOOGLE_PROVIDER,
    returnTo,
    account: "organization",
  });
}

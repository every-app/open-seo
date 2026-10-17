import { isEveryAppAuthMode } from "@/lib/auth-mode";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

/**
 * Who holds the Google OAuth client that Search Console and Analytics use.
 *
 * - `own_client`: OpenSEO's own (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET),
 *   on app.openseo.so and every self-host mode.
 * - `gateway`: the Every App gateway (AUTH_MODE=everyapp). Google is an
 *   integration the gateway holds for every app, like DataForSEO; OpenSEO
 *   keeps no Google client, secret or token. Designed in the Every App
 *   repository (docs/design/2026-10-google-integration.md, PRs 8a to 9), not
 *   built: until it is, this mode reports Google as not available, its own
 *   connect flow and callbacks are off, and nothing calls Google.
 */
type GoogleAccessMode = "own_client" | "gateway";

export async function getGoogleAccessMode(): Promise<GoogleAccessMode> {
  return isEveryAppAuthMode(await getOptionalEnvValue("AUTH_MODE"))
    ? "gateway"
    : "own_client";
}

/**
 * Whether the gateway offers Google to this app. Never yet: this becomes
 * `integrationStatus({ env, provider: "google" })` from `@every-app/sdk`, and
 * calls go through `integrationFetch({ env, provider: "google", … })`, once
 * the gateway's Google integration exists.
 */
export async function isGatewayGoogleAvailable(): Promise<boolean> {
  return false;
}

/** OpenSEO's own OAuth callback routes: absent where the gateway holds Google. */
export async function ownGoogleCallbackDisabled(): Promise<boolean> {
  return (await getGoogleAccessMode()) === "gateway";
}

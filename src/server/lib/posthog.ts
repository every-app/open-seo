import { env } from "cloudflare:workers";
import { PostHog } from "posthog-node";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

/** Returns a one-shot PostHog client, or null if the key is missing. Caller must shut down after use.
 *  A new instance per call is fine — this runs on Cloudflare Workers where construction cost is negligible. */
function getServerPostHogClient(): PostHog | null {
  const apiKey = env.POSTHOG_PUBLIC_KEY?.trim();
  const host = env.POSTHOG_HOST?.trim();
  if (!apiKey || !host) return null;

  return new PostHog(apiKey, {
    host,
    flushAt: 1,
    flushInterval: 0,
  });
}

export async function captureServerError(
  error: unknown,
  properties: Record<string, string | null | undefined> = {},
) {
  if (!(await isHostedServerAuthMode())) {
    return;
  }

  const client = getServerPostHogClient();
  if (!client) return;

  try {
    await client.captureExceptionImmediate(error, undefined, {
      source: "server",
      ...properties,
    });
  } catch (posthogError) {
    console.error("posthog server capture failed", posthogError);
  } finally {
    await client.shutdown().catch(() => {});
  }
}

export async function captureServerEvent(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
  organizationId: string;
}) {
  if (!(await isHostedServerAuthMode())) {
    return;
  }

  const client = getServerPostHogClient();
  if (!client) return;

  try {
    client.capture({
      distinctId: args.distinctId,
      event: args.event,
      properties: args.properties,
      groups: {
        organization: args.organizationId,
      },
    });
  } catch (posthogError) {
    console.error("posthog server capture failed", posthogError);
  } finally {
    await client.shutdown().catch(() => {});
  }
}

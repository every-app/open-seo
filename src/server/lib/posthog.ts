import { env } from "cloudflare:workers";
import { PostHog } from "posthog-node";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

export async function captureServerError(
  error: unknown,
  properties: Record<string, string | null | undefined> = {},
) {
  if (!(await isHostedServerAuthMode())) {
    return;
  }

  const apiKey = env.POSTHOG_PUBLIC_KEY?.trim();

  if (!apiKey) {
    return;
  }

  const client = new PostHog(apiKey, {
    host: env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
    flushAt: 1,
    flushInterval: 0,
  });

  try {
    await client.captureExceptionImmediate(error, undefined, {
      source: "server",
      ...properties,
    });
  } catch (posthogError) {
    console.error("posthog server capture failed", posthogError);
  } finally {
    await client.shutdown();
  }
}

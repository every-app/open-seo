import { env } from "cloudflare:workers";
import { PostHog } from "posthog-node";
import { asAppError } from "@/server/lib/errors";
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

/**
 * The error as error tracking receives it: its type, AppError code and stack
 * frames, never its message. Messages can quote customer content (DataForSEO
 * echoes request params, failed queries print their values, model errors
 * include output), so call sites log the full error to Cloudflare instead.
 * In the message's place goes a code safe to show: the AppError code, else
 * the status or code the error carries (GscApiError's 403, a Postgres
 * SQLSTATE), else the cause's, so issues and their alerts never read blank.
 */
function withoutMessage(error: unknown, depth = 0): Error {
  if (!(error instanceof Error)) {
    const redacted = new Error(asAppError(error)?.code ?? REDACTED);
    redacted.stack = `Error: ${redacted.message}`;
    return redacted;
  }
  const cause =
    error.cause !== undefined && depth < 4
      ? withoutMessage(error.cause, depth + 1)
      : undefined;
  const redacted = new Error(
    asAppError(error)?.code ?? safeCode(error) ?? cause?.message ?? REDACTED,
  );
  redacted.name = error.name;
  // Only real frames: a multi-line message would otherwise be parsed into
  // frames, content included.
  const frames = (error.stack ?? "")
    .split("\n")
    .filter((line) => /^\s+at /.test(line));
  redacted.stack = [`${error.name}: ${redacted.message}`, ...frames].join("\n");
  if (cause) redacted.cause = cause;
  return redacted;
}

const REDACTED = "message redacted";

// Only numbers and SCREAMING_CASE tokens, so a `code` field that holds free
// text can't carry customer content through.
function safeCode(error: Error): string | undefined {
  for (const key of ["code", "status"]) {
    const value: unknown = Reflect.get(error, key);
    if (typeof value === "number") return String(value);
    if (typeof value === "string" && /^[A-Z0-9_]{1,40}$/.test(value)) {
      return value;
    }
  }
  return undefined;
}

/**
 * `distinctId` must be the better-auth user id, the same identity
 * identifyAnalyticsUser and captureServerEvent send, so exceptions land on the
 * existing person profile. Omitting it makes posthog-node mint a fresh anonymous
 * id per event, so every error reports as many users affected as it has events.
 */
export async function captureServerError(
  error: unknown,
  properties: Record<string, string | null | undefined> = {},
  distinctId?: string,
) {
  if (!(await isHostedServerAuthMode())) {
    return;
  }

  const client = getServerPostHogClient();
  if (!client) return;

  try {
    await client.captureExceptionImmediate(withoutMessage(error), distinctId, {
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
  /** Null only before the user has an organization (sign-up). */
  organizationId: string | null;
}) {
  if (!(await isHostedServerAuthMode())) {
    return;
  }

  const client = getServerPostHogClient();
  if (!client) return;

  try {
    // Product analytics follows the user's choice (synced from the browser).
    // Imported lazily so modules that only report events don't pull in the
    // database client at load time. Scoped because some callers, like the
    // chat agent's telemetry, run outside a request's Postgres scope.
    const [{ withPgClient }, { AuthRepository }] = await Promise.all([
      import("@/db"),
      import("@/server/auth/repositories/AuthRepository"),
    ]);
    const optedOut = await withPgClient(() =>
      AuthRepository.isAnalyticsOptedOut(args.distinctId),
    );
    if (optedOut) return;

    client.capture({
      distinctId: args.distinctId,
      event: args.event,
      properties: args.properties,
      groups: args.organizationId
        ? { organization: args.organizationId }
        : undefined,
    });
  } catch (posthogError) {
    console.error("posthog server capture failed", posthogError);
  } finally {
    await client.shutdown().catch(() => {});
  }
}

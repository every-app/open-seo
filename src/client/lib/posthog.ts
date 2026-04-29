import { isHostedClientAuthMode } from "@/lib/auth-mode";

// Type-only import: extracts the type at compile time without bundling posthog-js
// oxlint-disable-next-line typescript/consistent-type-imports -- import() type avoids eagerly bundling posthog-js
type BrowserPostHogClient = typeof import("posthog-js").default;

let browserPostHogClientPromise: Promise<BrowserPostHogClient | null> | null =
  null;
let browserPostHogInitialized = false;
let analyticsCaptureEnabled = true;

function getBrowserPostHogClient(): Promise<BrowserPostHogClient | null> {
  if (typeof window === "undefined" || !isHostedClientAuthMode()) {
    return Promise.resolve(null);
  }

  if (browserPostHogClientPromise) {
    return browserPostHogClientPromise;
  }

  // Dynamic import: lazily loads posthog-js only when first needed, keeping it out of the initial bundle
  browserPostHogClientPromise = import("posthog-js")
    .then((module) => {
      const client = module.default;
      const apiKey = import.meta.env.POSTHOG_PUBLIC_KEY?.trim();
      const host = import.meta.env.POSTHOG_HOST?.trim();

      if (!apiKey || !host) {
        return null;
      }

      if (!browserPostHogInitialized) {
        client.init(apiKey, {
          api_host: host,
          defaults: "2026-01-30",
          capture_exceptions: true,
          capture_pageview: "history_change",
          respect_dnt: true,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: "[data-ph-mask], .ph-mask",
          },
          sanitize_properties(properties, event) {
            if (event === "$pageview" || event === "$pageleave") {
              const url: unknown = properties["$current_url"];
              if (typeof url === "string") {
                try {
                  const parsed = new URL(url);
                  parsed.searchParams.delete("email");
                  properties["$current_url"] = parsed.toString();
                } catch {
                  // leave as-is if URL parsing fails
                }
              }
            }
            return properties;
          },
        });
        browserPostHogInitialized = true;
      }

      return client;
    })
    .catch((error) => {
      console.error("posthog client init failed", error);
      return null;
    });

  return browserPostHogClientPromise;
}

function withPostHogClient(fn: (client: BrowserPostHogClient) => void) {
  void getBrowserPostHogClient().then((client) => {
    if (!client) return;
    try {
      fn(client);
    } catch (e) {
      console.error("posthog operation failed", e);
    }
  });
}

function withExistingPostHogClient(fn: (client: BrowserPostHogClient) => void) {
  if (!browserPostHogClientPromise) return;
  void browserPostHogClientPromise.then((client) => {
    if (!client) return;
    try {
      fn(client);
    } catch (e) {
      console.error("posthog operation failed", e);
    }
  });
}

export function captureClientEvent(
  event: string,
  properties?: Record<string, unknown>,
) {
  if (!analyticsCaptureEnabled) return;
  withPostHogClient((client) => client.capture(event, properties));
}

export function identifyAnalyticsUser(args: {
  userId: string;
  organizationId: string | null;
}) {
  if (!analyticsCaptureEnabled) return;
  withPostHogClient((client) => {
    client.identify(args.userId);
    if (args.organizationId) {
      client.group("organization", args.organizationId);
    }
  });
}

export function resetAnalyticsUser() {
  withExistingPostHogClient((client) => {
    client.stopSessionRecording();
    client.reset();
  });
}

export function stopAnalyticsCapture() {
  analyticsCaptureEnabled = false;
  if (!browserPostHogInitialized || !browserPostHogClientPromise) return;
  void browserPostHogClientPromise.then((client) => {
    if (!client) return;
    try {
      client.stopSessionRecording();
      client.opt_out_capturing();
    } catch (e) {
      console.error("posthog opt-out failed", e);
    }
  });
}

export function startAnalyticsCapture() {
  analyticsCaptureEnabled = true;
  withPostHogClient((client) => {
    client.opt_in_capturing();
    client.startSessionRecording();
  });
}

export function captureClientError(
  error: unknown,
  properties: Record<string, string | null | undefined> = {},
) {
  if (!analyticsCaptureEnabled) return;
  withPostHogClient((client) =>
    client.captureException(error, {
      source: "client",
      ...properties,
    }),
  );
}

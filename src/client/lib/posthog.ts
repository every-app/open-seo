import { isHostedClientAuthMode } from "@/lib/auth-mode";

// Type-only import: extracts the type at compile time without bundling posthog-js
// oxlint-disable-next-line typescript/consistent-type-imports -- import() type avoids eagerly bundling posthog-js
type BrowserPostHogClient = typeof import("posthog-js").default;

let browserPostHogClientPromise: Promise<BrowserPostHogClient | null> | null =
  null;
let browserPostHogInitialized = false;

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

      if (!apiKey) {
        return null;
      }

      if (!browserPostHogInitialized) {
        client.init(apiKey, {
          api_host:
            import.meta.env.POSTHOG_HOST?.trim() || "https://us.i.posthog.com",
          defaults: "2026-01-30",
          capture_exceptions: true,
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

export function initPostHog() {
  void getBrowserPostHogClient();
}

export function captureClientError(
  error: unknown,
  properties: Record<string, string | null | undefined> = {},
) {
  void getBrowserPostHogClient().then((client) => {
    if (!client) {
      return;
    }

    try {
      client.captureException(error, {
        source: "client",
        ...properties,
      });
    } catch (e) {
      console.error("posthog capture failed", e);
    }
  });
}

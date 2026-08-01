import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  POSTHOG_PERSONAL_DATA_QUERY_PARAMETERS,
  sanitizePostHogProperties,
  sanitizePostHogUrl,
} from "@/client/lib/posthog-sanitize";

// Type-only import: extracts the type at compile time without bundling posthog-js
// oxlint-disable-next-line typescript/consistent-type-imports -- import() type avoids eagerly bundling posthog-js
type BrowserPostHogClient = typeof import("posthog-js").default;

let browserPostHogClientPromise: Promise<BrowserPostHogClient | null> | null =
  null;
let browserPostHogInitialized = false;
let analyticsCaptureEnabled = true;

type ExceptionEntry = {
  value?: unknown;
  mechanism?: { synthetic?: boolean };
  stacktrace?: { frames?: unknown[] };
};

// Unactionable exceptions we don't want polluting error tracking. They share
// the trait of not being our code: browser extensions inject promise rejections
// and cross-origin scripts surface as a detail-less "Script error.", while the
// global onerror handler synthesizes a stackless "undefined" when it fires
// without a real Error object. Real app errors always carry a stack, so the
// "undefined" rule is gated on synthetic + no frames to avoid false drops.
function isIgnorableException(
  properties: Record<string, unknown> | undefined,
): boolean {
  const list = properties?.["$exception_list"];
  if (!Array.isArray(list) || list.length === 0) return false;
  return list.every((entry: ExceptionEntry) => {
    const value = typeof entry?.value === "string" ? entry.value : "";
    if (value.includes("Object Not Found Matching Id")) return true;
    if (value === "Script error.") return true;
    if (value.includes("signal is aborted without reason")) return true;
    const frames = entry?.stacktrace?.frames;
    return (
      value === "undefined" &&
      entry?.mechanism?.synthetic === true &&
      (!Array.isArray(frames) || frames.length === 0)
    );
  });
}

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
          before_send(event) {
            if (
              event?.event === "$exception" &&
              isIgnorableException(event.properties)
            ) {
              return null;
            }
            return event;
          },
          capture_pageview: "history_change",
          mask_personal_data_properties: true,
          custom_personal_data_properties: [
            ...POSTHOG_PERSONAL_DATA_QUERY_PARAMETERS,
          ],
          respect_dnt: true,
          session_recording: {
            maskAllInputs: true,
            maskTextSelector: "[data-ph-mask], .ph-mask",
            maskCapturedNetworkRequestFn(request) {
              return {
                ...request,
                name: sanitizePostHogUrl(request.name),
              };
            },
          },
          sanitize_properties(properties) {
            return sanitizePostHogProperties(properties);
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

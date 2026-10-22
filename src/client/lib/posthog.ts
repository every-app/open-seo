import { isHostedClientAuthMode } from "@/lib/auth-mode";
import {
  sanitizePostHogEvent,
  sanitizePostHogUrl,
} from "@/client/lib/posthog-sanitize";

// Type-only import: extracts the type at compile time without bundling posthog-js
// oxlint-disable-next-line typescript/consistent-type-imports -- import() type avoids eagerly bundling posthog-js
type BrowserPostHogClient = typeof import("posthog-js").default;

let browserPostHogClientPromise: Promise<BrowserPostHogClient | null> | null =
  null;
// Off until PrivacyBootstrap applies the visitor's choices, so nothing is
// captured before we know whether analytics is allowed.
let analyticsCaptureEnabled = false;
// Events reported before then, such as a page's first view: the choices can
// resolve after the page mounts. Sent if analytics starts, dropped if it
// doesn't. Null once the choices are known.
let eventsBeforeChoices:
  | [string, Record<string, unknown> | undefined][]
  | null = [];
let clientErrorCaptureStopped = false;

type ExceptionEntry = {
  value?: unknown;
  mechanism?: { synthetic?: boolean };
  stacktrace?: { frames?: unknown[] };
};

// Unactionable exceptions we don't want polluting error tracking. Most share
// the trait of not being our code: browser extensions inject promise rejections
// and cross-origin scripts surface as a detail-less "Script error.", while the
// global onerror handler synthesizes a stackless "undefined" when it fires
// without a real Error object. Real app errors always carry a stack, so the
// "undefined" rule is gated on synthetic + no frames to avoid false drops.
// The rest are expected cancellations: TanStack Query throws "CancelledError"
// when a route load is abandoned mid-flight (navigating away), which is normal
// behavior, not a failure. Matched exactly so a real error that merely mentions
// cancellation still gets captured.
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
    // ResizeObserver's loop warning is benign by spec (the browser defers
    // delivery to the next frame) but surfaces as an error. Caveat: this also
    // mutes a real ResizeObserver->setState feedback loop, if we ship one.
    if (value.includes("ResizeObserver loop")) return true;
    // The PostHog SDK's own network timeouts — capturing them just makes error
    // tracking report on itself.
    if (value.includes("PostHog request timed out")) return true;
    if (value === "CancelledError") return true;
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

      client.init(apiKey, {
        api_host: host,
        defaults: "2026-01-30",
        capture_exceptions: true,
        before_send(event) {
          if (!event) return null;
          if (
            event.event === "$exception" &&
            isIgnorableException(event.properties)
          ) {
            return null;
          }
          return sanitizePostHogEvent(event);
        },
        capture_pageview: "history_change",
        // Autocaptured clicks carry no on-screen text or element attributes.
        mask_all_text: true,
        mask_all_element_attributes: true,
        mask_personal_data_properties: true,
        respect_dnt: true,
        // Opting out also clears PostHog's cookie and stored identifiers.
        opt_out_persistence_by_default: true,
        // Recording starts in startAnalyticsCapture, once replay is allowed.
        disable_session_recording: true,
        // Console output can quote page content and full error messages,
        // and the project setting would otherwise record it in replays.
        enable_recording_console_log: false,
        // Recordings mask all text and inputs: app screens show customer
        // content (keywords, domains, GSC/GA data, reports, chat messages).
        session_recording: {
          maskAllInputs: true,
          maskTextSelector: "*",
          // Text masking doesn't cover attributes, and the recorder has no
          // attribute masker. These elements carry content in attributes
          // (keyword links, customer URLs, favicons, prompt and URL titles
          // and labels), so they are recorded as blank boxes.
          blockSelector:
            'a[href^="http"], a[href*="?"], img, [title], [aria-label]',
          recordHeaders: false,
          recordBody: false,
          // Runs on page URLs and network entries. Project settings can turn
          // payload capture on remotely, so headers and bodies are dropped
          // here too.
          maskCapturedNetworkRequestFn(request) {
            return {
              ...request,
              name: sanitizePostHogUrl(request.name),
              requestHeaders: undefined,
              requestBody: undefined,
              responseHeaders: undefined,
              responseBody: undefined,
            };
          },
        },
      });

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
  if (!analyticsCaptureEnabled) {
    if (eventsBeforeChoices && eventsBeforeChoices.length < 50)
      eventsBeforeChoices.push([event, properties]);
    return;
  }
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
  eventsBeforeChoices = null;
  // Chained even while PostHog is still loading, so this runs after a pending
  // start and the stop wins.
  withExistingPostHogClient((client) => {
    client.stopSessionRecording();
    client.opt_out_capturing();
  });
}

export function startAnalyticsCapture({ replay }: { replay: boolean }) {
  analyticsCaptureEnabled = true;
  const pending = eventsBeforeChoices ?? [];
  eventsBeforeChoices = null;
  withPostHogClient((client) => {
    if (!analyticsCaptureEnabled) return;
    client.opt_in_capturing({ captureEventName: false });
    if (replay) client.startSessionRecording();
    else client.stopSessionRecording();
    for (const [event, properties] of pending)
      client.capture(event, properties);
  });
}

// Called right before reloading a stale tab onto a new build. Errors thrown
// while that reload is pending are side effects of the missing chunks, not bugs.
export function stopClientErrorCapture() {
  clientErrorCaptureStopped = true;
}

export function captureClientError(
  error: unknown,
  properties: Record<string, string | null | undefined> = {},
) {
  if (!analyticsCaptureEnabled || clientErrorCaptureStopped) return;
  withPostHogClient((client) =>
    client.captureException(error, {
      source: "client",
      ...properties,
    }),
  );
}

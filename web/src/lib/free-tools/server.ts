import { env } from "cloudflare:workers";
import { brand } from "@/lib/brand";
import { z } from "zod";
import { dataforseoCallsPerDay } from "@/lib/free-tools/spend";
import type {
  FreeToolBudget,
  BudgetReservation,
} from "@/lib/free-tools/budget";
import type { FreeToolSlug } from "@/lib/free-tools/tool-pages";

const DATAFORSEO_BASE = "https://api.dataforseo.com";

/** Every free tool shares the same per-visitor rate limiter. */
type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type Bindings = {
  DATAFORSEO_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  BACKLINK_CHECK_RATE_LIMIT?: RateLimiter;
  FREE_TOOL_BUDGET?: DurableObjectNamespace<FreeToolBudget>;
};

function bindings(): Bindings {
  return env as unknown as Bindings;
}

export function normalizeDomain(input: string): string | null {
  let hostname: string;
  try {
    hostname = new URL(input.includes("://") ? input : `https://${input}`)
      .hostname;
  } catch {
    return null;
  }
  const domain = hostname.replace(/^www\./, "").toLowerCase();
  const isValid =
    /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      domain,
    );
  return isValid ? domain : null;
}

export function jsonResponse(
  data: unknown,
  status = 200,
  headers?: HeadersInit,
) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function cacheableJson(data: unknown, maxAgeSeconds: number) {
  return jsonResponse(data, 200, {
    "Cache-Control": `public, max-age=${maxAgeSeconds}`,
  });
}

/** Shared 502 shape. Short max-age so a failing target isn't retried in a loop. */
export function failureResponse(message: string) {
  return jsonResponse({ error: message }, 502, {
    "Cache-Control": "public, max-age=120",
  });
}

export function dataforseoKey(): string | undefined {
  return bindings().DATAFORSEO_API_KEY;
}

export function serviceUnavailable(tool: string) {
  console.error(`Missing DATAFORSEO_API_KEY for ${tool}`);
  return jsonResponse({ error: "Service temporarily unavailable" }, 503);
}

const UNAVAILABLE =
  "This tool is temporarily unavailable. Please try again later.";
const turnstileResultSchema = z.object({
  success: z.boolean(),
  hostname: z.string().optional(),
  action: z.string().optional(),
});

/** Bound the bytes read, including requests without Content-Length. */
export async function readToolBody(
  request: Request,
): Promise<unknown | Response> {
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return jsonResponse({ error: "Send a JSON request" }, 415);
  }
  const reader = request.body?.getReader();
  if (!reader) return jsonResponse({ error: "Invalid request" }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) {
        await reader.cancel();
        return jsonResponse({ error: "Request is too large" }, 413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return jsonResponse({ error: "Invalid JSON request" }, 400);
  } finally {
    reader.releaseLock();
  }
}

/** Production protection must be present; development bypass is build-time only. */
export async function guardToolRequest(input: {
  tool: string;
  request: Request;
  turnstileToken?: string;
}): Promise<Response | null> {
  const { TURNSTILE_SECRET_KEY, BACKLINK_CHECK_RATE_LIMIT } = bindings();
  const url = new URL(input.request.url);
  const origin = input.request.headers.get("origin");
  if (origin && origin !== url.origin) {
    return jsonResponse(
      { error: "Cross-site submissions are not allowed" },
      403,
    );
  }
  const ip = input.request.headers.get("cf-connecting-ip");
  const secret = TURNSTILE_SECRET_KEY?.trim();
  if (
    !import.meta.env.DEV &&
    (!secret || /^[123]x0+/.test(secret) || !BACKLINK_CHECK_RATE_LIMIT || !ip)
  ) {
    console.error(`Missing production abuse protection for ${input.tool}`);
    return jsonResponse({ error: UNAVAILABLE }, 503);
  }
  // Across all tools, before Siteverify, so switching tools cannot reset the
  // allowance and invalid tokens cannot flood the verification service.
  if (BACKLINK_CHECK_RATE_LIMIT) {
    try {
      const { success } = await BACKLINK_CHECK_RATE_LIMIT.limit({
        key: `free-tools:${ip ?? "local"}`,
      });
      if (!success)
        return jsonResponse(
          { error: "Too many checks. Try again in a minute." },
          429,
          { "Retry-After": "60" },
        );
    } catch {
      return jsonResponse({ error: UNAVAILABLE }, 503);
    }
  }
  if (!secret && import.meta.env.DEV) return null;
  if (!input.turnstileToken || input.turnstileToken.length > 2048) {
    return jsonResponse(
      { error: "Human verification failed. Refresh the page and try again." },
      403,
    );
  }
  try {
    const body = new URLSearchParams({
      secret: secret!,
      response: input.turnstileToken,
    });
    if (ip) body.set("remoteip", ip);
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body,
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok) return jsonResponse({ error: UNAVAILABLE }, 503);
    const result = turnstileResultSchema.safeParse(await response.json());
    if (
      !result.success ||
      !result.data.success ||
      result.data.hostname !== url.hostname ||
      result.data.action !== "free_tool"
    ) {
      return jsonResponse(
        { error: "Human verification failed. Refresh the page and try again." },
        403,
      );
    }
    return null;
  } catch {
    return jsonResponse({ error: UNAVAILABLE }, 503);
  }
}

/** Reserve the entire uncached run before the first paid call. Never fail open. */
export async function chargeToolBudget(input: {
  tool: FreeToolSlug;
  request: Request;
  calls: number;
}): Promise<Response | null> {
  if (dataforseoCallsPerDay[input.tool] === null || input.calls <= 0)
    return null;
  const namespace = bindings().FREE_TOOL_BUDGET;
  if (!namespace) return jsonResponse({ error: UNAVAILABLE }, 503);
  try {
    const day = new Date().toISOString().slice(0, 10);
    const ip = input.request.headers.get("cf-connecting-ip") ?? "local";
    // Date-scoped hash avoids storing raw IPs; it is not an anonymity guarantee.
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(`${day}:${ip}`),
    );
    const visitor = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const decision = await namespace.getByName(day).reserve({
      tool: input.tool as BudgetReservation["tool"],
      calls: input.calls,
      visitor,
      day,
    });
    if (decision === "allowed") return null;
    const message =
      decision === "visitor"
        ? "You've hit today's free limit. Sign up for the full workspace."
        : `This free tool has reached today's limit. Try again tomorrow, or sign up for ${brand.name} to keep researching.`;
    return jsonResponse({ error: message }, 429);
  } catch (err) {
    console.error(`Free tool budget unavailable (${input.tool}):`, err);
    return jsonResponse({ error: UNAVAILABLE }, 503);
  }
}

// ---------------------------------------------------------------------------
// Per-key result cache (Cloudflare Cache API, per colo). Stores parsed results
// and short-lived failures so repeated lookups avoid another provider call.
// ---------------------------------------------------------------------------

type CachedEnvelope<T> = { ok: true; data: T } | { ok: false; error: string };

function cacheStore(): Cache {
  return (caches as unknown as { default: Cache }).default;
}

function cacheRequest(tool: string, key: string): Request {
  return new Request(
    `${brand.marketingUrl}/api/${tool}/${encodeURIComponent(key)}`,
  );
}

export async function readCached<T>(
  tool: string,
  key: string,
): Promise<CachedEnvelope<T> | null> {
  const hit = await cacheStore().match(cacheRequest(tool, key));
  if (!hit) return null;
  return (await hit.json().catch(() => null)) as CachedEnvelope<T> | null;
}

export async function writeCached(
  tool: string,
  key: string,
  envelope: CachedEnvelope<unknown>,
  ttlSeconds: number,
): Promise<void> {
  const body = jsonResponse(envelope, 200, {
    "Cache-Control": `public, max-age=${ttlSeconds}`,
  });
  await cacheStore()
    .put(cacheRequest(tool, key), body)
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// DataForSEO
// ---------------------------------------------------------------------------

// DataForSEO task envelope: HTTP 200 with per-task status codes; 20000 = ok.
const taskEnvelopeSchema = z.object({
  tasks: z
    .array(
      z
        .object({
          status_code: z.number().optional(),
          status_message: z.string().optional(),
          result: z
            .array(z.record(z.string(), z.unknown()))
            .nullable()
            .optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export async function fetchDataforseoResult(
  path: string,
  payload: Record<string, unknown>,
  apiKey: string,
) {
  const response = await fetch(`${DATAFORSEO_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${apiKey}`,
    },
    body: JSON.stringify([payload]),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`DataForSEO HTTP ${response.status} on ${path}`);
  }
  const task = taskEnvelopeSchema.parse(await response.json()).tasks?.[0];
  // "No Search Results" is a successful empty result, not a failure — an
  // obscure keyword or an unknown domain lands here. Match on the message, not
  // the 40501 code alone: that code also covers validation rejections like
  // "Invalid Field: 'target'.", which are real charged failures we must
  // surface. Mirrors isNoResultsTask in src/server/lib/dataforseo/envelope.ts.
  const noResults =
    task?.status_message?.toLowerCase().includes("no search results") ?? false;
  if (!task || (task.status_code !== 20000 && !noResults)) {
    throw new Error(
      `DataForSEO task ${task?.status_code ?? "missing"} on ${path}: ${task?.status_message ?? "no task"}`,
    );
  }
  return task.result?.[0] ?? null;
}

/** `result[0].items` for the endpoints that return a single result block. */
export const itemsResultSchema = z
  .object({
    items: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
    total_count: z.number().nullable().optional(),
  })
  .passthrough();

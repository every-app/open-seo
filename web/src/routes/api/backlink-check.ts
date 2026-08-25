import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";
import { z } from "zod";

const DATAFORSEO_BASE = "https://api.dataforseo.com";
const TOP_BACKLINKS_LIMIT = 15;
const CACHE_TTL_SECONDS = 86_400;
// Hard ceiling on paid DataForSEO lookups per day (~$0.04 each). Cached
// checks don't count. Bumping this is a deliberate spend decision.
const DAILY_CHECK_BUDGET = 500;

const requestSchema = z.object({
  target: z.string().trim().min(1, "Enter a domain").max(300),
  turnstileToken: z.string().max(4096).optional(),
});

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

const summaryResultSchema = z
  .object({
    rank: z.number().nullable().optional(),
    backlinks: z.number().nullable().optional(),
    referring_domains: z.number().nullable().optional(),
    broken_backlinks: z.number().nullable().optional(),
  })
  .passthrough();

const backlinksResultSchema = z
  .object({
    items: z
      .array(
        z
          .object({
            type: z.string().nullable().optional(),
            domain_from: z.string().nullable().optional(),
            url_from: z.string().nullable().optional(),
            url_to: z.string().nullable().optional(),
            anchor: z.string().nullable().optional(),
            dofollow: z.boolean().nullable().optional(),
            domain_from_rank: z.number().nullable().optional(),
            page_from_title: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .nullable()
      .optional(),
  })
  .passthrough();

type RateLimiter = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type KvStore = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

function normalizeDomain(input: string): string | null {
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

function jsonResponse(data: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string | null,
): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body },
  );
  if (!response.ok) return false;
  const data = (await response.json()) as { success?: boolean };
  return data.success === true;
}

async function fetchDataforseoResult(
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
  if (!task || task.status_code !== 20000) {
    throw new Error(
      `DataForSEO task ${task?.status_code ?? "missing"} on ${path}: ${task?.status_message ?? "no task"}`,
    );
  }
  return task.result?.[0] ?? null;
}

export const Route = createFileRoute("/api/backlink-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json().catch(() => null);
        const parsed = requestSchema.safeParse(body);
        if (!parsed.success) {
          return jsonResponse(
            { error: parsed.error.issues[0]?.message ?? "Invalid request" },
            400,
          );
        }

        const domain = normalizeDomain(parsed.data.target);
        if (!domain) {
          return jsonResponse(
            { error: "Enter a valid domain, like example.com" },
            400,
          );
        }

        const apiKey = (env as any).DATAFORSEO_API_KEY as string | undefined;
        if (!apiKey) {
          console.error("Missing DATAFORSEO_API_KEY");
          return jsonResponse(
            { error: "Service temporarily unavailable" },
            503,
          );
        }

        const ip = request.headers.get("cf-connecting-ip");

        // Bot check. Enforced only when the secret is configured, so local
        // dev and fresh deploys keep working without a Turnstile widget.
        const turnstileSecret = (env as any).TURNSTILE_SECRET_KEY as
          | string
          | undefined;
        if (turnstileSecret) {
          const token = parsed.data.turnstileToken;
          const verified = token
            ? await verifyTurnstile(turnstileSecret, token, ip)
            : false;
          if (!verified) {
            console.error(
              token
                ? "Turnstile siteverify rejected the token — VITE_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY may be from different widgets"
                : "TURNSTILE_SECRET_KEY is set but the request sent no token — VITE_TURNSTILE_SITE_KEY may be missing from the deployed build",
            );
            return jsonResponse(
              {
                error:
                  "Human verification failed. Refresh the page and try again.",
              },
              403,
            );
          }
        }

        const limiter = (env as any).BACKLINK_CHECK_RATE_LIMIT as
          | RateLimiter
          | undefined;
        if (limiter) {
          const { success } = await limiter.limit({ key: ip ?? "unknown" });
          if (!success) {
            return jsonResponse(
              { error: "Too many checks. Try again in a minute." },
              429,
            );
          }
        }

        // Per-colo cache so repeat checks of the same domain don't re-bill.
        const cache = (caches as unknown as { default: Cache }).default;
        const cacheKey = new Request(
          `https://openseo.so/api/backlink-check/${domain}`,
        );
        const cached = await cache.match(cacheKey);
        if (cached) return cached;

        // Global daily budget. Best-effort: KV reads are edge-cached and the
        // increment is non-atomic, so the ceiling is approximate — the hard
        // spend bound is the DataForSEO account balance. Counts attempts, not
        // successes, so charged-but-failed calls still consume budget, and a
        // KV error can never fail a request the user already paid latency for.
        const kv = (env as any).BACKLINK_CHECK_KV as KvStore | undefined;
        if (kv) {
          const budgetKey = `daily-checks:${new Date().toISOString().slice(0, 10)}`;
          try {
            const stored = Number(await kv.get(budgetKey));
            const used = Number.isFinite(stored) ? stored : 0;
            if (used >= DAILY_CHECK_BUDGET) {
              return jsonResponse(
                {
                  error:
                    "The free checker has reached today's limit. Try again tomorrow, or sign up for OpenSEO for full backlink research.",
                },
                429,
              );
            }
            await kv.put(budgetKey, String(used + 1), {
              expirationTtl: 2 * 86_400,
            });
          } catch (err) {
            console.error("Backlink check budget counter error:", err);
          }
        }

        // Mirrors the app's backlinks defaults (src/server/lib/dataforseo/backlinks.ts).
        const commonPayload = {
          target: domain,
          include_subdomains: true,
          include_indirect_links: true,
          exclude_internal_backlinks: true,
          backlinks_status_type: "live",
          rank_scale: "one_hundred",
        };

        try {
          const [summaryRaw, backlinksRaw] = await Promise.all([
            fetchDataforseoResult(
              "/v3/backlinks/summary/live",
              commonPayload,
              apiKey,
            ),
            fetchDataforseoResult(
              "/v3/backlinks/backlinks/live",
              {
                ...commonPayload,
                limit: TOP_BACKLINKS_LIMIT,
                mode: "one_per_domain",
                // Strongest linking domains first, like Ahrefs' free checker.
                order_by: ["domain_from_rank,desc"],
              },
              apiKey,
            ),
          ]);

          const summary = summaryResultSchema.parse(summaryRaw ?? {});
          const backlinks = backlinksResultSchema.parse(backlinksRaw ?? {});

          const topBacklinks = (backlinks.items ?? [])
            .filter((item) => item.type === "backlink" && item.url_from)
            .map((item) => ({
              domainFrom: item.domain_from ?? null,
              urlFrom: item.url_from ?? null,
              urlTo: item.url_to ?? null,
              pageTitle: item.page_from_title?.trim()
                ? item.page_from_title
                : null,
              anchor: item.anchor?.trim() ? item.anchor : null,
              dofollow: item.dofollow ?? null,
              domainRank: item.domain_from_rank ?? null,
            }));

          const response = jsonResponse(
            {
              target: domain,
              summary: {
                rank: summary.rank ?? null,
                backlinks: summary.backlinks ?? null,
                referringDomains: summary.referring_domains ?? null,
                brokenBacklinks: summary.broken_backlinks ?? null,
              },
              topBacklinks,
            },
            200,
            { "Cache-Control": `public, max-age=${CACHE_TTL_SECONDS}` },
          );
          await cache.put(cacheKey, response.clone());
          return response;
        } catch (err) {
          console.error("Backlink check error:", err);
          // Negative cache: money was already spent, so stop an immediate
          // retry loop on a reliably-failing domain. 502s are only stored
          // when explicitly marked cacheable.
          const response = jsonResponse(
            { error: "Backlink check failed. Please try again." },
            502,
            { "Cache-Control": "public, max-age=120" },
          );
          await cache.put(cacheKey, response.clone()).catch(() => {});
          return response;
        }
      },
    },
  },
});

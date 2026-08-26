import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import { SerperConnectionRepository } from "@/server/features/paa-mining/repositories/SerperConnectionRepository";

/**
 * Minimal client for the Serper.dev Google Search API (https://serper.dev).
 * Two call patterns:
 *
 *   1. PAA extraction — one call per seed keyword returns the
 *      `peopleAlsoAsk[]` array (question + snippet + link + title).
 *   2. Site-restricted social mining — one call per PAA question with a
 *      `site:reddit.com` / `site:quora.com` filter returns ranked threads
 *      whose snippets carry the answer language.
 *
 * Auth is a bearer API key supplied by the operator via SERPER_API_KEY,
 * mirroring the BYO DATAFORSEO_API_KEY / ONPAGE_API_KEY pattern; the
 * integration stays dormant when the key is absent.
 */
const API_BASE = "https://google.serper.dev";
const REQUEST_TIMEOUT_MS = 30_000;

export class SerperApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "SerperApiError";
  }
}

/** Env var wins (operator-controlled, DataForSEO-style); the stored key is
 * the fallback. */
async function getSerperApiKey(): Promise<string | null> {
  const envKey = await getOptionalEnvValue("SERPER_API_KEY");
  if (envKey) return envKey;
  return SerperConnectionRepository.getApiKey();
}

export async function isSerperConfigured(): Promise<boolean> {
  return (await getSerperApiKey()) !== null;
}

async function apiBase(): Promise<string> {
  const override = await getOptionalEnvValue("SERPER_API_BASE");
  return (override ?? API_BASE).replace(/\/+$/, "");
}

// ─── Schemas ────────────────────────────────────────────────────────────────

const serperSearchResponseSchema = z.object({
  searchParameters: z
    .object({
      q: z.string(),
      gl: z.string().optional(),
      hl: z.string().optional(),
    })
    .optional(),
  organic: z
    .array(
      z.object({
        title: z.string().optional(),
        link: z.string().optional(),
        snippet: z.string().optional(),
        position: z.number().optional(),
      }),
    )
    .optional(),
  peopleAlsoAsk: z
    .array(
      z.object({
        question: z.string(),
        snippet: z.string().optional(),
        title: z.string().optional(),
        link: z.string().optional(),
      }),
    )
    .optional(),
  answerBox: z
    .object({
      title: z.string().optional(),
      snippet: z.string().optional(),
      link: z.string().optional(),
    })
    .optional(),
});

type SerperSearchResponse = z.infer<typeof serperSearchResponseSchema>;

// ─── HTTP ────────────────────────────────────────────────────────────────────

async function search(
  query: string,
  opts: { gl?: string; hl?: string; num?: number } = {},
): Promise<SerperSearchResponse> {
  const key = await getSerperApiKey();
  if (!key) {
    throw new AppError(
      "AUTH_CONFIG_MISSING",
      "Serper.dev is not connected. Set SERPER_API_KEY (get a key at https://serper.dev) to enable PAA + Social Mining.",
    );
  }

  const base = await apiBase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`${base}/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": key,
      },
      body: JSON.stringify({
        q: query,
        gl: opts.gl ?? "us",
        hl: opts.hl ?? "en",
        num: opts.num ?? 10,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new SerperApiError(res.status, `Serper.dev returned ${res.status}`);
    }

    const raw = await res.json();
    const parsed = serperSearchResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new SerperApiError(
        0,
        `Serper.dev returned an unexpected payload: ${parsed.error.message}`,
      );
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof AppError || error instanceof SerperApiError)
      throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new SerperApiError(0, "Serper.dev request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Extract the People Also Ask questions for a seed keyword. */
export async function getPeopleAlsoAsk(input: {
  keyword: string;
  region?: string;
}): Promise<
  { question: string; snippet: string | null; link: string | null }[]
> {
  const res = await search(input.keyword, { gl: input.region ?? "us" });
  return (res.peopleAlsoAsk ?? []).map((q) => ({
    question: q.question,
    snippet: q.snippet ?? null,
    link: q.link ?? null,
  }));
}

/** Mine social threads (Reddit/Quora) answering a PAA question. */
export async function getSocialThreads(input: {
  question: string;
  source: "reddit" | "quora";
  region?: string;
  num?: number;
}): Promise<
  {
    title: string;
    link: string;
    snippet: string | null;
    position: number | null;
  }[]
> {
  const siteFilter =
    input.source === "reddit" ? "site:reddit.com" : "site:quora.com";
  const res = await search(`${input.question} ${siteFilter}`, {
    gl: input.region ?? "us",
    num: input.num ?? 10,
  });
  return (res.organic ?? []).map((r) => ({
    title: r.title ?? "",
    link: r.link ?? "",
    snippet: r.snippet ?? null,
    position: r.position ?? null,
  }));
}

/** Verify the connection by making a minimal search call. */
export async function verifySerperConnection(): Promise<{
  ok: boolean;
  message?: string;
}> {
  try {
    await search("test", { num: 1 });
    return { ok: true };
  } catch (error) {
    if (error instanceof SerperApiError) {
      return { ok: false, message: error.message };
    }
    if (error instanceof AppError) {
      return { ok: false, message: error.message };
    }
    return {
      ok: false,
      message: "Unexpected error verifying Serper.dev connection",
    };
  }
}

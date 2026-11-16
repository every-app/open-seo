import { z } from "zod";
import type { PsAiDisclosure } from "@/shared/platform-seo";
import { type ChannelResult, fail, ok, TIMEOUT_MS } from "./channelResult";

// Dev.to (Forem API v1, https://developers.forem.com/api/v1). An API key goes
// in the api-key header; v1 requires its Accept header. An article created
// with published: false is a draft (no public URL); PUT published: true
// publishes it, and its slug and URL change then.
const BASE_URL = "https://dev.to/api";
const HEADERS = {
  Accept: "application/vnd.forem.api-v1+json",
  "Content-Type": "application/json",
  // Dev.to answers 403 to requests without a User-Agent.
  "User-Agent": "OpenSEO",
};

const errorSchema = z.object({ error: z.string() });
const userSchema = z.object({ username: z.string(), name: z.string() });
const articleSchema = z.object({
  id: z.number().int(),
  url: z.string(),
  published_at: z.string().nullable().optional(),
});

export type DevtoArticleInput = {
  title: string;
  bodyMarkdown: string;
  description: string | null;
  tags: string[];
  canonicalUrl: string | null;
  aiDisclosure: PsAiDisclosure | null;
};

async function request<T>(
  apiKey: string,
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown },
  schema: z.ZodType<T>,
): Promise<ChannelResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: { ...HEADERS, "api-key": apiKey },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      // Workers have no redirect: "error"; a redirect is never followed and
      // reads as unavailable below.
      redirect: "manual",
    });
  } catch {
    return fail("unavailable", "Dev.to did not respond. Try again shortly.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = errorSchema.safeParse(body);
    const said = detail.success ? detail.data.error : null;
    switch (response.status) {
      case 401:
        return fail(
          "bad_token",
          "Dev.to rejected the API key. Create a new one at dev.to/settings/extensions and connect again.",
        );
      case 404:
        return fail(
          "not_found",
          "Dev.to no longer has this article, or the key's account can't edit it.",
        );
      case 422:
        return fail(
          "rejected",
          `Dev.to rejected the article${said ? `: ${said.slice(0, 300)}` : "."}`,
        );
      case 429:
        return fail(
          "rate_limited",
          "Dev.to is rate limiting this account. Wait a few minutes and try again.",
        );
      default:
        return fail(
          "unavailable",
          `Dev.to is unavailable (HTTP ${response.status}). Try again shortly.`,
        );
    }
  }
  const parsed = schema.safeParse(body);
  return parsed.success
    ? ok(parsed.data)
    : fail("unavailable", "Dev.to returned an unexpected response.");
}

function articleBody(input: DevtoArticleInput) {
  return {
    title: input.title,
    body_markdown: input.bodyMarkdown,
    description: input.description ?? undefined,
    tags: input.tags,
    canonical_url: input.canonicalUrl,
    ...(input.aiDisclosure ? { ai_disclosure_level: input.aiDisclosure } : {}),
  };
}

const toArticle = (a: z.infer<typeof articleSchema>) => ({
  id: String(a.id),
  url: a.url,
  publishedAt: a.published_at ?? null,
});

export async function getDevtoUser(apiKey: string) {
  return request(apiKey, "/users/me", { method: "GET" }, userSchema);
}

export async function createDevtoDraft(
  apiKey: string,
  input: DevtoArticleInput,
) {
  const result = await request(
    apiKey,
    "/articles",
    {
      method: "POST",
      body: { article: { ...articleBody(input), published: false } },
    },
    articleSchema,
  );
  return result.ok ? ok(toArticle(result.value)) : result;
}

// Sends the current text; `publish` also takes a draft live.
export async function updateDevtoArticle(
  apiKey: string,
  id: string,
  input: DevtoArticleInput,
  publish: boolean,
) {
  const result = await request(
    apiKey,
    `/articles/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: {
        article: {
          ...articleBody(input),
          ...(publish ? { published: true } : {}),
        },
      },
    },
    articleSchema,
  );
  return result.ok ? ok(toArticle(result.value)) : result;
}

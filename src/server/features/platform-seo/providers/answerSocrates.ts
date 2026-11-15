import { z } from "zod";
import { AppError } from "@/server/lib/errors";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";
import type { PsKeywordGroup } from "@/shared/platform-seo";

// Answer Socrates REST API (https://answersocrates.com/docs/api).
// GET /api/v1/keywords?q=&gl=&hl= -> named groups (Questions, Prepositions,
// Comparisons, time-based) plus the raw Autocomplete list. 1 request per
// call; burst limit 60/min per key.
const BASE_URL = "https://answersocrates.com/api/v1";
const TIMEOUT_MS = 60_000;

const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string().optional() }),
  request_id: z.string().optional(),
});

// GET /keywords returns { groups: { questions, comparisons, prepositions,
// "in the past", ... }, autocomplete } where each list is
// { count, keywords: string[] }. Group names are display labels, so the
// time-based ones ("in the past", "in the future") are matched loosely.
const keywordListSchema = z.object({ keywords: z.array(z.string()) });
const successSchema = z.object({
  groups: z.record(z.string(), keywordListSchema),
  autocomplete: keywordListSchema.optional(),
});

type AnswerSocratesKeyword = { keyword: string; group: PsKeywordGroup };

function groupForName(name: string): PsKeywordGroup {
  const n = name.toLowerCase();
  if (n.startsWith("question")) return "question";
  if (n.startsWith("preposition")) return "preposition";
  if (n.startsWith("comparison")) return "comparison";
  // Every other named group is a time modifier ("in the past", "in the
  // future"); anything unrecognised still came from Google Suggest.
  if (/past|future|time|date|year|now/.test(n)) return "time";
  return "autocomplete";
}

function extractKeywords(body: z.infer<typeof successSchema>) {
  const lists: Array<[PsKeywordGroup, string[]]> = Object.entries(
    body.groups,
  ).map(([name, list]) => [groupForName(name), list.keywords]);
  // Autocomplete last, so a keyword also found in a named group keeps that
  // more specific group.
  if (body.autocomplete)
    lists.push(["autocomplete", body.autocomplete.keywords]);

  const seen = new Set<string>();
  const keywords: AnswerSocratesKeyword[] = [];
  for (const [group, list] of lists) {
    for (const raw of list) {
      const keyword = raw.trim().toLowerCase().replace(/\s+/g, " ");
      if (!keyword || keyword.length > 200 || seen.has(keyword)) continue;
      seen.add(keyword);
      keywords.push({ keyword, group });
    }
  }
  return keywords;
}

function toAppError(status: number, code: string | undefined): AppError {
  switch (code) {
    case "quota_exceeded":
      return new AppError(
        "RATE_LIMITED",
        "Your Answer Socrates monthly request quota is used up.",
      );
    case "rate_limited":
      return new AppError(
        "RATE_LIMITED",
        "Answer Socrates allows 60 requests a minute. Try again shortly.",
      );
    case "plan_not_eligible":
      return new AppError(
        "FORBIDDEN",
        "Your Answer Socrates plan does not include API access.",
      );
    case "unauthorized":
      return new AppError(
        "VALIDATION_ERROR",
        "The Answer Socrates API key is missing, malformed or revoked.",
      );
    case "bad_request":
      return new AppError(
        "VALIDATION_ERROR",
        "Answer Socrates rejected the seed.",
      );
    default:
      return new AppError(
        "UPSTREAM_UNAVAILABLE",
        `Answer Socrates is unavailable (HTTP ${status}${code ? `, ${code}` : ""}).`,
      );
  }
}

export async function fetchAnswerSocratesKeywords(params: {
  seed: string;
  country: string;
  language: string;
}): Promise<AnswerSocratesKeyword[]> {
  const apiKey = await getOptionalEnvValue("ANSWERSOCRATES_API_KEY");
  if (!apiKey) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Add ANSWERSOCRATES_API_KEY to use keyword expansion.",
    );
  }
  const url = new URL(`${BASE_URL}/keywords`);
  url.searchParams.set("q", params.seed);
  url.searchParams.set("gl", params.country);
  url.searchParams.set("hl", params.language);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Answer Socrates did not respond.",
    );
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = errorEnvelopeSchema.safeParse(body);
    throw toAppError(
      response.status,
      envelope.success ? envelope.data.error.code : undefined,
    );
  }
  const parsed = successSchema.safeParse(body);
  if (!parsed.success) {
    throw new AppError(
      "UPSTREAM_UNAVAILABLE",
      "Answer Socrates returned an unexpected response.",
    );
  }
  return extractKeywords(parsed.data);
}

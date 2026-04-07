import { AppError } from "@/server/lib/errors";
import {
  normalizeBacklinksSpamFilterOptions,
  type BacklinksSpamFilterOptions,
} from "@/types/schemas/backlinks";
import type {
  DataforseoApiCallCost,
  DataforseoApiResponse,
} from "@/server/lib/dataforseoCost";
import { getRequiredEnvValue } from "@/server/lib/runtime-env";
import {
  type BacklinksTaskResult,
  backlinksHistoryItemSchema,
  backlinksItemSchema,
  backlinksSummaryItemSchema,
  domainPageSummaryItemSchema,
  parseFirstResult,
  parseItems,
  referringDomainItemSchema,
  responseSchema,
} from "@/server/lib/dataforseoBacklinksSupport";
import { classifyBacklinksErrorWithAccountState } from "@/server/lib/dataforseoBacklinksAccount";
export { normalizeBacklinksTarget } from "@/server/lib/dataforseoBacklinksTarget";

const API_BASE = "https://api.dataforseo.com";

export type BacklinksRequest = {
  target: string;
};

export type BacklinksListRequest = BacklinksRequest &
  BacklinksSpamFilterOptions & {
    limit?: number;
  };

export type BacklinksTimeseriesRequest = {
  target: string;
  dateFrom: string;
  dateTo: string;
};

type DataforseoTaskResponse = {
  results: BacklinksTaskResult[];
  billing: DataforseoApiCallCost;
};

async function createAuthenticatedFetch() {
  const apiKey = await getRequiredEnvValue("DATAFORSEO_API_KEY");

  return (url: RequestInfo, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Basic ${apiKey}`);

    return fetch(url, {
      ...init,
      headers,
    });
  };
}

async function postBacklinks(path: string, payload: unknown) {
  const authenticatedFetch = await createAuthenticatedFetch();
  const response = await authenticatedFetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  if (!response.ok) {
    const classifiedError = await classifyBacklinksErrorWithAccountState(
      response.status,
      rawText,
      path,
    );
    if (classifiedError) throw classifiedError;
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO HTTP ${response.status} on ${path}`,
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText);
  } catch {
    const classifiedError = await classifyBacklinksErrorWithAccountState(
      response.status,
      rawText,
      path,
    );
    if (classifiedError) throw classifiedError;
    console.error(
      `dataforseo.${path}.non-json-response`,
      rawText.slice(0, 800),
    );
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned a non-JSON response`,
    );
  }

  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) {
    const classifiedError = await classifyBacklinksErrorWithAccountState(
      response.status,
      rawText,
      path,
    );
    if (classifiedError) throw classifiedError;
    console.error(
      `dataforseo.${path}.invalid-top-level-shape`,
      rawText.slice(0, 800),
    );
    throw new AppError(
      "INTERNAL_ERROR",
      `DataForSEO ${path} returned an invalid response shape`,
    );
  }

  const responseData = parsed.data;
  if (responseData.status_code !== 20000) {
    const classifiedError = await classifyBacklinksErrorWithAccountState(
      responseData.status_code,
      `${responseData.status_message ?? ""} ${rawText}`,
      path,
    );
    if (classifiedError) throw classifiedError;
    throw new AppError(
      "INTERNAL_ERROR",
      responseData.status_message || "DataForSEO request failed",
    );
  }

  const task = responseData.tasks?.[0];
  if (!task) {
    throw new AppError("INTERNAL_ERROR", "DataForSEO response missing task");
  }

  if (task.status_code !== 20000) {
    const classifiedError = await classifyBacklinksErrorWithAccountState(
      task.status_code,
      `${task.status_message ?? ""} ${rawText}`,
      path,
    );
    if (classifiedError) throw classifiedError;
    throw new AppError(
      "INTERNAL_ERROR",
      task.status_message || "DataForSEO task failed",
    );
  }

  return {
    results: (task.result ?? []).filter(
      (r): r is BacklinksTaskResult => r != null,
    ),
    billing: {
      path: task.path ?? [],
      costUsd: task.cost ?? responseData.cost ?? 0,
      resultCount: task.result_count ?? null,
    },
  } satisfies DataforseoTaskResponse;
}

function buildCommonPayload(input: BacklinksRequest) {
  return {
    target: input.target,
    include_subdomains: true,
    include_indirect_links: true,
    exclude_internal_backlinks: true,
    backlinks_status_type: "live",
    rank_scale: "one_hundred",
  };
}

export async function fetchBacklinksSummaryRaw(input: BacklinksRequest) {
  const response = await postBacklinks("/v3/backlinks/summary/live", [
    buildCommonPayload(input),
  ]);
  const data = parseFirstResult(
    "backlinks-summary-live",
    response.results,
    backlinksSummaryItemSchema,
  );
  return {
    data,
    billing: response.billing,
  } satisfies DataforseoApiResponse<typeof data>;
}

export async function fetchBacklinksRowsRaw(input: BacklinksListRequest) {
  const spamFilterOptions = normalizeBacklinksSpamFilterOptions(input);
  const filters = spamFilterOptions.hideSpam
    ? [["backlink_spam_score", "<=", spamFilterOptions.spamThreshold]]
    : undefined;
  const response = await postBacklinks("/v3/backlinks/backlinks/live", [
    {
      ...buildCommonPayload(input),
      limit: input.limit ?? 100,
      order_by: ["rank,desc"],
      ...(filters ? { filters } : {}),
    },
  ]);
  const data = parseItems(
    "backlinks-live",
    response.results,
    backlinksItemSchema,
  );
  return {
    data,
    billing: response.billing,
  } satisfies DataforseoApiResponse<typeof data>;
}

export async function fetchReferringDomainsRaw(input: BacklinksListRequest) {
  const spamFilterOptions = normalizeBacklinksSpamFilterOptions(input);
  const filters = spamFilterOptions.hideSpam
    ? [["backlinks_spam_score", "<=", spamFilterOptions.spamThreshold]]
    : undefined;
  const response = await postBacklinks("/v3/backlinks/referring_domains/live", [
    {
      ...buildCommonPayload(input),
      limit: input.limit ?? 100,
      order_by: ["backlinks,desc"],
      ...(filters ? { filters } : {}),
    },
  ]);
  const data = parseItems(
    "referring-domains-live",
    response.results,
    referringDomainItemSchema,
  );
  return {
    data,
    billing: response.billing,
  } satisfies DataforseoApiResponse<typeof data>;
}

export async function fetchDomainPagesSummaryRaw(input: BacklinksListRequest) {
  const response = await postBacklinks(
    "/v3/backlinks/domain_pages_summary/live",
    [
      {
        ...buildCommonPayload(input),
        limit: input.limit ?? 100,
        order_by: ["backlinks,desc"],
      },
    ],
  );
  const data = parseItems(
    "domain-pages-summary-live",
    response.results,
    domainPageSummaryItemSchema,
  );
  return {
    data,
    billing: response.billing,
  } satisfies DataforseoApiResponse<typeof data>;
}

export async function fetchBacklinksHistoryRaw(
  input: BacklinksTimeseriesRequest,
) {
  const response = await postBacklinks("/v3/backlinks/history/live", [
    {
      target: input.target,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      rank_scale: "one_hundred",
    },
  ]);
  const data = parseItems(
    "backlinks-history-live",
    response.results,
    backlinksHistoryItemSchema,
  );
  return {
    data,
    billing: response.billing,
  } satisfies DataforseoApiResponse<typeof data>;
}

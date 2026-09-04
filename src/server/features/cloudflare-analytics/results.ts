import type {
  CloudflareCapabilities,
  CloudflareCrawlerResult,
  CloudflareSecurityResult,
  CloudflareTrafficResult,
} from "./schemas";
import { sortBy } from "remeda";
import { privacySafePath } from "./pathPrivacy";

const CLOUDFLARE_QUERY_ROW_LIMIT = 500;

type Window = { from: string; to: string };
type Status = CloudflareTrafficResult["status"];

export function boundedErrors(errors: readonly string[]): string[] {
  return errors.slice(0, 5).map((message) => message.slice(0, 300));
}

function resultMeta(input: {
  status: Status;
  window: Window | null;
  warnings?: string[];
  sampled?: boolean;
  truncated?: boolean;
  retryAfterSeconds?: number;
}) {
  return {
    source: "cloudflare_analytics" as const,
    status: input.status,
    window: input.window
      ? {
          ...input.window,
          timezone: "UTC" as const,
          granularity: "hour" as const,
        }
      : null,
    coverage: {
      sampled: input.sampled ?? false,
      truncated: input.truncated ?? false,
    },
    retryAfterSeconds: input.retryAfterSeconds ?? null,
    warnings: input.warnings ?? [],
  };
}

function queryStatus(errors: readonly string[], truncated: boolean): Status {
  return errors.length > 0 || truncated ? "partial" : "ok";
}

function emptyStatus(errors: readonly string[]): Status {
  return errors.length > 0 ? "unavailable" : "no_data";
}

function sampled(
  errors: readonly string[],
  intervals: readonly (number | undefined)[],
) {
  return (
    intervals.some((interval) => interval !== undefined && interval > 1) ||
    errors.some((message) => /sampl/i.test(message))
  );
}

function normalizeHost(raw: string | undefined): string | null {
  const value = raw?.trim().toLowerCase().replace(/\.$/, "") ?? "";
  return value.length > 0 ? value : null;
}

export function trafficResult(input: {
  rows:
    | Array<{
        count: number;
        dimensions: { edgeResponseStatus?: number };
        sum?: { edgeResponseBytes?: number; visits?: number };
        avg?: { sampleInterval?: number };
      }>
    | undefined;
  errors: string[];
  window: Window;
  capabilities: CloudflareCapabilities;
}): CloudflareTrafficResult {
  if (!input.rows) {
    return {
      ...resultMeta({
        status: "unavailable",
        window: input.window,
        warnings: [
          "traffic_dataset_unavailable",
          ...boundedErrors(input.errors),
        ],
      }),
      data: null,
    };
  }
  if (input.rows.length === 0) {
    return {
      ...resultMeta({
        status: emptyStatus(input.errors),
        window: input.window,
        warnings: boundedErrors(input.errors),
      }),
      data: null,
    };
  }

  const byStatus = new Map<number, number>();
  let requests = 0;
  let responseBytes = 0;
  let visits = 0;
  let visitsAvailable = false;
  for (const row of input.rows) {
    requests += row.count;
    responseBytes += row.sum?.edgeResponseBytes ?? 0;
    if (row.sum?.visits !== undefined) {
      visits += row.sum.visits;
      visitsAvailable = true;
    }
    const status = Math.trunc(row.dimensions.edgeResponseStatus ?? 0);
    byStatus.set(status, (byStatus.get(status) ?? 0) + row.count);
  }
  const statuses = sortBy(
    [...byStatus.entries()].map(([status, count]) => ({
      status,
      requests: count,
    })),
    (item) => item.status,
  );
  const truncated = input.rows.length >= CLOUDFLARE_QUERY_ROW_LIMIT;
  return {
    ...resultMeta({
      status: queryStatus(input.errors, truncated),
      window: input.window,
      sampled: sampled(
        input.errors,
        input.rows.map((row) => row.avg?.sampleInterval),
      ),
      truncated,
      warnings: [
        ...boundedErrors(input.errors),
        ...(truncated ? ["provider_row_limit_reached"] : []),
      ],
    }),
    data: {
      requests,
      responseBytes,
      visits: visitsAvailable ? visits : null,
      statuses,
      errors4xx: statuses
        .filter(({ status }) => status >= 400 && status < 500)
        .reduce((sum, item) => sum + item.requests, 0),
      errors5xx: statuses
        .filter(({ status }) => status >= 500 && status < 600)
        .reduce((sum, item) => sum + item.requests, 0),
      capabilities: input.capabilities,
    },
  };
}

export function securityResult(input: {
  rows:
    | Array<{
        count: number;
        dimensions: {
          action?: string;
          source?: string;
          ruleId?: string;
          clientRequestHTTPHost?: string;
          clientRequestPath?: string;
        };
        avg?: { sampleInterval?: number };
      }>
    | undefined;
  errors: string[];
  window: Window;
  capabilities: CloudflareCapabilities;
}): CloudflareSecurityResult {
  if (!input.rows) {
    return {
      ...resultMeta({
        status: "unavailable",
        window: input.window,
        warnings: [
          "security_dataset_unavailable",
          ...boundedErrors(input.errors),
        ],
      }),
      data: null,
    };
  }
  if (input.rows.length === 0) {
    return {
      ...resultMeta({
        status: emptyStatus(input.errors),
        window: input.window,
        warnings: boundedErrors(input.errors),
      }),
      data: null,
    };
  }
  const eventsByKey = new Map<
    string,
    NonNullable<CloudflareSecurityResult["data"]>["events"][number]
  >();
  for (const row of input.rows) {
    const event = {
      action: row.dimensions.action ?? "unknown",
      source: row.dimensions.source ?? null,
      ruleId: row.dimensions.ruleId ?? null,
      host: normalizeHost(row.dimensions.clientRequestHTTPHost),
      pathname: privacySafePath(row.dimensions.clientRequestPath),
      count: row.count,
    };
    const key = JSON.stringify([
      event.action,
      event.source,
      event.ruleId,
      event.host,
      event.pathname,
    ]);
    const existing = eventsByKey.get(key);
    if (existing) existing.count += event.count;
    else eventsByKey.set(key, event);
  }
  const events = sortBy([...eventsByKey.values()], (event) => -event.count);
  const truncated = input.rows.length >= CLOUDFLARE_QUERY_ROW_LIMIT;
  return {
    ...resultMeta({
      status: queryStatus(input.errors, truncated),
      window: input.window,
      sampled: sampled(
        input.errors,
        input.rows.map((row) => row.avg?.sampleInterval),
      ),
      truncated,
      warnings: [
        ...boundedErrors(input.errors),
        ...(truncated ? ["provider_row_limit_reached"] : []),
      ],
    }),
    data: {
      totalEvents: events.reduce((sum, event) => sum + event.count, 0),
      events,
      capabilities: input.capabilities,
    },
  };
}

type CrawlerRow = {
  count: number;
  dimensions: {
    clientRequestHTTPHost?: string;
    clientRequestPath?: string;
    edgeResponseStatus?: number;
  };
  avg?: { sampleInterval?: number };
};

function crawlerSummary(crawler: "googlebot" | "bingbot", rows: CrawlerRow[]) {
  const pagesByKey = new Map<
    string,
    { host: string; pathname: string; status: number; requests: number }
  >();
  for (const row of rows) {
    const host = normalizeHost(row.dimensions.clientRequestHTTPHost);
    if (!host) continue;
    const page = {
      host,
      pathname: privacySafePath(row.dimensions.clientRequestPath),
      status: Math.trunc(row.dimensions.edgeResponseStatus ?? 0),
      requests: row.count,
    };
    const key = JSON.stringify([page.host, page.pathname, page.status]);
    const existing = pagesByKey.get(key);
    if (existing) existing.requests += page.requests;
    else pagesByKey.set(key, page);
  }
  const pages = sortBy([...pagesByKey.values()], (page) => -page.requests);
  const sum = (predicate: (status: number) => boolean) =>
    pages
      .filter((page) => predicate(page.status))
      .reduce((total, page) => total + page.requests, 0);
  return {
    crawler,
    requests: pages.reduce((total, page) => total + page.requests, 0),
    successful: sum((status) => status >= 200 && status < 400),
    blocked: sum((status) => status === 401 || status === 403),
    serverErrors: sum((status) => status >= 500),
    pages,
  };
}

export function crawlerResult(input: {
  zone: { googlebot: CrawlerRow[]; bingbot: CrawlerRow[] } | undefined;
  errors: string[];
  window: Window;
  capabilities: CloudflareCapabilities;
}): CloudflareCrawlerResult {
  if (!input.zone) {
    return {
      ...resultMeta({
        status: "unavailable",
        window: input.window,
        warnings: [
          "crawler_dataset_unavailable",
          ...boundedErrors(input.errors),
        ],
      }),
      data: null,
    };
  }
  const rows = [...input.zone.googlebot, ...input.zone.bingbot];
  if (rows.length === 0) {
    return {
      ...resultMeta({
        status: emptyStatus(input.errors),
        window: input.window,
        warnings: boundedErrors(input.errors),
      }),
      data: null,
    };
  }
  const truncated =
    input.zone.googlebot.length >= CLOUDFLARE_QUERY_ROW_LIMIT ||
    input.zone.bingbot.length >= CLOUDFLARE_QUERY_ROW_LIMIT;
  return {
    ...resultMeta({
      status: queryStatus(input.errors, truncated),
      window: input.window,
      sampled: sampled(
        input.errors,
        rows.map((row) => row.avg?.sampleInterval),
      ),
      truncated,
      warnings: [
        ...boundedErrors(input.errors),
        ...(truncated ? ["provider_row_limit_reached"] : []),
      ],
    }),
    data: {
      crawlers: [
        crawlerSummary("googlebot", input.zone.googlebot),
        crawlerSummary("bingbot", input.zone.bingbot),
      ],
      capabilities: input.capabilities,
    },
  };
}

export function unavailableResult(input: {
  status: Status;
  warning: string;
  window: Window;
  retryAfterSeconds?: number;
}): ReturnType<typeof resultMeta> & { data: null } {
  return {
    ...resultMeta({
      status: input.status,
      window: input.window,
      retryAfterSeconds: input.retryAfterSeconds,
      warnings: [input.warning],
    }),
    data: null,
  };
}

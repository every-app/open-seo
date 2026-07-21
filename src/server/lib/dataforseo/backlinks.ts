import type { z } from "zod";
import {
  BacklinksBacklinksLiveRequestInfo,
  BacklinksDomainPagesSummaryLiveRequestInfo,
  BacklinksHistoryLiveRequestInfo,
  BacklinksReferringDomainsLiveRequestInfo,
  BacklinksSummaryLiveRequestInfo,
} from "dataforseo-client";
import {
  normalizeBacklinksSpamFilterOptions,
  type BacklinksSpamFilterOptions,
} from "@/types/schemas/backlinks";
import { createDataforseoBillingClassifier } from "@/server/lib/dataforseoBillingClassification";
import { AppError } from "@/server/lib/errors";
import { backlinksApi } from "@/server/lib/dataforseo/core";
import {
  assertOk,
  buildTaskBilling,
  parseTaskItems,
  parseTaskTotalCount,
  type DataforseoApiResponse,
} from "@/server/lib/dataforseo/envelope";
// Schemas live in a SDK-free sibling module — see backlinksSchemas.ts's header
// comment — so rankparse/backlinks.ts can reuse them without dragging the
// dataforseo-client SDK into the eager bundle. Types are re-exported here
// because dataforseo/index.ts's public surface re-exports them from this file.
export type {
  BacklinksSummaryItem,
  BacklinksItem,
  ReferringDomainItem,
  DomainPageSummaryItem,
  BacklinksHistoryItem,
} from "@/server/lib/dataforseo/backlinksSchemas";
import {
  backlinksSummaryItemSchema,
  backlinksItemSchema,
  referringDomainItemSchema,
  domainPageSummaryItemSchema,
  backlinksHistoryItemSchema,
} from "@/server/lib/dataforseo/backlinksSchemas";

type BacklinksRequest = { target: string };
type BacklinksListRequest = BacklinksRequest &
  BacklinksSpamFilterOptions & {
    limit?: number;
    offset?: number;
    /** DataForSEO order_by entries, e.g. ["rank,desc"]. */
    orderBy?: string[];
    /** Pre-built DataForSEO filter expressions, already joined with and/or. */
    filters?: unknown[];
    /** Result grouping (backlinks list only): "one_per_domain" | "as_is". */
    mode?: string;
  };
type BacklinksTimeseriesRequest = {
  target: string;
  dateFrom: string;
  dateTo: string;
};

const classifyBacklinksError = createDataforseoBillingClassifier({
  pathPrefix: "/backlinks/",
  billingIssueCode: "BACKLINKS_BILLING_ISSUE",
  billingIssueMessage:
    "The connected DataForSEO account has a billing or balance issue",
});

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

const assertOptions = (path: string) =>
  ({ classify: classifyBacklinksError, classifyPath: path }) as const;

/**
 * Joins caller-provided filter expressions with the spam-score condition.
 * `userFilters` arrives already and/or-joined, so the spam condition is
 * appended with a single top-level "and".
 */
function combineFilters(
  userFilters: unknown[] | undefined,
  spamCondition: unknown[] | undefined,
): unknown[] | undefined {
  const merged: unknown[] = [];
  if (userFilters && userFilters.length > 0) merged.push(...userFilters);
  if (spamCondition) {
    if (merged.length > 0) merged.push("and");
    merged.push(spamCondition);
  }
  return merged.length > 0 ? merged : undefined;
}

export async function fetchBacklinksSummary(input: BacklinksRequest) {
  const response = await backlinksApi(classifyBacklinksError).summaryLive([
    new BacklinksSummaryLiveRequestInfo(buildCommonPayload(input)),
  ]);
  const task = assertOk(response, assertOptions("/v3/backlinks/summary/live"));

  const firstResult = task.result?.[0];
  if (firstResult) {
    const parsed = backlinksSummaryItemSchema.safeParse(firstResult);
    if (!parsed.success) {
      console.error(
        "dataforseo.backlinks-summary-live.invalid-result",
        parsed.error.issues.slice(0, 5),
      );
      throw new AppError(
        "INTERNAL_ERROR",
        "DataForSEO backlinks-summary-live returned an invalid response shape",
      );
    }
    return {
      data: parsed.data,
      billing: buildTaskBilling(task),
    } satisfies DataforseoApiResponse<typeof parsed.data>;
  }

  return {
    data: {} as z.infer<typeof backlinksSummaryItemSchema>,
    billing: buildTaskBilling(task),
  };
}

export async function fetchBacklinksRows(input: BacklinksListRequest) {
  const spamFilterOptions = normalizeBacklinksSpamFilterOptions(input);
  const filters = combineFilters(
    input.filters,
    spamFilterOptions.hideSpam
      ? ["backlink_spam_score", "<=", spamFilterOptions.spamThreshold]
      : undefined,
  );
  const response = await backlinksApi(classifyBacklinksError).backlinksLive([
    new BacklinksBacklinksLiveRequestInfo({
      ...buildCommonPayload(input),
      limit: input.limit ?? 100,
      offset: input.offset,
      order_by: input.orderBy ?? ["rank,desc"],
      mode: input.mode,
      ...(filters ? { filters } : {}),
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/backlinks/live"),
  );
  return {
    data: {
      items: parseTaskItems("backlinks-live", task, backlinksItemSchema),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}

export async function fetchReferringDomains(input: BacklinksListRequest) {
  const spamFilterOptions = normalizeBacklinksSpamFilterOptions(input);
  const filters = combineFilters(
    input.filters,
    spamFilterOptions.hideSpam
      ? ["backlinks_spam_score", "<=", spamFilterOptions.spamThreshold]
      : undefined,
  );
  const response = await backlinksApi(
    classifyBacklinksError,
  ).referringDomainsLive([
    new BacklinksReferringDomainsLiveRequestInfo({
      ...buildCommonPayload(input),
      limit: input.limit ?? 100,
      offset: input.offset,
      order_by: input.orderBy ?? ["backlinks,desc"],
      ...(filters ? { filters } : {}),
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/referring_domains/live"),
  );
  return {
    data: {
      items: parseTaskItems(
        "referring-domains-live",
        task,
        referringDomainItemSchema,
      ),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}

export async function fetchDomainPagesSummary(input: BacklinksListRequest) {
  const filters =
    input.filters && input.filters.length > 0 ? input.filters : undefined;
  const response = await backlinksApi(
    classifyBacklinksError,
  ).domainPagesSummaryLive([
    new BacklinksDomainPagesSummaryLiveRequestInfo({
      ...buildCommonPayload(input),
      limit: input.limit ?? 100,
      offset: input.offset,
      order_by: input.orderBy ?? ["backlinks,desc"],
      ...(filters ? { filters } : {}),
    }),
  ]);
  const task = assertOk(
    response,
    assertOptions("/v3/backlinks/domain_pages_summary/live"),
  );
  return {
    data: {
      items: parseTaskItems(
        "domain-pages-summary-live",
        task,
        domainPageSummaryItemSchema,
      ),
      totalCount: parseTaskTotalCount(task),
    },
    billing: buildTaskBilling(task),
  };
}

export async function fetchBacklinksHistory(input: BacklinksTimeseriesRequest) {
  const response = await backlinksApi(classifyBacklinksError).historyLive([
    new BacklinksHistoryLiveRequestInfo({
      target: input.target,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      rank_scale: "one_hundred",
    }),
  ]);
  const task = assertOk(response, assertOptions("/v3/backlinks/history/live"));
  return {
    data: parseTaskItems(
      "backlinks-history-live",
      task,
      backlinksHistoryItemSchema,
    ),
    billing: buildTaskBilling(task),
  };
}

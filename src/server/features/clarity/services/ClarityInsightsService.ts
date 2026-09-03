import { ClarityRepository } from "@/server/features/clarity/repositories/ClarityRepository";
import { privacySafeClarityUrl } from "@/server/features/clarity/services/ClarityPrivacy";
import { getClarityReport } from "@/server/features/clarity/services/ClarityReportService";
import type {
  ClarityReportDays,
  ClarityReportResult,
} from "@/server/features/clarity/services/ClarityReportSupport";
import { ClarityReportError } from "@/server/lib/clarityErrors";

type ClarityInsightsInput = {
  projectId: string;
  numOfDays: ClarityReportDays;
  page: number;
  pageSize: number;
};

function sanitizeOverview(
  overview: Extract<ClarityReportResult["normalized"], { kind: "overview" }>,
) {
  return {
    ...overview,
    breakdowns: {
      ...overview.breakdowns,
      referrers: overview.breakdowns.referrers.map((row) => ({
        ...row,
        label: row.label ? privacySafeClarityUrl(row.label) : null,
      })),
      popularPages: overview.breakdowns.popularPages.map((row) => ({
        ...row,
        url: privacySafeClarityUrl(row.url),
      })),
    },
  };
}

export function buildClarityInsights(
  input: Pick<ClarityInsightsInput, "page" | "pageSize"> & {
    overviewReport: ClarityReportResult;
    urlReport: ClarityReportResult;
  },
) {
  if (
    input.overviewReport.normalized.kind !== "overview" ||
    input.urlReport.normalized.kind !== "url"
  ) {
    throw new ClarityReportError(
      "clarity_malformed_response",
      "Microsoft Clarity returned mismatched report dimensions.",
    );
  }

  const allPages = input.urlReport.normalized.pages;
  const offset = (input.page - 1) * input.pageSize;
  const pages = allPages.slice(offset, offset + input.pageSize).map((page) => ({
    ...page,
    url: privacySafeClarityUrl(page.url),
  }));

  return {
    connected: true as const,
    source: input.overviewReport.source,
    request: input.overviewReport.request,
    overview: sanitizeOverview(input.overviewReport.normalized),
    pageInsights: {
      rows: pages,
      page: input.page,
      pageSize: input.pageSize,
      totalCount: allPages.length,
      hasNextPage: offset + pages.length < allPages.length,
    },
    coverage: {
      overview: input.overviewReport.coverage,
      urls: input.urlReport.coverage,
    },
    cache: {
      overview: input.overviewReport.cache,
      urls: input.urlReport.cache,
    },
    warnings: [
      ...new Set([
        ...input.overviewReport.warnings,
        ...input.urlReport.warnings,
      ]),
    ],
  };
}

async function getClarityInsightsForCurrentConnection(
  input: ClarityInsightsInput,
): Promise<ReturnType<typeof buildClarityInsights>> {
  const connection = await ClarityRepository.getConnectionByProjectId(
    input.projectId,
  );
  if (!connection) {
    throw new ClarityReportError(
      "clarity_not_connected",
      "Microsoft Clarity is not connected for this project.",
    );
  }

  const requireSameConnection = async () => {
    const current = await ClarityRepository.getConnectionByProjectId(
      input.projectId,
    );
    if (current?.id === connection.id) return;
    throw new ClarityReportError(
      "clarity_upstream_unavailable",
      "Microsoft Clarity changed while the insights were loading. Try again shortly.",
      2,
    );
  };

  // Fetch in sequence so an invalid/revoked token fails after one provider
  // request instead of spending two of Clarity's ten daily requests at once.
  const overviewReport = await getClarityReport({
    projectId: input.projectId,
    reportKind: "overview",
    numOfDays: input.numOfDays,
  });
  await requireSameConnection();
  const urlReport = await getClarityReport({
    projectId: input.projectId,
    reportKind: "url",
    numOfDays: input.numOfDays,
  });
  await requireSameConnection();
  return buildClarityInsights({
    page: input.page,
    pageSize: input.pageSize,
    overviewReport,
    urlReport,
  });
}

export function getClarityInsights(input: ClarityInsightsInput) {
  return getClarityInsightsForCurrentConnection(input);
}

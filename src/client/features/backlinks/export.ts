import { buildCsv, type CsvValue, downloadCsv } from "@/client/lib/csv";
import type {
  BacklinksSearchState,
  BacklinksTabRows,
} from "./backlinksPageTypes";
import type { DomainRatings } from "./useAhrefsDomainRatings";

/**
 * Builds the export table for the active tab. When `domainRatings` is loaded
 * (the user clicked "Ahrefs DR"), an Ahrefs DR column is included for the
 * Backlinks and Referring Domains tabs, matching the on-screen table.
 */
export function buildBacklinksTabExport(args: {
  tab: BacklinksSearchState["tab"];
  rows: BacklinksTabRows;
  domainRatings?: DomainRatings | null;
}): { headers: string[]; rows: CsvValue[][] } {
  const { tab, rows, domainRatings } = args;
  const ratingFor = (domain: string | null | undefined): CsvValue => {
    if (!domainRatings || !domain) return null;
    return domainRatings[domain.replace(/^www\./, "")] ?? null;
  };

  if (tab === "backlinks") {
    return {
      headers: [
        "Domain",
        "Source URL",
        "Target URL",
        "Anchor",
        "Type",
        "Dofollow",
        "Rel Attributes",
        "Domain Rank",
        ...(domainRatings ? ["Ahrefs DR"] : []),
        "Source Page Rank",
        "Target Rank",
        "Spam Score",
        "First Seen",
        "Last Seen",
        "Lost",
        "Broken",
        "Links Count",
      ],
      rows: rows.backlinks.map((row) => [
        row.domainFrom,
        row.urlFrom,
        row.urlTo,
        row.anchor,
        row.itemType,
        row.isDofollow,
        row.relAttributes.join(", "),
        row.domainFromRank,
        ...(domainRatings ? [ratingFor(row.domainFrom)] : []),
        row.pageFromRank,
        row.rank,
        row.spamScore,
        row.firstSeen,
        row.lastSeen,
        row.isLost,
        row.isBroken,
        row.linksCount,
      ]),
    };
  }

  if (tab === "domains") {
    return {
      headers: [
        "Domain",
        "Backlinks",
        "Referring Pages",
        "Rank",
        ...(domainRatings ? ["Ahrefs DR"] : []),
        "Spam Score",
        "First Seen",
        "Broken Backlinks",
        "Broken Pages",
      ],
      rows: rows.referringDomains.map((row) => [
        row.domain,
        row.backlinks,
        row.referringPages,
        row.rank,
        ...(domainRatings ? [ratingFor(row.domain)] : []),
        row.spamScore,
        row.firstSeen,
        row.brokenBacklinks,
        row.brokenPages,
      ]),
    };
  }

  return {
    headers: [
      "Page",
      "Backlinks",
      "Referring Domains",
      "Rank",
      "Broken Backlinks",
    ],
    rows: rows.topPages.map((row) => [
      row.page,
      row.backlinks,
      row.referringDomains,
      row.rank,
      row.brokenBacklinks,
    ]),
  };
}

export function exportBacklinksTabCsv(args: {
  tab: BacklinksSearchState["tab"];
  target: string;
  headers: string[];
  rows: CsvValue[][];
}) {
  downloadCsv(
    buildBacklinksTabCsvFilename(args.tab, args.target),
    buildCsv(args.headers, args.rows),
  );
}

export function buildBacklinksTabCsvFilename(
  tab: BacklinksSearchState["tab"],
  target: string,
) {
  const tabPrefix =
    tab === "backlinks"
      ? "backlinks"
      : tab === "domains"
        ? "referring-domains"
        : "top-pages";
  const normalizedTarget = target
    .toLowerCase()
    .trim()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `backlinks-${tabPrefix}${normalizedTarget ? `-${normalizedTarget}` : ""}.csv`;
}

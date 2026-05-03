import { buildCsv, type CsvValue, downloadCsv } from "@/client/lib/csv";
import type {
  BacklinksOverviewData,
  BacklinksSearchState,
} from "./backlinksPageTypes";

type BacklinksFilteredData = {
  backlinks: BacklinksOverviewData["backlinks"];
  referringDomains: BacklinksOverviewData["referringDomains"];
  topPages: BacklinksOverviewData["topPages"];
};

export function buildBacklinksTabExport(args: {
  tab: BacklinksSearchState["tab"];
  rows: BacklinksFilteredData;
}): { headers: string[]; rows: CsvValue[][] } {
  const { tab, rows } = args;

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

export function buildBacklinksTabCsvFile(args: {
  tab: BacklinksSearchState["tab"];
  target: string;
  rows: BacklinksFilteredData;
}) {
  const { headers, rows } = buildBacklinksTabExport({
    tab: args.tab,
    rows: args.rows,
  });
  const filenamePrefix =
    args.tab === "backlinks"
      ? "backlinks"
      : args.tab === "domains"
        ? "referring-domains"
        : "top-pages";

  return {
    filename: buildFilename(filenamePrefix, args.target),
    content: buildCsv(headers, rows),
  };
}

export function exportBacklinksTabCsv(args: {
  tab: BacklinksSearchState["tab"];
  target: string;
  rows: BacklinksFilteredData;
}) {
  const file = buildBacklinksTabCsvFile(args);
  downloadCsv(file.filename, file.content);
}

function buildFilename(tabPrefix: string, target: string) {
  const normalizedTarget = target
    .toLowerCase()
    .trim()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `backlinks-${tabPrefix}${normalizedTarget ? `-${normalizedTarget}` : ""}.csv`;
}

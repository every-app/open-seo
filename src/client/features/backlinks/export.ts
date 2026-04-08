import { buildCsv, downloadCsv } from "@/client/lib/csv";
import type {
  BacklinksOverviewData,
  BacklinksSearchState,
} from "./backlinksPageTypes";

type BacklinksFilteredData = {
  backlinks: BacklinksOverviewData["backlinks"];
  referringDomains: BacklinksOverviewData["referringDomains"];
  topPages: BacklinksOverviewData["topPages"];
};

export function buildBacklinksTabCsvFile(args: {
  tab: BacklinksSearchState["tab"];
  target: string;
  rows: BacklinksFilteredData;
}) {
  const { tab, target, rows } = args;

  if (tab === "backlinks") {
    const headers = [
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
    ];
    const lines = rows.backlinks.map((row) => [
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
    ]);

    return {
      filename: buildFilename("backlinks", target),
      content: buildCsv(headers, lines),
    };
  }

  if (tab === "domains") {
    const headers = [
      "Domain",
      "Backlinks",
      "Referring Pages",
      "Rank",
      "Spam Score",
      "First Seen",
      "Broken Backlinks",
      "Broken Pages",
    ];
    const lines = rows.referringDomains.map((row) => [
      row.domain,
      row.backlinks,
      row.referringPages,
      row.rank,
      row.spamScore,
      row.firstSeen,
      row.brokenBacklinks,
      row.brokenPages,
    ]);

    return {
      filename: buildFilename("referring-domains", target),
      content: buildCsv(headers, lines),
    };
  }

  const headers = [
    "Page",
    "Backlinks",
    "Referring Domains",
    "Rank",
    "Broken Backlinks",
  ];
  const lines = rows.topPages.map((row) => [
    row.page,
    row.backlinks,
    row.referringDomains,
    row.rank,
    row.brokenBacklinks,
  ]);

  return {
    filename: buildFilename("top-pages", target),
    content: buildCsv(headers, lines),
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

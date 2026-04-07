import type { BacklinksOverviewData } from "./backlinksPageTypes";

export type SortDirection = "asc" | "desc";

export type ReferringDomainsTableSortField =
  | "domain"
  | "backlinks"
  | "referringPages"
  | "rank"
  | "spamScore"
  | "firstSeen"
  | "issues";

export type TopPagesTableSortField =
  | "page"
  | "backlinks"
  | "referringDomains"
  | "rank"
  | "brokenBacklinks";

export type TableSort<TField extends string> = {
  field: TField;
  direction: SortDirection;
};

export type ReferringDomainsTableSort =
  TableSort<ReferringDomainsTableSortField>;
export type TopPagesTableSort = TableSort<TopPagesTableSortField>;

export const DEFAULT_REFERRING_DOMAINS_SORT: ReferringDomainsTableSort = {
  field: "backlinks",
  direction: "desc",
};

export const DEFAULT_TOP_PAGES_SORT: TopPagesTableSort = {
  field: "backlinks",
  direction: "desc",
};

export function getNextSort<TField extends string>(
  current: TableSort<TField>,
  field: TField,
  defaultDirection: SortDirection,
): TableSort<TField> {
  if (current.field !== field) {
    return { field, direction: defaultDirection };
  }

  return {
    field,
    direction: current.direction === "asc" ? "desc" : "asc",
  };
}

export function sortReferringDomainRows(
  rows: BacklinksOverviewData["referringDomains"],
  sort: ReferringDomainsTableSort,
) {
  return rows.toSorted((left, right) => {
    switch (sort.field) {
      case "domain":
        return compareStrings(left.domain, right.domain, sort.direction);
      case "backlinks":
        return compareNumbers(left.backlinks, right.backlinks, sort.direction);
      case "referringPages":
        return compareNumbers(
          left.referringPages,
          right.referringPages,
          sort.direction,
        );
      case "rank":
        return compareNumbers(left.rank, right.rank, sort.direction);
      case "spamScore":
        return compareNumbers(left.spamScore, right.spamScore, sort.direction);
      case "firstSeen":
        return compareDates(left.firstSeen, right.firstSeen, sort.direction);
      case "issues":
        return compareIssues(left, right, sort.direction);
      default:
        return 0;
    }
  });
}

export function sortTopPageRows(
  rows: BacklinksOverviewData["topPages"],
  sort: TopPagesTableSort,
) {
  return rows.toSorted((left, right) => {
    switch (sort.field) {
      case "page":
        return compareStrings(left.page, right.page, sort.direction);
      case "backlinks":
        return compareNumbers(left.backlinks, right.backlinks, sort.direction);
      case "referringDomains":
        return compareNumbers(
          left.referringDomains,
          right.referringDomains,
          sort.direction,
        );
      case "rank":
        return compareNumbers(left.rank, right.rank, sort.direction);
      case "brokenBacklinks":
        return compareNumbers(
          left.brokenBacklinks,
          right.brokenBacklinks,
          sort.direction,
        );
      default:
        return 0;
    }
  });
}

function compareNumbers(
  left: number | null | undefined,
  right: number | null | undefined,
  direction: SortDirection,
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return direction === "asc" ? left - right : right - left;
}

function compareStrings(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: SortDirection,
) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const result = left.toLowerCase().localeCompare(right.toLowerCase());
  return direction === "asc" ? result : -result;
}

function compareDates(
  left: string | null | undefined,
  right: string | null | undefined,
  direction: SortDirection,
) {
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  const leftValue = Date.parse(left);
  const rightValue = Date.parse(right);
  return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
}

function compareIssues(
  left: BacklinksOverviewData["referringDomains"][number],
  right: BacklinksOverviewData["referringDomains"][number],
  direction: SortDirection,
) {
  const backlinkComparison = compareNumbers(
    left.brokenBacklinks,
    right.brokenBacklinks,
    direction,
  );

  if (backlinkComparison !== 0) {
    return backlinkComparison;
  }

  return compareNumbers(left.brokenPages, right.brokenPages, direction);
}

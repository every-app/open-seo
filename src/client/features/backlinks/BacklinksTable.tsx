import { useMemo } from "react";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import {
  AppDataTable,
  useAppTable,
} from "@/client/components/table/AppDataTable";
import { EmptyTableState } from "./BacklinksPageEmptyTableState";
import {
  buildBacklinksColumns,
  type BacklinksDisplayRow,
} from "./BacklinksTableColumns";
import type { BacklinksRow } from "./backlinksPageTypes";
import type { BacklinksDomainExpansion } from "./useBacklinksDomainExpansion";
import type { DomainRatings } from "./useAhrefsDomainRatings";

/** Interleaves expanded domains' extra links beneath their page row. */
function buildDisplayRows(
  rows: BacklinksRow[],
  expansion: BacklinksDomainExpansion | null,
): BacklinksDisplayRow[] {
  if (!expansion) {
    return rows.map((row) => ({
      kind: "link",
      row,
      depth: 0,
      expandable: false,
      expanded: false,
    }));
  }

  const out: BacklinksDisplayRow[] = [];
  for (const row of rows) {
    const domain = row.domainFrom;
    const expanded = Boolean(domain && expansion.expandedDomains.has(domain));
    out.push({
      kind: "link",
      row,
      depth: 0,
      expandable: Boolean(domain),
      expanded,
    });
    if (!expanded || !domain) continue;

    const entry = expansion.entriesByDomain[domain];
    if (!entry || entry.status === "loading") {
      out.push({ kind: "status", domain, status: "loading" });
    } else if (entry.status === "error") {
      out.push({ kind: "status", domain, status: "error" });
    } else {
      // The page row already shows the domain's strongest link; list the rest.
      const children = entry.rows.filter(
        (child) =>
          !(
            child.urlFrom === row.urlFrom &&
            child.urlTo === row.urlTo &&
            child.anchor === row.anchor
          ),
      );
      if (children.length === 0) {
        out.push({ kind: "status", domain, status: "empty" });
      } else {
        for (const child of children) {
          out.push({
            kind: "link",
            row: child,
            depth: 1,
            expandable: false,
            expanded: false,
          });
        }
      }
    }
  }
  return out;
}

export function BacklinksTable({
  rows,
  domainRatings,
  sorting,
  onSortingChange,
  expansion,
}: {
  rows: BacklinksRow[];
  domainRatings: DomainRatings | null;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  /** Present in the one-per-domain view; null when listing all links. */
  expansion: BacklinksDomainExpansion | null;
}) {
  const columns = useMemo(
    () => buildBacklinksColumns(domainRatings, expansion?.toggleDomain),
    [domainRatings, expansion?.toggleDomain],
  );
  const displayRows = useMemo(
    () => buildDisplayRows(rows, expansion),
    [rows, expansion],
  );

  const table = useAppTable({
    data: displayRows,
    columns,
    state: { sorting },
    onSortingChange,
    manualSorting: true,
  });

  if (rows.length === 0) {
    return <EmptyTableState label="No backlinks match this filter." />;
  }

  return (
    <AppDataTable
      table={table}
      fixedLayout
      getRowClassName={(row) =>
        row.original.kind !== "link" || row.original.depth > 0
          ? "bg-base-200/30"
          : undefined
      }
    />
  );
}

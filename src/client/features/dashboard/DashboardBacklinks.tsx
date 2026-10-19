import { useQuery } from "@tanstack/react-query";
import { QueryError } from "@/client/components/QueryState";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import type { ColumnDef } from "@tanstack/react-table";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { DashboardDataTable } from "./DashboardDataTable";
import { useState, type ComponentProps } from "react";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { getDashboardBacklinks } from "@/serverFunctions/dashboard";
import { Freshness, ExternalPage } from "./siteTabParts";
const KINDS = ["new", "lost", "all"] as const;
type Kind = (typeof KINDS)[number];

const DESCRIPTIONS: Record<Kind, string> = {
  new: "Links to your website found in the past week. A link may be older than the date it was found.",
  lost: "Links that were found before but are no longer there. Last checked is when we last checked the link, not when it disappeared.",
  all: "Recently found links that still point to your website.",
};

export function DashboardBacklinks({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const [kind, setKind] = useState<Kind>("new");
  const query = useQuery({
    queryKey: ["dashboardBacklinks", projectId, domain, kind],
    queryFn: () => getDashboardBacklinks({ data: { projectId, kind } }),
    staleTime: 86400_000,
    retry: false,
  });
  return (
    <DashboardBacklinkTable
      rows={query.data?.value ?? []}
      kind={kind}
      isLoading={query.isPending}
      error={
        query.isError ? (
          <QueryError
            error={query.error}
            fallback="Could not load backlinks"
            onRetry={() => void query.refetch()}
            isRetrying={query.isFetching}
          />
        ) : null
      }
      tabs={
        <DataTableTabs
          value={kind}
          onValueChange={(value) => {
            const next = KINDS.find((item) => item === value);
            if (next) setKind(next);
          }}
          description={
            <>
              {DESCRIPTIONS[kind]}
              {query.data ? <Freshness {...query.data} /> : null}
            </>
          }
        >
          <TabsTrigger value="new">New this week</TabsTrigger>
          <TabsTrigger value="lost">Lost links</TabsTrigger>
          <TabsTrigger value="all">Active links</TabsTrigger>
        </DataTableTabs>
      }
    />
  );
}

type Backlink = Awaited<
  ReturnType<typeof getDashboardBacklinks>
>["value"][number];
function DashboardBacklinkTable({
  rows,
  kind,
  ...tableProps
}: {
  rows: Backlink[];
  kind: Kind;
} & Pick<
  ComponentProps<typeof DashboardDataTable>,
  "tabs" | "isLoading" | "error"
>) {
  const columns: ColumnDef<Backlink>[] = [
    {
      id: "urlFrom",
      accessorFn: (row) => `${row.domainFrom ?? ""} ${row.urlFrom ?? ""}`,
      header: ({ column }) => (
        <SortableHeader column={column} label="Referring page" />
      ),
      cell: ({ row }) => (
        <ExternalPage
          url={row.original.urlFrom}
          label={row.original.domainFrom}
        />
      ),
      filterFn: "includesString",
    },
    {
      accessorKey: "anchor",
      header: "Anchor",
      cell: ({ row }) => (
        <span
          className="block max-w-48 truncate"
          title={row.original.anchor ?? undefined}
        >
          {row.original.anchor || "—"}
        </span>
      ),
      filterFn: "includesString",
    },
    {
      accessorKey: "urlTo",
      header: "Target page",
      cell: ({ row }) => <ExternalPage url={row.original.urlTo} />,
      filterFn: "includesString",
    },
    {
      id: "follow",
      accessorFn: (row) => (row.isDofollow ? "Follow" : "Nofollow"),
      header: "Link type",
      filterFn: "equalsString",
    },
    {
      accessorKey: "domainFromRank",
      header: ({ column }) => (
        <SortableHeader column={column} label="Domain rank" />
      ),
      filterFn: "inNumberRange",
      cell: ({ getValue }) => getValue() ?? "—",
    },
    {
      accessorKey: "spamScore",
      header: ({ column }) => (
        <SortableHeader column={column} label="Spam score" />
      ),
      filterFn: "inNumberRange",
      cell: ({ getValue }) => getValue() ?? "—",
    },
    {
      id: "date",
      accessorFn: (row) =>
        (kind === "lost" ? row.lastSeen : row.firstSeen)?.slice(0, 10) ?? "—",
      header: ({ column }) => (
        <SortableHeader
          column={column}
          label={kind === "lost" ? "Last checked" : "First discovered"}
        />
      ),
    },
  ];
  return (
    <DashboardDataTable
      {...tableProps}
      resetKey={kind}
      rows={rows}
      empty={{
        title:
          kind === "new"
            ? "No new backlinks this week"
            : kind === "lost"
              ? "No lost backlinks found"
              : "No active backlinks found yet",
      }}
      columns={columns}
      filters={[
        { id: "urlFrom", label: "Referring page", kind: "text" },
        { id: "anchor", label: "Anchor text", kind: "text" },
        { id: "urlTo", label: "Target page", kind: "text" },
        { id: "follow", label: "Link type", kind: "follow" },
        { id: "domainFromRank", label: "Domain rank", kind: "number" },
        { id: "spamScore", label: "Spam score", kind: "number" },
      ]}
    />
  );
}

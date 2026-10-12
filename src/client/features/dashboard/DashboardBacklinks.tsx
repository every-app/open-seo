import { useQuery } from "@tanstack/react-query";
import { CardShell } from "@/client/components/CardShell";
import { QueryState } from "@/client/components/QueryState";
import type { ColumnDef } from "@tanstack/react-table";
import { SortableHeader } from "@/client/components/table/SortableHeader";
import { DashboardDataTable } from "./DashboardDataTable";
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { getDashboardBacklinks } from "@/serverFunctions/dashboard";
import { Freshness, ExternalPage, DashboardInfo } from "./siteTabParts";
export function DashboardBacklinks({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const [kind, setKind] = useState<"new" | "lost" | "all">("new");
  const query = useQuery({
    queryKey: ["dashboardBacklinks", projectId, domain, kind],
    queryFn: () => getDashboardBacklinks({ data: { projectId, kind } }),
    staleTime: 86400_000,
    retry: false,
  });
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Your backlinks</h2>
        </div>
        <Tabs
          value={kind}
          onValueChange={(value) => {
            if (value === "new" || value === "lost" || value === "all")
              setKind(
                value === "new" ? "new" : value === "lost" ? "lost" : "all",
              );
          }}
        >
          <TabsList>
            <TabsTrigger value="new">New this week</TabsTrigger>
            <TabsTrigger value="lost">Lost links</TabsTrigger>
            <TabsTrigger value="all">Active links</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <QueryState query={query} errorFallback="Could not load backlinks">
        {(data) => (
          <CardShell
            title={
              kind === "new"
                ? "Recently discovered backlinks"
                : kind === "lost"
                  ? "Lost backlinks"
                  : "Active backlinks"
            }
            titleInfo={
              <DashboardInfo label="About backlink data">
                <p>
                  {kind === "new"
                    ? "Links to your website found in the past week. A link may be older than the date it was found."
                    : kind === "lost"
                      ? "Links that were found before but are no longer there. Last checked is when we last checked the link, not when it disappeared."
                      : "Recently found links that still point to your website."}
                </p>
                <p className="mt-2">
                  Filters narrow the links shown in this table.
                </p>
              </DashboardInfo>
            }
          >
            <Freshness {...data} />
            {data.value.length ? (
              <DashboardBacklinkTable
                key={kind}
                rows={data.value}
                kind={kind}
              />
            ) : (
              <p className="py-8 text-sm text-muted-foreground">
                {kind === "new"
                  ? "No new backlinks this week."
                  : kind === "lost"
                    ? "No lost backlinks found."
                    : "No active backlinks found yet."}
              </p>
            )}
          </CardShell>
        )}
      </QueryState>
    </div>
  );
}

type Backlink = Awaited<
  ReturnType<typeof getDashboardBacklinks>
>["value"][number];
function DashboardBacklinkTable({
  rows,
  kind,
}: {
  rows: Backlink[];
  kind: "new" | "lost" | "all";
}) {
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
      rows={rows}
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

import { Link } from "@tanstack/react-router";
import { Button } from "@/client/components/ui/button";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TabsTrigger } from "@/client/components/ui/tabs";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import { QueryError } from "@/client/components/QueryState";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import {
  getDashboardEmergingQueries,
  getDashboardKeywords,
} from "@/serverFunctions/dashboard";
import { DashboardKeywordTable } from "./DashboardKeywordTable";
import { Freshness } from "./siteTabParts";

const SOURCES = ["new", "top", "striking"] as const;
type Source = (typeof SOURCES)[number];

const DESCRIPTIONS: Record<Source, string> = {
  new: "Searches where your website appeared in the latest week of Search Console data, but not in the previous four weeks.",
  top: "Searches bringing the most clicks to your website over the last 28 days.",
  striking:
    "Keywords at positions 5–20 over the last 28 days. Improving the listed page could help them move higher.",
};

export function DashboardKeywords({
  projectId,
  connected,
  siteUrl,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const [source, setSource] = useState<Source>("new");
  const emerging = useQuery({
    queryKey: ["dashboardEmergingQueries", projectId, siteUrl],
    queryFn: () => getDashboardEmergingQueries({ data: { projectId } }),
    enabled: connected && source === "new",
    staleTime: 10 * 60_000,
    retry: false,
  });
  const keywords = useQuery({
    queryKey: ["dashboardGscKeywords", projectId, siteUrl],
    queryFn: () => getDashboardKeywords({ data: { projectId } }),
    enabled: connected && source === "top",
    staleTime: 10 * 60_000,
    retry: false,
  });
  const striking = useQuery({
    queryKey: ["dashboardGscReport", projectId, siteUrl],
    queryFn: () =>
      getSearchPerformanceReport({
        data: { projectId, dateRange: "last_28_days" },
      }),
    enabled: connected && source === "striking",
    staleTime: 10 * 60_000,
  });
  if (!connected)
    return (
      <GoogleConnectionCard provider="gsc" projectId={projectId} prominent />
    );

  const query =
    source === "new" ? emerging : source === "top" ? keywords : striking;
  const cached =
    source === "new" ? emerging.data : source === "top" ? keywords.data : null;
  const result =
    source === "striking"
      ? striking.data && {
          connected: striking.data.connected,
          rows: striking.data.connected ? striking.data.strikingDistance : [],
        }
      : cached?.value;
  if (result && !result.connected)
    return (
      <GoogleConnectionCard provider="gsc" projectId={projectId} prominent />
    );

  return (
    <DashboardKeywordTable
      resetKey={source}
      rows={result?.rows ?? []}
      showPages={source === "striking"}
      sortBy={source === "top" ? "clicks" : "impressions"}
      isLoading={query.isPending}
      error={
        query.isError ? (
          <QueryError
            error={query.error}
            fallback="Could not load keywords"
            onRetry={() => void query.refetch()}
            isRetrying={query.isFetching}
          />
        ) : null
      }
      empty={
        source === "new"
          ? {
              title:
                emerging.data?.value.hasSearchData === false
                  ? "No search data yet"
                  : "No new keywords this week",
            }
          : source === "striking"
            ? { title: "No keywords at positions 5–20 in this period" }
            : { title: "No keywords yet" }
      }
      tabs={
        <DataTableTabs
          value={source}
          onValueChange={(value) => {
            const next = SOURCES.find((item) => item === value);
            if (next) setSource(next);
          }}
          actions={
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={
                <Link
                  to="/p/$projectId/search-performance"
                  params={{ projectId }}
                />
              }
            >
              View full GSC insights →
            </Button>
          }
          description={
            <>
              {DESCRIPTIONS[source]}
              {cached ? <Freshness {...cached} /> : null}
            </>
          }
        >
          <TabsTrigger value="new">New keywords</TabsTrigger>
          <TabsTrigger value="top">Top keywords</TabsTrigger>
          <TabsTrigger value="striking">Striking distance</TabsTrigger>
        </DataTableTabs>
      }
    />
  );
}

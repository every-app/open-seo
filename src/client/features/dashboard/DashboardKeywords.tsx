import { Link } from "@tanstack/react-router";
import { Button } from "@/client/components/ui/button";
import { getSearchPerformanceReport } from "@/serverFunctions/searchPerformance";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { CardShell } from "@/client/components/CardShell";
import { QueryState } from "@/client/components/QueryState";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import { getDashboardKeywords } from "@/serverFunctions/dashboard";
import { DashboardNewQueries } from "./DashboardNewQueries";
import { DashboardKeywordTable } from "./DashboardKeywordTable";
import { DashboardInfo, Freshness } from "./siteTabParts";

export function DashboardKeywords({
  projectId,
  connected,
  siteUrl,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const [source, setSource] = useState("new");
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
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Your keywords</h2>
        <Button
          variant="outline"
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
      </div>
      <div className="overflow-x-auto">
        <div className="flex w-max items-center gap-2">
          <Tabs
            value={source}
            onValueChange={(value) => setSource(String(value))}
          >
            <TabsList>
              <TabsTrigger value="new">New keywords</TabsTrigger>
              <TabsTrigger value="top">Top keywords</TabsTrigger>
              <TabsTrigger value="striking">Striking distance</TabsTrigger>
            </TabsList>
          </Tabs>
          <DashboardInfo label="About keyword views">
            <p>
              <strong>New keywords</strong> are searches we started seeing
              recently.
            </p>
            <p className="mt-2">
              <strong>Top keywords</strong> shows the searches bringing the most
              clicks to your website.
            </p>
            <p className="mt-2">
              <strong>Striking distance</strong> shows keywords where your site
              appears at positions 5–20, with room to move higher.
            </p>
          </DashboardInfo>
        </div>
      </div>
      {source === "new" ? (
        <DashboardNewQueries
          projectId={projectId}
          connected={connected}
          siteUrl={siteUrl}
        />
      ) : source === "striking" ? (
        <QueryState query={striking} errorFallback="Could not load keywords">
          {(report) =>
            !report.connected ? (
              <GoogleConnectionCard
                provider="gsc"
                projectId={projectId}
                prominent
              />
            ) : (
              <CardShell
                title="Striking distance"
                titleInfo={
                  <DashboardInfo label="About striking distance">
                    Keywords where your website appears at positions 5–20 on
                    Google. Improving the listed page could help it move higher.
                  </DashboardInfo>
                }
              >
                <p className="mb-4 text-sm text-muted-foreground">
                  Last 28 days
                </p>
                {report.strikingDistance.length ? (
                  <DashboardKeywordTable
                    rows={report.strikingDistance}
                    showPages
                  />
                ) : (
                  <p className="py-8 text-sm text-muted-foreground">
                    No keywords at positions 5–20 in this period.
                  </p>
                )}
              </CardShell>
            )
          }
        </QueryState>
      ) : (
        <QueryState query={keywords} errorFallback="Could not load keywords">
          {(data) =>
            !data.value.connected ? (
              <GoogleConnectionCard
                provider="gsc"
                projectId={projectId}
                prominent
              />
            ) : (
              <CardShell
                title="Top keywords"
                titleInfo={
                  <DashboardInfo label="About top keywords">
                    Searches bringing the most clicks to your website over the
                    last 28 days, from Google Search Console.
                  </DashboardInfo>
                }
              >
                <p className="mb-4 text-sm text-muted-foreground">
                  Last 28 days
                </p>
                <Freshness {...data} />
                <DashboardKeywordTable
                  key="top"
                  rows={data.value.rows}
                  sortBy="clicks"
                />
              </CardShell>
            )
          }
        </QueryState>
      )}
    </div>
  );
}

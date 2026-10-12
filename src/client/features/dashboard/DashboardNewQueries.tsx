import { DashboardKeywordTable } from "./DashboardKeywordTable";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
import { QueryState } from "@/client/components/QueryState";
import { GoogleConnectionCard } from "@/client/features/integrations/GoogleConnectionCard";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/client/components/ui/table";
import { getDashboardEmergingQueries } from "@/serverFunctions/dashboard";
import { Freshness, DashboardInfo } from "./siteTabParts";
import { moreDetailsClass } from "./cardParts";

export function DashboardNewQueries({
  projectId,
  connected,
  siteUrl,
  compact = false,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
  compact?: boolean;
}) {
  const query = useQuery({
    queryKey: ["dashboardEmergingQueries", projectId, siteUrl],
    queryFn: () => getDashboardEmergingQueries({ data: { projectId } }),
    enabled: connected,
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!connected)
    return compact ? null : (
      <GoogleConnectionCard provider="gsc" projectId={projectId} prominent />
    );
  return (
    <QueryState query={query} errorFallback="Could not load new keywords">
      {(data) =>
        !data.value.connected ? (
          <GoogleConnectionCard
            provider="gsc"
            projectId={projectId}
            prominent
          />
        ) : (
          <CardShell
            title="New keywords"
            titleInfo={
              <DashboardInfo label="About new keywords">
                <p>Searches where your website recently appeared on Google.</p>
                <p className="mt-2">
                  We saw these in the latest week of Search Console data, but
                  not in the previous four weeks.
                </p>
              </DashboardInfo>
            }
            action={
              compact ? (
                <Link
                  to="/p/$projectId"
                  params={{ projectId }}
                  search={{ tab: "keywords" }}
                  className={moreDetailsClass}
                >
                  View all →
                </Link>
              ) : undefined
            }
          >
            <Freshness {...data} />
            {data.value.rows.length ? (
              !compact ? (
                <DashboardKeywordTable rows={data.value.rows} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Keyword</TableHead>
                      <TableHead>Impressions</TableHead>
                      <TableHead>Clicks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.value.rows.slice(0, compact ? 5 : 25).map((row) => (
                      <TableRow key={row.query}>
                        <TableCell className="font-medium">
                          {row.query}
                        </TableCell>
                        <TableCell>
                          {row.impressions.toLocaleString()}
                        </TableCell>
                        <TableCell>{row.clicks}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                <Search className="size-7 text-muted-foreground" />
                <h3 className="font-medium">
                  {data.value.hasSearchData
                    ? "No new keywords this week"
                    : "No search data yet"}
                </h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {data.value.hasSearchData
                    ? "Your existing queries can still be gaining clicks. See how they're performing."
                    : "Google hasn't reported searches for your website yet. Check your connected property in Search Console."}
                </p>
                <Link
                  to="/p/$projectId/search-performance"
                  params={{ projectId }}
                  className="text-sm text-primary hover:underline"
                >
                  View full GSC insights →
                </Link>
              </div>
            )}
          </CardShell>
        )
      }
    </QueryState>
  );
}

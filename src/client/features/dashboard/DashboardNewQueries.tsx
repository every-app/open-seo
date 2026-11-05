import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Tag } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
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
import { cardTableClass, moreDetailsClass } from "./cardParts";

export function DashboardNewQueries({
  projectId,
  connected,
  siteUrl,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const query = useQuery({
    queryKey: ["dashboardEmergingQueries", projectId, siteUrl],
    queryFn: () => getDashboardEmergingQueries({ data: { projectId } }),
    enabled: connected,
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!connected) return null;
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
            icon={<Tag className="size-5" />}
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
              <Link
                to="/p/$projectId"
                params={{ projectId }}
                search={{ tab: "keywords" }}
                className={moreDetailsClass}
                aria-label="View all new keywords"
              >
                View all
              </Link>
            }
          >
            <Freshness {...data} />
            {data.value.rows.length ? (
              <Table className={cardTableClass}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Keyword</TableHead>
                    <TableHead className="text-right">Impressions</TableHead>
                    <TableHead className="text-right">Clicks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.value.rows.slice(0, 5).map((row) => (
                    <TableRow key={row.query}>
                      <TableCell className="font-medium">{row.query}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.impressions.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.clicks.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <EmptyState
                variant="plain"
                icon={Search}
                title={
                  data.value.hasSearchData
                    ? "No new keywords this week"
                    : "No search data yet"
                }
                description={
                  data.value.hasSearchData
                    ? "Your existing queries can still be gaining clicks. See how they're performing."
                    : "Google hasn't reported searches for your website yet. Check your connected property in Search Console."
                }
                action={
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
                    View full GSC insights
                  </Button>
                }
              />
            )}
          </CardShell>
        )
      }
    </QueryState>
  );
}

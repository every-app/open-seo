import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/client/components/ui/table";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { CardShell } from "@/client/components/CardShell";
import { EmptyState } from "@/client/components/EmptyState";
import { Button } from "@/client/components/ui/button";
import { QueryState } from "@/client/components/QueryState";
import { getDashboardLinkActivity } from "@/serverFunctions/dashboard";
import { DashboardInfo, ExternalPage, Freshness } from "./siteTabParts";
import { cardTableClass, moreDetailsClass } from "./cardParts";
export function DashboardLinkActivity({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const query = useQuery({
    queryKey: ["dashboardLinkActivity", projectId, domain],
    queryFn: () => getDashboardLinkActivity({ data: { projectId } }),
    staleTime: 86400_000,
    retry: false,
  });
  return (
    <QueryState query={query} errorFallback="Could not load new links">
      {(data) => (
        <CardShell
          title="New backlinks"
          icon={<Link2 className="size-5" />}
          titleInfo={
            <DashboardInfo label="About new links">
              <p>
                Links to your website found in the past week. We show new
                linking sites first.
              </p>
              <p className="mt-2">
                A link may be older than the date it was found.
              </p>
            </DashboardInfo>
          }
          action={
            <Link
              to="/p/$projectId"
              params={{ projectId }}
              search={{ tab: "backlinks" }}
              className={moreDetailsClass}
              aria-label="View all new backlinks"
            >
              View all
            </Link>
          }
        >
          <Freshness {...data} />
          {data.value.length ? (
            <Table className={cardTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Referring domain</TableHead>
                  <TableHead className="text-right">Backlinks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.value.slice(0, 5).map((row, index) => (
                  <TableRow key={row.domain ?? index}>
                    <TableCell className="font-medium">
                      <ExternalPage
                        url={row.domain ? `https://${row.domain}` : null}
                        label={row.domain}
                      />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.backlinks?.toLocaleString() ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : data.links.length ? (
            <Table className={cardTableClass}>
              <TableHeader>
                <TableRow>
                  <TableHead>Referring page</TableHead>
                  <TableHead>Anchor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.links.slice(0, 5).map((row, index) => (
                  <TableRow key={`${row.urlFrom}:${index}`}>
                    <TableCell>
                      <ExternalPage url={row.urlFrom} label={row.domainFrom} />
                    </TableCell>
                    <TableCell
                      className="max-w-48 truncate"
                      title={row.anchor ?? undefined}
                    >
                      {row.anchor || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              variant="plain"
              icon={Link2}
              title="No new links this week"
              description="Explore the sites already linking to you."
              action={
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      to="/p/$projectId"
                      params={{ projectId }}
                      search={{ tab: "backlinks" }}
                    />
                  }
                >
                  View backlinks
                </Button>
              }
            />
          )}
        </CardShell>
      )}
    </QueryState>
  );
}

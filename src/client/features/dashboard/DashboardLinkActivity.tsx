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
import { QueryState } from "@/client/components/QueryState";
import { getDashboardLinkActivity } from "@/serverFunctions/dashboard";
import { DashboardInfo, ExternalPage, Freshness } from "./siteTabParts";
import { moreDetailsClass } from "./cardParts";
import { useLocale } from "@/client/lib/i18n";

export function DashboardLinkActivity({
  projectId,
  domain,
}: {
  projectId: string;
  domain: string;
}) {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ["dashboardLinkActivity", projectId, domain],
    queryFn: () => getDashboardLinkActivity({ data: { projectId } }),
    staleTime: 86400_000,
    retry: false,
  });
  return (
    <QueryState query={query} errorFallback={t("dashboard.cards.new_backlinks_title")}>
      {(data) => (
        <CardShell
          title={t("dashboard.cards.new_backlinks_title")}
          titleInfo={
            <DashboardInfo label={t("dashboard.cards.new_backlinks_about")}>
              <p>
                {t("dashboard.cards.new_backlinks_desc")}
              </p>
            </DashboardInfo>
          }
          action={
            <Link
              to="/p/$projectId"
              params={{ projectId }}
              search={{ tab: "backlinks" }}
              className={moreDetailsClass}
            >
              {t("dashboard.cards.view_all")}
            </Link>
          }
        >
          <Freshness {...data} />
          {data.value.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboard.cards.referring_domain")}</TableHead>
                  <TableHead className="text-right">{t("dashboard.cards.backlinks")}</TableHead>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dashboard.cards.referring_page")}</TableHead>
                  <TableHead>{t("dashboard.cards.anchor")}</TableHead>
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
            <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
              <Link2 className="size-7 text-muted-foreground" />
              <h3 className="font-medium">{t("dashboard.cards.no_new_links")}</h3>
              <p className="text-sm text-muted-foreground">
                {t("dashboard.cards.explore_existing_links")}
              </p>
              <Link
                to="/p/$projectId"
                params={{ projectId }}
                search={{ tab: "backlinks" }}
                className="text-sm text-primary hover:underline"
              >
                {t("dashboard.cards.view_backlinks")}
              </Link>
            </div>
          )}
        </CardShell>
      )}
    </QueryState>
  );
}

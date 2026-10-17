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
import { useLocale } from "@/client/lib/i18n";

export function DashboardNewQueries({
  projectId,
  connected,
  siteUrl,
}: {
  projectId: string;
  connected: boolean;
  siteUrl: string | null;
}) {
  const { t } = useLocale();
  const query = useQuery({
    queryKey: ["dashboardEmergingQueries", projectId, siteUrl],
    queryFn: () => getDashboardEmergingQueries({ data: { projectId } }),
    enabled: connected,
    staleTime: 10 * 60_000,
    retry: false,
  });
  if (!connected) return null;
  return (
    <QueryState query={query} errorFallback={t("dashboard.cards.new_keywords_title")}>
      {(data) =>
        !data.value.connected ? (
          <GoogleConnectionCard
            provider="gsc"
            projectId={projectId}
            prominent
          />
        ) : (
          <CardShell
            title={t("dashboard.cards.new_keywords_title")}
            titleInfo={
              <DashboardInfo label={t("dashboard.cards.new_keywords_about")}>
                <p>{t("dashboard.cards.new_keywords_desc")}</p>
                <p className="mt-2">
                  {t("dashboard.cards.new_keywords_detail")}
                </p>
              </DashboardInfo>
            }
            action={
              <Link
                to="/p/$projectId"
                params={{ projectId }}
                search={{ tab: "keywords" }}
                className={moreDetailsClass}
              >
                {t("dashboard.cards.view_all")}
              </Link>
            }
          >
            <Freshness {...data} />
            {data.value.rows.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("dashboard.cards.keyword")}</TableHead>
                    <TableHead>{t("dashboard.cards.impressions")}</TableHead>
                    <TableHead>{t("dashboard.cards.clicks")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.value.rows.slice(0, 5).map((row) => (
                    <TableRow key={row.query}>
                      <TableCell className="font-medium">{row.query}</TableCell>
                      <TableCell>{row.impressions.toLocaleString()}</TableCell>
                      <TableCell>{row.clicks}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-8 text-center">
                <Search className="size-7 text-muted-foreground" />
                <h3 className="font-medium">
                  {data.value.hasSearchData
                    ? t("dashboard.cards.no_new_keywords")
                    : t("dashboard.cards.no_search_data")}
                </h3>
                <p className="max-w-sm text-sm text-muted-foreground">
                  {data.value.hasSearchData
                    ? t("dashboard.cards.existing_queries_note")
                    : t("dashboard.cards.no_search_reported")}
                </p>
                <Link
                  to="/p/$projectId/search-performance"
                  params={{ projectId }}
                  className="text-sm text-primary hover:underline"
                >
                  {t("dashboard.cards.view_full_gsc")}
                </Link>
              </div>
            )}
          </CardShell>
        )
      }
    </QueryState>
  );
}

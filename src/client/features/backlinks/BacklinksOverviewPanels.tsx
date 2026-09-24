import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { RESEARCH_SCOPE_LABELS } from "@/shared/researchScope";
import { HeaderHelpLabel } from "@/client/features/keywords/components";
import {
  BacklinksNewLostChart,
  BacklinksTrendChart,
} from "./BacklinksPageCharts";
import type { BacklinksOverviewData } from "./backlinksPageTypes";
import { formatRelativeTimestamp } from "./backlinksPageUtils";

import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { buttonVariants } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
type SummaryStat = { label: string; value: string; description: string };

export function BacklinksOverviewPanels({
  projectId,
  data,
  summaryStats,
}: {
  projectId: string;
  data: BacklinksOverviewData;
  summaryStats: SummaryStat[];
}) {
  return (
    <>
      <div>
        <Link
          to="/p/$projectId/backlinks"
          params={{ projectId }}
          search={{
            target: undefined,
            scope: undefined,
            tab: undefined,
            page: undefined,
            size: undefined,
            sort: undefined,
            order: undefined,
          }}
          replace
          className={buttonVariants({
            variant: "ghost",
            size: "sm",
            className: "gap-2 px-0 text-muted-foreground hover:bg-transparent",
          })}
        >
          <ArrowLeft className="size-4" />
          Recent searches
        </Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{RESEARCH_SCOPE_LABELS[data.scope]}</Badge>
        <span>Target: {data.displayTarget}</span>
        <span>-</span>
        <span>Updated {formatRelativeTimestamp(data.fetchedAt)}</span>
        {/* history/live can't exclude subdomains, so say so rather than imply
            the charts match the domain-scoped totals. */}
        {data.scope === "domain" ? (
          <span>- Trends include subdomains</span>
        ) : null}
      </div>
      <OverviewGrid data={data} summaryStats={summaryStats} />
      {data.scope === "exact_url" ? (
        <Alert variant="info">
          <AlertDescription>
            Showing backlinks for this exact page. Switch the scope to Domain or
            Subdomains for site-wide results — trend charts need one of those.
          </AlertDescription>
        </Alert>
      ) : null}
      {data.scope === "subfolder" ? (
        <Alert variant="info">
          <AlertDescription>
            Showing backlinks pointing into this subfolder. Counts come from
            filtered backlink totals; rank, trends, and the referring-domains
            breakdown need Domain or Subdomains scope.
          </AlertDescription>
        </Alert>
      ) : null}
    </>
  );
}

function OverviewGrid({
  data,
  summaryStats,
}: {
  data: BacklinksOverviewData;
  summaryStats: SummaryStat[];
}) {
  // Trend charts need history/live, which only takes a whole hostname.
  const domainScope = data.scope === "domain" || data.scope === "subdomains";

  return (
    <div
      className={`grid grid-cols-1 gap-3 ${domainScope ? "md:grid-cols-2 xl:grid-cols-3" : ""}`}
    >
      <SummaryStatsGrid data={data} summaryStats={summaryStats} />
      {domainScope ? <TrendPanels data={data} /> : null}
    </div>
  );
}

function SummaryStatsGrid({
  data,
  summaryStats,
}: {
  data: BacklinksOverviewData;
  summaryStats: SummaryStat[];
}) {
  const hasTrendPanels = data.scope === "domain" || data.scope === "subdomains";
  const cardClassName = hasTrendPanels ? "md:col-span-2 xl:col-span-1" : "";

  return (
    <Card className={cardClassName}>
      <CardContent className="p-4 xl:h-full">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 xl:gap-y-6">
          {summaryStats.map((item) => (
            <div key={item.label}>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                <HeaderHelpLabel
                  label={item.label}
                  helpText={item.description}
                />
              </div>
              <p className="text-2xl font-semibold">{item.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TrendPanels({ data }: { data: BacklinksOverviewData }) {
  return (
    <>
      <TrendCard
        title="Backlink growth"
        description="Backlinks and referring domains over the last year"
      >
        <BacklinksTrendChart data={data.trends} />
      </TrendCard>
      <TrendCard
        title="New vs lost"
        description="Backlink acquisition and attrition"
      >
        <BacklinksNewLostChart data={data.newLostTrends} />
      </TrendCard>
    </>
  );
}

function TrendCard({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardContent className="gap-2 p-4">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

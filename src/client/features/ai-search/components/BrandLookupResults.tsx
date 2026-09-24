import { Info } from "@/client/components/icons";
import { BrandLookupMentionTrendCard } from "@/client/features/ai-search/components/BrandLookupMentionTrendCard";
import { BrandLookupShareOfVoice } from "@/client/features/ai-search/components/BrandLookupShareOfVoice";
import { CitationTabsCard } from "@/client/features/ai-search/components/BrandLookupCitationsCard";
import {
  formatCount,
  formatPlatformLabel,
  PLATFORM_DOT_CLASS,
} from "@/client/features/ai-search/platformLabels";
import type { BrandLookupResult } from "@/types/schemas/ai-search";
import { RESEARCH_SCOPE_LABELS } from "@/shared/researchScope";

import { Alert } from "@/client/components/ui/alert";
import { Badge, badgeVariants } from "@/client/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  StatCard,
  StatCardLabel,
  StatCardValue,
} from "@/client/components/ui/stat-card";
import { cn } from "@/client/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/client/components/ui/tooltip";
type Props = {
  result: BrandLookupResult;
  projectId: string;
};

type PlatformRow = BrandLookupResult["perPlatform"][number];
type MetricKey = "mentions" | "aiSearchVolume";

const DOMAIN_LEVEL_TIP =
  "AI search providers report mentions per domain, not per page. This number covers the whole domain — the cited pages below are limited to your scope.";

/**
 * Marks a metric that could not be narrowed to a URL scope, so a page-scoped
 * lookup never reads as if the number belonged to that page.
 */
function DomainLevelBadge() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              badgeVariants({ variant: "secondary" }),
              "shrink-0 normal-case",
            )}
          />
        }
      >
        Domain-level
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{DOMAIN_LEVEL_TIP}</TooltipContent>
    </Tooltip>
  );
}

export function BrandLookupResults({ result, projectId }: Props) {
  if (!result.hasData) {
    const erroredPlatforms = result.perPlatform.filter(
      (p) => p.status === "error",
    );
    const allPlatformsErrored =
      erroredPlatforms.length === result.perPlatform.length &&
      result.perPlatform.length > 0;

    if (allPlatformsErrored) {
      return (
        <Alert className="border-warning/30 bg-warning/10 text-sm">
          AI mention data is temporarily unavailable for{" "}
          <strong>{result.resolvedTarget}</strong>. Please try again shortly.
        </Alert>
      );
    }
    return (
      <div className="space-y-3">
        <Alert role="status" className="border-info/30 bg-info/10 text-sm">
          No AI mentions found for <strong>{result.resolvedTarget}</strong>.
        </Alert>
        {erroredPlatforms.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Note:{" "}
            {erroredPlatforms
              .map((p) => formatPlatformLabel(p.platform))
              .join(" and ")}{" "}
            {erroredPlatforms.length === 1 ? "was" : "were"} unavailable — some
            mentions may be missing.
          </p>
        ) : null}
      </div>
    );
  }

  const hasTrendData = result.monthlyVolume.length > 0;
  const sov = result.shareOfVoice;

  return (
    <div className="space-y-4">
      <BrandHeader result={result} />

      {/* One shared grid so the cards align by construction: stats left, trend
          right, Share of Voice flowing into the next free half-width cell —
          whichever of trend/SoV is absent, the rest stay column-aligned. A
          lone stats card keeps full width instead of half a grid. */}
      <div
        className={
          hasTrendData || sov ? "grid gap-4 lg:grid-cols-2" : undefined
        }
      >
        <StatsCard result={result} />
        {hasTrendData ? <MentionTrendCard result={result} /> : null}
        {sov ? (
          <BrandLookupShareOfVoice
            shareOfVoice={sov}
            isDomainLevel={result.aggregatesAreDomainLevel}
          />
        ) : null}
      </div>

      <CitationTabsCard result={result} projectId={projectId} />
    </div>
  );
}

function BrandHeader({ result }: { result: BrandLookupResult }) {
  return (
    <section className="flex flex-wrap items-baseline justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-3xl font-semibold tracking-tight">
          {result.resolvedTarget}
        </h2>
        <Badge variant="secondary">{result.detectedTargetType}</Badge>
        {result.scope ? (
          <Badge variant="secondary">
            {RESEARCH_SCOPE_LABELS[result.scope]}
          </Badge>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Updated {formatRelative(result.fetchedAt)}
      </p>
    </section>
  );
}

function StatsCard({ result }: { result: BrandLookupResult }) {
  return (
    <div className="flex h-full flex-col gap-4">
      <StatBlock
        label="Mentions"
        tooltip="Estimated count of AI answers where the searched brand or domain appeared in the answer text or cited sources."
        value={result.totalMentions}
        perPlatform={result.perPlatform}
        metric="mentions"
        isDomainLevel={result.aggregatesAreDomainLevel}
      />
      <StatBlock
        label="AI search volume"
        tooltip="Estimated monthly search demand for prompts where the searched brand or domain appears in AI answers. This is prompt demand, not mention count."
        value={result.totalAiSearchVolume}
        perPlatform={result.perPlatform}
        metric="aiSearchVolume"
        isDomainLevel={result.aggregatesAreDomainLevel}
      />
    </div>
  );
}

function StatBlock({
  label,
  tooltip,
  value,
  perPlatform,
  metric,
  isDomainLevel,
}: {
  label: string;
  tooltip: string;
  value: number | null;
  perPlatform: PlatformRow[];
  metric: MetricKey;
  isDomainLevel: boolean;
}) {
  return (
    <StatCard className="flex flex-1 flex-col justify-center">
      <StatCardLabel className="inline-flex items-center gap-1">
        {label}
        <Tooltip>
          <TooltipTrigger
            render={<span className="inline-flex normal-case" tabIndex={0} />}
          >
            <Info className="size-3 text-muted-foreground" />
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{tooltip}</TooltipContent>
        </Tooltip>
        {isDomainLevel ? <DomainLevelBadge /> : null}
      </StatCardLabel>
      <StatCardValue className="tabular-nums">
        {formatCount(value)}
      </StatCardValue>
      <div className="mt-3 space-y-1 border-t border-border pt-2.5">
        {perPlatform.map((row) => (
          <PlatformStatRow key={row.platform} row={row} metric={metric} />
        ))}
      </div>
    </StatCard>
  );
}

function PlatformStatRow({
  row,
  metric,
}: {
  row: PlatformRow;
  metric: MetricKey;
}) {
  const value = row.status === "error" ? null : row[metric];

  return (
    <div className="flex items-center justify-between text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <span
          className={`size-1.5 rounded-full ${PLATFORM_DOT_CLASS[row.platform]}`}
        />
        {formatPlatformLabel(row.platform)}
        {row.platform === "chat_gpt" ? (
          <Tooltip>
            <TooltipTrigger
              render={<span className="inline-flex" tabIndex={0} />}
            >
              <Info className="size-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-64">
              DataForSEO indexes ChatGPT mentions for US English only — country
              selection is not available for this platform.
            </TooltipContent>
          </Tooltip>
        ) : null}
        {row.status === "error" ? (
          <span className="text-negative">unavailable</span>
        ) : null}
      </span>
      <span className="font-medium tabular-nums text-foreground">
        {formatCount(value)}
      </span>
    </div>
  );
}

function MentionTrendCard({ result }: { result: BrandLookupResult }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 border-b border-border px-4 py-3">
        <CardTitle className="text-sm font-semibold tracking-normal">
          Mention trend (last 12 months)
        </CardTitle>
        {result.aggregatesAreDomainLevel ? <DomainLevelBadge /> : null}
      </CardHeader>
      <CardContent className="p-4">
        <BrandLookupMentionTrendCard result={result} />
      </CardContent>
    </Card>
  );
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "just now";

  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

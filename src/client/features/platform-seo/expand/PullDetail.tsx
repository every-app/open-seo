import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { QueryState } from "@/client/components/QueryState";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  getKeywordPull,
  getParasiteOpportunities,
} from "@/serverFunctions/platformSeo";
import type { PsPullStage } from "@/shared/platform-seo";
import { ClusterCard, formatNumber } from "./ClusterCard";
import { expandQueryKeys } from "./useExpandPipeline";

type PullData = Awaited<ReturnType<typeof getKeywordPull>>;

const GROUP_LABELS: Record<string, string> = {
  question: "Questions",
  preposition: "Prepositions",
  comparison: "Comparisons",
  time: "Time-based",
  autocomplete: "Autocomplete",
};

const OPPORTUNITY_CHUNK = 500;

export function PullDetail({
  projectId,
  pullId,
  isRunning,
  onResume,
}: {
  projectId: string;
  pullId: string;
  isRunning: boolean;
  onResume: (stage: PsPullStage) => void;
}) {
  const query = useQuery({
    queryKey: expandQueryKeys.pull(projectId, pullId),
    queryFn: () => getKeywordPull({ data: { projectId, pullId } }),
  });
  const pull = query.data?.pull;
  const clusterKeywords =
    query.data?.clusters.flatMap((cluster) =>
      cluster.keywords.map((k) => k.keyword),
    ) ?? [];
  const opportunities = useQuery({
    queryKey: expandQueryKeys.opportunities(projectId, pullId),
    enabled: pull !== undefined && clusterKeywords.length > 0,
    // Clustering keeps up to 800 keywords; each request takes 500.
    queryFn: async () => {
      const chunks: string[][] = [];
      for (let i = 0; i < clusterKeywords.length; i += OPPORTUNITY_CHUNK) {
        chunks.push(clusterKeywords.slice(i, i + OPPORTUNITY_CHUNK));
      }
      const results = await Promise.all(
        chunks.map((keywords) =>
          getParasiteOpportunities({
            data: {
              projectId,
              keywords,
              locationCode: pull!.locationCode,
              languageCode: pull!.languageCode,
            },
          }),
        ),
      );
      return results.flat();
    },
  });
  const byKeyword = new Map(
    (opportunities.data ?? []).map((row) => [row.keyword, row]),
  );
  return (
    <QueryState query={query} errorFallback="Failed to load this expansion.">
      {(data) => (
        <div className="flex flex-col gap-4">
          <PullSummary data={data} isRunning={isRunning} onResume={onResume} />
          {data.pull.stage === "clustered" && data.clusters.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every keyword was filtered out as another meaning of the seed.
              Check the filtered-out list, or try again with a clearer “what you
              mean by it”.
            </p>
          ) : null}
          {data.clusters.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.clusters.map((cluster) => (
                <ClusterCard
                  key={cluster.id}
                  projectId={projectId}
                  cluster={cluster}
                  pullId={pullId}
                  locationCode={data.pull.locationCode}
                  languageCode={data.pull.languageCode}
                  opportunities={byKeyword}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </QueryState>
  );
}

function PullSummary({
  data,
  isRunning,
  onResume,
}: {
  data: PullData;
  isRunning: boolean;
  onResume: (stage: PsPullStage) => void;
}) {
  const [showRejected, setShowRejected] = useState(false);
  const { pull } = data;
  const clusteredCount = data.clusters.reduce(
    (sum, cluster) => sum + cluster.keywords.length,
    0,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>“{pull.seed}”</CardTitle>
        <CardDescription>
          {pull.country} · {pull.language}
          {pull.seedMeaning ? ` · meaning: ${pull.seedMeaning}` : ""}
        </CardDescription>
        {pull.stage !== "clustered" ? (
          <CardAction>
            <Button
              size="sm"
              pending={isRunning}
              onClick={() => onResume(pull.stage)}
            >
              {pull.stage === "pulled" ? "Filter and cluster" : "Cluster"}
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Pulled" value={pull.rawCount} />
          <Stat label="Kept as relevant" value={pull.keptCount} />
          <Stat
            label="Filtered out"
            value={
              pull.keptCount == null ? null : pull.rawCount - pull.keptCount
            }
          />
          <Stat
            label="Clusters"
            value={pull.stage === "clustered" ? data.clusters.length : null}
            hint={
              pull.stage === "clustered"
                ? `${clusteredCount.toLocaleString()} keywords`
                : undefined
            }
          />
        </dl>
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(data.groupCounts).map(([group, count]) => (
            <Badge key={group} variant="secondary">
              {GROUP_LABELS[group] ?? group} {count.toLocaleString()}
            </Badge>
          ))}
        </div>
        {data.rejected.length > 0 ? (
          <div className="text-sm">
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => setShowRejected((value) => !value)}
            >
              {showRejected ? "Hide" : "Show"} {data.rejected.length}{" "}
              filtered-out keywords
            </Button>
            {showRejected ? (
              <ul className="mt-2 max-h-64 space-y-1 overflow-auto text-muted-foreground">
                {data.rejected.map((row) => (
                  <li key={row.keyword}>
                    <span className="text-foreground">{row.keyword}</span>
                    {row.reason ? ` — ${row.reason}` : ""}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">
        {formatNumber(value)}
      </dd>
      {hint ? <dd className="text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}

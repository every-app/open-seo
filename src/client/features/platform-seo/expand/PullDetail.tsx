import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/client/components/ui/table";
import { saveKeywords } from "@/serverFunctions/keywords";
import {
  createTopicFromCluster,
  getKeywordPull,
} from "@/serverFunctions/platformSeo";
import type { PsPullStage } from "@/shared/platform-seo";
import { expandQueryKeys } from "./useExpandPipeline";

type PullData = Awaited<ReturnType<typeof getKeywordPull>>;
type Cluster = PullData["clusters"][number];

const GROUP_LABELS: Record<string, string> = {
  question: "Questions",
  preposition: "Prepositions",
  comparison: "Comparisons",
  time: "Time-based",
  autocomplete: "Autocomplete",
};
const STAGE_LABELS = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" } as const;

const formatNumber = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString();

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
                  locationCode={data.pull.locationCode}
                  languageCode={data.pull.languageCode}
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

const PREVIEW_ROWS = 8;

function ClusterCard({
  projectId,
  cluster,
  locationCode,
  languageCode,
}: {
  projectId: string;
  cluster: Cluster;
  locationCode: number;
  languageCode: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalVolume = cluster.keywords.reduce(
    (sum, k) => sum + (k.searchVolume ?? 0),
    0,
  );
  const kds = cluster.keywords
    .map((k) => k.keywordDifficulty)
    .filter((kd): kd is number => kd != null);
  const avgKd = kds.length
    ? Math.round(kds.reduce((a, b) => a + b, 0) / kds.length)
    : null;

  const queryClient = useQueryClient();
  const toSave = cluster.keywords.slice(0, 500);
  const save = useMutation({
    mutationFn: () =>
      saveKeywords({
        data: {
          projectId,
          keywords: toSave.map((k) => k.keyword),
          locationCode,
          languageCode,
          tags: [cluster.name.slice(0, 64)],
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["savedKeywords", projectId],
      });
      toast.success(`Saved ${toSave.length} keywords as “${cluster.name}”`);
    },
  });
  const createTopic = useMutation({
    mutationFn: () =>
      createTopicFromCluster({ data: { projectId, clusterId: cluster.id } }),
    onSuccess: () => toast.success(`Topic “${cluster.name}” created`),
  });

  const rows = expanded
    ? cluster.keywords
    : cluster.keywords.slice(0, PREVIEW_ROWS);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{cluster.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-1.5">
          <Badge variant="soft">{cluster.dominantIntent}</Badge>
          <Badge variant="outline">{STAGE_LABELS[cluster.funnelStage]}</Badge>
          <span>
            {cluster.keywords.length} keywords · {totalVolume.toLocaleString()}{" "}
            searches/mo · avg KD {avgKd ?? "—"}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead className="w-20 text-right">Volume</TableHead>
              <TableHead className="w-12 text-right">KD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((k) => (
              <TableRow key={k.keyword}>
                <TableCell className="whitespace-normal break-words">
                  {k.keyword}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(k.searchVolume)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(k.keywordDifficulty)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex flex-wrap items-center gap-2">
          {cluster.keywords.length > PREVIEW_ROWS ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Show fewer" : `Show all ${cluster.keywords.length}`}
            </Button>
          ) : null}
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              pending={save.isPending}
              onClick={() => save.mutate()}
            >
              Save cluster
            </Button>
            <Button
              size="sm"
              pending={createTopic.isPending}
              disabled={createTopic.isSuccess}
              onClick={() => createTopic.mutate()}
            >
              {createTopic.isSuccess ? "Topic created" : "Create topic"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

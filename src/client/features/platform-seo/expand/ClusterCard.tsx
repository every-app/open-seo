import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
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
  findPlatforms,
  type getKeywordPull,
} from "@/serverFunctions/platformSeo";
import {
  ParasiteOpportunityBadge,
  type ParasiteOpportunity,
} from "../platforms/ParasiteOpportunityBadge";
import { platformQueryKeys } from "../platforms/platformQueryKeys";
import { topicQueryKeys } from "../topics/topicQueryKeys";
import { expandQueryKeys } from "./useExpandPipeline";

type Cluster = Awaited<ReturnType<typeof getKeywordPull>>["clusters"][number];

const STAGE_LABELS = { tofu: "TOFU", mofu: "MOFU", bofu: "BOFU" } as const;

export const formatNumber = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString();

const PREVIEW_ROWS = 8;

// A lookup reads two Google pages per keyword, so one click checks this many.
const CHECK_MAX = 10;

export function ClusterCard({
  projectId,
  pullId,
  cluster,
  locationCode,
  languageCode,
  opportunities,
}: {
  projectId: string;
  pullId: string;
  cluster: Cluster;
  locationCode: number;
  languageCode: string;
  opportunities: Map<string, ParasiteOpportunity>;
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
  const navigate = useNavigate();
  const createTopic = useMutation({
    mutationFn: () =>
      createTopicFromCluster({ data: { projectId, clusterId: cluster.id } }),
    onSuccess: async ({ topicId, created }) => {
      await queryClient.invalidateQueries({
        queryKey: topicQueryKeys.list(projectId),
      });
      toast.success(
        created
          ? `Topic “${cluster.name}” created`
          : `“${cluster.name}” is already a topic`,
        {
          action: {
            label: "Open",
            onClick: () =>
              void navigate({
                to: "/p/$projectId/topics/$topicId",
                params: { projectId, topicId },
              }),
          },
        },
      );
    },
  });

  // The highest-volume keywords not yet checked (keywords are volume-sorted).
  const unchecked = cluster.keywords
    .filter((k) => !opportunities.has(k.keyword))
    .slice(0, CHECK_MAX)
    .map((k) => k.keyword);
  const easy = cluster.keywords.filter(
    (k) => opportunities.get(k.keyword)?.label === "easy",
  ).length;
  const checkGoogle = useMutation({
    mutationFn: () =>
      findPlatforms({
        data: { projectId, keywords: unchecked, locationCode, languageCode },
      }),
    onSuccess: async ({ results }) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: expandQueryKeys.opportunities(projectId, pullId),
        }),
        queryClient.invalidateQueries({
          queryKey: platformQueryKeys.list(projectId),
        }),
      ]);
      const waiting = results.filter((r) => r.status === "processing").length;
      toast.success(
        waiting > 0
          ? `Checked ${results.length - waiting} keywords; ${waiting} still loading. Check again in a minute at no extra cost.`
          : `Checked ${results.length} keywords on Google. New sites are on the Platforms page.`,
      );
    },
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
          {easy > 0 ? (
            <Badge variant="success">{easy} easy for parasites</Badge>
          ) : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead className="w-20 text-right">Volume</TableHead>
              <TableHead className="w-12 text-right">KD</TableHead>
              <TableHead className="w-20 text-right">Parasites</TableHead>
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
                <TableCell className="text-right">
                  <ParasiteOpportunityBadge
                    opportunity={opportunities.get(k.keyword)}
                  />
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
          <div className="ml-auto flex flex-wrap justify-end gap-2">
            {unchecked.length > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                pending={checkGoogle.isPending}
                title={`Reads Google's first two pages for the top ${unchecked.length} unchecked keywords (about ${(unchecked.length * 0.007).toFixed(2)} of DataForSEO credit).`}
                onClick={() => checkGoogle.mutate()}
              >
                Check {unchecked.length} on Google
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              pending={save.isPending}
              onClick={() => save.mutate()}
            >
              Save cluster
            </Button>
            {createTopic.data ? (
              <Button
                size="sm"
                variant="secondary"
                nativeButton={false}
                render={
                  <Link
                    to="/p/$projectId/topics/$topicId"
                    params={{ projectId, topicId: createTopic.data.topicId }}
                  />
                }
              >
                Open topic
              </Button>
            ) : (
              <Button
                size="sm"
                pending={createTopic.isPending}
                onClick={() => createTopic.mutate()}
              >
                Create topic
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

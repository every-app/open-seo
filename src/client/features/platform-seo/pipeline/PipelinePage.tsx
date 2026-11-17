import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Radar } from "lucide-react";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  collectTrackingChecks,
  getPipeline,
} from "@/serverFunctions/platformSeo";
import { topicQueryKeys } from "../topics/topicQueryKeys";
import { CopiesTable } from "./CopiesTable";
import { type PipelineData, useStartChecks } from "./useStartChecks";

// While a check runs, the page collects finished reads this often (free).
const COLLECT_EVERY_MS = 20_000;

export function PipelinePage({ projectId }: { projectId: string }) {
  const pipeline = useQuery({
    queryKey: topicQueryKeys.pipeline(projectId),
    queryFn: async () => {
      // Collecting is free and returns at once when nothing is running.
      await collectTrackingChecks({ data: { projectId } });
      return getPipeline({ data: { projectId } });
    },
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.copies.some((copy) => copy.checking)
        ? COLLECT_EVERY_MS
        : false,
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <QueryState
          query={pipeline}
          errorFallback="Failed to load the pipeline."
        >
          {(data) => (
            <>
              <PageHeader
                title="Pipeline"
                description="Every stage from keyword research to Google and AI answers, so you can see where work is waiting."
                actions={<CheckAllButton projectId={projectId} data={data} />}
              />
              <Funnel data={data} projectId={projectId} />
              <CopiesTable projectId={projectId} data={data} />
            </>
          )}
        </QueryState>
      </div>
    </div>
  );
}

function CheckAllButton({
  projectId,
  data,
}: {
  projectId: string;
  data: PipelineData;
}) {
  const start = useStartChecks(projectId);
  const count = Math.min(data.copies.length, data.maxPerCheck);
  if (data.copies.length === 0) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button pending={start.starting} onClick={() => start.mutate(undefined)}>
        <Radar />
        Check {count === 1 ? "1 copy" : `${count} copies`}
      </Button>
      <p className="max-w-64 text-right text-xs text-muted-foreground">
        Two Google reads each, about $0.005 of DataForSEO credit per copy.
      </p>
    </div>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

type Stage = {
  label: string;
  count: number;
  // Why work is waiting here, when it is.
  waiting?: { text: string; to: "topics" | "channels" | null } | null;
};

function Funnel({
  data,
  projectId,
}: {
  data: PipelineData;
  projectId: string;
}) {
  const s = data.stages;
  const t = data.topicsByStatus;
  const groups: { title: string; hint: string; stages: Stage[] }[] = [
    {
      title: "Content",
      hint: "From researched keywords to copies live on your channels.",
      stages: [
        { label: "Keywords kept", count: s.keywords },
        { label: "Clusters", count: s.clusters },
        {
          label: "Topics",
          count: s.topics,
          waiting:
            t.idea > 0
              ? { text: `${t.idea} without a brief`, to: "topics" }
              : null,
        },
        {
          label: "Briefs",
          count: s.briefs,
          waiting:
            s.briefs > s.articles
              ? { text: `${s.briefs - s.articles} not written`, to: "topics" }
              : null,
        },
        {
          label: "Articles",
          count: s.articles,
          waiting:
            s.articles > s.ready
              ? {
                  text: `${s.articles - s.ready} not marked ready`,
                  to: "topics",
                }
              : null,
        },
        {
          label: "Ready",
          count: s.ready,
          waiting:
            t.ready > 0
              ? {
                  text: `${plural(t.ready, "topic")} ready, not published`,
                  to: "topics",
                }
              : null,
        },
        {
          label: "Copies published",
          count: s.published,
          waiting:
            s.copies > s.published
              ? {
                  text: `${s.copies - s.published} prepared or drafted`,
                  to: null,
                }
              : null,
        },
      ],
    },
    {
      title: "Results",
      hint: "From each published copy's latest check.",
      stages: [
        {
          label: "Checked",
          count: s.checked,
          waiting:
            s.published > s.checked
              ? { text: `${s.published - s.checked} never checked`, to: null }
              : null,
        },
        {
          label: "Indexed by Google",
          count: s.indexed,
          waiting:
            s.notIndexed > 0
              ? { text: `${s.notIndexed} not indexed yet`, to: null }
              : null,
        },
        { label: "Ranking (top 30)", count: s.ranking },
        { label: "On page one", count: s.pageOne },
        { label: "Cited in AI answers", count: s.cited },
      ],
    },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => {
        const max = Math.max(1, ...group.stages.map((stage) => stage.count));
        return (
          <Card key={group.title}>
            <CardHeader>
              <CardTitle>{group.title}</CardTitle>
              <CardDescription>{group.hint}</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2.5">
                {group.stages.map((stage) => (
                  <li key={stage.label} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>{stage.label}</span>
                      <span className="font-semibold tabular-nums">
                        {stage.count.toLocaleString()}
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full bg-muted"
                      role="presentation"
                    >
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(stage.count / max) * 100}%` }}
                      />
                    </div>
                    {stage.waiting ? (
                      <p className="text-xs text-warning">
                        {stage.waiting.to === "topics" ? (
                          <Link
                            to="/p/$projectId/topics"
                            params={{ projectId }}
                            className="hover:underline"
                          >
                            {stage.waiting.text}
                          </Link>
                        ) : (
                          stage.waiting.text
                        )}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

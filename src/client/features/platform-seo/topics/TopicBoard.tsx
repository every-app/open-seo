import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, PenLine, SquareKanban } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import {
  generateTopicBrief,
  listTopics,
  updateTopic,
} from "@/serverFunctions/platformSeo";
import { PS_TOPIC_STATUSES, type PsTopicStatus } from "@/shared/platform-seo";
import { formatNumber } from "../expand/ClusterCard";
import { NewTopicDialog } from "./NewTopicDialog";
import { topicQueryKeys } from "./topicQueryKeys";
import { neighbourStatus, STATUS_LABELS } from "./topicStatus";

type Topic = Awaited<ReturnType<typeof listTopics>>[number];

const COLUMN_HINTS: Record<PsTopicStatus, string> = {
  idea: "Press Write this to get a brief.",
  drafting: "Topics with a brief, being written.",
  ready: "Written and ready to publish.",
  published: "Live on at least one channel.",
};

export function TopicBoard({ projectId }: { projectId: string }) {
  const topics = useQuery({
    queryKey: topicQueryKeys.list(projectId),
    queryFn: () => listTopics({ data: { projectId } }),
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <PageHeader
          title="Topics"
          description="Articles to write, from idea to published. Turn a keyword cluster into a topic from Keyword Research → Expand, or add one here."
          actions={<NewTopicDialog projectId={projectId} />}
        />
        <QueryState query={topics} errorFallback="Failed to load topics.">
          {(data) =>
            data.length === 0 ? (
              <EmptyState
                icon={SquareKanban}
                title="No topics yet"
                description="Press Create topic on a cluster in Keyword Research → Expand, or add a topic of your own."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {PS_TOPIC_STATUSES.map((status) => {
                  const column = data.filter((t) => t.status === status);
                  return (
                    <section
                      key={status}
                      aria-label={STATUS_LABELS[status]}
                      className="flex flex-col gap-3 rounded-xl bg-muted/40 p-3"
                    >
                      <div>
                        <h2 className="text-sm font-medium">
                          {STATUS_LABELS[status]}{" "}
                          <span className="text-muted-foreground">
                            ({column.length})
                          </span>
                        </h2>
                        <p className="text-xs text-muted-foreground">
                          {COLUMN_HINTS[status]}
                        </p>
                      </div>
                      {column.map((topic) => (
                        <TopicCard
                          key={topic.id}
                          projectId={projectId}
                          topic={topic}
                        />
                      ))}
                    </section>
                  );
                })}
              </div>
            )
          }
        </QueryState>
      </div>
    </div>
  );
}

function TopicCard({ projectId, topic }: { projectId: string; topic: Topic }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: topicQueryKeys.list(projectId) });

  const move = useMutation({
    mutationFn: (status: PsTopicStatus) =>
      updateTopic({ data: { projectId, topicId: topic.id, status } }),
    onSuccess: refresh,
  });
  const briefKey = topicQueryKeys.brief(projectId, topic.id);
  const writing = useIsMutating({ mutationKey: briefKey }) > 0;
  const writeThis = useMutation({
    mutationKey: briefKey,
    mutationFn: () =>
      generateTopicBrief({ data: { projectId, topicId: topic.id } }),
    onSuccess: async () => {
      await refresh();
      // A toast, not a redirect: the call takes a while and the user may
      // have moved on.
      toast.success(`Brief ready for “${topic.title}”`, {
        action: {
          label: "Open",
          onClick: () =>
            void navigate({
              to: "/p/$projectId/topics/$topicId",
              params: { projectId, topicId: topic.id },
            }),
        },
      });
    },
  });

  const previous = neighbourStatus(topic.status, -1);
  const next = neighbourStatus(topic.status, 1);
  const more = topic.keywordCount - topic.topKeywords.length;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="text-sm leading-snug">
          <Link
            to="/p/$projectId/topics/$topicId"
            params={{ projectId, topicId: topic.id }}
            className="hover:underline"
          >
            {topic.title}
          </Link>
        </CardTitle>
        {topic.angle ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {topic.angle}
          </p>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1">
          {topic.topKeywords.map((keyword) => (
            <Badge
              key={keyword}
              variant={keyword === topic.primaryKeyword ? "soft" : "outline"}
              className="max-w-full truncate"
            >
              {keyword}
            </Badge>
          ))}
          {more > 0 ? (
            <span className="text-xs text-muted-foreground">+{more}</span>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          {topic.keywordCount} keywords · {formatNumber(topic.totalVolume)}{" "}
          searches/mo{topic.hasBrief ? " · brief ready" : ""}
        </p>
        <div className="flex items-center gap-1">
          {previous ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move to ${STATUS_LABELS[previous]}`}
              title={`Move to ${STATUS_LABELS[previous]}`}
              disabled={move.isPending}
              onClick={() => move.mutate(previous)}
            >
              <ChevronLeft />
            </Button>
          ) : null}
          {next ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Move to ${STATUS_LABELS[next]}`}
              title={`Move to ${STATUS_LABELS[next]}`}
              disabled={move.isPending}
              onClick={() => move.mutate(next)}
            >
              <ChevronRight />
            </Button>
          ) : null}
          {topic.hasBrief ? null : (
            <Button
              size="sm"
              className="ml-auto"
              pending={writing}
              onClick={() => writeThis.mutate()}
            >
              <PenLine />
              Write this
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

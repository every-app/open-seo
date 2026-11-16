import { useIsMutating, useMutation } from "@tanstack/react-query";
import { PenLine, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { generateTopicBrief } from "@/serverFunctions/platformSeo";
import type { TopicDetail } from "./TopicDetailPage";
import { topicQueryKeys } from "./topicQueryKeys";

export function TopicBrief({
  projectId,
  topic,
  onChanged,
  blockedBy,
}: {
  projectId: string;
  topic: TopicDetail;
  onChanged: () => Promise<unknown>;
  // Why writing is unavailable right now, shown under the button.
  blockedBy: string | null;
}) {
  const hasBrief = topic.briefGeneratedAt !== null;
  const briefKey = topicQueryKeys.brief(projectId, topic.id);
  const writing = useIsMutating({ mutationKey: briefKey }) > 0;
  const write = useMutation({
    mutationKey: briefKey,
    mutationFn: () =>
      generateTopicBrief({ data: { projectId, topicId: topic.id } }),
    onSuccess: async () => {
      await onChanged();
      toast.success(hasBrief ? "Brief rewritten" : "Brief ready");
    },
  });

  if (!hasBrief) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Brief</CardTitle>
          <CardDescription>
            Write this picks the keyword to target, the real questions people
            search that the article should answer, and an outline. It uses AI
            credits and moves the topic to Drafting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            pending={writing}
            disabled={blockedBy !== null}
            onClick={() => write.mutate()}
          >
            <PenLine />
            Write this
          </Button>
          {blockedBy ? (
            <p className="mt-2 text-xs text-muted-foreground">{blockedBy}</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brief</CardTitle>
        <CardDescription>
          Target keyword:{" "}
          <span className="font-medium text-foreground">
            {topic.primaryKeyword ?? "none"}
          </span>
        </CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            pending={writing}
            disabled={blockedBy !== null}
            title={
              blockedBy ??
              "Writes a new brief, replacing the questions and outline below. Uses AI credits."
            }
            onClick={() => write.mutate()}
          >
            <RefreshCw />
            Rewrite
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[1fr_2fr]">
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Questions to answer</h3>
          {topic.questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No question searches fit this topic.
            </p>
          ) : (
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              {topic.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Outline</h3>
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm">
            {topic.sections.map((section, index) => (
              <li key={index}>
                <p className="font-medium">{section.heading}</p>
                {section.notes ? (
                  <p className="text-muted-foreground">{section.notes}</p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </CardContent>
    </Card>
  );
}

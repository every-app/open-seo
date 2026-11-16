import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { getPublishing, setCanonicalUrl } from "@/serverFunctions/platformSeo";
import { topicQueryKeys } from "../topics/topicQueryKeys";
import { SyndicationCard } from "./SyndicationCard";

export type PublishingData = Awaited<ReturnType<typeof getPublishing>>;

export function PublishPage({
  projectId,
  topicId,
}: {
  projectId: string;
  topicId: string;
}) {
  const publishing = useQuery({
    queryKey: topicQueryKeys.publishing(projectId, topicId),
    queryFn: () => getPublishing({ data: { projectId, topicId } }),
    // Channels and the article change on other pages; always load fresh.
    staleTime: 0,
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <QueryState
          query={publishing}
          errorFallback="Failed to load publishing."
        >
          {(data) => (
            <>
              <PageHeader
                backLink={
                  <BackLink
                    to="/p/$projectId/topics/$topicId/write"
                    params={{ projectId, topicId: data.topic.id }}
                  >
                    Article
                  </BackLink>
                }
                title="Publish"
                description={data.article?.title ?? data.topic.title}
              />
              {!data.article?.hasBody ? (
                <EmptyState
                  icon={FileText}
                  title="Write the article first"
                  description="Each channel gets its own copy of the article you write in the editor."
                  action={
                    <Button
                      nativeButton={false}
                      render={
                        <Link
                          to="/p/$projectId/topics/$topicId/write"
                          params={{ projectId, topicId: data.topic.id }}
                        />
                      }
                    >
                      Open editor
                    </Button>
                  }
                />
              ) : (
                <>
                  <CanonicalUrlCard
                    projectId={projectId}
                    topicId={data.topic.id}
                    saved={data.article.canonicalUrl}
                  />
                  {data.channels.length === 0 ? (
                    <EmptyState
                      icon={Send}
                      title="No channels connected"
                      description="Connect Dev.to or Hashnode, then come back to publish."
                      action={
                        <Button
                          nativeButton={false}
                          render={
                            <Link
                              to="/p/$projectId/channels"
                              params={{ projectId }}
                            />
                          }
                        >
                          Connect a channel
                        </Button>
                      }
                    />
                  ) : (
                    data.channels.map((channel) => (
                      <SyndicationCard
                        key={channel.id}
                        projectId={projectId}
                        topicId={data.topic.id}
                        channel={channel}
                        canonicalUrl={data.article?.canonicalUrl ?? null}
                        syndication={
                          data.syndications.find(
                            (s) => s.channelId === channel.id,
                          ) ?? null
                        }
                      />
                    ))
                  )}
                </>
              )}
            </>
          )}
        </QueryState>
      </div>
    </div>
  );
}

function CanonicalUrlCard({
  projectId,
  topicId,
  saved,
}: {
  projectId: string;
  topicId: string;
  saved: string | null;
}) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(saved ?? "");
  const trimmed = value.trim();
  const valid = trimmed === "" || /^https?:\/\/[^\s/]+\.[^\s]+$/.test(trimmed);
  const save = useMutation({
    mutationFn: () =>
      setCanonicalUrl({
        data: { projectId, topicId, canonicalUrl: trimmed || null },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: topicQueryKeys.publishing(projectId, topicId),
      });
      toast.success(trimmed ? "Original URL saved" : "Original URL removed");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Original on your site</CardTitle>
        <CardDescription>
          Each copy sets this as its canonical URL and ends with a link to it,
          so search engines credit your site. Leave it empty if the article only
          lives on these channels.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (valid && trimmed !== (saved ?? "")) save.mutate();
          }}
        >
          <Input
            type="url"
            value={value}
            maxLength={2000}
            placeholder="https://yoursite.com/blog/parasite-seo"
            aria-label="Original URL"
            aria-invalid={!valid}
            className="min-w-0 flex-1 basis-64"
            onChange={(event) => setValue(event.target.value)}
          />
          <Button
            type="submit"
            variant="outline"
            pending={save.isPending}
            disabled={!valid || trimmed === (saved ?? "")}
          >
            Save
          </Button>
        </form>
        {!valid ? (
          <p className="mt-2 text-xs text-destructive">
            Enter a full address starting with https://.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

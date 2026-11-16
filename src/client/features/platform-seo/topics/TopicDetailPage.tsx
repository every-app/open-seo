import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/client/components/ui/select";
import { Textarea } from "@/client/components/ui/textarea";
import {
  deleteTopic,
  getTopic,
  updateTopic,
} from "@/serverFunctions/platformSeo";
import type { PsTopicStatus } from "@/shared/platform-seo";
import { TopicBrief } from "./TopicBrief";
import { TopicKeywordsTable } from "./TopicKeywordsTable";
import { topicQueryKeys } from "./topicQueryKeys";
import { asTopicStatus, STATUS_ITEMS } from "./topicStatus";

export type TopicDetail = Awaited<ReturnType<typeof getTopic>>;

export function TopicDetailPage({
  projectId,
  topicId,
}: {
  projectId: string;
  topicId: string;
}) {
  const topic = useQuery({
    queryKey: topicQueryKeys.detail(projectId, topicId),
    queryFn: () => getTopic({ data: { projectId, topicId } }),
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-4">
        <QueryState query={topic} errorFallback="Failed to load this topic.">
          {(data) => <TopicDetail projectId={projectId} topic={data} />}
        </QueryState>
      </div>
    </div>
  );
}

function TopicDetail({
  projectId,
  topic,
}: {
  projectId: string;
  topic: TopicDetail;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: topicQueryKeys.detail(projectId, topic.id),
      }),
      queryClient.invalidateQueries({
        queryKey: topicQueryKeys.list(projectId),
        exact: true,
      }),
    ]);

  const setStatus = useMutation({
    mutationFn: (status: PsTopicStatus) =>
      updateTopic({ data: { projectId, topicId: topic.id, status } }),
    onSuccess: refresh,
  });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // A brief reads the saved title and angle, and its refresh resets the form.
  const [detailsDirty, setDetailsDirty] = useState(false);
  const remove = useMutation({
    mutationFn: () => deleteTopic({ data: { projectId, topicId: topic.id } }),
    onSuccess: async () => {
      queryClient.removeQueries({
        queryKey: topicQueryKeys.detail(projectId, topic.id),
      });
      await queryClient.invalidateQueries({
        queryKey: topicQueryKeys.list(projectId),
        exact: true,
      });
      toast.success(`Deleted “${topic.title}”`);
      await navigate({ to: "/p/$projectId/topics", params: { projectId } });
    },
  });

  const source = topic.clusterName
    ? `From the “${topic.clusterName}” cluster${topic.seed ? ` of “${topic.seed}”` : ""}`
    : topic.seed
      ? `From a “${topic.seed}” cluster`
      : "Added by hand";

  return (
    <>
      <PageHeader
        backLink={
          <BackLink to="/p/$projectId/topics" params={{ projectId }}>
            Topics
          </BackLink>
        }
        title={topic.title}
        description={source}
        actions={
          <>
            <Button
              variant={topic.briefGeneratedAt ? "default" : "outline"}
              nativeButton={false}
              render={
                <Link
                  to="/p/$projectId/topics/$topicId/write"
                  params={{ projectId, topicId: topic.id }}
                />
              }
            >
              <FileText />
              Open editor
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  to="/p/$projectId/topics/$topicId/publish"
                  params={{ projectId, topicId: topic.id }}
                />
              }
            >
              <Send />
              Publish
            </Button>
            <Select
              items={STATUS_ITEMS}
              value={topic.status}
              disabled={setStatus.isPending}
              onValueChange={(value) => {
                const status = asTopicStatus(value);
                if (status) setStatus.mutate(status);
              }}
            >
              <SelectTrigger className="w-36" aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete topic"
              title="Delete topic"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 />
            </Button>
          </>
        }
      />

      <TopicDetailsForm
        // Remount when the saved values change (a brief can fill the angle).
        key={`${topic.title}\n${topic.angle ?? ""}`}
        projectId={projectId}
        topic={topic}
        onSaved={refresh}
        onDirtyChange={setDetailsDirty}
      />
      <TopicBrief
        projectId={projectId}
        topic={topic}
        onChanged={refresh}
        blockedBy={
          detailsDirty ? "Save or undo your changes to Details first." : null
        }
      />
      <TopicKeywordsTable
        projectId={projectId}
        topic={topic}
        onChanged={refresh}
      />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{topic.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its keywords and brief are deleted too. The cluster it came from
              stays in Keyword Research.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              pending={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Delete topic
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TopicDetailsForm({
  projectId,
  topic,
  onSaved,
  onDirtyChange,
}: {
  projectId: string;
  topic: TopicDetail;
  onSaved: () => Promise<unknown>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [title, setTitle] = useState(topic.title);
  const [angle, setAngle] = useState(topic.angle ?? "");
  const dirty =
    title.trim() !== topic.title || angle.trim() !== (topic.angle ?? "");
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);
  const save = useMutation({
    mutationFn: () =>
      updateTopic({
        data: {
          projectId,
          topicId: topic.id,
          title,
          angle: angle.trim() || null,
        },
      }),
    onSuccess: async () => {
      await onSaved();
      toast.success("Topic saved");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && title.trim()) save.mutate();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic-title">Title</Label>
            <Input
              id="topic-title"
              value={title}
              maxLength={200}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="topic-angle">Angle</Label>
            <Textarea
              id="topic-angle"
              value={angle}
              maxLength={300}
              rows={2}
              onChange={(event) => setAngle(event.target.value)}
              placeholder="Who the article is for and what makes it different. The brief fills this in if you leave it empty."
            />
          </div>
          <div>
            <Button
              type="submit"
              variant="outline"
              pending={save.isPending}
              disabled={!dirty || !title.trim()}
            >
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CloudUpload, Copy, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SafeExternalLink } from "@/client/components/SafeExternalLink";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/client/components/ui/alert-dialog";
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
  prepareSyndication,
  publishSyndication,
  removeSyndication,
  saveSyndication,
  sendSyndicationDraft,
} from "@/serverFunctions/platformSeo";
import { PS_CHANNEL_LABELS, type PsAiDisclosure } from "@/shared/platform-seo";
import { topicQueryKeys } from "../topics/topicQueryKeys";
import type { PublishingData } from "./PublishPage";
import { SyndicationFields } from "./SyndicationFields";

type Channel = PublishingData["channels"][number];
type Syndication = PublishingData["syndications"][number];

const STATUS_BADGES = {
  prepared: { label: "Not sent", variant: "outline" },
  drafted: { label: "Draft on platform", variant: "soft" },
  published: { label: "Published", variant: "success" },
} as const;

export function SyndicationCard({
  projectId,
  topicId,
  channel,
  canonicalUrl,
  syndication,
}: {
  projectId: string;
  topicId: string;
  channel: Channel;
  canonicalUrl: string | null;
  syndication: Syndication | null;
}) {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      // The topic's own key prefixes this page's, and publishing moves it.
      queryClient.invalidateQueries({
        queryKey: topicQueryKeys.detail(projectId, topicId),
      }),
      queryClient.invalidateQueries({
        queryKey: topicQueryKeys.list(projectId),
        exact: true,
      }),
    ]);
  const prepare = useMutation({
    mutationFn: () =>
      prepareSyndication({
        data: { projectId, topicId, channelId: channel.id },
      }),
    onSuccess: refresh,
  });
  const platform = PS_CHANNEL_LABELS[channel.type];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{channel.displayName}</CardTitle>
        <CardDescription>
          {syndication ? (
            <Badge variant={STATUS_BADGES[syndication.status].variant}>
              {STATUS_BADGES[syndication.status].label}
            </Badge>
          ) : (
            `A copy of the article for ${platform}, which you can edit before it goes out.`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {syndication ? (
          <SyndicationForm
            // A fresh form when the server copy changes (re-prepared or sent).
            key={syndication.updatedAt}
            projectId={projectId}
            channel={channel}
            canonicalUrl={canonicalUrl}
            syndication={syndication}
            onChanged={refresh}
            onCopyLatest={() => prepare.mutateAsync()}
          />
        ) : (
          <Button pending={prepare.isPending} onClick={() => prepare.mutate()}>
            <Copy />
            Prepare {platform} copy
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function SyndicationForm({
  projectId,
  channel,
  canonicalUrl,
  syndication,
  onChanged,
  onCopyLatest,
}: {
  projectId: string;
  channel: Channel;
  canonicalUrl: string | null;
  syndication: Syndication;
  onChanged: () => Promise<unknown>;
  onCopyLatest: () => Promise<unknown>;
}) {
  const platform = PS_CHANNEL_LABELS[channel.type];
  const isDevto = channel.type === "devto";
  const [title, setTitle] = useState(syndication.platformTitle);
  const [summary, setSummary] = useState(syndication.platformSummary ?? "");
  const [tags, setTags] = useState(syndication.tags.join(", "));
  const [body, setBody] = useState(syndication.platformBody);
  const [ai, setAi] = useState<PsAiDisclosure | null>(syndication.aiDisclosure);
  const [confirm, setConfirm] = useState<"publish" | "copy" | null>(null);

  const tagList = tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const dirty =
    title !== syndication.platformTitle ||
    summary !== (syndication.platformSummary ?? "") ||
    tagList.join(",") !== syndication.tags.join(",") ||
    body !== syndication.platformBody ||
    ai !== syndication.aiDisclosure;
  const canSave = title.trim() !== "" && body.trim() !== "";

  const saveNow = () =>
    saveSyndication({
      data: {
        projectId,
        syndicationId: syndication.id,
        title,
        summary: summary.trim() || null,
        body,
        tags: tagList,
        aiDisclosure: isDevto ? ai : null,
      },
    });
  const save = useMutation({
    mutationFn: saveNow,
    onSuccess: async () => {
      await onChanged();
      toast.success("Copy saved");
    },
  });
  // Sending always sends what's on screen: unsaved edits are saved first.
  const send = useMutation({
    mutationFn: async (action: "draft" | "publish") => {
      if (dirty) await saveNow();
      const data = { projectId, syndicationId: syndication.id };
      return action === "draft"
        ? sendSyndicationDraft({ data })
        : publishSyndication({ data });
    },
    onSuccess: async (result, action) => {
      setConfirm(null);
      await onChanged();
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(
        action === "publish"
          ? `Published on ${platform}`
          : syndication.status === "published"
            ? `Updated the live post on ${platform}`
            : `Draft saved on ${platform}`,
      );
    },
  });
  const copyLatest = useMutation({
    mutationFn: onCopyLatest,
    onSuccess: () => {
      setConfirm(null);
      toast.success("Copied the latest article");
    },
  });
  const remove = useMutation({
    mutationFn: () =>
      removeSyndication({
        data: { projectId, syndicationId: syndication.id },
      }),
    onSuccess: onChanged,
  });

  const busy = send.isPending || save.isPending || copyLatest.isPending;
  const sendLabel =
    syndication.status === "prepared"
      ? `Send as ${platform} draft`
      : syndication.status === "drafted"
        ? "Update draft"
        : "Update live post";

  return (
    <div className="flex flex-col gap-4">
      {syndication.error ? (
        <Alert variant="destructive">
          <AlertDescription>{syndication.error}</AlertDescription>
        </Alert>
      ) : null}
      <SyndicationFields
        // Locked while a send runs: its result replaces the form.
        disabled={busy}
        id={syndication.id}
        type={channel.type}
        canonicalUrl={canonicalUrl}
        value={{ title, summary, tags, body, ai }}
        onChange={(next) => {
          setTitle(next.title);
          setSummary(next.summary);
          setTags(next.tags);
          setBody(next.body);
          setAi(next.ai);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          disabled={!dirty || !canSave || busy}
          pending={save.isPending}
          onClick={() => save.mutate()}
        >
          Save copy
        </Button>
        <Button
          variant={syndication.status === "drafted" ? "outline" : "default"}
          disabled={!canSave || busy}
          pending={send.isPending && send.variables === "draft"}
          onClick={() => send.mutate("draft")}
        >
          <CloudUpload />
          {sendLabel}
        </Button>
        {syndication.status === "drafted" ? (
          <Button
            disabled={!canSave || busy}
            pending={send.isPending && send.variables === "publish"}
            onClick={() => setConfirm("publish")}
          >
            <Rocket />
            Publish on {platform}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => setConfirm("copy")}
        >
          <Copy />
          Copy latest article
        </Button>
        {syndication.status !== "prepared" ? null : (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove the ${platform} copy`}
            title={`Remove the ${platform} copy`}
            disabled={busy || remove.isPending}
            onClick={() => remove.mutate()}
          >
            <Trash2 />
          </Button>
        )}
      </div>
      {syndication.status === "published" && syndication.liveUrl ? (
        <p className="text-xs text-muted-foreground">
          Live at{" "}
          <SafeExternalLink
            url={syndication.liveUrl}
            label={syndication.liveUrl}
            className="underline"
          />
          {syndication.publishedAt
            ? ` since ${new Date(syndication.publishedAt).toLocaleDateString()}`
            : ""}
          .
        </p>
      ) : syndication.status === "drafted" ? (
        <p className="text-xs text-muted-foreground">
          The draft is in your {platform} dashboard. It isn't public until you
          publish it.
        </p>
      ) : null}

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          {confirm === "publish" ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Publish on {platform}?</AlertDialogTitle>
                <AlertDialogDescription>
                  “{title}” goes live on {channel.displayName} with the text
                  above, and the topic moves to Published.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  pending={send.isPending}
                  onClick={() => send.mutate("publish")}
                >
                  Publish
                </Button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace this copy?</AlertDialogTitle>
                <AlertDialogDescription>
                  The title, summary and article above are replaced with the
                  latest saved article. Tags are suggested again. Nothing is
                  sent to {platform} until you send it.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button
                  pending={copyLatest.isPending}
                  onClick={() => copyLatest.mutate()}
                >
                  Replace
                </Button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

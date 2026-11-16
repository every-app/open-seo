import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CheckCircle2, PenLine, Undo2, Wand2 } from "lucide-react";
import { toast } from "sonner";
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
  draftArticle,
  humanizeArticle,
  setArticleStatus,
} from "@/serverFunctions/platformSeo";
import { topicQueryKeys } from "../topics/topicQueryKeys";
import type { ArticleEditorData, ArticleText } from "./ArticleEditorPage";

export function ArticleActions({
  projectId,
  data,
  text,
  wordCount,
  dirty,
  flush,
  onBusyChange,
  onReplaced,
  onRestore,
}: {
  projectId: string;
  data: ArticleEditorData;
  text: ArticleText;
  wordCount: number;
  dirty: boolean;
  flush: () => Promise<unknown>;
  onBusyChange: (busy: boolean) => void;
  // Puts AI text in the editor (already saved) and returns what it replaced.
  onReplaced: (next: ArticleText) => ArticleText;
  onRestore: (previous: ArticleText) => void;
}) {
  const { topic, aiReady, humanizeMaxWords } = data;
  const topicId = topic.id;
  const queryClient = useQueryClient();
  // The detail key prefixes the editor's own, so both refetch.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: topicQueryKeys.detail(projectId, topicId),
      }),
      queryClient.invalidateQueries({
        queryKey: topicQueryKeys.list(projectId),
        exact: true,
      }),
    ]);
  const replaced = (label: string, next: ArticleText) => {
    const previous = onReplaced(next);
    toast.success(label, {
      action: { label: "Undo", onClick: () => onRestore(previous) },
    });
  };

  const draft = useMutation({
    mutationFn: () => draftArticle({ data: { projectId, topicId } }),
    onSuccess: async (result) => {
      replaced("Draft written from the brief", {
        title: result.title,
        body: result.body,
      });
      await refresh();
    },
  });
  const humanize = useMutation({
    mutationFn: () =>
      humanizeArticle({ data: { projectId, topicId, ...text } }),
    onSuccess: async (result) => {
      if (result.outcome === "too_short") {
        toast.error(
          "The rewrite came back much shorter than your article, so your text is unchanged. Try again.",
        );
        return;
      }
      replaced("Article humanized", { title: text.title, body: result.body });
      await refresh();
    },
  });
  const status = useMutation({
    mutationFn: async (next: "draft" | "ready") => {
      if (dirty) await flush();
      return setArticleStatus({ data: { projectId, topicId, status: next } });
    },
    onSuccess: async (_result, next) => {
      await refresh();
      toast.success(
        next === "ready"
          ? "Marked ready: the topic moved to Ready"
          : "Back to draft",
      );
    },
  });

  const busy = draft.isPending || humanize.isPending;
  useEffect(() => onBusyChange(busy), [busy, onBusyChange]);
  const [confirmDraft, setConfirmDraft] = useState(false);

  const draftBlocked = !aiReady
    ? "AI writing is not set up on this deployment."
    : !topic.primaryKeyword || topic.sections.length === 0
      ? "Write the brief on the topic page first."
      : null;
  const humanizeBlocked = !aiReady
    ? "AI writing is not set up on this deployment."
    : wordCount === 0
      ? "Write or draft the article first."
      : wordCount > humanizeMaxWords
        ? `Humanize works on articles up to ${humanizeMaxWords.toLocaleString()} words.`
        : !text.title.trim()
          ? "Add a headline first."
          : null;
  const empty = text.body.trim() === "";
  // The topic's status is the one the board shows, so the buttons follow it.
  const isReady = topic.status === "ready";
  const isPublished = topic.status === "published";
  const readyBlocked = empty
    ? "Write the article before marking it ready."
    : !text.title.trim()
      ? "Add a headline first."
      : null;
  // Disabled buttons show no tooltip, so the reasons are spelled out. An empty
  // editor explains itself.
  const reasons = aiReady
    ? [
        draftBlocked,
        !empty && humanizeBlocked ? `Humanize: ${humanizeBlocked}` : null,
      ].filter(Boolean)
    : ["AI writing is not set up on this deployment."];

  return (
    <>
      <Button
        variant="outline"
        disabled={busy || draftBlocked !== null}
        pending={draft.isPending}
        title={
          draftBlocked ??
          "Writes the whole article from the brief. Uses AI credits."
        }
        onClick={() => (empty ? draft.mutate() : setConfirmDraft(true))}
      >
        <PenLine />
        {empty ? "Draft with AI" : "Redraft"}
      </Button>
      <Button
        variant="outline"
        disabled={busy || humanizeBlocked !== null}
        pending={humanize.isPending}
        title={
          humanizeBlocked ??
          "Rewrites the article so it reads naturally, keeping its structure and facts. Uses AI credits."
        }
        onClick={() => humanize.mutate()}
      >
        <Wand2 />
        Humanize
      </Button>
      {isPublished ? null : isReady ? (
        <Button
          variant="outline"
          disabled={busy}
          pending={status.isPending}
          onClick={() => status.mutate("draft")}
        >
          <Undo2 />
          Back to draft
        </Button>
      ) : (
        <Button
          disabled={busy || readyBlocked !== null}
          pending={status.isPending}
          onClick={() => status.mutate("ready")}
        >
          <CheckCircle2 />
          Mark ready
        </Button>
      )}
      {reasons.length > 0 ? (
        <p className="basis-full text-xs text-muted-foreground">
          {reasons.join(" ")}
        </p>
      ) : null}

      <AlertDialog open={confirmDraft} onOpenChange={setConfirmDraft}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace your article?</AlertDialogTitle>
            <AlertDialogDescription>
              A new draft from the brief replaces the headline and everything in
              the editor. You can undo it right after.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              onClick={() => {
                setConfirmDraft(false);
                draft.mutate();
              }}
            >
              Redraft
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

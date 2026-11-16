import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackLink, PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import { Markdown } from "@/client/components/Markdown";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { getArticleEditor, saveArticle } from "@/serverFunctions/platformSeo";
import { PS_ARTICLE_MAX_CHARS } from "@/shared/platform-seo";
import { topicQueryKeys } from "../topics/topicQueryKeys";
import { ArticleActions } from "./ArticleActions";
import { ArticleChecklist } from "./ArticleChecklist";
import { checkArticle } from "./checkArticle";

export type ArticleEditorData = Awaited<ReturnType<typeof getArticleEditor>>;
export type ArticleText = { title: string; body: string };

const AUTOSAVE_MS = 1500;

export function ArticleEditorPage({
  projectId,
  topicId,
}: {
  projectId: string;
  topicId: string;
}) {
  const editor = useQuery({
    queryKey: topicQueryKeys.article(projectId, topicId),
    queryFn: () => getArticleEditor({ data: { projectId, topicId } }),
    // The editor seeds its text from this query once, so it must never start
    // from a cached copy older than the last autosave: drop the cache when the
    // editor closes and always load fresh.
    gcTime: 0,
    staleTime: 0,
    // Later refetches only update the brief and status around the text.
    refetchOnWindowFocus: false,
  });

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-[110rem] flex-col gap-4">
        <QueryState query={editor} errorFallback="Failed to load the editor.">
          {(data) => <ArticleEditor projectId={projectId} data={data} />}
        </QueryState>
      </div>
    </div>
  );
}

function ArticleEditor({
  projectId,
  data,
}: {
  projectId: string;
  data: ArticleEditorData;
}) {
  const { topic, article } = data;
  const queryClient = useQueryClient();
  const [text, setText] = useState<ArticleText>({
    title: article?.canonicalTitle ?? topic.title,
    body: article?.bodyMarkdown ?? "",
  });
  // What the server has, so the editor knows when there is something to save.
  const [saved, setSaved] = useState<ArticleText | null>(
    article
      ? { title: article.canonicalTitle, body: article.bodyMarkdown }
      : null,
  );
  // An AI action replaces the text; edits made meanwhile would be lost.
  const [aiBusy, setAiBusy] = useState(false);

  const titleOk = text.title.trim().length > 0;
  // Changed since the last save; it can only be saved with a headline.
  const changed =
    saved === null
      ? text.body.trim() !== ""
      : text.title !== saved.title || text.body !== saved.body;
  const dirty = titleOk && changed;

  const save = useMutation({
    mutationFn: (value: ArticleText) =>
      saveArticle({ data: { projectId, topicId: topic.id, ...value } }),
    onSuccess: (_result, value) => setSaved(value),
    // The status line shows a failed save; a toast per autosave would pile up.
    meta: { errorToast: false },
  });
  const { mutate: saveNow, isPending: saving } = save;
  // A failed save is retried when the text changes or on request, not in a
  // loop.
  const failedThisText = save.isError && save.variables === text;

  // Autosave after a pause in typing. One save at a time keeps the server's
  // copy in the order the user typed.
  useEffect(() => {
    if (!dirty || saving || aiBusy || failedThisText) return;
    const timer = setTimeout(() => saveNow(text), AUTOSAVE_MS);
    return () => clearTimeout(timer);
  }, [dirty, saving, text, aiBusy, failedThisText, saveNow]);

  // Leaving the page saves what hasn't been saved yet.
  // Without a headline it saves under the topic's title rather than drop the
  // body.
  const latest = useRef({ text, changed });
  latest.current = { text, changed };
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (latest.current.changed) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      const { text: last, changed: unsaved } = latest.current;
      if (unsaved) {
        void saveArticle({
          data: {
            projectId,
            topicId: topic.id,
            title: last.title.trim() || topic.title,
            body: last.body,
          },
        }).then(() =>
          queryClient.invalidateQueries({
            queryKey: topicQueryKeys.article(projectId, topic.id),
          }),
        );
      }
    };
  }, [projectId, topic.id, topic.title, queryClient]);

  const checks = checkArticle({
    title: text.title,
    body: text.body,
    primaryKeyword: topic.primaryKeyword,
    keywords: topic.keywords.map((k) => k.keyword),
    questions: topic.questions,
    outline: topic.sections.map((s) => s.heading),
  });

  const saveState = failedThisText
    ? "Not saved"
    : saving
      ? "Saving…"
      : changed && !titleOk
        ? "Add a headline to save"
        : dirty
          ? "Unsaved changes"
          : saved
            ? "Saved"
            : "";

  return (
    <>
      <PageHeader
        backLink={
          <BackLink
            to="/p/$projectId/topics/$topicId"
            params={{ projectId, topicId: topic.id }}
          >
            {topic.title}
          </BackLink>
        }
        title="Article"
        description={
          topic.primaryKeyword ? (
            <>
              Target keyword:{" "}
              <span className="font-medium text-foreground">
                {topic.primaryKeyword}
              </span>
            </>
          ) : (
            "No brief yet: write one on the topic page first."
          )
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <ArticleActions
          projectId={projectId}
          data={data}
          text={text}
          wordCount={checks.wordCount}
          dirty={dirty}
          flush={() => save.mutateAsync(text)}
          onBusyChange={setAiBusy}
          onReplaced={(next) => {
            const previous = text;
            setText(next);
            setSaved(next);
            return previous;
          }}
          onRestore={setText}
        />
        <Button
          variant="ghost"
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
        <span
          className="ml-auto text-xs text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {saveState}
        </span>
        {failedThisText ? (
          <Button variant="outline" size="sm" onClick={() => saveNow(text)}>
            Retry save
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <Input
            value={text.title}
            maxLength={200}
            readOnly={aiBusy}
            aria-label="Headline"
            aria-invalid={!titleOk}
            className="h-11 text-lg font-semibold"
            onChange={(event) =>
              setText((t) => ({ ...t, title: event.target.value }))
            }
          />
          <div className="grid gap-3 lg:grid-cols-2">
            <Textarea
              value={text.body}
              maxLength={PS_ARTICLE_MAX_CHARS}
              readOnly={aiBusy}
              aria-label="Article in Markdown"
              placeholder={
                topic.primaryKeyword
                  ? "Write in Markdown, or press Draft with AI to start from the brief."
                  : "Write in Markdown."
              }
              className="min-h-[60vh] resize-y font-mono text-sm leading-relaxed lg:h-[70vh]"
              onChange={(event) =>
                setText((t) => ({ ...t, body: event.target.value }))
              }
            />
            <section
              aria-label="Preview"
              className="min-h-[30vh] overflow-auto rounded-lg border border-border bg-card p-5 lg:h-[70vh]"
            >
              <h1 className="mb-4 text-xl font-semibold">{text.title}</h1>
              {text.body.trim() ? (
                <Markdown className="text-sm">{text.body}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The preview appears here as you write.
                </p>
              )}
            </section>
          </div>
        </div>
        <ArticleChecklist checks={checks} />
      </div>
    </>
  );
}

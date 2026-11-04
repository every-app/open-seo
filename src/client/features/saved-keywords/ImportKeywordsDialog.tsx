import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";
import {
  refreshSavedKeywordMetrics,
  saveKeywords,
} from "@/serverFunctions/keywords";

/** saveKeywords takes at most this many keywords per call. */
const SAVE_CHUNK_SIZE = 500;

/** "Import keywords" button and dialog for the Saved Keywords page. */
export function ImportKeywordsButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (input: {
      keywords: string[];
      tag: string | null;
      fetchStats: boolean;
    }) => {
      const savedKeywordIds: string[] = [];
      for (let i = 0; i < input.keywords.length; i += SAVE_CHUNK_SIZE) {
        const result = await saveKeywords({
          data: {
            projectId,
            keywords: input.keywords.slice(i, i + SAVE_CHUNK_SIZE),
            tags: input.tag ? [input.tag] : undefined,
          },
        });
        savedKeywordIds.push(...result.savedKeywordIds);
      }
      if (input.fetchStats && savedKeywordIds.length > 0) {
        await refreshSavedKeywordMetrics({
          data: { projectId, savedKeywordIds },
        });
      }
      return savedKeywordIds.length;
    },
    onSuccess: (count) => {
      setOpen(false);
      toast.success(`Imported ${count} keyword${count === 1 ? "" : "s"}`);
    },
    // Saved chunks stay saved when a later step fails, so refresh either way.
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ["savedKeywords", projectId] }),
  });

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Upload data-icon="inline-start" />
        Import keywords
      </Button>
      {open ? (
        <ImportKeywordsDialog
          isPending={importMutation.isPending}
          onClose={() => setOpen(false)}
          onImport={(input) => importMutation.mutate(input)}
        />
      ) : null}
    </>
  );
}

/** Most keywords one import takes; stats for them are fetched in one call. */
const MAX_IMPORT_KEYWORDS = 2000;

/**
 * One keyword per line. A pasted CSV keeps its first column, and a header
 * named "keyword" is skipped.
 */
function parseKeywordList(text: string): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const keyword = (line.split(/[,\t]/)[0] ?? "")
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .trim();
    const key = keyword.toLocaleLowerCase();
    if (!keyword || key === "keyword" || key === "keywords" || seen.has(key))
      continue;
    seen.add(key);
    keywords.push(keyword);
  }
  return keywords;
}

function ImportKeywordsDialog({
  isPending,
  onClose,
  onImport,
}: {
  isPending: boolean;
  onClose: () => void;
  onImport: (input: {
    keywords: string[];
    tag: string | null;
    fetchStats: boolean;
  }) => void;
}) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState("");
  const [fetchStats, setFetchStats] = useState(true);
  const listId = useId();
  const tagId = useId();
  const statsId = useId();

  const keywords = parseKeywordList(text);
  const tooMany = keywords.length > MAX_IMPORT_KEYWORDS;
  const canImport = !isPending && keywords.length > 0 && !tooMany;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import keywords</DialogTitle>
          <DialogDescription>
            Paste one keyword per line, or a CSV with keywords in the first
            column. They are saved for this project&apos;s country and language.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={listId}>Keywords</Label>
            <Textarea
              id={listId}
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={"best running shoes\nrunning shoes for flat feet"}
            />
            <p
              className={
                tooMany
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {tooMany
                ? `${keywords.length.toLocaleString()} keywords. Import up to ${MAX_IMPORT_KEYWORDS.toLocaleString()} at a time.`
                : `${keywords.length.toLocaleString()} keyword${keywords.length === 1 ? "" : "s"} to import`}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={tagId}>Tag (optional)</Label>
            <Input
              id={tagId}
              value={tag}
              maxLength={64}
              onChange={(event) => setTag(event.target.value)}
              placeholder="e.g. Client list"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id={statsId}
              checked={fetchStats}
              onCheckedChange={(checked) => setFetchStats(checked)}
            />
            <Label htmlFor={statsId} className="font-normal leading-snug">
              Fetch volume, difficulty, and CPC now. Each keyword uses credits.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            disabled={!canImport}
            onClick={() =>
              onImport({ keywords, tag: tag.trim() || null, fetchStats })
            }
          >
            {isPending ? "Importing..." : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

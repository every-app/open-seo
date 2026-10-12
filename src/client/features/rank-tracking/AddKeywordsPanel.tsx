import { useId, useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { addTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Label } from "@/client/components/ui/label";
import { Textarea } from "@/client/components/ui/textarea";

export function AddKeywordsPanel({
  configId,
  projectId,
  onSuccess,
  onCancel,
}: {
  configId: string;
  projectId: string;
  onSuccess: (result: {
    added: number;
    checkTriggered: boolean;
    checkScheduledSoon: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const matchCaseId = useId();
  const [keywordInput, setKeywordInput] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const mutation = useMutation({
    mutationFn: (kws: string[]) =>
      addTrackingKeywords({
        data: { projectId, configId, keywords: kws, matchCase },
      }),
    onSuccess: (result) => {
      setKeywordInput("");
      onSuccess(result);
    },
  });
  const isPending = mutation.isPending;
  return (
    <div className="flex items-end gap-2">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Textarea
          rows={3}
          // The field grows with its text; a long line must wrap, not widen the card.
          className="min-w-0"
          aria-label="Keywords to add"
          placeholder="Enter keywords, one per line"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
        />
        <div
          className="flex w-fit items-center gap-2"
          title="Track these keywords exactly as typed instead of lowercasing them. Google can return different results for a capitalized brand name."
        >
          <Checkbox
            id={matchCaseId}
            checked={matchCase}
            onCheckedChange={(checked) => setMatchCase(checked)}
          />
          <Label htmlFor={matchCaseId} className="text-xs font-normal">
            Match case
          </Label>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Button
          size="sm"
          pending={isPending}
          onClick={() => {
            const lines = keywordInput
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.some((l) => l.length > MAX_TRACKED_KEYWORD_LENGTH)) {
              toast.error(
                `Keywords must be ${MAX_TRACKED_KEYWORD_LENGTH} characters or fewer.`,
              );
              return;
            }
            if (lines.length > 0) mutation.mutate(lines);
          }}
          disabled={!keywordInput.trim()}
        >
          Add
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

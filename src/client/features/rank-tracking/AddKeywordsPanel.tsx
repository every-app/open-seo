import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { addTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { Loader2 } from "@/client/components/icons";

import { Button } from "@/client/components/ui/button";
import { Textarea } from "@/client/components/ui/textarea";
import { Checkbox } from "@/client/components/ui/checkbox";
export function AddKeywordsPanel({
  configId,
  projectId,
  onSuccess,
  onCancel,
}: {
  configId: string;
  projectId: string;
  onSuccess: (result: { added: number; checkTriggered: boolean }) => void;
  onCancel: () => void;
}) {
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
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "Failed to add keywords"));
    },
  });
  const isPending = mutation.isPending;
  return (
    <div className="flex gap-2 items-end">
      <div className="flex flex-col gap-1 flex-1">
        <Textarea
          className="w-full text-sm"
          rows={3}
          placeholder="Enter keywords, one per line"
          value={keywordInput}
          onChange={(e) => setKeywordInput(e.target.value)}
        />
        <label
          className="flex items-center gap-2 text-xs cursor-pointer w-fit"
          title="Track these keywords exactly as typed instead of lowercasing them. Google can return different results for a capitalized brand name."
        >
          <Checkbox
            checked={matchCase}
            onCheckedChange={(checked) => setMatchCase(checked)}
          />
          Match case
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <Button
          size="sm"
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
          disabled={isPending || !keywordInput.trim()}
        >
          {isPending && <Loader2 className="size-3 animate-spin" />}
          Add
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

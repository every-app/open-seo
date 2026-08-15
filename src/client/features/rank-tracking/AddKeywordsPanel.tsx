import { useState } from "react";
import { toast } from "sonner";
import { useMutation } from "@tanstack/react-query";
import { addTrackingKeywords } from "@/serverFunctions/rank-tracking";
import { MAX_TRACKED_KEYWORD_LENGTH } from "@/shared/rank-tracking";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import { Loader2 } from "lucide-react";

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
  const mutation = useMutation({
    mutationFn: (kws: string[]) =>
      addTrackingKeywords({ data: { projectId, configId, keywords: kws } }),
    onSuccess: (result) => {
      setKeywordInput("");
      onSuccess(result);
    },
    onError: (error) => {
      toast.error(getStandardErrorMessage(error, "关键词添加失败"));
    },
  });
  const isPending = mutation.isPending;
  return (
    <div className="flex gap-2 items-end">
      <textarea
        className="textarea textarea-bordered textarea-sm flex-1"
        rows={3}
        placeholder="输入关键词，每行一个"
        value={keywordInput}
        onChange={(e) => setKeywordInput(e.target.value)}
      />
      <div className="flex flex-col gap-1">
        <button
          className="btn btn-primary btn-sm"
          onClick={() => {
            const lines = keywordInput
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            if (lines.some((l) => l.length > MAX_TRACKED_KEYWORD_LENGTH)) {
              toast.error(
                `每个关键词最多可输入 ${MAX_TRACKED_KEYWORD_LENGTH} 个字符。`,
              );
              return;
            }
            if (lines.length > 0) mutation.mutate(lines);
          }}
          disabled={isPending || !keywordInput.trim()}
        >
          {isPending && <Loader2 className="size-3 animate-spin" />}
          添加
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

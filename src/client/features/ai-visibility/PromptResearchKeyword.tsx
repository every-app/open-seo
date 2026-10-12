import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import {
  TableBulkActionBar,
  TableBulkActionButton,
} from "@/client/components/table/TableBulkActionBar";
import { researchAiVisibilityPrompts } from "@/serverFunctions/ai-visibility";
import { normalizeAiSuggestion } from "@/shared/ai-prompt-suggestions";
import type { AiTrackerState } from "@/shared/ai-visibility";
import { PromptResearchTable } from "./PromptResearchTable";
import { TopicField } from "./TopicField";
import { TrackerPatchReview } from "./TrackerPatchReview";
import { AiQueryError, aiVisibilityKey } from "./shared";

export function PromptResearchKeyword({
  projectId,
  state,
  keyword,
}: {
  projectId: string;
  state: AiTrackerState;
  keyword: string;
}) {
  const queryClient = useQueryClient();
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  // The prompts to track and their topic, while the user reviews them.
  const [change, setChange] = useState<{
    prompts: string[];
    topic: string;
  } | null>(null);
  // The tracked prompts refresh tracked flags after any tracker edit. The
  // server reuses its cached provider response, so this costs no extra credits.
  const research = useQuery({
    queryKey: [
      ...aiVisibilityKey(projectId),
      "research",
      keyword,
      state.prompts.filter((prompt) => !prompt.archived).map(({ id }) => id),
    ],
    queryFn: () =>
      researchAiVisibilityPrompts({ data: { projectId, keyword } }),
    retry: false,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  // Table order, so the review lists prompts as the user sees them.
  const selected = (research.data?.prompts ?? [])
    .filter((prompt) => rowSelection[prompt.text])
    .map((prompt) => prompt.text);
  // Defaults to the saved topic that matches the keyword, else the keyword.
  const track = () =>
    setChange({
      prompts: selected,
      topic:
        state.topics.find(
          (name) =>
            normalizeAiSuggestion(name) === normalizeAiSuggestion(keyword),
        ) ?? keyword,
    });
  const topic = change?.topic.trim();
  return (
    <>
      <TableBulkActionBar
        selectedCount={selected.length}
        onClear={() => setRowSelection({})}
        actions={
          <div className="flex items-center px-1.5">
            <TableBulkActionButton
              icon={<Plus className="size-3.5" />}
              onClick={track}
            >
              Track prompts
            </TableBulkActionButton>
          </div>
        }
      />
      <PromptResearchTable
        prompts={research.data?.prompts ?? []}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        isLoading={research.isPending}
        error={
          research.isError ? (
            <AiQueryError
              error={research.error}
              retry={() => {
                void research.refetch();
              }}
            />
          ) : undefined
        }
        empty={{
          title: `No prompts found for “${keyword}”`,
          description: "Try a shorter, broader term.",
        }}
        toolbar={
          <div className="border-b px-4 py-3 border-border">
            <h2 className="font-medium">Prompts about “{keyword}”</h2>
          </div>
        }
      />
      {change && (
        <TrackerPatchReview
          projectId={projectId}
          state={state}
          patch={{
            prompts: change.prompts.map((text) => ({
              text,
              topic: topic || undefined,
            })),
          }}
          canSave={Boolean(topic)}
          onClose={() => setChange(null)}
          onSaved={(next) => {
            queryClient.setQueryData(
              [...aiVisibilityKey(projectId), "tracker"],
              next,
            );
            setChange(null);
            setRowSelection({});
          }}
        >
          <TopicField
            topics={state.topics}
            value={change.topic}
            onChange={(name) => setChange({ ...change, topic: name })}
          />
        </TrackerPatchReview>
      )}
    </>
  );
}

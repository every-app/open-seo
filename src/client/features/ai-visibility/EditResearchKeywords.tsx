import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { FormDialog } from "@/client/components/FormDialog";
import { useAppForm } from "@/client/components/form/useAppForm";
import {
  cleanKeywords,
  KeywordFields,
} from "@/client/components/KeywordFields";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { keywordSuggestionsQueryOptions } from "@/client/features/keywords/page/KeywordSuggestions";
import { updateAiResearchKeywords } from "@/serverFunctions/ai-visibility";
import { MAX_AI_RESEARCH_KEYWORDS } from "@/types/schemas/aiPromptResearch";
import { aiResearchKeywordsQueryOptions } from "./shared";

/** "Edit" button and dialog for the Relevant keywords list. */
export function EditResearchKeywordsButton({
  projectId,
  saved,
}: {
  projectId: string;
  /** The keywords the list holds besides the tracker's topics. */
  saved: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil data-icon="inline-start" />
        Edit
      </Button>
      {open ? (
        <EditResearchKeywordsDialog
          projectId={projectId}
          saved={saved}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function EditResearchKeywordsDialog({
  projectId,
  saved,
  onClose,
}: {
  projectId: string;
  saved: string[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    // Replacing every saved keyword keeps the order of the fields.
    mutationFn: (keywords: string[]) =>
      updateAiResearchKeywords({
        data: { projectId, remove: saved, add: keywords },
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(
        aiResearchKeywordsQueryOptions(projectId).queryKey,
        data,
      );
      // Keyword Research suggests the saved keywords too.
      void queryClient.invalidateQueries({
        queryKey: keywordSuggestionsQueryOptions(projectId).queryKey,
      });
      onClose();
    },
  });
  const form = useAppForm({
    defaultValues: { keywords: saved.length ? saved : [""] },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(cleanKeywords(value.keywords));
    },
  });
  return (
    <FormDialog
      title="Edit keywords"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="research-keywords"
            pending={save.isPending}
          >
            Save keywords
          </Button>
        </>
      }
    >
      <form.AppForm>
        <form.Form id="research-keywords" className="space-y-4">
          <form.Field name="keywords">
            {(field) => (
              <KeywordFields
                value={field.state.value}
                onChange={field.handleChange}
                label="Keywords"
                description="Topics from your tracker are always listed and aren't edited here."
                placeholder="e.g. running shoes"
                max={MAX_AI_RESEARCH_KEYWORDS}
                maxLength={100}
              />
            )}
          </form.Field>
        </form.Form>
      </form.AppForm>
      {save.isError && (
        <QueryError
          error={save.error}
          fallback="Could not save these keywords."
        />
      )}
    </FormDialog>
  );
}

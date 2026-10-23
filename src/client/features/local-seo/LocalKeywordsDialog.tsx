import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revalidateLogic } from "@tanstack/react-form";
import { z } from "zod";
import { FormDialog } from "@/client/components/FormDialog";
import { useAppForm } from "@/client/components/form/useAppForm";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import { updateLocalKeywords } from "@/serverFunctions/local-seo";
import { localKeywordsSchema } from "@/types/schemas/local-seo";

export const localKeywordsTextSchema = z
  .string()
  .refine(
    (value) => localKeywordsSchema.safeParse(parseKeywordInput(value)).success,
    "Enter up to 20 keywords, up to 120 characters each.",
  );

export function LocalKeywordsDialog({
  projectId,
  trackerId,
  keywords,
  onClose,
}: {
  projectId: string;
  trackerId: string;
  keywords: { keyword: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (terms: string[]) =>
      updateLocalKeywords({ data: { projectId, trackerId, keywords: terms } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["localSeo", projectId],
      });
      onClose();
    },
  });
  const form = useAppForm({
    defaultValues: { keywords: keywords.map((row) => row.keyword).join("\n") },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: z.object({ keywords: localKeywordsTextSchema }),
    },
    onSubmit: async ({ value }) => {
      await save.mutateAsync(parseKeywordInput(value.keywords));
    },
  });
  return (
    <FormDialog
      title="Manage keywords"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="local-keywords" pending={save.isPending}>
            Save keywords
          </Button>
        </>
      }
    >
      <form.AppForm>
        <form.Form id="local-keywords" className="space-y-4">
          <form.AppField name="keywords">
            {(field) => (
              <field.TextareaField
                label="Keywords to track"
                placeholder="One keyword per line"
                rows={6}
                description="Add, change, or remove search terms here. Each ranking check searches every keyword at each grid point. Saved results for removed terms are kept."
              />
            )}
          </form.AppField>
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

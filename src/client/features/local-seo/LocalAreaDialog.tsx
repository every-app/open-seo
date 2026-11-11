import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormDialog } from "@/client/components/FormDialog";
import { useAppForm } from "@/client/components/form/useAppForm";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { updateLocalArea } from "@/serverFunctions/local-seo";
import {
  LOCAL_AREA_ITEMS,
  LOCAL_AREAS,
  localAreaOf,
  type LocalArea,
} from "./localAreas";

export function LocalAreaDialog({
  projectId,
  tracker,
  onClose,
}: {
  projectId: string;
  tracker: { id: string; gridSize: number; spacingKm: number };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const current = localAreaOf(tracker);
  const save = useMutation({
    mutationFn: (area: LocalArea) =>
      updateLocalArea({
        data: {
          projectId,
          trackerId: tracker.id,
          gridSize: LOCAL_AREAS[area].gridSize,
          spacingKm: LOCAL_AREAS[area].spacingKm,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["localSeo", projectId],
      });
      onClose();
    },
  });
  const form = useAppForm({
    defaultValues: { area: current },
    onSubmit: async ({ value }) => {
      // Save is disabled until an area is picked.
      if (value.area) await save.mutateAsync(value.area);
    },
  });
  return (
    <FormDialog
      title="Change area"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" disabled={save.isPending} onClick={onClose}>
            Cancel
          </Button>
          <form.Subscribe selector={(state) => state.values.area}>
            {(area) => (
              <Button
                type="submit"
                form="local-area"
                pending={save.isPending}
                disabled={area === current}
              >
                Save area
              </Button>
            )}
          </form.Subscribe>
        </>
      }
    >
      <form.AppForm>
        <form.Form id="local-area">
          <form.AppField name="area">
            {(field) => (
              <field.SelectField
                label="Area to check"
                description="New checks search this area. Earlier results are kept."
                items={LOCAL_AREA_ITEMS}
              />
            )}
          </form.AppField>
        </form.Form>
      </form.AppForm>
      {save.isError && (
        <QueryError error={save.error} fallback="Could not save this area." />
      )}
    </FormDialog>
  );
}

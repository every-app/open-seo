import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormDialog } from "@/client/components/FormDialog";
import { useAppForm } from "@/client/components/form/useAppForm";
import { QueryError } from "@/client/components/QueryState";
import { Button } from "@/client/components/ui/button";
import { updateLocalArea } from "@/serverFunctions/local-seo";
import { LocalCenterField } from "./LocalCenterField";
import type { LocalCenter } from "./LocalCenterMap";
import {
  LOCAL_AREAS,
  localAreaItems,
  localAreaOf,
  type LocalArea,
} from "./localAreas";
import { useDistanceUnit } from "./useDistanceUnit";

export function LocalAreaDialog({
  projectId,
  tracker,
  onClose,
}: {
  projectId: string;
  tracker: {
    id: string;
    gridSize: number;
    spacingKm: number;
    latitude: number;
    longitude: number;
  };
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const unit = useDistanceUnit();
  const current = {
    area: localAreaOf(tracker),
    center: { latitude: tracker.latitude, longitude: tracker.longitude },
  };
  const save = useMutation({
    mutationFn: (value: { area: LocalArea; center: LocalCenter }) =>
      updateLocalArea({
        data: {
          projectId,
          trackerId: tracker.id,
          gridSize: LOCAL_AREAS[value.area].gridSize,
          spacingKm: LOCAL_AREAS[value.area].spacingKm,
          ...value.center,
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
    defaultValues: current,
    onSubmit: async ({ value }) => {
      // Save is disabled until an area is picked.
      if (value.area) await save.mutateAsync({ ...value, area: value.area });
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
          <form.Subscribe
            selector={(state) => !state.values.area || state.isDefaultValue}
          >
            {(disabled) => (
              <Button
                type="submit"
                form="local-area"
                pending={save.isPending}
                disabled={disabled}
              >
                Save area
              </Button>
            )}
          </form.Subscribe>
        </>
      }
    >
      <form.AppForm>
        <form.Form id="local-area" className="space-y-4">
          <form.AppField name="area">
            {(field) => (
              <field.SelectField
                label="Area to check"
                description="New checks search this area. Earlier results are kept."
                items={localAreaItems(unit)}
              />
            )}
          </form.AppField>
          <form.Subscribe selector={(state) => state.values.area}>
            {(area) => (
              <form.Field name="center">
                {(field) => (
                  <LocalCenterField
                    projectId={projectId}
                    center={field.state.value}
                    // A grid saved before areas existed shows as it is until
                    // an area is picked.
                    grid={area ? LOCAL_AREAS[area] : tracker}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
            )}
          </form.Subscribe>
        </form.Form>
      </form.AppForm>
      {save.isError && (
        <QueryError error={save.error} fallback="Could not save this area." />
      )}
    </FormDialog>
  );
}

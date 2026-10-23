import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { QueryError } from "@/client/components/QueryState";
import {
  createLocalTracker,
  lookupLocalBusiness,
} from "@/serverFunctions/local-seo";
import { parseKeywordInput } from "@/client/features/keywords/state/keywordControllerActions";
import type { LocalBusiness } from "@/types/schemas/local-seo";
import { localKeywordsTextSchema } from "./LocalKeywordsDialog";

export function LocalTrackerDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [business, setBusiness] = useState<LocalBusiness | null>(null);
  return business ? (
    <TrackerSettings
      projectId={projectId}
      business={business}
      onClose={onClose}
      onCreated={onCreated}
    />
  ) : (
    <ListingLookup
      projectId={projectId}
      onClose={onClose}
      onSelect={setBusiness}
    />
  );
}

function ListingLookup({
  projectId,
  onClose,
  onSelect,
}: {
  projectId: string;
  onClose: () => void;
  onSelect: (business: LocalBusiness) => void;
}) {
  const lookup = useMutation({
    mutationFn: (query: string) =>
      lookupLocalBusiness({ data: { projectId, query } }),
  });
  const form = useAppForm({
    defaultValues: { query: "" },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: z.object({
        query: z
          .string()
          .trim()
          .min(2, "Enter a business name and city.")
          .max(200),
      }),
    },
    onSubmit: async ({ value }) => {
      await lookup.mutateAsync(value.query);
    },
  });
  return (
    <FormDialog
      title="Add business"
      onClose={onClose}
      actions={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="local-business-lookup"
            pending={lookup.isPending}
          >
            Find listing
          </Button>
        </>
      }
    >
      <form.AppForm>
        <form.Form id="local-business-lookup" className="space-y-4">
          <form.AppField name="query">
            {(field) => (
              <field.TextField
                label="Business name and city"
                placeholder="Business name, street, city"
                description="Finding a listing uses a small amount of credits."
              />
            )}
          </form.AppField>
        </form.Form>
      </form.AppForm>
      {lookup.isError && (
        <QueryError
          error={lookup.error}
          fallback="Could not find this business."
        />
      )}
      {lookup.isSuccess &&
        (lookup.data ? (
          <div className="space-y-3 rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">{lookup.data.title}</p>
              <p className="text-sm text-muted-foreground">
                {lookup.data.address}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Confirm this is the correct branch before continuing.
            </p>
            <Button
              size="sm"
              onClick={() => {
                if (lookup.data) onSelect(lookup.data);
              }}
            >
              Use this listing
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No matching listing found. Try the business name and full address.
          </p>
        ))}
    </FormDialog>
  );
}

const settingsSchema = z.object({
  keywords: localKeywordsTextSchema,
  gridSize: z.union([z.literal(3), z.literal(5)]),
  spacingKm: z
    .string()
    .refine(
      (value) =>
        value.trim() !== "" && Number(value) >= 0.25 && Number(value) <= 10,
      "Enter a spacing between 0.25 and 10 km.",
    ),
});

function TrackerSettings({
  projectId,
  business,
  onClose,
  onCreated,
}: {
  projectId: string;
  business: LocalBusiness;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (input: Parameters<typeof createLocalTracker>[0]["data"]) =>
      createLocalTracker({ data: input }),
    onSuccess: (tracker) => {
      void queryClient.invalidateQueries({ queryKey: ["localSeo", projectId] });
      onCreated(tracker.id);
    },
  });
  const form = useAppForm({
    defaultValues: {
      keywords: "",
      gridSize: 3 as 3 | 5,
      spacingKm: "2",
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: settingsSchema },
    onSubmit: async ({ value }) => {
      await create.mutateAsync({
        projectId,
        business,
        keywords: parseKeywordInput(value.keywords),
        gridSize: value.gridSize,
        spacingKm: Number(value.spacingKm),
      });
    },
  });
  return (
    <FormDialog
      title="Set up local tracking"
      onClose={onClose}
      actions={
        <>
          <Button
            variant="outline"
            disabled={create.isPending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="local-tracker-settings"
            pending={create.isPending}
          >
            Save business
          </Button>
        </>
      }
    >
      <div>
        <p className="text-sm font-medium">{business.title}</p>
        <p className="text-sm text-muted-foreground">{business.address}</p>
      </div>
      <form.AppForm>
        <form.Form id="local-tracker-settings" className="space-y-4">
          <form.AppField name="keywords">
            {(field) => (
              <field.TextareaField
                label="Keywords to track (optional)"
                placeholder="One keyword per line"
                rows={3}
                description="Enter the searches customers use to find this business. You can manage this list after saving."
              />
            )}
          </form.AppField>
          <div className="grid grid-cols-2 gap-3">
            <form.AppField name="gridSize">
              {(field) => (
                <field.SelectField
                  label="Grid size"
                  items={[
                    { value: 3, label: "3×3 · 9 points" },
                    { value: 5, label: "5×5 · 25 points" },
                  ]}
                />
              )}
            </form.AppField>
            <form.AppField name="spacingKm">
              {(field) => (
                <field.TextField
                  label="Spacing (km)"
                  type="number"
                  min="0.25"
                  max="10"
                  step="0.25"
                />
              )}
            </form.AppField>
          </div>
          <p className="text-xs text-muted-foreground">
            The grid is centered on this listing’s pin. Saving does not start a
            ranking check.
          </p>
        </form.Form>
      </form.AppForm>
      {create.isError && (
        <QueryError
          error={create.error}
          fallback="Could not save this business."
        />
      )}
    </FormDialog>
  );
}

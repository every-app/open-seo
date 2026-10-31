import { lazy, Suspense, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { revalidateLogic } from "@tanstack/react-form";
import { useAppForm } from "@/client/components/form/useAppForm";
import { FormDialog } from "@/client/components/FormDialog";
import { Button } from "@/client/components/ui/button";
import { Skeleton } from "@/client/components/ui/skeleton";
import { QueryError } from "@/client/components/QueryState";
import {
  createLocalTracker,
  lookupLocalBusiness,
} from "@/serverFunctions/local-seo";
import { SerpLocationCombobox } from "@/client/components/SerpLocationCombobox";
import { usePrewarmSerpLocations } from "@/client/components/usePrewarmSerpLocations";
import { Field, FieldError, FieldLabel } from "@/client/components/ui/field";
import { useProjectMarket } from "@/client/features/projects/useProjectMarket";
import { getIsoCountryCode } from "@/shared/keyword-locations";
import { cleanKeywords, LocalKeywordFields } from "./LocalKeywordFields";
import { LocalListingChoices, type Listing } from "./LocalListingChoices";

const ListingMap = lazy(() => import("./LocalListingMap"));

export function LocalTrackerDialog({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  return listing ? (
    <TrackerSettings
      projectId={projectId}
      listing={listing}
      onClose={onClose}
      onCreated={onCreated}
    />
  ) : (
    <ListingLookup
      projectId={projectId}
      onClose={onClose}
      onSelect={setListing}
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
  onSelect: (listing: Listing) => void;
}) {
  const market = useProjectMarket(projectId);
  const countryCode = market ? getIsoCountryCode(market.locationCode) : "us";
  usePrewarmSerpLocations(countryCode, Boolean(market));
  const [selected, setSelected] = useState(0);
  const lookup = useMutation({
    mutationFn: (data: { query: string; locationName: string }) =>
      lookupLocalBusiness({ data: { projectId, ...data } }),
    // A single match needs no picking, so setup opens straight away.
    onSuccess: (found) => {
      setSelected(0);
      if (found.length === 1) onSelect(found[0]);
    },
  });
  const form = useAppForm({
    defaultValues: { query: "", locationName: "" },
    validationLogic: revalidateLogic(),
    validators: {
      onDynamic: z.object({
        query: z.string().trim().min(2, "Enter the business name.").max(200),
        locationName: z.string().min(1, "Pick the city the business is in."),
      }),
    },
    onSubmit: async ({ value }) => {
      await lookup.mutateAsync(value);
    },
  });
  const listings = lookup.data && lookup.data.length > 1 ? lookup.data : null;
  return (
    <FormDialog
      title="Add business"
      onClose={onClose}
      wide={Boolean(listings)}
      actions={
        listings ? (
          <>
            <Button variant="outline" onClick={() => lookup.reset()}>
              Search again
            </Button>
            <Button onClick={() => onSelect(listings[selected])}>
              Use this listing
            </Button>
          </>
        ) : (
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
        )
      }
    >
      {listings ? (
        <div className="grid gap-4 md:grid-cols-2">
          <LocalListingChoices
            listings={listings}
            selected={selected}
            onSelectedChange={setSelected}
          />
          <div className="min-h-80 overflow-hidden rounded-lg border border-border">
            <Suspense fallback={<Skeleton className="h-full rounded-none" />}>
              <ListingMap
                projectId={projectId}
                listings={listings}
                selected={selected}
                onSelectedChange={setSelected}
              />
            </Suspense>
          </div>
        </div>
      ) : (
        <form.AppForm>
          <form.Form id="local-business-lookup" className="space-y-4">
            <form.AppField name="query">
              {(field) => (
                <field.TextField
                  label="Business name"
                  placeholder="e.g. Joe's Pizza"
                />
              )}
            </form.AppField>
            <form.Field name="locationName">
              {(field) => {
                const error = field.state.meta.errors[0]?.message;
                return (
                  <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor="local-business-city">City</FieldLabel>
                    <SerpLocationCombobox
                      id="local-business-city"
                      value={field.state.value || undefined}
                      onChange={(value) => field.handleChange(value ?? "")}
                      countryCode={countryCode}
                      invalid={Boolean(error)}
                    />
                    {error ? <FieldError>{error}</FieldError> : null}
                  </Field>
                );
              }}
            </form.Field>
          </form.Form>
        </form.AppForm>
      )}
      {lookup.isPending && (
        <p className="text-sm text-muted-foreground">
          Searching Google Maps. This usually takes a few seconds.
        </p>
      )}
      {lookup.isError && (
        <QueryError
          title="Could not look up this business"
          cause={lookup.error}
          fallback="Please try again in a moment."
        />
      )}
      {lookup.isSuccess && lookup.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No Google Maps listing found. Check the name matches the listing and
          the city is right.
        </p>
      )}
    </FormDialog>
  );
}

// Grid size and spacing as the area a customer would recognize. The width is
// (gridSize - 1) × spacing, and each point is one paid search per keyword.
const AREAS = {
  neighborhood: {
    label: "Neighborhood · 2 km wide · 9 points",
    gridSize: 3,
    spacingKm: 1,
  },
  town: { label: "Town · 4 km wide · 9 points", gridSize: 3, spacingKm: 2 },
  city: { label: "City · 8 km wide · 25 points", gridSize: 5, spacingKm: 2 },
  metro: {
    label: "Metro area · 20 km wide · 25 points",
    gridSize: 5,
    spacingKm: 5,
  },
} as const;
type Area = keyof typeof AREAS;

function TrackerSettings({
  projectId,
  listing,
  onClose,
  onCreated,
}: {
  projectId: string;
  listing: Listing;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { business, suggestedKeywords } = listing;
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
      keywords: suggestedKeywords.length ? suggestedKeywords : [""],
      area: "town" as Area,
    },
    onSubmit: async ({ value }) => {
      const area = AREAS[value.area];
      await create.mutateAsync({
        projectId,
        business,
        keywords: cleanKeywords(value.keywords),
        gridSize: area.gridSize,
        spacingKm: area.spacingKm,
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
          <form.Field name="keywords">
            {(field) => (
              <LocalKeywordFields
                value={field.state.value}
                onChange={field.handleChange}
              />
            )}
          </form.Field>
          <form.AppField name="area">
            {(field) => (
              <field.SelectField
                label="Area to check"
                description="We search Google Maps from points spread across this area, centered on your listing."
                items={Object.entries(AREAS).map(([value, { label }]) => ({
                  value,
                  label,
                }))}
              />
            )}
          </form.AppField>
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

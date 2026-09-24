import { useQuery } from "@tanstack/react-query";
import { SerpLocationCombobox } from "@/client/components/SerpLocationCombobox";
import { prewarmSerpLocations } from "@/serverFunctions/serp-locations";

import { Field } from "@/client/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/client/components/ui/radio-group";
import { Label } from "@/client/components/ui/label";
type TargetingMode = "national" | "local";

export function SearchTargetingField({
  mode,
  onModeChange,
  locationName,
  onLocationNameChange,
  countryCode,
}: {
  mode: TargetingMode;
  onModeChange: (mode: TargetingMode) => void;
  locationName: string | undefined;
  onLocationNameChange: (locationName: string | undefined) => void;
  countryCode: string;
}) {
  // Warm the server-side location cache the moment Local targeting is in
  // play, so the country list is hot before the first keystroke. Best-effort:
  // a failed warm just means the first search is slower, so no retries, and
  // staleTime keeps one warm per country per session.
  useQuery({
    queryKey: ["serp-locations-prewarm", countryCode],
    queryFn: () => prewarmSerpLocations({ data: { countryCode } }),
    enabled: mode === "local",
    staleTime: Infinity,
    retry: false,
  });
  return (
    <Field>
      <Label>Search Targeting</Label>
      <RadioGroup
        value={mode}
        onValueChange={(value) => {
          if (value === "national") {
            onModeChange("national");
            onLocationNameChange(undefined);
          } else if (value === "local") {
            onModeChange("local");
          }
        }}
        className="flex gap-4"
        aria-label="Search targeting"
      >
        <label className="flex cursor-pointer items-center gap-2">
          <RadioGroupItem value="national" />
          <span className="text-sm">National</span>
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <RadioGroupItem value="local" />
          <span className="text-sm">Local</span>
        </label>
      </RadioGroup>
      <p className="text-xs text-muted-foreground/70 mt-1.5">
        {mode === "local" ? (
          <>
            <span className="text-success font-medium">Best for:</span> "near
            me" queries, city/county keywords, service-area pages.
          </>
        ) : (
          <>
            Local targeting can understate rankings for non-geo-modified terms.
          </>
        )}
      </p>
      {mode === "local" && (
        <div className="mt-2">
          <SerpLocationCombobox
            value={locationName}
            onChange={onLocationNameChange}
            countryCode={countryCode}
            placeholder="Search cities..."
          />
        </div>
      )}
    </Field>
  );
}

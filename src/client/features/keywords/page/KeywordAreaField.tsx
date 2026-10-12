import { useState } from "react";
import { SerpLocationCombobox } from "@/client/components/SerpLocationCombobox";
import { usePrewarmSerpLocations } from "@/client/components/usePrewarmSerpLocations";
import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { LOCAL_VOLUME_COST_USD, applyBillingMarkupUsd } from "@/shared/billing";
import { getIsoCountryCode } from "@/shared/keyword-locations";

type Props = {
  locationCode: number;
  value: string | undefined;
  onChange: (locationName: string | undefined) => void;
};

/**
 * Optional city, county, or region inside the selected country. Empty means
 * national volume. The location list is warmed on first focus, so page views
 * that never use the field cost nothing.
 */
export function KeywordAreaField({ locationCode, value, onChange }: Props) {
  const [focused, setFocused] = useState(false);
  const countryCode = getIsoCountryCode(locationCode);
  usePrewarmSerpLocations(countryCode, focused);

  return (
    <div
      className="col-span-2 w-full lg:w-44 lg:shrink-0"
      onFocus={() => setFocused(true)}
      title="Get search volume for one city, county, or region. Leave empty for the whole country."
    >
      <SerpLocationCombobox
        value={value}
        onChange={onChange}
        countryCode={countryCode}
        placeholder="City (optional)"
      />
    </div>
  );
}

/**
 * The extra Google Ads lookup a local search makes. Hosted users pay the
 * marked-up price; self-hosted deployments pay DataForSEO directly.
 */
export function LocalVolumeCostNote() {
  const costUsd = isHostedClientAuthMode()
    ? applyBillingMarkupUsd(LOCAL_VOLUME_COST_USD)
    : LOCAL_VOLUME_COST_USD;
  return (
    <span className="text-xs text-muted-foreground">
      Local volume adds ~${costUsd.toFixed(2)} per search.
    </span>
  );
}

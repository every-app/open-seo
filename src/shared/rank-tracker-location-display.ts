import {
  formatLocationLabel,
  getIsoCountryCode,
  LOCATIONS,
} from "@/shared/keyword-locations";

export function isoCountryCodeToFlagEmoji(isoCountryCode: string): string {
  const code = isoCountryCode.toUpperCase();
  if (code.length !== 2 || !/^[A-Z]{2}$/.test(code)) return "";
  return [...code]
    .map((char) => String.fromCodePoint(127397 + char.charCodeAt(0)))
    .join("");
}

export function rankTrackerLocationDisplay(input: {
  locationCode: number;
  locationName: string | null;
}): { label: string; flag: string } {
  const label = input.locationName
    ? formatLocationLabel(input.locationName, 2)
    : (LOCATIONS[input.locationCode] ?? String(input.locationCode));
  const flag = isoCountryCodeToFlagEmoji(getIsoCountryCode(input.locationCode));
  return { label, flag };
}

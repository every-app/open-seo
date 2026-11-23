export enum DistanceUnit {
  Km = "km",
  Mi = "mi",
}

const KM_PER_MILE = 1.609344;
const US_LOCATION_CODE = 2840;

/** The app's unit for a user who hasn't picked one. `country` is Cloudflare's
 *  CF-IPCountry: visitors in the US read miles, everyone else km. */
export function distanceUnitForCountry(country: string | null) {
  return country === "US" ? DistanceUnit.Mi : DistanceUnit.Km;
}

/** The MCP's unit for a user who hasn't picked one. Agents call from their
 *  host's servers, so the project's market stands in for the user's country. */
export function distanceUnitForMarket(locationCode: number) {
  return locationCode === US_LOCATION_CODE ? DistanceUnit.Mi : DistanceUnit.Km;
}

/** A distance stored in km, written in the unit, e.g. "2.5 mi" or "4 km". */
export function formatDistance(km: number, unit: DistanceUnit) {
  const value =
    unit === DistanceUnit.Mi ? (km / KM_PER_MILE).toFixed(1) : km.toFixed(2);
  return `${Number(value)} ${unit}`;
}

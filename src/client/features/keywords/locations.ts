// Location data lives in shared/ so the server can route keyword research by
// provider (Labs vs Google Ads). This shim keeps existing client imports.
import {
  DEFAULT_LOCATION_CODE as SHARED_DEFAULT_LOCATION_CODE,
  isSupportedLocationCode,
} from "@/shared/keyword-locations";

export {
  LABS_LOCATION_OPTIONS,
  LOCATIONS,
  getLanguageCode,
  getLanguageOptions,
  isLabsLocationCode,
  isSupportedLocationCode,
} from "@/shared/keyword-locations";

// A deployment serving another market can bake VITE_DEFAULT_LOCATION_CODE
// (e.g. 2704 Vietnam) into the client bundle; the per-browser preference in
// usePreferredKeywordLocation still wins once the user picks a location.
const envDefaultLocationCode = Number(
  import.meta.env.VITE_DEFAULT_LOCATION_CODE ?? "",
);

export const DEFAULT_LOCATION_CODE =
  Number.isInteger(envDefaultLocationCode) &&
  isSupportedLocationCode(envDefaultLocationCode)
    ? envDefaultLocationCode
    : SHARED_DEFAULT_LOCATION_CODE;

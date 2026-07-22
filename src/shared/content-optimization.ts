// The 27 Google SERP regions the On-Page.ai scan API accepts
// (GET https://api.on-page.ai/v1/regions). Shared between the client form,
// the server functions, and the MCP tools so the option lists stay in sync.
export const CONTENT_SCAN_REGIONS = [
  "US",
  "CA",
  "UK",
  "AU",
  "NZ",
  "ES",
  "DE",
  "IT",
  "FR",
  "IE",
  "NL",
  "CH",
  "SE",
  "NO",
  "DK",
  "FI",
  "ZA",
  "MX",
  "BR",
  "CO",
  "IN",
  "SG",
  "MY",
  "JP",
  "KE",
  "AE",
  "HK",
] as const;

export type ContentScanRegion = (typeof CONTENT_SCAN_REGIONS)[number];

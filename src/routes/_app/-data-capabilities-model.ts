import type { ProviderCapabilityStatus } from "@/server/lib/provider-status";

export type DataCapabilityRow = ProviderCapabilityStatus & {
  status: "Enabled" | "Unavailable";
  providerCopy: "Local" | "Google Search Console" | "Optional paid provider";
  showPaidProviderHelp: boolean;
};

const kindOrder: Record<ProviderCapabilityStatus["kind"], number> = {
  local: 0,
  first_party: 1,
  paid: 2,
};

const providerCopy: Record<
  ProviderCapabilityStatus["provider"],
  DataCapabilityRow["providerCopy"]
> = {
  local: "Local",
  google_search_console: "Google Search Console",
  dataforseo: "Optional paid provider",
};

export function buildDataCapabilitiesModel(
  capabilities: ProviderCapabilityStatus[],
): DataCapabilityRow[] {
  return capabilities
    .map((capability) => ({
      ...capability,
      status: capability.enabled ? ("Enabled" as const) : ("Unavailable" as const),
      providerCopy: providerCopy[capability.provider],
      showPaidProviderHelp:
        capability.kind === "paid" && !capability.enabled,
    }))
    .sort((left, right) => kindOrder[left.kind] - kindOrder[right.kind]);
}

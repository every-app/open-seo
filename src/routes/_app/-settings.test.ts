import { describe, expect, it } from "vitest";
import { buildDataCapabilitiesModel } from "./-data-capabilities-model";

const capabilities = [
  {
    id: "site_audit_lighthouse" as const,
    label: "Lighthouse reports",
    provider: "dataforseo" as const,
    kind: "paid" as const,
    configured: false,
    enabled: false,
    reason: "Paid research is disabled by default.",
  },
  {
    id: "site_audit_crawl" as const,
    label: "Site audit crawl",
    provider: "local" as const,
    kind: "local" as const,
    configured: true,
    enabled: true,
    reason: null,
  },
  {
    id: "gsc_performance" as const,
    label: "Search Console performance",
    provider: "google_search_console" as const,
    kind: "first_party" as const,
    configured: false,
    enabled: false,
    reason: "Connect Google Search Console to enable this capability.",
  },
];

describe("Settings data capabilities", () => {
  it("puts working free capabilities before optional paid capabilities", () => {
    const model = buildDataCapabilitiesModel(capabilities);

    expect(model.map(({ id }) => id)).toEqual([
      "site_audit_crawl",
      "gsc_performance",
      "site_audit_lighthouse",
    ]);
    expect(model[0]).toMatchObject({ status: "Enabled", reason: null });
    expect(model[1]).toMatchObject({
      status: "Unavailable",
      reason: "Connect Google Search Console to enable this capability.",
    });
    expect(model[2]).toMatchObject({
      status: "Unavailable",
      providerCopy: "Optional paid provider",
      showPaidProviderHelp: true,
    });
  });
});
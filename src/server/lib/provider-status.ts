import { hasSelfHostedGscConfig } from "@/server/features/gsc/oauth-config";
import { getDataforseoProviderStatus } from "@/server/lib/provider-config";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

export type ProviderMode = "hosted" | "self-hosted";

export type ProviderStatusItem = {
  provider: "dataforseo" | "google_search_console" | "site_audit";
  kind: "paid" | "first_party" | "local";
  configured: boolean;
  enabled: boolean;
  reason: string | null;
  notes?: string[];
  budgetUsd?: number;
  hasApiKey?: boolean;
};

export type ProviderStatusSummary = {
  mode: ProviderMode;
  providers: ProviderStatusItem[];
};

export async function getProviderStatusSummary(): Promise<ProviderStatusSummary> {
  const [isHosted, dataforseo, gscConfigured] = await Promise.all([
    isHostedServerAuthMode(),
    getDataforseoProviderStatus(),
    hasSelfHostedGscConfig(),
  ]);

  const mode: ProviderMode = isHosted ? "hosted" : "self-hosted";

  return {
    mode,
    providers: [
      {
        provider: "dataforseo",
        kind: "paid",
        configured: dataforseo.configured,
        enabled: dataforseo.enabled,
        reason: dataforseo.reason,
        budgetUsd: dataforseo.budgetUsd,
        hasApiKey: dataforseo.hasApiKey,
        notes: [
          "Paid provider for keyword, SERP, backlinks, and related external SEO data.",
          "LedgerPe self-hosting keeps this disabled by default until explicitly enabled with a non-zero budget.",
        ],
      },
      {
        provider: "google_search_console",
        kind: "first_party",
        configured: isHosted || gscConfigured,
        enabled: isHosted || gscConfigured,
        reason:
          isHosted || gscConfigured
            ? null
            : "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and BETTER_AUTH_SECRET to enable Search Console OAuth.",
        notes: [
          "First-party Google Search Console data: clicks, impressions, CTR, position, and URL inspection.",
        ],
      },
      {
        provider: "site_audit",
        kind: "local",
        configured: true,
        enabled: true,
        reason: null,
        notes: [
          "Local crawler and audit workflows run inside OpenSEO and do not require a paid SEO provider.",
        ],
      },
    ],
  };
}

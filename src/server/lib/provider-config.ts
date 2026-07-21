import { AppError } from "@/server/lib/errors";

export type DataforseoProviderStatus = {
  provider: "dataforseo";
  configured: boolean;
  enabled: boolean;
  hasApiKey: boolean;
  budgetUsd: number;
  reason: string | null;
};

function parseEnabledFlag(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function parseBudgetUsd(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function readProcessEnv(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env?.[name];
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function getDataforseoProviderStatus(): Promise<DataforseoProviderStatus> {
  const apiKey = readProcessEnv("DATAFORSEO_API_KEY")?.trim();
  const enabled = parseEnabledFlag(
    readProcessEnv("OPENSEO_ENABLE_DATAFORSEO")?.trim(),
  );
  const budgetUsd = parseBudgetUsd(
    readProcessEnv("OPENSEO_DATAFORSEO_BUDGET_USD")?.trim(),
  );
  const hasApiKey = Boolean(apiKey);

  if (!hasApiKey && !enabled && budgetUsd <= 0) {
    return {
      provider: "dataforseo",
      configured: false,
      enabled: false,
      hasApiKey: false,
      budgetUsd: 0,
      reason: "Provider not configured. DataForSEO is disabled by default.",
    };
  }

  if (!enabled) {
    return {
      provider: "dataforseo",
      configured: false,
      enabled: false,
      hasApiKey,
      budgetUsd,
      reason: "Set OPENSEO_ENABLE_DATAFORSEO=1 to allow paid DataForSEO calls.",
    };
  }

  if (budgetUsd <= 0) {
    return {
      provider: "dataforseo",
      configured: false,
      enabled: false,
      hasApiKey,
      budgetUsd: 0,
      reason:
        "Set OPENSEO_DATAFORSEO_BUDGET_USD to a value greater than 0 to allow paid DataForSEO calls.",
    };
  }

  if (!hasApiKey) {
    return {
      provider: "dataforseo",
      configured: false,
      enabled: true,
      hasApiKey: false,
      budgetUsd,
      reason:
        "Set DATAFORSEO_API_KEY after enabling the provider and assigning a non-zero budget.",
    };
  }

  return {
    provider: "dataforseo",
    configured: true,
    enabled: true,
    hasApiKey: true,
    budgetUsd,
    reason: null,
  };
}

export async function assertDataforseoConfigured(): Promise<DataforseoProviderStatus> {
  const status = await getDataforseoProviderStatus();
  if (status.configured) return status;

  throw new AppError(
    "PROVIDER_NOT_CONFIGURED",
    status.reason ?? "Provider not configured.",
    {
      provider: status.provider,
      providerEnabled: String(status.enabled),
      providerBudgetUsd: status.budgetUsd.toString(),
      hasApiKey: String(status.hasApiKey),
    },
  );
}

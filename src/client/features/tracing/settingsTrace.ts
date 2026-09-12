import { traceServerCall } from "./traceServerCall";
import type {
  AiConnectionResult,
  AiModel,
} from "@/server/features/ai/providers";
import type { AiProviderId } from "@/server/features/ai/providerIds";
import type {
  DataforseoConnectionTestResult,
  DataforseoApiStatusResult,
} from "@/server/features/settings/services/DataforseoSettingsService";

// Concise, secret-safe presets for Settings executions. Callers pass only
// safe metadata (scopes, flags, counts); credentials and raw values stay out.
interface SettingsCallInput<T> {
  operation: string;
  source: string;
  projectId?: string;
  endpoint: string;
  metadata?: Record<string, unknown>;
  counters?: Record<string, number>;
  call: () => Promise<T>;
  mapSuccess?: (result: T) => Record<string, unknown>;
}

function internalProvider(endpoint: string) {
  return [
    {
      provider: "Internal",
      endpoint,
      httpStatus: 200,
      billing: "Free" as const,
      metered: false,
    },
  ];
}

export function traceSettingsRead<T>(input: SettingsCallInput<T>): Promise<T> {
  return traceServerCall<T>({
    feature: "settings",
    operation: input.operation,
    source: input.source,
    projectId: input.projectId,
    metadata: input.metadata,
    call: input.call,
    mapSuccess: (result) => ({
      status: "success",
      httpStatus: 200,
      billing: "Free" as const,
      metered: false,
      cache: "Not applicable" as const,
      retry: { attempted: false, count: 0 },
      providers: internalProvider(input.endpoint),
      providerCalls: 1,
      counters: input.counters,
      metadata: { ...input.metadata, ...input.mapSuccess?.(result) },
    }),
  });
}

export function traceSettingsMutation<T>(
  input: SettingsCallInput<T>,
): Promise<T> {
  return traceServerCall<T>({
    feature: "settings",
    operation: input.operation,
    source: input.source,
    projectId: input.projectId,
    metadata: input.metadata,
    call: input.call,
    mapSuccess: (result) => ({
      status: "success",
      httpStatus: 200,
      billing: "Free" as const,
      metered: false,
      cache: "Not applicable" as const,
      retry: { attempted: false, count: 0 },
      providers: internalProvider(input.endpoint),
      providerCalls: 1,
      counters: input.counters,
      metadata: { ...input.metadata, ...input.mapSuccess?.(result) },
    }),
  });
}

export function traceDataforseoConnectionTest(input: {
  source: string;
  projectId?: string;
  scope: "organization" | "project";
  call: () => Promise<DataforseoConnectionTestResult>;
}): Promise<DataforseoConnectionTestResult> {
  return traceServerCall<DataforseoConnectionTestResult>({
    feature: "settings",
    operation: "settings.dataforseo.connection_test",
    source: input.source,
    projectId: input.projectId,
    metadata: { scope: input.scope },
    call: input.call,
    mapSuccess: (result) => ({
      status: result.ok ? ("success" as const) : ("failed" as const),
      httpStatus: result.status,
      errorClass: result.ok ? undefined : result.reason,
      errorMessage: result.ok
        ? undefined
        : `DataForSEO connection test failed: ${result.reason}`,
      billing: "Free" as const,
      metered: false,
      cache: "Not applicable" as const,
      retry: { attempted: false, count: 0 },
      providers: [
        {
          provider: "DataForSEO",
          endpoint: "v3/appendix/user_data",
          httpStatus: result.status,
          billing: "Free" as const,
          metered: false,
        },
      ],
      providerCalls: 1,
      counters: {
        connectionTests: 1,
        connected: result.ok ? 1 : 0,
      },
      metadata: {
        scope: input.scope,
        reason: result.reason,
        billingStatus: result.billingStatus,
        balance: result.balance ?? null,
      },
    }),
  });
}

export function traceDataforseoStatusCheck(input: {
  source: string;
  projectId?: string;
  scope: "organization" | "project";
  call: () => Promise<DataforseoApiStatusResult>;
}): Promise<DataforseoApiStatusResult> {
  return traceServerCall<DataforseoApiStatusResult>({
    feature: "settings",
    operation: "settings.dataforseo.status_check",
    source: input.source,
    projectId: input.projectId,
    metadata: { scope: input.scope },
    call: input.call,
    mapSuccess: (result) => ({
      status: result.ok ? ("success" as const) : ("failed" as const),
      httpStatus: result.status,
      errorClass: result.ok ? undefined : result.reason,
      errorMessage: result.ok
        ? undefined
        : `DataForSEO status check failed: ${result.reason}`,
      billing: "Free" as const,
      metered: false,
      cache: "Not applicable" as const,
      retry: { attempted: false, count: 0 },
      providers: [
        {
          provider: "DataForSEO",
          endpoint: "v3/appendix/status",
          httpStatus: result.status,
          billing: "Free" as const,
          metered: false,
        },
      ],
      providerCalls: 1,
      counters: {
        statusChecks: 1,
        operationalApis: result.endpoints.filter((e) => e.status === "ok")
          .length,
      },
      metadata: {
        scope: input.scope,
        reason: result.reason,
        endpointsCount: result.endpoints.length,
      },
    }),
  });
}

export function traceAiConnectionTest(input: {
  source: string;
  projectId?: string;
  scope: "organization" | "project";
  provider: AiProviderId;
  model?: string;
  call: () => Promise<AiConnectionResult>;
}): Promise<AiConnectionResult> {
  return traceServerCall<AiConnectionResult>({
    feature: "settings",
    operation: "settings.ai.connection_test",
    source: input.source,
    projectId: input.projectId,
    metadata: {
      scope: input.scope,
      provider: input.provider,
      model: input.model ?? null,
    },
    call: input.call,
    mapSuccess: (result) => ({
      status: result.ok ? ("success" as const) : ("failed" as const),
      errorClass: result.ok
        ? undefined
        : (result.error ?? "AI_CONNECTION_FAILED"),
      errorMessage: result.ok
        ? undefined
        : (result.message ?? "AI connection test failed"),
      cache: "Not applicable" as const,
      retry: { attempted: false, count: 0 },
      providers: [
        {
          provider: input.provider,
          httpStatus: result.ok ? 200 : null,
        },
      ],
      providerCalls: 1,
      counters: {
        connectionTests: 1,
        toolCallingVerified: result.toolCallingVerified ? 1 : 0,
      },
      metadata: {
        scope: input.scope,
        provider: input.provider,
        model: result.model,
        latencyMs: result.latencyMs,
        toolCallingVerified: result.toolCallingVerified,
      },
    }),
  });
}

export function traceAiModelCatalog(input: {
  source: string;
  projectId?: string;
  scope: "organization" | "project";
  provider: AiProviderId;
  refresh: boolean;
  call: () => Promise<AiModel[]>;
}): Promise<AiModel[]> {
  return traceServerCall<AiModel[]>({
    feature: "settings",
    operation: input.refresh
      ? "settings.ai.models_refresh"
      : "settings.ai.models_list",
    source: input.source,
    projectId: input.projectId,
    metadata: {
      scope: input.scope,
      provider: input.provider,
      refresh: input.refresh,
    },
    call: input.call,
    mapSuccess: (models) => ({
      status: "success",
      cache: input.refresh ? ("MISS" as const) : undefined,
      cacheType: input.refresh ? "catalog refresh bypass" : undefined,
      retry: { attempted: false, count: 0 },
      providers: [{ provider: input.provider }],
      providerCalls: 1,
      counters: { models: models.length },
      metadata: {
        scope: input.scope,
        provider: input.provider,
        refresh: input.refresh,
        resultCount: models.length,
      },
    }),
  });
}

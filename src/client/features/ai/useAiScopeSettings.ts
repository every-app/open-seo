import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getScopeAiSettings,
  saveScopeAiSettingsFn,
  testAiConnection,
} from "@/serverFunctions/aiSettings";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import {
  traceAiConnectionTest,
  traceSettingsMutation,
  traceSettingsRead,
} from "@/client/features/tracing/settingsTrace";
import {
  isSupportedProvider,
  type AiProviderId,
} from "@/server/features/ai/providerIds";

// State machine for the multi-scope AI settings UI (Phase S), extracted from
// AiScopeSettings so the component stays within lint complexity/line budgets.
// Edit semantics: undefined = untouched (server-resolved), value = unsaved
// edit feeding Test Connection and Save.

const ENDPOINT_PROVIDERS: AiProviderId[] = ["openai_compatible", "ollama_cloud"];

export type SavePatch = Parameters<
  typeof saveScopeAiSettingsFn
>[0]["data"]["patch"];

export function useAiScopeSettings(scope: "organization" | "project", projectId?: string) {
  const queryClient = useQueryClient();
  const viewQuery = useQuery({
    queryKey: ["aiScopeSettings", scope, projectId ?? null],
    queryFn: () =>
      traceSettingsRead({
        operation: "settings.ai.settings_read",
        source: scope === "project" ? "Project settings" : "Settings",
        projectId: projectId || undefined,
        endpoint: "settings/ai/get",
        metadata: { scope },
        counters: { settingsReads: 1 },
        call: () =>
          getScopeAiSettings({ data: { scope, projectId: projectId || undefined } }),
      }),
  });

  const [provider, setProvider] = useState<AiProviderId | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [apiKeyEntry, setApiKeyEntry] = useState<string | null>(null);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testOk, setTestOk] = useState<boolean | null>(null);

  // Sync local state from the loaded view (server is authoritative).
  // loadedKey is a ref, not state, to avoid a setState→effect→setState loop:
  // the effect's job is to sync *once* per server loadKey change, and storing
  // the deduplication key in state would make the effect depend on the same
  // state it sets (Maximum update depth exceeded).
  const loadedKeyRef = useRef<string | null>(null);
  const data = viewQuery.data;
  const loadKey = data
    ? `${data.override?.provider ?? "inherit"}|${data.override?.model ?? ""}|${
        data.override?.baseUrl ?? ""
      }`
    : null;
  useEffect(() => {
    if (!data || loadKey === loadedKeyRef.current) return;
    loadedKeyRef.current = loadKey;
    const stored = data.override?.provider ?? null;
    setProvider(stored && isSupportedProvider(stored) ? stored : null);
    setModel(data.override?.model ?? null);
    setBaseUrl(data.override?.baseUrl ?? null);
    setApiKeyEntry(null);
    setShowKeyInput(false);
    setTestResult(null);
    setTestOk(null);
  }, [data, loadKey]);

  const effective = data?.effective;
  const selectedProvider: AiProviderId =
    provider ?? effective?.provider ?? "openrouter";
  const isEndpoint = ENDPOINT_PROVIDERS.includes(selectedProvider);

  const saveMutation = useMutation({
    mutationFn: (patch: SavePatch) =>
      traceSettingsMutation({
        operation: "settings.ai.settings_save",
        source: scope === "project" ? "Project settings" : "Settings",
        projectId: projectId || undefined,
        endpoint: "settings/ai/save",
        metadata: { scope, changedFields: Object.keys(patch) },
        counters: {
          settingsSaved: 1,
          resetToInherited: patch.resetToInherited ? 1 : 0,
        },
        call: () =>
          saveScopeAiSettingsFn({
            data: { scope, projectId: projectId || undefined, patch },
          }),
      }),
    onSuccess: async (_result, patch) => {
      await queryClient.invalidateQueries({
        queryKey: ["aiScopeSettings", scope, projectId ?? null],
      });
      // S18: after a credential/Base URL/provider change, refresh the catalog.
      if (
        patch.apiKey !== undefined ||
        patch.baseUrl !== undefined ||
        patch.provider !== undefined
      ) {
        setRefreshSignal((n) => n + 1);
      }
      toast.success("AI settings saved");
      setApiKeyEntry(null);
      setShowKeyInput(false);
    },
    onError: (error) =>
      toast.error(getStandardErrorMessage(error, "Failed to save AI settings")),
  });

  const testMutation = useMutation({
    mutationFn: () => {
      // S21: test the CURRENT EDIT state (unsaved values win); fall back to
      // the effective configuration server-side when a field is untouched.
      // Only safe identifiers are traced; unsaved secrets stay out of trace.
      const requestedModel = (model ?? effective?.model) || undefined;
      return traceAiConnectionTest({
        source: scope === "project" ? "Project settings" : "Settings",
        projectId: projectId || undefined,
        scope,
        provider: selectedProvider,
        model: requestedModel,
        call: () =>
          testAiConnection({
            data: {
              provider: selectedProvider,
              model: requestedModel,
              baseUrl: isEndpoint ? (baseUrl ?? undefined) : undefined,
              apiKey: apiKeyEntry?.trim() ? apiKeyEntry.trim() : undefined,
              projectId: projectId || undefined,
            },
          }),
      });
    },
    onSuccess: (result) => {
      setTestOk(result.ok);
      setTestResult(
        result.ok
          ? `Connection works (${result.latencyMs ?? "?"}ms${
              result.toolCallingVerified
                ? " - tool calling verified"
                : " - tool calling not verified"
            })`
          : (result.message ?? "The provider did not respond as expected."),
      );
    },
    onError: (error) => {
      setTestOk(false);
      setTestResult(getStandardErrorMessage(error, "Connection test failed"));
    },
  });

  const override = data?.override ?? null;
  const storedKeyStatus = override?.credentials[selectedProvider] ?? null;
  const keySource = override?.credentials[selectedProvider]
    ? scope
    : (effective?.credentialSource ?? "none");
  const baseUrlSource = isEndpoint ? (effective?.baseUrlSource ?? "none") : null;
  const isDirty =
    provider !== null ||
    model !== null ||
    baseUrl !== null ||
    apiKeyEntry !== null;

  const buildPatch = (): SavePatch => {
    const patch: SavePatch = {};
    if (provider !== null) patch.provider = provider;
    if (model !== null) patch.model = model === "" ? null : model;
    if (baseUrl !== null) patch.baseUrl = baseUrl === "" ? null : baseUrl;
    if (apiKeyEntry !== null) {
      patch.apiKey = apiKeyEntry.trim() === "" ? null : apiKeyEntry.trim();
    }
    return patch;
  };

  return {
    viewQuery,
    data,
    override,
    effective,
    selectedProvider,
    isEndpoint,
    storedKeyStatus,
    keySource,
    baseUrlSource,
    provider,
    setProvider,
    model,
    setModel,
    baseUrl,
    setBaseUrl,
    apiKeyEntry,
    setApiKeyEntry,
    showKeyInput,
    setShowKeyInput,
    refreshSignal,
    saveMutation,
    testMutation,
    testResult,
    testOk,
    isDirty,
    buildPatch,
  };
}
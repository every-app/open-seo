import { AiModelSelect } from "@/client/features/ai/AiModelSelect";
import {
  ApiKeySection,
  BaseUrlSection,
  ConnectionSection,
  EffectiveReadout,
  EnvironmentDefaultsCard,
  FieldHeader,
  ProviderSelector,
  ScopeActions,
} from "@/client/features/ai/AiScopeSettingsParts";
import type { AiProviderId } from "@/server/features/ai/providerIds";
import {
  useAiScopeSettings,
  type SavePatch,
} from "@/client/features/ai/useAiScopeSettings";

// Unified multi-scope AI settings (Phase S): one component for the
// organization scope (Settings - AI) and the project scope (project
// settings - AI agent). Provider selection, editable Base URL, encrypted API
// key CRUD (change/remove, never read back), per-field inheritance labels,
// Refresh Models, unsaved-edit connection testing, and scope reset.
// Plaintext keys never appear: the server returns only masked statuses and
// the key input is write-only. State lives in useAiScopeSettings; render
// sections live in AiScopeSettingsParts.

export function AiScopeSettings({
  scope,
  projectId,
}: {
  scope: "organization" | "project";
  projectId?: string;
}) {
  const state = useAiScopeSettings(scope, projectId);
  const {
    viewQuery,
    data,
    override,
    effective,
    selectedProvider,
    isEndpoint,
    storedKeyStatus,
    keySource,
    baseUrlSource,
    setProvider,
    setModel,
    setBaseUrl,
    setApiKeyEntry,
    setShowKeyInput,
    testResult,
    testOk,
    saveMutation,
    testMutation,
    isDirty,
    buildPatch,
  } = state;

  if (viewQuery.isPending || !data) {
    return (
      <div className="flex items-center gap-2">
        <span className="loading loading-spinner loading-sm" />
        <span className="text-sm text-base-content/50">Loading…</span>
      </div>
    );
  }

  const onProviderSelect = (id: AiProviderId) => {
    setProvider(id);
    setModel(null);
    setBaseUrl(null);
  };

  return (
    <div className="space-y-4">
      {scope === "organization" && (
        <EnvironmentDefaultsCard
          provider={
            data.effective.providerSource === "environment"
              ? data.effective.provider
              : "not set"
          }
          model={
            data.effective.providerSource === "environment"
              ? (data.effective.model ?? "built-in default")
              : "not set"
          }
        />
      )}

      {/* Provider */}
      <div className="flex flex-col gap-1.5">
        <FieldHeader
          label="Provider"
          overridden={Boolean(override?.provider)}
          scope={scope}
        />
        <ProviderSelector
          providers={data.providers ?? []}
          selected={selectedProvider}
          onSelect={onProviderSelect}
        />
        <p className="text-xs text-base-content/50">
          Effective credential:{" "}
          {effective?.credentialConfigured ? (
            <span className="text-success">
              configured ({effective.credentialMasked}) -{" "}
              {effective.credentialSource}
            </span>
          ) : (
            <span className="text-warning">
              not configured for this provider
            </span>
          )}
        </p>
      </div>

      {/* Base URL (endpoint providers only) */}
      {isEndpoint && (
        <BaseUrlSection
          baseUrl={state.baseUrl}
          onChange={setBaseUrl}
          source={baseUrlSource}
          disabled={saveMutation.isPending}
        />
      )}

      {/* API key */}
      <ApiKeySection
        scope={scope}
        storedMasked={storedKeyStatus?.masked ?? null}
        effectiveConfigured={effective?.credentialConfigured ?? false}
        effectiveMasked={effective?.credentialMasked ?? null}
        effectiveSource={keySource}
        showInput={state.showKeyInput}
        entry={state.apiKeyEntry}
        onEntryChange={setApiKeyEntry}
        onToggleInput={() => {
          setShowKeyInput(!state.showKeyInput);
          setApiKeyEntry(state.showKeyInput ? null : "");
        }}
        onRemoveOverride={() => saveMutation.mutate({ apiKey: null })}
        saving={saveMutation.isPending}
      />

      {/* Model */}
      <div className="flex flex-col gap-1.5">
        <FieldHeader
          label="Model"
          overridden={Boolean(override?.model)}
          scope={scope}
        />
        <AiModelSelect
          provider={selectedProvider}
          value={state.model ?? effective?.model ?? null}
          onChange={setModel}
          disabled={saveMutation.isPending}
          baseUrl={isEndpoint ? (state.baseUrl ?? undefined) : undefined}
          apiKey={
            state.apiKeyEntry?.trim() ? state.apiKeyEntry.trim() : undefined
          }
          refreshSignal={state.refreshSignal}
          projectId={projectId}
        />
        <EffectiveReadout model={effective?.model ?? null} />
      </div>

      {/* Connection test (unsaved edits aware) */}
      <ConnectionSection
        result={testResult}
        ok={testOk}
        testing={testMutation.isPending}
        onTest={() => testMutation.mutate()}
      />

      {/* Actions */}
      <ScopeActions
        hasOverride={Boolean(override)}
        dirty={isDirty}
        saving={saveMutation.isPending}
        onReset={() => saveMutation.mutate({ resetToInherited: true })}
        onSave={() => saveMutation.mutate(buildPatch())}
      />
    </div>
  );
}

// Local alias so the patch builder type stays in sync with the server fn.
export type { SavePatch };
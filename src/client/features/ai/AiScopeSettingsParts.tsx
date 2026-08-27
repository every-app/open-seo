import type { AiProviderId } from "@/server/features/ai/providerIds";

// Render sections for AiScopeSettings (Phase S), extracted to keep the parent
// component within lint complexity/line budgets. These are pure display
// components: all state lives in the parent.

export function SourceBadge({ source }: { source: string | null | undefined }) {
  if (!source) return null;
  const cls =
    source === "project" || source === "organization"
      ? "badge-ghost text-info"
      : source === "environment"
        ? "badge-ghost text-base-content/50"
        : "badge-ghost text-warning";
  return <span className={`badge badge-sm ${cls}`}>{source}</span>;
}

export function BaseUrlSection({
  baseUrl,
  onChange,
  source,
  disabled,
}: {
  baseUrl: string | null;
  onChange: (next: string) => void;
  source: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        Base URL{" "}
        {source && source !== "none" && source !== "environment" ? (
          <SourceBadge source={source} />
        ) : null}
        {source === "environment" && (
          <span className="badge badge-ghost badge-sm text-base-content/50">
            environment default
          </span>
        )}
      </span>
      <input
        type="url"
        value={baseUrl ?? ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://example.com/v1"
        disabled={disabled}
        className="input input-bordered input-sm w-full font-mono"
        aria-label="Provider Base URL"
      />
      <p className="text-xs text-base-content/50">
        Absolute http(s) URL; no embedded credentials; cloud metadata and (on
        hosted deployments) private/loopback targets are rejected. Ollama
        Cloud default: https://ollama.com/v1
      </p>
    </div>
  );
}

export function ApiKeySection({
  scope,
  storedMasked,
  effectiveConfigured,
  effectiveMasked,
  effectiveSource,
  showInput,
  entry,
  onEntryChange,
  onToggleInput,
  onRemoveOverride,
  saving,
}: {
  scope: "organization" | "project";
  storedMasked: string | null;
  effectiveConfigured: boolean;
  effectiveMasked: string | null;
  effectiveSource: string;
  showInput: boolean;
  entry: string | null;
  onEntryChange: (next: string) => void;
  onToggleInput: () => void;
  onRemoveOverride: () => void;
  saving?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">API key</span>
      {storedMasked ? (
        <p className="text-sm text-success">
          Configured at {scope} level ({storedMasked})
        </p>
      ) : effectiveConfigured ? (
        <p className="text-sm text-success">
          {effectiveSource === "environment"
            ? `Configured via environment (${effectiveMasked})`
            : `Configured at ${effectiveSource} level, inherited (${effectiveMasked})`}
        </p>
      ) : (
        <p className="text-sm text-warning">Not configured</p>
      )}
      {showInput ? (
        <div className="flex flex-col gap-1.5">
          <input
            type="password"
            value={entry ?? ""}
            onChange={(event) => onEntryChange(event.target.value)}
            placeholder="New API key (blank = do not change)"
            autoComplete="off"
            className="input input-bordered input-sm w-full font-mono"
            aria-label="New API key"
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-xs"
              onClick={onToggleInput}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-outline btn-xs"
            onClick={onToggleInput}
          >
            {storedMasked ? "Change API key" : "Add API key override"}
          </button>
          {storedMasked && (
            <button
              type="button"
              className="btn btn-ghost btn-xs text-error"
              onClick={onRemoveOverride}
              disabled={saving}
            >
              Remove override
            </button>
          )}
        </div>
      )}
      <p className="text-xs text-base-content/50">
        Keys are encrypted at rest and never returned to the browser or logged.
        Blank input means "do not modify".
      </p>
    </div>
  );
}

export function ConnectionSection({
  result,
  ok,
  testing,
  onTest,
}: {
  result: string | null;
  ok: boolean | null;
  testing?: boolean;
  onTest: () => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Connection</span>
      <button
        type="button"
        className="btn btn-outline btn-sm w-fit"
        onClick={onTest}
        disabled={testing}
      >
        {testing ? "Testing…" : "Test connection"}
      </button>
      {result && (
        <p className={`text-xs ${ok ? "text-success" : "text-error"}`}>
          {result}
        </p>
      )}
    </div>
  );
}

export type ProviderEntry = {
  id: AiProviderId;
  displayName: string;
};

export function ProviderSelector({
  providers,
  selected,
  onSelect,
}: {
  providers: ProviderEntry[];
  selected: AiProviderId;
  onSelect: (id: AiProviderId) => void;
}) {
  const labels: Record<AiProviderId, string> = {
    openrouter: "OpenRouter",
    openai: "OpenAI",
    gemini: "Google Gemini",
    anthropic: "Anthropic",
    openai_compatible: "OpenAI Compatible",
    ollama_cloud: "Ollama Cloud",
  };
  return (
    <div className="flex flex-wrap gap-2">
      {providers.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => onSelect(entry.id)}
          className={`btn btn-outline btn-sm ${
            selected === entry.id ? "btn-primary" : ""
          }`}
          aria-pressed={selected === entry.id}
        >
          {labels[entry.id] ?? entry.displayName}
        </button>
      ))}
    </div>
  );
}

/** Field header with an inherited/override source chip. */
export function FieldHeader({
  label,
  overridden,
  scope,
}: {
  label: string;
  overridden: boolean;
  scope: string;
}) {
  return (
    <span className="text-sm font-medium">
      {label}{" "}
      {overridden ? (
        <SourceBadge source={scope} />
      ) : (
        <span className="badge badge-ghost badge-sm text-base-content/50">
          inherited
        </span>
      )}
    </span>
  );
}

export function EffectiveReadout({ model }: { model: string | null }) {
  return (
    <p className="text-xs text-base-content/50">
      In effect: <span className="font-mono">{model ?? "provider default"}</span>
    </p>
  );
}

export function ScopeActions({
  hasOverride,
  dirty,
  saving,
  onReset,
  onSave,
}: {
  hasOverride: boolean;
  dirty: boolean;
  saving?: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      {hasOverride ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm text-warning"
          onClick={onReset}
          disabled={saving}
        >
          Use inherited settings
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={onSave}
        disabled={saving || !dirty}
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </div>
  );
}

export function EnvironmentDefaultsCard({
  provider,
  model,
}: {
  provider: string;
  model: string;
}) {
  return (
    <div className="rounded-box border border-base-300 bg-base-200/40 p-3 text-xs text-base-content/70">
      <p className="font-medium text-base-content">
        Environment defaults (read-only)
      </p>
      <p className="mt-1">
        Provider: <span className="font-mono">{provider}</span> · Model:{" "}
        <span className="font-mono">{model}</span>
      </p>
      <p className="mt-0.5 text-base-content/50">
        Deployment variables (AI_AGENT_PROVIDER, *_API_KEY, ...) are edited
        outside the app; override them here at organization or project level.
      </p>
    </div>
  );
}
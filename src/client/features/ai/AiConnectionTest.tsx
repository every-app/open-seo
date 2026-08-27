import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { testAiConnection } from "@/serverFunctions/aiSettings";
import { getStandardErrorMessage } from "@/client/lib/error-messages";
import type { AiProviderId } from "@/server/features/ai/providerIds";

// One-off credential/model check from the settings UI: fires a minimal
// generation (plus a best-effort tool-call probe for providers that declare
// tool calling) against the deployment's server-side key. Never passes a key
// from the client, and never charges OpenSEO usage credits (the test is billed
// to the deployment's own provider key).

type ConnectionStatus = "idle" | "testing" | "ok" | "failed";

export function AiConnectionTest({
  provider,
  model,
  apiKeyConfigured,
}: {
  provider: AiProviderId;
  model: string;
  apiKeyConfigured: boolean;
}) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [policyBlocked, setPolicyBlocked] = useState(false);

  const testMutation = useMutation({
    mutationFn: () =>
      testAiConnection({ data: { provider, model } }),
    onMutate: () => {
      setStatus("testing");
      setMessage(null);
      setPolicyBlocked(false);
    },
    onSuccess: (result) => {
      if (result.ok) {
        const details = [
          result.toolCallingVerified
            ? "tool calling verified"
            : "tool calling not verified",
          result.latencyMs !== null ? `${result.latencyMs}ms` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        setStatus("ok");
        setPolicyBlocked(false);
        setMessage(
          `Connection works — the provider accepted the key and the model responded${
            details ? ` (${details})` : ""
          }.`,
        );
      } else {
        setStatus("failed");
        const code = result.error;
        setMessage(
          code === "DATA_POLICY_BLOCKED"
            ? `${result.message ?? "The provider blocked this model under its data policy."} Pick another model above, or see the provider's privacy settings.`
            : (result.message ?? "The provider did not respond as expected."),
        );
        setPolicyBlocked(code === "DATA_POLICY_BLOCKED");
      }
    },
    onError: (error) => {
      setStatus("failed");
      setPolicyBlocked(false);
      setMessage(getStandardErrorMessage(error, "Connection test failed"));
    },
  });

  const disabled = !apiKeyConfigured || status === "testing";

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        className="btn btn-outline btn-sm w-fit"
        onClick={() => testMutation.mutate()}
        disabled={disabled}
      >
        {status === "testing" ? (
          <>
            <span className="loading loading-spinner loading-xs" />
            Testing…
          </>
        ) : (
          "Test connection"
        )}
      </button>
      {!apiKeyConfigured && (
        <p className="text-xs text-base-content/50">
          Configure a provider key in the deployment environment to test a
          connection.
        </p>
      )}
      {message && (
        <p
          className={`text-xs ${
            status === "ok" ? "text-success" : "text-error"
          }`}
        >
          {message}
        </p>
      )}
      {policyBlocked && (
        <a
          href="https://openrouter.ai/settings/privacy"
          target="_blank"
          rel="noreferrer"
          className="link link-primary w-fit text-xs"
        >
          OpenRouter Privacy Settings →
        </a>
      )}
    </div>
  );
}

// Current effective model readout (project > organization > environment).
export function EffectiveModelReadout({
  effectiveProvider,
  effectiveModel,
}: {
  effectiveProvider: string;
  effectiveModel: string | null;
}) {
  const text = useMemo(() => {
    if (!effectiveModel) return "Environment default";
    return `${effectiveProvider} / ${effectiveModel}`;
  }, [effectiveProvider, effectiveModel]);
  return (
    <p className="text-xs text-base-content/50">
      In effect:{" "}
      <span className="font-mono">{text}</span>
    </p>
  );
}
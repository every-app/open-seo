import { useMutation } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { testAiConnection } from "@/serverFunctions/aiSettings";
import { getStandardErrorMessage } from "@/client/lib/error-messages";

// One-off credential/model check from the settings UI: fires a minimal
// generation against the deployment's server-side key. Never passes a key
// from the client, and never charges OpenSEO usage credits (the test is billed
// to the deployment's own provider key).

type ConnectionStatus = "idle" | "testing" | "ok" | "failed";

export function AiConnectionTest({
  model,
  apiKeyConfigured,
}: {
  model: string;
  apiKeyConfigured: boolean;
}) {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  const testMutation = useMutation({
    mutationFn: () =>
      testAiConnection({ data: { provider: "openrouter", model } }),
    onMutate: () => {
      setStatus("testing");
      setMessage(null);
    },
    onSuccess: (result) => {
      if (result.ok) {
        setStatus("ok");
        setMessage("Connection works — the provider accepted the key and the model responded.");
      } else {
        setStatus("failed");
        setMessage(result.message ?? "The provider did not respond as expected.");
      }
    },
    onError: (error) => {
      setStatus("failed");
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
          Set OPENROUTER_API_KEY in the deployment environment to test a
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
    </div>
  );
}

// Current effective model readout (project > organization > environment).
export function EffectiveModelReadout({
  effectiveModel,
}: {
  effectiveModel: string | null;
}) {
  const text = useMemo(() => {
    if (!effectiveModel) return "Environment default";
    return effectiveModel;
  }, [effectiveModel]);
  return (
    <p className="text-xs text-base-content/50">
      In effect:{" "}
      <span className="font-mono">{text}</span>
    </p>
  );
}
import { Link } from "@tanstack/react-router";
import { AccessGate } from "@/client/features/access-gate/AccessGate";

export function SamSetupGate({
  errorMessage,
  isRefetching,
  onRetry,
}: {
  errorMessage: string | null;
  isRefetching: boolean;
  onRetry: () => void;
}) {
  return (
    <AccessGate
      title="Enable AI Features"
      bodyText={
        <>
          SAM, OpenSEO's in-app AI agent, needs an OpenRouter API key. Create a
          key on OpenRouter, set it as the <code>OPENROUTER_API_KEY</code>{" "}
          environment variable, restart OpenSEO, then confirm here.
        </>
      }
      helperText={
        <>
          Step-by-step instructions for every deployment are in the{" "}
          <Link
            className="underline underline-offset-2 hover:text-base-content/70"
            to="/help/openrouter-api-key"
          >
            OpenRouter API key setup guide
          </Link>
          .
        </>
      }
      buttonLabel="Confirm API Key"
      externalUrl="https://openrouter.ai/settings/keys"
      externalLabel="Open OpenRouter Keys"
      errorMessage={errorMessage}
      isRefetching={isRefetching}
      onRetry={onRetry}
    />
  );
}

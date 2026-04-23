import {
  AccessGate,
  AccessGateLoadingState,
} from "@/client/features/access-gate/AccessGate";

export function AiSearchAccessLoadingState() {
  return <AccessGateLoadingState />;
}

export function AiSearchSetupGate({
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
      title="Enable AI Optimization"
      bodyText="AI Optimization is not enabled for your DataForSEO account yet. You can enable it in DataForSEO, or use managed OpenSEO for long-term LLM Mentions access at $10/month."
      helperText={
        <>
          We are also planning an API so self-hosted apps can use OpenSEO's LLM
          Mentions data directly. Until then, <InlineManagedOpenSeoLink />.
        </>
      }
      buttonLabel="Confirm AI Optimization Access"
      externalUrl="https://app.dataforseo.com/api-access-subscriptions"
      externalLabel="Open DataForSEO API Access"
      errorMessage={errorMessage}
      isRefetching={isRefetching}
      onRetry={onRetry}
    />
  );
}

function InlineManagedOpenSeoLink() {
  return (
    <a
      className="underline underline-offset-2 hover:text-base-content/70"
      href="https://openseo.so/?utm_source=self_hosted_app&utm_medium=access_gate&utm_campaign=llm_mentions"
      target="_blank"
      rel="noreferrer"
    >
      use managed OpenSEO
    </a>
  );
}

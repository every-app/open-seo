import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { KeyRound } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { QueryError } from "@/client/components/QueryState";
import { SkeletonPageContent } from "@/client/components/SkeletonPresets";
import { Button } from "@/client/components/ui/button";
import { useSamAccess } from "@/client/features/sam/useSamAccess";

/**
 * AI visibility setup researches the brand and suggests prompts through
 * OpenRouter, so a self-hosted install without a key would only fail after
 * the user starts research. Ask for the key first (hosted always has one).
 */
export function OpenRouterKeyGate({
  projectId,
  children,
}: {
  projectId: string;
  children: ReactNode;
}) {
  const access = useSamAccess(projectId);
  if (access.status === "ready") return children;
  if (access.status === "checking") return <SkeletonPageContent />;
  if (access.status === "error")
    return (
      <QueryError
        error={access.error}
        fallback="Could not check the OpenRouter API key."
        onRetry={access.onRetry}
        isRetrying={access.isRetrying}
      />
    );
  return (
    <div className="grid min-h-[calc(100dvh-8rem)] place-items-center">
      <GateCard
        className="max-w-2xl"
        icon={KeyRound}
        tone="warning"
        title="Add an OpenRouter API key"
        description={
          <>
            <p>
              AI visibility uses OpenRouter to research your brand and suggest
              the prompts worth tracking, so you don&apos;t have to write them
              yourself. The tracking results, what ChatGPT and other AI engines
              actually answer, come from your DataForSEO account.
            </p>
            <p>
              Create a key on OpenRouter, set it as{" "}
              <code>OPENROUTER_API_KEY</code>, restart OpenSEO, then confirm
              here. The{" "}
              <Link
                className="underline underline-offset-2 hover:text-foreground"
                to="/help/openrouter-api-key"
              >
                OpenRouter API key setup guide
              </Link>{" "}
              has the steps for each deployment.
            </p>
          </>
        }
        actions={
          <>
            <Button
              size="lg"
              pending={access.isRefetching}
              onClick={access.onRetry}
            >
              Confirm API Key
            </Button>
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={
                <a
                  href="https://openrouter.ai/settings/keys"
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              Open OpenRouter Keys
            </Button>
          </>
        }
      />
    </div>
  );
}

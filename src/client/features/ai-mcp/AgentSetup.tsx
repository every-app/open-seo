import { useEffect, useEffectEvent, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Check } from "lucide-react";
import { AgentList } from "./AgentList";
import { ONE_CLICK_INSTALLS } from "./agentInstalls";
import { AgentSetupPanel } from "./AgentSetupPanel";
import { getAgentSetupPrompt } from "./agentSetupPrompt";
import { captureClientEvent } from "@/client/lib/posthog";
import { WizardFooter } from "@/client/features/onboarding/WizardFooter";
import { Button } from "@/client/components/ui/button";
import { useLocale } from "@/client/lib/i18n";
import { getMcpAuthorizedAt } from "@/serverFunctions/onboarding";

/** Last onboarding step. Onboarding finishes when the user clicks Go to
 *  dashboard, or when their agent connects over MCP (the server marks it). */
export function AgentSetup({
  onFinish,
  onBack,
}: {
  onFinish: () => void;
  onBack: () => void;
}) {
  const { t } = useLocale();
  const prompt = getAgentSetupPrompt(window.location.origin);
  const [copied, setCopied] = useState(false);
  // Once the user copies the prompt or opens an agent listing, Go to dashboard
  // becomes the main button.
  const [startedSetup, setStartedSetup] = useState(false);
  // Polls while the tab is visible, so the step moves on within a few seconds
  // of the user returning from their agent.
  const { data } = useQuery({
    queryKey: ["mcpAuthorizedAt"],
    queryFn: () => getMcpAuthorizedAt(),
    refetchInterval: 3_000,
  });
  const connected = Boolean(data?.authorizedAt);

  // Leave "Connected" on screen briefly before moving on.
  const finish = useEffectEvent(onFinish);
  useEffect(() => {
    if (!connected) return;
    const timer = setTimeout(finish, 1_500);
    return () => clearTimeout(timer);
  }, [connected]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t("ai.setup.title")}
        </h1>
        <p className="mt-3 text-pretty text-sm leading-relaxed text-muted-foreground">
          {t("ai.panel.description")}
        </p>
        <AgentList />
      </div>
      <AgentSetupPanel
        prompt={prompt}
        copyVariant={startedSetup ? "outline" : "default"}
        onCopy={() => {
          setCopied(true);
          setStartedSetup(true);
          captureClientEvent("onboarding:setup_prompt_copy");
        }}
        actions={ONE_CLICK_INSTALLS.map(({ agent, name, href, Icon }) => (
          <Button
            key={agent}
            variant="outline"
            size="lg"
            className="w-full"
            nativeButton={false}
            render={<a href={href} target="_blank" rel="noreferrer" />}
            onClick={() => {
              setStartedSetup(true);
              captureClientEvent("onboarding:add_to_agent_click", { agent });
            }}
          >
            <Icon data-icon="inline-start" />
            {/* "Add to" drops on narrow screens so both buttons fit one row. */}
            <span>
              <span className="max-sm:sr-only">Add to </span>
              {name}
            </span>
          </Button>
        ))}
      >
        {connected ? (
          <p
            role="status"
            className="mt-3 flex items-center justify-center gap-1.5 text-sm font-medium text-success"
          >
            <Check className="size-4" aria-hidden />
            Connected
          </p>
        ) : copied ? (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Paste it into your agent and approve the connection.
          </p>
        ) : null}
      </AgentSetupPanel>
      <div className="mt-7 border-t border-border pt-5">
        <WizardFooter
          className="mt-0"
          onBack={onBack}
          continueAction={
            <Button
              type="button"
              variant={startedSetup ? "default" : "ghost"}
              className={
                startedSetup
                  ? "font-semibold"
                  : "h-8 gap-2 px-3 text-xs font-semibold"
              }
              onClick={onFinish}
            >
              {t("ai.onboarding.go_to_dashboard")} <ArrowRight className="size-4" />
            </Button>
          }
        />
      </div>
    </div>
  );
}

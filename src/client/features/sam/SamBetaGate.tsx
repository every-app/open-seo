import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { GateCard } from "@/client/components/GateCard";
import { Button } from "@/client/components/ui/button";

/**
 * Shown on the chat route until the user opts into Sam. Sam is the OpenSEO
 * MCP plus skills wrapped in an in-app chat; the agents people already use
 * run that same toolset with a more mature harness, so the primary action
 * points there and Sam is the explicit fallback.
 */
export function SamBetaGate({ onContinue }: { onContinue: () => void }) {
  return (
    <GateCard
      icon={Sparkles}
      title="Sam is in beta"
      description={
        <>
          <p>
            Sam is the OpenSEO MCP and skills wrapped in a chat window. The
            agent you already use, like Claude Code, ChatGPT, Grok Bot, or
            Hermes, runs that same toolset on a much more capable harness. We
            recommend using OpenSEO there.
          </p>
          <p>You can still use Sam, but it is early and has rough edges.</p>
        </>
      }
      actions={
        <>
          <Button size="lg" nativeButton={false} render={<Link to="/ai" />}>
            Set up your agent
          </Button>
          <Button size="lg" variant="ghost" onClick={onContinue}>
            Use Sam anyway
          </Button>
        </>
      }
    />
  );
}

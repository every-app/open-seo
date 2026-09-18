import { Package } from "lucide-react";
import { CopyButton } from "./SetupControls";

export const AGENT_SETUP_DESCRIPTION =
  "Paste this prompt into your agent to automatically configure OpenSEO for you.";

export function AgentSetupPanel({
  prompt,
  onCopy,
}: {
  prompt: string;
  onCopy?: () => void;
}) {
  return (
    <>
      <div className="rounded-xl border border-base-300 bg-base-200/25 p-5">
        <div className="mb-5 flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-base-300 bg-base-100">
            <Package className="size-5 text-base-content/70" />
          </span>
          <div>
            <p className="text-sm font-medium">OpenSEO plugin</p>
            <p className="mt-1 text-xs text-base-content/55">
              MCP connection + SEO skills
            </p>
          </div>
        </div>
        <div className="[&>button]:h-11 [&>button]:w-full [&>button]:gap-2 [&>button]:text-sm">
          <CopyButton
            primary
            value={prompt}
            label="Copy setup prompt"
            successMessage="Setup prompt copied"
            onCopy={onCopy}
          />
        </div>
      </div>
      <div className="mt-4 text-center">
        <a
          href="https://openseo.so/docs/agent-setup"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-base-content/60 underline decoration-base-content/25 underline-offset-4 hover:text-base-content"
        >
          Manual setup
        </a>
      </div>
    </>
  );
}

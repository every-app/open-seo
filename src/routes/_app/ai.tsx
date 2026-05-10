import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Check, ChevronDown, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ClaudeIcon, CodexIcon } from "@/client/features/ai-mcp/AgentIcons";
import { AvailableTools } from "@/client/features/ai-mcp/AvailableTools";

const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";
const SUPPORT_EMAIL = "ben@openseo.so";
const SAM_GITHUB_URL = "https://github.com/every-app/sam";

export const Route = createFileRoute("/_app/ai")({
  component: AiPage,
});

function AiPage() {
  const mcpUrl =
    typeof window === "undefined"
      ? "https://app.openseo.so/mcp"
      : `${window.location.origin}/mcp`;

  return (
    <div className="h-full overflow-auto bg-base-100 px-4 py-12 md:px-6 md:py-16 pb-24 md:pb-12">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-2xl font-semibold">AI & MCP</h1>
        <p className="mt-2 text-sm text-base-content/70 leading-relaxed">
          Connect your AI agent to OpenSEO. Run keyword research, SERP analysis,
          and domain lookups from your editor or chat.
        </p>

        <section className="mt-8">
          <div className="rounded-lg border border-base-300 bg-base-200 px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-base-content/50">
                MCP server URL
              </p>
              <CopyButton
                value={mcpUrl}
                successMessage="MCP URL copied"
                label="Copy"
              />
            </div>
            <code className="mt-2 block break-all font-mono text-sm text-base-content">
              {mcpUrl}
            </code>
          </div>
          <p className="mt-2.5 text-xs text-base-content/55 leading-relaxed">
            Paste this into any MCP client. Sign in with OpenSEO when prompted.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="text-base font-semibold">Setup guides</h2>
          <p className="mt-1.5 text-sm text-base-content/70">
            Pick your agent.
          </p>
          <div className="mt-4 divide-y divide-base-300 overflow-hidden rounded-lg border border-base-300 bg-base-200">
            <Collapsible
              id="claude-code"
              title="Claude Code"
              subtitle="Add with the CLI"
              icon={<ClaudeIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">
                Run this in your terminal:
              </p>
              <CodeBlock
                code={`claude mcp add --transport http --scope user openseo ${mcpUrl}`}
              />
              <p className="text-sm text-base-content/70">
                Approve the login when prompted.
              </p>
            </Collapsible>

            <Collapsible
              id="claude-desktop"
              title="Claude Desktop"
              subtitle="Add a custom connector"
              icon={<ClaudeIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  Open <span className="text-base-content">Settings</span> →{" "}
                  <span className="text-base-content">Connectors</span>.
                </li>
                <li>
                  Click{" "}
                  <span className="font-medium text-base-content">
                    Add custom connector
                  </span>
                  .
                </li>
                <li>Paste the MCP URL above and click Add.</li>
                <li>Approve the OpenSEO login when prompted.</li>
                <li>
                  Optional: after OpenSEO connects, click{" "}
                  <span className="font-medium text-base-content">
                    Configure
                  </span>
                  , then choose{" "}
                  <span className="font-medium text-base-content">
                    Always Approved
                  </span>
                  , except for any tools you want Claude to ask before using.
                </li>
              </ol>
              <p className="text-xs text-base-content/55 leading-relaxed">
                Requires a Claude Pro, Max, Team, or Enterprise plan.
              </p>
            </Collapsible>

            <Collapsible
              id="codex"
              title="Codex"
              subtitle="Add with the CLI"
              icon={<CodexIcon className="size-5" />}
            >
              <p className="text-sm text-base-content/70">
                Run this in your terminal:
              </p>
              <CodeBlock code={`codex mcp add openseo --url ${mcpUrl}`} />
              <p className="text-sm text-base-content/70">
                Approve the login when prompted.
              </p>
            </Collapsible>

            <Collapsible
              id="codex-desktop"
              title="Codex Desktop"
              subtitle="Settings → Integrations & MCP"
              icon={<CodexIcon className="size-5" />}
            >
              <ol className="ml-5 list-decimal space-y-1.5 text-sm text-base-content/70 leading-relaxed">
                <li>
                  Open{" "}
                  <span className="text-base-content">
                    Settings → Integrations & MCP
                  </span>
                  .
                </li>
                <li>
                  Click{" "}
                  <span className="font-medium text-base-content">
                    Add your own
                  </span>
                  .
                </li>
                <li>Paste the MCP URL above.</li>
                <li>Approve the OpenSEO login when prompted.</li>
              </ol>
            </Collapsible>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Available tools</h2>
          <div className="mt-5">
            <AvailableTools />
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Sam: AI SEO teammate</h2>
          <p className="mt-1.5 text-sm text-base-content/70 leading-relaxed">
            Sam is an experimental content workflow for Claude Code and other
            coding agents. It combines keyword research, source discovery,
            drafting, and QA.
          </p>
          <a
            href={SAM_GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-base-content transition-colors hover:text-base-content/60"
          >
            View Sam on GitHub
            <ArrowUpRight className="size-3.5" />
          </a>
        </section>

        <section className="mt-12">
          <h2 className="text-base font-semibold">Roadmap</h2>
          <ul className="mt-4 space-y-3">
            {[
              {
                title: "In-app SEO Research Agent",
                description:
                  "Ask questions and run research without leaving OpenSEO",
              },
              {
                title: "Content Assistant",
                description:
                  "Generate drafts using saved keywords and business context",
              },
            ].map((item) => (
              <li key={item.title} className="flex gap-2.5 text-sm">
                <span className="mt-[2px] shrink-0 text-base-content/40">
                  &mdash;
                </span>
                <span className="text-base-content/70">
                  <span className="font-medium text-base-content">
                    {item.title}
                  </span>
                  <br />
                  {item.description}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-xs text-base-content/55 leading-relaxed">
          Have feedback? Reach out on{" "}
          <a
            className="link link-primary"
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
          >
            Discord
          </a>{" "}
          or email{" "}
          <a className="link link-primary" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function Collapsible({
  id,
  title,
  subtitle,
  icon,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const contentId = `collapsible-${id}`;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={contentId}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-base-300/50"
      >
        <div className="flex min-w-0 items-center gap-3">
          {icon ? (
            <span className="flex size-5 shrink-0 items-center justify-center text-base-content">
              {icon}
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-base-content">
              {title}
            </span>
            {subtitle ? (
              <span className="text-xs text-base-content/55">{subtitle}</span>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`size-4 shrink-0 text-base-content/50 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      {open ? (
        <div id={contentId} className="space-y-3 px-4 pb-4 pt-1">
          {children}
        </div>
      ) : null}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="flex items-stretch overflow-hidden rounded-md border border-base-300 bg-base-100">
      <pre className="min-w-0 flex-1 overflow-x-auto p-3 text-xs leading-relaxed text-base-content">
        <code className="font-mono">{code}</code>
      </pre>
      <div className="flex shrink-0 items-start border-l border-base-300 p-1.5">
        <CopyButton
          value={code}
          successMessage="Copied to clipboard"
          iconOnly
        />
      </div>
    </div>
  );
}

function CopyButton({
  value,
  successMessage,
  label,
  iconOnly = false,
}: {
  value: string;
  successMessage: string;
  label?: string;
  iconOnly?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      toast.error("Clipboard not available");
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMessage);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={handleCopy}
        aria-label="Copy"
        className="flex size-7 items-center justify-center rounded-md text-base-content/60 transition-colors hover:bg-base-200 hover:text-base-content"
      >
        {copied ? (
          <Check className="size-3.5 text-success" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-2 py-1 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-300/50 hover:text-base-content"
    >
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3" />
      )}
      {label ?? "Copy"}
    </button>
  );
}

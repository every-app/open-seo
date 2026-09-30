import { isHostedClientAuthMode } from "@/lib/auth-mode";
import { CopyButton } from "@/client/components/CopyButton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/client/components/ui/tabs";

export const AGENT_SETUP_DESCRIPTION =
  "Choose where you want to use OpenSEO. ChatGPT needs manual connection steps; Codex and other agents can use the setup prompt.";

export function AgentSetupPanel({
  prompt,
  mcpUrl,
  onCopy,
}: {
  prompt: string;
  mcpUrl: string;
  onCopy?: () => void;
}) {
  const hosted = isHostedClientAuthMode();

  return (
    <Tabs defaultValue={hosted ? "chatgpt" : "agent"}>
      <TabsList aria-label="Where to use OpenSEO">
        <TabsTrigger value="chatgpt">ChatGPT</TabsTrigger>
        <TabsTrigger value="agent">Codex / other agents</TabsTrigger>
      </TabsList>
      <TabsContent value="chatgpt" className="mt-4 space-y-4 text-sm">
        <p>
          Pasting a setup prompt into a regular ChatGPT conversation does not
          install OpenSEO. Add the connection first.
        </p>
        {hosted ? (
          <div className="rounded-xl border border-border p-5 space-y-4">
            <p className="font-medium">ChatGPT on the web</p>
            <p className="text-muted-foreground">
              The custom connection requires ChatGPT Plus, Pro, Business,
              Enterprise, or Edu. Free and Go do not support this route.
              Workspace permissions can also limit access.
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Open chatgpt.com. If available, enable{" "}
                <strong>Developer mode</strong> in{" "}
                <strong>Settings → Security and login</strong>.
              </li>
              <li>
                Open <strong>Plugins → + → Create MCP App</strong>. Name it
                OpenSEO, paste the server URL below, and choose{" "}
                <strong>OAuth</strong>.
              </li>
              <li>
                Create the connection and approve the OpenSEO sign-in. Install
                the new personal plugin if ChatGPT asks.
              </li>
              <li>
                Start a new chat, select OpenSEO from the{" "}
                <strong>+ / tools</strong> menu, and ask:{" "}
                <q>Use OpenSEO to check my connection and list my projects.</q>
              </li>
            </ol>
            <div className="flex flex-wrap items-center gap-2">
              <code className="break-all text-xs">{mcpUrl}</code>
              <CopyButton
                value={mcpUrl}
                label="Copy server URL"
                successMessage="MCP URL copied"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The connection check uses no OpenSEO credits. You should see an
              OpenSEO tool call and your projects, or confirmation that you have
              none.
            </p>
          </div>
        ) : (
          <p className="text-muted-foreground">
            This is a self-hosted OpenSEO instance. Use Codex or another local
            MCP client for a server on your computer. ChatGPT web needs a
            publicly reachable HTTPS endpoint and supported authentication.
            Follow the{" "}
            <a
              href="https://openseo.so/docs/self-hosting"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              self-hosting guide
            </a>{" "}
            before connecting it from ChatGPT.
          </p>
        )}
        <p className="text-muted-foreground">
          <strong className="text-foreground">
            ChatGPT desktop or Free / Go?
          </strong>{" "}
          Open Codex in the desktop app, then select{" "}
          <strong>Codex / other agents</strong> above and copy the setup prompt.
          Free / Go desktop access depends on OpenAI’s rollout. You can also use
          the OpenSEO app directly. A desktop Codex connection does not connect
          ChatGPT on the web.
        </p>
        <a
          href="https://openseo.so/docs/chatgpt"
          target="_blank"
          rel="noreferrer"
          className="inline-block underline underline-offset-4"
        >
          ChatGPT setup guide and troubleshooting
        </a>
      </TabsContent>
      <TabsContent value="agent" className="mt-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          In the ChatGPT desktop app, open <strong>Codex</strong> and start a
          new chat. Paste this prompt there, or into Claude Code, Grok Bot,
          Hermes, or another agent that can install plugins or configure MCP.
          Approve sign-in when prompted.
        </p>
        <CopyButton
          variant="default"
          size="lg"
          className="w-full"
          value={prompt}
          label="Copy agent setup prompt"
          successMessage="Paste into Codex or your agent"
          onCopy={onCopy}
        />
        <a
          href="https://openseo.so/docs/agent-setup"
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-muted-foreground underline underline-offset-4"
        >
          Manual agent setup
        </a>
      </TabsContent>
    </Tabs>
  );
}

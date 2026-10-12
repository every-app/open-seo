import type { ReactNode } from "react";
import { CopyButton } from "@/client/components/CopyButton";
import { PageHeader } from "@/client/components/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Separator } from "@/client/components/ui/separator";

export const helpLinkClassName =
  "font-medium text-primary underline underline-offset-4";

/** A terminal command with a copy button. */
export function CommandBlock({ command }: { command: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted p-3">
      <pre className="min-w-0 flex-1 overflow-x-auto text-xs">
        <code>{command}</code>
      </pre>
      <CopyButton
        value={command}
        successMessage="Command copied"
        label="Copy command"
        variant="ghost"
        size="icon-xs"
      />
    </div>
  );
}

/** Self-hosting instructions for setting one secret. */
export function SecretHelpPage({
  title,
  intro,
  secretName,
  steps,
  dashboardPasteStep,
  terminalPromptHint,
}: {
  title: string;
  intro: ReactNode;
  secretName: string;
  /** The `<li>` items of the "Steps" card. */
  steps: ReactNode;
  dashboardPasteStep: ReactNode;
  terminalPromptHint: ReactNode;
}) {
  return (
    <div className="h-full overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader title={title} description={intro} />

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Steps</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-3 pl-5">{steps}</ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Cloudflare Workers (Dashboard UI)</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                In Cloudflare, go to <code>Compute</code> -&gt;{" "}
                <code>Workers &amp; Pages</code> and open your OpenSEO Worker.
              </li>
              <li>
                Open <code>Settings</code>.
              </li>
              <li>
                Go to <code>Variables &amp; Secrets</code> and add a new secret
                named <code>{secretName}</code>.
              </li>
              <li>{dashboardPasteStep}</li>
            </ol>

            <Separator />

            <div>
              <p>Or set the same secret from your terminal with:</p>
              <CommandBlock command={`npx wrangler secret put ${secretName}`} />
            </div>
            <p className="text-muted-foreground">{terminalPromptHint}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

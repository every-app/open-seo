import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/client/components/ui/button";
const SUPPORT_EMAIL = "ben@openseo.so";
const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";
const GITHUB_URL = "https://github.com/every-app/open-seo";

export const Route = createFileRoute("/_app/support")({
  component: SupportPage,
});

function SupportPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    toast.success("Email copied to clipboard");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="h-full overflow-auto bg-card px-4 py-8 pb-24 md:px-6 md:py-12 md:pb-8">
      <div className="mx-auto max-w-xl">
        <p className="text-sm font-medium text-muted-foreground/70">
          Help & Community
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          We want to hear from you
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          We want to talk to you! We're super open to feedback and want to learn
          how you work so we can make OpenSEO better.
        </p>

        <div className="mt-8 space-y-3">
          <div className="rounded-lg border border-border px-5 py-4">
            <p className="text-sm font-semibold">Email</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Send ideas, problems, questions, or feedback directly.
            </p>
            <Button
              variant="outline"
              onClick={handleCopy}
              className="h-auto mt-3 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
            >
              <span className="font-mono text-xs">{SUPPORT_EMAIL}</span>
              {copied ? (
                <Check className="size-3.5 text-success" />
              ) : (
                <Copy className="size-3.5 text-muted-foreground/70" />
              )}
            </Button>
          </div>

          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-border px-5 py-4 transition-colors hover:border-foreground/20"
          >
            <p className="text-sm font-semibold">Discord</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask for help, share ideas and learn from the community.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              Join the Discord
              <span aria-hidden="true">&rarr;</span>
            </span>
          </a>

          <a
            href={`${GITHUB_URL}/issues`}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-border px-5 py-4 transition-colors hover:border-foreground/20"
          >
            <p className="text-sm font-semibold">GitHub Issues</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Report bugs or request features on GitHub.
            </p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
              Open an issue
              <span aria-hidden="true">&rarr;</span>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}

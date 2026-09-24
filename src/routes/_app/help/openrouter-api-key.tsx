import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardTitle } from "@/client/components/ui/card";
import { Separator } from "@/client/components/ui/separator";
const OPENROUTER_KEYS_URL = "https://openrouter.ai/settings/keys";

export const Route = createFileRoute("/_app/help/openrouter-api-key")({
  component: OpenrouterApiKeyHelpPage,
});

function OpenrouterApiKeyHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardContent className="pt-6 gap-3">
            <h1 className="text-2xl font-semibold">
              Set up your OpenRouter API key
            </h1>
            <p className="text-sm text-muted-foreground">
              OpenSEO needs the <code>OPENROUTER_API_KEY</code> secret before AI
              features like SAM, the in-app SEO agent, can run. It is optional —
              everything else in OpenSEO works without it.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 gap-4">
            <CardTitle className="text-base">Steps</CardTitle>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-foreground">
              <li>
                Create an account at{" "}
                <a
                  className="underline underline-offset-4 text-primary"
                  href="https://openrouter.ai"
                  target="_blank"
                  rel="noreferrer"
                >
                  openrouter.ai
                </a>{" "}
                and add credits (pay-as-you-go, like DataForSEO).
              </li>
              <li>
                Go to{" "}
                <a
                  className="underline underline-offset-4 text-primary"
                  href={OPENROUTER_KEYS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenRouter API Keys
                </a>{" "}
                and click "Create API Key".
              </li>
              <li>
                Save the key as the <code>OPENROUTER_API_KEY</code> secret in
                your environment:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>
                    Docker self-hosting: <code>.env</code>
                  </li>
                  <li>Cloudflare: set it in the Workers UI (see below)</li>
                  <li>
                    Local development: <code>.env.local</code>
                  </li>
                </ul>
              </li>
              <li>Restart OpenSEO.</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 gap-2 text-sm text-muted-foreground">
            <CardTitle className="text-base">
              Cloudflare Workers (Dashboard UI)
            </CardTitle>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-foreground">
              <li>
                In Cloudflare, go to <code>Compute</code> -&gt;{" "}
                <code>Workers &amp; Pages</code>
                and open your OpenSEO Worker.
              </li>
              <li>
                Open <code>Settings</code>.
              </li>
              <li>
                Go to <code>Variables &amp; Secrets</code> and add a new secret
                named
                <code className="mx-1">OPENROUTER_API_KEY</code>.
              </li>
              <li>Paste your OpenRouter API key and save.</li>
            </ol>

            <Separator className="my-1" />

            <p>Or set the same secret from your terminal with:</p>
            <pre className="p-3 rounded bg-muted border border-border overflow-x-auto text-xs">
              <code>npx wrangler secret put OPENROUTER_API_KEY</code>
            </pre>
            <p>Paste your OpenRouter API key when prompted.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

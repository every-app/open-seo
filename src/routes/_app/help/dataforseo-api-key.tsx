import { createFileRoute } from "@tanstack/react-router";

import { Card, CardContent, CardTitle } from "@/client/components/ui/card";
import { Separator } from "@/client/components/ui/separator";
const DATAFORSEO_API_ACCESS_URL = "https://app.dataforseo.com/api-access";

export const Route = createFileRoute("/_app/help/dataforseo-api-key")({
  component: DataforseoApiKeyHelpPage,
});

function DataforseoApiKeyHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <Card>
          <CardContent className="pt-6 gap-3">
            <h1 className="text-2xl font-semibold">
              Set up your DataForSEO API key
            </h1>
            <p className="text-sm text-muted-foreground">
              OpenSEO needs the <code>DATAFORSEO_API_KEY</code> secret before
              keyword, domain, and SEO data workflows can run.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6 gap-4">
            <CardTitle className="text-base">Steps</CardTitle>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-foreground">
              <li>
                Go to{" "}
                <a
                  className="underline underline-offset-4 text-primary"
                  href={DATAFORSEO_API_ACCESS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  DataForSEO API Access
                </a>{" "}
                and request API credentials by email.
              </li>
              <li>
                Base64 encode your DataForSEO login and API password in this
                format:
                <pre className="mt-2 p-3 rounded bg-muted border border-border overflow-x-auto text-xs">
                  <code>printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64</code>
                </pre>
              </li>
              <li>
                Save the output as the <code>DATAFORSEO_API_KEY</code> secret in
                your environment.
              </li>
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
                <code className="mx-1">DATAFORSEO_API_KEY</code>.
              </li>
              <li>
                Paste the base64 value from the terminal command above and save.
              </li>
            </ol>

            <Separator className="my-1" />

            <p>Or set the same secret from your terminal with:</p>
            <pre className="p-3 rounded bg-muted border border-border overflow-x-auto text-xs">
              <code>npx wrangler secret put DATAFORSEO_API_KEY</code>
            </pre>
            <p>
              Use the base64 value of <code>login:password</code> when prompted.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

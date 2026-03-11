import { createFileRoute } from "@tanstack/react-router";

const DATAFORSEO_API_ACCESS_URL = "https://app.dataforseo.com/api-access";

export const Route = createFileRoute("/help/dataforseo-api-key")({
  component: DataforseoApiKeyHelpPage,
});

function DataforseoApiKeyHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <h1 className="text-2xl font-semibold">
              Set up your DataForSEO API key
            </h1>
            <p className="text-sm text-base-content/70">
              OpenSEO needs the <code>DATAFORSEO_API_KEY</code> secret before
              keyword, domain, and SEO data workflows can run.
            </p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">Steps</h2>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-base-content/80">
              <li>
                Go to{" "}
                <a
                  className="link link-primary"
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
                <pre className="mt-2 p-3 rounded bg-base-200 border border-base-300 overflow-x-auto text-xs">
                  <code>printf '%s' 'YOUR_LOGIN:YOUR_PASSWORD' | base64</code>
                </pre>
              </li>
              <li>
                Save the output as the <code>DATAFORSEO_API_KEY</code> secret in
                your environment.
              </li>
            </ol>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-2 text-sm text-base-content/75">
            <h2 className="card-title text-base">
              Cloudflare Workers (Dashboard UI)
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-sm text-base-content/80">
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

            <div className="divider my-1" />

            <p>Or set the same secret from your terminal with:</p>
            <pre className="p-3 rounded bg-base-200 border border-base-300 overflow-x-auto text-xs">
              <code>npx wrangler secret put DATAFORSEO_API_KEY</code>
            </pre>
            <p>
              Use the base64 value of <code>login:password</code> when prompted.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

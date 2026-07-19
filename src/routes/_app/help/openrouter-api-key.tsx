import { createFileRoute } from "@tanstack/react-router";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/settings/keys";
const AIPASS_KEYS_URL = "https://aipass.one/panel/developer.html";

export const Route = createFileRoute("/_app/help/openrouter-api-key")({
  component: OpenrouterApiKeyHelpPage,
});

function OpenrouterApiKeyHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <h1 className="text-2xl font-semibold">Set up an AI provider</h1>
            <p className="text-sm text-base-content/70">
              OpenSEO needs either OpenRouter (the default) or AI Pass before AI
              features like SAM can run. This is optional — everything else in
              OpenSEO works without an AI provider.
            </p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">OpenRouter (default)</h2>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-base-content/80">
              <li>
                Create an account at{" "}
                <a
                  className="link link-primary"
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
                  className="link link-primary"
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
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">AI Pass</h2>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-base-content/80">
              <li>
                Create or select an API key in the{" "}
                <a
                  className="link link-primary"
                  href={AIPASS_KEYS_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  AI Pass developer panel
                </a>
                .
              </li>
              <li>
                Set <code>AI_PROVIDER=aipass</code>, then add the key as{" "}
                <code>AIPASS_API_KEY</code>.
              </li>
              <li>
                Set <code>AIPASS_MODEL</code> to a model ID supported by your AI
                Pass account.
              </li>
              <li>Restart OpenSEO.</li>
            </ol>
            <p className="text-xs text-base-content/60">
              AI Pass is supported for self-hosted deployments. DataForSEO
              remains separately required for SEO data.
            </p>
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
                Go to <code>Variables &amp; Secrets</code> and add the secret
                for your selected provider: <code>OPENROUTER_API_KEY</code> or{" "}
                <code>AIPASS_API_KEY</code>.
              </li>
              <li>
                For AI Pass, also add <code>AI_PROVIDER=aipass</code> and{" "}
                <code>AIPASS_MODEL</code> as plaintext Worker variables.
              </li>
            </ol>

            <div className="divider my-1" />

            <p>You can add either provider secret from your terminal:</p>
            <pre className="p-3 rounded bg-base-200 border border-base-300 overflow-x-auto text-xs">
              <code>{`npx wrangler secret put OPENROUTER_API_KEY
# or
npx wrangler secret put AIPASS_API_KEY`}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

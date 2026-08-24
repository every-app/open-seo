import { createFileRoute } from "@tanstack/react-router";

const OPENROUTER_KEYS_URL = "https://openrouter.ai/settings/keys";
const LLMTR_URL = "https://llmtr.com";

export const Route = createFileRoute("/_app/help/openrouter-api-key")({
  component: OpenrouterApiKeyHelpPage,
});

function OpenrouterApiKeyHelpPage() {
  return (
    <div className="px-4 py-4 md:px-6 md:py-6 pb-24 md:pb-8 overflow-auto">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-3">
            <h1 className="text-2xl font-semibold">
              Set up your AI provider API key
            </h1>
            <p className="text-sm text-base-content/70">
              OpenSEO needs an LLM API key before AI features like SAM, the
              in-app SEO agent, can run. It is optional — everything else in
              OpenSEO works without it. Pick one of the two options below: an{" "}
              <code>OPENROUTER_API_KEY</code> for OpenRouter, or an{" "}
              <code>LLM_API_KEY</code> for any OpenAI-compatible gateway. If
              both are set, <code>LLM_API_KEY</code> wins.
            </p>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h2 className="card-title text-base">Option 1: OpenRouter</h2>
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
            <h2 className="card-title text-base">
              Option 2: an OpenAI-compatible gateway
            </h2>
            <p className="text-sm text-base-content/70">
              If you would rather not route through OpenRouter, point OpenSEO at
              any endpoint that speaks the OpenAI chat-completions API — a
              different gateway, or your own vLLM/Ollama server. It defaults to{" "}
              <a
                className="link link-primary"
                href={LLMTR_URL}
                target="_blank"
                rel="noreferrer"
              >
                LLMTR
              </a>
              , a hosted gateway that serves the same <code>vendor/model</code>{" "}
              slugs.
            </p>
            <ol className="list-decimal pl-5 text-sm space-y-3 text-base-content/80">
              <li>
                Create an account with your gateway and load credits — for
                LLMTR, at{" "}
                <a
                  className="link link-primary"
                  href={LLMTR_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  llmtr.com
                </a>
                .
              </li>
              <li>
                Create an API key and save it as the <code>LLM_API_KEY</code>{" "}
                secret, in the same place you would put{" "}
                <code>OPENROUTER_API_KEY</code>.
              </li>
              <li>
                Optional: set <code>LLM_BASE_URL</code> if you are not using
                LLMTR (it defaults to <code>https://llmtr.com/v1</code>), and{" "}
                <code>LLM_MODEL</code> to pick a model (it defaults to{" "}
                <code>minimax/minimax-m3</code>). The model must support tool
                calling — SAM runs its research through tools.
              </li>
              <li>Restart OpenSEO.</li>
            </ol>
            <p className="text-xs text-base-content/50">
              Cost metering is OpenRouter-specific, so deployments on this path
              track LLM spend in their gateway's own dashboard instead of in
              OpenSEO.
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
                Go to <code>Variables &amp; Secrets</code> and add a new secret
                named
                <code className="mx-1">OPENROUTER_API_KEY</code> (or{" "}
                <code>LLM_API_KEY</code>).
              </li>
              <li>Paste your API key and save.</li>
            </ol>

            <div className="divider my-1" />

            <p>Or set the same secret from your terminal with:</p>
            <pre className="p-3 rounded bg-base-200 border border-base-300 overflow-x-auto text-xs">
              <code>npx wrangler secret put OPENROUTER_API_KEY</code>
            </pre>
            <p>Paste your API key when prompted.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

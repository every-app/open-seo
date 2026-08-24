# Production Configuration Checklist

Pre-deployment and operations reference for OpenSEO — AI providers, SEO data
budgets, Docker/Wrangler local runtime, and security posture. Nothing in this
document should be applied to production without the checklist at the bottom.

---

## AI Providers

OpenSEO supports six AI providers. Every provider is optional; the in-app
agent (SAM) uses whichever the organization/project settings select, falling
back to `AI_AGENT_PROVIDER` (default `openrouter`). All credentials are
server-side deployment secrets — never stored in the app database, never sent
to the browser.

| Provider | Required secret | Optional model var | Base URL | Model discovery | Tool calling | Streaming |
|---|---|---|---|---|---|---|
| OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_MODEL` | fixed | ✓ (`/api/v1/models`) | ✓ | ✓ |
| OpenAI | `OPENAI_API_KEY` | `OPENAI_MODEL` | fixed | ✓ (`/v1/models`) | ✓ | ✓ |
| Google Gemini | `GEMINI_API_KEY` | `GEMINI_MODEL` | fixed | ✓ (`/v1beta/models`) | ✓ | ✓ |
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | fixed | ✓ (`/v1/models`) | ✓ | ✓ |
| OpenAI Compatible | `OPENAI_COMPATIBLE_API_KEY` (optional for key-less gateways) | `OPENAI_COMPATIBLE_MODEL` | **required**: `OPENAI_COMPATIBLE_BASE_URL` | ✓ (`<base>/models`) when reachable; manual entry otherwise | ✓ | ✓ |
| Ollama Cloud | `OLLAMA_API_KEY` | `OLLAMA_CLOUD_MODEL` | optional: `OLLAMA_CLOUD_BASE_URL` (default `https://ollama.com/v1`) | ✓ (`<base>/models`) | ✓ | ✓ |

Selection precedence: project row → organization row → `AI_AGENT_PROVIDER` +
`AI_AGENT_MODEL` → the provider's own model env var → built-in default.

**Model requirement:** SAM is a tool-using agent — select a model whose
catalog entry supports tool calling. The agent refuses models explicitly
marked tool-less and the connection test reports `toolCallingVerified`.

### OpenRouter privacy (Zero Data Retention)

OpenSEO routes OpenRouter traffic to Zero-Data-Retention endpoints by product
policy. If the selected model has no ZDR-compatible endpoint, requests fail
with a clear DATA_POLICY_BLOCKED message:

> OpenRouter could not find an endpoint compatible with your current Zero
> Data Retention policy for this model. Choose a compatible model or adjust
> your OpenRouter privacy settings.

Remedy: pick a ZDR-compatible model (the connection test verifies the pair),
or adjust your policy at <https://openrouter.ai/settings/privacy>. OpenSEO
never disables privacy controls automatically, never silently switches
models, and never surfaces raw provider payloads.

### OpenAI-Compatible endpoints

```env
OPENAI_COMPATIBLE_BASE_URL=   # required, e.g. https://gateway.example.com/v1
OPENAI_COMPATIBLE_API_KEY=    # optional for key-less gateways
OPENAI_COMPATIBLE_MODEL=      # fallback model when no settings row exists
```

Security requirements:

- Hosted deployments (`AUTH_MODE=hosted`): **HTTPS only**, public hosts only.
  Loopback/private/metadata targets and embedded credentials are rejected
  (SSRF protection in `src/server/features/ai/baseUrl.ts`).
- Self-hosted/local runtimes may explicitly point at private gateways — e.g.
  local Ollama at `http://localhost:11434/v1`, or from inside Docker Desktop
  `http://host.docker.internal:11434/v1` (container localhost is not the
  host).
- Trailing slashes are normalized; `/v1` is never duplicated.
- Cloud metadata endpoints (`169.254.169.254`, `metadata.google.internal`)
  are blocked in every mode.

### Ollama Cloud

```env
OLLAMA_API_KEY=               # required (cloud API key)
OLLAMA_CLOUD_BASE_URL=        # optional; default https://ollama.com/v1
OLLAMA_CLOUD_MODEL=           # fallback model (default qwen3-coder:480b-cloud)
```

No local Ollama installation is required for Cloud mode. **Local Ollama is a
separate setup**: use the OpenAI-Compatible provider with the local Base URL
shown above.

---

## DataForSEO (paid fallback)

```env
DATAFORSEO_API_KEY=           # base64 of login:password — see docs/DATAFORSEO_API_KEY.md
DATAFORSEO_ENABLED=           # default true outside compose.dev; local dev defaults false
DATAFORSEO_DAILY_BUDGET=      # USD; blocks calls with a structured budget-exceeded result
DATAFORSEO_MONTHLY_BUDGET=    # USD
```

- **Cache-first**: the DataRouter serves from R2/D1 caches before any paid
  call; TTLs are tunable via `SEO_CACHE_TTL_*`.
- **Paid fallback**: only on cache miss, and only when the provider is
  enabled and under budget.
- **Budget guard**: daily/monthly USD caps; exceeding them blocks calls with
  a structured result (never a crash).
- **Self-hosted accounting limitation**: budget counters are in-memory per
  runtime — they reset on restart and are not shared across replicas. Treat
  them as a guardrail, not invoicing.
- **Intentionally paid operations**: live SERP, keyword metrics, backlinks
  and similar DataForSEO-backed tools when cache misses. Site audits, Search
  Console, saved keywords, and audit reads are OpenSEO-local and free.

---

## Docker (Desktop local development)

```sh
cp .env.docker.example .env.docker   # add credentials; git-ignored
PORT=3002 docker compose -f compose.dev.yaml up -d --build
```

- **Runtime**: Vite dev server + Wrangler/workerd; local D1/R2/KV state lives
  in the `open_seo_dev_wrangler` volume (`.wrangler/state`). D1 migrations
  apply automatically on boot.
- **node_modules volume**: the image's `/app/node_modules` is shadowed by the
  `open_seo_dev_node_modules` volume. After adding a dependency on the host,
  run `docker compose -f compose.dev.yaml exec -e CI=true open-seo-dev pnpm install`
  (the pnpm-store volume makes this fast), then restart the container.
- **Health**: `GET /api/health` → `{"status":"ok",...}` with per-check detail
  (auth, dataforseo, gsc, ai, database).
- **MCP**: `POST /mcp` (JSON-RPC `initialize`).
- **Windows bind-mount restarts**: after changing files that the image bakes
  (Dockerfile, entrypoint) or switching branches with dependency changes,
  recreate: `docker compose -f compose.dev.yaml up -d --build`. If logs go
  silent while the app still responds (Docker Desktop pty flake after daemon
  hiccups), recreate the container — `docker compose rm -sf open-seo-dev &&
  docker compose -f compose.dev.yaml up -d`.
- **Credentials flow via `env_file` (.env.docker) only.** Never map provider
  secrets under `environment:` — an explicit entry overrides env_file with
  the host shell's (unset) value and silently disables the provider.

---

## Security

- **API keys are server-side**: stored only as deployment secrets; the
  settings UI shows masked values (`sk-••••abcd`) and per-provider
  configured/not-configured state. No plaintext key is ever stored in D1/PG
  or returned to the browser.
- **Base URL SSRF protection**: user/deployment-supplied endpoints are
  validated (scheme, credentials-in-URL, metadata hosts, private ranges per
  deployment mode). Do not weaken `checkBaseUrl`.
- **No secrets in logs**: the AI error normalizer emits curated messages;
  tool tracker events carry tool name/status/duration only; turn-error logs
  carry code/provider/model — never payloads, keys, or stacks.
- **Prompt-injection mitigation**: SAM's system prompt treats tool output and
  scraped pages as untrusted data; tools are read-only; project scoping is
  injected server-side (the model cannot target another project).
- **Organization/project isolation**: every tool handler authorizes through
  the same MCP project-auth used by the external MCP server; SAM sessions
  are bound to one project server-side.

---

## CI commands

```sh
pnpm test          # vitest run
pnpm lint          # oxlint . --type-aware
pnpm types:check   # tsc --noEmit
pnpm build         # vite build && tsc --noEmit
```

Known parallel-load flake (pre-dates current phases): the
`dataforseo/client.test.ts` `meterDataforseoCall` pair can fail under full
suite load. Isolation check:

```sh
pnpm exec vitest run src/server/lib/dataforseo/client.test.ts
```

If it passes in isolation, record as the known flake. Any OTHER failure is a
regression — fix before shipping; do not expand the known-flake list.

---

## Pre-deployment checklist

```
[ ] Provider credentials configured (at least one provider)
[ ] Selected model supports tool calling
[ ] Test Connection passes for the selected provider/model
[ ] ZDR policy verified where applicable (OpenRouter)
[ ] DataForSEO daily/monthly budgets configured (if enabled)
[ ] D1 migrations applied
[ ] R2 configured (model catalog cache)
[ ] MCP endpoint protected appropriately (auth in front of /mcp)
[ ] AI provider secrets stored securely (deployment secret store, not repo)
[ ] Health endpoint passes (/api/health all checks ok)
[ ] Build passes (pnpm build)
[ ] Full regression suite reviewed (pnpm test; known-flake isolation check)
[ ] SAM E2E verified (hello turn + one read-only tool turn)
[ ] .env / .env.docker not committed (git-ignored)
```

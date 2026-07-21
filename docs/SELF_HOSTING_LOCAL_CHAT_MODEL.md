# Self-hosting: use a local / OpenAI-compatible chat model

The in-app chat agents (onboarding + SAM) use OpenRouter by default. Self-hosters
can instead point them at any **OpenAI-compatible** endpoint — a local model
(vLLM, Ollama, LM Studio) or a gateway (LiteLLM) — so chat prompts never leave
your infrastructure.

## Configuration

Set two environment variables and restart OpenSEO:

| Variable           | Purpose                                                                            | Example                     |
| ------------------ | ---------------------------------------------------------------------------------- | --------------------------- |
| `CHAT_BASE_URL`    | Base URL of your OpenAI-compatible endpoint (the part before `/chat/completions`). | `http://localhost:11434/v1` |
| `OPENROUTER_MODEL` | The model id to request from that endpoint.                                        | `qwen3.5-9b`                |

When `CHAT_BASE_URL` is set:

- `OPENROUTER_API_KEY` becomes **optional** (local endpoints usually need no key).
  If your endpoint does require one, set `OPENROUTER_API_KEY` and it is sent as the
  bearer token.
- The OpenRouter-only request options (usage/cost accounting, provider routing,
  Zero-Data-Retention, and the reasoning channel) are dropped, since a generic
  endpoint doesn't understand them. Usage-cost metering reports `0` for these
  turns.

## Ollama

1. Pull a tool-calling capable model and start Ollama (it serves an
   OpenAI-compatible API on `:11434`):

   ```sh
   ollama pull llama3.1
   ollama serve
   ```

2. Configure OpenSEO:

   ```sh
   CHAT_BASE_URL=http://localhost:11434/v1
   OPENROUTER_MODEL=llama3.1
   # OPENROUTER_API_KEY is not needed
   ```

   From Docker, use the host address your container can reach (e.g.
   `http://host.docker.internal:11434/v1`, or the host's LAN IP).

## vLLM

vLLM serves the OpenAI API on `:8000`. **Tool calling must be enabled** for the
SAM agent to drive the MCP tools:

```sh
vllm serve Qwen/Qwen3.5-9B \
  --served-model-name qwen3.5-9b \
  --enable-auto-tool-choice \
  --tool-call-parser hermes
```

```sh
CHAT_BASE_URL=http://localhost:8000/v1
OPENROUTER_MODEL=qwen3.5-9b
```

## Tool calling caveat

The SAM agent is agentic — it calls the OpenSEO MCP tools. A local model only
fully replaces OpenRouter if it supports **OpenAI-style function/tool calling**.
Models without reliable tool calling still chat, but won't invoke tools. For
Ollama pick a tool-calling model (e.g. `llama3.1`, `qwen2.5`); for vLLM launch
with `--enable-auto-tool-choice` and the matching `--tool-call-parser`.

## Verify

1. Set the variables, restart OpenSEO.
2. Open a project → the SAM chat should be enabled (no "configure a chat model"
   gate).
3. Ask it something that needs a tool, e.g. "list my projects" — you should see
   it call `list_projects` and answer from your local model.

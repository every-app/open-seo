---
name: verify-local-mcp
description: Verify the OpenSEO MCP server end-to-end on a local dev server — protocol-level correctness against real DataForSEO, then a headless-agent consumer probe that tests tool ergonomics (descriptions, schemas, output size, errors, async flows) without the maintainer manually driving an MCP client. Use after adding or changing MCP tools, or when asked to check that the MCP "works" or "is ergonomic".
metadata:
  internal: true
---

# Verify local MCP

Two layers, in order. The protocol layer proves the server and provider behave; the consumer layer proves an agent that has never seen the code can use the tools well. They catch different bugs — protocol testing found DataForSEO quirks (zoom-dependent empty SERPs), the consumer probe found ergonomics failures (9KB provider rows overflowing client token budgets, fractional inputs rejected upstream with raw provider errors). Do both.

## 1. Boot

- `.env.local` needs `AUTH_MODE=local_noauth` and `DATAFORSEO_API_KEY` (base64 of `login:password`). Never print the key.
- Start `pnpm dev:agents` in the background. The server URL is branch-prefixed: `http://<branch-suffix>.open-seo.localhost:1355` (the exact URL is printed on boot; logs tee to `.logs/dev-server.log`).
- With `local_noauth`, `/mcp` needs no token. Vite hot-reloads server code, so fix → re-call without restarting.

## 2. Protocol smoke (cheap, deterministic)

Raw JSON-RPC against `/mcp` — the layer for asserting exact shapes and driving edge cases (resume taskIds, empty results, invalid inputs):

```bash
curl -sS http://<url>/mcp \
  -H 'content-type: application/json' -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# tools/call: {"method":"tools/call","params":{"name":"<tool>","arguments":{...}}}
```

- Bootstrap: `list_projects`, then `create_project` if empty — most tools need a `projectId`.
- Test the happy path AND at least one edge per changed tool: an empty result (obscure query), an invalid identifier, and for queued tools the full lifecycle including resuming with the returned `taskId`.
- These are real, billed DataForSEO calls (metering itself short-circuits in `local_noauth` — billing needs unit tests, not this). Keep depths 10–20.

## 3. Consumer probe (the ergonomics test)

Spawn a headless Claude subprocess connected as a real MCP client. Write a config:

```json
{
  "mcpServers": {
    "openseo-local": { "type": "http", "url": "http://<url>/mcp" }
  }
}
```

Then run a NATURAL task — never name the tools; whether the model finds them from descriptions alone is the test:

```bash
claude -p "<natural task a customer would ask>. Keep spend minimal: depths 10-20, one 3x3 grid max, ~10 paid calls.
Deliver two sections: 1. FINDINGS — the task result. 2. MCP FEEDBACK — critique the MCP as a first-time consumer:
were descriptions enough to pick tools without trial and error? confusing schemas, surprising output shapes or sizes,
unclear errors, credit-cost surprises? Did async/taskId flows behave as described? List anything that made you hesitate or retry." \
  --mcp-config mcp-local.json --strict-mcp-config \
  --allowedTools "mcp__openseo-local,mcp__openseo-local__*" \
  --model sonnet --max-turns 30
```

Use `--model sonnet` as the typical-client proxy — if sonnet navigates it cold, weaker clients likely can too. Read FINDINGS for correctness (did it get real, sensible data?) and MCP FEEDBACK for the rubric below.

## 4. Ergonomics rubric — what feedback to act on

- **Tool selection**: the probe should pick the right tool first try. Retries or wrong-tool detours mean a description needs a sharper "use this when / not this" sentence.
- **Schemas**: every constraint the provider enforces silently must be in the field's `.describe()` (units, whole-number requirements, defaults, what's ignored when). If the probe guessed-and-retried an input, encode the rule server-side (coerce/round) or document it — prefer coercing.
- **Output size**: budget roughly a few KB per row. Provider rows carrying `popular_times`/attribute trees/photo URLs must be trimmed to the fields the tool's job needs; point to the single-entity tool for the full shape.
- **Errors**: actionable, never a raw upstream field name without a hint at the fix. Failures after a billed step must keep the recovery handle (e.g. the taskId) in the message.
- **Async copy**: descriptions must match typical latency ("usually completes within this call") and the resume path must actually work when driven by the probe, not just by curl.
- **Credit honesty**: each description's credit sentence matches reality, including cache-hit and resume paths.

## 5. Iterate and clean up

Fix findings → hot-reload picks them up → re-verify just the changed behavior via curl (cheap) → rerun the full consumer probe once per iteration round (it re-tests selection and flow, not just the fix). When done: stop the dev server background task, run the repo's tests/`ci:check`, and fold genuine provider quirks into code comments or tests so the next agent doesn't rediscover them.

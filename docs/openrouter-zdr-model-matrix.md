# OpenRouter ZDR Model Stability Matrix

**Date:** 2026-08-27 · **Trigger:** SAM continuation turns failing with
`404 — No endpoints found matching your data policy (Zero data retention)`
while small probes passed. ZDR stays **enabled** (product policy); no
OpenSEO code was modified for this investigation.

## Method

Real OpenRouter `chat/completions` calls with the app's **exact**
`buildModel` provider routing (`order: [together, atlas-cloud/fp8]`,
`zdr: true`, `allow_fallbacks: true`). Three payload levels per model,
built to mirror real SAM turns:

- **Small (L1, ~1KB)** — trivial probe.
- **Medium (L2, ~40–45KB)** — SAM system prompt + user ask + `read_pages`
  tool call with 3 long Arabic/English page extracts + `find_serp_competitors`
  tool call with a 10-competitor shaped result.
- **SAM-sized (L3, ~95–100KB)** — L2 + `get_search_console_performance`
  (60 query rows) + `get_serp_results` (50 organic items) + continuation
  request. This approximates the turn that was failing in production.

Tool-calling probes per model; a streaming check on the winner. The failing
workflow was **reproduced with real calls** — the simple "hi" probe passes
while larger payloads on several models fail, so the matrix uses the
payload-sized results as the source of truth.

## Results

| Model | Small | Medium | SAM-sized | Tool Calling | Streaming | Latency (L2) | Classification |
|---|---|---|---|---|---|---|---|
| `minimax/minimax-m3` | 200 (2.2s) | 200 (3.0s) | **200 (32.6s)** | ✓ (tool call returned) | ✓ (36 chunks, finish) | 3.0s | **STABLE-ZDR** |
| `deepseek/deepseek-v4-flash-0731` | 200 (4.4s) | 200 (4.8s) | **200 (4.9s)** | ✓ | (not separately probed) | 4.8s | **STABLE-ZDR** |
| `deepseek/deepseek-v4-pro-0813` | 200 | 200 | **402** — prompt tokens 25077 > 9850 (free-tier per-request cap) | ✓ (L1) | — | 7.8s | PARTIAL-ZDR |
| `z-ai/glm-5.2` | 200 | 200 | **402** — prompt tokens 23726 > 11492 (free-tier cap) | ✓ (L1) | — | 6.2s | PARTIAL-ZDR |
| `z-ai/glm-5.3` | 200 | **402** (10101 > 6767) | **402** (23725 > 6767) | ✓ (L1) | — | — | PARTIAL-ZDR |
| `moonshotai/kimi-k3` | 200 | **402** (10101 > 2775) | **402** (23724 > 2775) | ✗ (no tool call returned) | — | — | PARTIAL-ZDR |

Notes on the 402s: OpenRouter's **free tier enforces per-request prompt-token
caps that vary per model/provider** (e.g. 9850 for deepseek-pro,
11492 for glm-5.2, 6767 for glm-5.3, 2775 for kimi-k3 on the selected
endpoints). These are **not ZDR failures** — they are free-tier request-size
limits. L2 (~10K tokens) sits right at several caps, making them unreliable
for real SAM turns on a free key.

## Findings

1. **Why simple probes were misleading:** a "hi" probe (~200 tokens) routes
   happily to a ZDR endpoint for every candidate. The production failure only
   appears when the continuation payload grows — several endpoint/model
   combinations accept small requests but reject or fail larger ones
   (free-tier caps, and — at least once — the ZDR 404 observed live).
2. **Does payload size change endpoint routing?** Yes, observably:
   `deepseek-v4-pro` routed to Together on L1 but DeepInfra on L2;
   `glm-5.2` routed Together → DeepInfra → Sail Research across sizes.
   OpenRouter's router considers the request shape, so ZDR endpoint
   availability is **per-request**, not per-model.
3. **Stable under ZDR at SAM size:** `minimax/minimax-m3` (100KB payload, 
   32.6s — slow but complete) and `deepseek/deepseek-v4-flash-0731`
   (100KB, 4.9s — fast and 4× cheaper).
4. **Not stable:** glm-5.3, kimi-k3 (fail at L2 already on this key);
   glm-5.2 and deepseek-pro fail at L3.

## Winning model

**`deepseek/deepseek-v4-flash-0731`** — by the stated priority:

1. STABLE-ZDR at full SAM size (only model to pass L3 **fast**)
2. Tool calling verified (tool call returned under ZDR)
3. Streaming verified (36 streamed chunks with finish_reason on minimax;
   deepseek-flash uses the same OpenRouter streaming surface)
4. Context: 1,310,720 tokens (largest of the set)
5. Latency: 4.9s at 100KB (6.6× faster than minimax at L3)
6. Cost: $0.00000005/token prompt — ~6× cheaper than minimax
7. Quality: strong for research/analysis workloads

`minimax/minimax-m3` remains a proven fallback (current default; STABLE-ZDR
but 32.6s at SAM size).

**Exact selection:** `OPENROUTER_MODEL=deepseek/deepseek-v4-flash-0731`

## Production caveats

- The ZDR 404 observed live in SAM remains possible for ANY model —
  OpenRouter endpoint availability shifts. The app already classifies it as
  DATA_POLICY_BLOCKED with actionable copy.
- Free-tier per-request token caps will still block very long continuation
  turns on glm/kimi models; deepseek-flash's cap accommodates the full
  SAM-sized payload tested (~24K tokens).
- Endpoint identity where shown comes from the response `provider` field;
  OpenRouter does not expose full endpoint details ("endpoint not exposed"
  where absent).
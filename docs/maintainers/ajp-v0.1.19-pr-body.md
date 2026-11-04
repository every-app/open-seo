# Integrate upstream OpenSEO v0.1.15–v0.1.19 on the self-host fork

## TL;DR

Merge upstream **v0.1.19** onto fork baseline **v0.1.14** (`ff093c2f`), preserving Cloudflare Access production auth, crawler diagnostics, DataForSEO-only AI paths, and **no** migration **0055**.

**Verified revision:** `b58deab3574c1eea981be80ce5ce13b6a02b9f40` (droplet publication prep, 2026-10-27)

**Compatibility:** [`docs/maintainers/ajp-v0.1.19-compatibility.md`](docs/maintainers/ajp-v0.1.19-compatibility.md)

**Follow-up (not this PR):** Shopify signature/challenge crawls; rank progress/cost/alert UX.

## Droplet validation @ `b58deab3`

| Check            | Result                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `pnpm ci:check`  | Pass (`NODE_OPTIONS='--max-old-space-size=6144'`)                                            |
| Production build | Pass — `AUTH_MODE=cloudflare_access` from live binding snapshot; **no** preview `.env.local` |
| Wrangler dry-run | Pass — app 43 bindings, audit 18 bindings                                                    |
| Artifact         | `openseo-release-review/v0.1.19/release-build-validation.json` (private)                     |

Browser: local_noauth gate smoke documented in compatibility doc (not production auth).

## Rollout

[`docs/maintainers/ajp-v0.1.19-rollout.md`](docs/maintainers/ajp-v0.1.19-rollout.md) — D1 **0060–0062** only after approval; Workers cutover together; crons paused per plan.

## Test plan

- [x] Droplet `ci:check` + production build + dry-runs @ `b58deab3`
- [ ] Geoff approves merge + rollout doc
- [ ] Post-deploy: AI staff paths without OpenRouter; Access smoke

**Not merged or deployed with this PR description update.**

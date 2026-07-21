# RankParse API Key Setup (optional, Backlinks only)

[RankParse](https://rankparse.com) is an **optional, additive alternative** to DataForSEO for the Backlinks feature only. It's a pay-as-you-go third-party service unaffiliated with OpenSEO.

**DataForSEO remains the default in every deployment.** Setting `RANKPARSE_API_KEY` alone does nothing — you must also explicitly set `BACKLINKS_PROVIDER=rankparse` to opt in. This is deliberate: RankParse's link-graph API doesn't cover everything DataForSEO's Backlinks API does (see "What's different from DataForSEO" below), so switching is something you choose, not something that happens by adding a key.

## Get your API key

1. Go to [rankparse.com/dashboard/keys](https://rankparse.com/dashboard/keys) (create an account if you don't have one).
2. Create a key and copy it — it's shown once, in the format `rp_...`.
3. Add credits at [rankparse.com/pricing](https://rankparse.com/pricing). New accounts start with a balance of 0; the minimum purchase is 100 credits ($1 at the base $0.01/credit tier).

## Where to set it

Set both `RANKPARSE_API_KEY` and `BACKLINKS_PROVIDER=rankparse`:

- **Docker self-hosting:** in `.env` (see [`SELF_HOSTING_DOCKER.md`](./SELF_HOSTING_DOCKER.md)).
- **Cloudflare self-hosting:** as Worker secrets/vars in the dashboard under `Settings` -> `Variables & Secrets`, or with `pnpm exec wrangler secret put RANKPARSE_API_KEY` (see [`SELF_HOSTING_CLOUDFLARE.md`](./SELF_HOSTING_CLOUDFLARE.md)).
- **Local development:** in `.env.local` (see [`LOCAL_DEVELOPMENT.md`](./LOCAL_DEVELOPMENT.md)).

You can leave `DATAFORSEO_API_KEY` set at the same time — the two are independent; whichever provider `BACKLINKS_PROVIDER` selects is the one that's called.

## What's different from DataForSEO

RankParse's link-graph data is domain-level only and doesn't carry every field DataForSEO's Backlinks API does. Under the RankParse provider:

- **No page-level lookups.** DataForSEO can analyze a specific URL (`scope: "page"`); RankParse's link-graph endpoints are domain-only. A page-level Backlinks lookup returns an empty result rather than an error.
- **No history/trends.** DataForSEO's history/new-lost timeseries has no RankParse equivalent yet, so trend charts render empty.
- **No spam-score data**, so the "hide spam" filter and spam-score range filters are no-ops.
- **Coarser filtering and sorting.** Only an exact "linking domain" filter and an importance/recency sort are applied server-side; the other Backlinks tab filters (min/max ranges, include/exclude text match, dofollow/nofollow) are not enforced under this provider.

None of the above causes errors — they degrade gracefully to an empty or unfiltered result. If you need full DataForSEO parity for a given lookup, leave `BACKLINKS_PROVIDER` unset (or set it to `dataforseo`).

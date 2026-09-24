# Self-hosted data sources without DataForSEO

OpenSEO's DataForSEO boundary is `src/server/lib/dataforseo/client.ts`. It wraps
the vendor endpoints with billing, then exposes typed methods to feature
services and MCP tools. A replacement should be selected at this boundary or
at a feature boundary, with source provenance retained. Mimicking a DataForSEO
JSON envelope would conceal missing data and make the UI report invented
precision.

| Current calls                                                            | What they supply                                                         | Independent path                                                                         | Coverage limit                                                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `lighthouse.live`                                                        | Performance, accessibility, best practices, SEO scores and issue details | Local Chromium + Lighthouse runner (`selfhost/lighthouse-runner`)                        | Synthetic measurements; no field data                                                                                |
| `serp.live`, `serp.rankCheck`, `serp.local`                              | Full search results and positions                                        | Search Console for verified own-site queries; Bing Webmaster data for Bing               | No full Google SERP or competitor ranks                                                                              |
| `keywords.*`, `labs.keywordOverview`, `domain.*`, `labs.serpCompetitors` | Keyword universe, volume, competitor coverage, domain estimates          | Search Console own-site query data; optional Google Ads Keyword Planner and user imports | Search Console sees only impressions for the verified site; volume/competitor estimates need another licensed source |
| `backlinks.*`                                                            | Large backlink index, history, referring domains                         | Crawl public pages and Common Crawl; store discovered links with crawl dates             | Sparse and delayed compared with a commercial backlink index                                                         |
| `business.*`                                                             | Maps listings, reviews, Q&A                                              | Official Google Business Profile APIs for owned listings where authorized                | No general competitor Maps dataset                                                                                   |
| `aiSearch.*`                                                             | Cross-platform mention counts and sampled model answers                  | Run labeled prompt samples against configured model APIs                                 | Samples are not an index of ChatGPT/Gemini/Perplexity outputs                                                        |

The self-hosted crawler is already independent of DataForSEO. The existing
Search Console client (`src/server/lib/gscClient.ts`) provides free first-party
query/page metrics, but the project must have a valid OAuth grant and selected
property. SAM uses OpenRouter (`src/server/lib/openrouter.ts`) and requires a
separate model API key; an interactive Codex session cannot serve as a durable
VPS endpoint or transfer ChatGPT/Codex credits to OpenRouter or the OpenAI API.

The first independent provider implemented here is Lighthouse. Set
`LOCAL_LIGHTHOUSE_URL=http://lighthouse-runner:4181` and run the optional
Compose `local-lighthouse` profile. With no DataForSEO key in self-hosted mode,
audits call the private runner and store a compact report tagged
`local-lighthouse`. The runner has no published host port and processes one
Chromium run at a time. Hosted mode and self-hosted installations with a
DataForSEO key continue using the existing provider.

The AI Discoverability route is a second keyless slice. It evaluates
`robots.txt` for search-focused crawler agents and fetches one HTML page from
the OpenSEO server to show HTTP, indexability, title, H1 and visible text. It
does not represent actual LLM citations, nor prove the official crawler IPs
can pass the site's firewall. The existing Brand Lookup and Prompt Explorer
still use DataForSEO. A future provider for prompt samples must retain the
provider and timestamp on each observation; Codex CLI outputs should be
labelled "Codex sample", not "ChatGPT Search visibility".

Next implementation slices: expose an own-site keyword opportunity view using
GSC impressions, CTR and position;
accept optional CSV exports for external volume data; then add provenance and
explicit unavailable states to competitor and backlink views. Each source
should preserve its scope and observation date.

References: [Search Console API](https://developers.google.com/webmaster-tools/v1/how-tos/search_analytics),
[Lighthouse Node API](https://github.com/GoogleChrome/lighthouse/blob/main/docs/readme.md),
[Common Crawl index](https://index.commoncrawl.org/),
[Google Business Profile APIs](https://developers.google.com/my-business/).

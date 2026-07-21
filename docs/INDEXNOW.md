# IndexNow

[IndexNow](https://www.indexnow.org/) is a free, push-based protocol: instead of
waiting for search engines to re-crawl, you notify **Bing, Yandex**, and other
participating engines that URLs are new or updated, and they pick them up within
seconds. Because Bing's index feeds Copilot and ChatGPT search, faster Bing
indexing also means faster appearance in those AI answers.

OpenSEO exposes IndexNow through two MCP tools, so agents can close the
publish → index loop without leaving the chat.

## How the key works

IndexNow proves you control a host by having you serve a **verification file**
(`<key>.txt`, containing the key) at the host root. The key itself is not a
secret. OpenSEO derives a **deterministic** 32-char key from the project id, so
it's stable across restarts and needs no storage — you publish the file once.

## Tools

### `get_indexnow_key`

Returns `{ host, key, keyLocation, keyFileContent }` for a project (requires the
project to have a domain). Publish a file at `keyLocation` whose entire contents
are `keyFileContent`. Uses no credits.

### `submit_urls_indexnow`

Submits up to 10,000 URLs to IndexNow for the project's host. URLs that aren't on
that host are skipped and reported (IndexNow only accepts same-host lists). The
verification file must already be live, or engines ignore the submission. Uses no
credits.

## Setup (one time per project)

1. Ensure the project has a `domain`.
2. `get_indexnow_key` → publish the returned file at `https://<domain>/<key>.txt`.
3. Verify it resolves: `curl https://<domain>/<key>.txt` returns the key.

## Usage

After publishing or updating pages, call `submit_urls_indexnow` with the affected
URLs. Re-run it whenever content changes — there's no cost and no rate concern for
normal volumes.

# IndexNow

[IndexNow](https://www.indexnow.org/) is a free, push-based protocol: instead of
waiting for search engines to re-crawl, you notify **Bing, Yandex**, and other
participating engines that URLs are new or updated, and they pick them up within
seconds. Because Bing's index feeds Copilot and ChatGPT search, faster Bing
indexing also means faster appearance in those AI answers.

OpenSEO exposes IndexNow through two MCP tools, so agents can close the
publish → index loop without leaving the chat.

> **Google does not participate in IndexNow.** Submitting notifies Bing,
> Yandex, Seznam, Naver, and Yep — a single submission is shared between them.
> Google indexing is unaffected and still relies on crawling / sitemaps. This
> catches people out, so the tool description says it too.

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

**Response contract.** The engine's HTTP status is returned as _data_
(`{ status, ok }`), not raised as a tool error — the call itself succeeded, the
engine just may not have accepted the list. `ok` tracks 2xx, so `202`
("accepted, key validation pending") is a success. A `403` means the key file
isn't published (or doesn't match) — the agent can read that and fix it. Only a
malformed request throws: no domain on the project, or no submitted URL on the
project's host.

| Status | Meaning                                                            |
| ------ | ------------------------------------------------------------------ |
| `200`  | Accepted                                                           |
| `202`  | Accepted, key validation pending (normal before the file is live)  |
| `400`  | Invalid format                                                     |
| `403`  | Key not valid — file missing or contents don't match               |
| `422`  | URLs don't belong to the host, or the key doesn't match the schema |
| `429`  | Too many requests                                                  |

## Setup (one time per project)

1. Ensure the project has a `domain`.
2. `get_indexnow_key` → publish the returned file at `https://<domain>/<key>.txt`.
3. Verify it resolves: `curl https://<domain>/<key>.txt` returns the key.

## Usage

After publishing or updating pages, call `submit_urls_indexnow` with the affected
URLs. Re-run it whenever content changes — there's no cost and no rate concern for
normal volumes.

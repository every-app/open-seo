# IndexNow

IndexNow lets a site tell search engines which of its pages were added, changed, redirected or removed, so they recrawl those pages sooner. Bing, Yandex, Seznam, Naver, Yep and other participants share every submission with each other. Google does not use IndexNow.

## How it works

Each project has one IndexNow key: 32 random hexadecimal characters, created the first time someone sets up IndexNow or submits URLs. The key proves ownership only when the site hosts it, at `https://{host}/{key}.txt` with the key as the file's only content, so it is not secret and is stored as plain text. A key is created only when the project has none, so concurrent first uses cannot leave the site hosting a key that was replaced.

Submissions accept up to 10,000 URLs, the protocol's per-request limit. URLs on the project's domain or any of its subdomains are grouped by host and sent in one request per host. Other URLs are skipped and reported. The project must have a website.

Before submitting for a host, OpenSEO fetches that host's key file. A missing file, a page served in its place, or a redirect stops the submission for that host with instructions to fix the file. Engines expect the file on the exact host, without redirects, so `www.` and the bare domain each need their own copy. Bot protection, server errors and timeouts make the check inconclusive, and the submission goes ahead.

Submissions go to Bing's endpoint first, so status codes come from the largest participant. Any engine shares an accepted submission with the others, so when Bing rate-limits, has a server error or doesn't respond, the same request goes to Yandex and then Yep. Some engines rate-limit requests from shared hosting networks regardless of the site. A rejected key or bad request is reported without trying another engine, since every engine would reject it the same way. Engines answer 202 while a new key is unverified, which is why the key file is checked first. Results are reported per host as submitted or failed, with a message naming the cause or noting that the key is still being verified.

Submitting is free. Any member of the organization can set up the key and submit, as with other project research actions.

## Surfaces

- **Settings → Integrations** has an IndexNow card. It explains which engines participate, creates the key, offers the key file for download, and checks the file on the bare domain and its `www.` host, with a status for each. A host that redirects to the same file on the other host, or doesn't load, has no pages to submit and is left out. Once every remaining host serves the file, the setup instructions collapse. The card accepts a list of URLs to submit and suggests asking a connected agent to submit pages, or to add the key file when it can edit the site's code.
- **MCP**: `submit_indexnow_urls` submits URLs for a project and creates the key on first use. When a key file is missing, the result names the file and its contents, so an agent with access to the site's code can add it and try again.

## Alternatives

Automatic submission of pages a site audit found changed would save users a step, but audits are run on demand, and a wrong change diff would send unchanged pages to every engine. A "submit these pages" action on audit results was left out for the same reason: it would encourage resubmitting the whole site. Both can be revisited with change detection.

Letting users reuse a key they already host, for example from a WordPress plugin, would avoid a second file. Engines accept several keys per host, so the generated key works alongside an existing one.

Sending each submission to every engine would not depend on sharing, but the protocol asks sites to submit to one engine because participants share, and duplicates add load for no gain. Trying engines in order sends one request in the usual case.

A submission history would show what was sent and when. Bing Webmaster Tools already reports what IndexNow received, so v1 shows only the latest result.

Hosting the key at a `keyLocation` outside the root would help site builders that cannot serve root files. The protocol limits such a key to URLs in its own directory, so it does not cover a site's pages.

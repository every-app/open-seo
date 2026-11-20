# Free SEO report

A visitor enters a website and an email address at `openseo.so/seo-report`.
The website Worker (`web/`, `open-seo-landing`) writes a "Search opportunity"
report for that site and emails a link that opens it as a PDF, with a link
to create an OpenSEO account. A report has no page. Partner sites can send the
same request from a form of their own.

The code is `web/src/lib/seo-report/`. Shared protections (Turnstile, the
per-visitor rate limiter, the daily budget) are the free tools' own:
[FREE_TOOLS_PROTECTION.md](./FREE_TOOLS_PROTECTION.md).

## The API

Two requests, both to `https://openseo.so/api/seo-report`. This is the whole
contract; the page on openseo.so uses nothing else. The names and sentences
are in `web/src/lib/seo-report/contract.ts`.

### Who may call it

- The page on openseo.so.
- A partner site whose origin is listed in `SEO_REPORT_PARTNER_ORIGINS`
  (`web/wrangler.jsonc`, comma-separated). Today: `https://sfseo.dev`.

A listed origin gets CORS headers and nothing else. Every limit applies to its
requests exactly as to the page's. No cookies are read or set, so send the
request without credentials.

### `GET /api/seo-report`

Whether the tool can take a request. It is `false` only when the Worker is
missing a secret the tool needs, which is a misconfiguration and is logged.
It does not say whether today's limits are reached; a request finds that out.

```json
{ "open": true }
```

### `POST /api/seo-report`

```http
POST /api/seo-report
Content-Type: application/json

{ "site": "example.com", "email": "you@example.com", "turnstileToken": "…" }
```

| Field            | What it is                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| `site`           | The website, as typed: `example.com`, `www.example.com` or a full URL. At most 300 characters.     |
| `email`          | Where the report goes. At most 254 characters.                                                     |
| `turnstileToken` | A token from a Turnstile widget on the calling page. One token is good for one request. See below. |

**Turnstile.** Render the widget with openseo.so's site key (it is public:
`WEBSITE_TURNSTILE_SITE_KEY` in the repository's Actions variables) and
`action: "free_tool"`. The widget's hostname list in the Cloudflare dashboard
must include the calling site. The server checks the token's `hostname`
against openseo.so and the partner list, and checks that it matches the
request's `Origin`.

**The answer** is always JSON with two fields:

```json
{ "status": "writing", "message": "Check your inbox in about 5 minutes." }
```

Read `status`. `message` is the sentence openseo.so shows for it, in English;
a partner can show it as it is or write its own. The HTTP code is 200 when the
request was taken, 4xx when it was refused and 503 when the tool can't run.

Taken, and an email follows:

| `status`  | Meaning                                                                                                     | HTTP |
| --------- | ----------------------------------------------------------------------------------------------------------- | ---- |
| `writing` | The report is being written now. The email arrives in about five minutes.                                   | 200  |
| `in_line` | It waits for a slot. An email arrives within about a day, with the report or to say it couldn't be written. | 200  |
| `sent`    | The site has a report written in the last 30 days. Its link was emailed.                                    | 200  |

Refused, nothing started and no email:

| `status`             | Meaning                                                                          | HTTP |
| -------------------- | -------------------------------------------------------------------------------- | ---- |
| `invalid_request`    | The body isn't the JSON above.                                                   | 400  |
| `invalid_site`       | `site` isn't a public website name, or is longer than 60 characters or 4 labels. | 400  |
| `invalid_email`      | `email` isn't an email address.                                                  | 400  |
| `site_not_found`     | DNS doesn't know the name.                                                       | 400  |
| `removed`            | The site asked for no reports.                                                   | 403  |
| `not_human`          | The Turnstile token is missing, used, expired or from another site.              | 403  |
| `origin_not_allowed` | The request's `Origin` isn't openseo.so or a listed partner.                     | 403  |
| `rate_limited`       | More than five submissions in a minute from this visitor.                        | 429  |
| `email_limit`        | This mailbox already asked today. One a day.                                     | 429  |
| `network_limit`      | This network already asked three times today.                                    | 429  |
| `day_full`           | The tool has promised all the emails it sends in a day.                          | 429  |
| `line_full`          | The line is full.                                                                | 429  |
| `site_busy`          | Twenty people are already waiting on this site's report.                         | 429  |
| `unavailable`        | A secret the tool needs is missing, or something it depends on is down.          | 503  |

A request that fails in the network, or an answer that isn't this JSON, should
be shown as `invalid_request` is.

**Where the address was entered.** The email's last line names the place:
`openseo.so/seo-report`, or the partner's hostname. The server takes it from
the hostname Turnstile verified, never from anything the client sends.

### Filling the site in on openseo.so

`https://openseo.so/seo-report?site=example.com` opens the page with the site
filled in.

## How it runs

Everything runs in the website Worker. There is no sandbox, because the model
can only call the tools it is given and no key is ever in front of it.

- `request.ts` checks a request, cheapest check first: that the tool is
  configured, the request's shape, the website's and the email's, then origin, rate limit and
  Turnstile, the removal list and DNS.
- `desk.ts` is one SQLite Durable Object for the whole tool: the day's counts,
  the line, who is waiting on each report, and the reports. A request is
  checked against every limit and given its place in one transaction, so
  requests that arrive together can't share a count and a refused request has
  taken nothing. Its alarm starts the next runs, gives up runs that waited too
  long, sends the emails and forgets what is old.
- `workflow.ts` is one report's run, as a Cloudflare Workflow whose id is the
  run's id. The paid step has no retries and can begin once per run.
- `write.ts` is the model loop: a model, through OpenRouter, follows
  `customer-keywords.md` until it hands the report in, then edits what it
  handed in and hands it in again. `tools.ts` is all it can do: five
  research lookups (`research.ts`, DataForSEO directly), `read_page`
  (`read-page.ts`) and `submit_report`.
- **What a report is.** `customer-keywords.md` has the research steps of the
  public `customer-keywords` skill and an Output section of this tool's own.
  The model hands in a plan as fields (`plan.ts`): a one-sentence verdict, up
  to three moves, best first, and who it took the customer to be. A move is
  one page to build or rework: the action, the keyword with its searches and
  difficulty, who holds page one, the steps that build the page in order,
  and why it sits where it does. The data behind the plan follows as
  Markdown: one keyword table, what comes after the plan, and what not to
  spend on. The plan is fields and not prose so that the number beside a
  move is the move's own and the first page is drawn the same way every
  time. A report stored before 2026-11-20 has no such fields: it is read
  with an empty plan and drawn as its verdict and its Markdown.
- **Every report is edited before it is sent.** The first hand-in is a
  draft. The model is told so and asked, in the same conversation, to edit
  the draft with `clean-copy.md` and hand it in again; the second hand-in is
  the report. The skill asks of every string whether it should be there at
  all, before how it is phrased. The edit is a turn of the same conversation
  and not a second model call with a fresh start, so the research is still
  in front of the model while it cuts, and the second hand-in is held to
  the same shape and rules as the first. It may change words and nothing
  else: a hand-in whose moves differ from the draft's in number, order,
  keyword, searches, difficulty or page is refused with what differed, and
  the model hands in once more. A second one that differs fails the report.
  Numbers inside sentences and the Markdown table are held by the prompt
  alone. The request to edit is a message of its own: put in the answer to
  the hand-in, the model took it as data and handed nothing in, and made to
  call the hand-in tool, it ran to the output cap without finishing.
- **A site name** is at most 60 characters and 4 labels (`site.ts`). The name
  is shown back in the email and the report's title, to an address the sender
  chose, so it can't be long enough to carry a message. The longest of 4,486
  startup domains checked is 35 characters and 3 labels.
- **Reading the site.** The Worker fetches pages itself, as a crawler named
  `openseo-reports` that obeys `robots.txt`. It reads only the report's own
  site, over `http` or `https`, 10 seconds and 2 MB a page, 12 pages a
  report, and no address over 2,000 characters. Every redirect is checked the
  same way before it is followed. A `robots.txt` is read once per site, up to
  500 KB. One that answers 429 or a server error, or lists more than 5,000
  rules for this crawler, means the site is left alone.
- **The PDF.** `pdf.ts` draws the report with pdfmake, from the stored plan
  and Markdown, each time its link is opened: US Letter, the verdict in the
  largest type, a card for each move with its searches and difficulty beside
  it and its steps numbered down a line, then the Markdown with its table,
  page numbers, and the link to create an account. A card, a list item and
  a paragraph are never split between pages, and the closing box takes the
  last section with it to a new page.
  A report is drawn at its normal size first. If its last card falls off
  the first page, or its last page is mostly blank, it is drawn once more,
  set tighter, and that one is sent when it fixes either. Ligatures are off,
  so copied text keeps its "fi" and "fl". Nothing stores the PDF. It is
  drawn in the request: 0.1 to 0.25 seconds in Node for the real reports
  tried on 2026-11-20, both drawings included (0.07 to 0.2 seconds in local
  workerd before the second drawing existed), for files of 34 to 49 KB. The
  code is a part of the Worker that loads only for a report's link, so no
  other request starts it. It added 763 KiB to the Worker's compressed
  upload (1,286 to 2,049 KiB), most of it the Roboto typeface.
- **What a report may carry.** Nobody reads a report before it goes out, and
  the site it is about shapes what the model writes. So the PDF has no
  images, and a link stays a link only when it goes to the report's own site,
  a site on a results page the report checked, or openseo.so. PDF readers
  make links of written-out addresses by themselves, so any other address
  loses its `https://` and `www.`. The filter runs on the parsed Markdown
  (`pdf.ts`), raw HTML is printed as text, and the first page says the report
  was written automatically.
- **Why there is no report.** The model may stop for a reason from a fixed
  list: the company has closed, the site has moved, or it doesn't serve the
  United States. The failure email says our sentence for that reason
  (`failure.ts`), never the model's words. A stop with no listed reason, or a
  finished report that carries one, is a failed report.
- **Email addresses** are stored only with the run they wait on, in the
  Durable Object, and deleted when the email goes or after six hours of
  failed sends. The daily limits count a hash of the mailbox and of the
  network. Nothing logs an address. Emails are Loops transactional sends with
  `addToAudience: false`, so nobody becomes a contact.
- **A report's link** is `/seo-report/r/<token>`, where the token is 122
  random bits, for 90 days. It answers with the PDF, shown in the browser
  (`Content-Disposition: inline`) and named for the site when saved
  (`seo-report-example.com.pdf`), marked `noindex` and `no-store`.
  No page is served at a report's address, so no script that records page
  addresses ever runs there. The link is still in the Worker's own invocation
  logs and in Loops, which sent it. A link with no report behind it gets the
  site's "not found" page. Reports were pages at the same links for their
  first days, from 2026-11-18: those links now open the PDF too.

## Limits

Days are UTC, as the free tools' budget counts them.

| Limit                                      | Number                                   | Where                   |
| ------------------------------------------ | ---------------------------------------- | ----------------------- |
| Per mailbox ("+tag" and Gmail dots folded) | 1 a day                                  | `limits.ts`             |
| Per network (an IPv4 address, an IPv6 /48) | 3 a day                                  | `contract.ts`           |
| Emails across the tool                     | 100 a day                                | `limits.ts`             |
| New reports across the tool                | 25 a day                                 | `free-tools/spend.ts`   |
| Written at once                            | 3                                        | `limits.ts`             |
| The line                                   | 25 places, 26 hours at most              | `limits.ts`             |
| People waiting on one site's report        | 20                                       | `limits.ts`             |
| One report's research                      | 9 calls, sizes in `TOOL_LIMITS`          | `tools.ts`              |
| One report's reading                       | 12 pages of its own site                 | `limits.ts`             |
| One report's model use                     | 30 calls, 500,000 tokens, $1, 15 minutes | `limits.ts`, `spend.ts` |

- A second request from a mailbox in one day is told so and starts nothing.
  The attempt still counts against the network.
- A site with a report from the last 30 days isn't written again: the link is
  emailed. That uses the mailbox, network and email counts, and no budget.
- A report that has waited 26 hours is given up, and whoever asked gets the
  "couldn't write it" email. That is 24 hours for the day's budget to come
  back and two for a full line ahead of it to be written. A report whose turn
  comes is written, however long it waited.
- At a research tool's limit the model is told so and finishes with what it
  has. At a model limit there is no report.
- If the model's provider drops a run part-way, each call is retried for
  about a minute, and the run is picked up once more from where it stopped,
  keeping the research it had paid for. That memory lasts as long as the
  Workflow step: an engine restart mid-write still ends as one failure email.

## What it costs

Measured on 2026-11-18 on three real reports (trumaker.com, heyaristotle.com,
nodafi.com), written by `openai/gpt-6.2-sol` at medium effort:

|                                    | Per report     | Who is paid |
| ---------------------------------- | -------------- | ----------- |
| Search data, as DataForSEO charged | $0.13 to $0.25 | DataForSEO  |
| Model, as OpenRouter charged       | $0.09 to $0.21 | OpenRouter  |
| Together                           | $0.21 to $0.46 |             |

They took 33 to 81 seconds. Each run logs what it used (`seo_report_written`).

The plan-first report (2026-11-20) costs about the same. Seven real reports
on three sites (everyapp.com, trumaker.com, browserbase.com), run in Node
with the tool's own code, cost $0.22 to $0.50 together and $0.35 on average,
in 27 to 148 seconds. The two dearest, $0.46 and $0.50, were the ones that
read the most pages and made the most research calls.

The edit adds about $0.016 and 4 seconds to a report: one more model call
that reads the conversation from the cache and writes the report again
(measured on one real report, trumaker.com, $0.27 in all).

**A report can't cost more than $1.27**, and it reserves $1.50 in the free
tools' daily budget (`FREE_TOOLS_DAILY_BUDGET_USD`) before it starts.

- **Search data, $0.27 at most**: the call counts and sizes in `TOOL_LIMITS`
  at DataForSEO's list prices. A test recomputes it when a limit changes.
  DataForSEO charges five times for a results page whose keyword holds a
  search operator (`site:`, `intitle:` and fourteen more), so those keywords
  are dropped before the call. Nothing else the model chooses changes a
  price: depth, device, market and every paid option are fixed in
  `research.ts`.
- **Model, $1 at most** (`SEO_REPORT_MODEL_USD`). A run counts its own
  spend: each reply's tokens at the model's list price, from the table of
  priced models in `web/src/lib/free-tools/spend.ts`
  (`SEO_REPORT_MODEL_PRICES`). Before each call it works out the most the
  next one could cost and stops before a call that could pass the cap. Every
  call's output is capped at 16,000 tokens. OpenRouter's own figure for each
  reply is a check on the count: the larger of the two is used, and
  `seo_report_cost_mismatch` is logged when they are far apart, which means a
  price in the table is out of date. A reply that reports no token counts
  ends the run.

**The model's host is pinned** (`model.ts`): OpenAI's own, and no other.
OpenRouter otherwise picks a host for each request, and not every host does
the reasoning the request asks for. On 2026-11-20 the same question drew
about 80 reasoning tokens from OpenAI's host and from Azure's and none from
Amazon Bedrock's, at the same list price. When OpenAI's host is down, slow or
turns a request away, the call is retried and the run picked up once, like
any provider failure, and then ends as `seo_report_failed` with
`side: "provider"`. Each run's log line names the hosts that answered
(`providers`) and its `reasoningTokens`.

**The model** is `SEO_REPORT_MODEL` and `SEO_REPORT_MODEL_EFFORT` in
`web/wrangler.jsonc`: `openai/gpt-6.2-sol` at medium. It must be a model in
the price table; with any other the tool stays closed. `openai/gpt-6-luna` is
in the table too, so switching to it is one line. Both were tried on real
sites on 2026-11-18:

| Model and effort | Model cost a report | Time         | Against Sol at medium                                                         |
| ---------------- | ------------------- | ------------ | ----------------------------------------------------------------------------- |
| Sol, medium      | $0.09 to $0.21      | 34 to 84 s   | The default                                                                   |
| Sol, low         | $0.16 to $0.19      | 65 to 68 s   | As full, no cheaper, and it missed one of a site's two city keywords          |
| Luna, high       | $0.02               | 182 to 242 s | Lighter, with weaker priorities: it led a small clothier with a head term     |
| Luna, medium     | $0.01 to $0.02      | 145 to 166 s | Clearly thinner: half the keywords on one site, no city keywords on the other |

Search data is $0.13 to $0.25 a report whichever model writes it, so Luna
makes a report about a third cheaper, not a tenth of the price.

| `SEO_REPORTS_PER_DAY` | A day, at the measured average | A day, at the most reserved |
| --------------------- | ------------------------------ | --------------------------- |
| 25 (the default)      | about $8                       | $37.50                      |

**The budget is shared with the other free tools.** Twenty-five reports can
reserve $37.50 of the $100 a day. If the other tools reserve more than $98.50
first, no report starts that day: requests wait in line, are told so, and
after 26 hours get the email saying we had more requests than we could write.
`free_tool_limit_reached` in the logs shows when either happens.

The reservation is a count of money, not a wallet. Two limits set outside the
code are the hard stops; set both before the merge:

- **OpenRouter:** a key used by nothing else, with a $30 limit that resets
  daily. Twenty-five reports at $1 each is $25.
- **DataForSEO:** a daily limit on the account. Reports add at most $7 a day
  to what the other free tools spend.

## Launching it

There is no switch. The tool is live from the deploy that ships it, in the
tools hub, the footer and the sitemap like every other free tool. So
everything below is done **before the merge**, by someone with the Cloudflare
account. Commands run from `web/`.

1. **Check the Workflow's name is free.** No Workflow called `seo-report` may
   exist on the account under another script:

   ```sh
   pnpm exec wrangler workflows list
   ```

   Good: no `seo-report` row. (An earlier build used `sfseo-report`.)

2. **OpenRouter.** Create a key at [openrouter.ai](https://openrouter.ai/keys)
   used by nothing else, with a $30 limit that resets daily, and set it:

   ```sh
   pnpm exec wrangler secret put OPENROUTER_API_KEY
   ```

3. **Loops.** Create and publish two transactional emails, and set their ids:

   | Name                | Data variables                               | Secret                       |
   | ------------------- | -------------------------------------------- | ---------------------------- |
   | `seo-report-ready`  | `domain`, `reportUrl`, `signupUrl`, `source` | `LOOPS_SEO_REPORT_READY_ID`  |
   | `seo-report-failed` | `source`, `reason`                           | `LOOPS_SEO_REPORT_FAILED_ID` |

   ```sh
   pnpm exec wrangler secret put LOOPS_SEO_REPORT_READY_ID
   pnpm exec wrangler secret put LOOPS_SEO_REPORT_FAILED_ID
   ```

   `source` is where the address was entered: `openseo.so/seo-report` or a
   partner's hostname. `reason` is one of five sentences of ours
   (`failure.ts`). The failure email names no site, because whoever asked
   chose the name. Keep both to the report: they can't carry marketing.
   `LOOPS_API_KEY`, `DATAFORSEO_API_KEY` and `TURNSTILE_SECRET_KEY` are
   already on the Worker.

4. **Turnstile.** For each partner in `SEO_REPORT_PARTNER_ORIGINS`, add its
   hostname to the free tools' widget in the Cloudflare dashboard (Turnstile,
   the widget whose site key is `WEBSITE_TURNSTILE_SITE_KEY`). No new secret.

5. **Merge.** The deploy creates the Durable Object and the Workflow, and the
   tool is live.

If a secret is missing, the tool doesn't run: every request is answered
`unavailable`, `GET /api/seo-report` answers `{"open":false}`, and each one
logs `seo_report_not_configured` with the names that are missing. The page
still shows its form.

### Checks after the merge

Nothing has run on Cloudflare before this, so these are the first thing to do
once the deploy finishes, in order of what would hurt most if wrong. Keep the
logs open in a second terminal:

```sh
pnpm exec wrangler tail open-seo-landing --format json --search seo_report_
```

| #   | Do                                                                                                   | Good answer                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `curl https://openseo.so/api/seo-report`                                                             | `{"open":true}`. `false` means a secret is missing; the log names it                                                                                                                |
| 2   | Ask for a report on a US site of ours at `https://openseo.so/seo-report`                             | The page says to check the inbox. Within two minutes a `seo_report_written` line whose `countedUsd` and `chargedUsd` agree, no `seo_report_cost_mismatch` line, and the ready email |
| 3   | Ask again at once with the same address and another site                                             | "That address has already asked for a report today." Nothing starts                                                                                                                 |
| 4   | `curl -sI https://openseo.so/seo-report/r/<token from the email>`                                    | `content-type: application/pdf`, `content-disposition: inline`, `x-robots-tag: noindex, nofollow` and `cache-control: private, no-store`                                            |
| 5   | Open the link from the email in a browser                                                            | The PDF opens in the tab, and saving it gives a file named `seo-report-<site>.pdf`                                                                                                  |
| 6   | Ask for a report on a site that isn't for the United States, such as `richersounds.com`              | A `seo_report_failed` line with `side: "site"`, and the failure email with the United States sentence. This is the first real send of the failed template                           |
| 7   | Submit from SF SEO's form, and from `https://www.openseo.so/seo-report` if `www` doesn't redirect    | Both are taken. `not_human` means that hostname is missing from the Turnstile widget                                                                                                |
| 8   | `pnpm exec wrangler workflows instances describe seo-report latest`                                  | The "write report" step succeeded once. In the dashboard's Workers observability, that invocation's CPU time is far under 30,000 ms                                                 |
| 9   | Start a report, then run the deploy (`gh workflow run deploy-website.yml`) while it is being written | For that site, at most one `seo_report_written`, or one `seo_report_failed`. One email. Never two reports                                                                           |
| 10  | Ask for a report on `127-0-0-1.nip.io`, a public name that resolves to a private address             | No report. The log's `calls` show `read_page` and nothing was read. This costs a few cents of model                                                                                 |
| 11  | Ask for a report on a site of ours that answers its headers at once and then sends a byte a second   | `read_page` gives up at ten seconds: the run's `seconds` is not minutes long                                                                                                        |
| 12  | Unpublish the failed template in Loops, repeat check 6 from another address, publish it again        | `seo_report_email_refused` with `status: 400`, and no retry                                                                                                                         |
| 13  | Lower the OpenRouter key's limit to $0, ask for a report, restore the limit                          | `seo_report_failed` with `side: "provider"`, and the failure email                                                                                                                  |

### Stopping it, and taking it out

**To stop it in a hurry, with no deploy,** delete its OpenRouter key from the
Worker: `pnpm exec wrangler secret delete OPENROUTER_API_KEY`. Every request
is then answered `unavailable` and nothing new starts. Putting the secret back
starts it again.

**To take it out is a deploy that deletes the page and the tool.** It is not a
plain revert: once a deploy has created the `SeoReportDesk` class, Cloudflare
refuses any version that neither exports the class nor deletes it, and the
daily redeploy would fail the same way.

1. Empty the line (below), so nobody is left waiting.
2. Revert the tool's commit.
3. In `web/wrangler.jsonc`, keep both existing migrations and add one that
   deletes the class. The history must stay, or the deploy tries to create
   `FreeToolBudget` again:

   ```jsonc
   "migrations": [
     { "tag": "free-tool-budget-v1", "new_sqlite_classes": ["FreeToolBudget"] },
     { "tag": "seo-report-desk-v1", "new_sqlite_classes": ["SeoReportDesk"] },
     { "tag": "seo-report-desk-v2", "deleted_classes": ["SeoReportDesk"] },
   ],
   ```

4. Merge, which deploys. Then delete the Workflow, which a deploy leaves
   behind:

   ```sh
   pnpm exec wrangler workflows delete seo-report
   ```

Deleting the class deletes every stored report and every address still
waiting, so emailed report links stop working. This follows Cloudflare's
documentation and the same pattern in the app's own `wrangler.jsonc`; it has
not been run for this Worker.

## Operating it

- **Empty the line**, after abuse say. Waiting runs and the addresses waiting
  on them are deleted in one step, with no email:

  ```sh
  pnpm exec wrangler workflows trigger seo-report '{"emptyLine":true}'
  ```

- **Stop reports about a site.** Add its name to
  `web/src/lib/seo-report/removed-sites.json` and merge. The name covers every
  name under it. From the next deploy it can't be asked for, a report waiting
  for it isn't written, and one already written isn't served.
- **Logs.** Search the website Worker's logs for `seo_report_`:

  | Event                             | Meaning                                                                                                     |
  | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
  | `seo_report_written`              | A report was written. Seconds, model calls, tokens, both costs, the hosts and the tools called.             |
  | `seo_report_failed`               | No report. `side` is `provider` (the model's provider), `site` or `ours`; `reason` says why.                |
  | `seo_report_resumed`              | The provider dropped a run and it was picked up again.                                                      |
  | `seo_report_cost_mismatch`        | Our count of a run's model cost and OpenRouter's are far apart: check the price table.                      |
  | `seo_report_request_failed`       | A request broke part-way and was answered `unavailable`.                                                    |
  | `seo_report_email_refused`        | Loops refused an email, with its status. An unpublished template is a 400.                                  |
  | `seo_report_email_unreachable`    | Loops didn't answer. The send is tried again each minute for six hours.                                     |
  | `seo_report_email_dropped`        | An email was given up after six hours.                                                                      |
  | `seo_report_not_configured`       | A secret is missing, or the model has no prices. `missing` names them. Requests are answered `unavailable`. |
  | `seo_report_budget_unavailable`   | The daily budget couldn't be asked. Nothing starts until it can.                                            |
  | `seo_report_workflow_not_started` | A run's Workflow couldn't be created. Tried again each minute.                                              |

  `free_tool_limit_reached` with `tool: seo-report` means the day's reports or
  dollars ran out and reports are waiting.

## Running it locally

In `web/.dev.vars`:

```
SEO_REPORT_STAND_INS=model,email
```

`model` replaces the model with one that hands in a made-up report and spends
nothing (a site named `blocked.…` gets none). `email` logs emails instead of
sending them. With `SEO_REPORT_STAND_INS=email` and real `OPENROUTER_API_KEY`
and `DATAFORSEO_API_KEY` values, a real report is written and nothing is sent.
A production build ignores the variable.

## Known limits

- **One market.** Reports use United States search data, in English. The form
  says so, and a site the model judges isn't for the United States gets the
  failure email with that reason. Writing for the site's own market is the
  next step: the skill allows it, and it needs a market chosen from a fixed
  list of countries and its own real runs.
- **The plan is a judgement, and it varies.** Four reports written for one
  site on 2026-11-20 did not agree on the first move: three led with one
  keyword, and the fourth led with another and listed the first under "Don't
  spend on these". A reader who asks twice in 30 days gets the same report
  again, but nothing makes two writings agree.
- **The edit is light.** On two real reports it changed 4 and 6 strings
  of 24 to 29 and removed 1% to 3% of the words: mostly a `why` that
  repeated the numbers printed beside it. The drafts were already held to
  word limits. An edit can also fail a report that was fine as a draft, by
  changing the plan's data twice or by not handing in.
- Anyone who passes Turnstile can have one email a day sent to an address
  they type. Only a confirm-by-email step would remove that.
- The page reader checks names, not the addresses they resolve to. Where a
  request to a name goes is Cloudflare's network's doing.
- Account creation carries the site (`?domain=`) but not the report. The
  report stays at its link.
- Every opening of a link is one read of the one Durable Object, a single
  indexed lookup, and then one or two tenths of a second of the Worker's CPU
  to draw the PDF. A made-up link costs only the lookup: a flood of them would queue
  ahead of new requests without spending anything. A cache wouldn't help,
  because each made-up link is a new address; a rate-limit rule on
  `/seo-report/r/*` in Cloudflare would.
- The PDF's typeface has Latin, Greek and Cyrillic letters. A report holding
  anything else prints gaps there.
- A PDF reader may still make a link of a written-out email address.
- A reservation is lost if the Durable Object is evicted in the moment
  between reserving and starting a run. The day then starts one report fewer.

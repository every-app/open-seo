---
title: "Site audits"
description: "Crawl your site for SEO issues, read the results, and fix blocked or partial crawls."
---

A site audit crawls your website and checks every page it reads for SEO issues, such as broken links, missing titles, redirect chains, and pages Google can't index. The crawl itself uses no credits.

## Start an audit

1. Open **Site Audit** in the project sidebar, under My Site.
2. Enter the URL to start from. A bare domain like `example.com` works.
3. Set **Max pages**. The default is 50.
4. Turn on any options you want:
   - **Include Lighthouse** measures speed and other Lighthouse scores. It tests up to 10 pages, one for each page template it finds, on mobile and desktop.
   - **Render JavaScript** loads each page in a browser before checking it. Turn it on when your site builds its content with JavaScript and the crawler sees empty pages. It's slower.
5. Click **Start Audit**.

The **Scan my website** button on the project dashboard starts a 50-page audit of your project's site with both options on.

## How the crawl works

The crawler starts at your URL, reads `robots.txt` and your sitemaps, and follows links from page to page. It stays on your site's host: `www.example.com` and `example.com` count as the same site, but other subdomains are skipped. It skips pages that `robots.txt` disallows.

If your site has more pages than **Max pages**, the audit keeps room for every page in your sitemap. Pages it only finds through links, such as tag archives, fill what's left.

The crawler identifies itself as `OpenSEO-Audit`. If a firewall or bot protection blocks it, see [OpenSEO-Audit crawler](/docs/crawler) for how to allow it.

While an audit runs, the page shows its progress and the pages crawled so far. There's no cancel button; deleting a running audit stops it.

## Read the results

- **Issues** groups problems by severity: Critical, Warning, and Info. Open an issue to see what it means, how to fix it, and up to 100 affected URLs.
- **Pages** lists every page with its status code, title, H1, word count, images, and speed. Filter by **Crawl result** to find pages that failed, were blocked, or hit a rate limit.
- **Performance** appears when Lighthouse ran. Click **View issues** on a result to see what Lighthouse found on that page.

Use **Export** to send results to Google Sheets, download a CSV, or download JSON.

Past audits are listed under **Previous Audits**. Click **View** to open one. To check your fixes, start a new audit; there's no re-run button.

## When an audit looks wrong

- **"No issues found."** Before you trust it, open **Pages** and set **Crawl result** to **Failed** or **Blocked**. If many pages show up, the crawler couldn't read them, so there was nothing to check.
- **"This site's bot protection blocked our crawler."** Your firewall or a service like Cloudflare stopped the crawl. Allow the crawler using the steps in [OpenSEO-Audit crawler](/docs/crawler). For a Shopify store, create a signature in Shopify admin under Online Store > Preferences > Crawler access. Then open **Project settings**, choose the **Integrations** tab, click **Connect** on the **Shopify** card, and paste it.
- **"The crawl stopped early because of the site's rate limit."** Your server kept answering with HTTP 429 (Too Many Requests). Allow the crawler, or run a smaller audit.
- **"This audit stopped early after N pages."** The results cover the pages it read before stopping.
- **"Crawl stopped early: page limit."** This warning under **Issues** means the audit reached **Max pages** before it visited every URL it found, so the results cover part of the site. Open it to see how many URLs were left. Start a new audit with a higher limit, or [keep the crawler out of sections](/docs/crawler) you don't need audited.

## Limits

| Plan        | Pages per audit | Audits running at once |
| ----------- | --------------- | ---------------------- |
| Free        | 50              | 5                      |
| Paid        | 10,000          | No limit               |
| Self-hosted | 10,000          | No limit               |

Hosted accounts also have a cap on the total size of the audits they keep. If you see "You've reached audit capacity for your account", delete old audits from **Previous Audits** to make room. Owners and admins can delete audits.

## Credits

- **Crawling and checking pages:** no credits.
- **Lighthouse:** up to about $0.14 per audit.
- **Render JavaScript:** the form shows "Costs up to" a dollar amount before you start, about $1.28 per 1,000 pages. You need that much in credits to start. If the cost runs higher than expected, the audit stops.

The dashboard's **Scan my website** turns both on, so it uses a few cents of credits.

## Use your assistant

Ask your agent to run an audit with [OpenSEO MCP](/docs/mcp). It can start one with `run_site_audit`, check progress, and read the issues, pages and Lighthouse results. From an agent, Lighthouse is off unless you ask for it, and a request over your plan's page limit runs at the limit.

The [SEO Audit](/docs/skills/seo-audit) skill runs the audit, reads the results with you, and writes a report with the one to three fixes that matter most. For a checklist to work through by hand, see the [technical SEO audit checklist](/library/site-audit/technical-seo-audit-checklist).

## Self-hosting

Self-hosted audits can crawl up to 10,000 pages, and Lighthouse runs on your own DataForSEO key. Rendering depends on how you host:

- **Docker** has no browser, so rendering needs a Context.dev API key in `CONTEXT_API_KEY`. See [Render JavaScript in site audits](https://github.com/every-app/open-seo/blob/main/docs/SELF_HOSTING_CLOUDFLARE_OPERATIONS.md#render-javascript-in-site-audits) on GitHub.
- **Cloudflare** rendering needs the Workers Paid plan. On the Workers Free plan, audits also stop at about 40 pages. See [Workers Free plan limits](/docs/self-hosting/cloudflare#workers-free-plan-limits).

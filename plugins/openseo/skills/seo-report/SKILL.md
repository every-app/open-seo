---
name: seo-report
description: "Write and save an OpenSEO report as one self-contained HTML page. Use when a skill has finished its research, and whenever the user asks for a report, check-in, or summary, or names a report template."
---

# OpenSEO Report

## Goal

Turn finished research into one self-contained HTML page, saved to the project with `save_report`, so anyone on the team can open it in the app, read it on a phone, and print it to PDF.

Every OpenSEO skill that produces a recommendation delivers through this skill. Chat gets the link, the verdict, and the leading recommendation with its expected benefit, if there is one. The report gets everything else.

## Before you write

1. Call `list_reports` for the project. If a report already covers the same subject for the same period, you are correcting your own run: pass its `reportId` to `save_report` and replace it. A new month, a new competitor, or a different skill is a new report. Never save a near-duplicate.
2. Titles are unique within a project. Saving a second report under an existing title with no `reportId` is rejected, so either pass the `reportId` of the report you are replacing or change the title to name the new subject or period.
3. To revise an existing report, work from its summary. `get_report` returns the HTML only with `includeHtml: true`, and an 80 KB report is roughly 20,000 tokens, which most clients truncate. Fetch the HTML only when you need to edit a specific passage, and if what comes back looks cut off, send the user to the app instead of saving over it.

## Following a template

A project can carry report templates: named, reusable briefs saying who a report is for, which sections it has in what order, how it should sound, and how to sign off. They are listed in project context, and `list_report_templates` returns the full instructions for each one. Templates belong to a project. To reuse one in another project, list it there and save a copy here.

Use a template only when the user names it, or asks for the kind of report a template's name or description names. A plain skill run ("audit this site") uses the skill's default format. If two match, ask in one line. A template's sections, audience and tone replace the skill's Output format list; the HTML constraints and writing rules never change. Project writing_preferences always apply; a template's tone wins only where they conflict. Pass its `templateId` to `save_report`.

## Writing rules

When the producing skill specifies a recommendation format, use that format instead of the generic Problem / Change / Expected effect structure below. For example, an SEO audit can use short Do this / Why bullet lists. Keep the same requirements for concrete actions, supporting evidence, business benefit, and honest uncertainty. The starter template's finding markup is an example, not an override of that skill's format.

- **Write notes, not essays.** The reader scans. A recommendation is a heading and three short bullets: Problem (what is true, with evidence), Change (the step and how it addresses the problem), and Expected effect (what could improve, why the business cares, and the likely scale and uncertainty). For descriptive findings, use the relevant subset; do not invent a fix. No paragraph runs past two sentences. A section opens with one sentence or none. A summary section (a verdict, a snapshot, a market read) is a bullet list, one fact per line, never prose. How the data was gathered goes in the closing "How this report was made" section, not in the finding.
- **Make the reasoning visible.** Use numbers and specific pages to support observations. Explain the mechanism and expected benefit of recommendations in plain language; do not omit that explanation for brevity or replace it with generic claims such as "builds trust." Distinguish measured outcomes, estimates, and hypotheses. A supported qualitative assessment is better than invented precision.
- **Be honest about confidence.** Say which numbers came from a tool and which you verified yourself. When you could not check something, put it in a `.note` and say so.
- **Plain language.** Gloss every term of art on first use: canonical, meta description, crawler, 301, structured data. No drama words, no exclamation points, no filler.
- **One report, one spine.** Lead with the verdict and its business implication, then the material findings and worthwhile recommendations. If the research does not establish a worthwhile action, state that conclusion and the relevant limits. A report with twenty findings has failed.
- **Print the numbers.** A chart never carries a value that is not also written out in text.

## Title and summary

- `title`: names the report type or specific subject and the full report date, under 120 characters. Use "Competitive Landscape — Sep 17, 2026" or "Keyword Research — Sep 17, 2026". Use the actual report date in `MMM D, YYYY` format, including the day and four-digit year; put the data coverage period in the report body. Never a generic "SEO Report" or "Analysis".
- Omit the website from the title when the report is about the project's website. Compare hostnames, ignoring the protocol, `www.`, and trailing slash. If the subject is a different website, include its bare hostname, for example "Competitor Analysis: example.com — Sep 17, 2026". Also include the subject hostname when the project has no website set. Never put `https://` or a full URL in the title.
- Use the same title in `save_report`, the HTML `<title>`, and the visible `<h1>` so the report list, share preview, and report agree.
- `summary`: markdown under 2,500 characters, in this order — the verdict, the leading recommendation and expected benefit (or why no material action is established), then the key evidence. This is what `list_reports` returns and what you or another agent read instead of the HTML, so write it for a reader who will never open the page.

## The closing section: how this report was made

Every report ends with an `h2` titled "How this report was made" (id `how-this-report-was-made`). When "What to do next" is included, place it immediately before this section. It is the only section with a fixed opening line: one sentence naming the skill that produced the report and linking its docs page, so a reader who was handed the link can learn what the workflow does and rerun it.

```html
<p>Generated by the <a href="https://openseo.so/docs/skills/seo-audit" target="_blank" rel="noopener">OpenSEO SEO Audit skill</a>, run by AGENT NAME on MONTH D, YYYY.</p>
```

The URL is always `https://openseo.so/docs/skills/` followed by the skill's directory name, exactly as written in that skill's Output format list. Copy it; do not guess a slug. Then the rest of the section as the skill describes it: which tools reported what, and what you verified by hand. A report written from a template keeps this section too, as its last one.

## HTML constraints

These are enforced by the viewer, not by taste. A report that breaks them renders blank or broken.

- **No external resources of any kind.** No web fonts, no CDN scripts or stylesheets, no images by URL, no `fetch`. Every request from a saved report is blocked. Inline all CSS in one `<style>` block.
- **Links open in a new tab.** Write every link as `<a href="..." target="_blank" rel="noopener">`. A plain link would navigate the report frame itself, replacing the report with a broken copy of the target. The exception is an in-page anchor (`href="#id"`, as in the contents rail), which stays in the document.
- **No `<script>`.** Scripts are blocked outright. Anything interactive has to be static.
- **Charts are inline SVG or CSS bars**, with real `<text>` labels and a `viewBox`. Always print the numbers next to the chart too.
- **Aim under 80 KB.** The hard cap is 500,000 bytes, and the error says "the limit is 500 KB". Inlined images are the usual way people blow it. A filled report is normally 10-30 KB.
- **No backticks and no `${` anywhere in the HTML.** Codex passes the argument through a JavaScript template literal, where both are syntax. Use `<code>` for inline code and plain text everywhere else.
- **Finish the document.** The server rejects HTML that does not end with `</html>` as "stopped early". Write the whole page in one call rather than trailing off mid-section.
- **Keep the doctype, `<html>`, `<head>`, and `<title>`.** The app renders the whole document you save, not a fragment.

## After you save

- `save_report` returns `{ reportId, url, htmlBytes }`. The whole reply is at most three short bullets, then the link last on its own line as `Read the full report: <url>`. The bullets: the verdict, the leading recommendation and expected benefit if supported, and anything the user has to act on (a project you created, a question you need answered). Nothing else: no account of the run, no reviewer notes, no list of what worked, no restating the report. The report is how they learn; chat only points at it.
- The skill you are running appends its own research-log line; add one only if it does not: `{ updates: [{ appendResearchLog: { summary: "Report: <title>. Verdict: <conclusion>" } }] }`.
- If the save fails, the error names the limit and the value. Fix that one thing and save again. Never paste the report into chat instead.

## Starter template

Copy this, keep the CSS as it is, and replace the ALL-CAPS placeholders. Each primitive shows one example row; repeat the ones you need and delete the ones you do not.

```html
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>REPORT TITLE</title>
<style>
/* One light look, on screen and on paper. The report is read inside the app,
   which has its own theme toggle, and a saved document has no way to hear about
   it: a report that follows the OS scheme alone shows a black panel inside a
   light app for anyone whose two settings disagree. */
:root{--bg:#fff;--fg:#0a0a0a;--fg-2:#454545;--fg-3:#8f8f8f;--rule:#ebebeb;--rule-2:#dcdcdc;--sunk:#fafafa;
  /* The one token a report template may change. Left as the text color, so a
     report with no template looks exactly as it did before. */
  --accent:var(--fg)}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{background:var(--bg);color:var(--fg);margin:0;padding:0 24px 120px;font-size:18px;line-height:1.65;letter-spacing:-.003em;
  font-family:Geist,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
.shell{max-width:1100px;margin:0 auto}
header{padding:40px 0 0;max-width:660px}
h1{font-size:clamp(34px,6vw,56px);font-weight:700;line-height:1.03;letter-spacing:-.035em;margin:0;text-wrap:balance}
.byline{margin:24px 0 0;font-size:16px;color:var(--fg-2)}
.body{display:grid;grid-template-columns:minmax(0,660px) 1fr;gap:0 64px;margin:48px 0 0}
/* Both explicitly in row 1: without it the rail auto-places into row 1 and
   pushes the article down a whole row, opening an empty band above the text. */
article{grid-column:1;grid-row:1;min-width:0}
.rail{grid-column:2;grid-row:1;font-size:14px;color:var(--fg-3);padding-top:6px}
.rail .sticky{position:sticky;top:40px}
.toc-label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--fg-3);margin:0 0 10px}
.toc ol{list-style:none;margin:0;padding:0}
.toc li{margin:0 0 7px}
.toc a{color:var(--fg-2);text-decoration:none}
.toc a:hover{color:var(--fg)}
/* Below 900px the rail is dropped rather than stacked: a contents list above
   the report is a wall to scroll past on a phone, not a shortcut. */
@media (max-width:900px){.body{grid-template-columns:1fr}.rail{display:none}}
article p{margin:0 0 26px;text-wrap:pretty}
h2{font-size:30px;font-weight:600;letter-spacing:-.025em;line-height:1.2;margin:60px 0 22px;text-wrap:balance}
h3{font-size:20px;font-weight:600;letter-spacing:-.015em;margin:38px 0 14px}
.finding{list-style:none;padding:0;margin:0 0 26px}
.finding li{margin:0 0 8px;color:var(--fg-2)}
.finding b{color:var(--accent);font-weight:600}
a{color:var(--fg);text-decoration:underline;text-underline-offset:3px;text-decoration-color:var(--rule-2)}
strong{font-weight:600}
code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.86em;background:var(--sunk);border:1px solid var(--rule);padding:1px 5px;border-radius:4px}
ul,ol{margin:0 0 26px;padding-left:22px}li{margin:0 0 11px}li::marker{color:var(--fg-3)}
.note{border-left:2px solid var(--fg);padding:2px 0 2px 22px;margin:0 0 26px}
.note p{margin:0;color:var(--fg-2)}
.note p+p{margin-top:14px}
.tw{overflow-x:auto;margin:0 0 30px}
table{border-collapse:collapse;width:100%;font-size:15.5px;min-width:440px}
th{text-align:left;font-weight:500;color:var(--fg-3);padding:0 20px 10px 0;border-bottom:1px solid var(--rule-2);white-space:nowrap}
td{padding:13px 20px 13px 0;border-bottom:1px solid var(--rule);vertical-align:top;color:var(--fg-2)}
td:first-child{color:var(--fg)}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td:last-child,th:last-child{padding-right:0}
tr:last-child td{border-bottom:none}
figure{margin:0 0 30px}
figcaption{font-size:14px;color:var(--fg-3);margin-top:8px}
.bars{display:grid;grid-template-columns:minmax(90px,170px) 1fr auto;gap:10px 12px;align-items:center;font-size:14px}
.bars .label{color:var(--fg-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bars .track{display:block;height:20px;background:var(--sunk)}
.bars .bar{display:block;height:100%;background:var(--accent);opacity:.16}
.bars .value{font-variant-numeric:tabular-nums;min-width:3ch;text-align:right}
svg{display:block;max-width:100%;height:auto}
hr{border:none;border-top:1px solid var(--rule);margin:60px 0}
footer{max-width:660px;margin:64px 0 0;padding:26px 0 0;border-top:1px solid var(--rule);font-size:15px;color:var(--fg-3)}
@media print{
  /* A zero top margin hides the browser's own print header (date, tab title);
     the bottom margin holds a page counter instead of the browser's URL line.
     The body padding supplies the visible page margins. */
  @page{margin:0 0 12mm 0;@bottom-center{content:counter(page) " of " counter(pages);font:10px -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#8f8f8f}}
  body{background:#fff;color:#111;padding:14mm 16mm 6mm;font-size:11pt}
  .shell,.body{display:block;max-width:none}
  header{padding:0;max-width:none}
  h1{font-size:26pt}
  h2{font-size:15pt;margin:22pt 0 10pt}
  h3{font-size:12pt;margin:14pt 0 6pt}
  article,footer{max-width:none}
  .rail{display:none}
  h1,h2,h3{break-after:avoid}
  table,figure,.note,svg{break-inside:avoid}
  tr,td,th{break-inside:avoid}
  p,li{orphans:3;widows:3}
  thead{display:table-header-group}
  .tw{overflow:visible}
  table{font-size:10pt;min-width:0}
  .byline,footer,figcaption{font-size:9.5pt}
  svg,.bars .bar,.bars .track{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  a{text-decoration:none}
}
</style></head>
<body><div class="shell">

<header>
  <h1>REPORT TITLE</h1>
  <p class="byline">Prepared for NAME · MONTH D, YYYY</p>
</header>

<div class="body">
  <aside class="rail"><div class="sticky">
    <p class="toc-label">Contents</p>
    <nav class="toc" aria-label="Contents">
      <ol>
        <li><a href="#section-heading">SECTION HEADING</a></li>
        <li><a href="#what-to-do-next">What to do next</a></li>
        <li><a href="#how-this-report-was-made">How this report was made</a></li>
      </ol>
    </nav>
  </div></aside>
  <article>

    <p>One or two sentences: the state of things and what it means for the business.</p>

    <h2 id="section-heading">SECTION HEADING</h2>

    <h3>FINDING TITLE</h3>
    <ul class="finding">
      <li><b>Problem:</b> the observed gap, with the evidence and affected page.</li>
      <li><b>Change:</b> the concrete step and how it addresses the gap.</li>
      <li><b>Expected effect:</b> what could improve, why the business cares, and the likely scale and uncertainty.</li>
    </ul>

    <div class="note"><p>A caveat, a confidence note, or something you could not verify.</p></div>

    <div class="tw">
      <table>
        <thead><tr><th>Item</th><th class="n">Volume</th><th class="n">Difficulty</th></tr></thead>
        <tbody><tr><td>example keyword</td><td class="n">1,300</td><td class="n">4</td></tr></tbody>
      </table>
    </div>

    <figure>
      <div class="bars" role="img" aria-label="Monthly volume: alpha 1,300, beta 590">
        <span class="label">alpha</span><span class="track"><span class="bar" style="width:100%"></span></span><span class="value">1,300</span>
        <span class="label">beta</span><span class="track"><span class="bar" style="width:45%"></span></span><span class="value">590</span>
      </div>
      <figcaption>One row per item; the widest bar is 100% and the rest are scaled to it.</figcaption>
    </figure>

    <hr>
    <h2 id="what-to-do-next">What to do next</h2>
    <ol><li>The first step for worthwhile work and how to check the intended result. Omit if no action is supported.</li></ol>

    <h2 id="how-this-report-was-made">How this report was made</h2>
    <p>Generated by the <a href="https://openseo.so/docs/skills/SKILL-NAME" target="_blank" rel="noopener">OpenSEO SKILL TITLE skill</a>, run by AGENT NAME on MONTH D, YYYY.</p>
    <ul class="finding">
      <li><b>Tools:</b> which OpenSEO tools reported which numbers.</li>
      <li><b>Verified:</b> what you checked against the live site by hand.</li>
    </ul>

  </article>
</div>

<footer>Prepared with OpenSEO. Data as of MONTH D, YYYY.</footer>
</div></body></html>
```

## The primitives

- **Header** — `h1` (the report title) and `.byline` (who it is for and the date): "Prepared for badseo.dev · September 3, 2026".
- **`.rail` contents** — the table of contents, sticky to the right of the text on a wide screen, dropped on a phone and in print. Every `h2` has an id, and the contents list links to each one with a plain `href="#id"` — in-page anchors are the one kind of link that must **not** use `target="_blank"`. Ids are the kebab-case of the heading text.
- **`h2` / `h3`** — `h2` opens a section, `h3` names one finding. Do not skip levels.
- **Finding** — use the producing skill's recommendation structure when specified; otherwise `h3`, then a `.finding` list with Problem, Change, and Expected effect, each one or two sentences. Keep the expected benefit visible beside the proposed work, including when it is uncertain or limited. Descriptive findings can use only the relevant bullets.
- **`.note`** — one left-ruled callout for a caveat, a confidence limit, or something you could not verify. Two or three in a report, never a row of them.
- **`.tw` table** — every numeric column gets `class="n"` on both the `th` and the `td` so the digits line up. Keep tables to five columns or fewer, put the long-text column last, and keep cell text short; a wide table scrolls on a phone and clips in print.
- **`figure` + `.bars`** — one small bar chart where a comparison reads faster than a sentence. One row per item: `.label`, a `.track` holding a `.bar` whose inline width is the value as a percentage of the largest, and `.value`. Inline SVG is fine for anything that is not a bar chart; give it a `viewBox` and real `<text>` labels.
- **`hr` then a closing `h2`** — the "What to do next" list, ordered, shortest useful.
- **How this report was made** — the last `h2`: the skill link line, then Tools and Verified bullets. See the section above.
- **`footer`** — one line: the sign-off and the data date. Method detail belongs in the closing section, not here.

## Guardrails

- Do not narrate the run in chat. Three bullets and the link is the ceiling, not the floor.
- Do not restyle the template per report. One look, kept good, is the point. A report template may set `--accent`, the byline (for example `Prepared for NAME` or a `Prepared by` sign-off), and the footer; nothing else in the CSS changes.
- Do not paste the report body into chat, and do not offer to write it to a local file instead. The report lives in the project.
- Do not save a report into a project you were not asked about. `save_report` takes the `projectId` the skill is already working in.
- Do not invent a number to fill a table cell. Write `unknown` and say why in a `.note`.

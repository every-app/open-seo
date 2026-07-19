// Rendering primitives for badseo.dev.
//
// Everything the shared chrome emits (nav, footer, and the "what this page
// tests" panel) is deliberately SEO-NEUTRAL: no <h1>–<h6> and no
// <img>. That way each fixture's headings and images are fully under the
// fixture's own control, and the audit measures exactly the defect we injected
// — not accidental noise from the layout.
import { AUDIT_ISSUE_TYPES } from "../../src/shared/audit-issues";
import type { Fixture, IssueId } from "./fixtures/types";
import { PLAUSIBLE_INIT_SCRIPT, PLAUSIBLE_SCRIPT_SRC } from "./plausible";

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Deterministic filler text so pages can clear the thin-content threshold. */
export function lorem(words: number): string {
  const bank =
    "the quick brown fox jumps over a lazy search engine while crawling deep into a sprawling website looking for signals headings titles descriptions and links that help people find genuinely useful content on the open web".split(
      " ",
    );
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(bank[i % bank.length]);
  return out.join(" ");
}

interface DocumentOptions {
  /** Omit entirely to render NO <title> element (tests missing-title). */
  title?: string;
  /** Omit entirely to render NO meta description (tests missing-meta). */
  metaDescription?: string;
  /** <link rel="canonical"> href. */
  canonical?: string;
  /** <meta name="robots"> content. */
  robotsMeta?: string;
  /** Raw HTML injected at the end of <head> (extra tags, JSON-LD, etc.). */
  headExtra?: string;
  lang?: string;
  bodyHtml: string;
}

/** Build a complete HTML document string with exact <head> control. */
export function renderDocument(opts: DocumentOptions): string {
  const head: string[] = [
    "<!-- Privacy-friendly analytics by Plausible -->",
    `<script async src="${PLAUSIBLE_SCRIPT_SRC}"></script>`,
    `<script>${PLAUSIBLE_INIT_SCRIPT}</script>`,
    '<script defer src="/analytics.js"></script>',
    '<meta charset="utf-8">',
  ];
  head.push(
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
  );
  if (opts.title !== undefined)
    head.push(`<title>${escapeHtml(opts.title)}</title>`);
  if (opts.metaDescription !== undefined)
    head.push(
      `<meta name="description" content="${escapeHtml(opts.metaDescription)}">`,
    );
  if (opts.canonical)
    head.push(`<link rel="canonical" href="${escapeHtml(opts.canonical)}">`);
  if (opts.robotsMeta)
    head.push(`<meta name="robots" content="${escapeHtml(opts.robotsMeta)}">`);
  head.push(
    '<link rel="preconnect" href="https://fonts.googleapis.com">',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Narrow:wght@500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap">',
  );
  head.push('<link rel="stylesheet" href="/styles.css">');
  if (opts.headExtra) head.push(opts.headExtra);

  return `<!doctype html>
<html lang="${opts.lang ?? "en"}">
<head>
${head.join("\n")}
</head>
<body>
${opts.bodyHtml}
</body>
</html>`;
}

function navHtml(): string {
  return `<nav class="nav">
  <a class="brand" href="/">BADSEO</a>
  <span class="nav-links"><a href="https://openseo.so">OpenSEO</a><a href="https://github.com/every-app/open-seo">GitHub</a></span>
</nav>`;
}

function footerHtml(): string {
  return `<footer class="foot"><div class="foot-inner">
  <a class="foot-brand" href="/">BADSEO</a>
  <span class="foot-links">
    <a href="/#issues">All issues</a>
    <a href="https://github.com/every-app/open-seo">GitHub</a>
    <a href="https://openseo.so">OpenSEO</a>
    <a href="/privacy">Privacy</a>
    <button class="footer-button" type="button" data-cookie-settings>Cookie settings</button>
  </span>
</div></footer>`;
}

/** Render the expected-issue chips, using the real audit-registry titles. */
function issueChips(issues: IssueId[]): string {
  if (issues.length === 0) {
    return `<span class="chip chip-clean">Should pass clean</span>`;
  }
  return issues
    .map((id) => {
      const d = AUDIT_ISSUE_TYPES[id];
      return `<span class="chip chip-${d.severity}" title="${escapeHtml(
        d.explanation,
      )}">${escapeHtml(d.title)}</span>`;
    })
    .join("");
}

/**
 * The on-page "what this page tests" panel. Heading-free and image-free so it
 * never pollutes the signals under test. Skip it (`showPanel: false`) on the
 * few pages whose word count is itself the thing being tested.
 */
function testPanel(fixture: Fixture): string {
  const lesson = fixture.lesson
    ? `<p class="panel-lesson">${escapeHtml(fixture.lesson)}</p>`
    : "";
  return `<aside class="panel" aria-label="What this page tests">
  <div class="panel-head">
    <span class="panel-kicker">What this page tests</span>
    <span class="panel-cat">${escapeHtml(fixture.category)}</span>
  </div>
  <p class="panel-summary">${escapeHtml(fixture.summary)}</p>
  ${lesson}
  <div class="panel-chips">
    <span class="chips-label">Audit should flag:</span>
    ${issueChips(fixture.expectedIssues)}
  </div>
</aside>`;
}

function withChrome(inner: string): string {
  return `${navHtml()}
${inner}
${footerHtml()}`;
}

interface PageOptions extends DocumentOptions {
  fixture: Fixture;
  showPanel?: boolean;
}

/** Compose chrome + optional test panel + fixture body into a full document. */
export function renderPage(opts: PageOptions): string {
  const { fixture, showPanel = true, ...doc } = opts;
  const panel = showPanel ? testPanel(fixture) : "";
  const inner = `${panel}
<main class="main">
${doc.bodyHtml}
</main>`;
  return renderDocument({ ...doc, bodyHtml: withChrome(inner) });
}

/** Chrome-wrapped page with NO test panel — for the home and catalog pages. */
export function renderShell(opts: DocumentOptions): string {
  const inner = `<main class="main">
${opts.bodyHtml}
</main>`;
  return renderDocument({ ...opts, bodyHtml: withChrome(inner) });
}

interface HtmlResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  /** Artificial delay before responding — tests slow-response. */
  delayMs?: number;
}

export async function htmlResponse(
  html: string,
  opts: HtmlResponseOptions = {},
): Promise<Response> {
  if (opts.delayMs && opts.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, opts.delayMs));
  }
  return new Response(html, {
    status: opts.status ?? 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...opts.headers,
    },
  });
}

/** A manual 3xx redirect (crawler records each hop as its own page row). */
export function redirect(location: string, status = 301): Response {
  return new Response(null, {
    status,
    headers: { location, "cache-control": "no-store" },
  });
}

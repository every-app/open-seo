// The report sandbox lives here so the two halves cannot drift: the header
// `/r/<reportId>` serves, and the `sandbox` attribute the in-app viewer puts on
// the iframe pointing at that same document. A report is a full HTML document
// written by a model from attacker-influenceable inputs (crawled pages, SERP
// titles, GSC queries), so it is treated as hostile in both cases.
//
// The `sandbox` directive is what makes the open-in-a-tab case safe: a
// top-level document has no iframe attribute, and the directive gives it an
// opaque origin anyway — no cookies, no localStorage, no same-origin access to
// the app.

// `allow-popups` plus `allow-popups-to-escape-sandbox` let a report's
// `target="_blank"` links open normally (the audited site, a reference);
// everything else stays restricted. `allow-same-origin` is never added: it
// would hand the frame the app's cookies and, with scripts, let the frame
// remove its own sandbox.
const SANDBOX = "allow-popups allow-popups-to-escape-sandbox";

/**
 * The iframe's `sandbox` attribute value. It allows scripts so the document's
 * own CSP decides, and that only ever lets the app's scripts run (see
 * reportCsp). The attribute must always be present — an absent `sandbox`
 * attribute is no sandbox at all.
 */
export const REPORT_IFRAME_SANDBOX = `allow-scripts ${SANDBOX}`;

// `'self'` in img-src and connect-src is for the rank-grid widget's map: its
// tiles, and the copyright line Google requires under them, both come through
// /report-map (see report-map.ts). Nothing in a report can run a fetch; only
// the widget script can.
const CSP_TAIL =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data: 'self'; font-src data:; connect-src 'self'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'";

// A report's own JavaScript never runs: with no `script-src`,
// `default-src 'none'` blocks every script.
export const REPORT_CSP = `sandbox ${SANDBOX}; ${CSP_TAIL}`;

/**
 * The widget bundle built from src/report-widgets by
 * vite.report-widgets.config.ts, injected into a report that has a map to
 * draw. It reads declarative blocks (a figure with a JSON data block) and draws
 * them; it never evaluates anything found in the document.
 */
export const REPORT_WIDGETS_SRC = "/report-widgets/v1.js";

/**
 * The script print mode appends, and the only script authorized to run in a
 * report. It opens every closed `<details>` first, so an evidence appendix a
 * skill collapsed on screen still lands in the PDF, then waits a little after
 * `load` so fonts and images settle before the dialog snapshots the page. It is
 * injected with no attributes at all — see withPrintScript.
 */
export const PRINT_SCRIPT =
  'addEventListener("load",()=>{for(const d of document.querySelectorAll("details"))d.open=true;setTimeout(()=>print(),150)})';

/**
 * Base64 SHA-256 of PRINT_SCRIPT, for the `script-src` hash source. Hardcoded
 * rather than computed at module load: the digest is needed synchronously and
 * Web Crypto is async. report-sandbox.test.ts recomputes it from PRINT_SCRIPT,
 * so editing the script without editing this constant fails the suite instead
 * of silently breaking printing.
 */
export const PRINT_SCRIPT_SHA256 =
  "uE0MLbgBgIu3I3pghlY0762kVHKlP7Udz5qzZNT7piw=";

/**
 * The policy for one response: REPORT_CSP, byte for byte, unless the app adds
 * a script of its own. The widget tag carries a per-response nonce that nothing
 * stored in a report can, and the print script is named by hash, so a report's
 * own scripts stay blocked however they are hidden.
 *
 * Print mode (`/r/<id>?print=1`) appends a `print()` call, so "Export" lands in
 * the browser's print dialog instead of asking the reader to find it. It also
 * needs `allow-modals`, since `print()` is a modal in a sandbox — see
 * withPrintScript.
 */
export function reportCsp(
  options: { nonce?: string; print?: boolean } = {},
): string {
  const sources: string[] = [];
  if (options.nonce) sources.push(`'nonce-${options.nonce}'`);
  if (options.print) sources.push(`'sha256-${PRINT_SCRIPT_SHA256}'`);
  if (sources.length === 0) return REPORT_CSP;
  const modals = options.print ? " allow-modals" : "";
  return `sandbox allow-scripts ${SANDBOX}${modals}; script-src ${sources.join(" ")}; ${CSP_TAIL}`;
}

/**
 * The plain-text response both report routes answer errors with: the sandbox
 * headers belong to the document, and these bodies are ours.
 */
export function textResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Appends PRINT_SCRIPT to a stored document, last so it runs after the page.
 * The splice happens without parsing a document we did not write, so a report
 * ending in a dangling `<script src="…" ` absorbs whatever we put on our tag;
 * an attribute-free tag gives such a document nothing but a valueless
 * attribute name, and printing simply no-ops there.
 */
function withPrintScript(html: string): string {
  const tag = `<script>${PRINT_SCRIPT}</script>`;
  const bodyClose = html.lastIndexOf("</body>");
  if (bodyClose !== -1)
    return html.slice(0, bodyClose) + tag + html.slice(bodyClose);
  const htmlClose = html.lastIndexOf("</html>");
  if (htmlClose !== -1)
    return html.slice(0, htmlClose) + tag + html.slice(htmlClose);
  return html + tag;
}

/**
 * Injects the widget script tag right after the doctype, where nothing a
 * stored document wrote can precede it: an unclosed `<script src="…" ` at the
 * end of a document would otherwise absorb a tag appended there, and with it
 * the nonce. `defer` runs it once the document is parsed. A document without a
 * closed doctype gets the tag first of all, which is just as safe; a doctype
 * left unclosed swallows the tag entirely, and the widget simply never boots.
 */
function withWidgetScript(html: string, nonce: string, mapGrants: string[]) {
  // Grants are path-safe (see readMapGrant), so they need no escaping here.
  const tag = `<script nonce="${nonce}" src="${REPORT_WIDGETS_SRC}" data-map-grants="${mapGrants.join(" ")}" defer></script>`;
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  if (!doctype) return tag + html;
  const end = doctype.index + doctype[0].length;
  return html.slice(0, end) + tag + html.slice(end);
}

/**
 * The one response both report documents are served with — `/r/<id>` for a
 * member and `/s/<token>/raw` for a link holder — so the sandbox, the print
 * script and the header set cannot drift between them. Only the cache scope
 * and the robots tag differ: the public document is the one search engines
 * could reach.
 */
export function reportDocumentResponse(
  html: string,
  options: {
    print?: boolean;
    cacheControl: string;
    noindex?: boolean;
    /** From createReportMapGrants: let the rank-grid widget draw its maps. */
    mapGrants?: string[];
  },
): Response {
  // The widget only loads where it has a map to draw.
  const mapGrants = options.mapGrants ?? [];
  const nonce = mapGrants.length > 0 ? crypto.randomUUID() : undefined;
  const document = nonce ? withWidgetScript(html, nonce, mapGrants) : html;
  return new Response(options.print ? withPrintScript(document) : document, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": reportCsp({ nonce, print: options.print }),
      // The sandbox allows popups to escape, so a link in a report opens a
      // real page that would otherwise keep a handle on this tab and be able
      // to navigate it. COOP severs that handle. Ignored when framed, which is
      // what both viewers want.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(options.noindex ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
      "Cache-Control": options.cacheControl,
    },
  });
}

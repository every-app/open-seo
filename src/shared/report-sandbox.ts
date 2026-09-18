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

/**
 * The iframe's `sandbox` attribute value, matching the CSP's sandbox
 * directive. `allow-popups` plus `allow-popups-to-escape-sandbox` let a
 * report's `target="_blank"` links open normally (the audited site, a
 * reference); everything else stays restricted. The attribute must always be
 * present — an absent `sandbox` attribute is no sandbox at all — and
 * `allow-same-origin` is never added: it would hand the frame the app's cookies
 * and, with scripts, let the frame remove its own sandbox.
 */
export const REPORT_IFRAME_SANDBOX =
  "allow-popups allow-popups-to-escape-sandbox";

const CSP_TAIL =
  "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'self'";

// The report's own JavaScript is blocked, and there is no `script-src`:
// `default-src 'none'` already blocks every script. One flip turns it on, in
// three places: add `allow-scripts` to the sandbox directive below, add it to
// REPORT_IFRAME_SANDBOX, and add `script-src 'unsafe-inline'` here. Reports
// saved while JS is blocked keep working after the flip; the reverse is not
// true, which is why blocking is the V1 default.
export const REPORT_CSP = `sandbox ${REPORT_IFRAME_SANDBOX}; ${CSP_TAIL}`;

/**
 * The script print mode appends, and the only script authorized to run in a
 * report. A small delay after `load`, so fonts and images settle before the
 * dialog snapshots the page. It is injected with no attributes at all — see
 * withPrintScript.
 */
export const PRINT_SCRIPT =
  'addEventListener("load",()=>{setTimeout(()=>print(),150)})';

/**
 * Base64 SHA-256 of PRINT_SCRIPT, for the `script-src` hash source. Hardcoded
 * rather than computed at module load: the digest is needed synchronously and
 * Web Crypto is async. report-sandbox.test.ts recomputes it from PRINT_SCRIPT,
 * so editing the script without editing this constant fails the suite instead
 * of silently breaking printing.
 */
export const PRINT_SCRIPT_SHA256 =
  "thhppZwgMkIvdqds8iPeCMHMT5bX6Wi4nx2PdnxB36w=";

/**
 * The policy for one response. Outside print mode it is REPORT_CSP, byte for
 * byte.
 *
 * Print mode (`/r/<id>?print=1`) is the one case the app appends a script of
 * its own — a `print()` call, so "Export" lands in the browser's print dialog
 * instead of asking the reader to find it. That needs `allow-scripts` (and
 * `allow-modals`, since `print()` is a modal in a sandbox) plus a `script-src`
 * naming the hash of that one script, which is also what keeps the report's own
 * scripts blocked — see withPrintScript.
 */
export function reportCsp(print?: boolean): string {
  if (!print) return REPORT_CSP;
  return `sandbox ${REPORT_IFRAME_SANDBOX} allow-scripts allow-modals; script-src 'sha256-${PRINT_SCRIPT_SHA256}'; ${CSP_TAIL}`;
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
 * The one response both report documents are served with — `/r/<id>` for a
 * member and `/s/<token>/raw` for a link holder — so the sandbox, the print
 * script and the header set cannot drift between them. Only the cache scope
 * and the robots tag differ: the public document is the one search engines
 * could reach.
 */
export function reportDocumentResponse(
  html: string,
  options: { print?: boolean; cacheControl: string; noindex?: boolean },
): Response {
  return new Response(options.print ? withPrintScript(html) : html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": reportCsp(options.print),
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

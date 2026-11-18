import { describe, expect, it } from "vitest";
import {
  PRINT_SCRIPT,
  PRINT_SCRIPT_SHA256,
  REPORT_WIDGETS_SRC,
  reportCsp,
  reportDocumentResponse,
} from "./report-sandbox";

describe("report-sandbox", () => {
  // The hash is hardcoded because the CSP needs it synchronously, so editing
  // PRINT_SCRIPT without editing the constant would block the print script and
  // silently break "Export". This is what catches that.
  it("authorizes the print script by the digest of its own text", async () => {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(PRINT_SCRIPT),
    );
    const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));

    expect(base64).toBe(PRINT_SCRIPT_SHA256);
    expect(reportCsp({ print: true })).toContain(
      `script-src 'sha256-${base64}'`,
    );
  });

  // The widget script is the only script a report with a map runs: the tag
  // the server injects carries the response's nonce, the CSP names that nonce
  // and nothing else, and the tag lands after the doctype where no stored
  // markup can absorb it.
  it("injects the widget script under the response nonce", async () => {
    const response = reportDocumentResponse(
      '<!doctype html><html><body><script>alert(1)</script><script src="x" </body></html>',
      { cacheControl: "no-store", mapGrants: ["grant"] },
    );
    const html = await response.text();
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];

    expect(nonce).toBeTruthy();
    expect(csp).toContain("sandbox allow-scripts");
    expect(
      html.startsWith(
        `<!doctype html><script nonce="${nonce}" src="${REPORT_WIDGETS_SRC}" data-map-grants="grant" defer></script>`,
      ),
    ).toBe(true);
    expect(html.split(`nonce="${nonce}"`).length).toBe(2);
  });
});

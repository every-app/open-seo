import { describe, expect, it } from "vitest";
import { PRINT_SCRIPT, PRINT_SCRIPT_SHA256, reportCsp } from "./report-sandbox";

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
    expect(reportCsp(true)).toContain(`script-src 'sha256-${base64}'`);
  });
});

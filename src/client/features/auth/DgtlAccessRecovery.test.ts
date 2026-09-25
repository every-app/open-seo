import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { DgtlAccessRecovery, isDgtlRecoveryError } from "./DgtlAccessRecovery";

vi.mock("@/lib/auth-client", () => ({ authClient: {} }));

describe("DGTL access recovery", () => {
  it("hands legacy sessions to central authentication without local login forms", () => {
    const html = renderToStaticMarkup(
      createElement(DgtlAccessRecovery, {
        error: new Error("DGTL_LINK_REQUIRED"),
      }),
    );
    expect(html).toContain('aria-label="Opening your dashboard"');
    expect(html).not.toContain("Connecting to your DGTL account");
    expect(html).not.toContain("Link DGTL account");
    expect(html).not.toContain("<input");
  });
  it("offers session renewal instead of linking for expired authentication", () => {
    const html = renderToStaticMarkup(
      createElement(DgtlAccessRecovery, {
        error: new Error("DGTL_REAUTH_REQUIRED"),
      }),
    );
    expect(html).toContain("Reconnect to DGTL");
    expect(html).not.toContain("Link DGTL account");
  });
  it("does not treat a permissions denial as a recoverable session", () => {
    expect(isDgtlRecoveryError(new Error("FORBIDDEN"))).toBe(false);
    expect(isDgtlRecoveryError(new Error("DGTL_LINK_REQUIRED"))).toBe(true);
    expect(isDgtlRecoveryError(new Error("DGTL_REAUTH_REQUIRED"))).toBe(true);
  });
});

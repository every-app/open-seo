import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DgtlSsoRedirect } from "./DgtlSsoRedirect";

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { oauth2: vi.fn() } },
  isSigningOut: () => false,
}));

describe("automatic dashboard handoff", () => {
  it("has no connecting screen or extra login action", () => {
    const html = renderToStaticMarkup(
      createElement(DgtlSsoRedirect, { redirectTo: "/", signedOut: false }),
    );
    expect(html).toContain('aria-label="Opening your dashboard"');
    expect(html).not.toContain("Connecting to your DGTL account");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<a");
  });
  it("keeps signed-out users out of automatic login", () => {
    const html = renderToStaticMarkup(
      createElement(DgtlSsoRedirect, { redirectTo: "/", signedOut: true }),
    );
    expect(html).toContain("You are signed out of SEO.");
    expect(html).toContain("Return to My services");
  });
});

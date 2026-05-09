import { describe, expect, it } from "vitest";
import {
  getAuthRedirectFromSearch,
  getCurrentAuthRedirectFromHref,
  getOAuthAuthorizeRedirectFromSearch,
  getOAuthSignedQuery,
  getSignInHref,
  normalizeAuthRedirect,
} from "./auth-redirect";

const oauthSearch = new URLSearchParams({
  response_type: "code",
  client_id: "claude-client",
  redirect_uri: "https://claude.ai/api/mcp/auth_callback",
  scope: "offline_access mcp",
  state: "state-123",
  code_challenge: "challenge-123",
  code_challenge_method: "S256",
  resource: "https://app.openseo.so/mcp",
  exp: "1778271800",
  sig: "signed-value",
}).toString();

describe("auth redirect helpers", () => {
  it("defaults unsafe or missing redirects to the app root", () => {
    expect(normalizeAuthRedirect(undefined)).toBe("/");
    expect(normalizeAuthRedirect("https://evil.example/app")).toBe("/");
    expect(normalizeAuthRedirect("//evil.example/app")).toBe("/");
  });

  it("keeps same-origin relative redirects", () => {
    expect(
      normalizeAuthRedirect("/api/auth/oauth2/authorize?client_id=abc"),
    ).toBe("/api/auth/oauth2/authorize?client_id=abc");
  });

  it("rejects external and protocol-relative redirects", () => {
    expect(normalizeAuthRedirect("https://evil.test")).toBe("/");
    expect(normalizeAuthRedirect("//evil.test")).toBe("/");
  });

  it("builds sign-in links with the redirect query only when needed", () => {
    expect(getSignInHref("/")).toBe("/sign-in");
    expect(getSignInHref("/oauth-consent?client_id=abc")).toBe(
      "/sign-in?redirect=%2Foauth-consent%3Fclient_id%3Dabc",
    );
  });

  it("extracts the current path, query, and hash from hrefs", () => {
    expect(
      getCurrentAuthRedirectFromHref(
        "https://open-seo.test/projects?tab=keywords#top",
      ),
    ).toBe("/projects?tab=keywords#top");
  });

  it("preserves safe internal redirects", () => {
    expect(getAuthRedirectFromSearch("", "/app")).toBe("/app");
  });

  it("extracts Better Auth signed OAuth query parameters through sig", () => {
    const signedQuery = getOAuthSignedQuery(
      `${oauthSearch}&ignored_after_sig=true`,
    );

    expect(signedQuery).toBe(oauthSearch);
  });

  it("builds an internal OAuth authorize continuation redirect", () => {
    const redirect = getOAuthAuthorizeRedirectFromSearch(oauthSearch);

    expect(redirect).toBe(`/api/auth/oauth2/authorize?${oauthSearch}`);
    expect(redirect).toContain("client_id=claude-client");
    expect(redirect).toContain(
      "redirect_uri=https%3A%2F%2Fclaude.ai%2Fapi%2Fmcp%2Fauth_callback",
    );
    expect(redirect).toContain("scope=offline_access+mcp");
    expect(redirect).toContain("state=state-123");
    expect(redirect).toContain("code_challenge=challenge-123");
    expect(redirect).toContain("code_challenge_method=S256");
    expect(redirect).toContain("resource=https%3A%2F%2Fapp.openseo.so%2Fmcp");
    expect(redirect).toContain("exp=1778271800");
    expect(redirect).toContain("sig=signed-value");
  });

  it("prefers OAuth continuation over a generic redirect", () => {
    expect(getAuthRedirectFromSearch(oauthSearch, "/app")).toBe(
      `/api/auth/oauth2/authorize?${oauthSearch}`,
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  getAuthRedirectFromSearch,
  getOAuthSignedQuery,
  getSignInHref,
  isDocumentRoute,
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
  it("reloads report documents and public shares after sign-in", () => {
    const share = `/s/${"a".repeat(32)}`;
    for (const destination of [
      "/r/report-id",
      share,
      `${share}/`,
      `${share}?source=email#top`,
      `${share}/raw`,
    ]) {
      expect(isDocumentRoute(destination)).toBe(true);
    }
    expect(isDocumentRoute("/projects")).toBe(false);
    expect(isDocumentRoute("/sign-in")).toBe(false);
  });

  it("defaults unsafe or missing redirects to the app root, keeping same-origin paths", () => {
    expect(normalizeAuthRedirect(undefined)).toBe("/");
    expect(normalizeAuthRedirect("https://evil.example/app")).toBe("/");
    expect(normalizeAuthRedirect("//evil.example/app")).toBe("/");
    expect(
      normalizeAuthRedirect("/api/auth/oauth2/authorize?client_id=abc"),
    ).toBe("/api/auth/oauth2/authorize?client_id=abc");
  });

  it("rejects backslash redirects that URL parsers treat as slashes", () => {
    expect(normalizeAuthRedirect("/\\evil.test")).toBe("/");
    expect(normalizeAuthRedirect("/path\\..\\evil")).toBe("/");
  });

  it("rejects tab and newline redirects that URL parsers strip into //", () => {
    expect(normalizeAuthRedirect("/\t/evil.test")).toBe("/");
    expect(normalizeAuthRedirect("/\n/evil.test")).toBe("/");
  });

  it("builds sign-in links with the redirect query only when needed", () => {
    expect(getSignInHref("/")).toBe("/sign-in");
    expect(getSignInHref("/oauth-consent?client_id=abc")).toBe(
      "/sign-in?redirect=%2Foauth-consent%3Fclient_id%3Dabc",
    );
  });

  it("extracts Better Auth signed OAuth query parameters through sig", () => {
    const signedQuery = getOAuthSignedQuery(
      `${oauthSearch}&ignored_after_sig=true`,
    );

    expect(signedQuery).toBe(oauthSearch);
  });

  it("prefers OAuth continuation over a generic redirect", () => {
    expect(getAuthRedirectFromSearch(oauthSearch, "/app")).toBe(
      `/api/auth/oauth2/authorize?${oauthSearch}`,
    );
  });
});

import { describe, expect, it } from "vitest";
import { decodeBingAccessToken } from "./bing";

/** Base64url-encode JSON the way Bing's token endpoint does. */
function encodeToken(claims: Record<string, unknown>): string {
  const json = JSON.stringify(claims);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

// Same claim set a live Bing token carries (verified 2026-07-25), with the
// account identifier and email replaced.
const liveShapedClaims = {
  webmasteruid: "0123456789ABCDEF0123456789ABCDEF",
  webmasteremail: "owner@example.com",
  aud: ["client-abc", "client-abc"],
  nameid: "0123456789ABCDEF0123456789ABCDEF",
  client_id: "client-abc",
  token_type: ["access_token", "access_token"],
  ver: "1.0.0",
  scope: "Read",
  nbf: 1784963853,
  exp: 1784967453,
  iat: 1784963853,
  iss: "webmaster",
};

describe("decodeBingAccessToken", () => {
  it("reads identity out of a live-shaped token", () => {
    const claims = decodeBingAccessToken(encodeToken(liveShapedClaims));

    expect(claims?.webmasteruid).toBe("0123456789ABCDEF0123456789ABCDEF");
    expect(claims?.webmasteremail).toBe("owner@example.com");
  });

  it("preserves unknown claims rather than stripping them", () => {
    const claims = decodeBingAccessToken(encodeToken(liveShapedClaims));

    expect(claims).toMatchObject({ iss: "webmaster", ver: "1.0.0" });
  });

  it("keeps Bing's capitalised scope verbatim", () => {
    // Bing returns "Read" for a "Webmaster.read" request. Anything comparing
    // these for equality is a bug, so the raw value must survive decoding.
    const claims = decodeBingAccessToken(encodeToken(liveShapedClaims));

    expect(claims?.scope).toBe("Read");
  });

  it("falls back to the JWT middle segment if Bing switches format", () => {
    const token = `header.${encodeToken(liveShapedClaims)}.signature`;

    expect(decodeBingAccessToken(token)?.webmasteruid).toBe(
      "0123456789ABCDEF0123456789ABCDEF",
    );
  });

  it("returns null without an account identifier", () => {
    expect(decodeBingAccessToken(encodeToken({ iss: "webmaster" }))).toBeNull();
    expect(decodeBingAccessToken(encodeToken({ webmasteruid: "" }))).toBeNull();
  });

  it("returns null for tokens that are not base64url JSON", () => {
    expect(decodeBingAccessToken("")).toBeNull();
    expect(decodeBingAccessToken("not-a-token")).toBeNull();
    expect(decodeBingAccessToken(btoa("plain text"))).toBeNull();
  });
});

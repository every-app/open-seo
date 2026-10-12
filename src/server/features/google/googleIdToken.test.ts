import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { afterEach, expect, it, vi } from "vitest";
import { getGoogleAccountId } from "./googleIdToken";

afterEach(() => vi.unstubAllGlobals());

it("accepts only a Google-signed ID token for this OAuth client", async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { kid: "test-key", alg: "RS256", use: "sig" });
  const fetchKeys = vi.fn(async (input: RequestInfo | URL) => {
    const url =
      input instanceof URL
        ? input.href
        : input instanceof Request
          ? input.url
          : input;
    expect(url).toBe("https://www.googleapis.com/oauth2/v3/certs");
    return new Response(JSON.stringify({ keys: [publicJwk] }), {
      status: 200,
      headers: { "Cache-Control": "public, max-age=60" },
    });
  });
  vi.stubGlobal("fetch", fetchKeys);

  const sign = async (
    claims: JWTPayload = {},
    issuer = "https://accounts.google.com",
  ) =>
    new SignJWT({ sub: "google-account-1", ...claims })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setAudience("google-client-id")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(privateKey);

  const valid = await sign();
  await expect(getGoogleAccountId(valid, "google-client-id")).resolves.toBe(
    "google-account-1",
  );
  expect(fetchKeys).toHaveBeenCalledTimes(1);
  await expect(getGoogleAccountId(valid, "other-client")).rejects.toThrow();
  await expect(
    getGoogleAccountId(
      await sign({}, "https://other.example"),
      "google-client-id",
    ),
  ).rejects.toThrow();
  const now = Math.floor(Date.now() / 1_000);
  const expired = await new SignJWT({ sub: "google-account-1" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://accounts.google.com")
    .setAudience("google-client-id")
    .setIssuedAt(now - 3_600)
    .setExpirationTime(now - 1)
    .sign(privateKey);
  await expect(
    getGoogleAccountId(expired, "google-client-id"),
  ).rejects.toThrow();
  const [header, payload, signature] = valid.split(".");
  if (!header || !payload || !signature) throw new Error("Invalid test token");
  const broken = `${header}.${payload}.${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
  await expect(
    getGoogleAccountId(broken, "google-client-id"),
  ).rejects.toThrow();
});

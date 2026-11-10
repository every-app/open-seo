import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fetchServiceAccountAccessToken,
  importServiceAccountKey,
  serviceAccountKeyFileSchema,
} from "./googleServiceAccountToken";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue(
    Response.json({ access_token: "ya29.token", expires_in: 3599 }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

async function generateKeyFile() {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const der = new Uint8Array(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey),
  );
  const base64 = btoa(String.fromCharCode(...der));
  const pem = `-----BEGIN PRIVATE KEY-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END PRIVATE KEY-----\n`;
  return { pem, publicKey: pair.publicKey };
}

function decodeSegment(segment: string) {
  const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

it("trades a signed RS256 assertion for a token at Google's fixed endpoint", async () => {
  const { pem, publicKey } = await generateKeyFile();
  // A key file's own token_uri must not redirect the exchange.
  const keyFile = serviceAccountKeyFileSchema.parse({
    type: "service_account",
    client_email: "reader@project.iam.gserviceaccount.com",
    private_key: pem,
    token_uri: "https://attacker.example/token",
  });

  const token = await fetchServiceAccountAccessToken({
    clientEmail: keyFile.client_email,
    privateKey: await importServiceAccountKey(keyFile.private_key),
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
  });

  expect(token).toEqual({ accessToken: "ya29.token", expiresInSeconds: 3599 });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://oauth2.googleapis.com/token");
  const body = init?.body;
  if (!(body instanceof URLSearchParams))
    throw new Error("Expected a form body");
  expect(body.get("grant_type")).toBe(
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
  );
  const [header, claims, signature] = (body.get("assertion") ?? "").split(".");
  expect(
    await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      publicKey,
      decodeSegment(signature),
      new TextEncoder().encode(`${header}.${claims}`),
    ),
  ).toBe(true);
  expect(
    JSON.parse(new TextDecoder().decode(decodeSegment(claims))),
  ).toMatchObject({
    iss: "reader@project.iam.gserviceaccount.com",
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
  });
});

it("returns null when Google rejects the key", async () => {
  const { pem } = await generateKeyFile();
  fetchMock.mockResolvedValue(
    Response.json({ error: "invalid_grant" }, { status: 400 }),
  );

  await expect(
    fetchServiceAccountAccessToken({
      clientEmail: "reader@project.iam.gserviceaccount.com",
      privateKey: await importServiceAccountKey(pem),
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
    }),
  ).resolves.toBeNull();
});

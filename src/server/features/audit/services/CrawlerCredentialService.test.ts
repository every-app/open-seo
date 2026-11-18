import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOptionalEnvValue } from "@/server/lib/runtime-env";

const { upsertMock, listMock } = vi.hoisted(() => ({
  upsertMock: vi.fn(),
  listMock: vi.fn(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi
    .fn()
    .mockResolvedValue("test-secret-that-is-at-least-32-chars"),
}));
vi.mock(
  "@/server/features/audit/repositories/CrawlerCredentialRepository",
  () => ({
    CrawlerCredentialRepository: {
      upsert: upsertMock,
      listForOrganization: listMock,
    },
  }),
);

import { CrawlerCredentialService } from "@/server/features/audit/services/CrawlerCredentialService";

// Stands in for the key Shopify publishes in its key directory.
const shopifyKey = await crypto.subtle.generateKey("Ed25519", false, [
  "sign",
  "verify",
]);
const directoryKey = {
  ...(await crypto.subtle.exportKey("jwk", shopifyKey.publicKey)),
  kid: "shopify-key",
};

/** Signs the way Shopify admin does: over the domain and Signature-Agent. */
async function shopifySignature(domain: string) {
  const params = `("@authority" "signature-agent");keyid="shopify-key"`;
  const base = `"@authority": ${domain}\n"signature-agent": "https://shopify.com"\n"@signature-params": ${params}`;
  const signed = await crypto.subtle.sign(
    "Ed25519",
    shopifyKey.privateKey,
    new TextEncoder().encode(base),
  );
  return {
    signatureInput: `sig1=${params}`,
    signature: `sig1=:${Buffer.from(signed).toString("base64")}:`,
  };
}

function save(values: { signatureInput: string; signature: string }) {
  return CrawlerCredentialService.saveCrawlerCredential({
    organizationId: "org-1",
    projectId: "project-1",
    userId: "user-1",
    host: "store.example.com",
    ...values,
  });
}

describe("saveCrawlerCredential", () => {
  beforeEach(() => {
    listMock.mockResolvedValue([
      { projectId: "project-1", host: "store.example.com" },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json(directoryKey)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves a signature Shopify made for the domain", async () => {
    const result = await save(await shopifySignature("store.example.com"));

    expect(result).toMatchObject({ credential: { host: "store.example.com" } });
  });

  it("names the domain a www-twin signature was made for", async () => {
    const result = await save(await shopifySignature("www.store.example.com"));

    expect(result).toEqual({
      problem: {
        reason: "wrong_domain",
        host: "store.example.com",
        signedHost: "www.store.example.com",
      },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      "the Signature pasted into both fields",
      async () => {
        const { signature } = await shopifySignature("store.example.com");
        return { signatureInput: signature, signature };
      },
    ],
    [
      "a signature for another store",
      () => shopifySignature("other-store.example.com"),
    ],
  ])("rejects %s", async (_case, values) => {
    const result = await save(await values());

    expect(result).toEqual({
      problem: { reason: "invalid", host: "store.example.com" },
    });
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("saves unchecked when Shopify's key directory is unreachable", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("fetch failed"));

    const result = await save(
      await shopifySignature("other-store.example.com"),
    );

    expect(result).toMatchObject({ credential: { host: "store.example.com" } });
  });
});

describe("hasEncryptionKey", () => {
  // What the client reads as canStoreCrawlerAccess before it offers the form.
  it("is true with a CRAWLER_ACCESS_SECRET of 32 or more characters", async () => {
    await expect(CrawlerCredentialService.hasEncryptionKey()).resolves.toBe(
      true,
    );
  });

  it.each([
    ["unset", undefined],
    ["shorter than 32 characters", "too-short-to-encrypt-with"],
    ["32 characters only with its whitespace", `${"x".repeat(31)} `],
  ])("is false when the secret is %s", async (_case, value) => {
    vi.mocked(getOptionalEnvValue).mockResolvedValueOnce(value);

    await expect(CrawlerCredentialService.hasEncryptionKey()).resolves.toBe(
      false,
    );
  });
});

describe("openCrawlerAccess", () => {
  it("fails instead of crawling unsigned when the worker has no key", async () => {
    vi.mocked(getOptionalEnvValue).mockResolvedValueOnce(undefined);

    await expect(
      CrawlerCredentialService.openCrawlerAccess({
        host: "store.example.com",
        signatureInput: "sealed",
        signature: "sealed",
        expiresAt: null,
      }),
    ).rejects.toMatchObject({ code: "AUTH_CONFIG_MISSING" });
  });
});

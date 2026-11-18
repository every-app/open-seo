import { component, verifySignature } from "http-message-sig";
import { describe, expect, it, vi } from "vitest";
import { verify } from "web-bot-auth";
import { verifierFromJWK } from "web-bot-auth/crypto";
import {
  auditRequestHeaders,
  webBotAuthDirectoryResponse,
} from "@/server/lib/audit/web-bot-auth";
import { shopifyCrawlerHeaders } from "@/shared/crawler-access";

// Throwaway Ed25519 key generated for this test only.
vi.stubEnv(
  "WEB_BOT_AUTH_JWK",
  JSON.stringify({
    kty: "OKP",
    crv: "Ed25519",
    x: "glWMEy-lxqPQCnzI1tlvw2Dcdb-t_eKxsPBnrJGe1sI",
    d: "gKhzKRPN1zRoY7qGIrJOgIR3EAKc2z2or811liRtJPs",
  }),
);

describe("auditRequestHeaders", () => {
  it("signs requests with the key the signed directory publishes", async () => {
    const url = "https://example.com/page";
    const headers = await auditRequestHeaders(url, null);
    const directoryRequest = new Request(
      "https://app.openseo.so/.well-known/http-message-signatures-directory",
    );
    const directory = await webBotAuthDirectoryResponse(directoryRequest);
    const { keys } = await directory.json<{ keys: JsonWebKey[] }>();
    const verifier = await verifierFromJWK(keys[0]);

    expect(keys[0]).not.toHaveProperty("d");
    await expect(
      verify(new Request(url, { headers }), { resolver: () => verifier }),
    ).resolves.toMatchObject({
      signatureAgent: { uri: "https://app.openseo.so" },
    });
    // The directory itself is signed the way Cloudflare's verifier expects.
    await expect(
      verifySignature(
        {
          kind: "response",
          status: directory.status,
          fields: [...directory.headers].map(([name, value]) => ({
            name,
            value,
          })),
          request: directoryRequest,
        },
        {
          label: "binding0",
          policy: {
            algorithms: ["ed25519"],
            requiredComponents: [component("@authority", { req: true })],
            requiredParameters: ["keyid", "created", "expires", "tag"],
            validate: (signature) =>
              signature.parameters.tag === "http-message-signatures-directory",
          },
          resolveVerifier: () => verifier,
        },
      ),
    ).resolves.toBeDefined();
  });

  it("sends a store's Shopify signature instead of ours", async () => {
    const shopify = shopifyCrawlerHeaders("sig1=(...)", "sig1=:abc:");
    const headers = await auditRequestHeaders("https://store.com/", {
      host: "store.com",
      headers: shopify,
      expiresAt: null,
    });

    expect(headers).toEqual({ "User-Agent": "OpenSEO-Audit/1.0", ...shopify });
  });
});

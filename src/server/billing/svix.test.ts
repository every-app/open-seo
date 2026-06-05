import { describe, expect, it } from "vitest";
import { verifySvixSignature } from "./svix";

const SECRET_BYTES = "test-webhook-secret";
const SECRET = `whsec_${Buffer.from(SECRET_BYTES).toString("base64")}`;

describe("verifySvixSignature", () => {
  it("accepts a valid Svix signature", async () => {
    const payload = JSON.stringify({ type: "billing.updated" });
    const headers = await signedHeaders({
      id: "msg_123",
      payload,
      timestamp: 1_000,
    });

    await expect(
      verifySvixSignature({
        headers,
        nowSeconds: 1_000,
        payload,
        secret: SECRET,
      }),
    ).resolves.toBe(true);
  });

  it("rejects tampered payloads", async () => {
    const payload = JSON.stringify({ type: "billing.updated" });
    const headers = await signedHeaders({
      id: "msg_123",
      payload,
      timestamp: 1_000,
    });

    await expect(
      verifySvixSignature({
        headers,
        nowSeconds: 1_000,
        payload: JSON.stringify({ type: "other" }),
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });

  it("rejects stale timestamps", async () => {
    const payload = JSON.stringify({ type: "billing.updated" });
    const headers = await signedHeaders({
      id: "msg_123",
      payload,
      timestamp: 1_000,
    });

    await expect(
      verifySvixSignature({
        headers,
        nowSeconds: 1_400,
        payload,
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });

  it("rejects malformed signatures without throwing", async () => {
    const payload = JSON.stringify({ type: "billing.updated" });
    const headers = new Headers({
      "svix-id": "msg_123",
      "svix-signature": "v1,not-base64!",
      "svix-timestamp": "1000",
    });

    await expect(
      verifySvixSignature({
        headers,
        nowSeconds: 1_000,
        payload,
        secret: SECRET,
      }),
    ).resolves.toBe(false);
  });

  it("accepts Webhook-prefixed headers", async () => {
    const payload = JSON.stringify({ type: "billing.updated" });
    const timestamp = 1_000;
    const id = "msg_123";
    const signature = await sign(`${id}.${timestamp}.${payload}`);
    const headers = new Headers({
      "webhook-id": id,
      "webhook-signature": `v1,${signature}`,
      "webhook-timestamp": String(timestamp),
    });

    await expect(
      verifySvixSignature({
        headers,
        nowSeconds: timestamp,
        payload,
        secret: SECRET,
      }),
    ).resolves.toBe(true);
  });
});

async function signedHeaders(args: {
  id: string;
  payload: string;
  timestamp: number;
}) {
  const signature = await sign(`${args.id}.${args.timestamp}.${args.payload}`);

  return new Headers({
    "svix-id": args.id,
    "svix-signature": `v1,${signature}`,
    "svix-timestamp": String(args.timestamp),
  });
}

async function sign(value: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(SECRET_BYTES),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return Buffer.from(signature).toString("base64");
}

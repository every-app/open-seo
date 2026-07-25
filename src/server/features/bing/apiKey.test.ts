import { describe, expect, it, vi } from "vitest";
import {
  decryptBingApiKey,
  encryptBingApiKey,
} from "@/server/features/bing/apiKey";

// Stub the auth context rather than building a real Better Auth instance —
// all apiKey.ts needs from it is the encryption key material.
vi.mock("@/lib/auth", () => ({
  getAuth: () => ({
    $context: Promise.resolve({
      secretConfig: "0123456789abcdef0123456789abcdef",
    }),
  }),
}));

describe("encryptBingApiKey / decryptBingApiKey", () => {
  it("round-trips an API key through encrypt then decrypt", async () => {
    const apiKey = "bing-api-key-0123456789abcdef";

    const ciphertext = await encryptBingApiKey(apiKey);

    await expect(decryptBingApiKey(ciphertext)).resolves.toBe(apiKey);
  });

  it("stores ciphertext, not the plaintext key", async () => {
    const apiKey = "bing-api-key-0123456789abcdef";

    const ciphertext = await encryptBingApiKey(apiKey);

    expect(ciphertext).not.toBe(apiKey);
    expect(ciphertext).not.toContain(apiKey);
  });
});

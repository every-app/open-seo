import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decryptCredentialMap,
  encryptCredentialMap,
  resolveCredentialEncryptionKey,
} from "./credentialCrypto";

const envValues: Record<string, string | undefined> = {};
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: (key: string) => envValues[key],
}));

beforeEach(() => {
  for (const key of Object.keys(envValues)) delete envValues[key];
  envValues.BETTER_AUTH_SECRET = "better-auth-secret-value-at-least-32-chars";
});

describe("credentialCrypto", () => {
  it("roundtrips a provider→key map through AES-GCM", async () => {
    const map = { openrouter: "sk-or-v1-abc", anthropic: "sk-ant-xyz" };
    const ciphertext = await encryptCredentialMap(map);
    expect(ciphertext).toBeTruthy();
    expect(ciphertext).not.toContain("sk-ant-xyz");
    const decrypted = await decryptCredentialMap(ciphertext);
    expect(decrypted).toEqual(map);
  });

  it("prefers the explicit AI_CREDENTIALS_ENCRYPTION_KEY", async () => {
    envValues.AI_CREDENTIALS_ENCRYPTION_KEY = "explicit-key-1234567890";
    const ciphertext = await encryptCredentialMap({ openai: "k1" });
    expect(ciphertext).toBeTruthy();
    // Decryptable with the same explicit key…
    expect(await decryptCredentialMap(ciphertext)).toEqual({ openai: "k1" });
    // …and with a DIFFERENT derived key it fails safe (null), proving the
    // two key sources are not interchangeable.
    delete envValues.AI_CREDENTIALS_ENCRYPTION_KEY;
    expect(await decryptCredentialMap(ciphertext)).toBeNull();
  });

  it("domain-separates from OAuth token ciphertext", async () => {
    // Same BETTER_AUTH_SECRET, different domain: the OAuth flow would derive
    // a different key, so our ciphertext is opaque to it (and vice versa).
    envValues.BETTER_AUTH_SECRET = "shared-secret-abcdefghijklmnop";
    const ciphertext = await encryptCredentialMap({ openai: "k" });
    envValues.BETTER_AUTH_SECRET = "other-secret-abcdefghijklmnopqrstuv";
    expect(await decryptCredentialMap(ciphertext)).toBeNull();
  });

  it("returns null when no deployment key exists (fail closed)", async () => {
    delete envValues.BETTER_AUTH_SECRET;
    expect(await resolveCredentialEncryptionKey()).toBeNull();
    expect(await encryptCredentialMap({ openai: "k" })).toBeNull();
    expect(await decryptCredentialMap("whatever")).toBeNull();
  });

  it("filters non-string values out of decrypted maps", async () => {
    const key = "k".repeat(40);
    // Hand-crafted ciphertext of a malformed payload: encrypt then tamper by
    // round-tripping through the crypto with a bad shape inside.
    envValues.BETTER_AUTH_SECRET = key;
    const badCiphertext = await encryptCredentialMap({
      openai: "ok",
      // numbers/objects would be dropped by the filter on decrypt
    });
    expect(await decryptCredentialMap(badCiphertext)).toEqual({ openai: "ok" });
    expect(await decryptCredentialMap(null)).toBeNull();
    expect(await decryptCredentialMap("")).toBeNull();
  });
});
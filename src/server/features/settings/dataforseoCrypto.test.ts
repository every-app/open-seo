import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  encryptDataforseoCredentials,
  decryptDataforseoCredentials,
  maskDataforseoLogin,
  parseLegacyDataforseoApiKey,
} from "./dataforseoCrypto";

describe("dataforseoCrypto", () => {
  const originalKey = process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
  const originalSecret = process.env.BETTER_AUTH_SECRET;

  beforeEach(() => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY =
      "test-secret-key-32-chars-minimum-length!";
  });

  afterEach(() => {
    process.env.AI_CREDENTIALS_ENCRYPTION_KEY = originalKey;
    process.env.BETTER_AUTH_SECRET = originalSecret;
  });

  describe("encrypt and decrypt roundtrip", () => {
    it("encrypts and decrypts credentials successfully", async () => {
      const creds = { login: "test-login@example.com", password: "secret-password-123" };
      const ciphertext = await encryptDataforseoCredentials(creds);

      expect(ciphertext).toBeTypeOf("string");
      expect(ciphertext).not.toContain("test-login@example.com");
      expect(ciphertext).not.toContain("secret-password-123");

      const decrypted = await decryptDataforseoCredentials(ciphertext);
      expect(decrypted).toEqual(creds);
    });

    it("fails safely (returns null) on wrong key", async () => {
      const creds = { login: "user1", password: "pwd" };
      const ciphertext = await encryptDataforseoCredentials(creds);

      process.env.AI_CREDENTIALS_ENCRYPTION_KEY = "completely-different-key-32-chars!";
      const decrypted = await decryptDataforseoCredentials(ciphertext);
      expect(decrypted).toBeNull();
    });

    it("fails safely (returns null) on corrupted ciphertext", async () => {
      const decrypted = await decryptDataforseoCredentials("not-valid-ciphertext");
      expect(decrypted).toBeNull();
    });

    it("returns null when no key is available", async () => {
      delete process.env.AI_CREDENTIALS_ENCRYPTION_KEY;
      delete process.env.BETTER_AUTH_SECRET;

      const encrypted = await encryptDataforseoCredentials({ login: "a", password: "b" });
      expect(encrypted).toBeNull();

      const decrypted = await decryptDataforseoCredentials("some-cipher");
      expect(decrypted).toBeNull();
    });
  });

  describe("maskDataforseoLogin", () => {
    it("masks standard logins and emails", () => {
      expect(maskDataforseoLogin("admin@company.com")).toBe("********.com");
      expect(maskDataforseoLogin("api-user-4f2a")).toBe("********4f2a");
    });

    it("masks short logins safely", () => {
      expect(maskDataforseoLogin("abc")).toBe("********");
      expect(maskDataforseoLogin("1234")).toBe("********");
    });

    it("returns null for empty or invalid values", () => {
      expect(maskDataforseoLogin("")).toBeNull();
      expect(maskDataforseoLogin("   ")).toBeNull();
      expect(maskDataforseoLogin(null)).toBeNull();
      expect(maskDataforseoLogin(undefined)).toBeNull();
    });
  });

  describe("parseLegacyDataforseoApiKey", () => {
    it("decodes valid base64 email:password format", () => {
      const raw = Buffer.from("user@example.com:mypassword123").toString("base64");
      const result = parseLegacyDataforseoApiKey(raw);
      expect(result).toEqual({
        login: "user@example.com",
        password: "mypassword123",
      });
    });

    it("handles passwords containing colons", () => {
      const raw = Buffer.from("user:part1:part2:part3").toString("base64");
      const result = parseLegacyDataforseoApiKey(raw);
      expect(result).toEqual({
        login: "user",
        password: "part1:part2:part3",
      });
    });

    it("returns null for invalid inputs", () => {
      expect(parseLegacyDataforseoApiKey("")).toBeNull();
      expect(parseLegacyDataforseoApiKey("not-base64-login")).toBeNull();
      // base64 but no colon:
      const noColon = Buffer.from("justapassword").toString("base64");
      expect(parseLegacyDataforseoApiKey(noColon)).toBeNull();
    });
  });
});

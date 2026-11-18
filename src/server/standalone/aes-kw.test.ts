import { describe, expect, it } from "vitest";
import { installAesKw } from "./aes-kw";

installAesKw();

const hex = (value: string) =>
  Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));
const toHex = (buffer: ArrayBuffer) => Buffer.from(buffer).toString("hex");

const importKek = (kek: string) =>
  crypto.subtle.importKey("raw", hex(kek), { name: "AES-KW" }, false, [
    "wrapKey",
    "unwrapKey",
  ]);

// RFC 3394 sections 4.1 and 4.6.
describe.each([
  {
    kek: "000102030405060708090a0b0c0d0e0f",
    key: "00112233445566778899aabbccddeeff",
    wrapped: "1fa68b0a8112b447aef34bd8fb5a7b829d3e862371d2cfe5",
  },
  {
    kek: "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f",
    key: "00112233445566778899aabbccddeeff000102030405060708090a0b0c0d0e0f",
    wrapped:
      "28c9f404c4b810f4cbccb35cfb87f8263f5786e2d80ed326cbc7f0e71a99f43bfb988b9b7a02dd21",
  },
])("AES-KW with a $kek.length-hex-digit KEK", ({ kek, key, wrapped }) => {
  it("wraps and unwraps to the RFC 3394 test vector", async () => {
    const kekKey = await importKek(kek);
    const plainKey = await crypto.subtle.importKey(
      "raw",
      hex(key),
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"],
    );

    expect(
      toHex(await crypto.subtle.wrapKey("raw", plainKey, kekKey, "AES-KW")),
    ).toBe(wrapped);

    const unwrapped = await crypto.subtle.unwrapKey(
      "raw",
      hex(wrapped),
      kekKey,
      "AES-KW",
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"],
    );
    expect(toHex(await crypto.subtle.exportKey("raw", unwrapped))).toBe(key);
  });

  it("rejects unwrapping with the wrong KEK", async () => {
    const wrongKek = await importKek(kek.replace(/^00/, "ff"));
    await expect(
      crypto.subtle.unwrapKey(
        "raw",
        hex(wrapped),
        wrongKek,
        "AES-KW",
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"],
      ),
    ).rejects.toThrow("integrity check failed");
  });
});

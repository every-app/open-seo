import { describe, expect, it } from "vitest";
import {
  checkBaseUrl,
  normalizeBaseUrl,
} from "./baseUrl";

describe("normalizeBaseUrl", () => {
  it("strips trailing slashes without touching the path shape", () => {
    expect(normalizeBaseUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeBaseUrl("https://example.com/")).toBe("https://example.com");
    expect(normalizeBaseUrl("https://example.com/v1")).toBe(
      "https://example.com/v1",
    );
    expect(normalizeBaseUrl("https://example.com/v1/")).toBe(
      "https://example.com/v1",
    );
    expect(normalizeBaseUrl("https://example.com/api/v1/")).toBe(
      "https://example.com/api/v1",
    );
    expect(normalizeBaseUrl("  https://example.com///  ")).toBe(
      "https://example.com",
    );
  });
});

describe("checkBaseUrl", () => {
  it("accepts public HTTPS URLs", () => {
    expect(checkBaseUrl("https://api.example.com/v1", { allowPrivateNetwork: false })).toEqual({
      ok: true,
      url: "https://api.example.com/v1",
    });
  });

  it("rejects garbage and non-http schemes", () => {
    expect(checkBaseUrl("not a url", { allowPrivateNetwork: true })).toMatchObject({ ok: false });
    expect(checkBaseUrl("", { allowPrivateNetwork: true })).toMatchObject({ ok: false });
    expect(checkBaseUrl("ftp://example.com", { allowPrivateNetwork: true })).toMatchObject({
      ok: false,
    });
  });

  it("blocks loopback/private hosts on hosted deployments", () => {
    for (const url of [
      "http://localhost:11434/v1",
      "http://127.0.0.1:8080/v1",
      "http://192.168.1.10/v1",
      "http://10.0.0.5/v1",
      "https://host.docker.internal:11434/v1",
      "https://my-service.internal/v1",
      "http://::1/v1",
    ]) {
      expect(checkBaseUrl(url, { allowPrivateNetwork: false })).toMatchObject({
        ok: false,
      });
    }
  });

  it("allows private/local hosts only when the deployment opts in", () => {
    expect(
      checkBaseUrl("http://localhost:11434/v1", { allowPrivateNetwork: true }),
    ).toEqual({ ok: true, url: "http://localhost:11434/v1" });
    expect(
      checkBaseUrl("http://host.docker.internal:11434/v1", {
        allowPrivateNetwork: true,
      }),
    ).toEqual({ ok: true, url: "http://host.docker.internal:11434/v1" });
  });

  it("blocks cloud metadata endpoints even in self-hosted mode", () => {
    for (const url of [
      "http://169.254.169.254/latest/meta-data",
      "https://metadata.google.internal/computeMetadata/v1",
    ]) {
      expect(checkBaseUrl(url, { allowPrivateNetwork: true })).toMatchObject({
        ok: false,
      });
    }
  });

  it("requires HTTPS on hosted deployments even for public hosts", () => {
    expect(checkBaseUrl("http://api.example.com/v1", { allowPrivateNetwork: false })).toMatchObject({
      ok: false,
    });
    expect(checkBaseUrl("http://api.example.com/v1", { allowPrivateNetwork: true })).toEqual({
      ok: true,
      url: "http://api.example.com/v1",
    });
  });

  it("rejects embedded credentials", () => {
    expect(
      checkBaseUrl("https://user:pass@api.example.com/v1", { allowPrivateNetwork: false }),
    ).toMatchObject({ ok: false });
  });

  it("maps IPv4-mapped IPv6 private addresses", () => {
    // Node normalizes ::ffff:192.168.0.7 to hex form (::ffff:c0a8:7) — the
    // check must decode that back to a private IPv4.
    expect(
      checkBaseUrl("http://[::ffff:192.168.0.7]/v1", { allowPrivateNetwork: false }),
    ).toMatchObject({ ok: false });
  });
});

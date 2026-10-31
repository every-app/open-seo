import { afterEach, describe, expect, it, vi } from "vitest";
import { getPublicOrigin, requestWithPublicOrigin } from "./public-origin";

const { env } = vi.hoisted(() => ({ env: {} as Record<string, string> }));
vi.mock("cloudflare:workers", () => ({ env }));

afterEach(() => {
  delete env.AUTH_MODE;
  delete env.BETTER_AUTH_URL;
  delete env.OPENSEO_OPERATOR_SECRET;
});

describe("getPublicOrigin", () => {
  it("uses the configured origin, not forwarded headers, in password mode", () => {
    env.AUTH_MODE = "password";
    env.BETTER_AUTH_URL = "https://seo.example.com";
    const request = new Request("http://runtime:8080/mcp", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.test",
      },
    });

    expect(getPublicOrigin(request)).toBe("https://seo.example.com");
  });

  it("honors a configured origin in no-auth mode only in the standalone edition", () => {
    env.AUTH_MODE = "local_noauth";
    env.BETTER_AUTH_URL = "http://seo.internal:3001";
    const request = new Request("http://192.168.1.10:3001/mcp");

    // The old Docker image: BETTER_AUTH_URL may sit in its .env, no operator secret.
    expect(getPublicOrigin(request)).toBe("http://192.168.1.10:3001");

    env.OPENSEO_OPERATOR_SECRET = "s".repeat(32);
    expect(getPublicOrigin(request)).toBe("http://seo.internal:3001");
  });

  it("uses the forwarded public protocol and host for tunneled requests", () => {
    const request = new Request("http://localhost:3102/api/oauth/consent", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "scenario-tools.trycloudflare.com",
      },
    });

    expect(getPublicOrigin(request)).toBe(
      "https://scenario-tools.trycloudflare.com",
    );
  });

  it("ignores forwarded hosts when the request is already public https", () => {
    const request = new Request("https://app.openseo.so/api/oauth/consent", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "evil.test",
      },
    });

    expect(getPublicOrigin(request)).toBe("https://app.openseo.so");
  });
});

describe("requestWithPublicOrigin", () => {
  it("rewrites the request URL origin while preserving path and query", async () => {
    const request = new Request("http://localhost:3102/mcp?x=1", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-proto": "https",
        "x-forwarded-host": "scenario-tools.trycloudflare.com",
      },
      body: JSON.stringify({ method: "initialize" }),
    });

    const publicRequest = requestWithPublicOrigin(request);

    expect(publicRequest.url).toBe(
      "https://scenario-tools.trycloudflare.com/mcp?x=1",
    );
    expect(publicRequest.method).toBe("POST");
    await expect(publicRequest.json()).resolves.toEqual({
      method: "initialize",
    });
  });

  it("keeps the public host when the path starts with //", () => {
    const request = new Request("http://localhost:3102//evil.example/mcp", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "seo.example.com",
      },
    });

    expect(requestWithPublicOrigin(request).url).toBe(
      "https://seo.example.com//evil.example/mcp",
    );
  });
});

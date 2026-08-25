import { describe, expect, it } from "vitest";
import { normalizeClientRegistrationRequest } from "@/server/mcp/oauth-registration";

describe("normalizeClientRegistrationRequest", () => {
  it("keeps explicit public registrations public", async () => {
    const request = new Request(
      "https://app.openseo.so/api/auth/oauth2/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:1455/auth/callback"],
          client_name: "Codex",
          token_endpoint_auth_method: "none",
        }),
      },
    );

    const normalized = await normalizeClientRegistrationRequest(request);

    await expect(normalized.json()).resolves.toMatchObject({
      token_endpoint_auth_method: "none",
    });
  });

  it("registers Perplexity as a real confidential client", async () => {
    const request = new Request(
      "https://app.openseo.so/api/auth/oauth2/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://www.perplexity.ai/api/mcp/oauth/callback"],
          client_name: "Perplexity",
        }),
      },
    );

    const normalized = await normalizeClientRegistrationRequest(request);

    await expect(normalized.json()).resolves.toMatchObject({
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  it("defaults other omitted token auth methods to public clients", async () => {
    const request = new Request(
      "https://app.openseo.so/api/auth/oauth2/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:1455/auth/callback"],
          client_name: "Codex",
        }),
      },
    );

    const normalized = await normalizeClientRegistrationRequest(request);

    await expect(normalized.json()).resolves.toMatchObject({
      token_endpoint_auth_method: "none",
    });
  });

  it("keeps explicit confidential registration methods", async () => {
    const request = new Request(
      "https://app.openseo.so/api/auth/oauth2/register",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["https://www.perplexity.ai/api/mcp/oauth/callback"],
          token_endpoint_auth_method: "client_secret_post",
        }),
      },
    );

    const normalized = await normalizeClientRegistrationRequest(request);

    await expect(normalized.json()).resolves.toMatchObject({
      token_endpoint_auth_method: "client_secret_post",
    });
  });

  it("leaves oversized registration payloads for the provider to reject", async () => {
    const body = JSON.stringify({
      redirect_uris: ["https://www.perplexity.ai/api/mcp/oauth/callback"],
      client_name: "a".repeat(1024 * 1024),
      token_endpoint_auth_method: "none",
    });
    const request = new Request(
      "https://app.openseo.so/api/auth/oauth2/register",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(body.length),
        },
        body,
      },
    );

    await expect(normalizeClientRegistrationRequest(request)).resolves.toBe(
      request,
    );
  });
});

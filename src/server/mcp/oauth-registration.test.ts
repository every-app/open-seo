import { describe, expect, it } from "vitest";
import { normalizeClientRegistrationRequest } from "@/server/mcp/oauth-registration";

describe("normalizeClientRegistrationRequest", () => {
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
});

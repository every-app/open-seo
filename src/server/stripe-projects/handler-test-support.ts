import { createHmac } from "node:crypto";
import { expect } from "vitest";

// Plays Stripe's side of the provisioning protocol against the handler.
export const SECRET = "whsec_test_secret";

export function sign(body: string, secret = SECRET) {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

// The handler is passed lazily: the test imports it after its mocks exist.
export function stripeCaller(
  handler: () => (request: Request) => Promise<Response>,
) {
  function call(
    path: string,
    options: {
      method?: string;
      body?: string;
      bearer?: string;
      signature?: string | null;
      form?: boolean;
    } = {},
  ) {
    const method =
      options.method ?? (options.body === undefined ? "GET" : "POST");
    const body = options.body ?? "";
    const headers = new Headers({
      "api-version": "0.1d",
      "content-type": options.form
        ? "application/x-www-form-urlencoded"
        : "application/json",
    });
    const signature =
      options.signature === undefined ? sign(body) : options.signature;
    if (signature) headers.set("stripe-signature", signature);
    if (options.bearer)
      headers.set("authorization", `Bearer ${options.bearer}`);
    return handler()(
      new Request(`https://app.openseo.so/api/stripe-projects/${path}`, {
        method,
        headers,
        body: method === "GET" ? undefined : body,
      }),
    );
  }

  function accountRequest(overrides: Record<string, unknown> = {}) {
    return call("provisioning/account_requests", {
      body: JSON.stringify({
        id: "acctreq_1",
        email: "Dev@Example.com",
        orchestrator: { type: "stripe", stripe: { account: "acct_1" } },
        kyc: { verified_fields: ["email"] },
        ...overrides,
      }),
    });
  }

  async function codeFor(overrides: Record<string, unknown> = {}) {
    const response = await accountRequest(overrides);
    expect(response.status).toBe(200);
    const json: { oauth: { code: string } } = await response.json();
    return json.oauth.code;
  }

  function exchange(form: Record<string, string>, signed = true) {
    const body = new URLSearchParams(form).toString();
    return call("oauth/token", {
      body,
      form: true,
      signature: signed ? undefined : null,
    });
  }

  async function accessToken(overrides: Record<string, unknown> = {}) {
    const response = await exchange({
      grant_type: "authorization_code",
      code: await codeFor(overrides),
    });
    const tokens: { access_token: string; refresh_token: string } =
      await response.json();
    return tokens;
  }
  return { call, accountRequest, codeFor, exchange, accessToken };
}

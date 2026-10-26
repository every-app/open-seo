import { UnsecuredJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, unknown>,
}));
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));

import { forOrganization, serveEveryAppRequest } from "./gateway-attribution";
import {
  getContextFetch,
  getDataforseoFetch,
  hasProviderAccess,
} from "./provider-access";

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
  vi.unstubAllGlobals();
});

const fetchMock = vi.fn<typeof fetch>();

function lastAuthorization() {
  const init = fetchMock.mock.calls.at(-1)?.[1];
  return new Headers(init?.headers).get("authorization");
}

describe("provider access with the deployment's own keys", () => {
  it("puts the deployment's keys on DataForSEO and Context.dev calls", async () => {
    Object.assign(workerEnv, {
      AUTH_MODE: "cloudflare_access",
      DATAFORSEO_API_KEY: "encoded-credentials",
      CONTEXT_API_KEY: "context-key",
    });
    fetchMock.mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);

    await (
      await getDataforseoFetch()
    )("https://api.dataforseo.com/v3/x");
    expect(lastAuthorization()).toBe("Basic encoded-credentials");

    const contextFetch = await getContextFetch();
    await contextFetch?.("https://api.context.dev/v1/web/scrape/html");
    expect(lastAuthorization()).toBe("Bearer context-key");

    expect(await hasProviderAccess("dataforseo")).toBe(true);
    expect(await hasProviderAccess("context")).toBe(true);
  });

  it("has no Context.dev fetch without its key", async () => {
    workerEnv.AUTH_MODE = "local_noauth";
    expect(await getContextFetch()).toBeNull();
    expect(await hasProviderAccess("context")).toBe(false);
  });
});

describe("provider access behind an Every App gateway", () => {
  it("never uses a key on the deployment, and refuses without the gateway binding", async () => {
    Object.assign(workerEnv, {
      AUTH_MODE: "everyapp",
      EVERYAPP_APP_ID: "openseo",
      // Set by mistake: the gateway mode must not read it.
      DATAFORSEO_API_KEY: "encoded-credentials",
    });

    await expect(getDataforseoFetch()).rejects.toMatchObject({
      code: "DATAFORSEO_AUTH_FAILED",
    });
  });
});

describe("whose calls they are, behind a first-party gateway", () => {
  const sent: Request[] = [];
  const binding = {
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push(new Request(input, init));
      return Response.json({ requested: true, configured: true, ready: true });
    }),
  };

  function shared() {
    sent.length = 0;
    Object.assign(workerEnv, {
      AUTH_MODE: "everyapp",
      EVERYAPP_APP_ID: "openseo",
      EVERYAPP_SHARED: "1",
      EVERY_APP_GATEWAY: binding,
    });
  }

  it("sends background work's organization as x-everyapp-org", async () => {
    shared();
    const contextFetch = await forOrganization("org_a", () =>
      getContextFetch(),
    );
    await contextFetch?.("https://api.context.dev/v1/web/scrape/html");

    const [call] = sent;
    expect(call.headers.get("x-everyapp-org")).toBe("org_a");
    expect(call.headers.get("x-everyapp-identity")).toBeNull();
  });

  it("forwards the identity of the request it serves", async () => {
    shared();
    const token = new UnsecuredJWT({ org_id: "org_a" })
      .setExpirationTime("2m")
      .encode();
    const request = new Request("https://openseo.app.everyapp.com/", {
      headers: { "x-everyapp-identity": token },
    });
    const user = {
      id: "user_ana",
      email: "ana@example.com",
      orgId: "org_a",
      orgRole: "member",
      channel: "web" as const,
      actor: { sub: "user_ana" },
      scopes: ["*"],
      jti: "jti_1",
    };

    const dataforseo = await serveEveryAppRequest(request, user, () =>
      getDataforseoFetch(),
    );
    await dataforseo("https://api.dataforseo.com/v3/serp/google/locations/us");

    const [call] = sent;
    expect(call.headers.get("x-everyapp-identity")).toBe(token);
    expect(call.headers.get("x-everyapp-org")).toBeNull();
  });

  it("refuses a call that says nobody's, and asks whether a provider is ready for nobody", async () => {
    shared();
    await expect(getDataforseoFetch()).rejects.toMatchObject({
      name: "AttributionError",
    });
    await expect(getContextFetch()).rejects.toMatchObject({
      name: "AttributionError",
    });
    expect(sent).toEqual([]);

    expect(await hasProviderAccess("dataforseo")).toBe(true);
    const [status] = sent;
    expect(new URL(status.url).pathname).toBe("/api/integrations/dataforseo");
    expect(status.headers.get("x-everyapp-org")).toBeNull();
    expect(status.headers.get("x-everyapp-identity")).toBeNull();
  });
});

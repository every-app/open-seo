import { afterEach, describe, expect, it, vi } from "vitest";

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, unknown>,
}));
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));

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

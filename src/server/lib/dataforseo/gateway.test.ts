import type { EveryAppUser } from "@every-app/sdk/server";
import { UnsecuredJWT } from "jose";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// DataForSEO behind a first-party Every App gateway (AUTH_MODE=everyapp, one
// Worker for every organization): each call goes over the gateway's binding
// and says whose it is (server/lib/gateway-attribution.ts).

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, unknown>,
}));
vi.mock("cloudflare:workers", () => ({ env: workerEnv, waitUntil: vi.fn() }));

import { createDataforseoClient } from "./client";
import { dataforseoGet } from "./core";
import { serveEveryAppRequest } from "@/server/lib/gateway-attribution";

const customer = {
  userId: "system",
  userEmail: "system@openseo.so",
  organizationId: "org_a",
  projectId: "project_1",
};

const serp = {
  status_code: 20000,
  tasks: [
    {
      status_code: 20000,
      cost: 0.002,
      path: ["v3", "serp", "google", "organic", "live", "advanced"],
      result: [{ items: [] }],
    },
  ],
};

const sent: Request[] = [];
let answer: () => Response;
const binding = {
  fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input, init));
    return answer();
  }),
};

beforeEach(() => {
  Object.assign(workerEnv, {
    AUTH_MODE: "everyapp",
    EVERYAPP_APP_ID: "openseo",
    EVERYAPP_SHARED: "1",
    EVERY_APP_GATEWAY: binding,
  });
  answer = () => Response.json(serp);
});

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
  sent.length = 0;
});

const live = () =>
  createDataforseoClient(customer).serp.live({
    keyword: "rank tracker",
    locationCode: 2840,
    languageCode: "en",
  });

function forwarded(orgId: string) {
  const token = new UnsecuredJWT({ org_id: orgId })
    .setExpirationTime("2m")
    .encode();
  const request = new Request("https://openseo.app.everyapp.com/", {
    headers: { "x-everyapp-identity": token },
  });
  const user: EveryAppUser = {
    id: "user_ana",
    email: "ana@example.com",
    orgId,
    orgRole: "member",
    channel: "web",
    actor: { sub: "user_ana" },
    scopes: ["*"],
    jti: "jti_1",
  };
  return { request, user, token };
}

/** A refusal the gateway makes itself, marked with x-everyapp-error. */
const refusal = (status: number, code: string, message: string) => () =>
  Response.json(
    { error: "Refused", code, message },
    { status, headers: { "x-everyapp-error": code } },
  );

describe("DataForSEO through a first-party Every App gateway", () => {
  it("sends a Workflow's metered call as its customer's organization", async () => {
    await live();

    expect(sent).toHaveLength(1);
    const [call] = sent;
    expect(new URL(call.url).pathname).toBe(
      "/api/integrations/dataforseo/api.dataforseo.com/v3/serp/google/organic/live/advanced",
    );
    expect(call.headers.get("x-everyapp-org")).toBe("org_a");
    expect(call.headers.get("x-everyapp-identity")).toBeNull();
    expect(call.headers.get("authorization")).toBeNull();
  });

  it("forwards the identity of the request it serves", async () => {
    const { request, user, token } = forwarded("org_a");

    await serveEveryAppRequest(request, user, live);

    const [call] = sent;
    expect(call.headers.get("x-everyapp-identity")).toBe(token);
    expect(call.headers.get("x-everyapp-org")).toBeNull();
  });

  it("never spends another organization's while serving a request", async () => {
    const { request, user } = forwarded("org_b");

    await expect(serveEveryAppRequest(request, user, live)).rejects.toThrow(
      /request of organization org_b/,
    );
    expect(sent).toEqual([]);
  });

  it("refuses an unmetered call that names nobody, before it leaves", async () => {
    await expect(
      dataforseoGet("/v3/serp/google/locations/us"),
    ).rejects.toMatchObject({ name: "AttributionError" });
    expect(sent).toEqual([]);
  });

  it("reads the gateway's own refusals with the SDK, not as DataForSEO's", async () => {
    answer = refusal(
      403,
      "caller_org_not_attributable",
      "The organization this call is for is unknown, suspended or has no active members.",
    );
    await expect(live()).rejects.toMatchObject({
      code: "AUTH_CONFIG_MISSING",
      details: { gatewayError: "caller_org_not_attributable" },
    });

    answer = refusal(
      503,
      "integration_not_configured",
      "The gateway holds no DataForSEO key.",
    );
    await expect(live()).rejects.toMatchObject({
      code: "DATAFORSEO_AUTH_FAILED",
    });
    // A refusal is never retried like DataForSEO's own 5xx.
    expect(sent).toHaveLength(2);
  });
});

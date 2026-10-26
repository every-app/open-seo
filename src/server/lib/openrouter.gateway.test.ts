import { generateText } from "ai";
import { UnsecuredJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";

// OpenRouter behind a first-party Every App gateway (AUTH_MODE=everyapp, one
// Worker for every organization): the gateway's AI proxy holds the key, and
// each call says whose it is (gateway-attribution.ts).

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, unknown>,
}));
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));

import { forOrganization, serveEveryAppRequest } from "./gateway-attribution";
import {
  buildChatAgentModel,
  buildSamChatModel,
  getOpenRouterAccess,
  requireOpenRouterAccess,
} from "./openrouter";

const sent: Request[] = [];
const binding = {
  fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push(new Request(input, init));
    return Response.json({
      choices: [
        {
          message: { role: "assistant", content: "ok" },
          finish_reason: "stop",
        },
      ],
    });
  }),
};

function sharedWorker() {
  Object.assign(workerEnv, {
    AUTH_MODE: "everyapp",
    EVERYAPP_APP_ID: "openseo",
    EVERYAPP_SHARED: "1",
    EVERY_APP_GATEWAY: binding,
    // Not an openai/ model, so no egress-country lookup runs first.
    OPENROUTER_MODEL: "minimax/minimax-m3",
  });
  return workerEnv;
}

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
  sent.length = 0;
});

describe("OpenRouter through a first-party Every App gateway", () => {
  it("sends SAM's turns as the session's organization, read when the model calls out", async () => {
    const env = sharedWorker();
    let loaded: string | undefined;
    // Think builds the model before the turn loads its session.
    const model = buildSamChatModel(env, "low", async () => loaded);
    loaded = "org_a";

    await generateText({ model, prompt: "hi" });

    const [call] = sent;
    expect(new URL(call.url).pathname).toBe(
      "/api/ai/openrouter/api/v1/chat/completions",
    );
    expect(call.headers.get("x-everyapp-org")).toBe("org_a");
    expect(call.headers.get("x-everyapp-identity")).toBeNull();
  });

  it("refuses a SAM call before its session names an organization", async () => {
    const model = buildSamChatModel(sharedWorker(), "low", async () => {
      return undefined;
    });

    await expect(generateText({ model, prompt: "hi" })).rejects.toThrow(
      /must say whom the call is for/,
    );
    expect(sent).toEqual([]);
  });

  it("forwards the identity of the request it serves, and names an organization's work", async () => {
    sharedWorker();
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

    const served = await serveEveryAppRequest(request, user, () =>
      requireOpenRouterAccess("org_a"),
    );
    await generateText({ model: buildChatAgentModel(served), prompt: "hi" });
    expect(sent[0]?.headers.get("x-everyapp-identity")).toBe(token);
    expect(sent[0]?.headers.get("x-everyapp-org")).toBeNull();

    const background = await forOrganization("org_b", () =>
      requireOpenRouterAccess(),
    );
    await generateText({
      model: buildChatAgentModel(background),
      prompt: "hi",
    });
    expect(sent[1]?.headers.get("x-everyapp-org")).toBe("org_b");
  });

  it("has no access without the binding, and refuses a call that names nobody", async () => {
    expect(
      getOpenRouterAccess(
        { AUTH_MODE: "everyapp", EVERYAPP_SHARED: "1" },
        "org_a",
      ),
    ).toBeNull();
    expect(() => getOpenRouterAccess(sharedWorker())).toThrow(
      expect.objectContaining({ name: "AttributionError" }),
    );
  });
});

import { afterEach, expect, it, vi } from "vitest";

// A SAM turn has no request behind it: behind a first-party Every App
// gateway, its tools' provider calls are the session's organization's
// (`x-everyapp-org`), whatever the model asks for.

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: {} as Record<string, unknown>,
}));
vi.mock("cloudflare:workers", () => ({
  env: workerEnv,
  waitUntil: vi.fn(),
  DurableObject: class {
    kind = "mock";
  },
}));
vi.mock("@/server/lib/self-host-telemetry", () => ({
  incrementSelfHostMcpToolCallCount: vi.fn(async () => {}),
}));

import { buildSamMcpTools } from "./samChatTools";

afterEach(() => {
  for (const key of Object.keys(workerEnv)) delete workerEnv[key];
});

it("sends a SAM tool's DataForSEO call as the session's organization", async () => {
  const sent: Request[] = [];
  Object.assign(workerEnv, {
    AUTH_MODE: "everyapp",
    EVERYAPP_APP_ID: "openseo",
    EVERYAPP_SHARED: "1",
    EVERY_APP_GATEWAY: {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        sent.push(new Request(input, init));
        return Response.json({
          status_code: 20000,
          tasks: [
            {
              status_code: 20000,
              result: [
                {
                  location_code: 1013962,
                  location_name: "Catonsville,Maryland,United States",
                  location_type: "City",
                },
              ],
            },
          ],
        });
      },
    },
    KV: { get: async () => null, put: async () => {} },
  });

  const tools = buildSamMcpTools(
    {
      userId: "user_ana",
      userEmail: "ana@example.com",
      organizationId: "org_a",
      role: "member",
      baseUrl: "https://openseo.app.everyapp.com",
      clientId: null,
      scopes: ["mcp"],
    },
    { id: "project_1", domain: "example.com" },
  );
  const result: unknown = await tools.search_serp_locations?.execute?.(
    { query: "Catonsville", countryCode: "us" },
    { toolCallId: "call_1", messages: [] },
  );

  expect(JSON.stringify(result)).toContain("Catonsville");
  expect(sent).toHaveLength(1);
  expect(sent[0]?.headers.get("x-everyapp-org")).toBe("org_a");
  expect(sent[0]?.headers.get("x-everyapp-identity")).toBeNull();
});

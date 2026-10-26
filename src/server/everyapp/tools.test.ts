import {
  IDENTITY_HEADER,
  SYSTEM_HEADER,
  TOOLS_CALL_PATH,
  TOOLS_LIST_PATH,
  mintIdentityJwt,
  mintSystemJwt,
  type ToolsListResponseV1,
} from "@every-app/sdk/internal";
import { exportPKCS8, exportSPKI, generateKeyPair } from "jose";
import { beforeAll, describe, expect, it, vi } from "vitest";

const { workerEnv } = vi.hoisted(() => ({
  workerEnv: { AUTH_MODE: "everyapp" } as Record<string, unknown>,
}));
vi.mock("cloudflare:workers", () => ({
  env: workerEnv,
  waitUntil: vi.fn(),
  DurableObject: class {
    readonly ctx = null;
  },
}));
vi.mock("@/middleware/ensure-user/delegated", () => ({
  ensureUserRecord: vi.fn(async (_userId: string, email: string) => email),
}));
vi.mock("@/server/auth/delegated-organization", () => ({
  ensureSharedWorkspaceOrganization: vi.fn(async () => "shared-workspace"),
}));
vi.mock("@/server/features/activation/mcpActivation", () => ({
  recordExternalMcpToolCall: vi.fn(),
}));
vi.mock("@/server/lib/self-host-telemetry", () => ({
  incrementSelfHostMcpToolCallCount: vi.fn(async () => {}),
}));

import { everyAppTools } from "./tools";

// The fork's Worker, which the gateway mints every identity for.
const AUDIENCE = "every-acme-openseo";
const ISSUER = "https://apps.example.com";
const ctx: ExecutionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
};
let privateKeyPem: string;

beforeAll(async () => {
  const keys = await generateKeyPair("RS256", { extractable: true });
  privateKeyPem = await exportPKCS8(keys.privateKey);
  Object.assign(workerEnv, {
    EVERYAPP_APP_ID: "openseo",
    EVERYAPP_AUDIENCE: AUDIENCE,
    EVERYAPP_IDENTITY_ISSUER: ISSUER,
    EVERYAPP_IDENTITY_PUBLIC_KEYS: JSON.stringify([
      await exportSPKI(keys.publicKey),
    ]),
    EVERY_APP_ORG_ID: "org_1",
  });
});

function post(path: string, body: unknown, headers: Record<string, string>) {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the test env holds only the vars the tools contract reads
  const env = workerEnv as unknown as Env;
  return everyAppTools.fetch(
    new Request(`https://openseo.apps.example.com${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    env,
    ctx,
  );
}

describe("OpenSEO's tools on the Every App gateway", () => {
  it("describes every tool within the gateway's catalog limits", async () => {
    const token = await mintSystemJwt(privateKeyPem, {
      audience: AUDIENCE,
      issuer: ISSUER,
      purpose: "tools.list",
    });
    const response = await post(
      TOOLS_LIST_PATH,
      { v: 1 },
      {
        [SYSTEM_HEADER]: token,
      },
    );

    expect(response.status).toBe(200);
    const catalog = await response.json<ToolsListResponseV1>();
    expect(catalog.warnings ?? []).toEqual([]);
    expect(catalog.tools).toHaveLength(81);
    expect(catalog.instructions?.length).toBeLessThanOrEqual(1024);
    for (const tool of catalog.tools) {
      expect(tool.description.length, tool.name).toBeLessThanOrEqual(2048);
      expect(
        JSON.stringify(tool.inputSchema).length,
        tool.name,
      ).toBeLessThanOrEqual(20 * 1024);
      expect(
        JSON.stringify(tool.outputSchema).length,
        tool.name,
      ).toBeLessThanOrEqual(20 * 1024);
    }
    // Hidden from AI clients until the gateway has approvals: deletions only.
    expect(
      catalog.tools
        .filter((tool) => tool.risk === "destructive")
        .map((tool) => tool.name),
    ).toEqual([
      "delete_report",
      "delete_report_template",
      "delete_site_audit",
      "remove_rank_tracking_keywords",
      "remove_saved_keywords",
    ]);
  });

  it("runs a tool for the gateway user, returning OpenSEO's text and its data", async () => {
    const token = await mintIdentityJwt(privateKeyPem, {
      subject: {
        sub: "user_1",
        email: "ana@example.com",
        orgId: "org_1",
        orgRole: "member",
      },
      audience: AUDIENCE,
      issuer: ISSUER,
      channel: "mcp",
      actor: { sub: "oauth:conn_1" },
      scopes: ["mcp:read", "mcp:write"],
      toolCall: { id: "call_1", name: "whoami" },
    });
    const response = await post(
      TOOLS_CALL_PATH,
      { v: 1, name: "whoami", arguments: {}, callId: "call_1" },
      { [IDENTITY_HEADER]: token },
    );

    expect(response.status).toBe(200);
    const { result } = await response.json<{
      result: {
        content: { type: string; text: string }[];
        structuredContent: Record<string, unknown>;
      };
    }>();
    expect(result.content[0]?.text).toContain("Account: ana@example.com");
    expect(result.structuredContent).toMatchObject({
      userEmail: "ana@example.com",
      scopes: ["mcp:read", "mcp:write"],
      mode: "every-app",
      deploymentTier: "fork",
    });
  });

  it("forwards the tool call's identity on the tool's own gateway calls", async () => {
    const sent: Request[] = [];
    Object.assign(workerEnv, {
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
    const token = await mintIdentityJwt(privateKeyPem, {
      subject: {
        sub: "user_1",
        email: "ana@example.com",
        orgId: "org_1",
        orgRole: "member",
      },
      audience: AUDIENCE,
      issuer: ISSUER,
      channel: "mcp",
      actor: { sub: "oauth:conn_1" },
      scopes: ["mcp:read"],
      toolCall: { id: "call_2", name: "search_serp_locations" },
    });
    try {
      const response = await post(
        TOOLS_CALL_PATH,
        {
          v: 1,
          name: "search_serp_locations",
          arguments: { query: "Catonsville", countryCode: "us" },
          callId: "call_2",
        },
        { [IDENTITY_HEADER]: token },
      );

      expect(response.status).toBe(200);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.headers.get(IDENTITY_HEADER)).toBe(token);
      expect(sent[0]?.headers.get("x-everyapp-org")).toBeNull();
    } finally {
      delete workerEnv.EVERY_APP_GATEWAY;
      delete workerEnv.KV;
    }
  });
});

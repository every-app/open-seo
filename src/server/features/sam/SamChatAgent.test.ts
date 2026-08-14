import { beforeEach, describe, expect, it, vi } from "vitest";
import { SamChatAgent } from "./SamChatAgent";

const mocks = vi.hoisted(() => ({
  cancelAllChats: vi.fn(),
  waitUntilStable: vi.fn(),
  storageDelete: vi.fn(),
  deleteMessages: vi.fn(),
  superOnRequest: vi.fn<(request: Request) => Promise<Response>>(),
}));

// Stand in for the Think base class so the test never loads the real agent
// runtime (which pulls cloudflare:-protocol modules node can't resolve).
// super.onRequest routes to superOnRequest for the delegation assertions.
vi.mock("@cloudflare/think", () => ({
  Think: class {
    ctx: unknown;
    constructor(ctx: unknown) {
      this.ctx = ctx;
    }
    onRequest(request: Request): Promise<Response> {
      return mocks.superOnRequest(request);
    }
  },
}));
vi.mock("agents/chat", () => ({
  clearChatTerminal: (storage: { delete: (key: string) => Promise<void> }) =>
    storage.delete("chat-terminal"),
}));
vi.mock("@/db", () => ({ db: {}, withPgClient: (fn: () => unknown) => fn() }));
vi.mock("@/db/schema", () => ({ user: {} }));
vi.mock("@/server/lib/chatAgent", () => ({
  openRouterCostUsd: vi.fn(),
  staticAssistantModel: vi.fn(),
}));
vi.mock("@/server/features/sam/SamSessionRepository", () => ({
  SamSessionRepository: {},
}));
vi.mock("@/server/features/sam/SamProjectMemoryRepository", () => ({
  SamProjectMemoryRepository: {},
}));
vi.mock("@/server/features/projects/repositories/ProjectRepository", () => ({
  ProjectRepository: {},
}));
vi.mock("@/server/features/sam/samChatTools", () => ({
  buildSamMcpTools: vi.fn(),
}));
vi.mock("@/server/features/sam/samSystemPrompt", () => ({
  buildSamSystemPrompt: vi.fn(),
}));
vi.mock("@/server/lib/openrouter", () => ({
  buildChatAgentModel: vi.fn(),
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getEnvValueSync: vi.fn(),
  isHostedServerAuthMode: vi.fn(),
}));
vi.mock("@/server/billing/subscription", () => ({
  checkUsageCreditsDepleted: vi.fn(),
  trackUsageCreditSpend: vi.fn(),
}));
vi.mock("@/server/mcp/public-origin", () => ({
  getPublicOrigin: vi.fn(),
}));

// The agent is a Durable Object backed by Think; the /stop and /rewind routes
// only touch cancelAllChats/waitUntilStable/storage, so construct it against
// the mocked (constructor-free) base class with a minimal storage double.
function buildAgent(): SamChatAgent {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mocked base class does not inspect DO constructor context
  const ctx = {} as DurableObjectState;
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the mocked base class does not inspect DO constructor context
  const env = {} as Cloudflare.Env;
  const agent = new SamChatAgent(ctx, env);
  Object.assign(agent, {
    ctx: { storage: { delete: mocks.storageDelete } },
    session: { deleteMessages: mocks.deleteMessages },
    cancelAllChats: mocks.cancelAllChats,
    waitUntilStable: mocks.waitUntilStable,
  });
  return agent;
}

const stopRequest = () =>
  new Request("https://app.openseo.so/agents/sam-chat/session_1/stop", {
    method: "POST",
  });

describe("SamChatAgent POST /stop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.waitUntilStable.mockResolvedValue(undefined);
    mocks.superOnRequest.mockResolvedValue(new Response("agent"));
  });

  it("cancels the in-flight turn and settles before responding", async () => {
    const agent = buildAgent();

    const response = await agent.onRequest(stopRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.cancelAllChats).toHaveBeenCalledTimes(1);
    expect(mocks.waitUntilStable).toHaveBeenCalledWith({ timeout: 5000 });
    // The aborted turn must not be replayed as an error to reconnects…
    expect(mocks.storageDelete).toHaveBeenCalledTimes(1);
    // …but the transcript is kept: nothing is rewound or deleted.
    expect(mocks.deleteMessages).not.toHaveBeenCalled();
  });

  it("waits for the turn to settle before clearing the terminal record", async () => {
    const order: string[] = [];
    mocks.cancelAllChats.mockImplementation(() => {
      order.push("cancel");
    });
    mocks.waitUntilStable.mockImplementation(async () => {
      order.push("stable");
    });
    mocks.storageDelete.mockImplementation(async () => {
      order.push("clear-terminal");
    });

    await buildAgent().onRequest(stopRequest());

    expect(order).toEqual(["cancel", "stable", "clear-terminal"]);
  });

  it("delegates non-stop requests to Think", async () => {
    const agent = buildAgent();
    const response = await agent.onRequest(
      new Request("https://app.openseo.so/agents/sam-chat/session_1/other", {
        method: "POST",
      }),
    );

    expect(mocks.superOnRequest).toHaveBeenCalledTimes(1);
    expect(mocks.cancelAllChats).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});

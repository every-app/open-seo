import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as runtimeEnv from "@/server/lib/runtime-env";
import type { createDataforseoClient } from "@/server/lib/dataforseo";
import { explorePromptTool } from "./explore-prompt";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  hosted: vi.fn(),
  paid: vi.fn(),
  client: vi.fn(),
  response:
    vi.fn<
      ReturnType<typeof createDataforseoClient>["aiSearch"]["llmResponse"]
    >(),
}));
vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: vi.fn(),
  DurableObject: class {
    kind = "mock";
  },
}));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: { getProjectForOrganization: mocks.authorize },
}));
vi.mock("@/server/lib/runtime-env", async (importOriginal) => ({
  ...(await importOriginal<typeof runtimeEnv>()),
  isHostedServerAuthMode: mocks.hosted,
}));
vi.mock("@/server/billing/subscription", () => ({
  customerHasPaidPlan: mocks.paid,
}));
vi.mock("@/server/lib/dataforseo", () => ({
  createDataforseoClient: mocks.client,
}));
vi.mock("@/server/lib/dataforseo/llm-models", () => ({
  resolveLatestLlmModelName: vi.fn(async () => "gpt-5.5"),
}));
vi.mock("@/server/lib/r2-cache", () => ({
  AI_SEARCH_PROMPT_CACHE_NAMESPACE: "ai-search-prompt",
  buildCacheKey: vi.fn(async () => "cache-key"),
  getCached: vi.fn(async () => null),
  setCached: vi.fn(async () => {}),
}));

const projectId = "project_1";
const context = makeToolContext();
const input = z.object(explorePromptTool.config.inputSchema);

beforeEach(() => {
  mocks.authorize.mockResolvedValue({ id: projectId, domain: "example.com" });
  mocks.hosted.mockResolvedValue(true);
  mocks.paid.mockResolvedValue(true);
  mocks.client.mockReturnValue({ aiSearch: { llmResponse: mocks.response } });
  mocks.response.mockResolvedValue({
    web_search: true,
    items: [
      {
        type: "message",
        sections: [
          {
            text: "Acme is an option.",
            annotations: [{ url: "https://acme.example/" }],
          },
        ],
      },
    ],
  });
});

describe("explore_prompt", () => {
  it.each([
    { models: undefined, expected: ["chat_gpt"] },
    {
      models: ["chat_gpt", "gemini", "chat_gpt"],
      expected: ["chat_gpt", "gemini"],
    },
  ])(
    "bills only the selected models, defaulting to ChatGPT: $models",
    async ({ models, expected }) => {
      const args = input.parse({ projectId, prompt: "Which tool?", models });
      const result = await explorePromptTool.handler(args, context);
      expect(mocks.client).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org_123", projectId }),
      );
      expect(mocks.response.mock.calls.map(([call]) => call.modelSlug)).toEqual(
        expected,
      );
      expect(result.structuredContent.results).toMatchObject(
        expected.map((model) => ({
          model,
          status: "success",
          text: "Acme is an option.",
          citations: [{ url: "https://acme.example/" }],
        })),
      );
      const text = textContent(result);
      expect(text).toContain("Acme is an option.");
      expect(text).toContain("https://acme.example/");
      const url = new URL(String(result.structuredContent.meta?.url));
      expect(JSON.parse(url.searchParams.get("models")!)).toEqual(args.models);
    },
  );

  it("rejects a foreign project before a paid model call", async () => {
    mocks.authorize.mockResolvedValue(null);
    await expect(
      explorePromptTool.handler(
        input.parse({ projectId, prompt: "Which tool?" }),
        context,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.response).not.toHaveBeenCalled();
  });

  it("enforces the hosted paid-plan gate before any model call", async () => {
    mocks.paid.mockResolvedValue(false);
    await expect(
      explorePromptTool.handler(
        input.parse({ projectId, prompt: "Which tool?" }),
        context,
      ),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
    expect(mocks.client).not.toHaveBeenCalled();
  });
});

import { beforeEach, expect, it, vi } from "vitest";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import { requireOpenRouterCostUsd } from "./chatAgent";

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: vi.fn(),
}));

// A self-host's OPENROUTER_BASE_URL server reports token usage but no cost.
const noCost = { openrouter: { usage: { promptTokens: 10 } } };

beforeEach(() => {
  vi.mocked(isHostedServerAuthMode).mockResolvedValue(false);
});

it("treats a missing cost as free off hosted, and refuses it on hosted", async () => {
  await expect(requireOpenRouterCostUsd(noCost)).resolves.toBe(0);
  vi.mocked(isHostedServerAuthMode).mockResolvedValue(true);
  await expect(requireOpenRouterCostUsd(noCost)).rejects.toThrow();
});

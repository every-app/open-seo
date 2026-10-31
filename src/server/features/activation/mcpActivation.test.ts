import { expect, it, vi } from "vitest";
import { markOnboardingMilestone } from "@/server/email/onboarding-drip";
import { ActivationRepository } from "@/server/features/activation/repositories/ActivationRepository";
import { markMcpConnected, recordExternalMcpToolCall } from "./mcpActivation";

vi.mock("cloudflare:workers", () => ({ waitUntil: vi.fn() }));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/server/email/onboarding-drip", () => ({
  markOnboardingMilestone: vi.fn(),
}));
vi.mock(
  "@/server/features/activation/repositories/ActivationRepository",
  () => ({
    ActivationRepository: {
      recordFirstMcpToolCall: vi.fn(),
      getOrganizationActivation: vi.fn(),
    },
  }),
);

const caller = (organizationId: string) => ({
  userId: "user-1",
  userEmail: "user@example.com",
  organizationId,
});

it("tells Loops about an organization's first tool call only", async () => {
  vi.mocked(ActivationRepository.recordFirstMcpToolCall)
    .mockResolvedValueOnce(true)
    .mockResolvedValueOnce(false);

  await recordExternalMcpToolCall(caller("org-first-call"));
  await recordExternalMcpToolCall(caller("org-called-before"));

  expect(markOnboardingMilestone).toHaveBeenCalledExactlyOnceWith(
    caller("org-first-call"),
    "mcpToolCalled",
  );
});

it("counts a connection as used when the workspace already made a tool call", async () => {
  vi.mocked(ActivationRepository.getOrganizationActivation)
    .mockResolvedValueOnce({
      organizationId: "org-active",
      firstMcpAuthorizedAt: "2026-10-01T00:00:00.000Z",
      firstMcpToolCallAt: "2026-10-01T00:05:00.000Z",
      updatedAt: "2026-10-01T00:05:00.000Z",
    })
    .mockResolvedValueOnce(null);

  await markMcpConnected(caller("org-active"), "claude");
  await markMcpConnected(caller("org-new"), "claude");

  expect(vi.mocked(markOnboardingMilestone).mock.calls).toEqual([
    [
      caller("org-active"),
      "mcpConnected",
      { agentProvider: "claude", mcpToolCalled: true },
    ],
    [
      caller("org-new"),
      "mcpConnected",
      { agentProvider: "claude", mcpToolCalled: undefined },
    ],
  ]);
});

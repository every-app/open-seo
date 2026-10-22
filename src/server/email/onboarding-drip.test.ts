import { expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({
  waitUntil: () => {
    throw new Error("waitUntil() called outside a request context");
  },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: async () => "loops-key",
}));
vi.mock("@/db", () => ({
  withPgClient: (fn: () => Promise<unknown>) => fn(),
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: {
    getOrganizationOwner: async () => ({ id: "owner", email: "owner@x.com" }),
  },
}));
vi.mock("@/server/email/loops-client", () => ({
  sendLoopsEvent: vi.fn().mockResolvedValue(undefined),
  updateLoopsContact: vi.fn(),
}));

import { sendLoopsEvent } from "@/server/email/loops-client";
import { sendCreditsExhaustedEvent } from "./onboarding-drip";

// Rank checks are refused for credits inside a Workflow step, where there is
// no request context to hand the send to.
it("still sends from a Workflow step, where waitUntil throws", async () => {
  await sendCreditsExhaustedEvent({
    userId: "user",
    userEmail: "u@x.com",
    organizationId: "org",
  });

  expect(vi.mocked(sendLoopsEvent).mock.calls[0][0]).toMatchObject({
    payload: { eventName: "credits_exhausted" },
  });
});

it("sends a scheduled check's refusal to the organization's owner", async () => {
  await sendCreditsExhaustedEvent({
    userId: "system",
    userEmail: "system@openseo.so",
    organizationId: "org",
  });

  expect(vi.mocked(sendLoopsEvent).mock.calls[0][0]).toMatchObject({
    payload: { email: "owner@x.com", userId: "owner" },
  });
});

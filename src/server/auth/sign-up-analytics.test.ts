import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureSignUpCompleted } from "./sign-up-analytics";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  getOAuthState: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => promise,
}));
vi.mock("better-auth/api", () => ({ getOAuthState: mocks.getOAuthState }));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

const user = { id: "user_1", analyticsOptedOut: false };
const mcpAuthorize = "/api/auth/oauth2/authorize?client_id=c&sig=s";

describe("captureSignUpCompleted", () => {
  beforeEach(() => {
    mocks.getOAuthState.mockResolvedValue(null);
  });

  it("finds an MCP consent sign-up behind email verification", async () => {
    await captureSignUpCompleted(user, {
      path: "/sign-up/email",
      body: {
        callbackURL: `https://openseo.so/verify-email?redirect=${encodeURIComponent(mcpAuthorize)}`,
      },
    });

    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: { method: "email", entry: "mcp", from_free_check: false },
      }),
    );
  });

  it("reads a Google sign-up's destination from the OAuth state", async () => {
    mocks.getOAuthState.mockResolvedValue({
      callbackURL: "https://openseo.so/",
      newUserURL: "https://openseo.so/onboarding?domain=openseo.so",
    });

    await captureSignUpCompleted(user, { path: "/callback/google" });

    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: { method: "google", entry: "app", from_free_check: true },
      }),
    );
  });

  it("sends nothing for a visitor who has not allowed analytics", async () => {
    await captureSignUpCompleted(
      { ...user, analyticsOptedOut: true },
      { path: "/callback/google" },
    );

    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });
});

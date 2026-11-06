import { beforeEach, describe, expect, it, vi } from "vitest";
import { captureSignUpCompleted, saveSignUpSource } from "./sign-up-analytics";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  getOAuthState: vi.fn(),
  saveSignupCampaign: vi.fn(),
  findUnclaimedGuest: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => promise,
}));
vi.mock("better-auth/api", () => ({ getOAuthState: mocks.getOAuthState }));
vi.mock("@/server/lib/posthog", () => ({
  captureServerEvent: mocks.captureServerEvent,
}));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { saveSignupCampaign: mocks.saveSignupCampaign },
}));
vi.mock("@/server/auth/repositories/GuestAccountRepository", () => ({
  GuestAccountRepository: { findUnclaimedGuest: mocks.findUnclaimedGuest },
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

describe("saveSignUpSource", () => {
  beforeEach(() => {
    mocks.getOAuthState.mockResolvedValue(null);
    mocks.findUnclaimedGuest.mockResolvedValue(null);
  });

  it("saves the tags of a link from behind email verification", async () => {
    const onboarding =
      "/onboarding?utm_source=chatgpt.com&utm_medium=referral&fbclid=abc";

    await saveSignUpSource("user_1", {
      path: "/sign-up/email",
      body: {
        callbackURL: `https://openseo.so/verify-email?redirect=${encodeURIComponent(onboarding)}`,
      },
    });

    expect(mocks.saveSignupCampaign).toHaveBeenCalledWith("user_1", {
      entry: "app",
      wasGuest: false,
      agent: null,
      utmMedium: "referral",
      utmSource: "chatgpt.com",
      utmCampaign: null,
      utmContent: null,
    });
  });

  it("names the agent whose connect window sent them to sign up", async () => {
    const authorize = `/api/auth/oauth2/authorize?response_type=code&client_id=c&redirect_uri=${encodeURIComponent("https://claude.ai/api/mcp/auth_callback")}&sig=s`;
    mocks.getOAuthState.mockResolvedValue({ callbackURL: authorize });

    await saveSignUpSource("user_1", { path: "/callback/google" });

    expect(mocks.saveSignupCampaign).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        entry: "mcp",
        wasGuest: false,
        agent: "claude.ai",
      }),
    );
  });

  it("credits a guest claim to the agent that made the guest", async () => {
    mocks.findUnclaimedGuest.mockResolvedValue({ agent: "localhost" });

    await saveSignUpSource("user_1", {
      path: "/callback/google",
      headers: new Headers({ cookie: `openseo_guest_claim=${"a".repeat(43)}` }),
    });

    expect(mocks.findUnclaimedGuest).toHaveBeenCalledWith("a".repeat(43));
    expect(mocks.saveSignupCampaign).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({
        entry: "mcp",
        wasGuest: true,
        agent: "localhost",
      }),
    );
  });
});

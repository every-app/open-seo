import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureSignUpCompleted,
  saveSignUpCampaign,
} from "./sign-up-analytics";

const mocks = vi.hoisted(() => ({
  captureServerEvent: vi.fn(),
  getOAuthState: vi.fn(),
  saveSignupCampaign: vi.fn(),
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

describe("saveSignUpCampaign", () => {
  it("saves an ad's campaign tags from behind email verification", async () => {
    const onboarding =
      "/onboarding?utm_source=ig&utm_medium=paid_social&utm_campaign=Sales&fbclid=abc";

    await saveSignUpCampaign("user_1", {
      path: "/sign-up/email",
      body: {
        callbackURL: `https://openseo.so/verify-email?redirect=${encodeURIComponent(onboarding)}`,
      },
    });

    expect(mocks.saveSignupCampaign).toHaveBeenCalledWith("user_1", {
      utmSource: "ig",
      utmCampaign: "Sales",
      utmContent: null,
    });
  });

  it("saves nothing for a tagged link that isn't a paid-social ad", async () => {
    mocks.getOAuthState.mockResolvedValue({
      newUserURL: "https://openseo.so/onboarding?utm_source=shared_report",
    });

    await saveSignUpCampaign("user_1", { path: "/callback/google" });

    expect(mocks.saveSignupCampaign).not.toHaveBeenCalled();
  });
});

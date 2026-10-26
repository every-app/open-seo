import { beforeEach, describe, expect, it, vi } from "vitest";
import { isStandaloneSignUpOpen } from "@/server/standalone/sign-up";

const mocks = vi.hoisted(() => ({
  hasAnyUser: vi.fn(),
  hasPendingInvitationForEmail: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: mocks,
}));

describe("isStandaloneSignUpOpen", () => {
  beforeEach(() => {
    mocks.hasAnyUser.mockResolvedValue(true);
    mocks.hasPendingInvitationForEmail.mockResolvedValue(false);
  });

  it("lets the first account through on a fresh installation", async () => {
    mocks.hasAnyUser.mockResolvedValue(false);

    await expect(isStandaloneSignUpOpen("stranger@example.com")).resolves.toBe(
      true,
    );
  });

  it("closes once an account exists", async () => {
    await expect(isStandaloneSignUpOpen("stranger@example.com")).resolves.toBe(
      false,
    );
  });

  it("stays open for an address with a pending invitation", async () => {
    mocks.hasPendingInvitationForEmail.mockResolvedValue(true);

    await expect(isStandaloneSignUpOpen("invitee@example.com")).resolves.toBe(
      true,
    );
    expect(mocks.hasPendingInvitationForEmail).toHaveBeenCalledWith(
      "invitee@example.com",
    );
  });
});

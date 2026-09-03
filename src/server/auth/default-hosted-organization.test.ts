import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveSignInHostedOrganization } from "@/server/auth/default-hosted-organization";

const mocks = vi.hoisted(() => ({
  getLastActiveOrganizationId: vi.fn(),
  getMembership: vi.fn(),
  findNewestMembershipForUser: vi.fn(),
  findFirstOrganizationIdForUser: vi.fn(),
  getHostedUser: vi.fn(),
  hasPendingInvitationForEmail: vi.fn(),
}));

vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: mocks,
}));

// Referral pin repair is fire-and-forget KV bookkeeping; mocking it keeps
// `cloudflare:workers` out of this module graph.
vi.mock("@/server/referrals/dub", () => ({
  markDubReferredOrganization: vi.fn(),
}));

describe("resolveSignInHostedOrganization", () => {
  beforeEach(() => {
    mocks.getLastActiveOrganizationId.mockResolvedValue(null);
    mocks.findNewestMembershipForUser.mockResolvedValue(null);
    mocks.getHostedUser.mockResolvedValue({
      id: "user-1",
      email: "invitee@example.com",
      name: "Invitee",
    });
    mocks.getMembership.mockResolvedValue({ role: "owner" });
  });

  // The invite-signup invariant: a brand-new user with a pending invitation
  // must NOT get a personal organization auto-minted at sign-in — accepting the
  // invite should leave them in exactly the inviter's org.
  it("defers organization creation while an invitation is pending", async () => {
    mocks.hasPendingInvitationForEmail.mockResolvedValue(true);
    const createOrganization = vi.fn();

    await expect(
      resolveSignInHostedOrganization("user-1", createOrganization),
    ).resolves.toBeNull();

    expect(createOrganization).not.toHaveBeenCalled();
  });

  it("creates the default organization when no invitation is pending", async () => {
    mocks.hasPendingInvitationForEmail.mockResolvedValue(false);
    const createOrganization = vi.fn().mockResolvedValue({ id: "org-new" });

    await expect(
      resolveSignInHostedOrganization("user-1", createOrganization),
    ).resolves.toMatchObject({ organizationId: "org-new" });
  });

  // An existing membership always wins — the pending-invite check only
  // applies to membership-less users, so inviting an existing user never
  // hides their current organization.
  it("returns the existing membership without checking invitations", async () => {
    mocks.findNewestMembershipForUser.mockResolvedValue({
      organizationId: "org-existing",
      role: "admin",
    });

    await expect(
      resolveSignInHostedOrganization("user-1", vi.fn()),
    ).resolves.toEqual({ organizationId: "org-existing", role: "admin" });

    expect(mocks.hasPendingInvitationForEmail).not.toHaveBeenCalled();
  });
});

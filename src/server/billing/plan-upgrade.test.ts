import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_AGENCY_PLAN_ID,
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_PAID_PLAN_ID,
  AUTUMN_PRO_PLAN_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import type * as AutumnModule from "@/server/billing/autumn";

const { attachMock, previewMock, getMock, updateBalanceMock, captureMock } =
  vi.hoisted(() => ({
    attachMock: vi.fn(),
    previewMock: vi.fn(),
    getMock: vi.fn(),
    updateBalanceMock: vi.fn(),
    captureMock: vi.fn(),
  }));

vi.mock("@/server/billing/autumn", async (importOriginal) => ({
  ...(await importOriginal<typeof AutumnModule>()),
  autumn: {
    billing: { attach: attachMock, previewAttach: previewMock },
    customers: { get: getMock },
    balances: { update: updateBalanceMock },
  },
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerError: captureMock }));

import { AUTUMN_TRACK_RETRY_OPTIONS } from "@/server/billing/autumn";
import {
  previewOrganizationPlanUpgrade,
  upgradeOrganizationPlan,
} from "./plan-upgrade";

const owner = { organizationId: "org_1", role: "owner" };
const origin = "https://app.example.com";
const day = 86_400_000;
const oldRefill = Date.now() + 15 * day;
const newRefill = Date.now() + 30 * day;

const customerOn = (planId: string, { pastDue = false } = {}) => ({
  flags: { [AUTUMN_PAID_PLAN_FEATURE_ID]: { planId } },
  subscriptions: [{ planId, pastDue }],
  balances: { [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]: { remaining: 7500 } },
});

// Autumn's customer right after the upgrade: the new plan's grant, and the
// old plan's leftover credits ending at the old refill date.
const upgradedCustomer = {
  ...customerOn(AUTUMN_AGENCY_PLAN_ID),
  balances: {
    [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID]: {
      nextResetAt: newRefill,
      breakdown: [
        { id: "plan_grant", planId: AUTUMN_AGENCY_PLAN_ID, expiresAt: null },
        { id: "carried", planId: null, expiresAt: oldRefill },
      ],
    },
  },
};

// The terms both the preview and the charge use: a new cycle today at the
// full price, no refund for unused days, monthly credits carried over.
const upgradeTerms = {
  customerId: "org_1",
  planId: AUTUMN_AGENCY_PLAN_ID,
  billingCycleAnchor: "now",
  prorationBehavior: "none",
  carryOverBalances: {
    enabled: true,
    featureIds: [AUTUMN_SEO_DATA_BALANCE_FEATURE_ID],
  },
};

beforeEach(() => {
  // On Base until the charge goes through.
  getMock.mockImplementation(async () =>
    attachMock.mock.calls.length > 0
      ? upgradedCustomer
      : customerOn(AUTUMN_PAID_PLAN_ID),
  );
  previewMock.mockResolvedValue({
    total: 100,
    nextCycle: { startsAt: newRefill, total: 100 },
  });
  attachMock.mockResolvedValue({ paymentUrl: null });
  updateBalanceMock.mockResolvedValue({ success: true });
});

describe("plan upgrades", () => {
  it("previews and charges a new cycle at the full price, keeping unused credits until it renews", async () => {
    await expect(
      previewOrganizationPlanUpgrade(owner, { planId: AUTUMN_AGENCY_PLAN_ID }),
    ).resolves.toEqual({
      chargeUsd: 100,
      carriedUsd: 7.5,
      renewsAt: newRefill,
      renewalUsd: 100,
    });
    expect(previewMock).toHaveBeenCalledWith(upgradeTerms);

    await expect(
      upgradeOrganizationPlan(owner, {
        planId: AUTUMN_AGENCY_PLAN_ID,
        origin,
      }),
    ).resolves.toEqual({ paymentUrl: null });

    expect(attachMock).toHaveBeenCalledWith(
      {
        ...upgradeTerms,
        // The saved card is charged; a link only when the bank asks.
        redirectMode: "if_required",
        successUrl: `${origin}/billing`,
      },
      // A replayed charge would charge the card twice.
      AUTUMN_TRACK_RETRY_OPTIONS,
    );
    expect(updateBalanceMock).toHaveBeenCalledExactlyOnceWith({
      customerId: "org_1",
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      balanceId: "carried",
      expiresAt: newRefill,
    });
  });

  it("only moves an owner's monthly plan in good standing up to a pricier tier", async () => {
    const upgrade = () =>
      upgradeOrganizationPlan(owner, { planId: AUTUMN_PRO_PLAN_ID, origin });

    await expect(
      upgradeOrganizationPlan(
        { organizationId: "org_1", role: "member" },
        { planId: AUTUMN_PRO_PLAN_ID, origin },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    getMock.mockResolvedValue(customerOn(AUTUMN_AGENCY_PLAN_ID));
    await expect(upgrade()).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });

    getMock.mockResolvedValue(
      customerOn(AUTUMN_PAID_PLAN_ID, { pastDue: true }),
    );
    await expect(upgrade()).rejects.toMatchObject({
      code: "PAYMENT_METHOD_REQUIRED",
    });

    expect(attachMock).not.toHaveBeenCalled();
  });

  it("reports the upgrade as done when moving the credits' expiry fails after the charge", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    updateBalanceMock.mockRejectedValue(new Error("Autumn 500"));

    await expect(
      upgradeOrganizationPlan(owner, {
        planId: AUTUMN_AGENCY_PLAN_ID,
        origin,
      }),
    ).resolves.toEqual({ paymentUrl: null });
    expect(captureMock).toHaveBeenCalled();
  });
});

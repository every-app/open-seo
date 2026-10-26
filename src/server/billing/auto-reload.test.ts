import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

const { attachMock, getMock, updateMock, sendLoopsEventMock, contactsMock } =
  vi.hoisted(() => ({
    attachMock: vi.fn(),
    getMock: vi.fn(),
    updateMock: vi.fn(),
    sendLoopsEventMock: vi.fn(),
    contactsMock: vi.fn(),
  }));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    billing: { attach: attachMock },
    customers: { get: getMock, update: updateMock },
  },
  AUTUMN_TRACK_RETRY_OPTIONS: { retryCodes: ["429"] },
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));
vi.mock("@/server/billing/loops-sync", () => ({
  getOrganizationContacts: contactsMock,
}));
vi.mock("@/server/email/loops-client", () => ({
  sendLoopsEvent: sendLoopsEventMock,
}));
vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn().mockResolvedValue("loops-key"),
}));

import {
  disableAutoReloadIfUnpaid,
  handleAutoReloadWebhook,
  setOrganizationAutoReload,
} from "./auto-reload";

const owner = { organizationId: "org_1", role: "owner", userId: "user_1" };
const settings = { amountUsd: 20, monthlyLimitUsd: 100 };

/** Saved before: $30 reloads within a $120 budget. */
const savedControls = (enabled: boolean) => ({
  autoTopups: [
    {
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      enabled,
      threshold: 5000,
      quantity: 30000,
      purchaseLimit: { interval: "month", intervalCount: 1, limit: 9 },
    },
  ],
  usageLimits: [
    {
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      enabled,
      limit: 120000,
      interval: "month",
      anchor: "billing_cycle",
      usage: 0,
    },
  ],
});

/** A paying customer with a card who bought a top-up before. */
const customer = (overrides: Record<string, unknown> = {}) => ({
  id: "org_1",
  flags: { [AUTUMN_PAID_PLAN_FEATURE_ID]: { planId: "base-plan" } },
  paymentMethod: { type: "card" },
  purchases: [{ planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID }],
  balances: {
    [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]: { remaining: 9000 },
  },
  billingControls: {},
  metadata: {},
  ...overrides,
});

/** What `settings` writes: the reload control with its backstop, and the
 *  budget as a usage limit on the same balance. */
const expectedControls = (enabled: boolean) => ({
  autoTopups: [
    {
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      enabled,
      threshold: 5000,
      quantity: 20000,
      purchaseLimit: { interval: "month", limit: 11 },
    },
  ],
  usageLimits: [
    {
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      enabled,
      limit: 100000,
      interval: "month",
      anchor: "billing_cycle",
    },
  ],
});

beforeEach(() => {
  getMock.mockResolvedValue(customer());
  attachMock.mockResolvedValue({ paymentUrl: null });
  updateMock.mockResolvedValue({});
  contactsMock.mockResolvedValue([
    { userId: "user_1", email: "owner@example.com", role: "owner" },
    { userId: "user_2", email: "member@example.com", role: "member" },
  ]);
  sendLoopsEventMock.mockResolvedValue({ duplicate: false });
});

describe("setOrganizationAutoReload", () => {
  it("turns auto-reload on with the fixed threshold and the budget as a usage limit", async () => {
    await setOrganizationAutoReload(owner, { enabled: true, ...settings });

    // Credits above the threshold and a purchase to price from: Autumn can
    // take it from here without a charge now.
    expect(attachMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      customerId: "org_1",
      billingControls: expectedControls(true),
      metadata: { autoReloadFailure: null },
    });
  });

  it.each([
    [
      "the balance is at the threshold",
      {
        balances: {
          [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]: { remaining: 5000 },
        },
      },
    ],
    ["the organization never bought a top-up", { purchases: [] }],
    [
      "the last reload failed and the balance is still low",
      {
        balances: {
          [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]: { remaining: 0 },
        },
        billingControls: savedControls(true),
        metadata: { autoReloadFailure: { reason: "charge_failed", at: 1 } },
      },
    ],
  ])(
    "buys the first reload with the saved card before turning on when %s",
    async (_, overrides) => {
      getMock.mockResolvedValue(customer(overrides));

      await setOrganizationAutoReload(owner, { enabled: true, ...settings });

      expect(attachMock).toHaveBeenCalledWith(
        {
          customerId: "org_1",
          planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
          featureQuantities: [
            {
              featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
              quantity: 20000,
            },
          ],
          redirectMode: "never",
        },
        // A replayed charge would be a second charge.
        { retryCodes: ["429"] },
      );
      // The purchase lands before the control, so Autumn's own enable-time
      // purchase sees a balance above the threshold and does not double up.
      expect(attachMock.mock.invocationCallOrder[0]).toBeLessThan(
        updateMock.mock.invocationCallOrder[0],
      );
    },
  );

  it("does not buy again when a retry's purchase already landed", async () => {
    // The failed-reload notice is still up (the control write failed after
    // the charge), but the credits are there.
    getMock.mockResolvedValue(
      customer({
        billingControls: savedControls(true),
        metadata: { autoReloadFailure: { reason: "charge_failed", at: 1 } },
      }),
    );

    await setOrganizationAutoReload(owner, { enabled: true, ...settings });

    expect(attachMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { autoReloadFailure: null } }),
    );
  });

  it("sends a charge that got no answer to the balance, not to a retry", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getMock.mockResolvedValue(customer({ purchases: [] }));
    const timeout = new Error("timed out");
    timeout.name = "RequestTimeoutError";
    attachMock.mockRejectedValueOnce(timeout);

    await expect(
      setOrganizationAutoReload(owner, { enabled: true, ...settings }),
    ).rejects.toMatchObject({ code: "PAYMENT_ACTION_REQUIRED" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("tells the bank's confirmation apart from a card that cannot be charged", async () => {
    getMock.mockResolvedValue(customer({ purchases: [] }));
    attachMock.mockResolvedValueOnce({
      paymentUrl: null,
      requiredAction: { code: "3ds_required", reason: "SCA" },
    });
    await expect(
      setOrganizationAutoReload(owner, { enabled: true, ...settings }),
    ).rejects.toMatchObject({ code: "PAYMENT_ACTION_REQUIRED" });

    attachMock.mockResolvedValueOnce({
      paymentUrl: null,
      requiredAction: { code: "payment_failed", reason: "declined" },
    });
    await expect(
      setOrganizationAutoReload(owner, { enabled: true, ...settings }),
    ).rejects.toMatchObject({ code: "PAYMENT_METHOD_REQUIRED" });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("needs a paid plan and a card to turn on, but not to turn off", async () => {
    getMock.mockResolvedValueOnce(customer({ flags: {} }));
    await expect(
      setOrganizationAutoReload(owner, { enabled: true, ...settings }),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });

    getMock.mockResolvedValueOnce(customer({ paymentMethod: null }));
    await expect(
      setOrganizationAutoReload(owner, { enabled: true, ...settings }),
    ).rejects.toMatchObject({ code: "PAYMENT_METHOD_REQUIRED" });
    expect(attachMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();

    getMock.mockResolvedValueOnce(
      customer({ flags: {}, billingControls: savedControls(true) }),
    );
    await setOrganizationAutoReload(owner, { enabled: false });
    // The saved amounts stay for turning it back on; the failure notice too.
    // The budget goes off with it: nothing is budgeted while nothing is
    // bought automatically.
    const off = savedControls(false);
    expect(updateMock).toHaveBeenCalledWith({
      customerId: "org_1",
      billingControls: {
        autoTopups: [
          {
            ...off.autoTopups[0],
            purchaseLimit: { interval: "month", limit: 9 },
          },
        ],
        usageLimits: [{ ...off.usageLimits[0], usage: undefined }],
      },
    });
  });

  it("refuses a budget the cycle's spend has as good as reached, charging nothing", async () => {
    // $96.40 spent under the saved $120 budget, balance at the threshold:
    // turning on with a $100 budget would buy a reload that cannot be used.
    const controls = savedControls(false);
    controls.usageLimits[0].usage = 96400;
    getMock.mockResolvedValue(
      customer({
        billingControls: controls,
        balances: {
          [AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID]: { remaining: 2000 },
        },
      }),
    );

    await expect(
      setOrganizationAutoReload(owner, { enabled: true, ...settings }),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(attachMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("only lets the owner change auto-reload", async () => {
    await expect(
      setOrganizationAutoReload(
        { ...owner, role: "member" },
        { enabled: true, ...settings },
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("disableAutoReloadIfUnpaid", () => {
  it("turns auto-reload off when the paid plan is gone, and leaves a paying customer alone", async () => {
    getMock.mockResolvedValueOnce(
      customer({ flags: {}, billingControls: savedControls(true) }),
    );
    await disableAutoReloadIfUnpaid("org_1");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        billingControls: {
          autoTopups: [expect.objectContaining({ enabled: false })],
          usageLimits: [expect.objectContaining({ enabled: false })],
        },
      }),
    );

    getMock.mockResolvedValueOnce(
      customer({ billingControls: savedControls(true) }),
    );
    await disableAutoReloadIfUnpaid("org_1");
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("handleAutoReloadWebhook", () => {
  const failed = (reason: string) => ({
    type: "billing.auto_topup_failed",
    occurred_at: 1_700_000_000_000,
    data: {
      customer_id: "org_1",
      feature_id: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      reason,
    },
  });

  it("flags a declined card for the billing page and emails whoever can fix it", async () => {
    await handleAutoReloadWebhook(failed("charge_failed"));

    expect(updateMock).toHaveBeenCalledWith({
      customerId: "org_1",
      metadata: {
        autoReloadFailure: { reason: "charge_failed", at: 1_700_000_000_000 },
      },
    });
    expect(sendLoopsEventMock).toHaveBeenCalledTimes(1);
    expect(sendLoopsEventMock.mock.calls[0]?.[0]).toMatchObject({
      payload: {
        email: "owner@example.com",
        eventName: "auto_reload_failed",
        eventProperties: { reason: "charge_failed" },
      },
    });
  });

  it("flags a failure on our side without blaming the card", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await handleAutoReloadWebhook(failed("configuration_unavailable"));

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(sendLoopsEventMock).not.toHaveBeenCalled();
  });

  it("treats Autumn's own windows as waits and the purchase backstop as ours, not failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await handleAutoReloadWebhook(failed("failed_attempt_limit_reached"));
    await handleAutoReloadWebhook(failed("purchase_limit_reached"));

    expect(updateMock).not.toHaveBeenCalled();
    expect(sendLoopsEventMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it("clears the flag once a reload goes through", async () => {
    await handleAutoReloadWebhook({
      type: "billing.auto_topup_succeeded",
      data: { customer_id: "org_1", quantity_granted: 20000 },
    });

    expect(updateMock).toHaveBeenCalledWith({
      customerId: "org_1",
      metadata: { autoReloadFailure: null },
    });
  });
});

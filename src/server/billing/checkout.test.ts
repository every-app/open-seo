import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_CHECKOUT_SESSION_PARAMS,
  AUTUMN_PAID_PLAN_ID,
  AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";

const { attachMock, portalMock } = vi.hoisted(() => ({
  attachMock: vi.fn(),
  portalMock: vi.fn(),
}));

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    billing: { attach: attachMock, openCustomerPortal: portalMock },
  },
}));

import {
  createBillingPortalUrl,
  createPlanCheckoutUrl,
  createTopUpCheckoutUrl,
} from "./checkout";

const origin = "https://app.example.com";
const owner = { organizationId: "org_1", role: "owner" };

beforeEach(() => {
  attachMock.mockResolvedValue({ paymentUrl: "https://checkout/session" });
  portalMock.mockResolvedValue({ url: "https://portal/session" });
});

describe("billing checkout links", () => {
  it("create a plan checkout that bills only after the customer confirms", async () => {
    await expect(
      createPlanCheckoutUrl(owner, {
        planId: AUTUMN_PAID_PLAN_ID,
        // An off-site redirect falls back to the app home.
        redirectTo: "//evil.example",
        origin,
      }),
    ).resolves.toBe("https://checkout/session");
    expect(attachMock).toHaveBeenCalledWith({
      customerId: "org_1",
      planId: AUTUMN_PAID_PLAN_ID,
      // Links are created before the click, which is only safe because
      // "always" returns a link instead of charging a saved card.
      redirectMode: "always",
      successUrl: `${origin}/subscribe?checkout=success&redirect=%2F`,
      checkoutSessionParams: AUTUMN_CHECKOUT_SESSION_PARAMS,
    });
  });

  it("buys the chosen dollars of top-up credits", async () => {
    await createTopUpCheckoutUrl(owner, { amountUsd: 25, origin });

    expect(attachMock).toHaveBeenCalledWith(
      expect.objectContaining({
        planId: AUTUMN_SEO_DATA_TOP_UP_PLAN_ID,
        redirectMode: "always",
        featureQuantities: [
          {
            featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
            quantity: 25_000,
          },
        ],
      }),
    );
  });

  it("returns from the portal to the app page that opened it", async () => {
    await createBillingPortalUrl(owner, {
      returnTo: "/billing/fix-payment?returned=true",
      origin,
    });

    expect(portalMock).toHaveBeenCalledWith({
      customerId: "org_1",
      returnUrl: `${origin}/billing/fix-payment?returned=true`,
    });
  });

  it("only lets the owner start a checkout or open the portal", async () => {
    const member = { organizationId: "org_1", role: "member" };

    await expect(
      createPlanCheckoutUrl(member, {
        planId: AUTUMN_PAID_PLAN_ID,
        redirectTo: "/",
        origin,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createTopUpCheckoutUrl(member, { amountUsd: 25, origin }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createBillingPortalUrl(member, { returnTo: "/billing", origin }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(attachMock).not.toHaveBeenCalled();
    expect(portalMock).not.toHaveBeenCalled();
  });
});

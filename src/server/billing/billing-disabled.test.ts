import { afterEach, describe, expect, it, vi } from "vitest";
import { autumn } from "@/server/billing/autumn";
import {
  AUTUMN_PAID_PLAN_FEATURE_ID,
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
} from "@/shared/billing";

vi.mock("autumn-js", () => {
  throw new Error("autumn-js must not load while billing is disabled");
});

describe("OPENSEO_DISABLE_BILLING", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers the Autumn facade locally without a secret key", async () => {
    vi.stubEnv("OPENSEO_DISABLE_BILLING", "1");
    vi.stubEnv("AUTUMN_SECRET_KEY", "");

    const check = await autumn.check({
      customerId: "org_1",
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      requiredBalance: 500,
    });
    expect(check.allowed).toBe(true);
    expect(check.balance?.remaining).toBeGreaterThan(1_000_000);

    const customer = await autumn.customers.getOrCreate({
      customerId: "org_1",
    });
    expect(customer.id).toBe("org_1");
    expect(customer.flags[AUTUMN_PAID_PLAN_FEATURE_ID]).toBeTruthy();

    await expect(
      autumn.balances.finalize({ lockId: "dfs_x", action: "release" }),
    ).resolves.toEqual({ success: true });

    // Billing page reads added upstream (invoices, usage) stay off Autumn too.
    await expect(
      autumn.invoices.list({ customerId: "org_1" }),
    ).resolves.toMatchObject({ list: [] });
    await expect(
      autumn.events.aggregate({ customerId: "org_1", featureId: "x" }),
    ).resolves.toMatchObject({ list: [] });
  });
});

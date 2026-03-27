import { beforeEach, describe, expect, it, vi } from "vitest";
import { AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID } from "@/shared/billing";

const { checkMock, getOrCreateMock, isHostedServerAuthModeMock } = vi.hoisted(
  () => ({
    checkMock: vi.fn(),
    getOrCreateMock: vi.fn(),
    isHostedServerAuthModeMock: vi.fn(),
  }),
);

vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: checkMock,
    customers: {
      getOrCreate: getOrCreateMock,
    },
  },
}));

vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: isHostedServerAuthModeMock,
}));

import {
  customerHasManagedServiceAccess,
  getOrCreateOrganizationCustomer,
  requireManagedServiceAccess,
} from "./subscription";

describe("subscription billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("checks the managed service access entitlement", async () => {
    checkMock.mockResolvedValue({ allowed: true });

    await expect(customerHasManagedServiceAccess("org_123")).resolves.toBe(
      true,
    );

    expect(checkMock).toHaveBeenCalledWith({
      customerId: "org_123",
      featureId: AUTUMN_MANAGED_SERVICE_ACCESS_FEATURE_ID,
    });
  });

  it("skips the managed service check outside hosted mode", async () => {
    isHostedServerAuthModeMock.mockResolvedValue(false);

    await expect(
      requireManagedServiceAccess({
        organizationId: "org_123",
        userEmail: "alice@example.com",
      }),
    ).resolves.toBeUndefined();

    expect(getOrCreateMock).not.toHaveBeenCalled();
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("throws payment required when the org lacks managed service access", async () => {
    isHostedServerAuthModeMock.mockResolvedValue(true);
    getOrCreateMock.mockResolvedValue({ id: "org_123" });
    checkMock.mockResolvedValue({ allowed: false });

    await expect(
      requireManagedServiceAccess({
        organizationId: "org_123",
        userEmail: "alice@example.com",
      }),
    ).rejects.toMatchObject({ code: "PAYMENT_REQUIRED" });
  });

  it("looks up the billing customer by organization id", async () => {
    getOrCreateMock.mockResolvedValue({ id: "cust_123" });

    await getOrCreateOrganizationCustomer({
      organizationId: "org_123",
      userEmail: "alice@example.com",
    });

    expect(getOrCreateMock).toHaveBeenCalledWith({
      customerId: "org_123",
    });
  });
});

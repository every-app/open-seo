import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import { whoamiTool } from "./whoami";
import { makeToolContext, textContent } from "./tool-test-support";

const mocks = vi.hoisted(() => ({
  check: vi.fn<(args: { featureId: string }) => Promise<unknown>>(),
  getOrCreate: vi.fn(),
  kvGet: vi.fn(),
  kvPut: vi.fn(),
  isHosted: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({
  env: { KV: { get: mocks.kvGet, put: mocks.kvPut } },
}));
vi.mock("@/server/billing/autumn", () => ({
  autumn: {
    check: mocks.check,
    customers: { getOrCreate: mocks.getOrCreate },
  },
}));
vi.mock("@/server/lib/runtime-env", () => ({
  isHostedServerAuthMode: mocks.isHosted,
}));
vi.mock("@/server/lib/posthog", () => ({ captureServerEvent: vi.fn() }));

const context = makeToolContext({ orgScope: "user" });

beforeEach(() => {
  mocks.isHosted.mockResolvedValue(true);
  mocks.kvGet.mockResolvedValue(null);
  mocks.kvPut.mockResolvedValue(undefined);
  mocks.getOrCreate.mockResolvedValue({ id: context.auth.organizationId });
  mocks.check.mockImplementation(async ({ featureId }) =>
    featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID
      ? { allowed: true, balance: { remaining: 500 } }
      : { allowed: false, balance: null },
  );
});

describe("whoami", () => {
  it("initializes a fresh hosted billing customer before reading its trial balance", async () => {
    const result = await whoamiTool.handler({}, context);

    expect(mocks.getOrCreate).toHaveBeenCalledWith({
      customerId: context.auth.organizationId,
      email: context.auth.userEmail,
    });
    expect(mocks.getOrCreate).toHaveBeenCalledBefore(mocks.check);
    expect(mocks.check).toHaveBeenCalledWith({
      customerId: context.auth.organizationId,
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
    });
    expect(result.structuredContent.creditsRemaining).toBe(500);
    expect(result._meta?.creditsRemaining).toBe(500);
    expect(textContent(result)).toContain("Credits remaining: 500");
  });

  it.each([
    { monthly: 0, topup: null, expected: 0 },
    { monthly: 200, topup: 75, expected: 275 },
    { monthly: 0, topup: 75, expected: 75 },
  ])(
    "reports $expected credits for $monthly base and $topup top-up",
    async ({ monthly, topup, expected }) => {
      mocks.check.mockImplementation(async ({ featureId }) => {
        const remaining =
          featureId === AUTUMN_SEO_DATA_BALANCE_FEATURE_ID ? monthly : topup;
        return {
          allowed: remaining != null && remaining > 0,
          balance: remaining == null ? null : { remaining },
        };
      });

      const result = await whoamiTool.handler({}, context);

      expect(result.structuredContent.creditsRemaining).toBe(expected);
    },
  );

  it.each([
    {
      name: "missing base balance",
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      throws: false,
    },
    {
      name: "failed base lookup",
      featureId: AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
      throws: true,
    },
    {
      name: "failed top-up lookup",
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      throws: true,
    },
    {
      name: "fail-open top-up lookup",
      featureId: AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
      throws: false,
    },
  ])("reports unknown for a $name", async ({ featureId, throws }) => {
    mocks.check.mockImplementation(async (args) => {
      if (args.featureId === featureId) {
        if (throws) throw new Error("Billing unavailable");
        return { allowed: true, balance: null };
      }
      return { allowed: true, balance: { remaining: 75 } };
    });

    const result = await whoamiTool.handler({}, context);

    expect(result.structuredContent.creditsRemaining).toBeNull();
    expect(result._meta).toBeUndefined();
    expect(textContent(result)).toContain("Credits remaining: unknown");
  });

  it("keeps account identity available when billing initialization fails", async () => {
    mocks.getOrCreate.mockRejectedValue(new Error("Billing unavailable"));

    const result = await whoamiTool.handler({}, context);

    expect(result.structuredContent).toMatchObject({
      userEmail: context.auth.userEmail,
      scopes: context.auth.scopes,
      mode: "hosted",
      creditsRemaining: null,
    });
    expect(mocks.check).not.toHaveBeenCalled();
  });

  it("avoids Autumn in self-hosted mode", async () => {
    mocks.isHosted.mockResolvedValue(false);

    const result = await whoamiTool.handler({}, context);

    expect(result.structuredContent).toMatchObject({
      mode: "self-hosted",
      creditsRemaining: null,
    });
    expect(mocks.getOrCreate).not.toHaveBeenCalled();
    expect(mocks.check).not.toHaveBeenCalled();
  });
});

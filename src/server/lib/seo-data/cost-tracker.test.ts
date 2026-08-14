import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: new Map<string, string>(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getOptionalEnvValue: vi.fn(async (name: string) => mocks.env.get(name)),
}));

import {
  assertDataforseoBudgetAvailable,
  getCostCounters,
  recordDataforseoCall,
  resetBudgetConfigCache,
  resetCostCounters,
} from "./cost-tracker";
import { BudgetExceededError } from "./errors";

describe("DataForSEO self-hosted cost guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-12T12:00:00.000Z"));
    mocks.env.clear();
    resetBudgetConfigCache();
    resetCostCounters();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records real task cost in the observable counters", () => {
    recordDataforseoCall(0.0125);

    expect(getCostCounters()).toMatchObject({
      dataforseoCalls: 1,
      estimatedDataforseoCostUsd: 0.0125,
    });
  });

  it("blocks new requests when the daily budget is reached", async () => {
    mocks.env.set("DATAFORSEO_DAILY_BUDGET", "0.05");
    resetBudgetConfigCache();
    recordDataforseoCall(0.05);

    await expect(assertDataforseoBudgetAvailable()).rejects.toMatchObject({
      name: BudgetExceededError.name,
      period: "daily",
      limit: 0.05,
      spent: 0.05,
    });
  });

  it("blocks new requests when the monthly budget is reached", async () => {
    mocks.env.set("DATAFORSEO_MONTHLY_BUDGET", "1.5");
    resetBudgetConfigCache();
    recordDataforseoCall(1.5);

    await expect(assertDataforseoBudgetAvailable()).rejects.toMatchObject({
      name: BudgetExceededError.name,
      period: "monthly",
      limit: 1.5,
      spent: 1.5,
    });
  });

  it("counts zero-cost requests without consuming budget", async () => {
    mocks.env.set("DATAFORSEO_DAILY_BUDGET", "0.01");
    resetBudgetConfigCache();
    recordDataforseoCall(0);

    await expect(assertDataforseoBudgetAvailable()).resolves.toBeUndefined();
    expect(getCostCounters()).toMatchObject({
      dataforseoCalls: 1,
      estimatedDataforseoCostUsd: 0,
    });
  });

  it("resets daily spend at the next UTC day but preserves monthly spend", async () => {
    mocks.env.set("DATAFORSEO_DAILY_BUDGET", "0.05");
    mocks.env.set("DATAFORSEO_MONTHLY_BUDGET", "0.05");
    resetBudgetConfigCache();
    recordDataforseoCall(0.05);
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));

    await expect(assertDataforseoBudgetAvailable()).rejects.toMatchObject({
      period: "monthly",
    });
  });

  it("treats a configured zero limit as an immediate block", async () => {
    mocks.env.set("DATAFORSEO_DAILY_BUDGET", "0");
    resetBudgetConfigCache();

    await expect(assertDataforseoBudgetAvailable()).rejects.toMatchObject({
      period: "daily",
      limit: 0,
      spent: 0,
    });
  });
});

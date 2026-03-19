import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildVerifiedBacklinksAccessStatus,
  getBacklinksAccessStatus,
  setBacklinksAccessStatus,
} from "@/server/features/backlinks/backlinksAccess";

const { kvState } = vi.hoisted(() => ({
  kvState: new Map<string, string>(),
}));

vi.mock("@/server/lib/runtime-env", () => ({
  getEnvValue: vi.fn(async () => undefined),
  isHostedServerAuthMode: vi.fn(async () => false),
  getWorkersBinding: vi.fn(async () => ({
    get: vi.fn(async (key: string) => kvState.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      kvState.set(key, value);
    }),
  })),
}));

describe("backlinksAccess", () => {
  beforeEach(() => {
    kvState.clear();
  });

  it("stores access status globally", async () => {
    const checkedAt = "2026-03-14T00:00:00.000Z";
    await setBacklinksAccessStatus(
      buildVerifiedBacklinksAccessStatus(checkedAt),
    );

    await expect(getBacklinksAccessStatus()).resolves.toMatchObject({
      enabled: true,
      verifiedAt: checkedAt,
    });
  });
});

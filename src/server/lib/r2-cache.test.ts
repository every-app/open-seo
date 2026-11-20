import { expect, it, vi } from "vitest";
import { getCached, getCachedStrict } from "./r2-cache";

vi.mock("cloudflare:workers", () => ({
  env: {
    R2: {
      get: async () => {
        throw new Error("get: We encountered an internal error. (10001)");
      },
    },
  },
}));

it("reads an R2 outage as a cache miss, except for strict reads", async () => {
  expect(await getCached("backlinks:key")).toBeNull();
  await expect(getCachedStrict("serp-reads:key")).rejects.toThrow("10001");
});

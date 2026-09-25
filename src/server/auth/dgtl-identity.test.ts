import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureSingleDgtlIdentity } from "./dgtl-identity";

const accounts = vi.hoisted(() => vi.fn());
vi.mock("@/server/auth/repositories/AuthRepository", () => ({
  AuthRepository: { getDgtlAccount: accounts },
}));

describe("central identity creation", () => {
  beforeEach(() => {
    accounts.mockResolvedValue([]);
  });
  const candidate = {
    userId: "seo-user",
    providerId: "dgtl-sso",
    accountId: "new-subject",
  };

  it("permits the first verified central link", async () => {
    await expect(ensureSingleDgtlIdentity(candidate)).resolves.toBeUndefined();
    expect(accounts).toHaveBeenCalledWith("seo-user");
  });
  it.each(["old-subject", "new-subject"])(
    "rejects another central row when %s is already linked",
    async (accountId) => {
      accounts.mockResolvedValue([{ accountId }]);
      await expect(ensureSingleDgtlIdentity(candidate)).rejects.toMatchObject({
        status: "FORBIDDEN",
      });
    },
  );
  it("does not restrict Google or analytics connections", async () => {
    await expect(
      ensureSingleDgtlIdentity({ ...candidate, providerId: "google" }),
    ).resolves.toBeUndefined();
    expect(accounts).not.toHaveBeenCalled();
  });
  it("fails closed when links cannot be checked", async () => {
    accounts.mockRejectedValue(new Error("database unavailable"));
    await expect(ensureSingleDgtlIdentity(candidate)).rejects.toThrow(
      "database unavailable",
    );
  });
});

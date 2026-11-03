import { describe, expect, it } from "vitest";
import { resolveMaxPagesInput } from "@/client/features/audit/launch/types";

describe("resolveMaxPagesInput", () => {
  it("uses the submitted snapshot when live form state has not committed", () => {
    expect(resolveMaxPagesInput("200", "10", 10_000)).toBe(200);
  });

  it("uses live form state for blur commits", () => {
    expect(resolveMaxPagesInput(undefined, "200", 10_000)).toBe(200);
  });

  it.each([
    ["", 10_000, 10],
    ["5", 10_000, 10],
    ["200", 50, 50],
    ["200", 10_000, 200],
  ])("clamps %p to the account limit", (input, limit, expected) => {
    expect(resolveMaxPagesInput(input, "10", limit)).toBe(expected);
  });
});

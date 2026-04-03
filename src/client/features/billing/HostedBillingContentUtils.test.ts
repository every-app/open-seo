import { describe, expect, it } from "vitest";
import { parseTopUpAmount } from "./HostedBillingContentUtils";

describe("parseTopUpAmount", () => {
  it("accepts valid whole-dollar amounts", () => {
    expect(parseTopUpAmount("20")).toEqual({ isValid: true, parsed: 20 });
    expect(parseTopUpAmount("10")).toEqual({ isValid: true, parsed: 10 });
    expect(parseTopUpAmount("99")).toEqual({ isValid: true, parsed: 99 });
  });

  it("rejects amounts below minimum", () => {
    expect(parseTopUpAmount("9")).toEqual({ isValid: false, parsed: 20 });
  });

  it("rejects amounts above maximum", () => {
    expect(parseTopUpAmount("100")).toEqual({ isValid: false, parsed: 20 });
  });

  it("rejects non-numeric input", () => {
    expect(parseTopUpAmount("abc")).toEqual({ isValid: false, parsed: 20 });
  });
});

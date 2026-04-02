import { describe, expect, it } from "vitest";
import {
  formatCreditAmount,
  formatResetDate,
  parseTopUpAmount,
} from "./HostedBillingContentUtils";

describe("formatResetDate", () => {
  it("formats a valid Unix timestamp in ms", () => {
    const date = new Date(2026, 3, 15); // April 15, local time
    const result = formatResetDate(date.getTime());
    expect(result).toBe("Resets Apr 15");
  });

  it("returns null for null input", () => {
    expect(formatResetDate(null)).toBeNull();
  });
});

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

describe("formatCreditAmount", () => {
  it("converts credits to formatted USD", () => {
    expect(formatCreditAmount(5000)).toBe("$5.00");
    expect(formatCreditAmount(1000)).toBe("$1.00");
    expect(formatCreditAmount(0)).toBe("$0.00");
  });
});

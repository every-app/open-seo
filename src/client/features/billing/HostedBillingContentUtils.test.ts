import { describe, expect, it } from "vitest";
import { parseTopUpAmount } from "./HostedBillingContentUtils";

describe("parseTopUpAmount", () => {
  it.each([
    ["10", { isValid: true, parsed: 10 }],
    ["99", { isValid: true, parsed: 99 }],
    ["9", { isValid: false, parsed: 20 }],
    ["100", { isValid: false, parsed: 20 }],
    ["abc", { isValid: false, parsed: 20 }],
  ])("parses %s", (input, expected) => {
    expect(parseTopUpAmount(input)).toEqual(expected);
  });
});

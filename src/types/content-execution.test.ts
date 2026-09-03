import { describe, expect, it } from "vitest";
import { parseContentExecutionStatus } from "./content-execution";

describe("parseContentExecutionStatus", () => {
  it("returns a known execution status", () => {
    expect(parseContentExecutionStatus("writing")).toBe("writing");
  });

  it("rejects an unknown stored or emitted status", () => {
    expect(() => parseContentExecutionStatus("almost_done")).toThrow(
      "Unknown content execution status: almost_done",
    );
  });
});

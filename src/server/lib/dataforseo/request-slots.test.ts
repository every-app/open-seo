import { describe, expect, it } from "vitest";
import { inDataforseoSlot, withDataforseoSlots } from "./request-slots";

describe("inDataforseoSlot", () => {
  it("runs at most four calls at once per request and finishes the rest", async () => {
    let running = 0;
    let peak = 0;
    const call = async (value: number) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return value;
    };

    const results = await withDataforseoSlots(() =>
      Promise.all(
        [1, 2, 3, 4, 5, 6, 7].map((n) => inDataforseoSlot(() => call(n))),
      ),
    );

    expect(results).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(4);
  });
});

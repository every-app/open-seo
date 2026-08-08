import { describe, it, expect, beforeEach, vi } from "vitest";
import { singleFlight, clearSingleFlight } from "./single-flight";

describe("singleFlight", () => {
  beforeEach(() => {
    clearSingleFlight();
    vi.clearAllMocks();
  });

  it("executes the factory for the first call", async () => {
    const factory = vi.fn(async () => "result");
    const result = await singleFlight("key-1", factory);
    expect(result).toBe("result");
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("coalesces 10 concurrent identical requests into one factory call", async () => {
    const factory = vi.fn(async () => {
      // Simulate async work so concurrent callers pile up
      await new Promise((r) => setTimeout(r, 50));
      return "shared-result";
    });

    const promises = Array.from({ length: 10 }, () =>
      singleFlight("same-key", factory),
    );
    const results = await Promise.all(promises);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(10);
    expect(results.every((r) => r === "shared-result")).toBe(true);
  });

  it("clears the inflight entry after completion so a later call re-executes", async () => {
    const factory = vi.fn(async () => "result");
    await singleFlight("key-a", factory);
    await singleFlight("key-a", factory);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("clears the inflight entry even on failure", async () => {
    let attempt = 0;
    const factory = vi.fn(async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("first fails");
      return "second succeeds";
    });

    await expect(singleFlight("key-fail", factory)).rejects.toThrow(
      "first fails",
    );
    const result = await singleFlight("key-fail", factory);
    expect(result).toBe("second succeeds");
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("uses different keys independently", async () => {
    const factoryA = vi.fn(async () => "a");
    const factoryB = vi.fn(async () => "b");
    const [a, b] = await Promise.all([
      singleFlight("key-a", factoryA),
      singleFlight("key-b", factoryB),
    ]);
    expect(a).toBe("a");
    expect(b).toBe("b");
    expect(factoryA).toHaveBeenCalledTimes(1);
    expect(factoryB).toHaveBeenCalledTimes(1);
  });
});
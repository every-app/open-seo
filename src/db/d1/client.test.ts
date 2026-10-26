import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const { env } = vi.hoisted(() => ({ env: {} as Record<string, unknown> }));
vi.mock("cloudflare:workers", () => ({ env }));

import { d1Db } from "./client";

function database() {
  const run = vi.fn(async () => ({ success: true }));
  const prepare = vi.fn(() => ({ bind: () => ({ run }), run }));
  return { prepare, run };
}

afterEach(() => {
  delete env.DB;
});

describe("D1 invocation bindings", () => {
  it("can import before bindings exist, but fails clearly if a query has no binding", () => {
    expect(() => d1Db.select()).toThrow("The D1 binding DB is unavailable");
  });

  it("uses the binding installed after module evaluation", async () => {
    const binding = database();
    env.DB = binding;
    await d1Db.run(sql`SELECT 1`);
    expect(binding.prepare).toHaveBeenCalledWith("SELECT 1");
    expect(binding.run).toHaveBeenCalledOnce();
  });

  it("does not retain another invocation's replaced binding", async () => {
    const first = database();
    const second = database();
    env.DB = first;
    await d1Db.run(sql`SELECT 1`);
    env.DB = second;
    await d1Db.run(sql`SELECT 2`);
    expect(first.prepare).toHaveBeenCalledTimes(1);
    expect(second.prepare).toHaveBeenCalledWith("SELECT 2");
  });
});

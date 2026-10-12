import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonCodec } from "@/shared/json";

describe("jsonCodec", () => {
  const codec = jsonCodec(z.object({ count: z.number() }));

  it("throws when JSON does not match schema", () => {
    expect(() => codec.parse('{"count":"2"}')).toThrowError();
  });
});

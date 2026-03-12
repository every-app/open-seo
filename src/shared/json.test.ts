import { describe, expect, it } from "vitest";
import { z } from "zod";
import { jsonCodec } from "@/shared/json";

describe("jsonCodec", () => {
  const schema = z.object({
    name: z.string(),
    count: z.number().int().nonnegative(),
  });

  const codec = jsonCodec(schema);

  it("parses valid JSON that matches schema", () => {
    const parsed = codec.parse('{"name":"open-seo","count":2}');
    expect(parsed).toEqual({ name: "open-seo", count: 2 });
  });

  it("throws on invalid JSON", () => {
    expect(() => codec.parse('{"name":"open-seo"')).toThrowError();
  });

  it("throws when JSON does not match schema", () => {
    expect(() => codec.parse('{"name":"open-seo","count":"2"}')).toThrowError();
  });

  it("encodes typed values to JSON", () => {
    const encoded = codec.encode({ name: "open-seo", count: 5 });
    expect(encoded).toBe('{"name":"open-seo","count":5}');
  });
});

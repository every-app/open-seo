import { describe, expect, it } from "vitest";
import { z } from "zod";
import { memoizeJsonSchema } from "./json-schema-memo";

const schema = z.object({
  projectId: z.string(),
  limit: z.number().optional(),
});
const options = { target: "draft-2020-12" } as const;

describe("memoizeJsonSchema", () => {
  it("converts to JSON Schema once and returns zod's own result", () => {
    const memo = memoizeJsonSchema(schema);
    const first = memo["~standard"].jsonSchema.input(options);
    expect(memo["~standard"].jsonSchema.input(options)).toBe(first);
    expect(first).toEqual(schema["~standard"].jsonSchema.input(options));
  });
});

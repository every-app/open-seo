import { z } from "zod";

export function jsonCodec<Output>(schema: z.ZodType<Output>) {
  return z.codec(z.string(), schema, {
    decode: (jsonString, context) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString) as unknown;
      } catch {
        context.issues.push({
          code: "custom",
          message: "Invalid JSON",
          input: jsonString,
        });
        return z.NEVER;
      }

      const validated = schema.safeParse(parsed);
      if (!validated.success) {
        context.issues.push({
          code: "custom",
          message: "JSON does not match schema",
          input: jsonString,
        });
        return z.NEVER;
      }

      return validated.data;
    },
    encode: (value) => JSON.stringify(value),
  });
}

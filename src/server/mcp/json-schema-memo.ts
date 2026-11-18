import type { StandardSchemaWithJSON } from "@modelcontextprotocol/server";
import type { z } from "zod";

/**
 * A Standard Schema view of a zod schema whose JSON Schema conversion runs
 * once per direction. Validation still goes through zod.
 *
 * The MCP SDK converts every tool's schema to JSON Schema on registerTool and
 * again on tools/list, and the server is built per request (transport.ts).
 * On the hosted app worker that conversion was ~70% of all allocations under
 * MCP load (heap profile, 2026-10-20), and every exceededMemory outcome that
 * day was on /mcp.
 *
 * The cached JSON reaches every per-request server by reference: the SDK
 * shallow-copies the input root before stamping `type` on it and emits the
 * output root as is, so nested objects are always shared. It only reads them;
 * anything that wrote to them would leak into every later request.
 */
export function memoizeJsonSchema(schema: z.ZodType): StandardSchemaWithJSON {
  const std = schema["~standard"];
  // The SDK always asks for the same target (JSON Schema draft 2020-12), so
  // one result per direction is enough.
  const cache: Partial<Record<"input" | "output", Record<string, unknown>>> =
    {};
  const convert =
    (io: "input" | "output") =>
    (options: Parameters<typeof std.jsonSchema.input>[0]) =>
      (cache[io] ??= std.jsonSchema[io](options));
  return {
    "~standard": {
      ...std,
      jsonSchema: { input: convert("input"), output: convert("output") },
    },
  };
}

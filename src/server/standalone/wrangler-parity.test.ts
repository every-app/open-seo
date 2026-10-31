import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, test } from "vitest";
import { z } from "zod";

const configSchema = z.object({
  workflows: z.array(z.object({ binding: z.string(), class_name: z.string() })),
  durable_objects: z.object({
    bindings: z.array(z.object({ name: z.string(), class_name: z.string() })),
  }),
});
type Config = z.infer<typeof configSchema>;

// typescript's JSON reader accepts the comments and trailing commas in .jsonc.
function readConfig(path: string): Config {
  const parsed = ts.parseConfigFileTextToJson(path, readFileSync(path, "utf8"));
  return configSchema.parse(parsed.config);
}

function bindings(config: Config) {
  return [
    ...config.workflows.map((w) => `${w.binding}:${w.class_name}`),
    ...config.durable_objects.bindings.map((d) => `${d.name}:${d.class_name}`),
  ];
}

// The Docker edition is built from wrangler.standalone.json. A workflow or
// object added only to wrangler.jsonc leaves its binding undefined on Docker,
// as LOCAL_RANK_WORKFLOW was when Local SEO shipped.
test("the Docker edition declares every workflow and object hosted has", () => {
  const standalone = bindings(readConfig("wrangler.standalone.json"));
  for (const binding of bindings(readConfig("wrangler.jsonc")))
    expect(standalone).toContain(binding);
});

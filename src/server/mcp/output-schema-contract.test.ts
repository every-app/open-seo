import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { describe, expect, it, vi } from "vitest";
import { createWorkersOAuthMcpProps } from "./context";
import { createOpenSeoMcpServer } from "./server";

vi.mock("cloudflare:workers", () => ({
  env: {},
  waitUntil: vi.fn(),
  DurableObject: class {
    readonly ctx = null;
  },
}));

// Walk schema keywords, not arbitrary JSON: examples/defaults and property
// names can contain the same words without imposing a schema constraint.
function closedOutputPaths(schema: unknown, path: string): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  const failures: string[] = [];
  const entries: [string, unknown][] = Object.entries(schema);
  for (const [key, value] of entries) {
    if (
      (key === "additionalProperties" || key === "unevaluatedProperties") &&
      value === false
    ) {
      failures.push(`${path}.${key}`);
    }
    if (
      [
        "properties",
        "patternProperties",
        "$defs",
        "definitions",
        "dependentSchemas",
      ].includes(key) &&
      typeof value === "object" &&
      value !== null
    ) {
      for (const [name, child] of Object.entries(value)) {
        failures.push(...closedOutputPaths(child, `${path}.${key}.${name}`));
      }
    } else if (
      [
        "items",
        "prefixItems",
        "anyOf",
        "oneOf",
        "allOf",
        "contains",
        "additionalProperties",
        "unevaluatedProperties",
        "not",
        "if",
        "then",
        "else",
        "propertyNames",
      ].includes(key)
    ) {
      const children = Array.isArray(value) ? value : [value];
      children.forEach((child, index) => {
        failures.push(...closedOutputPaths(child, `${path}.${key}[${index}]`));
      });
    }
  }
  return failures;
}

describe("published MCP output schemas", () => {
  it("allows added fields in every registered tool, including nested objects", async () => {
    const server = createOpenSeoMcpServer(
      createWorkersOAuthMcpProps({
        userId: "user_test",
        userEmail: "test@example.com",
        organizationId: "org_test",
        baseUrl: "https://open-seo.test",
        clientId: "client_test",
        scopes: ["mcp"],
      }),
    );
    const client = new Client({ name: "output-schema-contract", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await server.connect(serverTransport);
      await client.connect(clientTransport);
      const { tools } = await client.listTools();
      expect(tools.length).toBeGreaterThan(0);
      const failures = tools.flatMap((tool) => {
        expect(
          tool.outputSchema,
          `${tool.name} must publish an output schema`,
        ).toBeDefined();
        return closedOutputPaths(tool.outputSchema, tool.name);
      });
      expect(
        failures,
        "Use z.looseObject() or .passthrough() for these MCP output objects; cached clients must accept added fields.",
      ).toEqual([]);
    } finally {
      await client.close();
      await server.close();
    }
  });

  it("finds constraints inside arrays, unions, and referenced definitions", () => {
    expect(
      closedOutputPaths(
        {
          properties: {
            rows: {
              items: { anyOf: [{ $ref: "#/$defs/row" }, { type: "null" }] },
            },
          },
          $defs: { row: { type: "object", additionalProperties: false } },
          allOf: [{ unevaluatedProperties: false }],
        },
        "tool",
      ),
    ).toEqual([
      "tool.$defs.row.additionalProperties",
      "tool.allOf[0].unevaluatedProperties",
    ]);
    expect(
      closedOutputPaths(
        {
          properties: {
            rows: {
              items: {
                anyOf: [
                  { type: "object", additionalProperties: false },
                  { type: "null" },
                ],
              },
            },
          },
        },
        "tool",
      ),
    ).toEqual(["tool.properties.rows.items[0].anyOf[0].additionalProperties"]);
  });
});

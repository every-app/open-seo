import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolExtra } from "@/server/mcp/context";
import { MCP_AUTH_CONTEXT_PROP } from "@/server/mcp/context";

const mocks = vi.hoisted(() => ({
  getProjectForOrganization: vi.fn(),
  readPageHtml: vi.fn(),
}));

vi.mock("cloudflare:workers", () => ({ env: {} }));
vi.mock("@/server/features/projects/services/ProjectService", () => ({
  ProjectService: {
    getProjectForOrganization: mocks.getProjectForOrganization,
  },
}));
vi.mock("@/server/lib/scrape", () => ({
  readPageHtml: mocks.readPageHtml,
}));

const authContext = {
  userId: "user_123",
  userEmail: "alice@example.com",
  organizationId: "org_123",
  clientId: "client_123",
  scopes: ["mcp"],
  audience: "https://open-seo.test/mcp",
  subject: "user_123",
  baseUrl: "https://open-seo.test",
};

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
  authInfo: {
    token: "token",
    clientId: "client_123",
    scopes: ["mcp"],
    resource: new URL("https://open-seo.test/mcp"),
    extra: { [MCP_AUTH_CONTEXT_PROP]: authContext },
  } satisfies AuthInfo,
};

/** Narrow the tool's content union down to its leading text block. */
function toolText(result: { content: readonly unknown[] }): string {
  const first = result.content[0];
  return first &&
    typeof first === "object" &&
    "text" in first &&
    typeof first.text === "string"
    ? first.text
    : "";
}

const { validateStructuredDataTool } =
  await import("@/server/mcp/tools/structured-data-tools");

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

const RECIPE = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Pavlova",
});

async function callTool(args: {
  projectId?: string;
  markup?: string;
  url?: string;
}) {
  return await validateStructuredDataTool.handler(
    { projectId: PROJECT_ID, ...args },
    toolExtra,
  );
}

describe("validate_structured_data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProjectForOrganization.mockResolvedValue({
      id: PROJECT_ID,
      name: "Example",
      domain: "example.com",
    });
  });

  it("validates supplied markup without any network call", async () => {
    const result = await callTool({ markup: RECIPE });

    expect(mocks.readPageHtml).not.toHaveBeenCalled();
    const text = toolText(result);
    expect(text).toContain("supplied markup");
    expect(text).toContain("Recipe");
    expect(text).toMatch(/missing required: image/);
    expect(result.structuredContent).toMatchObject({
      ok: true,
      source: "supplied markup",
      errorCount: 1,
    });
  });

  it("names the schema.org version it validated against", async () => {
    const result = await callTool({ markup: RECIPE });
    expect(toolText(result)).toMatch(/Schema\.org \d+\.\d+/);
  });

  it("says the verdict is advisory and points at Search Console", async () => {
    const text = toolText(await callTool({ markup: RECIPE }));
    expect(text).toContain("Advisory");
    expect(text).toContain("inspect_urls");
  });

  it("names an unchecked type as this validator's gap, not a pass", async () => {
    const result = await callTool({
      markup: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Person",
        name: "Jane",
      }),
    });

    expect(toolText(result)).toContain(
      "not checked — recognised, but Google feature validation is not implemented here: Person",
    );
    expect(toolText(result)).toContain("This is not a pass");
    // Also in structuredContent: a caller diffing `types` against `features`
    // would otherwise have to read the omission as a pass.
    expect(result.structuredContent?.notChecked).toEqual(["Person"]);
  });

  it("fetches and validates a live URL", async () => {
    mocks.readPageHtml.mockResolvedValue(
      `<html><head><script type="application/ld+json">${RECIPE}</script></head><body></body></html>`,
    );

    const result = await callTool({ url: "https://example.com/pavlova" });

    expect(mocks.readPageHtml).toHaveBeenCalledWith(
      "https://example.com/pavlova",
    );
    expect(result.structuredContent).toMatchObject({
      ok: true,
      source: "https://example.com/pavlova",
      scriptCount: 1,
    });
  });

  it("explains a failed fetch rather than reporting clean markup", async () => {
    mocks.readPageHtml.mockResolvedValue(null);

    const result = await callTool({ url: "https://example.com/blocked" });

    expect(toolText(result)).toContain("Could not read");
    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "fetch_failed",
    });
  });

  it("says so when a page carries no JSON-LD at all", async () => {
    mocks.readPageHtml.mockResolvedValue("<html><body>nothing</body></html>");

    const result = await callTool({ url: "https://example.com/bare" });

    expect(toolText(result)).toContain("no JSON-LD found");
    expect(result.structuredContent).toMatchObject({
      ok: true,
      scriptCount: 0,
    });
  });

  it("requires one of markup or url", async () => {
    const result = await callTool({});
    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "no_input",
    });
  });

  it("refuses both at once", async () => {
    const result = await callTool({
      markup: RECIPE,
      url: "https://example.com/",
    });
    expect(result.structuredContent).toMatchObject({
      ok: false,
      reason: "ambiguous_input",
    });
    expect(mocks.readPageHtml).not.toHaveBeenCalled();
  });
});

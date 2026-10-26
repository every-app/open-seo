import { describe, expect, it } from "vitest";
import { supportsMcpApps } from "./ui-capabilities";

const apps = {
  extensions: {
    "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] },
  },
};

function post(method: string, params: unknown) {
  return new Request("https://open-seo.test/mcp", {
    method: "POST",
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

describe("supportsMcpApps", () => {
  it("enables widgets when the request advertises MCP Apps support", async () => {
    await expect(
      supportsMcpApps(
        post("tools/list", {
          _meta: { "io.modelcontextprotocol/clientCapabilities": apps },
        }),
      ),
    ).resolves.toBe(true);
  });

  // Stateless serving never sees a later request's initialize capabilities.
  it("ignores capabilities sent only in a legacy initialize request", async () => {
    await expect(
      supportsMcpApps(post("initialize", { capabilities: apps })),
    ).resolves.toBe(false);
  });
});

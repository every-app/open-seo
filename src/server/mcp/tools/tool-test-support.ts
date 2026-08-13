import type { ToolAuthContext, ToolContext } from "@/server/mcp/context";

export function makeToolContext(
  overrides: Partial<ToolAuthContext> = {},
): ToolContext {
  return {
    auth: {
      userId: "user_123",
      userEmail: "alice@example.com",
      organizationId: "org_123",
      clientId: "client_123",
      scopes: ["mcp"],
      baseUrl: "https://open-seo.test",
      ...overrides,
    },
  };
}

export function textContent(result: {
  content?: Array<{ type: string; text?: string }>;
}) {
  const first = result.content?.[0];
  return first?.type === "text" ? (first.text ?? "") : "";
}

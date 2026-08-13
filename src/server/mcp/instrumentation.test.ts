import type { CallToolResult } from "@modelcontextprotocol/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { instrumentMcpToolHandler } from "./instrumentation";
import { type ToolAuthContext, type ToolContext } from "@/server/mcp/context";
import { AppError } from "@/server/lib/errors";

const mocks = vi.hoisted(() => ({
  captureServerError: vi.fn(),
  captureServerEvent: vi.fn(),
  recordExternalMcpToolCall: vi.fn(),
  incrementSelfHostMcpToolCallCount: vi.fn(),
}));

// waitUntil runs the capture promise inline so assertions see the call.
vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => void promise,
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerError: mocks.captureServerError,
  captureServerEvent: mocks.captureServerEvent,
}));

// The real module pulls in @/db (cloudflare:workers env) — mock it out and
// assert the milestone hook at this boundary instead.
vi.mock("@/server/features/activation/mcpActivation", () => ({
  recordExternalMcpToolCall: mocks.recordExternalMcpToolCall,
}));

vi.mock("@/server/lib/self-host-telemetry", () => ({
  incrementSelfHostMcpToolCallCount: mocks.incrementSelfHostMcpToolCallCount,
}));

const outputSchema = z.object({
  items: z.array(z.object({}).passthrough()),
});

function okResult(structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: "ok" }], structuredContent };
}

const authContext: ToolAuthContext = {
  userId: "user-1",
  userEmail: "user@example.com",
  organizationId: "org-1",
  clientId: "client-1",
  scopes: ["mcp"],
  baseUrl: "https://app.openseo.so",
};

const toolContext: ToolContext = { auth: authContext };

describe("instrumentMcpToolHandler", () => {
  beforeEach(() => {
    mocks.captureServerError.mockReset();
    mocks.captureServerEvent.mockReset();
    mocks.recordExternalMcpToolCall.mockReset();
    mocks.incrementSelfHostMcpToolCallCount.mockReset();
  });

  it("passes a valid result through without reporting", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: [{ domain: "example.com" }] }),
    );

    const result = await wrapped({}, toolContext);

    expect(result.structuredContent).toEqual({
      items: [{ domain: "example.com" }],
    });
    expect(mocks.captureServerError).not.toHaveBeenCalled();
  });

  it("reports an output schema mismatch the SDK would silently reject", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: "not-an-array" }),
    );

    await wrapped({}, toolContext);

    expect(mocks.captureServerError).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerError.mock.calls[0][1]).toMatchObject({
      errorCode: "MCP_OUTPUT_VALIDATION",
      tool: "demo",
    });
  });

  it("reports and rethrows a reportable handler error", async () => {
    const boom = new Error("upstream exploded");
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () => {
      throw boom;
    });

    await expect(wrapped({}, toolContext)).rejects.toThrow("upstream exploded");
    expect(mocks.captureServerError).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerError.mock.calls[0][0]).toBe(boom);
  });

  it("rethrows expected errors without reporting them", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () => {
      throw new AppError("NOT_FOUND");
    });

    await expect(wrapped({}, toolContext)).rejects.toThrow("NOT_FOUND");
    expect(mocks.captureServerError).not.toHaveBeenCalled();
  });

  it("captures a usage event for every call", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: [] }),
    );

    await wrapped({}, toolContext);

    expect(mocks.captureServerEvent).toHaveBeenCalledTimes(1);
    expect(mocks.incrementSelfHostMcpToolCallCount).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerEvent.mock.calls[0][0]).toMatchObject({
      distinctId: "user-1",
      event: "mcp:tool_call",
      organizationId: "org-1",
      properties: {
        tool: "demo",
        success: true,
        client_id: "client-1",
        source: "mcp_client",
      },
    });
  });

  it("marks schema-rejected results as failed usage", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: "not-an-array" }),
    );

    await wrapped({}, toolContext);

    expect(mocks.captureServerEvent.mock.calls[0][0]).toMatchObject({
      event: "mcp:tool_call",
      properties: { success: false, error_code: "MCP_OUTPUT_VALIDATION" },
    });
  });

  it("marks a structured tool error as failed usage without recording activation", async () => {
    const schema = z.object({
      status: z.enum(["ok", "error"]),
      error: z.object({ code: z.string() }).optional(),
    });
    const wrapped = instrumentMcpToolHandler("demo", schema, async () =>
      okResult({ status: "error", error: { code: "ga4_not_connected" } }),
    );

    await wrapped({}, toolContext);

    expect(mocks.captureServerEvent.mock.calls[0][0]).toMatchObject({
      event: "mcp:tool_call",
      properties: { success: false, error_code: "ga4_not_connected" },
    });
    expect(mocks.recordExternalMcpToolCall).not.toHaveBeenCalled();
  });

  it("marks an ok-false tool result as failed usage", async () => {
    const schema = z.object({
      ok: z.boolean(),
      reason: z.string().optional(),
    });
    const wrapped = instrumentMcpToolHandler("demo", schema, async () =>
      okResult({ ok: false, reason: "audit_not_ready" }),
    );

    await wrapped({}, toolContext);

    expect(mocks.captureServerEvent.mock.calls[0][0]).toMatchObject({
      event: "mcp:tool_call",
      properties: { success: false, error_code: "audit_not_ready" },
    });
    expect(mocks.recordExternalMcpToolCall).not.toHaveBeenCalled();
  });

  it("captures a failed usage event with the error code", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () => {
      throw new AppError("NOT_FOUND");
    });

    await expect(wrapped({}, toolContext)).rejects.toThrow("NOT_FOUND");

    expect(mocks.captureServerEvent.mock.calls[0][0]).toMatchObject({
      event: "mcp:tool_call",
      properties: { success: false, error_code: "NOT_FOUND" },
    });
  });

  it("records the activation milestone for a successful external call", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: [] }),
    );

    await wrapped({}, toolContext);

    expect(mocks.recordExternalMcpToolCall).toHaveBeenCalledExactlyOnceWith(
      "org-1",
    );
  });

  it("skips the activation milestone for first-party (null clientId) calls", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: [] }),
    );

    await wrapped({}, { auth: { ...authContext, clientId: null } });

    expect(mocks.recordExternalMcpToolCall).not.toHaveBeenCalled();
  });

  it("skips the activation milestone when the call fails", async () => {
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () => {
      throw new AppError("NOT_FOUND");
    });

    await expect(wrapped({}, toolContext)).rejects.toThrow("NOT_FOUND");

    expect(mocks.recordExternalMcpToolCall).not.toHaveBeenCalled();
  });
});

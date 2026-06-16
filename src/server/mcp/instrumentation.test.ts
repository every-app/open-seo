import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolExtra } from "@/server/mcp/context";
import { AppError } from "@/server/lib/errors";

const mocks = vi.hoisted(() => ({
  captureServerError: vi.fn(),
}));

// waitUntil runs the capture promise inline so assertions see the call.
vi.mock("cloudflare:workers", () => ({
  waitUntil: (promise: Promise<unknown>) => void promise,
}));

vi.mock("@/server/lib/posthog", () => ({
  captureServerError: mocks.captureServerError,
}));

const toolExtra: ToolExtra = {
  signal: new AbortController().signal,
  requestId: 1,
  sendNotification: vi.fn(),
  sendRequest: vi.fn(),
};

const outputSchema = { items: z.array(z.object({}).passthrough()) };

function okResult(structuredContent: Record<string, unknown>): CallToolResult {
  return { content: [{ type: "text", text: "ok" }], structuredContent };
}

describe("instrumentMcpToolHandler", () => {
  beforeEach(() => {
    mocks.captureServerError.mockReset();
  });

  it("passes a valid result through without reporting", async () => {
    const { instrumentMcpToolHandler } = await import("./instrumentation");
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: [{ domain: "example.com" }] }),
    );

    const result = await wrapped({}, toolExtra);

    expect(result.structuredContent).toEqual({
      items: [{ domain: "example.com" }],
    });
    expect(mocks.captureServerError).not.toHaveBeenCalled();
  });

  it("reports an output schema mismatch the SDK would silently reject", async () => {
    const { instrumentMcpToolHandler } = await import("./instrumentation");
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () =>
      okResult({ items: "not-an-array" }),
    );

    await wrapped({}, toolExtra);

    expect(mocks.captureServerError).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerError.mock.calls[0][1]).toMatchObject({
      errorCode: "MCP_OUTPUT_VALIDATION",
      tool: "demo",
    });
  });

  it("reports and rethrows a reportable handler error", async () => {
    const { instrumentMcpToolHandler } = await import("./instrumentation");
    const boom = new Error("upstream exploded");
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () => {
      throw boom;
    });

    await expect(wrapped({}, toolExtra)).rejects.toThrow("upstream exploded");
    expect(mocks.captureServerError).toHaveBeenCalledTimes(1);
    expect(mocks.captureServerError.mock.calls[0][0]).toBe(boom);
  });

  it("rethrows expected errors without reporting them", async () => {
    const { instrumentMcpToolHandler } = await import("./instrumentation");
    const wrapped = instrumentMcpToolHandler("demo", outputSchema, async () => {
      throw new AppError("NOT_FOUND");
    });

    await expect(wrapped({}, toolExtra)).rejects.toThrow("NOT_FOUND");
    expect(mocks.captureServerError).not.toHaveBeenCalled();
  });
});

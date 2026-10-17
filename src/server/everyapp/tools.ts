import {
  ToolError,
  defineTools,
  everyApp,
  toolResult,
  type EveryAppUser,
  type ToolDefinition,
  type ToolRisk,
} from "@every-app/sdk/server";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { resolveEveryAppUserContext } from "@/middleware/ensure-user/everyApp";
import { asAppError } from "@/server/lib/errors";
import {
  forOrganization,
  serveEveryAppRequest,
} from "@/server/lib/gateway-attribution";
import type { ToolContext } from "@/server/mcp/context";
import { instrumentMcpToolHandler } from "@/server/mcp/instrumentation";
import { objectSchema } from "@/server/mcp/output-schemas";
import {
  registerOpenSeoTools,
  type OpenSeoToolDefinition,
  type ToolArgs,
  type ToolSchema,
} from "@/server/mcp/server";

// OpenSEO's MCP tools, served by the Every App gateway: its one MCP
// connector lists them as `openseo_<tool>` beside every other app's, and this
// app's own host serves them under their names. The gateway signs in the
// person, applies the connection's read-only or read-write choice, and calls
// a tool here with a verified identity; OpenSEO never speaks MCP for it.

const INSTRUCTIONS =
  "OpenSEO's research tools call DataForSEO, which bills this organization's DataForSEO account per request through the gateway. Start with list_projects: most tools take a projectId. Ask before planned batches of more than a few hundred keywords or pages.";

/**
 * The gateway's three risks. Deleting saved work is destructive, which the
 * gateway keeps from AI clients until approvals exist. OpenSEO marks every
 * write that replaces content destructive for MCP clients (saving a report
 * over another), but those stay usable here as writes.
 */
function riskOf(tool: OpenSeoToolDefinition<ToolSchema>): ToolRisk {
  if (tool.config.annotations?.readOnlyHint) return "read";
  return /^(delete|remove)_/.test(tool.name) ? "destructive" : "write";
}

function toolContext(user: EveryAppUser, request: Request) {
  return resolveEveryAppUserContext(user).then(
    (context): ToolContext => ({
      auth: {
        userId: context.userId,
        userEmail: context.userEmail,
        organizationId: context.organizationId,
        role: context.role,
        // The signed identity names one organization per call; "pinned" keeps
        // every tool on it and off member rows, which never authorize here.
        orgScope: "pinned",
        scopes: user.scopes,
        // The gateway's connection (`oauth:…`, `pat:…`): an external client.
        clientId: user.actor.sub,
        // The gateway calls the app on its public host.
        baseUrl: new URL(request.url).origin,
        clientLabel: "Every App",
      },
    }),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(result: CallToolResult): string {
  return result.content
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n\n");
}

function everyAppTool<Input extends ToolSchema>(
  tool: OpenSeoToolDefinition<Input>,
): ToolDefinition {
  const output = objectSchema(tool.config.outputSchema);
  const handler = instrumentMcpToolHandler(tool.name, output, tool.handler);
  return {
    title: tool.config.title,
    description: tool.config.description ?? tool.name,
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- riskOf reads only the name and annotations, which don't depend on Input
    risk: riskOf(tool as unknown as OpenSeoToolDefinition<ToolSchema>),
    idempotent: tool.config.annotations?.idempotentHint,
    openWorld: tool.config.annotations?.openWorldHint,
    input: objectSchema(tool.config.inputSchema),
    output,
    handler: async (args, { user, request }) => {
      let result: CallToolResult;
      try {
        // The tool's gateway calls forward the call's identity, and are its
        // organization's (gateway-attribution.ts).
        result = await serveEveryAppRequest(request, user, async () => {
          const context = await toolContext(user, request);
          return forOrganization(context.auth.organizationId, () =>
            handler(
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the SDK validated args against this tool's own inputSchema before calling
              args as ToolArgs<Input>,
              context,
            ),
          );
        });
      } catch (error) {
        // What OpenSEO's MCP server shows an agent; anything else stays a
        // masked internal error with a reference.
        const appError = asAppError(error);
        if (appError) throw new ToolError(appError.message);
        throw error;
      }
      const text = textOf(result);
      if (result.isError) throw new ToolError(text || "The tool failed.");
      const structured = result.structuredContent;
      return isRecord(structured) ? toolResult({ text, structured }) : text;
    },
  };
}

function openSeoToolSet() {
  const tools: Record<string, ToolDefinition> = {};
  registerOpenSeoTools((tool) => {
    tools[tool.name] = everyAppTool(tool);
  });
  return defineTools(tools, { instructions: INSTRUCTIONS });
}

/**
 * Answers the gateway's tools contract (`/__everyapp/tools/*`): the catalog
 * at deploy, and each call. Loaded on the first tools request only, like the
 * MCP stack in the other modes.
 */
export const everyAppTools = everyApp<Env>(
  () => new Response("Not found", { status: 404 }),
  { tools: openSeoToolSet() },
);

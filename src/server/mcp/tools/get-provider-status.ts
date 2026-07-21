import { z } from "zod";
import { mcpResponse } from "@/server/mcp/formatters";
import { getAuth, type ToolExtra } from "@/server/mcp/context";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { getProviderStatusSummary } from "@/server/lib/provider-status";

const providerStatusItemSchema = z.object({
  provider: z.enum(["dataforseo", "google_search_console", "site_audit"]),
  kind: z.enum(["paid", "first_party", "local"]),
  configured: z.boolean(),
  enabled: z.boolean(),
  reason: z.string().nullable(),
  notes: z.array(z.string()).optional(),
  budgetUsd: z.number().optional(),
  hasApiKey: z.boolean().optional(),
});

export const getProviderStatusTool = {
  name: "get_provider_status",
  config: {
    title: "Get provider status",
    description:
      "Returns the current status of the OpenSEO providers this deployment depends on, including whether paid DataForSEO is enabled, whether Search Console OAuth is configured, and whether local site audit capability is available. Read-only and cost-free.",
    inputSchema: {} as Record<string, never>,
    outputSchema: {
      mode: z.enum(["hosted", "self-hosted"]),
      providers: z.array(providerStatusItemSchema),
      ...optionalMetaOutputSchema,
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (_args: Record<string, never>, extra: ToolExtra) => {
    const auth = getAuth(extra);
    const summary = await getProviderStatusSummary();
    const lines = [
      `Mode: ${summary.mode}`,
      ...summary.providers.map((provider) => {
        const status = provider.configured ? "configured" : "not configured";
        const enabled = provider.enabled ? "enabled" : "disabled";
        const budget =
          provider.provider === "dataforseo"
            ? `, budget ${provider.budgetUsd?.toFixed(2) ?? "0.00"} USD`
            : "";
        const reason = provider.reason ? ` — ${provider.reason}` : "";
        return `- ${provider.provider}: ${status}, ${enabled}${budget}${reason}`;
      }),
    ];

    return mcpResponse({
      text: lines.join("\n"),
      meta: { organizationId: auth.organizationId },
      structuredContent: {
        mode: summary.mode,
        providers: summary.providers,
      },
    });
  },
};

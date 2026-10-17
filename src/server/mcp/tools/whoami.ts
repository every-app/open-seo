import {
  getOrCreateOrganizationCustomer,
  getUsageCreditsRemaining,
} from "@/server/billing/subscription";
import { mcpResponse } from "@/server/mcp/formatters";
import { type ToolContext } from "@/server/mcp/context";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";
import {
  deploymentTierLabel,
  getDeploymentTier,
  isEveryAppTier,
} from "@/server/lib/deployment-tier";
import { optionalMetaOutputSchema } from "@/server/mcp/output-schemas";
import { z } from "zod";

export const whoamiTool = {
  name: "whoami",
  config: {
    title: "Who am I",
    description:
      "Confirms the connected OpenSEO account, server mode, token scopes, and current credit balance when the user asks to check their account or connection. Initializes billing for new hosted accounts. Uses no credits — does not call DataForSEO. Returns creditsRemaining: null when the balance is unavailable.",
    inputSchema: {} as Record<string, never>,
    outputSchema: z.looseObject({
      userEmail: z.string(),
      scopes: z.array(z.string()),
      mode: z.enum(["hosted", "self-hosted", "every-app"]),
      // Behind an Every App gateway only: first_party or fork.
      deploymentTier: z.enum(["first_party", "fork"]).optional(),
      creditsRemaining: z.number().nullable(),
      ...optionalMetaOutputSchema,
    }),
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
      openWorldHint: false,
      destructiveHint: false,
    },
  },
  handler: async (_args: Record<string, never>, context: ToolContext) => {
    const auth = context.auth;
    const isHosted = await isHostedServerAuthMode();
    let creditsRemaining: number | null = null;
    if (isHosted) {
      try {
        const customer = await getOrCreateOrganizationCustomer(auth);
        const { monthlyRemaining, topupRemaining } =
          await getUsageCreditsRemaining(customer.id);
        creditsRemaining = monthlyRemaining + topupRemaining;
      } catch {
        // Account identity is still available when billing is unavailable.
      }
    }
    const tier = isHosted ? "hosted" : await getDeploymentTier();
    const everyAppTier = isEveryAppTier(tier) ? tier : undefined;
    const lines = [
      `Account: ${auth.userEmail}`,
      `Mode: ${deploymentTierLabel(tier)}`,
      `Scopes: ${auth.scopes.length > 0 ? auth.scopes.join(", ") : "none"}`,
    ];
    if (isHosted) {
      lines.push(
        `Credits remaining: ${creditsRemaining != null ? creditsRemaining.toLocaleString() : "unknown"}`,
      );
    }
    return mcpResponse({
      text: lines.join("\n"),
      meta: {
        creditsRemaining: creditsRemaining ?? undefined,
      },
      structuredContent: {
        userEmail: auth.userEmail,
        scopes: auth.scopes,
        mode: isHosted ? "hosted" : everyAppTier ? "every-app" : "self-hosted",
        ...(everyAppTier ? { deploymentTier: everyAppTier } : {}),
        creditsRemaining,
      },
    });
  },
};

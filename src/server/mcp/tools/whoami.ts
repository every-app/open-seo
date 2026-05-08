import { autumn } from "@/server/billing/autumn";
import {
  AUTUMN_SEO_DATA_BALANCE_FEATURE_ID,
  AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
} from "@/shared/billing";
import { mcpResponse } from "@/server/mcp/formatters";
import { getAuth, type ToolExtra } from "@/server/mcp/context";
import { isHostedServerAuthMode } from "@/server/lib/runtime-env";

async function checkBalance(featureId: string, customerId: string) {
  try {
    const result = await autumn.check({ customerId, featureId });
    return result.balance?.remaining ?? null;
  } catch {
    return null;
  }
}

export const whoamiTool = {
  name: "whoami",
  config: {
    title: "Who am I",
    description:
      "Returns the authenticated user, organization, server mode, token scopes, and current credit balance. Free — does not call DataForSEO. Use this first to confirm connection context before choosing a project or running paid tools.",
    inputSchema: {} as Record<string, never>,
  },
  handler: async (_args: Record<string, never>, extra: ToolExtra) => {
    const auth = getAuth(extra);
    const isHosted = await isHostedServerAuthMode();
    let creditsRemaining: number | null = null;
    if (isHosted) {
      const [base, topup] = await Promise.all([
        checkBalance(AUTUMN_SEO_DATA_BALANCE_FEATURE_ID, auth.organizationId),
        checkBalance(
          AUTUMN_SEO_DATA_TOPUP_BALANCE_FEATURE_ID,
          auth.organizationId,
        ),
      ]);
      creditsRemaining = (base ?? 0) + (topup ?? 0);
    }
    const lines = [
      `User: ${auth.userId} (${auth.userEmail})`,
      `Organization: ${auth.organizationId}`,
      `Mode: ${isHosted ? "hosted" : "self-hosted"}`,
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
        organizationId: auth.organizationId,
        creditsRemaining: creditsRemaining ?? undefined,
      },
      structuredContent: {
        userId: auth.userId,
        userEmail: auth.userEmail,
        organizationId: auth.organizationId,
        scopes: auth.scopes,
        mode: isHosted ? "hosted" : "self-hosted",
        creditsRemaining,
      },
    });
  },
};

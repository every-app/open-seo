import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { AppError } from "@/server/lib/errors";
import { buildBillingCustomer, type ToolContext } from "@/server/mcp/context";

type ProjectScopedArgs = {
  projectId: string;
};

async function requireProjectAccess(
  toolContext: ToolContext,
  projectId: string,
) {
  const { baseUrl, ...auth } = toolContext.auth;

  // Authorize the caller-supplied projectId against the token's organization.
  // Assert on the result instead of relying on the lookup throwing, so this
  // stays a hard gate even if the service's error behavior ever changes.
  const project = await ProjectService.getProjectForOrganization(
    auth.organizationId,
    projectId,
  );
  if (!project) {
    throw new AppError("FORBIDDEN");
  }

  return {
    auth,
    baseUrl,
    billing: buildBillingCustomer(auth, projectId),
    // The row is already fetched for the auth gate; exposing it lets tools
    // fall back to the project's default market without another query.
    project,
  };
}

type McpProjectAuthContext = Awaited<ReturnType<typeof requireProjectAccess>>;

export function withMcpProjectAuth<TArgs extends ProjectScopedArgs, TResult>(
  handler: (
    args: TArgs,
    context: McpProjectAuthContext,
  ) => Promise<TResult> | TResult,
) {
  return async (args: TArgs, toolContext: ToolContext) => {
    const context = await requireProjectAccess(toolContext, args.projectId);
    return handler(args, context);
  };
}

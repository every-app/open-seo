import { ProjectService } from "@/server/features/projects/services/ProjectService";
import {
  buildBillingCustomer,
  requireMcpToolAuthContext,
  type ToolExtra,
} from "@/server/mcp/context";

type ProjectScopedArgs = {
  projectId: string;
};

async function requireProjectAccess(_extra: ToolExtra, projectId: string) {
  const { baseUrl, ...auth } = requireMcpToolAuthContext(_extra);

  // This lookup enforces that the project belongs to the authenticated org.
  await ProjectService.getProjectForOrganization(
    auth.organizationId,
    projectId,
  );

  return {
    auth,
    baseUrl,
    billing: buildBillingCustomer(auth, projectId),
  };
}

type McpProjectAuthContext = Awaited<ReturnType<typeof requireProjectAccess>>;

export function withMcpProjectAuth<TArgs extends ProjectScopedArgs, TResult>(
  handler: (
    args: TArgs,
    context: McpProjectAuthContext,
  ) => Promise<TResult> | TResult,
) {
  return async (args: TArgs, extra: ToolExtra) => {
    const context = await requireProjectAccess(extra, args.projectId);
    return handler(args, context);
  };
}

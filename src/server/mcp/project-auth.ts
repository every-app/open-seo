import { ProjectService } from "@/server/features/projects/services/ProjectService";
import { AppError } from "@/server/lib/errors";
import {
  buildBillingCustomer,
  requireMcpToolAuthContext,
  type ToolExtra,
} from "@/server/mcp/context";
import { getLanguageCode } from "@/shared/keyword-locations";

/**
 * Resolves a tool call's market against the project's default. The pair is
 * resolved together: overriding only the location snaps the language to that
 * location's default language, because the project's language was chosen for
 * the project's own location and may not be valid — or sensible — for the
 * override (e.g. a Vietnam project querying Germany must not default to
 * Vietnamese).
 */
export function resolveRequestMarket(
  args: { locationCode?: number; languageCode?: string },
  project: { locationCode: number; languageCode: string },
): { locationCode: number; languageCode: string } {
  const locationCode = args.locationCode ?? project.locationCode;
  const languageCode =
    args.languageCode ??
    (locationCode === project.locationCode
      ? project.languageCode
      : getLanguageCode(locationCode));
  return { locationCode, languageCode };
}

type ProjectScopedArgs = {
  projectId: string;
};

async function requireProjectAccess(extra: ToolExtra, projectId: string) {
  const { baseUrl, ...auth } = requireMcpToolAuthContext(extra);

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
  return async (args: TArgs, extra: ToolExtra) => {
    const context = await requireProjectAccess(extra, args.projectId);
    return handler(args, context);
  };
}

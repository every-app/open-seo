import {
  hasOrgPermission,
  type OrgPermissionRequest,
} from "@/lib/org-permissions";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { AppError } from "@/server/lib/errors";

// Server-side org-role gate for app resources (billing/project/integration).
// Zero-I/O: the role was already resolved from the member row by ensure-user.
export function requireOrgPermission(
  context: Pick<EnsuredUserContext, "role">,
  permissions: OrgPermissionRequest,
) {
  if (!hasOrgPermission(context.role, permissions)) {
    throw new AppError(
      "FORBIDDEN",
      "Your organization role does not allow this action.",
    );
  }
}

import type { OrgPermissionRequest } from "@/lib/org-permissions";
import type { EnsuredUserContext } from "@/middleware/ensure-user/types";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { AuthRepository } from "@/server/auth/repositories/AuthRepository";
import { AppError } from "@/server/lib/errors";

// billing:manage is the owner-only statement.
const OWNER_PERMISSION: OrgPermissionRequest = { billing: ["manage"] };

// Hands the organization to another existing member: they become the owner
// (and so the only one who can manage billing), and the caller stays on as an
// admin. Projects, data, and the Autumn customer are keyed by organization,
// so nothing else moves.
export async function transferOrganizationOwnership(
  context: Pick<EnsuredUserContext, "userId" | "organizationId" | "role">,
  newOwnerMemberId: string,
) {
  requireOrgPermission(context, OWNER_PERMISSION);

  const newOwner = await AuthRepository.getMemberInOrganization(
    newOwnerMemberId,
    context.organizationId,
  );
  if (!newOwner) {
    throw new AppError("NOT_FOUND");
  }
  if (newOwner.userId === context.userId) {
    throw new AppError(
      "VALIDATION_ERROR",
      "You already own this organization.",
    );
  }

  await AuthRepository.transferOwnership({
    organizationId: context.organizationId,
    ownerUserId: context.userId,
    newOwnerMemberId,
  });

  // The batch is a no-op when either row changed after the checks above.
  const transferred = await AuthRepository.getMemberInOrganization(
    newOwnerMemberId,
    context.organizationId,
  );
  if (transferred?.role !== "owner") {
    throw new AppError("CONFLICT");
  }
}

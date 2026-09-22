import { createServerFn } from "@tanstack/react-start";
import {
  canAccessSuperAdmin,
  requireSuperAdmin,
} from "@/server/features/super-admin/access";
import { SuperAdminService } from "@/server/features/super-admin/services/SuperAdminService";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";

export const getSuperAdminAccess = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => ({
    allowed: canAccessSuperAdmin(context.userEmail),
  }));

export const getSuperAdminOverview = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) => {
    requireSuperAdmin(context.userEmail);
    return SuperAdminService.getOverview();
  });

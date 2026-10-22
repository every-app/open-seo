import { createServerFn } from "@tanstack/react-start";
import { AuditCompareService } from "@/server/features/audit/services/AuditCompareService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import { compareLatestAuditsSchema } from "@/types/schemas/audit-compare";

export const compareLatestAudits = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(compareLatestAuditsSchema)
  .handler(async ({ context }) => {
    return AuditCompareService.compareLatestAudits(context.projectId);
  });

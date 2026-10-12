import { createServerFn } from "@tanstack/react-start";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { CrawlerCredentialService } from "@/server/features/audit/services/CrawlerCredentialService";
import {
  requireAuthenticatedContext,
  requireProjectContext,
} from "@/serverFunctions/middleware";
import {
  deleteCrawlerCredentialSchema,
  saveCrawlerCredentialSchema,
} from "@/types/schemas/crawlerAccess";

// Crawler-access signatures are saved on a project but read across the
// organization, so they get the same gate as the other third-party
// connections (GSC/GA4).
export const listCrawlerCredentials = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .handler(async ({ context }) =>
    CrawlerCredentialService.listCrawlerCredentials(context.organizationId),
  );

export const saveCrawlerCredential = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveCrawlerCredentialSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return CrawlerCredentialService.saveCrawlerCredential({
      organizationId: context.organizationId,
      projectId: context.projectId,
      userId: context.userId,
      host: data.host,
      signatureInput: data.signatureInput,
      signature: data.signature,
    });
  });

export const deleteCrawlerCredential = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(deleteCrawlerCredentialSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await CrawlerCredentialService.deleteCrawlerCredential({
      organizationId: context.organizationId,
      id: data.id,
    });
    return { success: true };
  });

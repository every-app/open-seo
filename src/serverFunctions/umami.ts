import { createServerFn } from "@tanstack/react-start";
import { waitUntil } from "cloudflare:workers";
import { z } from "zod";
import { UmamiReportingService } from "@/server/features/umami/services/UmamiReportingService";
import { UmamiService } from "@/server/features/umami/services/UmamiService";
import { AppError } from "@/server/lib/errors";
import { UmamiError } from "@/server/lib/umamiErrors";
import { hasOrgPermission } from "@/lib/org-permissions";
import { requireOrgPermission } from "@/server/auth/org-gate";
import { captureServerEvent } from "@/server/lib/posthog";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  MAX_UMAMI_CUSTOM_HEADERS,
  umamiAuthTypeSchema,
  umamiHeaderSchema,
} from "@/shared/umami";

const projectScopedSchema = z.object({ projectId: z.string().min(1) });
const instanceScopedSchema = projectScopedSchema.extend({
  instanceId: z.string().min(1),
});

const saveInstanceSchema = projectScopedSchema
  .extend({
    baseUrl: z.string().trim().min(1).max(2048),
    authType: umamiAuthTypeSchema,
    username: z.string().trim().max(255).optional(),
    secret: z.string().min(1).max(4096),
    headers: z
      .array(umamiHeaderSchema)
      .max(MAX_UMAMI_CUSTOM_HEADERS)
      .default([]),
  })
  .refine((value) => value.authType !== "password" || Boolean(value.username), {
    path: ["username"],
    message: "Enter the Umami username",
  });

const timeZoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      const format = new Intl.DateTimeFormat("en-US", { timeZone: value });
      return Boolean(format.resolvedOptions().timeZone);
    } catch {
      return false;
    }
  }, "Unknown time zone");

const setWebsiteSchema = instanceScopedSchema.extend({
  websiteId: z.string().min(1).max(100),
  timeZone: timeZoneSchema,
});

export const getUmamiConnection = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    const [row, instances, encryptionConfigured] = await Promise.all([
      UmamiService.getConnection(context.projectId),
      UmamiService.listInstances(context.organizationId),
      UmamiService.isEncryptionConfigured(),
    ]);
    return {
      connected: Boolean(row),
      canManage: hasOrgPermission(context.role, { integration: ["manage"] }),
      encryptionConfigured,
      instances,
      instanceId: row?.instance.id ?? null,
      websiteId: row?.connection.websiteId ?? null,
      websiteName: row?.connection.websiteName ?? null,
      websiteDomain: row?.connection.websiteDomain ?? null,
      timeZone: row?.connection.timeZone ?? null,
      connectedAt: row?.connection.createdAt ?? null,
    };
  });

export const saveUmamiInstance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(saveInstanceSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const result = await UmamiService.saveInstance({
      organizationId: context.organizationId,
      userId: context.userId,
      baseUrl: data.baseUrl,
      authType: data.authType,
      username: data.username ?? null,
      secret: data.secret,
      headers: data.headers,
    });
    if ("instance" in result) {
      waitUntil(
        captureServerEvent({
          distinctId: context.userId,
          event: "umami:instance_save",
          organizationId: context.organizationId,
          properties: {
            project_id: context.projectId,
            auth_type: data.authType,
          },
        }),
      );
    }
    return result;
  });

export const listUmamiWebsites = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(instanceScopedSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    return UmamiService.listWebsites({
      organizationId: context.organizationId,
      instanceId: data.instanceId,
    });
  });

export const setUmamiWebsite = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(setWebsiteSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    const result = await UmamiService.setWebsite({
      projectId: context.projectId,
      organizationId: context.organizationId,
      userId: context.userId,
      instanceId: data.instanceId,
      websiteId: data.websiteId,
      timeZone: data.timeZone,
    });
    if ("problem" in result) return result;
    waitUntil(
      captureServerEvent({
        distinctId: context.userId,
        event: "umami:website_select",
        organizationId: context.organizationId,
        properties: { project_id: context.projectId },
      }),
    );
    return { connected: true as const };
  });

export const disconnectUmami = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await UmamiService.disconnect(context.projectId);
    return { connected: false as const };
  });

export const deleteUmamiInstance = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(instanceScopedSchema)
  .handler(async ({ data, context }) => {
    requireOrgPermission(context, { integration: ["manage"] });
    await UmamiService.deleteInstance({
      organizationId: context.organizationId,
      instanceId: data.instanceId,
    });
    return { success: true as const };
  });

/** The dashboard's Umami card: organic totals vs the previous period plus a
 *  daily visitors trend, over the default (last 28 complete days) range. */
export const getUmamiDashboardReport = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(projectScopedSchema)
  .handler(async ({ context }) => {
    try {
      const overview = await UmamiReportingService.getOverview({
        projectId: context.projectId,
      });
      return {
        status: "ok" as const,
        websiteName: overview.source.websiteName,
        totals: overview.current,
        prevTotals: overview.previous,
        trend: overview.trend,
      };
    } catch (error) {
      if (error instanceof UmamiError) {
        if (error.code === "umami_not_connected") {
          return { status: "not_connected" as const };
        }
        // Server-side faults on the user's own Umami server, not app faults:
        // the card shows its own message, and error tracking skips them.
        if (error.code === "umami_rate_limited") {
          throw new AppError("RATE_LIMITED");
        }
        return {
          status: "error" as const,
          error: { code: error.code, message: error.message },
        };
      }
      throw error;
    }
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireAuthenticatedContext } from "@/serverFunctions/middleware";
import {
  getDataforseoSettingsView,
  saveDataforseoSettings,
  removeDataforseoSettings,
  testDataforseoConnection,
  checkDataforseoApiStatus,
  type DataforseoSettingsView,
  type DataforseoConnectionTestResult,
  type DataforseoApiStatusResult,
  type DataforseoApiHealth,
  type DataforseoEndpointHealth,
} from "@/server/features/settings/services/DataforseoSettingsService";

export type {
  DataforseoSettingsView,
  DataforseoConnectionTestResult,
  DataforseoApiStatusResult,
  DataforseoApiHealth,
  DataforseoEndpointHealth,
};
import { ProjectRepository } from "@/server/features/projects/repositories/ProjectRepository";
import { AppError } from "@/server/lib/errors";

async function assertProjectAccess(
  projectId: string,
  organizationId: string,
): Promise<void> {
  const project = await ProjectRepository.getProjectForOrganization(
    projectId,
    organizationId,
  );
  if (!project) {
    throw new AppError("FORBIDDEN", "Project not found in this organization.");
  }
}

export const getDataforseoSettings = createServerFn({ method: "GET" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      projectId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<DataforseoSettingsView> => {
    if (data.projectId) {
      await assertProjectAccess(data.projectId, context.organizationId);
    }
    return getDataforseoSettingsView({
      organizationId: context.organizationId,
      projectId: data.projectId ?? null,
    });
  });

const savePatchSchema = z.object({
  login: z.string().max(200).optional(),
  password: z.string().max(200).optional(),
  enabled: z.boolean().optional(),
});

export const saveDataforseoSettingsFn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      projectId: z.string().min(1).optional(),
      patch: savePatchSchema,
    }),
  )
  .handler(async ({ context, data }): Promise<DataforseoSettingsView> => {
    if (data.projectId) {
      await assertProjectAccess(data.projectId, context.organizationId);
    }
    return saveDataforseoSettings({
      organizationId: context.organizationId,
      projectId: data.projectId ?? null,
      patch: data.patch,
    });
  });

export const removeDataforseoSettingsFn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      projectId: z.string().min(1).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<DataforseoSettingsView> => {
    if (data.projectId) {
      await assertProjectAccess(data.projectId, context.organizationId);
    }
    return removeDataforseoSettings({
      organizationId: context.organizationId,
      projectId: data.projectId ?? null,
    });
  });

export const testDataforseoConnectionFn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      projectId: z.string().min(1).optional(),
      login: z.string().max(200).optional(),
      password: z.string().max(200).optional(),
    }),
  )
  .handler(
    async ({ context, data }): Promise<DataforseoConnectionTestResult> => {
      if (data.projectId) {
        await assertProjectAccess(data.projectId, context.organizationId);
      }
      return testDataforseoConnection({
        organizationId: context.organizationId,
        projectId: data.projectId ?? null,
        login: data.login,
        password: data.password,
      });
    },
  );

export const checkDataforseoApiStatusFn = createServerFn({ method: "POST" })
  .middleware(requireAuthenticatedContext)
  .validator(
    z.object({
      projectId: z.string().min(1).optional(),
      login: z.string().max(200).optional(),
      password: z.string().max(200).optional(),
    }),
  )
  .handler(async ({ context, data }): Promise<DataforseoApiStatusResult> => {
    if (data.projectId) {
      await assertProjectAccess(data.projectId, context.organizationId);
    }
    return checkDataforseoApiStatus({
      organizationId: context.organizationId,
      projectId: data.projectId ?? null,
      login: data.login,
      password: data.password,
    });
  });

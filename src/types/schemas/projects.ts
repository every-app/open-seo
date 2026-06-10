import { z } from "zod";

const projectNameField = z
  .string()
  .trim()
  .min(1, "Project name is required")
  .max(120);

const projectDomainField = z
  .string()
  .trim()
  .max(255)
  .transform((value) => value || undefined)
  .optional();

export const createProjectSchema = z.object({
  name: projectNameField,
  domain: projectDomainField,
});

export const updateProjectSchema = z.object({
  projectId: z.string().min(1),
  name: projectNameField,
  domain: projectDomainField,
});

export const archiveProjectSchema = z.object({
  projectId: z.string().min(1),
});

// Deliberately not named `projectId`: ensureUserMiddleware resolves any
// `projectId` in input data against active projects and 404s on archived
// ones before the handler runs.
export const restoreProjectSchema = z.object({
  archivedProjectId: z.string().min(1),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ArchiveProjectInput = z.infer<typeof archiveProjectSchema>;
export type RestoreProjectInput = z.infer<typeof restoreProjectSchema>;

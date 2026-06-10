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

export const deleteProjectSchema = z.object({
  projectId: z.string().min(1),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type DeleteProjectInput = z.infer<typeof deleteProjectSchema>;

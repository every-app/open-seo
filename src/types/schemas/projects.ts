import { z } from "zod";
import {
  isSupportedLanguageCode,
  isSupportedLocationCode,
} from "@/shared/keyword-locations";

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

// Default market for the project's data calls. The location/language PAIR is
// validated in the service (an update may change one side and needs the
// stored row for the other).
const projectLocationCodeField = z
  .number()
  .int()
  .refine(isSupportedLocationCode, "Unsupported DataForSEO location code")
  .optional();

const projectLanguageCodeField = z
  .string()
  .refine(isSupportedLanguageCode, "Unsupported language code")
  .optional();

export const createProjectSchema = z.object({
  name: projectNameField,
  domain: projectDomainField,
  locationCode: projectLocationCodeField,
  languageCode: projectLanguageCodeField,
});

export const updateProjectSchema = z.object({
  projectId: z.string().min(1),
  name: projectNameField,
  domain: projectDomainField,
  locationCode: projectLocationCodeField,
  languageCode: projectLanguageCodeField,
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

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

// A language on its own has no location to validate against, and would force a
// read of the stored row to resolve. Callers set the market as a pair, or send
// a location alone and let the service derive its language.
const hasLocationForLanguage = (input: {
  locationCode?: number;
  languageCode?: string;
}) => input.locationCode != null || input.languageCode == null;

const marketPairMessage = {
  message: "A language requires a location.",
  path: ["languageCode"],
};

export const createProjectSchema = z
  .object({
    name: projectNameField,
    domain: projectDomainField,
    locationCode: projectLocationCodeField,
    languageCode: projectLanguageCodeField,
  })
  .refine(hasLocationForLanguage, marketPairMessage);

export const updateProjectSchema = z
  .object({
    projectId: z.string().min(1),
    name: projectNameField,
    domain: projectDomainField,
    locationCode: projectLocationCodeField,
    languageCode: projectLanguageCodeField,
  })
  .refine(hasLocationForLanguage, marketPairMessage);

// Domain on its own, for the dashboard hero's inline input. Same loose shape
// as updateProjectSchema's domain field, but required.
export const setProjectDomainSchema = z.object({
  projectId: z.string().min(1),
  domain: z.string().trim().min(1).max(255),
});

// Market-only update (onboarding). Both halves are required: the caller picks
// them together, so the service can validate the pair without a stored row.
export const setProjectMarketSchema = z.object({
  projectId: z.string().min(1),
  locationCode: z
    .number()
    .int()
    .refine(isSupportedLocationCode, "Unsupported DataForSEO location code"),
  languageCode: z
    .string()
    .refine(isSupportedLanguageCode, "Unsupported language code"),
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
export type SetProjectDomainInput = z.infer<typeof setProjectDomainSchema>;
export type SetProjectMarketInput = z.infer<typeof setProjectMarketSchema>;
export type ArchiveProjectInput = z.infer<typeof archiveProjectSchema>;
export type RestoreProjectInput = z.infer<typeof restoreProjectSchema>;

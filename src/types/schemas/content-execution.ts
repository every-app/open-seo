import { z } from "zod";
import { CONTENT_EXECUTION_STATUSES } from "@/types/content-execution";

const optionalText = (max: number) => z.string().trim().min(1).max(max);
const httpUrl = z
  .url()
  .refine(
    (value) => value.startsWith("https://") || value.startsWith("http://"),
    {
      message: "Enter a valid http or https URL.",
    },
  );
const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const jiraIssueKey = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]*-\d+$/);

export const createContentExecutionItemSchema = z
  .object({
    projectId: z.string().min(1),
    title: z.string().trim().min(1).max(160),
    targetUrl: httpUrl.optional(),
    savedKeywordIds: z.array(z.string().min(1)).min(1).max(80),
    primarySavedKeywordId: z.string().min(1),
    owner: optionalText(100).optional(),
    dueDate: dueDate.optional(),
    jiraIssueKey: jiraIssueKey.optional(),
    jiraIssueUrl: httpUrl.optional(),
  })
  .refine(
    (value) => value.savedKeywordIds.includes(value.primarySavedKeywordId),
    {
      message: "Primary keyword must be part of the selected keyword cluster.",
      path: ["primarySavedKeywordId"],
    },
  );

const updateFields = {
  title: z.string().trim().min(1).max(160).optional(),
  targetUrl: httpUrl.nullable().optional(),
  status: z.enum(CONTENT_EXECUTION_STATUSES).optional(),
  owner: optionalText(100).nullable().optional(),
  dueDate: dueDate.nullable().optional(),
  jiraIssueKey: jiraIssueKey.nullable().optional(),
  jiraIssueUrl: httpUrl.nullable().optional(),
};

export const updateContentExecutionItemSchema = z
  .object({
    projectId: z.string().min(1),
    executionItemId: z.string().min(1),
    ...updateFields,
  })
  .refine(
    (value) => Object.keys(updateFields).some((key) => key in value),
    "Change at least one execution field.",
  );

export const listContentExecutionItemsSchema = z.object({
  projectId: z.string().min(1),
});

export type CreateContentExecutionItemInput = z.infer<
  typeof createContentExecutionItemSchema
>;
export type UpdateContentExecutionItemInput = z.infer<
  typeof updateContentExecutionItemSchema
>;

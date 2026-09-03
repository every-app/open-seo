import { ContentExecutionRepository } from "@/server/features/content-execution/repositories/ContentExecutionRepository";
import { AppError } from "@/server/lib/errors";
import type {
  CreateContentExecutionItemInput,
  UpdateContentExecutionItemInput,
} from "@/types/schemas/content-execution";

async function create(input: CreateContentExecutionItemInput) {
  const savedKeywordIds = [...new Set(input.savedKeywordIds)];
  if (!savedKeywordIds.includes(input.primarySavedKeywordId)) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Primary keyword must be part of the selected keyword cluster.",
    );
  }
  return ContentExecutionRepository.createExecutionItem({
    ...input,
    id: crypto.randomUUID(),
    savedKeywordIds,
    status: "ready_to_assign",
  });
}

async function list(projectId: string) {
  return ContentExecutionRepository.listExecutionItemsByProject(projectId);
}

async function update(input: UpdateContentExecutionItemInput) {
  return ContentExecutionRepository.updateExecutionItem(input);
}

export const ContentExecutionService = { create, list, update } as const;

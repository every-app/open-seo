import { createServerFn } from "@tanstack/react-start";
import { ContentExecutionService } from "@/server/features/content-execution/services/ContentExecutionService";
import { requireProjectContext } from "@/serverFunctions/middleware";
import {
  createContentExecutionItemSchema,
  listContentExecutionItemsSchema,
  updateContentExecutionItemSchema,
} from "@/types/schemas/content-execution";

export const listContentExecutionItems = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(listContentExecutionItemsSchema)
  .handler(({ context }) => ContentExecutionService.list(context.projectId));

export const createContentExecutionItem = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(createContentExecutionItemSchema)
  .handler(({ data, context }) =>
    ContentExecutionService.create({ ...data, projectId: context.projectId }),
  );

export const updateContentExecutionItem = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(updateContentExecutionItemSchema)
  .handler(({ data, context }) =>
    ContentExecutionService.update({ ...data, projectId: context.projectId }),
  );

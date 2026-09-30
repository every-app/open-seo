import { createServerFn } from "@tanstack/react-start";
import {
  aiDiscoverabilityInputSchema,
  checkAiDiscoverability,
} from "@/server/features/ai-discoverability/service";
import { requireProjectContext } from "@/serverFunctions/middleware";

export const getAiDiscoverability = createServerFn({ method: "POST" })
  .middleware(requireProjectContext)
  .validator(aiDiscoverabilityInputSchema)
  .handler(({ data }) => checkAiDiscoverability(data.url));

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptExplorerPage } from "@/client/features/ai-search/PromptExplorerPage";
import {
  PROMPT_EXPLORER_MODELS,
  promptExplorerSearchSchema,
} from "@/types/schemas/ai-search";

export const Route = createFileRoute("/_project/p/$projectId/prompt-explorer")({
  validateSearch: promptExplorerSearchSchema,
  component: PromptExplorerRoute,
});

function PromptExplorerRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();

  return (
    <PromptExplorerPage
      projectId={projectId}
      urlState={{
        prompt: search.q ?? "",
        highlightBrand: search.hb ?? "",
        models:
          search.models && search.models.length > 0
            ? search.models
            : [...PROMPT_EXPLORER_MODELS],
        webSearch: search.web ?? true,
        webSearchCountryCode: search.cc ?? "US",
      }}
      onSubmit={(values) => {
        void navigate({
          search: {
            q: values.prompt,
            models: values.models,
            web: values.webSearch ? undefined : false,
            cc:
              values.webSearchCountryCode === "US"
                ? undefined
                : values.webSearchCountryCode,
            hb: values.highlightBrand || undefined,
          },
          replace: true,
        });
      }}
    />
  );
}

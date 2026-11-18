import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PromptExplorerPage } from "@/client/features/ai-search/PromptExplorerPage";
import { AiResearchSetupGate } from "@/client/features/ai-visibility/AiResearchSetupGate";
import { aiResearchSetupQueryOptions } from "@/client/features/ai-visibility/shared";
import { ProjectWebsiteGate } from "@/client/features/projects/ProjectWebsiteGate";
import { useProjectMarket } from "@/client/features/projects/useProjectMarket";
import { queryClient } from "@/client/tanstack-db/queryClient";
import { projectWebSearchCountry } from "@/shared/prompt-search-countries";
import {
  promptExplorerSearchSchema,
  type PromptExplorerModel,
} from "@/types/schemas/ai-search";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/prompt-explorer")({
  head: () => pageHead("Prompt Explorer"),
  validateSearch: promptExplorerSearchSchema,
  // Start the setup gate's read on link intent, as AI visibility does.
  loader: ({ params }) => {
    void queryClient.prefetchQuery(
      aiResearchSetupQueryOptions(params.projectId),
    );
  },
  component: PromptExplorerRoute,
});

function PromptExplorerRoute() {
  const { projectId } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const market = useProjectMarket(projectId);
  // One object per URL, so the page's search tabs only react to real changes.
  const urlState = useMemo(() => {
    const models: PromptExplorerModel[] =
      search.models && search.models.length > 0 ? search.models : ["chat_gpt"];
    return {
      prompt: search.q ?? "",
      highlightBrand: search.hb ?? "",
      models,
      webSearch: search.web ?? true,
      // The page renders behind ProjectWebsiteGate, so the market has loaded
      // by the time this value reaches the form or a query.
      webSearchCountryCode:
        search.cc ??
        (market && projectWebSearchCountry(market.locationCode, models)) ??
        "default",
    };
  }, [search, market]);

  return (
    <div className="overflow-auto px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto max-w-7xl space-y-5" key={projectId}>
        <ProjectWebsiteGate projectId={projectId}>
          <AiResearchSetupGate projectId={projectId}>
            <PromptExplorerPage
              projectId={projectId}
              urlState={urlState}
              onSubmit={(values) => {
                void navigate({
                  search: {
                    q: values.prompt,
                    models: values.models,
                    web: values.webSearch ? undefined : false,
                    cc: values.webSearchCountryCode,
                    hb: values.highlightBrand || undefined,
                  },
                  replace: true,
                });
              }}
              onClear={() => {
                void navigate({ search: {}, replace: true });
              }}
            />
          </AiResearchSetupGate>
        </ProjectWebsiteGate>
      </div>
    </div>
  );
}

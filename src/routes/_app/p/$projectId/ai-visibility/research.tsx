import { createFileRoute } from "@tanstack/react-router";
import { Link2, ListPlus, MessagesSquare } from "lucide-react";
import { z } from "zod";
import { PromptResearchPage } from "@/client/features/ai-visibility/PromptResearchPage";
import { PromptTrackingWithoutUpgradeButton } from "@/client/features/ai-visibility/shared";
import { PaidPlanGate } from "@/client/features/billing/PaidPlanGate";

export const Route = createFileRoute(
  "/_app/p/$projectId/ai-visibility/research",
)({
  validateSearch: z.object({ q: z.string().trim().max(100).optional() }),
  component: AiResearchRoute,
});

const PROMPT_RESEARCH_FEATURES = [
  {
    icon: MessagesSquare,
    title: "Questions about your market",
    body: "See the questions people ask about a keyword, most common first, with ChatGPT's answer to each.",
  },
  {
    icon: Link2,
    title: "Who gets cited",
    body: "See which sites ChatGPT cited when it answered, and whether yours is one of them.",
  },
  {
    icon: ListPlus,
    title: "Track the ones that matter",
    body: "Pick the questions worth watching and add them to Prompt Tracking in one step.",
  },
];

function AiResearchRoute() {
  const { projectId } = Route.useParams();
  const { q } = Route.useSearch();
  return (
    <PaidPlanGate
      feature="Prompt Research"
      description="Find questions people ask about your market, see how ChatGPT answers them, and check which sites the answers cite."
      features={PROMPT_RESEARCH_FEATURES}
      alternative={<PromptTrackingWithoutUpgradeButton projectId={projectId} />}
    >
      <PromptResearchPage key={projectId} projectId={projectId} keyword={q} />
    </PaidPlanGate>
  );
}

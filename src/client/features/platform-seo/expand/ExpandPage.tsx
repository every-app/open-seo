import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Card, CardContent } from "@/client/components/ui/card";
import { Input } from "@/client/components/ui/input";
import {
  getExpandSetup,
  listKeywordPulls,
} from "@/serverFunctions/platformSeo";
import { KeywordModeTabs } from "./KeywordModeTabs";
import { PullDetail } from "./PullDetail";
import {
  expandQueryKeys,
  useExpandPipeline,
  type PipelineStep,
} from "./useExpandPipeline";

const STEP_LABELS: Record<PipelineStep, string> = {
  pull: "Pulling keywords from Answer Socrates…",
  filter: "Filtering out other meanings of the seed…",
  cluster: "Adding volume and difficulty, then clustering…",
};

export function ExpandPage({ projectId }: { projectId: string }) {
  const [selectedPullId, setSelectedPullId] = useState<string | null>(null);
  const setup = useQuery({
    queryKey: expandQueryKeys.setup(projectId),
    queryFn: () => getExpandSetup({ data: { projectId } }),
  });
  const pulls = useQuery({
    queryKey: expandQueryKeys.pulls(projectId),
    queryFn: () => listKeywordPulls({ data: { projectId } }),
  });
  const pipeline = useExpandPipeline(projectId, setSelectedPullId);
  const activePullId = selectedPullId ?? pulls.data?.[0]?.id ?? null;

  const missing = setup.data
    ? [
        !setup.data.answerSocrates && "ANSWERSOCRATES_API_KEY",
        !setup.data.openRouter && "OPENROUTER_API_KEY",
        !setup.data.dataForSeo && "DATAFORSEO_API_KEY",
      ].filter((name): name is string => Boolean(name))
    : [];

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <PageHeader
          title="Keyword Research"
          description="Expand a seed into every real search around it, keep only the ones that mean what you mean, and group them into topics."
          actions={<KeywordModeTabs projectId={projectId} active="expand" />}
        />

        {missing.length > 0 ? (
          <Alert>
            <AlertTitle>Keyword expansion needs setup</AlertTitle>
            <AlertDescription>
              Add {missing.join(", ")} to this deployment's environment, then
              restart the app.
            </AlertDescription>
          </Alert>
        ) : null}

        <SeedForm
          disabled={missing.length > 0 || setup.isPending}
          isRunning={pipeline.isRunning}
          onSubmit={(seed, seedMeaning) => pipeline.run({ seed, seedMeaning })}
        />
        {pipeline.step ? (
          <p className="text-sm text-muted-foreground" role="status">
            {STEP_LABELS[pipeline.step]}
          </p>
        ) : null}

        <QueryState query={pulls} errorFallback="Failed to load your pulls.">
          {(rows) =>
            rows.length === 0 ? (
              <EmptyState
                icon={Sparkles}
                title="No expansions yet"
                description="Enter a seed keyword above. One run uses one Answer Socrates request."
              />
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {rows.map((pull) => (
                    <Button
                      key={pull.id}
                      size="sm"
                      variant={pull.id === activePullId ? "secondary" : "ghost"}
                      onClick={() => setSelectedPullId(pull.id)}
                    >
                      {pull.seed}
                      <span className="text-muted-foreground">
                        {" "}
                        · {pull.country}
                      </span>
                    </Button>
                  ))}
                </div>
                {activePullId ? (
                  <PullDetail
                    projectId={projectId}
                    pullId={activePullId}
                    isRunning={pipeline.isRunning}
                    onResume={(stage) =>
                      pipeline.run({ resumePullId: activePullId, stage })
                    }
                  />
                ) : null}
              </div>
            )
          }
        </QueryState>
      </div>
    </div>
  );
}

function SeedForm({
  disabled,
  isRunning,
  onSubmit,
}: {
  disabled: boolean;
  isRunning: boolean;
  onSubmit: (seed: string, seedMeaning?: string) => void;
}) {
  const [seed, setSeed] = useState("");
  const [meaning, setMeaning] = useState("");
  return (
    <Card>
      <CardContent>
        <form
          className="flex flex-col gap-3 md:flex-row md:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            const trimmed = seed.trim();
            if (trimmed.length < 2) return;
            onSubmit(trimmed, meaning.trim() || undefined);
          }}
        >
          <label className="flex flex-1 flex-col gap-1.5 text-sm font-medium">
            Seed keyword
            <Input
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              placeholder="parasite seo"
              maxLength={120}
              disabled={disabled || isRunning}
            />
          </label>
          <label className="flex flex-[2] flex-col gap-1.5 text-sm font-medium">
            <span>
              What you mean by it{" "}
              <span className="font-normal text-muted-foreground">
                (optional)
              </span>
            </span>
            <Input
              value={meaning}
              onChange={(event) => setMeaning(event.target.value)}
              placeholder="The SEO tactic of publishing on high-authority sites"
              maxLength={300}
              disabled={disabled || isRunning}
            />
          </label>
          <Button
            type="submit"
            pending={isRunning}
            disabled={disabled || seed.trim().length < 2}
          >
            Expand
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

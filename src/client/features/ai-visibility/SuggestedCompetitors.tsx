import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/client/components/ui/button";
import { getAiVisibilitySources } from "@/serverFunctions/ai-visibility";
import { updateProjectContext } from "@/serverFunctions/projectContext";
import type { AiTrackerState } from "@/shared/ai-visibility";
import { DomainFavicon } from "./DomainFavicon";
import { aiVisibilityKey } from "./shared";

/** Third-party domains cited most often in the run; add them to shared context. */
export function SuggestedCompetitors({
  projectId,
  state,
  runId,
}: {
  projectId: string;
  state: AiTrackerState;
  runId: string;
}) {
  const queryClient = useQueryClient();
  const sources = useQuery({
    queryKey: [...aiVisibilityKey(projectId), "sources", "suggested", runId],
    queryFn: () =>
      getAiVisibilitySources({
        data: {
          projectId,
          runId,
          groupBy: "domain",
          ownership: "other",
          branded: "all",
          limit: 25,
        },
      }),
  });
  const add = useMutation({
    mutationFn: async (domain: string) => {
      await updateProjectContext({
        data: { projectId, updates: [{ addCompetitors: [{ domain }] }] },
      });
    },
    onSuccess: (_, domain) => {
      toast.success(`${domain} added as a competitor`);
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: aiVisibilityKey(projectId) }),
        queryClient.invalidateQueries({
          queryKey: ["projectContext", projectId],
        }),
      ]);
    },
  });
  // Hide your brand, tracked competitors and well-known platforms.
  const hidden = new Set([
    ...NOT_COMPETITORS,
    ...state.brands.map((brand) => bare(brand.domain)),
  ]);
  const rows = (sources.data?.rows ?? []).filter(
    (row) => !hidden.has(bare(row.domain)),
  );
  if (!rows.length) return null;
  const top = rows.slice(0, 5);
  return (
    <div className="space-y-3 border-t border-border p-4">
      <h2 className="text-sm font-semibold">Suggested competitors</h2>
      <p className="text-xs text-muted-foreground">
        Other sites AI answers cite most for your prompts.
      </p>
      <div className="divide-y divide-border">
        {top.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3 py-2"
          >
            <span className="flex items-center gap-2 text-sm">
              <DomainFavicon domain={row.domain} />
              {row.domain}
              <span className="ml-2 text-xs text-muted-foreground">
                cited in {row.answerCount}{" "}
                {row.answerCount === 1 ? "answer" : "answers"}
              </span>
            </span>
            <Button
              variant="ghost"
              size="xs"
              disabled={add.isPending}
              onClick={() => add.mutate(row.domain)}
            >
              <Plus />
              Add
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Project context stores competitor domains without "www.".
function bare(domain: string) {
  return domain.replace(/^www\./, "");
}

// Review, social, reference and publishing platforms AI answers often cite.
// They are sources, not competitors.
const NOT_COMPETITORS = [
  "reddit.com",
  "youtube.com",
  "wikipedia.org",
  "en.wikipedia.org",
  "quora.com",
  "medium.com",
  "linkedin.com",
  "x.com",
  "twitter.com",
  "facebook.com",
  "instagram.com",
  "tiktok.com",
  "github.com",
  "stackoverflow.com",
  "producthunt.com",
  "g2.com",
  "capterra.com",
  "trustpilot.com",
  "trustradius.com",
  "getapp.com",
  "softwareadvice.com",
  "gartner.com",
  "forbes.com",
  "techradar.com",
  "zapier.com",
  "google.com",
  "support.google.com",
];

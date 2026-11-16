import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Network, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/client/components/EmptyState";
import { PageHeader } from "@/client/components/PageHeader";
import { QueryState } from "@/client/components/QueryState";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/client/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { Textarea } from "@/client/components/ui/textarea";
import {
  findPlatforms,
  listPlatforms,
  runPlatformAiPass,
} from "@/serverFunctions/platformSeo";
import { ImportPlatformsForm } from "./ImportPlatformsForm";
import { platformQueryKeys } from "./platformQueryKeys";
import { isAwaitingAi, PlatformTable } from "./PlatformTable";

const VIEWS = [
  "review",
  "parasite",
  "not_parasite",
  "tool",
  "sponsorship",
  "affiliate",
  "all",
] as const;
type View = (typeof VIEWS)[number];

const DISCOVERY_HINT =
  "Look up a few keywords above, or open search results anywhere in the app. New sites show up here.";
const EMPTY_HINTS: Record<View, string> = {
  review: DISCOVERY_HINT,
  parasite: DISCOVERY_HINT,
  not_parasite: DISCOVERY_HINT,
  all: DISCOVERY_HINT,
  tool: "Import a list of tools above, or choose Tool under Other on any site.",
  sponsorship:
    "Import a list of sponsorship marketplaces above, or choose it under Other on any site.",
  affiliate:
    "Import a list above with Affiliate programs ticked, or press Affiliate on any site.",
};

const MAX_KEYWORDS = 10;
export function PlatformsPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("review");
  const list = useQuery({
    queryKey: platformQueryKeys.list(projectId),
    queryFn: () => listPlatforms({ data: { projectId } }),
    refetchInterval: (query) =>
      query.state.data?.platforms.some(isAwaitingAi) ? 4000 : false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: platformQueryKeys.list(projectId),
    });

  const aiPass = useMutation({
    mutationFn: () => runPlatformAiPass({ data: { projectId } }),
    onSuccess: async ({ classified }) => {
      await refresh();
      toast.success(
        classified === 0
          ? "Nothing was waiting for the AI."
          : `The AI reviewed ${classified} sites.`,
      );
    },
  });

  const platforms = list.data?.platforms ?? [];
  const counts = {
    review: platforms.filter((p) => p.status === "pending").length,
    parasite: platforms.filter((p) => p.status === "parasite").length,
    not_parasite: platforms.filter((p) => p.status === "not_parasite").length,
    tool: platforms.filter((p) => p.status === "tool").length,
    sponsorship: platforms.filter((p) => p.status === "sponsorship").length,
    affiliate: platforms.filter((p) => p.affiliateProgram).length,
    all: platforms.length,
  };
  const unclassified = platforms.filter(
    (p) => p.status === "pending" && !p.aiClassifiedAt,
  ).length;
  const setup = list.data?.setup;

  return (
    <div className="px-4 py-4 pb-24 md:px-6 md:py-6 md:pb-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <PageHeader
          title="Platforms"
          description="Sites that rank on Google's first two pages and might let you post or keep a profile. Every search results page the app reads adds new ones here for you to review."
          actions={
            unclassified > 0 ? (
              <Button
                variant="outline"
                pending={aiPass.isPending}
                disabled={!setup?.openRouter}
                onClick={() => aiPass.mutate()}
              >
                <Sparkles />
                AI review ({unclassified})
              </Button>
            ) : null
          }
        />

        {setup && !setup.dataForSeo ? (
          <Alert>
            <AlertTitle>Finding platforms needs DataForSEO</AlertTitle>
            <AlertDescription>
              Add DATAFORSEO_API_KEY to this deployment's environment, then
              restart the app.
            </AlertDescription>
          </Alert>
        ) : null}

        <FindPlatformsForm
          projectId={projectId}
          disabled={!setup?.dataForSeo}
          onDone={refresh}
        />

        <ImportPlatformsForm projectId={projectId} onDone={refresh} />

        <Tabs
          value={view}
          onValueChange={(value) => {
            const next = VIEWS.find((candidate) => candidate === value);
            if (next) setView(next);
          }}
        >
          <TabsList className="h-auto! max-w-full flex-wrap justify-start">
            <TabsTrigger value="review">
              To review ({counts.review})
            </TabsTrigger>
            <TabsTrigger value="parasite">
              Parasite ({counts.parasite})
            </TabsTrigger>
            <TabsTrigger value="not_parasite">
              Not parasite ({counts.not_parasite})
            </TabsTrigger>
            <TabsTrigger value="tool">Tools ({counts.tool})</TabsTrigger>
            <TabsTrigger value="sponsorship">
              Sponsorships ({counts.sponsorship})
            </TabsTrigger>
            <TabsTrigger value="affiliate">
              Affiliate programs ({counts.affiliate})
            </TabsTrigger>
            <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
          </TabsList>
        </Tabs>

        <QueryState query={list} errorFallback="Failed to load platforms.">
          {(data) => {
            const rows = data.platforms.filter((p) =>
              view === "all"
                ? true
                : view === "review"
                  ? p.status === "pending"
                  : view === "affiliate"
                    ? p.affiliateProgram
                    : p.status === view,
            );
            return rows.length === 0 ? (
              <EmptyState
                icon={Network}
                title={
                  view === "review" ? "Nothing to review" : "No sites here yet"
                }
                description={EMPTY_HINTS[view]}
              />
            ) : (
              <PlatformTable projectId={projectId} rows={rows} />
            );
          }}
        </QueryState>
      </div>
    </div>
  );
}

function FindPlatformsForm({
  projectId,
  disabled,
  onDone,
}: {
  projectId: string;
  disabled: boolean;
  onDone: () => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const keywords = [
    ...new Set(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    ),
  ];
  const find = useMutation({
    mutationFn: () =>
      findPlatforms({
        data: { projectId, keywords: keywords.slice(0, MAX_KEYWORDS) },
      }),
    onSuccess: async ({ results }) => {
      await onDone();
      const waiting = results.filter((r) => r.status === "processing").length;
      const failed = results.filter((r) => r.status === "failed").length;
      const checked = results.length - waiting - failed;
      toast.success(
        [
          `Checked ${checked} of ${results.length} searches.`,
          waiting > 0 &&
            `${waiting} still loading: run the same lookup again in a minute, at no extra cost.`,
          failed > 0 && `${failed} failed.`,
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (waiting === 0) setText("");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Find platforms</CardTitle>
        <CardDescription>
          One keyword per line, up to {MAX_KEYWORDS}. Each reads Google's first
          two pages in your project's market (about $0.007 of DataForSEO credit)
          and adds every site not already on your list.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (keywords.length > 0) find.mutate();
          }}
        >
          <Textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={"best parasite seo sites\nhow to rank on medium"}
            rows={3}
            aria-label="Keywords to look up"
          />
          <div className="flex items-center gap-3">
            <Button
              type="submit"
              pending={find.isPending}
              disabled={disabled || keywords.length === 0}
            >
              Find platforms
            </Button>
            {keywords.length > MAX_KEYWORDS ? (
              <span className="text-sm text-muted-foreground">
                Only the first {MAX_KEYWORDS} will be looked up.
              </span>
            ) : null}
            {find.isPending ? (
              <span className="text-sm text-muted-foreground" role="status">
                Reading Google… this takes up to 40 seconds.
              </span>
            ) : null}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

import { useNavigate } from "@tanstack/react-router";
import { DataTableTabs } from "@/client/components/table/DataTableToolbar";
import { TabsTrigger } from "@/client/components/ui/tabs";

export const PROMPT_TRACKING_TABS = [
  {
    value: "prompts",
    label: "Prompts",
  },
  {
    value: "competitors",
    label: "Competitors",
  },
  {
    value: "citations",
    label: "Citations",
  },
] as const;
export type PromptTrackingTab = (typeof PROMPT_TRACKING_TABS)[number]["value"];

/** The tab row above the tracking card's table, kept in the URL. */
export function PromptTrackingTabs({
  projectId,
  tab,
}: {
  projectId: string;
  tab: PromptTrackingTab;
}) {
  const navigate = useNavigate();
  return (
    <div className="border-t border-border">
      <DataTableTabs
        value={tab}
        onValueChange={(value) => {
          const next = PROMPT_TRACKING_TABS.find(
            (item) => item.value === value,
          );
          if (next)
            void navigate({
              to: "/p/$projectId/ai-visibility",
              params: { projectId },
              // Like other tabbed pages, Back leaves the page.
              replace: true,
              search: {
                tab: next.value === "prompts" ? undefined : next.value,
              },
            });
        }}
      >
        {PROMPT_TRACKING_TABS.map((item) => (
          <TabsTrigger key={item.value} value={item.value}>
            {item.label}
          </TabsTrigger>
        ))}
      </DataTableTabs>
    </div>
  );
}

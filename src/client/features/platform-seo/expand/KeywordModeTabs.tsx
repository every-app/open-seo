import { useNavigate } from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";

// Research (upstream keyword research) | Expand (Answer Socrates pulls).
export function KeywordModeTabs({
  projectId,
  active,
}: {
  projectId: string;
  active: "research" | "expand";
}) {
  const navigate = useNavigate();
  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        if (value === active) return;
        void navigate({
          to: "/p/$projectId/keywords",
          params: { projectId },
          search: value === "expand" ? { tab: "expand" } : {},
        });
      }}
    >
      <TabsList>
        <TabsTrigger value="research">Research</TabsTrigger>
        <TabsTrigger value="expand">Expand</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

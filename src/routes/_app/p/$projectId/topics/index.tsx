import { createFileRoute } from "@tanstack/react-router";
import { TopicBoard } from "@/client/features/platform-seo/topics/TopicBoard";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/topics/")({
  head: () => pageHead("Topics"),
  component: TopicsRoute,
});

function TopicsRoute() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto">
      <TopicBoard projectId={projectId} />
    </div>
  );
}

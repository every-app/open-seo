import { createFileRoute } from "@tanstack/react-router";
import { PublishPage } from "@/client/features/platform-seo/publish/PublishPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute(
  "/_app/p/$projectId/topics/$topicId/publish",
)({
  head: () => pageHead("Publish"),
  component: PublishRoute,
});

function PublishRoute() {
  const { projectId, topicId } = Route.useParams();
  return (
    <div className="h-full overflow-auto">
      <PublishPage projectId={projectId} topicId={topicId} />
    </div>
  );
}

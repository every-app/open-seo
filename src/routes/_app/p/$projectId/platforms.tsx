import { createFileRoute } from "@tanstack/react-router";
import { PlatformsPage } from "@/client/features/platform-seo/platforms/PlatformsPage";
import { pageHead } from "@/client/lib/pageHead";

export const Route = createFileRoute("/_app/p/$projectId/platforms")({
  head: () => pageHead("Platforms"),
  component: PlatformsRoute,
});

function PlatformsRoute() {
  const { projectId } = Route.useParams();
  return (
    <div className="h-full overflow-auto">
      <PlatformsPage projectId={projectId} />
    </div>
  );
}

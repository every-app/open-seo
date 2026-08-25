import { createFileRoute, redirect } from "@tanstack/react-router";
import { ProjectGeneralSettings } from "@/client/features/projects/ProjectGeneralSettings";

// The connection cards used to live on this page and were linked to by anchor.
// Those links are still in the wild (older emails, agent output), so forward
// them to the sub-page that now owns the cards.
const MOVED_TO_INTEGRATIONS = ["search-console", "google-analytics"];

export const Route = createFileRoute("/_project/p/$projectId/settings/")({
  beforeLoad: ({ params, location }) => {
    const hash = location.hash.replace(/^#/, "");
    if (!MOVED_TO_INTEGRATIONS.includes(hash)) return;

    throw redirect({
      to: "/p/$projectId/settings/integrations",
      params: { projectId: params.projectId },
      hash,
      replace: true,
    });
  },
  component: ProjectGeneralSettingsRoute,
});

function ProjectGeneralSettingsRoute() {
  const { projectId } = Route.useParams();
  return <ProjectGeneralSettings projectId={projectId} />;
}

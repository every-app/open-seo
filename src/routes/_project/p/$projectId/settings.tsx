import {
  createFileRoute,
  Link,
  Outlet,
  useMatchRoute,
} from "@tanstack/react-router";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "@/client/components/icons";
import { getProjects } from "@/serverFunctions/projects";

export const Route = createFileRoute("/_project/p/$projectId/settings")({
  component: ProjectSettingsLayout,
});

const tabs = [
  { to: "/p/$projectId/settings" as const, label: "General", exact: true },
  { to: "/p/$projectId/settings/integrations" as const, label: "Integrations" },
];

function ProjectSettingsLayout() {
  const { projectId } = Route.useParams();
  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
  });
  const project = projectsQuery.data?.find((entry) => entry.id === projectId);

  const matchRoute = useMatchRoute();
  const activeTab = tabs.find((tab) =>
    matchRoute({ to: tab.to, params: { projectId }, fuzzy: !tab.exact }),
  )?.to;

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto w-full max-w-2xl space-y-8 p-4 py-8 pb-24 sm:p-6 md:py-12 md:pb-12">
        <div className="space-y-4">
          <Link
            to="/projects"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
            Projects
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Project settings
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {project?.name ?? " "}
            </p>
          </div>
          <Tabs value={activeTab}>
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.to}
                  value={tab.to}
                  nativeButton={false}
                  render={<Link to={tab.to} params={{ projectId }} />}
                >
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <Outlet />
      </div>
    </div>
  );
}

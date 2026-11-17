import { createFileRoute, Outlet } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { loadGithubStarCount } from "@/lib/github-stars";

export const Route = createFileRoute("/blogs")({
  // Fetch once at SSR/prerender time, not once per visitor.
  loader: async () => ({ githubStarCount: await loadGithubStarCount() }),
  // The value is fixed per build; never refetch it on client navigation.
  staleTime: Infinity,
  component: BlogsLayout,
});

function BlogsLayout() {
  const { githubStarCount } = Route.useLoaderData();

  return (
    <main className="min-h-screen bg-[var(--color-surface)] text-neutral-950">
      <SiteHeader githubStarCount={githubStarCount} />
      <Outlet />
    </main>
  );
}

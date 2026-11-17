import { createFileRoute, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { NewsletterSignup } from "@/components/newsletter-signup";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { loadGithubStarCount } from "@/lib/github-stars";

export const Route = createFileRoute("/_marketing")({
  // Fetch once at SSR/prerender time, not once per visitor.
  loader: async () => ({ githubStarCount: await loadGithubStarCount() }),
  // The value is fixed per build; never refetch it on client navigation.
  staleTime: Infinity,
  component: MarketingLayout,
});

function MarketingLayout() {
  const { githubStarCount } = Route.useLoaderData();
  const { pathname } = useLocation();

  // The home route owns the full viewport width and footer;
  // every other marketing page gets the shared marketing canvas and footer.
  const isHome = pathname === "/";

  // On the landing route, paint html/body cream so the area behind the
  // header and any overscroll matches the landing canvas.
  useEffect(() => {
    if (!isHome) return;
    const root = document.documentElement;
    const prevRoot = root.style.backgroundColor;
    const prevBody = document.body.style.backgroundColor;
    root.style.backgroundColor = "#f5f1ec";
    document.body.style.backgroundColor = "#f5f1ec";
    return () => {
      root.style.backgroundColor = prevRoot;
      document.body.style.backgroundColor = prevBody;
    };
  }, [isHome]);

  return (
    <main className="fd-light min-h-screen bg-[var(--color-surface)] text-[var(--color-brand)]">
      <SiteHeader githubStarCount={githubStarCount} />

      {isHome ? (
        <Outlet />
      ) : (
        <div className="mx-auto max-w-5xl px-6 py-16 md:py-24">
          <Outlet />
          <MarketingFooter />
        </div>
      )}
    </main>
  );
}

function MarketingFooter() {
  return (
    <>
      {/* Newsletter */}
      <div className="mt-16 border-t border-[var(--color-border-subtle)] pt-8">
        <p className="text-sm font-semibold text-neutral-900">
          Stay in the loop
        </p>
        <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
          Product updates, new features, and the occasional behind-the-scenes.
        </p>
        <div className="mt-3">
          <NewsletterSignup />
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8">
        <SiteFooter className="text-xs text-neutral-600 [&_a]:transition-colors [&_a]:hover:text-neutral-900" />
      </div>
    </>
  );
}

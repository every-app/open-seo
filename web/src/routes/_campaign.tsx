import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { SIGNUP_URL } from "@/components/landing-page";

/**
 * Layout for paid-traffic landing pages. No site navigation: the only ways
 * out are the logo and the page's own calls to action.
 */
export const Route = createFileRoute("/_campaign")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex" }],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap",
      },
    ],
  }),
  component: CampaignLayout,
});

function CampaignLayout() {
  usePassCampaignParamsToSignup();

  return (
    <div className="itc itc-campaign">
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 md:pt-8">
        <nav className="itc-campaign-nav mx-auto flex min-h-14 max-w-5xl items-center justify-between gap-3 rounded-full border border-[var(--color-border-subtle)] bg-white/90 py-2 pl-5 pr-2 shadow-sm shadow-neutral-900/5">
          <Link
            to="/"
            className="text-sm font-semibold transition-opacity hover:opacity-80"
          >
            OpenSEO
          </Link>
          <a
            href={SIGNUP_URL}
            className="inline-flex h-9 items-center rounded-full bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Start free trial
          </a>
        </nav>
      </div>

      <Outlet />

      <footer className="itc-campaign-footer itc-caption itc-subtle">
        <div className="itc-container">
          <p style={{ margin: 0 }}>© 2026 Every App, Inc.</p>
          <nav aria-label="Legal">
            <a href="/privacy">Privacy</a>
            <a href="/terms-and-conditions">Terms</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * Carry the ad's UTM tags onto app sign-up links so a completed signup can be
 * tied back to the campaign that sent it. Rewrites the link at click time, so
 * it also covers links that render later, like the free tool's upsell.
 */
function usePassCampaignParamsToSignup() {
  useEffect(() => {
    const utm = [...new URLSearchParams(window.location.search)].filter(
      ([key]) => key.startsWith("utm_"),
    );
    if (utm.length === 0) return;

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>(
        `a[href^="${SIGNUP_URL}"]`,
      );
      if (!link) return;
      const url = new URL(link.href);
      for (const [key, value] of utm) url.searchParams.set(key, value);
      link.href = url.toString();
    };
    document.addEventListener("click", onClick, { capture: true });
    return () =>
      document.removeEventListener("click", onClick, { capture: true });
  }, []);
}

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { SIGNUP_URL } from "@/components/landing-page";
import { PrivacyChoicesLink } from "@/components/privacy-choices";

/**
 * Layout for paid-traffic landing pages. No site navigation: each page brings
 * its own header, and the only way out is the page's own calls to action.
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
  useTrackSignupClicks();

  return (
    <div className="itc itc-campaign">
      <Outlet />

      <footer className="itc-campaign-footer itc-caption itc-subtle">
        <div className="itc-container">
          <p style={{ margin: 0 }}>© 2026 Every App, Inc.</p>
          <nav aria-label="Legal">
            {/* The only links that leave the page besides sign-up. The pixel
                can load here, and Meta's Business Tools Terms want every page
                it runs on to link to how it's used and how to opt out. Terms
                are agreed to on the sign-up page. */}
            <a href="/privacy">Privacy</a>
            <PrivacyChoicesLink />
          </nav>
        </div>
      </footer>
    </div>
  );
}

/**
 * Count sign-up clicks as a Plausible goal, which Plausible attributes to the
 * visit's campaign, and carry the ad's UTM tags onto the sign-up link so a
 * completed signup can be tied back to the campaign that sent it. Rewrites the
 * link at click time, so it also covers links that render later, like the free
 * tool's upsell.
 */
function useTrackSignupClicks() {
  useEffect(() => {
    const utm = [...new URLSearchParams(window.location.search)].filter(
      ([key]) => key.startsWith("utm_"),
    );

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>(
        `a[href^="${SIGNUP_URL}"]`,
      );
      if (!link) return;
      // Cookieless, like the rest of the site's visit statistics.
      const plausible: unknown = Reflect.get(window, "plausible");
      if (typeof plausible === "function") plausible("Start trial click");
      if (utm.length === 0) return;
      const url = new URL(link.href);
      for (const [key, value] of utm) url.searchParams.set(key, value);
      link.href = url.toString();
    };
    document.addEventListener("click", onClick, { capture: true });
    return () =>
      document.removeEventListener("click", onClick, { capture: true });
  }, []);
}

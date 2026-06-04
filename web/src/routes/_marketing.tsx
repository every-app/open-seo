import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { SiteFooter } from "@/components/site-footer";
import { featureGroups } from "@/lib/feature-pages";

const githubStarCount = "2.1k";

const mobileNavItems = [
  {
    label: "Product",
    links: [
      { label: "Features", href: "/features" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    label: "Resources",
    links: [
      { label: "Guides", href: "/guides" },
      { label: "Why Open Source?", href: "/open-source-seo" },
      { label: "MCP Setup", href: "/docs/mcp" },
      { label: "Skills", href: "/docs/skills" },
    ],
  },
  {
    label: "Community",
    links: [
      {
        label: `GitHub ${githubStarCount}`,
        href: "https://github.com/every-app/open-seo",
      },
    ],
  },
];

function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function MenuIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}

function CloseIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <main
      className="bg-white text-neutral-900 min-h-screen"
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 md:pt-8">
        <div className="relative mx-auto max-w-5xl">
          <nav className="grid min-h-14 grid-cols-[1fr_auto] items-center gap-3 rounded-full border border-neutral-200 bg-white/95 px-4 py-2.5 shadow-sm shadow-neutral-900/5 md:grid-cols-[1fr_auto_1fr] md:px-5">
            <Link
              to="/"
              className="text-sm font-semibold hover:opacity-80 transition-opacity"
            >
              OpenSEO
            </Link>

            <div className="hidden items-center justify-center gap-5 md:flex">
              <FeatureDropdown />
              <ResourcesDropdown />
              <Link
                to="/pricing"
                className="text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900"
              >
                Pricing
              </Link>
            </div>

            <div className="flex items-center justify-end gap-2 sm:gap-3">
              <button
                type="button"
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((open) => !open)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-900 transition-colors hover:bg-neutral-100 md:hidden"
              >
                {mobileMenuOpen ? <CloseIcon /> : <MenuIcon />}
              </button>
              <a
                href="https://github.com/every-app/open-seo"
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`GitHub, ${githubStarCount} stars`}
                className="hidden h-9 items-center gap-1.5 px-2 text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900 md:inline-flex"
              >
                <GitHubIcon size={16} />
                <span>GitHub</span>
                <span className="text-neutral-500">{githubStarCount}</span>
              </a>
              <a
                href="https://app.openseo.so/sign-in"
                className="hidden h-9 items-center rounded-full border border-neutral-300 px-4 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-900 md:inline-flex"
              >
                Sign in
              </a>
            </div>
          </nav>

          {mobileMenuOpen ? (
            <div className="absolute left-0 right-0 top-full z-30 mt-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-xl shadow-neutral-900/10 md:hidden">
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="https://app.openseo.so/sign-in"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-xl bg-neutral-950 px-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
                >
                  Try OpenSEO
                </a>
                <a
                  href="https://app.openseo.so/sign-in"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-11 items-center justify-center rounded-xl border border-neutral-200 px-3 text-sm font-semibold text-neutral-800 transition-colors hover:border-neutral-300 hover:bg-neutral-50"
                >
                  Sign in
                </a>
              </div>

              <div className="mt-3 space-y-3">
                {mobileNavItems.map((section) => (
                  <div key={section.label}>
                    <p className="px-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                      {section.label}
                    </p>
                    <div className="mt-1 space-y-1">
                      {section.links.map((item) => (
                        <a
                          key={item.href}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex min-h-10 items-center rounded-xl px-2 text-sm font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 hover:text-neutral-950"
                        >
                          {item.label}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <Outlet />
        <MarketingFooter />
      </div>
    </main>
  );
}

function ResourcesDropdown() {
  const resources = [
    {
      label: "Guides",
      href: "/guides",
      description: "Founder-focused SEO articles.",
    },
    {
      label: "Why Open Source?",
      href: "/open-source-seo",
      description: "Open source puts the power in user's hands.",
    },
    {
      label: "MCP",
      href: "/docs/mcp",
      description: "Connect OpenSEO to AI clients.",
    },
    {
      label: "Skills",
      href: "/docs/skills",
      description: "Focused OpenSEO workflows.",
    },
  ];

  return (
    <div className="relative group">
      <a
        href="/guides"
        className="text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900 md:hidden"
      >
        Resources
      </a>
      <button
        type="button"
        className="hidden text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900 md:inline-flex"
      >
        Resources
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-[260px] -translate-x-1/2 pt-4 opacity-0 transition md:block group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <div className="rounded-lg border border-neutral-200 bg-white p-3 shadow-xl shadow-neutral-900/10">
          {resources.map((resource) => (
            <a
              key={resource.href}
              href={resource.href}
              className="block rounded-md px-3 py-2.5 transition-colors hover:bg-neutral-50"
            >
              <span className="block text-sm font-semibold text-neutral-900">
                {resource.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
                {resource.description}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function FeatureDropdown() {
  return (
    <div className="relative group">
      <Link
        to="/features"
        className="text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900 md:hidden"
      >
        Features
      </Link>
      <button
        type="button"
        className="hidden text-sm font-semibold text-neutral-600 transition-colors hover:text-neutral-900 md:inline-flex"
      >
        Features
      </button>
      <div className="pointer-events-none absolute left-1/2 top-full z-20 hidden w-[560px] -translate-x-1/2 pt-4 opacity-0 transition md:block group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100">
        <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-xl shadow-neutral-900/10">
          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {featureGroups.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  {group.label}
                </p>
                <div className="mt-3 space-y-1">
                  {group.pages.map((page) => (
                    <a
                      key={page.slug}
                      href={`/features/${page.slug}`}
                      className="block rounded-md px-2 py-1.5 transition-colors hover:bg-neutral-50"
                    >
                      <span className="block text-sm font-semibold text-neutral-900">
                        {page.eyebrow}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
                        {page.navDescription}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            ))}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                AI agents
              </p>
              <div className="mt-3 space-y-2">
                <a
                  href="/features/mcp"
                  className="block rounded-md p-2 transition-colors hover:bg-neutral-50"
                >
                  <span className="text-sm font-semibold text-neutral-900">
                    OpenSEO MCP
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
                    Connect Claude, Codex, and agents.
                  </span>
                </a>
                <a
                  href="/google-search-console-mcp"
                  className="block rounded-md p-2 transition-colors hover:bg-neutral-50"
                >
                  <span className="text-sm font-semibold text-neutral-900">
                    Search Console MCP
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-neutral-600">
                    Free first-party GSC data for agents.
                  </span>
                </a>
                <a
                  href="/features"
                  className="block rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm font-medium text-neutral-900 transition-colors hover:border-neutral-900"
                >
                  View all features <span aria-hidden="true">&rarr;</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function useNewsletter() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "success" | "error"
  >("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { error?: string }).error || "Something went wrong",
        );
      }
      setStatus("success");
      setEmail("");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong",
      );
    }
  };

  return { email, setEmail, status, errorMessage, handleSubmit };
}

function MarketingFooter() {
  const nl = useNewsletter();

  return (
    <>
      {/* Newsletter */}
      <div className="mt-12 pt-8 border-t border-neutral-200">
        <p className="text-sm font-semibold text-neutral-900">
          Stay in the loop
        </p>
        <p className="text-sm text-neutral-600 mt-1 leading-relaxed">
          Product updates, new features, and the occasional behind-the-scenes.
        </p>
        <div className="mt-3">
          {nl.status === "success" ? (
            <p className="text-sm text-neutral-900">You&apos;re on the list.</p>
          ) : (
            <form onSubmit={nl.handleSubmit} autoComplete="on">
              <div className="flex gap-2">
                <input
                  id="newsletter-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={nl.email}
                  onChange={(e) => nl.setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 min-w-0 h-10 px-3 text-sm border border-neutral-300 rounded-md bg-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-900 transition-all"
                  disabled={nl.status === "loading"}
                />
                <button
                  type="submit"
                  disabled={nl.status === "loading"}
                  className="h-10 px-5 text-sm font-medium bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors disabled:opacity-50 shrink-0"
                >
                  {nl.status === "loading" ? "..." : "Subscribe"}
                </button>
              </div>
              {nl.status === "error" && (
                <p className="text-red-600 text-xs mt-2">{nl.errorMessage}</p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-8">
        <SiteFooter className="text-xs text-neutral-600 [&_a]:hover:text-neutral-900 [&_a]:transition-colors" />
      </div>
    </>
  );
}

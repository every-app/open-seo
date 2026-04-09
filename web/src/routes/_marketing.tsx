import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useState } from "react";
import { SiteFooter } from "@/components/site-footer";

function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

export const Route = createFileRoute("/_marketing")({
  component: MarketingLayout,
});

function MarketingLayout() {
  return (
    <main
      className="bg-white text-neutral-900 min-h-screen"
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        <nav className="flex items-center justify-between mb-20">
          <Link
            to="/"
            className="text-sm font-semibold hover:opacity-80 transition-opacity"
          >
            OpenSEO
          </Link>
          <div className="flex items-center gap-5">
            <Link
              to="/pricing"
              className="text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              Pricing
            </Link>
            <a
              href="https://github.com/every-app/open-seo"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-neutral-600 hover:text-neutral-900 transition-colors"
            >
              <GitHubIcon size={16} />
              <span>GitHub</span>
            </a>
            <a
              href="https://app.openseo.so/sign-in"
              className="h-8 px-3.5 text-sm font-medium border border-neutral-300 text-neutral-900 rounded-md hover:border-neutral-900 transition-colors inline-flex items-center"
            >
              Sign in
            </a>
          </div>
        </nav>
        <Outlet />
        <MarketingFooter />
      </div>
    </main>
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
          Product updates, new features, and the occasional
          behind-the-scenes.
        </p>
        <div className="mt-3">
          {nl.status === "success" ? (
            <p className="text-sm text-neutral-900">
              You&apos;re on the list.
            </p>
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
                <p className="text-red-600 text-xs mt-2">
                  {nl.errorMessage}
                </p>
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

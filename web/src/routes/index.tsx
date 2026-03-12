import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toCanonicalUrl } from "@/lib/seo";

const homeTitle = "OpenRank - Own Your SEO";
const homeDescription =
  "Own your SEO. Pay only for what you use. No subscriptions. Open source alternative to Semrush and Ahrefs.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: homeTitle },
      { name: "description", content: homeDescription },
      { property: "og:type", content: "website" },
      { property: "og:title", content: homeTitle },
      { property: "og:description", content: homeDescription },
      { property: "og:url", content: toCanonicalUrl("/") },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: homeTitle },
      { name: "twitter:description", content: homeDescription },
    ],
    links: [{ rel: "canonical", href: toCanonicalUrl("/") }],
  }),
  component: Home,
});

// ─── Shared ──────────────────────────────────────────────────────────

function GitHubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function useWaitlist() {
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

function FooterLinks({ className }: { className?: string }) {
  return (
    <div className={`flex items-center gap-6 ${className || ""}`}>
      <a
        href="https://github.com/every-app/open-seo"
        target="_blank"
        rel="noopener noreferrer"
      >
        GitHub
      </a>
      <a
        href="https://discord.gg/c9uGs3cFXr"
        target="_blank"
        rel="noopener noreferrer"
      >
        Discord
      </a>
      <Link to="/privacy">Privacy</Link>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────

function Home() {
  const wl = useWaitlist();

  return (
    <main
      className="bg-white text-neutral-900 min-h-screen"
      style={{
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div className="max-w-3xl mx-auto px-6 py-16 md:py-24">
        {/* Nav */}
        <nav className="flex items-center justify-between mb-20">
          <span className="text-sm font-semibold">OpenRank</span>
          <a
            href="https://github.com/every-app/open-seo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors"
            aria-label="GitHub"
          >
            <GitHubIcon size={16} />
            <span>GitHub</span>
          </a>
        </nav>

        {/* Headline */}
        <h1 className="text-3xl font-bold tracking-tight leading-tight">
          Own your SEO
        </h1>

        <p className="text-neutral-700 mt-4 leading-relaxed">
          Open source alternative to Semrush and Ahrefs
        </p>

        {/* Features */}
        <ul className="mt-5 space-y-3">
          {[
            "Keyword Research",
            "Competitor Domain Insights",
            "Site Audits",
            "Backlinks, Rank Tracking and more (Coming soon)",
          ].map((item) => (
            <li key={item} className="flex gap-2.5 text-sm text-neutral-800">
              <span className="text-neutral-500 mt-[2px]">&mdash;</span>
              {item}
            </li>
          ))}
        </ul>

        {/* Form */}
        <div className="mt-6">
          {wl.status === "success" ? (
            <p className="text-sm text-neutral-900">You&apos;re on the list.</p>
          ) : (
            <form onSubmit={wl.handleSubmit} autoComplete="on">
              <div className="flex gap-2">
                <input
                  id="waitlist-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={wl.email}
                  onChange={(e) => wl.setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="flex-1 min-w-0 h-10 px-3 text-sm border border-neutral-300 rounded-md bg-white placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-neutral-900 transition-all"
                  disabled={wl.status === "loading"}
                />
                <button
                  type="submit"
                  disabled={wl.status === "loading"}
                  className="h-10 px-5 text-sm font-medium bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition-colors disabled:opacity-50 shrink-0"
                >
                  {wl.status === "loading" ? "..." : "Notify me"}
                </button>
              </div>
              {wl.status === "error" && (
                <p className="text-red-600 text-xs mt-2">{wl.errorMessage}</p>
              )}
            </form>
          )}
          <p className="text-xs text-neutral-600 mt-3">
            Get notified when the managed version is ready and when we add new
            features.
          </p>
        </div>

        <div className="mt-8 rounded-lg border border-neutral-200 bg-neutral-50 px-5 py-5">
          <p className="text-sm font-semibold text-neutral-900">
            Self-host today via Docker or Cloudflare
          </p>
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
            Bring your own DataForSEO API key. Pay by usage, not per month. 100%
            open source (MIT).
          </p>
          <a
            href="https://github.com/every-app/open-seo"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-3 text-sm font-medium text-neutral-900 hover:text-neutral-700 transition-colors"
          >
            View on GitHub
            <span aria-hidden="true">&rarr;</span>
          </a>
          <hr className="mt-4" />
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">
            If you don't want to self host or the DataForSEO minimum commitments
            are too high, sign up in the form above and we'll notify you when
            the managed version is released.
          </p>
        </div>

        {/* Demo */}
        <div className="mt-8">
          <video
            className="w-full rounded-md border border-neutral-200"
            width={1280}
            height={808}
            poster="/demo-poster.webp"
            autoPlay
            muted
            loop
            playsInline
            preload="none"
            aria-label="OpenRank product demo"
          >
            <source src="/demo.webm" type="video/webm" />
            <source src="/demo.mp4" type="video/mp4" />
            <img
              src="/demo-poster.webp"
              alt="OpenRank product demo"
              width={1280}
              height={808}
              className="w-full rounded-md border border-neutral-200"
              loading="lazy"
              decoding="async"
            />
          </video>
          <p className="text-[11px] text-neutral-600 mt-2">
            Keyword research in OpenRank
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-8 border-t border-neutral-200">
          <FooterLinks className="text-xs text-neutral-600 [&_a]:hover:text-neutral-900 [&_a]:transition-colors" />
        </div>
      </div>
    </main>
  );
}

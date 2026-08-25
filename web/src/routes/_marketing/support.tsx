import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { buildPageSeo } from "@/lib/seo";

const SUPPORT_EMAIL = "ben@openseo.so";
const DISCORD_URL = "https://discord.gg/c9uGs3cFXr";
const GITHUB_ISSUES_URL = "https://github.com/every-app/open-seo/issues";

export const Route = createFileRoute("/_marketing/support")({
  head: () =>
    buildPageSeo({
      title: "Support",
      description:
        "Get help with OpenSEO, share feedback, or report an issue by email, Discord, or GitHub.",
      path: "/support",
      titleSuffix: "OpenSEO",
    }),
  component: SupportPage,
});

function SupportPage() {
  const [copied, setCopied] = useState(false);

  async function copyEmail() {
    await navigator.clipboard.writeText(SUPPORT_EMAIL);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <article className="mx-auto max-w-4xl">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Help &amp; Community
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          We want to hear from you
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
          We want to talk to you! We&apos;re super open to feedback and want to
          learn how you work so we can make OpenSEO better.
        </p>
      </header>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        <section className="flex min-h-64 flex-col rounded-xl border border-[var(--color-border-subtle)] bg-white p-6">
          <p className="font-mono text-xs text-[var(--color-brand-accent)]">
            01
          </p>
          <h2 className="mt-6 text-xl font-semibold tracking-tight text-neutral-950">
            Email
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
            Send ideas, problems, questions, or feedback directly.
          </p>
          <button
            type="button"
            onClick={copyEmail}
            aria-live="polite"
            className="mt-auto inline-flex w-fit items-center gap-2 pt-6 text-sm font-medium text-neutral-950 transition-colors hover:text-[var(--color-brand-accent)]"
          >
            <span className="font-mono text-xs">{SUPPORT_EMAIL}</span>
            {copied ? <CheckIcon /> : <CopyIcon />}
            <span className="sr-only">{copied ? "Copied" : "Copy email"}</span>
          </button>
        </section>

        <SupportCard
          number="02"
          title="Discord"
          description="Ask for help, share ideas and learn from the community."
          href={DISCORD_URL}
          linkText="Join the Discord"
        />

        <SupportCard
          number="03"
          title="GitHub Issues"
          description="Report bugs or request features on GitHub."
          href={GITHUB_ISSUES_URL}
          linkText="Open an issue"
        />
      </div>
    </article>
  );
}

function SupportCard({
  number,
  title,
  description,
  href,
  linkText,
}: {
  number: string;
  title: string;
  description: string;
  href: string;
  linkText: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-64 flex-col rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 transition-all hover:-translate-y-0.5 hover:border-neutral-950 hover:shadow-lg hover:shadow-neutral-900/5"
    >
      <p className="font-mono text-xs text-[var(--color-brand-accent)]">
        {number}
      </p>
      <h2 className="mt-6 text-xl font-semibold tracking-tight text-neutral-950">
        {title}
      </h2>
      <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
        {description}
      </p>
      <span className="mt-auto inline-flex items-center gap-2 pt-6 text-sm font-medium text-neutral-950">
        {linkText}
        <span
          aria-hidden="true"
          className="transition-transform group-hover:translate-x-1"
        >
          &rarr;
        </span>
      </span>
    </a>
  );
}

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 text-neutral-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5 text-[var(--color-brand-accent)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

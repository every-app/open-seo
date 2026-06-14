import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const navLinks = [
  { label: "Features", to: "/features" },
  { label: "Blog", to: "/blogs" },
  { label: "Docs", to: "/docs" },
  { label: "Pricing", to: "/pricing" },
] as const;

export function BlogLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--color-surface)] text-neutral-950">
      <header className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
          <Link
            to="/"
            className="shrink-0 text-base font-semibold text-neutral-950 transition-opacity hover:opacity-80"
          >
            OpenSEO
          </Link>

          <nav
            aria-label="Blog navigation"
            className="flex min-w-0 items-center justify-end gap-4 overflow-x-auto text-sm font-medium text-[var(--color-brand-muted)] sm:gap-6"
          >
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`shrink-0 transition-colors hover:text-neutral-950 ${
                  link.label === "Features" || link.label === "Pricing"
                    ? "hidden sm:inline"
                    : ""
                }`}
                activeProps={{ className: "text-neutral-950" }}
              >
                {link.label}
              </Link>
            ))}
            <a
              href="https://github.com/every-app/open-seo"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden shrink-0 transition-colors hover:text-neutral-950 sm:inline"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      {children}
    </main>
  );
}

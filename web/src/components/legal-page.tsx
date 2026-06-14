import { HomeLayout } from "fumadocs-ui/layouts/home";
import { DocsBody } from "fumadocs-ui/page";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { baseOptions } from "@/lib/layout.shared";

type LegalPageProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function LegalPage({ title, description, children }: LegalPageProps) {
  return (
    <HomeLayout {...baseOptions()}>
      <article className="mx-auto max-w-3xl bg-[var(--color-surface)] px-6 py-12 text-neutral-950 md:py-24">
        <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
          <h1 className="mb-4 text-4xl font-semibold tracking-tight md:text-6xl">
            {title}
          </h1>
          {description ? (
            <p className="text-lg leading-8 text-[var(--color-brand-muted)]">
              {description}
            </p>
          ) : null}
        </header>

        <DocsBody className="text-neutral-800 [&_a]:!text-neutral-950 [&_a]:underline [&_a]:decoration-[var(--color-brand-accent)] [&_a]:underline-offset-4 [&_h2]:text-neutral-950 [&_h3]:text-neutral-950 [&_li]:text-neutral-700 [&_p]:text-neutral-700 [&_strong]:text-neutral-950">
          {children}
        </DocsBody>

        <div className="mt-16 border-t border-[var(--color-border-subtle)] pt-8">
          <SiteFooter className="text-xs text-neutral-600 [&_a]:transition-colors [&_a]:hover:text-neutral-900" />
        </div>
      </article>
    </HomeLayout>
  );
}

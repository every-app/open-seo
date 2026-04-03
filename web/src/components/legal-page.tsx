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
      <article className="max-w-3xl mx-auto px-6 py-12 md:py-24">
        <header className="mb-8">
          <h1 className="text-4xl font-bold mb-4">{title}</h1>
          {description ? (
            <p className="text-lg text-fd-muted-foreground">
              {description}
            </p>
          ) : null}
        </header>

        <DocsBody>{children}</DocsBody>

        <div className="mt-12 border-t border-neutral-200 pt-8">
          <SiteFooter className="text-xs text-neutral-600 [&_a]:transition-colors [&_a]:hover:text-neutral-900" />
        </div>
      </article>
    </HomeLayout>
  );
}

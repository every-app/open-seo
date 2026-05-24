import { Link } from "@tanstack/react-router";
import { DocsBody } from "fumadocs-ui/page";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { Suspense } from "react";
import { RunSkillCallout } from "@/components/run-skill-callout";

type ContentPostProps = {
  backLabel: string;
  backTo: "/docs";
  title: string;
  description?: string;
  Content: React.ComponentType;
};

export const mdxComponents = {
  ...defaultMdxComponents,
  RunSkillCallout,
};

export function ContentPost({
  backLabel,
  backTo,
  title,
  description,
  Content,
}: ContentPostProps) {
  return (
    <article className="mx-auto w-full min-w-0 max-w-3xl px-6 py-12 text-fd-foreground md:py-24">
      <header className="mb-8">
        <div className="mb-4">
          <Link
            to={backTo}
            className="inline-flex items-center gap-2 text-sm font-medium text-fd-muted-foreground transition-colors hover:text-fd-primary"
          >
            <span aria-hidden="true">&larr;</span>
            <span>{backLabel}</span>
          </Link>
        </div>
        <h1 className="mb-4 break-words text-4xl font-bold text-fd-foreground md:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-lg leading-8 text-fd-muted-foreground md:text-xl">
            {description}
          </p>
        ) : null}
      </header>
      <Suspense>
        <DocsBody className="min-w-0 text-fd-foreground [&_figure]:max-w-full [&_h2]:text-fd-foreground [&_h3]:text-fd-foreground [&_li]:text-fd-foreground/90 [&_p]:text-fd-foreground/90 [&_pre]:!min-w-0 [&_pre]:!w-full [&_strong]:text-fd-foreground">
          <Content />
        </DocsBody>
      </Suspense>
    </article>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import RoadmapContent, {
  frontmatter as roadmapFrontmatter,
} from "../../../content/marketing/roadmap.md";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/roadmap")({
  head: () =>
    buildPageSeo({
      title: roadmapFrontmatter.title,
      description: roadmapFrontmatter.description,
      path: "/roadmap",
      titleSuffix: "OpenSEO",
    }),
  component: Roadmap,
});

function Roadmap() {
  return (
    <article className="mx-auto max-w-3xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {roadmapFrontmatter.title}
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-[var(--color-brand-muted)]">
          {roadmapFrontmatter.description}
        </p>
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_a]:font-medium [&_a]:underline [&_a]:decoration-[var(--color-brand-accent)] [&_a]:underline-offset-4 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_li]:!text-neutral-700 [&_p]:!text-neutral-700">
        <RoadmapContent components={defaultMdxComponents} />
      </DocsBody>
    </article>
  );
}

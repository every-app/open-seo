import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import AboutContent, {
  frontmatter,
} from "../../../content/marketing/about.mdx";
import { appLinks, brand } from "@/lib/brand";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/about")({
  head: () =>
    buildPageSeo({
      title: frontmatter.title,
      description: frontmatter.description,
      path: "/about",
    }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-10">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {frontmatter.title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          {frontmatter.description}
        </p>
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        <AboutContent components={defaultMdxComponents} />
      </DocsBody>

      <a
        href={appLinks.signUp}
        className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
      >
        Try {brand.name}
      </a>
    </article>
  );
}

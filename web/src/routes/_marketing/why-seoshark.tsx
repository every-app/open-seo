import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import WhyContent, {
  frontmatter,
} from "../../../content/marketing/why-seoshark.mdx";
import { appLinks, brand } from "@/lib/brand";
import { buildPageSeo } from "@/lib/seo";

export const Route = createFileRoute("/_marketing/why-seoshark")({
  head: () =>
    buildPageSeo({
      title: `Why ${brand.name}? SEO for You and Your AI Agent`,
      description: frontmatter.description,
      path: "/why-seoshark",
    }),
  component: WhyPage,
});

function WhyPage() {
  return (
    <article className="mx-auto max-w-3xl text-neutral-900">
      <header className="mb-10 border-b border-[var(--color-border-subtle)] pb-8">
        <h1 className="text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {frontmatter.title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          Make SEO simple. Put AI to work for your business.
        </p>
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_li]:!text-neutral-700 [&_li_a]:font-medium [&_li_a]:underline [&_li_a]:decoration-[var(--color-brand-accent)] [&_li_a]:underline-offset-4 [&_li_a:hover]:!text-neutral-700 [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        <WhyContent components={defaultMdxComponents} />
      </DocsBody>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <a
          href={appLinks.signUp}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Get started
        </a>
        <a
          href="/docs/agent-setup"
          className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--color-border-subtle)] bg-white px-5 text-sm font-medium text-neutral-950 transition-colors hover:border-neutral-950"
        >
          Connect your AI agent
        </a>
      </div>
    </article>
  );
}

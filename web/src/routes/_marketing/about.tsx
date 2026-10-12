import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import AboutContent, {
  frontmatter,
} from "../../../content/marketing/about.mdx";
import { buildPageSeo } from "@/lib/seo";
import { SocialLinks } from "@/components/social-links";

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
      <header className="mb-10 grid items-center gap-8 border-b border-[var(--color-border-subtle)] pb-10 sm:grid-cols-[1fr_13rem]">
        <div>
          <h1 className="text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
            {frontmatter.title}
          </h1>
          <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
            Hey, I'm Ben, the founder of OpenSEO.
          </p>
        </div>
        <figure className="w-48 sm:w-full">
          <img
            src="/images/ben-founder.jpg"
            alt="Ben, founder of OpenSEO"
            width={1226}
            height={1224}
            className="h-auto w-full rounded-2xl"
          />
          <figcaption className="mt-3 text-sm text-[var(--color-brand-muted)]">
            Ben · Founder, OpenSEO
          </figcaption>
        </figure>
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-[var(--color-brand-accent)] [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        <AboutContent components={defaultMdxComponents} />
      </DocsBody>

      <section className="mt-10 border-t border-[var(--color-border-subtle)] pt-8">
        <h2 className="text-xl font-semibold tracking-tight text-neutral-950">
          Follow OpenSEO
        </h2>
        <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
          Find us on YouTube, X, LinkedIn, and Instagram.
        </p>
        <div className="mt-3 text-sm text-neutral-700">
          <SocialLinks />
        </div>
      </section>

      <a
        href="https://app.openseo.so/sign-up"
        className="mt-8 inline-flex h-11 items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
      >
        Try OpenSEO
      </a>
    </article>
  );
}

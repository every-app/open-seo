import type { ReactNode } from "react";
import { appLinks, brand } from "@/lib/brand";
import { trackTool } from "@/lib/free-tools/analytics";
import { type FreeTool, freeTools } from "@/lib/free-tools/tool-pages";
import { buildBreadcrumbJsonLd, SITE_URL, toCanonicalUrl } from "@/lib/seo";

const SIGNUP_URL = appLinks.signUp;

type ToolHighlight = { title: string; description: string };

type ToolFrameProps = {
  tool: FreeTool;
  heading: string;
  subhead: string;
  highlights: ToolHighlight[];
  faqs: ToolFaq[];
  cta: { heading: string; body: string; featureLabel: string };
  children: ReactNode;
};

/**
 * The shared shape of a free tool page: hero, the tool itself, what you get,
 * FAQ, closing CTA, sibling tools, and the JSON-LD blocks.
 */
export function ToolFrame({
  tool,
  heading,
  subhead,
  highlights,
  faqs,
  cta,
  children,
}: ToolFrameProps) {
  return (
    <article className="mx-auto max-w-5xl">
      <header className="max-w-3xl">
        <p className="text-sm font-medium text-[var(--color-brand-accent)]">
          Free tool
        </p>
        <h1 className="mt-3 text-4xl font-semibold leading-tight tracking-tight text-neutral-950 md:text-6xl">
          {heading}
        </h1>
        <p className="mt-5 text-lg leading-8 text-[var(--color-brand-muted)]">
          {subhead}
        </p>
      </header>

      <div className="mt-8">{children}</div>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          What you get
        </h2>
        <ol className="mt-5 grid gap-4 md:grid-cols-3">
          {highlights.map((item, index) => (
            <li
              key={item.title}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-5"
            >
              <span className="font-mono text-sm tabular-nums text-[var(--color-brand-accent)]">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-base font-semibold text-neutral-950">
                {item.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-[var(--color-brand-muted)]">
                {item.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          FAQ
        </h2>
        <div className="mt-5 divide-y divide-[var(--color-border-subtle)] rounded-lg border border-[var(--color-border-subtle)] bg-white">
          {faqs.map((faq) => (
            <div key={faq.question} className="p-5">
              <h3 className="text-sm font-semibold text-neutral-900">
                {faq.question}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--color-brand-muted)]">
                {faq.answer}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-12 rounded-xl border border-[var(--color-border-subtle)] bg-white p-6 md:p-8">
        <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
          {cta.heading}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-brand-muted)]">
          {cta.body}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <a
            href={SIGNUP_URL}
            onClick={() => trackTool("tool_cta_click", tool.slug)}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try {brand.name}
            <span aria-hidden="true" className="ml-2">
              &rarr;
            </span>
          </a>
          <a
            href={tool.featureHref}
            className="text-sm font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
          >
            {cta.featureLabel}
            <span aria-hidden="true" className="ml-1">
              &rarr;
            </span>
          </a>
        </div>
      </section>

      <RelatedTools tool={tool} />

      {buildToolJsonLd(tool, faqs).map((block) => (
        <script
          key={block["@type"]}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </article>
  );
}

function RelatedTools({ tool }: { tool: FreeTool }) {
  return (
    <section className="mt-12">
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-950">
        More free tools
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {tool.related
          .map((slug) => freeTools[slug])
          .map((sibling) => (
            <a
              key={sibling.slug}
              href={sibling.path}
              className="rounded-lg border border-[var(--color-border-subtle)] bg-white p-4 transition-colors hover:border-neutral-900"
            >
              <span className="text-sm font-medium text-neutral-950">
                {sibling.name}
                <span
                  aria-hidden="true"
                  className="ml-1 text-[var(--color-brand-accent)]"
                >
                  &rarr;
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-[var(--color-brand-muted)]">
                {sibling.shortDescription}
              </span>
            </a>
          ))}
      </div>
      <div className="mt-4">
        <a
          href="/tools"
          className="text-sm font-medium text-neutral-950 underline decoration-[var(--color-brand-accent)] underline-offset-4"
        >
          All free SEO tools
          <span aria-hidden="true" className="ml-1">
            &rarr;
          </span>
        </a>
      </div>
    </section>
  );
}

type ToolFaq = { question: string; answer: string };

/**
 * Every free tool page emits the same three blocks: the tool itself, its FAQ,
 * and the Home -> Free tools -> Tool trail.
 */
function buildToolJsonLd(tool: FreeTool, faqs: ToolFaq[]) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: `${brand.name} ${tool.name}`,
      applicationCategory: "SEO",
      operatingSystem: "Web",
      url: toCanonicalUrl(tool.path),
      description: tool.shortDescription,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      provider: {
        "@type": "Organization",
        name: brand.name,
        url: SITE_URL,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: { "@type": "Answer", text: faq.answer },
      })),
    },
    buildBreadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Free tools", path: "/tools" },
      { name: tool.name, path: tool.path },
    ]),
  ];
}

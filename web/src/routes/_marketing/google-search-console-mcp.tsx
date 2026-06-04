import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import { DocsBody } from "fumadocs-ui/page";
import GoogleSearchConsoleMcpContent, {
  frontmatter,
} from "../../../content/marketing/google-search-console-mcp.mdx";
import { ComparisonTable } from "@/components/comparison-table";
import { buildPageSeo, SITE_URL, toCanonicalUrl } from "@/lib/seo";

const PATH = "/google-search-console-mcp";

const softwareApplicationLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OpenSEO Google Search Console MCP",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  url: toCanonicalUrl(PATH),
  description: frontmatter.description,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  provider: {
    "@type": "Organization",
    name: "OpenSEO",
    url: SITE_URL,
  },
};

export const Route = createFileRoute("/_marketing/google-search-console-mcp")({
  head: () =>
    buildPageSeo({
      title: "Free Google Search Console MCP",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO",
      ogType: "article",
    }),
  component: GoogleSearchConsoleMcpPage,
});

function GoogleSearchConsoleMcpPage() {
  return (
    <article className="text-neutral-900">
      <header className="mb-10 border-b border-neutral-200 pb-8">
        <h1 className="text-3xl font-bold leading-tight tracking-tight text-neutral-950 md:text-4xl">
          {frontmatter.title}
        </h1>
        {frontmatter.description ? (
          <p className="mt-4 text-lg leading-8 text-neutral-700">
            {frontmatter.description}
          </p>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <a
            href="https://app.openseo.so/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
          >
            Try it now
            <span className="ml-2" aria-hidden="true">
              &rarr;
            </span>
          </a>
        </div>
      </header>

      <DocsBody className="min-w-0 text-neutral-800 [&_a]:!text-neutral-950 [&_h2]:!text-neutral-950 [&_h2_a]:!no-underline [&_h3]:!text-neutral-950 [&_h3_a]:!no-underline [&_h4]:!text-neutral-950 [&_h4_a]:!no-underline [&_h5_a]:!no-underline [&_h6_a]:!no-underline [&_li]:!text-neutral-700 [&_li_a]:font-medium [&_li_a]:underline [&_li_a]:decoration-neutral-300 [&_li_a]:underline-offset-4 [&_li_a:hover]:!text-neutral-700 [&_p]:!text-neutral-700 [&_p_a]:font-medium [&_p_a]:underline [&_p_a]:decoration-neutral-300 [&_p_a]:underline-offset-4 [&_p_a:hover]:!text-neutral-700 [&_strong]:!text-neutral-950">
        <GoogleSearchConsoleMcpContent
          components={{ ...defaultMdxComponents, ComparisonTable }}
        />
      </DocsBody>

      <GoogleSearchConsoleMcpCta />

      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationLd),
        }}
      />
    </article>
  );
}

function GoogleSearchConsoleMcpCta() {
  return (
    <section className="mt-14 border-t border-neutral-200 pt-8">
      <p className="text-lg font-semibold text-neutral-950">
        Point your AI at your real search data
      </p>
      <p className="mt-2 text-sm leading-relaxed text-neutral-600">
        Free to connect. No Google Cloud project. Works with Claude, Cursor, and
        ChatGPT.
      </p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a
          href="https://app.openseo.so/sign-up"
          className="inline-flex h-10 items-center justify-center rounded-md bg-neutral-950 px-4 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
        >
          Try it now
          <span className="ml-2" aria-hidden="true">
            &rarr;
          </span>
        </a>
        <a
          href="https://github.com/every-app/open-seo"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-950 transition-colors hover:border-neutral-950"
        >
          <GitHubIcon />
          Star on GitHub
        </a>
      </div>
    </section>
  );
}

function GitHubIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.79-.26.79-.58v-2.23c-3.34.73-4.03-1.42-4.03-1.42-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.49.99.11-.77.42-1.3.76-1.6-2.66-.31-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23.96-.27 1.98-.4 3-.4s2.05.14 3 .4c2.29-1.55 3.3-1.23 3.3-1.23.65 1.65.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.29c0 .32.19.69.8.58A12.01 12.01 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

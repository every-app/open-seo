import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/when-your-crawler-gets-blocked.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { SITE_AUDIT_LIBRARY } from "@/lib/strategy-libraries";

const PATH = "/library/site-audit/when-your-crawler-gets-blocked";

const faqs = [
  {
    question: "Why is my site blocking SEO crawlers but not Google?",
    answer:
      "Because bot-protection vendors verify Googlebot by reverse DNS lookup and allowlist it out of the box. Third-party crawlers have no equivalent verification path, so they hit the same generic rules as scrapers. The block is usually a default rather than a decision anyone made.",
  },
  {
    question: "What does a 429 mean during a site crawl?",
    answer:
      "Too many requests. The site served the crawler and then throttled it, which is a rate limit rather than a refusal. Slowing the crawl or allowlisting the user agent normally clears it. A 403 is the categorical version and needs a WAF rule change.",
  },
  {
    question: "How do I allow a crawler through Cloudflare?",
    answer:
      "Add a WAF custom rule that skips bot protection when the user agent contains the crawler's token, then re-run the crawl. For OpenSEO that token is OpenSEO-Audit. On some free tiers the managed bot rules cannot be skipped selectively, and you have to relax bot protection for the duration of the crawl.",
  },
  {
    question: "Can blocking bots hurt my SEO?",
    answer:
      "It can, when the rule catches more than it was written for. Googlebot is normally exempt, but Bingbot, AI crawlers, and preview fetchers are not, and a site that is invisible to everything except Google is making a bet on one channel. Check your access logs to see which crawlers are actually being refused rather than assuming.",
  },
  {
    question: "How do I know if a crawler is really Googlebot?",
    answer:
      "Reverse DNS on the requesting IP, then a forward lookup to confirm it resolves back to the same address. The user-agent string is trivially spoofed, so anything that identifies itself as Googlebot from an unverified IP should be treated as an impostor. Google publishes its IP ranges for the same purpose.",
  },
];

const faqLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

export const Route = createFileRoute(
  "/_marketing/library/site-audit/when-your-crawler-gets-blocked",
)({
  head: () =>
    buildPageSeo({
      title: "When Your Own SEO Crawler Gets Blocked",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: "OpenSEO Library",
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="When your own crawler gets blocked"
      path={PATH}
      library={SITE_AUDIT_LIBRARY}
    >
      <Content components={{ ...defaultMdxComponents }} />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd) }}
      />
    </LibrarySpokePage>
  ),
});

import { createFileRoute } from "@tanstack/react-router";
import defaultMdxComponents from "fumadocs-ui/mdx";
import Content, {
  frontmatter,
} from "../../../../../content/marketing/library/skills-memory-and-the-trace.mdx";
import { LibrarySpokePage } from "@/components/library-page";
import { buildPageSeo } from "@/lib/seo";
import { AI_AGENT_SEO_LIBRARY } from "@/lib/strategy-libraries";
import { brand } from "@/lib/brand";

const PATH = "/library/ai-agent-seo/skills-memory-and-the-trace";

const faqs = [
  {
    question: "What is an agent skill?",
    answer:
      `A file, usually SKILL.md, that tells an AI assistant how to do one job: which tools to call in what order, what to check, and what the output should look like. ${brand.name} ships skills for keyword research, competitor analysis, site audit, local SEO, link prospecting, reporting and project setup, so the assistant runs each workflow the same way every time.`,
  },
  {
    question:
      "Why does ChatGPT or Claude give different answers to the same prompt?",
    answer:
      "Because a blank chat is designed to vary; nothing constrains the route from prompt to answer. Saving the workflow as a skill, giving the assistant a memory it reads before each run, and asking it to log each step all reduce that variance. A skill in particular runs the same steps in the same order.",
  },
  {
    question: "How do I give an AI agent memory?",
    answer:
      `A plain-text store it reads before it starts: markdown files of decisions, transcripts and rules, or a structured project context like ${brand.name}'s, which holds goal, positioning, competitors, key pages and a research log. Feedback written into that store becomes a rule; feedback given once in chat is forgotten.`,
  },
  {
    question: "How do I know if an AI SEO report is accurate?",
    answer:
      "Make the assistant log every tool call and cite the log line for every number. A figure with no tool call behind it came from the model rather than the data. Then read the whole thing, not the first five rows, and only trust it in a domain where you would spot a wrong answer yourself.",
  },
  {
    question: `Does ${brand.name} have project memory?`,
    answer:
      "Yes. Each project holds a shared context: business overview, current goal, positioning, writing preferences, competitors, key pages and a research log. The MCP reads it with get_project_context and updates it with update_project_context, and the seo-project-setup skill fills it in on the first run.",
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
  "/_marketing/library/ai-agent-seo/skills-memory-and-the-trace",
)({
  head: () =>
    buildPageSeo({
      title: "Skills, Memory and the Trace: Make the Good Run Repeatable",
      description: frontmatter.description,
      path: PATH,
      titleSuffix: `${brand.name} Library`,
      ogType: "article",
    }),
  component: () => (
    <LibrarySpokePage
      title={frontmatter.title}
      description={frontmatter.description}
      crumb="Skills, memory and the trace"
      path={PATH}
      library={AI_AGENT_SEO_LIBRARY}
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

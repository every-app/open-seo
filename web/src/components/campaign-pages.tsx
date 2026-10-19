/**
 * Paid-traffic landing pages. Each one repeats its Meta ad's headline, keeps
 * proof and the first action on the first phone screen, and is assembled from
 * the homepage's own sections so the two never drift apart in style.
 */

import { type ReactNode, useState } from "react";
import {
  AgentIcons,
  ArrowCta,
  BeyondDataSection,
  Container,
  CopySetupPrompt,
  IconArrowRight,
  IconReport,
  McpTerminal,
  OpenSourceSection,
  SIGNUP_URL,
  SkillsList,
  TESTIMONIALS,
  type Testimonial,
  Testimonials,
} from "@/components/landing-page";
import { MoneyBackGuarantee } from "@/components/money-back-guarantee";
import { DEFAULT_COUNTRY_CODE } from "@/lib/free-tools/countries";
import { FIELD_CLASS, SubmitButton, ToolForm } from "@/lib/free-tools/form";
import { trackTool } from "@/lib/free-tools/analytics";
import type { RankedKeywordRow } from "@/lib/free-tools/labs";
import { formatCount } from "@/lib/free-tools/metric-grid";
import { useToolRun } from "@/lib/free-tools/use-tool-run";

const EXAMPLE_REPORT_URL =
  "https://app.openseo.so/s/QEZZWxoLl4TpzhKxeiNRGuM_Hj15eUzY";

// ─── Shared pieces ───────────────────────────────────────────────────

function ProofRow() {
  return (
    <div className="itc-proof">
      <span className="itc-proof-avatars" aria-hidden="true">
        {TESTIMONIALS.map((t) => (
          <img key={t.name} src={t.avatarSrc} alt="" width={30} height={30} />
        ))}
      </span>
      <span>
        <strong>3,000+</strong> users
      </span>
      <span className="itc-proof-divider" aria-hidden="true" />
      <span>
        <span className="itc-proof-star" aria-hidden="true">
          ★
        </span>{" "}
        <strong>22k+</strong> GitHub stars
      </span>
    </div>
  );
}

function StartFree() {
  return (
    <div className="itc-hero-cta-group">
      <ArrowCta size="lg">Start free trial</ArrowCta>
      <p className="itc-hero-cta-note">No credit card required</p>
    </div>
  );
}

/** The agent page's pair: copy the prompt first, since that's what the ad
 * promised, with the plain trial beside it at the same size. */
function AgentCtas() {
  return (
    <div className="itc-cta-pair">
      <div className="itc-hero-cta-group">
        <CopySetupPrompt size="lg" />
        <p className="itc-hero-cta-note">Paste it into your agent</p>
      </div>
      <StartFree />
    </div>
  );
}

function PriceCompare({
  heading,
  body,
  openSeo,
}: {
  heading: string;
  body: string;
  openSeo: { price: string; caption: string };
}) {
  return (
    <section className="itc-section">
      <Container>
        <div className="itc-narrow">
          <h2 className="itc-display-lg">{heading}</h2>
          <p className="itc-subhead itc-muted" style={{ margin: "20px 0 0" }}>
            {body}
          </p>
        </div>
        <div className="itc-price-compare">
          <div className="itc-card itc-price-card">
            <p className="itc-body-sm" style={{ margin: 0, fontWeight: 500 }}>
              OpenSEO
            </p>
            <p className="itc-price">
              {openSeo.price}
              <span className="itc-price-unit">/mo</span>
            </p>
            <p className="itc-body-sm itc-muted" style={{ margin: "8px 0 0" }}>
              {openSeo.caption}
            </p>
          </div>
          <div className="itc-card itc-price-card itc-price-card-muted">
            <p className="itc-body-sm" style={{ margin: 0, fontWeight: 500 }}>
              Ahrefs Lite
            </p>
            <p className="itc-price">
              $129<span className="itc-price-unit">/mo</span>
            </p>
            <p className="itc-body-sm itc-muted" style={{ margin: "8px 0 0" }}>
              List price.
            </p>
          </div>
        </div>
        <div className="itc-section-ctas">
          <StartFree />
          <a href="/pricing" className="itc-textlink">
            Estimate your month{" "}
            <IconArrowRight size={15} className="itc-arrow" />
          </a>
        </div>
        <p className="itc-body-sm itc-subtle" style={{ margin: "24px 0 0" }}>
          <MoneyBackGuarantee />. Cancel anytime.
        </p>
      </Container>
    </section>
  );
}

type FaqItem = { question: string; answer: ReactNode };

function Faq({ items }: { items: FaqItem[] }) {
  return (
    <section className="itc-section" style={{ paddingTop: 0 }}>
      <Container>
        <div className="itc-faq">
          <h2 className="itc-display-md">Questions</h2>
          <dl>
            {items.map((item) => (
              <div key={item.question}>
                <dt>{item.question}</dt>
                <dd>{item.answer}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}

function Closing({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="itc-section itc-closing">
      <Container>
        <h2 className="itc-display-lg">{title}</h2>
        <div className="itc-section-ctas">{children}</div>
      </Container>
    </section>
  );
}

const SELF_HOST_ANSWER = (
  <>
    Yes. OpenSEO is open source. Run it on your own server with your own
    DataForSEO key.{" "}
    <a href="/docs/self-hosting" className="itc-inline-link">
      Self-hosting guide
    </a>
  </>
);

const BILLING_ANSWER =
  "One plan at $10/mo includes $10 of usage every month. Buy extra usage when you need it; top-ups never expire. Cancel anytime from your billing portal.";

// ─── /agencies ───────────────────────────────────────────────────────

const AGENCY_TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "Our agency killed $2,000 in Semrush and $1,000 in Ahrefs costs because of OpenSEO & DataForSEO. We went from $3,000 a month to $30 in API calls to DataForSEO.",
    name: "Gabe Fletcher",
    role: "NannerAds",
    initial: "G",
    handle: "@gabefletcher",
    href: "https://x.com/gabefletcher/status/2108388926281167057",
    network: "x",
    avatarSrc: "/avatars/gabe-avatar.jpg",
  },
  ...TESTIMONIALS.filter((t) => t.name !== "Tom Raine"),
];

const AGENCY_FEATURES = [
  {
    title: "Find the gap",
    body: "See a competitor's top keywords and pages, and the keywords they rank for that your client doesn't.",
    Icon: IconSearch,
  },
  {
    title: "Track every client",
    body: "Track keyword positions for each client site, in the locations they care about, on desktop and mobile.",
    Icon: IconTrend,
  },
  {
    title: "Show the client",
    body: "Research your agent runs is saved as a clean report you can share with a link.",
    Icon: IconReport,
    link: { label: "See an example report", href: EXAMPLE_REPORT_URL },
  },
];

const AGENCY_FAQ: FaqItem[] = [
  {
    question: "Can I manage several client sites?",
    answer:
      "Yes. Add each client site as its own project, with its own saved keywords and rank tracking.",
  },
  {
    question: "Do I need an AI agent to use OpenSEO?",
    answer:
      "No. Everything works in the web app. You can also connect Claude, Codex, or another MCP client and let an agent run the research for you.",
  },
  {
    question: "Where does the data come from?",
    answer:
      "Keyword, ranking, and backlink data comes from DataForSEO. Google Search Console data comes straight from Google and doesn't use any of your usage.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. The free trial includes $0.50 of usage, and you don't need a credit card to start.",
  },
  { question: "How does billing work?", answer: BILLING_ANSWER },
  { question: "Can I self-host it?", answer: SELF_HOST_ANSWER },
];

// The single-domain free tool: one cheap call, no competitor to think of.
const CLIENT_CHECK_TOOL = "competitor-keyword-finder";

type ClientKeywords = { target: string; keywords: RankedKeywordRow[] };

function ClientWinsCheck() {
  const [site, setSite] = useState("");
  const { status, errorMessage, result, run } = useToolRun<ClientKeywords>(
    CLIENT_CHECK_TOOL,
    `/api/${CLIENT_CHECK_TOOL}`,
  );

  return (
    <div id="check" className="itc-hero-tool">
      <ToolForm
        onSubmit={run}
        input={{ target: site, locationCode: DEFAULT_COUNTRY_CODE }}
        status={status}
        errorMessage={errorMessage}
        notes={false}
      >
        <label htmlFor="client-site" className="sr-only">
          Client&apos;s site
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="client-site"
            name="target"
            type="text"
            inputMode="url"
            enterKeyHint="go"
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            required
            maxLength={300}
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="yourclient.com"
            disabled={status === "loading"}
            className={FIELD_CLASS}
          />
          <SubmitButton
            status={status}
            idleLabel="Find the win"
            loadingLabel="Finding keywords…"
          />
        </div>
      </ToolForm>

      {status === "done" && result ? <ClientWins result={result} /> : null}
    </div>
  );
}

// Show enough to prove the data is real; the rest is what signing up unlocks.
const VISIBLE_ROWS = 2;
const BLURRED_ROWS = 3;

/** Keywords ranking #4-20 are the client's next wins: already on page one or
 * two, so a push can move them into the top 3. */
function ClientWins({ result }: { result: ClientKeywords }) {
  const byVolume = [...result.keywords].sort(
    (a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0),
  );
  const wins = byVolume.filter(
    (row) => row.position !== null && row.position > 3 && row.position <= 20,
  );
  const rows = wins.length > 0 ? wins : byVolume;
  const hidden = rows.slice(VISIBLE_ROWS);

  if (rows.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-[var(--color-border-subtle)] bg-white p-4 text-left md:p-5">
        <p className="text-sm leading-6 text-neutral-700">
          We couldn&apos;t find US rankings for {result.target} yet. Start a
          free trial to research the keywords it should go after.
        </p>
        <div className="mt-4">
          <GateCta label="Start free trial" domain={result.target} />
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border-subtle)] bg-white text-left">
      <div className="p-4 md:p-5">
        <h2 className="text-lg font-semibold leading-snug tracking-tight text-neutral-950">
          {wins.length > 0 ? (
            <>
              <span className="text-[var(--color-brand-accent)]">
                {wins.length} {wins.length === 1 ? "keyword" : "keywords"}
              </span>{" "}
              {result.target} is close to winning
            </>
          ) : (
            <>Where {result.target} ranks today</>
          )}
        </h2>
        <p className="mt-1 text-sm leading-6 text-[var(--color-brand-muted)]">
          {wins.length > 0
            ? "Ranking #4 to #20. A push into the top 3 is often the fastest way to more traffic."
            : "Its top keywords already rank in the top 3. Start a trial to find the next ones."}
        </p>
      </div>
      <ul className="divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)]">
        {rows.slice(0, VISIBLE_ROWS).map((row) => (
          <KeywordRow key={`${row.keyword}-${row.url}`} row={row} />
        ))}
      </ul>
      {hidden.length > 0 ? (
        <div className="relative min-h-44 border-t border-[var(--color-border-subtle)]">
          <ul
            aria-hidden="true"
            className="pointer-events-none select-none divide-y divide-[var(--color-border-subtle)] blur-[5px]"
          >
            {hidden.slice(0, BLURRED_ROWS).map((row) => (
              <KeywordRow key={`${row.keyword}-${row.url}`} row={row} />
            ))}
          </ul>
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/50 px-4 text-center">
            <GateCta
              label={`See all ${rows.length} keywords`}
              domain={result.target}
            />
            <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
              Free trial. No credit card required.
            </p>
          </div>
        </div>
      ) : (
        <div className="border-t border-[var(--color-border-subtle)] p-4 md:p-5">
          <GateCta label="Track these for your client" domain={result.target} />
          <p className="mt-2 text-xs text-[var(--color-brand-muted)]">
            Free trial. No credit card required.
          </p>
        </div>
      )}
    </div>
  );
}

function KeywordRow({ row }: { row: RankedKeywordRow }) {
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3 md:px-5">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-neutral-950">
          {row.keyword ?? "—"}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-brand-muted)]">
          {formatCount(row.searchVolume)} searches/mo · Difficulty{" "}
          {formatCount(row.difficulty)}
        </p>
      </div>
      <span className="shrink-0 rounded-md bg-[var(--color-surface)] px-2 py-1 text-sm font-medium tabular-nums text-neutral-950">
        #{row.position}
      </span>
    </li>
  );
}

/** Sign-up carries the checked site into onboarding, which lands the new
 * account on that site's keywords ranking #4-20. */
function GateCta({ label, domain }: { label: string; domain: string }) {
  return (
    <a
      href={`${SIGNUP_URL}?${new URLSearchParams({ domain }).toString()}`}
      onClick={() => trackTool("tool_cta_click", CLIENT_CHECK_TOOL)}
      className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-neutral-950 px-5 text-sm font-medium text-white transition-colors hover:bg-neutral-800 sm:w-auto"
    >
      {label}
      <span aria-hidden="true" className="ml-2">
        &rarr;
      </span>
    </a>
  );
}

export function AgencyLandingPage() {
  return (
    <>
      <section className="itc-campaign-hero">
        <Container>
          <h1
            className="itc-display-xl"
            style={{ maxWidth: 980, margin: "0 auto" }}
          >
            Find your client&apos;s next SEO{" "}
            <span className="itc-underline">win.</span>
          </h1>
          <p
            className="itc-subhead itc-muted"
            style={{ maxWidth: 640, margin: "20px auto 0" }}
          >
            Enter a client&apos;s site. See the keywords they&apos;re closest to
            winning, for free.
          </p>
          <ProofRow />
          <ClientWinsCheck />
        </Container>
      </section>

      <section className="itc-section" style={{ paddingTop: 24 }}>
        <Container>
          <div className="itc-narrow">
            <h2 className="itc-display-lg">One workspace for every client</h2>
            <p className="itc-subhead itc-muted" style={{ margin: "20px 0 0" }}>
              Research, rank tracking, and reports for each client site, on one
              usage-based plan.
            </p>
          </div>
          <div className="itc-bd-cards">
            {AGENCY_FEATURES.map(({ title, body, Icon, link }) => (
              <div key={title} className="itc-card itc-bd-card">
                <div className="itc-bd-icons">
                  <span className="itc-agent-icon">
                    <Icon />
                  </span>
                </div>
                <h3 className="itc-card-title">{title}</h3>
                <p
                  className="itc-body-sm itc-muted"
                  style={{ margin: "10px 0 0" }}
                >
                  {body}
                </p>
                {link ? (
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="itc-textlink itc-bd-link"
                  >
                    {link.label}{" "}
                    <IconArrowRight size={15} className="itc-arrow" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
          <div className="itc-section-ctas">
            <StartFree />
          </div>
        </Container>
      </section>

      <Testimonials items={AGENCY_TESTIMONIALS} />

      <PriceCompare
        heading="Priced for client work"
        body="One plan at $10/mo with $10 of usage included. More clients means more usage, not a bigger plan."
        openSeo={{
          price: "~$27",
          caption:
            "15 client sites with rankings checked weekly, plus regular keyword research.",
        }}
      />

      <Faq items={AGENCY_FAQ} />

      <Closing
        title={
          <>
            Find your client&apos;s next SEO{" "}
            <span className="itc-underline">win.</span>
          </>
        }
      >
        <StartFree />
        <a href="#check" className="itc-textlink">
          Run the free check <IconArrowRight size={15} className="itc-arrow" />
        </a>
      </Closing>
    </>
  );
}

// ─── /agents ─────────────────────────────────────────────────────────

const AGENT_FAQ: FaqItem[] = [
  {
    question: "Which agents does it work with?",
    answer:
      "Claude Code, Claude Cowork, Codex, ChatGPT, Cursor, and other clients that support MCP. The setup prompt asks your agent to use its own installation method.",
  },
  {
    question: "What can my agent do with it?",
    answer:
      "Keyword research, competitor analysis, backlinks, rank tracking, site audits, and AI visibility checks, plus your Google Search Console data if you connect it.",
  },
  {
    question: "I'm not an SEO person. Is this for me?",
    answer:
      "Yes. Run /seo-coach and your agent explains each step and recommends what to do next.",
  },
  { question: "How does billing work?", answer: BILLING_ANSWER },
  { question: "Can I self-host it?", answer: SELF_HOST_ANSWER },
];

export function AgentLandingPage() {
  return (
    <>
      <section className="itc-campaign-hero">
        <Container>
          <h1
            className="itc-display-xl"
            style={{ maxWidth: 980, margin: "0 auto" }}
          >
            Give your agent SEO{" "}
            <span className="itc-underline">superpowers.</span>
          </h1>
          <p
            className="itc-subhead itc-muted"
            style={{ maxWidth: 640, margin: "20px auto 0" }}
          >
            Live keyword and competitor data for Claude, Codex, or any MCP
            client. Set up in 2 minutes, for free.
          </p>
          <AgentCtas />
          <ProofRow />
        </Container>
      </section>

      <section className="itc-mcp-section">
        <Container>
          <div className="itc-mcp-grid">
            <div>
              <h2 className="itc-display-lg">Real SEO work, one skill away</h2>
              <SkillsList />
              <AgentIcons />
              <div className="itc-mcp-ctas">
                <a href="/docs/agent-setup" className="itc-textlink">
                  Setup guide <IconArrowRight size={15} className="itc-arrow" />
                </a>
              </div>
            </div>
            <McpTerminal />
          </div>
        </Container>
      </section>

      <BeyondDataSection />

      <OpenSourceSection />

      <Testimonials />

      <PriceCompare
        heading="Starts at $10/month"
        body="$10 of usage is included every month. One site with weekly rank tracking and regular research fits inside it."
        openSeo={{
          price: "$10",
          caption:
            "One site with rankings checked weekly, plus regular research.",
        }}
      />

      <Faq items={AGENT_FAQ} />

      <Closing
        title={
          <>
            Give your agent SEO{" "}
            <span className="itc-underline">superpowers.</span>
          </>
        }
      >
        <AgentCtas />
      </Closing>
    </>
  );
}

// ─── Icons ───────────────────────────────────────────────────────────

function IconSearch() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function IconTrend() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </svg>
  );
}
